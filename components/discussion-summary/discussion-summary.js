/**
 * Neo Özeti — the AI summary of every discussion on a job order and its
 * sub-jobs, as a card that sits above a job's discussion list.
 *
 * The summary is written once and shared: everyone who opens the job reads
 * the same saved text for free. The "Güncelle" button only appears — and the
 * server only calls the model — after a topic or comment has been added,
 * edited or deleted since. That is what keeps it at a few dollars a month.
 *
 * The summary cites its sources as [#123]; those become buttons that open the
 * thread (`openTopic`). Ids the server does not know (a model can invent one)
 * are dropped rather than shown as a dead reference.
 *
 * Users without assistant access get nothing: the card never renders.
 */
import { renderRichText } from '../../utils/richText.js';
import { escapeHtml } from '../../utils/text.js';
import { showNotification } from '../notification/notification.js';
import { getDiscussionSummary, generateDiscussionSummary } from '../../apis/assistant.js';

const POLL_MS = 4000;
const POLL_MAX = 60;
const COLLAPSED_KEY = 'neoSummaryCollapsed';

/**
 * @param {HTMLElement} container
 * @param {string} jobNo
 * @param {object} options
 * @param {(topicId: number) => void} options.openTopic
 * @returns {{ refresh: Function, destroy: Function }}
 */
export function mountDiscussionSummary(container, jobNo, { openTopic } = {}) {
    const view = {
        data: null,
        hidden: false,      // no access, or nothing to summarise
        error: null,
        actionError: null,
        generating: false,  // our own request in flight
        collapsed: readCollapsed(),
        pollTimer: null,
        pollCount: 0,
        destroyed: false,
    };

    async function load({ quiet = false } = {}) {
        try {
            const data = await getDiscussionSummary(jobNo);
            if (view.destroyed) return;
            view.data = data;
            view.error = null;
            view.hidden = !data.current.topic_count;
            if (data.generating && !view.generating) startPolling();
            else stopPolling();
        } catch (error) {
            if (view.destroyed) return;
            if (error.status === 403) {
                view.hidden = true;
            } else if (!quiet) {
                console.error('Failed to load discussion summary:', error);
                view.error = error.message;
            }
        }
        render();
    }

    async function generate() {
        if (view.generating) return;
        view.generating = true;
        view.actionError = null;
        view.collapsed = false;
        render();
        try {
            const data = await generateDiscussionSummary(jobNo);
            if (view.destroyed) return;
            view.data = data;
            if (!data.created) {
                showNotification('Özet zaten güncel — yeni bir konu ya da yorum gelmemiş.', 'info');
            }
        } catch (error) {
            if (view.destroyed) return;
            if (error.status === 409) {
                // Someone else is writing it right now; wait for theirs.
                view.data = { ...view.data, generating: true };
                startPolling();
            } else {
                view.actionError = error.message;
            }
        } finally {
            view.generating = false;
            if (!view.destroyed) render();
        }
    }

    function startPolling() {
        stopPolling();
        view.pollCount = 0;
        const tick = async () => {
            view.pollCount += 1;
            if (view.destroyed || view.pollCount > POLL_MAX) return;
            await load({ quiet: true });
            if (!view.destroyed && view.data?.generating && view.pollCount <= POLL_MAX) {
                view.pollTimer = setTimeout(tick, POLL_MS);
            }
        };
        view.pollTimer = setTimeout(tick, POLL_MS);
    }

    function stopPolling() {
        if (view.pollTimer) clearTimeout(view.pollTimer);
        view.pollTimer = null;
    }

    // ------------------------------------------------------------ render

    function render() {
        if (view.destroyed) return;
        if (view.hidden || (!view.data && !view.error)) {
            container.innerHTML = '';
            return;
        }
        if (view.error) {
            container.innerHTML = `
                <div class="neo-summary neo-summary-error">
                    <i class="fas fa-wand-magic-sparkles"></i> Neo özeti yüklenemedi.
                    <button type="button" class="btn btn-link btn-sm p-0" data-neo-action="retry">Tekrar dene</button>
                </div>
            `;
            return;
        }

        const d = view.data;
        const busy = view.generating || d.generating;
        const s = d.summary;
        const expanded = s && !busy && !view.collapsed;

        container.innerHTML = `
            <div class="neo-summary ${expanded ? 'is-open' : ''}">
                <div class="neo-summary-head">
                    <div class="neo-summary-heading">
                        <span class="neo-summary-icon"><i class="fas fa-wand-magic-sparkles"></i></span>
                        <div class="neo-summary-heading-text">
                            <div class="neo-summary-title">
                                Neo Özeti <span class="neo-summary-scope">alt iş emirleri dahil</span>
                            </div>
                            <div class="neo-summary-sub">${statusLine(d, busy)}</div>
                        </div>
                    </div>
                    <div class="neo-summary-actions">${actions(d, busy)}</div>
                </div>
                ${view.actionError
                    ? `<div class="neo-summary-alert"><i class="fas fa-circle-exclamation"></i>${escapeHtml(view.actionError)}</div>`
                    : ''}
                ${expanded ? body(s, d.topic_refs || {}) : ''}
            </div>
        `;
    }

    function statusLine(d, busy) {
        const counts = `${d.current.topic_count} konu, ${d.current.comment_count} yorum`;
        if (busy) {
            return `<span class="spinner-border spinner-border-sm me-1" role="status"></span>
                    Neo ${counts} okuyor… Büyük işlerde bir dakika kadar sürebilir.`;
        }
        if (!d.summary) return `Henüz özet yok · ${counts} özetlenebilir.`;
        const when = escapeHtml(formatDateTime(d.summary.created_at));
        const who = d.summary.created_by ? ` · ${escapeHtml(d.summary.created_by)}` : '';
        if (d.is_stale) {
            return `<span class="status-badge status-orange">Özetten sonra yeni hareket var</span>
                    <span>${when}${who}</span>`;
        }
        return `<span class="status-badge status-green"><i class="fas fa-check"></i> Güncel</span>
                <span>${when}${who}</span>`;
    }

    function actions(d, busy) {
        if (busy) return '';
        const buttons = [];
        if (!d.summary) {
            buttons.push(`
                <button type="button" class="btn btn-sm neo-summary-generate" data-neo-action="generate">
                    <i class="fas fa-wand-magic-sparkles me-1"></i>Özetle
                </button>`);
        } else {
            if (d.is_stale) {
                buttons.push(`
                    <button type="button" class="btn btn-sm neo-summary-generate" data-neo-action="generate">
                        <i class="fas fa-rotate me-1"></i>Güncelle
                    </button>`);
            }
            buttons.push(`
                <button type="button" class="btn btn-sm btn-outline-secondary neo-summary-toggle"
                        data-neo-action="toggle" aria-expanded="${!view.collapsed}">
                    <i class="fas fa-chevron-${view.collapsed ? 'down' : 'up'} me-1"></i>${view.collapsed ? 'Göster' : 'Gizle'}
                </button>`);
        }
        return buttons.join('');
    }

    function body(s, refs) {
        return `
            <div class="neo-summary-body">${renderSummary(s.content, refs)}</div>
            <div class="neo-summary-foot">
                ${s.topic_count} konu ve ${s.comment_count} yorum okundu.
                ${s.omitted_topic_count
                    ? `En eski ${s.omitted_topic_count} konu metin sınırı nedeniyle dahil edilmedi.`
                    : ''}
                Yapay zekâ özetidir; önemli kararları konunun kendisinden doğrulayın.
            </div>
        `;
    }

    // ------------------------------------------------------------ events

    function onClick(event) {
        const el = event.target.closest('[data-neo-action]');
        if (!el || !container.contains(el)) return;
        const action = el.dataset.neoAction;
        if (action === 'generate') generate();
        else if (action === 'retry') load();
        else if (action === 'toggle') {
            view.collapsed = !view.collapsed;
            writeCollapsed(view.collapsed);
            render();
        } else if (action === 'ref') {
            const id = parseInt(el.dataset.topicId, 10);
            if (id && openTopic) openTopic(id);
        }
    }

    container.addEventListener('click', onClick);
    load();

    return {
        /** Re-read the saved summary — e.g. after a comment was added. */
        refresh: () => load({ quiet: true }),
        destroy() {
            view.destroyed = true;
            stopPolling();
            container.removeEventListener('click', onClick);
            container.innerHTML = '';
        },
    };
}

/**
 * The prompt asks for five sections, each opened by a line that is only
 * **Başlık**. Those lines become headings; each body goes through rich text
 * (which escapes), then [#id] → a button for ids the server knows.
 */
function renderSummary(content, refs) {
    const sections = [];
    let current = { title: null, lines: [] };
    for (const line of String(content || '').split('\n')) {
        const heading = line.match(/^\s*\*\*([^*\n]+?)\*\*\s*:?\s*$/);
        if (heading) {
            sections.push(current);
            current = { title: heading[1].trim(), lines: [] };
        } else {
            current.lines.push(line);
        }
    }
    sections.push(current);

    return sections
        .map(section => ({ ...section, body: section.lines.join('\n').trim() }))
        .filter(section => section.title || section.body)
        .map(section => {
            const empty = /^[-*]?\s*yok\.?$/i.test(section.body);
            const body = empty
                ? '<div class="neo-summary-none">Yok</div>'
                : `<div class="rich-text">${linkRefs(renderRichText(section.body), refs)}</div>`;
            return `
                <section class="neo-summary-section">
                    ${section.title ? `<h6 class="neo-summary-section-title">${escapeHtml(section.title)}</h6>` : ''}
                    ${body}
                </section>
            `;
        }).join('');
}

function linkRefs(html, refs) {
    return html.replace(/\[#(\d+)\]/g, (match, id) => {
        const ref = refs[id];
        if (!ref) return '';
        return `<button type="button" class="neo-summary-ref" data-neo-action="ref" data-topic-id="${id}"
                        title="${escapeHtml(`${ref.job_no ? `${ref.job_no} · ` : ''}${ref.title}`)}">#${id}</button>`;
    });
}

function readCollapsed() {
    try {
        return localStorage.getItem(COLLAPSED_KEY) === '1';
    } catch {
        return false;
    }
}

function writeCollapsed(collapsed) {
    try {
        localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
        // a per-viewer nicety; fine to lose
    }
}

function formatDateTime(value) {
    if (!value) return '';
    return new Date(value).toLocaleString('tr-TR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}

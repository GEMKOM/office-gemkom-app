/**
 * Tartışmalarım — every topic the user opened and every comment they wrote.
 *
 * Discussions are otherwise only reachable through the job order (or offer, or
 * İSG issue) they hang off, so "the thing I asked about last month" meant
 * remembering where it was. This page lists them in one place, and the
 * question it answers first is "did anyone answer me?": the default order is
 * by latest activity, and every row says whether a reply came.
 *
 * Rows open the full discussion in place (the shared topic-discussion panel),
 * so replying does not need a trip to the job order.
 */
import { guardRoute, navigateTo } from '../../authService.js';
import { initNavbar } from '../../components/navbar.js';
import { HeaderComponent } from '../../components/header/header.js';
import { FiltersComponent } from '../../components/filters/filters.js';
import { DisplayModal } from '../../components/display-modal/display-modal.js';
import { mountTopicDiscussion } from '../../components/topic-discussion/topic-discussion.js';
import { escapeHtml } from '../../utils/text.js';
import {
    listMyTopics,
    listMyComments,
    getMyDiscussionSummary,
} from '../../apis/projects/myDiscussions.js';

const PAGE_SIZE = 25;

const TABS = {
    topics: { label: 'Açtığım Konular', icon: 'fa-comments', noun: 'konu' },
    comments: { label: 'Yorumlarım', icon: 'fa-comment-dots', noun: 'yorum' },
};

/** Same squares as the notification rows, one per topic type. */
const TYPE_META = {
    general:          { icon: 'fa-comments',          color: '#0891b2', bg: '#e3f4f8' },
    drawing_release:  { icon: 'fa-compass-drafting',  color: '#6366f1', bg: '#eef0fe' },
    release_review:   { icon: 'fa-clipboard-check',   color: '#059669', bg: '#e6f6f0' },
    revision_request: { icon: 'fa-code-branch',       color: '#ea580c', bg: '#fdeee4' },
};
const TYPE_FALLBACK = { icon: 'fa-comments', color: '#64748b', bg: '#eef1f5' };

const SOURCE_ICONS = {
    job_order: 'fa-diagram-project',
    task: 'fa-list-check',
    offer: 'fa-handshake',
    isg: 'fa-helmet-safety',
    release_review: 'fa-clipboard-check',
};

const state = {
    tab: initialTab(),
    page: 1,
    count: 0,
    rows: [],
    summary: null,
    isLoading: false,
    filters: {
        search: '',
        topic_type: '',
        replied: '',
        created_at__date__gte: '',
        created_at__date__lte: '',
        ordering: 'activity',
    },
};

let filtersComponent = null;
let modal = null;
let discussionPanel = null;
// Set when the user comments from the modal, so the list only reloads when
// its counts can actually have moved.
let modalChangedData = false;

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    await initNavbar();

    new HeaderComponent({
        title: 'Tartışmalarım',
        subtitle: 'Açtığınız konular ve yazdığınız yorumlar — arayın, yanıt gelenleri görün, yerinde yanıtlayın',
        icon: 'comments',
        showBackButton: 'none',
        showCreateButton: 'none',
        showExportButton: 'none',
        showRefreshButton: 'block',
        refreshButtonText: 'Yenile',
        onRefreshClick: () => load({ resetPage: true }),
    });

    modal = new DisplayModal('discussion-modal-container', { size: 'xl' });

    setupFilters();
    setupDelegatedClicks();
    await load({ resetPage: true });
});

function initialTab() {
    const tab = new URLSearchParams(window.location.search).get('tab');
    return TABS[tab] ? tab : 'topics';
}

// ---------------------------------------------------------------- filters

function setupFilters() {
    filtersComponent = new FiltersComponent('filters-placeholder', {
        title: 'Tartışma Ara',
        applyButtonText: 'Ara',
        clearButtonText: 'Temizle',
        onApply: (values) => {
            state.filters.search = values['disc-search'] || '';
            state.filters.topic_type = values['disc-type'] || '';
            state.filters.replied = values['disc-replied'] || '';
            state.filters.created_at__date__gte = values['disc-from'] || '';
            state.filters.created_at__date__lte = values['disc-to'] || '';
            load({ resetPage: true });
        },
        onClear: () => {
            const ordering = state.filters.ordering;
            Object.keys(state.filters).forEach((key) => { state.filters[key] = ''; });
            // Ordering lives on the tab bar, not in the filter card.
            state.filters.ordering = ordering;
            load({ resetPage: true });
        },
    });

    filtersComponent.addTextFilter({
        id: 'disc-search',
        label: 'Ara',
        placeholder: 'İş emri no, konu başlığı, metin...',
        colSize: 4,
    });

    filtersComponent.addDropdownFilter({
        id: 'disc-type',
        label: 'Konu Türü',
        options: [{ value: '', label: 'Tümü' }],
        placeholder: 'Tümü',
        colSize: 3,
    });

    filtersComponent.addDropdownFilter({
        id: 'disc-replied',
        label: 'Yanıt',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'true', label: 'Yanıt gelenler' },
            { value: 'false', label: 'Yanıt gelmeyenler' },
        ],
        placeholder: 'Tümü',
        colSize: 2,
        searchable: false,
    });

    filtersComponent.addDateFilter({ id: 'disc-from', label: 'Başlangıç', colSize: 2 });
    filtersComponent.addDateFilter({ id: 'disc-to', label: 'Bitiş', colSize: 2 });
}

/** Keep the type dropdown to the types this tab actually has. */
function syncTypeOptions() {
    if (!filtersComponent || !state.summary) return;
    const typeFilter = filtersComponent.filters.find(f => f.id === 'disc-type');
    if (!typeFilter) return;

    const options = [{ value: '', label: 'Tümü' }].concat(
        state.summary.types.map(t => ({ value: t.value, label: `${t.label} (${t.count})` }))
    );
    const signature = options.map(o => o.label).join('|');
    if (typeFilter._signature === signature) return;
    typeFilter._signature = signature;
    typeFilter.options = options;

    // renderFilters() rebuilds every field from its config — carry the live
    // values across or the other inputs snap back to empty.
    const current = filtersComponent.getFilterValues();
    filtersComponent.renderFilters();
    filtersComponent.setFilterValues(current);
}

// ------------------------------------------------------------------ data

function activeQuery() {
    const query = { page: state.page, page_size: PAGE_SIZE };
    Object.entries(state.filters).forEach(([key, value]) => {
        if (value !== '' && value !== null && value !== undefined) query[key] = value;
    });
    return query;
}

async function load({ resetPage = false } = {}) {
    if (resetPage) state.page = 1;
    if (state.isLoading) return;
    state.isLoading = true;
    renderList({ loading: true });

    try {
        const query = activeQuery();
        const summaryQuery = { ...query, tab: state.tab };
        delete summaryQuery.page;
        delete summaryQuery.page_size;
        delete summaryQuery.ordering;

        const fetchRows = state.tab === 'comments' ? listMyComments : listMyTopics;
        const [response, summary] = await Promise.all([
            fetchRows(query),
            getMyDiscussionSummary(summaryQuery),
        ]);

        state.rows = response.results || [];
        state.count = response.count || 0;
        state.summary = summary;

        syncTypeOptions();
        renderTabs();
        renderList({});
    } catch (error) {
        console.error('Failed to load discussions:', error);
        renderList({ error: true });
    } finally {
        state.isLoading = false;
    }
}

// --------------------------------------------------------------- rendering

function renderTabs() {
    const container = document.getElementById('discussion-tabs');
    if (!container || !state.summary) return;

    const tabs = Object.entries(TABS).map(([key, tab]) => {
        const active = state.tab === key;
        const count = state.summary[key] ?? 0;
        return `
            <button type="button" class="disc-tab ${active ? 'active' : ''}"
                    data-tab="${key}" role="tab" aria-selected="${active}">
                <i class="fas ${tab.icon}"></i>
                ${tab.label}
                <span class="disc-tab-count">${count}</span>
            </button>
        `;
    }).join('');

    const ordering = state.filters.ordering || 'activity';
    container.innerHTML = `
        <div class="dashboard-card disc-card mb-3">
            <div class="disc-toolbar">
                <div class="disc-tabs" role="tablist">${tabs}</div>
                <div class="disc-sort" role="group" aria-label="Sıralama">
                    <span class="disc-sort-label">Sırala:</span>
                    <button type="button" class="disc-sort-btn ${ordering === 'activity' ? 'active' : ''}"
                            data-ordering="activity"
                            title="${state.tab === 'comments' ? 'Son yanıta göre' : 'Son yoruma göre'}">
                        Son hareket
                    </button>
                    <button type="button" class="disc-sort-btn ${ordering === 'created' ? 'active' : ''}"
                            data-ordering="created"
                            title="${state.tab === 'comments' ? 'Yazdığınız tarihe göre' : 'Açtığınız tarihe göre'}">
                        ${state.tab === 'comments' ? 'Yazma tarihi' : 'Açılış tarihi'}
                    </button>
                </div>
            </div>
        </div>
    `;

    // On a phone the rail scrolls sideways and the second tab starts partly
    // off screen; keep the one the user is on in view.
    const rail = container.querySelector('.disc-tabs');
    const active = rail?.querySelector('.disc-tab.active');
    if (rail && active && active.offsetLeft + active.offsetWidth > rail.clientWidth) {
        rail.scrollLeft = active.offsetLeft - 12;
    }
}

function renderList({ loading = false, error = false }) {
    const container = document.getElementById('discussion-list');
    if (!container) return;

    if (loading) {
        container.innerHTML = card(`
            <div class="disc-state">
                <div class="spinner-border text-secondary" role="status"></div>
                <div class="disc-state-title">Yükleniyor…</div>
            </div>
        `);
        return;
    }

    if (error) {
        container.innerHTML = card(`
            <div class="disc-state">
                <i class="fas fa-triangle-exclamation"></i>
                <div class="disc-state-title">Tartışmalar yüklenirken hata oluştu.</div>
                <button type="button" class="btn btn-sm btn-outline-secondary" id="disc-retry">Tekrar dene</button>
            </div>
        `);
        return;
    }

    if (!state.rows.length) {
        container.innerHTML = card(renderEmptyState());
        return;
    }

    const rowHtml = state.tab === 'comments' ? renderCommentRow : renderTopicRow;
    container.innerHTML = card(`
        <div class="disc-list">${renderGrouped(state.rows, rowHtml)}</div>
        ${renderPager()}
    `);
}

function renderEmptyState() {
    const total = state.summary?.[`total_${state.tab}`] ?? 0;
    if (!total) {
        return `
            <div class="disc-state">
                <i class="fas ${state.tab === 'comments' ? 'fa-comment-slash' : 'fa-comments'}"></i>
                <div class="disc-state-title">
                    ${state.tab === 'comments' ? 'Henüz bir yorum yazmadınız.' : 'Henüz bir tartışma konusu açmadınız.'}
                </div>
                <div class="small">İş emirlerinde açtığınız konular ve yazdığınız yorumlar burada toplanır.</div>
            </div>
        `;
    }
    return `
        <div class="disc-state">
            <i class="fas fa-magnifying-glass"></i>
            <div class="disc-state-title">Bu filtrelere uyan ${TABS[state.tab].noun} bulunamadı.</div>
            <div class="small">Filtreleri temizleyip tekrar deneyin.</div>
        </div>
    `;
}

function card(inner) {
    return `<div class="dashboard-card disc-card">${inner}</div>`;
}

/** Rows under sticky day headers, dated by whatever the list is sorted by. */
function renderGrouped(rows, rowHtml) {
    const dateOf = (row) => state.filters.ordering === 'created' ? row.created_at : row.last_activity_at;
    let currentDay = null;
    return rows.map(row => {
        const day = dayKey(dateOf(row));
        let header = '';
        if (day !== currentDay) {
            currentDay = day;
            header = `<div class="disc-day">${escapeHtml(dayLabel(dateOf(row)))}</div>`;
        }
        return header + rowHtml(row);
    }).join('');
}

function renderTopicRow(topic) {
    const meta = TYPE_META[topic.topic_type] || TYPE_FALLBACK;
    return `
        <div class="disc-row" data-topic-id="${topic.id}" data-row-id="${topic.id}">
            <div class="disc-icon" style="background:${meta.bg};color:${meta.color}">
                <i class="fas ${meta.icon}"></i>
            </div>
            <div class="disc-row-main" data-action="open">
                <div class="disc-row-head">
                    <span class="disc-row-title">${escapeHtml(topic.title || '-')}</span>
                    <span class="disc-row-time" title="Açıldı: ${escapeHtml(formatDateTime(topic.created_at))}">
                        ${escapeHtml(formatTime(state.filters.ordering === 'created' ? topic.created_at : topic.last_activity_at))}
                    </span>
                </div>
                ${renderSource(topic.source)}
                ${topic.excerpt ? `<div class="disc-row-body">${escapeHtml(plainText(topic.excerpt))}</div>` : ''}
                ${renderLastComment(topic)}
                <div class="disc-row-meta">
                    ${renderReplyState(topic.reply_count, topic.last_comment_by_me)}
                    <span class="disc-tag"><i class="far fa-comment"></i> ${topic.comment_count} yorum</span>
                    <span class="disc-tag">${escapeHtml(topic.topic_type_display || '')}</span>
                    ${renderPriority(topic.priority, topic.priority_display)}
                    ${topic.revision_status_display
                        ? `<span class="disc-tag disc-tag-outline">${escapeHtml(topic.revision_status_display)}</span>`
                        : ''}
                </div>
            </div>
            ${renderActions(topic.source)}
        </div>
    `;
}

/** The latest word on the topic, when it is not the user's own. */
function renderLastComment(topic) {
    if (!topic.last_comment_excerpt || topic.last_comment_by_me) return '';
    return `
        <div class="disc-last-comment">
            <span class="disc-last-comment-who">${escapeHtml(topic.last_comment_by || 'Bilinmeyen')}:</span>
            ${escapeHtml(plainText(topic.last_comment_excerpt))}
        </div>
    `;
}

function renderCommentRow(comment) {
    const topic = comment.topic || {};
    const meta = TYPE_META[topic.topic_type] || TYPE_FALLBACK;
    const replied = comment.reply_count > 0;
    return `
        <div class="disc-row" data-topic-id="${topic.id}" data-comment-id="${comment.id}" data-row-id="${comment.id}">
            <div class="disc-icon" style="background:${meta.bg};color:${meta.color}">
                <i class="fas fa-comment-dots"></i>
            </div>
            <div class="disc-row-main" data-action="open">
                <div class="disc-row-head">
                    <span class="disc-row-title">${escapeHtml(topic.title || '-')}</span>
                    <span class="disc-row-time" title="Yazıldı: ${escapeHtml(formatDateTime(comment.created_at))}">
                        ${escapeHtml(formatTime(state.filters.ordering === 'created' ? comment.created_at : comment.last_activity_at))}
                    </span>
                </div>
                ${renderSource(comment.source)}
                <div class="disc-quote">${escapeHtml(plainText(comment.content))}</div>
                <div class="disc-row-meta">
                    ${replied
                        ? `<span class="status-badge status-green" title="Son yanıt: ${escapeHtml(formatDateTime(comment.last_reply_at))}">
                               <i class="fas fa-reply"></i>
                               ${comment.reply_count} yanıt · ${escapeHtml(comment.last_reply_by || '')}
                           </span>`
                        : '<span class="status-badge status-grey">Yanıt gelmedi</span>'}
                    <span class="disc-tag">${topic.is_mine ? 'Sizin konunuz' : `Konu: ${escapeHtml(topic.created_by || '-')}`}</span>
                    <span class="disc-tag">${escapeHtml(topic.topic_type_display || '')}</span>
                    ${comment.attachment_count
                        ? `<span class="disc-tag"><i class="fas fa-paperclip"></i> ${comment.attachment_count}</span>`
                        : ''}
                    ${comment.is_edited ? '<span class="disc-tag disc-tag-outline">Düzenlendi</span>' : ''}
                </div>
            </div>
            ${renderActions(comment.source)}
        </div>
    `;
}

function renderSource(source) {
    if (!source || !source.label) return '';
    const icon = SOURCE_ICONS[source.kind] || 'fa-link';
    return `
        <div class="disc-source">
            <i class="fas ${icon}"></i>
            <span class="disc-source-label">${escapeHtml(source.label)}</span>
            ${source.detail ? `<span class="disc-source-detail">${escapeHtml(source.detail)}</span>` : ''}
        </div>
    `;
}

function renderReplyState(replyCount, lastByMe) {
    if (!replyCount) return '<span class="status-badge status-grey">Yanıt gelmedi</span>';
    // Someone answered and the user has not spoken since: that is the row they
    // came here for.
    if (!lastByMe) return '<span class="status-badge status-blue"><i class="fas fa-reply"></i> Yanıt geldi</span>';
    return '<span class="status-badge status-green"><i class="fas fa-check"></i> Son yorum sizde</span>';
}

function renderPriority(priority, label) {
    if (priority === 'urgent') return `<span class="status-badge status-red">${escapeHtml(label)}</span>`;
    if (priority === 'high') return `<span class="status-badge status-orange">${escapeHtml(label)}</span>`;
    return '';
}

function renderActions(source) {
    return `
        <div class="disc-row-actions">
            <button type="button" class="disc-action" data-action="open" title="Tartışmayı aç">
                <i class="fas fa-comments"></i>
            </button>
            ${source?.link
                ? `<button type="button" class="disc-action" data-action="goto"
                           data-link="${escapeHtml(source.link)}" title="Kaynağa git">
                       <i class="fas fa-arrow-up-right-from-square"></i>
                   </button>`
                : ''}
        </div>
    `;
}

function renderPager() {
    const noun = TABS[state.tab].noun;
    const totalPages = Math.max(1, Math.ceil(state.count / PAGE_SIZE));
    if (totalPages <= 1) {
        return `<div class="disc-pager"><span>${state.count} ${noun}</span></div>`;
    }
    const first = (state.page - 1) * PAGE_SIZE + 1;
    const last = Math.min(state.page * PAGE_SIZE, state.count);
    return `
        <div class="disc-pager">
            <span>${first}-${last} / ${state.count} ${noun}</span>
            <div class="d-flex align-items-center">
                <button class="btn btn-sm btn-outline-secondary" data-page="${state.page - 1}"
                        ${state.page <= 1 ? 'disabled' : ''}>
                    <i class="fas fa-chevron-left"></i> Önceki
                </button>
                <span class="disc-pager-position">${state.page} / ${totalPages}</span>
                <button class="btn btn-sm btn-outline-secondary" data-page="${state.page + 1}"
                        ${state.page >= totalPages ? 'disabled' : ''}>
                    Sonraki <i class="fas fa-chevron-right"></i>
                </button>
            </div>
        </div>
    `;
}

// ----------------------------------------------------------------- events

function setupDelegatedClicks() {
    document.addEventListener('click', async (event) => {
        // The discussion modal has its own buttons; none of them are ours.
        if (event.target.closest('#discussion-modal-container .modal-body')) return;

        const tab = event.target.closest('.disc-tab');
        if (tab) {
            if (tab.dataset.tab !== state.tab) {
                state.tab = tab.dataset.tab;
                // The type facet is per tab; a type picked on one tab may not
                // exist on the other.
                state.filters.topic_type = '';
                filtersComponent.setFilterValues({ 'disc-type': '' });
                syncTabToUrl();
                await load({ resetPage: true });
            }
            return;
        }

        const sort = event.target.closest('.disc-sort-btn');
        if (sort) {
            if (sort.dataset.ordering !== state.filters.ordering) {
                state.filters.ordering = sort.dataset.ordering;
                await load({ resetPage: true });
            }
            return;
        }

        if (event.target.closest('#disc-retry')) {
            await load({});
            return;
        }

        const pageButton = event.target.closest('[data-page]');
        if (pageButton && !pageButton.disabled) {
            const page = parseInt(pageButton.dataset.page, 10);
            if (!Number.isNaN(page) && page >= 1) {
                state.page = page;
                await load({});
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
            return;
        }

        const gotoEl = event.target.closest('[data-action="goto"]');
        if (gotoEl) {
            if (gotoEl.dataset.link) navigateTo(gotoEl.dataset.link);
            return;
        }

        const openEl = event.target.closest('[data-action="open"]');
        if (openEl) {
            const row = openEl.closest('.disc-row');
            if (row) await openDiscussion(discussionFromRow(row));
        }
    });
}

function syncTabToUrl() {
    const url = new URL(window.location.href);
    if (state.tab === 'topics') url.searchParams.delete('tab');
    else url.searchParams.set('tab', state.tab);
    window.history.replaceState({}, '', url);
}

// ------------------------------------------------------------------ modal

function discussionFromRow(row) {
    const data = state.rows.find(r => String(r.id) === row.dataset.rowId);
    return {
        topicId: parseInt(row.dataset.topicId, 10),
        commentId: row.dataset.commentId ? parseInt(row.dataset.commentId, 10) : null,
        title: state.tab === 'comments' ? data?.topic?.title : data?.title,
        source: data?.source || null,
    };
}

/** Open a thread in place. */
async function openDiscussion({ topicId, commentId = null, title = '', source = null }) {
    if (!topicId || Number.isNaN(topicId)) return;

    discussionPanel?.destroy?.();
    discussionPanel = null;
    modalChangedData = false;

    modal.clearData();
    modal.onCloseCallback(onModalClosed);
    modal.setTitle(title || 'Tartışma');
    modal.setIcon('fas fa-comments');
    modal.addCustomSection({
        id: 'disc-modal-body',
        title: null,
        customContent: `
            ${source?.label ? `<div class="disc-modal-source mb-3">${renderSource(source)}</div>` : ''}
            <div id="disc-modal-root">
                <div class="disc-state disc-state-compact">
                    <div class="spinner-border text-secondary" role="status"></div>
                </div>
            </div>
        `,
    });
    modal.setFooterContent(`
        <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">
            <i class="fas fa-times me-1"></i>Kapat
        </button>
        ${source?.link
            ? `<button type="button" class="btn btn-sm btn-primary" id="disc-modal-goto">
                   <i class="fas fa-arrow-up-right-from-square me-1"></i>Kaynağa git
               </button>`
            : ''}
    `);
    modal.render();
    modal.show();

    document.getElementById('disc-modal-goto')?.addEventListener('click', () => {
        navigateTo(source.link);
    });

    const root = document.getElementById('disc-modal-root');
    try {
        discussionPanel = await mountTopicDiscussion(root, topicId, {
            prefix: `mydisc-${topicId}`,
            onRefresh: () => { modalChangedData = true; },
        });
        if (commentId) highlightComment(commentId);
    } catch (error) {
        console.error('Error mounting discussion:', error);
        root.innerHTML = '<p class="text-danger mb-0">Tartışma yüklenirken hata oluştu.</p>';
    }
}

/** Bring the user's own comment into view inside the scrolling comment list. */
function highlightComment(commentId) {
    const el = document.querySelector(`#disc-modal-root [data-comment-id="${commentId}"]`);
    if (!el) return;
    el.classList.add('disc-comment-highlight');
    // Wait for the modal's open transition, or the scroll lands mid-animation.
    setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 350);
}

function onModalClosed() {
    discussionPanel?.destroy?.();
    discussionPanel = null;
    if (modalChangedData) {
        modalChangedData = false;
        const scrollY = window.scrollY;
        load({}).then(() => window.scrollTo(0, scrollY));
    }
}

// ---------------------------------------------------------------- helpers

/**
 * One flowing line for a clamped excerpt. Rich-text markers read as noise at
 * this size and line breaks waste the lines the clamp allows; the modal
 * renders both properly. Mentions stay as typed ("@kullanıcı").
 */
function plainText(text) {
    return String(text ?? '')
        .replace(/\*\*(\S[^\n]*?\S|\S)\*\*/g, '$1')
        .replace(/~~(\S[^\n]*?\S|\S)~~/g, '$1')
        .replace(/!!(\S[^\n]*?\S|\S)!!/g, '$1')
        .replace(/\+\+(\S[^\n]*?\S|\S)\+\+/g, '$1')
        .replace(/`([^`\n]+)`/g, '$1')
        .replace(/@\[group:\s*([^\]]+?)\s*\]/g, '@$1')
        .replace(/^\s*(?:[-*]|\d+[.)])\s+/gm, '• ')
        .replace(/\s*\n\s*/g, ' ')
        .trim();
}

function formatDateTime(value) {
    if (!value) return '';
    return new Date(value).toLocaleString('tr-TR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

/** Clock time only — the day header above the row carries the date. */
function formatTime(value) {
    if (!value) return '';
    return new Date(value).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function dayKey(value) {
    if (!value) return '';
    const date = new Date(value);
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(value) {
    if (!value) return '';
    const date = new Date(value);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (dayKey(date) === dayKey(today)) return 'Bugün';
    if (dayKey(date) === dayKey(yesterday)) return 'Dün';
    return date.toLocaleDateString('tr-TR', {
        day: '2-digit', month: 'long', year: 'numeric', weekday: 'long',
    });
}

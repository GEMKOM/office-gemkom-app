/**
 * Günlük Özet renderer — shared by the first-open modal, the Neo widget's
 * summaries pane and the IT preview.
 *
 * The payload (DailySummary.payload v1) is data the model helped write, so
 * every string goes through escapeHtml and nothing is ever rendered as rich
 * text. Python owns the lists and ids; this file only turns ids into links
 * (refUrl) and lays the sections out. Every class is prefixed `ds-` so the
 * same markup works inside a Bootstrap modal and inside `.aw-summaries`.
 */
import { escapeHtml } from '../../utils/text.js';

const TZ = 'Europe/Istanbul';
const STYLE_HREF = '/components/daily-summary/daily-summary.css';

// key, label, Font Awesome 6 icon — the payload's `areas` keys, in display order.
export const AREAS = [
    ['tasarim', 'Tasarım', 'fa-drafting-compass'],
    ['satinalma', 'Satın Alma', 'fa-cart-shopping'],
    ['kalite', 'Kalite', 'fa-clipboard-check'],
    ['planlama', 'Planlama', 'fa-calendar-days'],
    ['uretim', 'Üretim', 'fa-industry'],
    ['satis', 'Satış', 'fa-handshake'],
    ['diger', 'Diğer', 'fa-ellipsis'],
];

// ------------------------------------------------------------------ deep links

const enc = (value) => encodeURIComponent(String(value));

// REF.id is whatever the target page's query parameter expects (job_no,
// request_number, ncr_number, issue_number, offer_no, or a pk).
const REF_ROUTES = {
    job: (r) => `/projects/project-tracking/?job_no=${enc(r.id)}`,
    topic: (r) => (r.job_no
        ? `/projects/project-tracking/?job_no=${enc(r.job_no)}&topic_id=${enc(r.id)}`
        : null),
    release: (r) => `/design/release-approvals/?release_id=${enc(r.id)}`,
    qc_review: (r) => `/quality-control/qc-reviews/?review=${enc(r.id)}`,
    ncr: (r) => `/quality-control/ncrs/?ncr=${enc(r.id)}`,
    isg: (r) => `/isg/issues/?issue=${enc(r.id)}`,
    crane: (r) => `/general/crane-requests/list/?request=${enc(r.id)}`,
    pr: (r) => `/procurement/purchase-requests/registry/?talep=${enc(r.id)}`,
    po: (r) => `/finance/purchase-orders/?order=${enc(r.id)}`,
    offer: (r) => `/sales/offers/?offer_no=${enc(r.id)}`,
    dr: (r) => `/general/department-requests/pending/?request=${enc(r.id)}`,
    planning_request: (r) => `/planning/department-requests/?talep=${enc(r.id)}`,
    cnc: (r) => `/manufacturing/cnc-cutting/cuts/?cut=${enc(r.id)}`,
    lc_session: (r) => `/manufacturing/linear-cutting/cuts/?session=${enc(r.id)}`,
    statement: (r) => `/manufacturing/subcontracting/statements/?statement=${enc(r.id)}`,
    mpr: () => '/manufacturing/material-tracking/',
};

const REF_TYPE_LABELS = {
    job: 'İş emri',
    topic: 'Tartışma',
    release: 'Çizim yayını',
    qc_review: 'Kalite kontrol',
    ncr: 'NCR',
    isg: 'İSG',
    crane: 'Vinç talebi',
    pr: 'Satın alma talebi',
    po: 'Sipariş',
    offer: 'Teklif',
    dr: 'Departman talebi',
    planning_request: 'Planlama talebi',
    cnc: 'CNC kesim',
    lc_session: 'Profil kesim',
    statement: 'Hakediş',
    mpr: 'Malzeme çekme',
    fault: 'Arıza',
};

// Types whose id is already a human-readable number (GS-10162, NCR-2026-0004…).
const READABLE_ID_TYPES = new Set(['job', 'ncr', 'isg', 'pr', 'offer', 'planning_request']);

/** Site-relative URL for a payload ref, or null when there is no page to open. */
export function refUrl(ref) {
    if (!ref || typeof ref !== 'object') return null;
    const build = REF_ROUTES[ref.type];
    if (!build) return null;
    if (ref.type !== 'mpr' && (ref.id === null || ref.id === undefined || ref.id === '')) return null;
    return build(ref);
}

function refText(ref) {
    if (ref.label) return String(ref.label);
    const typeLabel = REF_TYPE_LABELS[ref.type] || String(ref.type || '');
    if (ref.id === null || ref.id === undefined || ref.id === '') return typeLabel;
    if (READABLE_ID_TYPES.has(ref.type)) return String(ref.id);
    return `${typeLabel} #${ref.id}`;
}

function renderRef(ref) {
    const text = escapeHtml(refText(ref));
    const url = refUrl(ref);
    if (url) {
        return `<a class="ds-ref" href="${escapeHtml(url)}" data-ref-type="${escapeHtml(ref.type)}">${text}</a>`;
    }
    return `<span class="ds-ref-plain" data-ref-type="${escapeHtml(ref.type || '')}">${text}</span>`;
}

function renderRefs(refs) {
    if (!Array.isArray(refs) || refs.length === 0) return '';
    return `<span class="ds-refs">${refs.map(renderRef).join('')}</span>`;
}

// ------------------------------------------------------------------ chips

function chip(text, color = 'grey', extraClass = '') {
    return `<span class="ds-chip ds-chip-${color}${extraClass ? ` ${extraClass}` : ''}">${escapeHtml(text)}</span>`;
}

const OUTCOME_META = {
    decided: { label: 'Karar', color: 'green' },
    question_open: { label: 'Soru açık', color: 'orange' },
    needs_action: { label: 'Aksiyon', color: 'red' },
    info: { label: '', color: 'grey' },
};

const TOPIC_TYPE_LABELS = {
    revision_request: 'Revizyon talebi',
    drawing_release: 'Çizim yayını',
    release_review: 'Yayın incelemesi',
    qc_review: 'Kalite kontrol',
    consultation: 'Danışma',
    sales_consult: 'Satış danışma',
};

const PRIORITY_META = {
    high: { label: 'Yüksek', color: 'orange' },
    urgent: { label: 'Acil', color: 'red' },
    critical: { label: 'Kritik', color: 'red' },
};

const JOB_KIND_LABELS = { child: 'Alt iş emri', phase: 'Faz' };

// Stat key → [label, color, always shown]. Order is display order.
const STAT_META = [
    ['new_jobs_root', 'iş emri', 'blue', true],
    ['topics_new', 'tartışma', 'purple', true],
    ['comments', 'yorum', 'grey', true],
    ['completed_jobs', 'tamamlanan iş', 'green', false],
    ['participants', 'katılımcı', 'grey', false],
    ['drawings_published', 'çizim yayını', 'grey', false],
    ['revisions_requested', 'revizyon talebi', 'grey', false],
    ['pr_created', 'satın alma talebi', 'grey', false],
    ['po_created', 'sipariş', 'grey', false],
    ['qc_submitted', 'KK gönderimi', 'grey', false],
    ['qc_decided', 'KK kararı', 'grey', false],
    ['ncr_created', 'NCR', 'red', false],
    ['tasks_completed', 'tamamlanan görev', 'grey', false],
    ['cnc_cuts', 'CNC kesim', 'grey', false],
    ['deliveries_jobs', 'teslimat alan iş', 'grey', false],
    ['tonnage_kg', 'kg üretim', 'grey', false],
    ['crane_requests', 'vinç talebi', 'grey', false],
    ['mpr_created', 'malzeme çekme', 'grey', false],
    ['isg_new', 'İSG kaydı', 'orange', false],
    ['faults_new', 'arıza', 'orange', false],
    ['date_changes', 'tarih değişikliği', 'grey', false],
    ['holds', 'bekletme', 'orange', false],
    ['cancelled', 'iptal', 'red', false],
];

const numberFmt = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });

function statNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

/**
 * Stat chips: the three headline counts always, everything else only when
 * non-zero. Child job orders ride along on the "iş emri" chip.
 */
export function renderStatChips(stats, { limit = 0 } = {}) {
    const s = stats && typeof stats === 'object' ? stats : {};
    const chips = [];
    for (const [key, label, color, always] of STAT_META) {
        let value = statNumber(s[key]);
        if (!always && value <= 0) continue;
        let text = `${numberFmt.format(value)} ${label}`;
        if (key === 'new_jobs_root') {
            const child = statNumber(s.new_jobs_child);
            if (child > 0) text += ` (+${numberFmt.format(child)} alt)`;
        }
        chips.push(`<span class="ds-stat ds-chip ds-chip-${color}" data-stat="${key}">${escapeHtml(text)}</span>`);
        if (limit && chips.length >= limit) break;
    }
    return chips.length ? `<div class="ds-stats">${chips.join('')}</div>` : '';
}

// ------------------------------------------------------------------ lists

// Long lists show the first `collapseAfter` rows and a "Tümünü göster (N)"
// toggle; bindDailySummaryInteractions() wires the toggle by delegation.
function collapsibleList(itemsHtml, collapseAfter, listClass = 'ds-list') {
    const total = itemsHtml.length;
    if (total === 0) return '';
    if (!collapseAfter || total <= collapseAfter) {
        return `<ul class="${listClass}">${itemsHtml.join('')}</ul>`;
    }
    const head = itemsHtml.slice(0, collapseAfter).join('');
    const tail = itemsHtml.slice(collapseAfter).join('');
    return `<div class="ds-collapsible" data-ds-total="${total}">` +
        `<ul class="${listClass}">${head}</ul>` +
        `<ul class="${listClass} ds-more" hidden>${tail}</ul>` +
        `<button type="button" class="ds-more-btn" data-ds-toggle="1" aria-expanded="false">` +
        `Tümünü göster (${total})</button>` +
        '</div>';
}

function renderItem(item) {
    if (!item || typeof item !== 'object') return '';
    const kind = escapeHtml(item.kind || '');
    return `<li class="ds-item" data-kind="${kind}">` +
        `<span class="ds-item-text">${escapeHtml(item.text || '')}</span>` +
        renderRefs(item.refs) +
        '</li>';
}

function renderItems(items, collapseAfter) {
    const list = Array.isArray(items) ? items.filter((it) => it && (it.text || (it.refs && it.refs.length))) : [];
    return collapsibleList(list.map(renderItem), collapseAfter);
}

function sectionTitle(icon, text, count) {
    const badge = count ? ` <span class="ds-count">${escapeHtml(String(count))}</span>` : '';
    return `<div class="ds-section-title"><i class="fas ${icon}"></i> ${escapeHtml(text)}${badge}</div>`;
}

// ------------------------------------------------------------------ job orders

function renderJobRow(job, { showKind = false } = {}) {
    if (!job || !job.job_no) return '';
    const parts = [renderRef({ type: 'job', id: job.job_no })];
    if (job.title) parts.push(`<span class="ds-job-title">${escapeHtml(job.title)}</span>`);
    if (job.customer) parts.push(`<span class="ds-muted">· ${escapeHtml(job.customer)}</span>`);
    if (showKind && job.kind && job.kind !== 'root') {
        parts.push(chip(JOB_KIND_LABELS[job.kind] || job.kind, 'grey'));
        if (job.parent_job_no) parts.push(`<span class="ds-muted">← ${escapeHtml(job.parent_job_no)}</span>`);
    }
    if (job.offer_no) {
        parts.push(`<span class="ds-muted">Teklif</span>${renderRef({ type: 'offer', id: job.offer_no })}`);
    }
    return `<li class="ds-item ds-job">${parts.join(' ')}</li>`;
}

function renderJobGroup(label, icon, jobs, collapseAfter, opts) {
    const rows = (Array.isArray(jobs) ? jobs : []).map((j) => renderJobRow(j, opts)).filter(Boolean);
    if (rows.length === 0) return '';
    return `<div class="ds-subsection">` +
        `<div class="ds-subtitle"><i class="fas ${icon}"></i> ${escapeHtml(label)} <span class="ds-count">${rows.length}</span></div>` +
        collapsibleList(rows, collapseAfter) +
        '</div>';
}

function renderJobOrders(jobOrders, collapseAfter) {
    const jo = jobOrders && typeof jobOrders === 'object' ? jobOrders : {};
    const groups = [
        renderJobGroup('Yeni açılan', 'fa-plus', jo.new, collapseAfter, { showKind: true }),
        renderJobGroup('Tamamlanan', 'fa-check', jo.completed, collapseAfter),
        renderJobGroup('Başlayan', 'fa-play', jo.started, collapseAfter),
    ].filter(Boolean);
    if (groups.length === 0) return '';
    return `<section class="ds-section ds-section-jobs">${sectionTitle('fa-briefcase', 'İş Emirleri')}${groups.join('')}</section>`;
}

// ------------------------------------------------------------------ discussions

function renderDiscussion(topic) {
    if (!topic || typeof topic !== 'object') return '';
    const head = [];
    if (topic.job_no) head.push(renderRef({ type: 'job', id: topic.job_no }));
    const title = topic.title || 'Başlıksız konu';
    const topicRef = { type: 'topic', id: topic.topic_id, job_no: topic.job_no, label: title };
    const url = refUrl(topicRef);
    head.push(url
        ? `<a class="ds-topic-title" href="${escapeHtml(url)}">${escapeHtml(title)}</a>`
        : `<span class="ds-topic-title">${escapeHtml(title)}</span>`);

    const chips = [];
    if (topic.is_new) chips.push(chip('Yeni', 'blue'));
    const typeLabel = TOPIC_TYPE_LABELS[topic.type];
    if (typeLabel) chips.push(chip(typeLabel, 'purple'));
    const prio = PRIORITY_META[topic.priority];
    if (prio) chips.push(chip(prio.label, prio.color));
    const comments = statNumber(topic.comment_count);
    if (comments > 0) chips.push(chip(`${comments} yorum`, 'grey'));
    const outcome = OUTCOME_META[topic.outcome];
    if (outcome && outcome.label) chips.push(chip(outcome.label, outcome.color, 'ds-outcome'));

    const gist = topic.gist ? `<div class="ds-gist">${escapeHtml(topic.gist)}</div>` : '';
    return `<li class="ds-item ds-topic" data-topic-id="${escapeHtml(String(topic.topic_id ?? ''))}">` +
        `<div class="ds-topic-head">${head.join(' ')}${chips.length ? `<span class="ds-topic-chips">${chips.join('')}</span>` : ''}</div>` +
        gist +
        '</li>';
}

function renderDiscussions(discussions, omittedTopics, collapseAfter) {
    const rows = (Array.isArray(discussions) ? discussions : []).map(renderDiscussion).filter(Boolean);
    if (rows.length === 0 && !omittedTopics) return '';
    const omitted = omittedTopics
        ? `<div class="ds-omitted">+${escapeHtml(String(omittedTopics))} konu daha (özet dışında)</div>`
        : '';
    return `<section class="ds-section ds-section-discussions">` +
        sectionTitle('fa-comments', 'Tartışmalar', rows.length) +
        collapsibleList(rows, collapseAfter) +
        omitted +
        '</section>';
}

// ------------------------------------------------------------------ areas

function renderArea([key, label, icon], area, omittedLines, collapseAfter) {
    const a = area && typeof area === 'object' ? area : {};
    const lines = Array.isArray(a.lines) ? a.lines : [];
    const note = a.note ? String(a.note) : '';
    if (!note && lines.length === 0 && !omittedLines) return '';
    const noteHtml = note ? `<p class="ds-area-note">${escapeHtml(note)}</p>` : '';
    const omitted = omittedLines
        ? `<div class="ds-omitted">+${escapeHtml(String(omittedLines))} satır daha</div>`
        : '';
    return `<section class="ds-section ds-area" data-area="${escapeHtml(key)}">` +
        sectionTitle(icon, label, lines.length) +
        noteHtml +
        renderItems(lines, collapseAfter) +
        omitted +
        '</section>';
}

// ------------------------------------------------------------------ main render

/**
 * Full summary body as an HTML string. Order: headline → stat chips →
 * Öne çıkanlar → İş Emirleri → Tartışmalar → one block per area.
 * `compact` tightens spacing for the widget pane and hides the stat chips
 * unless `showStats` says otherwise (the pane's row already shows them).
 */
export function renderDailySummary(summary, { compact = false, collapseAfter = 8, showStats } = {}) {
    if (!summary || typeof summary !== 'object') return '';
    const payload = summary.payload && typeof summary.payload === 'object' ? summary.payload : {};
    const stats = payload.stats && typeof payload.stats === 'object' ? payload.stats : (summary.stats || {});
    const headline = payload.headline || summary.headline || '';
    const omitted = payload.omitted && typeof payload.omitted === 'object' ? payload.omitted : {};
    const omittedLines = omitted.lines && typeof omitted.lines === 'object' ? omitted.lines : {};
    const withStats = showStats === undefined ? !compact : !!showStats;

    const sections = [];
    const highlights = renderItems(payload.highlights, 0);
    if (highlights) {
        sections.push(`<section class="ds-section ds-section-highlights">${sectionTitle('fa-star', 'Öne çıkanlar')}${highlights}</section>`);
    }
    sections.push(renderJobOrders(payload.job_orders, collapseAfter));
    sections.push(renderDiscussions(payload.discussions, statNumber(omitted.topics), collapseAfter));

    const areas = payload.areas && typeof payload.areas === 'object' ? payload.areas : {};
    for (const area of AREAS) {
        sections.push(renderArea(area, areas[area[0]], statNumber(omittedLines[area[0]]), collapseAfter));
    }

    const content = sections.filter(Boolean).join('');
    if (!headline && !content) {
        // `empty` days and payload-less rows: zero chips would only add noise.
        return '<div class="ds-root ds-empty"><div class="ds-muted">Bu dönemde kayda değer bir hareket yok.</div></div>';
    }
    const head = (headline ? `<p class="ds-headline">${escapeHtml(headline)}</p>` : '') +
        (withStats ? renderStatChips(stats) : '');
    return `<div class="ds-root${compact ? ' ds-compact' : ''}" data-summary-id="${escapeHtml(String(summary.id ?? ''))}">${head}${content}</div>`;
}

/** Wire the "Tümünü göster" toggles inside `container` (idempotent). */
export function bindDailySummaryInteractions(container) {
    if (!container || container.dataset.dsBound === '1') return;
    container.dataset.dsBound = '1';
    container.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-ds-toggle]');
        if (!btn || !container.contains(btn)) return;
        event.preventDefault();
        const wrap = btn.closest('.ds-collapsible');
        const more = wrap && wrap.querySelector('.ds-more');
        if (!more) return;
        const expanded = more.hasAttribute('hidden');
        if (expanded) more.removeAttribute('hidden');
        else more.setAttribute('hidden', '');
        btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        btn.textContent = expanded ? 'Daha az göster' : `Tümünü göster (${wrap.dataset.dsTotal || ''})`;
    });
}

/** Inject daily-summary.css once (the widget pane and the modal both need it). */
export function ensureDailySummaryStyles() {
    if (document.querySelector('link[data-daily-summary]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLE_HREF;
    link.dataset.dailySummary = '1';
    document.head.appendChild(link);
}

// ------------------------------------------------------------------ dates

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const shortFmt = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: 'numeric', month: 'short', weekday: 'short' });
const rangeFmt = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const longFmt = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });

/** Istanbul calendar date as YYYY-MM-DD. */
export function istanbulDate(date = new Date()) {
    return dayFmt.format(date);
}

// 'YYYY-MM-DD' → Date at Istanbul noon, so Intl formatting never crosses midnight.
function parseLocalDate(dateStr) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ''));
    if (!m) return null;
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 9, 0, 0));
}

/** Whole days between an Istanbul date string and today (positive = past). */
export function daysSince(dateStr, now = new Date()) {
    const then = parseLocalDate(dateStr);
    const today = parseLocalDate(istanbulDate(now));
    if (!then || !today) return 0;
    return Math.round((today - then) / 86400000);
}

/** 'Bugün' / 'Dün' / '22 Eyl Sal'. */
export function relativeDayLabel(dateStr) {
    const d = parseLocalDate(dateStr);
    if (!d) return '';
    const diff = daysSince(dateStr);
    if (diff === 0) return 'Bugün';
    if (diff === 1) return 'Dün';
    return shortFmt.format(d);
}

/** '22 Eylül 2026 Salı' — for the modal header. */
export function formatSummaryDate(dateStr) {
    const d = parseLocalDate(dateStr);
    return d ? longFmt.format(d) : '';
}

/** '19 Eyl 05:20 – 22 Eyl 05:20' (payload label when present; list rows have none). */
export function formatWindowLabel(summary) {
    if (!summary) return '';
    const label = summary.payload?.window?.label;
    if (label) return String(label);
    const start = summary.window_start ? new Date(summary.window_start) : null;
    const end = summary.window_end ? new Date(summary.window_end) : null;
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '';
    return `${rangeFmt.format(start)} – ${rangeFmt.format(end)}`;
}

// ------------------------------------------------------------------ seen state

/** Id of the logged-in user from the cached `user` record, or null. */
export function currentUserId() {
    try {
        const user = JSON.parse(localStorage.getItem('user') || 'null');
        const id = user && user.id;
        return id === null || id === undefined ? null : id;
    } catch (error) {
        return null;
    }
}

/** A regenerated summary (new generated_at) counts as unseen again. */
export function seenValue(summary) {
    return `${summary?.id ?? ''}:${summary?.generated_at ?? ''}`;
}

export function getSeen(uid) {
    try {
        return localStorage.getItem(`ds:seen:${uid}`) || '';
    } catch (error) {
        return '';
    }
}

export function setSeen(uid, value) {
    try {
        localStorage.setItem(`ds:seen:${uid}`, String(value));
    } catch (error) {
        // Private mode / quota: the server-side read record still applies.
    }
}

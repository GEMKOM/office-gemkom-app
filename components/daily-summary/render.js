/**
 * Günlük Özet renderer — shared by the first-open modal, the Neo widget's
 * summaries pane and the IT preview.
 *
 * The payload (DailySummary.payload v1) is data the model helped write, so
 * every string goes through escapeHtml and nothing is ever rendered as rich
 * text. Python owns the lists and ids; this file only turns ids into links
 * (refUrl) and lays the sections out. Every class is prefixed `ds-` so the
 * same markup works inside a Bootstrap modal and inside `.aw-summaries`.
 *
 * Two layers: `full` (default, the whole summary at once — widget pane, IT
 * preview) and `brief` (the modal: hero headline, four KPI tiles, "Sizinle
 * ilgili", five highlights, then a "Tümünü gör" button that reveals the rest
 * inline with the areas as an accordion).
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

// users.Position.department_code → the area the reader wants first.
export const AREA_BY_DEPARTMENT = {
    design: 'tasarim',
    planning: 'planlama',
    procurement: 'satinalma',
    manufacturing: 'uretim',
    machining: 'uretim',
    maintenance: 'uretim',
    welding: 'uretim',
    qualitycontrol: 'kalite',
    quality_control: 'kalite',
    quality: 'kalite',
    sales: 'satis',
};

// There is no single "my approvals" page in white-app (the inbox API has no
// consumer); the general landing lists every pending-approval page.
export const APPROVALS_INBOX_URL = '/general/';

const FOR_YOU_LIMIT = 6;
const BRIEF_HIGHLIGHT_LIMIT = 5;
const BRIEF_COLLAPSE_AFTER = 3;
const FULL_COLLAPSE_AFTER = 8;

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

// The four numbers the brief layer leads with. Always rendered, zeros included:
// a row of tiles that appears and disappears reads as broken, not as calm.
const KPI_META = [
    ['jobs', 'iş emri', (s) => statNumber(s.new_jobs_root) + statNumber(s.new_jobs_child)],
    ['topics', 'tartışma', (s) => statNumber(s.topics_new)],
    ['comments', 'yorum', (s) => statNumber(s.comments)],
    ['tasks', 'tamamlanan görev', (s) => statNumber(s.tasks_completed)],
];

/** Four KPI tiles: iş emri (root + child), tartışma, yorum, tamamlanan görev. */
export function renderKpiTiles(stats) {
    const s = stats && typeof stats === 'object' ? stats : {};
    const tiles = KPI_META.map(([key, label, get]) =>
        `<div class="ds-kpi" data-kpi="${key}">` +
        `<div class="ds-kpi-num">${escapeHtml(numberFmt.format(get(s)))}</div>` +
        `<div class="ds-kpi-label">${escapeHtml(label)}</div>` +
        '</div>');
    return `<div class="ds-kpis">${tiles.join('')}</div>`;
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

// Bold lead-in for a highlight: the first clause up to a ':' or ';' that is
// followed by whitespace (so "05:20" never splits), else the first six words.
// Returns null when the sentence is too short for a split to help.
const LEAD_CLAUSE = /^([^:;]{2,90}[:;])\s+(\S[\s\S]*)$/;
const LEAD_WORDS = 6;

export function splitLeadIn(text) {
    const t = String(text || '').trim();
    if (!t) return null;
    const m = LEAD_CLAUSE.exec(t);
    if (m) return [m[1], m[2]];
    const words = t.split(/\s+/);
    if (words.length < LEAD_WORDS + 3) return null;
    return [words.slice(0, LEAD_WORDS).join(' '), words.slice(LEAD_WORDS).join(' ')];
}

function renderItemText(text, leadIn) {
    const split = leadIn ? splitLeadIn(text) : null;
    if (!split) return `<span class="ds-item-text">${escapeHtml(text || '')}</span>`;
    return `<span class="ds-item-text"><strong class="ds-lead">${escapeHtml(split[0])}</strong> ${escapeHtml(split[1])}</span>`;
}

function renderItem(item, { leadIn = false } = {}) {
    if (!item || typeof item !== 'object') return '';
    const kind = escapeHtml(item.kind || '');
    return `<li class="ds-item" data-kind="${kind}">` +
        renderItemText(item.text, leadIn) +
        renderRefs(item.refs) +
        '</li>';
}

function validItems(items) {
    return Array.isArray(items) ? items.filter((it) => it && (it.text || (it.refs && it.refs.length))) : [];
}

function renderItems(items, collapseAfter, opts) {
    return collapsibleList(validItems(items).map((it) => renderItem(it, opts)), collapseAfter);
}

function sectionTitle(icon, text, count) {
    const badge = count ? ` <span class="ds-count">${escapeHtml(String(count))}</span>` : '';
    return `<div class="ds-section-title"><i class="fas ${icon}"></i> ${escapeHtml(text)}${badge}</div>`;
}

function renderHighlights(items, { title = 'Öne çıkanlar', leadIn = false, extraClass = '' } = {}) {
    if (!items.length) return '';
    const list = collapsibleList(items.map((it) => renderItem(it, { leadIn })), 0);
    return `<section class="ds-section ds-section-highlights${extraClass ? ` ${extraClass}` : ''}">` +
        sectionTitle('fa-star', title) + list + '</section>';
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

function topicTitleHtml(topic) {
    const title = topic.title || 'Başlıksız konu';
    const url = refUrl({ type: 'topic', id: topic.topic_id, job_no: topic.job_no });
    return url
        ? `<a class="ds-topic-title" href="${escapeHtml(url)}">${escapeHtml(title)}</a>`
        : `<span class="ds-topic-title">${escapeHtml(title)}</span>`;
}

function renderDiscussion(topic) {
    if (!topic || typeof topic !== 'object') return '';
    const head = [];
    if (topic.job_no) head.push(renderRef({ type: 'job', id: topic.job_no }));
    head.push(topicTitleHtml(topic));

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

/** Area keys with the reader's own department first, then the default order. */
export function areaOrderFor(departmentCode) {
    const order = AREAS.map((a) => a[0]);
    const first = AREA_BY_DEPARTMENT[String(departmentCode || '').toLowerCase()];
    if (!first) return order;
    return [first, ...order.filter((k) => k !== first)];
}

// AREAS in the caller's order; unknown keys ignored, missing keys appended.
function orderedAreas(areaOrder) {
    if (!Array.isArray(areaOrder) || areaOrder.length === 0) return AREAS;
    const byKey = new Map(AREAS.map((a) => [a[0], a]));
    const out = [];
    for (const key of areaOrder) {
        const area = byKey.get(key);
        if (area && !out.includes(area)) out.push(area);
    }
    for (const area of AREAS) if (!out.includes(area)) out.push(area);
    return out;
}

function renderArea([key, label, icon], area, omittedLines, collapseAfter, { accordion = false } = {}) {
    const a = area && typeof area === 'object' ? area : {};
    const lines = Array.isArray(a.lines) ? a.lines : [];
    const note = a.note ? String(a.note) : '';
    if (!note && lines.length === 0 && !omittedLines) return '';
    const noteHtml = note ? `<p class="ds-area-note">${escapeHtml(note)}</p>` : '';
    const omitted = omittedLines
        ? `<div class="ds-omitted">+${escapeHtml(String(omittedLines))} satır daha</div>`
        : '';
    if (!accordion) {
        return `<section class="ds-section ds-area" data-area="${escapeHtml(key)}">` +
            sectionTitle(icon, label, lines.length) +
            noteHtml +
            renderItems(lines, collapseAfter) +
            omitted +
            '</section>';
    }
    // Accordion: icon + label + count on a clickable header, the note always
    // visible, the lines hidden until the header is clicked. An area with a
    // note but no lines gets a static header (nothing to unfold).
    const count = lines.length ? ` <span class="ds-count">${lines.length}</span>` : '';
    const inner = `<i class="fas ${icon} ds-area-icon"></i><span class="ds-area-label">${escapeHtml(label)}</span>${count}`;
    const head = lines.length
        ? `<button type="button" class="ds-area-head" data-ds-area-toggle="1" aria-expanded="false">${inner}<i class="fas fa-chevron-down ds-area-chev"></i></button>`
        : `<div class="ds-area-head ds-area-head-static">${inner}</div>`;
    const body = lines.length
        ? `<div class="ds-area-body" hidden>${renderItems(lines, collapseAfter)}${omitted}</div>`
        : omitted;
    return `<section class="ds-section ds-area ds-area-acc" data-area="${escapeHtml(key)}">${head}${noteHtml}${body}</section>`;
}

// ------------------------------------------------------------------ "Sizinle ilgili"

// for_you comes from the user endpoints only and describes the requesting
// user alone (their topics/mentions, their job orders, their approval queue),
// so rendering it in a modal every office user sees leaks nothing.
function forYouSets(forYou) {
    const fy = forYou && typeof forYou === 'object' ? forYou : null;
    if (!fy) return null;
    const topicIds = new Set((Array.isArray(fy.topic_ids) ? fy.topic_ids : []).map((v) => String(v)));
    const jobNos = new Set((Array.isArray(fy.job_nos) ? fy.job_nos : []).map((v) => String(v)));
    const pending = statNumber(fy.pending_approvals);
    if (!topicIds.size && !jobNos.size && pending <= 0) return null;
    return { topicIds, jobNos, pending };
}

function refsTouchJobs(refs, jobNos) {
    if (!Array.isArray(refs)) return false;
    return refs.some((r) => r && typeof r === 'object' && (
        (r.type === 'job' && jobNos.has(String(r.id))) ||
        (r.job_no && jobNos.has(String(r.job_no)))
    ));
}

const FOR_YOU_JOB_GROUPS = [['new', 'yeni açıldı'], ['completed', 'tamamlandı'], ['started', 'başladı']];

/**
 * Items about the reader: pending approvals, their discussions, their job
 * orders, area lines that reference their job orders. Capped; '' when empty
 * or when the row carries no `for_you` (older backend, analytics rows).
 */
export function renderForYou(summary, { forYou, limit = FOR_YOU_LIMIT } = {}) {
    const sets = forYouSets(forYou === undefined ? summary?.for_you : forYou);
    if (!sets) return '';
    const payload = summary?.payload && typeof summary.payload === 'object' ? summary.payload : {};
    const items = [];

    if (sets.pending > 0) {
        const text = `Onayınızı bekleyen ${numberFmt.format(sets.pending)} talep`;
        items.push(`<li class="ds-item ds-fy ds-fy-approvals"><i class="fas fa-check-double ds-fy-icon"></i>` +
            `<a class="ds-fy-link" href="${APPROVALS_INBOX_URL}">${escapeHtml(text)}</a></li>`);
    }

    for (const topic of (Array.isArray(payload.discussions) ? payload.discussions : [])) {
        if (!topic || !sets.topicIds.has(String(topic.topic_id))) continue;
        const head = [];
        if (topic.job_no) head.push(renderRef({ type: 'job', id: topic.job_no }));
        head.push(topicTitleHtml(topic));
        const gist = topic.gist ? `<div class="ds-gist">${escapeHtml(topic.gist)}</div>` : '';
        items.push(`<li class="ds-item ds-fy ds-fy-topic" data-topic-id="${escapeHtml(String(topic.topic_id ?? ''))}">` +
            `<i class="fas fa-comments ds-fy-icon"></i><span class="ds-fy-main">${head.join(' ')}</span>${gist}</li>`);
    }

    const jo = payload.job_orders && typeof payload.job_orders === 'object' ? payload.job_orders : {};
    const seenJobs = new Set();
    for (const [group, label] of FOR_YOU_JOB_GROUPS) {
        for (const job of (Array.isArray(jo[group]) ? jo[group] : [])) {
            if (!job || !job.job_no || !sets.jobNos.has(String(job.job_no)) || seenJobs.has(String(job.job_no))) continue;
            seenJobs.add(String(job.job_no));
            const title = job.title ? ` <span class="ds-job-title">${escapeHtml(job.title)}</span>` : '';
            items.push(`<li class="ds-item ds-fy ds-fy-job" data-group="${group}"><i class="fas fa-briefcase ds-fy-icon"></i>` +
                `${renderRef({ type: 'job', id: job.job_no })}${title} <span class="ds-muted">· ${escapeHtml(label)}</span></li>`);
        }
    }

    const areas = payload.areas && typeof payload.areas === 'object' ? payload.areas : {};
    const seenText = new Set();
    for (const [key, , icon] of AREAS) {
        const lines = areas[key] && Array.isArray(areas[key].lines) ? areas[key].lines : [];
        for (const line of lines) {
            if (!line || typeof line !== 'object' || !refsTouchJobs(line.refs, sets.jobNos)) continue;
            const text = String(line.text || '').trim();
            if (!text || seenText.has(text)) continue;
            seenText.add(text);
            items.push(`<li class="ds-item ds-fy ds-fy-line" data-fy-area="${escapeHtml(key)}"><i class="fas ${icon} ds-fy-icon"></i>` +
                `<span class="ds-item-text">${escapeHtml(text)}</span>${renderRefs(line.refs)}</li>`);
        }
    }

    if (!items.length) return '';
    const shown = limit ? items.slice(0, limit) : items;
    const more = items.length - shown.length;
    return `<section class="ds-section ds-foryou">` +
        sectionTitle('fa-user-check', 'Sizinle ilgili') +
        `<ul class="ds-list">${shown.join('')}</ul>` +
        (more > 0 ? `<div class="ds-omitted">+${more} kayıt daha aşağıda</div>` : '') +
        '</section>';
}

// ------------------------------------------------------------------ main render

/**
 * Summary body as an HTML string.
 *
 * Options (all optional; the bare call renders the full layer exactly as the
 * first release did):
 *   layer          'full' (default) | 'brief' — brief = hero headline, KPI
 *                  tiles, "Sizinle ilgili", ≤5 highlights, then a "Tümünü gör"
 *                  button that reveals İş Emirleri / Tartışmalar / areas inline.
 *   areaOrder      array of area keys in display order (see areaOrderFor).
 *   forYou         override for summary.for_you (null hides the block).
 *   accordion      areas as click-to-open headers (default: brief only).
 *   highlightLimit highlights shown before the fold (default 5 brief, all full).
 *   leadIn         bold lead-in on highlights (default: brief only).
 *   collapseAfter  list fold size (default 3 brief, 8 full).
 *   compact        tighter spacing for the widget pane; hides stat chips
 *                  unless `showStats` says otherwise (full layer only).
 */
export function renderDailySummary(summary, options = {}) {
    if (!summary || typeof summary !== 'object') return '';
    const {
        compact = false,
        showStats,
        layer = 'full',
        areaOrder = null,
        forYou,
        accordion,
        highlightLimit,
        leadIn,
        collapseAfter,
    } = options;
    const brief = layer === 'brief';
    const fold = collapseAfter === undefined ? (brief ? BRIEF_COLLAPSE_AFTER : FULL_COLLAPSE_AFTER) : collapseAfter;
    const useAccordion = accordion === undefined ? brief : !!accordion;
    const hlLimit = highlightLimit === undefined ? (brief ? BRIEF_HIGHLIGHT_LIMIT : 0) : highlightLimit;
    const useLead = leadIn === undefined ? brief : !!leadIn;

    const payload = summary.payload && typeof summary.payload === 'object' ? summary.payload : {};
    const stats = payload.stats && typeof payload.stats === 'object' ? payload.stats : (summary.stats || {});
    const headline = payload.headline || summary.headline || '';
    const omitted = payload.omitted && typeof payload.omitted === 'object' ? payload.omitted : {};
    const omittedLines = omitted.lines && typeof omitted.lines === 'object' ? omitted.lines : {};
    const areas = payload.areas && typeof payload.areas === 'object' ? payload.areas : {};

    const forYouHtml = renderForYou(summary, { forYou });
    const hlItems = validItems(payload.highlights);
    const hlShown = hlLimit ? hlItems.slice(0, hlLimit) : hlItems;
    const hlRest = hlLimit ? hlItems.slice(hlLimit) : [];
    const highlights = renderHighlights(hlShown, { leadIn: useLead });

    const detail = [
        renderHighlights(hlRest, { title: 'Öne çıkanlar (devamı)', leadIn: useLead, extraClass: 'ds-section-highlights-more' }),
        renderJobOrders(payload.job_orders, fold),
        renderDiscussions(payload.discussions, statNumber(omitted.topics), fold),
        ...orderedAreas(areaOrder).map((area) =>
            renderArea(area, areas[area[0]], statNumber(omittedLines[area[0]]), fold, { accordion: useAccordion })),
    ].filter(Boolean).join('');

    if (!headline && !forYouHtml && !highlights && !detail) {
        // `empty` days and payload-less rows: zero chips would only add noise.
        return '<div class="ds-root ds-empty"><div class="ds-muted">Bu dönemde kayda değer bir hareket yok.</div></div>';
    }
    const idAttr = `data-summary-id="${escapeHtml(String(summary.id ?? ''))}"`;

    if (brief) {
        const detailId = `ds-detail-${escapeHtml(String(summary.id ?? 'x'))}`;
        const head = (headline ? `<p class="ds-headline ds-hero">${escapeHtml(headline)}</p>` : '') + renderKpiTiles(stats);
        const reveal = detail
            ? `<div class="ds-reveal"><button type="button" class="ds-reveal-btn" data-ds-reveal="1" aria-expanded="false" aria-controls="${detailId}">` +
              '<i class="fas fa-list-ul me-1"></i>Tümünü gör</button></div>' +
              `<div class="ds-detail" id="${detailId}" hidden>${detail}</div>`
            : '';
        return `<div class="ds-root ds-brief" ${idAttr}>${head}${forYouHtml}${highlights}${reveal}</div>`;
    }

    const withStats = showStats === undefined ? !compact : !!showStats;
    const head = (headline ? `<p class="ds-headline">${escapeHtml(headline)}</p>` : '') +
        (withStats ? renderStatChips(stats) : '');
    return `<div class="ds-root${compact ? ' ds-compact' : ''}" ${idAttr}>${head}${forYouHtml}${highlights}${detail}</div>`;
}

/**
 * Wire the toggles inside `container` (idempotent): "Tümünü göster (N)" list
 * folds, the brief layer's "Tümünü gör" reveal (one-way; `onReveal` fires
 * once) and the area accordion headers.
 */
export function bindDailySummaryInteractions(container, { onReveal = null } = {}) {
    if (!container || container.dataset.dsBound === '1') return;
    container.dataset.dsBound = '1';
    container.addEventListener('click', (event) => {
        const reveal = event.target.closest('[data-ds-reveal]');
        if (reveal && container.contains(reveal)) {
            event.preventDefault();
            const root = reveal.closest('.ds-root') || container;
            const detail = root.querySelector('.ds-detail');
            if (detail) detail.removeAttribute('hidden');
            reveal.setAttribute('aria-expanded', 'true');
            (reveal.closest('.ds-reveal') || reveal).setAttribute('hidden', '');
            if (typeof onReveal === 'function') {
                try { onReveal(); } catch (error) { console.warn('Daily summary onReveal failed:', error); }
            }
            return;
        }
        const areaBtn = event.target.closest('[data-ds-area-toggle]');
        if (areaBtn && container.contains(areaBtn)) {
            event.preventDefault();
            const section = areaBtn.closest('.ds-area');
            const body = section && section.querySelector('.ds-area-body');
            if (!body) return;
            const open = body.hasAttribute('hidden');
            if (open) body.removeAttribute('hidden');
            else body.setAttribute('hidden', '');
            areaBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
            section.classList.toggle('ds-area-open', open);
            return;
        }
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

// ------------------------------------------------------------------ user / seen state

function cachedUser() {
    try {
        return JSON.parse(localStorage.getItem('user') || 'null');
    } catch (error) {
        return null;
    }
}

/** Id of the logged-in user from the cached `user` record, or null. */
export function currentUserId() {
    const user = cachedUser();
    const id = user && user.id;
    return id === null || id === undefined ? null : id;
}

/** Department code of the logged-in user (position first, like navigateByTeam), or null. */
export function currentDepartmentCode() {
    const user = cachedUser();
    return (user && (user.position?.department_code || user.department_code)) || null;
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

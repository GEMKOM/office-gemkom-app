/**
 * Günlük Özet renderer — Neo's summaries pane, plus the date and "seen"
 * helpers the morning prompt and the management dashboard share. Ported from
 * the legacy components/daily-summary/render.js; the markup, the ds-* classes
 * (styled by dailySummary.css) and the `ds:seen:<uid>` localStorage keys are
 * unchanged.
 *
 * The payload (DailySummary.payload v1) is data the model helped write, so
 * every string goes through escapeHtml and nothing is ever rendered as rich
 * text. Python owns the lists and ids; this file only turns ids into links
 * (refUrl) and lays the sections out.
 *
 * Two layers: `full` (default, the whole summary at once) and `brief` (hero
 * headline, four KPI tiles, "Sizinle ilgili", five highlights, then a
 * "Tümünü gör" button that reveals the rest inline with the areas as an
 * accordion).
 */
import { escapeHtml } from '@/ui/RichText/renderRichText';

const TZ = 'Europe/Istanbul';

// The payload as this file reads it: every field optional, since the model
// wrote it and older rows lack newer fields.
type Id = string | number | null | undefined;

interface SummaryRef {
  type?: string;
  id?: Id;
  job_no?: Id;
  label?: string | null;
}

interface SummaryItem {
  kind?: string;
  text?: string;
  refs?: SummaryRef[];
}

interface SummaryJob {
  job_no?: string;
  title?: string;
  customer?: string;
  kind?: string;
  parent_job_no?: string;
  offer_no?: string;
}

interface SummaryTopic {
  topic_id?: Id;
  job_no?: string;
  title?: string;
  type?: string;
  priority?: string;
  comment_count?: unknown;
  outcome?: string;
  is_new?: boolean;
  gist?: string;
}

interface SummaryArea {
  note?: string;
  lines?: SummaryItem[];
}

type JobOrders = Partial<Record<'new' | 'completed' | 'started', SummaryJob[]>>;

interface SummaryPayload {
  headline?: string;
  stats?: Record<string, unknown>;
  highlights?: SummaryItem[];
  job_orders?: JobOrders;
  discussions?: SummaryTopic[];
  areas?: Record<string, SummaryArea>;
  omitted?: { topics?: unknown; lines?: Record<string, unknown> };
  window?: { label?: string };
}

interface ForYou {
  topic_ids?: unknown[];
  job_nos?: unknown[];
  pending_approvals?: unknown;
}

interface SummaryLike {
  id?: Id;
  headline?: string;
  stats?: Record<string, unknown>;
  payload?: SummaryPayload | null;
  for_you?: ForYou | null;
  window_start?: string | null;
  window_end?: string | null;
  generated_at?: string | null;
}

function obj<T extends object>(value: unknown): Partial<T> {
  return value && typeof value === 'object' ? (value as Partial<T>) : {};
}

function list<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

type AreaDef = readonly [key: string, label: string, icon: string];

// key, label, Font Awesome 6 icon — the payload's `areas` keys, in display order.
export const AREAS: readonly AreaDef[] = [
  ['tasarim', 'Tasarım', 'fa-drafting-compass'],
  ['satinalma', 'Satın Alma', 'fa-cart-shopping'],
  ['kalite', 'Kalite', 'fa-clipboard-check'],
  ['planlama', 'Planlama', 'fa-calendar-days'],
  ['uretim', 'Üretim', 'fa-industry'],
  ['satis', 'Satış', 'fa-handshake'],
  ['diger', 'Diğer', 'fa-ellipsis'],
];

// users.Position.department_code → the area the reader wants first.
export const AREA_BY_DEPARTMENT: Record<string, string> = {
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

// There is no single "my approvals" page (the inbox API has no consumer); the
// general landing lists every pending-approval page.
export const APPROVALS_INBOX_URL = '/general/';

const FOR_YOU_LIMIT = 6;
const BRIEF_HIGHLIGHT_LIMIT = 5;
const BRIEF_COLLAPSE_AFTER = 3;
const FULL_COLLAPSE_AFTER = 8;

// ------------------------------------------------------------------ deep links

const enc = (value: unknown) => encodeURIComponent(String(value));

// REF.id is whatever the target page's query parameter expects (job_no,
// request_number, ncr_number, issue_number, offer_no, or a pk).
const REF_ROUTES: Record<string, (r: SummaryRef) => string | null> = {
  job: (r) => `/projects/project-tracking/?job_no=${enc(r.id)}`,
  topic: (r) =>
    r.job_no ? `/projects/project-tracking/?job_no=${enc(r.job_no)}&topic_id=${enc(r.id)}` : null,
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
  cnc: (r) => `/planning/cnc-cutting/cuts/?cut=${enc(r.id)}`,
  lc_session: (r) => `/planning/linear-cutting/cuts/?session=${enc(r.id)}`,
  statement: (r) => `/manufacturing/subcontracting/statements/?statement=${enc(r.id)}`,
  mpr: () => '/manufacturing/material-tracking/',
};

const REF_TYPE_LABELS: Record<string, string> = {
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

const isBlankId = (id: Id) => id === null || id === undefined || id === '';

/** Site-relative URL for a payload ref, or null when there is no page to open. */
export function refUrl(ref: unknown): string | null {
  if (!ref || typeof ref !== 'object') return null;
  const r = ref as SummaryRef;
  const build = r.type ? REF_ROUTES[r.type] : undefined;
  if (!build) return null;
  if (r.type !== 'mpr' && isBlankId(r.id)) return null;
  return build(r);
}

function refText(ref: SummaryRef): string {
  if (ref.label) return String(ref.label);
  const typeLabel = (ref.type && REF_TYPE_LABELS[ref.type]) || String(ref.type || '');
  if (isBlankId(ref.id)) return typeLabel;
  if (ref.type && READABLE_ID_TYPES.has(ref.type)) return String(ref.id);
  return `${typeLabel} #${ref.id}`;
}

function renderRef(ref: SummaryRef): string {
  const text = escapeHtml(refText(ref));
  const url = refUrl(ref);
  if (url) {
    return `<a class="ds-ref" href="${escapeHtml(url)}" data-ref-type="${escapeHtml(ref.type)}">${text}</a>`;
  }
  return `<span class="ds-ref-plain" data-ref-type="${escapeHtml(ref.type || '')}">${text}</span>`;
}

function renderRefs(refs: unknown): string {
  if (!Array.isArray(refs) || refs.length === 0) return '';
  return `<span class="ds-refs">${(refs as SummaryRef[]).map(renderRef).join('')}</span>`;
}

// ------------------------------------------------------------------ chips

function chip(text: string, color = 'grey', extraClass = ''): string {
  return `<span class="ds-chip ds-chip-${color}${extraClass ? ` ${extraClass}` : ''}">${escapeHtml(text)}</span>`;
}

const OUTCOME_META: Record<string, { label: string; color: string }> = {
  decided: { label: 'Karar', color: 'green' },
  question_open: { label: 'Soru açık', color: 'orange' },
  needs_action: { label: 'Aksiyon', color: 'red' },
  info: { label: '', color: 'grey' },
};

const TOPIC_TYPE_LABELS: Record<string, string> = {
  revision_request: 'Revizyon talebi',
  drawing_release: 'Çizim yayını',
  release_review: 'Yayın incelemesi',
  qc_review: 'Kalite kontrol',
  consultation: 'Danışma',
  sales_consult: 'Satış danışma',
};

const PRIORITY_META: Record<string, { label: string; color: string }> = {
  high: { label: 'Yüksek', color: 'orange' },
  urgent: { label: 'Acil', color: 'red' },
  critical: { label: 'Kritik', color: 'red' },
};

const JOB_KIND_LABELS: Record<string, string> = { child: 'Alt iş emri', phase: 'Faz' };

// Stat key → [label, color, always shown]. Order is display order.
const STAT_META: readonly (readonly [string, string, string, boolean])[] = [
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

function statNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Stat chips: the three headline counts always, everything else only when
 * non-zero. Child job orders ride along on the "iş emri" chip.
 */
export function renderStatChips(stats: unknown, { limit = 0 }: { limit?: number } = {}): string {
  const s = obj<Record<string, unknown>>(stats);
  const chips: string[] = [];
  for (const [key, label, color, always] of STAT_META) {
    const value = statNumber(s[key]);
    if (!always && value <= 0) continue;
    let text = `${numberFmt.format(value)} ${label}`;
    if (key === 'new_jobs_root') {
      const child = statNumber(s.new_jobs_child);
      if (child > 0) text += ` (+${numberFmt.format(child)} alt)`;
    }
    chips.push(
      `<span class="ds-stat ds-chip ds-chip-${color}" data-stat="${key}">${escapeHtml(text)}</span>`,
    );
    if (limit && chips.length >= limit) break;
  }
  return chips.length ? `<div class="ds-stats">${chips.join('')}</div>` : '';
}

// The four numbers the brief layer leads with. Always rendered, zeros included:
// a row of tiles that appears and disappears reads as broken, not as calm.
const KPI_META: readonly (readonly [string, string, (s: Record<string, unknown>) => number])[] = [
  ['jobs', 'iş emri', (s) => statNumber(s.new_jobs_root) + statNumber(s.new_jobs_child)],
  ['topics', 'tartışma', (s) => statNumber(s.topics_new)],
  ['comments', 'yorum', (s) => statNumber(s.comments)],
  ['tasks', 'tamamlanan görev', (s) => statNumber(s.tasks_completed)],
];

/** Four KPI tiles: iş emri (root + child), tartışma, yorum, tamamlanan görev. */
export function renderKpiTiles(stats: unknown): string {
  const s = obj<Record<string, unknown>>(stats);
  const tiles = KPI_META.map(
    ([key, label, get]) =>
      `<div class="ds-kpi" data-kpi="${key}">` +
      `<div class="ds-kpi-num">${escapeHtml(numberFmt.format(get(s)))}</div>` +
      `<div class="ds-kpi-label">${escapeHtml(label)}</div>` +
      '</div>',
  );
  return `<div class="ds-kpis">${tiles.join('')}</div>`;
}

// ------------------------------------------------------------------ lists

// Long lists show the first `collapseAfter` rows and a "Tümünü göster (N)"
// toggle; bindDailySummaryInteractions() wires the toggle by delegation.
function collapsibleList(
  itemsHtml: string[],
  collapseAfter: number,
  listClass = 'ds-list',
): string {
  const total = itemsHtml.length;
  if (total === 0) return '';
  if (!collapseAfter || total <= collapseAfter) {
    return `<ul class="${listClass}">${itemsHtml.join('')}</ul>`;
  }
  const head = itemsHtml.slice(0, collapseAfter).join('');
  const tail = itemsHtml.slice(collapseAfter).join('');
  return (
    `<div class="ds-collapsible" data-ds-total="${total}">` +
    `<ul class="${listClass}">${head}</ul>` +
    `<ul class="${listClass} ds-more" hidden>${tail}</ul>` +
    `<button type="button" class="ds-more-btn" data-ds-toggle="1" aria-expanded="false">` +
    `Tümünü göster (${total})</button>` +
    '</div>'
  );
}

// Bold lead-in for a highlight: the first clause up to a ':' or ';' that is
// followed by whitespace (so "05:20" never splits), else the first six words.
// Returns null when the sentence is too short for a split to help.
const LEAD_CLAUSE = /^([^:;]{2,90}[:;])\s+(\S[\s\S]*)$/;
const LEAD_WORDS = 6;

export function splitLeadIn(text: unknown): [string, string] | null {
  const t = String(text || '').trim();
  if (!t) return null;
  const m = LEAD_CLAUSE.exec(t);
  if (m) return [m[1] ?? '', m[2] ?? ''];
  const words = t.split(/\s+/);
  if (words.length < LEAD_WORDS + 3) return null;
  return [words.slice(0, LEAD_WORDS).join(' '), words.slice(LEAD_WORDS).join(' ')];
}

function renderItemText(text: unknown, leadIn: boolean): string {
  const split = leadIn ? splitLeadIn(text) : null;
  if (!split) return `<span class="ds-item-text">${escapeHtml(text || '')}</span>`;
  return `<span class="ds-item-text"><strong class="ds-lead">${escapeHtml(split[0])}</strong> ${escapeHtml(split[1])}</span>`;
}

function renderItem(item: SummaryItem, { leadIn = false }: { leadIn?: boolean } = {}): string {
  if (!item || typeof item !== 'object') return '';
  const kind = escapeHtml(item.kind || '');
  return (
    `<li class="ds-item" data-kind="${kind}">` +
    renderItemText(item.text, leadIn) +
    renderRefs(item.refs) +
    '</li>'
  );
}

function validItems(items: unknown): SummaryItem[] {
  return list<SummaryItem>(items).filter((it) => it && (it.text || (it.refs && it.refs.length)));
}

function renderItems(items: unknown, collapseAfter: number, opts?: { leadIn?: boolean }): string {
  return collapsibleList(
    validItems(items).map((it) => renderItem(it, opts)),
    collapseAfter,
  );
}

function sectionTitle(icon: string, text: string, count?: number): string {
  const badge = count ? ` <span class="ds-count">${escapeHtml(String(count))}</span>` : '';
  return `<div class="ds-section-title"><i class="fas ${icon}"></i> ${escapeHtml(text)}${badge}</div>`;
}

function renderHighlights(
  items: SummaryItem[],
  {
    title = 'Öne çıkanlar',
    leadIn = false,
    extraClass = '',
  }: { title?: string; leadIn?: boolean; extraClass?: string } = {},
): string {
  if (!items.length) return '';
  const listHtml = collapsibleList(
    items.map((it) => renderItem(it, { leadIn })),
    0,
  );
  return (
    `<section class="ds-section ds-section-highlights${extraClass ? ` ${extraClass}` : ''}">` +
    sectionTitle('fa-star', title) +
    listHtml +
    '</section>'
  );
}

// ------------------------------------------------------------------ job orders

function renderJobRow(job: SummaryJob, { showKind = false }: { showKind?: boolean } = {}): string {
  if (!job || !job.job_no) return '';
  const parts = [renderRef({ type: 'job', id: job.job_no })];
  if (job.title) parts.push(`<span class="ds-job-title">${escapeHtml(job.title)}</span>`);
  if (job.customer) parts.push(`<span class="ds-muted">· ${escapeHtml(job.customer)}</span>`);
  if (showKind && job.kind && job.kind !== 'root') {
    parts.push(chip(JOB_KIND_LABELS[job.kind] || job.kind, 'grey'));
    if (job.parent_job_no)
      parts.push(`<span class="ds-muted">← ${escapeHtml(job.parent_job_no)}</span>`);
  }
  if (job.offer_no) {
    parts.push(
      `<span class="ds-muted">Teklif</span>${renderRef({ type: 'offer', id: job.offer_no })}`,
    );
  }
  return `<li class="ds-item ds-job">${parts.join(' ')}</li>`;
}

function renderJobGroup(
  label: string,
  icon: string,
  jobs: unknown,
  collapseAfter: number,
  opts?: { showKind?: boolean },
): string {
  const rows = list<SummaryJob>(jobs)
    .map((j) => renderJobRow(j, opts))
    .filter(Boolean);
  if (rows.length === 0) return '';
  return (
    `<div class="ds-subsection">` +
    `<div class="ds-subtitle"><i class="fas ${icon}"></i> ${escapeHtml(label)} <span class="ds-count">${rows.length}</span></div>` +
    collapsibleList(rows, collapseAfter) +
    '</div>'
  );
}

function renderJobOrders(jobOrders: unknown, collapseAfter: number): string {
  const jo = obj<JobOrders>(jobOrders);
  const groups = [
    renderJobGroup('Yeni açılan', 'fa-plus', jo.new, collapseAfter, { showKind: true }),
    renderJobGroup('Tamamlanan', 'fa-check', jo.completed, collapseAfter),
    renderJobGroup('Başlayan', 'fa-play', jo.started, collapseAfter),
  ].filter(Boolean);
  if (groups.length === 0) return '';
  return `<section class="ds-section ds-section-jobs">${sectionTitle('fa-briefcase', 'İş Emirleri')}${groups.join('')}</section>`;
}

// ------------------------------------------------------------------ discussions

function topicTitleHtml(topic: SummaryTopic): string {
  const title = topic.title || 'Başlıksız konu';
  const url = refUrl({ type: 'topic', id: topic.topic_id, job_no: topic.job_no });
  return url
    ? `<a class="ds-topic-title" href="${escapeHtml(url)}">${escapeHtml(title)}</a>`
    : `<span class="ds-topic-title">${escapeHtml(title)}</span>`;
}

function renderDiscussion(topic: SummaryTopic): string {
  if (!topic || typeof topic !== 'object') return '';
  const head: string[] = [];
  if (topic.job_no) head.push(renderRef({ type: 'job', id: topic.job_no }));
  head.push(topicTitleHtml(topic));

  const chips: string[] = [];
  if (topic.is_new) chips.push(chip('Yeni', 'blue'));
  const typeLabel = topic.type ? TOPIC_TYPE_LABELS[topic.type] : undefined;
  if (typeLabel) chips.push(chip(typeLabel, 'purple'));
  const prio = topic.priority ? PRIORITY_META[topic.priority] : undefined;
  if (prio) chips.push(chip(prio.label, prio.color));
  const comments = statNumber(topic.comment_count);
  if (comments > 0) chips.push(chip(`${comments} yorum`, 'grey'));
  const outcome = topic.outcome ? OUTCOME_META[topic.outcome] : undefined;
  if (outcome && outcome.label) chips.push(chip(outcome.label, outcome.color, 'ds-outcome'));

  const gist = topic.gist ? `<div class="ds-gist">${escapeHtml(topic.gist)}</div>` : '';
  return (
    `<li class="ds-item ds-topic" data-topic-id="${escapeHtml(String(topic.topic_id ?? ''))}">` +
    `<div class="ds-topic-head">${head.join(' ')}${chips.length ? `<span class="ds-topic-chips">${chips.join('')}</span>` : ''}</div>` +
    gist +
    '</li>'
  );
}

function renderDiscussions(
  discussions: unknown,
  omittedTopics: number,
  collapseAfter: number,
): string {
  const rows = list<SummaryTopic>(discussions).map(renderDiscussion).filter(Boolean);
  if (rows.length === 0 && !omittedTopics) return '';
  const omitted = omittedTopics
    ? `<div class="ds-omitted">+${escapeHtml(String(omittedTopics))} konu daha (özet dışında)</div>`
    : '';
  return (
    `<section class="ds-section ds-section-discussions">` +
    sectionTitle('fa-comments', 'Tartışmalar', rows.length) +
    collapsibleList(rows, collapseAfter) +
    omitted +
    '</section>'
  );
}

// ------------------------------------------------------------------ areas

/** Area keys with the reader's own department first, then the default order. */
export function areaOrderFor(departmentCode: string | null | undefined): string[] {
  const order = AREAS.map((a) => a[0]);
  const first = AREA_BY_DEPARTMENT[String(departmentCode || '').toLowerCase()];
  if (!first) return order;
  return [first, ...order.filter((k) => k !== first)];
}

// AREAS in the caller's order; unknown keys ignored, missing keys appended.
function orderedAreas(areaOrder: string[] | null | undefined): readonly AreaDef[] {
  if (!Array.isArray(areaOrder) || areaOrder.length === 0) return AREAS;
  const byKey = new Map(AREAS.map((a) => [a[0], a]));
  const out: AreaDef[] = [];
  for (const key of areaOrder) {
    const area = byKey.get(key);
    if (area && !out.includes(area)) out.push(area);
  }
  for (const area of AREAS) if (!out.includes(area)) out.push(area);
  return out;
}

function renderArea(
  [key, label, icon]: AreaDef,
  area: unknown,
  omittedLines: number,
  collapseAfter: number,
  { accordion = false }: { accordion?: boolean } = {},
): string {
  const a = obj<SummaryArea>(area);
  const lines = list<SummaryItem>(a.lines);
  const note = a.note ? String(a.note) : '';
  if (!note && lines.length === 0 && !omittedLines) return '';
  const noteHtml = note ? `<p class="ds-area-note">${escapeHtml(note)}</p>` : '';
  const omitted = omittedLines
    ? `<div class="ds-omitted">+${escapeHtml(String(omittedLines))} satır daha</div>`
    : '';
  if (!accordion) {
    return (
      `<section class="ds-section ds-area" data-area="${escapeHtml(key)}">` +
      sectionTitle(icon, label, lines.length) +
      noteHtml +
      renderItems(lines, collapseAfter) +
      omitted +
      '</section>'
    );
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
// so rendering it leaks nothing.
function forYouSets(forYou: unknown) {
  if (!forYou || typeof forYou !== 'object') return null;
  const fy = forYou as ForYou;
  const topicIds = new Set(list(fy.topic_ids).map((v) => String(v)));
  const jobNos = new Set(list(fy.job_nos).map((v) => String(v)));
  const pending = statNumber(fy.pending_approvals);
  if (!topicIds.size && !jobNos.size && pending <= 0) return null;
  return { topicIds, jobNos, pending };
}

function refsTouchJobs(refs: unknown, jobNos: Set<string>): boolean {
  if (!Array.isArray(refs)) return false;
  return (refs as SummaryRef[]).some(
    (r) =>
      r &&
      typeof r === 'object' &&
      ((r.type === 'job' && jobNos.has(String(r.id))) ||
        (!!r.job_no && jobNos.has(String(r.job_no)))),
  );
}

const FOR_YOU_JOB_GROUPS = [
  ['new', 'yeni açıldı'],
  ['completed', 'tamamlandı'],
  ['started', 'başladı'],
] as const;

/**
 * Items about the reader: pending approvals, their discussions, their job
 * orders, area lines that reference their job orders. Capped; '' when empty
 * or when the row carries no `for_you` (older backend, analytics rows).
 */
export function renderForYou(
  summary: unknown,
  { forYou, limit = FOR_YOU_LIMIT }: { forYou?: unknown; limit?: number } = {},
): string {
  const s = obj<SummaryLike>(summary);
  const sets = forYouSets(forYou === undefined ? s.for_you : forYou);
  if (!sets) return '';
  const payload = obj<SummaryPayload>(s.payload);
  const items: string[] = [];

  if (sets.pending > 0) {
    const text = `Onayınızı bekleyen ${numberFmt.format(sets.pending)} talep`;
    items.push(
      `<li class="ds-item ds-fy ds-fy-approvals"><i class="fas fa-check-double ds-fy-icon"></i>` +
        `<a class="ds-fy-link" href="${APPROVALS_INBOX_URL}">${escapeHtml(text)}</a></li>`,
    );
  }

  for (const topic of list<SummaryTopic>(payload.discussions)) {
    if (!topic || !sets.topicIds.has(String(topic.topic_id))) continue;
    const head: string[] = [];
    if (topic.job_no) head.push(renderRef({ type: 'job', id: topic.job_no }));
    head.push(topicTitleHtml(topic));
    const gist = topic.gist ? `<div class="ds-gist">${escapeHtml(topic.gist)}</div>` : '';
    items.push(
      `<li class="ds-item ds-fy ds-fy-topic" data-topic-id="${escapeHtml(String(topic.topic_id ?? ''))}">` +
        `<i class="fas fa-comments ds-fy-icon"></i><span class="ds-fy-main">${head.join(' ')}</span>${gist}</li>`,
    );
  }

  const jo = obj<JobOrders>(payload.job_orders);
  const seenJobs = new Set<string>();
  for (const [group, label] of FOR_YOU_JOB_GROUPS) {
    for (const job of list<SummaryJob>(jo[group])) {
      if (
        !job ||
        !job.job_no ||
        !sets.jobNos.has(String(job.job_no)) ||
        seenJobs.has(String(job.job_no))
      )
        continue;
      seenJobs.add(String(job.job_no));
      const title = job.title ? ` <span class="ds-job-title">${escapeHtml(job.title)}</span>` : '';
      items.push(
        `<li class="ds-item ds-fy ds-fy-job" data-group="${group}"><i class="fas fa-briefcase ds-fy-icon"></i>` +
          `${renderRef({ type: 'job', id: job.job_no })}${title} <span class="ds-muted">· ${escapeHtml(label)}</span></li>`,
      );
    }
  }

  const areas = obj<Record<string, SummaryArea>>(payload.areas);
  const seenText = new Set<string>();
  for (const [key, , icon] of AREAS) {
    for (const line of list<SummaryItem>(areas[key]?.lines)) {
      if (!line || typeof line !== 'object' || !refsTouchJobs(line.refs, sets.jobNos)) continue;
      const text = String(line.text || '').trim();
      if (!text || seenText.has(text)) continue;
      seenText.add(text);
      items.push(
        `<li class="ds-item ds-fy ds-fy-line" data-fy-area="${escapeHtml(key)}"><i class="fas ${icon} ds-fy-icon"></i>` +
          `<span class="ds-item-text">${escapeHtml(text)}</span>${renderRefs(line.refs)}</li>`,
      );
    }
  }

  if (!items.length) return '';
  const shown = limit ? items.slice(0, limit) : items;
  const more = items.length - shown.length;
  return (
    `<section class="ds-section ds-foryou">` +
    sectionTitle('fa-user-check', 'Sizinle ilgili') +
    `<ul class="ds-list">${shown.join('')}</ul>` +
    (more > 0 ? `<div class="ds-omitted">+${more} kayıt daha aşağıda</div>` : '') +
    '</section>'
  );
}

// ------------------------------------------------------------------ main render

export interface RenderOptions {
  /** 'full' (default) or 'brief' (hero, KPI tiles, ≤5 highlights, "Tümünü gör"). */
  layer?: 'full' | 'brief';
  /** Area keys in display order (see areaOrderFor). */
  areaOrder?: string[] | null;
  /** Override for summary.for_you (null hides the block). */
  forYou?: unknown;
  /** Areas as click-to-open headers (default: brief only). */
  accordion?: boolean;
  /** Highlights shown before the fold (default 5 brief, all full). */
  highlightLimit?: number;
  /** Bold lead-in on highlights (default: brief only). */
  leadIn?: boolean;
  /** List fold size (default 3 brief, 8 full). */
  collapseAfter?: number;
  /** Tighter spacing; hides the stat chips unless `showStats` says otherwise. */
  compact?: boolean;
  showStats?: boolean;
}

/** The summary body as an HTML string; every payload string is escaped. */
export function renderDailySummary(summary: unknown, options: RenderOptions = {}): string {
  if (!summary || typeof summary !== 'object') return '';
  const sm = summary as SummaryLike;
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
  const fold =
    collapseAfter === undefined
      ? brief
        ? BRIEF_COLLAPSE_AFTER
        : FULL_COLLAPSE_AFTER
      : collapseAfter;
  const useAccordion = accordion === undefined ? brief : !!accordion;
  const hlLimit =
    highlightLimit === undefined ? (brief ? BRIEF_HIGHLIGHT_LIMIT : 0) : highlightLimit;
  const useLead = leadIn === undefined ? brief : !!leadIn;

  const payload = obj<SummaryPayload>(sm.payload);
  const stats = payload.stats && typeof payload.stats === 'object' ? payload.stats : sm.stats || {};
  const headline = payload.headline || sm.headline || '';
  const omitted = obj<NonNullable<SummaryPayload['omitted']>>(payload.omitted);
  const omittedLines = obj<Record<string, unknown>>(omitted.lines);
  const areas = obj<Record<string, SummaryArea>>(payload.areas);

  const forYouHtml = renderForYou(summary, { forYou });
  const hlItems = validItems(payload.highlights);
  const hlShown = hlLimit ? hlItems.slice(0, hlLimit) : hlItems;
  const hlRest = hlLimit ? hlItems.slice(hlLimit) : [];
  const highlights = renderHighlights(hlShown, { leadIn: useLead });

  const detail = [
    renderHighlights(hlRest, {
      title: 'Öne çıkanlar (devamı)',
      leadIn: useLead,
      extraClass: 'ds-section-highlights-more',
    }),
    renderJobOrders(payload.job_orders, fold),
    renderDiscussions(payload.discussions, statNumber(omitted.topics), fold),
    ...orderedAreas(areaOrder).map((area) =>
      renderArea(area, areas[area[0]], statNumber(omittedLines[area[0]]), fold, {
        accordion: useAccordion,
      }),
    ),
  ]
    .filter(Boolean)
    .join('');

  if (!headline && !forYouHtml && !highlights && !detail) {
    // `empty` days and payload-less rows: zero chips would only add noise.
    return '<div class="ds-root ds-empty"><div class="ds-muted">Bu dönemde kayda değer bir hareket yok.</div></div>';
  }
  const idAttr = `data-summary-id="${escapeHtml(String(sm.id ?? ''))}"`;

  if (brief) {
    const detailId = `ds-detail-${escapeHtml(String(sm.id ?? 'x'))}`;
    const head =
      (headline ? `<p class="ds-headline ds-hero">${escapeHtml(headline)}</p>` : '') +
      renderKpiTiles(stats);
    const reveal = detail
      ? `<div class="ds-reveal"><button type="button" class="ds-reveal-btn" data-ds-reveal="1" aria-expanded="false" aria-controls="${detailId}">` +
        '<i class="fas fa-list-ul me-1"></i>Tümünü gör</button></div>' +
        `<div class="ds-detail" id="${detailId}" hidden>${detail}</div>`
      : '';
    return `<div class="ds-root ds-brief" ${idAttr}>${head}${forYouHtml}${highlights}${reveal}</div>`;
  }

  const withStats = showStats === undefined ? !compact : !!showStats;
  const head =
    (headline ? `<p class="ds-headline">${escapeHtml(headline)}</p>` : '') +
    (withStats ? renderStatChips(stats) : '');
  return `<div class="ds-root${compact ? ' ds-compact' : ''}" ${idAttr}>${head}${forYouHtml}${highlights}${detail}</div>`;
}

/**
 * Wire the toggles inside `container` (idempotent): "Tümünü göster (N)" list
 * folds, the brief layer's "Tümünü gör" reveal (one-way; `onReveal` fires
 * once) and the area accordion headers.
 */
export function bindDailySummaryInteractions(
  container: HTMLElement | null,
  { onReveal = null }: { onReveal?: (() => void) | null } = {},
): void {
  if (!container || container.dataset.dsBound === '1') return;
  container.dataset.dsBound = '1';
  container.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const reveal = target.closest('[data-ds-reveal]');
    if (reveal && container.contains(reveal)) {
      event.preventDefault();
      const root = reveal.closest('.ds-root') || container;
      const detail = root.querySelector('.ds-detail');
      if (detail) detail.removeAttribute('hidden');
      reveal.setAttribute('aria-expanded', 'true');
      (reveal.closest('.ds-reveal') || reveal).setAttribute('hidden', '');
      if (typeof onReveal === 'function') {
        try {
          onReveal();
        } catch (error) {
          console.warn('Daily summary onReveal failed:', error);
        }
      }
      return;
    }
    const areaBtn = target.closest('[data-ds-area-toggle]');
    if (areaBtn && container.contains(areaBtn)) {
      event.preventDefault();
      const section = areaBtn.closest('.ds-area');
      const body = section && section.querySelector('.ds-area-body');
      if (!section || !body) return;
      const open = body.hasAttribute('hidden');
      if (open) body.removeAttribute('hidden');
      else body.setAttribute('hidden', '');
      areaBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      section.classList.toggle('ds-area-open', open);
      return;
    }
    const btn = target.closest('[data-ds-toggle]');
    if (!btn || !container.contains(btn)) return;
    event.preventDefault();
    const wrap = btn.closest<HTMLElement>('.ds-collapsible');
    const more = wrap && wrap.querySelector('.ds-more');
    if (!wrap || !more) return;
    const expanded = more.hasAttribute('hidden');
    if (expanded) more.removeAttribute('hidden');
    else more.setAttribute('hidden', '');
    btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    btn.textContent = expanded ? 'Daha az göster' : `Tümünü göster (${wrap.dataset.dsTotal || ''})`;
  });
}

// ------------------------------------------------------------------ dates

const dayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const shortFmt = new Intl.DateTimeFormat('tr-TR', {
  timeZone: TZ,
  day: 'numeric',
  month: 'short',
  weekday: 'short',
});
const rangeFmt = new Intl.DateTimeFormat('tr-TR', {
  timeZone: TZ,
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const longFmt = new Intl.DateTimeFormat('tr-TR', {
  timeZone: TZ,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  weekday: 'long',
});

/** Istanbul calendar date as YYYY-MM-DD. */
export function istanbulDate(date: Date = new Date()): string {
  return dayFmt.format(date);
}

// 'YYYY-MM-DD' → Date at Istanbul noon, so Intl formatting never crosses midnight.
function parseLocalDate(dateStr: unknown): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ''));
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 9, 0, 0));
}

/** Whole days between an Istanbul date string and today (positive = past). */
export function daysSince(dateStr: string | null | undefined, now: Date = new Date()): number {
  const then = parseLocalDate(dateStr);
  const today = parseLocalDate(istanbulDate(now));
  if (!then || !today) return 0;
  return Math.round((today.getTime() - then.getTime()) / 86400000);
}

/** 'Bugün' / 'Dün' / '22 Eyl Sal'. */
export function relativeDayLabel(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  if (!d) return '';
  const diff = daysSince(dateStr);
  if (diff === 0) return 'Bugün';
  if (diff === 1) return 'Dün';
  return shortFmt.format(d);
}

/** '22 Eylül 2026 Salı'. */
export function formatSummaryDate(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return d ? longFmt.format(d) : '';
}

/** '19 Eyl 05:20 – 22 Eyl 05:20' (payload label when present; list rows have none). */
export function formatWindowLabel(summary: unknown): string {
  if (!summary || typeof summary !== 'object') return '';
  const s = summary as SummaryLike;
  const label = s.payload?.window?.label;
  if (label) return String(label);
  const start = s.window_start ? new Date(s.window_start) : null;
  const end = s.window_end ? new Date(s.window_end) : null;
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '';
  return `${rangeFmt.format(start)} – ${rangeFmt.format(end)}`;
}

// ------------------------------------------------------------------ user / seen state

interface CachedUser {
  id?: number | string | null;
  department_code?: string | null;
  position?: { department_code?: string | null } | null;
}

function cachedUser(): CachedUser | null {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null') as CachedUser | null;
  } catch {
    return null;
  }
}

/** Id of the logged-in user from the cached `user` record, or null. */
export function currentUserId(): number | string | null {
  const id = cachedUser()?.id;
  return id === null || id === undefined ? null : id;
}

/** Department code of the logged-in user (position first), or null. */
export function currentDepartmentCode(): string | null {
  const user = cachedUser();
  return (user && (user.position?.department_code || user.department_code)) || null;
}

/** A regenerated summary (new generated_at) counts as unseen again. */
export function seenValue(summary: unknown): string {
  const s = obj<SummaryLike>(summary);
  return `${s.id ?? ''}:${s.generated_at ?? ''}`;
}

export function getSeen(uid: number | string): string {
  try {
    return localStorage.getItem(`ds:seen:${uid}`) || '';
  } catch {
    return '';
  }
}

export function setSeen(uid: number | string, value: string): void {
  try {
    localStorage.setItem(`ds:seen:${uid}`, String(value));
  } catch {
    // Private mode / quota: the server-side read record still applies.
  }
}

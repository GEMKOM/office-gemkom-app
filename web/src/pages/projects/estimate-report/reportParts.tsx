import { createContext, Fragment, useContext, type ReactNode } from 'react';
import { REFERENCE_ROUTE, SCHEMA_LABELS, SOURCE_LABELS } from '@/api/projects/estimator';
import { Markdown } from './Markdown';
import { fmt, type Payload } from './reportModel';

// The small pieces of the Tahmin report view (port of the helpers of the
// legacy components/estimate-report/report-view.js). The markup and class
// names are the legacy ones, so EstimateReport.module.css styles them as before.

export const COST_ROW_LABELS: Record<string, string> = {
  material: 'Malzeme',
  labor: 'Atölye İşçiliği',
  machining_labor: 'Talaşlı İşçilik',
  cnc_labor: 'CNC Kesim İşçiliği',
  employee_overhead: 'Personel Genel Giderleri',
  subcontractor: 'Taşeron',
  paint: 'Boya',
  paint_material: 'Boya Malzemesi',
  general_expenses: 'Genel Giderler',
  qc: 'Kalite Kontrol',
  shipping: 'Sevkiyat',
  machine_rental: 'Makine Kirası',
  other: 'Diğer',
  total: 'TOPLAM',
  eur_per_kg: '€/kg',
};

/** Rows GEMKOM always does itself: the same amount in both routes (subcontractors do no machining or CNC cutting). */
export const SAME_IN_BOTH_ROUTES = ['machining_labor', 'cnc_labor'];

/** A cost-table row's label; reports from before 2026-10-21 have a single "İşçilik" row (all centres) and keep that name. */
export function costRowLabel(row: { key?: string; label?: string }): string {
  if (row.key === 'labor' && row.label === 'İşçilik') return 'İşçilik';
  return COST_ROW_LABELS[row.key ?? ''] || row.label || row.key || '';
}

export const JOINT_TYPE_LABELS: Record<string, string> = {
  pipe_butt: 'Boru alın',
  pipe_to_cap: 'Boru–kep',
  pipe_to_elbow: 'Boru–dirsek',
  pipe_to_plate: 'Boru–sac',
  plate_fillet: 'Sac köşe',
  plate_butt: 'Sac alın',
  stitch_fillet: 'Aralıklı köşe',
  pin_to_plate: 'Pim–sac',
  nozzle_coupling: 'Nozul/manşon',
  other: 'Diğer',
};
export const MATERIAL_LABELS: Record<string, string> = {
  copper: 'Bakır',
  carbon_steel: 'Çelik',
  stainless: 'Paslanmaz',
  copper_to_steel: 'Cu–çelik',
  other: 'Diğer',
};

export const ROUTE_LABELS: Record<string, string> = { in_house: 'İç imalat', subcontract: 'Taşeron' };

// Weld process codes of the extraction schema (estimator weld_extraction.JointSchema).
export const PROCESS_LABELS: Record<string, string> = {
  TIG_root_fill: 'TIG kök + TIG dolgu',
  TIG_root_MAG_fill: 'TIG kök + MAG dolgu',
  MAG: 'MAG',
  TIG_copper: 'TIG (bakır)',
  other: 'Diğer',
};
export function processLabel(code: unknown): string {
  return PROCESS_LABELS[String(code ?? '')] || String(code || '').replace(/_/g, ' ');
}

export interface SectionDef {
  key: string;
  label: string;
  icon: string;
}

/** The sections of a done report, in page order (nav order). */
export const SECTION_DEFS: SectionDef[] = [
  { key: 'ozet', label: 'Özet', icon: 'fa-gauge-high' },
  { key: 'maliyet', label: 'Maliyet', icon: 'fa-table-list' },
  { key: 'malzeme', label: 'Malzeme', icon: 'fa-cubes' },
  { key: 'iscilik', label: 'İşçilik', icon: 'fa-user-gear' },
  { key: 'benzer', label: 'Benzer işler', icon: 'fa-clone' },
  { key: 'haric', label: 'Hariç tutma', icon: 'fa-ban' },
  { key: 'teklif', label: 'Teklif', icon: 'fa-handshake' },
  { key: 'dikkat', label: 'Dikkat', icon: 'fa-circle-exclamation' },
  { key: 'sorular', label: 'Sorular', icon: 'fa-list-check' },
  { key: 'kaynak', label: 'Kaynak listesi', icon: 'fa-fire-flame-curved' },
  { key: 'metin', label: 'Rapor metni', icon: 'fa-file-lines' },
  { key: 'girdiler', label: 'Girdiler', icon: 'fa-circle-info' },
];

/** Sections closed until the viewer opens them (per-viewer choice is remembered). */
export const DEFAULT_COLLAPSED = ['metin', 'girdiler', 'yontem'];

/** Work-centre colours of the share bars: purple / blue / green / grey / dark purple, never yellow. */
export const CENTRE_COLOURS: Record<string, string> = { shop: '#a78bfa', mach: '#60a5fa', cnc: '#34d399', bend: '#9ca3af', qc: '#7c3aed' };

export function centreColour(key: string): string {
  return CENTRE_COLOURS[key] || '#a78bfa';
}

// ---------------------------------------------------------------- formatting

export function money(value: unknown, digits = 0): string {
  return value == null || Number.isNaN(Number(value)) ? '—' : `${fmt(value, digits)} €`;
}

export function pct(value: unknown, digits = 0): string {
  return value == null || Number.isNaN(Number(value)) ? '—' : `%${fmt(Number(value) * 100, digits)}`;
}

export function formatDateTime(value: unknown): string {
  if (!value) return '';
  return new Date(value as string).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Run time in whole minutes (at least 1), from the timestamps or the usage seconds; null when unknown. */
export function runMinutes(r: Payload): number | null {
  if (r.started_at && r.finished_at) {
    const ms = new Date(r.finished_at).getTime() - new Date(r.started_at).getTime();
    if (ms > 0) return Math.max(1, Math.round(ms / 60000));
  }
  const s = (Number(r.usage?.report?.seconds) || 0) + (Number(r.usage?.extraction?.seconds) || 0);
  return s ? Math.max(1, Math.round(s / 60)) : null;
}

/** Joins nodes with a separator (the legacy `.join(' · ')` of HTML pieces). */
export function joinNodes(nodes: ReactNode[], sep: ReactNode): ReactNode[] {
  return nodes.map((n, i) => (
    <Fragment key={i}>
      {i > 0 ? sep : null}
      {n}
    </Fragment>
  ));
}

// ---------------------------------------------------------------- badges and cells

export function Muted({ children = '—' }: { children?: ReactNode }) {
  return <span className="est-muted">{children}</span>;
}

/** A badges.css status pill: `cls` is "status-green" (+ "est-badge-sm" …). */
export function Badge({ cls, title, children }: { cls: string; title?: string; children: ReactNode }) {
  return (
    <span className={`status-badge ${cls}`} title={title || undefined}>
      {children}
    </span>
  );
}

/** Weld-list confidence (0–1) as a percentage badge: < 0,4 orange, 0,4–0,5 grey, ≥ 0,5 green (as on Referanslar). */
export function ConfidencePill({ value }: { value: unknown }) {
  if (value == null || value === '') return <span className="est-muted">—</span>;
  const v = Number(value);
  const cls = v < 0.4 ? 'status-orange' : v < 0.5 ? 'status-grey' : 'status-green';
  return <Badge cls={cls}>%{fmt(v * 100, 0)}</Badge>;
}

export function FactorBadge({ f }: { f: number | null | undefined }) {
  if (f == null) return <span className="est-muted">—</span>;
  const ok = f >= 0.6 && f <= 1.6;
  return (
    <Badge cls={ok ? 'status-green' : 'status-orange'} title={ok ? 'Olağan aralıkta (0,6–1,6)' : 'Olağan aralığın (0,6–1,6) dışında'}>
      {fmt(f, 2)}
    </Badge>
  );
}

export function RouteBadge({ route }: { route: string | null | undefined }) {
  const r = REFERENCE_ROUTE[route ?? ''];
  return r ? <Badge cls={r.badge}>{r.label}</Badge> : <span className="est-muted">—</span>;
}

/** çizim (grey) / çıkarım (purple) / kural (orange): where a joint, part or feature came from. */
export function SourcePill({ source, small = true }: { source: unknown; small?: boolean }) {
  const s = SOURCE_LABELS[String(source ?? '')] || SOURCE_LABELS.drawn!;
  return (
    <span className={`status-badge ${s.badge}${small ? ' est-badge-sm' : ''}`} title={s.title}>
      {s.label}
    </span>
  );
}

/** "plan v2" (blue) / "v1 liste" (grey). */
export function SchemaPill({ version }: { version: unknown }) {
  const s = SCHEMA_LABELS[Number(version) >= 2 ? 2 : 1]!;
  return (
    <span className={`status-badge ${s.badge} est-badge-sm`} title={s.title}>
      {s.label}
    </span>
  );
}

/** A share bar (0–100 %) with its percentage; empty without a part. `colour` paints a work centre. */
export function ShareBar({ part, total, colour }: { part: unknown; total: number; colour?: string }) {
  if (!total || part == null || !Number(part)) return <span className="est-share is-empty" />;
  const p = Math.max(0, Math.min(1, Number(part) / total));
  return (
    <>
      <span className="est-share" title={`${fmt(p * 100, 1)}%`}>
        <span style={{ width: `${(p * 100).toFixed(1)}%`, ...(colour ? { background: colour } : null) }} />
      </span>
      <span className="est-share-num">{fmt(p * 100, 0)}%</span>
    </>
  );
}

export function SimilarityCell({ s }: { s: number | null | undefined }) {
  if (s == null) return <span className="est-muted">—</span>;
  const w = Math.max(4, Math.min(100, s * 100));
  return (
    <span className="est-sim">
      <span className="est-sim-bar">
        <span style={{ width: `${w.toFixed(0)}%` }} />
      </span>
      {fmt(s * 100, 0)}
    </span>
  );
}

export function JobLink({ no }: { no: string | null | undefined }) {
  if (!no) return null;
  return (
    <a href={`/projects/project-tracking/?job_no=${encodeURIComponent(no)}`} target="_blank" rel="noopener" className="est-job">
      {no}
    </a>
  );
}

/** "a, b, c" of job links; "—" when none. */
export function JobLinks({ nos }: { nos: string[] | null | undefined }) {
  const list = nos || [];
  if (!list.length) return <>—</>;
  return <>{joinNodes(list.map((no) => <JobLink key={no} no={no} />), ', ')}</>;
}

// ---------------------------------------------------------------- the card's view state and actions

/** The view state the sections read. */
export interface ReportView {
  uid: string;
  collapsed: ReadonlySet<string>;
  costRoute: string | null;
  similarAll: boolean;
  confOpen: boolean;
  weldOpen: boolean;
  /** The section nav: the highlighted section, whether it sticks, its sticky offset (px). */
  navActive: string;
  navStuck: boolean;
  navTop: number | null;
}

/** What the sections can ask the card to do (the legacy data-est-action / data-est-goto clicks). */
export interface ReportActions {
  toggle: (key: string) => void;
  goto: (key: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
  top: () => void;
  confHelp: () => void;
  similarAll: () => void;
  weldToggle: () => void;
  route: (route: string) => void;
  /** A request returned the updated report (an exclusion recomputed it): show it. */
  reportUpdated?: (report: Payload) => void;
}

const noop = () => {};

export interface ReportContextValue {
  view: ReportView;
  actions: ReportActions;
  /** "§2.2" → the key of the section that shows it, or null to leave it as text. */
  resolve: (num: string) => string | null;
}

export const ReportContext = createContext<ReportContextValue>({
  view: {
    uid: 'est',
    collapsed: new Set(),
    costRoute: null,
    similarAll: false,
    confOpen: false,
    weldOpen: false,
    navActive: 'ozet',
    navStuck: false,
    navTop: null,
  },
  actions: {
    toggle: noop,
    goto: noop,
    expandAll: noop,
    collapseAll: noop,
    top: noop,
    confHelp: noop,
    similarAll: noop,
    weldToggle: noop,
    route: noop,
  },
  resolve: () => null,
});

export function useReport(): ReportContextValue {
  return useContext(ReportContext);
}

// ---------------------------------------------------------------- markdown, decorated

const CITE = /\[([^\]\n]{2,160})\]/g;
const SREF = /§\s?(\d+(?:\.\d+)?)/g;

function srefNodes(text: string, resolve: ReportContextValue['resolve'], goto: (key: string) => void): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(SREF)) {
    const key = resolve(m[1]!);
    if (!key) continue;
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <button key={`s${m.index}`} type="button" className="est-sref" title="Bölüme git" onClick={() => goto(key)}>
        §{m[1]}
      </button>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Plain text, decorated: `[…]` citations become muted chips and `§2.2` references become jump buttons. */
export function Decorated({ text }: { text: string | null | undefined }) {
  const { resolve, actions } = useReport();
  const s = String(text ?? '');
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of s.matchAll(CITE)) {
    if (m.index > last) out.push(...srefNodes(s.slice(last, m.index), resolve, actions.goto));
    out.push(
      <span key={`c${m.index}`} className="est-cite">
        {srefNodes(m[1]!, resolve, actions.goto)}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(...srefNodes(s.slice(last), resolve, actions.goto));
  return <>{out.map((n, i) => (typeof n === 'string' ? <Fragment key={`t${i}`}>{n}</Fragment> : n))}</>;
}

const decorated = (text: string) => <Decorated text={text} />;

/** Report markdown (headings shifted by two), decorated; nothing when empty. */
export function Md({ text, className = '' }: { text: string | null | undefined; className?: string }) {
  if (!text || !String(text).trim()) return null;
  return (
    <div className={`est-md${className ? ` ${className}` : ''}`}>
      <Markdown source={text} headingOffset={2} renderText={decorated} />
    </div>
  );
}

/** Turns a split section back into markdown (its body + its sub-sections). */
export function sectionMarkdown(
  sec: { body?: string; subs?: { num: string | null; title: string; body: string }[] } | null | undefined,
  depth = 3,
): string {
  if (!sec) return '';
  const parts = [sec.body || ''];
  (sec.subs || []).forEach((s) => parts.push(`${'#'.repeat(depth)} ${s.num ? `${s.num} ` : ''}${s.title}\n\n${s.body}`));
  return parts.join('\n\n').trim();
}

export function bulletCount(text: unknown): number {
  return String(text || '')
    .split('\n')
    .filter((l) => /^\s{0,1}[-*•]\s+|^\s{0,1}\d+[.)]\s+/.test(l)).length;
}

// ---------------------------------------------------------------- section

export interface SectionProps {
  secKey: string;
  title: ReactNode;
  children: ReactNode;
  count?: number | null;
  sub?: ReactNode;
  tools?: ReactNode;
  icon?: string | null;
  /** Overrides the card's collapsed set (the report text with no headings is never tucked away). */
  collapsed?: boolean;
  onToggle?: () => void;
}

/** A collapsible section. */
export function Section({ secKey, title, children, count = null, sub, tools, icon = null, collapsed, onToggle }: SectionProps) {
  const { view, actions } = useReport();
  const closed = collapsed ?? view.collapsed.has(secKey);
  const ic = icon || SECTION_DEFS.find((d) => d.key === secKey)?.icon;
  return (
    <section className={`est-sec${closed ? ' is-collapsed' : ''}`} data-sec={secKey} id={`${view.uid}-sec-${secKey}`}>
      <header className="est-sec-head">
        <button
          type="button"
          className="est-sec-toggle"
          aria-expanded={closed ? 'false' : 'true'}
          onClick={onToggle ?? (() => actions.toggle(secKey))}
        >
          <i className="fas fa-chevron-down est-chevron" aria-hidden />
          {ic ? <i className={`fas ${ic} est-sec-icon`} aria-hidden /> : null}
          <span className="est-sec-title">{title}</span>
          {count != null ? <span className="est-sec-count">{count}</span> : null}
          {sub ? <span className="est-sec-sub">{sub}</span> : null}
        </button>
        {tools ? <div className="est-sec-tools">{tools}</div> : null}
      </header>
      <div className="est-sec-body">{children}</div>
    </section>
  );
}

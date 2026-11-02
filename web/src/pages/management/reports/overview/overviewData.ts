// Browser-side calculations of the overview report, kept as legacy
// management/reports/overview/overview.js does them (same parsing, same
// rounding, same top-10 rules). Pure, so they are unit-tested.
import type {
  ApiNumber,
  OverviewData,
  OverviewJobOrderCosts,
  OverviewMeta,
  OverviewProcurement,
  OverviewSales,
  OverviewSubcontracting,
  OverviewSubcontractorRow,
} from '@/api/reports/overview';
import { formatDate, formatNumber } from '@/lib/format';

/** Legacy pf: parseFloat, 0 when not a number. */
export function pf(value: unknown): number {
  const n = Number.parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

/** Legacy pfLocale: also reads "1.234,56" and "12,5" as the API sometimes sends them. */
export function pfLocale(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const s = String(value).trim();
  if (/^\d{1,3}(?:\.\d{3})*,\d+$/.test(s)) return pf(s.replace(/\./g, '').replace(',', '.'));
  if (/^\d+,\d+$/.test(s)) return pf(s.replace(',', '.'));
  return pf(s);
}

/** Legacy num(v, d): tr-TR with exactly d decimals; missing reads 0. */
export function num(value: unknown, decimals = 0): string {
  return formatNumber(pf(value), decimals);
}

/** Legacy numLocale(v, d). */
export function numLocale(value: unknown, decimals = 0): string {
  return formatNumber(pfLocale(value), decimals);
}

const EUR = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'EUR' });

/** Legacy eur(v): "€1.234,56"; missing reads €0,00. */
export function eur(value: unknown): string {
  return EUR.format(pf(value));
}

export interface Trend {
  diff: number;
  /** Percent change; null when the previous value is 0. */
  pct: number | null;
  dir: 'up' | 'down' | 'flat';
}

/** Legacy trendDir: change from previous to current. */
export function trendDir(current: unknown, previous: unknown): Trend {
  const c = pf(current);
  const p = pf(previous);
  const diff = c - p;
  const pct = p !== 0 ? (diff / Math.abs(p)) * 100 : null;
  return { diff, pct, dir: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat' };
}

// ---------------------------------------------------------------------------
// Labels

export const PRESET_OPTIONS = [
  { value: 'current_month', label: 'Bu Ay' },
  { value: 'last_3_months', label: 'Son 3 Ay' },
  { value: 'last_6_months', label: 'Son 6 Ay' },
  { value: 'last_year', label: 'Son 1 Yıl' },
  { value: 'all_time', label: 'Tüm Zamanlar' },
];

const PRESET_STRIP_LABELS: Record<string, string> = {
  current_month: 'Bu ay',
  last_3_months: 'Son 3 ay',
  last_6_months: 'Son 6 ay',
  last_year: 'Son 1 yıl',
  all_time: 'Tüm zamanlar',
};

const OVERTIME_TEAM_LABELS: Record<string, string> = {
  manufacturing: 'Üretim',
  planning: 'Planlama',
  qualitycontrol: 'Kalite kontrol',
  quality_control: 'Kalite kontrol',
};

export const JOB_ORDER_STATUS_LABELS: Record<string, string> = {
  draft: 'Taslak',
  active: 'Aktif',
  completed: 'Tamamlandı',
  on_hold: 'Beklemede',
  cancelled: 'İptal Edildi',
};

const SALES_CONSULT_DEPT_LABELS: Record<string, string> = {
  design: 'Tasarım',
  manufacturing: 'Üretim',
  planning: 'Planlama',
  procurement: 'Satın Alma',
  painting: 'Boya',
  logistics: 'Lojistik',
  maintenance: 'Bakım',
  finance: 'Finans',
  it: 'Bilgi İşlem',
  human_resources: 'İnsan Kaynakları',
  management: 'Yönetim',
  quality: 'Kalite',
  qualitycontrol: 'Kalite kontrol',
  quality_control: 'Kalite kontrol',
  welding: 'Kaynak',
  machining: 'Talaşlı',
  cnc: 'CNC',
  sales: 'Satış',
  marketing: 'Pazarlama',
};

export function salesConsultDeptLabel(key: string | null | undefined): string {
  if (key === null || key === undefined || key === '') return '';
  const raw = String(key).trim();
  const norm = raw.toLowerCase().replace(/\s+/g, '_');
  return SALES_CONSULT_DEPT_LABELS[norm] ?? SALES_CONSULT_DEPT_LABELS[raw] ?? raw;
}

export function overtimeTeamLabel(key: string | null | undefined): string {
  if (key === null || key === undefined || key === '') return '';
  const k = String(key).trim();
  return OVERTIME_TEAM_LABELS[k] ?? OVERTIME_TEAM_LABELS[k.toLowerCase()] ?? k;
}

// ---------------------------------------------------------------------------
// Period strip

/** Legacy ovReportDateLabel: "1 Eki 2026". */
export function reportDateLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  // A bare day is a local day (formatDate reads "YYYY-MM-DD" that way, as legacy's T12:00).
  return formatDate(String(iso).trim(), { day: 'numeric', month: 'short', year: 'numeric' });
}

export interface PeriodStrip {
  /** "1 Eki 2026 – 31 Eki 2026", the preset name, or '—'. */
  primary: string;
  /** The comparison period, when comparing. */
  previous: string | null;
}

/** Legacy overviewPeriodStripHtml; null means "Dönem bilgisi yok". */
export function periodStrip(meta: OverviewMeta | null | undefined): PeriodStrip | null {
  if (!meta || typeof meta !== 'object') return null;
  const { date_from: df, date_to: dt, prev_date_from: pFrom, prev_date_to: pTo } = meta;
  const cmp = meta.compare === true;
  const presetLabel = meta.preset ? (PRESET_STRIP_LABELS[meta.preset] ?? null) : null;
  let primary = '';
  if (df && dt) primary = `${reportDateLabel(df)} – ${reportDateLabel(dt)}`;
  else if (presetLabel) primary = presetLabel;
  const previous =
    cmp && pFrom && pTo ? `${reportDateLabel(pFrom)} – ${reportDateLabel(pTo)}` : null;
  if (!primary && !previous) return null;
  return { primary: primary || '—', previous };
}

// ---------------------------------------------------------------------------
// İş emirleri

export interface JobOrderCostSlices {
  labor: number;
  material: number;
  subcontractor: number;
  other: number;
  total: number;
  /** Legacy shows "Bu dönemde tamamlanan iş emirlerinde maliyet yok". */
  empty: boolean;
}

/** Legacy buildJobOrdersCostDonut: Diğer is what the three named parts leave of the total. */
export function jobOrderCostSlices(
  costs: OverviewJobOrderCosts | null | undefined,
): JobOrderCostSlices {
  const c = costs ?? {};
  const labor = pf(c.total_labor_cost_eur);
  const material = pf(c.total_material_cost_eur);
  const subcontractor = pf(c.total_subcontractor_cost_eur);
  const total = pf(c.total_actual_cost_eur);
  const other = Math.max(0, total - labor - material - subcontractor);
  const empty = total <= 0 && labor + material + subcontractor + other <= 0;
  return { labor, material, subcontractor, other, total, empty };
}

export interface CountRow {
  key: string;
  label: string;
  value: number;
}

/** Job orders by status, in the API's key order (legacy did not sort). */
export function jobOrderStatusRows(
  byStatus: Record<string, ApiNumber> | null | undefined,
): CountRow[] {
  return Object.keys(byStatus ?? {}).map((key) => ({
    key,
    label: JOB_ORDER_STATUS_LABELS[key] ?? key,
    value: Number(byStatus?.[key] || 0),
  }));
}

// ---------------------------------------------------------------------------
// Üretim

export interface HoursRow {
  department: string;
  current: number;
  previous: number | null;
}

/**
 * Legacy buildProdHoursChart: Kaynak, Talaşlı, CNC, Bakım; maintenance hours
 * come from the maintenance block, falling back to manufacturing.
 */
export function productionHoursRows(data: OverviewData, compare: boolean): HoursRow[] {
  const m = data.manufacturing ?? {};
  const maint = data.maintenance ?? {};
  const pm = data.previous_period?.manufacturing ?? {};
  const pMaint = data.previous_period?.maintenance ?? {};
  const cur = [
    pf(m.welding_hours),
    pf(m.machining_hours),
    pf(m.cnc_hours),
    pf(maint.maintenance_hours ?? m.maintenance_hours),
  ];
  const prev = [
    pf(pm.welding_hours),
    pf(pm.machining_hours),
    pf(pm.cnc_hours),
    pf(pMaint.maintenance_hours ?? pm.maintenance_hours),
  ];
  return ['Kaynak', 'Talaşlı', 'CNC', 'Bakım'].map((department, i) => ({
    department,
    current: cur[i]!,
    previous: compare ? prev[i]! : null,
  }));
}

export interface OvertimeSummary {
  requests_in_range: ApiNumber;
  requests_approved_in_range: ApiNumber;
  total_approved_hours: ApiNumber;
  by_team: { team: string; hours: ApiNumber }[];
}

/** Legacy overtimeFromOverview: snake_case or camelCase, team rows unwrapped. */
export function overtimeFromOverview(data: OverviewData): OvertimeSummary | null {
  const o = data.overtime;
  if (!o || typeof o !== 'object') return null;
  const teamsRaw = o.by_team ?? o.byTeam;
  const teams = Array.isArray(teamsRaw)
    ? teamsRaw.map((t) => ({
        team: t.team ?? t.team_name ?? t.Team ?? '',
        hours: t.hours ?? t.Hours,
      }))
    : [];
  return {
    requests_in_range: o.requests_in_range ?? o.requestsInRange,
    requests_approved_in_range: o.requests_approved_in_range ?? o.requestsApprovedInRange,
    total_approved_hours: o.total_approved_hours ?? o.totalApprovedHours,
    by_team: teams,
  };
}

/**
 * Active users across the four departments. Legacy added the raw values with
 * `|| 0`, which concatenates when the API sends strings; this adds numbers.
 */
export function activeUsersTotal(data: OverviewData): number {
  const m = data.manufacturing ?? {};
  const maintUsers = data.maintenance?.maintenance_active_users ?? m.maintenance_active_users;
  return (
    pf(m.welding_active_users) +
    pf(m.machining_active_users) +
    pf(m.cnc_active_users) +
    pf(maintUsers)
  );
}

// ---------------------------------------------------------------------------
// Satış

export interface SalesSummary {
  created: number;
  won: number;
  lost: number;
  /** Won / created, percent; 0 without offers. */
  winRate: number;
  wonEur: number;
  lostEur: number;
  pendingEur: number;
  /** Won ÷ (won + lost + pending), percent. */
  eurWinSharePct: number;
}

export function salesSummary(sales: OverviewSales | null | undefined): SalesSummary {
  const s = sales ?? {};
  const created = pf(s.offers_created_in_range);
  const won = pf(s.offers_won_in_range);
  const lost = pf(s.offers_lost_in_range);
  const wonEur = pf(s.total_won_value_eur);
  const lostEur = pf(s.total_lost_value_eur);
  const pendingEur = pf(s.total_pending_value_eur);
  const eurSum = wonEur + lostEur + pendingEur;
  return {
    created,
    won,
    lost,
    winRate: created > 0 ? (won / created) * 100 : 0,
    wonEur,
    lostEur,
    pendingEur,
    eurWinSharePct: eurSum > 0 ? (wonEur / eurSum) * 100 : 0,
  };
}

/** Consultations per department, most first (legacy sort). */
export function consultRows(byDept: Record<string, ApiNumber> | null | undefined): CountRow[] {
  const src = byDept ?? {};
  return Object.keys(src)
    .sort((a, b) => pf(src[b]) - pf(src[a]))
    .map((key) => ({ key, label: salesConsultDeptLabel(key), value: Number(src[key] || 0) }));
}

// ---------------------------------------------------------------------------
// Taşeron

export interface SubcontractorPair {
  name: string;
  curRow: OverviewSubcontractorRow;
  prevRow: OverviewSubcontractorRow | null;
  current: number;
  previous: number | null;
}

/**
 * Legacy subcontractorTop10Series: the ten largest approved totals of this
 * period, each matched by name to the previous period. With no rows this
 * period but a comparison, the previous period's ten (this period at 0).
 */
export function subcontractorTop10(
  sub: OverviewSubcontracting | null | undefined,
  ppSub: OverviewSubcontracting | null | undefined,
  compare: boolean,
): SubcontractorPair[] | null {
  const subs = Array.isArray(sub?.by_subcontractor) ? sub.by_subcontractor : [];
  const ppList = Array.isArray(ppSub?.by_subcontractor) ? ppSub.by_subcontractor : [];
  const prevByName = new Map(ppList.map((x) => [String(x.name || ''), x]));
  const byApproved = (a: OverviewSubcontractorRow, b: OverviewSubcontractorRow) =>
    pf(b.approved_total) - pf(a.approved_total);

  if (subs.length > 0) {
    return [...subs]
      .sort(byApproved)
      .slice(0, 10)
      .map((s) => {
        const name = String(s.name || '');
        const p = prevByName.get(name) ?? null;
        return {
          name,
          curRow: s,
          prevRow: p,
          current: pf(s.approved_total),
          previous: compare ? (p ? pf(p.approved_total) : 0) : null,
        };
      });
  }
  if (compare && ppList.length > 0) {
    return [...ppList]
      .sort(byApproved)
      .slice(0, 10)
      .map((p) => ({
        name: String(p.name || ''),
        curRow: { name: p.name, approved_total: '0', currency: p.currency },
        prevRow: p,
        current: 0,
        previous: pf(p.approved_total),
      }));
  }
  return null;
}

export function subcontractorRowWeightKg(row: OverviewSubcontractorRow | null | undefined): number {
  if (!row || typeof row !== 'object') return 0;
  return pfLocale(row.total_awarded_weight_kg ?? row.totalAwardedWeightKg);
}

/** approved_total / awarded kg; null without weight. */
export function subcontractorAvgPricePerKg(
  row: OverviewSubcontractorRow | null | undefined,
): number | null {
  if (!row || typeof row !== 'object') return null;
  const w = subcontractorRowWeightKg(row);
  if (w <= 0) return null;
  const v = pfLocale(row.approved_total) / w;
  return Number.isFinite(v) ? v : null;
}

/** total_approved_value / total_awarded_weight_kg for the whole period; null without weight. */
export function hakedisAvgPricePerKg(
  slice: OverviewSubcontracting | null | undefined,
): number | null {
  if (!slice || typeof slice !== 'object') return null;
  const w = pfLocale(slice.total_awarded_weight_kg);
  if (w <= 0) return null;
  const v = pfLocale(slice.total_approved_value) / w;
  return Number.isFinite(v) ? v : null;
}

// ---------------------------------------------------------------------------
// Satınalma

/** Requests sent: requests_submitted_in_range, or the older requests_in_range. */
export function procurementRequests(p: OverviewProcurement | null | undefined): number {
  return pf(p?.requests_submitted_in_range ?? p?.requests_in_range);
}

/** Legacy procurementTruncateChartLabel. */
export function truncateLabel(text: string | null | undefined, max = 26): string {
  const t = String(text ?? '').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

// ---------------------------------------------------------------------------
// Kalite

/** Approved ÷ reviews, percent; 0 without reviews. */
export function qcPassRate(reviews: unknown, approved: unknown): number {
  const total = pf(reviews);
  return total > 0 ? (pf(approved) / total) * 100 : 0;
}

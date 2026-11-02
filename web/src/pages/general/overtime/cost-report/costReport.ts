import type {
  CostBucket,
  CostBucketKey,
  CostFields,
  CostReport,
  CostReportGroupRow,
  CostReportRequest,
} from '@/api/general/overtime';
import { formatNumber } from '@/lib/format';
import type { FilterOption } from '@/ui';

// Pure parts of general/overtime/cost-report/costReport.js.

// Mirrors the canonical department list in human_resources/org/org.js. Keep in
// sync — overtime rows carry `rollingmill`, `management` etc. and a missing
// entry shows the raw code to the user.
export const TEAM_OPTIONS: FilterOption[] = [
  { value: 'machining', label: 'Talaşlı İmalat' },
  { value: 'design', label: 'Dizayn' },
  { value: 'logistics', label: 'Lojistik' },
  { value: 'procurement', label: 'Satın Alma' },
  { value: 'welding', label: 'Kaynaklı İmalat' },
  { value: 'planning', label: 'Planlama' },
  { value: 'manufacturing', label: 'İmalat' },
  { value: 'maintenance', label: 'Bakım' },
  { value: 'rollingmill', label: 'Haddehane' },
  { value: 'qualitycontrol', label: 'Kalite Kontrol' },
  { value: 'cutting', label: 'CNC Kesim' },
  { value: 'warehouse', label: 'Ambar' },
  { value: 'finance', label: 'Finans' },
  { value: 'management', label: 'Yönetim' },
  { value: 'external_workshops', label: 'Dış Atölyeler' },
  { value: 'human_resources', label: 'İnsan Kaynakları' },
  { value: 'sales', label: 'Proje Taahhüt' },
  { value: 'accounting', label: 'Muhasebe' },
];

const TEAM_LABELS: Record<string, string> = Object.fromEntries(
  TEAM_OPTIONS.map((o) => [o.value, o.label]),
);

/** Falls back to the raw code for teams not in the map (e.g. legacy snapshots). */
export const teamLabel = (team: string | null | undefined): string =>
  (team && TEAM_LABELS[team]) || team || '-';

export const STATUS_OPTIONS: FilterOption[] = [
  { value: 'approved', label: 'Sadece onaylı' },
  { value: 'approved,submitted', label: 'Onaylı + bekleyen (tahmini)' },
  { value: 'submitted', label: 'Sadece bekleyen' },
];

export type GroupMode = 'by_team' | 'by_user' | 'by_job';

export const GROUP_OPTIONS: { value: GroupMode; label: string }[] = [
  { value: 'by_team', label: 'Ekibe göre' },
  { value: 'by_user', label: 'Kişiye göre' },
  { value: 'by_job', label: 'İş No’ya göre' },
];

export const GROUP_TITLES: Record<GroupMode, string> = {
  by_team: 'Ekip Bazında Dağılım',
  by_user: 'Kişi Bazında Dağılım',
  by_job: 'İş No Bazında Dağılım',
};

export function groupMode(value: string): GroupMode {
  return value === 'by_user' || value === 'by_job' ? value : 'by_team';
}

export interface BucketMeta {
  key: CostBucketKey;
  label: string;
  icon: string;
  color: string;
}

// Rate buckets as priced by the backend (see overtime/services/cost.py).
// Overtime is outside normal hours by definition, so there is no 1x bucket.
// Hafta içi/Cumartesi share a rate, as do Pazar/Resmi tatil — but all four stay
// separate rows so each is visible on its own.
export const BUCKET_META: BucketMeta[] = [
  { key: 'weekday', label: 'Hafta içi (1.5x)', icon: 'fas fa-moon', color: 'cyan.7' },
  { key: 'saturday', label: 'Cumartesi (1.5x)', icon: 'fas fa-calendar-week', color: 'blue.7' },
  { key: 'sunday', label: 'Pazar (2x)', icon: 'fas fa-calendar-day', color: 'yellow.7' },
  { key: 'holiday', label: 'Resmi tatil (2x)', icon: 'fas fa-flag', color: 'red.7' },
];

export const NO_JOB_LABEL = 'İş No Yok';

export const num = (v: unknown): number => Number(v || 0);

export const fmtEur = (v: unknown): string => `€${formatNumber(num(v), 2)}`;

export const fmtHours = (v: unknown): string =>
  `${formatNumber(num(v), { maximumFractionDigits: 2 })} saat`;

export const fmtShare = (v: unknown): string =>
  `${formatNumber(num(v), { maximumFractionDigits: 1 })}%`;

/** "0.65" → "65" */
export const pctOfWage = (rate: unknown): string =>
  formatNumber(num(rate) * 100, { maximumFractionDigits: 1 });

export interface CostNums {
  cost_eur: number;
  wage_cost_eur: number;
  employer_cost_eur: number;
}

// Every cost the backend returns includes the employer overhead (SGK işveren
// payı, taxes — overtime/services/cost_report.py EMPLOYER_OVERHEAD_RATE) and
// carries its two parts as wage_cost_eur + employer_cost_eur.
export const costNums = (r: CostFields | null | undefined): CostNums => ({
  cost_eur: num(r?.cost_eur),
  wage_cost_eur: num(r?.wage_cost_eur),
  employer_cost_eur: num(r?.employer_cost_eur),
});

function addCosts(target: CostNums, r: CostFields) {
  target.cost_eur += num(r.cost_eur);
  target.wage_cost_eur += num(r.wage_cost_eur);
  target.employer_cost_eur += num(r.employer_cost_eur);
}

const shareOf = (cost: number, total: number) => (total > 0 ? (cost / total) * 100 : 0);

// ---- buckets -----------------------------------------------------------------

export interface BucketRow extends CostNums {
  key: CostBucketKey;
  label: string;
  icon: string;
  color: string;
  hours: number;
  share: number;
}

/** The four rate buckets with any hours or cost, share of `totalCost`. */
export function bucketRows(
  buckets: Partial<Record<CostBucketKey, CostBucket>> | null | undefined,
  totalCost: unknown,
): BucketRow[] {
  const total = num(totalCost);
  return BUCKET_META.map((b) => {
    const cell = buckets?.[b.key] ?? {};
    return {
      ...b,
      hours: num(cell.hours),
      ...costNums(cell),
      share: shareOf(num(cell.cost_eur), total),
    };
  }).filter((r) => r.hours > 0 || r.cost_eur > 0);
}

// ---- breakdown ---------------------------------------------------------------

export interface BreakdownRow extends Omit<CostReportGroupRow, keyof CostNums | 'hours'>, CostNums {
  hours: number;
  share: number;
}

export function breakdownRows(report: CostReport, mode: GroupMode): BreakdownRow[] {
  const total = num(report.summary.total_cost_eur);
  return (report[mode] ?? []).map((r) => ({
    ...r,
    hours: num(r.hours),
    ...costNums(r),
    share: shareOf(num(r.cost_eur), total),
  }));
}

// ---- job-order tree ----------------------------------------------------------

// Job numbers are hierarchical: 272-01 is the parent of 272-01-01, 272-01-02, ...
// The breakdown rolls everything up to the first two segments so a project shows
// as one line, with its sub-jobs underneath.
const JOB_PARENT_SEGMENTS = 2;

export function jobParentKey(jobNo: string | null | undefined): string {
  return String(jobNo || '')
    .trim()
    .split('-')
    .slice(0, JOB_PARENT_SEGMENTS)
    .join('-');
}

export interface JobParent extends CostNums {
  key: string;
  hours: number;
  entry_count: number;
  request_count: number;
  share: number;
  child_count: number;
  /** A lone child identical to its parent adds no information. */
  expandable: boolean;
  children: JobChild[];
}

export interface JobChild extends CostNums {
  /** The row id: the parent and the job number. */
  id: string;
  job_no: string;
  parentKey: string;
  hours: number;
  entry_count: number;
  request_count: number;
  share: number;
}

export function buildJobTree(report: CostReport): JobParent[] {
  // A request touching two sub-jobs must count once at the parent level,
  // so gather request ids per job rather than summing child counts.
  const requestIdsByJob = new Map<string, Set<number>>();
  report.requests.forEach((req) => {
    (req.entries ?? []).forEach((e) => {
      const job = (e.job_no || '').trim();
      let ids = requestIdsByJob.get(job);
      if (!ids) requestIdsByJob.set(job, (ids = new Set()));
      ids.add(req.id);
    });
  });

  type Acc = CostNums & {
    key: string;
    hours: number;
    entry_count: number;
    requestIds: Set<number>;
    children: Omit<JobChild, 'share'>[];
  };
  const parents = new Map<string, Acc>();
  report.by_job.forEach((r) => {
    const job = (r.job_no || '').trim();
    const key = job ? jobParentKey(job) : '';
    let p = parents.get(key);
    if (!p) {
      p = {
        key,
        hours: 0,
        cost_eur: 0,
        wage_cost_eur: 0,
        employer_cost_eur: 0,
        entry_count: 0,
        requestIds: new Set(),
        children: [],
      };
      parents.set(key, p);
    }
    p.children.push({
      id: `${key}\u0000${job}\u0000${p.children.length}`,
      job_no: job,
      parentKey: key,
      hours: num(r.hours),
      ...costNums(r),
      entry_count: r.entry_count ?? 0,
      request_count: r.request_count ?? 0,
    });
    p.hours += num(r.hours);
    addCosts(p, r);
    p.entry_count += r.entry_count ?? 0;
    requestIdsByJob.get(job)?.forEach((id) => p.requestIds.add(id));
  });

  const total = num(report.summary.total_cost_eur);
  return [...parents.values()]
    .map(({ requestIds, children, ...p }) => ({
      ...p,
      request_count: requestIds.size,
      share: shareOf(p.cost_eur, total),
      child_count: children.length,
      expandable: !(children.length === 1 && children[0]?.job_no === p.key),
      children: children
        .map((c) => ({ ...c, share: shareOf(c.cost_eur, total) }))
        .sort((a, b) => b.cost_eur - a.cost_eur),
    }))
    .sort((a, b) => b.cost_eur - a.cost_eur);
}

// ---- job detail --------------------------------------------------------------

export interface JobDetailRow extends CostNums {
  request_id: number;
  date: string | null | undefined;
  team: string | null | undefined;
  job_no: string | null | undefined;
  full_name: string;
  description: string | null | undefined;
  hours: number;
}

export interface PersonTotal extends CostNums {
  name: string;
  hours: number;
  count: number;
}

export interface JobDetail {
  key: string;
  parent: JobParent | null;
  rows: JobDetailRow[];
  people: PersonTotal[];
  totals: CostNums & { hours: number };
}

/**
 * The entries behind one line of the job tree: a parent covers itself and
 * every sub-job beneath it, a child is exact. (Legacy looked the key up among
 * the parents first, so a child named like its parent opened the parent.)
 */
export function jobDetail(report: CostReport, key: string, parent: JobParent | null): JobDetail {
  const matches = parent ? new Set(parent.children.map((c) => c.job_no)) : new Set([key]);
  const rows: JobDetailRow[] = [];
  report.requests.forEach((req) => {
    (req.entries ?? []).forEach((e) => {
      if (!matches.has((e.job_no || '').trim())) return;
      rows.push({
        request_id: req.id,
        date: req.counted_start_at,
        team: req.team,
        job_no: e.job_no,
        full_name: e.full_name || e.username || '',
        description: e.description,
        hours: num(e.hours),
        ...costNums(e),
      });
    });
  });
  rows.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.cost_eur - a.cost_eur);

  const totals = { hours: 0, cost_eur: 0, wage_cost_eur: 0, employer_cost_eur: 0 };
  const byPerson = new Map<string, PersonTotal>();
  rows.forEach((r) => {
    totals.hours += r.hours;
    addCosts(totals, r);
    let cur = byPerson.get(r.full_name);
    if (!cur) {
      cur = {
        name: r.full_name,
        hours: 0,
        count: 0,
        cost_eur: 0,
        wage_cost_eur: 0,
        employer_cost_eur: 0,
      };
      byPerson.set(r.full_name, cur);
    }
    cur.hours += r.hours;
    addCosts(cur, r);
    cur.count += 1;
  });
  const people = [...byPerson.values()].sort((a, b) => b.cost_eur - a.cost_eur);
  return { key, parent, rows, people, totals };
}

// ---- requests ----------------------------------------------------------------

export interface RequestRow extends Omit<CostReportRequest, keyof CostNums | 'hours'>, CostNums {
  hours: number;
}

export function requestRows(report: CostReport): RequestRow[] {
  return report.requests.map((r) => ({ ...r, hours: num(r.hours), ...costNums(r) }));
}

export function requestStatusLabel(status: string | null | undefined): string {
  if (status === 'approved') return 'Onaylandı';
  if (status === 'submitted') return 'Onay Bekliyor';
  return status ?? '';
}

export const ENTRY_STATUS: Record<string, { label: string; family: 'green' | 'yellow' | 'red' }> = {
  approved: { label: 'Onaylandı', family: 'green' },
  pending: { label: 'Bekliyor', family: 'yellow' },
  rejected: { label: 'Reddedildi', family: 'red' },
};

// ---- notices -----------------------------------------------------------------

/** The data-quality warnings (estimated wages, unpriced hours); empty when clean. */
export function dataQualityNotes(report: CostReport): { count: string; text: string }[] {
  const s = report.summary;
  const notes: { count: string; text: string }[] = [];
  if ((s.estimated_wage_entry_count ?? 0) > 0) {
    notes.push({
      count: String(s.estimated_wage_entry_count),
      text: 'mesai kaydında personelin tanımlı maaşı olmadığı için sistem ortalaması kullanıldı.',
    });
  }
  if (num(s.unpriced_hours) > 0) {
    notes.push({
      count: fmtHours(s.unpriced_hours),
      text: 'ilgili güne ait kur verisi bulunmadığı için fiyatlanamadı ve toplama dahil edilmedi.',
    });
  }
  return notes;
}

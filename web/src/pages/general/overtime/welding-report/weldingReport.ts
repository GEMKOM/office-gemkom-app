import type { WeldingReportRow } from '@/api/general/overtime';
import { formatNumber } from '@/lib/format';
import type { StatusFamily } from '@/ui';

// Pure parts of general/overtime/welding-report/weldingReport.js.

export interface FlagMeta {
  label: string;
  family: StatusFamily;
  icon: string;
  hint: string;
}

// Outlier flags as emitted by overtime/services/welding_report.py, worst first
// (the order of the "Sapma Dağılımı" table).
export const FLAG_META: Record<string, FlagMeta> = {
  no_record: {
    label: 'Kayıt yok',
    family: 'red',
    icon: 'fas fa-ban',
    hint: 'Onaylı mesai var ama o gün hiç kaynak zaman kaydı girilmemiş.',
  },
  pending_entry: {
    label: 'Veri girilmemiş',
    family: 'grey',
    icon: 'fas fa-hourglass-half',
    hint: 'O gün, kaynak zaman kayıtlarının girildiği son tarihten sonrasına ait — kayıt henüz işlenmemiş olabilir.',
  },
  no_overtime_record: {
    label: 'Mesai işlenmemiş',
    family: 'orange',
    icon: 'fas fa-exclamation',
    hint: 'O gün kayıt var ama tamamı normal mesai olarak girilmiş.',
  },
  unapproved: {
    label: 'Onaysız mesai',
    family: 'purple',
    icon: 'fas fa-user-slash',
    hint: 'Fazla mesai işlenmiş ama o gün için onaylı mesai talebi yok.',
  },
  under: {
    label: 'Eksik',
    family: 'orange',
    icon: 'fas fa-arrow-down',
    hint: 'İşlenen mesai saati, onaylı süreden tolerans kadar az.',
  },
  over: {
    label: 'Fazla',
    family: 'blue',
    icon: 'fas fa-arrow-up',
    hint: 'İşlenen mesai saati, onaylı süreden tolerans kadar fazla.',
  },
  job_mismatch: {
    label: 'İş no farklı',
    family: 'grey',
    icon: 'fas fa-random',
    hint: 'Mesai talebindeki iş emri ile çalışılan iş emri örtüşmüyor.',
  },
};

export const FLAG_ORDER = Object.keys(FLAG_META);

/** What to do about a flagged day (the guidance line of the drill-down). */
export const FLAG_FIX: Record<string, string> = {
  no_record: 'Kaynakçının o güne ait zaman kaydını ekleyin.',
  pending_entry: 'Zaman kayıtları girildiğinde bu uyarı kendiliğinden kalkar.',
  no_overtime_record: 'Zaman kaydındaki saatleri mesai (1.5x / 2x) olarak düzeltin.',
  unapproved: 'O gün için mesai talebi oluşturun ya da zaman kaydındaki mesaiyi düzeltin.',
  under: 'Zaman kaydındaki mesai saatlerini tamamlayın ya da talebi düzeltin.',
  over: 'Zaman kaydındaki mesai saatlerini düşürün ya da talebi güncelleyin.',
  job_mismatch: 'İş numarasını zaman kaydında veya talepte düzeltin.',
};

/** The welding time entries of one welder on one day: where most deviations get fixed. */
export function timeEntriesLink(row: { user_id?: number; date: string }): string {
  const params = new URLSearchParams();
  if (row.user_id != null) params.set('employee', String(row.user_id));
  params.set('date', row.date.slice(0, 10));
  return `/manufacturing/welding/time-entries?${params}`;
}

/** The overtime request's details modal in the registry. */
export function requestLink(id: number): string {
  return `/general/overtime/registry?request=${id}`;
}

/** The registry narrowed to one welding day, for days with overtime but no request. */
export function registryDayLink(date: string): string {
  const day = date.slice(0, 10);
  return `/general/overtime/registry?start_date=${day}&end_date=${day}&team=welding`;
}

export function flagMeta(flag: string): FlagMeta {
  return FLAG_META[flag] ?? { label: flag, family: 'grey', icon: 'fas fa-question', hint: '' };
}

export const OVERTIME_TYPE_LABELS: Record<string, string> = {
  regular: 'Normal',
  after_hours: 'Mesai (1.5x)',
  holiday: 'Tatil (2x)',
};

export const TOLERANCE_OPTIONS = [
  { value: '0.5', label: '0,5 saat' },
  { value: '1', label: '1 saat' },
  { value: '2', label: '2 saat' },
  { value: '0', label: 'Tolerans yok' },
];

export const DEFAULT_TOLERANCE = '0.5';

const num = (v: unknown) => Number(v || 0);

/** "1,50 saat" */
export function fmtHours(v: unknown): string {
  return `${formatNumber(num(v), 2)} saat`;
}

/** "+1,50 saat" for a positive figure. */
export function fmtSignedHours(v: unknown): string {
  const n = num(v);
  return (n > 0 ? '+' : '') + fmtHours(n);
}

export function fmtPercent(v: number): string {
  return formatNumber(v, { maximumFractionDigits: 1 });
}

/** A report row with numbers parsed and plain-text labels for the export (legacy decorate). */
export interface DecoratedRow extends WeldingReportRow {
  id: string;
  planned_hours: number;
  logged_overtime_hours: number;
  logged_regular_hours: number;
  variance_hours: number;
  request_ids: number[];
  planned_jobs: string[];
  worked_jobs: string[];
  flags: string[];
  request_label: string;
  planned_jobs_label: string;
  worked_jobs_label: string;
  flags_label: string;
}

export function decorate(rows: WeldingReportRow[]): DecoratedRow[] {
  return rows.map((r, index) => {
    const request_ids = r.request_ids ?? [];
    const planned_jobs = r.planned_jobs ?? [];
    const worked_jobs = r.worked_jobs ?? [];
    const flags = r.flags ?? [];
    return {
      ...r,
      id: `${r.user_id ?? ''}-${r.date}-${index}`,
      planned_hours: num(r.planned_hours),
      logged_overtime_hours: num(r.logged_overtime_hours),
      logged_regular_hours: num(r.logged_regular_hours),
      variance_hours: num(r.variance_hours),
      request_ids,
      planned_jobs,
      worked_jobs,
      flags,
      request_label: request_ids.map((id) => `#${id}`).join(' ') || '-',
      planned_jobs_label: planned_jobs.join(', ') || '-',
      worked_jobs_label: worked_jobs.join(', ') || '-',
      flags_label: flags.map((f) => flagMeta(f).label).join(', ') || 'Uyumlu',
    };
  });
}

/**
 * Days whose welding entries have not been keyed in yet cannot be judged, so
 * every headline figure is computed over the reconcilable rows only.
 */
export const isPending = (r: DecoratedRow) => r.flags.includes('pending_entry');

export interface SummaryItem {
  label: string;
  value: string;
  icon: string;
  color: string;
  note: string;
}

/** Port of renderSummary ("Dönem Özeti"). */
export function summarize(rows: DecoratedRow[]): SummaryItem[] {
  if (!rows.length) return [];
  const judged = rows.filter((r) => !isPending(r));
  const pending = rows.length - judged.length;
  const outliers = judged.filter((r) => r.flags.length);
  const planned = judged.reduce((acc, r) => acc + r.planned_hours, 0);
  const logged = judged.reduce((acc, r) => acc + r.logged_overtime_hours, 0);
  const regular = judged.reduce((acc, r) => acc + r.logged_regular_hours, 0);
  const diff = logged - planned;
  const coverage = planned > 0 ? (logged / planned) * 100 : 0;
  const rate = judged.length ? ((judged.length - outliers.length) / judged.length) * 100 : 0;
  const welders = new Set(judged.map((r) => r.user_id)).size;
  const days = new Set(judged.map((r) => r.date)).size;

  const data: SummaryItem[] = [
    {
      label: 'Talep edilen mesai süresi',
      value: fmtHours(planned),
      icon: 'fas fa-clipboard-check',
      color: 'blue.7',
      note: `${judged.length} kayıt, ${welders} kaynakçı, ${days} gün`,
    },
    {
      label: 'İşlenen mesai saati',
      value: fmtHours(logged),
      icon: 'fas fa-fire',
      color: 'red.8',
      note: 'Kaynak zaman kayıtlarındaki mesai (1.5x / 2x) satırları',
    },
    {
      label: 'Fark',
      value: fmtSignedHours(diff),
      icon: 'fas fa-scale-unbalanced',
      color: diff < 0 ? 'red.8' : 'blue.7',
      note: `İşlenme oranı %${fmtPercent(coverage)}`,
    },
    {
      label: 'İşlenen normal mesai',
      value: fmtHours(regular),
      icon: 'fas fa-clock',
      color: 'gray.6',
      note: 'Aynı günlerdeki normal vardiya saatleri — mesaiye dahil değil',
    },
    {
      label: 'Sapmalı kayıt',
      value: `${outliers.length} / ${judged.length}`,
      icon: 'fas fa-triangle-exclamation',
      color: 'yellow.7',
      note: `Uyum oranı %${fmtPercent(rate)}`,
    },
  ];
  if (pending > 0) {
    data.push({
      label: 'Veri bekleyen kayıt',
      value: String(pending),
      icon: 'fas fa-hourglass-half',
      color: 'dimmed',
      note: 'Kaynak zaman kaydı henüz girilmemiş — yukarıdaki toplamlara dahil değil',
    });
  }
  return data;
}

export interface FlagCount extends FlagMeta {
  flag: string;
  count: number;
  /** Share of rows (rows can carry several flags, so these need not add up to 100). */
  share: number;
}

/** Port of renderFlags ("Sapma Dağılımı"). */
export function countFlags(rows: DecoratedRow[]): FlagCount[] {
  const counts = new Map<string, number>();
  rows.forEach((r) => r.flags.forEach((f) => counts.set(f, (counts.get(f) ?? 0) + 1)));
  const judgedCount = rows.filter((r) => !isPending(r)).length;
  return FLAG_ORDER.filter((f) => counts.get(f)).map((f) => {
    const count = counts.get(f) ?? 0;
    // pending_entry is measured against everything; the real flags against the judgeable rows.
    const base = f === 'pending_entry' ? rows.length : judgedCount;
    return { ...flagMeta(f), flag: f, count, share: base ? (count / base) * 100 : 0 };
  });
}

/** The rows carrying one flag: the records behind a "Sapma Dağılımı" count. */
export function rowsWithFlag(rows: DecoratedRow[], flag: string): DecoratedRow[] {
  return rows.filter((r) => r.flags.includes(flag));
}

export interface Totals {
  label: string;
  planned_hours: string;
  logged_overtime_hours: string;
  variance_hours: string;
  logged_regular_hours: string;
  flags_label: string;
}

/** Port of buildTotalsRow: sums over the judgeable rows. */
export function totals(rows: DecoratedRow[]): Totals {
  const judged = rows.filter((r) => !isPending(r));
  const sum = (
    f: 'planned_hours' | 'logged_overtime_hours' | 'variance_hours' | 'logged_regular_hours',
  ) => judged.reduce((acc, r) => acc + Number(r[f] || 0), 0);
  const outliers = judged.filter((r) => r.flags.length).length;
  return {
    label: judged.length === rows.length ? 'Toplam' : 'Toplam (veri bekleyenler hariç)',
    planned_hours: fmtHours(sum('planned_hours')),
    logged_overtime_hours: fmtHours(sum('logged_overtime_hours')),
    variance_hours: fmtSignedHours(sum('variance_hours')),
    logged_regular_hours: fmtHours(sum('logged_regular_hours')),
    flags_label: `${outliers} / ${judged.length} sapmalı`,
  };
}

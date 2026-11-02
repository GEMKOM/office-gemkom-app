import type {
  MachiningReportRow,
  MachiningSummary,
  MachiningSummaryOperator,
} from '@/api/general/overtime';
import { formatNumber } from '@/lib/format';

// Pure parts of general/overtime/machining-report/machiningReport.js.

export const num = (v: unknown): number => Number(v || 0);

export const fmtNum = (v: unknown, digits = 1): string =>
  formatNumber(num(v), { maximumFractionDigits: digits });

export const formatHours = (v: unknown): string => `${formatNumber(num(v), 2)} saat`;

export interface EntryDay {
  key: string;
  window_hours: number;
  worked_hours: number;
  outside_hours: number;
  operations: number;
}

// One overtime entry can carry several operations, so the window is only
// comparable to the *sum* of its operations' hours. (talep, operatör, gün)
// is the level where planned and worked line up.
export function groupByEntryDay(rows: readonly MachiningReportRow[]): EntryDay[] {
  const groups = new Map<string, EntryDay>();
  rows.forEach((r) => {
    const key = `${r.request_id}|${r.user_id}|${r.date}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        window_hours: num(r.overtime_window_hours),
        worked_hours: 0,
        outside_hours: 0,
        operations: 0,
      };
      groups.set(key, g);
    }
    g.worked_hours += num(r.worked_hours);
    g.outside_hours += num(r.outside_window_hours);
    g.operations += 1;
  });
  return [...groups.values()];
}

export interface Totals {
  rowCount: number;
  workedCount: number;
  workedHours: number;
  windowHours: number;
  operatorCount: number;
  dayCount: number;
}

export function computeTotals(rows: readonly MachiningReportRow[]): Totals {
  return {
    rowCount: rows.length,
    workedCount: rows.filter((r) => r.worked).length,
    workedHours: rows.reduce((sum, r) => sum + num(r.worked_hours), 0),
    // Each (talep, operatör, gün) window counted once, not once per operation.
    windowHours: groupByEntryDay(rows).reduce((sum, g) => sum + g.window_hours, 0),
    operatorCount: new Set(rows.map((r) => r.user_id)).size,
    dayCount: new Set(rows.map((r) => r.date)).size,
  };
}

export interface SummaryLine {
  label: string;
  value: string;
  share: string;
  icon: string;
  color: string;
  note: string;
  /** A breakdown line of the one above it. */
  sub?: boolean;
}

// Period totals come from the summary endpoint, which counts every timer
// inside the overtime windows — not only the operations picked on the
// request — so "requested vs. actually worked" is the real comparison.
export function summaryLines(
  summary: MachiningSummary | null | undefined,
  rows: readonly MachiningReportRow[],
): SummaryLine[] {
  if (!summary || !num(summary.requested_hours)) return [];
  const t = computeTotals(rows);
  const requested = num(summary.requested_hours);
  const pct = (h: unknown) => `%${fmtNum((num(h) / requested) * 100)}`;

  return [
    {
      label: 'Talep edilen toplam mesai',
      value: formatHours(requested),
      share: '%100',
      icon: 'fas fa-clipboard-check',
      color: 'blue.7',
      note:
        'Filtrelere uyan onaylı mesai taleplerinde talaşlı imalat operatörlerine (talepte operasyon seçilmiş kişiler) yazılan ' +
        'mesai süresinin toplamı (talep başlangıç–bitiş saatleri, 12:00–12:30 öğle molası düşülmüş). ' +
        'Aynı kişinin çakışan talepleri bir kez sayılır. ' +
        `${summary.operator_count} operatör · ${summary.request_count} talep · ${summary.entry_count} mesai kaydı · ${summary.day_count} gün. ` +
        'Kişi bazında dökümü "Operatör Bazında" tablosundadır.',
    },
    {
      label: 'Mesai içinde toplam çalışılan',
      value: formatHours(summary.worked_hours),
      share: pct(summary.worked_hours),
      icon: 'fas fa-stopwatch',
      color: 'green.7',
      note:
        'Mesai saatleri içinde operatörün açık olan tüm üretim zamanlayıcıları — hangi iş veya operasyon olursa olsun. ' +
        'Mesai penceresi dışındaki kısımlar (ör. normal vardiya) sayılmaz; aynı anda açık iki zamanlayıcı bir kez sayılır. ' +
        'Altındaki iki satır bu toplamın dökümüdür.',
    },
    {
      sub: true,
      label: 'Talepte seçilen operasyonlarda',
      value: formatHours(summary.selected_operation_hours),
      share: pct(summary.selected_operation_hours),
      icon: 'fas fa-cogs',
      color: 'green.7',
      note:
        'Toplam çalışmanın, mesai talebinde o operatör için seçilen operasyonlarda geçen kısmı. ' +
        'Aşağıdaki tablonun "Çalışılan Saat" toplamıyla aynıdır.',
    },
    {
      sub: true,
      label: 'Başka işlerde',
      value: formatHours(summary.other_work_hours),
      share: pct(summary.other_work_hours),
      icon: 'fas fa-shuffle',
      color: 'cyan.7',
      note: 'Toplam çalışmanın, talepte seçilmemiş başka operasyon veya işlerde geçen kısmı.',
    },
    {
      label: 'Duruş / mola kaydı',
      value: formatHours(summary.downtime_hours),
      share: pct(summary.downtime_hours),
      icon: 'fas fa-circle-pause',
      color: 'gray.6',
      note:
        'Mesai içinde üretim yerine duruş veya mola zamanlayıcısının açık olduğu süre. ' +
        'Aynı anda üretim zamanlayıcısı da açıksa çalışılan sayılır, burada tekrar sayılmaz.',
    },
    {
      label: 'Zamanlayıcı kaydı olmayan süre',
      value: formatHours(summary.no_timer_hours),
      share: pct(summary.no_timer_hours),
      icon: 'fas fa-circle-question',
      color: 'red.7',
      note:
        'Mesai saatleri içinde operatörün hiçbir zamanlayıcısının açık olmadığı süre. ' +
        'Talep edilen = toplam çalışılan + duruş/mola + kayıtsız süre.',
    },
    {
      label: 'Seçilen operasyonlardan çalışılanlar',
      value: rows.length ? `${t.workedCount} / ${t.rowCount}` : '-',
      share: '',
      icon: 'fas fa-list-check',
      color: 'blue.7',
      note:
        'En alttaki tablonun operasyon satırlarından (talep × operatör × gün × operasyon) ' +
        `mesai içinde en az bir kez zamanlayıcı açılanların sayısı / toplam satır. ${t.operatorCount} operatör, ${t.dayCount} gün.`,
    },
  ];
}

export interface OperatorRow extends Omit<
  MachiningSummaryOperator,
  'requested_hours' | 'worked_hours' | 'no_timer_hours'
> {
  id: string;
  requested_hours: number;
  worked_hours: number;
  no_timer_hours: number;
  ratio: number;
}

/** Who makes up "Talep edilen toplam mesai" — one row per operator. */
export function operatorRows(summary: MachiningSummary | null | undefined): OperatorRow[] {
  return (summary?.operators ?? []).map((o, index) => ({
    ...o,
    id: `${o.user_id ?? o.full_name ?? ''}|${index}`,
    requested_hours: num(o.requested_hours),
    worked_hours: num(o.worked_hours),
    no_timer_hours: num(o.no_timer_hours),
    ratio: num(o.requested_hours) > 0 ? (num(o.worked_hours) / num(o.requested_hours)) * 100 : 0,
  }));
}

/** İş No picks go out as one comma-joined value, as legacy appended the array. */
export function jobParam(picks: readonly string[]): string | undefined {
  return picks.length ? picks.join(',') : undefined;
}

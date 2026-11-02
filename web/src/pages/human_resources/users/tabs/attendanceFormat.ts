import type {
  AttendanceDay,
  AttendanceRecord,
  MonthlySummary,
} from '@/api/human_resources/userAttendance';
import type { DataTableColumn } from '@/ui';
import { isoToLocalTime, leaveTypeLabel, LEAVE_TYPE_PAID } from '../userForm';

// Labels and numbers of the PDKS Özeti tab (renderAttendance), shared by the
// table and its Excel export.

const WEEKDAYS: Record<string, string> = {
  monday: 'Pazartesi',
  tuesday: 'Salı',
  wednesday: 'Çarşamba',
  thursday: 'Perşembe',
  friday: 'Cuma',
  saturday: 'Cumartesi',
  sunday: 'Pazar',
};

export function weekdayTr(value: string | undefined): string {
  return WEEKDAYS[(value || '').toLowerCase()] || value || '-';
}

const DAY_TYPES: Record<string, string> = {
  working: 'Çalışma Günü',
  weekend: 'Hafta Sonu',
  public_holiday: 'Resmi Tatil',
  company_holiday: 'Şirket Tatili',
  leave: 'İzin',
};

export function dayTypeTr(value: string | undefined): string {
  return DAY_TYPES[value || ''] || value || '-';
}

const FLAGS: Record<string, string> = {
  absent: 'Gelmedi',
  late: 'Geç Geldi',
  missing_checkout: 'Çıkış Eksik',
};

export function flagTr(value: string | null | undefined): string {
  return FLAGS[value || ''] || value || '-';
}

export function parseNum(value: unknown): number {
  if (value === undefined || value === null || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** A check-in/out time as HH:MM:SS; non-date text shows its time part or itself. */
export function timeHM(value: string | null | undefined): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    const s = String(value);
    const m = s.match(/\b(\d{2}:\d{2}:\d{2})\b/) || s.match(/\b(\d{2}:\d{2})\b/);
    return m ? m[1]! : s;
  }
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export const checkIn = (rec: AttendanceRecord) =>
  rec.check_in_time || rec.check_in_at || rec.check_in;
export const checkOut = (rec: AttendanceRecord) =>
  rec.check_out_time || rec.check_out_at || rec.check_out;

const METHOD_LABELS: Record<string, string> = {
  ip: 'IP (Ofis Ağı)',
  gps: 'GPS',
  manual_override: 'Manuel Değişim Talebi',
  hr_manual: 'Manuel',
};
const METHOD_ICONS: Record<string, string> = {
  ip: 'fas fa-network-wired',
  gps: 'fas fa-location-dot',
  manual_override: 'fas fa-hand-paper',
  hr_manual: 'fas fa-user-gear',
};

export function methodLabel(rec: AttendanceRecord | null | undefined): string {
  return rec?.method_display || METHOD_LABELS[rec?.method || ''] || rec?.method || '-';
}

export function methodIcon(method: string): string {
  return METHOD_ICONS[method] || 'fas fa-question-circle';
}

export function overtimeMinutes(rec: AttendanceRecord | null | undefined): number {
  return rec ? parseNum(rec.overtime_minutes ?? rec.overtime_min ?? rec.overtime) : 0;
}

/** Late arrival plus early leave. */
export function lateMinutes(rec: AttendanceRecord | null | undefined): number {
  return rec ? parseNum(rec.late_minutes) + parseNum(rec.early_leave_minutes) : 0;
}

/** Leave label for a leave day; isPaid false greys the badge. */
export function dayLeave(day: AttendanceDay): { label: string; paid: boolean | null } {
  const rec = day.record || null;
  const type = rec?.leave_type || day.leave_type || '';
  const display = rec?.leave_type_display || day.leave_type_display || '';
  const paid = rec?.is_paid_leave ?? (type ? LEAVE_TYPE_PAID.has(type) : null);
  return { label: display || leaveTypeLabel(type) || 'İzin', paid };
}

/** Row tint: overtime at or past the shift threshold green, late or early leave past it red. */
export function rowTint(day: AttendanceDay, thresholdMin: number): 'green' | 'red' | null {
  const rec = day.record;
  if (!rec || thresholdMin <= 0) return null;
  const overtime = overtimeMinutes(rec);
  const late = parseNum(rec.late_minutes);
  const early = parseNum(rec.early_leave_minutes);
  if (overtime >= thresholdMin && overtime > 0) return 'green';
  if ((late >= thresholdMin && late > 0) || (early >= thresholdMin && early > 0)) return 'red';
  return null;
}

type ExportRow = Record<string, string | number>;

/**
 * The legacy PDKS export: one row per day plus four columns per leave
 * interval (as many as the busiest day has), then a TOPLAM row.
 */
export function attendanceExport(summary: MonthlySummary): {
  rows: ExportRow[];
  columns: DataTableColumn<ExportRow>[];
} {
  const days = Array.isArray(summary.days) ? summary.days : [];
  const base = days.map((d) => {
    const rec = d.record || null;
    const leave = d.day_type === 'leave' ? dayLeave(d).label : '';
    return {
      row: {
        date: d.date || '',
        weekday: weekdayTr(d.weekday),
        day_type: dayTypeTr(d.day_type),
        holiday_name: d.holiday_name || '',
        note: leave || (d.flag ? flagTr(d.flag) : ''),
        method: rec ? methodLabel(rec) : '',
        check_in: rec ? timeHM(checkIn(rec)) : '',
        check_out: rec ? timeHM(checkOut(rec)) : '',
        overtime_minutes: overtimeMinutes(rec),
        total_late_minutes: lateMinutes(rec),
        record_notes: rec?.notes || '',
      } as ExportRow,
      intervals: Array.isArray(rec?.leave_intervals) ? rec.leave_intervals : [],
    };
  });
  const maxIntervals = base.reduce((mx, r) => Math.max(mx, r.intervals.length), 0);

  const intervalColumns: DataTableColumn<ExportRow>[] = [];
  for (let i = 1; i <= maxIntervals; i++) {
    intervalColumns.push(
      { key: `interval_${i}_start`, header: `İzin ${i} Başlangıç` },
      { key: `interval_${i}_end`, header: `İzin ${i} Bitiş` },
      { key: `interval_${i}_type`, header: `İzin ${i} Tür` },
      { key: `interval_${i}_notes`, header: `İzin ${i} Not` },
    );
  }

  const rows = base.map(({ row, intervals }) => {
    const out = { ...row };
    for (let i = 1; i <= maxIntervals; i++) {
      const it = intervals[i - 1];
      out[`interval_${i}_start`] = it ? isoToLocalTime(it.start_time) : '';
      out[`interval_${i}_end`] = it ? isoToLocalTime(it.end_time) : '';
      out[`interval_${i}_type`] = it
        ? it.leave_type_display || leaveTypeLabel(it.leave_type) || it.leave_type || ''
        : '';
      out[`interval_${i}_notes`] = it ? it.notes || '' : '';
    }
    return out;
  });

  const sum = (key: string) => rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
  const totals: ExportRow = Object.fromEntries(intervalColumns.map((c) => [c.key, '']));
  rows.push({
    date: 'TOPLAM',
    weekday: '',
    day_type: '',
    holiday_name: '',
    note: '',
    method: '',
    check_in: '',
    check_out: '',
    overtime_minutes: sum('overtime_minutes'),
    total_late_minutes: sum('total_late_minutes'),
    record_notes: '',
    ...totals,
  });

  const columns: DataTableColumn<ExportRow>[] = [
    { key: 'date', header: 'Tarih' },
    { key: 'weekday', header: 'Gün' },
    { key: 'day_type', header: 'Gün Türü' },
    { key: 'holiday_name', header: 'Tatil' },
    { key: 'note', header: 'Durum Notu' },
    { key: 'method', header: 'Yöntem' },
    { key: 'check_in', header: 'Giriş' },
    { key: 'check_out', header: 'Çıkış' },
    { key: 'overtime_minutes', header: 'FM (dk)' },
    { key: 'total_late_minutes', header: 'Geç/EÇ (dk)' },
    { key: 'record_notes', header: 'Not' },
    ...intervalColumns,
  ];
  return { rows, columns };
}

/** Legacy safeFilePart: no characters Windows refuses in file names. */
export function safeFilePart(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

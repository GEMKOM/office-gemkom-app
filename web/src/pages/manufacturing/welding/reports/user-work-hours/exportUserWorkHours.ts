import type { OvertimeBucket, UserWorkHoursRow } from '@/api/welding/userWorkHours';
import { toNumber, type NumberInput } from '@/lib/format';

const HEADERS = [
  'Çalışan',
  'Kullanıcı Adı',
  'Toplam Saat',
  'Normal Saat (1x)',
  'Normal İş No',
  'Fazla Mesai Saat (1.5x)',
  'Fazla Mesai İş No',
  'Tatil Saat (2x)',
  'Tatil İş No',
];
// Legacy column widths, in characters.
const WIDTHS = [20, 15, 12, 15, 30, 18, 30, 12, 30];
const HOURS_FORMAT = '0.00';

const hours = (value: NumberInput) => Math.round((toNumber(value) ?? 0) * 100) / 100;
const jobs = (bucket?: OvertimeBucket) => (bucket?.job_nos ?? []).join(', ') || '-';

/**
 * Port of legacy handleExport: one sheet with the hours and job numbers per
 * overtime type, named after the report's date range. Hours stay numbers
 * (two decimals) so the sheet sums.
 */
export async function exportUserWorkHours(
  users: readonly UserWorkHoursRow[],
  range: { start: string; end: string },
): Promise<void> {
  // SheetJS stays out of the page bundle until the first export.
  const XLSX = await import('xlsx');
  const body = users.map((user) => {
    const regular = user.by_overtime_type?.regular;
    const afterHours = user.by_overtime_type?.after_hours;
    const holiday = user.by_overtime_type?.holiday;
    return [
      user.employee_full_name || '-',
      user.employee_username || '-',
      hours(user.total_hours),
      hours(regular?.hours),
      jobs(regular),
      hours(afterHours?.hours),
      jobs(afterHours),
      hours(holiday?.hours),
      jobs(holiday),
    ];
  });

  const sheet = XLSX.utils.aoa_to_sheet([HEADERS, ...body]);
  body.forEach((cells, r) => {
    cells.forEach((value, c) => {
      const cell = sheet[XLSX.utils.encode_cell({ r: r + 1, c })] as
        { t?: string; z?: string } | undefined;
      if (typeof value === 'number' && cell) cell.z = HOURS_FORMAT;
    });
  });
  sheet['!cols'] = WIDTHS.map((wch) => ({ wch }));

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Çalışan Çalışma Saatleri');
  XLSX.writeFile(book, `calisan_calisma_saatleri_${range.start}_${range.end}.xlsx`);
}

import {
  fetchSubcontractors,
  type Subcontractor,
  type SubcontractorsParams,
} from '@/api/subcontracting/subcontractors';

// UTF-8 byte order mark so Excel reads the Turkish letters.
const BOM = String.fromCharCode(0xfeff);

const HEADERS = [
  'Firma Adı',
  'Kısa Ad',
  'İletişim Kişisi',
  'Telefon',
  'E-posta',
  'Adres',
  'Vergi No',
  'Vergi Dairesi',
  'Banka Bilgisi',
  'Para Birimi',
  'Durum',
];

function csvRow(s: Subcontractor): string[] {
  return [
    s.name || '',
    s.short_name || '',
    s.contact_person || '',
    s.phone || '',
    s.email || '',
    s.address || '',
    s.tax_id || '',
    s.tax_office || '',
    s.bank_info || '',
    s.default_currency || '',
    s.is_active ? 'Aktif' : 'Pasif',
  ];
}

/** Every cell quoted, quotes doubled, rows joined with \n (legacy exportSubcontractors). */
export function toCsv(rows: Subcontractor[]): string {
  return [HEADERS, ...rows.map(csvRow)]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

/**
 * Port of legacy exportSubcontractors: one request with page_size=10000 and
 * the current filters (no ordering, as legacy), written as a UTF-8 CSV with a
 * BOM so Excel reads the Turkish letters. Returns the row count.
 */
export async function exportSubcontractors(
  params: Pick<SubcontractorsParams, 'search' | 'is_active'>,
): Promise<number> {
  const response = await fetchSubcontractors({ ...params, page_size: 10000 });
  const blob = new Blob([BOM + toCsv(response.results)], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const href = URL.createObjectURL(blob);
  link.href = href;
  link.download = `taseronlar_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 0);
  return response.results.length;
}

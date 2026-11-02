import {
  fetchMaterialPullRequest,
  type MaterialPullRequest,
} from '@/api/materialTracking/pullRequests';
import { toDate } from '@/lib/format';

function destinationTypeLabel(type: string | undefined): string {
  if (type === 'subcontractor') return 'Taşeron';
  if (type === 'team') return 'Kaynak Ekibi';
  return type || '';
}

function excelDate(value: string | null | undefined): Date | '' {
  return toDate(value) ?? '';
}

function optionalNumber(value: string | number | null | undefined): number | '' {
  return value != null ? Number(value) : '';
}

/**
 * Port of exportRequestExcel: one .xlsx per request, a header block then one
 * row per line (the same layout as the warehouse export). A list row has no
 * items, so the request is fetched first.
 */
export async function exportPullRequest(requestOrRow: MaterialPullRequest): Promise<void> {
  const request = Array.isArray(requestOrRow.items)
    ? requestOrRow
    : await fetchMaterialPullRequest(requestOrRow.id);

  const header: (string | Date)[][] = [
    ['Talep No', request.number || ''],
    ['Durum', request.status_label || request.status || ''],
    ['Hedef', request.destination_name || ''],
    ['Hedef Türü', destinationTypeLabel(request.destination_type)],
    ['Talep Eden', request.requested_by_name || request.requested_by_username || ''],
    ['Talep Tarihi', excelDate(request.requested_at)],
    ['Teslim Eden', request.confirmed_by_name || request.confirmed_by_username || ''],
    ['Teslim Tarihi', excelDate(request.confirmed_at)],
  ];
  if (request.status === 'cancelled') {
    header.push(['İptal Eden', request.cancelled_by_name || '']);
    header.push(['İptal Tarihi', excelDate(request.cancelled_at)]);
  }
  header.push(['Not', request.note || '']);

  const tableHeader = [
    '#',
    'İş Emri',
    'Stok Kodu',
    'Malzeme',
    'Miktar',
    'Birim',
    'Teslim Alınan',
    'Çekilen',
    'Depoda Kalan',
  ];
  const lines = (request.items ?? []).map((item, i) => [
    i + 1,
    item.job_no || '',
    item.item_code || '',
    item.item_name || '',
    Number(item.quantity ?? 0),
    item.item_unit || '',
    optionalNumber(item.delivered_quantity),
    optionalNumber(item.pulled_quantity),
    optionalNumber(item.quantity_available_to_pull),
  ]);

  // SheetJS stays out of the page bundle until the first export.
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet([...header, [], tableHeader, ...lines], { cellDates: true });
  ws['!cols'] = [
    { wch: 16 },
    { wch: 18 },
    { wch: 18 },
    { wch: 40 },
    { wch: 12 },
    { wch: 8 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
  ];
  ws['!merges'] = header.map((_, r) => ({ s: { r, c: 1 }, e: { r, c: 5 } }));
  for (const addr of Object.keys(ws)) {
    if (addr.startsWith('!')) continue;
    const cell = ws[addr] as { v?: unknown; z?: string } | undefined;
    if (cell && cell.v instanceof Date) cell.z = 'dd.mm.yyyy hh:mm';
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Talep');
  const safeNumber = String(request.number || request.id).replace(/[^A-Za-z0-9_-]+/g, '_');
  XLSX.writeFile(wb, `depo-cekme_${safeNumber}.xlsx`);
}

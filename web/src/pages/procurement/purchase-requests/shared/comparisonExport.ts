import {
  convertCurrency,
  hasOffer,
  supplierTotals,
  type ComparisonColumn,
  type ComparisonData,
} from './comparison';
import type { CurrencyRates } from '@/api/procurement/purchaseRequests';

// Port of ComparisonTable.exportToCSV / exportToExcel. Fixed column order
// (not columnOrder), like legacy. The legacy TOPLAM rows read fields that did
// not exist and came out blank; here they carry the supplier totals.

const tr = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const EXPORT_ORDER: ComparisonColumn[] = [
  'unitPrice',
  'deliveryDays',
  'originalTotal',
  'euroTotal',
  'recommendations',
];
const HEADER: Record<ComparisonColumn, string> = {
  unitPrice: 'Birim Fiyat',
  deliveryDays: 'Teslim Süresi',
  originalTotal: 'Toplam',
  euroTotal: 'Euro Toplam',
  recommendations: 'Öneri',
};

export function comparisonRows(
  data: ComparisonData,
  columns: readonly ComparisonColumn[],
  rates: CurrencyRates | null | undefined,
  withSummary: boolean,
): string[][] {
  const visible = EXPORT_ORDER.filter((c) => columns.includes(c));
  const header = ['Malzeme', 'İş No', 'Miktar', 'Birim', 'Teknik Özellikler'];
  for (const s of data.suppliers) for (const c of visible) header.push(`${s.name} - ${HEADER[c]}`);
  const rows: string[][] = [header];
  for (const item of data.items) {
    const qty = parseFloat(String(item.quantity));
    const row = [
      item.name,
      item.job_no,
      Number.isFinite(qty) ? tr.format(qty) : '',
      item.unit,
      item.specifications,
    ];
    for (const s of data.suppliers) {
      const cur = s.default_currency || '';
      const offer = data.offers[s.id]?.[item.key];
      for (const c of visible) {
        if (!offer) {
          row.push('');
          continue;
        }
        if (c === 'unitPrice')
          row.push(offer.unitPrice ? `${tr.format(offer.unitPrice)} ${cur}` : '');
        else if (c === 'deliveryDays')
          row.push(offer.deliveryDays ? String(offer.deliveryDays) : '');
        else if (c === 'originalTotal')
          row.push(offer.totalPrice ? `${tr.format(offer.totalPrice)} ${cur}` : '');
        else if (c === 'euroTotal')
          row.push(
            offer.totalPrice
              ? `€${tr.format(convertCurrency(offer.totalPrice, cur || 'TRY', 'EUR', rates))}`
              : '',
          );
        else row.push(data.recommendations[item.key] === s.id ? 'Önerilen' : '');
      }
    }
    rows.push(row);
  }
  if (withSummary) {
    const row = ['TOPLAM', '', '', '', ''];
    for (const s of data.suppliers) {
      const totals = supplierTotals(s.id, data.items, data.offers);
      const cur = s.default_currency || '';
      for (const c of visible) {
        if (c === 'originalTotal') row.push(`${tr.format(totals.originalTotal)} ${cur}`);
        else if (c === 'euroTotal')
          row.push(
            `€${tr.format(convertCurrency(totals.originalTotal, cur || 'TRY', 'EUR', rates))}`,
          );
        else row.push('');
      }
    }
    rows.push(row);
  }
  return rows;
}

function escapeCsv(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportComparisonCsv(rows: string[][], fileName = 'comparison-table') {
  const csv = rows.map((r) => r.map(escapeCsv).join(',')).join('\n');
  download(new Blob([csv], { type: 'text/csv' }), `${fileName}.csv`);
}

export async function exportComparisonExcel(
  data: ComparisonData,
  rows: string[][],
  fileName = 'comparison-table',
  withSummarySheet = false,
) {
  const XLSX = await import('xlsx');
  const book = XLSX.utils.book_new();
  const aoa: string[][] = [
    ['KARŞILAŞTIRMA TABLOSU'],
    [],
    ...rows.slice(0, 1),
    [],
    ...rows.slice(1),
  ];
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(aoa), 'Karşılaştırma');
  if (withSummarySheet) {
    const summary: (string | number)[][] = [
      ['ÖZET BİLGİLERİ'],
      [],
      ['Malzeme Özeti'],
      ['Toplam Malzeme', data.items.length],
      [],
      ['Tedarikçi Özeti'],
    ];
    for (const s of data.suppliers) {
      const totals = supplierTotals(s.id, data.items, data.offers);
      summary.push(
        [s.name, ''],
        ['Toplam Fiyat', `${tr.format(totals.originalTotal)} ${s.default_currency || ''}`],
        [],
      );
    }
    summary.push(['Öneri Özeti']);
    for (const s of data.suppliers) {
      const count = data.items.filter(
        (i) => data.recommendations[i.key] === s.id && hasOffer(data.offers[s.id]?.[i.key]),
      ).length;
      if (count) summary.push([s.name, `${count} malzeme`]);
    }
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(summary), 'Özet');
  }
  XLSX.writeFile(book, `${fileName}.xlsx`);
}

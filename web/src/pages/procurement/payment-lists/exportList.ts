import type { PaymentList } from '@/api/procurement/paymentLists';
import { customersOf, fmtDate, jobNosOf, num, rowEur } from './format';

const HEADER = [
  '#',
  'MÜŞTERİ',
  'İŞ NO',
  'GS NO',
  'MALZEME',
  'TEDARİKÇİ',
  'TOPLAM TUTAR (KDV DAHİL)',
  'PARA BİRİMİ',
  'BU ÖDEME',
  'EUR',
  'ÖDEME ŞEKLİ',
  'SİPARİŞ TARİHİ',
  'VADE',
  'PROFORMA',
  'AÇIKLAMA',
  'DURUM',
];

type Cell = string | number | null | undefined;

/** The sheet as an array of rows: same layout as the old Excel (legacy exportToXlsx). */
export function paymentListSheet(data: PaymentList): Cell[][] {
  const fx = data.fx ?? {};
  const t = data.totals ?? {};
  const rows: Cell[][] = (data.items ?? []).map((it) => [
    it.sequence,
    customersOf(it).join(', '),
    jobNosOf(it).join(', '),
    (it.gs_numbers ?? []).join(', '),
    it.items_summary || '',
    it.supplier?.name || '',
    num(it.po?.gross_total),
    it.currency,
    num(it.gross_amount),
    rowEur(it),
    `${it.schedule_sequence ?? it.sequence}/${it.schedule_count} ${it.label || it.basis_label || ''} (${it.terms?.name || it.basis_label || ''})`.trim(),
    it.po?.created_at ? fmtDate(it.po.created_at) : '',
    it.due_date ? fmtDate(it.due_date) : '',
    it.po?.proforma_count || 0,
    [it.is_urgent ? 'ACİL' : '', it.note].filter(Boolean).join(' · '),
    it.po_cancelled
      ? 'SİPARİŞ İPTAL'
      : it.is_paid
        ? 'ÖDENDİ'
        : it.is_excluded
          ? `ÇIKARILDI — ${it.exclusion_reason || ''}`
          : 'BEKLİYOR',
  ]);
  return [
    [data.title],
    ['Tarih', fmtDate(data.list_date), '1 € =', num(fx.eur_try), 'TL', '1 $ =', num(fx.usd_try), 'TL', 'Bütçe (EUR)', num(data.budget_eur)],
    [],
    HEADER,
    ...rows,
    [],
    ['TOPLAM (EUR)', '', '', '', '', '', '', '', '', num(t.total_eur)],
    ['ÖDENEN (EUR)', '', '', '', '', '', '', '', '', num(t.paid_eur)],
    ['KALAN (EUR)', '', '', '', '', '', '', '', '', num(t.remaining_eur)],
  ];
}

/** Writes odeme_listesi_<date>.xlsx. SheetJS loads on the first export. */
export async function exportPaymentList(data: PaymentList): Promise<void> {
  const XLSX = await import('xlsx');
  const aoa = paymentListSheet(data);
  const itemCount = (data.items ?? []).length;
  const ws = XLSX.utils.aoa_to_sheet(aoa.map((row) => row.map((c) => (c === undefined ? null : c))));
  const numericCols = [6, 8, 9];
  for (let r = 4; r < 4 + itemCount; r++) {
    numericCols.forEach((c) => {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && typeof cell.v === 'number') {
        cell.t = 'n';
        cell.z = '#,##0.00';
      }
    });
  }
  ws['!cols'] = HEADER.map((h, i) => ({ wch: i === 4 ? 40 : Math.max(12, h.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, (fmtDate(data.list_date) || 'Liste').replace(/[\\/?*[\]:]/g, '-').slice(0, 30));
  XLSX.writeFile(wb, `odeme_listesi_${data.list_date || data.id}.xlsx`);
}

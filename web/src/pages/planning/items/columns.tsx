import type { PlanningItem } from '@/api/planning/planningItems';
import { toNumber } from '@/lib/format';
import { StatusBadge, type DataTableColumn, type StatusFamily } from '@/ui';
import { BoolIcon, formatEuro, raw, textOrDash, ValueBadge } from './cells';
import { DeliveryState, deliveryStateText } from './deliveryState';

/** quantity × latest_unit_price_eur, null when either is missing. */
export function rowTotalEur(row: PlanningItem): number | null {
  const qty = toNumber(row.quantity);
  const unit = toNumber(row.latest_unit_price_eur);
  return qty === null || unit === null ? null : qty * unit;
}

/** sumTotalEuro: the rows that have both numbers. */
export function sumTotalEur(rows: readonly PlanningItem[]): number {
  return rows.reduce((acc, row) => acc + (rowTotalEur(row) ?? 0), 0);
}

const PRICE_SOURCES: Record<string, { label: string; color: StatusFamily; title: string }> = {
  po_line: {
    label: 'PO',
    color: 'green',
    title:
      'Bu kalem için satınalma siparişi (PO) oluşturuldu. Fiyat, onaylı sipariş satırından gelir.',
  },
  recommended_offer: {
    label: 'ÖNERİLEN TEKLİF',
    color: 'blue',
    title:
      'Henüz PO yok. Tedarikçi teklifi “önerilen” olarak işaretlenmiş; fiyat bu tekliften gelir.',
  },
  any_offer: {
    label: 'TEKLİF VAR',
    color: 'yellow',
    title:
      'Henüz PO yok ve önerilen teklif yok. En az bir tedarikçi teklifi var; fiyat bu tekliflerden gelir.',
  },
  historical_po: {
    label: 'GEÇMİŞ PO',
    color: 'grey',
    title:
      'Bu kalem/talep için PO/teklif yok. Fiyat, sistemde aynı katalog kaleminin en son PO satırından alınır.',
  },
};

function priceSourceLabel(value: string | null | undefined): string {
  if (!value) return 'YOK';
  return PRICE_SOURCES[value]?.label ?? String(value);
}

function PriceSource({ value }: { value: string | null | undefined }) {
  if (!value) return <ValueBadge value="YOK" color="grey" title="Fiyat bulunamadı." />;
  const def = PRICE_SOURCES[value];
  if (!def)
    return <ValueBadge value={String(value)} color="grey" title="Bilinmeyen fiyat kaynağı." />;
  return <ValueBadge value={def.label} color={def.color} title={def.title} />;
}

function Consumed({ row }: { row: PlanningItem }) {
  if (row.is_consumed !== true) return <BoolIcon value={row.is_consumed} />;
  const who = row.consumed_by_username ? ` (${row.consumed_by_username})` : '';
  return (
    <span title={`Fiziksel stok tükendi${who} — yeni CNC kesimleri için seçilemez`}>
      <StatusBadge color="purple">Kullanıldı</StatusBadge>
    </span>
  );
}

const yesNo = (value: boolean | null | undefined) =>
  value === true ? 'Evet' : value === false ? 'Hayır' : '-';

/** Key of the Toplam (€) column; the footer puts TOPLAM: one cell before it. */
export const TOTAL_COLUMN_KEY = '__total_price_eur';

// Module scope so DataTable rows stay memoized. Sortable set = legacy onSort's
// orderable fields (id, item_code, item_name, job_no).
export const planningItemColumns: DataTableColumn<PlanningItem>[] = [
  { key: 'id', header: 'ID', sortable: true, render: (row) => raw(row.id) },
  {
    key: 'item_code',
    header: 'Ürün Kodu',
    sortable: true,
    render: (row) => textOrDash(row.item_code),
  },
  {
    key: 'item_name',
    header: 'Ürün Adı',
    sortable: true,
    render: (row) => textOrDash(row.item_name),
  },
  {
    key: 'planning_request_number',
    header: 'Talep No',
    render: (row) => <ValueBadge value={row.planning_request_number} color="blue" />,
  },
  {
    key: 'job_no',
    header: 'İş No',
    sortable: true,
    render: (row) => <ValueBadge value={row.job_no} color="grey" />,
  },
  { key: 'quantity', header: 'Miktar', render: (row) => raw(row.quantity) },
  {
    key: 'quantity_from_inventory',
    header: 'Stoktan',
    render: (row) => raw(row.quantity_from_inventory),
  },
  {
    key: 'quantity_to_purchase',
    header: 'Satın Alınacak',
    render: (row) => raw(row.quantity_to_purchase),
  },
  { key: 'item_unit', header: 'Birim', render: (row) => textOrDash(row.item_unit) },
  {
    key: 'latest_unit_price_eur',
    header: 'Son Birim Fiyat (€)',
    render: (row) => formatEuro(row.latest_unit_price_eur),
    exportValue: (row) => toNumber(row.latest_unit_price_eur),
    exportFormat: '#,##0.00 "€"',
  },
  {
    key: TOTAL_COLUMN_KEY,
    header: 'Toplam (€)',
    render: (row) => formatEuro(rowTotalEur(row)),
    exportValue: rowTotalEur,
    exportFormat: '#,##0.00 "€"',
  },
  {
    key: 'latest_unit_price_source',
    header: 'Fiyat Kaynağı',
    render: (row) => <PriceSource value={row.latest_unit_price_source} />,
    exportValue: (row) => priceSourceLabel(row.latest_unit_price_source),
  },
  {
    key: 'is_delivered',
    header: 'Teslim',
    render: (row) => <DeliveryState row={row} />,
    exportValue: deliveryStateText,
  },
  {
    key: 'is_consumed',
    header: 'Kullanıldı',
    render: (row) => <Consumed row={row} />,
    exportValue: (row) => yesNo(row.is_consumed),
  },
  {
    key: 'cnc_cuts_count',
    header: 'CNC Kesim',
    render: (row) => (row.cnc_cuts_count ? `${row.cnc_cuts_count}` : '-'),
  },
  {
    key: 'purchase_request_number',
    header: 'Satın Alma PR No',
    render: (row) => <ValueBadge value={row.purchase_request_number} color="green" />,
  },
];

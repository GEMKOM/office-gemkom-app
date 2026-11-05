import { Text } from '@mantine/core';
import type { Item, ItemRequest } from '@/api/procurement/items';
import { formatCurrency, formatDate, formatNumber, toNumber } from '@/lib/format';
import { StatusBadge, type DataTableColumn, type StatusFamily } from '@/ui';
import uiClasses from '@/ui/ui.module.css';

const dash = (value: unknown) =>
  value === null || value === undefined || value === '' ? '-' : String(value as string | number);

function Badge({ label, color, title }: { label: string; color: StatusFamily; title?: string }) {
  return (
    <span title={title}>
      <StatusBadge color={color}>{label}</StatusBadge>
    </span>
  );
}

/** Legacy renderEuro: '-' for anything that is not a finite number. */
export function renderEuro(value: number | string | null | undefined): string {
  return toNumber(value) === null ? '-' : formatCurrency(value, 'EUR');
}

const PRICE_SOURCES: Record<string, { label: string; color: StatusFamily; title: string }> = {
  po_line: {
    label: 'PO',
    color: 'green',
    title:
      'Bu ürün için satınalma siparişi (PO) oluşturuldu. Fiyat, onaylı sipariş satırından gelir.',
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
      'Bu ürün için PO/teklif yok. Fiyat, sistemde aynı katalog kaleminin en son PO satırından alınır.',
  },
};

function PriceSource({ value }: { value: Item['latest_unit_price_source'] }) {
  if (!value) return <Badge label="YOK" color="grey" title="Fiyat bulunamadı." />;
  const def = PRICE_SOURCES[value];
  if (!def) return <Badge label={String(value)} color="grey" title="Bilinmeyen fiyat kaynağı." />;
  return <Badge label={def.label} color={def.color} title={def.title} />;
}

/** A stock-ledger quantity: red below zero, dimmed at zero, '-' when unknown. */
function StockQuantity({ value }: { value: number | string | null | undefined }) {
  const n = toNumber(value);
  if (n === null) return <>-</>;
  return (
    <Text size="sm" fw={500} c={n < 0 ? 'red.8' : n > 0 ? 'green.8' : 'dimmed'}>
      {formatNumber(value, 2)}
    </Text>
  );
}

const unitLabel = (row: Item) => row.unit_label || row.unit || '-';
const typeLabel = (row: Item) => row.item_type_label || row.item_type || '-';

// Module scope so DataTable rows stay memoized. Sortable set and ordering
// fields = legacy table (it sent the column field as `ordering`).
export const itemColumns: DataTableColumn<Item>[] = [
  {
    key: 'code',
    header: 'Ürün Kodu',
    sortable: true,
    render: (row) => <span className={uiClasses.code}>{row.code || '-'}</span>,
  },
  {
    key: 'name',
    header: 'Ürün Adı',
    sortable: true,
    render: (row) => (
      <Text fw={500} size="sm">
        {row.name || '-'}
      </Text>
    ),
  },
  {
    key: 'category_code',
    header: 'Aile',
    sortable: false,
    render: (row) =>
      row.category_code ? (
        <span title={[row.category_group, row.category_name].filter(Boolean).join(' · ')}>
          <span className={uiClasses.code}>{row.category_code}</span>{' '}
          <Text span size="xs" c="dimmed">
            {row.category_name}
          </Text>
        </span>
      ) : (
        '-'
      ),
  },
  {
    key: 'is_active',
    header: 'Durum',
    sortable: false,
    render: (row) =>
      row.is_active === false ? (
        <Badge
          label="Pasif"
          color="grey"
          title="Eski satırlarda kalır; yeni talep aramasında en sonda listelenir."
        />
      ) : (
        <Badge label="Aktif" color="green" />
      ),
  },
  {
    key: 'unit_label',
    header: 'Birim',
    sortable: true,
    accessor: unitLabel,
    render: (row) =>
      unitLabel(row) === '-' ? '-' : <StatusBadge color="grey">{unitLabel(row)}</StatusBadge>,
  },
  {
    key: 'item_type_label',
    header: 'Tip',
    sortable: true,
    accessor: typeLabel,
    render: (row) =>
      typeLabel(row) === '-' ? '-' : <StatusBadge color="blue">{typeLabel(row)}</StatusBadge>,
  },
  {
    key: 'stock_quantity',
    header: 'Hammadde',
    sortable: true,
    align: 'right',
    render: (row) => <StockQuantity value={row.stock_quantity} />,
  },
  {
    key: 'job_area_quantity',
    header: 'İş Emri',
    sortable: false,
    align: 'right',
    render: (row) => <StockQuantity value={row.job_area_quantity} />,
  },
  {
    key: 'finished_quantity',
    header: 'Mamul',
    sortable: false,
    align: 'right',
    render: (row) => <StockQuantity value={row.finished_quantity} />,
  },
  {
    key: 'latest_unit_price_eur',
    header: 'Son Birim Fiyat (€)',
    sortable: true,
    align: 'right',
    render: (row) => renderEuro(row.latest_unit_price_eur),
  },
  {
    key: 'latest_unit_price_source',
    header: 'Fiyat Kaynağı',
    sortable: false,
    render: (row) => <PriceSource value={row.latest_unit_price_source} />,
  },
];

const statusOf = (row: ItemRequest) => row.status_label || row.status || '-';
const quantityOf = (row: ItemRequest) => row.item_details?.quantity;

function requestBase(statusColor: StatusFamily): DataTableColumn<ItemRequest>[] {
  return [
    {
      key: 'request_number',
      header: 'Talep No',
      sortable: true,
      render: (row) => (
        <Text fw={600} size="sm">
          {dash(row.request_number)}
        </Text>
      ),
    },
    { key: 'title', header: 'Başlık', sortable: true, render: (row) => dash(row.title) },
    {
      key: 'status_label',
      header: 'Durum',
      sortable: true,
      accessor: statusOf,
      render: (row) =>
        statusOf(row) === '-' ? (
          '-'
        ) : (
          <StatusBadge color={statusColor}>{statusOf(row)}</StatusBadge>
        ),
    },
    { key: 'priority', header: 'Öncelik', sortable: true, render: (row) => dash(row.priority) },
    {
      key: 'requestor',
      header: 'Talep Eden',
      sortable: true,
      render: (row) => dash(row.requestor),
    },
    {
      key: 'created_at',
      header: 'Oluşturulma',
      sortable: true,
      render: (row) => (row.created_at ? formatDate(row.created_at) : '-'),
    },
  ];
}

const quantityColumn: DataTableColumn<ItemRequest> = {
  key: 'item_details.quantity',
  header: 'Miktar',
  sortable: false,
  render: (row) => dash(quantityOf(row)),
};

export const purchaseRequestColumns: DataTableColumn<ItemRequest>[] = [
  ...requestBase('blue'),
  quantityColumn,
  {
    key: 'total_amount_eur',
    header: 'Toplam Tutar',
    sortable: true,
    accessor: (row) => toNumber(row.total_amount_eur),
    render: (row) =>
      row.total_amount_eur ? (
        <Text size="sm" fw={500} c="green.8">
          {formatNumber(row.total_amount_eur, 2)} €
        </Text>
      ) : (
        '-'
      ),
  },
];

export const planningRequestColumns: DataTableColumn<ItemRequest>[] = [
  ...requestBase('green'),
  {
    key: 'needed_date',
    header: 'İhtiyaç Tarihi',
    sortable: true,
    render: (row) => (row.needed_date ? formatDate(row.needed_date) : '-'),
  },
  {
    key: 'item_details.job_no',
    header: 'İş No',
    sortable: false,
    render: (row) => row.item_details?.job_no || '-',
  },
  quantityColumn,
];

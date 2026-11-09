import { Anchor, Text } from '@mantine/core';
import type { PlanningItem } from '@/api/planning/planningItems';
import { hasRouteAccess } from '@/auth/accessControl';
import { formatDate, toNumber } from '@/lib/format';
import { planningItemColumns } from '@/pages/planning/items/columns';
import { StatusBadge, type DataTableColumn, type StatusFamily } from '@/ui';
import { daysLate, DueDate } from '../shared/dueDates';

// Satın Alma Kalemleri: the planning item columns procurement needs, plus where
// each line stands in purchasing (PR, order, supplier, expected delivery,
// ordered vs received, price).

const PR_STATUS_COLORS: Record<string, StatusFamily> = {
  submitted: 'yellow',
  approved: 'green',
};
const PRIORITY_LABELS: Record<string, string> = {
  normal: 'Normal',
  urgent: 'Acil',
  critical: 'Kritik',
};
const PRIORITY_COLORS: Record<string, StatusFamily> = {
  normal: 'grey',
  urgent: 'orange',
  critical: 'red',
};

const quantity = (value: unknown) => {
  const n = toNumber(value as string | number | null | undefined);
  return n === null ? '-' : n.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
};

/** "+2" when the line is on more than one PR / order. */
function More({ count, what }: { count: number | undefined; what: string }) {
  if (!count || count < 2) return null;
  return (
    <Text span size="xs" c="dimmed" ml={4} title={`${count} ${what}; en sonuncusu gösteriliyor`}>
      {`+${count - 1}`}
    </Text>
  );
}

/** Ordered by the line's due date has passed and it isn't fully received. */
export function isDeliveryLate(row: PlanningItem, now: Date = new Date()): boolean {
  return !row.is_delivered && daysLate(row.procurement?.po_expected_delivery, now) > 0;
}

function PurchaseOrder({ row }: { row: PlanningItem }) {
  const p = row.procurement;
  if (!p?.po_id) return <>-</>;
  const label = `#${p.po_id}`;
  return (
    <>
      {hasRouteAccess('/finance/purchase-orders') ? (
        <Anchor
          href={`/finance/purchase-orders?order=${p.po_id}`}
          target="_blank"
          rel="noopener"
          size="sm"
        >
          {label}
        </Anchor>
      ) : (
        label
      )}
      <More count={p.po_count} what="sipariş" />
    </>
  );
}

const pick = (keys: string[]) =>
  keys.map((key) => {
    const column = planningItemColumns.find((c) => c.key === key);
    if (!column) throw new Error(`planning item column ${key} is missing`);
    return column;
  });

const [code, name, request, job, toPurchase, unit, delivered] = pick([
  'item_code',
  'item_name',
  'planning_request_number',
  'job_no',
  'quantity_to_purchase',
  'item_unit',
  'is_delivered',
]);

export const procurementItemColumns: DataTableColumn<PlanningItem>[] = [
  code!,
  name!,
  { ...request!, sortable: true },
  job!,
  {
    key: 'needed_date',
    header: 'İhtiyaç Tarihi',
    sortable: true,
    render: (row) => (
      <DueDate
        value={row.needed_date}
        done={row.is_delivered === true}
        lateTitle="İhtiyaç tarihi geçti"
      />
    ),
    exportValue: (row) => row.needed_date ?? '',
  },
  {
    key: 'request_priority',
    header: 'Öncelik',
    hideBelow: 1500,
    render: (row) =>
      row.request_priority ? (
        <StatusBadge color={PRIORITY_COLORS[row.request_priority] ?? 'grey'}>
          {row.request_priority_label ||
            PRIORITY_LABELS[row.request_priority] ||
            row.request_priority}
        </StatusBadge>
      ) : (
        '-'
      ),
    exportValue: (row) => row.request_priority_label ?? '',
  },
  {
    key: 'pr_number',
    header: 'Satın Alma Talebi',
    render: (row) => {
      const p = row.procurement;
      if (!p?.pr_number)
        return (
          <Text span size="sm" c="dimmed">
            Talep yok
          </Text>
        );
      return (
        <>
          <Anchor
            href={`/procurement/purchase-requests/registry/?talep=${encodeURIComponent(p.pr_number)}`}
            target="_blank"
            rel="noopener"
            size="sm"
          >
            {p.pr_number}
          </Anchor>
          <More count={p.pr_count} what="talep" />{' '}
          <StatusBadge color={PR_STATUS_COLORS[p.pr_status ?? ''] ?? 'grey'}>
            {p.pr_status_label || p.pr_status}
          </StatusBadge>
        </>
      );
    },
    exportValue: (row) =>
      row.procurement?.pr_number
        ? `${row.procurement.pr_number} (${row.procurement.pr_status_label ?? ''})`
        : '',
  },
  {
    key: 'po_id',
    header: 'Sipariş',
    render: (row) => <PurchaseOrder row={row} />,
    exportValue: (row) => (row.procurement?.po_id ? `#${row.procurement.po_id}` : ''),
  },
  {
    key: 'po_supplier_name',
    header: 'Tedarikçi',
    maxWidth: 'clamp(110px, 10vw, 240px)',
    render: (row) => row.procurement?.po_supplier_name || '-',
    exportValue: (row) => row.procurement?.po_supplier_name ?? '',
  },
  {
    key: 'po_ordered_at',
    header: 'Sipariş Tarihi',
    hideBelow: 1500,
    render: (row) =>
      row.procurement?.po_ordered_at ? formatDate(row.procurement.po_ordered_at) : '-',
    exportValue: (row) => row.procurement?.po_ordered_at ?? '',
  },
  {
    key: 'po_expected_delivery',
    header: 'Beklenen Teslim',
    render: (row) =>
      row.procurement?.po_expected_delivery ? (
        <DueDate
          value={row.procurement.po_expected_delivery}
          done={row.is_delivered === true}
          lateTitle="Beklenen teslim tarihi geçti, teslim alınmadı"
        />
      ) : row.procurement?.po_id ? (
        <Text span size="sm" c="dimmed" title="Sipariş satırında teslim süresi yok">
          Süre yok
        </Text>
      ) : (
        '-'
      ),
    exportValue: (row) => row.procurement?.po_expected_delivery ?? '',
  },
  toPurchase!,
  {
    key: 'ordered_quantity',
    header: 'Sipariş Edilen',
    align: 'right',
    render: (row) => (row.procurement ? quantity(row.procurement.ordered_quantity) : '-'),
    exportValue: (row) => toNumber(row.procurement?.ordered_quantity ?? null),
  },
  {
    key: 'delivered_quantity',
    header: 'Teslim Alınan',
    align: 'right',
    render: (row) => quantity(row.delivered_quantity),
    exportValue: (row) => toNumber(row.delivered_quantity ?? null),
  },
  unit!,
  {
    key: 'po_unit_price',
    header: 'Birim Fiyat',
    align: 'right',
    render: (row) => {
      const p = row.procurement;
      const price = toNumber(p?.po_unit_price ?? null);
      if (price === null) return '-';
      return `${price.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${p?.po_currency ?? ''}`;
    },
    exportValue: (row) => toNumber(row.procurement?.po_unit_price ?? null),
  },
  delivered!,
];

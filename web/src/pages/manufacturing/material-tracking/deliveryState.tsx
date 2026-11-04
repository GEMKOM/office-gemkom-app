import { Text } from '@mantine/core';
import { formatNumber, toNumber } from '@/lib/format';
import { FaIcon, StatusBadge, type FilterOption } from '@/ui';

// Port of utils/deliveryState.js for the Malzeme takibi pages: a planning item
// line is fully received, partially received (some shipments landed, the rest
// is awaited) or not received. The backend derives is_delivered /
// delivered_quantity from the receipt log; the UI only renders them.

type Qty = string | number | null | undefined;

export interface DeliveryFields {
  is_delivered?: boolean | null;
  delivered_quantity?: Qty;
  quantity?: Qty;
  item_unit?: string | null;
}

const QTY_FORMAT: Intl.NumberFormatOptions = { minimumFractionDigits: 0, maximumFractionDigits: 2 };

/** Legacy fmtQty: "1.234,5", '-' when not a number. */
export function fmtQty(value: Qty): string {
  const n = toNumber(value);
  return n === null ? '-' : formatNumber(n, QTY_FORMAT);
}

/** Legacy toNumber(x || 0). */
export function qty(value: Qty): number {
  return toNumber(value) ?? 0;
}

export function isPartiallyDelivered(row: DeliveryFields | null | undefined): boolean {
  if (!row) return false;
  return row.is_delivered !== true && qty(row.delivered_quantity) > 0;
}

function partialText(row: DeliveryFields): string {
  return `${fmtQty(row.delivered_quantity)} / ${fmtQty(row.quantity)} ${row.item_unit || ''}`.trim();
}

/** Legacy renderDeliveryState: check, partial badge, cross or '-'. */
export function DeliveryState({ row }: { row: DeliveryFields | null | undefined }) {
  if (!row) return <>-</>;
  if (row.is_delivered === true) {
    return (
      <span title="Teslim edildi" aria-label="Teslim edildi">
        <FaIcon icon="fas fa-check" color="var(--mantine-color-green-7)" />
      </span>
    );
  }
  if (isPartiallyDelivered(row)) {
    const text = partialText(row);
    return (
      <span title={`Kısmi teslim: ${text} alındı, kalanı bekleniyor`}>
        <StatusBadge color="orange">Kısmi {text}</StatusBadge>
      </span>
    );
  }
  if (row.is_delivered === false) {
    return (
      <span title="Teslim edilmedi" aria-label="Teslim edilmedi">
        <FaIcon icon="fas fa-times" color="var(--mantine-color-red-7)" />
      </span>
    );
  }
  return (
    <Text span size="sm" c="dimmed">
      -
    </Text>
  );
}

/** Legacy deliveryStateText: plain text for exports. */
export function deliveryStateText(row: DeliveryFields | null | undefined): string {
  if (!row) return '';
  if (row.is_delivered === true) return 'Teslim edildi';
  if (isPartiallyDelivered(row)) return `Kısmi teslim (${partialText(row)})`;
  return 'Teslim edilmedi';
}

/** The "Teslim" filter; '' (Tümü) is the pill's clear option. */
export const DELIVERY_FILTER_OPTIONS: FilterOption[] = [
  { value: 'true', label: 'Teslim Edildi' },
  { value: 'partial', label: 'Kısmi Teslim' },
  { value: 'false', label: 'Teslim Edilmedi' },
];

/** Query params for the "Teslim" value ('' | 'true' | 'partial' | 'false'). */
export function deliveryFilterParams(value: string): {
  is_delivered?: string;
  partially_delivered?: string;
} {
  if (value === 'partial') return { is_delivered: 'false', partially_delivered: 'true' };
  return value ? { is_delivered: value } : {};
}

// Port of utils/deliveryState.js: the delivery state of a planning item line,
// shared by the tables that show "Teslim": fully received, partially received
// (some shipments landed, the rest is still awaited) or not received. The
// backend derives is_delivered / delivered_quantity from the receipt log; the
// UI only renders them.

import type { FilterOption } from '@/ui';
import { StatusBadge } from '@/ui';
import { BoolIcon } from './cells';

export interface DeliveryFields {
  is_delivered?: boolean | null;
  delivered_quantity?: string | number | null;
  quantity?: string | number | null;
  item_unit?: string | null;
}

export function fmtQty(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function isPartiallyDelivered(row: DeliveryFields | null | undefined): boolean {
  return !!row && row.is_delivered !== true && Number(row.delivered_quantity || 0) > 0;
}

function partialText(row: DeliveryFields): string {
  return `${fmtQty(row.delivered_quantity)} / ${fmtQty(row.quantity)} ${row.item_unit || ''}`.trim();
}

/** Icon / badge cell for a planning item row (renderDeliveryState). */
export function DeliveryState({ row }: { row: DeliveryFields | null | undefined }) {
  if (!row) return <>-</>;
  if (row.is_delivered === true) return <BoolIcon value title="Teslim edildi" />;
  if (isPartiallyDelivered(row)) {
    const text = partialText(row);
    return (
      <span
        title={`Kısmi teslim: ${text} alındı, kalanı bekleniyor`}
        style={{ whiteSpace: 'nowrap' }}
      >
        <StatusBadge color="orange">Kısmi {text}</StatusBadge>
      </span>
    );
  }
  if (row.is_delivered === false) return <BoolIcon value={false} title="Teslim edilmedi" />;
  return <>-</>;
}

/** Plain text for exports and tooltips. */
export function deliveryStateText(row: DeliveryFields | null | undefined): string {
  if (!row) return '';
  if (row.is_delivered === true) return 'Teslim edildi';
  if (isPartiallyDelivered(row)) return `Kısmi teslim (${partialText(row)})`;
  return 'Teslim edilmedi';
}

/** The "Teslim" filter; FilterBar adds the 'Tümü' entry itself. */
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
  return { is_delivered: value || undefined };
}

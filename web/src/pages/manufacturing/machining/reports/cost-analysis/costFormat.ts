import type { CostBreakdown } from '@/api/manufacturing/costAnalysis';
import { formatCurrency, formatNumber } from '@/lib/format';

/** "€1.234,50": legacy `€${value.toFixed(2)}` with tr-TR grouping. */
export const euro = (value: number | null | undefined) => formatCurrency(value || 0, 'EUR');

/** "12,5": legacy `value.toFixed(1)`. */
export const hoursOf = (value: number | null | undefined) => formatNumber(value || 0, 1);

export const sumHours = (hours: CostBreakdown | undefined) =>
  (hours?.weekday_work || 0) + (hours?.after_hours || 0) + (hours?.sunday || 0);

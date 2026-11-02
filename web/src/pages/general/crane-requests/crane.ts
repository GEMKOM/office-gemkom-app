import type { CraneRate, CraneRequest, CraneType } from '@/api/general/craneRequests';
import { formatNumber } from '@/lib/format';
import type { StatusFamily } from '@/ui';

// Labels and price-list maths shared by the crane request pages
// (UI helpers of apis/craneRequests.js and the page scripts).

export const PRICING_OPTION_LABELS: Record<string, string> = {
  up_to_3h: '3 Saate Kadar',
  up_to_8h: '8 Saate Kadar',
  daily: 'Günlük',
};

export const PLATFORM_CATEGORIES = ['scissor_platform', 'articulated_platform'];

export const STATUS_OPTIONS = [
  { value: 'submitted', label: 'Onay Bekliyor' },
  { value: 'approved', label: 'Onaylandı' },
  { value: 'rejected', label: 'Reddedildi' },
  { value: 'cancelled', label: 'İptal Edildi' },
  { value: 'completed', label: 'Tamamlandı' },
];

export const PRIORITY_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'urgent', label: 'Acil' },
  { value: 'critical', label: 'Kritik' },
];

export const CURRENCY_OPTIONS = ['TRY', 'EUR', 'USD'].map((value) => ({ value, label: value }));

const STATUS_INFO: Record<string, { label: string; color: StatusFamily }> = {
  submitted: { label: 'Onay Bekliyor', color: 'yellow' },
  approved: { label: 'Onaylandı', color: 'blue' },
  rejected: { label: 'Reddedildi', color: 'red' },
  cancelled: { label: 'İptal Edildi', color: 'grey' },
  completed: { label: 'Tamamlandı', color: 'green' },
};

/** Legacy getCraneStatusInfo. */
export function craneStatusInfo(status: string | undefined): {
  label: string;
  color: StatusFamily;
} {
  return (status && STATUS_INFO[status]) || { label: status || '—', color: 'grey' };
}

const PRIORITY_INFO: Record<string, { label: string; color: StatusFamily }> = {
  critical: { label: 'Kritik', color: 'red' },
  urgent: { label: 'Acil', color: 'yellow' },
  normal: { label: 'Normal', color: 'blue' },
};

export function cranePriorityInfo(priority: string | undefined): {
  label: string;
  color: StatusFamily;
} {
  return (priority && PRIORITY_INFO[priority]) || { label: priority || 'Normal', color: 'grey' };
}

/** "1.234,5 TRY" like legacy formatMoney; '-' when empty. */
export function formatMoney(value: unknown, currency: string | null | undefined = 'TRY'): string {
  if (value === null || value === undefined || value === '') return '-';
  const num = Number.parseFloat(String(value));
  if (Number.isNaN(num)) return '-';
  const text = formatNumber(num, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return currency ? `${text} ${currency}` : text;
}

/** "Günlük × 3", "8 Saate Kadar + Sapancı". */
export function formatDurationSummary(
  row: Pick<CraneRequest, 'pricing_option' | 'pricing_option_label' | 'days' | 'needs_rigger'>,
) {
  if (row.pricing_option === 'daily') return `${PRICING_OPTION_LABELS.daily} × ${row.days || 1}`;
  let label =
    (row.pricing_option && PRICING_OPTION_LABELS[row.pricing_option]) ||
    row.pricing_option_label ||
    '-';
  if (row.needs_rigger) label += ' + Sapancı';
  return label;
}

/** "12.03.2026 09:30" from needed_date + needed_time. */
export function neededTimeSuffix(time: string | null | undefined): string {
  return time ? ` ${time.substring(0, 5)}` : '';
}

export function craneTypeLabel(type: Pick<CraneType, 'name' | 'category_label'>): string {
  return `${type.category_label} · ${type.name}`;
}

export function isPlatformType(type: Pick<CraneType, 'category'> | null | undefined): boolean {
  return Boolean(type?.category && PLATFORM_CATEGORIES.includes(type.category));
}

const num = (value: unknown) => Number.parseFloat(String(value));
const has = (value: unknown) => value !== null && value !== undefined;

/** Pricing options a type's current rate offers, in legacy order. */
export function availablePricingOptions(rate: CraneRate | null | undefined): string[] {
  const options: string[] = [];
  if (has(rate?.price_up_to_3h)) options.push('up_to_3h');
  if (has(rate?.price_up_to_8h)) options.push('up_to_8h');
  if (has(rate?.price_per_day)) options.push('daily');
  return options;
}

export interface CraneEstimate {
  total: number;
  currency: string;
  lines: { label: string; amount: number }[];
}

/**
 * Legacy computeCraneEstimate: live estimate while filling the form. The
 * server snapshot taken at create is authoritative.
 */
export function computeCraneEstimate(
  craneType: Pick<CraneType, 'current_rate'> | null | undefined,
  pricingOption: string | null | undefined,
  days: number | string = 1,
  needsRigger = false,
): CraneEstimate | null {
  const rate = craneType?.current_rate;
  if (!rate || !pricingOption) return null;

  const lines: CraneEstimate['lines'] = [];
  let base: number | null = null;
  if (pricingOption === 'up_to_3h' && has(rate.price_up_to_3h)) {
    base = num(rate.price_up_to_3h);
    lines.push({ label: '3 saate kadar', amount: base });
  } else if (pricingOption === 'up_to_8h' && has(rate.price_up_to_8h)) {
    base = num(rate.price_up_to_8h);
    lines.push({ label: '8 saate kadar', amount: base });
  } else if (pricingOption === 'daily' && has(rate.price_per_day)) {
    const dayCount = Math.max(Number.parseInt(String(days), 10) || 1, 1);
    base = num(rate.price_per_day) * dayCount;
    lines.push({ label: `Günlük × ${dayCount}`, amount: base });
  }
  if (base === null) return null;

  let total = base;
  if (pricingOption === 'daily' && has(rate.transport_fee)) {
    const transport = num(rate.transport_fee);
    total += transport;
    lines.push({ label: 'Nakliye (gidiş-dönüş)', amount: transport });
  }
  if (needsRigger && has(rate.rigger_fee)) {
    const rigger = num(rate.rigger_fee);
    total += rigger;
    lines.push({ label: 'İlave sapancı', amount: rigger });
  }
  return { total, currency: rate.currency || 'TRY', lines };
}

/** Is the request for a platform (priced by day)? The row's own category wins. */
export function isPlatformRequest(
  row: Pick<CraneRequest, 'crane_type_category'>,
  type: Pick<CraneType, 'category'> | null | undefined,
): boolean {
  return row.crane_type_category
    ? PLATFORM_CATEGORIES.includes(row.crane_type_category)
    : isPlatformType(type);
}

/**
 * Suggested cost from the ACTUAL quantity (legacy suggestActualCost): cranes
 * go to the matching bracket (≤3h → 3h price if offered, otherwise 8h),
 * platforms use days × daily price + transport. The rigger fee follows the
 * request.
 */
export function suggestActualCost(
  row: Pick<CraneRequest, 'crane_type_category' | 'needs_rigger'>,
  type: CraneType | null | undefined,
  quantity: string | number,
): { total: number; currency: string; note: string } | null {
  const rate = type?.current_rate;
  const qty = num(quantity);
  if (!rate || Number.isNaN(qty) || qty <= 0) return null;

  let total: number;
  let note: string;
  if (isPlatformRequest(row, type)) {
    if (!has(rate.price_per_day)) return null;
    const days = Math.max(Math.ceil(qty), 1);
    total = days * num(rate.price_per_day);
    if (has(rate.transport_fee)) {
      total += num(rate.transport_fee);
      note = `${days} gün × günlük + nakliye`;
    } else {
      note = `${days} gün × günlük`;
    }
  } else {
    const p3 = has(rate.price_up_to_3h) ? num(rate.price_up_to_3h) : null;
    const p8 = has(rate.price_up_to_8h) ? num(rate.price_up_to_8h) : null;
    if (qty <= 3 && p3 !== null) {
      total = p3;
      note = '3 saate kadar tarifesi';
    } else if (p8 !== null) {
      total = p8;
      note = '8 saate kadar tarifesi';
    } else if (p3 !== null) {
      total = p3;
      note = '3 saate kadar tarifesi';
    } else {
      return null;
    }
    if (row.needs_rigger && has(rate.rigger_fee)) {
      total += num(rate.rigger_fee);
      note += ' + sapancı';
    }
    if (qty > 8) note += ' — 8 saati aşan kullanım için tedarikçi faturasını esas alın';
  }
  return { total, currency: rate.currency || 'TRY', note };
}

import type {
  CurrencyRates,
  PurchaseRequestDetail,
  RequestFile,
} from '@/api/procurement/purchaseRequests';

// Pure model of components/comparison-table (and the pages' Mali Özet). The
// legacy table keyed offers and recommendations by item position; here they
// are keyed by a stable item key (the request item id, or the create page's
// local item id), so removing a row cannot shift offers onto its neighbour.

export type ComparisonColumn =
  'unitPrice' | 'deliveryDays' | 'originalTotal' | 'euroTotal' | 'recommendations';

export type GeneralColumn = 'item' | 'job_no' | 'quantity' | 'unit' | 'specifications' | 'files';

export interface ComparisonItem {
  key: string;
  name: string;
  code: string;
  job_no: string;
  quantity: number | string;
  unit: string;
  specifications: string;
  item_description: string;
  files?: RequestFile[];
}

export interface ComparisonSupplier {
  id: string;
  name: string;
  default_currency?: string | null;
  status?: string | null;
  rating_score?: number | string | null;
}

export interface ComparisonOffer {
  unitPrice: number;
  totalPrice: number;
  deliveryDays: number | null;
  notes: string | null;
}

/** supplierId → itemKey → offer. */
export type ComparisonOffers = Record<string, Record<string, ComparisonOffer | undefined>>;
/** itemKey → supplierId (null: cleared). */
export type Recommendations = Record<string, string | null | undefined>;

export const CURRENCY_SYMBOLS: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€', GBP: '£' };

export const supplierCurrency = (s: ComparisonSupplier) => s.default_currency || 'TRY';

/** An offer counts only with a positive total (legacy `offer.totalPrice > 0`). */
export function hasOffer(offer: ComparisonOffer | undefined | null): offer is ComparisonOffer {
  return !!offer && offer.totalPrice > 0;
}

/** Legacy convertCurrency: unchanged without rates; `rates[C]` = C per 1 TRY. */
export function convertCurrency(
  amount: number,
  from: string,
  to: string,
  rates: CurrencyRates | null | undefined,
): number {
  if (!rates || from === to) return amount;
  return (amount / rates[from]!) * rates[to]!;
}

/** Legacy table formatCurrency: symbol + toFixed(2), no thousands separator. */
export function formatMoney(amount: number, currency: string): string {
  return `${CURRENCY_SYMBOLS[currency] ?? currency}${amount.toFixed(2)}`;
}

/** Pages' formatCurrencyDisplay: '-' for 0/NaN, else symbol + toFixed(2). */
export function formatMoneyOrDash(amount: number | null | undefined, currency: string): string {
  if (!amount || Number.isNaN(amount)) return '-';
  return formatMoney(Number(amount), currency);
}

export function supplierTotals(
  supplierId: string,
  items: readonly ComparisonItem[],
  offers: ComparisonOffers,
): { originalTotal: number; unitPriceTotal: number } {
  let originalTotal = 0;
  let unitPriceTotal = 0;
  for (const item of items) {
    const offer = offers[supplierId]?.[item.key];
    if (hasOffer(offer)) {
      originalTotal += offer.totalPrice;
      unitPriceTotal += offer.unitPrice;
    }
  }
  return { originalTotal, unitPriceTotal };
}

const trNumber = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export interface ComparisonSummary {
  itemCount: number;
  totalQuantity: string;
  recommendedSupplierCount: number;
  totalAmountEUR: number;
}

/** Legacy calculateSummary (the "Özet Bilgiler" card). */
export function comparisonSummary(
  items: readonly ComparisonItem[],
  suppliers: readonly ComparisonSupplier[],
  offers: ComparisonOffers,
  recommendations: Recommendations,
  rates: CurrencyRates | null | undefined,
): ComparisonSummary {
  const byUnit = new Map<string, number>();
  for (const item of items) {
    byUnit.set(item.unit, (byUnit.get(item.unit) ?? 0) + (parseFloat(String(item.quantity)) || 0));
  }
  const totalQuantity =
    byUnit.size > 0
      ? [...byUnit].map(([unit, qty]) => `${trNumber.format(qty)} ${unit}`).join(', ')
      : '-';
  const recommended = new Set(Object.values(recommendations).filter(Boolean));
  let totalAmountEUR = 0;
  if (rates) {
    for (const item of items) {
      const supplierId = recommendations[item.key];
      if (!supplierId) continue;
      const offer = offers[supplierId]?.[item.key];
      if (!hasOffer(offer)) continue;
      const supplier = suppliers.find((s) => s.id === supplierId);
      // Legacy skips a supplier without a currency here, though its cells show TRY.
      if (supplier?.default_currency) {
        totalAmountEUR += convertCurrency(
          offer.totalPrice,
          supplier.default_currency,
          'EUR',
          rates,
        );
      }
    }
  }
  return {
    itemCount: items.length,
    totalQuantity,
    recommendedSupplierCount: recommended.size,
    totalAmountEUR,
  };
}

/** One star: radio-like per item, clicking the recommended supplier clears it. */
export function toggleRecommendation(
  recommendations: Recommendations,
  itemKey: string,
  supplierId: string,
): Recommendations {
  return {
    ...recommendations,
    [itemKey]: recommendations[itemKey] === supplierId ? null : supplierId,
  };
}

/**
 * "Hepsi için Öner": over the items this supplier quoted, clear them all if
 * every one already points to it, else point them all to it.
 */
export function recommendSupplierForAll(
  recommendations: Recommendations,
  supplierId: string,
  items: readonly ComparisonItem[],
  offers: ComparisonOffers,
): Recommendations {
  const quoted = items.filter((item) => hasOffer(offers[supplierId]?.[item.key]));
  const allMine =
    quoted.length > 0 && quoted.every((item) => recommendations[item.key] === supplierId);
  const next = { ...recommendations };
  for (const item of quoted) next[item.key] = allMine ? null : supplierId;
  return next;
}

export interface ComparisonData {
  items: ComparisonItem[];
  suppliers: ComparisonSupplier[];
  offers: ComparisonOffers;
  recommendations: Recommendations;
}

/** pending/registry renderComparisonTableForModal: the table data of a request. */
export function comparisonFromRequest(request: PurchaseRequestDetail): ComparisonData {
  const requestItems = request.request_items ?? [];
  const items: ComparisonItem[] = requestItems.map((ri) => ({
    key: String(ri.id),
    name: ri.item?.name ?? '',
    code: ri.item?.code ?? '',
    quantity: ri.quantity,
    unit: ri.item?.unit ?? '',
    specifications: ri.specifications || '',
    item_description: ri.item_description || ri.item?.description || '',
    job_no:
      ri.allocations && ri.allocations.length > 0
        ? ri.allocations.map((a) => a.job_no).join(', ')
        : '-',
    files: ri.files || [],
  }));
  const suppliers: ComparisonSupplier[] = (request.offers ?? []).map((offer) => ({
    id: String(offer.supplier.id),
    name: offer.supplier.name,
    default_currency: offer.currency,
    status: offer.supplier.status,
    rating_score: offer.supplier.rating_score,
  }));
  const offers: ComparisonOffers = {};
  const recommendations: Recommendations = {};
  for (const offer of request.offers ?? []) {
    const sid = String(offer.supplier.id);
    offers[sid] = {};
    for (const ri of requestItems) {
      const io = offer.item_offers?.find((x) => x.purchase_request_item === ri.id);
      const price = io ? parseFloat(String(io.unit_price)) : NaN;
      if (io && io.unit_price && price > 0) {
        offers[sid]![String(ri.id)] = {
          unitPrice: price,
          totalPrice: price * Number(ri.quantity),
          deliveryDays: io.delivery_days || null,
          notes: io.notes || null,
        };
        if (io.is_recommended) recommendations[String(ri.id)] = sid;
      }
    }
  }
  return { items, suppliers, offers, recommendations };
}

export interface FinancialSummary {
  /** Per offer currency, the recommended total (every offer currency present). */
  currencyTotals: Record<string, number>;
  totalRecommendedEUR: number;
  totalCheapestEUR: number;
  hasLowerPrices: boolean;
  savings: number;
  /** "€1200.00 + -" (legacy joins every currency, '-' for zero). */
  recommendedCurrencyDisplay: string;
}

/** pending/registry "Mali Özet" computation. */
export function financialSummary(
  request: PurchaseRequestDetail,
  rates: CurrencyRates | null | undefined,
): FinancialSummary {
  const items = request.request_items ?? [];
  const qtyOf = (itemId: number) => {
    const ri = items.find((i) => i.id === itemId);
    return ri ? Number(ri.quantity) : 0;
  };
  const currencyTotals: Record<string, number> = {};
  let totalRecommendedEUR = 0;
  for (const offer of request.offers ?? []) {
    const currency = offer.currency;
    currencyTotals[currency] = currencyTotals[currency] ?? 0;
    for (const io of offer.item_offers ?? []) {
      if (io.is_recommended && io.unit_price && parseFloat(String(io.unit_price)) > 0) {
        const total = parseFloat(String(io.unit_price)) * qtyOf(io.purchase_request_item);
        currencyTotals[currency] += total;
        if (rates) totalRecommendedEUR += safeConvert(total, currency, rates);
      }
    }
  }
  let totalCheapestEUR = 0;
  for (const ri of items) {
    let best: { total: number; currency: string } | null = null;
    for (const offer of request.offers ?? []) {
      const io = offer.item_offers?.find((x) => x.purchase_request_item === ri.id);
      if (io && io.unit_price && parseFloat(String(io.unit_price)) > 0) {
        const total = parseFloat(String(io.unit_price)) * Number(ri.quantity);
        if (!best || total < best.total) best = { total, currency: offer.currency };
      }
    }
    if (best && rates) totalCheapestEUR += safeConvert(best.total, best.currency, rates);
  }
  const hasLowerPrices = totalCheapestEUR > 0 && totalCheapestEUR < totalRecommendedEUR;
  return {
    currencyTotals,
    totalRecommendedEUR,
    totalCheapestEUR,
    hasLowerPrices,
    savings: totalRecommendedEUR - totalCheapestEUR,
    recommendedCurrencyDisplay: Object.entries(currencyTotals)
      .map(([currency, amount]) => formatMoneyOrDash(amount, currency))
      .join(' + '),
  };
}

/** The pages' convertCurrency: NaN input → 0. */
function safeConvert(amount: number, from: string, rates: CurrencyRates): number {
  if (Number.isNaN(amount)) return 0;
  return convertCurrency(amount, from, 'EUR', rates);
}

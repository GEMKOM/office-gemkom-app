import type { PurchaseRequestDetail } from '@/api/procurement/purchaseRequests';
import {
  comparisonFromRequest,
  comparisonSummary,
  convertCurrency,
  financialSummary,
  formatMoney,
  formatMoneyOrDash,
  recommendSupplierForAll,
  supplierTotals,
  toggleRecommendation,
} from './comparison';

const RATES = { TRY: 1, EUR: 0.025, USD: 0.03 };

const REQUEST = {
  id: 9,
  request_number: 'SAT-9',
  status: 'submitted',
  request_items: [
    { id: 11, quantity: '10.00', item: { code: 'A1', name: 'Flanş', unit: 'adet' }, allocations: [{ job_no: '254-01' }, { job_no: '254-02' }] },
    { id: 12, quantity: '2.00', item: { code: 'B2', name: 'Mil', unit: 'kg', description: 'çelik' }, specifications: 'S235' },
  ],
  offers: [
    {
      currency: 'TRY',
      supplier: { id: 1, name: 'Acme' },
      item_offers: [
        { id: 101, purchase_request_item: 11, unit_price: '100.00', is_recommended: true, delivery_days: 5 },
        { id: 102, purchase_request_item: 12, unit_price: '50.00', is_recommended: false },
      ],
    },
    {
      currency: 'EUR',
      supplier: { id: 2, name: 'Beta', status: 'blacklisted' },
      item_offers: [
        { id: 201, purchase_request_item: 11, unit_price: '1.00', is_recommended: false },
        { id: 202, purchase_request_item: 12, unit_price: '0', is_recommended: false },
      ],
    },
  ],
} as unknown as PurchaseRequestDetail;

describe('comparison model', () => {
  it('builds the table data from a request like renderComparisonTableForModal', () => {
    const data = comparisonFromRequest(REQUEST);
    expect(data.items.map((i) => [i.key, i.job_no, i.item_description])).toEqual([
      ['11', '254-01, 254-02', ''],
      ['12', '-', 'çelik'],
    ]);
    expect(data.suppliers.map((s) => [s.id, s.default_currency])).toEqual([
      ['1', 'TRY'],
      ['2', 'EUR'],
    ]);
    expect(data.offers['1']!['11']).toEqual({ unitPrice: 100, totalPrice: 1000, deliveryDays: 5, notes: null });
    // A zero price is "Teklif yok".
    expect(data.offers['2']!['12']).toBeUndefined();
    expect(data.recommendations).toEqual({ '11': '1' });
    expect(supplierTotals('1', data.items, data.offers)).toEqual({ originalTotal: 1100, unitPriceTotal: 150 });
  });

  it('formats like the legacy table and converts through TRY rates', () => {
    expect(formatMoney(12345.6, 'TRY')).toBe('₺12.345,60');
    expect(formatMoney(2408.74, 'TRY')).toBe('₺2.408,74');
    expect(formatMoney(5, 'XYZ')).toBe('XYZ5,00');
    expect(formatMoneyOrDash(0, 'EUR')).toBe('-');
    expect(convertCurrency(1000, 'TRY', 'EUR', RATES)).toBeCloseTo(25);
    expect(convertCurrency(1000, 'TRY', 'EUR', null)).toBe(1000);
  });

  it('computes Mali Özet: recommended vs cheapest in EUR', () => {
    const s = financialSummary(REQUEST, RATES);
    // Recommended: Acme 10 × 100 TRY = 1000 TRY = 25 EUR.
    expect(s.totalRecommendedEUR).toBeCloseTo(25);
    // Cheapest: item 11 at Beta 10 × 1 EUR, item 12 at Acme 2 × 50 TRY = 2.5 EUR.
    expect(s.totalCheapestEUR).toBeCloseTo(12.5);
    expect(s.hasLowerPrices).toBe(true);
    expect(s.recommendedCurrencyDisplay).toBe('₺1.000,00');
    expect(financialSummary(REQUEST, null).totalRecommendedEUR).toBe(0);
  });

  it('toggles a star and recommends a supplier for all its quoted items', () => {
    const data = comparisonFromRequest(REQUEST);
    expect(toggleRecommendation({ '11': '1' }, '11', '1')).toEqual({ '11': null });
    expect(toggleRecommendation({ '11': '1' }, '11', '2')).toEqual({ '11': '2' });
    const all = recommendSupplierForAll({}, '1', data.items, data.offers);
    expect(all).toEqual({ '11': '1', '12': '1' });
    // All already theirs: cleared. Beta only quoted item 11.
    expect(recommendSupplierForAll(all, '1', data.items, data.offers)).toEqual({ '11': null, '12': null });
    expect(recommendSupplierForAll(all, '2', data.items, data.offers)).toEqual({ '11': '2', '12': '1' });
  });

  it('summarizes quantities per unit and the recommended EUR total', () => {
    const data = comparisonFromRequest(REQUEST);
    const s = comparisonSummary(data.items, data.suppliers, data.offers, { '11': '1' }, RATES);
    expect(s).toEqual({ itemCount: 2, totalQuantity: '10,00 adet, 2,00 kg', recommendedSupplierCount: 1, totalAmountEUR: 25 });
  });
});

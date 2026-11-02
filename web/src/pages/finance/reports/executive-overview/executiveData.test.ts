import { describe, expect, it } from 'vitest';
import { chartMonths, executiveKpis, formatMonth, paymentSplit } from './executiveData';

describe('executive overview data', () => {
  it('sorts the months and keeps running totals', () => {
    const months = chartMonths([
      {
        month: '2026-10',
        total_spent_eur: '300',
        paid_eur: '100',
        awaiting_eur: '200',
        po_count: 4,
        active_suppliers: 2,
      },
      { month: '2026-08', total_spent_eur: '100.5', paid_eur: '100.5', awaiting_eur: '0' },
      // A null amount no longer turns every later cumulative point into NaN.
      { month: '2026-09', total_spent_eur: null, paid_eur: '50', awaiting_eur: null },
    ]);
    expect(months.map((m) => m.month)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(months.map((m) => [m.cumulativeSpent, m.cumulativePaid, m.cumulativeAwaiting])).toEqual([
      [100.5, 100.5, 0],
      [100.5, 150.5, 0],
      [400.5, 250.5, 200],
    ]);
    expect(months[2]).toMatchObject({
      poCount: 4,
      activeSuppliers: 2,
      label: formatMonth('2026-10'),
    });
    expect(paymentSplit(months)).toEqual({ paid: 250.5, awaiting: 200 });
  });

  it('reads the procurement KPIs; missing changes stay null', () => {
    expect(
      executiveKpis({
        kpis: {
          total_spent_eur: '10',
          total_paid_eur: '4',
          total_awaiting_eur: '6',
          po_count: 3,
          mom_percent: '-2.5',
        },
      }),
    ).toEqual({
      totalSpent: 10,
      totalPaid: 4,
      totalAwaiting: 6,
      poCount: 3,
      activeSuppliers: 0,
      mom: -2.5,
      yoy: null,
    });
    expect(executiveKpis(undefined).totalSpent).toBe(0);
  });

  it('formats months like the legacy table', () => {
    expect(formatMonth('2026-10')).toBe('Eki 2026');
    expect(formatMonth('')).toBe('-');
  });
});

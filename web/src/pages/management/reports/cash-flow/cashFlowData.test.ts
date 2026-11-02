import { describe, expect, it } from 'vitest';
import {
  buildMergedRows,
  cashFlowKpis,
  enrichDbsRows,
  expirySoon,
  monthLabel,
  pickNum,
  presetRange,
  undatedInflow,
  undatedOutflow,
  utilizationTone,
} from './cashFlowData';

describe('presetRange', () => {
  const today = new Date(2026, 10, 2); // 2 Kasım 2026

  it('matches the legacy presets in local dates', () => {
    expect(presetRange('month', today)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(presetRange('quarter', today)).toEqual({ from: '2026-10-01', to: '2026-12-31' });
    expect(presetRange('year', today)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(presetRange('last12', today)).toEqual({ from: '2025-12-01', to: '2026-11-02' });
    expect(presetRange('all', today)).toEqual({ from: '', to: '' });
  });

  it('handles February and the first quarter', () => {
    expect(presetRange('month', new Date(2028, 1, 10))).toEqual({
      from: '2028-02-01',
      to: '2028-02-29',
    });
    expect(presetRange('quarter', new Date(2026, 0, 31))).toEqual({
      from: '2026-01-01',
      to: '2026-03-31',
    });
  });
});

describe('buildMergedRows', () => {
  const outflow = {
    series: [
      {
        month: '2026-09',
        total_outflow_eur: '300',
        procurement_paid_eur: '100',
        procurement_awaiting_eur: '50',
        po_count: 3,
      },
      // An older payload: the renamed fields fall back.
      { month: '2026-08', total_spent_eur: '100', paid_eur: '60', awaiting_eur: '40', po_count: 2 },
    ],
  };
  const inflow = {
    series: [
      { month: '2026-08', total_inflow_eur: '250', offer_count: 1 },
      { month: '2026-10', revenue_eur: '120.5', offer_count: 4 },
    ],
  };

  it('merges by month, sorted, with net and running cumulative', () => {
    const { rows, totals } = buildMergedRows(outflow, inflow);
    expect(rows.map((r) => r.month)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(rows.map((r) => [r.inflow, r.outflow, r.net, r.cumulative])).toEqual([
      [250, 100, 150, 150],
      [0, 300, -300, -150],
      [120.5, 0, 120.5, -29.5],
    ]);
    expect(rows.map((r) => [r.paid, r.awaiting, r.po_count, r.offer_count])).toEqual([
      [60, 40, 2, 1],
      [100, 50, 3, 0],
      [0, 0, 0, 4],
    ]);
    expect(totals).toEqual({
      inflow: 370.5,
      outflow: 400,
      net: -29.5,
      cumulative: -29.5,
      paid: 160,
      awaiting: 90,
      po_count: 5,
      offer_count: 5,
    });
  });

  it('flags negative months and only the first zero crossing', () => {
    const { rows } = buildMergedRows(
      {
        series: [
          { month: '2026-01', total_outflow_eur: 10 },
          { month: '2026-03', total_outflow_eur: 50 },
        ],
      },
      { series: [{ month: '2026-02', total_inflow_eur: 30 }] },
    );
    // cumulative: -10 (crosses from 0), +20 (crosses again), -30
    expect(rows.map((r) => r.netNegative)).toEqual([true, false, true]);
    expect(rows.map((r) => r.crossesZero)).toEqual([true, false, false]);
  });

  it('is empty without data and labels months in Turkish', () => {
    expect(buildMergedRows(null, undefined).rows).toEqual([]);
    expect(buildMergedRows(null, null).totals.cumulative).toBe(0);
    expect(monthLabel('2026-10')).toBe('Ekim 2026');
  });
});

describe('cashFlowKpis', () => {
  it('reads the KPI totals, falling back to the series for paid and awaiting', () => {
    const kpis = cashFlowKpis(
      {
        kpis: { total_outflow_eur: '1000', mom_percent: '-12.5' },
        series: [
          { month: '2026-01', procurement_paid_eur: '200', procurement_awaiting_eur: '50' },
          { month: '2026-02', paid_eur: '100', awaiting_eur: '25' },
        ],
        dbs_summary: { total_dbs_used_eur: '42.5' },
      },
      { kpis: { total_revenue_eur: '1500', mom_percent: null } },
    );
    expect(kpis).toEqual({
      totalIn: 1500,
      totalOut: 1000,
      net: 500,
      paid: 300,
      awaiting: 75,
      dbsUsed: 42.5,
      momIn: null,
      momOut: -12.5,
    });
  });

  it('prefers the KPI paid / awaiting when present, even 0', () => {
    const kpis = cashFlowKpis(
      {
        kpis: { total_procurement_paid_eur: '0', total_awaiting_eur: '7' },
        series: [{ month: 'x', paid_eur: 99 }],
      },
      null,
    );
    expect(kpis.paid).toBe(0);
    expect(kpis.awaiting).toBe(7);
  });
});

describe('DBS and undated', () => {
  it('computes utilisation against the EUR limit', () => {
    const rows = enrichDbsRows([
      { dbs_used_eur: '90', dbs_limit_eur: '100' },
      { dbs_used_eur: '10', dbs_limit_eur: null },
    ]);
    expect(rows.map((r) => r.utilization)).toEqual([90, 0]);
    expect([95, 80, 70].map(utilizationTone)).toEqual(['bad', 'warning', 'normal']);
  });

  it('flags expiries within 30 days or past', () => {
    const now = new Date(2026, 10, 2, 12);
    expect(expirySoon('2026-11-20', now)).toBe(true);
    expect(expirySoon('2026-01-01', now)).toBe(true);
    expect(expirySoon('2027-01-15', now)).toBe(false);
    expect(expirySoon(null, now)).toBe(false);
  });

  it('reads the undated totals under either name', () => {
    expect(undatedOutflow({ undated_schedules: { total_eur: '12', po_count: 3 } })).toEqual({
      amount: 12,
      count: 3,
    });
    expect(undatedInflow({ undated: { revenue_eur: '5' } })).toEqual({ amount: 5, count: 0 });
    expect(pickNum({ a: '', b: '2' }, 'a', 'b')).toBe(2);
  });
});

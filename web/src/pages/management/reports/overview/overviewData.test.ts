import { mergeOverviewResponses } from '@/api/reports/overview';
import {
  activeUsersTotal,
  consultRows,
  eur,
  hakedisAvgPricePerKg,
  jobOrderCostSlices,
  jobOrderStatusRows,
  numLocale,
  periodStrip,
  pfLocale,
  productionHoursRows,
  qcPassRate,
  salesSummary,
  subcontractorAvgPricePerKg,
  subcontractorTop10,
  trendDir,
  truncateLabel,
} from './overviewData';

it('pfLocale reads API decimals in either notation', () => {
  expect(pfLocale('1234.5')).toBe(1234.5);
  expect(pfLocale('1.234,56')).toBe(1234.56);
  expect(pfLocale('12,5')).toBe(12.5);
  expect(pfLocale(null)).toBe(0);
  expect(numLocale('1.234,5', 2)).toBe('1.234,50');
  expect(eur('1234.5')).toBe('€1.234,50');
  expect(eur(null)).toBe('€0,00');
});

it('trendDir has no percent against a zero base', () => {
  expect(trendDir(120, 100)).toEqual({ diff: 20, pct: 20, dir: 'up' });
  expect(trendDir(5, 0)).toEqual({ diff: 5, pct: null, dir: 'up' });
  expect(trendDir('3', '3').dir).toBe('flat');
});

it('periodStrip names the range, or the preset, and the comparison period', () => {
  expect(
    periodStrip({
      date_from: '2026-10-01',
      date_to: '2026-10-31',
      compare: true,
      prev_date_from: '2026-09-01',
      prev_date_to: '2026-09-30',
    }),
  ).toEqual({ primary: '1 Eki 2026 – 31 Eki 2026', previous: '1 Eyl 2026 – 30 Eyl 2026' });
  expect(periodStrip({ preset: 'last_6_months', compare: false })).toEqual({
    primary: 'Son 6 ay',
    previous: null,
  });
  expect(periodStrip({})).toBeNull();
  expect(periodStrip(null)).toBeNull();
});

it('job order costs: Diğer is the rest of the total, never negative', () => {
  const s = jobOrderCostSlices({
    total_labor_cost_eur: '100',
    total_material_cost_eur: '200',
    total_subcontractor_cost_eur: '50',
    total_actual_cost_eur: '400',
  });
  expect(s).toMatchObject({ other: 50, total: 400, empty: false });
  expect(
    jobOrderCostSlices({ total_labor_cost_eur: '500', total_actual_cost_eur: '400' }).other,
  ).toBe(0);
  expect(jobOrderCostSlices({}).empty).toBe(true);
});

it('status rows keep the API order and translate known keys', () => {
  expect(jobOrderStatusRows({ active: 3, weird: '2' })).toEqual([
    { key: 'active', label: 'Aktif', value: 3 },
    { key: 'weird', label: 'weird', value: 2 },
  ]);
});

it('production hours: maintenance from its block; previous only when comparing', () => {
  const data = mergeOverviewResponses({
    manufacturing: { welding_hours: '10', maintenance_hours: '1' },
    maintenance: { maintenance_hours: '7' },
    previous_period: { manufacturing: { welding_hours: '6', maintenance_hours: '2' } },
  });
  expect(productionHoursRows(data, true)).toEqual([
    { department: 'Kaynak', current: 10, previous: 6 },
    { department: 'Talaşlı', current: 0, previous: 0 },
    { department: 'CNC', current: 0, previous: 0 },
    { department: 'Bakım', current: 7, previous: 2 },
  ]);
  expect(productionHoursRows(data, false)[0]!.previous).toBeNull();
});

it('active users add up as numbers, not strings', () => {
  const data = mergeOverviewResponses({
    manufacturing: { welding_active_users: '3', machining_active_users: 2, cnc_active_users: null },
    maintenance: { maintenance_active_users: '1' },
  });
  expect(activeUsersTotal(data)).toBe(6);
});

it('sales: win rate on created offers, won share of all amounts', () => {
  const s = salesSummary({
    offers_created_in_range: 20,
    offers_won_in_range: 5,
    total_won_value_eur: '100',
    total_lost_value_eur: '50',
    total_pending_value_eur: '50',
  });
  expect(s.winRate).toBe(25);
  expect(s.eurWinSharePct).toBe(50);
  expect(salesSummary(undefined)).toMatchObject({ winRate: 0, eurWinSharePct: 0 });
});

it('consultations sort most first with Turkish department names', () => {
  expect(consultRows({ design: 2, Quality_Control: 5, unknown: 1 }).map((r) => r.label)).toEqual([
    'Kalite kontrol',
    'Tasarım',
    'unknown',
  ]);
});

describe('subcontractorTop10', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({
    name: `T${i}`,
    approved_total: String(i * 10),
  }));

  it('takes the ten largest of this period and matches the previous by name', () => {
    const pairs = subcontractorTop10(
      { by_subcontractor: rows },
      { by_subcontractor: [{ name: 'T11', approved_total: '7' }] },
      true,
    )!;
    expect(pairs).toHaveLength(10);
    expect(pairs[0]).toMatchObject({ name: 'T11', current: 110, previous: 7 });
    expect(pairs[1]).toMatchObject({ name: 'T10', previous: 0 });
  });

  it('without comparison there is no previous series', () => {
    expect(
      subcontractorTop10({ by_subcontractor: rows }, undefined, false)![0]!.previous,
    ).toBeNull();
  });

  it('falls back to the previous period when this one is empty', () => {
    const pairs = subcontractorTop10(
      {},
      { by_subcontractor: [{ name: 'A', approved_total: '5', currency: 'EUR' }] },
      true,
    )!;
    expect(pairs[0]).toMatchObject({
      name: 'A',
      current: 0,
      previous: 5,
      curRow: { approved_total: '0', currency: 'EUR' },
    });
    expect(subcontractorTop10({}, {}, true)).toBeNull();
  });
});

it('average price per kg needs a weight', () => {
  expect(subcontractorAvgPricePerKg({ approved_total: '100', total_awarded_weight_kg: '40' })).toBe(
    2.5,
  );
  expect(subcontractorAvgPricePerKg({ approved_total: '100' })).toBeNull();
  expect(
    hakedisAvgPricePerKg({ total_approved_value: '1.000,00', total_awarded_weight_kg: '400' }),
  ).toBe(2.5);
  expect(
    hakedisAvgPricePerKg({ total_approved_value: '10', total_awarded_weight_kg: '0' }),
  ).toBeNull();
});

it('labels and pass rate', () => {
  expect(truncateLabel('abcdefghij', 5)).toBe('abcd…');
  expect(truncateLabel(null)).toBe('');
  expect(qcPassRate(0, 0)).toBe(0);
  expect(qcPassRate('140', '128')).toBeCloseTo(91.43, 2);
});

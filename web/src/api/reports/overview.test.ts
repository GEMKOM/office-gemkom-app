import { buildOverviewQuery, mergeOverviewResponses } from './overview';

describe('buildOverviewQuery', () => {
  it('sends the preset, and compare only when comparing', () => {
    expect(buildOverviewQuery({ preset: 'last_3_months', compare: true })).toEqual({
      preset: 'last_3_months',
      compare: 'true',
    });
    expect(buildOverviewQuery({ preset: 'last_year', compare: false })).toEqual({
      preset: 'last_year',
    });
  });

  it('a preset wins over dates', () => {
    expect(
      buildOverviewQuery({ preset: 'all_time', date_from: '2026-01-01', date_to: '2026-02-01' }),
    ).toEqual({
      preset: 'all_time',
    });
  });

  it('sends a custom range, swapped when reversed', () => {
    expect(
      buildOverviewQuery({ date_from: '2026-10-31', date_to: '2026-10-01', compare: true }),
    ).toEqual({
      date_from: '2026-10-01',
      date_to: '2026-10-31',
      compare: 'true',
    });
  });

  it('refuses a half-open range and falls back to this month without anything', () => {
    expect(() => buildOverviewQuery({ date_from: '2026-10-01' })).toThrow(
      'date_from ve date_to birlikte',
    );
    expect(buildOverviewQuery({})).toEqual({ preset: 'current_month' });
  });
});

describe('mergeOverviewResponses', () => {
  it('merges the slices as legacy did', () => {
    const merged = mergeOverviewResponses(
      {
        meta: { compare: true, date_from: '2026-10-01' },
        manufacturing: { welding_hours: '10' },
        quality: { ncrs_open_total: 3 },
        previous_period: { manufacturing: { welding_hours: '8' } },
      },
      {
        subcontracting: { total_approved_value: '5' },
        previous_period: { subcontracting: { total_approved_value: '4' } },
      },
      {
        procurement: { orders_created_in_range: 2 },
        previous_period: { orders_created_in_range: 1 },
      },
      { sales: { offers_won_in_range: 1 }, meta: { date_to: '2026-10-31' } },
      {
        job_orders: { total_active: 7 },
        costs: { total_actual_cost_eur: '100' },
        manufacturing: { cnc_hours: '3' },
      },
    );
    expect(merged.meta).toEqual({ compare: true, date_from: '2026-10-01', date_to: '2026-10-31' });
    expect(merged.manufacturing).toEqual({ cnc_hours: '3', welding_hours: '10' });
    expect(merged.subcontracting).toEqual({ total_approved_value: '5' });
    expect(merged.procurement).toEqual({ orders_created_in_range: 2 });
    expect(merged.previous_period.manufacturing).toEqual({ welding_hours: '8' });
    expect(merged.previous_period.subcontracting).toEqual({ total_approved_value: '4' });
    // A previous period without the keyed wrapper is taken as it is.
    expect(merged.previous_period.procurement).toEqual({ orders_created_in_range: 1 });
    expect(merged.job_orders).toEqual({ total_active: 7 });
    expect(merged.costs).toEqual({ total_actual_cost_eur: '100' });
    expect(merged.job_orders_costs).toEqual({ total_actual_cost_eur: '100' });
    expect(merged.quality).toEqual({ ncrs_open_total: 3 });
  });

  it('treats missing slices as empty', () => {
    const merged = mergeOverviewResponses();
    expect(merged.meta).toEqual({});
    expect(merged.job_orders).toEqual({});
    expect(merged.subcontracting).toEqual({});
    expect(merged.job_orders_costs).toBeUndefined();
  });
});

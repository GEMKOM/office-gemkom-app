import type { DashboardPayload } from '@/api/management/dashboard';
import {
  applyLive,
  completionSeries,
  decisionColor,
  formatEurCompact,
  formatTons,
  formatWd,
  mergeSlow,
  monthLabel,
  needsSlow,
  netSeries,
  num,
  pct,
  slowError,
  slowState,
  trendArrow,
  trendTone,
} from './model';

describe('formatters (null-safe, as apis/formatters.js)', () => {
  it('formats compact euros, tons and working days', () => {
    expect(formatEurCompact('1412300.0')).toBe('€1,4M');
    expect(formatEurCompact(38_400)).toBe('€38k');
    expect(formatEurCompact(9_840)).toBe('€9,8k');
    expect(formatEurCompact(410)).toBe('€410');
    expect(formatEurCompact(-2_500)).toBe('-€2,5k');
    expect(formatEurCompact(null)).toBe('');
    expect(formatTons('1412300.0')).toBe('1.412,3 t');
    expect(formatTons(null)).toBe('');
    expect(formatWd(16)).toBe('16 iş günü');
    expect(formatWd('12.5')).toBe('12,5 iş günü');
    expect(num('1234.5', 1)).toBe('1.234,5');
    expect(pct(28.6, 1)).toBe('%28,6');
    expect(pct(null)).toBe('');
    expect(monthLabel('2026-10')).toBe('Eki 26');
  });
});

describe('trend', () => {
  it('reads the arrow from the direction and the tone from the meaning', () => {
    expect(trendArrow(112, 100)).toBe('↑ 12%');
    expect(trendArrow(92, 100)).toBe('↓ 8%');
    expect(trendArrow(5, 0)).toBe('↑');
    expect(trendArrow(5, 5)).toBe('→');
    expect(trendArrow(null, 5)).toBe('');
    expect(trendTone(120, 100, { goodWhen: 'up' })).toBe('good');
    expect(trendTone(120, 100, { goodWhen: 'down' })).toBe('bad');
    // A baseline under minPrev reads neutral (overtime: under 50 h).
    expect(trendTone(80, 40, { goodWhen: 'down', minPrev: 50 })).toBe('flat');
  });
});

describe('slow tier', () => {
  it('decides when to ask for ?block=slow', () => {
    expect(needsSlow({ meta: { cache_state: { slow: 'fresh' } } }, false)).toBe(false);
    expect(needsSlow({ meta: { cache_state: { slow: 'fresh' } } }, true)).toBe(true);
    expect(needsSlow({ meta: { cache_state: { slow: 'stale' } } }, false)).toBe(true);
    expect(needsSlow({ meta: {} }, false)).toBe(true);
    expect(needsSlow(undefined, true)).toBe(false);
  });

  it('names sub-block states like the legacy slowState()', () => {
    const errors = {
      'slow.order_book_value': 'boom',
      'slow.delivery.forecast': 'henüz hesaplanmadı',
    };
    expect(slowError(errors, 'order_book', 'value')).toBe('boom');
    expect(slowError(errors, 'delivery', 'forecast')).toBe('henüz hesaplanmadı');
    expect(slowState({}, { slowStatus: 'pending', errors, section: 'x', sub: 'y' })).toBe('ready');
    expect(
      slowState(null, { slowStatus: 'pending', errors, section: 'order_book', sub: 'value' }),
    ).toBe('failed');
    expect(
      slowState(null, { slowStatus: 'pending', errors, section: 'delivery', sub: 'forecast' }),
    ).toBe('pending');
    expect(
      slowState(null, { slowStatus: 'done', errors, section: 'delivery', sub: 'forecast' }),
    ).toBe('unavailable');
    expect(
      slowState(undefined, { slowStatus: 'done', errors: {}, section: 'exceptions', sub: null }),
    ).toBe('unavailable');
  });

  it('merges the slow response into the full payload without touching it', () => {
    const full: DashboardPayload = {
      meta: { cache_state: { slow: 'missing', overview: 'fresh' } },
      sections: { order_book: { rag: 'green', live_roots: 4, value: null }, delivery: null },
      errors: { 'slow.order_book_value': 'eski', delivery: 'patladı' },
    };
    const slow: DashboardPayload = {
      meta: { cache_state: { slow: 'fresh' } },
      sections: {
        order_book: { value: { value_eur: '100' } },
        delivery: { forecast: { late_risk: 2 } },
        exceptions: { rows: [], total_candidates: 0 },
      },
      errors: { 'slow.production_capacity': 'yeni' },
    };
    const merged = mergeSlow(full, slow);
    expect(merged.sections?.order_book).toEqual({
      rag: 'green',
      live_roots: 4,
      value: { value_eur: '100' },
    });
    // A section that failed in the full load stays failed.
    expect(merged.sections?.delivery).toBeNull();
    expect(merged.sections?.exceptions).toEqual({ rows: [], total_candidates: 0 });
    expect(merged.errors).toEqual({ delivery: 'patladı', 'slow.production_capacity': 'yeni' });
    expect(merged.meta?.cache_state).toEqual({ slow: 'fresh', overview: 'fresh' });
    expect(full.sections?.order_book?.value).toBeNull();
  });

  it('applies the live poll: the strip and decisions.mine', () => {
    const payload: DashboardPayload = {
      sections: { live: { generated_at: 'a' }, decisions: { by_type: {}, mine: { count: 1 } } },
      errors: { live: 'eski hata' },
    };
    const next = applyLive(payload, {
      sections: { live: { generated_at: 'b' }, decisions: { mine: { count: 4 } } },
    });
    expect(next.sections?.live).toEqual({ generated_at: 'b' });
    expect(next.sections?.decisions).toEqual({ by_type: {}, mine: { count: 4 } });
    expect(next.errors).toEqual({});
    const failed = applyLive(payload, { sections: {}, errors: { live: 'yok' } });
    expect(failed.sections?.live).toEqual({ generated_at: 'a' });
    expect(failed.errors?.live).toBe('yok');
  });
});

describe('series', () => {
  it('builds the weekly net series with the trailing 4-week average', () => {
    const rows = netSeries({
      series_13w: [
        { week_start: '2026-09-07', net_kg: 4000 },
        { week_start: '2026-09-14', net_kg: '8000' },
        { week_start: '2026-09-21', net_kg: -2000 },
        { week_start: '2026-09-28', net_kg: 6000 },
        { week_start: '2026-10-05', net_kg: null, partial: true },
      ],
    });
    expect(rows.map((r) => r.net)).toEqual([4, 8, -2, 6, 0]);
    expect(rows.map((r) => r.avg)).toEqual([null, null, null, 4, 3]);
    expect(rows[0]!.label).toBe('7 Eyl');
    expect(rows[4]!.partial).toBe(true);
  });

  it('marks months with fewer than five completions as small', () => {
    const rows = completionSeries({
      series_6m: [
        { month: '2026-09', on_time: 3, late: 1, pct: '75' },
        { month: '2026-10', on_time: 6, late: 2, pct: null },
      ],
    });
    expect(rows).toEqual([
      { label: 'Eyl 26', onTime: 3, late: 1, pct: 75, small: true },
      { label: 'Eki 26', onTime: 6, late: 2, pct: null, small: false },
    ]);
  });
});

describe('decision rows', () => {
  it('colours by age, vacations and overtime by urgency first', () => {
    expect(decisionColor('purchase_request', { oldest_days: 2 })).toBe('blue');
    expect(decisionColor('purchase_request', { oldest_days: 5 })).toBe('orange');
    expect(decisionColor('purchase_request', { oldest_days: 15 })).toBe('red');
    expect(decisionColor('vacation_request', { oldest_days: 1, urgent: 1 })).toBe('red');
    expect(decisionColor('vacation_request', { oldest_days: 30 })).toBe('orange');
    expect(decisionColor('overtime_request', { oldest_days: 1, starts_2d: 2 })).toBe('red');
  });
});

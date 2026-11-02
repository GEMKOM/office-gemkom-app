import type { CraneType } from '@/api/general/craneRequests';
import {
  availablePricingOptions,
  computeCraneEstimate,
  formatDurationSummary,
  formatMoney,
  suggestActualCost,
} from './crane';

const CRANE: CraneType = {
  id: 1,
  name: '25 ton',
  category: 'mobile_crane',
  current_rate: {
    price_up_to_3h: '1000',
    price_up_to_8h: '2000.00',
    rigger_fee: '500',
    currency: 'TRY',
  },
};
const PLATFORM: CraneType = {
  id: 2,
  name: '12 m',
  category: 'scissor_platform',
  current_rate: { price_per_day: '800', transport_fee: '300', currency: 'EUR' },
};

describe('computeCraneEstimate', () => {
  it('prices the bracket plus the rigger for cranes', () => {
    expect(computeCraneEstimate(CRANE, 'up_to_8h', 1, true)).toEqual({
      total: 2500,
      currency: 'TRY',
      lines: [
        { label: '8 saate kadar', amount: 2000 },
        { label: 'İlave sapancı', amount: 500 },
      ],
    });
  });

  it('prices days × daily plus transport for daily rentals', () => {
    expect(computeCraneEstimate(PLATFORM, 'daily', '3')).toEqual({
      total: 2700,
      currency: 'EUR',
      lines: [
        { label: 'Günlük × 3', amount: 2400 },
        { label: 'Nakliye (gidiş-dönüş)', amount: 300 },
      ],
    });
    // Zero / junk days count as one day.
    expect(computeCraneEstimate(PLATFORM, 'daily', 0)?.total).toBe(1100);
  });

  it('gives null without a rate or for an option the rate does not offer', () => {
    expect(computeCraneEstimate({ current_rate: null }, 'daily')).toBeNull();
    expect(computeCraneEstimate(CRANE, 'daily')).toBeNull();
    expect(computeCraneEstimate(CRANE, '')).toBeNull();
  });
});

describe('suggestActualCost', () => {
  it('moves cranes to the matching bracket and warns past 8 hours', () => {
    expect(suggestActualCost({ needs_rigger: false }, CRANE, 2)).toEqual({
      total: 1000,
      currency: 'TRY',
      note: '3 saate kadar tarifesi',
    });
    expect(suggestActualCost({ needs_rigger: true }, CRANE, '5')).toEqual({
      total: 2500,
      currency: 'TRY',
      note: '8 saate kadar tarifesi + sapancı',
    });
    expect(suggestActualCost({}, CRANE, 10)?.note).toBe(
      '8 saate kadar tarifesi — 8 saati aşan kullanım için tedarikçi faturasını esas alın',
    );
  });

  it('rounds platform days up and adds transport; the row category wins', () => {
    expect(suggestActualCost({}, PLATFORM, 2.5)).toEqual({
      total: 2700,
      currency: 'EUR',
      note: '3 gün × günlük + nakliye',
    });
    expect(suggestActualCost({ crane_type_category: 'mobile_crane' }, PLATFORM, 2)).toBeNull();
  });

  it('gives null for an empty or non-positive quantity', () => {
    expect(suggestActualCost({}, CRANE, '')).toBeNull();
    expect(suggestActualCost({}, CRANE, 0)).toBeNull();
  });
});

it('formats durations, money and available options like legacy', () => {
  expect(formatDurationSummary({ pricing_option: 'daily', days: 3 })).toBe('Günlük × 3');
  expect(formatDurationSummary({ pricing_option: 'up_to_8h', needs_rigger: true })).toBe(
    '8 Saate Kadar + Sapancı',
  );
  expect(formatDurationSummary({ pricing_option_label: 'Özel' })).toBe('Özel');
  expect(formatMoney('1234.5', 'TRY')).toBe('1.234,5 TRY');
  expect(formatMoney(null)).toBe('-');
  expect(formatMoney(1500, '')).toBe('1.500');
  expect(availablePricingOptions(CRANE.current_rate)).toEqual(['up_to_3h', 'up_to_8h']);
  expect(availablePricingOptions(PLATFORM.current_rate)).toEqual(['daily']);
});

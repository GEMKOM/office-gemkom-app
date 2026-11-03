import type { InflowRow } from '@/api/finance/operations';
import { groupLabel, prepareInflowRows, sumEur, UNDATED_GROUP, validateDrafts } from './inflow';

const row = (over: Partial<InflowRow>): InflowRow => ({
  source: 'expected_receipt',
  receipt_id: 1,
  installment_id: 1,
  sequence: 1,
  amount_eur: '10',
  due_date: '2026-11-10',
  is_received: false,
  ...over,
});

describe('prepareInflowRows', () => {
  const rows = [
    row({ installment_id: 1, due_date: null }),
    row({ installment_id: 2, due_date: '2026-12-01', customer_name: 'Petkim' }),
    row({ installment_id: 3, is_received: true }),
    row({
      source: 'sales_offer',
      offer_id: 9,
      sequence: 2,
      receipt_id: null,
      installment_id: null,
    }),
  ];

  it('keeps the pending rows by default and puts undated ones last', () => {
    const out = prepareInflowRows(rows, { isReceived: 'false', source: '', grouping: 'due_month' });
    expect(out.map((r) => r._rowKey)).toEqual(['er-1-2', 'offer-9-2', 'er-1-1']);
    expect(out.map((r) => r._groupKey)).toEqual(['0_2026-12', '0_2026-11', UNDATED_GROUP]);
  });

  it('filters by received state and source', () => {
    expect(
      prepareInflowRows(rows, { isReceived: 'true', source: '', grouping: 'none' }),
    ).toHaveLength(1);
    expect(
      prepareInflowRows(rows, { isReceived: '', source: 'sales_offer', grouping: 'none' }),
    ).toHaveLength(1);
    expect(prepareInflowRows(rows, { isReceived: '', source: '', grouping: 'none' })).toHaveLength(
      4,
    );
  });

  it('groups by customer with a dash for none', () => {
    const out = prepareInflowRows(rows, { isReceived: 'false', source: '', grouping: 'customer' });
    expect(out.map((r) => r._groupKey)).toEqual(['0_Petkim', '0_—', UNDATED_GROUP]);
  });
});

it('labels groups and sums their EUR amounts', () => {
  expect(groupLabel('0_2026-11', 'due_month')).toBe('Kasım 2026');
  expect(groupLabel('0_Petkim', 'customer')).toBe('Petkim');
  expect(groupLabel(UNDATED_GROUP, 'job')).toBe('Vade tarihi yok');
  expect(
    sumEur([row({ amount_eur: '10.5' }), row({ amount_eur: null }), row({ amount_eur: '2' })]),
  ).toBe(12.5);
});

describe('validateDrafts', () => {
  const draft = {
    sequence: 1,
    label: 'Avans',
    amount: '100',
    due_date: '2026-11-01',
    notes: ' n ',
  };

  it('names the row that is wrong, as legacy did', () => {
    expect(validateDrafts([])).toEqual({ ok: false, message: 'En az bir taksit ekleyin.' });
    expect(validateDrafts([draft, { ...draft, sequence: 2, label: ' ' }])).toEqual({
      ok: false,
      message: '2. satırda etiket zorunludur.',
    });
    expect(validateDrafts([{ ...draft, amount: '0' }])).toMatchObject({
      message: '1. satırda geçerli bir tutar girin.',
    });
    expect(validateDrafts([{ ...draft, due_date: '' }])).toMatchObject({
      message: '1. satırda vade tarihi zorunludur.',
    });
    expect(validateDrafts([draft, { ...draft }])).toMatchObject({
      message: 'Taksit sıra numaraları benzersiz olmalıdır.',
    });
  });

  it('returns payloads ordered by sequence with fixed decimals', () => {
    const result = validateDrafts([{ ...draft, sequence: 2, label: 'Son', amount: '1,5' }, draft]);
    expect(result).toEqual({
      ok: true,
      payloads: [
        { sequence: 1, label: 'Avans', amount: '100.00', due_date: '2026-11-01', notes: 'n' },
        { sequence: 2, label: 'Son', amount: '1.50', due_date: '2026-11-01', notes: 'n' },
      ],
    });
  });
});

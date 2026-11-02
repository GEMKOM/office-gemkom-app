import { describe, expect, it } from 'vitest';
import {
  groupSorted,
  hasOutflowContent,
  inflowRows,
  inflowTotal,
  isInflowOverdue,
  isOutflowOverdue,
  outflowDetail,
  outflowItemCount,
  sectionHasContent,
  sumOutflowPaidAwaiting,
} from './drilldownData';

const today = new Date(2026, 9, 20, 15, 30);

describe('month drill-down', () => {
  it('accepts only an array of inflows and an object of outflows', () => {
    expect(inflowRows({ results: [] })).toEqual([]);
    expect(outflowDetail([])).toBeNull();
    expect(outflowDetail(null)).toBeNull();
    expect(
      inflowTotal([{ installment_amount_eur: '10.5' }, { installment_amount_eur: null }]),
    ).toBe(10.5);
  });

  it('counts outflow items, wages as one', () => {
    const data = {
      procurement: [{}, {}],
      wages: { total_eur: '100' },
      expenses: [{}],
      loans: [],
      taxes: [{}],
      adhoc_costs: [{}],
    };
    expect(outflowItemCount(data)).toBe(6);
    expect(outflowItemCount({ wages: { total_eur: '0' } })).toBe(0);
    expect(hasOutflowContent({ totals: { grand_total_eur: '5' } })).toBe(true);
    expect(hasOutflowContent({})).toBe(false);
    expect(sectionHasContent(data, 'wages')).toBe(true);
    expect(sectionHasContent(data, 'loans')).toBe(false);
  });

  it('splits paid and awaiting over procurement, loans and taxes only', () => {
    expect(
      sumOutflowPaidAwaiting({
        procurement: [
          { amount_eur: '100', is_paid: true },
          { amount_eur: '40', is_paid: false },
        ],
        loans: [{ amount_eur: '10' }],
        taxes: [{ amount_eur: '5', is_paid: true }],
        expenses: [{ amount_eur: '999' }],
      }),
    ).toEqual({ paidTotal: 105, awaitTotal: 50 });
  });

  it('marks overdue by local day', () => {
    expect(isOutflowOverdue({ due_date: '2026-10-19' }, today)).toBe(true);
    expect(isOutflowOverdue({ due_date: '2026-10-20' }, today)).toBe(false);
    expect(isOutflowOverdue({ due_date: '2026-10-01', is_paid: true }, today)).toBe(false);
    expect(
      isInflowOverdue({ installment_due_date: '2026-10-01', job_status: 'active' }, today),
    ).toBe(true);
    expect(
      isInflowOverdue({ installment_due_date: '2026-10-01', job_status: 'completed' }, today),
    ).toBe(false);
  });

  it('groups in Turkish order', () => {
    const groups = groupSorted(['Çelik', 'Zeta', 'Cam', 'Çelik'], (s) => s);
    expect(groups.map(([k, v]) => [k, v.length])).toEqual([
      ['Cam', 1],
      ['Çelik', 2],
      ['Zeta', 1],
    ]);
  });
});

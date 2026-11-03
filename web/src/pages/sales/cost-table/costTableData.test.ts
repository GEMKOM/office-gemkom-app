import {
  assignmentTotals,
  jobCostFigures,
  machiningEntryRows,
  rateText,
  samePrice,
  sortByDate,
  tableFilters,
} from './costTableData';

const NO_FILTERS = {
  status: '',
  search: '',
  customer: '',
  manufactured: '',
  date_field: '',
  date: { start: '', end: '' },
  template_node: '',
};

describe('tableFilters', () => {
  it('sends nothing for empty filters', () => {
    expect(tableFilters(NO_FILTERS)).toEqual({});
  });

  it('puts the date range on the target date by default and on the chosen field', () => {
    const date = { start: '2026-01-01', end: '2026-03-31' };
    expect(tableFilters({ ...NO_FILTERS, date })).toEqual({
      target_completion_date__gte: '2026-01-01',
      target_completion_date__lte: '2026-03-31',
    });
    expect(tableFilters({ ...NO_FILTERS, date_field: 'created', date })).toEqual({
      created_at__date__gte: '2026-01-01',
      created_at__date__lte: '2026-03-31',
    });
  });

  it('keeps one status, a numeric customer and a valid İmalat value', () => {
    expect(
      tableFilters({
        ...NO_FILTERS,
        status: 'completed',
        customer: '12',
        manufactured: 'true',
        template_node: '3,4',
      }),
    ).toEqual({ status: 'completed', customer: 12, manufactured: 'true', template_node: '3,4' });
    expect(tableFilters({ ...NO_FILTERS, customer: 'x', manufactured: 'maybe' })).toEqual({});
  });
});

describe('samePrice / rateText', () => {
  it('treats a change under a cent as no change', () => {
    expect(samePrice(100.004, '100.00')).toBe(true);
    expect(samePrice(100.01, '100.00')).toBe(false);
    expect(samePrice(0, null)).toBe(false);
  });

  it('drops trailing zeros from the general expenses rate', () => {
    expect(rateText('0.1500')).toBe('0.15');
    expect(rateText(null)).toBeNull();
    expect(rateText('abc')).toBeNull();
  });
});

describe('jobCostFigures', () => {
  it('adds up department hours and overtime, and the cost per hour', () => {
    const f = jobCostFigures({
      combined_total_cost: 900,
      combined_total_hours: 30,
      machining: {
        total_cost: 600,
        hours: { weekday_work: 10, after_hours: 4, sunday: 1 },
        costs: { after_hours: 80, sunday: 20 },
      },
      welding: {
        total_cost: 300,
        hours: { regular: 12, after_hours: 3 },
        costs: { after_hours: 45, holiday: null },
      },
    });
    expect(f.costPerHour).toBe(30);
    expect(f.machining).toEqual({
      totalCost: 600,
      totalHours: 15,
      overtimeCost: 100,
      costPerHour: 40,
    });
    expect(f.welding).toEqual({
      totalCost: 300,
      totalHours: 15,
      overtimeCost: 45,
      costPerHour: 20,
    });
  });

  it('has no department block without its data and no rate without hours', () => {
    const f = jobCostFigures({ combined_total_cost: 50 });
    expect(f.machining).toBeNull();
    expect(f.welding).toBeNull();
    expect(f.costPerHour).toBe(0);
  });
});

describe('entry rows', () => {
  it('orders machining entries by start time and flattens grouped operations', () => {
    const rows = machiningEntryRows([
      {
        operation_key: 'OP-9',
        operation_name: 'Taşlama',
        entries: [{ id: 3, start_time: 3000, hours: '1.5', work_type: 'sunday' }],
      },
      { id: 1, start_time: 1000, operation_key: 'OP-1', hours: 2 },
    ]);
    expect(rows.map((r) => [r.id, r.operation_key, r.operation_name, r.hours])).toEqual([
      ['1', 'OP-1', '-', 2],
      ['3', 'OP-9', 'Taşlama', 1.5],
    ]);
  });

  it('orders welding entries by date', () => {
    expect(
      sortByDate([{ date: '2026-03-02' }, { date: '2026-01-15' }, { date: null }]).map(
        (e) => e.date,
      ),
    ).toEqual([null, '2026-01-15', '2026-03-02']);
  });

  it('totals subcontractor assignments', () => {
    expect(
      assignmentTotals([
        { id: 1, current_cost: '100.5', unbilled_cost: '10', allocated_weight_kg: '50' },
        { id: 2, current_cost: 200, unbilled_cost: null, allocated_weight_kg: '25.25' },
      ]),
    ).toEqual({ count: 2, cost: 300.5, unbilled: 10, weight: 75.25 });
  });
});

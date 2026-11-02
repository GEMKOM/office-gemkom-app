import type { CostTableRow } from '@/api/projects/cost';
import {
  breakdownSellingPrice,
  breakdownWeight,
  costTotals,
  jobLaborFigures,
  laborByJobRows,
  localDay,
  machiningOperations,
  machiningTableRows,
  marginPctOf,
  marginTone,
  mergeExpandedChildren,
  splitOverhead,
  summaryFigures,
  tableFilters,
  topCostStack,
  weldingGroups,
  type AnalyticsFilterValues,
} from './analyticsData';

const EMPTY: AnalyticsFilterValues = {
  status: [],
  search: '',
  customer: '',
  facility: '',
  manufactured: '',
  date_field: '',
  date: { start: '', end: '' },
  template_node: '',
};

const row = (job_no: string, fields: Partial<CostTableRow> = {}): CostTableRow => ({
  job_no,
  ...fields,
});

describe('tableFilters', () => {
  it('sends only set, valid filters, as legacy loadData did', () => {
    expect(tableFilters(EMPTY)).toEqual({});
    expect(
      tableFilters({
        ...EMPTY,
        status: ['active', 'on_hold'],
        search: 'pump',
        customer: '12',
        facility: 'rolling_mill',
        manufactured: 'false',
        template_node: '4,5',
      }),
    ).toEqual({
      status__in: 'active,on_hold',
      search: 'pump',
      customer: 12,
      facility: 'rolling_mill',
      manufactured: 'false',
      template_node: '4,5',
    });
    expect(
      tableFilters({ ...EMPTY, facility: 'x', manufactured: 'maybe', customer: 'abc' }),
    ).toEqual({});
  });

  it('puts the date range on the field the Tarih Alanı select names (target by default)', () => {
    const date = { start: '2026-01-01', end: '2026-03-31' };
    expect(tableFilters({ ...EMPTY, date })).toEqual({
      target_completion_date__gte: '2026-01-01',
      target_completion_date__lte: '2026-03-31',
    });
    expect(tableFilters({ ...EMPTY, date, date_field: 'created' })).toEqual({
      created_at__date__gte: '2026-01-01',
      created_at__date__lte: '2026-03-31',
    });
    expect(
      tableFilters({
        ...EMPTY,
        date: { start: '', end: '2026-02-01' },
        date_field: 'last_updated',
      }),
    ).toEqual({
      cost_summary__last_updated__date__lte: '2026-02-01',
    });
  });
});

describe('mergeExpandedChildren', () => {
  it('splices loaded children under expanded rows, one level deeper each time', () => {
    const roots = [row('A'), row('B')];
    const children = new Map([
      ['A', [row('A-1'), row('A-2')]],
      ['A-1', [row('A-1-1')]],
    ]);
    const merged = mergeExpandedChildren(roots, new Set(['A', 'A-1']), children);
    expect(merged.map((r) => `${r.job_no}:${r.hierarchy_level}`)).toEqual([
      'A:0',
      'A-1:1',
      'A-1-1:2',
      'A-2:1',
      'B:0',
    ]);
    expect(mergeExpandedChildren(roots, new Set(), children)).toHaveLength(2);
  });
});

describe('costTotals (the footer)', () => {
  const rows = mergeExpandedChildren(
    [
      row('A', {
        labor_cost: '100',
        employee_overhead_cost: '20',
        material_cost: '300',
        paint_cost: '10',
        paint_material_cost: '5',
        total_weight_kg: '100',
        actual_total_cost: '500',
        estimated_total_cost: '450',
        selling_price: '800',
        general_expenses_rate: '0.08',
      }),
      row('B', {
        actual_total_cost: '200',
        total_weight_kg: '100',
        selling_price: '0',
        selling_price_display: '300',
        selling_price_display_source: 'rolled_up_from_children',
        general_expenses_rate: '0',
      }),
      row('C', {
        actual_total_cost: '100',
        selling_price: null,
        selling_price_display: '999',
        selling_price_display_source: 'allocated_from_parent',
        general_expenses_rate: '0.12',
      }),
    ],
    new Set(['A']),
    new Map([
      [
        'A',
        [row('A-1', { actual_total_cost: '400', selling_price: '700', total_weight_kg: '80' })],
      ],
    ]),
  );

  it('counts top-level rows only: children are already in their parent', () => {
    const t = costTotals(rows);
    expect(t.rows).toBe(3);
    expect(t.actualTotalCost).toBe(800);
    expect(t.weightKg).toBe(200);
    expect(t.laborWithTax).toBe(120);
    expect(t.paintWithMaterial).toBe(15);
  });

  it('adds rolled-up prices but never allocated ones; the margin comes from the totals', () => {
    const t = costTotals(rows);
    expect(t.sellingPrice).toBe(1100);
    expect(t.marginEur).toBe(300);
    expect(t.marginPct).toBeCloseTo((300 / 1100) * 100);
  });

  it('weights €/kg by total weight and averages the non-zero rates', () => {
    const t = costTotals(rows);
    expect(t.pricePerKg).toBe(4);
    expect(t.sellingPricePerKg).toBe(5.5);
    expect(t.generalExpensesRateAvg).toBeCloseTo(0.1);
  });

  it('has no ratios without weight or price', () => {
    const t = costTotals([]);
    expect(t.pricePerKg).toBeNull();
    expect(t.sellingPricePerKg).toBeNull();
    expect(t.marginPct).toBeNull();
    expect(t.generalExpensesRateAvg).toBeNull();
  });
});

describe('summaryFigures and topCostStack', () => {
  const rows = [
    row('A', { selling_price: '1000', margin_pct: '20', actual_total_cost: '800' }),
    row('B', { selling_price: '0', margin_pct: '-50', actual_total_cost: '300' }),
    row('C', { selling_price: '500', margin_pct: '10', actual_total_cost: '450' }),
  ];

  it('averages the margin over rows with an entered price', () => {
    expect(summaryFigures(rows)).toEqual({ avgMarginPct: 15, totalRevenue: 1500, totalCost: 1550 });
    expect(summaryFigures([]).avgMarginPct).toBe(0);
  });

  it('ranks the costliest jobs and puts the rest of the cost in Diğer (never negative)', () => {
    const stack = topCostStack(
      [
        row('S', {
          actual_total_cost: '100',
          labor_cost: '50',
          employee_overhead_cost: '10',
          material_cost: '30',
        }),
        row('L', {
          actual_total_cost: '900',
          labor_cost: '100',
          material_cost: '500',
          subcontractor_cost: '400',
        }),
      ],
      15,
    );
    expect(stack.map((r) => r.job_no)).toEqual(['L', 'S']);
    expect(stack[0]).toMatchObject({ labor: 100, material: 500, subcontractor: 400, other: 0 });
    expect(stack[1]).toMatchObject({ labor: 60, material: 30, subcontractor: 0, other: 10 });
    expect(topCostStack(rows, 2)).toHaveLength(2);
  });
});

describe('labor drill-downs', () => {
  it('splits the vergi by net labor share', () => {
    expect(splitOverhead(100, 300, 100)).toEqual({ mach: 75, weld: 25 });
    expect(splitOverhead(100, 0, 0)).toEqual({ mach: 0, weld: 0 });
    expect(splitOverhead('50', null, undefined)).toEqual({ mach: 0, weld: 0 });
  });

  it('follows the table row in Özet and sums department hours', () => {
    const job = {
      machining: {
        total_cost: 300,
        hours: { weekday_work: 10, after_hours: 2, sunday: 1 },
        costs: { after_hours: 40, sunday: 20 },
      },
      welding: {
        total_cost: 100,
        hours: { regular: 5, after_hours: 1, holiday: 0 },
        costs: { after_hours: 10 },
      },
      combined_total_hours: 19,
      by_job: [{ job_no: 'A' }, { job_no: 'A-1' }],
    };
    const f = jobLaborFigures(job, row('A', { labor_cost: '420', employee_overhead_cost: '80' }));
    expect(f.laborNet).toBe(420);
    expect(f.laborWithTax).toBe(500);
    expect(f.costPerHourWithTax).toBeCloseTo(500 / 19);
    expect(f.multiJob).toBe(true);
    expect(f.machining).toMatchObject({
      base: 300,
      tax: 60,
      withTax: 360,
      hours: 13,
      overtimeCost: 60,
    });
    expect(f.welding).toMatchObject({
      base: 100,
      tax: 20,
      withTax: 120,
      hours: 6,
      overtimeCost: 10,
    });

    const noRow = jobLaborFigures({ ...job, welding: null }, null);
    expect(noRow.laborNet).toBe(300);
    expect(noRow.overhead).toBe(0);
    expect(noRow.welding).toBeNull();
  });

  it('totals labor per job order without vergi', () => {
    const { rows, total } = laborByJobRows([
      { job_no: 'A', machining_cost: '10', welding_cost: 5, machining_hours: 1, welding_hours: 2 },
      { job_no: 'B', machining_cost: null, welding_cost: '7', welding_hours: '1.5' },
    ]);
    expect(rows[0]).toMatchObject({ total: 15, hours: 3 });
    expect(total).toEqual({ machining: 10, welding: 12, total: 22, hours: 4.5 });
  });
});

describe('machining and welding entries', () => {
  it('uses local days, not UTC (an entry at 01:00 Istanbul is that day)', () => {
    // 2026-10-05 22:30 UTC = 2026-10-06 01:30 in UTC+3.
    const ts = Date.UTC(2026, 9, 5, 22, 30);
    const expected = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, '0');
    expect(localDay(ts)).toBe(
      `${expected.getFullYear()}-${pad(expected.getMonth() + 1)}-${pad(expected.getDate())}`,
    );
    expect(localDay(null)).toBe('-');
  });

  it('lists a Toplam row per operation, then its entries by start time', () => {
    const { rows, multiJob } = machiningTableRows([
      {
        job_no: 'A',
        operation_key: 'OP10',
        operation_name: 'Torna',
        total_hours: 3,
        total_cost: '30',
        entries: [
          { id: 2, start_time: 2000, hours: 1, cost: 10 },
          { id: 1, start_time: 1000, hours: 2, cost: 20, employee_username: 'u1' },
        ],
      },
    ]);
    expect(multiJob).toBe(false);
    expect(rows.map((r) => [r.id, r.summary, r.hours])).toEqual([
      ['summary-OP10', true, 3],
      ['OP10-1', false, 2],
      ['OP10-2', false, 1],
    ]);
    expect(rows[1]!.employee).toBe('u1');
  });

  it('groups flat entries per job order and operation', () => {
    const ops = machiningOperations([
      { id: 1, job_no: 'A', operation_key: 'OP10', operation_name: 'Torna', hours: 2, cost: 20 },
      { id: 2, job_no: 'A-1', operation_key: 'OP10', operation_name: 'Torna', hours: 1, cost: 5 },
      {
        id: 3,
        job_no: 'A',
        operation_key: 'OP10',
        operation_name: 'Torna',
        hours: '1.5',
        cost: '15',
      },
    ]);
    expect(ops).toHaveLength(2);
    expect(ops[0]).toMatchObject({ job_no: 'A', total_hours: 3.5, total_cost: 35 });
    const { rows, multiJob } = machiningTableRows(ops);
    expect(multiJob).toBe(true);
    expect(rows[0]!.group).toBe('A | OP10');
  });

  it('sorts welding entries by date and groups a subtree per job order', () => {
    const g = weldingGroups([
      { job_no: 'B', date: '2026-10-02', hours: 2, cost: '20' },
      { job_no: 'A', date: '2026-10-01', hours: 1, cost: 10 },
      { job_no: 'B', date: '2026-10-03', hours: 3, cost: 30 },
    ]);
    expect(g.multiJob).toBe(true);
    expect(g.sorted.map((e) => e.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
    expect(g.groups).toEqual([
      expect.objectContaining({ jobNo: 'A', hours: 1, cost: 10 }),
      expect.objectContaining({ jobNo: 'B', hours: 5, cost: 50 }),
    ]);
  });
});

describe('margins and the estimated breakdown', () => {
  it('bands the margin chip: > 15 green, 5–15 amber, < 5 red, no price amber', () => {
    expect(marginTone('15.01', 100)).toBe('green');
    expect(marginTone(15, 100)).toBe('amber');
    expect(marginTone(5, 100)).toBe('amber');
    expect(marginTone(4.99, 100)).toBe('red');
    expect(marginTone(30, 0)).toBe('none');
    expect(marginTone(null, 100)).toBeNull();
  });

  it('takes weight and price from the breakdown, then the table row', () => {
    const costRow = row('A', {
      total_weight_kg: '50',
      selling_price: '0',
      selling_price_display: '900',
      selling_price_display_source: 'allocated_from_parent',
    });
    expect(breakdownWeight({ subtree_weight_kg: '120', total_weight_kg: '10' }, costRow)).toBe(120);
    expect(breakdownWeight({ subtree_weight_kg: null }, costRow)).toBe(50);
    expect(breakdownSellingPrice({ selling_price_eur: '1000' }, costRow)).toBe(1000);
    // Own price 0 → falls back to the display price.
    expect(breakdownSellingPrice({}, costRow)).toBe(900);
    expect(breakdownSellingPrice({}, null)).toBe(0);
    expect(marginPctOf(1000, '750')).toBe(25);
    expect(marginPctOf(0, 10)).toBeNull();
  });
});

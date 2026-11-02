import { describe, expect, it } from 'vitest';
import type { CuttingPlanTask, MachiningPlanOperation } from '@/api/manufacturing/capacityPlanning';
import {
  addToPlan,
  applyOverrides,
  autoschedule,
  cuttingSaveItems,
  machiningSaveItems,
  mergeOverrides,
  nextWorkingTime,
  removeFromPlan,
  reorderCutting,
  reorderMachining,
  workingTimeEnd,
} from './planLogic';

const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);

const cnc: CuttingPlanTask[] = [
  {
    key: 'CNC-1',
    name: 'Sac A',
    in_plan: true,
    plan_order: 1,
    plan_locked: false,
    planned_start_ms: 1000,
    planned_end_ms: 2000,
    machine_fk: 7,
  },
  {
    key: 'CNC-2',
    name: 'Sac B',
    in_plan: true,
    plan_order: 2,
    plan_locked: true,
    planned_start_ms: null,
    planned_end_ms: null,
    machine_fk: 7,
  },
  {
    key: 'CNC-3',
    name: 'Sac C',
    in_plan: true,
    plan_order: 3,
    plan_locked: false,
    planned_start_ms: 5000,
    planned_end_ms: 6000,
    machine_fk: 7,
  },
  {
    key: 'CNC-4',
    name: 'Sac D',
    in_plan: false,
    plan_order: null,
    plan_locked: false,
    machine_fk: 7,
  },
];
const byKey = new Map(cnc.map((t) => [t.key, t]));

describe('draft overrides', () => {
  it('keeps untouched rows by identity and drops fields back at the server value', () => {
    const overrides = mergeOverrides(new Map(), new Map([['CNC-1', { plan_order: 5 }]]), byKey);
    const rows = applyOverrides(cnc, overrides);
    expect(rows[0]).toEqual({ ...cnc[0], plan_order: 5 });
    expect(rows[1]).toBe(cnc[1]);
    const undone = mergeOverrides(overrides, new Map([['CNC-1', { plan_order: 1 }]]), byKey);
    expect(undone.size).toBe(0);
    expect(applyOverrides(cnc, undone)).toBe(cnc);
  });
});

describe('cutting planner', () => {
  it('reorders planned rows and renumbers all of them', () => {
    const after = reorderCutting(cnc, 'CNC-1', 'CNC-3', 'after');
    expect(Object.fromEntries([...after].map(([k, v]) => [k, v.plan_order]))).toEqual({
      'CNC-2': 1,
      'CNC-3': 2,
      'CNC-1': 3,
    });
    const before = reorderCutting(cnc, 'CNC-3', 'CNC-1', 'before');
    expect(Object.fromEntries([...before].map(([k, v]) => [k, v.plan_order]))).toEqual({
      'CNC-3': 1,
      'CNC-1': 2,
      'CNC-2': 3,
    });
    expect(reorderCutting(cnc, 'CNC-4', 'CNC-1', 'before').size).toBe(0); // unplanned rows are not in the queue
  });

  it('adds to the end of the plan and removes with dates cleared', () => {
    expect(addToPlan(cnc, 'CNC-4').get('CNC-4')).toEqual({
      in_plan: true,
      plan_order: 4,
      plan_locked: false,
      planned_start_ms: null,
      planned_end_ms: null,
    });
    expect(removeFromPlan('CNC-1').get('CNC-1')).toEqual({
      in_plan: false,
      plan_order: null,
      planned_start_ms: null,
      planned_end_ms: null,
      plan_locked: false,
    });
  });

  it('builds the bulk-save items like legacy savePlan', () => {
    const overrides = mergeOverrides(
      new Map(),
      new Map<string, Partial<CuttingPlanTask>>([
        ['CNC-1', { planned_start_ms: 1500, planned_end_ms: 2500 }],
        [
          'CNC-3',
          { in_plan: false, plan_order: null, planned_start_ms: null, planned_end_ms: null },
        ],
        ...addToPlan(cnc, 'CNC-4'),
      ]),
      byKey,
    );
    expect(cuttingSaveItems(cnc, applyOverrides(cnc, overrides))).toEqual([
      {
        key: 'CNC-1',
        in_plan: true,
        machine_fk: 7,
        name: 'Sac A',
        planned_start_ms: 1500,
        planned_end_ms: 2500,
        plan_order: 1,
        plan_locked: false,
      },
      { key: 'CNC-3', in_plan: false },
      {
        key: 'CNC-4',
        in_plan: true,
        machine_fk: 7,
        name: 'Sac D',
        plan_order: 4,
        plan_locked: false,
      },
    ]);
    expect(cuttingSaveItems(cnc, cnc)).toEqual([]);
  });
});

// Mon-Fri 08:00-12:00 + 13:00-17:00; weekend off; Wed 4 Nov 2026 closed.
const calendar = {
  week_template: {
    '0': [
      { start: '08:00', end: '12:00' },
      { start: '13:00', end: '17:00' },
    ],
    '1': [
      { start: '08:00', end: '12:00' },
      { start: '13:00', end: '17:00' },
    ],
    '2': [
      { start: '08:00', end: '12:00' },
      { start: '13:00', end: '17:00' },
    ],
    '3': [
      { start: '08:00', end: '12:00' },
      { start: '13:00', end: '17:00' },
    ],
    '4': [
      { start: '08:00', end: '12:00' },
      { start: '13:00', end: '17:00' },
    ],
  },
  work_exceptions: [{ date: '2026-11-04', windows: [] }],
};

describe('working time (legacy getNextWorkingTime / getWorkingTimeEnd)', () => {
  it('finds the next working moment', () => {
    expect(nextWorkingTime(local(2026, 11, 2, 6), calendar)).toEqual(local(2026, 11, 2, 8));
    expect(nextWorkingTime(local(2026, 11, 2, 12, 30), calendar)).toEqual(local(2026, 11, 2, 13));
    expect(nextWorkingTime(local(2026, 11, 2, 9), calendar)).toEqual(local(2026, 11, 2, 9));
    expect(nextWorkingTime(local(2026, 11, 7, 10), calendar)).toEqual(local(2026, 11, 9, 8)); // Saturday -> Monday
    expect(nextWorkingTime(local(2026, 11, 4, 10), calendar)).toEqual(local(2026, 11, 5, 8)); // closed day
  });

  it('spends working time across windows and days', () => {
    expect(workingTimeEnd(local(2026, 11, 2, 8), 3 * 3_600_000, calendar)).toEqual(
      local(2026, 11, 2, 11),
    );
    expect(workingTimeEnd(local(2026, 11, 2, 11), 2 * 3_600_000, calendar)).toEqual(
      local(2026, 11, 2, 14),
    );
    expect(workingTimeEnd(local(2026, 11, 3, 16), 2 * 3_600_000, calendar)).toEqual(
      local(2026, 11, 5, 9),
    ); // skips the closed Wednesday
    expect(workingTimeEnd(local(2026, 11, 2, 8), 3_600_000, null)).toEqual(local(2026, 11, 2, 9));
  });
});

describe('autoschedule', () => {
  const tasks: CuttingPlanTask[] = [
    {
      key: 'A',
      in_plan: true,
      plan_order: 2,
      estimated_hours: '3',
      remaining_hours: 1,
      finish_time: '2026-11-20',
    },
    {
      key: 'B',
      in_plan: true,
      plan_order: 1,
      estimated_hours: null,
      remaining_hours: null,
      finish_time: '2026-11-10',
    },
    { key: 'C', in_plan: false, plan_order: null, estimated_hours: 5 },
  ];

  it('plans the queue back to back within working hours', () => {
    const patches = autoschedule(
      tasks,
      { criteria: 'order', durationType: 'estimated', start: local(2026, 11, 2, 7) },
      calendar,
    );
    expect(patches.get('B')).toEqual({
      planned_start_ms: local(2026, 11, 2, 8).getTime(),
      planned_end_ms: local(2026, 11, 2, 10).getTime(),
    }); // 2 h default
    expect(patches.get('A')).toEqual({
      planned_start_ms: local(2026, 11, 2, 10).getTime(),
      planned_end_ms: local(2026, 11, 2, 14).getTime(),
    });
    expect(patches.has('C')).toBe(false);
  });

  it('by due date renumbers the queue; remaining hours first', () => {
    const patches = autoschedule(
      tasks,
      { criteria: 'finish_time', durationType: 'remaining', start: local(2026, 11, 2, 8) },
      null,
    );
    expect(patches.get('B')).toMatchObject({
      plan_order: 1,
      planned_start_ms: local(2026, 11, 2, 8).getTime(),
      planned_end_ms: local(2026, 11, 2, 10).getTime(),
    });
    expect(patches.get('A')).toMatchObject({
      plan_order: 2,
      planned_end_ms: local(2026, 11, 2, 11).getTime(),
    });
  });
});

describe('machining queue', () => {
  const ops: MachiningPlanOperation[] = [
    { key: 'OP-1', in_plan: true, plan_order: 1, plan_locked: false },
    { key: 'OP-2', in_plan: true, plan_order: 2, plan_locked: false },
    { key: 'OP-3', in_plan: true, plan_order: 3, plan_locked: true },
    { key: 'OP-9', in_plan: false, plan_order: null, plan_locked: false },
  ];

  it('locks the dragged row and renumbers the planned ones', () => {
    const patches = reorderMachining(ops, 'OP-3', 'OP-1', 'before');
    expect(Object.fromEntries(patches)).toEqual({
      'OP-3': { in_plan: true, plan_locked: true, plan_order: 1 },
      'OP-1': { plan_order: 2 },
      'OP-2': { plan_order: 3 },
    });
  });

  it('brings an unplanned row into the plan where it is dropped', () => {
    const patches = reorderMachining(ops, 'OP-9', 'OP-1', 'after');
    expect(patches.get('OP-9')).toEqual({ in_plan: true, plan_locked: true, plan_order: 2 });
    expect(patches.get('OP-2')).toEqual({ plan_order: 3 });
    expect(patches.get('OP-3')).toEqual({ plan_order: 4 });
  });

  it('sends changed rows with the moved ones locked (bare array)', () => {
    const base = new Map(ops.map((t) => [t.key, t]));
    const current = applyOverrides(
      ops,
      mergeOverrides(new Map(), reorderMachining(ops, 'OP-1', 'OP-2', 'after'), base),
    );
    expect(machiningSaveItems(ops, current, new Set(['OP-1']))).toEqual([
      { key: 'OP-1', in_plan: true, plan_order: 2, plan_locked: true },
      { key: 'OP-2', in_plan: true, plan_order: 1 },
    ]);
  });
});

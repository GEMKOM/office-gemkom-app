import { describe, expect, it } from 'vitest';
import { performance, productionPlanGantt, taskProgress } from './productionPlan';

const DAY = 86_400_000;
const now = new Date(2026, 10, 10, 12).getTime();

describe('taskProgress (legacy processTasksForProgress)', () => {
  it('derives progress and status', () => {
    expect(taskProgress({ key: 'A', total_hours_spent: 5, estimated_hours: 10 }, now)).toEqual({
      progress: 50,
      status: 'in-progress',
    });
    expect(
      taskProgress(
        { key: 'B', total_hours_spent: 5, estimated_hours: 10, completion_date: now },
        now,
      ),
    ).toEqual({ progress: 100, status: 'completed' });
    expect(taskProgress({ key: 'C', total_hours_spent: 12, estimated_hours: 10 }, now)).toEqual({
      progress: 100,
      status: 'ready-for-completion',
    });
    expect(
      taskProgress({ key: 'D', total_hours_spent: 1, estimated_hours: 10, is_hold: true }, now)
        .status,
    ).toBe('on-hold');
    expect(
      taskProgress(
        { key: 'E', total_hours_spent: 1, estimated_hours: 10, planned_end_ms: now - DAY },
        now,
      ).status,
    ).toBe('delayed');
    expect(taskProgress({ key: 'F', total_hours_spent: 3 }, now)).toEqual({
      progress: 50,
      status: 'in-progress',
    });
    expect(taskProgress({ key: 'G', total_hours_spent: 0, estimated_hours: null }, now)).toEqual({
      progress: 0,
      status: 'in-progress',
    });
  });
});

describe('productionPlanGantt', () => {
  it('orders rows by plan order, uses fallbacks for dates and colours progress by status', () => {
    const { rows, bars } = productionPlanGantt(
      [
        {
          key: 'T2',
          plan_order: 2,
          actual_start_ms: now - 2 * DAY,
          completion_date: now - DAY,
          total_hours_spent: 4,
          estimated_hours: 4,
        },
        {
          key: 'T1',
          plan_order: 1,
          name: 'Mil',
          planned_start_ms: now,
          planned_end_ms: now + DAY,
          total_hours_spent: 1,
          estimated_hours: 4,
        },
        { key: 'T3', plan_order: 3 },
      ],
      now,
    );
    expect(rows.map((r) => r.id)).toEqual(['T1', 'T2', 'T3']);
    expect(bars.map((b) => [b.id, b.progress, b.progressTone, b.label])).toEqual([
      ['T1', 25, 'green', undefined],
      ['T2', 100, 'green', undefined],
    ]);
    expect(bars[1]!.start).toBe(now - 2 * DAY);
  });
});

describe('performance (completion modal)', () => {
  it('ongoing task', () => {
    expect(
      performance(
        { key: 'A', estimated_hours: 10, total_hours_spent: 4, planned_end_ms: now + 2 * DAY },
        now,
      ),
    ).toMatchObject({
      efficiency: '100.0%',
      hourDifference: '6 saat kaldı',
      dateDifference: '2 gün kaldı',
    });
  });

  it('completed task', () => {
    expect(
      performance(
        {
          key: 'A',
          estimated_hours: 10,
          total_hours_spent: 8,
          completion_date: now + DAY,
          planned_end_ms: now,
        },
        now,
      ),
    ).toMatchObject({
      efficiency: '125.0%',
      hourDifference: '2.00 saat',
      dateDifference: '+1 gün gecikme',
    });
  });
});

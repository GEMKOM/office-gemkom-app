import { describe, expect, it } from 'vitest';
import { formatDuration, timelineView } from './timeline';

const segments = [
  {
    start_ms: 1000,
    end_ms: 5000,
    category: 'work',
    task_key: 'OP-1',
    task_name: 'Torna',
    timer_id: 7,
  },
  { start_ms: 5000, end_ms: 6000, category: 'hold', task_key: 'H-1', task_name: null },
  { start_ms: 6000, end_ms: 7000, category: 'idle' },
];

describe('timelineView', () => {
  const response = {
    machines: [
      {
        machine_id: 21,
        machine_name: 'Torna 1',
        segments,
        totals: { productive_seconds: 100, hold_seconds: 20, idle_seconds: 5 },
      },
      {
        machine_id: 22,
        machine_name: 'Freze 2',
        segments: [],
        totals: { productive_seconds: 50, hold_seconds: 0, idle_seconds: 1 },
      },
    ],
  };

  it('one machine: a row per segment, coloured by category, its totals', () => {
    const view = timelineView(response, '21')!;
    expect(view.rows.map((r) => [r.label, r.sublabel])).toEqual([
      ['OP-1', 'Torna'],
      ['H-1', 'Bekleme'],
      ['Boşta', 'Boşta'],
    ]);
    expect(view.bars.map((b) => [b.tone, b.timerId])).toEqual([
      ['green', 7],
      ['yellow', null],
      ['red', null],
    ]);
    expect(view.totals).toEqual({ productive_seconds: 100, hold_seconds: 20, idle_seconds: 5 });
  });

  it('all machines: a row per machine with segments, summed totals unless overall_totals', () => {
    const view = timelineView(response, 'all')!;
    expect(view.rows).toEqual([{ id: 'machine-0', label: 'Torna 1' }]);
    expect(view.bars).toHaveLength(3);
    expect(view.bars.every((b) => b.rowId === 'machine-0')).toBe(true);
    expect(view.totals).toEqual({ productive_seconds: 150, hold_seconds: 20, idle_seconds: 6 });
    const withOverall = timelineView(
      { ...response, overall_totals: { productive_seconds: 9 } },
      'all',
    )!;
    expect(withOverall.totals).toEqual({ productive_seconds: 9, hold_seconds: 0, idle_seconds: 0 });
  });

  it('reads the older segments format', () => {
    expect(timelineView({ segments }, '21')!.rows).toHaveLength(3);
  });

  it('formats durations like legacy', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(25 * 60)).toBe('25m');
    expect(formatDuration(3 * 3600 + 25 * 60)).toBe('3h 25m');
  });
});

import { describe, expect, it } from 'vitest';
import { groupBarsByRow, moveRow, navigate, shallowEqualArrays } from './layout';

const rows = [{ id: 'r1' }, { id: 'r2' }, { id: 'empty' }, { id: 'r3' }];
const bars = [
  { id: 'b', rowId: 'r1', start: 300, end: 400 },
  { id: 'a', rowId: 'r1', start: 100, end: 200 },
  { id: 'c', rowId: 'r2', start: 290, end: 500 },
  { id: 'd', rowId: 'r2', start: 50, end: 60 },
  { id: 'e', rowId: 'r3', start: 120, end: 130 },
];

describe('groupBarsByRow', () => {
  it('groups by row and sorts by start', () => {
    const map = groupBarsByRow(bars);
    expect(map.get('r1')?.map((b) => b.id)).toEqual(['a', 'b']);
    expect(map.get('r2')?.map((b) => b.id)).toEqual(['d', 'c']);
    expect(map.has('empty')).toBe(false);
  });

  it('shallowEqualArrays compares items by identity', () => {
    const one = groupBarsByRow(bars).get('r1');
    const two = groupBarsByRow(bars).get('r1');
    expect(one).not.toBe(two);
    expect(shallowEqualArrays(one, two)).toBe(true);
    expect(shallowEqualArrays(one, [...two!].reverse())).toBe(false);
    expect(shallowEqualArrays(one, [{ ...one![0]! }, one![1]!])).toBe(false);
  });
});

describe('navigate', () => {
  const map = groupBarsByRow(bars);

  it('starts at the first bar', () => {
    expect(navigate(rows, map, null, 'right')?.id).toBe('a');
  });

  it('walks a row left and right, stopping at its ends', () => {
    expect(navigate(rows, map, 'a', 'right')?.id).toBe('b');
    expect(navigate(rows, map, 'b', 'right')?.id).toBe('b');
    expect(navigate(rows, map, 'b', 'left')?.id).toBe('a');
    expect(navigate(rows, map, 'b', 'home')?.id).toBe('a');
    expect(navigate(rows, map, 'a', 'end')?.id).toBe('b');
  });

  it('goes up and down to the bar closest in time, skipping empty rows', () => {
    expect(navigate(rows, map, 'b', 'down')?.id).toBe('c');
    expect(navigate(rows, map, 'c', 'down')?.id).toBe('e');
    expect(navigate(rows, map, 'e', 'up')?.id).toBe('d'); // 50 is closer to 120 than 290
    expect(navigate(rows, map, 'a', 'up')?.id).toBe('a');
  });

  it('page down falls back to the last row with bars', () => {
    expect(navigate(rows, map, 'a', 'pageDown')?.id).toBe('e');
  });
});

describe('moveRow', () => {
  const list = [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }];

  it('moves an item before or after a target', () => {
    expect(moveRow(list, '1', '3', 'after').map((r) => r.id)).toEqual(['2', '3', '1', '4']);
    expect(moveRow(list, '4', '2', 'before').map((r) => r.id)).toEqual(['1', '4', '2', '3']);
    expect(moveRow(list, '2', '2', 'before').map((r) => r.id)).toEqual(['1', '2', '3', '4']);
    expect(moveRow(list, 'x', '2', 'before').map((r) => r.id)).toEqual(['1', '2', '3', '4']);
  });
});

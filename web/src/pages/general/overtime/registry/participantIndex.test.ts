import { nextRowIndex } from './participantIndex';

// Ported from general/overtime/registry/participantIndex.test.mjs.

/** Resolve each live row through a Map keyed by row index (duplicates read the same slot). */
function lookupByRowIndex<T>(rowIndices: number[], byIndex: Map<number, T>) {
  return rowIndices.map((index) => byIndex.get(index));
}

describe('nextRowIndex', () => {
  it('empty container starts at 0', () => {
    expect(nextRowIndex([])).toBe(0);
  });

  it('sequential adds increment', () => {
    expect(nextRowIndex([0])).toBe(1);
    expect(nextRowIndex([0, 1])).toBe(2);
    expect(nextRowIndex([0, 1, 2])).toBe(3);
  });

  it('deleting the last row then adding reuses the hole at the end', () => {
    const live = [0, 1, 2].filter((i) => i !== 2);
    expect(live).toEqual([0, 1]);
    expect(nextRowIndex(live)).toBe(2);
    expect(live.includes(nextRowIndex(live))).toBe(false);
  });

  it('deleting a middle row then adding does not reuse the surviving index', () => {
    const live = [0, 1, 2].filter((i) => i !== 1);
    expect(live).toEqual([0, 2]);
    // The row count would be 2 and collide with the still-live third row.
    expect(live.length).toBe(2);
    const allocated = nextRowIndex(live);
    expect(allocated).toBe(3);
    expect(live.includes(allocated)).toBe(false);
  });

  it('deleting the first row then adding does not reuse a surviving index', () => {
    const live = [0, 1, 2].filter((i) => i !== 0);
    expect(live).toEqual([1, 2]);
    const allocated = nextRowIndex(live);
    expect(allocated).toBe(3);
    expect(live.includes(allocated)).toBe(false);
  });

  it('accepts string indices (legacy data-index attributes)', () => {
    expect(nextRowIndex(['0', '4', 'x'])).toBe(5);
  });

  it('reusing a live index overwrites the surviving person on submit', () => {
    const byIndex = new Map([
      [0, 'Alice'],
      [1, 'Bob'],
      [2, 'Carol'],
    ]);
    byIndex.delete(1);
    // Old allocator: row count === 2, which is still Carol.
    byIndex.set(2, 'Dave');
    expect(lookupByRowIndex([0, 2, 2], byIndex)).toEqual(['Alice', 'Dave', 'Dave']);
  });

  it('unique index after a middle delete keeps the surviving person', () => {
    const byIndex = new Map([
      [0, 'Alice'],
      [1, 'Bob'],
      [2, 'Carol'],
    ]);
    byIndex.delete(1);
    const live = [0, 2];
    const allocated = nextRowIndex(live);
    byIndex.set(allocated, 'Dave');
    expect(lookupByRowIndex([...live, allocated], byIndex)).toEqual(['Alice', 'Carol', 'Dave']);
  });
});

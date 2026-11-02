/**
 * Allocate a key for a new overtime participant row (port of
 * general/overtime/registry/participantIndex.js).
 *
 * Using the row count as the key reuses a still-present key after a non-last
 * row is removed, so the new row would take over the surviving row's fields
 * and submit would send the new person twice while dropping the original.
 */
export function nextRowIndex(usedIndices: Iterable<unknown>): number {
  let max = -1;
  for (const raw of usedIndices) {
    const n = Number(raw);
    if (Number.isInteger(n) && n > max) max = n;
  }
  return max + 1;
}

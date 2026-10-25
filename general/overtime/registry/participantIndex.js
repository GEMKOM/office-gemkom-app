/**
 * Allocate a data-index for a live overtime participant row.
 *
 * `container.children.length` reuses a still-present index after a non-last
 * row is removed. Dropdown Maps and element ids are keyed by that index, so
 * the next add overwrites the surviving row's dropdown and submit duplicates
 * the new person while dropping the original.
 *
 *     node general/overtime/registry/participantIndex.test.mjs
 */

export function nextRowIndex(usedIndices) {
    let max = -1;
    for (const raw of usedIndices) {
        const n = Number(raw);
        if (Number.isInteger(n) && n > max) max = n;
    }
    return max + 1;
}

/**
 * Resolve each live row through a Map keyed by data-index.
 * Duplicate indices all read the same (last-written) slot.
 */
export function lookupByRowIndex(rowIndices, byIndex) {
    return rowIndices.map((index) => byIndex.get(index));
}

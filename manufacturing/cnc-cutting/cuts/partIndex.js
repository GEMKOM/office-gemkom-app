/**
 * Allocate a data-index for a live CNC create-cut part row.
 *
 * `container.children.length` reuses a still-present index after a non-last
 * row is removed. `removePart` also used to shift Map keys while leaving DOM
 * `data-index` alone, so submit looked up a hole and dropped the survivor's
 * job_no — or, after adding another part, wrote the new job onto both rows.
 *
 *     node manufacturing/cnc-cutting/cuts/partIndex.test.mjs
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

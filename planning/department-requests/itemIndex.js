/**
 * Planning-request item rows are keyed by data-index.
 *
 * Save looks up jobOrderDropdowns.get(row.dataset.index). addPlanningItem used
 * to allocate data-index = container.children.length, so deleting a non-last
 * row and adding another reused a live index: the new dropdown overwrote the
 * survivor's Map entry (and duplicated job-no-dropdown-N), and Kaydet wrote
 * the new job onto both lines.
 *
 * File attach_to is a positional index into the items array (DOM order) and
 * is already compacted on delete; those numbers are independent of data-index.
 */

/** Next unused data-index. Never reuses a live index, even when the DOM has gaps. */
export function nextItemIndex(existingIndices) {
    let max = -1;
    for (const raw of existingIndices) {
        const n = Number(raw);
        if (Number.isFinite(n) && n > max) max = n;
    }
    return max + 1;
}

/** Drop the deleted item and decrement later numeric targets so attach_to stays positional. */
export function shiftAttachTargets(attachTo, removed) {
    if (!Array.isArray(attachTo)) return [];
    const removedIndex = Number(removed);
    return attachTo
        .filter(t => !(typeof t === 'number' && t === removedIndex))
        .map(t => (typeof t === 'number' && t > removedIndex) ? t - 1 : t);
}

export function jobNoForRow(dropdowns, rowIndex) {
    const dropdown = dropdowns?.get(rowIndex);
    if (!dropdown || typeof dropdown.getValue !== 'function') return '';
    return dropdown.getValue() || '';
}

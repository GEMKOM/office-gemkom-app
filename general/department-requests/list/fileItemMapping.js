/**
 * File-to-item mapping for a new department request.
 *
 * `attachTo` holds `'request'` and/or 0-based item indices that match DOM
 * order (data-index after compacting). Deleting a row must drop that index
 * and decrement later ones — once. `updateItemIndices` used to also remap
 * old data-index → new data-index, so a later item's file jumped to the
 * previous remaining row (delete first) or vanished (delete middle).
 */

/** Drop the deleted item and decrement later numeric targets so attachTo stays positional. */
export function shiftAttachTargets(attachTo, removed) {
    if (!Array.isArray(attachTo)) return [];
    const removedIndex = Number(removed);
    return attachTo
        .filter((t) => !(typeof t === 'number' && t === removedIndex))
        .map((t) => (typeof t === 'number' && t > removedIndex ? t - 1 : t));
}

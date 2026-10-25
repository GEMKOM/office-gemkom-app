/**
 * Item-row maps on the purchase-request create page are keyed by array index.
 * After splicing a middle row, every later key must shift down or the surviving
 * materials keep the deleted row's offers / recommended supplier.
 */

export function reindexKeyedByItemIndex(map, deletedIndex) {
    if (!map || typeof map !== 'object') return {};
    const next = {};
    Object.keys(map).forEach((key) => {
        const numKey = parseInt(key, 10);
        if (Number.isNaN(numKey) || numKey === deletedIndex) return;
        const dest = numKey > deletedIndex ? numKey - 1 : numKey;
        next[dest] = map[key];
    });
    return next;
}

export function reindexOffersByItemIndex(offers, deletedIndex) {
    if (!offers || typeof offers !== 'object') return {};
    const next = {};
    Object.keys(offers).forEach((supplierId) => {
        next[supplierId] = reindexKeyedByItemIndex(offers[supplierId], deletedIndex);
    });
    return next;
}

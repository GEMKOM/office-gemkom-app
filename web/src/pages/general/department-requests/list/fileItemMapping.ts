/**
 * File-to-item mapping for a new department request (was fileItemMapping.js).
 *
 * `attachTo` holds `'request'` and/or 0-based item row indices. Deleting a row
 * must drop that index and decrement later ones, once; remapping as well
 * shifted a later item's file twice (to the previous row, or dropped it).
 */
export type AttachTarget = 'request' | number;

/** Drop the deleted item and decrement later numeric targets so attachTo stays positional. */
export function shiftAttachTargets(
  attachTo: readonly AttachTarget[] | null | undefined,
  removed: number,
): AttachTarget[] {
  if (!Array.isArray(attachTo)) return [];
  return attachTo
    .filter((t) => !(typeof t === 'number' && t === removed))
    .map((t) => (typeof t === 'number' && t > removed ? t - 1 : t));
}

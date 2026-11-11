// The docked Neo panel's element. Modals list it as a scroll "shard" (see
// theme.ts): a modal's scroll lock would otherwise swallow wheel and touch
// scrolling in the panel when Neo is opened from a record's modal.
//
// Kept apart from NeoPanel so the theme can import it without pulling in Neo.
export const neoPanelRef: { current: HTMLElement | null } = { current: null };

/**
 * CSS variable with the room the open panel takes on the right (desktop).
 * Modals stop short of it (ui/Modal.module.css), so Neo is never under a
 * modal's overlay.
 */
export const NEO_OFFSET_VAR = '--neo-offset';

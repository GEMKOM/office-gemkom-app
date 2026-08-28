/**
 * Schedule keys to send for a dirty department row on bulk-save.
 *
 * Duration is İmalat sizing; dates are scheduling. They must not travel as a
 * trio just because one was touched — otherwise a child-date reflow would
 * persist a span-computed duration over the entered İmalat number, and a
 * duration-only edit would freeze derived dates as entered.
 *
 * An absent key means "unchanged" to the server.
 */
export function deptSchedulePatch(slot, fields, vm) {
    const item = {};
    const dateDirty = fields.has('start_date') || fields.has('end_date');
    const durationDirty = fields.has('duration_wd');
    if (dateDirty) {
        item.start_date = vm.start_date ?? null;
        item.end_date = vm.end_date ?? null;
    }
    if (slot === 'manufacturing' && durationDirty) {
        item.duration_wd = vm.entered_duration_wd != null
            ? vm.entered_duration_wd
            : vm.duration_wd;
    }
    return item;
}

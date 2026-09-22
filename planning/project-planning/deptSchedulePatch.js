/**
 * Schedule keys to send for a dirty department row on bulk-save.
 *
 * ONLY İmalat carries schedule inputs — its start (the single date entry)
 * and its duration (the single sizing entry); everything else derives and
 * never travels. No end_date: İmalat's end is the engine's projection,
 * its Hedef lives on project tracking.
 *
 * Duration and start must not travel as a pair just because one was
 * touched — otherwise a child-date reflow would persist a span-computed
 * duration over the entered İmalat number, and a duration-only edit
 * would freeze the derived start as entered.
 *
 * An absent key means "unchanged" to the server.
 */
export function deptSchedulePatch(slot, fields, vm) {
    const item = {};
    if (slot !== 'manufacturing') return item;
    if (fields.has('start_date') || fields.has('end_date')) {
        item.start_date = vm.start_date ?? null;
    }
    if (fields.has('duration_wd')) {
        item.duration_wd = vm.entered_duration_wd != null
            ? vm.entered_duration_wd
            : vm.duration_wd;
    }
    return item;
}

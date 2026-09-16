/**
 * The subtask_schedule a saved, dirty block sends on bulk-save — null when
 * it has nothing to send.
 *
 * A block WITHOUT stages is its own schedule row, so status and progress
 * travel exactly as they always have. No duration_wd and no dates: the block
 * sizes from its weight-share slice of the İmalat entry, and the server
 * materializes its projected dates at save time.
 *
 * A block WITH stages is their rollup — status and progress are the stages'
 * to move, and the server refuses them on the header. The one key it does
 * take there is actual_start_date.
 *
 * That key is the assignment's own START (284-07: two subcontractors, two
 * start dates; one visible column since 2026-09-16). It rides both shapes,
 * but only when it changed against the last-save snapshot: an absent key
 * means "unchanged" to the server, an explicit null clears the date and
 * hands the block back to the weight split.
 */
export function blockSchedulePatch(snapSubtask, subtask, hasStages) {
    const item = hasStages
        ? {}
        : { status: subtask.status, progress: subtask.progress };
    const was = (snapSubtask && snapSubtask.actual_start_date) || null;
    const now = subtask.actual_start_date || null;
    if (was !== now) item.actual_start_date = now;
    return Object.keys(item).length ? item : null;
}

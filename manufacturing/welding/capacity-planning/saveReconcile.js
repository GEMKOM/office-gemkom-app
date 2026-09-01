/**
 * Helpers for reconciling the welding planning working copy after bulk-save.
 *
 * The sheet stays editable while save + board rebuild run (seconds). The
 * save must not wipe dirty flags of those in-flight edits, and must not
 * POST the same new assignment again once the server has created it.
 */

export function assignmentKey(type, id) {
    return `${type}:${id}`;
}

export function knownAssignmentKeys(resources) {
    const keys = new Set();
    (resources || []).forEach((res) => (res.blocks || []).forEach((b) => {
        if (b && !b.isNew && b.assignment_id != null) {
            keys.add(assignmentKey(b.assignment_type, b.assignment_id));
        }
    }));
    return keys;
}

export function createdBlocksFromBoard(board, knownKeys) {
    const created = [];
    ((board && board.resources) || []).forEach((res) => {
        (res.blocks || []).forEach((b) => {
            if (b.assignment_id == null) return;
            const key = assignmentKey(b.assignment_type, b.assignment_id);
            if (!knownKeys.has(key)) {
                created.push({
                    resource_type: res.resource_type,
                    resource_id: res.id,
                    block: b,
                });
            }
        });
    });
    return created;
}

export function matchCreatedBlock(client, created, usedKeys) {
    if (!client) return -1;
    return created.findIndex((c) => {
        const key = assignmentKey(c.block.assignment_type, c.block.assignment_id);
        if (usedKeys.has(key)) return false;
        return c.resource_type === client.resource_type
            && Number(c.resource_id) === Number(client.resource_id)
            && Number(c.block.welding_task_id) === Number(client.welding_task_id)
            && Number(c.block.allocated_weight_kg) === Number(client.allocated_weight_kg);
    });
}

export function adoptStageIds(clientStages, serverStages) {
    const server = (serverStages || []).filter((s) => s && s.id != null && !s.deleted);
    const taken = new Set();
    (clientStages || []).forEach((cs) => {
        if (!cs || cs.deleted || cs.id != null) return;
        const idx = server.findIndex((ss, i) => !taken.has(i) && ss.title === cs.title);
        if (idx < 0) return;
        taken.add(idx);
        cs.id = server[idx].id;
        cs.cid = `s${cs.id}`;
    });
}

export function leftoverDeleted(currentDeleted, sentDeleted) {
    const sent = new Set(
        (sentDeleted || []).map((d) => assignmentKey(d.assignment_type, d.assignment_id)),
    );
    return (currentDeleted || []).filter(
        (d) => !sent.has(assignmentKey(d.assignment_type, d.assignment_id)),
    );
}

export function shouldPostNewBlock(block) {
    return !!(block && block.isNew && !block.deleted && !block.createdOnServer);
}

export function shouldHydrateAfterSave(clockAtSend, clockNow) {
    return clockAtSend === clockNow;
}

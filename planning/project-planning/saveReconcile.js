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

function sameHome(client, created, usedKeys) {
    const key = assignmentKey(created.block.assignment_type, created.block.assignment_id);
    if (usedKeys.has(key)) return false;
    return created.resource_type === client.resource_type
        && Number(created.resource_id) === Number(client.resource_id)
        && Number(created.block.welding_task_id) === Number(client.welding_task_id);
}

export function matchCreatedBlock(client, created, usedKeys) {
    if (!client) return -1;
    const exact = created.findIndex((c) => sameHome(client, c, usedKeys)
        && Number(c.block.allocated_weight_kg) === Number(client.allocated_weight_kg));
    if (exact >= 0) return exact;
    // Kg typed during save no longer matches the row the server just created.
    // Adopt the leftover only when it is unique for this resource/task —
    // two leftovers could be swapped and writes would hit the wrong row.
    const fallback = [];
    created.forEach((c, i) => { if (sameHome(client, c, usedKeys)) fallback.push(i); });
    return fallback.length === 1 ? fallback[0] : -1;
}

/**
 * Last-persisted kg/notes/own schedule for a newly adopted block. Must be
 * the SERVER values: the client may have been edited while save+rebuild
 * ran, and buildPayload only sends kg/notes (and blockSchedulePatch the
 * assignment's own start/span) when they differ from this snap.
 */
export function adoptedBlockSnap(serverBlock) {
    const subtask = (serverBlock && serverBlock.subtask) || {};
    return {
        allocated_weight_kg: Number(serverBlock && serverBlock.allocated_weight_kg),
        notes: (serverBlock && serverBlock.notes) || '',
        subtask: {
            actual_start_date: subtask.actual_start_date || null,
            entered_duration_wd: subtask.entered_duration_wd ?? null,
        },
    };
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

/**
 * After a save whose hydrate is skipped (planner kept typing), existing
 * assignments that just created stages still have id: null. The next Kaydet
 * would POST those stages again. Stitch server ids by assignment identity
 * and title, same matching as new-block adopt.
 */
export function adoptExistingBlockStageIds(clientResources, board) {
    const serverByKey = new Map();
    ((board && board.resources) || []).forEach((res) => {
        (res.blocks || []).forEach((b) => {
            if (!b || b.assignment_id == null) return;
            serverByKey.set(assignmentKey(b.assignment_type, b.assignment_id), b);
        });
    });
    (clientResources || []).forEach((res) => {
        (res.blocks || []).forEach((client) => {
            if (!client || client.isNew || client.deleted || client.assignment_id == null) return;
            const needsId = (client.stages || []).some((s) => s && !s.deleted && s.id == null);
            if (!needsId) return;
            const server = serverByKey.get(
                assignmentKey(client.assignment_type, client.assignment_id),
            );
            if (!server) return;
            adoptStageIds(client.stages, server.stages);
        });
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

export function sentMoveToByAssignment(payloadBlocks) {
    const map = new Map();
    (payloadBlocks || []).forEach((item) => {
        if (!item || !item.move_to || item.assignment_id == null) return;
        map.set(assignmentKey(item.assignment_type, item.assignment_id), item.move_to);
    });
    return map;
}

function sameMoveTo(a, b) {
    if (!a || !b) return false;
    return a.resource_type === b.resource_type
        && Number(a.resource_id) === Number(b.resource_id)
        && Number(a.price_tier || 0) === Number(b.price_tier || 0);
}

/**
 * Drop moveTo only when THIS payload actually sent that same destination.
 * A move typed after buildPayload (notes-save then Atamayı değiştir, or a
 * second move while the first is in flight) must survive finalize so the
 * next Kaydet can re-home the assignment.
 */
export function shouldClearMoveTo(sentMoveTo, currentMoveTo) {
    if (!sentMoveTo) return false;
    if (!currentMoveTo) return true;
    return sameMoveTo(sentMoveTo, currentMoveTo);
}

export function shouldPostNewBlock(block) {
    return !!(block && block.isNew && !block.deleted && !block.createdOnServer);
}

export function shouldHydrateAfterSave(clockAtSend, clockNow) {
    return clockAtSend === clockNow;
}

/**
 * A block is already on the server, or is in the in-flight create payload.
 * Deleting it locally (as if it were never POSTed) would orphan the row.
 */
export function isBlockOnServerOrInflight(block, inflightNewKeys) {
    if (!block) return false;
    if (block.assignment_id != null) return true;
    if (block.createdOnServer) return true;
    return !!(inflightNewKeys && inflightNewKeys.has(block.key));
}

export function shouldDiscardNewBlockLocally(block, inflightNewKeys) {
    return !!(block && block.isNew && !isBlockOnServerOrInflight(block, inflightNewKeys));
}

export function enqueueDeletedAssignment(deletedList, block, resourceKey) {
    const list = Array.isArray(deletedList) ? deletedList.slice() : [];
    if (!block || block.assignment_id == null) return list;
    const key = assignmentKey(block.assignment_type, block.assignment_id);
    if (list.some((d) => assignmentKey(d.assignment_type, d.assignment_id) === key)) {
        return list;
    }
    const entry = {
        assignment_type: block.assignment_type,
        assignment_id: block.assignment_id,
    };
    if (resourceKey != null) entry.resourceKey = resourceKey;
    list.push(entry);
    return list;
}

function matchingCreatedIndexes(client, created, usedKeys) {
    const indexes = [];
    if (!client) return indexes;
    (created || []).forEach((c, i) => {
        const key = assignmentKey(c.block.assignment_type, c.block.assignment_id);
        if (usedKeys.has(key)) return;
        if (c.resource_type === client.resource_type
            && Number(c.resource_id) === Number(client.resource_id)
            && Number(c.block.welding_task_id) === Number(client.welding_task_id)
            && Number(c.block.allocated_weight_kg) === Number(client.allocated_weight_kg)) {
            indexes.push(i);
        }
    });
    return indexes;
}

/**
 * Copy server identities onto client creates that were deleted while save
 * was in flight, so the next payload can send deleted_blocks. Only a unique
 * leftover (same resource + task + kg) is adopted — two siblings are not guessed.
 */
export function adoptDeletedCreateIdentities(deletedClients, created, usedKeys) {
    const used = usedKeys || new Set();
    (deletedClients || []).forEach((client) => {
        if (!client || client.assignment_id != null) return;
        const matches = matchingCreatedIndexes(client, created, used);
        if (matches.length !== 1) return;
        const matched = created[matches[0]];
        used.add(assignmentKey(matched.block.assignment_type, matched.block.assignment_id));
        client.assignment_type = matched.block.assignment_type;
        client.assignment_id = matched.block.assignment_id;
        if (matched.block.subtask_id != null) client.subtask_id = matched.block.subtask_id;
        client.createdOnServer = true;
    });
    return used;
}

/** Stage cids this payload will POST (id-less, not already deleted). */
export function newStageCidsFromBlock(block) {
    return (block && block.stages || [])
        .filter((s) => s && !s.deleted && s.id == null && s.cid)
        .map((s) => s.cid);
}

/**
 * A stage is already on the server, or is in the in-flight create payload.
 * Splicing it locally (as if it were never POSTed) would orphan the row.
 */
export function shouldDiscardNewStageLocally(stage, inflightNewStageCids) {
    if (!stage || stage.id != null || stage.createdOnServer) return false;
    return !(inflightNewStageCids && inflightNewStageCids.has(stage.cid));
}

export function findBoardBlock(board, assignmentType, assignmentId) {
    if (assignmentId == null) return null;
    const key = assignmentKey(assignmentType, assignmentId);
    for (const res of ((board && board.resources) || [])) {
        for (const b of (res.blocks || [])) {
            if (b && assignmentKey(b.assignment_type, b.assignment_id) === key) {
                return b;
            }
        }
    }
    return null;
}

/**
 * Copy server ids onto client stages that were deleted while their create
 * was in flight, so the next payload can send `{id, deleted: true}`.
 * Live (non-deleted) stages keep first claim on a title match — recreating
 * Montaj during the same save must not steal the id for a delete+recreate.
 */
export function adoptDeletedStageIds(clientStages, serverStages) {
    const usedIds = new Set(
        (clientStages || []).filter((s) => s && s.id != null).map((s) => s.id),
    );
    const server = (serverStages || []).filter(
        (s) => s && s.id != null && !s.deleted && !usedIds.has(s.id),
    );
    const taken = new Set();
    (clientStages || []).forEach((cs) => {
        if (!cs || !cs.deleted || cs.id != null) return;
        const idx = server.findIndex((ss, i) => !taken.has(i) && ss.title === cs.title);
        if (idx < 0) return;
        taken.add(idx);
        cs.id = server[idx].id;
        cs.cid = `s${cs.id}`;
        cs.createdOnServer = false;
    });
}

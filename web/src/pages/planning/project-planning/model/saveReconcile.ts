/**
 * Helpers for reconciling the planning working copy after bulk-save.
 *
 * The sheet stays editable while save + board rebuild run (seconds). The save
 * must not wipe dirty flags of those in-flight edits, and must not POST the
 * same new assignment again once the server has created it.
 */

// Every field is optional: each helper reads only what it needs, so the page's
// view models and the board's raw blocks both fit.
interface ServerStage {
  id?: number | null;
  title?: string;
  deleted?: boolean;
}

interface ServerBlock {
  assignment_type?: string;
  assignment_id?: number | null;
  subtask_id?: number | null;
  welding_task_id?: number | string;
  allocated_weight_kg?: number | string;
  notes?: string | null;
  subtask?: {
    actual_start_date?: string | null;
    entered_duration_wd?: number | null;
    [key: string]: unknown;
  };
  stages?: ServerStage[];
}

interface ServerBoard {
  resources?: { resource_type?: string; id?: number; blocks?: ServerBlock[] }[];
}

export interface ClientStage {
  cid?: string;
  id?: number | null;
  title?: string;
  deleted?: boolean;
  createdOnServer?: boolean;
}

export interface ClientBlock {
  key?: string;
  isNew?: boolean;
  deleted?: boolean;
  assignment_type?: string;
  assignment_id?: number | null;
  subtask_id?: number | null;
  resource_type?: string;
  resource_id?: number;
  welding_task_id?: number;
  allocated_weight_kg?: number;
  createdOnServer?: boolean;
  stages?: ClientStage[];
}

export interface CreatedBlock<B extends ServerBlock = ServerBlock> {
  resource_type?: string;
  resource_id?: number;
  block: B;
}

export interface MoveToLike {
  resource_type?: string;
  resource_id?: number | string;
  price_tier?: number | string | null;
}

export interface DeletedAssignment {
  assignment_type: string;
  assignment_id: number;
  resourceKey?: string;
}

export function assignmentKey(
  type: string | undefined,
  id: number | string | null | undefined,
): string {
  return `${type}:${id}`;
}

export function knownAssignmentKeys(
  resources: readonly { blocks?: readonly ClientBlock[] }[] | null | undefined,
) {
  const keys = new Set<string>();
  (resources || []).forEach((res) =>
    (res.blocks || []).forEach((b) => {
      if (b && !b.isNew && b.assignment_id != null)
        keys.add(assignmentKey(b.assignment_type, b.assignment_id));
    }),
  );
  return keys;
}

export function createdBlocksFromBoard<B extends ServerBlock>(
  board: { resources?: { resource_type?: string; id?: number; blocks?: B[] }[] } | null | undefined,
  knownKeys: ReadonlySet<string>,
): CreatedBlock<B>[] {
  const created: CreatedBlock<B>[] = [];
  (board?.resources || []).forEach((res) => {
    (res.blocks || []).forEach((b) => {
      if (b.assignment_id == null) return;
      if (!knownKeys.has(assignmentKey(b.assignment_type, b.assignment_id))) {
        created.push({ resource_type: res.resource_type, resource_id: res.id, block: b });
      }
    });
  });
  return created;
}

function sameHome(
  client: ClientBlock,
  created: CreatedBlock,
  usedKeys: ReadonlySet<string>,
): boolean {
  const key = assignmentKey(created.block.assignment_type, created.block.assignment_id);
  if (usedKeys.has(key)) return false;
  return (
    created.resource_type === client.resource_type &&
    Number(created.resource_id) === Number(client.resource_id) &&
    Number(created.block.welding_task_id) === Number(client.welding_task_id)
  );
}

export function matchCreatedBlock(
  client: ClientBlock | null | undefined,
  created: readonly CreatedBlock[],
  usedKeys: ReadonlySet<string>,
): number {
  if (!client) return -1;
  const exact = created.findIndex(
    (c) =>
      sameHome(client, c, usedKeys) &&
      Number(c.block.allocated_weight_kg) === Number(client.allocated_weight_kg),
  );
  if (exact >= 0) return exact;
  // Kg typed during save no longer matches the row the server just created.
  // Adopt the leftover only when it is unique for this resource/task: two
  // leftovers could be swapped and writes would hit the wrong row.
  const fallback: number[] = [];
  created.forEach((c, i) => {
    if (sameHome(client, c, usedKeys)) fallback.push(i);
  });
  return fallback.length === 1 ? (fallback[0] ?? -1) : -1;
}

export interface BlockSnap {
  allocated_weight_kg: number;
  notes: string;
  subtask: { actual_start_date: string | null; entered_duration_wd: number | null };
}

/**
 * Last-persisted kg/notes/own schedule for a newly adopted block. Must be the
 * SERVER values: the client may have been edited while save+rebuild ran, and
 * buildPayload only sends kg/notes (and blockSchedulePatch the assignment's own
 * start/span) when they differ from this snap.
 */
export function adoptedBlockSnap(serverBlock: ServerBlock | null | undefined): BlockSnap {
  const subtask = serverBlock?.subtask || {};
  return {
    allocated_weight_kg: Number(serverBlock?.allocated_weight_kg),
    notes: serverBlock?.notes || '',
    subtask: {
      actual_start_date: subtask.actual_start_date || null,
      entered_duration_wd: subtask.entered_duration_wd ?? null,
    },
  };
}

export function adoptStageIds(
  clientStages: ClientStage[] | null | undefined,
  serverStages: readonly ServerStage[] | null | undefined,
): void {
  const server = (serverStages || []).filter((s) => s && s.id != null && !s.deleted);
  const taken = new Set<number>();
  (clientStages || []).forEach((cs) => {
    if (!cs || cs.deleted || cs.id != null) return;
    const idx = server.findIndex((ss, i) => !taken.has(i) && ss.title === cs.title);
    if (idx < 0) return;
    taken.add(idx);
    cs.id = server[idx]?.id ?? null;
    cs.cid = `s${cs.id}`;
  });
}

/**
 * After a save whose hydrate is skipped (planner kept typing), existing
 * assignments that just created stages still have id: null. The next Kaydet
 * would POST those stages again. Stitch server ids by assignment identity and
 * title, same matching as new-block adopt.
 */
export function adoptExistingBlockStageIds(
  clientResources: readonly { blocks?: readonly ClientBlock[] }[] | null | undefined,
  board: ServerBoard | null | undefined,
): void {
  const serverByKey = new Map<string, ServerBlock>();
  (board?.resources || []).forEach((res) => {
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
      const server = serverByKey.get(assignmentKey(client.assignment_type, client.assignment_id));
      if (!server) return;
      adoptStageIds(client.stages, server.stages);
    });
  });
}

export function leftoverDeleted<
  T extends { assignment_type?: string; assignment_id?: number | null },
>(
  currentDeleted: readonly T[] | null | undefined,
  sentDeleted:
    readonly { assignment_type?: string; assignment_id?: number | null }[] | null | undefined,
): T[] {
  const sent = new Set(
    (sentDeleted || []).map((d) => assignmentKey(d.assignment_type, d.assignment_id)),
  );
  return (currentDeleted || []).filter(
    (d) => !sent.has(assignmentKey(d.assignment_type, d.assignment_id)),
  );
}

export function sentMoveToByAssignment(
  payloadBlocks:
    | readonly { assignment_type?: string; assignment_id?: number | null; move_to?: MoveToLike }[]
    | null
    | undefined,
): Map<string, MoveToLike> {
  const map = new Map<string, MoveToLike>();
  (payloadBlocks || []).forEach((item) => {
    if (!item || !item.move_to || item.assignment_id == null) return;
    map.set(assignmentKey(item.assignment_type, item.assignment_id), item.move_to);
  });
  return map;
}

function sameMoveTo(a: MoveToLike | null | undefined, b: MoveToLike | null | undefined): boolean {
  if (!a || !b) return false;
  return (
    a.resource_type === b.resource_type &&
    Number(a.resource_id) === Number(b.resource_id) &&
    Number(a.price_tier || 0) === Number(b.price_tier || 0)
  );
}

/**
 * Drop moveTo only when THIS payload actually sent that same destination. A
 * move typed after buildPayload (notes-save then Atamayı değiştir, or a second
 * move while the first is in flight) must survive finalize so the next Kaydet
 * can re-home the assignment.
 */
export function shouldClearMoveTo(
  sentMoveTo: MoveToLike | null | undefined,
  currentMoveTo: MoveToLike | null | undefined,
): boolean {
  if (!sentMoveTo) return false;
  if (!currentMoveTo) return true;
  return sameMoveTo(sentMoveTo, currentMoveTo);
}

export function shouldPostNewBlock(
  block: { isNew?: boolean; deleted?: boolean; createdOnServer?: boolean } | null | undefined,
): boolean {
  return !!(block && block.isNew && !block.deleted && !block.createdOnServer);
}

export function shouldHydrateAfterSave(clockAtSend: number, clockNow: number): boolean {
  return clockAtSend === clockNow;
}

type BlockIdentity = {
  key?: string;
  isNew?: boolean;
  assignment_id?: number | null;
  createdOnServer?: boolean;
};

/**
 * A block is already on the server, or is in the in-flight create payload.
 * Deleting it locally (as if it were never POSTed) would orphan the row.
 */
export function isBlockOnServerOrInflight(
  block: BlockIdentity | null | undefined,
  inflightNewKeys: ReadonlySet<string> | null | undefined,
): boolean {
  if (!block) return false;
  if (block.assignment_id != null) return true;
  if (block.createdOnServer) return true;
  return !!(block.key && inflightNewKeys?.has(block.key));
}

export function shouldDiscardNewBlockLocally(
  block: BlockIdentity | null | undefined,
  inflightNewKeys: ReadonlySet<string> | null | undefined,
): boolean {
  return !!(block && block.isNew && !isBlockOnServerOrInflight(block, inflightNewKeys));
}

export function enqueueDeletedAssignment(
  deletedList: readonly DeletedAssignment[] | null | undefined,
  block: { assignment_type?: string; assignment_id?: number | null } | null | undefined,
  resourceKey?: string | null,
): DeletedAssignment[] {
  const list = Array.isArray(deletedList) ? deletedList.slice() : [];
  if (!block || block.assignment_id == null || block.assignment_type == null) return list;
  const key = assignmentKey(block.assignment_type, block.assignment_id);
  if (list.some((d) => assignmentKey(d.assignment_type, d.assignment_id) === key)) return list;
  const entry: DeletedAssignment = {
    assignment_type: block.assignment_type,
    assignment_id: block.assignment_id,
  };
  if (resourceKey != null) entry.resourceKey = resourceKey;
  list.push(entry);
  return list;
}

function matchingCreatedIndexes(
  client: ClientBlock | null | undefined,
  created: readonly CreatedBlock[] | null | undefined,
  usedKeys: ReadonlySet<string>,
): number[] {
  const indexes: number[] = [];
  if (!client) return indexes;
  (created || []).forEach((c, i) => {
    const key = assignmentKey(c.block.assignment_type, c.block.assignment_id);
    if (usedKeys.has(key)) return;
    if (
      c.resource_type === client.resource_type &&
      Number(c.resource_id) === Number(client.resource_id) &&
      Number(c.block.welding_task_id) === Number(client.welding_task_id) &&
      Number(c.block.allocated_weight_kg) === Number(client.allocated_weight_kg)
    ) {
      indexes.push(i);
    }
  });
  return indexes;
}

/**
 * Copy server identities onto client creates that were deleted while save was
 * in flight, so the next payload can send deleted_blocks. Only a unique
 * leftover (same resource + task + kg) is adopted: two siblings are not guessed.
 */
export function adoptDeletedCreateIdentities(
  deletedClients: readonly ClientBlock[] | null | undefined,
  created: readonly CreatedBlock[],
  usedKeys?: Set<string>,
): Set<string> {
  const used = usedKeys || new Set<string>();
  (deletedClients || []).forEach((client) => {
    if (!client || client.assignment_id != null) return;
    const matches = matchingCreatedIndexes(client, created, used);
    if (matches.length !== 1) return;
    const matched = created[matches[0] ?? -1];
    if (!matched) return;
    used.add(assignmentKey(matched.block.assignment_type, matched.block.assignment_id));
    client.assignment_type = matched.block.assignment_type;
    client.assignment_id = matched.block.assignment_id;
    if (matched.block.subtask_id != null) client.subtask_id = matched.block.subtask_id;
    client.createdOnServer = true;
  });
  return used;
}

/** Stage cids this payload will POST (id-less, not already deleted). */
export function newStageCidsFromBlock(
  block: { stages?: readonly ClientStage[] } | null | undefined,
): string[] {
  return (block?.stages || []).flatMap((s) =>
    s && !s.deleted && s.id == null && s.cid ? [s.cid] : [],
  );
}

/**
 * A stage is already on the server, or is in the in-flight create payload.
 * Splicing it locally (as if it were never POSTed) would orphan the row.
 */
export function shouldDiscardNewStageLocally(
  stage: ClientStage | null | undefined,
  inflightNewStageCids: ReadonlySet<string> | null | undefined,
): boolean {
  if (!stage || stage.id != null || stage.createdOnServer) return false;
  return !(stage.cid && inflightNewStageCids?.has(stage.cid));
}

export function findBoardBlock<B extends ServerBlock>(
  board: { resources?: { blocks?: B[] }[] } | null | undefined,
  assignmentType: string | undefined,
  assignmentId: number | null | undefined,
): B | null {
  if (assignmentId == null) return null;
  const key = assignmentKey(assignmentType, assignmentId);
  for (const res of board?.resources || []) {
    for (const b of res.blocks || []) {
      if (b && assignmentKey(b.assignment_type, b.assignment_id) === key) return b;
    }
  }
  return null;
}

/**
 * Copy server ids onto client stages that were deleted while their create was
 * in flight, so the next payload can send `{id, deleted: true}`. Live
 * (non-deleted) stages keep first claim on a title match: recreating Montaj
 * during the same save must not steal the id for a delete+recreate.
 */
export function adoptDeletedStageIds(
  clientStages: ClientStage[] | null | undefined,
  serverStages: readonly ServerStage[] | null | undefined,
): void {
  const usedIds = new Set((clientStages || []).filter((s) => s && s.id != null).map((s) => s.id));
  const server = (serverStages || []).filter(
    (s) => s && s.id != null && !s.deleted && !usedIds.has(s.id),
  );
  const taken = new Set<number>();
  (clientStages || []).forEach((cs) => {
    if (!cs || !cs.deleted || cs.id != null) return;
    const idx = server.findIndex((ss, i) => !taken.has(i) && ss.title === cs.title);
    if (idx < 0) return;
    taken.add(idx);
    cs.id = server[idx]?.id ?? null;
    cs.cid = `s${cs.id}`;
    cs.createdOnServer = false;
  });
}

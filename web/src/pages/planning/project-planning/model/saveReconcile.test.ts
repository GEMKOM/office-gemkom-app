/**
 * Tests for post-save working-copy reconciliation.
 */

import { assert } from '@/test/legacyAssert';
import {
  assignmentKey,
  knownAssignmentKeys,
  createdBlocksFromBoard,
  matchCreatedBlock,
  adoptedBlockSnap,
  adoptStageIds,
  leftoverDeleted,
  sentMoveToByAssignment,
  shouldClearMoveTo,
  shouldPostNewBlock,
  shouldHydrateAfterSave,
  adoptExistingBlockStageIds,
  isBlockOnServerOrInflight,
  shouldDiscardNewBlockLocally,
  enqueueDeletedAssignment,
  adoptDeletedCreateIdentities,
  newStageCidsFromBlock,
  shouldDiscardNewStageLocally,
  findBoardBlock,
  adoptDeletedStageIds,
  type ClientBlock,
} from './saveReconcile';

it('known keys skip isNew blocks (no assignment_id yet)', () => {
  const keys = knownAssignmentKeys([
    {
      blocks: [
        { isNew: true, assignment_type: 'internal_team', assignment_id: null },
        { isNew: false, assignment_type: 'internal_team', assignment_id: 9 },
      ],
    },
  ]);
  assert.deepEqual([...keys], ['internal_team:9']);
});

it('created blocks are server assignments not in the pre-save snapshot', () => {
  const known = new Set([assignmentKey('internal_team', 9)]);
  const created = createdBlocksFromBoard(
    {
      resources: [
        {
          resource_type: 'team',
          id: 3,
          blocks: [
            {
              assignment_type: 'internal_team',
              assignment_id: 9,
              welding_task_id: 1,
              allocated_weight_kg: 10,
            },
            {
              assignment_type: 'internal_team',
              assignment_id: 22,
              welding_task_id: 7,
              allocated_weight_kg: 40,
            },
          ],
        },
      ],
    },
    known,
  );
  assert.equal(created.length, 1);
  assert.equal(created[0]!.block.assignment_id, 22);
  assert.equal(created[0]!.resource_id, 3);
});

it('match prefers unused server block with same resource/task/weight', () => {
  const created = [
    {
      resource_type: 'team',
      resource_id: 3,
      block: {
        assignment_type: 'internal_team',
        assignment_id: 22,
        welding_task_id: 7,
        allocated_weight_kg: 40,
      },
    },
    {
      resource_type: 'team',
      resource_id: 3,
      block: {
        assignment_type: 'internal_team',
        assignment_id: 23,
        welding_task_id: 7,
        allocated_weight_kg: 40,
      },
    },
  ];
  const client = {
    resource_type: 'team',
    resource_id: 3,
    welding_task_id: 7,
    allocated_weight_kg: 40,
  };
  const used = new Set<string>();
  const first = matchCreatedBlock(client, created, used);
  assert.equal(first, 0);
  used.add(assignmentKey('internal_team', 22));
  const second = matchCreatedBlock(client, created, used);
  assert.equal(second, 1);
});

it('kg edited during save still matches the unique leftover server block', () => {
  const created = [
    {
      resource_type: 'team',
      resource_id: 3,
      block: {
        assignment_type: 'internal_team',
        assignment_id: 22,
        welding_task_id: 7,
        allocated_weight_kg: 40,
      },
    },
  ];
  const client = {
    resource_type: 'team',
    resource_id: 3,
    welding_task_id: 7,
    allocated_weight_kg: 55,
  };
  assert.equal(matchCreatedBlock(client, created, new Set<string>()), 0);
});

it('ambiguous leftovers with different kg are not guessed', () => {
  const created = [
    {
      resource_type: 'team',
      resource_id: 3,
      block: {
        assignment_type: 'internal_team',
        assignment_id: 22,
        welding_task_id: 7,
        allocated_weight_kg: 40,
      },
    },
    {
      resource_type: 'team',
      resource_id: 3,
      block: {
        assignment_type: 'internal_team',
        assignment_id: 23,
        welding_task_id: 7,
        allocated_weight_kg: 50,
      },
    },
  ];
  const client = {
    resource_type: 'team',
    resource_id: 3,
    welding_task_id: 7,
    allocated_weight_kg: 99,
  };
  assert.equal(matchCreatedBlock(client, created, new Set<string>()), -1);
});

it('adopted snap is the server row so in-flight client edits still look dirty', () => {
  const snap = adoptedBlockSnap({ allocated_weight_kg: 40, notes: '' });
  const client = { allocated_weight_kg: 40, notes: 'typed during save' };
  assert.equal(snap.notes, '');
  assert.equal((snap.notes || '') !== (client.notes || ''), true);
  assert.equal(Number(snap.allocated_weight_kg), 40);
});

it('adopted snap keeps the server own start/span so an in-flight pin still travels', () => {
  const snap = adoptedBlockSnap({
    allocated_weight_kg: 40,
    notes: '',
    subtask: { actual_start_date: null, entered_duration_wd: 5 },
  });
  assert.deepEqual(snap.subtask, { actual_start_date: null, entered_duration_wd: 5 });
  assert.deepEqual(adoptedBlockSnap({ allocated_weight_kg: 40 }).subtask, {
    actual_start_date: null,
    entered_duration_wd: null,
  });
});

it('after an exact kg match, the leftover unique sibling is still adoptable', () => {
  const created = [
    {
      resource_type: 'team',
      resource_id: 3,
      block: {
        assignment_type: 'internal_team',
        assignment_id: 22,
        welding_task_id: 7,
        allocated_weight_kg: 40,
      },
    },
    {
      resource_type: 'team',
      resource_id: 3,
      block: {
        assignment_type: 'internal_team',
        assignment_id: 23,
        welding_task_id: 7,
        allocated_weight_kg: 50,
      },
    },
  ];
  const used = new Set<string>();
  const first = matchCreatedBlock(
    {
      resource_type: 'team',
      resource_id: 3,
      welding_task_id: 7,
      allocated_weight_kg: 40,
    },
    created,
    used,
  );
  assert.equal(first, 0);
  used.add(assignmentKey('internal_team', 22));
  const second = matchCreatedBlock(
    {
      resource_type: 'team',
      resource_id: 3,
      welding_task_id: 7,
      allocated_weight_kg: 80,
    },
    created,
    used,
  );
  assert.equal(second, 1);
});

it('a createdOnServer new block is not posted again', () => {
  assert.equal(shouldPostNewBlock({ isNew: true, createdOnServer: true }), false);
  assert.equal(shouldPostNewBlock({ isNew: true, createdOnServer: false }), true);
  assert.equal(
    shouldPostNewBlock({ isNew: false, assignment_id: 1 } as Parameters<
      typeof shouldPostNewBlock
    >[0]),
    false,
  );
});

it('hydrate only when nothing mutated during save/rebuild', () => {
  assert.equal(shouldHydrateAfterSave(4, 4), true);
  assert.equal(shouldHydrateAfterSave(4, 5), false);
});

it('sent deletions drop from the queue; later deletions stay', () => {
  const leftover = leftoverDeleted(
    [
      { assignment_type: 'internal_team', assignment_id: 1 },
      { assignment_type: 'internal_team', assignment_id: 2 },
    ],
    [{ assignment_type: 'internal_team', assignment_id: 1 }],
  );
  assert.deepEqual(leftover, [{ assignment_type: 'internal_team', assignment_id: 2 }]);
});

it('unsaved new blocks are discarded locally; inflight or created ones are not', () => {
  const fresh = { key: 'new-1', isNew: true, assignment_id: null };
  assert.equal(shouldDiscardNewBlockLocally(fresh, new Set()), true);
  assert.equal(isBlockOnServerOrInflight(fresh, new Set()), false);
  assert.equal(shouldDiscardNewBlockLocally(fresh, new Set(['new-1'])), false);
  assert.equal(
    shouldDiscardNewBlockLocally(
      {
        key: 'new-2',
        isNew: true,
        assignment_id: null,
        createdOnServer: true,
      },
      new Set(),
    ),
    false,
  );
  assert.equal(
    shouldDiscardNewBlockLocally(
      {
        key: 'new-3',
        isNew: true,
        assignment_id: 22,
        createdOnServer: false,
      },
      new Set(),
    ),
    false,
  );
  assert.equal(
    shouldDiscardNewBlockLocally(
      {
        key: 'internal_team-9',
        isNew: false,
        assignment_id: 9,
      },
      new Set(),
    ),
    false,
  );
});

it('enqueueDeletedAssignment waits for an id and does not duplicate', () => {
  const empty = enqueueDeletedAssignment(
    [],
    { assignment_type: 'internal_team', assignment_id: null },
    'team-3',
  );
  assert.deepEqual(empty, []);
  const once = enqueueDeletedAssignment(
    [],
    {
      assignment_type: 'internal_team',
      assignment_id: 22,
    },
    'team-3',
  );
  assert.deepEqual(once, [
    {
      assignment_type: 'internal_team',
      assignment_id: 22,
      resourceKey: 'team-3',
    },
  ]);
  const twice = enqueueDeletedAssignment(
    once,
    {
      assignment_type: 'internal_team',
      assignment_id: 22,
    },
    'team-3',
  );
  assert.equal(twice.length, 1);
});

it('deleted in-flight creates adopt the unique leftover server id', () => {
  const client: ClientBlock = {
    resource_type: 'team',
    resource_id: 3,
    welding_task_id: 7,
    allocated_weight_kg: 40,
    assignment_id: null,
    deleted: true,
    isNew: true,
  };
  const created = [
    {
      resource_type: 'team',
      resource_id: 3,
      block: {
        assignment_type: 'internal_team',
        assignment_id: 22,
        subtask_id: 90,
        welding_task_id: 7,
        allocated_weight_kg: 40,
      },
    },
  ];
  adoptDeletedCreateIdentities([client], created, new Set());
  assert.equal(client.assignment_id, 22);
  assert.equal(client.subtask_id, 90);
  assert.equal(client.createdOnServer, true);
  const queued = enqueueDeletedAssignment([], client, 'team-3');
  assert.deepEqual(queued, [
    {
      assignment_type: 'internal_team',
      assignment_id: 22,
      resourceKey: 'team-3',
    },
  ]);
});

it('ambiguous leftovers are not guessed for a deleted create', () => {
  const client: ClientBlock = {
    resource_type: 'team',
    resource_id: 3,
    welding_task_id: 7,
    allocated_weight_kg: 40,
    assignment_id: null,
    deleted: true,
  };
  const created = [
    {
      resource_type: 'team',
      resource_id: 3,
      block: {
        assignment_type: 'internal_team',
        assignment_id: 22,
        welding_task_id: 7,
        allocated_weight_kg: 40,
      },
    },
    {
      resource_type: 'team',
      resource_id: 3,
      block: {
        assignment_type: 'internal_team',
        assignment_id: 23,
        welding_task_id: 7,
        allocated_weight_kg: 40,
      },
    },
  ];
  adoptDeletedCreateIdentities([client], created, new Set());
  assert.equal(client.assignment_id, null);
  assert.equal(client.createdOnServer, undefined);
});

it('adoptStageIds copies server ids onto matching untitled-id client stages', () => {
  const client = [
    { title: 'Montaj', id: null, cid: 'new-1' },
    { title: 'Kaynak ve Taşlama', id: null, cid: 'new-2' },
  ];
  adoptStageIds(client, [
    { id: 80, title: 'Montaj' },
    { id: 81, title: 'Kaynak ve Taşlama' },
  ]);
  assert.equal(client[0]!.id, 80);
  assert.equal(client[0]!.cid, 's80');
  assert.equal(client[1]!.id, 81);
});

it('existing assignment stages created during a skipped-hydrate save get server ids', () => {
  const clientResources = [
    {
      blocks: [
        {
          isNew: false,
          assignment_type: 'internal_team',
          assignment_id: 9,
          stages: [
            { title: 'Montaj', id: null, cid: 'new-1', deleted: false },
            { title: 'Kaynak ve Taşlama', id: null, cid: 'new-2', deleted: false },
          ],
        },
      ],
    },
  ];
  adoptExistingBlockStageIds(clientResources, {
    resources: [
      {
        blocks: [
          {
            assignment_type: 'internal_team',
            assignment_id: 9,
            stages: [
              { id: 80, title: 'Montaj' },
              { id: 81, title: 'Kaynak ve Taşlama' },
            ],
          },
        ],
      },
    ],
  });
  assert.equal(clientResources[0]!.blocks[0]!.stages[0]!.id, 80);
  assert.equal(clientResources[0]!.blocks[0]!.stages[0]!.cid, 's80');
  assert.equal(clientResources[0]!.blocks[0]!.stages[1]!.id, 81);
});

it('existing-block stage adopt leaves already-identified stages and new blocks alone', () => {
  const existing = {
    isNew: false,
    assignment_type: 'internal_team',
    assignment_id: 9,
    stages: [
      { title: 'Montaj', id: 80, cid: 's80', deleted: false },
      { title: 'Final', id: null, cid: 'new-3', deleted: false },
    ],
  };
  const created = {
    isNew: true,
    assignment_type: 'internal_team',
    assignment_id: null,
    stages: [{ title: 'Montaj', id: null, cid: 'new-1', deleted: false }],
  };
  const clientResources = [{ blocks: [existing, created] }];
  adoptExistingBlockStageIds(clientResources, {
    resources: [
      {
        blocks: [
          {
            assignment_type: 'internal_team',
            assignment_id: 9,
            stages: [
              { id: 80, title: 'Montaj' },
              { id: 91, title: 'Final' },
            ],
          },
          {
            assignment_type: 'internal_team',
            assignment_id: 22,
            stages: [{ id: 70, title: 'Montaj' }],
          },
        ],
      },
    ],
  });
  assert.equal(existing.stages[0]!.id, 80);
  assert.equal(existing.stages[1]!.id, 91);
  assert.equal(created.stages[0]!.id, null);
});

it('existing-block stage adopt is a no-op when the server row is missing', () => {
  const stages = [{ title: 'Montaj', id: null, cid: 'new-1', deleted: false }];
  adoptExistingBlockStageIds(
    [
      {
        blocks: [
          {
            isNew: false,
            assignment_type: 'internal_team',
            assignment_id: 9,
            stages,
          },
        ],
      },
    ],
    { resources: [] },
  );
  assert.equal(stages[0]!.id, null);
});

it('sentMoveToByAssignment indexes only items that carried move_to', () => {
  const map = sentMoveToByAssignment([
    { assignment_type: 'internal_team', assignment_id: 9 },
    {
      assignment_type: 'internal_team',
      assignment_id: 10,
      move_to: { resource_type: 'team', resource_id: 4 },
    },
    {
      assignment_type: 'subcontracting',
      assignment_id: null,
      move_to: { resource_type: 'subcontractor', resource_id: 2 },
    },
  ]);
  assert.equal(map.size, 1);
  assert.deepEqual(map.get('internal_team:10'), { resource_type: 'team', resource_id: 4 });
  assert.equal(map.has('internal_team:9'), false);
});

it('a move typed during a notes/kg save is not cleared', () => {
  const inFlight = { resource_type: 'team', resource_id: 8 };
  assert.equal(shouldClearMoveTo(undefined, inFlight), false);
  assert.equal(shouldClearMoveTo(null, inFlight), false);
});

it('the move this payload sent is cleared; a later destination is not', () => {
  const sent = { resource_type: 'team', resource_id: 4 };
  assert.equal(shouldClearMoveTo(sent, { resource_type: 'team', resource_id: 4 }), true);
  assert.equal(shouldClearMoveTo(sent, { resource_type: 'team', resource_id: 8 }), false);
  assert.equal(
    shouldClearMoveTo(sent, { resource_type: 'subcontractor', resource_id: 4, price_tier: 12 }),
    false,
  );
  assert.equal(shouldClearMoveTo(sent, undefined), true);
});

it('same destination with the sent price tier is treated as the sent move', () => {
  const sent = { resource_type: 'subcontractor', resource_id: 2, price_tier: 12 };
  assert.equal(
    shouldClearMoveTo(sent, { resource_type: 'subcontractor', resource_id: 2, price_tier: 12 }),
    true,
  );
  assert.equal(
    shouldClearMoveTo(sent, { resource_type: 'subcontractor', resource_id: 2, price_tier: 19 }),
    false,
  );
});

it('unsaved new stages are discarded locally; inflight or created ones are not', () => {
  const fresh = { cid: 'new-1', id: null };
  assert.equal(shouldDiscardNewStageLocally(fresh, new Set()), true);
  assert.equal(shouldDiscardNewStageLocally(fresh, new Set(['new-1'])), false);
  assert.equal(
    shouldDiscardNewStageLocally(
      {
        cid: 'new-2',
        id: null,
        createdOnServer: true,
      },
      new Set(),
    ),
    false,
  );
  assert.equal(
    shouldDiscardNewStageLocally(
      {
        cid: 's80',
        id: 80,
      },
      new Set(),
    ),
    false,
  );
});

it('newStageCidsFromBlock lists only live id-less stages', () => {
  const cids = newStageCidsFromBlock({
    stages: [
      { cid: 'new-1', id: null, deleted: false },
      { cid: 'new-2', id: null, deleted: true },
      { cid: 's80', id: 80, deleted: false },
    ],
  });
  assert.deepEqual(cids, ['new-1']);
});

it('deleted in-flight stages adopt leftover server ids by title', () => {
  const client = [
    { title: 'Montaj', id: null, cid: 'new-1', deleted: true },
    { title: 'Kaynak ve Taşlama', id: null, cid: 'new-2' },
  ];
  adoptDeletedStageIds(client, [
    { id: 80, title: 'Montaj' },
    { id: 81, title: 'Kaynak ve Taşlama' },
  ]);
  assert.equal(client[0]!.id, 80);
  assert.equal(client[0]!.cid, 's80');
  assert.equal(client[1]!.id, null);
});

it('adoptDeletedStageIds does not steal an id already on a live sibling', () => {
  const client = [
    { title: 'Montaj', id: 80, cid: 's80' },
    { title: 'Montaj', id: null, cid: 'new-9', deleted: true },
  ];
  adoptDeletedStageIds(client, [
    { id: 80, title: 'Montaj' },
    { id: 81, title: 'Kaynak ve Taşlama' },
  ]);
  assert.equal(client[1]!.id, null);
});

it('findBoardBlock locates an assignment on the saved board', () => {
  const board = {
    resources: [
      {
        blocks: [
          { assignment_type: 'internal_team', assignment_id: 9, stages: [] },
          {
            assignment_type: 'internal_team',
            assignment_id: 22,
            stages: [{ id: 80, title: 'Montaj' }],
          },
        ],
      },
    ],
  };
  const found = findBoardBlock(board, 'internal_team', 22);
  assert.equal(found!.assignment_id, 22);
  assert.equal(found!.stages![0]!.id, 80);
  assert.equal(findBoardBlock(board, 'internal_team', 99), null);
});

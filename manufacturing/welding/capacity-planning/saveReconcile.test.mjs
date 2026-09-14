/**
 * Tests for post-save working-copy reconciliation.
 *
 *     node manufacturing/welding/capacity-planning/saveReconcile.test.mjs
 */

import assert from 'node:assert/strict';
import {
    assignmentKey,
    knownAssignmentKeys,
    createdBlocksFromBoard,
    matchCreatedBlock,
    adoptStageIds,
    leftoverDeleted,
    shouldPostNewBlock,
    shouldHydrateAfterSave,
    isBlockOnServerOrInflight,
    shouldDiscardNewBlockLocally,
    enqueueDeletedAssignment,
    adoptDeletedCreateIdentities,
} from './saveReconcile.js';

let failures = 0;
function check(name, fn) {
    try {
        fn();
        console.log(`  ok   ${name}`);
    } catch (error) {
        failures += 1;
        console.log(`  FAIL ${name}\n       ${error.message.split('\n')[0]}`);
    }
}

console.log('saveReconcile');

check('known keys skip isNew blocks (no assignment_id yet)', () => {
    const keys = knownAssignmentKeys([{
        blocks: [
            { isNew: true, assignment_type: 'internal_team', assignment_id: null },
            { isNew: false, assignment_type: 'internal_team', assignment_id: 9 },
        ],
    }]);
    assert.deepEqual([...keys], ['internal_team:9']);
});

check('created blocks are server assignments not in the pre-save snapshot', () => {
    const known = new Set([assignmentKey('internal_team', 9)]);
    const created = createdBlocksFromBoard({
        resources: [{
            resource_type: 'team',
            id: 3,
            blocks: [
                { assignment_type: 'internal_team', assignment_id: 9, welding_task_id: 1, allocated_weight_kg: 10 },
                { assignment_type: 'internal_team', assignment_id: 22, welding_task_id: 7, allocated_weight_kg: 40 },
            ],
        }],
    }, known);
    assert.equal(created.length, 1);
    assert.equal(created[0].block.assignment_id, 22);
    assert.equal(created[0].resource_id, 3);
});

check('match prefers unused server block with same resource/task/weight', () => {
    const created = [
        { resource_type: 'team', resource_id: 3, block: { assignment_type: 'internal_team', assignment_id: 22, welding_task_id: 7, allocated_weight_kg: 40 } },
        { resource_type: 'team', resource_id: 3, block: { assignment_type: 'internal_team', assignment_id: 23, welding_task_id: 7, allocated_weight_kg: 40 } },
    ];
    const client = {
        resource_type: 'team',
        resource_id: 3,
        welding_task_id: 7,
        allocated_weight_kg: 40,
    };
    const used = new Set();
    const first = matchCreatedBlock(client, created, used);
    assert.equal(first, 0);
    used.add(assignmentKey('internal_team', 22));
    const second = matchCreatedBlock(client, created, used);
    assert.equal(second, 1);
});

check('a createdOnServer new block is not posted again', () => {
    assert.equal(shouldPostNewBlock({ isNew: true, createdOnServer: true }), false);
    assert.equal(shouldPostNewBlock({ isNew: true, createdOnServer: false }), true);
    assert.equal(shouldPostNewBlock({ isNew: false, assignment_id: 1 }), false);
});

check('hydrate only when nothing mutated during save/rebuild', () => {
    assert.equal(shouldHydrateAfterSave(4, 4), true);
    assert.equal(shouldHydrateAfterSave(4, 5), false);
});

check('sent deletions drop from the queue; later deletions stay', () => {
    const leftover = leftoverDeleted(
        [
            { assignment_type: 'internal_team', assignment_id: 1 },
            { assignment_type: 'internal_team', assignment_id: 2 },
        ],
        [{ assignment_type: 'internal_team', assignment_id: 1 }],
    );
    assert.deepEqual(leftover, [{ assignment_type: 'internal_team', assignment_id: 2 }]);
});

check('unsaved new blocks are discarded locally; inflight or created ones are not', () => {
    const fresh = { key: 'new-1', isNew: true, assignment_id: null };
    assert.equal(shouldDiscardNewBlockLocally(fresh, new Set()), true);
    assert.equal(isBlockOnServerOrInflight(fresh, new Set()), false);
    assert.equal(shouldDiscardNewBlockLocally(fresh, new Set(['new-1'])), false);
    assert.equal(shouldDiscardNewBlockLocally({
        key: 'new-2', isNew: true, assignment_id: null, createdOnServer: true,
    }, new Set()), false);
    assert.equal(shouldDiscardNewBlockLocally({
        key: 'new-3', isNew: true, assignment_id: 22, createdOnServer: false,
    }, new Set()), false);
    assert.equal(shouldDiscardNewBlockLocally({
        key: 'internal_team-9', isNew: false, assignment_id: 9,
    }, new Set()), false);
});

check('enqueueDeletedAssignment waits for an id and does not duplicate', () => {
    const empty = enqueueDeletedAssignment([], { assignment_type: 'internal_team', assignment_id: null }, 'team-3');
    assert.deepEqual(empty, []);
    const once = enqueueDeletedAssignment([], {
        assignment_type: 'internal_team', assignment_id: 22,
    }, 'team-3');
    assert.deepEqual(once, [{
        assignment_type: 'internal_team', assignment_id: 22, resourceKey: 'team-3',
    }]);
    const twice = enqueueDeletedAssignment(once, {
        assignment_type: 'internal_team', assignment_id: 22,
    }, 'team-3');
    assert.equal(twice.length, 1);
});

check('deleted in-flight creates adopt the unique leftover server id', () => {
    const client = {
        resource_type: 'team',
        resource_id: 3,
        welding_task_id: 7,
        allocated_weight_kg: 40,
        assignment_id: null,
        deleted: true,
        isNew: true,
    };
    const created = [{
        resource_type: 'team',
        resource_id: 3,
        block: {
            assignment_type: 'internal_team',
            assignment_id: 22,
            subtask_id: 90,
            welding_task_id: 7,
            allocated_weight_kg: 40,
        },
    }];
    adoptDeletedCreateIdentities([client], created, new Set());
    assert.equal(client.assignment_id, 22);
    assert.equal(client.subtask_id, 90);
    assert.equal(client.createdOnServer, true);
    const queued = enqueueDeletedAssignment([], client, 'team-3');
    assert.deepEqual(queued, [{
        assignment_type: 'internal_team', assignment_id: 22, resourceKey: 'team-3',
    }]);
});

check('ambiguous leftovers are not guessed for a deleted create', () => {
    const client = {
        resource_type: 'team',
        resource_id: 3,
        welding_task_id: 7,
        allocated_weight_kg: 40,
        assignment_id: null,
        deleted: true,
    };
    const created = [
        { resource_type: 'team', resource_id: 3, block: { assignment_type: 'internal_team', assignment_id: 22, welding_task_id: 7, allocated_weight_kg: 40 } },
        { resource_type: 'team', resource_id: 3, block: { assignment_type: 'internal_team', assignment_id: 23, welding_task_id: 7, allocated_weight_kg: 40 } },
    ];
    adoptDeletedCreateIdentities([client], created, new Set());
    assert.equal(client.assignment_id, null);
    assert.equal(client.createdOnServer, undefined);
});

check('adoptStageIds copies server ids onto matching untitled-id client stages', () => {
    const client = [
        { title: 'Montaj', id: null, cid: 'new-1' },
        { title: 'Kaynak ve Taşlama', id: null, cid: 'new-2' },
    ];
    adoptStageIds(client, [
        { id: 80, title: 'Montaj' },
        { id: 81, title: 'Kaynak ve Taşlama' },
    ]);
    assert.equal(client[0].id, 80);
    assert.equal(client[0].cid, 's80');
    assert.equal(client[1].id, 81);
});

if (failures) {
    console.error(`\n${failures} failed`);
    process.exit(1);
}
console.log('\nall passed');

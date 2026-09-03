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
    adoptedBlockSnap,
    adoptStageIds,
    leftoverDeleted,
    shouldPostNewBlock,
    shouldHydrateAfterSave,
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

check('kg edited during save still matches the unique leftover server block', () => {
    const created = [
        { resource_type: 'team', resource_id: 3, block: { assignment_type: 'internal_team', assignment_id: 22, welding_task_id: 7, allocated_weight_kg: 40 } },
    ];
    const client = {
        resource_type: 'team',
        resource_id: 3,
        welding_task_id: 7,
        allocated_weight_kg: 55,
    };
    assert.equal(matchCreatedBlock(client, created, new Set()), 0);
});

check('ambiguous leftovers with different kg are not guessed', () => {
    const created = [
        { resource_type: 'team', resource_id: 3, block: { assignment_type: 'internal_team', assignment_id: 22, welding_task_id: 7, allocated_weight_kg: 40 } },
        { resource_type: 'team', resource_id: 3, block: { assignment_type: 'internal_team', assignment_id: 23, welding_task_id: 7, allocated_weight_kg: 50 } },
    ];
    const client = {
        resource_type: 'team',
        resource_id: 3,
        welding_task_id: 7,
        allocated_weight_kg: 99,
    };
    assert.equal(matchCreatedBlock(client, created, new Set()), -1);
});

check('adopted snap is the server row so in-flight client edits still look dirty', () => {
    const snap = adoptedBlockSnap({ allocated_weight_kg: 40, notes: '' });
    const client = { allocated_weight_kg: 40, notes: 'typed during save' };
    assert.equal(snap.notes, '');
    assert.equal((snap.notes || '') !== (client.notes || ''), true);
    assert.equal(Number(snap.allocated_weight_kg), 40);
});

check('after an exact kg match, the leftover unique sibling is still adoptable', () => {
    const created = [
        { resource_type: 'team', resource_id: 3, block: { assignment_type: 'internal_team', assignment_id: 22, welding_task_id: 7, allocated_weight_kg: 40 } },
        { resource_type: 'team', resource_id: 3, block: { assignment_type: 'internal_team', assignment_id: 23, welding_task_id: 7, allocated_weight_kg: 50 } },
    ];
    const used = new Set();
    const first = matchCreatedBlock({
        resource_type: 'team', resource_id: 3, welding_task_id: 7, allocated_weight_kg: 40,
    }, created, used);
    assert.equal(first, 0);
    used.add(assignmentKey('internal_team', 22));
    const second = matchCreatedBlock({
        resource_type: 'team', resource_id: 3, welding_task_id: 7, allocated_weight_kg: 80,
    }, created, used);
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

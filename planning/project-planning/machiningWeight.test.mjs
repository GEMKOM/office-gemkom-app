/**
 * Tests for Talaşlı İmalat weight indexing and bulk-save items.
 *
 *     node planning/project-planning/machiningWeight.test.mjs
 */

import assert from 'node:assert/strict';
import { indexMachining, machiningWeightItems } from './machiningWeight.js';

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

const jobInfo = {
    '097-42': {
        machining: [
            { task_id: 11, weight: 40, status: 'in_progress' },
            { task_id: 22, weight: 15, status: 'pending' },
        ],
    },
};

console.log('indexMachining');
check('indexes every machining task and aliases the first onto the job', () => {
    const { machiningByJob, machiningByTask } = indexMachining(jobInfo);
    assert.equal(machiningByTask[11].weight, 40);
    assert.equal(machiningByTask[22].weight, 15);
    assert.equal(machiningByJob['097-42'], machiningByTask[11]);
    assert.notEqual(machiningByJob['097-42'], machiningByTask[22]);
});

console.log('machiningWeightItems');
check('a weight typed on the second Talaşlı row saves against that task_id', () => {
    const { machiningByTask } = indexMachining(jobInfo);
    machiningByTask[22].weight = 18;
    const dirty = new Map([[22, new Set(['weight'])]]);
    assert.deepEqual(machiningWeightItems(dirty, machiningByTask), [
        { task_id: 22, weight: 18 },
    ]);
});
check('a weight typed on the first Talaşlı row still saves against the first task', () => {
    const { machiningByJob, machiningByTask } = indexMachining(jobInfo);
    machiningByJob['097-42'].weight = 50;
    const dirty = new Map([[11, new Set(['weight'])]]);
    assert.deepEqual(machiningWeightItems(dirty, machiningByTask), [
        { task_id: 11, weight: 50 },
    ]);
});
check('omits a dirty row that has no weight yet', () => {
    const { machiningByTask } = indexMachining(jobInfo);
    machiningByTask[22].weight = null;
    const dirty = new Map([[22, new Set(['weight'])]]);
    assert.deepEqual(machiningWeightItems(dirty, machiningByTask), []);
});

if (failures) {
    console.log(`\n${failures} failed`);
    process.exit(1);
}
console.log('\nall ok');

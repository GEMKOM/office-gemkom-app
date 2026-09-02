/**
 * Default-stage seeding for İmalat Planlama.
 *
 *     node manufacturing/welding/capacity-planning/defaultStages.test.mjs
 */

import assert from 'node:assert/strict';
import { DEFAULT_STAGE_TITLES, defaultStagesFrom } from './defaultStages.js';

let n = 0;
const nextCid = () => `new-${++n}`;

{
    const stages = defaultStagesFrom({
        status: 'in_progress',
        progress: 40,
        duration_wd: 8,
        start_date: '2026-08-10',
        end_date: '2026-08-21',
    }, nextCid);
    assert.deepEqual(stages.map(s => s.title), DEFAULT_STAGE_TITLES);
    assert.equal(stages.length, 2);
    for (const s of stages) {
        assert.equal(s.id, null);
        assert.equal(s.is_default, true);
        assert.equal(s.start_date, '2026-08-10');
        assert.equal(s.end_date, '2026-08-21');
        assert.equal(s.duration_wd, 8);
        assert.equal(s.progress, 40);
        assert.equal(s.status, 'in_progress');
    }
}

{
    n = 0;
    const stages = defaultStagesFrom({
        status: 'pending', progress: 0,
        duration_wd: null, start_date: null, end_date: null,
    }, nextCid);
    assert.equal(stages[0].start_date, null);
    assert.equal(stages[0].end_date, null);
    assert.equal(stages[0].duration_wd, null);
    assert.equal(stages[0].status, 'pending');
    assert.equal(stages[0].progress, 0);
}

console.log('defaultStages.test.mjs: ok');

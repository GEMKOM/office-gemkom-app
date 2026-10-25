import { createExclusiveRun } from './exclusiveRun.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('createExclusiveRun', () => {
    it('runs the first call and returns its result', async () => {
        const run = createExclusiveRun();
        const outcome = await run(async () => 42);
        assert.deepEqual(outcome, { started: true, result: 42 });
    });

    it('ignores a second call while the first is still in flight', async () => {
        const run = createExclusiveRun();
        let starts = 0;
        let resolveFirst;
        const first = run(async () => {
            starts += 1;
            await new Promise((resolve) => { resolveFirst = resolve; });
            return 'done';
        });
        const second = await run(async () => {
            starts += 1;
            return 'should not run';
        });
        assert.deepEqual(second, { started: false });
        assert.equal(starts, 1);
        resolveFirst();
        assert.deepEqual(await first, { started: true, result: 'done' });
    });

    it('allows another call after the first finishes', async () => {
        const run = createExclusiveRun();
        await run(async () => 'a');
        const outcome = await run(async () => 'b');
        assert.deepEqual(outcome, { started: true, result: 'b' });
    });

    it('releases the lock when the first call throws', async () => {
        const run = createExclusiveRun();
        await assert.rejects(() => run(async () => { throw new Error('boom'); }), /boom/);
        const outcome = await run(async () => 'recovered');
        assert.deepEqual(outcome, { started: true, result: 'recovered' });
    });
});

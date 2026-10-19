/**
 * Tests for the Tahmin report status poller.
 *
 *     node components/estimate-report/statusPoller.test.mjs
 */

import assert from 'node:assert/strict';
import { createStatusPoller } from './statusPoller.js';

let failures = 0;
function check(name, fn) {
    try {
        const result = fn();
        if (result && typeof result.then === 'function') {
            return result.then(() => {
                console.log(`  ok   ${name}`);
            }).catch((error) => {
                failures += 1;
                console.log(`  FAIL ${name}\n       ${error.message.split('\n')[0]}`);
            });
        }
        console.log(`  ok   ${name}`);
        return Promise.resolve();
    } catch (error) {
        failures += 1;
        console.log(`  FAIL ${name}\n       ${error.message.split('\n')[0]}`);
        return Promise.resolve();
    }
}

function createFakeTimers() {
    let nextId = 1;
    const timers = new Map();
    return {
        schedule(fn) {
            const id = nextId++;
            timers.set(id, fn);
            return id;
        },
        cancel(id) {
            timers.delete(id);
        },
        get pending() {
            return timers.size;
        },
        async runNext() {
            const first = timers.entries().next().value;
            if (!first) return false;
            const [id, fn] = first;
            timers.delete(id);
            await fn();
            return true;
        },
    };
}

async function run() {
    console.log('single-flight');
    await check('start while active does not arm a second timer or reset count', async () => {
        const timers = createFakeTimers();
        const poller = createStatusPoller({
            intervalMs: 5,
            maxTicks: 180,
            schedule: timers.schedule,
            cancel: timers.cancel,
        });
        let loads = 0;
        const load = async () => {
            loads += 1;
            // estimate-report load() re-enters start() when the report is still open
            poller.start(load);
        };
        poller.start(load);
        assert.equal(timers.pending, 1);
        poller.start(load);
        assert.equal(timers.pending, 1);
        assert.equal(poller.count, 0);

        await timers.runNext();
        assert.equal(loads, 1);
        assert.equal(poller.count, 1);
        assert.equal(timers.pending, 1);

        await timers.runNext();
        assert.equal(loads, 2);
        assert.equal(poller.count, 2);
        assert.equal(timers.pending, 1);
        poller.destroy();
    });

    await check('the old startPolling+tick pair would fan out; this one stays at one timer', async () => {
        const timers = createFakeTimers();
        const poller = createStatusPoller({
            intervalMs: 5,
            maxTicks: 180,
            schedule: timers.schedule,
            cancel: timers.cancel,
        });
        const load = async () => { poller.start(load); };
        poller.start(load);
        for (let i = 0; i < 8; i += 1) {
            assert.equal(timers.pending, 1, `pending timers after tick ${i}`);
            await timers.runNext();
        }
        assert.equal(poller.count, 8);
        assert.equal(timers.pending, 1);
        poller.destroy();
    });

    console.log('\nstop and cap');
    await check('stop during a tick prevents the next arm', async () => {
        const timers = createFakeTimers();
        const poller = createStatusPoller({
            intervalMs: 5,
            maxTicks: 180,
            schedule: timers.schedule,
            cancel: timers.cancel,
        });
        const load = async () => { poller.stop(); };
        poller.start(load);
        await timers.runNext();
        assert.equal(poller.active, false);
        assert.equal(timers.pending, 0);
        poller.destroy();
    });

    await check('start after stop resets the counter', async () => {
        const timers = createFakeTimers();
        const poller = createStatusPoller({
            intervalMs: 5,
            maxTicks: 180,
            schedule: timers.schedule,
            cancel: timers.cancel,
        });
        poller.start(async () => {});
        await timers.runNext();
        assert.equal(poller.count, 1);
        poller.stop();
        poller.start(async () => {});
        assert.equal(poller.count, 0);
        await timers.runNext();
        assert.equal(poller.count, 1);
        poller.destroy();
    });

    await check('maxTicks stops the loop', async () => {
        const timers = createFakeTimers();
        const poller = createStatusPoller({
            intervalMs: 5,
            maxTicks: 3,
            schedule: timers.schedule,
            cancel: timers.cancel,
        });
        let loads = 0;
        const load = async () => { loads += 1; };
        poller.start(load);
        assert.equal(await timers.runNext(), true);
        assert.equal(await timers.runNext(), true);
        assert.equal(await timers.runNext(), true);
        assert.equal(loads, 3);
        assert.equal(poller.active, false);
        assert.equal(timers.pending, 0);
        poller.destroy();
    });

    await check('destroy drops a pending tick', async () => {
        const timers = createFakeTimers();
        const poller = createStatusPoller({
            intervalMs: 5,
            maxTicks: 180,
            schedule: timers.schedule,
            cancel: timers.cancel,
        });
        let loads = 0;
        poller.start(async () => { loads += 1; });
        poller.destroy();
        assert.equal(timers.pending, 0);
        assert.equal(loads, 0);
        poller.start(async () => { loads += 1; });
        assert.equal(timers.pending, 0);
    });

    if (failures) {
        console.log(`\n${failures} failed`);
        process.exit(1);
    }
    console.log('\nall passed');
}

run();

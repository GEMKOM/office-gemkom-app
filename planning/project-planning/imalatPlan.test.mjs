import assert from 'node:assert/strict';
import test from 'node:test';

import { imalatPlanStart, imalatStageFractions, shippingAnchor } from './imalatPlan.js';

// A stand-in calendar that is exact on whole weekdays is not needed: these
// tests only check which date is chosen, so spanStart just records its call.
const spanStart = (end, days) => `start(${end},${days})`;

test('the entered start wins over everything', () => {
    assert.deepEqual(
        imalatPlanStart({ enteredStart: '2026-08-30', enteredEnd: '2026-11-23',
            duration: 60, pins: ['2026-08-20'], spanStart }),
        { start: '2026-08-30', source: 'entered' });
});

test('an entered end is counted back over the duration', () => {
    assert.deepEqual(
        imalatPlanStart({ enteredStart: null, enteredEnd: '2026-11-23',
            duration: 60, pins: ['2026-08-20'], spanStart }),
        { start: 'start(2026-11-23,60)', source: 'entered_end' });
});

test('097-42: no İmalat date, so the earliest pinned team sets it', () => {
    assert.deepEqual(
        imalatPlanStart({ enteredStart: null, enteredEnd: null, duration: 60,
            pins: [null, '2026-09-01', '2026-08-20'], spanStart }),
        { start: '2026-08-20', source: 'team_start' });
});

test('nothing to lay it out from is no plan, not a guess', () => {
    assert.deepEqual(
        imalatPlanStart({ enteredStart: null, enteredEnd: null, duration: 60,
            pins: [], spanStart }),
        { start: null, source: null });
    // A pin without a duration sizes nothing either.
    assert.deepEqual(
        imalatPlanStart({ enteredStart: null, enteredEnd: null, duration: null,
            pins: ['2026-08-20'], spanStart }),
        { start: null, source: null });
});

test('welding spans the first stage, machining keeps its own share inside it', () => {
    // 097-42: Kaynaklı 85, Talaşlı 10, Boya 5 of a 60-day İmalat.
    const f = imalatStageFractions([
        { key: 'weld', weight: 85, paint: false },
        { key: 'mach', weight: 10, paint: false, own: true },
        { key: 'paint', weight: 5, paint: true },
    ]);
    assert.equal(60 * f.weld, 57);
    // Not the whole stage: a 5 % Talaşlı once read as 66 days of machining.
    assert.equal(60 * f.mach, 6);
    assert.equal(60 * f.paint, 3);
    // The stages fill İmalat exactly: nothing left empty at its end.
    assert.equal(60 * (f.weld + f.paint), 60);
});

test('with no paint, welding spans the whole of İmalat', () => {
    const f = imalatStageFractions([
        { key: 'weld', weight: 49, paint: false },
        { key: 'mach', weight: 49, paint: false, own: true },
    ]);
    // 293-05-01 was planned 9.8 days of welding in a 20-day İmalat.
    assert.equal(20 * f.weld, 20);
});

test('weights are whole numbers, and none at all counts as 1 each', () => {
    const f = imalatStageFractions([
        { key: 'weld', weight: 0, paint: false },
        { key: 'paint', weight: null, paint: true },
    ]);
    assert.equal(f.weld, 0.5);
    assert.equal(f.paint, 0.5);
    const g = imalatStageFractions([
        { key: 'weld', weight: 2.9, paint: false },
        { key: 'paint', weight: 1.2, paint: true },
    ]);
    assert.equal(g.weld, 2 / 3);
});

test('skipped rows are the caller\'s to leave out', () => {
    assert.deepEqual(imalatStageFractions([null, null]), {});
});

test('shipping waits for İmalat even when linked only to procurement', () => {
    // 293-05-01: procurement ends 21.08, İmalat 12.10.
    assert.equal(shippingAnchor({ imalatLive: true, imalatEnd: '2026-10-12',
        after: '2026-08-21', afterInvented: false }), '2026-10-12');
});

test('...and for a later task it is linked to', () => {
    // RM045-17: procurement entered to run to 09.11, İmalat ends 09.10.
    assert.equal(shippingAnchor({ imalatLive: true, imalatEnd: '2026-10-09',
        after: '2026-11-09', afterInvented: false }), '2026-11-09');
});

test('a later plan nobody entered leaves shipping without one', () => {
    assert.equal(shippingAnchor({ imalatLive: true, imalatEnd: '2026-10-09',
        after: '2026-11-09', afterInvented: true }), null);
    // ...but a tie goes to İmalat, whose date is real.
    assert.equal(shippingAnchor({ imalatLive: true, imalatEnd: '2026-10-09',
        after: '2026-10-09', afterInvented: true }), '2026-10-09');
});

test('an unplanned İmalat means no shipping plan', () => {
    assert.equal(shippingAnchor({ imalatLive: true, imalatEnd: null,
        after: '2026-08-21', afterInvented: false }), null);
});

test('a skipped İmalat ships nothing, so shipping waits only for the rest', () => {
    assert.equal(shippingAnchor({ imalatLive: false, imalatEnd: '2026-04-08',
        after: '2026-08-21', afterInvented: false }), '2026-08-21');
    assert.equal(shippingAnchor({ imalatLive: false, imalatEnd: '2026-04-08',
        after: null, afterInvented: false }), null);
});

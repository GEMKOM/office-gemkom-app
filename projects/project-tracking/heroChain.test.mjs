/**
 * Tests for the hero date chain (pure string building over the plan-sheet
 * numbers).
 *
 *     node projects/project-tracking/heroChain.test.mjs
 */

import assert from 'node:assert/strict';
// A zone west of UTC: a date-only string parsed as UTC would print a day early.
process.env.TZ = 'America/Sao_Paulo';
import { formatDateLong, heroChainHtml, signedWd } from './heroChain.js';

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

const count = (html, needle) => html.split(needle).length - 1;
const BEHIND = {
    start: '2026-03-12', termin: '2026-09-30', planEnd: '2026-10-16', projectedEnd: '2026-11-04',
    planVsTerminWd: 12, deviationWd: 13, terminGapWd: 25,
};

check('signed working days', () => {
    assert.deepEqual(signedWd(12), { text: '+12 iş günü', cls: 'ps-fig-late', kind: 'late' });
    assert.deepEqual(signedWd(-2.5), { text: '−2,5 iş günü', cls: 'ps-fig-early', kind: 'early' });
    assert.deepEqual(signedWd('0'), { text: 'tam gününde', cls: 'ps-fig-ok', kind: 'ok' });
    assert.deepEqual(signedWd(0.04), { text: 'tam gününde', cls: 'ps-fig-ok', kind: 'ok' });
    assert.deepEqual(signedWd(-0.04), { text: 'tam gününde', cls: 'ps-fig-ok', kind: 'ok' });
    assert.equal(signedWd(0.06).text, '+0,1 iş günü');
    assert.equal(signedWd(12.96).text, '+13 iş günü');
    assert.equal(signedWd(null), null);
    assert.equal(signedWd(undefined), null);
    assert.equal(signedWd('abc'), null);
});

check('date-only values are calendar days in every time zone', () => {
    assert.equal(formatDateLong('2026-09-30'), '30 Eylül 2026');
    assert.equal(formatDateLong('2026-01-01'), '1 Ocak 2026');
    assert.equal(formatDateLong(null), '—');
    assert.equal(formatDateLong('not a date'), '—');
    // Instants keep their instant semantics (created_at carries a time)
    assert.match(formatDateLong('2026-09-30T15:00:00Z'), /30 Eylül 2026/);
});

check('behind the plan and past the termin: every number once, on its connector', () => {
    const html = heroChainHtml(BEHIND);
    assert.match(html, /ps-ck-2 is-late"><span>\+12 iş günü</);
    assert.match(html, /ps-ck-3 is-late"><span>\+13 iş günü</);
    assert.match(html, /ps-chain-brk is-late"><span>Termine göre <b>\+25 iş günü<\/b>/);
    assert.equal(count(html, '+12 iş günü'), 1);
    assert.equal(count(html, '+13 iş günü'), 1);
    assert.equal(count(html, '+25 iş günü'), 1);
    assert.match(html, /ps-cf-plan is-late/);
    assert.match(html, /ps-cf-proj is-late/);
    assert.match(html, /ps-cf-start"[\s\S]*?12 Mart 2026/);
    assert.match(html, /4 Kasım 2026/);
    assert.doesNotMatch(html, /!/);
});

check('column order is fixed regardless of the dates', () => {
    const early = heroChainHtml({ ...BEHIND, planEnd: '2026-09-18', planVsTerminWd: -8 });
    const order = ['ps-cf-start', 'ps-ck-1', 'ps-cf-termin', 'ps-ck-2', 'ps-cf-plan', 'ps-ck-3', 'ps-cf-proj']
        .map(c => early.indexOf(c));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.ok(order.every(i => i >= 0));
});

check('plan before the termin: green minus on the termin→plan connector', () => {
    const html = heroChainHtml({ ...BEHIND, planEnd: '2026-09-18', planVsTerminWd: -8, projectedEnd: '2026-10-09', deviationWd: 15, terminGapWd: 7 });
    assert.match(html, /ps-ck-2 is-early"><span>−8 iş günü</);
    assert.match(html, /ps-cf-plan is-early/);
    assert.match(html, /ps-ck-3 is-late"><span>\+15 iş günü</);
    assert.match(html, /ps-chain-brk is-late"><span>Termine göre <b>\+7 iş günü/);
});

check('forecast ahead of the plan but past the termin: green connector, red bracket', () => {
    const html = heroChainHtml({ ...BEHIND, projectedEnd: '2026-10-09', deviationWd: -5, terminGapWd: 7 });
    assert.match(html, /ps-ck-3 is-early"><span>−5 iş günü</);
    assert.match(html, /ps-cf-proj is-early/);
    assert.match(html, /ps-chain-brk is-late"/);
});

check('everything on time: all green, zero reads "tam gününde"', () => {
    const html = heroChainHtml({ ...BEHIND, planVsTerminWd: -8, deviationWd: 0, terminGapWd: -8 });
    assert.match(html, /ps-ck-2 is-early/);
    assert.match(html, /ps-ck-3 is-ok"><span>tam gününde</);
    assert.match(html, /ps-cf-proj is-ok/);
    assert.match(html, /ps-chain-brk is-early"><span>Termine göre <b>−8 iş günü/);
});

check('no termin: column stays with a dash, its connector and the bracket go quiet', () => {
    const html = heroChainHtml({ ...BEHIND, termin: null, planVsTerminWd: null, terminGapWd: null });
    assert.match(html, /ps-cf-termin">\s*<label>Termin<\/label>\s*<span class="ps-cf-value">—</);
    assert.match(html, /ps-ck-2 is-none"><\/div>/);
    assert.doesNotMatch(html, /ps-chain-brk/);
    assert.match(html, /ps-ck-3 is-late"><span>\+13 iş günü</);
});

check('no plan: plan and öngörülen show dashes, only the termin figure remains', () => {
    const html = heroChainHtml({ start: '2026-03-12', termin: '2026-09-30' });
    assert.equal(count(html, '>—<'), 2);
    assert.match(html, /ps-ck-2 is-none/);
    assert.match(html, /ps-ck-3 is-none/);
    assert.doesNotMatch(html, /ps-chain-brk/);
    assert.doesNotMatch(html, / is-late| is-early| is-ok/);
});

check('pending sheet: ellipses, no pills, no bracket', () => {
    const html = heroChainHtml({ start: '2026-03-12', termin: '2026-09-30', pending: true });
    assert.equal(count(html, 'ps-fig-muted'), 2);
    assert.doesNotMatch(html, /—/);
    assert.doesNotMatch(html, /ps-chain-brk/);
    assert.equal(count(html, 'is-none'), 3);
});

check('start→termin connector never carries a number', () => {
    const html = heroChainHtml(BEHIND);
    assert.match(html, /ps-ck-1 is-none"><\/div>/);
});

if (failures) {
    console.log(`\n${failures} failing`);
    process.exit(1);
}
console.log('\nall good');

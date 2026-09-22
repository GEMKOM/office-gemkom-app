/**
 * Tests for the plan sheet copy (pure functions over the /plan-sheet/ payload).
 *
 *     node projects/project-tracking/planSheetText.test.mjs
 */

import assert from 'node:assert/strict';
import {
    barState, causeSentence, deviationChip, fmtDateTr, fmtWd, groupRows,
    headerSummary, isDefaultDuration, planSourceLabel, progressText, signedFigure,
} from './planSheetText.js';

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

check('formatting', () => {
    assert.equal(fmtDateTr('2026-10-15'), '15.10.2026');
    assert.equal(fmtDateTr(null), '—');
    assert.equal(fmtWd(12), '12 iş günü');
    assert.equal(fmtWd(-2.5), '2,5 iş günü');
});

check('deviation chips', () => {
    assert.deepEqual(deviationChip({ deviation_wd: 8, own_deviation_wd: 8, chain_deviation_wd: 0 }),
        { text: '+8', cls: 'ps-chip-late', kind: 'own' });
    assert.deepEqual(deviationChip({ deviation_wd: 8, own_deviation_wd: 0, chain_deviation_wd: 8 }),
        { text: '+8 zincir', cls: 'ps-chip-chain', kind: 'chain' });
    assert.deepEqual(deviationChip({ deviation_wd: 11, own_deviation_wd: 3, chain_deviation_wd: 8 }),
        { text: '+11 (3 kendi)', cls: 'ps-chip-late', kind: 'own' });
    assert.deepEqual(deviationChip({ deviation_wd: -2, own_deviation_wd: -2, chain_deviation_wd: 0 }),
        { text: '−2', cls: 'ps-chip-early', kind: 'early' });
    assert.deepEqual(deviationChip({ deviation_wd: 0, own_deviation_wd: 0, chain_deviation_wd: 0 }),
        { text: '0', cls: 'ps-chip-ok', kind: 'ontime' });
    assert.equal(deviationChip({ deviation_wd: null }).text, 'plan yok');
    assert.equal(deviationChip({ dead: true }).text, '');
});

check('bar state and plan source', () => {
    assert.equal(barState({ done: true }), 'done');
    assert.equal(barState({ deviation_wd: 3 }), 'late');
    assert.equal(barState({ deviation_wd: 0 }), 'on-time');
    assert.equal(barState({ deviation_wd: 0 }, { status: 'on_hold' }), 'hold');
    assert.equal(planSourceLabel({ plan_source: 'chain', duration_source: 'default' }),
        'önceki görevin bitişinden · varsayılan süre');
    assert.equal(planSourceLabel({ plan_source: 'imalat_split', duration_source: 'share' }),
        'İmalat planından (ağırlık payı)');
    assert.ok(isDefaultDuration({ duration_source: 'default' }));
    assert.ok(!isDefaultDuration({ duration_source: 'entered' }));
});

check('cause sentences', () => {
    assert.equal(causeSentence({ cause: { code: 'material', what: 'boru/profil', pending: 3, unordered: 1, until: '2026-10-02', overdue: false } }),
        'boru/profil bekleniyor: 3 kalem (1 sipariş verilmemiş), tahmini teslim 02.10.2026.');
    assert.equal(causeSentence({ cause: { code: 'material', what: 'plaka', pending: 2, unordered: 0, until: '2026-09-10', overdue: true } }),
        'plaka bekleniyor: 2 kalem, tahmini teslim 10.09.2026, söz verilen tarih geçti.');
    assert.equal(causeSentence({ cause: { code: 'ncr_open', count: 2 } }), '2 açık NCR tamamlamayı engelliyor.');
    assert.equal(causeSentence({ cause: { code: 'cnc_plan', plan_end: '2026-09-24', unplanned_cuts: 1 } }),
        'Kesim planı 24.09.2026 tarihinde bitiyor (1 kesim planlanmamış).');
    assert.equal(causeSentence({ cause: { code: 'not_started', late_start_wd: 4 } }),
        'Plan başlangıcı 4 iş günü önce geçti, başlanmadı.');
    assert.equal(causeSentence({ cause: { code: 'progress', progress: 38, expected: 55 } }),
        'İlerleme %38, plana göre %55 olmalıydı.');
    assert.equal(causeSentence({ cause: { code: 'finished_late' }, own_deviation_wd: 5 }), '5 iş günü geç bitti.');
    assert.equal(causeSentence({ cause: { code: 'revision_hold' } }), 'İş emri çizim revizyonunda bekliyor.');
    assert.equal(causeSentence({ cause: { code: 'progress', progress: 5, expected: 20, via: 'SERHAN USTA' } }),
        'SERHAN USTA: İlerleme %5, plana göre %20 olmalıydı.');
    assert.equal(causeSentence({ cause: null, chain_deviation_wd: 8, pushed_by_title: 'Üretim' }),
        'Üretim geç bitiyor (+8 iş günü zincir).');
    assert.equal(causeSentence({ cause: { code: 'progress', progress: 10, expected: 30 }, own_deviation_wd: 2, chain_deviation_wd: 5, pushed_by_title: 'Satın Alma' }),
        'İlerleme %10, plana göre %30 olmalıydı. Satın Alma geç bitiyor (+5 iş günü zincir).');
    assert.equal(causeSentence({ cause: null }), '');
});

check('header summary', () => {
    const sheet = {
        plan_end: '2026-10-31', projected_end: '2026-11-18', deviation_wd: 12,
        termin: '2026-10-15', termin_gap_wd: 24, plan_vs_termin_wd: 12,
        root_cause: { title: 'Üretim', job_no: '293-15', own_deviation_wd: 8,
                      cause: { code: 'material', what: 'boru/profil', pending: 3, unordered: 0, until: '2026-10-02' } },
    };
    const h = headerSummary(sheet);
    assert.equal(h.theme, 'red');
    assert.ok(h.planLine.startsWith('Plana göre +12 iş günü geride: plan bitişi 31.10.2026, öngörülen 18.11.2026. Nedeni: Üretim (293-15) — boru/profil bekleniyor'), h.planLine);
    assert.equal(h.terminLine, 'Termin 15.10.2026: öngörülen bitiş termini 24 iş günü aşar (planın kendisi termini 12 iş günü aşıyor).');
    const ok = headerSummary({ plan_end: '2026-10-10', projected_end: '2026-10-10', deviation_wd: 0, termin: '2026-10-15', termin_gap_wd: -3 });
    assert.equal(ok.theme, 'green');
    assert.equal(ok.planLine, 'Plana uygun: bitiş 10.10.2026.');
    assert.equal(ok.terminLine, 'Termin 15.10.2026: öngörülen bitiş terminden 3 iş günü önce.');
    assert.equal(headerSummary({ plan_end: null }).planLine, 'Plan yok: hiçbir görevde tarih ya da süre girilmemiş.');
    assert.equal(headerSummary({ plan_end: '2026-10-10', projected_end: '2026-10-10', deviation_wd: 0, termin: null }).terminLine, 'Termin girilmemiş.');
});

check('figures, progress text and grouping', () => {
    assert.deepEqual(signedFigure(12), { text: '+12 iş günü', cls: 'ps-fig-late' });
    assert.deepEqual(signedFigure(-3), { text: '-3 iş günü', cls: 'ps-fig-early' });
    assert.deepEqual(signedFigure(0), { text: 'tam plan', cls: 'ps-fig-ok' });
    assert.deepEqual(signedFigure(null), { text: '—', cls: '' });
    assert.equal(progressText({ progress_pct: 38, expected_pct: 55 }), '%38 / %55');
    assert.equal(progressText({ progress_pct: 100, expected_pct: 100, done: true }), '%100');
    // Skipped work carries 100 % so it does not drag a roll-up down, but it
    // was never done — printing the number read as "Tamamlandı".
    assert.equal(
        progressText({ progress_pct: 100, expected_pct: 40, done: true, dead: true }),
        '—');
    assert.equal(
        progressText({ progress_pct: 0, expected_pct: 40, done: false, dead: true }),
        '—');
    const groups = groupRows({ nodes: [{ job_no: 'A' }, { job_no: 'B' }], rows: [{ job_no: 'B', title: 'x' }, { job_no: 'A', title: 'y' }] });
    assert.deepEqual(groups.map(g => [g.node.job_no, g.rows.length]), [['A', 1], ['B', 1]]);
});

check('house tone: no exclamation marks', () => {
    const samples = [
        causeSentence({ cause: { code: 'ncr_open', count: 1 } }),
        headerSummary({ plan_end: '2026-10-10', projected_end: '2026-10-20', deviation_wd: 6, termin: '2026-10-15', termin_gap_wd: 3 }).planLine,
    ];
    for (const s of samples) assert.ok(!s.includes('!'), s);
});

console.log(failures ? `\n${failures} failing` : '\nall passed');
process.exit(failures ? 1 : 0);

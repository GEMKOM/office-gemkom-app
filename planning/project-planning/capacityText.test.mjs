/**
 * Tests for the capacity panel copy (pure functions over the capacity payload).
 *
 *     node planning/project-planning/capacityText.test.mjs
 */

import assert from 'node:assert/strict';
import {
    BLOCK_VERDICTS, RESOURCE_VERDICTS, backlogSentence, blockVerdictLabel,
    deadlineText, difficultySentence, fmtDateTr, fmtFactor, fmtPerWeek, fmtWd,
    fmtWdShort, formatTonnes, headcountSentence, indexBlocksByKey,
    indexResourcesByKey, lateBlocks, overdueBlocks, planOrder, pressureSentence,
    rateSentence, resourceVerdictSentence, suggestionSentence, summaryLine,
    verdictMeta,
} from './capacityText.js';

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

const HOUSE_BADGES = new Set(['status-green', 'status-orange', 'status-red', 'status-grey']);

const resource = {
    key: 'subcontractor-3', resource_type: 'subcontractor', display_name: 'HARUN METAL',
    rate_kg_per_wd: 738.4, rate_source: 'statements', confidence: 'low', band: [469.2, 927.1],
    headcount: 5, headcount_source: 'statements',
    evidence: { statements: { spans: [
        { ym: '2026-04', active: true, outlier: false }, { ym: '2026-05', active: true, outlier: false },
        { ym: '2026-06', active: false, outlier: false },
    ], per_person_kg_per_wd: 147.7 } },
    open_blocks: 10, remaining_kg: 106210, remaining_eff_kg: 111278, mean_difficulty: 1.05,
    backlog_wd: 150.7, backlog_end: '2027-04-22', pressure: 2.67, peak_deadline: '2026-10-01',
    required_eff_kg_per_wd: 1970, verdict: 'overloaded', overdue_blocks: 0, overdue_kg: 0,
    blocks: [
        { assignment_type: 'subcontracting', assignment_id: 12, job_no: '293-07', verdict: 'late_risk',
          relaxed_slack_wd: -37, first_touch: '2026-10-09', flags: [] },
        { assignment_type: 'subcontracting', assignment_id: 13, job_no: '293-12-06', verdict: 'late_risk',
          relaxed_slack_wd: -5, first_touch: '2026-09-16', flags: [] },
        { assignment_type: 'subcontracting', assignment_id: 14, job_no: 'RM262-06-01', verdict: 'late_risk',
          relaxed_slack_wd: -163, first_touch: null, deadline: '2026-01-30', flags: ['deadline_passed'] },
        { assignment_type: 'subcontracting', assignment_id: 15, job_no: '304-02', verdict: 'on_track',
          relaxed_slack_wd: 3, first_touch: '2026-11-02', flags: [] },
    ],
};
const report = { resources: [resource], summary: {} };

check('formatTonnes', () => {
    assert.equal(formatTonnes(850), '850 kg');
    assert.equal(formatTonnes(1000), '1 t');
    assert.equal(formatTonnes(1250), '1,3 t');
    assert.equal(formatTonnes(166400), '166,4 t');
    assert.equal(formatTonnes(null), '—');
    assert.equal(formatTonnes(undefined), '—');
});

check('working-day and factor formatting', () => {
    assert.equal(fmtWd(37), '37 iş günü');
    assert.equal(fmtWd(0.5), '0,5 iş günü');
    assert.equal(fmtWdShort(12), '+12 gün');
    assert.equal(fmtWdShort(-3), '−3 gün');
    assert.equal(fmtWdShort(0), '0 gün');
    assert.equal(fmtFactor(1.33), '×1,33');
    assert.equal(fmtPerWeek(840), '4,2 t/hafta');
    assert.equal(fmtDateTr('2027-04-22'), '22.04.2027');
    assert.equal(fmtDateTr(null), '—');
});

check('verdict badges are house classes only', () => {
    for (const table of [BLOCK_VERDICTS, RESOURCE_VERDICTS]) {
        for (const meta of Object.values(table)) assert.ok(HOUSE_BADGES.has(meta.badge), meta.badge);
    }
    assert.equal(verdictMeta('nonsense').label, 'Öngörü yok');
    assert.equal(verdictMeta('nonsense').badge, 'status-grey');
    assert.equal(verdictMeta('overloaded', 'resource').label, 'Dolu');
});

check('rate sentence per source', () => {
    const s = rateSentence(resource, 6);
    assert.ok(s.startsWith('≈ 738 kg-eş/iş günü — hakedişlerden ölçüldü'), s);
    assert.ok(s.includes('2 hakediş dönemi'), s);
    assert.ok(s.includes('kişi başı ≈ 148'), s);
    assert.ok(s.includes('aralık 469–927'), s);
    assert.ok(rateSentence({ rate_kg_per_wd: 200, rate_source: 'manual', confidence: 'manual' })
        .includes('elle girilen kapasite'));
    assert.ok(rateSentence({ rate_kg_per_wd: 139, rate_source: 'plan_entries', confidence: 'low' })
        .includes('planlamacının varsayımı'));
    assert.ok(rateSentence({ rate_kg_per_wd: 125, rate_source: 'completed_blocks', confidence: 'low',
                             evidence: { completed_blocks: { samples: [1, 2, 3] } } })
        .includes('3 tamamlanan blok'));
    assert.ok(rateSentence({ rate_kg_per_wd: null, rate_source: 'none' }).startsWith('Hız ölçülemedi'));
});

check('headcount, backlog and pressure sentences', () => {
    assert.equal(headcountSentence(resource), '5 kişi (hakediş, beyan edilen)');
    assert.equal(headcountSentence({ resource_type: 'team' }), 'Ekip tek birim olarak planlanır');
    const b = backlogSentence(resource);
    assert.ok(b.startsWith('10 açık blok · kalan 106,2 t (zorluk ağırlıklı 111,3 t-eş, ort. ×1,05)'), b);
    assert.ok(b.includes('→ 22.04.2027'), b);
    assert.equal(backlogSentence({ open_blocks: 0 }), 'Açık iş yok');
    assert.ok(backlogSentence({ open_blocks: 2, remaining_kg: 4089, rate_kg_per_wd: null })
        .includes('hız bilinmediği için'));
    const p = pressureSentence(resource);
    assert.ok(p.startsWith('Terminler için gerekli 9,9 t/hafta — mevcut 3,7 t/hafta (2,7×'), p);
    assert.ok(p.includes('01.10.2026'), p);
    assert.ok(pressureSentence({ required_eff_kg_per_wd: 300, rate_kg_per_wd: null, peak_deadline: '2026-07-21' })
        .endsWith('— mevcut hız bilinmiyor'));
});

check('resource verdict sentence counts only future-deadline late blocks', () => {
    assert.equal(resourceVerdictSentence(resource),
        '2 blok terminine yetişmiyor; kaynak 22.04.2027 tarihine kadar dolu.');
    assert.equal(resourceVerdictSentence({ verdict: 'ok' }), 'Açık işler terminlerine yetişiyor.');
});

check('block verdict labels', () => {
    assert.equal(blockVerdictLabel({ verdict: 'late_risk', relaxed_slack_wd: -12, flags: [] }), '12 iş günü geç');
    assert.equal(blockVerdictLabel({ verdict: 'late_risk', relaxed_slack_wd: -163, flags: ['deadline_passed'] }), 'Termini geçmiş');
    assert.equal(blockVerdictLabel({ verdict: 'on_track', relaxed_slack_wd: 0 }), 'Zamanında');
    assert.equal(blockVerdictLabel({ verdict: 'on_track', relaxed_slack_wd: 3 }), '3 iş günü erken');
    assert.equal(blockVerdictLabel({ verdict: 'on_track', relaxed_slack_wd: 3, late_cause: 'plan_start' }), 'Plan başlangıcı geç');
    assert.equal(blockVerdictLabel({ verdict: 'no_target' }), 'Termin yok');
    assert.equal(blockVerdictLabel({ verdict: 'no_data' }), 'Veri yok');
});

check('deadline and difficulty text', () => {
    assert.equal(deadlineText('2026-10-15', 'paint_plan'), 'termin 15.10.2026 (boya planından önce)');
    assert.equal(deadlineText(null), 'termin girilmemiş');
    const params = { difficulty: true, reference_eur_per_kg: 0.46 };
    assert.equal(difficultySentence({ difficulty: 1.33, difficulty_source: 'tier', price_eur_per_kg: 0.61, flags: [] }, params),
        '×1,33 — 0,61 €/kg fiyat kademesinden (referans 0,46 €/kg)');
    assert.ok(difficultySentence({ difficulty: 3, difficulty_source: 'job_tiers', price_eur_per_kg: 9, flags: ['difficulty_clamped'] }, params)
        .endsWith(', sınırlandı'));
    assert.equal(difficultySentence({ difficulty: 1, difficulty_source: 'none', flags: [] }, params), 'fiyat bilgisi yok, ×1 sayıldı');
    assert.equal(difficultySentence({}, { difficulty: false }), 'zorluk ağırlığı kapalı');
});

check('suggestion sentences for every kind', () => {
    const ctx = { block: { deadline_basis: 'job_target' } };
    assert.equal(
        suggestionSentence({ kind: 'late_on_resource', finish: '2026-12-08', deadline: '2026-10-15',
                             deadline_basis: 'paint_plan', lateness_wd: 37, queued_ahead_kg: 2181 }, ctx),
        'Bu kaynakta sıra geldiğinde 08.12.2026 tarihinde biter (önünde 2,2 t iş var) — termin 15.10.2026 (boya planından önce), 37 iş günü geç.');
    assert.ok(suggestionSentence({ kind: 'late_on_resource', deadline_passed: true, deadline: '2026-01-30', finish: '2026-09-29' }, ctx)
        .startsWith('Termin 30.01.2026 geçmiş'));
    assert.equal(
        suggestionSentence({ kind: 'start_earlier', plan_start: '2026-08-03', finish_if_planned: '2026-08-06',
                             deadline: '2026-07-21', proposed_start: '2026-07-08', finish_if_started: '2026-07-13' }, ctx),
        'Plan 03.08.2026 başlıyor ve 06.08.2026 biter (termin 21.07.2026 (iş emri hedefi)); 08.07.2026 tarihinde başlanırsa 13.07.2026 biter ve yetişir.');
    assert.ok(suggestionSentence({ kind: 'reprioritize', ahead_of_job_no: '950-01', ahead_of_progress_pct: 40, ahead_of_deadline: '2026-07-21' }, ctx)
        .includes('950-01 işinin (%40 tamamlanmış, termin 21.07.2026) önüne'));
    assert.equal(
        suggestionSentence({ kind: 'move_to', resource_name: 'Ekip B', first_touch: '2026-07-08', finish: '2026-07-13', fits_deadline: true }, ctx),
        'Ekip B kaynağına taşınırsa 08.07.2026 – 13.07.2026 arasında biter (termine yetişir).');
    assert.ok(suggestionSentence({ kind: 'move_to', resource_name: 'TKAP', price_tier_name: 'ÇELİK', finish: '2026-07-13', fits_deadline: false }, ctx)
        .includes(', ÇELİK kademesiyle') );
    assert.equal(suggestionSentence({ kind: 'no_alternative', reasons: { no_tier: 2, target_late: 1 } }, ctx),
        'Taşınabileceği kaynak yok — 3 aday: fiyat kademesi olmayan 2, zaten gecikmeli 1.');
    assert.equal(suggestionSentence({ kind: 'no_alternative', reasons: { move_locked: 1 } }, ctx),
        'Taşınabileceği kaynak yok — hakedişe girmiş atama taşınamaz.');
    assert.equal(
        suggestionSentence({ kind: 'no_plan', missing: ['start', 'duration'], informed: true, proposed_start: '2026-09-21',
                             proposed_imalat_wd: 28, welding_wd: 22, proposed_end: '2026-10-28', fits_target: true }, ctx),
        'İmalat planı girilmemiş (başlangıç ve süre). Önerilen İmalat başlangıcı 21.09.2026, süre 28 iş günü (kaynak işi ≈ 22 iş günü), bitiş 28.10.2026 — hedefe sığıyor.');
    assert.ok(suggestionSentence({ kind: 'no_plan', missing: ['duration'], informed: false, uninformed_resources: ['YASİN USTA'] }, ctx)
        .includes('YASİN USTA için hız verisi olmadığından'));
    assert.ok(suggestionSentence({ kind: 'no_rate_evidence', required_eff_kg_per_wd: 682 }, ctx).includes('3,4 t/hafta gerekir'));
    assert.ok(suggestionSentence({ kind: 'placeholder_kg', allocated_kg: 1 }, ctx).startsWith('Yer tutucu blok (1 kg)'));
    assert.ok(suggestionSentence({ kind: 'assign_to', resource_name: 'Ekip B', first_touch: '2026-07-08', finish: '2026-07-09', fits_deadline: true, best_effort: false }, ctx)
        .endsWith('yapılabilir (termine yetişir).'));
    assert.ok(suggestionSentence({ kind: 'assign_to', resource_name: 'Ekip B', finish: '2026-07-09', fits_deadline: false, best_effort: true }, ctx)
        .includes('en erken biten bu'));
    assert.ok(suggestionSentence({ kind: 'no_capacity', reasons: { no_rate: 3 } }, ctx).includes('3 aday: hız verisi olmayan 3'));
    assert.ok(suggestionSentence({ kind: 'deadline_passed', deadline: '2026-07-01' }, ctx).startsWith('Termin 01.07.2026 geçmiş'));
    assert.equal(suggestionSentence({ kind: 'unknown_kind' }, ctx), '');
    assert.equal(suggestionSentence(null, ctx), '');
});

check('index maps use the board block key vocabulary', () => {
    const byBlock = indexBlocksByKey(report);
    assert.ok(byBlock.has('subcontracting-12'));
    assert.equal(byBlock.get('subcontracting-12').resource.key, 'subcontractor-3');
    assert.equal(indexResourcesByKey(report).get('subcontractor-3').display_name, 'HARUN METAL');
    assert.equal(indexBlocksByKey(null).size, 0);
});

check('late and overdue orderings', () => {
    const late = lateBlocks(report).map(x => x.block.job_no);
    assert.deepEqual(late, ['293-07', '293-12-06']);            // worst first, overdue excluded
    assert.deepEqual(overdueBlocks(report).map(x => x.block.job_no), ['RM262-06-01']);
    const order = planOrder(resource.blocks).map(b => b.job_no);
    assert.deepEqual(order, ['293-12-06', '293-07', '304-02', 'RM262-06-01']);   // undated last
});

check('summary line', () => {
    assert.equal(summaryLine({}), 'Açık işlerin tümü terminine yetişiyor.');
    assert.equal(summaryLine({ late_blocks: 33, overdue_blocks: 10, overloaded_resources: 8, no_rate_resources: 3 }),
        '33 blok gecikme riskinde · 10 blokta termin geçmiş · 8 kaynak dolu · 3 kaynakta hız verisi yok');
});

check('house tone: no exclamation marks anywhere', () => {
    const samples = [
        rateSentence(resource), backlogSentence(resource), pressureSentence(resource),
        resourceVerdictSentence(resource), summaryLine({ late_blocks: 1 }),
        ...Object.keys({ late_on_resource: 1, start_earlier: 1, reprioritize: 1, move_to: 1, no_alternative: 1,
                         no_plan: 1, no_rate_evidence: 1, placeholder_kg: 1, assign_to: 1, no_capacity: 1,
                         deadline_passed: 1 })
            .map(kind => suggestionSentence({ kind, reasons: {}, missing: [], informed: true }, {})),
    ];
    for (const s of samples) assert.ok(!s.includes('!'), s);
});

console.log(failures ? `\n${failures} failing` : '\nall passed');
process.exit(failures ? 1 : 0);

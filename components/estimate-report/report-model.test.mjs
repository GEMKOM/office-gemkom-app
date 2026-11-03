/**
 * Tests for the Tahmin report model (pure: no DOM). Shared by the legacy card
 * (project tracking) and the React estimate report (offers, estimates).
 *
 *     node components/estimate-report/report-model.test.mjs
 */

import assert from 'node:assert/strict';
import {
    PROGRESS_CAP, exclusionLabel, fmt, hoursBreakdown, hoursInfo, isPlanBottomUp, labeledLine, mdBlocks, parsePrice,
    parseTrNumber, progressModel, remainingLabel, reportModel, routeOf, similarRow, splitMarkdown, tableRows, withoutFirstTable,
} from './report-model.js';

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

check('fmt: Turkish grouping and decimals, dash when empty', () => {
    assert.equal(fmt(1161600), '1.161.600');
    assert.equal(fmt(2.2, 2), '2,20');
    assert.equal(fmt(null), '—');
    assert.equal(fmt(''), '—');
    assert.equal(fmt('abc'), '—');
});

check('parseTrNumber: Turkish, plain and grouped numbers', () => {
    assert.equal(parseTrNumber('1.161.600'), 1161600);
    assert.equal(parseTrNumber('2,20'), 2.2);
    assert.equal(parseTrNumber('%12,5'), 12.5);
    assert.equal(parseTrNumber('−3'), -3);
    assert.equal(parseTrNumber('1.5'), 1.5);
    assert.equal(parseTrNumber(42), 42);
    assert.equal(parseTrNumber('yok'), null);
    assert.equal(parseTrNumber(null), null);
});

check('splitMarkdown: title, preamble, numbered sections and sub-sections', () => {
    const md = splitMarkdown([
        '# Tahmin raporu', 'Not: taslak.',
        '## 1. Özet', 'Kısa özet.',
        '## 2. Maliyet tablosu', 'Giriş.',
        '### 2.1 Malzeme', 'Sac.',
        '#### Ayrıntı', 'derin',
        '### 2.2 İşçilik', 'Saatler.',
        '## Ek bölüm', 'serbest',
    ].join('\n'));
    assert.equal(md.title, 'Tahmin raporu');
    assert.equal(md.preamble, 'Not: taslak.');
    assert.deepEqual(md.sections.map((s) => [s.num, s.title]), [['1', 'Özet'], ['2', 'Maliyet tablosu'], [null, 'Ek bölüm']]);
    assert.deepEqual(md.sections[1].subs.map((s) => s.num), ['2.1', '2.2']);
    // A level-4 heading stays inside its sub-section.
    assert.match(md.sections[1].subs[0].body, /#### Ayrıntı\nderin/);
});

check('mdBlocks / tableRows / withoutFirstTable', () => {
    const body = 'Önce\n| A | B |\n|---|---|\n| **1** | 2 |\nSonra\n| X |\n| y |';
    assert.deepEqual(mdBlocks(body).map((b) => b.type), ['text', 'table', 'text', 'table']);
    assert.deepEqual(tableRows('| A | B |\n|---|---|\n| **1** | 2 |'), [['A', 'B'], ['1', '2']]);
    assert.equal(withoutFirstTable(body), 'Önce\n\nSonra\n\n| X |\n| y |');
});

check('labeledLine: text after the label, bullets and bold removed', () => {
    assert.equal(labeledLine('- **Önerilen fiyat:** 193.600 €/adet', /önerilen fiyat/i), '193.600 €/adet');
    assert.equal(labeledLine('başka satır', /önerilen fiyat/i), null);
});

check('parsePrice: per unit, total and €/kg; the missing one computed from the quantity', () => {
    const full = parsePrice('Önerilen fiyat: 193.600 €/adet (toplam 1.161.600 €; 3,21 €/kg)', /önerilen fiyat/i, 6);
    assert.equal(full.perUnit, 193600);
    assert.equal(full.total, 1161600);
    assert.equal(full.perKg, 3.21);
    assert.equal(full.computed, null);

    const perUnitOnly = parsePrice('Önerilen fiyat: 10.000 €/adet', /önerilen fiyat/i, 3);
    assert.equal(perUnitOnly.total, 30000);
    assert.equal(perUnitOnly.computed, 'total');

    const totalOnly = parsePrice('Önerilen fiyat: 30.000 €', /önerilen fiyat/i, 3);
    assert.equal(totalOnly.perUnit, 10000);
    assert.equal(totalOnly.computed, 'perUnit');

    assert.equal(parsePrice('Önerilen fiyat: belirlenmedi', /önerilen fiyat/i, 3), null);
});

check('routeOf: the first sentence decides the route', () => {
    assert.deepEqual(routeOf('Taşeron (karma). Benzer işler iç imalatta.'), { key: 'subcontract', label: 'Taşeron (karma)' });
    assert.equal(routeOf('Şirket içi; taşeron alternatif').key, 'in_house');
    assert.equal(routeOf('Rota: iç imalat').key, 'in_house');
    assert.equal(routeOf('Belirsiz').key, null);
    assert.equal(routeOf(''), null);
});

const REPORT = {
    markdown: [
        '# Rapor',
        '## 1. Özet',
        '| Parça | Adet | Birim kg | Toplam kg |',
        '|---|---|---|---|',
        '| Kazan | 2 | 1.000 | 2.000 (BOM P1) |',
        '**En önemli 3 risk**',
        '- Bakır fiyatı',
        '- Termin',
        '',
        'Genel değerlendirme.',
        '## 2. Maliyet tablosu',
        '### 2.1 Malzeme', 'Sac',
        '### 2.2 İşçilik', 'Saat',
        '## 3. Teklif önerisi',
        '- Önerilen fiyat: 50.000 €/adet',
        '- Taban fiyat: 40.000 €/adet',
        '- Dayandığı rota: Taşeron. Gerekçe.',
        '- Hedef marj: %15',
        '## 4. Dikkat noktaları', '- Kaynak',
        '## 5. Teklif öncesi istenecekler', '- Çizim',
        '## 6. Ek notlar', 'Serbest.',
    ].join('\n'),
    hours: { summary: { summary_row: { 'Parça': 'Kazan', 'Adet': '2', 'Birim kg': '1.000', 'Toplam kg': '2.000 (BOM P1)' } } },
    cost_table: { found: true, routes: ['in_house', 'subcontract'], expected_total: { in_house: 90000, subcontract: 80000 } },
};

check('reportModel: quantities, prices, route, margin, risks and sections from the markdown', () => {
    const m = reportModel(REPORT);
    assert.equal(m.quantity, 2);
    assert.equal(m.unitKg, 1000);
    assert.equal(m.totalKg, 2000);
    assert.equal(m.totalKgBasis, 'BOM P1');
    assert.equal(m.part, 'Kazan');
    assert.equal(m.price.perUnit, 50000);
    assert.equal(m.price.total, 100000);
    assert.equal(m.price.perKg, 50);
    assert.equal(m.floor.total, 80000);
    assert.equal(m.basis.key, 'subcontract');
    assert.equal(m.targetMargin, '%15');
    assert.equal(m.margin, (100000 - 80000) / 100000);
    assert.match(m.risks, /Bakır fiyatı\n- Termin/);
    assert.match(m.summaryRest, /Genel değerlendirme/);
    assert.equal(m.sections.malzeme.title, 'Malzeme');
    assert.equal(m.sections.iscilik.title, 'İşçilik');
    assert.deepEqual(m.extra.map((s) => s.num), ['6']);
    assert.deepEqual(m.routes, ['in_house', 'subcontract']);
});

check("reportModel: the backend's figures win over the text", () => {
    const m = reportModel({
        ...REPORT,
        hours: {
            ...REPORT.hours,
            summary: { ...REPORT.hours.summary, suggested_price_eur: 120000, suggested_eur_per_kg: 60, basis_route: 'in_house', margin_pct: 25 },
        },
    });
    assert.equal(m.price.total, 120000);
    assert.equal(m.price.perUnit, 60000);
    assert.equal(m.price.perKg, 60);
    assert.equal(m.basis.key, 'in_house');
    assert.equal(m.margin, 0.25);
});

check('reportModel: an empty payload does not throw', () => {
    const m = reportModel(null);
    assert.equal(m.price, null);
    assert.deepEqual(m.routes, []);
    assert.deepEqual(m.extra, []);
});

check('hoursInfo / isPlanBottomUp', () => {
    assert.equal(isPlanBottomUp({ work_centres: [] }), true);
    assert.equal(isPlanBottomUp({ method: 'geometry_v4' }), false);
    const info = hoursInfo({ method: 'geometry_v4', calibration: { in_house: { no_reference: true } } });
    assert.deepEqual(info, { plan: false, geometry: true, noInHouseRef: true, noMachRef: false });
});

check('hoursBreakdown: welding grouped by joint type × material, averaged when unit times differ', () => {
    const b = hoursBreakdown({
        lines: [
            { joint_type: 'pipe_butt', material: 'copper', qty: 2, hours: 4, unit_h: 2 },
            { joint_type: 'pipe_butt', material: 'copper', qty: 2, hours: 2, unit_h: 1 },
            { joint_type: 'plate_fillet', material: 'carbon_steel', qty: 1, hours: 1, unit_h: 1 },
        ],
        non_welding_lines: [{ step: 'cutting', hours: 3 }, { step: 'hydrotest', hours: 0, applies: false }],
        total_h: 10, welding_h: 7, non_welding_h: 3,
    });
    assert.equal(b.plan, false);
    assert.equal(b.welding.length, 2);
    assert.equal(b.welding[0].hours, 6);
    assert.equal(b.welding[0].averaged, true);
    assert.equal(b.welding[0].unit_h, 1.5);
    assert.deepEqual(b.other.map((l) => [l.label, l.applies]), [['Kesim', true], ['Hidrotest', false]]);
    assert.equal(b.total, 10);
});

check('exclusionLabel: known reasons, the subcontracted share, unknown kept', () => {
    assert.equal(exclusionLabel('no recorded hours'), 'Kayıtlı saat yok');
    assert.equal(exclusionLabel('unreliable: 4 h'), 'Güvenilmez saat kaydı (≤ 10 h)');
    assert.equal(exclusionLabel('mostly subcontracted (72 %)'), "Kilosunun %72'i taşeronda kaynaklanmış");
    assert.equal(exclusionLabel('mostly subcontracted', { subcontracted_kg_share: 0.6 }), "Kilosunun %60'i taşeronda kaynaklanmış");
    assert.equal(exclusionLabel('something else'), 'something else');
    assert.equal(exclusionLabel(''), '');
});

check('similarRow: €/kg and margin of a reference job', () => {
    const row = similarRow({ weight_kg: 1000, selling_price_eur: 5000, actual_total_cost_eur: 4000 });
    assert.equal(row.sell_per_kg, 5);
    assert.equal(row.margin, 0.2);
    assert.equal(similarRow({ weight_kg: 0 }).sell_per_kg, null);
});

check('progressModel: fill, remaining time and steps; capped below 100 %', () => {
    const start = Date.parse('2026-11-02T10:00:00Z');
    const progress = {
        stage_index: 1,
        detail: 'sayfa 3/10',
        stages: [
            { key: 'a', label: 'Çizimler', expected_s: 60 },
            { key: 'b', label: 'Kaynak listesi', expected_s: 120, started_at: '2026-11-02T10:00:00Z' },
            { key: 'c', label: 'Rapor', expected_s: 60 },
        ],
    };
    const m = progressModel(progress, start + 60_000);
    assert.equal(m.fraction, (60 + 60) / 240);
    assert.equal(m.remainingS, 60 + 60);
    assert.equal(m.overdue, false);
    assert.deepEqual(m.steps.map((s) => s.state), ['done', 'current', 'pending']);
    assert.equal(m.steps[1].detail, 'sayfa 3/10');
    assert.equal(remainingLabel(m), '~2 dk kaldı');

    // A slow stage waits at its boundary; the bar never reaches 100 %.
    const late = progressModel({ ...progress, stage_index: 2, stages: progress.stages.map((s) => ({ ...s, started_at: '2026-11-02T10:00:00Z' })) }, start + 3_600_000);
    assert.equal(late.fraction, PROGRESS_CAP);
    assert.equal(late.overdue, true);
    assert.equal(remainingLabel(late), 'biraz daha sürüyor');

    assert.equal(progressModel(null), null);
    assert.equal(progressModel({ stages: [] }), null);
    assert.equal(remainingLabel(null), '');
});

if (failures) {
    console.log(`\n${failures} failing`);
    process.exit(1);
}
console.log('\nall passed');

/**
 * Tests for the Ağırlık ve Fiyat Kademeleri plan state.
 *
 *     node projects/project-tracking/weightPlannerModel.test.mjs
 */

import assert from 'node:assert/strict';
import {
    allocatedKg,
    awaitsManualKg,
    buildBulkPayload,
    cloneTiers,
    effectiveShare,
    emptyChange,
    existingTiers,
    existingWeldingKg,
    finalWeight,
    formatDecimal,
    isWeightChanged,
    newTierRow,
    offerWeight,
    parseDecimal,
    parsePastedColumn,
    planHasTemplate,
    setExistingField,
    summarize,
    templateItemsFromRows,
    tiersFromTemplate,
    validateJob,
    weightEdit,
} from './weightPlannerModel.js';

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

// GET /subcontracting/price-tier-templates/{id}/
const TEMPLATE = {
    id: 3,
    name: 'Çelik + Boru + Boya',
    items: [
        { sequence: 2, tier_type: 'welding', name: 'BORU', price_per_kg: '48.0000', currency: 'TRY', weight_share_pct: '30.00' },
        { sequence: 1, tier_type: 'welding', name: 'ÇELİK', price_per_kg: '30.0000', currency: 'TRY', weight_share_pct: '70.00' },
        { sequence: 3, tier_type: 'paint', name: 'Boya 1', price_per_kg: '3.9500', currency: 'TRY', weight_share_pct: '100.00' },
    ],
};

const job = (extra = {}) => ({ job_no: '950-01-01', total_weight_kg: null, quantity: 1, tiers: [], ...extra });

check('numbers in the formats planners type and paste', () => {
    assert.equal(parseDecimal('4.510,25'), 4510.25);
    assert.equal(parseDecimal('4510,25'), 4510.25);
    assert.equal(parseDecimal('4510.25'), 4510.25);
    assert.equal(parseDecimal('4.510'), 4510);
    assert.equal(parseDecimal('1.234.567'), 1234567);
    assert.equal(parseDecimal(' 862,5 kg '), 862.5);
    assert.equal(parseDecimal(''), null);
    assert.ok(Number.isNaN(parseDecimal('abc')));
    assert.equal(formatDecimal(4510.2), '4510,2');
});

check('weight edits: changed, cleared, unreadable', () => {
    const saved = job({ total_weight_kg: '4510.20' });
    assert.equal(isWeightChanged(saved, weightEdit('4510,2')), false);
    assert.equal(isWeightChanged(saved, weightEdit('4510,25')), true);
    assert.equal(isWeightChanged(saved, weightEdit('')), true);
    assert.equal(finalWeight(saved, weightEdit('')), null);
    assert.equal(isWeightChanged(job(), weightEdit('')), false);
    assert.equal(isWeightChanged(saved, weightEdit('x')), true);
});

check('offer hint is per-piece weight times job quantity', () => {
    assert.equal(offerWeight(job({ offer_weight_kg: '730.00', quantity: 6 })), 4380);
    assert.equal(offerWeight(job()), null);
});

check('pasted columns: one column fills down, two map by job number', () => {
    assert.deepEqual(parsePastedColumn('4.510,2\r\n862,5\r\n\r\n'), [
        { jobNo: null, text: '4.510,2' }, { jobNo: null, text: '862,5' },
    ]);
    assert.deepEqual(parsePastedColumn('950-01-01\tKova\t4510,2\n950-01-02\t\t862,5'), [
        { jobNo: '950-01-01', text: '4510,2' }, { jobNo: '950-01-02', text: '862,5' },
    ]);
});

check('template rows follow the weight by share, in template order', () => {
    const rows = tiersFromTemplate(TEMPLATE);
    assert.deepEqual(rows.map((r) => r.name), ['ÇELİK', 'BORU', 'Boya 1']);
    assert.deepEqual(rows.map((r) => allocatedKg(r, 1000)), [700, 300, 1000]);
    assert.deepEqual(rows.map((r) => allocatedKg(r, null)), [null, null, null]);
    assert.ok(planHasTemplate(rows, '3'));
});

check('shares round DOWN so they never overshoot the job', () => {
    const third = { share: 33.33, kg: null };
    assert.equal(allocatedKg(third, 100.01), 33.33);
    const all = { share: 100, kg: null };
    assert.equal(allocatedKg(all, 4510.27), 4510.27);
});

check('a pinned kg wins over the share', () => {
    const row = { share: null, kg: 600 };
    assert.equal(allocatedKg(row, 1000), 600);
    assert.equal(effectiveShare(row, 1000), 60);
});

check('copies are sized for the target, hand-entered kg are not copied', () => {
    const [pinned, manual] = cloneTiers([
        { key: 'a', tier_type: 'welding', share: null, kg: 600, baseShare: 100 },
        { key: 'b', tier_type: 'welding', share: null, kg: 250, baseShare: null },
    ], 1000);
    assert.equal(pinned.share, 60);
    assert.equal(allocatedKg(pinned, 2000), 1200);
    // A kg typed on a share-less row belongs to its own job.
    assert.equal(manual.kg, null);
    assert.ok(awaitsManualKg(manual));
});

check('template tiers with an empty share wait for a typed kg', () => {
    const rows = tiersFromTemplate({ id: 4, items: [
        { tier_type: 'welding', name: 'ÇELİK', price_per_kg: '30', weight_share_pct: null },
        { tier_type: 'paint', name: 'Boya 1', price_per_kg: '3.95', weight_share_pct: '100.00' },
    ] });
    assert.ok(awaitsManualKg(rows[0]));
    assert.equal(allocatedKg(rows[0], 1000), null);
    const filled = job({ total_weight_kg: '1000' });
    assert.deepEqual(validateJob(filled, undefined, rows).map((p) => p.message), ['"ÇELİK" için ayrılan kg girilmedi']);
    rows[0].kg = 640;
    assert.deepEqual(validateJob(filled, undefined, rows), []);
    // ...and stay hand-sized when saved back as a template.
    assert.deepEqual(templateItemsFromRows(rows).map((i) => i.weight_share_pct), [null, 100]);
});

check('a new welding row offers the share that is left', () => {
    const rows = tiersFromTemplate({ id: 1, items: [{ tier_type: 'welding', name: 'ÇELİK', price_per_kg: '30', weight_share_pct: '70' }] });
    assert.equal(newTierRow(rows, 1000).share, 30);
    assert.equal(newTierRow([], 1000).share, 100);
});

check('validation mirrors the backend capacity rules', () => {
    const rows = tiersFromTemplate(TEMPLATE);
    const filled = job({ total_weight_kg: '1000' });
    assert.deepEqual(validateJob(filled, undefined, rows), []);
    // Welding rows need a weight to be sized.
    assert.ok(validateJob(job(), undefined, rows).some((p) => p.field === 'kg'));
    // Existing 500 kg welding + 1000 kg new on a 1000 kg job is over.
    const over = job({ total_weight_kg: '1000', tiers: [{ tier_type: 'welding', allocated_weight_kg: '500.00' }] });
    assert.ok(validateJob(over, undefined, rows).some((p) => p.field === 'weight'));
    // Dropping the weight below existing tiers is refused; raising an over job is a repair.
    const full = job({ total_weight_kg: '1000', tiers: [{ tier_type: 'welding', allocated_weight_kg: '1200.00' }] });
    assert.ok(validateJob(full, weightEdit('900'), []).length > 0);
    assert.deepEqual(validateJob(full, weightEdit('1100'), []), []);
    assert.ok(validateJob(filled, weightEdit('0'), []).length > 0);
    const unnamed = [{ ...rows[0], name: ' ', price_per_kg: NaN }];
    assert.deepEqual(validateJob(filled, undefined, unnamed).map((p) => p.field).sort(), ['name', 'price']);
});

check('payload: weight only when changed, tiers with kg resolved', () => {
    const jobs = [
        job({ job_no: 'A', total_weight_kg: '1000.00' }),
        job({ job_no: 'B', total_weight_kg: '50.00' }),
        job({ job_no: 'C' }),
    ];
    const edits = new Map([['A', weightEdit('1.000')], ['B', weightEdit('75,5')]]);
    const tiers = new Map([['A', tiersFromTemplate(TEMPLATE)], ['C', []]]);
    const { plans } = buildBulkPayload(jobs, edits, tiers);
    assert.deepEqual(plans.map((p) => p.job_order), ['A', 'B']);
    assert.equal('total_weight_kg' in plans[0], false);
    assert.deepEqual(plans[0].tiers.map((t) => t.allocated_weight_kg), ['700.00', '300.00', '1000.00']);
    assert.equal(plans[0].tiers[0].price_per_kg, '30.0000');
    assert.deepEqual(plans[1], { job_order: 'B', total_weight_kg: '75.50' });
    assert.deepEqual(summarize(jobs, edits, tiers),
        { jobCount: 2, weightCount: 1, tierCount: 3, updatedCount: 0, deletedCount: 0 });
});

check('rows become template items with the share they started from', () => {
    const items = templateItemsFromRows([{ tier_type: 'welding', name: 'ÇELİK', price_per_kg: 30, currency: 'TRY', share: null, kg: 450, baseShare: 70 }]);
    assert.equal(items[0].weight_share_pct, 70);
});

// Existing tiers as GET /subcontracting/price-tiers/planner/ sends them.
const SAVED = job({
    job_no: 'E',
    total_weight_kg: '1000.00',
    tiers: [
        { id: 11, tier_type: 'welding', name: 'ÇELİK', price_per_kg: '30.0000', currency: 'TRY',
          allocated_weight_kg: '700.00', used_weight_kg: '500.00', assignment_count: 1 },
        { id: 12, tier_type: 'paint', name: 'Boya 1', price_per_kg: '3.9500', currency: 'TRY',
          allocated_weight_kg: '1000.00', used_weight_kg: '0', assignment_count: 0 },
    ],
});

check('editing existing tiers keeps only real differences', () => {
    const change = emptyChange();
    setExistingField(change, SAVED.tiers[0], 'price_per_kg', 32.5);
    setExistingField(change, SAVED.tiers[0], 'name', 'ÇELİK');   // unchanged: dropped
    assert.deepEqual(change.edits.get(11), { price_per_kg: 32.5 });
    setExistingField(change, SAVED.tiers[0], 'price_per_kg', 30);  // back to saved
    assert.equal(change.edits.size, 0);
});

check('existing-tier edits count toward capacity and respect assignments', () => {
    const change = emptyChange();
    setExistingField(change, SAVED.tiers[0], 'allocated_weight_kg', 1100);
    assert.equal(existingWeldingKg(SAVED, change), 1100);
    assert.ok(validateJob(SAVED, undefined, [], change).some((p) => p.field === 'weight'));

    const below = emptyChange();
    setExistingField(below, SAVED.tiers[0], 'allocated_weight_kg', 400);
    assert.ok(validateJob(SAVED, undefined, [], below).some((p) => p.key === 'e11' && p.field === 'kg'));

    const retype = emptyChange();
    setExistingField(retype, SAVED.tiers[0], 'tier_type', 'paint');
    assert.ok(validateJob(SAVED, undefined, [], retype).some((p) => p.field === 'type'));

    const drop = emptyChange();
    drop.deletes.add(11);
    assert.ok(validateJob(SAVED, undefined, [], drop).some((p) => p.field === 'delete'));
    drop.deletes.clear();
    drop.deletes.add(12);
    assert.deepEqual(validateJob(SAVED, undefined, [], drop), []);
    assert.equal(existingTiers(SAVED, drop)[1].deleted, true);
});

check('payload carries edits and deletes', () => {
    const change = emptyChange();
    setExistingField(change, SAVED.tiers[0], 'price_per_kg', 32.5);
    setExistingField(change, SAVED.tiers[0], 'name', ' ÇELİK A ');
    change.deletes.add(12);
    const changes = new Map([['E', change]]);
    const { plans } = buildBulkPayload([SAVED], new Map(), new Map(), changes);
    assert.deepEqual(plans, [{
        job_order: 'E',
        update_tiers: [{ id: 11, price_per_kg: '32.5000', name: 'ÇELİK A' }],
        delete_tiers: [12],
    }]);
    assert.deepEqual(summarize([SAVED], new Map(), new Map(), changes),
        { jobCount: 1, weightCount: 0, tierCount: 0, updatedCount: 1, deletedCount: 1 });
});

if (failures) {
    console.log(`\n${failures} failing`);
    process.exit(1);
}
console.log('\nall passing');

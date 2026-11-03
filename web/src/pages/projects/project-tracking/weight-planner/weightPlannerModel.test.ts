// Port of projects/project-tracking/weightPlannerModel.test.mjs.
import { describe, expect, test } from 'vitest';
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
  type PlanJob,
  type TierChange,
  type TierRow,
} from './weightPlannerModel';

// GET /subcontracting/price-tier-templates/{id}/
const TEMPLATE = {
  id: 3,
  name: 'Çelik + Boru + Boya',
  items: [
    {
      sequence: 2,
      tier_type: 'welding',
      name: 'BORU',
      price_per_kg: '48.0000',
      currency: 'TRY',
      weight_share_pct: '30.00',
    },
    {
      sequence: 1,
      tier_type: 'welding',
      name: 'ÇELİK',
      price_per_kg: '30.0000',
      currency: 'TRY',
      weight_share_pct: '70.00',
    },
    {
      sequence: 3,
      tier_type: 'paint',
      name: 'Boya 1',
      price_per_kg: '3.9500',
      currency: 'TRY',
      weight_share_pct: '100.00',
    },
  ],
};

/** arr[i], failing the test when it is missing. */
function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no item at ${index}`);
  return item;
}

const job = (extra: Partial<PlanJob> = {}): PlanJob => ({
  job_no: '950-01-01',
  total_weight_kg: null,
  quantity: 1,
  tiers: [],
  ...extra,
});

describe('weightPlannerModel', () => {
  test('numbers in the formats planners type and paste', () => {
    expect(parseDecimal('4.510,25')).toBe(4510.25);
    expect(parseDecimal('4510,25')).toBe(4510.25);
    expect(parseDecimal('4510.25')).toBe(4510.25);
    expect(parseDecimal('4.510')).toBe(4510);
    expect(parseDecimal('1.234.567')).toBe(1234567);
    expect(parseDecimal(' 862,5 kg ')).toBe(862.5);
    expect(parseDecimal('')).toBe(null);
    expect(Number.isNaN(parseDecimal('abc'))).toBe(true);
    expect(formatDecimal(4510.2)).toBe('4510,2');
  });

  test('weight edits: changed, cleared, unreadable', () => {
    const saved = job({ total_weight_kg: '4510.20' });
    expect(isWeightChanged(saved, weightEdit('4510,2'))).toBe(false);
    expect(isWeightChanged(saved, weightEdit('4510,25'))).toBe(true);
    expect(isWeightChanged(saved, weightEdit(''))).toBe(true);
    expect(finalWeight(saved, weightEdit(''))).toBe(null);
    expect(isWeightChanged(job(), weightEdit(''))).toBe(false);
    expect(isWeightChanged(saved, weightEdit('x'))).toBe(true);
  });

  test('offer hint is per-piece weight times job quantity', () => {
    expect(offerWeight(job({ offer_weight_kg: '730.00', quantity: 6 }))).toBe(4380);
    expect(offerWeight(job())).toBe(null);
  });

  test('pasted columns: one column fills down, two map by job number', () => {
    expect(parsePastedColumn('4.510,2\r\n862,5\r\n\r\n')).toEqual([
      { jobNo: null, text: '4.510,2' },
      { jobNo: null, text: '862,5' },
    ]);
    expect(parsePastedColumn('950-01-01\tKova\t4510,2\n950-01-02\t\t862,5')).toEqual([
      { jobNo: '950-01-01', text: '4510,2' },
      { jobNo: '950-01-02', text: '862,5' },
    ]);
  });

  test('template rows follow the weight by share, in template order', () => {
    const rows = tiersFromTemplate(TEMPLATE);
    expect(rows.map((r) => r.name)).toEqual(['ÇELİK', 'BORU', 'Boya 1']);
    expect(rows.map((r) => allocatedKg(r, 1000))).toEqual([700, 300, 1000]);
    expect(rows.map((r) => allocatedKg(r, null))).toEqual([null, null, null]);
    expect(planHasTemplate(rows, '3')).toBe(true);
  });

  test('shares round DOWN so they never overshoot the job', () => {
    const third = { share: 33.33, kg: null };
    expect(allocatedKg(third, 100.01)).toBe(33.33);
    const all = { share: 100, kg: null };
    expect(allocatedKg(all, 4510.27)).toBe(4510.27);
  });

  test('a pinned kg wins over the share', () => {
    const row = { share: null, kg: 600 };
    expect(allocatedKg(row, 1000)).toBe(600);
    expect(effectiveShare(row, 1000)).toBe(60);
  });

  test('copies are sized for the target, hand-entered kg are not copied', () => {
    const copies = cloneTiers(
      [
        { key: 'a', tier_type: 'welding', share: null, kg: 600, baseShare: 100 },
        { key: 'b', tier_type: 'welding', share: null, kg: 250, baseShare: null },
      ],
      1000,
    );
    const pinned = at(copies, 0);
    const manual = at(copies, 1);
    expect(pinned.share).toBe(60);
    expect(allocatedKg(pinned, 2000)).toBe(1200);
    // A kg typed on a share-less row belongs to its own job.
    expect(manual.kg).toBe(null);
    expect(awaitsManualKg(manual)).toBe(true);
  });

  test('template tiers with an empty share wait for a typed kg', () => {
    const rows = tiersFromTemplate({
      id: 4,
      items: [
        { tier_type: 'welding', name: 'ÇELİK', price_per_kg: '30', weight_share_pct: null },
        { tier_type: 'paint', name: 'Boya 1', price_per_kg: '3.95', weight_share_pct: '100.00' },
      ],
    });
    expect(awaitsManualKg(at(rows, 0))).toBe(true);
    expect(allocatedKg(at(rows, 0), 1000)).toBe(null);
    const filled = job({ total_weight_kg: '1000' });
    expect(validateJob(filled, undefined, rows).map((p) => p.message)).toEqual([
      '"ÇELİK" için ayrılan kg girilmedi',
    ]);
    at(rows, 0).kg = 640;
    expect(validateJob(filled, undefined, rows)).toEqual([]);
    // ...and stay hand-sized when saved back as a template.
    expect(templateItemsFromRows(rows).map((i) => i.weight_share_pct)).toEqual([null, 100]);
  });

  test('a new welding row offers the share that is left', () => {
    const rows = tiersFromTemplate({
      id: 1,
      items: [{ tier_type: 'welding', name: 'ÇELİK', price_per_kg: '30', weight_share_pct: '70' }],
    });
    expect(newTierRow(rows, 1000).share).toBe(30);
    expect(newTierRow([], 1000).share).toBe(100);
  });

  test('validation mirrors the backend capacity rules', () => {
    const rows = tiersFromTemplate(TEMPLATE);
    const filled = job({ total_weight_kg: '1000' });
    expect(validateJob(filled, undefined, rows)).toEqual([]);
    // Welding rows need a weight to be sized.
    expect(validateJob(job(), undefined, rows).some((p) => p.field === 'kg')).toBe(true);
    // Existing 500 kg welding + 1000 kg new on a 1000 kg job is over.
    const over = job({
      total_weight_kg: '1000',
      tiers: [{ tier_type: 'welding', allocated_weight_kg: '500.00' }],
    });
    expect(validateJob(over, undefined, rows).some((p) => p.field === 'weight')).toBe(true);
    // Dropping the weight below existing tiers is refused; raising an over job is a repair.
    const full = job({
      total_weight_kg: '1000',
      tiers: [{ tier_type: 'welding', allocated_weight_kg: '1200.00' }],
    });
    expect(validateJob(full, weightEdit('900'), []).length).toBeGreaterThan(0);
    expect(validateJob(full, weightEdit('1100'), [])).toEqual([]);
    expect(validateJob(filled, weightEdit('0'), []).length).toBeGreaterThan(0);
    const unnamed: TierRow[] = [{ ...at(rows, 0), name: ' ', price_per_kg: NaN }];
    expect(
      validateJob(filled, undefined, unnamed)
        .map((p) => p.field)
        .sort(),
    ).toEqual(['name', 'price']);
  });

  test('payload: weight only when changed, tiers with kg resolved', () => {
    const jobs = [
      job({ job_no: 'A', total_weight_kg: '1000.00' }),
      job({ job_no: 'B', total_weight_kg: '50.00' }),
      job({ job_no: 'C' }),
    ];
    const edits = new Map([
      ['A', weightEdit('1.000')],
      ['B', weightEdit('75,5')],
    ]);
    const tiers = new Map<string, TierRow[]>([
      ['A', tiersFromTemplate(TEMPLATE)],
      ['C', []],
    ]);
    const { plans } = buildBulkPayload(jobs, edits, tiers);
    expect(plans.map((p) => p.job_order)).toEqual(['A', 'B']);
    expect('total_weight_kg' in at(plans, 0)).toBe(false);
    expect(at(plans, 0).tiers?.map((t) => t.allocated_weight_kg)).toEqual([
      '700.00',
      '300.00',
      '1000.00',
    ]);
    expect(at(at(plans, 0).tiers ?? [], 0).price_per_kg).toBe('30.0000');
    expect(at(plans, 1)).toEqual({ job_order: 'B', total_weight_kg: '75.50' });
    expect(summarize(jobs, edits, tiers)).toEqual({
      jobCount: 2,
      weightCount: 1,
      tierCount: 3,
      updatedCount: 0,
      deletedCount: 0,
    });
  });

  test('rows become template items with the share they started from', () => {
    const items = templateItemsFromRows([
      {
        tier_type: 'welding',
        name: 'ÇELİK',
        price_per_kg: 30,
        currency: 'TRY',
        share: null,
        kg: 450,
        baseShare: 70,
      },
    ]);
    expect(at(items, 0).weight_share_pct).toBe(70);
  });

  // Existing tiers as GET /subcontracting/price-tiers/planner/ sends them.
  const SAVED = job({
    job_no: 'E',
    total_weight_kg: '1000.00',
    tiers: [
      {
        id: 11,
        tier_type: 'welding',
        name: 'ÇELİK',
        price_per_kg: '30.0000',
        currency: 'TRY',
        allocated_weight_kg: '700.00',
        used_weight_kg: '500.00',
        assignment_count: 1,
      },
      {
        id: 12,
        tier_type: 'paint',
        name: 'Boya 1',
        price_per_kg: '3.9500',
        currency: 'TRY',
        allocated_weight_kg: '1000.00',
        used_weight_kg: '0',
        assignment_count: 0,
      },
    ],
  });
  const savedTiers = SAVED.tiers ?? [];

  test('editing existing tiers keeps only real differences', () => {
    const change = emptyChange();
    setExistingField(change, at(savedTiers, 0), 'price_per_kg', 32.5);
    setExistingField(change, at(savedTiers, 0), 'name', 'ÇELİK'); // unchanged: dropped
    expect(change.edits.get(11)).toEqual({ price_per_kg: 32.5 });
    setExistingField(change, at(savedTiers, 0), 'price_per_kg', 30); // back to saved
    expect(change.edits.size).toBe(0);
  });

  test('existing-tier edits count toward capacity and respect assignments', () => {
    const change = emptyChange();
    setExistingField(change, at(savedTiers, 0), 'allocated_weight_kg', 1100);
    expect(existingWeldingKg(SAVED, change)).toBe(1100);
    expect(validateJob(SAVED, undefined, [], change).some((p) => p.field === 'weight')).toBe(true);

    const below = emptyChange();
    setExistingField(below, at(savedTiers, 0), 'allocated_weight_kg', 400);
    expect(
      validateJob(SAVED, undefined, [], below).some((p) => p.key === 'e11' && p.field === 'kg'),
    ).toBe(true);

    const retype = emptyChange();
    setExistingField(retype, at(savedTiers, 0), 'tier_type', 'paint');
    expect(validateJob(SAVED, undefined, [], retype).some((p) => p.field === 'type')).toBe(true);

    const drop: TierChange = emptyChange();
    drop.deletes.add(11);
    expect(validateJob(SAVED, undefined, [], drop).some((p) => p.field === 'delete')).toBe(true);
    drop.deletes.clear();
    drop.deletes.add(12);
    expect(validateJob(SAVED, undefined, [], drop)).toEqual([]);
    expect(at(existingTiers(SAVED, drop), 1).deleted).toBe(true);
  });

  test('payload carries edits and deletes', () => {
    const change = emptyChange();
    setExistingField(change, at(savedTiers, 0), 'price_per_kg', 32.5);
    setExistingField(change, at(savedTiers, 0), 'name', ' ÇELİK A ');
    change.deletes.add(12);
    const changes = new Map([['E', change]]);
    const { plans } = buildBulkPayload([SAVED], new Map(), new Map(), changes);
    expect(plans).toEqual([
      {
        job_order: 'E',
        update_tiers: [{ id: 11, price_per_kg: '32.5000', name: 'ÇELİK A' }],
        delete_tiers: [12],
      },
    ]);
    expect(summarize([SAVED], new Map(), new Map(), changes)).toEqual({
      jobCount: 1,
      weightCount: 0,
      tierCount: 0,
      updatedCount: 1,
      deletedCount: 1,
    });
  });
});

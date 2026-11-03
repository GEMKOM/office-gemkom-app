/**
 * Ağırlık ve Fiyat Kademeleri: plan state for the project-tracking weight and
 * price tier modal (port of projects/project-tracking/weightPlannerModel.js).
 * No DOM in here.
 *
 * Per job order the modal keeps an optional weight edit and a list of NEW
 * price tiers; Kaydet sends all of them in one request
 * (POST /subcontracting/price-tiers/bulk_plan/).
 *
 * A tier that came from a template holds a SHARE of the job's weight
 * (`share`, percent) instead of a kg figure, so it follows the weight: apply
 * the template, type the weight afterwards, and the tier is sized from it.
 * Typing a kg into the row pins it (`kg`). A template tier with no share is
 * not sized at all: it waits for planning to type its kg on each job order.
 * `baseShare` remembers the share the row started from, so clearing a typed
 * kg puts it back.
 */
import type {
  BulkPlan,
  BulkPlanPayload,
  BulkPlanTierUpdate,
} from '@/api/subcontracting/priceTiers';

export const WELDING = 'welding';
export const PAINT = 'paint';

/** A new tier row of the plan. */
export interface TierRow {
  key: string;
  tier_type: string;
  name: string;
  price_per_kg: number | null;
  currency: string;
  share: number | null;
  kg: number | null;
  baseShare: number | null;
  templateId: number | string | null;
}

/** The sizing part of a row: what allocatedKg / effectiveShare read. */
export interface SizedRow {
  share?: number | null;
  kg?: number | null;
}

/** An existing tier as far as the plan reads it (planner GET shape). */
export interface PlanTier {
  id?: number;
  tier_type: string;
  name?: string;
  price_per_kg?: string | number | null;
  currency?: string;
  allocated_weight_kg?: string | number | null;
  used_weight_kg?: string | number | null;
  assignment_count?: number;
}

/** A job order as far as the plan reads it (planner GET shape). */
export interface PlanJob {
  job_no: string;
  total_weight_kg?: string | number | null;
  offer_weight_kg?: string | number | null;
  quantity?: number | null;
  tiers?: PlanTier[];
}

export interface TemplateLike {
  id: number | string;
  items?: Array<{
    sequence?: number;
    tier_type?: string;
    name?: string;
    price_per_kg?: string | number | null;
    currency?: string;
    weight_share_pct?: string | number | null;
  }>;
}

/** A weight edit: value is a number, null (cleared) or NaN (unreadable). */
export interface WeightEdit {
  text: string;
  value: number | null;
}

let keyCounter = 0;

export function newTierKey(): string {
  keyCounter += 1;
  return `w${keyCounter}`;
}

// ---------------------------------------------------------------------------
// Numbers: planners type and paste Turkish formats ("4.510,2"), plain ones
// ("4510.2") and whatever Excel hands over.
// ---------------------------------------------------------------------------

/**
 * Parse a typed or pasted number. Returns null for empty text and NaN for
 * text that is not a number.
 *   "4.510,25" → 4510.25   "4510,25" → 4510.25   "4510.25" → 4510.25
 *   "4.510" → 4510 (a dot before exactly three digits is a thousands
 *   separator: weights are stored with two decimals, so 4,510 kg never
 *   means something real here)
 */
export function parseDecimal(text: string | number | null | undefined): number | null {
  if (text === null || text === undefined) return null;
  if (typeof text === 'number') return Number.isFinite(text) ? text : NaN;
  let s = String(text).replace(/\s|kg|%|₺|€|\$/gi, '');
  if (!s) return null;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
  return Number(s);
}

export function roundTo(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/** For inputs: "4510,2" (Turkish decimal comma, no thousands separators). */
export function formatDecimal(value: number | null | undefined, places = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  return Number(value).toLocaleString('tr-TR', {
    useGrouping: false,
    maximumFractionDigits: places,
  });
}

/** For reading: "4.510,2 kg". */
export function formatKg(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '–';
  return `${Number(value).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} kg`;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

export function savedWeight(job: PlanJob): number | null {
  return toNumber(job.total_weight_kg);
}

export function weightEdit(text: string): WeightEdit {
  const parsed = parseDecimal(text);
  return { text, value: parsed === null || Number.isNaN(parsed) ? parsed : roundTo(parsed, 2) };
}

export function isWeightChanged(job: PlanJob, edit: WeightEdit | null | undefined): boolean {
  if (!edit) return false;
  if (Number.isNaN(edit.value)) return true;
  const saved = savedWeight(job);
  if (edit.value === null || saved === null) return edit.value !== saved;
  return Math.abs(edit.value - saved) >= 0.005;
}

/** The weight the job will have after saving (NaN while the edit is unreadable). */
export function finalWeight(job: PlanJob, edit: WeightEdit | null | undefined): number | null {
  return edit ? edit.value : savedWeight(job);
}

/** What the sales offer line suggests: per-piece offer weight × job quantity. */
export function offerWeight(job: PlanJob): number | null {
  const perPiece = toNumber(job.offer_weight_kg);
  if (perPiece === null) return null;
  return roundTo(perPiece * (job.quantity || 1), 2);
}

export interface PastedEntry {
  jobNo: string | null;
  text: string;
}

/**
 * A pasted block → [{ jobNo, text }]. One column pastes down the rows from
 * the cursor (jobNo null); with two or more columns the first cell is taken
 * as the job number and the last non-empty cell as the weight.
 */
export function parsePastedColumn(text: string | null | undefined): PastedEntry[] {
  const lines = String(text || '')
    .replace(/\r/g, '')
    .split('\n');
  while (lines.length && !(lines[lines.length - 1] ?? '').trim()) lines.pop();
  return lines.map((line) => {
    const cells = line.split('\t').map((c) => c.trim());
    if (cells.length < 2) return { jobNo: null, text: cells[0] || '' };
    const filled = cells.filter(Boolean);
    return {
      jobNo: cells[0] ?? '',
      text: filled.length > 1 ? (filled[filled.length - 1] ?? '') : '',
    };
  });
}

// ---------------------------------------------------------------------------
// Tiers
// ---------------------------------------------------------------------------

/** kg the row will get with this job weight; null while it cannot be known. */
export function allocatedKg(row: SizedRow, weight: number | null | undefined): number | null {
  if (row.kg !== null && row.kg !== undefined) return row.kg;
  if (row.share === null || row.share === undefined || Number.isNaN(row.share)) return null;
  if (weight === null || weight === undefined || Number.isNaN(weight) || weight <= 0) return null;
  // Rounded DOWN to the cent, so shares adding up to 100 % never overshoot
  // the job by a rounding cent (the backend refuses any overshoot).
  return Math.floor((Math.round(weight * 100) * row.share) / 100 + 1e-6) / 100;
}

/** A row with neither share nor kg: its kg is typed by hand on this job. */
export function awaitsManualKg(row: SizedRow): boolean {
  return (
    (row.share === null || row.share === undefined) && (row.kg === null || row.kg === undefined)
  );
}

/** Share of the weight the row stands for (shown beside a pinned kg). */
export function effectiveShare(row: SizedRow, weight: number | null | undefined): number | null {
  if (row.share !== null && row.share !== undefined) return row.share;
  if (row.kg === null || row.kg === undefined || !weight) return null;
  return roundTo((row.kg / weight) * 100, 2);
}

/** Template (as the template list sends it) → fresh rows sized by share. */
export function tiersFromTemplate(template: TemplateLike | null | undefined): TierRow[] {
  const templateId = template?.id ?? null;
  return (template?.items || [])
    .slice()
    .sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
    .map((item) => {
      const share = toNumber(item.weight_share_pct);
      return {
        key: newTierKey(),
        tier_type: item.tier_type || WELDING,
        name: item.name || '',
        price_per_kg: toNumber(item.price_per_kg),
        currency: item.currency || 'TRY',
        share,
        kg: null,
        baseShare: share,
        templateId,
      };
    });
}

export function newTierRow(rows: TierRow[], weight: number | null): TierRow {
  // A new welding row offers whatever share the other welding rows left.
  const used = rows
    .filter((r) => r.tier_type === WELDING)
    .reduce((sum, r) => sum + (effectiveShare(r, weight) || 0), 0);
  const share = Math.max(0, roundTo(100 - used, 2)) || 100;
  return {
    key: newTierKey(),
    tier_type: WELDING,
    name: '',
    price_per_kg: null,
    currency: rows[rows.length - 1]?.currency ?? 'TRY',
    share,
    kg: null,
    baseShare: share,
    templateId: null,
  };
}

/**
 * Copy rows to another job, sized for the target rather than the source: a
 * kg pinned over a share becomes the share it was of the source weight. A kg
 * typed on a row that never had a share belongs to its own job, so the copy
 * arrives empty and waits for the target's kg.
 */
export function cloneTiers<T extends SizedRow & { baseShare?: number | null }>(
  rows: T[],
  sourceWeight: number | null,
): Array<
  Omit<T, 'key' | 'share' | 'kg'> & { key: string; share: number | null; kg: number | null }
> {
  return rows.map((r) => {
    let share = r.share ?? null;
    if (
      share === null &&
      r.kg !== null &&
      r.kg !== undefined &&
      r.baseShare !== null &&
      r.baseShare !== undefined &&
      sourceWeight !== null &&
      sourceWeight > 0
    ) {
      share = roundTo((r.kg / sourceWeight) * 100, 2);
    }
    return { ...r, key: newTierKey(), share, kg: null };
  });
}

export function planHasTemplate(rows: TierRow[], templateId: number | string): boolean {
  return rows.some((r) => String(r.templateId) === String(templateId));
}

export interface TemplateItemDraft {
  tier_type: string;
  name: string;
  price_per_kg: number | null;
  currency: string;
  weight_share_pct: number | null;
}

/**
 * Rows → template items for "Şablon olarak kaydet". A row keeps the share it
 * follows (or started from, if a kg was typed over it); a hand-sized row
 * stays hand-sized in the template.
 */
export function templateItemsFromRows(
  rows: Array<
    Pick<TierRow, 'tier_type' | 'name' | 'price_per_kg' | 'currency' | 'share' | 'kg' | 'baseShare'>
  >,
): TemplateItemDraft[] {
  return rows.map((r) => {
    const share = r.share ?? r.baseShare ?? null;
    return {
      tier_type: r.tier_type,
      name: r.name,
      price_per_kg: r.price_per_kg,
      currency: r.currency,
      weight_share_pct: share === null ? null : Math.min(100, Math.max(0.01, share)),
    };
  });
}

// ---------------------------------------------------------------------------
// Existing tiers: edited and deleted from the planner too. A job's pending
// changes are { edits: Map<tierId, {field: value}>, deletes: Set<tierId> };
// only fields that differ from the saved tier are kept in an edit.
// ---------------------------------------------------------------------------

export type EditableField =
  'tier_type' | 'name' | 'price_per_kg' | 'currency' | 'allocated_weight_kg';

export interface TierPatch {
  tier_type?: string;
  name?: string;
  price_per_kg?: number | null;
  currency?: string;
  allocated_weight_kg?: number | null;
}

export interface TierChange {
  edits: Map<number, TierPatch>;
  deletes: Set<number>;
}

export function emptyChange(): TierChange {
  return { edits: new Map(), deletes: new Set() };
}

export function hasExistingChanges(change: TierChange | null | undefined): boolean {
  return !!change && (change.edits.size > 0 || change.deletes.size > 0);
}

export interface SavedTier {
  id: number;
  tier_type: string;
  name: string | undefined;
  price_per_kg: number | null;
  currency: string | undefined;
  allocated_weight_kg: number | null;
  used: number;
  assignments: number;
}

export interface ExistingTier extends SavedTier {
  original: SavedTier;
  changed: Set<string>;
  deleted: boolean;
}

/** The saved tier as numbers, the way edits are compared against it. */
function savedTier(t: PlanTier): SavedTier {
  return {
    id: t.id as number,
    tier_type: t.tier_type,
    name: t.name,
    price_per_kg: toNumber(t.price_per_kg),
    currency: t.currency,
    allocated_weight_kg: toNumber(t.allocated_weight_kg),
    used: toNumber(t.used_weight_kg) || 0,
    assignments: t.assignment_count || 0,
  };
}

/** Existing tiers with the pending edits applied (deleted ones flagged, not dropped). */
export function existingTiers(job: PlanJob, change: TierChange | null | undefined): ExistingTier[] {
  return (job.tiers || []).map((t) => {
    const original = savedTier(t);
    const patch = change?.edits.get(original.id) || {};
    return {
      ...original,
      ...patch,
      original,
      changed: new Set(Object.keys(patch)),
      deleted: !!change?.deletes.has(original.id),
    };
  });
}

/** Record one field of an edit; setting it back to the saved value drops it. */
export function setExistingField(
  change: TierChange,
  tier: PlanTier,
  field: EditableField,
  value: string | number | null,
): void {
  const original = savedTier(tier);
  const id = original.id;
  const patch: Record<string, unknown> = { ...(change.edits.get(id) || {}) };
  const saved = original[field];
  const same =
    typeof value === 'number' && typeof saved === 'number'
      ? Math.abs(value - saved) < 1e-9
      : value === saved;
  if (same) delete patch[field];
  else patch[field] = value;
  if (Object.keys(patch).length) change.edits.set(id, patch as TierPatch);
  else change.edits.delete(id);
}

/** Welding kg the job's existing tiers carry: as saved, or with the edits applied. */
export function existingWeldingKg(job: PlanJob, change: TierChange | null = null): number {
  const tiers: SavedTier[] = change
    ? existingTiers(job, change).filter((t) => !t.deleted)
    : (job.tiers || []).map(savedTier);
  return tiers
    .filter((t) => t.tier_type === WELDING)
    .reduce(
      (sum, t) =>
        sum +
        (t.allocated_weight_kg !== null && Number.isFinite(t.allocated_weight_kg)
          ? t.allocated_weight_kg
          : 0),
      0,
    );
}

export function addedWeldingKg(rows: TierRow[], weight: number | null): number {
  return rows
    .filter((r) => r.tier_type === WELDING)
    .reduce((sum, r) => sum + (allocatedKg(r, weight) || 0), 0);
}

// ---------------------------------------------------------------------------
// Validation and payload
// ---------------------------------------------------------------------------

export type ProblemField = 'weight' | 'name' | 'price' | 'kg' | 'delete' | 'type';

export interface Problem {
  /** New rows use their row key, existing tiers `e<id>`, job-level null. */
  key: string | null;
  field: ProblemField;
  message: string;
}

/**
 * Problems that would make the save fail, phrased for the user. Mirrors
 * subcontracting/services/tier_planner.py: the job's welding tiers (existing
 * as edited, plus new) must fit its weight, unless the plan makes an
 * already-over job less over; tiers with assignments cannot be deleted,
 * change type, or drop below what is assigned.
 */
export function validateJob(
  job: PlanJob,
  edit: WeightEdit | null | undefined,
  rows: TierRow[],
  change: TierChange | null = null,
): Problem[] {
  const problems: Problem[] = [];
  if (edit && Number.isNaN(edit.value)) {
    problems.push({ key: null, field: 'weight', message: 'Ağırlık okunamadı' });
    return problems;
  }
  if (edit && edit.value !== null && edit.value <= 0) {
    problems.push({ key: null, field: 'weight', message: "Ağırlık 0'dan büyük olmalı" });
    return problems;
  }
  const weight = finalWeight(job, edit);

  rows.forEach((r) => {
    if (!(r.name || '').trim())
      problems.push({ key: r.key, field: 'name', message: 'Kademe adı boş' });
    if (r.price_per_kg === null || Number.isNaN(r.price_per_kg) || r.price_per_kg < 0) {
      problems.push({ key: r.key, field: 'price', message: 'Fiyat/kg geçersiz' });
    }
    const kg = allocatedKg(r, weight);
    if (kg === null && awaitsManualKg(r)) {
      problems.push({
        key: r.key,
        field: 'kg',
        message: `"${r.name || 'Kademe'}" için ayrılan kg girilmedi`,
      });
    } else if (kg === null) {
      problems.push({ key: r.key, field: 'kg', message: "Ağırlık girilmeden pay kg'a çevrilemez" });
    } else if (kg < 0.01) {
      problems.push({ key: r.key, field: 'kg', message: 'Ayrılan ağırlık en az 0,01 kg' });
    }
  });

  if (change) {
    existingTiers(job, change).forEach((t) => {
      const key = `e${t.id}`;
      if (t.deleted) {
        if (t.assignments) {
          problems.push({
            key,
            field: 'delete',
            message: `"${t.original.name}" kademesinin ataması var; silinemez`,
          });
        }
        return;
      }
      if (!(t.name || '').trim()) problems.push({ key, field: 'name', message: 'Kademe adı boş' });
      if (t.price_per_kg === null || Number.isNaN(t.price_per_kg) || t.price_per_kg < 0) {
        problems.push({ key, field: 'price', message: 'Fiyat/kg geçersiz' });
      }
      if (
        t.allocated_weight_kg === null ||
        Number.isNaN(t.allocated_weight_kg) ||
        t.allocated_weight_kg < 0.01
      ) {
        problems.push({ key, field: 'kg', message: 'Ayrılan ağırlık en az 0,01 kg' });
      } else if (
        t.allocated_weight_kg < t.used - 0.001 &&
        t.allocated_weight_kg < (t.original.allocated_weight_kg as number)
      ) {
        problems.push({
          key,
          field: 'kg',
          message: `"${t.name}" kademesine ${formatKg(t.used)} atanmış; ayrılan ağırlık bunun altına inemez`,
        });
      }
      if (t.assignments && t.tier_type !== t.original.tier_type) {
        problems.push({
          key,
          field: 'type',
          message: `"${t.name}" kademesinin ataması var; tipi değiştirilemez`,
        });
      }
    });
  }

  const before = existingWeldingKg(job);
  const after = existingWeldingKg(job, change || emptyChange()) + addedWeldingKg(rows, weight);
  const capacity = weight || 0;
  const weightDropped = isWeightChanged(job, edit) && capacity < (savedWeight(job) || 0);
  if (after > capacity + 0.001 && (after > before + 0.001 || weightDropped)) {
    problems.push({
      key: null,
      field: 'weight',
      message: `Kaynak kademeleri toplamı (${formatKg(after)}) toplam ağırlığı (${formatKg(capacity)}) aşıyor`,
    });
  }
  return problems;
}

export type EditMap = Map<string, WeightEdit>;
export type TierMap = Map<string, TierRow[]>;
export type ChangeMap = Map<string, TierChange>;

/** Jobs with something to save, in tree order. */
export function changedJobs<J extends PlanJob>(
  jobs: J[],
  edits: EditMap,
  tiers: TierMap,
  changes: ChangeMap = new Map(),
): J[] {
  return jobs.filter(
    (job) =>
      isWeightChanged(job, edits.get(job.job_no)) ||
      (tiers.get(job.job_no) || []).length > 0 ||
      hasExistingChanges(changes.get(job.job_no)),
  );
}

export function buildBulkPayload(
  jobs: PlanJob[],
  edits: EditMap,
  tiers: TierMap,
  changes: ChangeMap = new Map(),
): BulkPlanPayload {
  return {
    plans: changedJobs(jobs, edits, tiers, changes).map((job) => {
      const edit = edits.get(job.job_no);
      const weight = finalWeight(job, edit);
      const plan: BulkPlan = { job_order: job.job_no };
      if (isWeightChanged(job, edit))
        plan.total_weight_kg = weight === null ? null : weight.toFixed(2);
      const rows = tiers.get(job.job_no) || [];
      if (rows.length) {
        // validateJob runs before this, so price and kg are known here.
        plan.tiers = rows.map((r) => ({
          tier_type: r.tier_type,
          name: (r.name || '').trim(),
          price_per_kg: roundTo(r.price_per_kg as number, 4).toFixed(4),
          currency: r.currency,
          allocated_weight_kg: (allocatedKg(r, weight) as number).toFixed(2),
        }));
      }
      const change = changes.get(job.job_no);
      if (change && change.edits.size) {
        plan.update_tiers = [...change.edits].map(([id, patch]) => {
          const out: BulkPlanTierUpdate = { id };
          Object.entries(patch).forEach(([field, value]) => {
            if (field === 'price_per_kg') out[field] = roundTo(value as number, 4).toFixed(4);
            else if (field === 'allocated_weight_kg')
              out[field] = roundTo(value as number, 2).toFixed(2);
            else if (field === 'name') out[field] = (value as string).trim();
            else out[field] = value as string;
          });
          return out;
        });
      }
      if (change && change.deletes.size) plan.delete_tiers = [...change.deletes];
      return plan;
    }),
  };
}

export interface PlanSummary {
  jobCount: number;
  weightCount: number;
  tierCount: number;
  updatedCount: number;
  deletedCount: number;
}

export function summarize(
  jobs: PlanJob[],
  edits: EditMap,
  tiers: TierMap,
  changes: ChangeMap = new Map(),
): PlanSummary {
  let weightCount = 0;
  let tierCount = 0;
  let updatedCount = 0;
  let deletedCount = 0;
  let jobCount = 0;
  jobs.forEach((job) => {
    const changed = isWeightChanged(job, edits.get(job.job_no));
    const added = (tiers.get(job.job_no) || []).length;
    const change = changes.get(job.job_no);
    if (changed) weightCount += 1;
    tierCount += added;
    if (change) {
      updatedCount += change.edits.size;
      deletedCount += change.deletes.size;
    }
    if (changed || added || hasExistingChanges(change)) jobCount += 1;
  });
  return { jobCount, weightCount, tierCount, updatedCount, deletedCount };
}

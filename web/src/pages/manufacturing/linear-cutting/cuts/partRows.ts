import {
  angleFromSetback,
  MAX_ANGLE_DEG,
  setbackFromAngle,
} from '@/pages/manufacturing/linear-cutting/shared/lcGeometry';
import type { LinearPart, LinearPartPayload } from '@/api/manufacturing/linearCuttingSessions';

/**
 * One row of the parts table. The typed fields hold the input text, as the
 * legacy page read them from its inputs; the payload casts them.
 */
export interface PartRow {
  rowId: string;
  /** null for a new row that is not saved yet. */
  id: number | null;
  /** Item pk as a string, '' when none is picked. */
  item: string;
  /** The Malzeme text shown for `item`. */
  itemLabel: string;
  jobNo: string;
  /** The İş No text shown for `jobNo` (job no — title once picked). */
  jobLabel: string;
  order: string;
  profile_height_mm: string;
  label: string;
  image_no: string;
  stock_length_mm: string;
  nominal_length_mm: string;
  quantity: string;
  angle_left_deg: string;
  angle_right_deg: string;
  /** Signed corner offsets (köşe farkı); null when the angle was typed. */
  setback_left_mm: number | null;
  setback_right_mm: number | null;
  allow_rotation: boolean;
  requires_bending: boolean;
}

export type Side = 'left' | 'right';

export const SIDES = [
  { side: 'left', label: 'Sol', angleField: 'angle_left_deg', setbackField: 'setback_left_mm' },
  { side: 'right', label: 'Sağ', angleField: 'angle_right_deg', setbackField: 'setback_right_mm' },
] as const;

export type SideConfig = (typeof SIDES)[number];

export const sideConfig = (side: Side): SideConfig => (side === 'left' ? SIDES[0] : SIDES[1]);

// Stored as IntegerField on LinearCuttingPart — a decimal here 400s.
// (nominal_length_mm is NOT one of these: cut lengths are fractional.)
export const INTEGER_MM_FIELDS = [
  ['profile_height_mm', 'Kesit'],
  ['stock_length_mm', 'Stok boyu'],
  ['quantity', 'Adet'],
] as const;

/** Legacy castNumber: '' and non-numbers give the fallback. */
export function castNumber<F extends number | null>(value: unknown, fallback: F): number | F {
  const t = `${value ?? ''}`.trim();
  if (t === '') return fallback;
  const n = Number(t);
  return Number.isNaN(n) ? fallback : n;
}

export function round2(v: unknown) {
  return Math.round((Number(v) || 0) * 100) / 100;
}

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v));

/** "Malzeme" text: title first, then code — the title is what people recognize. */
export function itemText(part: Pick<LinearPart, 'item_name' | 'item_code' | 'item_unit'>) {
  const base = [part.item_name, part.item_code].filter(Boolean).join(' — ');
  return base + (part.item_unit ? ` (${part.item_unit})` : '');
}

export function partToRow(p: LinearPart): PartRow {
  return {
    rowId: `p-${p.id}`,
    id: p.id,
    item: p.item != null ? String(p.item) : '',
    itemLabel: itemText(p),
    jobNo: p.job_no ?? '',
    jobLabel: p.job_no ?? '',
    order: text(p.order),
    profile_height_mm: text(p.profile_height_mm ?? 0),
    label: p.label ?? '',
    image_no: p.image_no ?? '',
    stock_length_mm: text(p.stock_length_mm),
    nominal_length_mm: text(p.nominal_length_mm),
    quantity: text(p.quantity),
    angle_left_deg: text(p.angle_left_deg ?? 0),
    angle_right_deg: text(p.angle_right_deg ?? 0),
    setback_left_mm: p.setback_left_mm != null ? Number(p.setback_left_mm) : null,
    setback_right_mm: p.setback_right_mm != null ? Number(p.setback_right_mm) : null,
    allow_rotation: p.allow_rotation ?? true,
    requires_bending: p.requires_bending ?? false,
  };
}

/** Server rows in their saved order. */
export function partsToRows(parts: readonly LinearPart[]) {
  return parts
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map(partToRow);
}

let seq = 0;
function newRowId() {
  // Must be unique even for very fast consecutive clicks (Date.now can collide).
  seq = (seq + 1) % 1_000_000;
  return `new-${Date.now()}-${seq}`;
}

/** The next free "#": one more than the highest order on screen. */
export function nextOrder(rows: readonly PartRow[]) {
  const orders = rows.filter((r) => r.order.trim() !== '').map((r) => Number(r.order) || 0);
  return Math.max(0, ...orders) + 1 || 1;
}

export function emptyRow(rows: readonly PartRow[]): PartRow {
  return {
    rowId: newRowId(),
    id: null,
    item: '',
    itemLabel: '',
    jobNo: '',
    jobLabel: '',
    order: String(nextOrder(rows)),
    profile_height_mm: '0',
    label: '',
    image_no: '',
    stock_length_mm: '',
    nominal_length_mm: '',
    quantity: '1',
    angle_left_deg: '0',
    angle_right_deg: '0',
    setback_left_mm: null,
    setback_right_mm: null,
    allow_rotation: true,
    requires_bending: false,
  };
}

/** "Kopyala": a new row with the same values and the next order. */
export function copyRow(row: PartRow, rows: readonly PartRow[]): PartRow {
  return {
    ...row,
    rowId: newRowId(),
    id: null,
    quantity: row.quantity.trim() === '' ? '1' : row.quantity,
    order: String(nextOrder(rows)),
  };
}

export function ownHeight(row: PartRow) {
  return castNumber(row.profile_height_mm, 0) || 0;
}

/**
 * Kesit is a material property — a row with none inherits it from a sibling
 * row of the same item, exactly as the backend does at optimize time.
 */
export function effectiveHeight(row: PartRow, rows: readonly PartRow[]) {
  const own = ownHeight(row);
  if (own > 0) return own;
  if (!row.item) return 0;
  const sibling = rows.find(
    (r) => r.rowId !== row.rowId && Number(r.item) === Number(row.item) && ownHeight(r) > 0,
  );
  return sibling ? ownHeight(sibling) : 0;
}

export function shapeSpec(row: PartRow, rows: readonly PartRow[]) {
  return {
    nominal_length_mm: castNumber(row.nominal_length_mm, null),
    profile_height_mm: effectiveHeight(row, rows),
    angle_left_deg: castNumber(row.angle_left_deg, 0),
    angle_right_deg: castNumber(row.angle_right_deg, 0),
  };
}

/** Kesit changed → every angle derived from a measurement on that row moves. */
export function reapplySetbacks(row: PartRow, rows: readonly PartRow[]): PartRow {
  const next = { ...row };
  const h = effectiveHeight(row, rows);
  for (const cfg of SIDES) {
    const setback = row[cfg.setbackField];
    if (setback == null) continue;
    const angle = angleFromSetback(setback, h);
    if (angle != null) next[cfg.angleField] = String(round2(angle));
  }
  return next;
}

/** Corner offset (typed magnitude + which edge is longer) → angle for one end. */
export function applySetback(
  row: PartRow,
  rows: readonly PartRow[],
  side: Side,
  magnitude: string,
  sign: 'near' | 'far',
): PartRow {
  const cfg = sideConfig(side);
  if (magnitude.trim() === '') return { ...row, [cfg.setbackField]: null };
  // Stored at 0.01 mm — round here so the angle shown is the one the backend
  // re-derives from the saved measurement.
  const signed = round2(Math.abs(castNumber(magnitude, 0)) * (sign === 'far' ? -1 : 1));
  const next: PartRow = { ...row, [cfg.setbackField]: signed };
  const angle = angleFromSetback(signed, effectiveHeight(row, rows));
  if (angle != null) next[cfg.angleField] = String(round2(angle));
  return next;
}

/** A hand-typed angle drops the measurement it no longer matches. */
export function typeAngle(row: PartRow, side: Side, value: string): PartRow {
  const cfg = sideConfig(side);
  return { ...row, [cfg.angleField]: value, [cfg.setbackField]: null };
}

/** A picked material brings the kesit of a sibling row along when the row has none. */
export function pickItem(
  row: PartRow,
  rows: readonly PartRow[],
  item: string,
  label: string,
): PartRow {
  let next: PartRow = { ...row, item, itemLabel: label };
  if (item && !(ownHeight(row) > 0)) {
    const sibling = rows.find(
      (r) => r.rowId !== row.rowId && Number(r.item) === Number(item) && ownHeight(r) > 0,
    );
    if (sibling) next = { ...next, profile_height_mm: sibling.profile_height_mm };
  }
  const updated = rows.map((r) => (r.rowId === row.rowId ? next : r));
  return reapplySetbacks(next, updated);
}

/** Port of buildPartPayloadFromRowId. */
export function toPayload(row: PartRow, session: string): LinearPartPayload {
  const stock = row.stock_length_mm.trim();
  return {
    session,
    item: row.item ? Number(row.item) : null,
    stock_length_mm: stock === '' ? null : castNumber(stock, null),
    label: row.label || '',
    image_no: row.image_no.trim(),
    job_no: row.jobNo || '',
    nominal_length_mm: castNumber(row.nominal_length_mm, 0),
    quantity: castNumber(row.quantity, 1),
    angle_left_deg: castNumber(row.angle_left_deg, 0),
    angle_right_deg: castNumber(row.angle_right_deg, 0),
    profile_height_mm: castNumber(row.profile_height_mm, 0),
    // Sending an explicit null is what tells the backend the angle was typed by hand.
    setback_left_mm: row.setback_left_mm,
    setback_right_mm: row.setback_right_mm,
    allow_rotation: row.allow_rotation,
    requires_bending: row.requires_bending,
    order: castNumber(row.order, 1),
  };
}

/** Port of validatePartPayload: the first problem as a warning text, else null. */
export function validatePayload(
  payload: LinearPartPayload,
  rows: readonly PartRow[],
  rowLabel = '',
): string | null {
  const prefix = rowLabel ? `${rowLabel}: ` : '';
  if (!payload.item) return `${prefix}Malzeme seçilmelidir.`;
  const length = payload.nominal_length_mm ?? 0;
  if (!(length > 0) || !((payload.quantity ?? 0) > 0)) {
    return `${prefix}Uzunluk ve Adet sıfırdan büyük olmalı.`;
  }
  // These are whole millimetres in the model; catch it here rather than
  // letting DRF answer with "A valid integer is required."
  for (const [field, label] of INTEGER_MM_FIELDS) {
    const v = payload[field];
    if (v == null || Number.isInteger(v)) continue;
    return `${prefix}${label} tam sayı (mm) olmalı — ${v} yerine ${Math.round(v)} girin.`;
  }
  const aL = payload.angle_left_deg ?? 0;
  const aR = payload.angle_right_deg ?? 0;
  const h = payload.profile_height_mm ?? 0;
  // Geometry that cannot be cut is rejected by the optimizer anyway; say so at
  // save time, while the drawing that shows it is still on screen.
  if (h > 0) {
    const tL = Math.abs(setbackFromAngle(aL, h));
    const tR = Math.abs(setbackFromAngle(aR, h));
    const needed = Math.max(
      (aL < 0 ? tL : 0) + (aR < 0 ? tR : 0),
      (aL > 0 ? tL : 0) + (aR > 0 ? tR : 0),
    );
    if (length < needed) {
      return (
        `${prefix}Açılar bu boya sığmıyor — ${h} mm kesitte bu açılar için ` +
        `en az ${round2(needed)} mm gerekir (girilen: ${length} mm).`
      );
    }
  }
  for (const cfg of SIDES) {
    const angle = Number(payload[cfg.angleField]) || 0;
    if (Math.abs(angle) > MAX_ANGLE_DEG) {
      return (
        `${prefix}${cfg.label} açı ${round2(angle)}° — en fazla ±${MAX_ANGLE_DEG}° olabilir.` +
        (payload[cfg.setbackField] != null ? ' Köşe farkı kesite göre çok büyük.' : '')
      );
    }
  }
  if ((aL || aR) && !(h > 0)) {
    // Profile size is a material property: entering it once on ANY row of the
    // same material is enough (the backend inherits it).
    const siblingHasHeight = rows.some(
      (r) => r.item && Number(r.item) === Number(payload.item) && ownHeight(r) > 0,
    );
    if (!siblingHasHeight) {
      return `${prefix}Açılı kesim için Kesit (mm) girin — malzeme başına bir satırda girilmesi yeterlidir.`;
    }
  }
  return null;
}

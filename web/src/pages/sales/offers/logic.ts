import type {
  ApprovalDecision,
  ApprovalUser,
  ApprovalWorkflow,
  NewOfferItem,
  OfferDetail,
  OfferItem,
  OfferItemUpdate,
  PricingMode,
} from '@/api/sales/offers';
import { compareOfferItems } from '@/api/sales/offers';

// Pure helpers of the offers page, ported from offerList.js.

/** Only a cancelled offer is closed to edits (legacy CLOSED_STATUSES). */
export const isClosed = (status: string | undefined) => status === 'cancelled';

/** Consultations can be sent or edited until the offer is won, lost or cancelled. */
export const canSendConsultations = (status: string | undefined) =>
  !['won', 'lost', 'cancelled'].includes(status ?? '');

/** Saving prices on these cancels the running approval on the backend. */
export const APPROVAL_CANCELLING_STATUSES = ['pending_approval', 'approved', 'submitted_customer'];

export const canSubmitApproval = (offer: Pick<OfferDetail, 'status' | 'total_price'>) =>
  offer.status === 'pricing' && Number.parseFloat(String(offer.total_price ?? '')) > 0;

export type OfferTab =
  'genel' | 'kalemler' | 'dosyalar' | 'consultations' | 'pricing' | 'approval' | 'tahmin';

export const TAB_LABELS: Record<OfferTab, string> = {
  genel: 'Genel',
  kalemler: 'Kalemler',
  dosyalar: 'Dosyalar',
  consultations: 'Departman Görüşleri',
  pricing: 'Fiyatlandırma',
  approval: 'Onay',
  tahmin: 'Tahmin',
};

/** A status badge in the list opens the tab that status is about (legacy STATUS_TAB_MAP). */
export function statusTab(status: string): OfferTab {
  if (status === 'consultation') return 'consultations';
  if (status === 'pricing') return 'pricing';
  if (status === 'pending_approval' || status === 'approved') return 'approval';
  return 'genel';
}

// ── Deadline ─────────────────────────────────────────────────────────

/** The deadline no longer matters once the offer is with the customer or closed. */
const DEADLINE_INACTIVE_STATUSES = ['submitted_customer', 'won', 'converted', 'lost', 'cancelled'];

/** Whole days from today to the date (negative when overdue). */
export function daysUntilDate(value: string | null | undefined, now = new Date()): number | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const target = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86_400_000);
}

export function deadlineActive(status: string): boolean {
  return !DEADLINE_INACTIVE_STATUSES.includes(status);
}

/** 'red' at one day or less (or overdue), 'yellow' under three days. */
export function deadlineUrgency(
  row: { status: string; offer_expiry_date?: string | null },
  now = new Date(),
): 'red' | 'yellow' | null {
  if (!row.offer_expiry_date || !deadlineActive(row.status)) return null;
  const days = daysUntilDate(row.offer_expiry_date, now);
  if (days === null) return null;
  if (days <= 1) return 'red';
  if (days < 3) return 'yellow';
  return null;
}

// ── Numbers ──────────────────────────────────────────────────────────

export function parseNum(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

const trNumber = (decimals: { min?: number; max?: number } = {}) =>
  new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: decimals.min,
    maximumFractionDigits: decimals.max,
  });

/** toLocaleString('tr-TR', { minimumFractionDigits: 2 }): two to three decimals. */
export const tr2 = (n: number) => trNumber({ min: 2, max: 3 }).format(n);

/** Intl currency with fixed decimals; an unknown code falls back to "1.234,56 XYZ". */
export function money(amount: number, currency: string, decimals: number): string {
  try {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: currency || 'EUR',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
  } catch {
    return `${trNumber({ min: decimals, max: decimals }).format(amount)} ${currency}`;
  }
}

// ── Titles ───────────────────────────────────────────────────────────

export function itemTitle(item: OfferItem): string {
  return (
    item.resolved_title ||
    item.title_override ||
    item.title ||
    item.template_node_detail?.title ||
    '-'
  );
}

/** The catalog title an override replaced (template_node_detail.title, else title). */
export function originalTitle(item: OfferItem): string {
  return String(item.template_node_detail?.title || item.title || '');
}

export function itemNodeId(item: OfferItem): number | null {
  const raw = item.template_node ?? item.node_id ?? item.template_node_detail?.id;
  if (raw === null || raw === undefined || (raw as unknown) === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function flattenItems(items: readonly OfferItem[]): OfferItem[] {
  const out: OfferItem[] = [];
  const walk = (nodes: readonly OfferItem[]) => {
    for (const node of nodes) {
      out.push(node);
      if (node.children?.length) walk(node.children);
    }
  };
  walk(items);
  return out;
}

// ── Pasting a table (Excel) ──────────────────────────────────────────

export interface PasteTable {
  rows: string[][];
  columnCount: number;
}

/** Tab-separated lines; blank lines dropped, short rows padded. */
export function parsePasteTable(text: string): PasteTable {
  if (!text || !text.trim()) return { rows: [], columnCount: 0 };
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.split('\t').map((cell) => cell.trim()))
    .filter((row) => row.some((cell) => cell !== ''));
  const columnCount = rows.length ? Math.max(...rows.map((r) => r.length)) : 0;
  for (const row of rows) while (row.length < columnCount) row.push('');
  return { rows, columnCount };
}

/** The first non-empty value of a column, cut at 42 characters. */
export function columnSample(rows: string[][], col: number): string {
  for (const row of rows) {
    const value = (row[col] || '').trim();
    if (value) return value.length > 42 ? `${value.slice(0, 39)}…` : value;
  }
  return '(boş)';
}

export type ItemColumnRole = 'ignore' | 'title' | 'quantity';

/** The last mostly-numeric column is the quantity, the first other non-empty one the title. */
export function guessItemColumnRoles(rows: string[][], columnCount: number): ItemColumnRole[] {
  const roles: ItemColumnRole[] = Array(columnCount).fill('ignore');
  let qtyCol = -1;
  for (let c = columnCount - 1; c >= 0; c--) {
    const values = rows.map((r) => (r[c] || '').trim()).filter(Boolean);
    if (!values.length) continue;
    const numeric = values.filter((v) => /^\d+([.,]\d+)?$/.test(v.replace(',', '.'))).length;
    if (numeric / values.length >= 0.75) {
      qtyCol = c;
      break;
    }
  }
  if (qtyCol >= 0) roles[qtyCol] = 'quantity';
  for (let c = 0; c < columnCount; c++) {
    if (c === qtyCol) continue;
    if (rows.some((r) => (r[c] || '').trim())) {
      roles[c] = 'title';
      break;
    }
  }
  return roles;
}

/** Title columns joined with the separator; quantity rounded, at least 1. */
export function buildPasteItems(
  rows: string[][],
  roles: ItemColumnRole[],
  separator = ' - ',
): { title: string; quantity: number }[] {
  const titleCols = roles.map((role, i) => (role === 'title' ? i : -1)).filter((i) => i >= 0);
  const qtyCol = roles.indexOf('quantity');
  const items: { title: string; quantity: number }[] = [];
  for (const row of rows) {
    if (!row.some((cell) => cell.trim())) continue;
    const title = titleCols
      .map((col) => (row[col] || '').trim())
      .filter(Boolean)
      .join(separator)
      .trim();
    if (!title) continue;
    let quantity = 1;
    if (qtyCol >= 0) {
      const parsed = Number.parseFloat((row[qtyCol] || '').trim().replace(',', '.'));
      if (Number.isFinite(parsed) && parsed > 0) quantity = Math.max(1, Math.round(parsed));
    }
    items.push({ title, quantity });
  }
  return items;
}

export type PriceColumnRole = 'ignore' | 'unit_price' | 'weight_kg' | 'delivery_period' | 'notes';

/**
 * Numeric columns by falling average: price, then weight. Text columns: a
 * short one is the delivery period, the next the note.
 */
export function guessPriceColumnRoles(rows: string[][], columnCount: number): PriceColumnRole[] {
  const roles: PriceColumnRole[] = Array(columnCount).fill('ignore');
  const stats = Array.from({ length: columnCount }, (_, c) => {
    const values = rows.map((r) => (r[c] || '').trim()).filter(Boolean);
    const numericValues = values.filter((v) => /^[\d.,\s]+$/.test(v));
    const parsed = numericValues.map((v) => Number.parseFloat(v.replace(',', '.')));
    return {
      i: c,
      numericRatio: values.length ? numericValues.length / values.length : 0,
      avg: parsed.length ? parsed.reduce((a, b) => a + b, 0) / parsed.length : 0,
      hasText: values.some((v) => /[a-zA-ZğüşıöçĞÜŞİÖÇ]/.test(v)),
      values,
    };
  });
  const numericCols = stats.filter((s) => s.numericRatio >= 0.6).sort((a, b) => b.avg - a.avg);
  if (numericCols[0]) roles[numericCols[0].i] = 'unit_price';
  if (numericCols[1]) roles[numericCols[1].i] = 'weight_kg';

  let period = false;
  let notes = false;
  for (const stat of stats) {
    if (roles[stat.i] !== 'ignore' || !stat.hasText || !stat.values.length) continue;
    const avgLen = stat.values.reduce((s, v) => s + v.length, 0) / stat.values.length;
    if (!period && avgLen < 20) {
      roles[stat.i] = 'delivery_period';
      period = true;
    } else if (!notes) {
      roles[stat.i] = 'notes';
      notes = true;
    }
  }
  return roles;
}

export interface PastedPrice {
  unit_price: number | null;
  weight_kg: number | null;
  delivery_period: string | null;
  notes: string | null;
}

/** One entry per row; a row with text in a numeric column is skipped. */
export function buildPastePrices(rows: string[][], roles: PriceColumnRole[]): PastedPrice[] {
  const priceCol = roles.indexOf('unit_price');
  const weightCol = roles.indexOf('weight_kg');
  const periodCol = roles.indexOf('delivery_period');
  const notesCol = roles.indexOf('notes');
  const num = (v: string) => {
    if (!v) return null;
    const parsed = Number.parseFloat(v.trim().replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return Math.round(parsed * 100) / 100;
  };
  const out: PastedPrice[] = [];
  for (const row of rows) {
    if (!row.some((cell) => cell.trim())) continue;
    const priceRaw = priceCol >= 0 ? (row[priceCol] || '').trim() : '';
    const weightRaw = weightCol >= 0 ? (row[weightCol] || '').trim() : '';
    if (priceCol >= 0 && priceRaw && num(priceRaw) === null) continue;
    if (weightCol >= 0 && weightRaw && num(weightRaw) === null) continue;
    out.push({
      unit_price: priceCol >= 0 ? num(priceRaw) : null,
      weight_kg: weightCol >= 0 ? num(weightRaw) : null,
      delivery_period: periodCol >= 0 ? (row[periodCol] || '').trim() || null : null,
      notes: notesCol >= 0 ? (row[notesCol] || '').trim() || null : null,
    });
  }
  return out;
}

/** A role picked for one column leaves the columns that had it (quantity, and every price role). */
export function setColumnRole<R extends string>(
  roles: R[],
  index: number,
  role: R,
  exclusive: readonly R[],
): R[] {
  if (!exclusive.includes(role)) return roles.map((r, i) => (i === index ? role : r));
  return roles.map((r, i) => (i === index ? role : r === role ? ('ignore' as R) : r));
}

// ── Kalemler: staged additions and pending edits ─────────────────────

/** A row added on the page and not saved yet. */
export interface StagedItem {
  ref: string;
  templateNode: number | null;
  /** null until the catalog title is edited. */
  titleOverride: string | null;
  quantity: number;
  /** Under another staged row. */
  parentRef: string | null;
  /** Under an existing item. */
  parentId: number | null;
  /** The catalog title (or the first custom title). */
  label: string;
  isCustom: boolean;
}

export type ItemEdit = { title_override?: string; quantity?: number; parent?: number | null };

export interface ItemsDraft {
  staged: StagedItem[];
  edits: Record<number, ItemEdit>;
  deletes: number[];
}

export const EMPTY_DRAFT: ItemsDraft = { staged: [], edits: {}, deletes: [] };

export const draftHasChanges = (d: ItemsDraft) =>
  d.staged.length > 0 || Object.keys(d.edits).length > 0 || d.deletes.length > 0;

/** "+2 ~1 −3": new, edited and deleted rows. */
export function draftBadge(d: ItemsDraft): string {
  const parts: string[] = [];
  if (d.staged.length) parts.push(`+${d.staged.length}`);
  const edits = Object.keys(d.edits).length;
  if (edits) parts.push(`~${edits}`);
  if (d.deletes.length) parts.push(`−${d.deletes.length}`);
  return parts.join(' ') || '0';
}

/** The row and every staged row under it, for removal. */
export function stagedSubtree(staged: readonly StagedItem[], ref: string): Set<string> {
  const out = new Set([ref]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const s of staged) {
      if (s.parentRef && out.has(s.parentRef) && !out.has(s.ref)) {
        out.add(s.ref);
        grew = true;
      }
    }
  }
  return out;
}

/**
 * The add-items payload, parents before their children (legacy flattenStaged):
 * each row in the order it was added, its staged children right after it.
 */
export function flattenStaged(staged: readonly StagedItem[]): NewOfferItem[] {
  const out: NewOfferItem[] = [];
  const walk = (item: StagedItem) => {
    const row: NewOfferItem = { _ref: item.ref, quantity: item.quantity };
    if (item.templateNode) row.template_node = item.templateNode;
    if (item.titleOverride) row.title_override = item.titleOverride;
    if (item.parentRef) row.parent_ref = item.parentRef;
    else if (item.parentId) row.parent = item.parentId;
    out.push(row);
    for (const child of staged) if (child.parentRef === item.ref) walk(child);
  };
  for (const item of staged) if (!item.parentRef) walk(item);
  return out;
}

export function editsPayload(d: ItemsDraft): OfferItemUpdate[] {
  const deleted = new Set(d.deletes);
  return Object.entries(d.edits)
    .filter(([id]) => !deleted.has(Number(id)))
    .map(([id, edit]) => ({ id: Number(id), ...edit }));
}

export type KalemNode =
  | { kind: 'existing'; id: number; item: OfferItem; edit: ItemEdit; children: KalemNode[] }
  | { kind: 'staged'; staged: StagedItem; children: KalemNode[] };

/**
 * Saved items rebuilt with their pending parent moves, deletes left out, and
 * the staged rows hung in place (legacy buildKalemlerCombinedTree). Saved
 * siblings keep sequence order, staged rows follow them.
 */
export function buildKalemTree(flat: Record<number, OfferItem>, draft: ItemsDraft): KalemNode[] {
  const deleted = new Set(draft.deletes);
  type Existing = Extract<KalemNode, { kind: 'existing' }> & { parentId: number | null };
  const nodes = new Map<number, Existing>();
  for (const item of Object.values(flat)) {
    if (deleted.has(item.id)) continue;
    const edit = draft.edits[item.id] ?? {};
    const parentId = edit.parent !== undefined ? edit.parent : (item.parent ?? null);
    nodes.set(item.id, { kind: 'existing', id: item.id, item, edit, parentId, children: [] });
  }
  const roots: KalemNode[] = [];
  const existingRoots: Existing[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId === null ? undefined : nodes.get(node.parentId);
    // A parent that is gone (deleted or missing) would hide the row; legacy dropped it too.
    if (node.parentId === null) existingRoots.push(node);
    else if (parent) parent.children.push(node);
  }
  const bySequence = (a: KalemNode, b: KalemNode) =>
    a.kind === 'existing' && b.kind === 'existing' ? compareOfferItems(a.item, b.item) : 0;
  for (const node of nodes.values()) node.children.sort(bySequence);
  existingRoots.sort(bySequence);
  roots.push(...existingRoots);

  const stagedNode = (s: StagedItem): KalemNode => ({
    kind: 'staged',
    staged: s,
    children: draft.staged.filter((c) => c.parentRef === s.ref).map(stagedNode),
  });
  for (const s of draft.staged) {
    if (s.parentRef) continue;
    if (s.parentId) nodes.get(s.parentId)?.children.push(stagedNode(s));
    else roots.push(stagedNode(s));
  }
  return roots;
}

/** Index of the saved tree by id. */
export function flatItemMap(items: readonly OfferItem[]): Record<number, OfferItem> {
  const out: Record<number, OfferItem> = {};
  for (const item of flattenItems(items)) out[item.id] = item;
  return out;
}

/** The effective parent of a saved item, honouring a pending move. */
function effectiveParent(
  id: number,
  flat: Record<number, OfferItem>,
  draft: ItemsDraft,
): number | null {
  const edit = draft.edits[id];
  if (edit && edit.parent !== undefined) return edit.parent;
  return flat[id]?.parent ?? null;
}

/** Moving an item under itself or one of its descendants would make a loop. */
export function wouldCreateCycle(
  itemId: number,
  newParentId: number,
  flat: Record<number, OfferItem>,
  draft: ItemsDraft,
): boolean {
  let cur: number | null = newParentId;
  const seen = new Set<number>();
  while (cur !== null) {
    if (cur === itemId) return true;
    if (seen.has(cur)) break;
    seen.add(cur);
    cur = effectiveParent(cur, flat, draft);
  }
  return false;
}

/** The item and its saved descendants (a delete takes the subtree, its edits dropped). */
export function savedSubtree(item: OfferItem): number[] {
  return flattenItems([item]).map((i) => i.id);
}

// ── Pricing ──────────────────────────────────────────────────────────

export interface PriceEdit {
  unit_price: number | null;
  quantity: number;
  weight_kg: number | null;
  delivery_period: string;
  notes: string;
}

export function seedPriceEdits(items: readonly OfferItem[]): Record<number, PriceEdit> {
  const out: Record<number, PriceEdit> = {};
  for (const item of flattenItems(items)) {
    out[item.id] = {
      unit_price: parseNum(item.unit_price),
      quantity: Number.parseInt(String(item.quantity ?? ''), 10) || 1,
      weight_kg: parseNum(item.weight_kg),
      delivery_period: item.delivery_period || '',
      notes: item.notes || '',
    };
  }
  return out;
}

/** flat: only root items take a price; leaf: only items without children. */
export function isPriceEditable(item: OfferItem, mode: PricingMode): boolean {
  if (mode === 'flat') return item.parent === null || item.parent === undefined;
  return !item.children?.length;
}

/** In leaf mode a parent sums its children; otherwise unit price × quantity. */
export function itemSubtotal(
  item: OfferItem,
  mode: PricingMode,
  edits: Record<number, PriceEdit>,
): number | null {
  const edit = edits[item.id];
  if (!edit) return null;
  if (mode === 'leaf' && item.children?.length) {
    let sum = 0;
    let any = false;
    for (const child of item.children) {
      const s = itemSubtotal(child, mode, edits);
      if (s !== null) {
        sum += s;
        any = true;
      }
    }
    return any ? sum : null;
  }
  return edit.unit_price !== null ? edit.unit_price * (edit.quantity || 1) : null;
}

export function itemWeightTotal(
  item: OfferItem,
  mode: PricingMode,
  edits: Record<number, PriceEdit>,
): number | null {
  const edit = edits[item.id];
  if (!edit) return null;
  if (mode === 'leaf' && item.children?.length) {
    let sum = 0;
    let any = false;
    for (const child of item.children) {
      const w = itemWeightTotal(child, mode, edits);
      if (w !== null) {
        sum += w;
        any = true;
      }
    }
    return any ? sum : null;
  }
  return edit.weight_kg !== null ? edit.weight_kg * (edit.quantity || 1) : null;
}

export function pricingTotals(
  items: readonly OfferItem[],
  mode: PricingMode,
  edits: Record<number, PriceEdit>,
  shipping: number,
) {
  let itemsTotal = 0;
  let weight = 0;
  for (const root of items) {
    itemsTotal += itemSubtotal(root, mode, edits) ?? 0;
    weight += itemWeightTotal(root, mode, edits) ?? 0;
  }
  return {
    itemsTotal,
    weight,
    avgKg: weight > 0 ? itemsTotal / weight : null,
    shipping,
    grand: itemsTotal + shipping,
  };
}

/** The rows a pasted price table fills, top to bottom. */
export function priceEditableItems(items: readonly OfferItem[], mode: PricingMode): OfferItem[] {
  return flattenItems(items).filter((item) => isPriceEditable(item, mode));
}

/** Mode-aware: the other mode's prices and weights are cleared explicitly. */
export function setPricesPayload(
  items: readonly OfferItem[],
  mode: PricingMode,
  edits: Record<number, PriceEdit>,
  shipping: number,
) {
  const flat = flatItemMap(items);
  return {
    pricing_mode: mode,
    shipping_price: shipping,
    items: Object.entries(edits).map(([id, edit]) => {
      const item = flat[Number(id)];
      const editable = item ? isPriceEditable(item, mode) : true;
      return {
        id: Number(id),
        unit_price: editable ? edit.unit_price : null,
        quantity: edit.quantity,
        notes: edit.notes || '',
        weight_kg: editable ? edit.weight_kg : null,
        delivery_period: edit.delivery_period,
      };
    }),
  };
}

// ── Approval ─────────────────────────────────────────────────────────

interface Rollup {
  priceTotal: number | null;
  weightTotal: number | null;
  leavesPriceTotal: number | null;
  leavesWeightTotal: number | null;
}

function rollup(node: OfferItem): Rollup {
  const qty = node.quantity != null ? Number.parseInt(String(node.quantity), 10) : 1;
  const unitWeight = parseNum(node.weight_kg);
  const selfWeight = unitWeight !== null ? unitWeight * (qty || 1) : null;
  const selfSubtotal = parseNum(node.subtotal);
  if (!node.children?.length) {
    return {
      priceTotal: selfSubtotal,
      weightTotal: selfWeight,
      leavesPriceTotal: selfSubtotal,
      leavesWeightTotal: selfWeight,
    };
  }
  let priceTotal = selfSubtotal;
  let weightTotal = selfWeight;
  let leavesPrice = 0;
  let leavesWeight = 0;
  let anyPrice = false;
  let anyWeight = false;
  for (const child of node.children) {
    const r = rollup(child);
    if (r.priceTotal !== null) priceTotal = (priceTotal ?? 0) + r.priceTotal;
    if (r.weightTotal !== null) weightTotal = (weightTotal ?? 0) + r.weightTotal;
    if (r.leavesPriceTotal !== null) {
      leavesPrice += r.leavesPriceTotal;
      anyPrice = true;
    }
    if (r.leavesWeightTotal !== null) {
      leavesWeight += r.leavesWeightTotal;
      anyWeight = true;
    }
  }
  return {
    priceTotal,
    weightTotal,
    leavesPriceTotal: anyPrice ? leavesPrice : null,
    leavesWeightTotal: anyWeight ? leavesWeight : null,
  };
}

export interface ApprovalItemRow {
  key: string;
  depth: number;
  title: string;
  quantity: number;
  unitPrice: number | null;
  weight: number | null;
  kgPrice: number | null;
  subtotal: number | null;
}

/**
 * The approval tab's item table (legacy renderApprovalItemsTable). In leaf
 * mode a parent shows the leaf totals: unit price per its own quantity,
 * total weight, and kg price from the leaves.
 */
export function approvalItemRows(items: readonly OfferItem[], mode: string): ApprovalItemRow[] {
  const rows: ApprovalItemRow[] = [];
  const walk = (nodes: readonly OfferItem[], depth: number) => {
    for (const node of nodes) {
      const qty = node.quantity != null ? Number.parseInt(String(node.quantity), 10) : 1;
      const unitPrice = parseNum(node.unit_price);
      const weightKg = parseNum(node.weight_kg);
      const subtotal =
        parseNum(node.subtotal) ?? (unitPrice !== null ? unitPrice * (qty || 1) : null);
      const parentLeaf = mode === 'leaf' && Boolean(node.children?.length);
      const r = parentLeaf ? rollup(node) : null;
      const lineWeight = parentLeaf
        ? (r?.weightTotal ?? null)
        : weightKg !== null
          ? weightKg * (qty || 1)
          : null;
      rows.push({
        key: String(node.id),
        depth,
        title: itemTitle(node),
        quantity: qty || 1,
        unitPrice: parentLeaf
          ? r?.leavesPriceTotal != null && (qty || 0) > 0
            ? r.leavesPriceTotal / qty
            : null
          : unitPrice,
        weight: parentLeaf ? lineWeight : weightKg,
        kgPrice: parentLeaf
          ? r?.leavesPriceTotal != null && r.leavesWeightTotal != null && r.leavesWeightTotal > 0
            ? r.leavesPriceTotal / r.leavesWeightTotal
            : null
          : subtotal !== null && lineWeight !== null && lineWeight > 0
            ? subtotal / lineWeight
            : null,
        subtotal,
      });
      if (node.children?.length) walk(node.children, depth + 1);
    }
  };
  walk(items, 0);
  return rows;
}

export function personName(user: ApprovalUser | null | undefined): string {
  if (!user) return '';
  return (
    user.full_name ||
    [user.first_name, user.last_name].filter(Boolean).join(' ') ||
    user.username ||
    ''
  );
}

export interface WorkflowRow {
  key: string;
  created_at: string | null;
  round: number | null;
  status: { label: string; family: 'grey' | 'red' | 'green' | 'yellow' };
  stage: string;
  required: number | null;
  approved: number | null;
  approvers: string;
  amount: string | number | null;
  currency: string;
  lastDecision: { label: string; family: 'green' | 'red' } | null;
  lastDecisionBy: string;
  lastDecisionAt: string | null;
  comment: string;
}

/** The "Onay Geçmişi" table: one row per workflow, newest first. */
export function workflowRows(
  workflows: readonly ApprovalWorkflow[],
  currency: string,
): WorkflowRow[] {
  return workflows
    .slice()
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    .map((wf, idx) => {
      const stages = wf.stage_instances ?? [];
      const current = stages.find((s) => s.order === wf.current_stage_order) ?? null;
      let latest: (ApprovalDecision & { t: number }) | null = null;
      for (const stage of stages) {
        for (const d of stage.decisions ?? []) {
          const t = d.decided_at ? Date.parse(d.decided_at) : Number.NaN;
          if (!Number.isFinite(t)) continue;
          if (!latest || t > latest.t) latest = { ...d, t };
        }
      }
      return {
        key: `${wf.created_at ?? ''}-${idx}`,
        created_at: wf.created_at ?? null,
        round: wf.snapshot?.round ?? null,
        status: wf.is_cancelled
          ? { label: 'İptal', family: 'grey' }
          : wf.is_rejected
            ? { label: 'Reddedildi', family: 'red' }
            : wf.is_complete
              ? { label: 'Tamamlandı', family: 'green' }
              : { label: 'Devam Ediyor', family: 'yellow' },
        stage: current?.name || '-',
        required: current?.required_approvals ?? null,
        approved: current?.approved_count ?? null,
        approvers: (current?.approvers ?? []).map(personName).filter(Boolean).join(', '),
        amount: wf.snapshot?.amount ?? null,
        currency: wf.snapshot?.currency ?? currency,
        lastDecision:
          latest?.decision === 'approve'
            ? { label: 'Onay', family: 'green' }
            : latest?.decision === 'reject'
              ? { label: 'Red', family: 'red' }
              : null,
        lastDecisionBy:
          personName(latest?.approver_detail) || (latest?.approver ? `#${latest.approver}` : '-'),
        lastDecisionAt: latest?.decided_at ?? null,
        comment: latest?.comment || '',
      };
    });
}

/** Customer fields a job order needs (legacy getMissingCustomerFieldsForConversion). */
export function missingCustomerFields(
  detail: Record<string, unknown> | null | undefined,
): string[] {
  const fields = [
    { key: 'phone', label: 'Telefon' },
    { key: 'address', label: 'Adres' },
    { key: 'tax_id', label: 'Vergi Numarası' },
    { key: 'tax_office', label: 'Vergi Dairesi' },
  ];
  if (!detail) return fields.map((f) => f.label);
  return fields
    .filter((f) => !detail[f.key] || String(detail[f.key]).trim() === '')
    .map((f) => f.label);
}

/** Legacy toDateInputValue: an API date as YYYY-MM-DD. */
export function toDateInput(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }
  if (typeof value === 'number' || value instanceof Date) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }
  return '';
}

/** "12 Mar 2026" as the legacy page showed dates. */
export function shortDate(value: string | null | undefined): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('tr-TR', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function shortDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('tr-TR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

import type { JobStockCard } from '@/api/materialTracking/pullRequests';
import type { PlanningItem } from '@/api/planning/planningItems';
import type { MaterialPiece } from '@/api/warehouse/pieces';
import { barMetres, formatDate } from '@/lib/format';
import { fmtQty, isPartiallyDelivered, qty } from './deliveryState';

// Malzeme Takibi works on one job's İş Emri stock (2026-11-23): its stock cards
// (balances) and its bar / plate lots, less what pending İmalata Çıkış
// Talepleri already hold. The workshop asks for what is left.

export type JobStockKind = 'card' | 'bar' | 'plate';

/** One card of the job's İş Emri stock. */
export interface JobStockRow {
  key: string;
  kind: JobStockKind;
  item: number;
  item_code: string;
  item_name: string;
  item_unit: string;
  /** Cards: in the card's unit. Bars and plates: pieces (boy / levha). */
  onHand: number;
  held: number;
  available: number;
  /** Bars and plates: the lots, longest first. */
  lots: MaterialPiece[];
}

const free = (lot: MaterialPiece) => lot.available_quantity ?? lot.quantity;

/** The cards first by code; a card's lots longest first. */
export function jobStockRows(cards: JobStockCard[], lots: MaterialPiece[]): JobStockRow[] {
  const rows: JobStockRow[] = cards.map((card) => ({
    key: `card-${card.item}`,
    kind: 'card',
    item: card.item,
    item_code: card.item_code,
    item_name: card.item_name,
    item_unit: card.item_unit,
    onHand: qty(card.on_hand),
    held: qty(card.held),
    available: qty(card.available),
    lots: [],
  }));
  const byCard = new Map<number, JobStockRow>();
  for (const lot of lots) {
    const kind: JobStockKind = lot.kind === 'plate' ? 'plate' : 'bar';
    let row = byCard.get(lot.item);
    if (!row) {
      row = {
        key: `${kind}-${lot.item}`,
        kind,
        item: lot.item,
        item_code: lot.item_code,
        item_name: lot.item_name,
        item_unit: lot.item_unit,
        onHand: 0,
        held: 0,
        available: 0,
        lots: [],
      };
      byCard.set(lot.item, row);
      rows.push(row);
    }
    row.lots.push(lot);
    row.onHand += lot.quantity;
    row.available += free(lot);
    row.held += lot.quantity - free(lot);
  }
  for (const row of byCard.values()) {
    row.lots.sort((a, b) => Number(b.length_mm) - Number(a.length_mm) || a.id - b.id);
  }
  return rows.sort((a, b) => a.item_code.localeCompare(b.item_code, 'tr'));
}

/** Bars and plates can be asked for; plate goes to CNC cutting instead. */
export function canRequest(row: JobStockRow): boolean {
  return row.kind !== 'plate' && row.available > 0;
}

/**
 * A row's lots of one size (and heat no): one card on one job, so lots of the
 * same length are the same bars to the workshop, however many lots they came in.
 */
export interface LotGroup {
  key: string;
  width_mm: string | null;
  length_mm: string;
  heat_number: string;
  /** The row's order: longest first, then oldest lot. */
  lots: MaterialPiece[];
  quantity: number;
  free: number;
}

export function lotGroups(lots: MaterialPiece[]): LotGroup[] {
  const groups = new Map<string, LotGroup>();
  for (const lot of lots) {
    const heat = (lot.heat_number ?? '').trim();
    const key = `${Number(lot.width_mm ?? 0)}x${Number(lot.length_mm)}|${heat}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        width_mm: lot.width_mm ?? null,
        length_mm: lot.length_mm,
        heat_number: heat,
        lots: [],
        quantity: 0,
        free: 0,
      };
      groups.set(key, group);
    }
    group.lots.push(lot);
    group.quantity += lot.quantity;
    group.free += free(lot);
  }
  return [...groups.values()];
}

/** `count` bars of a group as picks per lot, filling its lots in order. */
export function spreadPick(group: LotGroup, count: number): Record<string, number> {
  let left = Math.max(0, Math.trunc(count));
  const out: Record<string, number> = {};
  for (const lot of group.lots) {
    const take = Math.min(left, free(lot));
    out[String(lot.id)] = take;
    left -= take;
  }
  return out;
}

/** "12 m × 4 · 6,4 m × 2" (free bars per length); a plate lot by its size. */
export function lotsText(row: JobStockRow): string {
  return lotGroups(row.lots)
    .map((group) =>
      row.kind === 'plate'
        ? `${fmtQty(group.width_mm)}×${fmtQty(group.length_mm)} × ${group.quantity}`
        : `${barMetres(group.length_mm)} × ${group.free}`,
    )
    .join(' · ');
}

const pieceWord = (row: JobStockRow) => (row.kind === 'plate' ? 'levha' : 'boy');

/** On hand, in the card's unit or in pieces. */
export function amountText(row: JobStockRow, value: number): string {
  return `${fmtQty(value)} ${row.kind === 'card' ? row.item_unit || '' : pieceWord(row)}`.trim();
}

// ---- planning lines of the job that have not arrived -----------------------

export type ArrivalTone = 'blue' | 'orange' | 'red' | 'grey' | 'purple';

/**
 * Where a not (fully) delivered planning line stands: received in part,
 * ordered (expected on a date, late when past it), at purchasing, or not
 * ordered yet. Plate lines are cut on CNC once they come.
 */
export function arrivalState(
  row: PlanningItem,
  today: string = new Date().toISOString().slice(0, 10),
): { text: string; tone: ArrivalTone } {
  const unit = row.item_unit || '';
  const parts: string[] = [];
  const p = row.procurement;
  let tone: ArrivalTone = 'grey';
  if (p?.po_id) {
    const due = p.po_expected_delivery;
    const late = Boolean(due && due < today);
    parts.push(
      `Sipariş verildi${p.po_supplier_name ? ` · ${p.po_supplier_name}` : ''}` +
        (due ? ` · ${late ? 'gecikti, ' : ''}${formatDate(due)} bekleniyor` : ''),
    );
    tone = late ? 'red' : 'blue';
  } else if (p?.pr_number) {
    parts.push(
      `Satın almada · ${p.pr_number}${p.pr_status_label ? ` (${p.pr_status_label})` : ''}`,
    );
    tone = 'purple';
  } else if (qty(row.quantity_to_purchase) <= 0 && qty(row.quantity_from_inventory) > 0) {
    parts.push('Stoktan karşılanacak');
  } else {
    parts.push('Sipariş verilmedi');
  }
  if (isPartiallyDelivered(row)) {
    parts.unshift(
      `Kısmi ${fmtQty(row.delivered_quantity)} / ${fmtQty(row.quantity)} ${unit}`.trim(),
    );
    if (tone === 'grey' || tone === 'purple') tone = 'orange';
  }
  return { text: parts.join(' · '), tone };
}

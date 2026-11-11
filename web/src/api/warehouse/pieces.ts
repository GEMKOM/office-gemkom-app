import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { extractResults, toPaginated } from '../types';

// Sac & boy stoğu (backend /warehouse/pieces/): plate and boy (profile, pipe,
// bar) material held as pieces of a stock card. Each lot is pieces of one
// size at one place: Hammadde, İş Emri on a job, Mamul, or at a supplier
// (Fasonda: held there, not consumed). Weights come from the backend; a card
// without thickness (plate) or kg/m (boy) gives no weight, never 0.

export type PieceKind = 'plate' | 'boy';

export interface MaterialPiece {
  id: number;
  item: number;
  item_code: string;
  item_name: string;
  item_unit: string;
  item_is_active: boolean;
  category_code: string | null;
  kind: PieceKind | null;
  width_mm: string | null;
  length_mm: string;
  quantity: number;
  unit_kg: string | null;
  total_kg: string | null;
  heat_number: string;
  certificate_no: string;
  warehouse: number | null;
  warehouse_code: string | null;
  warehouse_name: string | null;
  job_no: string;
  supplier: number | null;
  supplier_name: string | null;
  origin: string;
  origin_label: string;
  parent: number | null;
  needs_review: boolean;
  review_note: string;
  note: string;
  created_by_username: string | null;
  created_at: string;
  updated_at: string;
}

export interface PieceMovement {
  id: number;
  piece: number;
  movement_type: string;
  movement_type_label: string;
  quantity: number;
  unit_kg: string | null;
  from_warehouse_code: string | null;
  from_job_no: string;
  from_supplier: number | null;
  from_supplier_name: string | null;
  to_warehouse_code: string | null;
  to_job_no: string;
  to_supplier: number | null;
  to_supplier_name: string | null;
  related_piece: number | null;
  note: string;
  created_by_username: string | null;
  created_at: string;
}

/** A plate / boy card with what it holds in pieces (GET /warehouse/pieces/cards/). */
export interface PieceCard {
  id: number;
  code: string;
  name: string;
  unit: string;
  is_active: boolean;
  category_code: string;
  category_name: string;
  kind: PieceKind;
  plate_thickness_mm: string | null;
  kg_per_m: string | null;
  density_g_cm3: string;
  /** What the card still needs for its pieces to weigh something; '' if nothing. */
  missing: string;
  pieces: number;
  lots: number;
  /** null when the card's pieces have no weight. */
  kg: string | null;
}

export interface PiecesParams {
  page?: number;
  page_size?: number;
  search?: string;
  kind?: PieceKind | '';
  warehouse?: string;
  at_supplier?: 'true';
  item?: number;
  job_no?: string;
  origin?: string;
  include_empty?: 'true';
  ordering?: string;
}

export interface PieceCardsParams {
  page?: number;
  page_size?: number;
  search?: string;
  kind?: PieceKind | '';
  in_stock?: 'true';
}

/** Where pieces go: a warehouse (+ job in İş Emri), or a supplier. */
export interface PiecePlace {
  warehouse_code?: string;
  job_no?: string;
  supplier?: number | null;
}

export interface PieceInput extends PiecePlace {
  item: number;
  quantity: number;
  width_mm?: string | null;
  length_mm: string;
  heat_number?: string;
  certificate_no?: string;
  note?: string;
}

export interface WeightPreview {
  unit_kg: string | null;
  total_kg: string | null;
  density_g_cm3: string;
  plate_thickness_mm: string | null;
  kg_per_m: string | null;
  missing: string;
}

const BASE = '/warehouse/pieces/';

export const pieceKeys = {
  all: ['pieces'] as const,
  list: (params: PiecesParams) => ['pieces', 'list', params] as const,
  cards: (params: PieceCardsParams) => ['pieces', 'cards', params] as const,
  movements: (id: number) => ['pieces', 'movements', id] as const,
  cardSearch: ['pieces', 'card-search'] as const,
  supplierSearch: ['pieces', 'supplier-search'] as const,
};

export function piecesQueryOptions(params: PiecesParams) {
  return queryOptions({
    queryKey: pieceKeys.list(params),
    queryFn: ({ signal }) =>
      apiFetch<unknown>(BASE, { params: { ...params }, signal }).then((data) =>
        toPaginated<MaterialPiece>(data),
      ),
  });
}

export function pieceCardsQueryOptions(params: PieceCardsParams) {
  return queryOptions({
    queryKey: pieceKeys.cards(params),
    queryFn: ({ signal }) =>
      apiFetch<unknown>(`${BASE}cards/`, { params: { ...params }, signal }).then((data) =>
        toPaginated<PieceCard>(data),
      ),
  });
}

export function pieceMovementsQueryOptions(id: number) {
  return queryOptions({
    queryKey: pieceKeys.movements(id),
    queryFn: ({ signal }) => apiFetch<PieceMovement[]>(`${BASE}${id}/movements/`, { signal }),
  });
}

export function createPieces(data: PieceInput | PieceInput[]) {
  return apiFetch<MaterialPiece | MaterialPiece[]>(BASE, { method: 'POST', body: data });
}

export function movePieces(id: number, data: PiecePlace & { quantity: number; note?: string }) {
  return apiFetch<MaterialPiece>(`${BASE}${id}/move/`, { method: 'POST', body: data });
}

export function adjustPieces(id: number, data: { quantity: number; note: string }) {
  return apiFetch<MaterialPiece>(`${BASE}${id}/adjust/`, { method: 'POST', body: data });
}

export function scrapPieces(id: number, data: { quantity: number; note?: string }) {
  return apiFetch<MaterialPiece>(`${BASE}${id}/scrap/`, { method: 'POST', body: data });
}

export function previewWeight(data: {
  item: number;
  width_mm?: string | null;
  length_mm: string;
  quantity?: number;
}) {
  return apiFetch<WeightPreview>(`${BASE}weight-preview/`, { method: 'POST', body: data });
}

// --- pickers -----------------------------------------------------------------------

const seenCards = new Map<string, PieceCard>();

/** A card the piece-card search returned earlier (value = its id as text). */
export function pieceCardFromSearch(value: string): PieceCard | undefined {
  return seenCards.get(value);
}

/** Plate / boy cards for the piece entry, inactive ones too. */
export async function searchPieceCards(term: string, signal?: AbortSignal) {
  const rows = extractResults<PieceCard>(
    await apiFetch<unknown>(`${BASE}cards/`, { params: { search: term, page_size: 30 }, signal }),
  );
  return rows.map((card) => {
    seenCards.set(String(card.id), card);
    return { value: String(card.id), label: `${card.code} — ${card.name}` };
  });
}

/** Suppliers for "Fasona gönder" (value = id as text). */
export async function searchSuppliers(term: string, signal?: AbortSignal) {
  const rows = extractResults<{ id: number; name?: string; code?: string }>(
    await apiFetch<unknown>('/procurement/suppliers/', {
      params: { search: term, page_size: 20 },
      signal,
    }),
  );
  return rows.map((s) => ({ value: String(s.id), label: s.name || s.code || `#${s.id}` }));
}

// --- labels ------------------------------------------------------------------------

export const KIND_LABELS: Record<PieceKind, string> = { plate: 'Sac', boy: 'Boy' };

const PLACE_NAMES: Record<string, string> = {
  HAMMADDE: 'Hammadde',
  IS_EMRI: 'İş Emri',
  MAMUL: 'Mamul',
};

/** "Hammadde", "İş Emri · 254-01", "İş Emri · atanmamış", "Fasonda · Galvaniz A.Ş." */
export function placeLabel(p: {
  warehouse_code: string | null;
  job_no: string;
  supplier_name: string | null;
}): string {
  if (!p.warehouse_code) {
    const job = p.job_no ? ` (${p.job_no})` : '';
    return `Fasonda · ${p.supplier_name ?? '?'}${job}`;
  }
  const name = PLACE_NAMES[p.warehouse_code] ?? p.warehouse_code;
  if (p.warehouse_code !== 'IS_EMRI') return name;
  return `${name} · ${p.job_no || 'atanmamış'}`;
}

/** Why a piece of this kind has no weight (the card is missing it). */
export function missingWeightText(kind: PieceKind | null): string {
  return kind === 'boy' ? 'Kartta metre ağırlığı (kg/m) yok' : 'Kartta sac kalınlığı yok';
}

/** "1500 × 3000 mm" for a plate, "6000 mm" for a bar. */
export function sizeLabel(p: { width_mm: string | null; length_mm: string }): string {
  const n = (v: string) => String(Number(v));
  return p.width_mm ? `${n(p.width_mm)} × ${n(p.length_mm)} mm` : `${n(p.length_mm)} mm`;
}

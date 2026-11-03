import type {
  CurrencyRates,
  ProcurementPlanningItem,
  PurchaseRequestDraft,
} from '@/api/procurement/purchaseRequests';
import type { ComparisonData, ComparisonOffer } from '../shared/comparison';

// The create page's state and everything computed from it, as pure
// functions (legacy create.js, dataManager.js, itemsManager.js,
// suppliersManager.js, validationManager.js).
//
// Legacy kept offers and recommendations keyed by row position and
// reindexed them by hand; here they are keyed by the item's local id. The
// payloads and drafts still carry the legacy index-keyed shapes
// (`original_offers` by row, `offers` by grouped item) so drafts saved by
// either version load in the other.

export interface Allocation {
  job_no: string;
  quantity: string;
}

export interface PrItem {
  id: string;
  code: string;
  name: string;
  job_no: string;
  quantity: number;
  unit: string;
  /** Duplicate of specifications (legacy backward compatibility). */
  specs: string;
  specifications: string;
  item_description: string;
  source_planning_request_item_id?: number | null;
  source_planning_request_item_ids?: number[] | null;
  file_asset_ids?: number[];
  /** Merged rows: one line per job number. */
  allocations?: Allocation[];
}

export interface PrSupplier {
  /** Local `supplier_<ts>_<rand>`; offers and recommendations point to it. */
  id: string;
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  default_currency: string;
  default_payment_terms: string | number;
  default_tax_rate: number;
  status?: string | null;
  rating_score?: number | string | null;
  rating_count?: number | null;
}

export interface PrOffer {
  unitPrice: number;
  totalPrice: number;
  deliveryDays: number;
  notes: string;
}

export interface SavedDraftRef {
  id: number;
  title?: string | null;
}

export interface PrState {
  title: string;
  description: string;
  priority: string;
  needed_date: string;
  items: PrItem[];
  suppliers: PrSupplier[];
  /** supplierId → itemId → offer */
  offers: Record<string, Record<string, PrOffer>>;
  /** itemId → supplierId (null: cleared) */
  recommendations: Record<string, string | null | undefined>;
  planning_request_item_ids: number[];
  /** The named server draft being edited (Taslak Kaydet offers to overwrite it). */
  savedDraft: SavedDraftRef | null;
}

export { UNIT_CHOICES } from '@/api/procurement/items';

/** apis/constants.js ITEM_CODE_NAMES: codes whose name is their description. */
export const ITEM_CODE_NAMES: Record<string, string> = {
  '730.06.004': 'FABRİKA BAKIM ONARIM GİDERLERİ',
  '730.06.005': 'FABRİKA MAKİNE BAKIM ONARIM GİDERİ',
  '730.10.004': 'MAKİNA KİRALAMA GİDERİ',
};

export const PRIORITY_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'urgent', label: 'Acil' },
  { value: 'critical', label: 'Kritik' },
];

export const CURRENCY_OPTIONS = [
  { value: 'TRY', label: 'Türk Lirası (₺)' },
  { value: 'USD', label: 'Amerikan Doları ($)' },
  { value: 'EUR', label: 'Euro (€)' },
  { value: 'GBP', label: 'İngiliz Sterlini (£)' },
];

const rand = () => Math.random().toString(36).slice(2, 11);
export const newItemId = () => `item_${Date.now()}_${rand()}`;
export const newSupplierId = () => `supplier_${Date.now()}_${rand()}`;

/**
 * Today as YYYY-MM-DD in local time. Legacy used toISOString() (UTC), which
 * in Turkey gave yesterday between 00:00 and 03:00.
 */
export function today(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export function emptyState(): PrState {
  return {
    title: '',
    description: '',
    priority: 'normal',
    needed_date: today(),
    items: [],
    suppliers: [],
    offers: {},
    recommendations: {},
    planning_request_item_ids: [],
    savedDraft: null,
  };
}

const hasOfferValue = (o: PrOffer | undefined): o is PrOffer => !!o && o.totalPrice > 0;

// ------------------------------------------------------------- planning links

/** syncPlanningRequestItemIds: every linked planning item, deduplicated. */
export function planningIds(items: readonly PrItem[]): number[] {
  const ids = new Set<number>();
  for (const item of items) {
    const legacy = item as PrItem & { planning_request_item_id?: number; planning_request_item_ids?: number[] };
    for (const id of [
      item.source_planning_request_item_id,
      legacy.planning_request_item_id,
      ...(item.source_planning_request_item_ids ?? []),
      ...(legacy.planning_request_item_ids ?? []),
    ]) {
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

/** Items changed: re-derive the planning ids (legacy called sync after each change). */
export function withItems(state: PrState, items: PrItem[]): PrState {
  return { ...state, items, planning_request_item_ids: planningIds(items) };
}

// ------------------------------------------------------------- item edits

export type EditableField =
  | 'code'
  | 'name'
  | 'job_no'
  | 'quantity'
  | 'unit'
  | 'item_description'
  | 'specifications';

/** Inline edit validation (validateFieldValue); false → "Geçersiz değer". */
export function isValidFieldValue(item: PrItem, field: EditableField, value: unknown): boolean {
  const text = value === null || value === undefined ? '' : String(value);
  switch (field) {
    case 'code':
    case 'name':
    case 'unit':
      return text.trim() !== '';
    case 'job_no':
      return (item.allocations?.length ?? 0) > 0 || text.trim() !== '';
    case 'quantity': {
      const n = typeof value === 'number' ? value : parseFloat(text);
      if (!(n > 0)) return false;
      return item.unit !== 'adet' || Number.isInteger(n);
    }
    default:
      return true;
  }
}

/** Applies an inline edit; a quantity change recomputes the item's offer totals. */
export function editItem(state: PrState, itemId: string, field: EditableField, value: unknown): PrState {
  const items = state.items.map((item) => {
    if (item.id !== itemId) return item;
    if (field === 'quantity') return { ...item, quantity: Number(value) || 0 };
    if (field === 'specifications') {
      const text = String(value ?? '');
      return { ...item, specifications: text, specs: text };
    }
    return { ...item, [field]: String(value ?? '') };
  });
  let offers = state.offers;
  if (field === 'quantity') {
    const quantity = Number(value) || 0;
    offers = Object.fromEntries(
      Object.entries(state.offers).map(([sid, byItem]) => {
        const offer = byItem[itemId];
        if (!offer || !offer.unitPrice) return [sid, byItem];
        return [sid, { ...byItem, [itemId]: { ...offer, totalPrice: offer.unitPrice * quantity } }];
      }),
    );
  }
  return { ...withItems(state, items), offers };
}

function withoutKeys<T>(record: Record<string, T>, keys: ReadonlySet<string>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => !keys.has(k)));
}

/** Delete one row with its offers and recommendation. */
export function removeItems(state: PrState, itemIds: ReadonlySet<string>): PrState {
  const offers = Object.fromEntries(
    Object.entries(state.offers).map(([sid, byItem]) => [sid, withoutKeys(byItem, itemIds)]),
  );
  return {
    ...withItems(
      state,
      state.items.filter((i) => !itemIds.has(i.id)),
    ),
    offers,
    recommendations: withoutKeys(state.recommendations, itemIds),
  };
}

export function clearItems(state: PrState): PrState {
  return { ...withItems(state, []), offers: {}, recommendations: {} };
}

export interface ItemDraft {
  code: string;
  name: string;
  job_no: string;
  quantity: number;
  unit: string;
  item_description: string;
  specifications: string;
}

/** Malzeme Ekle modal validation (saveItem). */
export function validateNewItem(draft: ItemDraft): string[] {
  const errors: string[] = [];
  if (!draft.code.trim()) errors.push('Malzeme kodu zorunludur');
  if (!draft.name.trim()) errors.push('Malzeme adı zorunludur');
  if (!draft.job_no.trim()) errors.push('İş numarası zorunludur');
  if (!(draft.quantity > 0)) errors.push("Miktar zorunludur ve 0'dan büyük olmalıdır");
  if (draft.unit === 'adet' && !Number.isInteger(draft.quantity)) {
    errors.push("'Adet' birimi için miktar tam sayı olmalıdır");
  }
  return errors;
}

export function itemFromDraft(draft: ItemDraft): PrItem {
  const specifications = draft.specifications.trim();
  return {
    id: newItemId(),
    code: draft.code.trim(),
    name: draft.name.trim(),
    job_no: draft.job_no.trim(),
    quantity: draft.quantity,
    unit: draft.unit,
    specs: specifications,
    specifications,
    item_description: draft.item_description.trim(),
  };
}

/** Rows from the planning modal (addSelectedPlanningItems). */
export function itemFromPlanning(planning: ProcurementPlanningItem, quantity: number): PrItem {
  const code = planning.item_code || '';
  return {
    id: newItemId(),
    code,
    name: Object.hasOwn(ITEM_CODE_NAMES, code) ? planning.item_description || '' : planning.item_name || '',
    job_no: planning.job_no || '',
    quantity,
    unit: planning.item_unit || 'adet',
    specs: planning.specifications || '',
    item_description: planning.item_description || '',
    specifications: planning.specifications || '',
    source_planning_request_item_id: planning.id,
    file_asset_ids: (planning.files ?? []).filter((f) => f.asset_id).map((f) => f.asset_id as number),
  };
}

/**
 * Whether a planning item is already on the page. Legacy checked only the
 * single link, so a planning item merged into another row could be added twice.
 */
export function isPlanningItemOnPage(items: readonly PrItem[], planningId: number): boolean {
  return items.some(
    (i) =>
      i.source_planning_request_item_id === planningId ||
      (i.source_planning_request_item_ids ?? []).includes(planningId),
  );
}

// ------------------------------------------------------------- merge

export interface MergeGroup {
  code: string;
  items: PrItem[];
  sameName: boolean;
  sameUnit: boolean;
  /** Same job number and specs: nothing to merge into allocations. */
  cannotMerge: boolean;
  distinctSpecs: string[];
}

const norm = (v: string | undefined | null) => (v ?? '').trim().toLowerCase();

/** mergeDuplicateItems: rows grouped by code (case-insensitive), groups of 2+. */
export function mergeGroups(items: readonly PrItem[]): MergeGroup[] {
  const groups = new Map<string, PrItem[]>();
  for (const item of items) {
    const key = norm(item.code);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => {
      const first = g[0]!;
      const sameName = g.every((i) => norm(i.name) === norm(first.name));
      const sameUnit = g.every((i) => norm(i.unit) === norm(first.unit));
      const sameJobNo = g.every((i) => norm(i.job_no) === norm(first.job_no));
      const sameSpecs = g.every((i) => (i.specs ?? '').trim() === (first.specs ?? '').trim());
      const distinctSpecs = [...new Set(g.map((i) => (i.specs ?? '').trim()).filter(Boolean))];
      return {
        code: first.code,
        items: g,
        sameName,
        sameUnit,
        cannotMerge: sameJobNo && sameSpecs,
        distinctSpecs,
      };
    });
}

/** "10 adet (254-01), 5 adet (254-02)": quantity per job number. */
export function jobTotals(items: readonly PrItem[]): { job_no: string; quantity: number }[] {
  const totals = new Map<string, number>();
  for (const item of items) {
    if (item.allocations?.length) {
      for (const a of item.allocations) totals.set(a.job_no, (totals.get(a.job_no) ?? 0) + parseFloat(a.quantity));
    } else {
      totals.set(item.job_no, (totals.get(item.job_no) ?? 0) + item.quantity);
    }
  }
  return [...totals].map(([job_no, quantity]) => ({ job_no, quantity }));
}

const mergeSpecs = (items: readonly PrItem[]) =>
  [...new Set(items.map((i) => (i.specs || i.specifications || '').trim()).filter(Boolean))].join(' | ');

export type MergeOutcome =
  | { kind: 'merged'; item: PrItem; sources: PrItem[] }
  | { kind: 'different'; message: string }
  | { kind: 'identical'; message: string };

/** confirmMergeItems for one group's selected rows. */
export function mergeSelection(code: string, selected: readonly PrItem[]): MergeOutcome {
  const first = selected[0]!;
  const others = selected.filter((i) => norm(i.name) !== norm(first.name) || norm(i.unit) !== norm(first.unit));
  if (others.length) {
    return {
      kind: 'different',
      message:
        `Kod "${code}" için farklı malzeme adı veya birim bulundu:\n\nBeklenen: ${first.name} - ${first.unit}\nFarklı olanlar:\n` +
        others.map((i) => `  ${i.name} - ${i.unit}`).join('\n') +
        '\n\nBu grup birleştirilmeyecek.',
    };
  }
  const identical = selected.every(
    (i) =>
      norm(i.job_no) === norm(first.job_no) &&
      (i.specs ?? '').trim() === (first.specs ?? '').trim() &&
      (i.item_description ?? '').trim() === (first.item_description ?? '').trim(),
  );
  if (identical) {
    return {
      kind: 'identical',
      message:
        `Kod "${code}" için aynı malzeme adı, iş numarası, teknik özellikler ve malzeme açıklamasına sahip malzemeler bulundu:\n\n` +
        `Malzeme: ${first.name}\nİş No: ${first.job_no || 'Belirtilmemiş'}\nTeknik Özellikler: ${first.specs || 'Belirtilmemiş'}\n` +
        `Malzeme Açıklaması: ${first.item_description || 'Belirtilmemiş'}\n\n` +
        'Bu tür malzemeler birleştirilemez çünkü backend sorunlarına neden olur.\nLütfen bu malzemeleri ayrı satırlar olarak bırakın.',
    };
  }
  const totals = jobTotals(selected);
  const total = totals.reduce((sum, t) => sum + t.quantity, 0);
  const specs = mergeSpecs(selected);
  const sourceIds = new Set<number>();
  for (const i of selected) {
    if (i.source_planning_request_item_id) sourceIds.add(i.source_planning_request_item_id);
    for (const id of i.source_planning_request_item_ids ?? []) sourceIds.add(id);
  }
  return {
    kind: 'merged',
    sources: [...selected],
    item: {
      // Legacy rebuilt the rows from the modal's text and lost the id, the
      // description and the planning files; they are kept here.
      id: newItemId(),
      code: first.code,
      name: first.name,
      job_no: '',
      quantity: total,
      unit: first.unit,
      specs,
      specifications: specs,
      item_description: first.item_description || '',
      allocations: totals.map((t) => ({ job_no: t.job_no, quantity: t.quantity.toFixed(2) })),
      file_asset_ids: [...new Set(selected.flatMap((i) => i.file_asset_ids ?? []))],
      source_planning_request_item_id: first.source_planning_request_item_id || null,
      source_planning_request_item_ids: [...sourceIds],
    },
  };
}

/**
 * Replace the merged rows by their merged items (appended). Legacy wiped
 * every offer and recommendation on the page; only the merged rows' are
 * dropped here.
 */
export function applyMerges(state: PrState, merges: readonly { item: PrItem; sources: PrItem[] }[]): PrState {
  const removed = new Set(merges.flatMap((m) => m.sources.map((s) => s.id)));
  const next = removeItems(state, removed);
  return withItems(next, [...next.items, ...merges.map((m) => m.item)]);
}

// ------------------------------------------------------------- suppliers / offers

export interface OfferRow {
  unitPrice: string | number;
  deliveryDays: string | number;
  notes: string;
}

export type OfferResult =
  | { ok: false; error: string }
  | { ok: true; offers: Record<string, PrOffer>; warnings: string[] };

/** saveOffer: every row gets an entry (zero rows count as "no offer"). */
export function buildOffer(items: readonly PrItem[], rows: Record<string, OfferRow>): OfferResult {
  const offers: Record<string, PrOffer> = {};
  const warnings: string[] = [];
  let complete = 0;
  items.forEach((item, index) => {
    const row = rows[item.id] ?? { unitPrice: '', deliveryDays: '', notes: '' };
    const unitPrice = parseFloat(String(row.unitPrice)) || 0;
    const deliveryDays = Number.parseInt(String(row.deliveryDays), 10) || 0;
    if (unitPrice > 0 && deliveryDays > 0) complete++;
    else if (unitPrice > 0) warnings.push(`Satır ${index + 1}: Birim fiyat girildi ancak teslimat süresi girilmedi`);
    else if (deliveryDays > 0) warnings.push(`Satır ${index + 1}: Teslimat süresi girildi ancak birim fiyat girilmedi`);
    offers[item.id] = { unitPrice, totalPrice: unitPrice * item.quantity, deliveryDays, notes: row.notes };
  });
  if (complete === 0) {
    return { ok: false, error: 'En az bir satır için hem birim fiyat hem de teslimat süresi girilmelidir.' };
  }
  return { ok: true, offers, warnings };
}

/**
 * Remove a supplier with its offers. Legacy left recommendations pointing at
 * it (submit validation then refused them); they are cleared here.
 */
export function removeSupplier(state: PrState, supplierId: string): PrState {
  const offers = { ...state.offers };
  delete offers[supplierId];
  return {
    ...state,
    suppliers: state.suppliers.filter((s) => s.id !== supplierId),
    offers,
    recommendations: Object.fromEntries(
      Object.entries(state.recommendations).map(([k, v]) => [k, v === supplierId ? null : v]),
    ),
  };
}

export function clearSuppliers(state: PrState): PrState {
  return {
    ...state,
    suppliers: [],
    offers: {},
    recommendations: Object.fromEntries(Object.keys(state.recommendations).map((k) => [k, null])),
  };
}

/** Supplier modal validation (saveSupplier). */
export function validateSupplierFields(currency: string, paymentTerms: string, taxRate: string): string[] {
  const errors: string[] = [];
  if (!currency) errors.push('Para birimi seçimi zorunludur');
  if (!paymentTerms) errors.push('Ödeme koşulları seçimi zorunludur');
  const tax = parseFloat(taxRate);
  if (taxRate === '' || Number.isNaN(tax) || tax < 0 || tax > 100) {
    errors.push('Geçerli bir vergi oranı giriniz (0-100 arası)');
  }
  return errors;
}

// ------------------------------------------------------------- comparison view

export function comparisonData(state: PrState): ComparisonData {
  return {
    items: state.items.map((i) => ({
      key: i.id,
      name: i.name,
      code: i.code,
      job_no: i.allocations?.length
        ? i.allocations.map((a) => `${a.job_no} (${a.quantity})`).join(', ')
        : i.job_no,
      quantity: i.quantity,
      unit: i.unit,
      specifications: i.specifications || i.specs || '',
      item_description: i.item_description || '',
    })),
    suppliers: state.suppliers.map((s) => ({
      id: s.id,
      name: s.name,
      default_currency: s.default_currency,
      status: s.status,
      rating_score: s.rating_score,
    })),
    offers: state.offers as Record<string, Record<string, ComparisonOffer>>,
    recommendations: state.recommendations,
  };
}

// ------------------------------------------------------------- validation

export interface HeaderErrors {
  title?: string;
  description?: string;
  needed_date?: string;
}

export function validateHeader(state: Pick<PrState, 'title' | 'description' | 'needed_date'>): HeaderErrors {
  const errors: HeaderErrors = {};
  const title = state.title.trim();
  if (!title) errors.title = 'Talep başlığı zorunludur';
  else if (title.length < 3) errors.title = 'Talep başlığı en az 3 karakter olmalıdır';
  else if (title.length > 100) errors.title = 'Talep başlığı en fazla 100 karakter olabilir';
  if (state.description.trim().length > 500) errors.description = 'Talep açıklaması en fazla 500 karakter olabilir';
  if (!state.needed_date) errors.needed_date = 'İhtiyaç tarihi zorunludur';
  return errors;
}

export type RowMark = 'no-offer' | 'no-recommendation';

/** The submit-time row marks of the comparison table. */
export function rowMarks(state: PrState): Record<string, RowMark> {
  const marks: Record<string, RowMark> = {};
  for (const item of state.items) {
    const anyOffer = state.suppliers.some((s) => hasOfferValue(state.offers[s.id]?.[item.id]));
    if (!anyOffer) {
      marks[item.id] = 'no-offer';
      continue;
    }
    const rec = state.recommendations[item.id];
    if (!rec || !hasOfferValue(state.offers[rec]?.[item.id])) marks[item.id] = 'no-recommendation';
  }
  return marks;
}

/** validateAllData: every message, in legacy order. */
export function validateAll(state: PrState): string[] {
  const errors: string[] = Object.values(validateHeader(state)) as string[];
  if (state.items.length === 0) {
    errors.push('En az bir malzeme eklemelisiniz');
  } else {
    state.items.forEach((item, index) => {
      const n = index + 1;
      if (!item.code || item.code.trim() === '') errors.push(`Malzeme ${n}: Malzeme kodu zorunludur`);
      if (!item.name || item.name.trim() === '') errors.push(`Malzeme ${n}: Malzeme adı zorunludur`);
      const hasJob = !!item.job_no && item.job_no.trim() !== '';
      if (!hasJob && !(item.allocations?.length ?? 0)) {
        errors.push(`Malzeme ${n}: İş numarası veya allocations zorunludur`);
      }
      if (!item.quantity || item.quantity <= 0) {
        errors.push(`Malzeme ${n}: Miktar zorunludur ve 0'dan büyük olmalıdır`);
      }
      if (item.unit === 'adet' && item.quantity && !Number.isInteger(item.quantity)) {
        errors.push(`Malzeme ${n}: 'Adet' birimi için miktar tam sayı olmalıdır`);
      }
    });
  }
  if (state.suppliers.length < 2) {
    errors.push('En az 2 tedarikçi eklemelisiniz');
  } else {
    state.suppliers.forEach((s, i) => {
      if (!s.name || s.name.trim() === '') errors.push(`Tedarikçi ${i + 1}: Tedarikçi adı zorunludur`);
    });
  }
  const marks = rowMarks(state);
  state.items.forEach((item, i) => {
    if (marks[item.id] === 'no-offer') {
      errors.push(`Malzeme ${i + 1}: Bu malzeme için hiçbir tedarikçiden teklif bulunmamaktadır`);
    }
  });
  state.items.forEach((item, i) => {
    if (marks[item.id]) errors.push(`Malzeme ${i + 1}: Bu malzeme için tedarikçi önerisi seçmelisiniz`);
  });
  return errors;
}

/** detectProblematicItems + showProblematicItemsError: rows the backend cannot take. */
export function duplicateItemsMessage(items: readonly PrItem[]): string | null {
  const groups = new Map<string, { item: PrItem; index: number }[]>();
  items.forEach((item, index) => {
    const key = `${item.code}|${item.name}|${item.job_no || ''}|${item.specifications || item.specs || ''}|${item.item_description || ''}`;
    groups.set(key, [...(groups.get(key) ?? []), { item, index }]);
  });
  const dupes = [...groups.values()].filter((g) => g.length > 1);
  if (!dupes.length) return null;
  let message =
    'Aşağıdaki malzemeler aynı kod, ad, iş numarası, teknik özellikler ve malzeme açıklamasına sahip olduğu için gönderilemez:\n\n';
  dupes.forEach((g, i) => {
    const first = g[0]!.item;
    message += `${i + 1}. Kod: ${first.code}\n`;
    message += `   Ad: ${first.name}\n`;
    message += `   İş No: ${first.job_no || 'Belirtilmemiş'}\n`;
    message += `   Teknik Özellikler: ${first.specifications || first.specs || 'Belirtilmemiş'}\n`;
    message += `   Malzeme Açıklaması: ${first.item_description || 'Belirtilmemiş'}\n`;
    message += `   Tekrarlanan satırlar: ${g.map(({ item, index }) => `Satır ${index + 1} (${item.quantity} ${item.unit})`).join(', ')}\n\n`;
  });
  message += 'Bu malzemeler aynı kod, ad, iş numarası, teknik özellikler ve malzeme açıklamasına sahip olduğu için backend sorunlarına neden olur.\n';
  message += 'Lütfen bu malzemeleri düzenleyin veya silin.';
  return message;
}

// ------------------------------------------------------------- payloads

export interface SubmissionItem {
  code: string;
  name: string;
  unit: string;
  specifications: string;
  item_description: string;
  quantity: string;
  allocations: Allocation[];
  file_asset_ids: number[];
  planning_request_item_id: number | null;
}

/**
 * getFormattedItemsForSubmission: rows grouped by code, name, unit, specs,
 * description and planning item (not job number), one allocation per row.
 * `mapping[rowIndex]` = grouped index.
 */
export function formatItemsForSubmission(items: readonly PrItem[]): { items: SubmissionItem[]; mapping: number[] } {
  const groups = new Map<string, SubmissionItem & { total: number; index: number }>();
  const mapping: number[] = [];
  items.forEach((item, rowIndex) => {
    const specs = item.specifications || item.specs || '';
    const description = item.item_description || '';
    const planningId = item.source_planning_request_item_id || null;
    const key = `${item.code}|${item.name}|${item.unit}|${specs}|${description}|${planningId}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        code: item.code,
        name: item.name,
        unit: item.unit,
        specifications: specs,
        item_description: description,
        quantity: '',
        allocations: [],
        file_asset_ids: [],
        planning_request_item_id: planningId,
        total: 0,
        index: groups.size,
      };
      groups.set(key, group);
    }
    for (const id of item.file_asset_ids ?? []) if (!group.file_asset_ids.includes(id)) group.file_asset_ids.push(id);
    if (item.allocations && Array.isArray(item.allocations)) {
      for (const a of item.allocations) {
        group.allocations.push({ job_no: a.job_no, quantity: parseFloat(a.quantity).toFixed(2) });
        group.total += parseFloat(a.quantity);
      }
    } else {
      group.allocations.push({ job_no: item.job_no, quantity: Number(item.quantity).toFixed(2) });
      group.total += Number(item.quantity);
    }
    mapping[rowIndex] = group.index;
  });
  return {
    items: [...groups.values()].map(({ total, ...g }) => ({
      code: g.code,
      name: g.name,
      unit: g.unit,
      specifications: g.specifications,
      item_description: g.item_description,
      allocations: g.allocations,
      file_asset_ids: g.file_asset_ids,
      quantity: total.toFixed(2),
      planning_request_item_id: g.planning_request_item_id || null,
    })),
    mapping,
  };
}

/**
 * transformSuppliersForSubmission: default_* → currency / payment_terms_id /
 * tax_rate. Legacy tested truthiness, so a 0% tax rate went out as
 * default_tax_rate without tax_rate; it is sent as tax_rate 0 here.
 */
export function transformSuppliers(suppliers: readonly PrSupplier[]): Record<string, unknown>[] {
  return suppliers.map((s) => {
    const out: Record<string, unknown> = { ...s };
    if (s.default_currency) {
      out.currency = s.default_currency;
      delete out.default_currency;
    }
    if (s.default_payment_terms) {
      out.payment_terms_id =
        typeof s.default_payment_terms === 'string'
          ? Number.parseInt(s.default_payment_terms, 10)
          : s.default_payment_terms;
      delete out.default_payment_terms;
    }
    if (s.default_tax_rate !== null && s.default_tax_rate !== undefined && !Number.isNaN(s.default_tax_rate)) {
      out.tax_rate = s.default_tax_rate;
      delete out.default_tax_rate;
    }
    return out;
  });
}

/** calculateTotalAmountEUR: the recommended offers in EUR, 2 decimals; 0 without rates. */
export function totalAmountEUR(state: PrState, rates: CurrencyRates | null | undefined): number {
  if (!rates) return 0;
  let total = 0;
  for (const item of state.items) {
    const sid = state.recommendations[item.id];
    if (!sid) continue;
    const offer = state.offers[sid]?.[item.id];
    if (!hasOfferValue(offer)) continue;
    const supplier = state.suppliers.find((s) => s.id === sid);
    if (supplier?.default_currency) {
      total += (offer.totalPrice / rates[supplier.default_currency]!) * rates.EUR!;
    }
  }
  return Math.round(total * 100) / 100;
}

/** Offers by row index (legacy requestData.offers). */
export function offersByRow(state: PrState): Record<string, Record<string, PrOffer>> {
  const out: Record<string, Record<string, PrOffer>> = {};
  for (const [sid, byItem] of Object.entries(state.offers)) {
    out[sid] = {};
    state.items.forEach((item, index) => {
      const offer = byItem[item.id];
      if (offer) out[sid]![index] = offer;
    });
  }
  return out;
}

/** Non-empty recommendations by row index. */
export function recommendationsByRow(state: PrState): Record<string, string> {
  const out: Record<string, string> = {};
  state.items.forEach((item, index) => {
    const sid = state.recommendations[item.id];
    if (sid) out[index] = sid;
  });
  return out;
}

/** Re-key row-indexed offers / recommendations through the grouping (last row wins). */
function toGrouped(state: PrState, mapping: number[]) {
  const byRow = offersByRow(state);
  const offers: Record<string, Record<string, PrOffer>> = {};
  for (const [sid, rows] of Object.entries(byRow)) {
    offers[sid] = {};
    for (const [row, offer] of Object.entries(rows)) {
      const g = mapping[Number(row)];
      if (g !== undefined) offers[sid]![g] = offer;
    }
  }
  const recommendations: Record<string, string> = {};
  for (const [row, sid] of Object.entries(recommendationsByRow(state))) {
    const g = mapping[Number(row)];
    if (g !== undefined) recommendations[g] = sid;
  }
  return { offers, recommendations };
}

const isRollingMill = (items: readonly SubmissionItem[]) =>
  items.some((item) => item.allocations?.some((a) => a.job_no && String(a.job_no).toUpperCase().startsWith('RM')));

/** submitRequest's body. Call after validateAll and duplicateItemsMessage. */
export function buildSubmitPayload(state: PrState, rates: CurrencyRates | null | undefined) {
  const formatted = formatItemsForSubmission(state.items);
  const grouped = toGrouped(state, formatted.mapping);
  return {
    title: state.title.trim(),
    description: state.description.trim(),
    priority: state.priority || 'normal',
    needed_date: state.needed_date,
    items: formatted.items,
    suppliers: transformSuppliers(state.suppliers),
    offers: grouped.offers,
    recommendations: grouped.recommendations,
    total_amount_eur: totalAmountEUR(state, rates),
    is_rolling_mill: isRollingMill(formatted.items),
    planning_request_item_ids: planningIds(state.items),
  };
}

/**
 * buildDraftPayload. strict: refuse duplicate rows (Taslak Kaydet); not
 * strict (autosave): duplicates send empty grouped data, the rows still go
 * in original_*.
 */
export function buildDraftPayload(
  state: PrState,
  rates: CurrencyRates | null | undefined,
  { strict }: { strict: boolean },
): { error: string } | { payload: DraftPayload } {
  const duplicate = duplicateItemsMessage(state.items);
  if (duplicate && strict) return { error: duplicate };
  const formatted = duplicate ? { items: [], mapping: [] } : formatItemsForSubmission(state.items);
  const grouped = toGrouped(state, formatted.mapping);
  const title = state.title || 'Malzeme Satın Alma Talebi';
  const recommendations = recommendationsByRow(state);
  const data = {
    title,
    description: state.description,
    priority: state.priority || 'normal',
    needed_date: state.needed_date || '',
    items: formatted.items,
    suppliers: transformSuppliers(state.suppliers),
    offers: grouped.offers,
    recommendations: grouped.recommendations,
    total_amount_eur: totalAmountEUR(state, rates),
    is_rolling_mill: isRollingMill(formatted.items),
    planning_request_item_ids: planningIds(state.items),
    original_items: state.items.map((item) => ({ ...item })),
    original_offers: offersByRow(state),
    original_recommendations: recommendations,
  } as DraftPayload['data'];
  return {
    payload: {
      title,
      description: state.description || 'Proje için gerekli malzemeler',
      needed_date: state.needed_date || today(),
      priority: state.priority || 'normal',
      data,
    },
  };
}

export interface DraftPayload {
  title: string;
  description: string;
  needed_date: string;
  priority: string;
  data: Record<string, unknown> & { title: string; source_draft?: SavedDraftRef | null };
}

/** Autosave has something to keep (hasAutosaveContent). */
export function hasAutosaveContent(state: PrState): boolean {
  return !!(state.title.trim() || state.description.trim() || state.items.length || state.suppliers.length);
}

// ------------------------------------------------------------- loading drafts

type LooseItem = Omit<Partial<PrItem>, "quantity"> & {
  planning_request_item_id?: number | null;
  planning_request_item_ids?: number[] | null;
  quantity?: number | string;
};
type LooseSupplier = Partial<PrSupplier> & {
  currency?: string;
  payment_terms_id?: string | number;
  payment_terms?: string | number;
  tax_rate?: number | string;
};

/** dataManager.migrateSupplierData: old field names → default_*. */
export function migrateSupplier(raw: LooseSupplier): PrSupplier {
  const s: LooseSupplier = { ...raw };
  if (s.default_currency === undefined && s.currency !== undefined) s.default_currency = s.currency;
  if (s.default_payment_terms === undefined && s.payment_terms_id !== undefined) s.default_payment_terms = s.payment_terms_id;
  if (s.default_payment_terms === undefined && s.payment_terms !== undefined) s.default_payment_terms = s.payment_terms;
  if (s.default_tax_rate === undefined && s.tax_rate !== undefined) s.default_tax_rate = Number(s.tax_rate);
  delete s.currency;
  delete s.payment_terms_id;
  delete s.payment_terms;
  delete s.tax_rate;
  return {
    contact_person: '',
    phone: '',
    email: '',
    name: '',
    default_currency: '',
    default_payment_terms: '',
    default_tax_rate: 0,
    ...s,
    id: String(s.id ?? newSupplierId()),
  } as PrSupplier;
}

function normalizeItem(raw: LooseItem): PrItem {
  const specifications = raw.specifications || raw.specs || '';
  const item: PrItem = {
    ...(raw as PrItem),
    id: raw.id || newItemId(),
    code: raw.code ?? '',
    name: raw.name ?? '',
    job_no: raw.job_no ?? '',
    quantity: Number(raw.quantity) || 0,
    unit: raw.unit ?? '',
    specs: specifications,
    specifications,
    item_description: raw.item_description || '',
  };
  if (!item.source_planning_request_item_id && raw.planning_request_item_id) {
    item.source_planning_request_item_id = raw.planning_request_item_id;
  }
  if (!item.source_planning_request_item_ids && raw.planning_request_item_ids) {
    item.source_planning_request_item_ids = raw.planning_request_item_ids;
  }
  delete (item as LooseItem).planning_request_item_id;
  delete (item as LooseItem).planning_request_item_ids;
  return item;
}

/** Row-indexed offers/recommendations → keyed by the rows' item ids. */
function keyByItems(
  items: readonly PrItem[],
  offersByIndex: Record<string, Record<string, PrOffer>> | undefined,
  recsByIndex: Record<string, string | null> | undefined,
) {
  const offers: PrState['offers'] = {};
  for (const [sid, rows] of Object.entries(offersByIndex ?? {})) {
    offers[sid] = {};
    for (const [index, offer] of Object.entries(rows ?? {})) {
      const item = items[Number(index)];
      if (item && offer) offers[sid]![item.id] = offer;
    }
  }
  const recommendations: PrState['recommendations'] = {};
  for (const [index, sid] of Object.entries(recsByIndex ?? {})) {
    const item = items[Number(index)];
    if (item && sid) recommendations[item.id] = sid;
  }
  return { offers, recommendations };
}

/** loadDraftData: a server draft (named or the "Oto" autosave) → page state. */
export function stateFromDraft(draft: PurchaseRequestDraft): PrState {
  const data = (draft.data ?? {}) as Record<string, unknown>;
  const state = emptyState();
  state.title = draft.title || '';
  state.description = draft.description || '';
  state.priority = draft.priority || 'normal';
  state.needed_date = draft.needed_date || (data.needed_date as string) || '';
  state.savedDraft = draft.is_autosave
    ? ((data.source_draft as SavedDraftRef | null | undefined) ?? null)
    : { id: draft.id, title: draft.title };
  state.suppliers = ((data.suppliers as LooseSupplier[] | undefined) ?? []).map(migrateSupplier);

  const original = data.original_items as LooseItem[] | undefined;
  if (Array.isArray(original) && original.length > 0) {
    state.items = original.map(normalizeItem);
    const useOriginalKeys = !!data.original_offers;
    const keyed = keyByItems(
      state.items,
      (useOriginalKeys ? data.original_offers : data.offers) as Record<string, Record<string, PrOffer>>,
      (useOriginalKeys ? data.original_recommendations : data.recommendations) as Record<string, string>,
    );
    state.offers = keyed.offers;
    state.recommendations = keyed.recommendations;
  } else {
    const grouped = (data.items as (LooseItem & { allocations?: { job_no: string; quantity: string | number }[] })[] | undefined) ?? [];
    if (grouped.length > 0 && Array.isArray(grouped[0]?.allocations)) {
      // Older drafts: one row per allocation; each row takes its group's offer.
      const rows: { item: PrItem; group: number }[] = [];
      grouped.forEach((g, group) => {
        if (Array.isArray(g.allocations)) {
          for (const a of g.allocations) {
            rows.push({
              group,
              item: normalizeItem({
                code: g.code,
                name: g.name,
                unit: g.unit,
                job_no: a.job_no,
                quantity: a.quantity,
                specifications: g.specifications || '',
                item_description: g.item_description || '',
                source_planning_request_item_id: g.source_planning_request_item_id || g.planning_request_item_id || null,
                source_planning_request_item_ids: g.source_planning_request_item_ids || g.planning_request_item_ids || null,
              }),
            });
          }
        } else {
          rows.push({ group, item: normalizeItem({ ...g, allocations: undefined }) });
        }
      });
      state.items = rows.map((r) => r.item);
      const groupOffers = (data.offers ?? {}) as Record<string, Record<string, PrOffer>>;
      for (const [sid, byGroup] of Object.entries(groupOffers)) {
        state.offers[sid] = {};
        for (const r of rows) {
          const offer = byGroup?.[r.group];
          if (offer) state.offers[sid]![r.item.id] = offer;
        }
      }
      const groupRecs = (data.recommendations ?? {}) as Record<string, string | null>;
      for (const r of rows) {
        const sid = groupRecs[r.group];
        if (sid) state.recommendations[r.item.id] = sid;
      }
    } else {
      state.items = grouped.map(normalizeItem);
      const keyed = keyByItems(
        state.items,
        data.offers as Record<string, Record<string, PrOffer>>,
        data.recommendations as Record<string, string>,
      );
      state.offers = keyed.offers;
      state.recommendations = keyed.recommendations;
    }
  }
  state.planning_request_item_ids = planningIds(state.items);
  return state;
}

// ------------------------------------------------------------- localStorage

export const STORAGE_KEY = 'purchaseRequestDraft';
const LEGACY_KEYS = [
  'purchaseRequestData',
  'purchaseRequestItems',
  'purchaseRequestSuppliers',
  'purchaseRequestOffers',
  'purchaseRequestRecommendations',
];
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** dataManager.saveDraft: the legacy requestData shape (row-indexed), with a timestamp. */
export function toStorage(state: PrState, now = new Date()): string {
  const itemRecommendations = recommendationsByRow(state);
  return JSON.stringify({
    title: state.title,
    description: state.description,
    priority: state.priority,
    needed_date: state.needed_date,
    items: state.items,
    suppliers: state.suppliers,
    offers: offersByRow(state),
    recommendations: itemRecommendations,
    itemRecommendations,
    planning_request_item_ids: state.planning_request_item_ids,
    savedDraft: state.savedDraft,
    timestamp: now.toISOString(),
  });
}

/**
 * dataManager.loadDraftData: null when absent, unreadable or older than 24 h.
 * Legacy split merged rows back into one row per allocation here (without
 * moving their offers); rows are restored as saved.
 */
export function fromStorage(raw: string | null, now = new Date()): PrState | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Record<string, unknown>;
    if (d.timestamp && now.getTime() - new Date(d.timestamp as string).getTime() > MAX_AGE_MS) return null;
    const state = emptyState();
    state.title = (d.title as string) || '';
    state.description = (d.description as string) || '';
    state.priority = (d.priority as string) || 'normal';
    state.needed_date = (d.needed_date as string) || '';
    state.items = ((d.items as LooseItem[]) ?? []).map(normalizeItem);
    state.suppliers = ((d.suppliers as LooseSupplier[]) ?? []).map(migrateSupplier);
    const keyed = keyByItems(
      state.items,
      d.offers as Record<string, Record<string, PrOffer>>,
      (d.itemRecommendations ?? d.recommendations) as Record<string, string>,
    );
    state.offers = keyed.offers;
    state.recommendations = keyed.recommendations;
    state.savedDraft = (d.savedDraft as SavedDraftRef | null) ?? null;
    state.planning_request_item_ids = planningIds(state.items);
    return state;
  } catch {
    return null;
  }
}

export function clearStorage(storage: Storage) {
  for (const key of [STORAGE_KEY, ...LEGACY_KEYS]) storage.removeItem(key);
}

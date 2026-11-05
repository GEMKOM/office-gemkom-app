import type { DepartmentRequest } from '@/api/general/departmentRequests';
import type {
  AttachTarget,
  PlanningRequest,
  PlanningRequestFileInput,
  PlanningRequestInput,
  PlanningRequestItemInput,
} from '@/api/planning/planningRequests';
import type { StatusFamily } from '@/ui';
import { UNIT_CHOICES } from '../../general/department-requests/list/constants';

// Pure parts of planning/department-requests (department-requests.js, modals.js):
// badges, form rows and attachments, the save payloads, change detection,
// the ERP CSV and the Excel import.

export const PRIORITY_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'urgent', label: 'Acil' },
  { value: 'critical', label: 'Kritik' },
];

export const PLANNING_STATUS_OPTIONS = [
  { value: 'draft', label: 'Taslak' },
  { value: 'ready', label: 'Satın Almaya Hazır' },
  { value: 'converted', label: 'Onaya Gönderildi' },
  { value: 'completed', label: 'Tamamlandı' },
  { value: 'cancelled', label: 'İptal Edildi' },
];

/** Legacy normalizePriorityForPlanningRequest: the backend takes normal / urgent / critical. */
export function normalizePriority(priority: string | null | undefined): string {
  if (!priority) return 'normal';
  const p = priority.toLowerCase().trim();
  if (p === 'normal' || p === 'urgent' || p === 'critical') return p;
  if (p === 'high') return 'urgent';
  return 'normal';
}

/** Legacy renderPriorityBadge. */
export function priorityBadge(priority: string | null | undefined): {
  color: StatusFamily;
  label: string;
} {
  switch (priority) {
    case 'critical':
      return { color: 'red', label: 'Kritik' };
    case 'urgent':
      return { color: 'red', label: 'Acil' };
    case 'high':
      return { color: 'yellow', label: 'Yüksek' };
    case 'normal':
      return { color: 'blue', label: 'Normal' };
    case 'low':
      return { color: 'grey', label: 'Düşük' };
    default:
      return { color: 'grey', label: 'Normal' };
  }
}

/** Legacy renderPlanningRequestStatusBadge. */
export function planningStatusFamily(status: string | null | undefined): StatusFamily {
  switch (status) {
    case 'ready':
      return 'green';
    case 'converted':
      return 'blue';
    case 'cancelled':
      return 'red';
    default:
      return 'grey';
  }
}

/** Badge colour of a purchase request number on a planning item. */
export function purchaseRequestFamily(status: string | null | undefined): StatusFamily {
  if (status === 'submitted') return 'yellow';
  if (status === 'approved') return 'green';
  if (status === 'rejected' || status === 'cancelled') return 'red';
  return 'grey';
}

/** Planning requests in these states can no longer be cancelled. */
export function canCancelPlanningRequest(status: string | null | undefined): boolean {
  return status !== 'cancelled' && status !== 'converted' && status !== 'completed';
}

export interface RejectionComment {
  approver: string;
  stage: string;
  comment: string;
  date: string | null;
}

/** Legacy getRejectionComments: rejected / cancelled decisions with a comment, latest workflow. */
export function rejectionComments(request: DepartmentRequest): RejectionComment[] {
  const approval = request.approvals?.[0];
  const out: RejectionComment[] = [];
  for (const stage of approval?.stage_instances ?? []) {
    for (const decision of stage.decisions ?? []) {
      if (
        (decision.decision === 'cancelled' || decision.decision === 'rejected') &&
        decision.comment
      ) {
        out.push({
          approver: decision.approver_name || decision.approver_username || 'Bilinmeyen',
          stage: stage.name ?? '',
          comment: decision.comment,
          date: decision.decision_date ?? null,
        });
      }
    }
  }
  return out;
}

/** `0,00` with two decimals; empty and junk read as zero (legacy formatNumber). */
export function formatQuantity(value: unknown): string {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return (Number.isNaN(n) ? 0 : n).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ---------------------------------------------------------------------------
// Form rows

export interface ItemRow {
  key: number;
  /** The planning item's id when editing, so the backend updates that line. */
  id?: number;
  item_code: string;
  item_name: string;
  item_description: string;
  job_no: string | null;
  quantity: number | string;
  item_unit: string;
  specifications: string;
  /** Index of the department request row it came from. */
  sourceIndex?: number;
  /** Converted lines are read-only. */
  converted?: boolean;
  /** Backend `is_deletable` (falls back to !is_converted). */
  deletable?: boolean;
  /** Given from inventory: offers "Envanterden geri al" instead of delete. */
  inventoryLocked?: boolean;
  /** Tied to an active purchase request. */
  prLocked?: boolean;
}

let nextKey = 1;
export function itemRow(fill: Partial<ItemRow> = {}): ItemRow {
  return {
    item_code: '',
    item_name: '',
    item_description: '',
    job_no: null,
    quantity: 1,
    item_unit: 'adet',
    specifications: '',
    ...fill,
    key: nextKey++,
  };
}

const str = (value: unknown) => (value === null || value === undefined ? '' : String(value));

/** Legacy prefillItemsFromDepartmentRequest: department items come in several shapes. */
export function rowsFromDepartmentRequest(request: DepartmentRequest): ItemRow[] {
  return (request.items ?? []).map((item, index) => {
    const raw = item as Record<string, unknown>;
    return itemRow({
      item_code: str(item.item_code || item.code || raw.product_code || raw.item_id),
      item_name: str(item.name || item.product_name || item.item_name),
      item_description: str(item.item_description || item.description),
      item_unit: str(item.unit || item.item_unit) || 'adet',
      quantity: (item.quantity as number | string) || (raw.qty as number | string) || 1,
      job_no: str(item.job_no || raw.job_number || raw.job) || null,
      specifications: str(item.item_specifications || item.specifications || raw.specs),
      sourceIndex: index,
    });
  });
}

/** Legacy prefillItemsFromPlanningRequest, with the row locks. */
export function rowsFromPlanningRequest(request: PlanningRequest): ItemRow[] {
  return (request.items ?? []).map((item) => {
    const converted = item.is_converted === true;
    return itemRow({
      id: item.id,
      item_code: str(item.item_code || (item.item_id ?? '')),
      item_name: str(item.item_name),
      item_description: str(item.item_description),
      item_unit: str(item.item_unit) || 'adet',
      quantity: item.quantity || 1,
      job_no: str(item.job_no) || null,
      specifications: str(item.specifications),
      converted,
      deletable: item.is_deletable !== undefined ? item.is_deletable !== false : !converted,
      inventoryLocked: (Number.parseFloat(str(item.quantity_from_inventory)) || 0) > 0,
      prLocked: (Number.parseFloat(str(item.quantity_in_active_prs)) || 0) > 0,
    });
  });
}

/** Tooltip of a row's delete button. */
export function lockReason(row: ItemRow): string {
  if (row.deletable !== false) return 'Ürünü Kaldır';
  if (row.inventoryLocked && row.prLocked) {
    return 'Envanterden verilmiş ve satın alma talebine bağlı; silinemez';
  }
  if (row.inventoryLocked) return 'Envanterden verilmiş; silmek için stoğa iade edin';
  if (row.prLocked) return 'Satın alma talebine bağlı; silmek için önce talebi iptal edin';
  return 'Bu kalem silinemez';
}

/** What a file-target checkbox calls an item row (legacy renderFilesList). */
export function rowTargetLabel(row: ItemRow, index: number): string {
  return (
    row.specifications.trim() || row.item_code.trim() || row.item_name.trim() || `Ürün ${index + 1}`
  );
}

// ---------------------------------------------------------------------------
// Attachments

export interface Attachment {
  key: number;
  name: string;
  /** Bytes; existing files have none. */
  size: number;
  /** A new upload. */
  file?: File;
  /** An existing asset, referenced by `asset_id`. */
  isExisting: boolean;
  assetId?: number | string;
  url?: string;
  description: string;
  attachTo: AttachTarget[];
}

let nextAttachmentKey = 1;
export function newAttachment(file: File): Attachment {
  return {
    key: nextAttachmentKey++,
    name: file.name,
    size: file.size,
    file,
    isExisting: false,
    description: '',
    attachTo: ['request'],
  };
}

const baseName = (fileName: string | null | undefined) =>
  fileName ? (fileName.split('/').pop() ?? 'Dosya') : 'Dosya';

/**
 * Legacy prefillFilesFromDepartmentRequest: a file mapped to items
 * (file_asset_ids) attaches to those items, otherwise to the request.
 */
export function attachmentsFromDepartmentRequest(request: DepartmentRequest): Attachment[] {
  const byAsset = new Map<string, number[]>();
  (request.items ?? []).forEach((item, index) => {
    for (const assetId of item.file_asset_ids ?? []) {
      const list = byAsset.get(String(assetId)) ?? [];
      list.push(index);
      byAsset.set(String(assetId), list);
    }
  });
  return (request.files ?? []).map((file) => {
    const items = file.asset_id ? byAsset.get(String(file.asset_id)) : undefined;
    return {
      key: nextAttachmentKey++,
      name: baseName(file.file_name),
      size: 0,
      isExisting: true,
      assetId: file.asset_id ?? undefined,
      url: file.file_url ?? undefined,
      description: str(file.description),
      attachTo: items && items.length > 0 ? [...items] : ['request'],
    };
  });
}

/**
 * Legacy prefillFilesFromPlanningRequest: one card per asset, attached to
 * 'request' and/or the item indices that carry it.
 */
export function attachmentsFromPlanningRequest(request: PlanningRequest): Attachment[] {
  const byAsset = new Map<string, Attachment>();
  const upsert = (file: NonNullable<PlanningRequest['files']>[number], target: AttachTarget) => {
    if (!file.asset_id) return;
    const key = String(file.asset_id);
    const existing = byAsset.get(key);
    if (!existing) {
      byAsset.set(key, {
        key: nextAttachmentKey++,
        name: baseName(file.file_name),
        size: 0,
        isExisting: true,
        assetId: file.asset_id,
        url: file.file_url ?? undefined,
        description: str(file.description),
        attachTo: [target],
      });
      return;
    }
    if (!existing.attachTo.includes(target)) existing.attachTo.push(target);
    if (!existing.description.trim() && file.description) existing.description = file.description;
    if (!existing.url && file.file_url) existing.url = file.file_url;
  };
  for (const file of request.files ?? []) upsert(file, 'request');
  (request.items ?? []).forEach((item, index) => {
    for (const file of item.files ?? []) upsert(file, index);
  });
  return [...byAsset.values()];
}

/** Numbers first (ascending), then strings. */
export function sortAttachTo(targets: readonly AttachTarget[] | null | undefined): AttachTarget[] {
  if (!targets) return [];
  return [...targets].sort((a, b) => {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    if (typeof a === 'number') return -1;
    if (typeof b === 'number') return 1;
    return String(a).localeCompare(String(b));
  });
}

export interface NormalizedFile {
  asset_id: number | null;
  attach_to: AttachTarget[];
  description: string;
}

/** What the edit modal compares new files against (showEditPlanningRequestModal). */
export function originalFiles(request: PlanningRequest): NormalizedFile[] {
  const itemIndicesByAsset = new Map<string, number[]>();
  (request.items ?? []).forEach((item, index) => {
    for (const file of item.files ?? []) {
      if (!file.asset_id) continue;
      const list = itemIndicesByAsset.get(String(file.asset_id)) ?? [];
      list.push(index);
      itemIndicesByAsset.set(String(file.asset_id), list);
    }
  });
  const byKey = new Map<string, NormalizedFile>();
  const add = (assetId: unknown, attachTo: AttachTarget[], description: unknown) => {
    if (!assetId) return;
    const sorted = sortAttachTo(attachTo);
    byKey.set(`${String(assetId)}-${JSON.stringify(sorted)}`, {
      asset_id: Number(assetId),
      attach_to: sorted,
      description: str(description),
    });
  };
  for (const file of request.files ?? []) {
    const items = file.asset_id ? itemIndicesByAsset.get(String(file.asset_id)) : undefined;
    add(file.asset_id, items ? [...items] : ['request'], file.description);
  }
  (request.items ?? []).forEach((item, index) => {
    for (const file of item.files ?? []) add(file.asset_id, [index], file.description);
  });
  return [...byKey.values()];
}

// ---------------------------------------------------------------------------
// Save payloads

export type Built<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * The `items` of a save, in row order, with legacy's checks: an İş No, a
 * positive quantity and a code on every row. A numeric code goes as item_id.
 */
export function buildItems(
  rows: readonly ItemRow[],
  options: { fromDepartmentRequest?: boolean; editing?: boolean } = {},
): Built<PlanningRequestItemInput[]> {
  const items: PlanningRequestItemInput[] = [];
  for (const row of rows) {
    const code = row.item_code.trim();
    const quantity = String(row.quantity ?? '').trim();
    if (!row.job_no) return { ok: false, error: 'Tüm ürünler için iş no gereklidir' };
    if (!quantity || !(Number.parseFloat(quantity) > 0)) {
      return { ok: false, error: 'Tüm ürünler için geçerli miktar gereklidir' };
    }
    if (!code) return { ok: false, error: 'Tüm ürünler için ürün kodu/ID gereklidir' };

    const item: PlanningRequestItemInput = {
      job_no: row.job_no,
      quantity: Number.parseFloat(quantity),
    };
    // Always the code: Mikro codes can be all digits ("1000"), which the old
    // "a number is an item id" rule mistook for card ids.
    item.item_code = code;
    const name = row.item_name.trim();
    const description = row.item_description.trim();
    const specifications = row.specifications.trim();
    if (name) item.item_name = name;
    if (description) item.item_description = description;
    item.item_unit = row.item_unit.trim() || 'adet';
    if (specifications) item.specifications = specifications;
    if (options.fromDepartmentRequest && row.sourceIndex !== undefined) {
      item.source_item_index = row.sourceIndex;
    }
    if (options.editing && row.id !== undefined) item.id = row.id;
    items.push(item);
  }
  return { ok: true, value: items };
}

/** The `files` of a save: every file needs a target, item targets must exist. */
export function buildFiles(
  attachments: readonly Attachment[],
  itemCount: number,
  options: { sort?: boolean } = {},
): Built<PlanningRequestFileInput[]> {
  const files: PlanningRequestFileInput[] = [];
  for (const attachment of attachments) {
    if (attachment.attachTo.length === 0) {
      return {
        ok: false,
        error: `"${attachment.name}" dosyası için en az bir hedef seçilmelidir (Talep veya ürün)`,
      };
    }
    for (const target of attachment.attachTo) {
      if (typeof target === 'number' && (target < 0 || target > itemCount - 1)) {
        return { ok: false, error: `"${attachment.name}" dosyası için geçersiz ürün indeksi` };
      }
    }
    const file: PlanningRequestFileInput = {
      description: attachment.description || '',
      attach_to: options.sort ? sortAttachTo(attachment.attachTo) : [...attachment.attachTo],
    };
    if (attachment.isExisting) file.asset_id = attachment.assetId;
    else file.file = attachment.file;
    files.push(file);
  }
  return { ok: true, value: files };
}

/** The original record as the edit modal stored it for change tracking. */
export interface OriginalData {
  title: string;
  description: string;
  priority: string;
  needed_date: string | null;
  check_inventory: boolean;
  items: PlanningRequest['items'];
  files: NormalizedFile[];
}

export function originalData(request: PlanningRequest): OriginalData {
  return {
    title: request.title || '',
    description: request.description || '',
    priority: request.priority || 'normal',
    needed_date: request.needed_date || null,
    check_inventory: request.check_inventory || false,
    items: request.items || [],
    files: originalFiles(request),
  };
}

type Comparable = Record<string, unknown>;

/**
 * Legacy getChangedFields: only what changed goes into the PATCH. A changed
 * item list goes whole (the backend rewrites the items); files likewise.
 */
export function changedFields(
  original: OriginalData,
  next: PlanningRequestInput,
): PlanningRequestInput {
  const changed: PlanningRequestInput = {};
  if (next.title !== undefined && next.title !== original.title) changed.title = next.title;
  if (next.description !== undefined && next.description !== (original.description || '')) {
    changed.description = next.description;
  }
  if (next.priority !== undefined && next.priority !== (original.priority || 'normal')) {
    changed.priority = next.priority;
  }
  if (next.needed_date !== undefined) {
    const before = original.needed_date || null;
    const after = next.needed_date || null;
    if (after !== before) changed.needed_date = after;
  }
  if (next.check_inventory !== undefined) {
    const before = original.check_inventory || false;
    const after = next.check_inventory || false;
    if (after !== before) changed.check_inventory = after;
  }

  if (next.items !== undefined) {
    const before = (original.items ?? []) as Comparable[];
    const after = next.items as unknown as Comparable[];
    if (before.length !== after.length) {
      changed.items = next.items;
    } else if (before.length > 0) {
      const normalize = (item: Comparable) => ({
        job_no: str(item.job_no).trim(),
        quantity: Number.parseFloat(str(item.quantity)) || 0,
        item_id: item.item_id !== undefined && item.item_id !== null ? Number(item.item_id) : null,
        item_code: str(item.item_code).trim(),
        item_name: str(item.item_name).trim(),
        item_description: str(item.item_description).trim(),
        item_unit: str(item.item_unit).trim(),
        specifications: str(item.specifications).trim(),
      });
      const key = (list: Comparable[]) =>
        JSON.stringify(
          list.map(normalize).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
        );
      if (key(before) !== key(after)) changed.items = next.items;
    }
  }

  if (next.files !== undefined) {
    const before = original.files;
    const after = next.files;
    if (before.length !== after.length || after.some((f) => f.file)) {
      changed.files = after;
    } else if (before.length > 0) {
      const normalize = (
        list: { asset_id?: unknown; attach_to?: AttachTarget[]; description?: string }[],
      ) =>
        JSON.stringify(
          list
            .map((f) => ({
              asset_id: f.asset_id !== undefined && f.asset_id !== null ? Number(f.asset_id) : null,
              attach_to: f.attach_to ? JSON.stringify(sortAttachTo(f.attach_to)) : null,
              description: (f.description || '').trim(),
            }))
            .sort((a, b) =>
              a.asset_id !== b.asset_id
                ? (a.asset_id || 0) - (b.asset_id || 0)
                : (a.attach_to || '').localeCompare(b.attach_to || ''),
            ),
        );
      if (normalize(before) !== normalize(after)) changed.files = after;
    }
  }
  return changed;
}

// ---------------------------------------------------------------------------
// ERP CSV

/** Item codes the ERP books as expenses: their lines start with G, the others with S. */
export const ITEM_CODE_NAMES: Record<string, string> = {
  '730.06.004': 'FABRİKA BAKIM ONARIM GİDERLERİ',
  '730.06.005': 'FABRİKA MAKİNE BAKIM ONARIM GİDERİ',
  '730.10.004': 'MAKİNA KİRALAMA GİDERİ',
};

export interface CsvItem {
  item_code?: string | null;
  quantity?: number | string | null;
  quantity_to_purchase?: number | string | null;
  item_description?: string | null;
  specifications?: string | null;
  item_specifications?: string | null;
}

function exportNumber(value: number | string): string {
  const n = typeof value === 'number' ? value : Number.parseFloat(value);
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Legacy exportItemsToCSV: `S|G;code;quantity to purchase;DD.MM.YYYY;description|specs`
 * per line, no header.
 */
export function itemsCsv(items: readonly CsvItem[], neededDate: string | null | undefined): string {
  const parts = (neededDate || '').split('-');
  const date = parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : '';
  return items
    .map((item) => {
      const code = item.item_code || '';
      const quantity = exportNumber(item.quantity_to_purchase || item.quantity || 0);
      const prefix = Object.prototype.hasOwnProperty.call(ITEM_CODE_NAMES, code) ? 'G' : 'S';
      const description = [
        item.item_description || '',
        item.specifications || item.item_specifications || '',
      ]
        .filter((part) => part && part.trim())
        .join('|');
      return `${prefix};${code};${quantity};${date};${description}`;
    })
    .join('\n');
}

export function csvFileName(
  departmentRequestId?: number | string | null,
  today = new Date(),
): string {
  return departmentRequestId
    ? `planlama_talebi_urunleri_${departmentRequestId}.csv`
    : `planlama_talebi_urunleri_${today.toISOString().split('T')[0]}.csv`;
}

// ---------------------------------------------------------------------------
// Excel import

export type ExcelField =
  | 'item_code'
  | 'item_name'
  | 'job_no'
  | 'item_description'
  | 'specifications'
  | 'quantity'
  | 'unit';

export type ColumnMapping = Record<ExcelField, number>;

export const EXCEL_FIELDS: { key: ExcelField; label: string; required: boolean }[] = [
  { key: 'item_code', label: 'Ürün Kodu (Kodu)', required: true },
  { key: 'item_name', label: 'Ürün Adı (ismi)', required: true },
  { key: 'job_no', label: 'İş No (srm.mrk.)', required: true },
  { key: 'quantity', label: 'Miktar', required: true },
  { key: 'unit', label: 'Birim', required: true },
  { key: 'item_description', label: 'Ürün Açıklaması (Açıklama 1)', required: false },
  { key: 'specifications', label: 'Özellikler (Açıklama 2)', required: false },
];

/** Lower case, Turkish letters folded, no spaces or dots. */
export function normalizeTurkish(value: unknown): string {
  if (!value) return '';
  return String(value)
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/\s+/g, '')
    .replace(/\./g, '');
}

// Order matters: specifications before item_description so "Açıklama 2" isn't taken as "Açıklama".
const COLUMN_KEYWORDS: [ExcelField, string[]][] = [
  [
    'item_code',
    [
      'kodu',
      'kod',
      'code',
      'urunkodu',
      'stokkodu',
      'malzemekodu',
      'productcode',
      'itemcode',
      'stokno',
      'malzemekod',
      'urunno',
    ],
  ],
  [
    'item_name',
    [
      'ismi',
      'isim',
      'name',
      'urnadi',
      'urnad',
      'malzemeadi',
      'malzemead',
      'productname',
      'itemname',
      'urnismi',
      'urnisim',
      'malzemeismi',
      'malzemeisim',
      'ad',
      'adi',
      'adı',
    ],
  ],
  [
    'job_no',
    [
      'srmmrk',
      'srnmrk',
      'isno',
      'jobno',
      'jobnumber',
      'workno',
      'isnumara',
      'jobnumara',
      'srnmrkno',
      'srnmrknumarasi',
      'srnmrknumara',
      'srmmrkno',
      'srmmrknumara',
    ],
  ],
  [
    'specifications',
    [
      'aciklama2',
      'description2',
      'ozellikler',
      'specifications',
      'specs',
      'ozellik',
      'specification',
      'spec',
    ],
  ],
  [
    'item_description',
    [
      'aciklama1',
      'description1',
      'urnaciklamasi',
      'urnaciklama',
      'malzemeaciklamasi',
      'malzemeaciklama',
      'productdescription',
      'itemdescription',
      'aciklama',
    ],
  ],
  [
    'quantity',
    [
      'miktar',
      'quantity',
      'qty',
      'adet',
      'sayi',
      'number',
      'amount',
      'miktari',
      'miktarı',
      'adeti',
      'adetı',
    ],
  ],
  ['unit', ['birim', 'unit', 'olcu', 'measure', 'uom', 'measurement', 'olcubirimi', 'birimi']],
];

export function emptyMapping(): ColumnMapping {
  return {
    item_code: -1,
    item_name: -1,
    job_no: -1,
    item_description: -1,
    specifications: -1,
    quantity: -1,
    unit: -1,
  };
}

/** Legacy detectExcelColumnMapping: exact or contained keyword (3+ letters), longest first. */
export function detectColumnMapping(headers: readonly unknown[]): ColumnMapping {
  const mapping = emptyMapping();
  headers.forEach((header, index) => {
    if (!header) return;
    const normalized = normalizeTurkish(String(header).trim());
    for (const [field, keywords] of COLUMN_KEYWORDS) {
      if (mapping[field] !== -1) continue;
      const sorted = [...keywords].sort((a, b) => b.length - a.length);
      for (const keyword of sorted) {
        const k = normalizeTurkish(keyword);
        if (normalized === k || (normalized.includes(k) && k.length >= 3)) {
          mapping[field] = index;
          break;
        }
      }
    }
  });
  return mapping;
}

export function missingRequired(mapping: ColumnMapping): ExcelField[] {
  return EXCEL_FIELDS.filter((f) => f.required && mapping[f.key] === -1).map((f) => f.key);
}

/** Legacy parseCSV: `;` when the text has one, else `,`; quoted fields and `""`. */
export function parseCsv(text: string): string[][] {
  const result: string[][] = [];
  const delimiter = text.includes(';') ? ';' : ',';
  let line: string[] = [];
  let field = '';
  let quoted = false;
  const pushLine = () => {
    if (line.length > 0 && line.some((f) => f.length > 0)) result.push(line);
    line = [];
  };
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        field += '"';
        i += 2;
      } else {
        quoted = !quoted;
        i++;
      }
      continue;
    }
    if (!quoted && (char === delimiter || char === '\n' || char === '\r')) {
      line.push(field.trim());
      field = '';
      if (char === '\n' || (char === '\r' && next === '\n')) {
        pushLine();
        i += char === '\r' ? 2 : 1;
        continue;
      }
      i++;
      continue;
    }
    field += char;
    i++;
  }
  if (field.length > 0 || line.length > 0) {
    line.push(field.trim());
    pushLine();
  }
  return result;
}

/** Legacy normalizeUnitValue: a unit value or label, else the lower-cased text. */
export function normalizeUnit(value: string): string {
  if (!value) return 'adet';
  const n = value.trim().toLowerCase();
  const byValue = UNIT_CHOICES.find((u) => u.value === n);
  if (byValue) return byValue.value;
  const byLabel = UNIT_CHOICES.find((u) => u.label.toLowerCase() === n);
  return byLabel ? byLabel.value : n;
}

export function parseQuantity(value: string): number {
  if (!value) return 0;
  const n = Number.parseFloat(value.replace(',', '.'));
  return Number.isNaN(n) ? 0 : n;
}

export interface ImportedItem {
  item_code: string;
  item_name: string;
  job_no: string;
  quantity: number;
  unit: string;
  item_description: string;
  specifications: string;
}

export interface ImportResult {
  items: ImportedItem[];
  errors: string[];
  skipped: number;
}

const cell = (row: readonly unknown[], column: number) => {
  if (column === -1 || column >= row.length) return '';
  const value = row[column];
  return value ? String(value).trim() : '';
};

/** Legacy processExcelDataWithMapping: invalid rows are skipped with a message each. */
export function processRows(
  dataRows: readonly (readonly unknown[])[],
  mapping: ColumnMapping,
): ImportResult {
  const items: ImportedItem[] = [];
  const errors: string[] = [];
  let skipped = 0;
  dataRows.forEach((row, index) => {
    if (!row || row.length === 0) {
      skipped++;
      return;
    }
    const item: ImportedItem = {
      item_code: cell(row, mapping.item_code),
      item_name: cell(row, mapping.item_name),
      job_no: cell(row, mapping.job_no),
      quantity: parseQuantity(cell(row, mapping.quantity)),
      unit: normalizeUnit(cell(row, mapping.unit)),
      item_description: cell(row, mapping.item_description),
      specifications: cell(row, mapping.specifications),
    };
    const line = index + 2;
    const problems: string[] = [];
    if (!item.item_code) problems.push(`Satır ${line}: Ürün kodu eksik - satır atlandı`);
    if (!item.item_name) problems.push(`Satır ${line}: Ürün adı eksik - satır atlandı`);
    if (!item.job_no) problems.push(`Satır ${line}: İş no eksik - satır atlandı`);
    if (item.quantity <= 0) problems.push(`Satır ${line}: Geçersiz miktar değeri - satır atlandı`);
    if (!item.unit) problems.push(`Satır ${line}: Birim eksik - satır atlandı`);
    if (problems.length > 0) {
      errors.push(...problems);
      skipped += problems.length;
      return;
    }
    items.push(item);
  });
  return { items, errors, skipped };
}

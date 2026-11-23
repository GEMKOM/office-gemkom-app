import { queryOptions } from '@tanstack/react-query';
import { apiFetch, type QueryParams } from '../client';
import { toPaginated } from '../types';

// Port of apis/planning/planningRequests.js and the release_inventory call of
// apis/planning/planningRequestItems.js, the parts the planning
// department-requests page uses. The legacy modules stay for their other users.

const BASE = '/planning/requests/';

export interface PlanningRequestFile {
  id?: number;
  asset_id?: number | string | null;
  file_name?: string | null;
  file_url?: string | null;
  description?: string | null;
  uploaded_at?: string | null;
  uploaded_by_username?: string | null;
  [key: string]: unknown;
}

export interface PurchaseRequestInfo {
  request_number?: string | null;
  status?: string | null;
  [key: string]: unknown;
}

export interface PlanningRequestItem {
  id?: number;
  item_id?: number | null;
  item_code?: string | null;
  item_name?: string | null;
  item_description?: string | null;
  item_unit?: string | null;
  job_no?: string | null;
  quantity?: number | string | null;
  quantity_from_inventory?: number | string | null;
  quantity_to_purchase?: number | string | null;
  quantity_in_active_prs?: number | string | null;
  priority?: string | null;
  specifications?: string | null;
  item_specifications?: string | null;
  is_converted?: boolean;
  is_deletable?: boolean;
  item_material_class?: string | null;
  size_mode?: SizeMode | null;
  piece_width_mm?: string | null;
  piece_length_mm?: string | null;
  piece_count?: number | null;
  size_label?: string | null;
  /** Plate / bar lines: the size as one text ("1500×6000 mm × 2 adet · 1.413 kg"); '' otherwise. */
  size_summary?: string | null;
  files?: PlanningRequestFile[];
  purchase_request_info?: PurchaseRequestInfo[] | null;
  [key: string]: unknown;
}

export interface PlanningRequest {
  id: number;
  request_number?: string | null;
  title?: string | null;
  description?: string | null;
  priority?: string | null;
  needed_date?: string | null;
  status?: string | null;
  status_label?: string | null;
  erp_code?: string | null;
  check_inventory?: boolean | null;
  department_request?: number | null;
  created_by_username?: string | null;
  created_by_full_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  ready_at?: string | null;
  converted_at?: string | null;
  items_count?: number | null;
  items?: PlanningRequestItem[];
  files?: PlanningRequestFile[];
  [key: string]: unknown;
}

export type AttachTarget = 'request' | number;

/** One `items` entry of a create or update. */
export interface PlanningRequestItemInput {
  /** The existing line on an update, so the backend updates that line. */
  id?: number;
  item_id?: number;
  item_code?: string;
  item_name?: string;
  item_description?: string;
  item_unit?: string;
  job_no: string;
  quantity: number;
  specifications?: string;
  /** The department request row a line came from. */
  source_item_index?: number;
  /** Plate / boy lines in sizes: standard / custom size + count, or any size. */
  size_mode?: SizeMode;
  piece_width_mm?: string | null;
  piece_length_mm?: string | null;
  piece_count?: number | null;
}

export type SizeMode = '' | 'standard' | 'custom' | 'any';

/** GET /planning/standard-sizes/: what plate / boy lines pick from. */
export interface StandardSizes {
  plate: { width_mm: number; length_mm: number; label: string }[];
  bar: { length_mm: number; label: string }[];
}

export function standardSizesQueryOptions() {
  return queryOptions({
    queryKey: ['planning', 'standard-sizes'] as const,
    queryFn: ({ signal }) => apiFetch<StandardSizes>('/planning/standard-sizes/', { signal }),
    staleTime: Infinity,
  });
}

/** A new upload (`file`) or an existing asset (`asset_id`), with its targets. */
export interface PlanningRequestFileInput {
  file?: File;
  asset_id?: number | string | null;
  description?: string;
  attach_to: AttachTarget[];
}

export interface PlanningRequestInput {
  department_request_id?: number;
  title?: string;
  description?: string;
  needed_date?: string | null;
  priority?: string;
  request_number?: string;
  check_inventory?: boolean;
  items?: PlanningRequestItemInput[];
  files?: PlanningRequestFileInput[];
}

const keys = {
  all: ['planningRequests'] as const,
  list: (params: QueryParams) => ['planningRequests', 'list', params] as const,
  detail: (id: number | string) => ['planningRequests', 'detail', String(id)] as const,
};

export const planningRequestKeys = keys;

/** Port of getPlanningRequests. */
export function planningRequestsQueryOptions(params: QueryParams) {
  return queryOptions({
    queryKey: keys.list(params),
    queryFn: async ({ signal }) =>
      toPaginated<PlanningRequest>(await apiFetch<unknown>(BASE, { params, signal })),
  });
}

/**
 * Depo › Stok Kontrolü: planning requests sent for a warehouse stock check
 * (check_inventory). `status: 'pending_inventory'` lists those still waiting.
 */
export function warehouseRequestsQueryOptions(params: QueryParams) {
  return queryOptions({
    queryKey: ['planningRequests', 'warehouse', params] as const,
    queryFn: async ({ signal }) =>
      toPaginated<PlanningRequest>(
        await apiFetch<unknown>(`${BASE}warehouse_requests/`, { params, signal }),
      ),
  });
}

/**
 * The warehouse's stock check, in one go: how much of each line was found in
 * Hammadde. The backend moves that stock to İş Emri on each line's job and
 * closes the check (completed when everything came from stock, otherwise on
 * to purchasing). Plate / bar lines can't be filled from stock.
 */
export function submitStockCheck(
  id: number,
  items: { planning_request_item_id: number; quantity_found: string }[],
) {
  return apiFetch<{ detail?: string; planning_request?: PlanningRequest }>(
    `${BASE}${id}/update_inventory_quantities/`,
    { method: 'POST', body: { items } },
  );
}

/** Port of getPlanningRequest. */
export function planningRequestQueryOptions(id: number | string) {
  return queryOptions({
    queryKey: keys.detail(id),
    queryFn: ({ signal }) => apiFetch<PlanningRequest>(`${BASE}${id}/`, { signal }),
  });
}

/** `files[i].file` / `files[i].asset_id` / `.description` / `.attach_to` (JSON), as legacy sends them. */
function appendFiles(form: FormData, files: PlanningRequestFileInput[]) {
  files.forEach((file, index) => {
    if (!file.file && !file.asset_id) {
      throw new Error(`File at index ${index} must have either 'file' or 'asset_id'`);
    }
    if (file.file && file.asset_id) {
      throw new Error(`File at index ${index} cannot have both 'file' and 'asset_id'`);
    }
    if (file.file) form.append(`files[${index}].file`, file.file);
    else form.append(`files[${index}].asset_id`, String(file.asset_id));
    if (file.description) form.append(`files[${index}].description`, file.description);
    if (!file.attach_to || file.attach_to.length === 0) {
      throw new Error(
        `attach_to is required for file at index ${index} and must contain at least one target`,
      );
    }
    form.append(`files[${index}].attach_to`, JSON.stringify(file.attach_to));
  });
}

/** Port of createPlanningRequest: always multipart. */
export function createPlanningRequest(input: PlanningRequestInput): Promise<PlanningRequest> {
  const form = new FormData();
  const append = (key: string, value: string | number | boolean | null | undefined) => {
    if (value !== undefined && value !== null) form.append(key, String(value));
  };
  append('department_request_id', input.department_request_id);
  append('title', input.title);
  append('description', input.description);
  append('needed_date', input.needed_date);
  append('priority', input.priority);
  if (input.request_number && input.request_number.trim() !== '') {
    form.append('request_number', input.request_number);
  }
  append('check_inventory', input.check_inventory);
  if (input.items && input.items.length > 0) form.append('items', JSON.stringify(input.items));
  if (input.files && input.files.length > 0) appendFiles(form, input.files);
  return apiFetch<PlanningRequest>(BASE, { method: 'POST', body: form });
}

/**
 * Port of partialUpdatePlanningRequest: multipart when files are sent, JSON
 * otherwise. An empty `files` array goes as JSON (it clears the attachments).
 */
export function partialUpdatePlanningRequest(
  id: number,
  data: PlanningRequestInput,
): Promise<PlanningRequest> {
  if (data.files && data.files.length > 0) {
    const form = new FormData();
    const append = (key: string, value: string | boolean | null | undefined) => {
      if (value !== undefined && value !== null) form.append(key, String(value));
    };
    append('title', data.title);
    append('description', data.description);
    append('needed_date', data.needed_date);
    append('priority', data.priority);
    append('check_inventory', data.check_inventory);
    if (data.items !== undefined && data.items !== null) {
      form.append('items', JSON.stringify(data.items));
    }
    appendFiles(form, data.files);
    return apiFetch<PlanningRequest>(`${BASE}${id}/`, { method: 'PATCH', body: form });
  }
  return apiFetch<PlanningRequest>(`${BASE}${id}/`, { method: 'PATCH', body: data });
}

/** Port of cancelPlanningRequest (the endpoint takes no body). */
export function cancelPlanningRequest(id: number) {
  return apiFetch<PlanningRequest>(`${BASE}${id}/cancel/`, { method: 'POST' });
}

/** Port of markReadyForProcurement: the ERP code goes as both erp_code and request_number. */
export function markReadyForProcurement(id: number, erpCode: string) {
  const code = erpCode.trim();
  if (!code) return Promise.reject(new Error('ERP kodu gereklidir'));
  return apiFetch<unknown>(`${BASE}${id}/mark_ready_for_procurement/`, {
    method: 'POST',
    body: { erp_code: code, request_number: code },
  });
}

/** Port of releasePlanningRequestItemInventory: gives the line's stock back. */
export function releasePlanningItemInventory(itemId: number) {
  return apiFetch<unknown>(`/planning/items/${itemId}/release_inventory/`, { method: 'POST' });
}

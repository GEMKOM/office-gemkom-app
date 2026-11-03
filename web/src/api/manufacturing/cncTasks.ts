import { queryOptions } from '@tanstack/react-query';
import { apiFetch, apiUpload, cleanParams, type QueryParams } from '../client';
import type { PlanningItem } from '../planning/planningItems';
import { extractResults, toPaginated } from '../types';
import type { RemnantPlate } from './remnants';

// Port of apis/cnc_cutting/crud.js, parts.js and files.js (the CNC Kesimler
// page): CNC cutting tasks ("kesim"), their parts and files.

export type Decimal = string | number;

export interface CncPart {
  id: number;
  cnc_task?: string;
  job_no?: string | null;
  image_no?: string | null;
  position_no?: string | null;
  weight_kg?: Decimal | null;
  quantity?: number | null;
  [key: string]: unknown;
}

export interface CncTaskFile {
  id: number;
  file_name?: string | null;
  file_url: string;
  uploaded_at?: string | null;
  uploaded_by_username?: string | null;
  [key: string]: unknown;
}

/** A remnant plate as a cut's plate source (available_quantity: what is left of it). */
export type RemnantChoice = RemnantPlate & { available_quantity?: number | string | null };

export interface PlateUsageRecord {
  remnant_plate: number;
  remnant_plate_details?: RemnantChoice | null;
  quantity_used?: number | string | null;
  [key: string]: unknown;
}

export interface CncTask {
  key: string;
  id?: number;
  name?: string | null;
  nesting_id?: string | null;
  material?: string | null;
  dimensions?: string | null;
  thickness_mm?: Decimal | null;
  quantity?: number | null;
  machine_fk?: number | null;
  machine_name?: string | null;
  parts_count?: number | null;
  completion_date?: string | number | null;
  estimated_hours?: Decimal | null;
  total_hours_spent?: Decimal | null;
  // List payload: the plate source, flattened.
  planning_request_item?: number | null;
  plate_item_code?: string | null;
  plate_item_name?: string | null;
  plate_item_quantity?: Decimal | null;
  plate_item_delivered_quantity?: Decimal | null;
  plate_item_is_delivered?: boolean | null;
  has_remnant_plate?: boolean | null;
  // Detail payload.
  parts?: CncPart[];
  files?: CncTaskFile[];
  /** The remnant link (selected_plate_id is write-only on the backend). */
  plate_usage_records?: PlateUsageRecord[];
  /** The planning-item link. */
  plate_item?: PlanningItem | null;
  [key: string]: unknown;
}

export type CncTasksParams = QueryParams & {
  page?: number;
  page_size?: number;
  ordering?: string;
  key?: string;
  name?: string;
  nesting_id?: string;
  material?: string;
  machine_fk?: string;
  thickness_mm?: string;
  completion_date__isnull?: 'true' | 'false';
};

export const cncTaskKeys = {
  all: ['cncTasks'] as const,
  list: (params: CncTasksParams) => ['cncTasks', 'list', cleanParams(params)] as const,
  detail: (key: string) => ['cncTasks', 'detail', key] as const,
};

const BASE = '/cnc_cutting';
const taskPath = (key: string) => `${BASE}/tasks/${encodeURIComponent(key)}/`;

export function cncTasksQueryOptions(params: CncTasksParams) {
  return queryOptions({
    queryKey: cncTaskKeys.list(params),
    queryFn: async ({ signal }) =>
      toPaginated<CncTask>(await apiFetch<unknown>(`${BASE}/tasks/`, { params, signal })),
  });
}

export function cncTaskQueryOptions(key: string) {
  return queryOptions({
    queryKey: cncTaskKeys.detail(key),
    queryFn: ({ signal }) => apiFetch<CncTask>(taskPath(key), { signal }),
  });
}

export interface CncPartInput {
  job_no: string;
  image_no: string;
  position_no: string;
  weight_kg: number | null;
  quantity: number | null;
}

/** Create and edit share these; the backend derives material and thickness from the plate source. */
export interface CncTaskInput {
  name: string;
  nesting_id: string;
  dimensions: string;
  machine_fk: number | null;
  estimated_hours: number | null;
  quantity: number | null;
  selected_plate_id: number | null;
  quantity_used: number | null;
  planning_request_item_id: number | null;
  /** Sent only with a planning item. */
  mark_item_consumed?: boolean;
}

export interface CncTaskCreateInput extends CncTaskInput {
  files: File[];
  parts_data: CncPartInput[];
}

const present = (value: unknown) => value !== undefined && value !== null && value !== '';

function appendIf(form: FormData, name: string, value: unknown) {
  if (present(value)) form.append(name, String(value));
}

function appendConsumed(form: FormData, value: boolean | undefined) {
  // Only an explicit boolean; the backend applies it only when the key is present.
  if (typeof value === 'boolean') form.append('mark_item_consumed', value ? 'true' : 'false');
}

/** createCncTask: multipart POST, parts as a JSON string, every file under `files`. */
export function createCncTask(input: CncTaskCreateInput) {
  const form = new FormData();
  form.append('name', input.name);
  form.append('nesting_id', input.nesting_id);
  appendIf(form, 'dimensions', input.dimensions);
  appendIf(form, 'machine_fk', input.machine_fk);
  appendIf(form, 'estimated_hours', input.estimated_hours);
  appendIf(form, 'quantity', input.quantity);
  appendIf(form, 'selected_plate_id', input.selected_plate_id);
  appendIf(form, 'quantity_used', input.quantity_used);
  appendIf(form, 'planning_request_item_id', input.planning_request_item_id);
  appendConsumed(form, input.mark_item_consumed);
  for (const file of input.files) form.append('files', file);
  if (input.parts_data.length) form.append('parts_data', JSON.stringify(input.parts_data));
  return apiFetch<CncTask>(`${BASE}/tasks/`, { method: 'POST', body: form });
}

/**
 * updateCncTask: multipart PATCH. Both plate-source keys always go out ('' clears)
 * so switching sources works; machine, hours and quantity only when set (legacy).
 */
export function updateCncTask(key: string, input: CncTaskInput) {
  const form = new FormData();
  form.append('name', input.name);
  form.append('nesting_id', input.nesting_id);
  form.append('dimensions', input.dimensions);
  appendIf(form, 'machine_fk', input.machine_fk);
  appendIf(form, 'estimated_hours', input.estimated_hours);
  appendIf(form, 'quantity', input.quantity);
  form.append(
    'selected_plate_id',
    input.selected_plate_id === null ? '' : String(input.selected_plate_id),
  );
  appendIf(form, 'quantity_used', input.quantity_used);
  form.append(
    'planning_request_item_id',
    input.planning_request_item_id === null ? '' : String(input.planning_request_item_id),
  );
  appendConsumed(form, input.mark_item_consumed);
  return apiFetch<CncTask>(taskPath(key), { method: 'PATCH', body: form });
}

export function deleteCncTask(key: string) {
  return apiFetch<void>(taskPath(key), { method: 'DELETE' });
}

/** apis/tasks.js markTaskCompleted / unmarkTaskCompleted with module 'cnc_cutting'. */
export function setCncTaskCompleted(key: string, completed: boolean) {
  return apiFetch<unknown>(`${BASE}/tasks/${completed ? 'mark' : 'unmark'}-completed/`, {
    method: 'POST',
    body: { key },
  });
}

/** addFilesToCncTask for one file, with upload progress (FileAttachments uploads one at a time). */
export function uploadCncTaskFile(
  key: string,
  file: File,
  options: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
) {
  const form = new FormData();
  form.append('files', file);
  return apiUpload<unknown>(`${taskPath(key)}add-file/`, form, options);
}

export function deleteCncFile(id: number | string) {
  return apiFetch<void>(`${BASE}/files/${id}/`, { method: 'DELETE' });
}

// ---- parts ----

export function fetchCncParts(taskKey: string) {
  return apiFetch<unknown>(`${BASE}/parts/`, { params: { cnc_task: taskKey } }).then((data) =>
    extractResults<CncPart>(data),
  );
}

export function createCncPart(data: CncPartInput & { cnc_task: string }) {
  return apiFetch<CncPart>(`${BASE}/parts/`, { method: 'POST', body: data });
}

export function bulkCreateCncParts(data: (CncPartInput & { cnc_task: string })[]) {
  return apiFetch<unknown>(`${BASE}/parts/bulk-create/`, { method: 'POST', body: data });
}

export function updateCncPart(id: number, data: Partial<CncPartInput>) {
  return apiFetch<CncPart>(`${BASE}/parts/${id}/`, { method: 'PATCH', body: data });
}

export function deleteCncPart(id: number) {
  return apiFetch<void>(`${BASE}/parts/${id}/`, { method: 'DELETE' });
}

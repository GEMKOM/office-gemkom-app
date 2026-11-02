import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { apiFetch, cleanParams, type QueryParams } from '../client';
import { toPaginated, type Paginated } from '../types';

// Port of apis/projects/departmentTasks.js (and the consultation calls of
// apis/sales/departmentTasks.js), as much as the department task pages use.

export interface ReleaseApprovalState {
  approval_count?: number;
  required_count?: number;
  has_lead_approval?: boolean;
}

export interface TaskFile {
  id: number;
  file_url: string;
  filename?: string;
  name?: string;
  file_type?: string;
  file_type_display?: string;
  file_size?: number | null;
  [key: string]: unknown;
}

export interface TaskComment {
  id: number;
  content: string;
  created_by_name?: string;
  created_by_username?: string;
  created_at?: string;
  is_edited?: boolean;
  mentioned_users_data?: { username: string; full_name?: string }[];
  mentioned_groups_data?: { id: number | string; name: string; display_name?: string }[];
  [key: string]: unknown;
}

export interface SiblingConsultTask {
  id: number;
  department?: string;
  department_display?: string;
  status?: string;
  status_display?: string;
  [key: string]: unknown;
}

export interface OfferSummary {
  offer_no?: string;
  title?: string;
  description?: string;
  delivery_date_requested?: string | null;
  offer_owner_name?: string;
  incoterms?: string;
  delivery_place?: string;
  [key: string]: unknown;
}

export interface WeightAllocation {
  subcontractor_id?: number;
  subcontractor_name?: string;
  team_name?: string;
  allocated_weight_kg?: string | number | null;
}

/** A row of GET /projects/department-tasks/ (and the detail view). Loose on purpose. */
export interface DepartmentTask {
  id: number;
  title?: string;
  description?: string | null;
  notes?: string | null;
  department?: string;
  department_display?: string;
  status?: string;
  status_display?: string;
  /** Job order number; null for a standalone task. */
  job_order?: string | null;
  job_order_title?: string | null;
  customer_name?: string | null;
  parent?: number | null;
  sequence?: number | null;
  /** Legacy: machining_part / cnc_part rows. */
  type?: string | null;
  /** part, welding, painting, subcontracting, internal_team, procurement_item, sales_consult... */
  task_type?: string | null;
  assigned_to?: number | null;
  assigned_to_name?: string | null;
  target_start_date?: string | null;
  target_completion_date?: string | null;
  estimated_duration_wd?: number | string | null;
  derived_duration_wd?: number | string | null;
  derived_durations?: Record<string, number | string | null> | null;
  completion_percentage?: number | string | null;
  weight?: number | string | null;
  subtasks_count?: number;
  can_start?: boolean;
  is_under_revision?: boolean;
  current_release_id?: number | null;
  active_revision_release_id?: number | null;
  pending_approval_release_id?: number | null;
  pending_release_approval_state?: ReleaseApprovalState | null;
  rejected_release_id?: number | null;
  qc_required?: boolean;
  qc_status?: string | null;
  has_qc_approval?: boolean;
  is_consultation?: boolean;
  offer_summary?: OfferSummary | null;
  offer_no?: string | null;
  shared_files?: TaskFile[];
  completion_files?: TaskFile[];
  sibling_consult_tasks?: SiblingConsultTask[];
  discussion_topic?: { id?: number; comments?: TaskComment[] } | null;
  completed_by_name?: string | null;
  completed_at?: string | null;
  // procurement_item rows
  purchase_request_number?: string | null;
  planning_request_number?: string | null;
  planning_request_item_id?: number | null;
  is_delivered?: boolean | null;
  is_partially_delivered?: boolean;
  quantity?: number | string | null;
  delivered_quantity?: number | string | null;
  item_unit?: string | null;
  // machining / cnc rows
  key?: string | null;
  machining_data?: {
    key?: string;
    other_job_nos?: string[];
    allocated_quantity?: number | string | null;
    quantity?: number | string | null;
  } | null;
  cnc_data?: { cnc_task_key?: string } | null;
  // planning / manufacturing columns
  assigned_subcontractors?: WeightAllocation[] | null;
  assigned_teams?: WeightAllocation[] | null;
  job_order_total_weight_kg?: number | string | null;
  is_manufacturing_main?: boolean;
  erp_product_codes?: string | null;
  [key: string]: unknown;
}

export interface StatusChoice {
  value: string;
  label: string;
  color?: string;
}

export interface DepartmentChoice {
  value: string;
  label: string;
}

/** Static fallbacks of legacy STATUS_OPTIONS / DEPARTMENT_OPTIONS. */
export const STATUS_OPTIONS: StatusChoice[] = [
  { value: 'pending', label: 'Bekliyor', color: 'yellow' },
  { value: 'in_progress', label: 'Devam Ediyor', color: 'blue' },
  { value: 'blocked', label: 'Engellendi', color: 'red' },
  { value: 'completed', label: 'Tamamlandı', color: 'green' },
  { value: 'skipped', label: 'Atlandı', color: 'grey' },
];

export const DEPARTMENT_OPTIONS: DepartmentChoice[] = [
  { value: 'design', label: 'Tasarım' },
  { value: 'planning', label: 'Planlama' },
  { value: 'procurement', label: 'Satın Alma' },
  { value: 'manufacturing', label: 'Üretim' },
  { value: 'painting', label: 'Boya' },
  { value: 'logistics', label: 'Lojistik' },
];

/** The params legacy listDepartmentTasks forwards; anything else it silently dropped. */
export interface DepartmentTaskListParams {
  job_order?: string;
  department?: string;
  department__in?: string;
  status?: string;
  status__in?: string;
  assigned_to?: number;
  assigned_to__isnull?: boolean;
  parent?: number;
  parent__isnull?: boolean;
  is_blocked?: boolean;
  main_only?: boolean;
  customer?: number;
  search?: string;
  date_range_start?: string;
  date_range_end?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
  has_pending_revision?: boolean;
}

const LISTED_PARAMS: (keyof DepartmentTaskListParams)[] = [
  'job_order',
  'department',
  'department__in',
  'status',
  'status__in',
  'assigned_to',
  'assigned_to__isnull',
  'parent',
  'parent__isnull',
  'is_blocked',
  'main_only',
  'customer',
  'search',
  'date_range_start',
  'date_range_end',
  'ordering',
  'page',
  'page_size',
  'has_pending_revision',
];

/** Same whitelist as legacy listDepartmentTasks (in the same order). */
export function listParams(params: DepartmentTaskListParams): QueryParams {
  const out: QueryParams = {};
  for (const key of LISTED_PARAMS) {
    const value = params[key];
    if (value === undefined || value === null) continue;
    // Legacy skipped falsy strings/numbers but sent `false` booleans.
    if (typeof value !== 'boolean' && !value) continue;
    out[key] = value;
  }
  return out;
}

export const DEPARTMENT_TASKS_STALE_TIME = 30_000;
const BASE = '/projects/department-tasks';

export const departmentTaskKeys = {
  all: ['departmentTasks'] as const,
  lists: ['departmentTasks', 'list'] as const,
  list: (params: DepartmentTaskListParams) =>
    ['departmentTasks', 'list', cleanParams(listParams(params))] as const,
  subtasks: ['departmentTasks', 'subtasks'] as const,
  subtasksOf: (department: string, parentId: number) =>
    ['departmentTasks', 'subtasks', department, parentId] as const,
  detail: (id: number | string) => ['departmentTasks', 'detail', String(id)] as const,
  statusChoices: ['departmentTasks', 'statusChoices'] as const,
  departmentChoices: ['departmentTasks', 'departmentChoices'] as const,
};

export function fetchDepartmentTasks(
  params: DepartmentTaskListParams,
  signal?: AbortSignal,
): Promise<Paginated<DepartmentTask>> {
  return apiFetch<unknown>(`${BASE}/`, { params: listParams(params), signal }).then((data) =>
    toPaginated<DepartmentTask>(data),
  );
}

export function departmentTasksQueryOptions(params: DepartmentTaskListParams) {
  return queryOptions({
    queryKey: departmentTaskKeys.list(params),
    queryFn: ({ signal }) => fetchDepartmentTasks(params, signal),
    staleTime: DEPARTMENT_TASKS_STALE_TIME,
  });
}

/** Legacy fetchTaskSubtasks: { department, parent, ordering: 'sequence' }, first page. */
export function subtasksQueryOptions(department: string, parentId: number) {
  return queryOptions({
    queryKey: departmentTaskKeys.subtasksOf(department, parentId),
    queryFn: async ({ signal }) =>
      (await fetchDepartmentTasks({ department, parent: parentId, ordering: 'sequence' }, signal))
        .results,
    // Legacy always refetched on expand.
    staleTime: 0,
  });
}

export function getDepartmentTask(
  id: number | string,
  signal?: AbortSignal,
): Promise<DepartmentTask> {
  return apiFetch<DepartmentTask>(`${BASE}/${id}/`, { signal });
}

export function departmentTaskQueryOptions(id: number | string) {
  return queryOptions({
    queryKey: departmentTaskKeys.detail(id),
    queryFn: ({ signal }) => getDepartmentTask(id, signal),
    // Legacy fetched the task fresh every time the modal opened.
    staleTime: 0,
  });
}

/** Legacy STATUS_COLOR_MAP: the badge colour is fixed per status, whatever the API says. */
const STATUS_COLOR_MAP: Record<string, string> = {
  pending: 'yellow',
  in_progress: 'blue',
  blocked: 'red',
  completed: 'green',
  skipped: 'grey',
};

export function normalizeStatusColors(options: StatusChoice[]): StatusChoice[] {
  return options.map((s) => ({ ...s, color: STATUS_COLOR_MAP[s.value] ?? s.color ?? 'grey' }));
}

/** getStatusChoices, falling back to STATUS_OPTIONS like legacy. */
export function statusChoicesQueryOptions() {
  return queryOptions({
    queryKey: departmentTaskKeys.statusChoices,
    queryFn: async ({ signal }) => {
      try {
        const data = await apiFetch<StatusChoice[]>(`${BASE}/status_choices/`, { signal });
        return normalizeStatusColors(Array.isArray(data) ? data : STATUS_OPTIONS);
      } catch (error) {
        if ((error as Error).name === 'AbortError') throw error;
        return normalizeStatusColors(STATUS_OPTIONS);
      }
    },
    staleTime: Infinity,
  });
}

export function departmentChoicesQueryOptions() {
  return queryOptions({
    queryKey: departmentTaskKeys.departmentChoices,
    queryFn: async ({ signal }) => {
      try {
        const data = await apiFetch<DepartmentChoice[]>(`${BASE}/department_choices/`, { signal });
        return Array.isArray(data) ? data : DEPARTMENT_OPTIONS;
      } catch (error) {
        if ((error as Error).name === 'AbortError') throw error;
        return DEPARTMENT_OPTIONS;
      }
    },
    staleTime: Infinity,
  });
}

// ---- writes -----------------------------------------------------------------

/** What start/complete/skip/... answer: { status, message, task }. */
export interface TaskActionResponse {
  status?: string;
  message?: string;
  task?: DepartmentTask;
  [key: string]: unknown;
}

export function patchDepartmentTask(id: number, data: Record<string, unknown>) {
  return apiFetch<DepartmentTask>(`${BASE}/${id}/`, { method: 'PATCH', body: data });
}

export function createDepartmentTask(data: Record<string, unknown>) {
  return apiFetch<DepartmentTask>(`${BASE}/`, { method: 'POST', body: data });
}

export function deleteDepartmentTask(id: number) {
  return apiFetch<void>(`${BASE}/${id}/`, { method: 'DELETE' });
}

export function startDepartmentTask(id: number) {
  return apiFetch<TaskActionResponse>(`${BASE}/${id}/start/`, { method: 'POST', body: {} });
}

/** Legacy completeDepartmentTask: only erp_acknowledged / notes when given. */
export function completeDepartmentTask(
  id: number,
  options: { erp_acknowledged?: boolean; notes?: string } = {},
) {
  const body: Record<string, unknown> = {};
  if (options.erp_acknowledged !== undefined) body.erp_acknowledged = options.erp_acknowledged;
  if (options.notes !== undefined && options.notes !== null) body.notes = options.notes;
  return apiFetch<TaskActionResponse>(`${BASE}/${id}/complete/`, { method: 'POST', body });
}

export function uncompleteDepartmentTask(id: number) {
  return apiFetch<TaskActionResponse>(`${BASE}/${id}/uncomplete/`, { method: 'POST', body: {} });
}

export function skipDepartmentTask(id: number) {
  return apiFetch<TaskActionResponse>(`${BASE}/${id}/skip/`, { method: 'POST', body: {} });
}

export function unskipDepartmentTask(id: number) {
  return apiFetch<TaskActionResponse>(`${BASE}/${id}/unskip/`, { method: 'POST', body: {} });
}

export interface BulkSubtaskNode {
  title: string;
  task_type: string;
  sequence: number;
  weight: number;
  subtasks: BulkSubtaskNode[];
}

export function bulkCreateSubtasks(parentId: number, tasks: BulkSubtaskNode[]) {
  return apiFetch<{ message?: string; tasks?: unknown[] }>(
    `${BASE}/${parentId}/bulk_create_subtasks/`,
    {
      method: 'POST',
      body: { tasks },
    },
  );
}

// Consultation (sales_consult) tasks: apis/sales/departmentTasks.js.

export function startConsultTask(id: number) {
  return apiFetch<unknown>(`${BASE}/${id}/start/`, { method: 'POST', body: {} });
}

export function completeConsultTask(id: number, notes = '') {
  return apiFetch<unknown>(`${BASE}/${id}/complete/`, { method: 'POST', body: { notes } });
}

export function uploadConsultTaskFile(id: number, file: File, name = '') {
  const formData = new FormData();
  formData.append('file', file);
  if (name) formData.append('name', name);
  return apiFetch<unknown>(`${BASE}/${id}/upload-file/`, { method: 'POST', body: formData });
}

export function deleteConsultTaskFile(taskId: number, fileId: number) {
  return apiFetch<void>(`${BASE}/${taskId}/files/${fileId}/`, { method: 'DELETE' });
}

/** Every page of the list for the export (legacy exportTasks). */
export async function fetchAllDepartmentTasks(
  params: DepartmentTaskListParams,
): Promise<DepartmentTask[]> {
  const all: DepartmentTask[] = [];
  for (let page = 1; ; page++) {
    const response = await fetchDepartmentTasks({ ...params, page });
    all.push(...response.results);
    if (!response.next || response.results.length === 0) break;
  }
  return all;
}

// ---- cache helpers ----------------------------------------------------------

/**
 * Puts a fresh task over its old copy wherever it is cached (list pages,
 * expanded subtasks, the detail), so only that row re-renders. Returns
 * whether any list held it (legacy updateTaskInLocalData).
 */
export function replaceTaskInCache(queryClient: QueryClient, task: DepartmentTask): boolean {
  let found = false;
  queryClient.setQueriesData<Paginated<DepartmentTask>>(
    { queryKey: departmentTaskKeys.lists },
    (page) => {
      if (!page || !page.results.some((t) => t.id === task.id)) return page;
      found = true;
      return { ...page, results: page.results.map((t) => (t.id === task.id ? task : t)) };
    },
  );
  queryClient.setQueriesData<DepartmentTask[]>(
    { queryKey: departmentTaskKeys.subtasks },
    (rows) => {
      if (!rows || !rows.some((t) => t.id === task.id)) return rows;
      found = true;
      return rows.map((t) => (t.id === task.id ? task : t));
    },
  );
  return found;
}

/** Merges a few fields into a cached task (after an inline edit). */
export function patchTaskInCache(
  queryClient: QueryClient,
  id: number,
  patch: Partial<DepartmentTask>,
): void {
  const merge = (t: DepartmentTask) => (t.id === id ? { ...t, ...patch } : t);
  queryClient.setQueriesData<Paginated<DepartmentTask>>(
    { queryKey: departmentTaskKeys.lists },
    (page) =>
      page && page.results.some((t) => t.id === id)
        ? { ...page, results: page.results.map(merge) }
        : page,
  );
  queryClient.setQueriesData<DepartmentTask[]>({ queryKey: departmentTaskKeys.subtasks }, (rows) =>
    rows && rows.some((t) => t.id === id) ? rows.map(merge) : rows,
  );
}

/** Refetches one task and swaps it into the cached rows. */
export async function refreshTaskRow(
  queryClient: QueryClient,
  id: number,
): Promise<DepartmentTask | null> {
  try {
    const task = await queryClient.fetchQuery(departmentTaskQueryOptions(id));
    replaceTaskInCache(queryClient, task);
    return task;
  } catch {
    return null;
  }
}

// ---- delete eligibility (legacy checkDepartmentTaskDeleteEligibility) ----

function countOf(data: unknown): number {
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === 'object') {
    const page = data as { count?: number; results?: unknown[] };
    return page.count ?? page.results?.length ?? 0;
  }
  return 0;
}

/** CNC parts of a job (getCncParts({ job_no, page_size: 1 })). */
export async function countCncParts(jobNo: string | null | undefined): Promise<number> {
  return countOf(
    await apiFetch<unknown>('/cnc_cutting/parts/', { params: { job_no: jobNo, page_size: 1 } }),
  );
}

/** Machining parts of a job (machining getParts({ job_no, page_size: 1 })). */
export async function countMachiningParts(jobNo: string | null | undefined): Promise<number> {
  return countOf(
    await apiFetch<unknown>('/tasks/parts/', { params: { job_no: jobNo, page_size: 1 } }),
  );
}

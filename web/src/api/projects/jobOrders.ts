import { queryOptions, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { apiFetch, apiUpload, type ApiUploadOptions } from '../client';
import { qk } from '../keys';
import { extractResults, toPaginated, type Paginated } from '../types';

// Port of apis/projects/jobOrders.js: Proje Takibi (projects/project-tracking)
// and its Sunum Modu. The dropdown lives in api/reference/jobOrders.ts.
// Children come from the detail payload's `children` (there is no children/
// route); files in detail/parts.tsx (`/files/` returns two groups).

export type JobOrderStatus = 'draft' | 'active' | 'on_hold' | 'completed' | 'cancelled';

export interface TargetDateRevision {
  previous_date?: string | null;
  new_date?: string | null;
  reason?: string | null;
  changed_by_name?: string | null;
  changed_at?: string | null;
  [key: string]: unknown;
}

export interface JobOrder {
  job_no: string;
  title: string;
  description?: string | null;
  status: JobOrderStatus | string;
  status_display?: string;
  /** 'revision' when the hold waits on a drawing revision. */
  hold_kind?: string | null;
  hold_reason?: string | null;
  priority?: string;
  priority_display?: string;
  customer?: number | null;
  customer_name?: string | null;
  customer_short_name?: string | null;
  customer_code?: string | null;
  customer_order_no?: string | null;
  parent?: string | null;
  hierarchy_level?: number;
  children_count?: number;
  department_task_count?: number;
  completion_percentage?: number | string | null;
  quantity?: number | null;
  target_completion_date?: string | null;
  previous_target_date_revision?: TargetDateRevision | string | null;
  target_date_revisions?: TargetDateRevision[];
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  created_by_name?: string | null;
  updated_at?: string | null;
  incoterms?: string | null;
  general_expenses_rate?: number | string | null;
  estimated_cost?: number | string | null;
  cost_currency?: string | null;
  is_phase?: boolean;
  phase_number?: number | null;
  [key: string]: unknown;
}

export interface Choice {
  value: string;
  label: string;
}

/** Static fallback if the status choices endpoint fails. */
export const STATUS_OPTIONS: Choice[] = [
  { value: 'draft', label: 'Taslak' },
  { value: 'active', label: 'Aktif' },
  { value: 'on_hold', label: 'Beklemede' },
  { value: 'completed', label: 'Tamamlandı' },
  { value: 'cancelled', label: 'İptal Edildi' },
];

export const PRIORITY_OPTIONS: Choice[] = [
  { value: 'low', label: 'Düşük' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Yüksek' },
  { value: 'urgent', label: 'Acil' },
];

export const JOB_ORDER_FILE_TYPE_OPTIONS: Choice[] = [
  { value: 'drawing', label: 'Çizim' },
  { value: 'specification', label: 'Şartname' },
  { value: 'report', label: 'Rapor' },
  { value: 'photo', label: 'Fotoğraf' },
  { value: 'correspondence', label: 'Yazışma' },
  { value: 'other', label: 'Diğer' },
];

export type JobOrderListParams = {
  search?: string;
  status?: string;
  /** Comma-separated, e.g. "active,draft". */
  status__in?: string;
  priority?: string;
  priority__in?: string;
  customer?: number | string;
  parent?: string;
  parent__isnull?: boolean;
  root_only?: boolean;
  ordering?: string;
  page?: number;
  page_size?: number;
};

export const JOB_ORDERS_STALE_TIME = 30_000;

export const jobOrderKeys = {
  all: qk.jobOrders.all,
  lists: () => [...qk.jobOrders.all, 'list'] as const,
  list: (params: JobOrderListParams) => qk.jobOrders.list(params),
  detail: (jobNo: string) => qk.jobOrders.detail(jobNo),
  departmentTasks: (jobNo: string, params: Record<string, unknown> = {}) =>
    [...qk.jobOrders.all, 'departmentTasks', jobNo, params] as const,
  files: (jobNo: string) => [...qk.jobOrders.all, 'files', jobNo] as const,
  phases: (jobNo: string) => [...qk.jobOrders.all, 'phases', jobNo] as const,
  progressHistory: (jobNo: string) => [...qk.jobOrders.all, 'progressHistory', jobNo] as const,
  hierarchy: (jobNo: string) => [...qk.jobOrders.all, 'hierarchy', jobNo] as const,
  statusChoices: () => [...qk.jobOrders.all, 'statusChoices'] as const,
  productionPlan: (jobNo: string) => [...qk.jobOrders.all, 'productionPlan', jobNo] as const,
  overview: (status: string) => [...qk.jobOrders.all, 'overview', status] as const,
  planSheet: (jobNo: string) => [...qk.jobOrders.all, 'planSheet', jobNo] as const,
  taskPlanner: (jobNo: string) => [...qk.jobOrders.all, 'taskPlanner', jobNo] as const,
  meetingBrief: (jobNo: string) => [...qk.jobOrders.all, 'meetingBrief', jobNo] as const,
  meetingSection: (jobNo: string, section: string) =>
    [...qk.jobOrders.all, 'meetingBrief', jobNo, section] as const,
};

const enc = encodeURIComponent;
const base = (jobNo: string) => `/projects/job-orders/${enc(jobNo)}/`;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function fetchJobOrders(
  params: JobOrderListParams,
  signal?: AbortSignal,
): Promise<Paginated<JobOrder>> {
  return toPaginated<JobOrder>(
    await apiFetch<unknown>('/projects/job-orders/', { params, signal }),
  );
}

export function jobOrdersQueryOptions(params: JobOrderListParams) {
  return queryOptions({
    queryKey: jobOrderKeys.list(params),
    queryFn: ({ signal }) => fetchJobOrders(params, signal),
    staleTime: JOB_ORDERS_STALE_TIME,
  });
}

export function getJobOrder(jobNo: string, signal?: AbortSignal) {
  return apiFetch<JobOrder>(base(jobNo), { signal });
}

export function jobOrderQueryOptions(jobNo: string) {
  return queryOptions({
    queryKey: jobOrderKeys.detail(jobNo),
    queryFn: ({ signal }) => getJobOrder(jobNo, signal),
    staleTime: JOB_ORDERS_STALE_TIME,
  });
}

export type JobOrderDepartmentTaskParams = {
  department?: string;
  department__in?: string;
  status?: string;
  status__in?: string;
  assigned_to?: number;
  parent__isnull?: boolean;
  main_only?: boolean;
  ordering?: string;
  page?: number;
};

/** `/job-orders/{no}/department_tasks/`: the job's tasks, results unwrapped. */
export function jobOrderDepartmentTasksQueryOptions<T = Record<string, unknown>>(
  jobNo: string,
  params: JobOrderDepartmentTaskParams = {},
) {
  return queryOptions({
    queryKey: jobOrderKeys.departmentTasks(jobNo, params),
    queryFn: async ({ signal }) =>
      extractResults<T>(
        await apiFetch<unknown>(`${base(jobNo)}department_tasks/`, {
          params: { job_order: jobNo, ...params },
          signal,
        }),
      ),
    staleTime: JOB_ORDERS_STALE_TIME,
  });
}

export function jobOrderPhasesQueryOptions<T = Record<string, unknown>>(jobNo: string) {
  return queryOptions({
    queryKey: jobOrderKeys.phases(jobNo),
    queryFn: ({ signal }) => apiFetch<T>(`${base(jobNo)}phases/`, { signal }),
    staleTime: JOB_ORDERS_STALE_TIME,
  });
}

export function jobOrderProgressHistoryQueryOptions<T = Record<string, unknown>>(jobNo: string) {
  return queryOptions({
    queryKey: jobOrderKeys.progressHistory(jobNo),
    queryFn: ({ signal }) => apiFetch<T>(`${base(jobNo)}progress-history/`, { signal }),
    staleTime: JOB_ORDERS_STALE_TIME,
  });
}

export function jobOrderHierarchyQueryOptions<T = Record<string, unknown>>(jobNo: string) {
  return queryOptions({
    queryKey: jobOrderKeys.hierarchy(jobNo),
    queryFn: ({ signal }) => apiFetch<T>(`${base(jobNo)}hierarchy/`, { signal }),
    staleTime: JOB_ORDERS_STALE_TIME,
  });
}

/** Legacy fell back to STATUS_OPTIONS when the endpoint failed. */
export function jobOrderStatusChoicesQueryOptions() {
  return queryOptions({
    queryKey: jobOrderKeys.statusChoices(),
    queryFn: async ({ signal }) => {
      try {
        const data = await apiFetch<unknown>('/projects/job-orders/status_choices/', { signal });
        const rows = Array.isArray(data) ? (data as Choice[]) : extractResults<Choice>(data);
        return rows.length ? rows : STATUS_OPTIONS;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        return STATUS_OPTIONS;
      }
    },
    staleTime: Infinity,
  });
}

export function productionPlanQueryOptions<T = Record<string, unknown>>(jobNo: string) {
  return queryOptions({
    queryKey: jobOrderKeys.productionPlan(jobNo),
    queryFn: ({ signal }) => apiFetch<T>(`${base(jobNo)}production-plan/`, { signal }),
    staleTime: 60_000,
  });
}

/**
 * Portfolio overview (`{items, today, generated_at}`). The server serves a
 * snapshot; `refresh` recomputes it (a few seconds).
 */
export function fetchProductionPlanOverview<T = Record<string, unknown>>(
  status = 'active',
  { refresh = false, signal }: { refresh?: boolean; signal?: AbortSignal } = {},
) {
  return apiFetch<T>('/projects/job-orders/production-plan-overview/', {
    params: { status, refresh: refresh ? '1' : undefined },
    signal,
  });
}

export function productionPlanOverviewQueryOptions<T = Record<string, unknown>>(status = 'active') {
  return queryOptions({
    queryKey: jobOrderKeys.overview(status),
    queryFn: ({ signal }) => fetchProductionPlanOverview<T>(status, { signal }),
    staleTime: 60_000,
  });
}

export function planSheetQueryOptions<T = Record<string, unknown>>(jobNo: string) {
  return queryOptions({
    queryKey: jobOrderKeys.planSheet(jobNo),
    queryFn: ({ signal }) => apiFetch<T>(`${base(jobNo)}plan-sheet/`, { signal }),
    staleTime: 60_000,
  });
}

export function taskPlannerQueryOptions<T = Record<string, unknown>>(jobNo: string) {
  return queryOptions({
    queryKey: jobOrderKeys.taskPlanner(jobNo),
    queryFn: ({ signal }) => apiFetch<T>(`${base(jobNo)}task-planner/`, { signal }),
    staleTime: 0,
  });
}

export function meetingBriefQueryOptions<T = Record<string, unknown>>(jobNo: string) {
  return queryOptions({
    queryKey: jobOrderKeys.meetingBrief(jobNo),
    queryFn: ({ signal }) => apiFetch<T>(`${base(jobNo)}meeting-brief/`, { signal }),
    staleTime: 60_000,
  });
}

/** section: machining | cutting | quality | procurement | revisions | financial */
export function meetingSectionQueryOptions<T = Record<string, unknown>>(
  jobNo: string,
  section: string,
) {
  return queryOptions({
    queryKey: jobOrderKeys.meetingSection(jobNo, section),
    queryFn: ({ signal }) =>
      apiFetch<T>(`${base(jobNo)}meeting-brief/${enc(section)}/`, { signal }),
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export function createJobOrder(data: Record<string, unknown>) {
  return apiFetch<JobOrder>('/projects/job-orders/', { method: 'POST', body: data });
}

export function updateJobOrder(jobNo: string, data: Record<string, unknown>) {
  return apiFetch<JobOrder>(base(jobNo), { method: 'PATCH', body: data });
}

export function reviseTargetCompletionDate(
  jobNo: string,
  payload: { target_completion_date: string; target_date_change_reason: string },
) {
  return apiFetch<JobOrder>(base(jobNo), { method: 'PATCH', body: payload });
}

export interface JobOrderActionResponse {
  status?: string;
  message?: string;
  job_order?: JobOrder;
  [key: string]: unknown;
}

const action = (jobNo: string, name: string, body: unknown = {}) =>
  apiFetch<JobOrderActionResponse>(`${base(jobNo)}${name}/`, { method: 'POST', body });

export const startJobOrder = (jobNo: string) => action(jobNo, 'start');
export const completeJobOrder = (jobNo: string) => action(jobNo, 'complete');
export const holdJobOrder = (jobNo: string, options: { reason?: string } = {}) =>
  action(jobNo, 'hold', options);
export const resumeJobOrder = (jobNo: string) => action(jobNo, 'resume');
export const cancelJobOrder = (jobNo: string) => action(jobNo, 'cancel');
export const recalculateJobOrderProgress = (jobNo: string) => action(jobNo, 'recalculate_progress');
export const activateJobOrderPhase = (phaseJobNo: string) => action(phaseJobNo, 'activate-phase');
export const applyTemplateToJobOrder = (jobNo: string, options: { template_id: number }) =>
  action(jobNo, 'apply_template', options);

export interface PhaseInput {
  phase_number: number;
  title: string;
  target_completion_date?: string | null;
}

export interface PhaseAllocation {
  product_job_no: string;
  quantities: Record<number, number>;
}

export function createJobOrderPhases(
  jobNo: string,
  phases: PhaseInput[],
  allocations: PhaseAllocation[],
) {
  return apiFetch<JobOrderActionResponse>(`${base(jobNo)}create-phases/`, {
    method: 'POST',
    body: { phases, allocations },
  });
}

export function uploadJobOrderFile(
  jobNo: string,
  files: File | File[],
  fileType: string,
  options: ApiUploadOptions = {},
) {
  const formData = new FormData();
  for (const file of Array.isArray(files) ? files : [files]) formData.append('files', file);
  formData.append('file_type', fileType);
  return apiUpload<unknown>(`${base(jobNo)}upload_file/`, formData, options);
}

export interface PlanSheetShareInput {
  columns?: string[];
  options?: {
    expand_all?: boolean;
    main_only?: boolean;
    collapsed?: string[];
    show_header?: boolean;
    language?: string;
  };
  expires_in_days?: number;
  language?: string;
  [key: string]: unknown;
}

export function createPlanSheetShareLink<T = Record<string, unknown>>(
  jobNo: string,
  payload: PlanSheetShareInput = {},
) {
  return apiFetch<T>(`${base(jobNo)}plan-sheet/share/`, { method: 'POST', body: payload });
}

export function revokePlanSheetShareLink(jobNo: string, token: string) {
  return apiFetch<unknown>(`${base(jobNo)}plan-sheet/share/${enc(token)}/`, { method: 'DELETE' });
}

/** Everything under `jobOrders` (lists, details, children, tasks, files, sheets). */
export function useInvalidateJobOrders() {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: jobOrderKeys.all }),
    [queryClient],
  );
}

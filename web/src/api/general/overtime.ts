import { queryOptions } from '@tanstack/react-query';
import { apiFetch, isApiError, type QueryParams } from '../client';
import { extractResults, toPaginated, type Paginated } from '../types';

// Port of the apis/overtime.js functions the overtime pages (pending,
// registry, users, welding-report, machining-report, cost-report) call.

const BASE = '/overtime/requests/';

const keys = {
  all: ['overtime'] as const,
  requests: (params: object) => ['overtime', 'requests', params] as const,
  request: (id: number | string) => ['overtime', 'request', String(id)] as const,
  pending: (params: object) => ['overtime', 'pendingApproval', params] as const,
  decided: (params: object) => ['overtime', 'decisionByMe', params] as const,
  costImpact: (id: number | string) => ['overtime', 'costImpact', String(id)] as const,
  usersForDate: (date: string) => ['overtime', 'usersForDate', date] as const,
  weldingReport: (params: object) => ['overtime', 'weldingReport', params] as const,
  machiningReport: (params: object) => ['overtime', 'machiningReport', params] as const,
  machiningSummary: (params: object) => ['overtime', 'machiningSummary', params] as const,
  costReport: (params: object) => ['overtime', 'costReport', params] as const,
  weldingOperators: ['overtime', 'weldingOperators'] as const,
  machiningOperators: ['overtime', 'machiningOperators'] as const,
  operationsForJob: (jobNo: string) => ['overtime', 'operationsForJob', jobNo] as const,
};

/** Every overtime query; invalidate after a mutation. */
export const overtimeKeys = keys;

// ---------- types ----------

export type OvertimeStatus = 'submitted' | 'approved' | 'rejected' | 'cancelled' | (string & {});

export interface OvertimeApprover {
  id?: number;
  username?: string;
  full_name?: string;
}

export interface OvertimeDecision {
  decision?: string;
  comment?: string | null;
  approver_name?: string;
  approver_username?: string;
  decision_date?: string | null;
}

export interface OvertimeStage {
  name?: string;
  is_complete?: boolean;
  is_rejected?: boolean;
  required_approvals?: number;
  approved_count?: number;
  approvers?: OvertimeApprover[];
  approver_user_ids?: number[];
  decisions?: OvertimeDecision[];
}

export interface OvertimeApproval {
  stage_instances?: OvertimeStage[];
}

export interface OvertimeOperation {
  key: string;
  name?: string;
  part_key?: string | null;
  order?: number | null;
}

export interface OvertimeEntry {
  id: number;
  user_id?: number;
  user_full_name?: string;
  user_username?: string;
  username?: string;
  job_no?: string | null;
  description?: string | null;
  status?: string;
  status_label?: string;
  operations?: OvertimeOperation[];
}

export interface OvertimeRequest {
  id: number;
  requester?: number;
  requester_username?: string;
  team?: string | null;
  team_label?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  duration_hours?: number | string | null;
  total_users?: number | null;
  reason?: string | null;
  status?: OvertimeStatus;
  status_label?: string;
  created_at?: string | null;
  updated_at?: string | null;
  approval?: OvertimeApproval | null;
  entries?: OvertimeEntry[];
}

export interface OvertimeRequestsParams {
  status?: string;
  team?: string;
  /** OvertimeRequestFilter's names; it ignores start_date/end_date. */
  start_at__gte?: string;
  start_at__lte?: string;
  search?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
}

export interface OvertimeEntryInput {
  user: number;
  job_no: string;
  description: string;
  operations: string[];
}

export interface OvertimeRequestInput {
  start_at: string;
  end_at: string;
  reason: string;
  entries: OvertimeEntryInput[];
}

export interface OvertimeCostImpactJob {
  job_no?: string | null;
  job_order_found?: boolean;
  title?: string | null;
  customer_name?: string | null;
  customer_code?: string | null;
  target_completion_date?: string | null;
  current_profit_eur?: number | string | null;
  current_margin_pct?: number | string | null;
  projected_profit_eur?: number | string | null;
  projected_margin_pct?: number | string | null;
  overtime_cost_eur?: number | string | null;
  current_selling_price_eur?: number | string | null;
  selling_price_is_derived?: boolean;
  selling_price_source?: string | null;
  selling_price_derived_basis?: {
    from_job_no?: string;
    from_amount_eur?: number | string;
    weight_kg?: number | string;
    total_weight_kg?: number | string;
  } | null;
}

export interface OvertimeCostImpact {
  total_overtime_cost_eur?: number | string | null;
  jobs?: OvertimeCostImpactJob[];
}

/** One row of `/overtime/users-for-date/<date>/`. */
export interface OvertimeDateUser {
  full_name?: string;
  team_label?: string;
  entries?: {
    job_no?: string | null;
    description?: string | null;
    request_start_at?: string | null;
    request_end_at?: string | null;
  }[];
}

export interface WeldingReportLine {
  job_no?: string | null;
  overtime_type?: string;
  description?: string | null;
  hours?: number | string;
}

export interface WeldingReportRow {
  date: string;
  user_id?: number;
  user_full_name?: string;
  request_ids?: number[];
  planned_jobs?: string[];
  worked_jobs?: string[];
  planned_hours?: number | string;
  logged_overtime_hours?: number | string;
  logged_regular_hours?: number | string;
  variance_hours?: number | string;
  flags?: string[];
  planned_note?: string | null;
  lines?: WeldingReportLine[];
}

export interface WeldingReport {
  meta?: { welding_data_through?: string | null } | null;
  rows: WeldingReportRow[];
}

export interface WeldingReportParams {
  start_date?: string;
  end_date?: string;
  user?: string;
  job_no?: string;
  only_outliers?: string;
  tolerance?: string;
}

export interface OperatorOption {
  id: number;
  username?: string;
  full_name?: string;
}

export interface OperationOption {
  value: string;
  label: string;
}

// ---------- requests ----------

/** Port of fetchOvertimeRequests. */
export async function fetchOvertimeRequests(
  params: OvertimeRequestsParams = {},
  signal?: AbortSignal,
): Promise<Paginated<OvertimeRequest>> {
  return toPaginated<OvertimeRequest>(
    await apiFetch<unknown>(BASE, { params: params as QueryParams, signal }),
  );
}

export function overtimeRequestsQueryOptions(params: OvertimeRequestsParams = {}) {
  return queryOptions({
    queryKey: keys.requests(params),
    queryFn: ({ signal }) => fetchOvertimeRequests(params, signal),
  });
}

/** Port of fetchOvertimeRequest. */
export function overtimeRequestQueryOptions(id: number | string) {
  return queryOptions({
    queryKey: keys.request(id),
    queryFn: async ({ signal }) => {
      const data = await apiFetch<OvertimeRequest | undefined>(`${BASE}${id}/`, { signal });
      return data && typeof data === 'object' ? data : ({ id: Number(id) } as OvertimeRequest);
    },
  });
}

/** Port of getPendingOvertimeApprovalRequests. */
export function pendingOvertimeQueryOptions(params: { page?: number; page_size?: number } = {}) {
  return queryOptions({
    queryKey: keys.pending(params),
    queryFn: async ({ signal }) =>
      toPaginated<OvertimeRequest>(
        await apiFetch<unknown>(`${BASE}pending_approval/`, {
          params: params as QueryParams,
          signal,
        }),
      ),
  });
}

/** Port of getOvertimeApprovedByMeRequests. */
export function decidedByMeOvertimeQueryOptions(
  params: { page?: number; page_size?: number } = {},
) {
  return queryOptions({
    queryKey: keys.decided(params),
    queryFn: async ({ signal }) =>
      toPaginated<OvertimeRequest>(
        await apiFetch<unknown>(`${BASE}decision_by_me/`, {
          params: params as QueryParams,
          signal,
        }),
      ),
  });
}

/**
 * Port of getOvertimeCostImpact: `null` on 403 (no view_job_costs) so the
 * modal hides the section.
 */
export function overtimeCostImpactQueryOptions(id: number | string) {
  return queryOptions({
    queryKey: keys.costImpact(id),
    queryFn: async ({ signal }): Promise<OvertimeCostImpact | null> => {
      try {
        const data = await apiFetch<OvertimeCostImpact | undefined>(`${BASE}${id}/cost_impact/`, {
          signal,
        });
        return data && typeof data === 'object' ? data : null;
      } catch (error) {
        if (isApiError(error) && error.status === 403) return null;
        throw error;
      }
    },
    retry: false,
  });
}

/** Port of createOvertimeRequest. */
export function createOvertimeRequest(data: OvertimeRequestInput) {
  return apiFetch<OvertimeRequest>(BASE, { method: 'POST', body: data });
}

/** Port of updateOvertimeRequest (re-submit of a rejected / cancelled request). */
export function updateOvertimeRequest(id: number, data: Partial<OvertimeRequestInput>) {
  return apiFetch<OvertimeRequest>(`${BASE}${id}/`, { method: 'PATCH', body: data });
}

/** Port of cancelOvertimeRequest. */
export function cancelOvertimeRequest(id: number) {
  return apiFetch<unknown>(`${BASE}${id}/cancel/`, { method: 'POST' });
}

/** Port of approveOvertimeRequest; only the options that are set go in the body. */
export function approveOvertimeRequest(
  id: number,
  options: { comment?: string; rejected_entry_ids?: number[] } = {},
) {
  const body: { comment?: string; rejected_entry_ids?: number[] } = {};
  if (options.comment) body.comment = options.comment;
  if (options.rejected_entry_ids?.length) body.rejected_entry_ids = options.rejected_entry_ids;
  return apiFetch<unknown>(`${BASE}${id}/approve/`, { method: 'POST', body });
}

/** Port of rejectOvertimeRequest. */
export function rejectOvertimeRequest(id: number, comment = '') {
  return apiFetch<unknown>(`${BASE}${id}/reject/`, { method: 'POST', body: { comment } });
}

/** Port of rejectOvertimeEntries: an approver retracting people from a request. */
export function rejectOvertimeEntries(id: number, entryIds: number[], comment = '') {
  return apiFetch<{ detail?: string; status?: string; rejected_count?: number } | undefined>(
    `${BASE}${id}/reject_entries/`,
    { method: 'POST', body: { entry_ids: entryIds, comment } },
  );
}

/**
 * The message legacy showed for a failed create / update: `errors`, `error`
 * or `detail` (lists joined), a bare list body joined, else the fallback.
 */
export function overtimeSaveErrorMessage(error: unknown, fallback: string): string {
  if (isApiError(error)) {
    const data = error.data;
    const join = (value: unknown) =>
      Array.isArray(value) ? value.map(String).join(', ') : String(value);
    if (Array.isArray(data)) return data.length ? join(data) : fallback;
    if (data && typeof data === 'object') {
      const body = data as Record<string, unknown>;
      for (const key of ['errors', 'error', 'detail']) {
        if (body[key]) return join(body[key]);
      }
    }
    return error.message.startsWith('HTTP ') ? fallback : error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

// ---------- create-modal reference data ----------

/** Port of getMachiningOperators ([] when the call fails). */
export function machiningOperatorsQueryOptions() {
  return queryOptions({
    queryKey: keys.machiningOperators,
    queryFn: async ({ signal }) => {
      try {
        return extractResults<OperatorOption>(
          await apiFetch<unknown>(`${BASE}machining_operators/`, { signal }),
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        return [];
      }
    },
    staleTime: 5 * 60_000,
  });
}

/** "PT-1 - Freze (#2)" as legacy labelled an operation. */
export function operationLabel(
  op: Pick<OvertimeOperation, 'key' | 'name' | 'part_key' | 'order'>,
): string {
  return `${op.part_key ? `${op.part_key} - ` : ''}${op.name || op.key}${op.order != null ? ` (#${op.order})` : ''}`;
}

/** Port of getOperationsForJob: open machining operations of a job, grouped by part. */
export function operationsForJobQueryOptions(jobNo: string) {
  return queryOptions({
    queryKey: keys.operationsForJob(jobNo),
    queryFn: async ({ signal }): Promise<OperationOption[]> => {
      if (!jobNo) return [];
      let data: unknown;
      try {
        data = await apiFetch<unknown>('/tasks/operations/', {
          params: { job_no: jobNo, completion_date__isnull: 'true', page_size: '200' },
          signal,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        return [];
      }
      const rows = extractResults<OvertimeOperation>(data);
      rows.sort(
        (a, b) =>
          (a.part_key || '').localeCompare(b.part_key || '') || (a.order ?? 0) - (b.order ?? 0),
      );
      return rows.map((op) => ({ value: op.key, label: operationLabel(op) }));
    },
    staleTime: 60_000,
  });
}

// ---------- users for date ----------

/** Port of getOvertimeUsersForDate. */
export function overtimeUsersForDateQueryOptions(date: string) {
  return queryOptions({
    queryKey: keys.usersForDate(date),
    queryFn: async ({ signal }) =>
      extractResults<OvertimeDateUser>(
        await apiFetch<unknown>(`/overtime/users-for-date/${date}/`, { signal }),
      ),
  });
}

// ---------- welding report ----------

/** Port of getOvertimeWeldingReport. */
export function weldingReportQueryOptions(params: WeldingReportParams) {
  return queryOptions({
    queryKey: keys.weldingReport(params),
    queryFn: async ({ signal }): Promise<WeldingReport> => {
      const data = await apiFetch<Partial<WeldingReport> | undefined>(`${BASE}welding_report/`, {
        params: params as QueryParams,
        signal,
      });
      return {
        meta: data?.meta ?? null,
        rows: Array.isArray(data?.rows) ? data.rows : [],
      };
    },
  });
}

/** Port of getWeldingOperators ([] when the call fails). */
export function weldingOperatorsQueryOptions() {
  return queryOptions({
    queryKey: keys.weldingOperators,
    queryFn: async ({ signal }) => {
      try {
        return extractResults<OperatorOption>(
          await apiFetch<unknown>(`${BASE}welding_operators/`, { signal }),
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        return [];
      }
    },
    staleTime: 5 * 60_000,
  });
}

// ---------- machining report ----------

type Num = number | string | null | undefined;

export interface MachiningTimer {
  start_at?: string | null;
  finish_at?: string | null;
  total_hours?: Num;
  in_window_hours?: Num;
  outside_window_hours?: Num;
}

/** One row of machining_report: talep × operatör × gün × operasyon. */
export interface MachiningReportRow {
  date?: string | null;
  request_id?: number | null;
  user_id?: number | null;
  user_full_name?: string | null;
  job_no?: string | null;
  operation_key?: string | null;
  operation_name?: string | null;
  part_name?: string | null;
  worked?: boolean;
  worked_hours?: Num;
  overtime_window_hours?: Num;
  outside_window_hours?: Num;
  timer_hours?: Num;
  timers?: MachiningTimer[];
}

export interface MachiningSummaryOperator {
  user_id?: number | null;
  full_name?: string | null;
  requested_hours?: Num;
  worked_hours?: Num;
  no_timer_hours?: Num;
}

export interface MachiningSummary {
  requested_hours?: Num;
  worked_hours?: Num;
  selected_operation_hours?: Num;
  other_work_hours?: Num;
  downtime_hours?: Num;
  no_timer_hours?: Num;
  operator_count?: number;
  request_count?: number;
  entry_count?: number;
  day_count?: number;
  operators?: MachiningSummaryOperator[];
}

/**
 * Filters of the machining report. Legacy appended the İş No picks as one
 * value, so several go out comma-joined (`job_no=RM269,270-01`).
 */
export interface MachiningReportParams {
  start_date?: string;
  end_date?: string;
  job_no?: string;
  user?: string;
}

/** The legacy message: the body's `detail`, else the fallback. */
function detailError(error: unknown, fallback: string): unknown {
  if (!isApiError(error)) return error;
  const data = error.data as { detail?: unknown } | undefined;
  const detail = data && typeof data === 'object' ? data.detail : undefined;
  return new Error(typeof detail === 'string' && detail ? detail : fallback);
}

async function withDetail<T>(request: Promise<T>, fallback: string): Promise<T> {
  try {
    return await request;
  } catch (error) {
    throw detailError(error, fallback);
  }
}

/** Port of getOvertimeMachiningReport. */
export function machiningReportQueryOptions(params: MachiningReportParams) {
  return queryOptions({
    queryKey: keys.machiningReport(params),
    queryFn: async ({ signal }): Promise<MachiningReportRow[]> => {
      const data = await withDetail(
        apiFetch<unknown>(`${BASE}machining_report/`, { params: params as QueryParams, signal }),
        'Mesai raporu yüklenirken hata oluştu',
      );
      return Array.isArray(data) ? (data as MachiningReportRow[]) : [];
    },
  });
}

/** Port of getOvertimeMachiningSummary; same filters as the report. */
export function machiningSummaryQueryOptions(params: MachiningReportParams) {
  return queryOptions({
    queryKey: keys.machiningSummary(params),
    queryFn: async ({ signal }): Promise<MachiningSummary | null> => {
      const data = await withDetail(
        apiFetch<MachiningSummary | undefined>(`${BASE}machining_report_summary/`, {
          params: params as QueryParams,
          signal,
        }),
        'Mesai özeti yüklenirken hata oluştu',
      );
      return data && typeof data === 'object' ? data : null;
    },
  });
}

// ---------- cost report ----------

export interface CostFields {
  cost_eur?: Num;
  wage_cost_eur?: Num;
  employer_cost_eur?: Num;
}

export interface CostBucket extends CostFields {
  hours?: Num;
}

export type CostBucketKey = 'weekday' | 'saturday' | 'sunday' | 'holiday';

export interface CostReportEntry extends CostFields {
  id?: number;
  user_id?: number | null;
  username?: string | null;
  full_name?: string | null;
  job_no?: string | null;
  description?: string | null;
  status?: string | null;
  hours?: Num;
  unpriced_hours?: Num;
  estimated_wage?: boolean;
}

export interface CostReportRequest extends CostFields {
  id: number;
  team?: string | null;
  requester_name?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  counted_start_at?: string | null;
  counted_end_at?: string | null;
  duration_hours?: Num;
  entry_count?: number;
  hours?: Num;
  status?: string | null;
  is_partial?: boolean;
  reason?: string | null;
  buckets?: Partial<Record<CostBucketKey, CostBucket>> | null;
  entries?: CostReportEntry[];
}

export interface CostReportGroupRow extends CostFields {
  team?: string | null;
  user_id?: number | null;
  username?: string | null;
  full_name?: string | null;
  job_no?: string | null;
  estimated_wage?: boolean;
  request_count?: number;
  entry_count?: number;
  hours?: Num;
}

export interface CostReportSummary {
  total_cost_eur?: Num;
  total_wage_cost_eur?: Num;
  total_employer_cost_eur?: Num;
  employer_overhead_rate?: Num;
  total_hours?: Num;
  avg_cost_per_hour_eur?: Num;
  user_count?: number;
  request_count?: number;
  estimated_wage_entry_count?: number;
  unpriced_hours?: Num;
}

export interface CostReport {
  meta?: unknown;
  summary: CostReportSummary;
  by_bucket: Partial<Record<CostBucketKey, CostBucket>>;
  by_team: CostReportGroupRow[];
  by_user: CostReportGroupRow[];
  by_job: CostReportGroupRow[];
  requests: CostReportRequest[];
}

/** Each İş No pick goes out as its own `job_no` (legacy appended arrays one by one). */
export interface CostReportParams {
  start_date?: string;
  end_date?: string;
  status?: string;
  team?: string;
  job_no?: string[];
  user?: string;
}

/**
 * Port of getOvertimeCostReport: `null` on 403 (no `view_job_costs`) so the
 * page shows the permission notice instead of an error toast.
 */
export function costReportQueryOptions(params: CostReportParams) {
  return queryOptions({
    queryKey: keys.costReport(params),
    queryFn: async ({ signal }): Promise<CostReport | null> => {
      let data: Partial<CostReport> | undefined;
      try {
        data = await apiFetch<Partial<CostReport> | undefined>(`${BASE}cost_report/`, {
          params: params as QueryParams,
          signal,
        });
      } catch (error) {
        if (isApiError(error) && error.status === 403) return null;
        throw detailError(error, 'Mesai maliyet raporu yüklenirken hata oluştu');
      }
      return {
        meta: data?.meta,
        summary: data?.summary ?? {},
        by_bucket: data?.by_bucket ?? {},
        by_team: Array.isArray(data?.by_team) ? data.by_team : [],
        by_user: Array.isArray(data?.by_user) ? data.by_user : [],
        by_job: Array.isArray(data?.by_job) ? data.by_job : [],
        requests: Array.isArray(data?.requests) ? data.requests : [],
      };
    },
    retry: false,
  });
}

// ---------- helpers (ported from apis/overtime.js) ----------

/** Port of formatOvertimeDuration: "3 saat 30 dakika". */
export function formatOvertimeDuration(durationHours: number | string | null | undefined): string {
  const value =
    typeof durationHours === 'string' ? Number.parseFloat(durationHours) : durationHours;
  if (!value || !Number.isFinite(value) || value <= 0) return '0 saat';
  const hours = Math.floor(value);
  const minutes = Math.round((value - hours) * 60);
  return minutes === 0 ? `${hours} saat` : `${hours} saat ${minutes} dakika`;
}

/** Port of canCancelOvertime. */
export function canCancelOvertime(
  request: OvertimeRequest,
  userId: number | null | undefined,
): boolean {
  return request.status === 'submitted' && request.requester === userId;
}

/** Port of canResubmitOvertime. */
export function canResubmitOvertime(
  request: OvertimeRequest,
  userId: number | null | undefined,
): boolean {
  return ['rejected', 'cancelled'].includes(request.status ?? '') && request.requester === userId;
}

/** Port of validateOvertimeRequest; `now` is injectable for tests. */
export function validateOvertimeRequest(
  data: Partial<OvertimeRequestInput>,
  now = new Date(),
): string[] {
  const errors: string[] = [];
  if (!data.start_at) errors.push('Başlangıç zamanı gereklidir');
  if (!data.end_at) errors.push('Bitiş zamanı gereklidir');
  if (!data.entries || data.entries.length === 0) errors.push('En az 1 katılımcı eklemelisiniz');

  if (data.start_at && data.end_at) {
    const start = new Date(data.start_at);
    const end = new Date(data.end_at);
    if (start >= end) errors.push('Bitiş zamanı başlangıç zamanından sonra olmalıdır');
    if (start < now) errors.push('Başlangıç zamanı geçmiş bir tarih olamaz');
  }

  data.entries?.forEach((entry, index) => {
    if (!entry.user) errors.push(`Katılımcı ${index + 1}: Kullanıcı seçimi gereklidir`);
    if (!entry.job_no || entry.job_no.trim() === '')
      errors.push(`Katılımcı ${index + 1}: İş numarası gereklidir`);
  });
  return errors;
}

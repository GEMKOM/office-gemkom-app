import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, type QueryParams } from '../client';
import { toPaginated } from '../types';

// Port of apis/planning/departmentRequests.js, the parts the
// general/department-requests pages use. The legacy module stays: the
// planning department-requests page still imports it.

const BASE = '/planning/department-requests/';

export interface DepartmentRequestItem {
  item_code?: string | null;
  code?: string | null;
  item_name?: string | null;
  name?: string | null;
  product_name?: string | null;
  job_no?: string | null;
  quantity?: number | string | null;
  item_unit?: string | null;
  unit?: string | null;
  item_description?: string | null;
  description?: string | null;
  item_specifications?: string | null;
  specifications?: string | null;
  /** Asset ids of the request files uploaded for this row. */
  file_asset_ids?: (number | string)[];
  [key: string]: unknown;
}

export interface DepartmentRequestFile {
  id?: number;
  asset_id?: number | string | null;
  file_name?: string | null;
  file_url?: string | null;
  uploaded_at?: string | null;
  uploaded_by_username?: string | null;
  [key: string]: unknown;
}

export interface ApprovalDecision {
  decision?: string;
  comment?: string | null;
  approver_name?: string | null;
  approver_username?: string | null;
  decision_date?: string | null;
}

export interface ApprovalStageInstance {
  name?: string;
  decisions?: ApprovalDecision[];
  [key: string]: unknown;
}

export interface ApprovalWorkflow {
  stage_instances?: ApprovalStageInstance[];
  [key: string]: unknown;
}

export interface DepartmentRequest {
  id: number;
  request_number?: string | null;
  title?: string | null;
  description?: string | null;
  department?: string | null;
  department_label?: string | null;
  priority?: string | null;
  needed_date?: string | null;
  status?: string | null;
  status_label?: string | null;
  items_count?: number | null;
  items?: DepartmentRequestItem[];
  files?: DepartmentRequestFile[];
  requestor_username?: string | null;
  requestor_full_name?: string | null;
  approved_by_username?: string | null;
  approved_at?: string | null;
  submitted_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  planning_request_keys?: string[] | null;
  purchase_request_keys?: string[] | null;
  approvals?: ApprovalWorkflow[];
  [key: string]: unknown;
}

export type DepartmentRequestsParams = {
  page?: number;
  page_size?: number;
  ordering?: string;
  search?: string;
  status?: string;
  department?: string;
  priority?: string;
  requestor?: string;
};

/** Row as the create form sends it in the `items` JSON field. */
export interface DepartmentRequestItemInput {
  item_code: string | null;
  item_name: string;
  job_no: string | null;
  item_unit: string | null;
  quantity: number;
  item_description: string | null;
  item_specifications: string | null;
}

export interface DepartmentRequestCreateInput {
  title: string;
  description?: string | null;
  department?: string | null;
  needed_date?: string | null;
  priority?: string | null;
  items?: DepartmentRequestItemInput[];
  files?: File[];
  /** `{ "<file index>": [item index, ...] }` */
  file_item_mapping?: Record<string, number[]>;
}

export interface DepartmentRequestUpdateInput {
  title: string;
  description: string | null;
  priority: string;
  needed_date: string | null;
}

export const DEPARTMENT_REQUEST_STATUS_OPTIONS = [
  { value: 'draft', label: 'Taslak' },
  { value: 'submitted', label: 'Gönderildi' },
  { value: 'approved', label: 'Onaylandı' },
  { value: 'rejected', label: 'Reddedildi' },
  { value: 'cancelled', label: 'İptal Edildi' },
  { value: 'transferred', label: 'Transfer Edildi' },
] as const;

export const DEPARTMENT_OPTIONS = [
  { value: 'maintenance', label: 'Bakım' },
  { value: 'manufacturing', label: 'İmalat' },
  { value: 'procurement', label: 'Satın Alma' },
  { value: 'finance', label: 'Finans' },
  { value: 'it', label: 'Bilgi İşlem' },
  { value: 'human_resources', label: 'İnsan Kaynakları' },
  { value: 'management', label: 'Yönetim' },
  { value: 'planning', label: 'Planlama' },
] as const;

export const DEPARTMENT_REQUEST_PRIORITY_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'urgent', label: 'Acil' },
  { value: 'critical', label: 'Kritik' },
] as const;

const keys = {
  all: ['departmentRequests'] as const,
  list: (params: DepartmentRequestsParams) => ['departmentRequests', 'list', params] as const,
  detail: (id: number | string) => ['departmentRequests', 'detail', String(id)] as const,
  pending: () => ['departmentRequests', 'pendingApproval'] as const,
  approved: (params: QueryParams) => ['departmentRequests', 'approved', params] as const,
};

export const departmentRequestKeys = keys;

/** Port of getDepartmentRequests. */
export function departmentRequestsQueryOptions(params: DepartmentRequestsParams) {
  return queryOptions({
    queryKey: keys.list(params),
    queryFn: async ({ signal }) =>
      toPaginated<DepartmentRequest>(await apiFetch<unknown>(BASE, { params, signal })),
  });
}

/** Port of getDepartmentRequest. */
export function departmentRequestQueryOptions(id: number | string) {
  return queryOptions({
    queryKey: keys.detail(id),
    queryFn: ({ signal }) => apiFetch<DepartmentRequest>(`${BASE}${id}/`, { signal }),
  });
}

/** Port of getPendingApprovalDepartmentRequests (legacy sends no params). */
export function pendingDepartmentRequestsQueryOptions() {
  return queryOptions({
    queryKey: keys.pending(),
    queryFn: async ({ signal }) =>
      toPaginated<DepartmentRequest>(
        await apiFetch<unknown>(`${BASE}pending_approval/`, { signal }),
      ),
  });
}

/** Port of getApprovedDepartmentRequests. */
export function approvedDepartmentRequestsQueryOptions(params: QueryParams) {
  return queryOptions({
    queryKey: keys.approved(params),
    queryFn: async ({ signal }) =>
      toPaginated<DepartmentRequest>(
        await apiFetch<unknown>(`${BASE}approved_requests/`, { params, signal }),
      ),
  });
}

/** Port of createDepartmentRequest: multipart, items and the mapping as JSON strings. */
export function createDepartmentRequest(
  input: DepartmentRequestCreateInput,
): Promise<DepartmentRequest> {
  const form = new FormData();
  const append = (key: string, value: string | null | undefined) => {
    if (value !== undefined && value !== null) form.append(key, value);
  };
  append('title', input.title);
  append('description', input.description);
  append('department', input.department);
  append('needed_date', input.needed_date);
  append('priority', input.priority);
  if (input.items && input.items.length > 0) form.append('items', JSON.stringify(input.items));
  for (const file of input.files ?? []) form.append('files', file);
  if (input.file_item_mapping && Object.keys(input.file_item_mapping).length > 0) {
    form.append('file_item_mapping', JSON.stringify(input.file_item_mapping));
  }
  return apiFetch<DepartmentRequest>(BASE, { method: 'POST', body: form });
}

/** Port of updateDepartmentRequest (JSON PATCH). */
export function updateDepartmentRequest(id: number, data: DepartmentRequestUpdateInput) {
  return apiFetch<DepartmentRequest>(`${BASE}${id}/`, { method: 'PATCH', body: data });
}

export function deleteDepartmentRequest(id: number) {
  return apiFetch<void>(`${BASE}${id}/`, { method: 'DELETE' });
}

export function approveDepartmentRequest(id: number, comment = '') {
  return apiFetch<unknown>(`${BASE}${id}/approve/`, { method: 'POST', body: { comment } });
}

export function rejectDepartmentRequest(id: number, comment = '') {
  return apiFetch<unknown>(`${BASE}${id}/reject/`, { method: 'POST', body: { comment } });
}

function useInvalidatingMutation<V, R>(fn: (vars: V) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useCreateDepartmentRequest() {
  return useInvalidatingMutation(createDepartmentRequest);
}

export function useUpdateDepartmentRequest() {
  return useInvalidatingMutation(
    ({ id, data }: { id: number; data: DepartmentRequestUpdateInput }) =>
      updateDepartmentRequest(id, data),
  );
}

export function useDeleteDepartmentRequest() {
  return useInvalidatingMutation((id: number) => deleteDepartmentRequest(id));
}

export function useApproveDepartmentRequest() {
  return useInvalidatingMutation((id: number) => approveDepartmentRequest(id));
}

export function useRejectDepartmentRequest() {
  return useInvalidatingMutation(({ id, comment }: { id: number; comment: string }) =>
    rejectDepartmentRequest(id, comment),
  );
}

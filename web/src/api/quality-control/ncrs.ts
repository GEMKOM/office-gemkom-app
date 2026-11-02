import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, cleanParams } from '../client';
import { extractResults, toPaginated } from '../types';

// Port of the NCR part of apis/qualityControl.js (listNCRs … deleteNCRFile) plus
// the organization groups the NCR page assigns reports to.

export type NcrStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'closed';

export interface Choice {
  value: string;
  label: string;
}

export const DEFECT_TYPE_CHOICES: Choice[] = [
  { value: 'dimensional', label: 'Boyutsal' },
  { value: 'surface', label: 'Yüzey' },
  { value: 'material', label: 'Malzeme' },
  { value: 'welding', label: 'Kaynak' },
  { value: 'machining', label: 'Talaşlı İmalat' },
  { value: 'assembly', label: 'Montaj' },
  { value: 'documentation', label: 'Dokümantasyon' },
  { value: 'other', label: 'Diğer' },
];

export const SEVERITY_CHOICES: Choice[] = [
  { value: 'minor', label: 'Minör' },
  { value: 'major', label: 'Majör' },
  { value: 'critical', label: 'Kritik' },
];

export const DISPOSITION_CHOICES: Choice[] = [
  { value: 'rework', label: 'Yeniden İşleme' },
  { value: 'scrap', label: 'Hurda' },
  { value: 'accept_as_is', label: 'Olduğu Gibi Kabul' },
  { value: 'pending', label: 'Karar Bekliyor' },
];

export const NCR_STATUS_CHOICES: { value: NcrStatus; label: string }[] = [
  { value: 'draft', label: 'Taslak' },
  { value: 'submitted', label: 'Gönderildi' },
  { value: 'approved', label: 'Onaylandı' },
  { value: 'rejected', label: 'Reddedildi' },
  { value: 'closed', label: 'Kapatıldı' },
];

export const NCR_FILE_TYPE_OPTIONS: Choice[] = [
  { value: 'photo', label: 'Fotoğraf' },
  { value: 'drawing', label: 'Çizim' },
  { value: 'report', label: 'Rapor' },
  { value: 'specification', label: 'Şartname' },
  { value: 'other', label: 'Diğer' },
];

export interface NcrDecision {
  decision?: 'approve' | 'reject' | string;
  approver_name?: string;
  decided_at?: string | null;
  comment?: string | null;
}

export interface NcrSubmission {
  submitted_at?: string | null;
  outcome?: 'pending' | 'approved' | 'rejected' | 'cancelled' | string;
  decisions: NcrDecision[];
}

export interface NcrMember {
  id: number;
  name?: string;
}

/** List row and detail payload; the detail adds the narrative fields and history. */
export interface Ncr {
  id: number;
  ncr_number?: string;
  job_order?: string | null;
  job_order_title?: string | null;
  job_order_customer_name?: string | null;
  department_task_title?: string | null;
  title?: string;
  description?: string;
  status?: NcrStatus | string;
  status_display?: string;
  severity?: string;
  severity_display?: string;
  defect_type?: string;
  defect_type_display?: string;
  disposition?: string;
  affected_quantity?: number | null;
  submission_count?: number | null;
  root_cause?: string;
  corrective_action?: string;
  qc_review?:
    | number
    | string
    | { id?: number | string; pk?: number | string; review_id?: number | string }
    | null;
  detected_by?: number | null;
  detected_by_name?: string | null;
  created_by_name?: string | null;
  created_at?: string | null;
  assigned_team?: number | string | null;
  assigned_team_id?: number | string | null;
  assigned_team_name?: string | null;
  assigned_team_slug?: string | null;
  assigned_team_group_name?: string | null;
  assigned_team_data?: { id?: number | string | null; name?: string; slug?: string } | null;
  assigned_members?: number[];
  assigned_members_data?: NcrMember[];
  approval_history?: NcrSubmission[];
  [key: string]: unknown;
}

export interface NcrFile {
  id: number;
  name?: string;
  filename?: string;
  original_name?: string;
  url?: string;
  file_url?: string;
  file?: string;
  extension?: string;
  file_type?: string;
  file_type_display?: string;
  uploaded_at?: string | null;
  created_at?: string | null;
  uploaded_by_username?: string;
  uploaded_by_name?: string;
  [key: string]: unknown;
}

/** An organization group an NCR can be assigned to, its PK normalized to `id`. */
export interface NcrGroup {
  id: number | string;
  name?: string;
  display_name?: string;
  slug?: string;
  [key: string]: unknown;
}

export type NcrListParams = {
  status__in?: string;
  assigned_team?: string;
  assigned_team__in?: string;
  severity?: string;
  defect_type?: string;
  job_order?: string;
  search?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
};

export interface NcrInput {
  job_order?: string;
  title?: string;
  description?: string;
  defect_type?: string;
  severity?: string;
  affected_quantity?: number;
  detected_by?: number;
  assigned_team?: number;
  assigned_members?: number[];
  disposition?: string;
  root_cause?: string;
  corrective_action?: string;
}

export interface NcrSubmitInput {
  root_cause: string;
  corrective_action: string;
  disposition: string;
}

export const NCR_STALE_TIME = 30_000;
const BASE = '/quality-control/ncrs';

// Same prefix as the quality control hub's counts, so a change here refreshes them too.
export const ncrKeys = {
  all: ['qualityControl', 'ncrs'] as const,
  list: (params: NcrListParams) => ['qualityControl', 'ncrs', 'list', cleanParams(params)] as const,
  lookup: (ncrNumber: string) => ['qualityControl', 'ncrs', 'lookup', ncrNumber] as const,
  detail: (id: number) => ['qualityControl', 'ncrs', 'detail', id] as const,
  files: (id: number) => ['qualityControl', 'ncrs', 'files', id] as const,
  groups: ['qualityControl', 'ncrGroups'] as const,
};

/** listNCRs: page, page_size, ordering, search and the filters, as legacy sent them. */
export function ncrsQueryOptions(params: NcrListParams) {
  return queryOptions({
    queryKey: ncrKeys.list(params),
    queryFn: async ({ signal }) =>
      toPaginated<Ncr>(await apiFetch<unknown>(`${BASE}/`, { params, signal })),
    staleTime: NCR_STALE_TIME,
  });
}

/**
 * The legacy `?ncr=NCR-2026-0001` deep link: search by number, keep the exact
 * match. Resolves null when there is none.
 */
export function ncrLookupQueryOptions(ncrNumber: string) {
  return queryOptions({
    queryKey: ncrKeys.lookup(ncrNumber),
    queryFn: async ({ signal }) => {
      const page = toPaginated<Ncr>(
        await apiFetch<unknown>(`${BASE}/`, {
          params: { page: 1, page_size: 1, ordering: '-created_at', search: ncrNumber },
          signal,
        }),
      );
      return page.results.find((n) => n.ncr_number === ncrNumber) ?? null;
    },
    staleTime: NCR_STALE_TIME,
  });
}

export function ncrQueryOptions(id: number) {
  return queryOptions({
    queryKey: ncrKeys.detail(id),
    queryFn: ({ signal }) => apiFetch<Ncr>(`${BASE}/${id}/`, { signal }),
    staleTime: 0,
  });
}

export function useNcr(id: number | null) {
  return useQuery({ ...ncrQueryOptions(id ?? 0), enabled: id !== null });
}

/** listNCRFiles; the endpoint has answered with an array, `results` or `files`. */
export function ncrFilesQueryOptions(id: number) {
  return queryOptions({
    queryKey: ncrKeys.files(id),
    queryFn: async ({ signal }) => {
      const data = await apiFetch<unknown>(`${BASE}/${id}/files/`, { signal });
      if (
        data &&
        typeof data === 'object' &&
        !Array.isArray(data) &&
        Array.isArray((data as { files?: unknown }).files)
      ) {
        return (data as { files: NcrFile[] }).files;
      }
      return extractResults<NcrFile>(data);
    },
    staleTime: 0,
  });
}

export function useNcrFiles(id: number | null, enabled = true) {
  return useQuery({ ...ncrFilesQueryOptions(id ?? 0), enabled: enabled && id !== null });
}

/** fetchOrganizationUserGroups({ page_size: 1000 }), PK normalized, sorted by name (tr). */
export function ncrGroupsQueryOptions() {
  return queryOptions({
    queryKey: ncrKeys.groups,
    queryFn: async ({ signal }): Promise<NcrGroup[]> => {
      const data = await apiFetch<unknown>('/organization/groups/', {
        params: { page_size: 1000 },
        signal,
      });
      return extractResults<Record<string, unknown>>(data)
        .filter(Boolean)
        .map((g): NcrGroup => ({ ...g, id: (g.id ?? g.pk ?? g.group_id) as number | string }))
        .filter((g) => g.id !== undefined && g.id !== null && g.id !== '')
        .sort((a, b) =>
          String(a.display_name || a.name || '').localeCompare(
            String(b.display_name || b.name || ''),
            'tr',
          ),
        );
    },
    staleTime: 10 * 60_000,
  });
}

export function useNcrGroups() {
  return useQuery(ncrGroupsQueryOptions());
}

export function uploadNcrFile(
  id: number,
  file: File,
  fileType: string,
  name = '',
  description = '',
) {
  const body = new FormData();
  body.append('file', file);
  body.append('file_type', fileType);
  if (name) body.append('name', name);
  if (description) body.append('description', description);
  return apiFetch<NcrFile>(`${BASE}/${id}/files/upload/`, { method: 'POST', body });
}

function useInvalidateNcrs() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ncrKeys.all });
}

export function useCreateNcr() {
  const invalidate = useInvalidateNcrs();
  return useMutation({
    mutationFn: (data: NcrInput) => apiFetch<Ncr>(`${BASE}/`, { method: 'POST', body: data }),
    onSuccess: invalidate,
  });
}

export function useUpdateNcr() {
  const invalidate = useInvalidateNcrs();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: NcrInput }) =>
      apiFetch<Ncr>(`${BASE}/${id}/`, { method: 'PATCH', body: data }),
    onSuccess: invalidate,
  });
}

export function useSubmitNcr() {
  const invalidate = useInvalidateNcrs();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: NcrSubmitInput }) =>
      apiFetch<Ncr>(`${BASE}/${id}/submit/`, { method: 'POST', body: data }),
    onSuccess: invalidate,
  });
}

export function useDecideNcr() {
  const invalidate = useInvalidateNcrs();
  return useMutation({
    mutationFn: ({ id, approve, comment }: { id: number; approve: boolean; comment: string }) =>
      apiFetch<Ncr>(`${BASE}/${id}/decide/`, { method: 'POST', body: { approve, comment } }),
    onSuccess: invalidate,
  });
}

export function useCloseNcr() {
  const invalidate = useInvalidateNcrs();
  return useMutation({
    mutationFn: (id: number) => apiFetch<Ncr>(`${BASE}/${id}/close/`, { method: 'POST' }),
    onSuccess: invalidate,
  });
}

export function useDeleteNcrFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ncrId, fileId }: { ncrId: number; fileId: number }) =>
      apiFetch<void>(`${BASE}/${ncrId}/files/${fileId}/`, { method: 'DELETE' }),
    onSuccess: (_data, { ncrId }) =>
      queryClient.invalidateQueries({ queryKey: ncrKeys.files(ncrId) }),
  });
}

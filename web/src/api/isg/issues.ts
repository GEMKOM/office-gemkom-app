import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiUpload, cleanParams, type ApiUploadOptions } from '../client';
import { extractResults, toPaginated } from '../types';

/**
 * İSG (iş sağlığı ve güvenliği) issues, the port of apis/isg.js. Reading is
 * open to every signed-in user; creating and administering an issue needs
 * `create_isg_issues`, which /my-permissions/ reports so the page can hide
 * the buttons the server would refuse anyway.
 */

/** Counters from GET /isg/issues/summary/ (the statistics cards on /isg/issues). */
export interface IsgSummary {
  total?: number;
  open?: number;
  in_progress?: number;
  resolved?: number;
  closed?: number;
  /** Past the due date and not closed. */
  overdue?: number;
  critical_open?: number;
  /** Not closed and assigned to the signed-in user. */
  mine_open?: number;
}

/** Issues change a few times a day; a minute is fresh enough for a hub. */
export const ISG_STALE_TIME = 60_000;

/** Port of getISGSummary() without filters: every issue the user can see. */
export async function getIsgSummary(signal?: AbortSignal): Promise<IsgSummary> {
  return apiFetch<IsgSummary>('/isg/issues/summary/', { signal });
}

export function isgSummaryQueryOptions() {
  return queryOptions({
    queryKey: ['isg', 'summary'] as const,
    queryFn: ({ signal }) => getIsgSummary(signal),
    staleTime: ISG_STALE_TIME,
  });
}

// ---- the issues list page ----

export type IsgStatus = 'open' | 'in_progress' | 'resolved' | 'closed' | 'cancelled';
export type IsgSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface IsgPerson {
  id: number;
  name?: string;
  username?: string;
}

export interface IsgIssue {
  id: number;
  issue_number: string;
  title: string;
  description?: string;
  category?: string;
  category_display?: string;
  severity: IsgSeverity;
  severity_display?: string;
  status: IsgStatus;
  status_display?: string;
  location?: string;
  assigned_to?: number[];
  assigned_to_data?: IsgPerson[];
  due_date?: string | null;
  is_overdue?: boolean;
  file_count?: number;
  created_at?: string;
  created_by_name?: string;
  corrective_action?: string;
  resolved_at?: string | null;
  resolved_by_name?: string;
  closing_note?: string;
  closed_at?: string | null;
  closed_by_name?: string;
  /** The discussion topic the server opened with the issue. */
  discussion_topic_id?: number | null;
  [key: string]: unknown;
}

export interface IsgIssueFile {
  id: number;
  /** Presigned URL; some versions send file_url or file. */
  url?: string | null;
  file_url?: string | null;
  file?: string | null;
  /** May be a typed title with no extension. */
  name?: string | null;
  extension?: string | null;
  file_type?: string;
  file_type_display?: string;
  description?: string | null;
  size?: number | null;
  file_size?: number | null;
  uploaded_at?: string | null;
  uploaded_by_name?: string | null;
}

export interface IsgIssueFilters {
  status__in?: string;
  severity__in?: string;
  category?: string;
  assigned_to?: string;
  /** 'true' only */
  mine?: string;
  overdue?: string;
  search?: string;
}

export interface IsgIssueListParams extends IsgIssueFilters {
  ordering?: string;
  page?: number;
  page_size?: number;
}

export interface IsgIssueInput {
  title: string;
  description: string;
  category: string;
  severity: string;
  location: string;
  due_date: string | null;
  assigned_to: number[];
}

export const isgKeys = {
  all: ['isg'] as const,
  list: (params: IsgIssueListParams) => ['isg', 'issues', cleanParams({ ...params })] as const,
  summary: (filters: IsgIssueFilters) => ['isg', 'summary', cleanParams({ ...filters })] as const,
  detail: (id: number) => ['isg', 'issue', id] as const,
  files: (id: number) => ['isg', 'issue', id, 'files'] as const,
  permissions: ['isg', 'permissions'] as const,
};

/** Port of listISGIssues. */
export function isgIssuesQueryOptions(params: IsgIssueListParams) {
  return queryOptions({
    queryKey: isgKeys.list(params),
    queryFn: async ({ signal }) =>
      toPaginated<IsgIssue>(
        await apiFetch<unknown>('/isg/issues/', { params: { ...params }, signal }),
      ),
    staleTime: 30_000,
  });
}

/** Port of getISGSummary(filters, search): the cards follow the list's filters. */
export function isgFilteredSummaryQueryOptions(filters: IsgIssueFilters) {
  return queryOptions({
    queryKey: isgKeys.summary(filters),
    queryFn: ({ signal }) =>
      apiFetch<IsgSummary>('/isg/issues/summary/', { params: { ...filters }, signal }),
    staleTime: 30_000,
  });
}

/** Port of getISGIssue. */
export function isgIssueQueryOptions(id: number) {
  return queryOptions({
    queryKey: isgKeys.detail(id),
    queryFn: ({ signal }) => apiFetch<IsgIssue>(`/isg/issues/${id}/`, { signal }),
    staleTime: 0,
  });
}

/** Port of getISGMyPermissions: anything but a clean answer means "no". */
export function useIsgPermissions() {
  return useQuery({
    queryKey: isgKeys.permissions,
    queryFn: async ({ signal }) => {
      try {
        return await apiFetch<{ can_manage?: boolean }>('/isg/issues/my-permissions/', { signal });
      } catch {
        return { can_manage: false };
      }
    },
    staleTime: 5 * 60_000,
  });
}

/** Port of listISGIssueFiles. */
export function isgIssueFilesQueryOptions(id: number) {
  return queryOptions({
    queryKey: isgKeys.files(id),
    queryFn: async ({ signal }) =>
      extractResults<IsgIssueFile>(await apiFetch<unknown>(`/isg/issues/${id}/files/`, { signal })),
  });
}

/** Port of uploadISGIssueFile: one file, its type, and an optional title and description. */
export function uploadIsgIssueFile(
  issueId: number,
  file: File,
  meta: { file_type: string; name?: string; description?: string },
  options: ApiUploadOptions = {},
) {
  const form = new FormData();
  form.append('file', file);
  form.append('file_type', meta.file_type || 'other');
  if (meta.name) form.append('name', meta.name);
  if (meta.description) form.append('description', meta.description);
  return apiUpload<IsgIssueFile>(`/isg/issues/${issueId}/files/upload/`, form, options);
}

function useIsgMutation<TVars, TResult>(mutationFn: (vars: TVars) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    // The list, the cards, the open issue and the hub all move together.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: isgKeys.all }),
  });
}

export function useCreateIsgIssue() {
  return useIsgMutation((data: IsgIssueInput) =>
    apiFetch<IsgIssue>('/isg/issues/', { method: 'POST', body: data }),
  );
}

export function useUpdateIsgIssue() {
  return useIsgMutation(({ id, data }: { id: number; data: IsgIssueInput }) =>
    apiFetch<IsgIssue>(`/isg/issues/${id}/`, { method: 'PATCH', body: data }),
  );
}

export type IsgAction = 'start' | 'resolve' | 'close' | 'reopen' | 'cancel';

/**
 * The workflow: start (open → in_progress), resolve (with the corrective
 * action), close (with an optional note), reopen (comment, optional new due
 * date), cancel.
 */
export function useIsgAction() {
  return useIsgMutation(
    ({
      id,
      action,
      body = {},
    }: {
      id: number;
      action: IsgAction;
      body?: Record<string, unknown>;
    }) => apiFetch<IsgIssue>(`/isg/issues/${id}/${action}/`, { method: 'POST', body }),
  );
}

export function useDeleteIsgIssueFile() {
  return useIsgMutation(({ issueId, fileId }: { issueId: number; fileId: number }) =>
    apiFetch<void>(`/isg/issues/${issueId}/files/${fileId}/`, { method: 'DELETE' }),
  );
}

// ---- choices (mirror isg/models.py) ----

export const ISG_CATEGORY_CHOICES = [
  { value: 'ppe', label: 'Kişisel Koruyucu Donanım' },
  { value: 'housekeeping', label: 'Düzen ve Temizlik' },
  { value: 'electrical', label: 'Elektrik Güvenliği' },
  { value: 'working_at_height', label: 'Yüksekte Çalışma' },
  { value: 'fire', label: 'Yangın Güvenliği' },
  { value: 'machine_safety', label: 'Makine ve Ekipman Güvenliği' },
  { value: 'chemical', label: 'Kimyasal ve Tehlikeli Madde' },
  { value: 'lifting', label: 'Kaldırma ve Taşıma' },
  { value: 'ergonomics', label: 'Ergonomi' },
  { value: 'environment', label: 'Çevre' },
  { value: 'training', label: 'Eğitim ve Talimat' },
  { value: 'near_miss', label: 'Ramak Kala' },
  { value: 'accident', label: 'İş Kazası' },
  { value: 'other', label: 'Diğer' },
];

export const ISG_SEVERITY_CHOICES = [
  { value: 'low', label: 'Düşük' },
  { value: 'medium', label: 'Orta' },
  { value: 'high', label: 'Yüksek' },
  { value: 'critical', label: 'Kritik' },
];

export const ISG_STATUS_CHOICES = [
  { value: 'open', label: 'Açık' },
  { value: 'in_progress', label: 'Devam Ediyor' },
  { value: 'resolved', label: 'Giderildi (Onay Bekliyor)' },
  { value: 'closed', label: 'Kapatıldı' },
  { value: 'cancelled', label: 'İptal Edildi' },
];

export const ISG_FILE_TYPE_OPTIONS = [
  { value: 'photo', label: 'Fotoğraf' },
  { value: 'report', label: 'Rapor' },
  { value: 'document', label: 'Doküman' },
  { value: 'other', label: 'Diğer' },
];

/** Badge family and label per status; yellow is unused, as in legacy. */
export const ISG_STATUS_BADGE: Record<
  IsgStatus,
  { color: 'orange' | 'blue' | 'purple' | 'green' | 'grey'; label: string }
> = {
  open: { color: 'orange', label: 'Açık' },
  in_progress: { color: 'blue', label: 'Devam Ediyor' },
  resolved: { color: 'purple', label: 'Onay Bekliyor' },
  closed: { color: 'green', label: 'Kapatıldı' },
  cancelled: { color: 'grey', label: 'İptal Edildi' },
};

export const ISG_SEVERITY_BADGE: Record<
  IsgSeverity,
  { color: 'grey' | 'blue' | 'orange' | 'red'; label: string }
> = {
  low: { color: 'grey', label: 'Düşük' },
  medium: { color: 'blue', label: 'Orta' },
  high: { color: 'orange', label: 'Yüksek' },
  critical: { color: 'red', label: 'Kritik' },
};

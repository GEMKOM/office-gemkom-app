import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, cleanParams } from '../client';
import { toPaginated } from '../types';

// QC reviews from apis/qualityControl.js (list, detail, decide) plus the
// discussion comment call from apis/projects/topics.js.

export const QC_REVIEW_STATUS_CHOICES = [
  { value: 'pending', label: 'İnceleme Bekliyor' },
  { value: 'approved', label: 'Onaylandı' },
  { value: 'rejected', label: 'Reddedildi' },
];

export const DEFECT_TYPE_CHOICES = [
  { value: 'dimensional', label: 'Boyutsal' },
  { value: 'surface', label: 'Yüzey' },
  { value: 'material', label: 'Malzeme' },
  { value: 'welding', label: 'Kaynak' },
  { value: 'machining', label: 'Talaşlı İmalat' },
  { value: 'assembly', label: 'Montaj' },
  { value: 'documentation', label: 'Dokümantasyon' },
  { value: 'other', label: 'Diğer' },
];

export const SEVERITY_CHOICES = [
  { value: 'minor', label: 'Minör' },
  { value: 'major', label: 'Majör' },
  { value: 'critical', label: 'Kritik' },
];

export const DISPOSITION_CHOICES = [
  { value: 'rework', label: 'Yeniden İşleme' },
  { value: 'scrap', label: 'Hurda' },
  { value: 'accept_as_is', label: 'Olduğu Gibi Kabul' },
  { value: 'pending', label: 'Karar Bekliyor' },
];

export interface MentionedUser {
  username: string;
  full_name?: string;
}

export interface MentionedGroup {
  id: number | string;
  name: string;
  slug?: string;
}

export interface DiscussionComment {
  id?: number;
  content?: string;
  created_by_name?: string;
  created_by_username?: string;
  created_at?: string;
  mentioned_users_data?: MentionedUser[];
  mentioned_groups_data?: MentionedGroup[];
}

export interface DiscussionTopic {
  id?: number;
  title?: string;
  content?: string;
  priority_display?: string;
  topic_type_display?: string;
  comments?: DiscussionComment[];
  attachments_data?: { file_url?: string; url?: string; filename?: string; name?: string }[];
  mentioned_users_data?: MentionedUser[];
  mentioned_groups_data?: MentionedGroup[];
}

export interface QCReview {
  id: number;
  job_order?: string | null;
  task_title?: string | null;
  submitted_by_name?: string | null;
  submitted_at?: string | null;
  status?: string | null;
  ncr_number?: string | null;
  open_ncr_count?: number | string | null;
  reviewed_by_name?: string | null;
  reviewed_at?: string | null;
  comment?: string | null;
  part_data?: unknown;
  discussion_topic_data?: DiscussionTopic | null;
  discussion_topic?: DiscussionTopic | null;
}

export interface QCReviewsParams {
  status?: string;
  task__job_order?: string;
  task__department?: string;
  search?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
}

/** Only the fields legacy decideQCReview passes on with a rejection. */
export interface NcrDecisionData {
  ncr_title?: string;
  ncr_description?: string;
  ncr_defect_type?: string;
  ncr_severity?: string;
  ncr_affected_quantity?: number;
  ncr_disposition?: string;
}

export const qcReviewKeys = {
  all: ['qcReviews'] as const,
  list: (params: QCReviewsParams) => ['qcReviews', 'list', cleanParams({ ...params })] as const,
  detail: (id: number | string) => ['qcReviews', 'detail', String(id)] as const,
};

export function qcReviewsQueryOptions(params: QCReviewsParams) {
  return queryOptions({
    queryKey: qcReviewKeys.list(params),
    queryFn: async ({ signal }) =>
      toPaginated<QCReview>(
        await apiFetch<unknown>('/quality-control/qc-reviews/', { params: { ...params }, signal }),
      ),
    staleTime: 30_000,
  });
}

/** The full review (getQCReview); always refetched when the modal opens. */
export function qcReviewQueryOptions(id: number | string) {
  return queryOptions({
    queryKey: qcReviewKeys.detail(id),
    queryFn: ({ signal }) => apiFetch<QCReview>(`/quality-control/qc-reviews/${id}/`, { signal }),
    staleTime: 0,
  });
}

/** decideQCReview: approve, or reject with an NCR. */
export function useDecideQCReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      approve,
      comment,
      ncr = {},
    }: {
      id: number;
      approve: boolean;
      comment: string;
      ncr?: NcrDecisionData;
    }) =>
      apiFetch<QCReview>(`/quality-control/qc-reviews/${id}/decide/`, {
        method: 'POST',
        body: approve ? { approve, comment } : { approve, comment, ...ncr },
      }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: qcReviewKeys.all }),
        // The review counts of the hub and the band (api/qualityControl.ts).
        queryClient.invalidateQueries({ queryKey: ['qualityControl', 'qc-reviews'] }),
      ]),
  });
}

/** createComment on a discussion topic (POST /projects/discussion-comments/). */
export function useCreateDiscussionComment() {
  return useMutation({
    mutationFn: (data: { topic: number; content: string }) =>
      apiFetch<DiscussionComment>('/projects/discussion-comments/', { method: 'POST', body: data }),
  });
}

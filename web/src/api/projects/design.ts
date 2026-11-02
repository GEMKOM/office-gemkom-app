import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, cleanParams } from '../client';
import { toPaginated } from '../types';

// apis/projects/design.js and apis/projects/departmentTasks.js, as much as the
// design hub and the release review page need.

export const DESIGN_STALE_TIME = 60_000;

/**
 * How many drawing releases wait for a peer review (listPendingApprovalReleases),
 * from a one-row page.
 */
export function pendingReleaseCountQueryOptions() {
  const params = { page_size: 1 };
  return queryOptions({
    queryKey: ['drawingReleases', 'pendingApprovals', params] as const,
    queryFn: async ({ signal }) =>
      toPaginated<unknown>(
        await apiFetch<unknown>('/projects/drawing-releases/pending_approvals/', { params, signal }),
      ),
    staleTime: DESIGN_STALE_TIME,
    select: (page) => page.count,
  });
}

/**
 * How many department tasks match (listDepartmentTasks), from a one-row page.
 * The revision requests page asks for { department: 'design', has_pending_revision: true }.
 */
export function departmentTaskCountQueryOptions(filter: { department?: string; has_pending_revision?: boolean }) {
  const params = { ...filter, page_size: 1 };
  return queryOptions({
    queryKey: ['departmentTasks', 'list', cleanParams(params)] as const,
    queryFn: async ({ signal }) =>
      toPaginated<unknown>(await apiFetch<unknown>('/projects/department-tasks/', { params, signal })),
    staleTime: DESIGN_STALE_TIME,
    select: (page) => page.count,
  });
}

// ---- drawing release peer review (design/release-approvals) ----

export interface ReleaseApproval {
  approver_name?: string;
  decision?: string;
  decision_display?: string;
  created_at?: string;
}

export interface DrawingRelease {
  id: number;
  job_order_no?: string;
  job_order_title?: string;
  revision_code?: string | null;
  revision_number?: number | string;
  released_by_name?: string;
  folder_path?: string | null;
  changelog?: string | null;
  status?: string;
  status_display?: string;
  approval_state?: { approval_count?: number; required_count?: number } | null;
  released_at?: string | null;
  review_completed_at?: string | null;
  reviewers_summary?: string | null;
  /** The signed-in user is one of the reviewers who has not decided yet. */
  can_approve?: boolean;
  approvals?: ReleaseApproval[];
  /** The discussion topic reviewers talk in. */
  release_topic_id?: number | null;
  [key: string]: unknown;
}

export interface CompletedReviewParams {
  status__in?: string;
  job_order?: string;
  released_by?: string;
  reviewer?: string;
  completed_at_after?: string;
  completed_at_before?: string;
  search?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
}

export const releaseKeys = {
  all: ['drawingReleases'] as const,
  pending: ['drawingReleases', 'pendingApprovals', 'all'] as const,
  completed: (params: CompletedReviewParams) => ['drawingReleases', 'completedReviews', cleanParams({ ...params })] as const,
  detail: (id: number | string) => ['drawingReleases', 'detail', String(id)] as const,
};

/** Port of listPendingApprovalReleases: every release waiting for a review, unpaged. */
export function pendingReleasesQueryOptions() {
  return queryOptions({
    queryKey: releaseKeys.pending,
    queryFn: async ({ signal }) =>
      toPaginated<DrawingRelease>(await apiFetch<unknown>('/projects/drawing-releases/pending_approvals/', { signal }))
        .results,
    staleTime: 30_000,
  });
}

/** Port of listCompletedReviewReleases. */
export function completedReviewsQueryOptions(params: CompletedReviewParams) {
  return queryOptions({
    queryKey: releaseKeys.completed(params),
    queryFn: async ({ signal }) =>
      toPaginated<DrawingRelease>(
        await apiFetch<unknown>('/projects/drawing-releases/completed_reviews/', { params: { ...params }, signal }),
      ),
    staleTime: 30_000,
  });
}

/** Port of getDrawingRelease. */
export function drawingReleaseQueryOptions(id: number | string) {
  return queryOptions({
    queryKey: releaseKeys.detail(id),
    queryFn: ({ signal }) => apiFetch<DrawingRelease>(`/projects/drawing-releases/${id}/`, { signal }),
    staleTime: 0,
  });
}

/** Port of approveRelease: one reviewer's yes; `published` once the last one is in. */
export function useApproveRelease() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<{ message?: string; published?: boolean }>(`/projects/drawing-releases/${id}/approve/`, {
        method: 'POST',
        body: {},
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: releaseKeys.all }),
  });
}

/** Port of rejectRelease. */
export function useRejectRelease() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      apiFetch<unknown>(`/projects/drawing-releases/${id}/reject/`, { method: 'POST', body: { reason } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: releaseKeys.all }),
  });
}

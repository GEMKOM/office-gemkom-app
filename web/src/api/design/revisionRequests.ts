import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, cleanParams } from '../client';
import { toPaginated } from '../types';

// The revision requests page: listDepartmentTasks from apis/projects/departmentTasks.js
// and approveRevision / rejectRevision from apis/projects/design.js.

/** The revision request a drawing release carries while it waits for a decision. */
export interface PendingRevisionRequest {
  release_id?: number | null;
  topic_id?: number | null;
  revision_code?: string | null;
  revision_number?: number | string | null;
  reason?: string | null;
  requested_by?: string | null;
  requested_at?: string | null;
}

/** A design department task with a pending revision request (only the fields the page reads). */
export interface RevisionRequestTask {
  id: number;
  job_order?: string | null;
  customer_name?: string | null;
  title?: string | null;
  description?: string | null;
  pending_revision_request?: PendingRevisionRequest | null;
}

export interface RevisionRequestsParams {
  page: number;
  page_size: number;
}

export const REVISION_REQUESTS_STALE_TIME = 30_000;

/**
 * Port of the legacy loadRevisionRequests call. The key sits under
 * ['departmentTasks', 'list'] like the design hub's count, so a decision
 * refreshes both.
 */
export function revisionRequestsQueryOptions({ page, page_size }: RevisionRequestsParams) {
  const params = {
    has_pending_revision: true,
    department: 'design',
    page,
    page_size,
    ordering: '-revision_request__requested_at',
  };
  return queryOptions({
    queryKey: ['departmentTasks', 'list', cleanParams(params)] as const,
    queryFn: async ({ signal }) =>
      toPaginated<RevisionRequestTask>(
        await apiFetch<unknown>('/projects/department-tasks/', { params, signal }),
      ),
    staleTime: REVISION_REQUESTS_STALE_TIME,
  });
}

export interface ApproveRevisionInput {
  releaseId: number;
  topic_id?: number | null;
}

export interface RejectRevisionInput extends ApproveRevisionInput {
  reason: string;
}

/** Body as legacy built it: topic_id only when the request has one. */
function withTopic<T extends object>(
  body: T,
  topicId: number | null | undefined,
): T & { topic_id?: number } {
  return topicId ? { ...body, topic_id: topicId } : body;
}

export function approveRevision({ releaseId, topic_id }: ApproveRevisionInput) {
  return apiFetch<unknown>(`/projects/drawing-releases/${releaseId}/approve_revision/`, {
    method: 'POST',
    body: withTopic({}, topic_id),
  });
}

export function rejectRevision({ releaseId, topic_id, reason }: RejectRevisionInput) {
  return apiFetch<unknown>(`/projects/drawing-releases/${releaseId}/reject_revision/`, {
    method: 'POST',
    body: withTopic({ reason }, topic_id),
  });
}

function useInvalidateDepartmentTasks() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['departmentTasks'] });
}

export function useApproveRevision() {
  const invalidate = useInvalidateDepartmentTasks();
  return useMutation({ mutationFn: approveRevision, onSuccess: () => invalidate() });
}

export function useRejectRevision() {
  const invalidate = useInvalidateDepartmentTasks();
  return useMutation({ mutationFn: rejectRevision, onSuccess: () => invalidate() });
}

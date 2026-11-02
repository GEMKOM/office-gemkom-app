import { queryOptions } from '@tanstack/react-query';
import { apiFetch, cleanParams } from '../client';
import { toPaginated } from '../types';

// Read side of apis/projects/design.js and apis/projects/departmentTasks.js,
// as much as the design hub needs. The design pages themselves are still legacy.

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

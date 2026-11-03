import { queryOptions } from '@tanstack/react-query';
import { apiFetch, type QueryParams } from '../client';
import { listCountQueryOptions, listPageQueryOptions, HUB_STALE_TIME } from '../counts';
import type { CraneRequest } from './craneRequests';
import type { DepartmentRequest } from './departmentRequests';
import type { OvertimeRequest } from './overtime';
import type { VacationRequest } from './vacation';

// Counts and short lists for the Genel hubs. Keys sit under each list's own
// root, so a list page's mutations refresh the hub's figures too.

const CRANES = '/cranes/requests/';
const DEPARTMENT_REQUESTS = '/planning/department-requests/';

/** Crane / department requests at a stage where the user approves (not their own). */
export function cranePendingCountQueryOptions() {
  return listCountQueryOptions(['craneRequests', 'pendingApproval'], `${CRANES}pending_approval/`);
}

export function departmentRequestPendingCountQueryOptions() {
  return listCountQueryOptions(
    ['departmentRequests', 'pendingApproval'],
    `${DEPARTMENT_REQUESTS}pending_approval/`,
  );
}

/** Crane requests by exact status (the list filters status exactly). */
export function craneStatusCountQueryOptions(status: string) {
  return listCountQueryOptions(['craneRequests', 'list'], CRANES, { status });
}

export function departmentRequestStatusCountQueryOptions(status: string) {
  return listCountQueryOptions(['departmentRequests', 'list'], DEPARTMENT_REQUESTS, { status });
}

/** The user's own latest crane requests (my_requests, newest first). */
export function myCraneRequestsQueryOptions(pageSize: number) {
  return listPageQueryOptions<CraneRequest>(['craneRequests', 'mine'], `${CRANES}my_requests/`, {
    ordering: '-created_at',
    page_size: pageSize,
  });
}

/** The user's own latest department requests (my_requests ignores filters; newest first). */
export function myDepartmentRequestsQueryOptions(pageSize: number) {
  return listPageQueryOptions<DepartmentRequest>(
    ['departmentRequests', 'mine'],
    `${DEPARTMENT_REQUESTS}my_requests/`,
    { page_size: pageSize },
  );
}

/** Overtime requests the user can see (OvertimeRequestFilter names), counted. */
export function overtimeCountQueryOptions(params: QueryParams) {
  return listCountQueryOptions(['overtime', 'requests'], '/overtime/requests/', params);
}

/** A page of overtime requests, e.g. the next approved ones. */
export function overtimePageQueryOptions(params: QueryParams) {
  return listPageQueryOptions<OvertimeRequest>(
    ['overtime', 'requests'],
    '/overtime/requests/',
    params,
  );
}

/** People on overtime on a day (the "Mesai Kullanıcıları" page), counted. */
export function overtimeUsersCountQueryOptions(date: string) {
  return queryOptions({
    queryKey: ['overtime', 'usersForDate', date, 'count'] as const,
    queryFn: async ({ signal }) => {
      const data = await apiFetch<unknown>(`/overtime/users-for-date/${date}/`, { signal });
      if (Array.isArray(data)) return data.length;
      const body = (data ?? {}) as { count?: unknown; results?: unknown };
      if (typeof body.count === 'number') return body.count;
      return Array.isArray(body.results) ? body.results.length : 0;
    },
    staleTime: HUB_STALE_TIME,
  });
}

/** The user's own latest leave requests. */
export function myVacationRequestsQueryOptions(pageSize: number) {
  return listPageQueryOptions<VacationRequest & { requester_full_name?: string }>(
    ['vacationRequests', 'list'],
    '/vacation-requests/requests/',
    { mine: 'true', ordering: '-created_at', page_size: pageSize },
  );
}

/** A row of /vacation-requests/upcoming-leaves/ (approved leave overlapping the window). */
export interface LeaveOnCalendar {
  id: number;
  full_name?: string;
  team_label?: string | null;
  leave_type?: string;
  leave_type_label?: string;
  start_date?: string;
  end_date?: string;
  duration_days?: number | string;
}

/** Who is on approved leave between two dates (open to every user, unpaged). */
export function leavesBetweenQueryOptions(from: string, to: string) {
  return queryOptions({
    queryKey: ['vacationRequests', 'upcomingLeaves', from, to] as const,
    queryFn: async ({ signal }) => {
      const data = await apiFetch<unknown>('/vacation-requests/upcoming-leaves/', {
        params: { from_date: from, to_date: to },
        signal,
      });
      if (Array.isArray(data)) return data as LeaveOnCalendar[];
      const results = (data as { results?: unknown } | null)?.results;
      return Array.isArray(results) ? (results as LeaveOnCalendar[]) : [];
    },
    staleTime: 5 * 60_000,
  });
}

/** /vacation-requests/my-summary/, as much as the hubs read. */
export interface MyLeaveSummary {
  annual_leave?: {
    total_days?: number | string;
    used_days?: number | string;
    remaining_days?: number | string;
  };
  requests?: { submitted?: number };
  upcoming_leave?: {
    leave_type_label?: string;
    start_date?: string;
    end_date?: string;
    duration_days?: number | string;
  } | null;
}

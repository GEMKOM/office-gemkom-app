import { listCountQueryOptions, listPageQueryOptions } from '../counts';
import type { HrUser } from './users';
import { WAGES_KEY } from './wages';

// Counts for the HR and PDKS hubs, from one-row pages.

/** Today's PDKS records in one state (active = checked in, leave, ...); HR only. */
export function attendanceCountQueryOptions(date: string, status: string) {
  return listCountQueryOptions(['attendance', 'hrRecords'], '/attendance/hr/records/', {
    date,
    status,
  });
}

/** Active employees, as the users page lists them by default. */
export function activeUsersCountQueryOptions() {
  return listCountQueryOptions(['users'], '/users/', { is_active: 'true' }, 5 * 60_000);
}

// ---- data checks (HR hub "Veri Eksikleri", users page ?issue=) ----

/**
 * Every active employee in one page (the backend caps a page at 1000), for
 * the checks that look at profile fields. A few hundred rows; no endpoint
 * counts missing fields.
 */
export function activeUsersAllQueryOptions() {
  return listPageQueryOptions<HrUser>(['users'], '/users/', {
    is_active: 'true',
    page_size: 1000,
  });
}

/** A row of the wage overview (GET /users/wages/): each user's wage in force today. */
export interface WageOverviewRow {
  id: number;
  has_wage?: boolean;
  current_wage?: { id?: number; effective_from?: string | null } | null;
  [key: string]: unknown;
}

/** Active employees with their current wage; manage_hr only (403 otherwise). */
export function wageOverviewQueryOptions() {
  return listPageQueryOptions<WageOverviewRow>([...WAGES_KEY, 'overview'], '/users/wages/', {
    active: 'true',
    page_size: 1000,
  });
}

/** PDKS records between two dates still in one state, e.g. never checked out. */
export function attendanceRangeCountQueryOptions(dateFrom: string, dateTo: string, status: string) {
  return listCountQueryOptions(['attendance', 'hrRecords'], '/attendance/hr/records/', {
    date_from: dateFrom,
    date_to: dateTo,
    status,
  });
}

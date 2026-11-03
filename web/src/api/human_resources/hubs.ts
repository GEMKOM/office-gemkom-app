import { listCountQueryOptions } from '../counts';

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

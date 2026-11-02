import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../client';

// Port of getUserWorkHoursReport from apis/welding/reports.js (the job-cost
// reports from the same file live in ./jobCosts.ts).

/** Hours booked under one overtime type and the job numbers they went to. */
export interface OvertimeBucket {
  hours?: number | string | null;
  job_nos?: string[];
}

export interface UserWorkHoursRow {
  employee_id?: number;
  employee_username?: string;
  employee_full_name?: string;
  total_hours?: number | string | null;
  by_overtime_type?: {
    regular?: OvertimeBucket;
    after_hours?: OvertimeBucket;
    holiday?: OvertimeBucket;
  };
  [key: string]: unknown;
}

export interface UserWorkHoursReport {
  date_range?: { start?: string; end?: string };
  users?: UserWorkHoursRow[];
  [key: string]: unknown;
}

export type UserWorkHoursParams = {
  /** YYYY-MM-DD, required. */
  date_after: string;
  /** YYYY-MM-DD, required. */
  date_before: string;
};

export const userWorkHoursKeys = {
  all: ['weldingUserWorkHours'] as const,
  report: (params: UserWorkHoursParams) => ['weldingUserWorkHours', 'report', params] as const,
};

/** Legacy getUserWorkHoursReport: GET /welding/reports/user-work-hours/. */
export function fetchUserWorkHoursReport(
  params: UserWorkHoursParams,
  signal?: AbortSignal,
): Promise<UserWorkHoursReport> {
  if (!params.date_after || !params.date_before) {
    return Promise.reject(
      new Error('Both date_after and date_before query parameters are required'),
    );
  }
  return apiFetch<UserWorkHoursReport>('/welding/reports/user-work-hours/', {
    params: { date_after: params.date_after, date_before: params.date_before },
    signal,
  });
}

export function userWorkHoursQueryOptions(params: UserWorkHoursParams) {
  return queryOptions({
    queryKey: userWorkHoursKeys.report(params),
    queryFn: ({ signal }) => fetchUserWorkHoursReport(params, signal),
  });
}

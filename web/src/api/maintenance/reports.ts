import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { extractResults, toPaginated } from '../types';

// Port of apis/maintenance/reports.js (the /machines/reports/ endpoints).

/** A /machines/reports/faults/ row: one machine. */
export interface MachineFaultSummary {
  id?: number;
  name?: string | null;
  total_faults?: number | null;
  breaking_faults_count?: number | null;
  total_breaking_downtime_seconds?: number | null;
  total_non_breaking_duration_seconds?: number | null;
  total_downtime_seconds?: number | null;
  [key: string]: unknown;
}

export type FaultsSummaryParams = {
  page?: number;
  page_size?: number;
  search?: string;
  /** YYYY-MM-DD */
  reported_at__date?: string;
  reported_at__gte?: string;
};

/** A /machines/reports/staff/ row: one person. */
export interface StaffActivity {
  user_id: number;
  username?: string;
  full_name?: string | null;
  faults_resolved_count?: number | null;
  timers_count?: number | null;
  total_timer_seconds?: number | null;
  [key: string]: unknown;
}

/** Year and month of the staff report; both null = all time. */
export interface StaffPeriod {
  year: number | null;
  month: number | null;
}

export interface StaffResolvedFault {
  id: number;
  machine_name?: string | null;
  description?: string | null;
  is_breaking?: boolean;
  is_maintenance?: boolean;
  reported_at?: string | null;
  resolved_at?: string | null;
  resolution_duration_seconds?: number | null;
  [key: string]: unknown;
}

export interface StaffTimer {
  id: number;
  fault_id?: number | null;
  fault_machine?: string | null;
  start_time_ms?: number | null;
  finish_time_ms?: number | null;
  duration_seconds?: number | null;
  is_active?: boolean;
  [key: string]: unknown;
}

/** GET /machines/reports/staff/<user_id>/ */
export interface StaffActivityDetail {
  user: { id?: number; username?: string; full_name?: string | null; [key: string]: unknown };
  resolved_faults: StaffResolvedFault[];
  timers: StaffTimer[];
  [key: string]: unknown;
}

/** A month of /machines/reports/monthly-metrics/ ('period' is YYYY-MM). */
export interface MonthlyMetric {
  period: string;
  total_faults?: number | null;
  breaking_faults?: number | null;
  resolved_faults?: number | null;
  unresolved_faults?: number | null;
  resolve_rate_pct?: number | null;
  avg_resolution_seconds?: number | null;
  min_resolution_seconds?: number | null;
  max_resolution_seconds?: number | null;
  total_breaking_downtime_seconds?: number | null;
  unique_machines_affected?: number | null;
  unique_resolvers?: number | null;
  [key: string]: unknown;
}

export interface MonthlyMetricsSummary {
  total_faults_all_time?: number | null;
  total_resolved_all_time?: number | null;
  overall_avg_resolution_seconds?: number | null;
  total_breaking_downtime_all_time?: number | null;
  overall_avg_faults_per_month?: number | null;
  overall_avg_breaking_per_month?: number | null;
  /** YYYY-MM */
  busiest_month?: string | null;
  fastest_month?: string | null;
  [key: string]: unknown;
}

export interface MonthlyMetricsReport {
  monthly: MonthlyMetric[];
  summary: MonthlyMetricsSummary;
}

export const maintenanceReportKeys = {
  all: ['maintenanceReports'] as const,
  faults: (params: FaultsSummaryParams) => ['maintenanceReports', 'faults', params] as const,
  staff: (period: StaffPeriod) => ['maintenanceReports', 'staff', period] as const,
  staffDetail: (userId: number, period: StaffPeriod) =>
    ['maintenanceReports', 'staff', userId, period] as const,
  monthlyMetrics: ['maintenanceReports', 'monthly-metrics'] as const,
};

/** Legacy fetchMachineFaultsSummaryReport: GET /machines/reports/faults/ with the filters as-is. */
export function faultsSummaryQueryOptions(params: FaultsSummaryParams = {}) {
  return queryOptions({
    queryKey: maintenanceReportKeys.faults(params),
    queryFn: async ({ signal }) =>
      toPaginated<MachineFaultSummary>(
        await apiFetch<unknown>('/machines/reports/faults/', { params, signal }),
      ),
  });
}

/** Legacy fetchStaffActivityReport: GET /machines/reports/staff/[?year&month]. */
export function staffActivityQueryOptions(period: StaffPeriod = { year: null, month: null }) {
  return queryOptions({
    queryKey: maintenanceReportKeys.staff(period),
    queryFn: async ({ signal }) =>
      extractResults<StaffActivity>(
        await apiFetch<unknown>('/machines/reports/staff/', {
          params: { year: period.year, month: period.month },
          signal,
        }),
      ),
  });
}

/** Legacy fetchStaffActivityDetail: GET /machines/reports/staff/<user_id>/[?year&month]. */
export function staffActivityDetailQueryOptions(userId: number, period: StaffPeriod) {
  return queryOptions({
    queryKey: maintenanceReportKeys.staffDetail(userId, period),
    queryFn: ({ signal }) =>
      apiFetch<StaffActivityDetail>(`/machines/reports/staff/${userId}/`, {
        params: { year: period.year, month: period.month },
        signal,
      }),
  });
}

/** Legacy fetchMonthlyMetricsReport: GET /machines/reports/monthly-metrics/. */
export function monthlyMetricsQueryOptions() {
  return queryOptions({
    queryKey: maintenanceReportKeys.monthlyMetrics,
    queryFn: async ({ signal }) => {
      const data = await apiFetch<Partial<MonthlyMetricsReport> | null>(
        '/machines/reports/monthly-metrics/',
        {
          signal,
        },
      );
      return {
        monthly: data?.monthly ?? [],
        summary: data?.summary ?? {},
      } satisfies MonthlyMetricsReport;
    },
  });
}

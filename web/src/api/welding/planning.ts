import { queryOptions } from '@tanstack/react-query';
import type { PlanningBoard } from '@/pages/planning/project-planning/model/types';
import { apiFetch } from '../client';

// Port of apis/welding/planning.js: the İmalat Planlama board, its one bulk
// save and the advisory capacity report.

export const weldingPlanningKeys = {
  all: ['weldingPlanning'] as const,
  capacity: (months: number, difficulty: boolean) =>
    ['weldingPlanning', 'capacity', { months, difficulty }] as const,
};

/**
 * Planning board snapshot: resources with their blocks (assignments), the
 * assignable welding tasks, job_info per job order and the holiday calendar.
 * The page keeps its own working copy of it (edited in memory until Kaydet),
 * so this is a plain fetch rather than a cached query.
 */
export function fetchPlanningBoard(
  includeCompleted = false,
  signal?: AbortSignal,
): Promise<PlanningBoard> {
  return apiFetch<PlanningBoard>('/welding/planning/board/', {
    params: { include_completed: includeCompleted ? 'true' : undefined },
    signal,
  });
}

export interface BulkSavePayload {
  new_blocks: Record<string, unknown>[];
  blocks: BulkSaveBlock[];
  deleted_blocks: { assignment_type: string; assignment_id: number }[];
  department_tasks: Record<string, unknown>[];
}

export interface BulkSaveBlock {
  assignment_type: string;
  assignment_id: number | null;
  move_to?: { resource_type: string; resource_id: number; price_tier?: number };
  [key: string]: unknown;
}

export interface BulkSaveResponse {
  saved?: unknown;
  board?: PlanningBoard;
  messages?: string[];
}

/** One atomic save for the whole board. Returns {saved, board, messages}. */
export function bulkSavePlanning(payload: BulkSavePayload): Promise<BulkSaveResponse> {
  return apiFetch<BulkSaveResponse>('/welding/planning/bulk-save/', {
    method: 'POST',
    body: payload,
  });
}

// ---- capacity report (advisory, read-only) ---------------------------------

export interface CapacitySuggestion {
  kind: string;
  [key: string]: unknown;
}

export interface CapacityBlock {
  assignment_type?: string;
  assignment_id?: number;
  job_no?: string;
  job_order_title?: string;
  verdict?: string;
  flags?: string[];
  late_cause?: string | null;
  relaxed_slack_wd?: number | null;
  relaxed_finish?: string | null;
  finish?: string | null;
  first_touch?: string | null;
  deadline?: string | null;
  deadline_basis?: string | null;
  remaining_kg?: number | null;
  difficulty?: number | null;
  difficulty_source?: string | null;
  price_eur_per_kg?: number | null;
  suggestions?: CapacitySuggestion[];
  [key: string]: unknown;
}

export interface CapacityResource {
  key?: string;
  resource_type?: string;
  id?: number;
  name?: string;
  display_name?: string;
  rate_kg_per_wd?: number | null;
  rate_source?: string | null;
  confidence?: string | null;
  band?: number[] | null;
  evidence?: {
    statements?: {
      spans?: { active?: boolean; outlier?: boolean }[];
      per_person_kg_per_wd?: number | null;
    };
    progress_logs?: { blocks?: number };
    completed_blocks?: { samples?: unknown[] };
    [key: string]: unknown;
  };
  headcount?: number | null;
  headcount_source?: string | null;
  verdict?: string;
  pressure?: number | null;
  required_eff_kg_per_wd?: number | null;
  peak_deadline?: string | null;
  backlog_end?: string | null;
  backlog_wd?: number | null;
  open_blocks?: number;
  placeholder_blocks?: number;
  overdue_blocks?: number;
  overdue_kg?: number | null;
  remaining_kg?: number | null;
  remaining_eff_kg?: number | null;
  mean_difficulty?: number | null;
  blocks?: CapacityBlock[];
  suggestions?: CapacitySuggestion[];
  [key: string]: unknown;
}

export interface CapacitySummary {
  late_blocks?: number;
  plan_start_late_blocks?: number;
  overloaded_resources?: number;
  tight_resources?: number;
  no_rate_resources?: number;
  overdue_blocks?: number;
  unplanned_jobs?: number;
  unassigned_jobs?: number;
}

export interface CapacityParams {
  difficulty?: boolean;
  reference_eur_per_kg?: number | null;
  ignore_manual_rates?: boolean;
  [key: string]: unknown;
}

export interface CapacityReport {
  generated_at?: string;
  today?: string;
  params?: CapacityParams;
  resources?: CapacityResource[];
  unplanned_jobs?: (CapacitySuggestion & {
    job_no: string;
    job_order_title?: string;
    deadline?: string | null;
    deadline_basis?: string | null;
  })[];
  unassigned?: {
    job_no: string;
    job_order_title?: string;
    remaining_weight_kg?: number | null;
    deadline?: string | null;
    deadline_basis?: string | null;
    suggestion?: CapacitySuggestion | null;
  }[];
  summary?: CapacitySummary;
  timing_ms?: number | null;
  [key: string]: unknown;
}

/** GET /welding/planning/capacity/?months=6&difficulty=1 */
export function fetchCapacityReport(months: number, difficulty: boolean, signal?: AbortSignal) {
  return apiFetch<CapacityReport>('/welding/planning/capacity/', {
    params: { months: String(months), difficulty: difficulty ? '1' : '0' },
    signal,
  });
}

// Stale-while-revalidate, like the meeting deck: reopened within five minutes
// the drawer shows what it has.
export const CAPACITY_MAX_AGE_MS = 5 * 60 * 1000;

export function capacityReportQueryOptions(months: number, difficulty: boolean) {
  return queryOptions({
    queryKey: weldingPlanningKeys.capacity(months, difficulty),
    queryFn: ({ signal }) => fetchCapacityReport(months, difficulty, signal),
    staleTime: CAPACITY_MAX_AGE_MS,
  });
}

/**
 * The resource's manual capacity (kg-eş per working day), null to go back to
 * the measured rate. The one write the Kapasite drawer makes: a resource
 * attribute the planner owns (legacy updateTeam / updateSubcontractor).
 */
export function saveResourceCapacity(
  resourceType: string,
  id: number,
  capacityKgPerWd: number | null,
) {
  const path = resourceType === 'team' ? `/teams/${id}/` : `/subcontracting/subcontractors/${id}/`;
  return apiFetch<unknown>(path, {
    method: 'PATCH',
    body: { capacity_kg_per_wd: capacityKgPerWd },
  });
}

import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../client';
import type { ExclusionEffect, ExclusionNote, WeldJoint, WeldSchedule } from './estimator';

// Port of the reference-library part of apis/estimator.js for
// /projects/references (Referanslar): reference profiles, their review, the
// weld-list versions (view, hand edit, preview) and the estimator parameters.

/** A row of GET /estimator/reference-profiles/. */
export interface ReferenceProfile {
  job_no: string;
  job_status?: string | null;
  title?: string | null;
  customer?: string | null;
  family?: string | null;
  route?: string | null;
  structure_class?: string | null;
  structure_class_label?: string | null;
  schema_version?: number | null;
  quantity?: number | null;
  unit_mass_kg?: number | null;
  weld_m_total?: number | null;
  weld_m_by_material?: Record<string, number> | null;
  joints_total?: number | null;
  recorded_welding_h_per_unit?: number | null;
  recorded_welding_h_total?: number | null;
  recorded_machining_h_per_unit?: number | null;
  hours_reliability?: string | null;
  shop_h_per_unit?: number | null;
  shop_in_house_h_per_unit?: number | null;
  mach_h_per_unit?: number | null;
  total_h_per_unit?: number | null;
  bottom_up_h_per_unit?: number | null;
  work_centres?: { key?: string; label: string; hours: number }[] | null;
  factor?: number | null;
  factor_mach?: number | null;
  in_house_exclusion?: string | null;
  machining_exclusion?: string | null;
  subcontracted_kg_share?: number | null;
  weld_schedule_confidence?: number | null;
  weld_schedule_version?: number | null;
  plan_confidence?: number | null;
  review_status?: 'unreviewed' | 'verified' | 'excluded' | string | null;
  review_note?: string | null;
  reviewed_by_name?: string | null;
  reviewed_at?: string | null;
  /** Exclusions made on reports (history, newest last) and what they do to the next ones. */
  exclusion_notes?: ExclusionNote[];
  exclusions_active?: number;
  exclusion_effect?: ExclusionEffect;
  [key: string]: unknown;
}

export interface ReferenceList {
  count?: number;
  results: ReferenceProfile[];
  families?: string[];
}

export interface ReferenceFilters {
  search?: string;
  /** Comma-separated values, as the legacy filters sent them. */
  family?: string;
  route?: string;
  reliability?: string;
  review_status?: string;
  status?: string;
}

export interface Distribution {
  n?: number;
  mean?: number;
  median?: number;
  p25?: number;
  p75?: number;
  min?: number;
  max?: number;
}

/** GET /estimator/reference-profiles/summary/. */
export interface ReferenceSummary {
  counts?: { total?: number; review_status?: Record<string, number>; schema_version?: Record<string, number> };
  jobs_used?: string[];
  families?: Record<string, Distribution>;
  classes?: Record<string, Distribution>;
  class_labels?: Record<string, string>;
  all?: Distribution | null;
  machining?: { all?: Distribution | null; classes?: Record<string, Distribution>; jobs_used?: string[] };
  bands?: {
    shop?: { family?: Record<string, Distribution>; class?: Record<string, Distribution> };
    mach?: { family?: Record<string, Distribution>; class?: Record<string, Distribution> };
  };
  population?: string;
}

export interface EstimatorParameter {
  key: string;
  label: string;
  unit?: string;
  group?: string;
  value: number;
  default: number;
  is_default?: boolean;
  description?: string;
  changed_by_name?: string | null;
  changed_at?: string | null;
}

export interface ParameterChange {
  changed_at?: string;
  changed_by_name?: string;
  label?: string;
  old_value?: number | null;
  new_value?: number | null;
  note?: string;
}

/** GET / PUT /estimator/parameters/. */
export interface EstimatorParameters {
  parameters: EstimatorParameter[];
  groups?: Record<string, string>;
  changes?: ParameterChange[];
  changed?: unknown[];
}

/** A weld schedule version as the job's endpoint returns it (with its history). */
export interface WeldScheduleVersion extends WeldSchedule {
  version?: number;
  is_latest?: boolean;
  edited?: boolean;
  edited_by_name?: string | null;
  edit_note?: string | null;
  created_at?: string | null;
  based_on_version?: number | null;
  version_history?: {
    version: number;
    created_at?: string;
    edited?: boolean;
    edited_by_name?: string | null;
    based_on_version?: number | null;
    edit_note?: string | null;
    joints_total?: number | null;
    weld_m_total?: number | null;
    unit_mass_kg?: number | null;
  }[];
}

/** POST …/versions/ (and …/versions/preview/) body. */
export interface WeldScheduleEdit {
  base_version?: number;
  part_name: string;
  unit_mass_kg: number | null;
  mass_basis: string;
  mass_by_material: Record<string, number>;
  pieces_per_unit: number | null;
  bends_per_unit: number | null;
  joints: (WeldJoint & { count_per_unit: number | null; length_m_each: number | null })[];
  design_features: string[];
  processes: string[];
  open_questions: string[];
  note: string;
}

const BASE = '/estimator';

export const referenceKeys = {
  all: ['estimator', 'references'] as const,
  list: (filters: ReferenceFilters) => ['estimator', 'references', 'list', filters] as const,
  summary: ['estimator', 'references', 'summary'] as const,
  parameters: ['estimator', 'parameters'] as const,
  weld: (jobNo: string, version: number | null) => ['estimator', 'weld-schedules', jobNo, version] as const,
};

export function referencesQueryOptions(filters: ReferenceFilters) {
  return queryOptions({
    queryKey: referenceKeys.list(filters),
    queryFn: ({ signal }) => apiFetch<ReferenceList>(`${BASE}/reference-profiles/`, { params: { ...filters }, signal }),
  });
}

export function referenceSummaryQueryOptions() {
  return queryOptions({
    queryKey: referenceKeys.summary,
    queryFn: ({ signal }) => apiFetch<ReferenceSummary>(`${BASE}/reference-profiles/summary/`, { signal }),
  });
}

export function estimatorParametersQueryOptions() {
  return queryOptions({
    queryKey: referenceKeys.parameters,
    queryFn: ({ signal }) => apiFetch<EstimatorParameters>(`${BASE}/parameters/`, { signal }),
  });
}

/** A job's weld list: the latest, or the given version. */
export function jobWeldScheduleQueryOptions(jobNo: string, version: number | null) {
  return queryOptions({
    queryKey: referenceKeys.weld(jobNo, version),
    queryFn: ({ signal }) =>
      apiFetch<WeldScheduleVersion>(`${BASE}/weld-schedules/${encodeURIComponent(jobNo)}/`, {
        params: { version: version ?? undefined },
        signal,
      }),
  });
}

/** reviewStatus: verified | excluded (note required) | unreviewed. Returns the updated row. */
export function reviewReferenceProfile(jobNo: string, reviewStatus: string, note = ''): Promise<ReferenceProfile> {
  return apiFetch<ReferenceProfile>(`${BASE}/reference-profiles/${encodeURIComponent(jobNo)}/review/`, {
    method: 'POST',
    body: { review_status: reviewStatus, note },
  });
}

/** values: {key: number}; a 400 carries `data.errors` = {key: message}. */
export function updateEstimatorParameters(values: Record<string, number>, note = ''): Promise<EstimatorParameters> {
  return apiFetch<EstimatorParameters>(`${BASE}/parameters/`, { method: 'PUT', body: { values, note } });
}

/** Saves a hand-corrected list as the next version; a 400 carries `data.errors` keyed like 'joints.3.count_per_unit'. */
export function saveWeldScheduleVersion(
  jobNo: string,
  body: WeldScheduleEdit,
): Promise<{ weld_schedule: WeldScheduleVersion; profile?: ReferenceProfile | null }> {
  return apiFetch(`${BASE}/weld-schedules/${encodeURIComponent(jobNo)}/versions/`, { method: 'POST', body });
}

/** Same body, nothing saved: {totals, bottom_up, joints}. */
export function previewWeldScheduleVersion(
  jobNo: string,
  body: WeldScheduleEdit,
  signal?: AbortSignal,
): Promise<{ totals?: Record<string, unknown>; bottom_up?: { lines?: { hours?: number }[]; welding_h?: number; non_welding_h?: number; total_h?: number } }> {
  return apiFetch(`${BASE}/weld-schedules/${encodeURIComponent(jobNo)}/versions/preview/`, {
    method: 'POST',
    body,
    signal,
  });
}

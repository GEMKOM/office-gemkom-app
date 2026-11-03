import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { extractResults } from '../types';

// Port of apis/subcontracting/priceTiers.js (planner + bulk plan) and
// apis/subcontracting/priceTierTemplates.js, as the Ağırlık ve Fiyat
// Kademeleri modal uses them. The plain tier list (legacy fetchPriceTiers)
// is priceTiersQueryOptions in ./assignments, re-exported here.

export { priceTiersQueryOptions, type PriceTier } from './assignments';

/** An existing tier as GET /subcontracting/price-tiers/planner/ sends it. */
export interface PlannerTier {
  id: number;
  tier_type: string;
  tier_type_display?: string;
  name: string;
  price_per_kg: string | number | null;
  currency: string;
  allocated_weight_kg: string | number | null;
  used_weight_kg?: string | number | null;
  remaining_weight_kg?: string | number | null;
  assignment_count?: number;
}

/** One job order of the planner tree (depth-first from the root). */
export interface PlannerJob {
  job_no: string;
  title?: string | null;
  status: string;
  status_display?: string;
  parent?: string | null;
  depth: number;
  is_phase?: boolean;
  can_plan: boolean;
  quantity?: number | null;
  total_weight_kg?: string | number | null;
  offer_weight_kg?: string | number | null;
  offer_quantity?: number | null;
  tiers: PlannerTier[];
}

export interface PriceTierPlanner {
  root?: string;
  job_orders?: PlannerJob[];
}

export interface BulkPlanTier {
  tier_type: string;
  name: string;
  price_per_kg: string;
  currency: string;
  allocated_weight_kg: string;
}

export interface BulkPlanTierUpdate {
  id: number;
  [field: string]: string | number;
}

export interface BulkPlan {
  job_order: string;
  total_weight_kg?: string | null;
  tiers?: BulkPlanTier[];
  update_tiers?: BulkPlanTierUpdate[];
  delete_tiers?: number[];
}

export interface BulkPlanPayload {
  plans: BulkPlan[];
}

export interface BulkPlanResponse {
  message?: string;
  [key: string]: unknown;
}

/** Error body of bulk_plan: which job order (and row / tier) the backend refused. */
export interface BulkPlanErrorData {
  message?: string;
  detail?: string;
  job_order?: string;
  index?: number;
  tier_id?: number;
  errors?: Record<string, unknown>;
}

export interface PriceTierTemplateItem {
  id?: number;
  sequence?: number;
  tier_type?: string;
  name?: string;
  price_per_kg?: string | number | null;
  currency?: string;
  /** Share of the job weight in percent; null: the kg is typed per job order. */
  weight_share_pct?: string | number | null;
}

export interface PriceTierTemplate {
  id: number;
  name: string;
  description?: string | null;
  is_active: boolean;
  items: PriceTierTemplateItem[];
}

export interface PriceTierTemplateInput {
  name: string;
  description: string;
  is_active: boolean;
  items: Array<{
    tier_type: string;
    name: string;
    price_per_kg: string;
    currency: string;
    weight_share_pct: string | null;
  }>;
}

export const priceTierPlannerKeys = {
  planner: (jobNo: string) => ['priceTierPlanner', jobNo] as const,
  templates: (isActive?: boolean | null) =>
    ['priceTierTemplates', 'list', isActive ?? null] as const,
  templatesAll: ['priceTierTemplates'] as const,
};

/** GET /subcontracting/price-tiers/planner/?job_order= : the root's whole tree. */
export function getPriceTierPlanner(jobNo: string, signal?: AbortSignal) {
  return apiFetch<PriceTierPlanner>('/subcontracting/price-tiers/planner/', {
    params: { job_order: jobNo },
    signal,
  });
}

export function priceTierPlannerQueryOptions(jobNo: string) {
  return queryOptions({
    queryKey: priceTierPlannerKeys.planner(jobNo),
    queryFn: ({ signal }) => getPriceTierPlanner(jobNo, signal),
    // Loaded fresh on every open, like the legacy modal; edits are keyed on it.
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
}

/**
 * POST /subcontracting/price-tiers/bulk_plan/: weights, new tiers, tier edits
 * and deletes for many job orders in one transaction. A refusal throws an
 * ApiError whose `data` is a BulkPlanErrorData.
 */
export function bulkPlanPriceTiers(payload: BulkPlanPayload) {
  return apiFetch<BulkPlanResponse>('/subcontracting/price-tiers/bulk_plan/', {
    method: 'POST',
    body: payload,
  });
}

/** GET /subcontracting/price-tier-templates/ (?is_active=true|false). */
export async function listPriceTierTemplates(
  filters: { is_active?: boolean | null } = {},
  signal?: AbortSignal,
) {
  const params =
    filters.is_active !== undefined && filters.is_active !== null
      ? { is_active: String(filters.is_active) }
      : {};
  return extractResults<PriceTierTemplate>(
    await apiFetch<unknown>('/subcontracting/price-tier-templates/', { params, signal }),
  );
}

export function priceTierTemplatesQueryOptions(isActive?: boolean | null) {
  return queryOptions({
    queryKey: priceTierPlannerKeys.templates(isActive),
    queryFn: ({ signal }) => listPriceTierTemplates({ is_active: isActive }, signal),
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
}

export function createPriceTierTemplate(data: PriceTierTemplateInput) {
  return apiFetch<PriceTierTemplate>('/subcontracting/price-tier-templates/', {
    method: 'POST',
    body: data,
  });
}

/** PATCH; the items replace the template's list. */
export function updatePriceTierTemplate(id: number, data: PriceTierTemplateInput) {
  return apiFetch<PriceTierTemplate>(`/subcontracting/price-tier-templates/${id}/`, {
    method: 'PATCH',
    body: data,
  });
}

export function deletePriceTierTemplate(id: number) {
  return apiFetch<void>(`/subcontracting/price-tier-templates/${id}/`, { method: 'DELETE' });
}

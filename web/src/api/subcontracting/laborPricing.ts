import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../client';

// Port of apis/subcontracting/laborPricing.js.
//
// - GET  /subcontracting/labor-pricing/   compute rates for a job order selection
// - POST /subcontracting/labor-pricing/   save the knobs onto those job orders
//
// The GET is read-only: it creates no price tiers and no assignments.

/** The six knobs saved onto the job orders (values as typed; '' is left out). */
export interface LaborPricingKnobs {
  /** Material cost, EUR/kg. */
  material_rate?: string;
  /** General expenses, EUR/kg. */
  general_rate?: string;
  /** Margin to keep, percent. */
  margin_pct?: string;
  /** Weight exponent, 0..1. */
  alpha?: string;
  /** Size factor floor. */
  factor_min?: string;
  /** Size factor ceiling. */
  factor_max?: string;
}

/** Everything the calculation takes: the knobs plus the yevmiye (never saved). */
export interface LaborPricingParams extends LaborPricingKnobs {
  /** Yevmiye (1 = 1 day = 9 hours) paid on top of the kg price. */
  support_days?: number;
  /** Price of one yevmiye, TRY. */
  support_day_rate_try?: number;
}

type Decimal = number | string | null;

export interface LaborPricingTotals {
  line_count: number;
  piece_count: number;
  total_weight_kg: Decimal;
  total_price_eur: Decimal;
  revenue_per_kg: Decimal;
  material_per_kg: Decimal;
  general_per_kg: Decimal;
  profit_per_kg: Decimal;
  profit_eur: Decimal;
  labor_per_kg: Decimal;
  labor_per_kg_try: Decimal;
  kg_labor_per_kg: Decimal;
  kg_labor_per_kg_try?: Decimal;
  support_per_kg?: Decimal;
  support_days?: Decimal;
  support_try?: Decimal;
  support_eur?: Decimal;
  support_exceeds_pool?: boolean;
  labor_pool_eur: Decimal;
  labor_allocated_eur: Decimal;
  base_rate_k: Decimal;
  reference_weight_kg: Decimal;
  is_feasible: boolean;
  eur_try_rate: Decimal;
  /** 'YYYY-MM-DD' of the exchange-rate snapshot. */
  fx_date: string | null;
  [key: string]: unknown;
}

export interface LaborPricingLine {
  job_no: string;
  title?: string;
  root_job_no: string;
  root_title?: string;
  quantity: number | string;
  weight_kg: Decimal;
  total_weight_kg: Decimal;
  sell_per_kg: Decimal;
  size_factor: Decimal;
  difficulty: Decimal;
  labor_per_kg: Decimal;
  labor_per_kg_try: Decimal;
  labor_per_piece_eur: Decimal;
  labor_total_eur: Decimal;
  line_margin_pct: Decimal;
  [key: string]: unknown;
}

export interface LaborPricingReport {
  params: { margin_pct: Decimal; alpha: Decimal; [key: string]: unknown };
  totals: LaborPricingTotals;
  lines: LaborPricingLine[];
  skipped: { job_no: string; [key: string]: unknown }[];
  selection?: unknown;
}

/** { [jobNo]: multiplier } per-line overrides. */
export type DifficultyMap = Record<string, number>;

export interface LaborPricingRequest {
  jobNos: string[];
  params: LaborPricingParams;
  difficulty: DifficultyMap;
}

export const laborPricingKeys = {
  all: ['subcontractingLaborPricing'] as const,
  compute: (request: LaborPricingRequest) =>
    ['subcontractingLaborPricing', 'compute', request] as const,
};

const PATH = '/subcontracting/labor-pricing/';

/** Legacy `difficulty` param: `job:value` pairs for overrides other than 1. */
export function difficultyParam(difficulty: DifficultyMap): string | undefined {
  const overrides = Object.entries(difficulty)
    .filter(([, value]) => Number(value) > 0 && Number(value) !== 1)
    .map(([jobNo, value]) => `${jobNo}:${value}`);
  return overrides.length ? overrides.join(',') : undefined;
}

/**
 * Legacy fetchLaborPricing. Selecting a job together with one of its own
 * parents, or with one of its delivery phases, is rejected by the backend.
 * TRY figures use the latest exchange-rate snapshot up to today (null if none).
 */
export function fetchLaborPricing(
  { jobNos, params, difficulty }: LaborPricingRequest,
  signal?: AbortSignal,
): Promise<LaborPricingReport> {
  return apiFetch<LaborPricingReport>(PATH, {
    params: { job_no: jobNos, ...params, difficulty: difficultyParam(difficulty) },
    signal,
  });
}

export function laborPricingQueryOptions(request: LaborPricingRequest) {
  return queryOptions({
    queryKey: laborPricingKeys.compute(request),
    queryFn: ({ signal }) => fetchLaborPricing(request, signal),
    // A calculation, not a list: the same inputs give the same answer until
    // someone asks again (Yenile refetches).
    staleTime: Infinity,
  });
}

/**
 * Legacy saveLaborPricingParams: persist the knobs onto the selected job
 * orders, so the next person opening them sees the numbers this quote was
 * built with.
 */
export function saveLaborPricingParams(
  jobNos: string[],
  params: LaborPricingKnobs,
): Promise<{ saved: unknown[]; params?: unknown }> {
  return apiFetch(PATH, { method: 'POST', body: { job_no: jobNos, ...params } });
}

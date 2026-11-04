import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../client';
import type { ExclusionEffect, ExclusionNote } from './estimator';

// The MALİYET archive (estimator.HistoricalCostReference): post-job cost sheets
// of past work, restated to today, with the manufacturing plan read from the
// job's PDM drawings when there is one. The estimate report reads the closest
// rows as a cross-check; this page lists and reviews them.

export interface CostSplit {
  labour?: number | null;
  material?: number | null;
  overhead?: number | null;
  total?: number | null;
  eur_per_kg?: number | null;
  restated_to?: string;
}

/** The plan figures carried by a row (subset of plan_summary). */
export interface ArchivePlan {
  unit_mass_kg?: number | null;
  joints?: number | null;
  weld_m?: number | null;
  weld_m_per_t?: number | null;
  total_h?: number | null;
  shop_h?: number | null;
  mach_h?: number | null;
  h_per_t?: { shop?: number; mach?: number; total?: number } | number | null;
  structure_class?: string | null;
  mass_by_material_kg?: Record<string, number> | null;
  design_features?: string[] | null;
}

/** A row of GET /estimator/cost-history/. */
export interface CostHistoryRow {
  id: number;
  job_no: string | null;
  product: string | null;
  customer: string | null;
  customer_code?: string | null;
  family: string;
  family_label: string;
  qty: number | null;
  kg_each: number | null;
  kg_total: number | null;
  cost_month: string;
  date_source: string;
  then: CostSplit;
  now: CostSplit;
  factors: { labour?: number | null; steel?: number | null };
  basis: string;
  sale_eur: number | null;
  flags: string[];
  review: 'unreviewed' | 'verified' | 'excluded' | string;
  review_note?: string;
  notes?: string[];
  source_file?: string;
  pdm_folder?: string;
  in_app?: boolean;
  plan: ArchivePlan | null;
  plan_source?: 'claude_code' | 'api' | null;
  /** Exclusions made on reports (history, newest last) and what they do to the next ones. */
  exclusion_notes?: ExclusionNote[];
  exclusions_active?: number;
  exclusion_effect?: ExclusionEffect;
  plan_read_at?: string | null;
  plan_detail?: {
    sub_assemblies?: number | null;
    parts?: number | null;
    weld_m_drawn?: number | null;
    cnc_h?: number | null;
    bend_h?: number | null;
    qc_h?: number | null;
  } | null;
  kg_each_over_plan_unit?: number | null;
}

export interface FamilyReliability {
  n?: number;
  median_error?: number | null;
  level?: 'good' | 'medium' | 'poor' | 'unknown' | string;
}

export interface CostHistoryFamily {
  family: string;
  label: string;
  n: number;
  median_eur_per_kg_now: number;
  reliability?: FamilyReliability | null;
}

export interface CostHistoryList {
  count: number;
  results: CostHistoryRow[];
  families: CostHistoryFamily[];
}

const BASE = '/estimator/cost-history';

export const costHistoryKeys = {
  all: ['estimator', 'cost-history'] as const,
};

/** The whole archive (about 500 rows): the page filters it in the browser. */
export function costHistoryQueryOptions() {
  return queryOptions({
    queryKey: costHistoryKeys.all,
    queryFn: ({ signal }) => apiFetch<CostHistoryList>(`${BASE}/`, { signal }),
  });
}

/** reviewStatus: verified | excluded (note required) | unreviewed. */
export function reviewCostHistoryRow(
  id: number,
  reviewStatus: string,
  note = '',
): Promise<{ id: number; review_status: string; review_note: string }> {
  return apiFetch(`${BASE}/${id}/review/`, { method: 'POST', body: { review_status: reviewStatus, note } });
}

/** Flags the archive builder sets, in words. */
export const ARCHIVE_FLAG_LABELS: Record<string, string> = {
  per_kg_outlier: 'Aykırı €/kg (eşleşmede kullanılmaz)',
  components_inconsistent: 'Maliyet kalemleri toplamı tutmuyor',
  no_job_no: 'İş numarası yok',
  total_only: 'Yalnızca toplam var',
};

export function archiveFlagLabel(flag: string): string {
  if (ARCHIVE_FLAG_LABELS[flag]) return ARCHIVE_FLAG_LABELS[flag];
  const share = flag.match(/^split_assumed_labour_share_([\d.]+)/);
  if (share) return `İşçilik payı varsayıldı (%${Math.round(Number(share[1]) * 100)})`;
  return flag;
}

export const RELIABILITY_LABELS: Record<string, { label: string; color: 'green' | 'blue' | 'orange' | 'grey' }> = {
  good: { label: 'İyi', color: 'green' },
  medium: { label: 'Orta', color: 'blue' },
  poor: { label: 'Zayıf', color: 'orange' },
  unknown: { label: 'Az veri', color: 'grey' },
};

/** Welding-shop hours per tonne of a plan (machining is part-specific and left out). */
export function planShopHoursPerTonne(plan: ArchivePlan | null | undefined): number | null {
  if (!plan) return null;
  const hpt = plan.h_per_t;
  if (hpt && typeof hpt === 'object') return hpt.shop ?? null;
  if (typeof hpt === 'number') return hpt;
  return plan.shop_h && plan.unit_mass_kg ? (plan.shop_h * 1000) / plan.unit_mass_kg : null;
}

/** Share of copper in the plan's mass, 0–1, or null. */
export function planCopperShare(plan: ArchivePlan | null | undefined): number | null {
  const m = plan?.mass_by_material_kg;
  if (!m) return null;
  const total = Object.values(m).reduce((a, b) => a + (Number(b) || 0), 0);
  if (!total) return null;
  return (Number(m.copper) || 0) / total;
}

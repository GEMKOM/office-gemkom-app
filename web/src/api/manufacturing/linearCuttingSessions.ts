import { authedFetch } from '@/auth/authService';
import { queryOptions } from '@tanstack/react-query';
import { saveBlob } from '@/ui/files';
import { ApiError, apiFetch, buildUrl, errorMessage } from '../client';
import { extractResults } from '../types';
import type { LinearCut, LinearPass } from './linearCutting';

// Port of apis/linear_cutting/sessions.js and parts.js (cutting plans and
// their parts), plus the two searches the cuts page's dropdowns ran.

/** One group of `optimization_summary` on a session list row. */
export interface LinearOptimizationSummary {
  bars_needed?: number | null;
  [key: string]: unknown;
}

export interface LinearStockBar {
  item_code?: string | null;
  item_name?: string | null;
  item_unit?: string | null;
  length_mm?: number | null;
  quantity?: number | null;
  declared_by_username?: string | null;
  [key: string]: unknown;
}

export interface LinearPart {
  id: number;
  session?: string;
  item?: number | null;
  item_code?: string | null;
  item_name?: string | null;
  item_unit?: string | null;
  stock_length_mm?: number | null;
  label?: string | null;
  image_no?: string | null;
  nominal_length_mm?: number | string | null;
  quantity?: number | null;
  angle_left_deg?: number | string | null;
  angle_right_deg?: number | string | null;
  profile_height_mm?: number | null;
  setback_left_mm?: number | string | null;
  setback_right_mm?: number | string | null;
  allow_rotation?: boolean | null;
  requires_bending?: boolean | null;
  job_no?: string | null;
  order?: number | null;
  [key: string]: unknown;
}

/** One bar the optimizer laid out. */
export interface LinearOptimizedBar {
  bar_index?: number | null;
  global_bar_index?: number | null;
  stock_length_mm?: number | null;
  waste_mm?: number | null;
  is_remnant?: boolean;
  cuts?: LinearCut[] | null;
  passes?: LinearPass[] | null;
  [key: string]: unknown;
}

/** The bars of one material (profile). */
export interface LinearOptimizationGroup {
  item_name?: string | null;
  item_code?: string | null;
  stock_length_mm?: number | null;
  kerf_mm?: number | string | null;
  bars_needed?: number | null;
  efficiency_pct?: number | null;
  total_waste_mm?: number | null;
  total_pass_count?: number | null;
  material_saved_by_nesting_mm?: number | null;
  bars?: LinearOptimizedBar[] | null;
  [key: string]: unknown;
}

export interface LinearOptimizationResult {
  groups?: LinearOptimizationGroup[] | null;
  warnings?: string[] | null;
  [key: string]: unknown;
}

export interface LinearCuttingSession {
  key: string;
  title?: string | null;
  stock_length_mm?: number | null;
  kerf_mm?: number | string | null;
  notes?: string | null;
  tasks_created?: boolean;
  planning_request_created?: boolean;
  stock_entry_complete?: boolean;
  stock_bars?: LinearStockBar[] | null;
  parts?: LinearPart[] | null;
  optimization_summary?: LinearOptimizationSummary[] | null;
  optimization_result?: LinearOptimizationResult | null;
  [key: string]: unknown;
}

export interface LinearSessionInput {
  title: string;
  stock_length_mm: number | null;
  kerf_mm: number | null;
  notes: string;
}

export interface LinearConfirmResult {
  created_tasks?: string[] | null;
  planning_request_number?: string | null;
  [key: string]: unknown;
}

/** What the page sends for a part (create and inline edit alike). */
export interface LinearPartPayload {
  session: string;
  item: number | null;
  stock_length_mm: number | null;
  label: string;
  image_no: string;
  job_no: string;
  nominal_length_mm: number | null;
  quantity: number | null;
  angle_left_deg: number | null;
  angle_right_deg: number | null;
  profile_height_mm: number | null;
  setback_left_mm: number | null;
  setback_right_mm: number | null;
  allow_rotation: boolean;
  requires_bending: boolean;
  order: number | null;
}

export const lcSessionKeys = {
  all: ['linearCuttingSessions'] as const,
  list: () => ['linearCuttingSessions', 'list'] as const,
  detail: (key: string) => ['linearCuttingSessions', 'detail', key] as const,
  parts: (key: string) => ['linearCuttingSessions', 'parts', key] as const,
};

const sessionPath = (key: string) => `/linear_cutting/sessions/${encodeURIComponent(key)}/`;
const partPath = (id: number | string) => `/linear_cutting/parts/${encodeURIComponent(id)}/`;

export function linearSessionsQueryOptions() {
  return queryOptions({
    queryKey: lcSessionKeys.list(),
    queryFn: async ({ signal }) =>
      extractResults<LinearCuttingSession>(
        await apiFetch<unknown>('/linear_cutting/sessions/', {
          params: { ordering: '-created_at' },
          signal,
        }),
      ),
  });
}

export function linearSessionQueryOptions(key: string) {
  return queryOptions({
    queryKey: lcSessionKeys.detail(key),
    queryFn: ({ signal }) => apiFetch<LinearCuttingSession>(sessionPath(key), { signal }),
    // The plan form is filled from it; a background refetch must not reset it.
    staleTime: Infinity,
  });
}

export function linearPartsQueryOptions(key: string) {
  return queryOptions({
    queryKey: lcSessionKeys.parts(key),
    queryFn: async ({ signal }) =>
      extractResults<LinearPart>(
        await apiFetch<unknown>('/linear_cutting/parts/', { params: { session: key }, signal }),
      ),
    staleTime: Infinity,
  });
}

export function createLinearSession(data: LinearSessionInput & { parts_data: [] }) {
  return apiFetch<LinearCuttingSession>('/linear_cutting/sessions/', {
    method: 'POST',
    body: data,
  });
}

export function patchLinearSession(key: string, data: LinearSessionInput) {
  return apiFetch<LinearCuttingSession>(sessionPath(key), { method: 'PATCH', body: data });
}

export function optimizeLinearSession(
  key: string,
  data: { stock_length_mm: number | null; kerf_mm: number | null },
) {
  return apiFetch<LinearOptimizationResult>(`${sessionPath(key)}optimize/`, {
    method: 'POST',
    body: data,
  });
}

/** Creates the bar tasks and the planning request; 409 when already confirmed. */
export function confirmLinearSession(key: string) {
  return apiFetch<LinearConfirmResult>(`${sessionPath(key)}confirm/`, { method: 'POST', body: {} });
}

export function linearSessionPdfUrl(key: string) {
  return buildUrl(`${sessionPath(key)}pdf/`);
}

/** GET …/pdf/ with the session's token, saved as `<key>.pdf`. */
export async function downloadLinearSessionPdf(key: string): Promise<void> {
  const response = await authedFetch(linearSessionPdfUrl(key));
  if (!response.ok) {
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      data = undefined;
    }
    throw new ApiError(response.status, data, errorMessage(response.status, data));
  }
  saveBlob(await response.blob(), `${key}.pdf`);
}

/** All-or-nothing: POST /linear_cutting/parts/ with an array body. */
export async function createLinearPartsBulk(parts: LinearPartPayload[]) {
  return extractResults<LinearPart>(
    await apiFetch<unknown>('/linear_cutting/parts/', { method: 'POST', body: parts }),
  );
}

export function patchLinearPart(id: number, data: Partial<LinearPartPayload>) {
  return apiFetch<LinearPart>(partPath(id), { method: 'PATCH', body: data });
}

export function deleteLinearPart(id: number) {
  return apiFetch<void>(partPath(id), { method: 'DELETE' });
}

interface StockItemRow {
  id: number;
  item_name?: string;
  name?: string;
  item_code?: string;
  code?: string;
  item_unit?: string;
  unit?: string;
}

/** The Malzeme dropdown: searchItemsBySearch(term, { page_size: 20, item_type: 'stock' }). */
export async function searchStockItems(term: string, signal?: AbortSignal) {
  const rows = extractResults<StockItemRow>(
    await apiFetch<unknown>('/procurement/items/', {
      params: { search: term, page_size: 20, item_type: 'stock' },
      signal,
    }),
  );
  return rows.map((it) => {
    const unit = it.item_unit || it.unit;
    return {
      value: String(it.id),
      // Title first — that is what people recognize; code after.
      label: `${it.item_name || it.name || '-'} — ${it.item_code || it.code || '-'}${unit ? ` • ${unit}` : ''}`,
    };
  });
}

interface JobOrderRow {
  job_no: string;
  title?: string;
}

/** The İş No dropdown: listJobOrders with the open statuses, newest first. */
export async function searchOpenJobOrders(term: string, signal?: AbortSignal) {
  const rows = extractResults<JobOrderRow>(
    await apiFetch<unknown>('/projects/job-orders/', {
      params: {
        search: term,
        page_size: 20,
        ordering: '-created_at',
        status__in: 'active,draft,on_hold',
      },
      signal,
    }),
  );
  return rows.map((j) => ({
    value: j.job_no,
    label: `${j.job_no}${j.title ? ` — ${j.title}` : ''}`,
  }));
}

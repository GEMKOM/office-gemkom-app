// GET /reports/dashboard/ (the management dashboard envelope) and
// GET /assistant/daily-summary/latest/. Same endpoints and params as the
// legacy apis/reports/dashboard.js and apis/dailySummary.js.
import { apiFetch, isApiError } from '@/api/client';
import type { DailySummaryDetail } from '@/api/assistant';

/** The API sends decimals as strings ('1412300.0') and hidden money as null. */
export type Num = number | string | null | undefined;
export type Rag = 'green' | 'orange' | 'red' | 'grey' | 'blue' | 'purple' | string;

export interface MonthPoint {
  month: string;
}

export interface OrderBookSection {
  rag?: Rag;
  generated_at?: string | null;
  live_roots?: Num;
  active?: Num;
  revision_hold?: Num;
  manual_hold_roots?: Num;
  customers?: Num;
  total_kg?: Num;
  remaining_kg?: Num;
  unweighted_roots?: Num;
  opened_month?: Num;
  opened_prev_month?: Num;
  book_to_bill?: {
    ratio_kg?: Num;
    prev_ratio_kg?: Num;
    basis?: 'kg' | 'count' | string;
    intake_kg?: Num;
    completed_kg?: Num;
    intake_n?: Num;
    completed_n?: Num;
    burst_flag?: boolean;
  } | null;
  intake?: {
    won_month?: Num;
    won_month_eur?: Num;
    won_prev_month?: Num;
    won_prev_month_eur?: Num;
    won_not_converted?: Num;
    series_6m?: (MonthPoint & { won?: Num; won_eur?: Num })[];
  } | null;
  /** Slow tier. */
  value?: {
    generated_at?: string | null;
    value_eur?: Num;
    own_value_eur?: Num;
    unpriced_roots?: Num;
    top_customer_share_pct?: Num;
  } | null;
  series_6m?: (MonthPoint & {
    intake?: Num;
    completed?: Num;
    intake_kg?: Num;
    completed_kg?: Num;
  })[];
}

export interface JobRow {
  job_no?: string | null;
  customer?: string | null;
  title?: string | null;
}

export interface DeliverySection {
  rag?: Rag;
  generated_at?: string | null;
  overdue?: {
    count?: Num;
    live_total?: Num;
    share_kg_pct?: Num;
    remaining_kg?: Num;
    median_late_wd?: Num;
    unweighted?: Num;
    jobs?: (JobRow & {
      target?: string | null;
      late_wd?: Num;
      remaining_kg?: Num;
      hold_kind?: string | null;
    })[];
  } | null;
  otd_13w?: {
    pct?: Num;
    on_time?: Num;
    total?: Num;
    prev_pct?: Num;
    prev_total?: Num;
    vs_original_pct?: Num;
    burst_flag?: boolean;
  } | null;
  due?: { d7?: Num; d14?: Num; d14_kg?: Num; d30?: Num } | null;
  design_gate?: { no_release_due30?: Num; design_late?: Num; design_no_target?: Num } | null;
  slips_30d?: { pushes?: Num; pull_ins?: Num; jobs?: Num; avg_push_days?: Num } | null;
  /** Slow tier. */
  forecast?: {
    generated_at?: string | null;
    late_risk?: Num;
    on_track?: Num;
    no_data?: Num;
    median_slip_wd?: Num;
    due14_late_risk?: Num;
    due14_no_data?: Num;
  } | null;
  series_6m?: (MonthPoint & { on_time?: Num; late?: Num; pct?: Num })[];
}

export interface ProductionSection {
  rag?: Rag;
  generated_at?: string | null;
  net_kg?: { last4w?: Num; prev4w?: Num; gross_last4w?: Num; current_week_partial?: Num } | null;
  /** Slow tier. */
  capacity?: {
    generated_at?: string | null;
    remaining_kg?: Num;
    unassigned_kg?: Num;
    unassigned_jobs?: Num;
    max_backlog_weeks?: Num;
    max_backlog_resource?: string | null;
    overloaded?: Num;
    tight?: Num;
    no_rate?: Num;
    resources?: {
      name?: string | null;
      type?: string | null;
      remaining_kg?: Num;
      weeks?: Num;
      verdict?: string | null;
    }[];
  } | null;
  cnc_week?: { kg?: Num; prev_week_kg?: Num; nests?: Num; parts?: Num; waiting_plate?: Num } | null;
  series_13w?: { week_start: string; net_kg?: Num; gross_kg?: Num; partial?: boolean }[];
}

export interface QualitySafetySection {
  rag?: Rag;
  generated_at?: string | null;
  unclassified_pct?: Num;
  ncr_open?: {
    total?: Num;
    critical?: Num;
    major?: Num;
    minor?: Num;
    gt30d?: Num;
    awaiting_dept?: Num;
    awaiting_qc?: Num;
    opened_month?: Num;
    opened_prev_month?: Num;
    jobs?: (JobRow & {
      root_job_no?: string | null;
      n?: Num;
      worst?: string | null;
      target?: string | null;
    })[];
  } | null;
  qc?: {
    pending_tasks?: Num;
    pending_reviews?: Num;
    oldest_pending_days?: Num;
    reviewed?: Num;
    rejected?: Num;
    rejection_pct?: Num;
    turnaround_days?: Num;
  } | null;
  isg?: {
    has_rows?: boolean;
    days_since_go_live?: Num;
    rag?: Rag;
    open?: Num;
    in_progress?: Num;
    resolved?: Num;
    overdue?: Num;
    high_critical?: Num;
    near_miss_month?: Num;
    accidents_month?: Num;
  } | null;
  series_6m?: (MonthPoint & { opened?: Num; per_100t?: Num; net_kg?: Num })[];
}

export interface MaterialSection {
  rag?: Rag;
  generated_at?: string | null;
  critical?: {
    count?: Num;
    jobs?: Num;
    median_age_days?: Num;
    unordered?: Num;
    overdue_promise?: Num;
    rows?: (JobRow & {
      item_code?: string | null;
      item_name?: string | null;
      quantity?: Num;
      unit?: string | null;
      request_number?: string | null;
      age_days?: Num;
      promise_date?: string | null;
      promise_overdue?: boolean;
    })[];
  } | null;
  /** Slow tier. */
  blocked?: {
    generated_at?: string | null;
    count?: Num;
    live_total?: Num;
    share_pct?: Num;
    max_wait_wd?: Num;
    jobs?: (JobRow & { wait_wd?: Num })[];
  } | null;
  requests?: {
    pending_inventory?: Num;
    pending_erp_entry?: Num;
    ready?: Num;
    open_gt90d?: Num;
    dept_submitted?: Num;
  } | null;
  deliveries_week?: Num;
  deliveries_13w_avg?: Num;
  deliveries_13w?: { week_start: string; lines?: Num }[];
}

export interface FinanceSection {
  rag?: Rag;
  generated_at?: string | null;
  committed?: {
    mtd_eur?: Num;
    po_count_mtd?: Num;
    prev_same_day_eur?: Num;
    prev_month_eur?: Num;
  } | null;
  committed_6m?: (MonthPoint & { eur?: Num; po_count?: Num })[];
  payables?: {
    overdue_eur?: Num;
    overdue_n?: Num;
    due7_eur?: Num;
    due7_n?: Num;
    due30_eur?: Num;
    due30_n?: Num;
    undated_n?: Num;
    statements_submitted_n?: Num;
    statements_submitted_eur?: Num;
  } | null;
  /** Slow tier. */
  margin?: {
    generated_at?: string | null;
    critical?: Num;
    risky?: Num;
    healthy?: Num;
    no_price?: Num;
    no_data?: Num;
    exposure_eur?: Num;
    placeholder_prices?: Num;
    cost_data_max_age_days?: Num;
    jobs?: (JobRow & { verdict?: string | null; price_eur?: Num; projected_cost_eur?: Num })[];
  } | null;
}

export interface PeopleSection {
  rag?: Rag;
  generated_at?: string | null;
  overtime?: {
    last30_hours?: Num;
    prev30_hours?: Num;
    mtd_hours?: Num;
    by_team?: { team?: string | null; label?: string | null; hours?: Num }[];
  } | null;
  /** Slow tier. */
  overtime_cost?: {
    generated_at?: string | null;
    mtd_eur?: Num;
    prev_month_eur?: Num;
    estimated_entries?: Num;
  } | null;
  queues?: {
    vacation_urgent?: Num;
    vacation_past_dated?: Num;
    vacation_other?: Num;
    overtime_pending?: Num;
    overtime_oldest_days?: Num;
    overtime_starts_2d?: Num;
    cancellation_requested?: Num;
  } | null;
  headcount?: { active?: Num; no_position?: Num } | null;
  overtime_6m?: (MonthPoint & { hours?: Num; partial?: boolean })[];
}

export interface LiveSection {
  generated_at?: string | null;
  people?: {
    total?: Num;
    by_department?: Record<string, Num>;
    stale_count?: Num;
    stale_oldest_hours?: Num;
  } | null;
  machines?: {
    total?: Num;
    running?: Num;
    down?: Num;
    down_list?: { name?: string | null; hours_down?: Num }[];
  } | null;
  downtime?: {
    break?: Num;
    waiting_material?: Num;
    waiting_tools?: Num;
    fault?: Num;
    other?: Num;
  } | null;
  welding_last?: { date?: string | null; hours?: Num; welders?: Num; days_since_wd?: Num } | null;
  overtime_tonight?: {
    approved_people?: Num;
    pending_people?: Num;
    by_team?: Record<string, Num>;
  } | null;
  office?: { present?: Num; tracked_30d?: Num; active_users?: Num } | null;
}

export interface DecisionRow {
  count?: Num;
  oldest_days?: Num;
  url?: string | null;
  critical?: Num;
  value_eur?: Num;
  starts_2d?: Num;
  urgent?: Num;
  past_dated?: Num;
  cancellation_requested?: Num;
  reviews?: Num;
}

export interface DecisionsMine {
  count?: Num;
  oldest_days?: Num;
  by_type?: Record<string, Num>;
}

export interface DecisionsSection {
  generated_at?: string | null;
  by_type?: Record<string, DecisionRow | null>;
  mine?: DecisionsMine | null;
  zombies?: { pr_workflows?: Num; no_approver_stages?: Num } | null;
}

export interface ExceptionRow extends JobRow {
  kind?: string | null;
  kind_label?: string | null;
  severity?: string | null;
  url?: string | null;
  impact_kg?: Num;
  impact_eur?: Num;
  urgency?: Num;
  urgency_unit?: string | null;
  owner?: string | null;
  flags?: string[];
}

export interface ExceptionsSection {
  generated_at?: string | null;
  total_candidates?: Num;
  rows?: ExceptionRow[];
}

export interface DashboardSections {
  order_book?: OrderBookSection | null;
  delivery?: DeliverySection | null;
  production?: ProductionSection | null;
  quality_safety?: QualitySafetySection | null;
  material?: MaterialSection | null;
  finance?: FinanceSection | null;
  people?: PeopleSection | null;
  live?: LiveSection | null;
  decisions?: DecisionsSection | null;
  exceptions?: ExceptionsSection | null;
}

export type SectionKey = keyof DashboardSections;

export interface DashboardMeta {
  generated_at?: string | null;
  money_visible?: boolean;
  rag_summary?: Partial<Record<SectionKey, Rag>>;
  cache_state?: {
    slow?: 'fresh' | 'stale' | 'missing' | string;
    overview?: string;
    [key: string]: unknown;
  };
  fx?: { date?: string | null; age_days?: Num; rates_available?: boolean } | null;
}

export interface DashboardPayload {
  meta?: DashboardMeta;
  sections?: DashboardSections;
  /** Per-section errors; slow sub-blocks are named 'slow.<section>_<sub>'. */
  errors?: Record<string, string>;
  /** 'building' when a slow build runs on another worker (HTTP 202). */
  status?: string;
}

export interface DashboardRequest {
  block?: 'live' | 'slow' | null;
  refresh?: boolean;
  signal?: AbortSignal;
}

/**
 * GET /reports/dashboard/. 'live' = live strip + decisions.mine (60 s poll);
 * 'slow' = the slow-tier sub-blocks; omitted = the whole page. A slow build in
 * progress answers 202 {"status": "building"}, returned as is.
 */
export function getReportsDashboard({
  block = null,
  refresh = false,
  signal,
}: DashboardRequest = {}) {
  return apiFetch<DashboardPayload>('/reports/dashboard/', {
    params: { block: block ?? undefined, refresh: refresh ? '1' : undefined },
    signal,
  });
}

export const SLOW_RETRY_MS = 5_000;
export const SLOW_MAX_TRIES = 6;

export type SlowResult = { status: 'done'; data: DashboardPayload } | { status: 'unavailable' };

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    });
  });
}

/**
 * The slow tier: ?block=slow, retried every 5 s while the server answers
 * "building", at most six tries (only the first carries refresh=1).
 */
export async function fetchSlowTier({
  refresh = false,
  signal,
}: { refresh?: boolean; signal?: AbortSignal } = {}): Promise<SlowResult> {
  for (let attempt = 1; attempt <= SLOW_MAX_TRIES; attempt += 1) {
    const data = await getReportsDashboard({
      block: 'slow',
      refresh: refresh && attempt === 1,
      signal,
    });
    if (!(data && data.status === 'building' && !data.sections)) return { status: 'done', data };
    if (attempt < SLOW_MAX_TRIES) await wait(SLOW_RETRY_MS, signal);
  }
  return { status: 'unavailable' };
}

/**
 * Latest ready daily summary, or null. 403 (no office access) and 404 are
 * "nothing to show", like the legacy getLatestDailySummary; other errors too.
 */
export async function getLatestDailySummary(
  signal?: AbortSignal,
): Promise<DailySummaryDetail | null> {
  try {
    const data = await apiFetch<{ summary?: DailySummaryDetail | null } | undefined>(
      '/assistant/daily-summary/latest/',
      { signal },
    );
    return data?.summary ?? null;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    if (!isApiError(error) || (error.status !== 403 && error.status !== 404)) {
      console.warn(
        'Daily summary latest check failed:',
        error instanceof Error ? error.message : error,
      );
    }
    return null;
  }
}

export const dashboardKeys = {
  all: ['managementDashboard'] as const,
  full: () => ['managementDashboard', 'full'] as const,
  slow: (forPayload: number, refresh: boolean) =>
    ['managementDashboard', 'slow', forPayload, refresh] as const,
  live: () => ['managementDashboard', 'live'] as const,
  dailySummary: () => ['managementDashboard', 'dailySummary'] as const,
};

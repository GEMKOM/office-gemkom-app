import type { Forecast } from '../forecast';

// Payload shapes the deck reads: GET production-plan-overview/, meeting-brief/,
// meeting-brief/{section}/ and plan-sheet/. Only the fields Sunum Modu uses;
// everything is optional because the brief omits a section the job lacks.

export type Num = number | null | undefined;

/** One portfolio row (one slide). */
export interface MeetingItem {
  job_no: string;
  title?: string | null;
  customer_name?: string | null;
  status?: string | null;
  status_display?: string | null;
  hold_kind?: string | null;
  created_date?: string | null;
  completion_percentage?: number | string | null;
  forecast?: (Forecast & { target_completion_date?: string | null }) | null;
  [key: string]: unknown;
}

export interface OverviewPayload {
  items?: MeetingItem[];
  results?: MeetingItem[];
  generated_at?: string | null;
  today?: string | null;
  [key: string]: unknown;
}

export interface NcrRow {
  ncr_number?: string;
  title?: string | null;
  severity?: string;
  severity_display?: string;
  status?: string;
  status_display?: string;
  job_no?: string;
  created_at?: string | null;
}

export interface QualityBrief {
  open?: Num;
  total?: Num;
  open_by_severity?: { critical?: Num; major?: Num; minor?: Num };
  open_list?: NcrRow[];
}

export interface DrawingRelease {
  revision_code?: string | null;
  revision_number?: Num;
  released_at?: string | null;
  status?: string;
  status_display?: string;
  job_no?: string;
}

export interface RevisionsBrief {
  drawing?: {
    latest?: DrawingRelease | null;
    revision_count?: Num;
    in_revision_count?: Num;
  };
  design_targets?: { total?: Num; with_target?: Num; latest?: string | null };
}

export interface ProcurementBrief {
  items_waiting?: Num;
  items_total?: Num;
  items_delivered?: Num;
  progress_pct?: Num;
  not_yet_requested?: Num;
  requested_waiting?: Num;
  partially_delivered?: Num;
  critical_waiting?: Num;
  material_pulls?: { items_pulled?: Num; pending?: Num; transferred?: Num } | null;
}

export interface CuttingBrief {
  parts_waiting?: Num;
  parts_waiting_material?: Num;
  parts_cut?: Num;
  parts_total?: Num;
  weight_cut?: Num;
  weight_total?: Num;
  weight_waiting?: Num;
  weight_waiting_material?: Num;
}

export interface MachiningBrief {
  operations_waiting?: Num;
  operations_completed?: Num;
  operations_total?: Num;
  parts_completed?: Num;
  parts_total?: Num;
  estimated_hours_total?: Num;
  hours_spent?: Num;
  hours_remaining?: Num;
}

export interface WeldingResource {
  kind?: string;
  name?: string;
  job_no?: string;
  planned?: boolean;
  planned_start_date?: string | null;
  planned_end_date?: string | null;
  allocated_weight_kg?: Num;
  progress_pct?: Num;
}

export interface WeldingBrief {
  resources?: WeldingResource[];
  weighted_progress_pct?: Num;
  task_progress_pct?: Num;
  allocated_kg_total?: Num;
  hours?: { regular?: Num; after_hours?: Num; holiday?: Num };
  material_wait?: {
    pipe_profile_items_pending?: Num;
    critical_items_pending?: Num;
    days_lost_wd?: Num;
  };
}

export interface BriefFile {
  name?: string | null;
  url?: string | null;
  label?: string | null;
  uploaded_at?: string | null;
}

export type FilesBrief = Record<string, { total?: Num; items?: BriefFile[] } | undefined>;

export interface FinancialBrief {
  verdict?: string;
  reason?: string | null;
  price_is_derived?: boolean;
  can_view_details?: boolean;
}

export interface MeetingBrief {
  quality?: QualityBrief | null;
  revisions?: RevisionsBrief | null;
  procurement?: ProcurementBrief | null;
  cutting?: CuttingBrief | null;
  machining?: MachiningBrief | null;
  welding?: WeldingBrief | null;
  files?: FilesBrief | null;
  financial?: FinancialBrief | null;
  [key: string]: unknown;
}

// ---- section details (meeting-brief/{section}/) ----------------------------

export interface MachiningOperation {
  key?: string;
  name?: string | null;
  part_name?: string | null;
  share?: number | string | null;
  allocated_quantity?: Num;
  job_no?: string;
  estimated_hours?: Num;
  hours_spent?: Num;
  completed?: boolean;
}

export interface CuttingPart {
  image_no?: string | null;
  position_no?: string | null;
  nesting?: string | null;
  job_no?: string;
  quantity?: Num;
  weight_kg?: Num;
  cut?: boolean;
  material_pending?: boolean;
  plate_item_code?: string | null;
}

export interface ProcurementRow {
  id?: number;
  item_name?: string | null;
  item_code?: string | null;
  item_unit?: string | null;
  request_number?: string | null;
  job_no?: string;
  quantity?: Num;
  quantity_to_purchase?: Num;
  delivered_quantity?: Num;
  stage?: string;
  delivered_at?: string | null;
  projected_delivery?: string | null;
  delivery_overdue?: boolean;
  is_critical?: boolean;
}

export interface PullRequestRow {
  number?: string;
  kind?: string;
  destination?: string | null;
  status?: string;
  status_label?: string | null;
  requested_by?: string | null;
  requested_at?: string | null;
  confirmed_by?: string | null;
  confirmed_at?: string | null;
  items?: { item_name?: string | null; item_code?: string | null; item_unit?: string | null; job_no?: string; quantity?: Num }[];
}

export interface DesignTaskRow {
  title?: string | null;
  job_no?: string;
  target_completion_date?: string | null;
  status?: string;
  status_display?: string;
}

export interface FinancialCategory {
  label?: string;
  amount_eur?: Num;
  eur_per_kg?: Num;
}

export interface SectionDetail {
  operations?: MachiningOperation[];
  parts?: CuttingPart[];
  list?: NcrRow[];
  items?: ProcurementRow[];
  pull_requests?: PullRequestRow[];
  releases?: DrawingRelease[];
  design_tasks?: DesignTaskRow[];
  // financial
  verdict?: string;
  reason?: string | null;
  price_eur?: Num;
  price_eur_per_kg?: Num;
  price_is_derived?: boolean;
  actual_total_eur?: Num;
  actual_eur_per_kg?: Num;
  projected_total_eur?: Num;
  projected_eur_per_kg?: Num;
  profit_pct?: Num;
  margin_eur?: Num;
  total_weight_kg?: Num;
  delivered_uncosted_deduction_eur?: Num;
  categories?: FinancialCategory[];
  [key: string]: unknown;
}

/** The plan sheet payload (GET plan-sheet/). */
export type { PlanSheet } from '@/features/plan-sheet';

export type SectionKind =
  | 'welding'
  | 'machining'
  | 'cutting'
  | 'quality'
  | 'procurement'
  | 'revisions'
  | 'financial'
  | 'files';

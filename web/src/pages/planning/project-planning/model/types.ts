// Shapes of GET /welding/planning/board/ and of the page's working copy (the
// view models the sheet edits in memory until Kaydet).

export type TaskStatus =
  | 'pending'
  | 'blocked'
  | 'in_progress'
  | 'completed'
  | 'on_hold'
  | 'cancelled'
  | 'skipped'
  | (string & {});

export type ResourceType = 'team' | 'subcontractor' | (string & {});
export type AssignmentType = 'internal_team' | 'subcontracting' | (string & {});

/** The schedule fields every planned row shares. */
export interface ScheduleFields {
  status: TaskStatus;
  progress: number;
  duration_wd: number | null;
  start_date: string | null;
  end_date: string | null;
  duration_is_derived?: boolean;
  duration_source?: string | null;
  entered_duration_wd?: number | null;
  completed_at?: string | null;
  forecast_date?: string | null;
  forecast_kind?: string | null;
  forecast_elapsed_wd?: number | null;
  forecast_head_start_pct?: number | null;
  projected_start_date?: string | null;
  projected_end_date?: string | null;
  start_is_actual?: boolean;
  end_is_actual?: boolean;
}

export interface StageVM extends ScheduleFields {
  cid: string;
  id: number | null;
  title: string;
  is_default: boolean;
  weight: number | null;
  note: string;
  deleted: boolean;
  createdOnServer?: boolean;
}

export interface SubtaskVM extends ScheduleFields {
  /** This assignment's own start, typed per block (284-07). */
  actual_start_date: string | null;
}

export interface BlockVM {
  key: string;
  isNew: boolean;
  assignment_type: AssignmentType;
  assignment_id: number | null;
  subtask_id: number | null;
  welding_task_id: number;
  job_no: string;
  job_order_title: string;
  customer_name: string;
  allocated_weight_kg: number;
  is_billed: boolean;
  has_statement_line: boolean;
  price_tier: { id: number; [key: string]: unknown } | null;
  notes: string;
  subtask: SubtaskVM;
  stages: StageVM[];
  createDefaultStages: boolean;
  deleted: boolean;
  resource_type: ResourceType;
  resource_id: number;
  resource_name?: string;
  createdOnServer?: boolean;
  moveTo?: MoveTo;
}

export interface MoveTo {
  resource_type: ResourceType;
  resource_id: number;
  price_tier?: number;
}

export interface ResourceVM {
  resource_type: ResourceType;
  id: number;
  name: string;
  display_name: string;
  blocks: BlockVM[];
}

/** A JobOrderDepartmentTask the sheet plans: İmalat, Kaynaklı İmalat, Boya. */
export interface DeptVM extends ScheduleFields {
  task_id: number;
  assigned_to: number | string | null;
  assigned_to_name: string;
  weight: number | null;
  has_subtasks: boolean;
  start_is_actual: boolean;
  end_is_actual: boolean;
  start_from_children: boolean;
  end_from_children: boolean;
  entered_start_date: string | null;
  entered_end_date: string | null;
  date_source?: string | null;
}

export type DeptSlot = 'manufacturing' | 'welding' | 'painting';
export const DEPT_SLOTS: readonly DeptSlot[] = ['manufacturing', 'welding', 'painting'];

/** A read-only (or partly editable) task row from job_info. Mutated in place. */
export interface InfoTask extends Partial<ScheduleFields> {
  task_id: number;
  title?: string;
  weight?: number | null;
  date_source?: string | null;
  operation_hours?: number | null;
  entered_start_date?: string | null;
  entered_end_date?: string | null;
  shipping_after?: string | null;
  shipping_after_invented?: boolean;
  [key: string]: unknown;
}

export interface JobOrderInfo {
  title?: string;
  start_date?: string | null;
  end_date?: string | null;
  duration_wd?: number | null;
  total_weight_kg?: number | null;
  quantity?: number | null;
  progress?: number;
  status?: string;
  hold_kind?: string;
  completed_at?: string | null;
  forecast_date?: string | null;
  forecast_kind?: string | null;
  forecast_source?: string | null;
  [key: string]: unknown;
}

export interface JobInfo {
  job_order?: JobOrderInfo | null;
  manufacturing?: InfoTask | null;
  welding?: InfoTask | null;
  painting?: InfoTask | null;
  material_supply?: InfoTask | null;
  machining?: InfoTask[];
  cutting?: InfoTask[];
  logistics?: InfoTask | null;
  [key: string]: unknown;
}

export interface OffSheetHolder {
  name: string;
  resource_type: ResourceType;
  allocated_weight_kg: number | string;
}

export interface WeldingTask {
  welding_task_id: number;
  job_no: string;
  job_order_title?: string;
  customer_name?: string;
  total_weight_kg?: number | string | null;
  target_completion_date?: string | null;
  off_sheet_kg?: number | string | null;
  off_sheet_holders?: OffSheetHolder[];
  [key: string]: unknown;
}

export interface BoardStage {
  id: number;
  title: string;
  is_default?: boolean;
  weight: number | null;
  status: TaskStatus;
  progress?: number | string | null;
  deleted?: boolean;
  note?: string | null;
  [key: string]: unknown;
}

export interface BoardBlock {
  assignment_type: AssignmentType;
  assignment_id: number;
  subtask_id: number | null;
  welding_task_id: number;
  job_no: string;
  job_order_title?: string;
  customer_name?: string;
  allocated_weight_kg: number | string;
  is_billed?: boolean;
  has_statement_line?: boolean;
  price_tier?: { id: number; [key: string]: unknown } | null;
  notes?: string | null;
  subtask: Record<string, unknown> & { status: TaskStatus };
  stages?: BoardStage[];
  [key: string]: unknown;
}

export interface BoardResource {
  resource_type: ResourceType;
  id: number;
  name: string;
  display_name?: string;
  blocks?: BoardBlock[];
  [key: string]: unknown;
}

export interface PlanningBoard {
  resources?: BoardResource[];
  welding_tasks?: WeldingTask[];
  job_info?: Record<string, JobInfo>;
  holidays?: { date: string; is_half_day?: boolean }[];
  [key: string]: unknown;
}

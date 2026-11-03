import type { DeptSlot } from './types';

export type RowKind =
  'group' | 'band' | 'info' | 'machining' | 'dept' | 'block' | 'stage' | 'unassigned';

/**
 * One sheet row, flat. Every value the row's cells, bar and actions draw is on
 * the row itself: the grid memoizes rows by object identity, so anything a row
 * reads from elsewhere would go stale on screen.
 */
export interface SheetRow {
  key: string;
  kind: RowKind;
  job_no: string | null;
  groupKey?: string | null;
  indent: number;
  title: string;
  note: string;
  start_date: string | null;
  end_date: string | null;
  duration_wd: number | null;
  weight: number | null;
  progress: number | null;
  status: string | null;

  collapsed?: boolean;
  job_order_title?: string;
  customer_name?: string;
  block_count?: number;
  bar_label?: string;
  weight_is_kg?: boolean;
  resource_kg?: number | null;
  quantity?: number | null;
  quantity_of?: number | null;
  quantity_is_share?: boolean;
  quantity_exact?: number | null;
  quantity_kg?: number | null;
  job_quantity?: number | null;
  job_total_kg?: number | null;
  hold_kind?: string;
  completed_at?: string | null;
  forecast_date?: string | null;
  forecast_kind?: string | null;
  forecast_source?: string | null;
  job_plan_end?: string | null;
  job_plan_end_source?: string | null;
  job_target?: string | null;
  job_target_late?: boolean;
  job_target_delta_wd?: number | null;

  start_is_actual?: boolean;
  end_is_actual?: boolean;
  duration_is_derived?: boolean;
  duration_source?: string | null;
  date_source?: string | null;
  start_date_source?: string | null;
  end_date_source?: string | null;
  operation_hours?: number | null;
  entered_duration_wd?: number | null;
  entered_start_date?: string | null;

  slot?: DeptSlot;
  has_subtasks?: boolean;
  editable_schedule?: boolean;
  editable_duration?: boolean;
  cutting_task_id?: number;
  machining_task_id?: number;
  task_id?: number;

  blockRef?: string;
  isNew?: boolean;
  is_billed?: boolean;
  /** Billed or on a statement: the assignment cannot be moved. */
  move_locked?: boolean;
  has_stages?: boolean;
  actual_start_date?: string | null;
  stageCid?: string;
  is_default?: boolean;

  unassignedRow?: boolean;
  welding_task_id?: number;
  allocated_kg?: number | null;

  flat_assignment?: boolean;
  resource_name?: string;
  show_termin?: boolean;

  // Capacity decorations (advisory, saved plan only); see capacityFor().
  cap_state?: 'none' | 'no_data' | 'entry';
  cap_late?: boolean;
  cap_title?: string;
  cap_finish?: string;
  cap_label?: string;
  cap_chip?: 'late' | 'early' | 'muted';
}

/** Same values under the same keys: the row did not change. */
export function sameRow(a: SheetRow, b: SheetRow): boolean {
  if (a === b) return true;
  const ka = Object.keys(a) as (keyof SheetRow)[];
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

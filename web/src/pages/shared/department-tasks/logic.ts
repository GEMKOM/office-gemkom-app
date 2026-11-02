import { isApiError } from '@/api/client';
import type {
  DepartmentTask,
  DepartmentTaskListParams,
  StatusChoice,
} from '@/api/projects/departmentTasks';
import type { StatusFamily } from '@/ui';
import type { DepartmentTasksConfig } from './config';

// Pure rules of the legacy component, kept apart from React so they can be
// tested line by line against department-tasks.js.

// ---- row kinds ----------------------------------------------------------------

/** machining_part / cnc_part rows: links into other modules, no task actions. */
export function isPartRow(task: DepartmentTask): boolean {
  return task.type === 'machining_part' || task.type === 'cnc_part';
}

/** Not a part row and not a procurement item (legacy repeated this test everywhere). */
export function isOwnTask(task: DepartmentTask): boolean {
  return !isPartRow(task) && task.task_type !== 'procurement_item';
}

/** Main tasks mirror their job order's title; subtasks and standalone tasks own theirs. */
export function isTitleEditable(task: DepartmentTask): boolean {
  return Boolean(task.parent) || !task.job_order;
}

// ---- design release rules -----------------------------------------------------

export function canSubmitNewDesignRelease(
  config: DepartmentTasksConfig,
  task: DepartmentTask,
): boolean {
  if (!config.releaseFlow) return true;
  return !task.pending_approval_release_id && !task.rejected_release_id;
}

export function shouldHideDesignCompleteButton(
  config: DepartmentTasksConfig,
  task: DepartmentTask,
): boolean {
  return config.releaseFlow && Boolean(task.pending_approval_release_id) && !task.parent;
}

/** "(1/2)" of a pending release, '' when the state is missing. */
export function approvalProgress(task: DepartmentTask): string {
  const state = task.pending_release_approval_state;
  return state ? `${state.approval_count}/${state.required_count}` : '';
}

export type ReviewBadge = { kind: 'pending'; progress: string } | { kind: 'rejected' } | null;

export function designReviewBadge(
  config: DepartmentTasksConfig,
  task: DepartmentTask,
): ReviewBadge {
  if (!config.releaseFlow) return null;
  if (task.pending_approval_release_id) {
    const progress = approvalProgress(task);
    return { kind: 'pending', progress: progress ? ` (${progress})` : '' };
  }
  if (task.rejected_release_id && !task.parent) return { kind: 'rejected' };
  return null;
}

// ---- table row actions --------------------------------------------------------

/** Any task without children shows Sil; the CNC / machining checks run on click. */
export function isPotentiallyDeletable(task: DepartmentTask): boolean {
  return (task.subtasks_count || 0) === 0;
}

export function canViewRow(task: DepartmentTask): boolean {
  return isOwnTask(task);
}

export function canCompleteRow(config: DepartmentTasksConfig, task: DepartmentTask): boolean {
  if (task.task_type === 'procurement_item') {
    return Boolean(task.planning_request_item_id) && task.is_delivered === false;
  }
  if (task.status !== 'in_progress' || isPartRow(task)) return false;
  if (task.qc_required === true && task.has_qc_approval !== true) return false;
  if (shouldHideDesignCompleteButton(config, task)) return false;
  return true;
}

export function canSelfStartRevision(config: DepartmentTasksConfig, task: DepartmentTask): boolean {
  return (
    config.releaseFlow &&
    Boolean(task.current_release_id) &&
    !task.is_under_revision &&
    !task.pending_approval_release_id &&
    isOwnTask(task)
  );
}

export function canSkipRow(task: DepartmentTask): boolean {
  if (task.task_type === 'procurement_item' || task.task_type === 'sales_consult') return false;
  return task.status !== 'completed' && task.status !== 'skipped' && !isPartRow(task);
}

// ---- the task modal's tabs ------------------------------------------------------

export type TaskTabKey =
  | 'consultation'
  | 'release-approval'
  | 'edit'
  | 'start'
  | 'submit-qc'
  | 'qc-reviews'
  | 'ncrs'
  | 'uncomplete'
  | 'unskip'
  | 'add-subtask'
  | 'delete'
  | 'bulk-subtask'
  | 'subcontractor'
  | 'internal-team'
  | 'self-start-revision';

export interface TaskTab {
  key: TaskTabKey;
  label: string;
  icon: string;
}

const TAB: Record<TaskTabKey, TaskTab> = {
  consultation: { key: 'consultation', label: 'Teklif Danışma', icon: 'fas fa-handshake' },
  'release-approval': { key: 'release-approval', label: 'Çizim İncelemesi', icon: 'fas fa-search' },
  edit: { key: 'edit', label: 'Düzenle', icon: 'fas fa-edit' },
  start: { key: 'start', label: 'Başlat', icon: 'fas fa-play' },
  'submit-qc': { key: 'submit-qc', label: "KK'ya Gönder", icon: 'fas fa-clipboard-check' },
  'qc-reviews': { key: 'qc-reviews', label: 'KK İncelemeleri', icon: 'fas fa-clipboard-list' },
  ncrs: { key: 'ncrs', label: 'Uygunsuzluk Raporları', icon: 'fas fa-exclamation-triangle' },
  uncomplete: { key: 'uncomplete', label: 'Tamamlanmayı Geri Al', icon: 'fas fa-undo' },
  unskip: { key: 'unskip', label: 'Atlamayı Geri Al', icon: 'fas fa-undo' },
  'add-subtask': { key: 'add-subtask', label: 'Alt Görev Ekle', icon: 'fas fa-plus-circle' },
  delete: { key: 'delete', label: 'Sil', icon: 'fas fa-trash' },
  'bulk-subtask': {
    key: 'bulk-subtask',
    label: 'Toplu Alt Görev Ekle',
    icon: 'fas fa-layer-group',
  },
  subcontractor: { key: 'subcontractor', label: 'Taşeron Ataması', icon: 'fas fa-handshake' },
  'internal-team': { key: 'internal-team', label: 'Takım Ataması', icon: 'fas fa-users' },
  'self-start-revision': {
    key: 'self-start-revision',
    label: 'Revizyonu Kendi Başlat',
    icon: 'fas fa-rotate',
  },
};

/** Legacy getAvailableActions, in the same order (the first tab opens). */
export function availableTabs(config: DepartmentTasksConfig, task: DepartmentTask): TaskTab[] {
  if (task.task_type === 'sales_consult') {
    return task.status === 'completed' ? [TAB.consultation, TAB.uncomplete] : [TAB.consultation];
  }
  const tabs: TaskTab[] = [];
  const own = isOwnTask(task);
  if (own) tabs.push(TAB.edit);
  if (task.status === 'pending' && task.can_start && own) tabs.push(TAB.start);
  if (config.qcSubmit && task.qc_required === true) tabs.push(TAB['submit-qc']);
  if (task.qc_required === true) tabs.push(TAB['qc-reviews']);
  if (!task.parent && task.task_type === 'part') tabs.push(TAB.ncrs);
  if (task.status === 'completed' && own) tabs.push(TAB.uncomplete);
  if (task.status === 'skipped' && own) tabs.push(TAB.unskip);
  if (config.addSubtaskTab && own) tabs.push(TAB['add-subtask']);
  if (isPotentiallyDeletable(task)) tabs.push(TAB.delete);
  if (!task.parent && task.task_type === 'part' && !isPartRow(task)) tabs.push(TAB['bulk-subtask']);
  if (config.weldingAssignments && task.task_type === 'welding') {
    tabs.push(TAB.subcontractor, TAB['internal-team']);
  }
  if (config.weldingAssignments && task.task_type === 'subcontracting')
    tabs.push(TAB.subcontractor);
  if (config.weldingAssignments && task.task_type === 'internal_team')
    tabs.push(TAB['internal-team']);
  // Painting tasks get the tab on every page (legacy did not check the department).
  if (task.task_type === 'painting') tabs.push(TAB.subcontractor);
  if (canSelfStartRevision(config, task)) tabs.push(TAB['self-start-revision']);
  if (config.releaseFlow && task.pending_approval_release_id && !task.parent) {
    tabs.unshift(TAB['release-approval']);
  }
  if (task.is_consultation) tabs.unshift(TAB.consultation);
  return tabs;
}

// ---- filters --------------------------------------------------------------------

export const ACTIVE_STATUSES = 'pending,in_progress';
export const UNASSIGNED = '__unassigned__';

/** The URL params legacy design/projects used (syncFiltersToUrl). */
export const FILTER_DEFAULTS = {
  search: '',
  status: ACTIVE_STATUSES,
  job_order: '',
  customer: '',
  assigned_to: '',
  target_start_date: '',
  target_completion_date: '',
  page: '1',
  page_size: '20',
};

export type TaskFilterValues = typeof FILTER_DEFAULTS;

export function statusFilterOptions(statuses: StatusChoice[]) {
  return [
    { value: '', label: 'Tümü' },
    { value: ACTIVE_STATUSES, label: 'Aktif Görevler' },
    ...statuses.map((s) => ({ value: s.value, label: s.label })),
  ];
}

export function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Legacy applyFilterValuesToOptions. Hedef Başlangıç / Hedef Bitiş go into
 * the options too, but listDepartmentTasks never forwarded them (its param
 * whitelist has no target dates), so they reach no request. Kept that way.
 */
export function filterParams(values: TaskFilterValues): DepartmentTaskListParams {
  const params: DepartmentTaskListParams = {};
  const status = values.status.trim();
  if (status) {
    if (status.includes(',')) params.status__in = status;
    else params.status = status;
  }
  if (values.search) params.search = values.search;
  if (values.job_order) params.job_order = values.job_order;
  if (values.customer) params.customer = Number.parseInt(values.customer, 10);
  if (values.assigned_to) {
    if (values.assigned_to === UNASSIGNED) params.assigned_to__isnull = true;
    else params.assigned_to = Number.parseInt(values.assigned_to, 10);
  }
  return params;
}

/** Legacy loadTasks ordering: the sorted column, else target_start_date in the Gantt. */
export function listOrdering(
  sortBy: string | null,
  sortDir: 'asc' | 'desc',
  gantt: boolean,
): string {
  if (sortBy) return `${sortDir === 'desc' ? '-' : ''}${sortBy}`;
  return gantt ? 'target_start_date' : '';
}

// ---- the expanded tree -----------------------------------------------------------

export interface FlatTasks {
  rows: DepartmentTask[];
  /** Indent level per row id: 0 for main tasks. */
  levels: Map<number, number>;
}

/** Legacy mergeExpandedSubtasks: each expanded row followed by its subtasks, recursively. */
export function flattenTasks(
  mainTasks: readonly DepartmentTask[],
  expanded: ReadonlySet<number>,
  subtasksOf: (id: number) => readonly DepartmentTask[] | undefined,
): FlatTasks {
  const rows: DepartmentTask[] = [];
  const levels = new Map<number, number>();
  const seen = new Set<number>();
  const add = (task: DepartmentTask, level: number) => {
    if (seen.has(task.id)) return;
    seen.add(task.id);
    levels.set(task.id, level);
    rows.push(task);
    const children = expanded.has(task.id) ? subtasksOf(task.id) : undefined;
    children?.forEach((child) => add(child, level + 1));
  };
  mainTasks.forEach((task) => add(task, 0));
  return { rows, levels };
}

// ---- cells ------------------------------------------------------------------------

export function statusFamily(color: string | undefined): StatusFamily {
  switch (color) {
    case 'yellow':
    case 'blue':
    case 'red':
    case 'green':
    case 'orange':
    case 'purple':
      return color;
    default:
      return 'grey';
  }
}

export interface QcBadge {
  family: StatusFamily;
  label: string;
  icon: string;
}

export function qcBadge(task: DepartmentTask): QcBadge | null {
  if (task.qc_required !== true) return null;
  switch (task.qc_status) {
    case 'pending':
      return { family: 'yellow', label: 'KK', icon: 'fas fa-clock' };
    case 'waiting':
      return { family: 'blue', label: 'KK', icon: 'fas fa-hourglass-half' };
    case 'approved':
      return { family: 'green', label: 'KK Onaylandı', icon: 'fas fa-check-circle' };
    case 'rejected':
      return { family: 'red', label: 'KK Reddedildi', icon: 'fas fa-times-circle' };
    default:
      return { family: 'grey', label: 'KK', icon: 'fas fa-clipboard-check' };
  }
}

/** Bar colour of the Tamamlanma cell, by legacy thresholds. */
export function progressColor(percentage: number): string {
  if (percentage === 0) return '#6b7280';
  if (percentage < 25) return '#ef4444';
  if (percentage < 50) return '#f59e0b';
  if (percentage < 75) return '#3b82f6';
  if (percentage < 100) return '#10b981';
  return '#059669';
}

export function clampPercent(value: unknown): number {
  return Math.min(100, Math.max(0, Number.parseFloat(String(value)) || 0));
}

/** Title shown for a row: subtasks their own, main tasks the job order's (cut at 50). */
export function displayTitle(task: DepartmentTask): { full: string; short: string } {
  const full = (task.parent ? task.title : task.job_order_title || task.title) || '-';
  const short = full.length > 50 ? `${full.slice(0, 49)}…` : full;
  return { full, short };
}

/** 'YYYY-MM-DD' of an API date or datetime, '' when empty. */
export function dateOnly(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().split('T')[0] ?? '';
}

/** Legacy date cells: tr-TR { year: numeric, month: short, day: numeric }. */
export function shortDate(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('tr-TR', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function trNumber(value: unknown, decimals?: number): string {
  const n = Number.parseFloat(String(value));
  if (!Number.isFinite(n)) return '';
  return decimals === undefined
    ? n.toLocaleString('tr-TR')
    : n.toLocaleString('tr-TR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
}

/** utils/deliveryState.js fmtQty. */
export function fmtQty(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function isDerivedDuration(task: DepartmentTask): boolean {
  const own = task.estimated_duration_wd;
  const hasOwn = own !== null && own !== undefined && own !== '';
  return !hasOwn && task.derived_duration_wd !== null && task.derived_duration_wd !== undefined;
}

// ---- errors ------------------------------------------------------------------------

/**
 * Legacy pages JSON-parsed the thrown body and joined its values with ', ';
 * anything unreadable fell back to the page's own message.
 */
export function legacyErrorText(error: unknown, fallback: string, preferMessage = false): string {
  if (
    isApiError(error) &&
    error.data &&
    typeof error.data === 'object' &&
    !Array.isArray(error.data)
  ) {
    const body = error.data as Record<string, unknown>;
    if (preferMessage && typeof body.message === 'string' && body.message) return body.message;
    const text = Object.values(body)
      .flat()
      .map((v) => (typeof v === 'string' ? v : JSON.stringify(v)))
      .join(', ');
    return text || fallback;
  }
  return fallback;
}

// ---- Gantt ---------------------------------------------------------------------------

export type GanttPeriod = 'day' | 'week' | 'month' | 'year';

function ymd(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

/** Legacy getGanttDateRange: the visible window sent as date_range_start/end. */
export function ganttDateRange(period: GanttPeriod, base: Date): { start: string; end: string } {
  const date = new Date(base);
  let start: Date;
  let end: Date;
  switch (period) {
    case 'day':
      start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      end = new Date(start);
      break;
    case 'week': {
      const dow = date.getDay();
      start = new Date(date);
      start.setDate(date.getDate() + (dow === 0 ? -6 : 1 - dow));
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(start.getDate() + 6);
      break;
    }
    case 'year':
      start = new Date(date.getFullYear(), 0, 1);
      end = new Date(date.getFullYear(), 11, 31);
      break;
    default:
      start = new Date(date.getFullYear(), date.getMonth(), 1);
      end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  }
  return { start: ymd(start), end: ymd(end) };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function taskRange(task: DepartmentTask): { startMs: number | null; endMs: number | null } {
  let startMs = task.target_start_date ? new Date(task.target_start_date).getTime() : null;
  let endMs = task.target_completion_date ? new Date(task.target_completion_date).getTime() : null;
  if (startMs && !endMs) endMs = startMs + DAY_MS;
  else if (!startMs && endMs) startMs = endMs - DAY_MS;
  return { startMs, endMs };
}

export function isTaskOverdue(task: DepartmentTask, now = new Date()): boolean {
  if (!task.target_completion_date || task.status === 'completed') return false;
  const due = new Date(task.target_completion_date);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return new Date(due.getFullYear(), due.getMonth(), due.getDate()) < today;
}

function ganttCode(task: DepartmentTask): string | number {
  return task.job_order || task.offer_no || task.offer_summary?.offer_no || task.id;
}

function ganttTitle(task: DepartmentTask): string {
  return task.title || task.job_order_title || `Gorev ${task.id}`;
}

export interface GanttTask {
  id: number | string;
  title: string;
  ti_number: string | number;
  planned_start_ms?: number;
  planned_end_ms?: number;
  plan_order?: number;
  progress_percentage?: number;
  status?: string;
  is_overdue?: boolean;
  timer_id?: string;
  segments?: GanttTask[];
}

export function toGanttTask(task: DepartmentTask, index: number): GanttTask {
  const { startMs, endMs } = taskRange(task);
  return {
    id: task.id,
    title: ganttTitle(task),
    ti_number: ganttCode(task),
    planned_start_ms: startMs || undefined,
    planned_end_ms: endMs || undefined,
    plan_order: typeof task.sequence === 'number' ? task.sequence : index + 1,
    progress_percentage:
      typeof task.completion_percentage === 'number' ? task.completion_percentage : undefined,
    status: task.status,
    is_overdue: isTaskOverdue(task),
  };
}

/** Legacy mapDepartmentTasksToUserRows: one row per user, then "Atanmamis" if it has any. */
export function toGanttUserRows(
  tasks: readonly DepartmentTask[],
  users: readonly { id: number; name?: string; username?: string }[],
): GanttTask[] {
  const rows: GanttTask[] = users.map((user, index) => ({
    id: `user-${user.id}`,
    ti_number: user.name || user.username || `Kullanici ${user.id}`,
    title: '0 görev',
    plan_order: index + 1,
    segments: [],
  }));
  const byUser = new Map<number, GanttTask>();
  users.forEach((user, index) => byUser.set(Number(user.id), rows[index]!));
  const unassigned: GanttTask = {
    id: 'user-unassigned',
    ti_number: 'Atanmamis',
    title: '0 görev',
    plan_order: rows.length + 1,
    segments: [],
  };
  const time = (t: DepartmentTask) =>
    t.target_start_date ? new Date(t.target_start_date).getTime() : Number.MAX_SAFE_INTEGER;
  const sorted = [...tasks].sort(
    (a, b) => time(a) - time(b) || (a.sequence || 0) - (b.sequence || 0),
  );
  for (const task of sorted) {
    const { startMs, endMs } = taskRange(task);
    if (!startMs || !endMs) continue;
    const assigned =
      task.assigned_to !== undefined && task.assigned_to !== null ? Number(task.assigned_to) : null;
    const row = (assigned !== null && byUser.get(assigned)) || unassigned;
    row.segments!.push({
      id: task.id,
      timer_id: String(task.id),
      title: ganttTitle(task),
      ti_number: ganttCode(task),
      planned_start_ms: startMs,
      planned_end_ms: endMs,
      progress_percentage:
        typeof task.completion_percentage === 'number' ? task.completion_percentage : undefined,
      status: task.status,
      is_overdue: isTaskOverdue(task),
    });
  }
  const out = unassigned.segments!.length ? [...rows, unassigned] : rows;
  out.forEach((row) => (row.title = `${row.segments!.length} görev`));
  return out;
}

// ---- assignment matching (Taşeron / Takım tabs) ------------------------------------------

export function toNumericId(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'object') {
    const id = (value as { id?: unknown }).id;
    return id !== undefined && id !== null ? toNumericId(id) : null;
  }
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

type Loose = Record<string, unknown>;

function firstId(record: Loose, paths: string[]): number | null {
  for (const path of paths) {
    let value: unknown = record;
    for (const part of path.split('.')) {
      value = value && typeof value === 'object' ? (value as Loose)[part] : undefined;
    }
    const id = toNumericId(value);
    if (id !== null) return id;
  }
  return null;
}

const SUB_TASK_PATHS = ['department_task', 'department_task_id', 'subtask', 'subtask_id'];
const SUB_PARENT_PATHS = [
  'kaynak_task',
  'kaynak_task_id',
  'parent_task',
  'parent_task_id',
  'department_task_parent',
  'department_task_parent_id',
  'subtask_parent',
  'subtask.parent',
];
const TEAM_TASK_PATHS = [...SUB_TASK_PATHS, 'department_task_detail.id'];
const TEAM_PARENT_PATHS = [
  'kaynak_task',
  'kaynak_task_id',
  'parent_task',
  'parent_task_id',
  'department_task_parent',
  'department_task_parent_id',
  'department_task_detail.parent',
  'subtask_parent',
  'subtask.parent',
];

function matchesWelding(
  record: Loose,
  taskId: number,
  assignmentTaskId: number | null,
  parentId: number | null,
  cachedSubtasks: readonly DepartmentTask[] | undefined,
): boolean {
  if (parentId === taskId) return true;
  if (toNumericId(record.kaynak_task_id) === taskId || toNumericId(record.kaynak_task) === taskId)
    return true;
  return Boolean(
    assignmentTaskId && cachedSubtasks?.some((st) => toNumericId(st.id) === assignmentTaskId),
  );
}

/**
 * Legacy isSubcontractingAssignmentForTask. `cachedSubtasks` are the task's
 * subtasks when its row is expanded (legacy read its subtask cache).
 */
export function isSubcontractingAssignmentForTask(
  assignment: object,
  task: DepartmentTask,
  cachedSubtasks?: readonly DepartmentTask[],
): boolean {
  const taskId = toNumericId(task.id);
  if (!taskId) return false;
  const record = assignment as Loose;
  const assignmentTaskId = firstId(record, SUB_TASK_PATHS);
  if (task.task_type === 'subcontracting' || task.task_type === 'painting')
    return assignmentTaskId === taskId;
  if (task.task_type === 'welding') {
    return matchesWelding(
      record,
      taskId,
      assignmentTaskId,
      firstId(record, SUB_PARENT_PATHS),
      cachedSubtasks,
    );
  }
  return false;
}

/** Legacy isInternalTeamAssignmentForTask. */
export function isInternalTeamAssignmentForTask(
  assignment: object,
  task: DepartmentTask,
  cachedSubtasks?: readonly DepartmentTask[],
): boolean {
  const taskId = toNumericId(task.id);
  if (!taskId) return false;
  const record = assignment as Loose;
  const assignmentTaskId = firstId(record, TEAM_TASK_PATHS);
  if (task.task_type === 'internal_team') return assignmentTaskId === taskId;
  if (task.task_type === 'welding') {
    return matchesWelding(
      record,
      taskId,
      assignmentTaskId,
      firstId(record, TEAM_PARENT_PATHS),
      cachedSubtasks,
    );
  }
  return false;
}

// ---- QC Excel import ----------------------------------------------------------------------

export interface QcReviewDraft {
  location: string;
  quantity_inspected: number | null;
  position_no: string;
  drawing_no: string;
  notes: string;
}

export function normalizeTurkish(text: string): string {
  return text
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/İ/g, 'i')
    .replace(/Ğ/g, 'g')
    .replace(/Ü/g, 'u')
    .replace(/Ş/g, 's')
    .replace(/Ö/g, 'o')
    .replace(/Ç/g, 'c')
    .replace(/\s+/g, '')
    .replace(/\./g, '');
}

/** Legacy parseCSV: comma separated, quotes toggle, fields trimmed, blank lines skipped. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const fields: string[] = [];
    let current = '';
    let quoted = false;
    for (const char of line) {
      if (char === '"') quoted = !quoted;
      else if (char === ',' && !quoted) {
        fields.push(current.trim());
        current = '';
      } else current += char;
    }
    fields.push(current.trim());
    rows.push(fields);
  }
  return rows;
}

const QC_KEYWORDS: Record<keyof QcReviewDraft, string[]> = {
  location: ['konum', 'location', 'lokasyon', 'yer'],
  quantity_inspected: ['miktar', 'quantity', 'incelenen', 'adet', 'sayi', 'qty'],
  position_no: ['pozisyon', 'position', 'pos', 'pozisyonno', 'positionno'],
  drawing_no: ['cizim', 'drawing', 'cizimno', 'drawingno', 'resim', 'dwg'],
  notes: ['not', 'notes', 'notlar', 'aciklama', 'description', 'comment'],
};

/** Legacy detectQCExcelColumnMapping: the first header containing a keyword, per field. */
export function detectQcColumns(headers: readonly unknown[]): Record<keyof QcReviewDraft, number> {
  const mapping: Record<keyof QcReviewDraft, number> = {
    location: -1,
    quantity_inspected: -1,
    position_no: -1,
    drawing_no: -1,
    notes: -1,
  };
  headers.forEach((header, index) => {
    if (!header) return;
    const normalized = normalizeTurkish(String(header).trim().toLowerCase());
    for (const [field, keywords] of Object.entries(QC_KEYWORDS) as [
      keyof QcReviewDraft,
      string[],
    ][]) {
      if (mapping[field] !== -1) continue;
      if (keywords.some((k) => normalized.includes(normalizeTurkish(k)))) mapping[field] = index;
    }
  });
  return mapping;
}

function cell(row: readonly unknown[], index: number): string {
  if (index === -1 || index >= row.length) return '';
  const value = row[index];
  return value !== null && value !== undefined ? String(value).trim() : '';
}

/** Legacy processQCExcelData: header row, then one review per non-empty row. */
export function qcReviewsFromSheet(data: readonly (readonly unknown[])[]): QcReviewDraft[] {
  const [headers = [], ...rows] = data;
  const columns = detectQcColumns(headers);
  return rows
    .filter((row) => row && row.length > 0)
    .map((row) => {
      const quantity = cell(row, columns.quantity_inspected);
      return {
        location: cell(row, columns.location),
        quantity_inspected: quantity ? Number.parseInt(quantity, 10) : null,
        position_no: cell(row, columns.position_no),
        drawing_no: cell(row, columns.drawing_no),
        notes: cell(row, columns.notes),
      };
    });
}

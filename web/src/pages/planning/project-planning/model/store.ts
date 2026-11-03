// İmalat Planlama's working copy: Excel-style multi-project tracking on REAL
// records (port of planning/project-planning/planning.js).
//
// One tab ("sheet") per resource (taşeron / ekip), grouped by JOB ORDER. Each
// group is the job's manufacturing main task, and under it sit its real
// children: Talaşlı İmalat, the welding assignments for this resource with
// their stages, and Boya. Malzeme Tedarik and Kesim belong to other
// departments and show as context. Everything is edited in memory
// (workday-aware) and committed with one bulk save.
//
// The board is a client-owned working copy, not cached server data: edits sit
// in it for minutes, a save reconciles it with the server's answer, and a
// background reload must not overwrite what the planner typed meanwhile. So it
// lives in this store (subscribed with useSyncExternalStore) rather than in the
// query cache.
//
// Speed: the legacy page re-ran four cascades over EVERY job and rebuilt every
// row's DOM on each edit. Here a job's cascades re-run only when something on
// that job changed (jobVersion), and rows that come out equal keep their
// previous object, so the memoized grid re-renders only what moved.

import type {
  BulkSaveBlock,
  BulkSavePayload,
  BulkSaveResponse,
  CapacityReport,
} from '@/api/welding/planning';
import { createWorkdayCalendar, type WorkdayCalendar } from '@/lib/workdays';
import { blockSchedulePatch } from './blockSchedulePatch';
import {
  blockVerdictLabel,
  indexBlocksByKey,
  indexResourcesByKey,
  type BlockEntry,
} from './capacityText';
import type { CapacityResource } from '@/api/welding/planning';
import { STATUS_META } from './constants';
import { defaultStagesFrom } from './defaultStages';
import { deptSchedulePatch } from './deptSchedulePatch';
import { blockProgress, blockRollup, deriveJob } from './derive';
import { fmtDate, fmtKg, round2, todayStr, trLower } from './format';
import { compareJobsBy, earliestDate, normalizeSortMode, type SortMode } from './jobSort';
import { indexMachining, machiningWeightItems, type MachiningVM } from './machiningWeight';
import { sameRow, type SheetRow } from './rowTypes';
import {
  adoptDeletedCreateIdentities,
  adoptDeletedStageIds,
  adoptedBlockSnap,
  adoptExistingBlockStageIds,
  adoptStageIds,
  assignmentKey,
  createdBlocksFromBoard,
  enqueueDeletedAssignment,
  findBoardBlock,
  knownAssignmentKeys,
  leftoverDeleted,
  matchCreatedBlock,
  newStageCidsFromBlock,
  sentMoveToByAssignment,
  shouldClearMoveTo,
  shouldDiscardNewBlockLocally,
  shouldDiscardNewStageLocally,
  shouldHydrateAfterSave,
  shouldPostNewBlock,
  type BlockSnap,
  type DeletedAssignment,
} from './saveReconcile';
import {
  DEPT_SLOTS,
  type BlockVM,
  type BoardBlock,
  type BoardResource,
  type BoardStage,
  type DeptSlot,
  type DeptVM,
  type InfoTask,
  type JobInfo,
  type JobOrderInfo,
  type PlanningBoard,
  type ResourceVM,
  type StageVM,
  type WeldingTask,
} from './types';

export const UNASSIGNED = '__none__';
export type ViewScope = 'full' | 'welding';

export interface StoreApi {
  fetchBoard(includeCompleted: boolean): Promise<PlanningBoard>;
  bulkSave(payload: BulkSavePayload): Promise<BulkSaveResponse>;
}

export interface StoreNotify {
  success(message: string): void;
  info(message: string): void;
  error(error: unknown, fallback?: string): void;
}

export interface StoreOptions {
  api: StoreApi;
  notify: StoreNotify;
  /** After every board (re)load: the capacity report follows it. */
  onBoardLoaded?: () => void;
  today?: () => string;
}

export interface Holder {
  name: string;
  type: string;
  kg: number;
}

export interface TabInfo {
  key: string;
  label: string;
  name: string;
  icon: string;
  title: string;
  active: boolean;
  empty: boolean;
  remainingKg: number | null;
  dirty: boolean;
  capacity: { level: 'over' | 'tight'; text: string; title: string } | null;
}

export interface TabStrip {
  allActive: boolean;
  allCount: number;
  tabs: TabInfo[];
  /** The "+N boş" / "Gizle" toggle; null when there is nothing to toggle. */
  emptyToggle: { showing: boolean; hidden: number } | null;
}

export interface OverAllocation {
  welding_task_id: number;
  job_no: string;
  job_order_title: string;
  allocated: number;
  total: number;
  holders: Holder[];
}

export interface FilterOption {
  value: string;
  label: string;
}

export interface WeldingTaskOption {
  value: string;
  task: WeldingTask;
  total: number;
  assigned: number;
  remaining: number;
  holders: Holder[];
}

const FINISHED = ['completed', 'cancelled', 'skipped'];

// Two billing locks (mirroring welding/services/planning.py): a billed baseline
// freezes the weight, while ANY statement line blocks a move.
export function isMoveLocked(block: Pick<BlockVM, 'is_billed' | 'has_statement_line'>): boolean {
  return !!(block.is_billed || block.has_statement_line);
}

export function resourceKeyOf(res: { resource_type: string; id: number }): string {
  return `${res.resource_type}-${res.id}`;
}

function stageVM(s: BoardStage): StageVM {
  const v = s as Record<string, unknown>;
  return {
    cid: `s${s.id}`,
    id: s.id,
    title: s.title,
    is_default: !!s.is_default,
    weight: s.weight,
    status: s.status,
    progress: Number(s.progress ?? 0),
    duration_wd: (v.duration_wd as number | null) ?? null,
    // Weight-share slice inherited down the ancestor chain. Display +
    // forecast only, never written back unless the planner edits the row.
    duration_is_derived: !!v.duration_is_derived,
    duration_source: (v.duration_source as string) || null,
    entered_duration_wd: v.entered_duration_wd == null ? null : (v.entered_duration_wd as number),
    start_date: (v.start_date as string | null) ?? null,
    end_date: (v.end_date as string | null) ?? null,
    projected_start_date: (v.projected_start_date as string) || null,
    projected_end_date: (v.projected_end_date as string) || null,
    completed_at: (v.completed_at as string) || null,
    forecast_date: (v.forecast_date as string) || null,
    forecast_kind: (v.forecast_kind as string) || null,
    forecast_elapsed_wd: (v.forecast_elapsed_wd as number | null) ?? null,
    forecast_head_start_pct: (v.forecast_head_start_pct as number | null) ?? null,
    note: (s.note as string) || '',
    deleted: false,
  };
}

function blockVM(b: BoardBlock, res: BoardResource): BlockVM {
  const st = b.subtask as Record<string, unknown>;
  return {
    key: `${b.assignment_type}-${b.assignment_id}`,
    isNew: false,
    assignment_type: b.assignment_type,
    assignment_id: b.assignment_id,
    subtask_id: b.subtask_id,
    welding_task_id: b.welding_task_id,
    job_no: b.job_no,
    job_order_title: b.job_order_title || '',
    customer_name: b.customer_name || '',
    allocated_weight_kg: Number(b.allocated_weight_kg),
    is_billed: !!b.is_billed,
    has_statement_line: !!b.has_statement_line,
    price_tier: b.price_tier ?? null,
    notes: b.notes || '',
    subtask: {
      status: b.subtask.status,
      progress: Number(st.progress ?? 0),
      start_date: (st.start_date as string | null) ?? null,
      end_date: (st.end_date as string | null) ?? null,
      // This ASSIGNMENT's own start, typed per block (284-07). Stored apart
      // from the derived start_date because the weight split and the purge
      // must not touch it.
      actual_start_date: (st.actual_start_date as string) || null,
      duration_wd: (st.duration_wd as number | null) ?? null,
      duration_is_derived: !!st.duration_is_derived,
      duration_source: (st.duration_source as string) || null,
      entered_duration_wd:
        st.entered_duration_wd == null ? null : (st.entered_duration_wd as number),
      completed_at: (st.completed_at as string) || null,
      forecast_date: (st.forecast_date as string) || null,
      forecast_kind: (st.forecast_kind as string) || null,
      forecast_elapsed_wd: (st.forecast_elapsed_wd as number | null) ?? null,
      forecast_head_start_pct: (st.forecast_head_start_pct as number | null) ?? null,
      projected_start_date: (st.projected_start_date as string) || null,
      projected_end_date: (st.projected_end_date as string) || null,
    },
    stages: (b.stages || []).map(stageVM),
    createDefaultStages: false,
    deleted: false,
    resource_type: res.resource_type,
    resource_id: res.id,
    resource_name: res.display_name || res.name,
  };
}

// The three department tasks this sheet plans. They are real
// JobOrderDepartmentTask rows: edits here are saved back onto them.
function deptVM(row: InfoTask | null | undefined): DeptVM | null {
  if (!row) return null;
  const v = row as Record<string, unknown>;
  return {
    task_id: row.task_id,
    status: row.status ?? 'pending',
    // Only the manufacturing main task carries these: it is the job's owner,
    // and what the Sorumlu filter matches on.
    assigned_to: (v.assigned_to as number | string | null) ?? null,
    assigned_to_name: (v.assigned_to_name as string) || '',
    // How much of its parent's progress this task is worth.
    weight: row.weight ?? null,
    progress: Number(row.progress ?? 0),
    duration_wd: row.duration_wd ?? null,
    start_date: row.start_date ?? null,
    end_date: row.end_date ?? null,
    completed_at: row.completed_at || null,
    forecast_date: row.forecast_date || null,
    forecast_kind: row.forecast_kind || null,
    forecast_elapsed_wd: row.forecast_elapsed_wd ?? null,
    forecast_head_start_pct: row.forecast_head_start_pct ?? null,
    has_subtasks: !!v.has_subtasks,
    // Which parts the planner did not type: none of them may be written back
    // unless the row is edited.
    start_is_actual: !!row.start_is_actual,
    end_is_actual: !!row.end_is_actual,
    duration_is_derived: !!row.duration_is_derived,
    duration_source: row.duration_source || null,
    entered_duration_wd: row.entered_duration_wd == null ? null : row.entered_duration_wd,
    start_from_children: !!v.start_from_children,
    end_from_children: !!v.end_from_children,
    // The stored plan, before any widening: the floor the union keeps.
    entered_start_date: row.entered_start_date || null,
    entered_end_date: row.entered_end_date || null,
    projected_start_date: row.projected_start_date || null,
    projected_end_date: row.projected_end_date || null,
  };
}

// A date nobody typed on this task says where it came from.
type DateRow = Pick<
  SheetRow,
  'start_date' | 'end_date' | 'status' | 'start_date_source' | 'end_date_source'
>;
interface Projection {
  projected_start_date?: string | null;
  projected_end_date?: string | null;
}

// A projection is only worth borrowing while it still sits after the row's own
// start (user 2026-09-17, 305-01): an empty Bitiş says "no plan"; a backwards
// one says something false.
function canBorrowEnd(
  row: DateRow,
  projectedEnd: string | null | undefined,
): projectedEnd is string {
  if (row.end_date != null || !projectedEnd) return false;
  return !row.start_date || projectedEnd >= row.start_date;
}

// Derived rows borrow the forecast engine's projected window for display and
// for their bar; nothing here is written back. Sources are tracked PER FIELD.
function withEngineDates<T extends DateRow>(row: T, vm: Projection): T {
  if (row.start_date == null && vm.projected_start_date) {
    row.start_date = vm.projected_start_date;
    row.start_date_source = row.start_date_source || 'engine';
  }
  if (canBorrowEnd(row, vm.projected_end_date)) {
    row.end_date = vm.projected_end_date;
    row.end_date_source = row.end_date_source || 'engine';
  }
  return row;
}

// Başlangıç and Bitiş are the PLAN (user 2026-09-01): the STORED value shows,
// the projection only fills a gap. `keepStart` is for the İmalat row, whose
// start is the planner's single date input and shows exactly as typed.
function withDerivedDates<T extends DateRow>(
  row: T,
  vm: Projection,
  { keepStart = false } = {},
): T {
  if (!FINISHED.includes(row.status ?? '')) {
    if (!keepStart && row.start_date == null && vm.projected_start_date) {
      row.start_date = vm.projected_start_date;
      row.start_date_source = row.start_date_source || 'engine';
    }
    if (canBorrowEnd(row, vm.projected_end_date)) {
      row.end_date = vm.projected_end_date;
      row.end_date_source = row.end_date_source || 'engine';
    }
  }
  return withEngineDates(row, vm);
}

// Adet for a kg slice of a job order: the order's quantity scaled by the
// slice's share of its tonnage (user 2026-09-16). Whole units only; the exact
// ratio goes in the tooltip.
function quantityShare(kg: unknown, jobQuantity: unknown, jobTotalKg: unknown) {
  const total = Number(jobTotalKg || 0);
  const qty = Number(jobQuantity || 0);
  const slice = Number(kg || 0);
  if (!(total > 0) || !(qty > 0) || !(slice > 0)) return null;
  const exact = (qty * slice) / total;
  return { exact, whole: Math.round(exact) };
}

// Adet on a group row: how many units of the order this sheet's blocks add up
// to, over the order's own count ("1 / 9").
function groupQuantity(blocks: BlockVM[], jo: JobOrderInfo | null): Partial<SheetRow> {
  const total = jo ? (jo.quantity ?? null) : null;
  const kg = blocks.reduce((sum, b) => sum + Number(b.allocated_weight_kg || 0), 0);
  const share = quantityShare(kg, total, jo && jo.total_weight_kg);
  if (!share) return { quantity: total };
  return {
    quantity: share.whole,
    quantity_of: total,
    quantity_is_share: true,
    quantity_exact: share.exact,
    quantity_kg: round2(kg),
  };
}

// Undated last: an assignment nobody has scheduled is not "the earliest".
function compareDates(a: string | null | undefined, b: string | null | undefined): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? -1 : 1;
}

export class PlanningStore {
  private readonly opts: StoreOptions;
  private readonly listeners = new Set<() => void>();

  // ---- render state ----
  private version = 0;
  private readonly jobVersion = new Map<string, number>();
  private readonly derivedVersion = new Map<string, number>();
  private rowsCache: { version: number; rows: SheetRow[] } | null = null;
  private prevRows = new Map<string, SheetRow>();
  private tabsCache: { version: number; strip: TabStrip } | null = null;
  private collapsedCache: { version: number; set: Set<string> } | null = null;
  private allocCache: { version: number; byTask: Map<number, number> } | null = null;
  private overCache: { version: number; lines: OverAllocation[] } | null = null;
  // Which blocks exist where and who owns each job: bumped by hydrate, add,
  // delete and move, not by cell edits. The filter choices follow it.
  private structureVersion = 0;
  private filterOptionsCache: {
    version: number;
    jobs: FilterOption[];
    assignees: FilterOption[];
  } | null = null;

  // ---- working copy ----
  loaded = false;
  loading = false;
  calendar: WorkdayCalendar = createWorkdayCalendar([]);
  resources: ResourceVM[] = [];
  weldingTasks: WeldingTask[] = [];
  jobInfo: Record<string, JobInfo> = {};
  deptByJob: Record<string, Partial<Record<DeptSlot, DeptVM | null>>> = {};
  machiningByJob: Record<string, MachiningVM> = {};
  machiningByTask: Record<number, MachiningVM> = {};

  private snapBlocks = new Map<string, BlockSnap>();
  private dirtyBlocks = new Set<string>();
  private dirtyDept = new Map<string, Set<string>>();
  private dirtyMachining = new Map<number, Set<string>>();
  private dirtyLogistics = new Map<string, Set<string>>();
  private dirtyCutting = new Map<number, Set<string>>();
  private deletedBlocks: DeletedAssignment[] = [];
  // Bumped on every working-copy mutation. Save + background rebuild compare
  // it to the value at send time: a later bump means the planner edited during
  // the wait, so hydrate must not replace the working copy.
  private mutationClock = 0;
  saveInFlight = false;
  // Keys of new_blocks / cids of id-less stages in the in-flight save: delete
  // must not treat those as local-only, the server is about to create them.
  private inflightNewKeys = new Set<string>();
  private inflightNewStageCids = new Set<string>();
  private newCounter = 0;
  private jobHayCache = new Map<string, string>();

  /** Jobs edited this session: the client cascades own their projections. */
  private liveForecastJobs = new Set<string>();

  // ---- view state ----
  activeResourceKey: string | null = null;
  private collapsedJobs = new Set<string>();
  // The "Tümü" tab starts with every job folded (700+ task rows open), so it
  // tracks the OPPOSITE state: the jobs the user explicitly opened.
  private expandedJobsAll = new Set<string>();
  showCompleted = false;
  showEmptyResources = false;
  sortMode: SortMode = 'job_no';
  viewScope: ViewScope = 'full';
  filterJobNos: string[] = [];
  filterAssignee = '';
  filterText = '';
  /** Bumped whenever the filters are cleared, so the search box empties too. */
  filterResetCount = 0;

  // ---- capacity decorations (advisory, saved plan only) ----
  capacityReport: CapacityReport | null = null;
  private capacityByBlockKey = new Map<string, BlockEntry>();
  private capacityByResourceKey = new Map<string, CapacityResource>();

  constructor(opts: StoreOptions) {
    this.opts = opts;
  }

  // ---- subscription ---------------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = (): number => this.version;

  private changed({ structure = false } = {}): void {
    if (structure) this.structureVersion += 1;
    this.version += 1;
    this.listeners.forEach((l) => l());
  }

  private today(): string {
    return this.opts.today ? this.opts.today() : todayStr();
  }

  /** Something on this job changed: its cascades must run again. */
  private touch(jobNo: string | null | undefined): void {
    if (!jobNo) return;
    this.jobVersion.set(jobNo, (this.jobVersion.get(jobNo) ?? 0) + 1);
  }

  private bumpMutation(): void {
    this.mutationClock += 1;
  }

  // ---- hydrate --------------------------------------------------------------

  hydrate(board: PlanningBoard): void {
    // Fresh server truth supersedes every live client approximation.
    this.liveForecastJobs.clear();
    this.jobHayCache.clear();
    this.calendar = createWorkdayCalendar(board.holidays || []);
    this.weldingTasks = board.welding_tasks || [];
    this.jobInfo = board.job_info || {};

    this.deptByJob = {};
    ({ machiningByJob: this.machiningByJob, machiningByTask: this.machiningByTask } =
      indexMachining(this.jobInfo));
    Object.entries(this.jobInfo).forEach(([jobNo, info]) => {
      const slots: Partial<Record<DeptSlot, DeptVM | null>> = {};
      DEPT_SLOTS.forEach((slot) => {
        slots[slot] = deptVM(info[slot] as InfoTask | null | undefined);
      });
      this.deptByJob[jobNo] = slots;
    });

    this.resources = (board.resources || []).map((res) => ({
      resource_type: res.resource_type,
      id: res.id,
      name: res.name,
      display_name: res.display_name || res.name,
      blocks: (res.blocks || []).map((b) => blockVM(b, res)),
    }));

    this.snapBlocks = new Map();
    this.resources.forEach((res) =>
      res.blocks.forEach((b) => {
        this.snapBlocks.set(b.key, {
          allocated_weight_kg: b.allocated_weight_kg,
          notes: b.notes,
          subtask: {
            actual_start_date: b.subtask.actual_start_date,
            entered_duration_wd: b.subtask.entered_duration_wd ?? null,
          },
        });
      }),
    );

    this.dirtyBlocks = new Set();
    this.dirtyDept = new Map();
    this.dirtyMachining = new Map();
    this.dirtyLogistics = new Map();
    this.dirtyCutting = new Map();
    this.deletedBlocks = [];

    if (
      this.activeResourceKey !== 'all' &&
      (!this.activeResourceKey ||
        !this.resources.some((r) => resourceKeyOf(r) === this.activeResourceKey))
    ) {
      this.activeResourceKey = this.resources[0] ? resourceKeyOf(this.resources[0]) : null;
    }

    // Every job derives again from the new truth.
    this.jobVersion.clear();
    this.derivedVersion.clear();
    this.prevRows = new Map();
    this.loaded = true;
    this.structureVersion += 1;
    this.pruneFilters();
    this.changed();
  }

  async load(): Promise<void> {
    this.loading = true;
    this.changed();
    try {
      const data = await this.opts.api.fetchBoard(this.showCompleted);
      this.hydrate(data);
      this.opts.onBoardLoaded?.();
    } catch (e) {
      this.opts.notify.error(e);
    } finally {
      this.loading = false;
      this.changed();
    }
  }

  setShowCompleted(value: boolean): void {
    this.showCompleted = value;
    void this.load();
  }

  // ---- lookups ----------------------------------------------------------------

  activeResource(): ResourceVM | null {
    return this.resources.find((r) => resourceKeyOf(r) === this.activeResourceKey) || null;
  }

  onAllTab(): boolean {
    return this.activeResourceKey === 'all';
  }

  findBlock(blockRef: string | null | undefined): BlockVM | null {
    if (!blockRef) return null;
    for (const res of this.resources) {
      const block = res.blocks.find((b) => b.key === blockRef);
      if (block) return block;
    }
    return null;
  }

  deptOf(jobNo: string | null | undefined, slot: DeptSlot): DeptVM | null {
    if (!jobNo) return null;
    return this.deptByJob[jobNo]?.[slot] || null;
  }

  private cuttingOf(jobNo: string | null | undefined, taskId: number | undefined): InfoTask | null {
    if (!jobNo) return null;
    return (this.jobInfo[jobNo]?.cutting || []).find((c) => c.task_id === taskId) || null;
  }

  hasUnsavedChanges(): boolean {
    return (
      this.dirtyBlocks.size > 0 ||
      this.dirtyDept.size > 0 ||
      this.dirtyMachining.size > 0 ||
      this.dirtyLogistics.size > 0 ||
      this.dirtyCutting.size > 0 ||
      this.deletedBlocks.length > 0
    );
  }

  private isJobCollapsed(jobNo: string): boolean {
    return this.onAllTab() ? !this.expandedJobsAll.has(jobNo) : this.collapsedJobs.has(jobNo);
  }

  // Make a job's rows visible on whichever tab the user is looking at: used
  // after creating something under it, so the result doesn't land folded away.
  revealJob(jobNo: string): void {
    this.collapsedJobs.delete(jobNo);
    this.expandedJobsAll.add(jobNo);
  }

  /** Unfold a job on whichever tab is open (Kapasite "Göster"). */
  showJob(jobNo: string): void {
    this.revealJob(jobNo);
    this.changed();
  }

  // kg the sheet cannot show: a retired assignment or one held by a
  // deactivated subcontractor/team, which has no tab. It is still taken (the
  // server counts it on every save), so the totals here count it too.
  private offSheetKg(weldingTaskId: number): number {
    const t = this.weldingTasks.find((x) => x.welding_task_id === Number(weldingTaskId));
    return Number(t?.off_sheet_kg || 0);
  }

  private offSheetHolders(weldingTaskId: number): Holder[] {
    const t = this.weldingTasks.find((x) => x.welding_task_id === Number(weldingTaskId));
    return (t?.off_sheet_holders || []).map((h) => ({
      name: `${h.name} (pasif)`,
      type: h.resource_type,
      kg: Number(h.allocated_weight_kg || 0),
    }));
  }

  // kg assigned to a welding task across ALL resources in the working copy,
  // plus what is held off the sheet.
  allocatedForTask(weldingTaskId: number): number {
    if (this.allocCache?.version !== this.version) {
      const byTask = new Map<number, number>();
      this.resources.forEach((res) =>
        res.blocks.forEach((b) => {
          if (!b.deleted)
            byTask.set(
              b.welding_task_id,
              (byTask.get(b.welding_task_id) ?? 0) + Number(b.allocated_weight_kg || 0),
            );
        }),
      );
      this.allocCache = { version: this.version, byTask };
    }
    return round2(
      this.offSheetKg(weldingTaskId) + (this.allocCache.byTask.get(Number(weldingTaskId)) ?? 0),
    );
  }

  remainingForTask(weldingTaskId: number, totalWeightKg: unknown): number | null {
    if (totalWeightKg == null) return null;
    return round2(Number(totalWeightKg) - this.allocatedForTask(weldingTaskId));
  }

  /** Who currently holds kg on a welding task, from the working copy. */
  holdersForTask(weldingTaskId: number): Holder[] {
    const holders = this.offSheetHolders(weldingTaskId);
    this.resources.forEach((res) =>
      res.blocks.forEach((b) => {
        if (b.deleted || b.welding_task_id !== Number(weldingTaskId)) return;
        holders.push({
          name: res.display_name || res.name,
          type: res.resource_type,
          kg: Number(b.allocated_weight_kg || 0),
        });
      }),
    );
    return holders.sort((a, b) => b.kg - a.kg);
  }

  // ---- dirty tracking -----------------------------------------------------------

  // `live: false` keeps the job on the SERVER's projections, for an edit the
  // client cascade cannot model.
  private markBlockDirty(blockRef: string, { live = true } = {}): void {
    this.dirtyBlocks.add(blockRef);
    this.bumpMutation();
    const block = this.findBlock(blockRef);
    if (block) this.touch(block.job_no);
    if (live && block?.job_no) this.liveForecastJobs.add(block.job_no);
  }

  private markFields<K>(map: Map<K, Set<string>>, key: K, field: string | null): void {
    const fields = map.get(key) || new Set<string>();
    if (field) fields.add(field);
    map.set(key, fields);
  }

  private markMachiningDirty(taskId: number, jobNo: string, field: string): void {
    this.markFields(this.dirtyMachining, taskId, field);
    this.liveForecastJobs.add(jobNo);
    this.touch(jobNo);
    this.bumpMutation();
  }

  private markDeptDirty(jobNo: string, slot: DeptSlot, field: string): void {
    this.markFields(this.dirtyDept, `${jobNo}|${slot}`, field);
    this.liveForecastJobs.add(jobNo);
    this.touch(jobNo);
    this.bumpMutation();
  }

  private markLogisticsDirty(jobNo: string, field: string): void {
    this.markFields(this.dirtyLogistics, jobNo, field);
    this.liveForecastJobs.add(jobNo);
    this.touch(jobNo);
    this.bumpMutation();
  }

  // Kesim sits upstream of İmalat and nothing on the sheet derives from it, so
  // an edit does NOT switch the job to live forecasts; only the row moves.
  private markCuttingDirty(taskId: number, jobNo: string, field: string): void {
    this.markFields(this.dirtyCutting, taskId, field);
    this.touch(jobNo);
    this.bumpMutation();
  }

  // ---- capacity decorations -----------------------------------------------------

  setCapacityReport(report: CapacityReport | null): void {
    this.capacityReport = report;
    this.capacityByBlockKey = indexBlocksByKey(report);
    this.capacityByResourceKey = indexResourcesByKey(report);
    this.changed();
  }

  /** The marks described the plan before a save; they return with the next report. */
  clearCapacityDecorations(): void {
    this.capacityByBlockKey = new Map();
    this.capacityByResourceKey = new Map();
  }

  // The engine's entry for a block row, only while the row still reflects the
  // SAVED plan. An unsaved edit changes what the engine would say.
  private capacityFor(blockRef: string | undefined, jobNo: string | null): BlockEntry | null {
    if (!blockRef) return null;
    if (this.dirtyBlocks.has(blockRef) || (jobNo && this.liveForecastJobs.has(jobNo))) return null;
    return this.capacityByBlockKey.get(blockRef) || null;
  }

  private capacityFields(blockRef: string | undefined, jobNo: string | null): Partial<SheetRow> {
    const entry = this.capacityFor(blockRef, jobNo);
    if (!entry) return { cap_state: 'none', cap_late: false };
    const b = entry.block;
    const late = b.verdict === 'late_risk' && !(b.flags || []).includes('deadline_passed');
    const finish = b.relaxed_finish ? fmtDate(b.relaxed_finish) : 'simülasyon ufkunun ötesinde';
    const deadline = b.deadline ? fmtDate(b.deadline) : 'girilmemiş';
    const title =
      `Kapasite: ${blockVerdictLabel(b)} — bu kaynağın sırasında en erken bitiş ${finish}, ` +
      `termin ${deadline}. Öneriler için Kapasite panelini açın.`;
    if (b.verdict === 'no_data') return { cap_state: 'no_data', cap_late: false, cap_title: title };
    return {
      cap_state: 'entry',
      cap_late: late,
      cap_title: title,
      cap_finish: b.relaxed_finish ? fmtDate(b.relaxed_finish) : 'ufuk dışı',
      cap_label: blockVerdictLabel(b),
      cap_chip: late
        ? 'late'
        : b.verdict === 'on_track' && b.late_cause !== 'plan_start'
          ? 'early'
          : 'muted',
    };
  }

  // ---- filters ------------------------------------------------------------------

  // Every job order the board can display: assigned blocks AND the assignable
  // jobs the "Tümü" tab lists.
  private boardJobs(): Map<string, string> {
    const seen = new Map<string, string>();
    this.resources.forEach((res) =>
      res.blocks.forEach((b) => {
        if (b.deleted || !b.job_no) return;
        if (!seen.has(b.job_no)) seen.set(b.job_no, b.job_order_title || '');
      }),
    );
    this.weldingTasks.forEach((t) => {
      if (t.job_no && !seen.has(t.job_no)) seen.set(t.job_no, t.job_order_title || '');
    });
    return seen;
  }

  // Everything the free-text search can match for one job; cached until the
  // next hydrate (titles never change client-side).
  private jobSearchHay(jobNo: string): string {
    const cached = this.jobHayCache.get(jobNo);
    if (cached !== undefined) return cached;
    const parts: string[] = [String(jobNo)];
    const jo = this.jobInfo[jobNo]?.job_order;
    if (jo?.title) parts.push(jo.title);
    const wt = this.weldingTasks.find((t) => t.job_no === jobNo);
    if (wt) parts.push(wt.job_order_title || '', wt.customer_name || '');
    this.resources.some((res) =>
      res.blocks.some((b) => {
        if (b.deleted || b.job_no !== jobNo) return false;
        parts.push(b.job_order_title || '', b.customer_name || '');
        return true;
      }),
    );
    const hay = trLower(parts.filter(Boolean).join(' '));
    this.jobHayCache.set(jobNo, hay);
    return hay;
  }

  // The job's owner: whoever holds its İmalat main task.
  private jobAssignee(jobNo: string): string | null {
    const id = this.deptOf(jobNo, 'manufacturing')?.assigned_to;
    return id === null || id === undefined ? null : String(id);
  }

  hasActiveFilter(): boolean {
    return !!(this.filterJobNos.length || this.filterAssignee || this.filterText.trim());
  }

  jobMatchesFilters(jobNo: string): boolean {
    if (this.filterJobNos.length && !this.filterJobNos.includes(String(jobNo))) return false;
    const text = trLower(this.filterText.trim());
    if (text && !this.jobSearchHay(jobNo).includes(text)) return false;
    if (this.filterAssignee) {
      const assignee = this.jobAssignee(jobNo);
      return this.filterAssignee === UNASSIGNED
        ? assignee === null
        : assignee === this.filterAssignee;
    }
    return true;
  }

  // A resource's live blocks that survive the filters. Deleted blocks are gone
  // from every count; filtered-out ones are only hidden.
  visibleBlocks(res: ResourceVM): BlockVM[] {
    return res.blocks.filter((b) => !b.deleted && this.jobMatchesFilters(b.job_no));
  }

  private filterOptions(): { jobs: FilterOption[]; assignees: FilterOption[] } {
    if (this.filterOptionsCache?.version !== this.structureVersion) {
      this.filterOptionsCache = {
        version: this.structureVersion,
        jobs: this.buildJobFilterOptions(),
        assignees: this.buildAssigneeFilterOptions(),
      };
    }
    return this.filterOptionsCache;
  }

  jobFilterOptions(): FilterOption[] {
    return this.filterOptions().jobs;
  }

  assigneeFilterOptions(): FilterOption[] {
    return this.filterOptions().assignees;
  }

  private buildJobFilterOptions(): FilterOption[] {
    // Some titles run to 200 characters: the option shows enough to recognise
    // the job, the search still reads the full title.
    const shorten = (title: string) => (title.length > 44 ? `${title.slice(0, 43)}…` : title);
    return [...this.boardJobs().entries()]
      .sort((a, b) =>
        String(a[0]).localeCompare(String(b[0]), 'tr', { numeric: true, sensitivity: 'base' }),
      )
      .map(([jobNo, title]) => ({
        value: String(jobNo),
        label: title ? `${jobNo} — ${shorten(title)}` : String(jobNo),
      }));
  }

  private buildAssigneeFilterOptions(): FilterOption[] {
    const byId = new Map<string, string>();
    let anyUnassigned = false;
    this.boardJobs().forEach((_title, jobNo) => {
      const id = this.jobAssignee(jobNo);
      if (id === null) {
        anyUnassigned = true;
        return;
      }
      if (!byId.has(id))
        byId.set(id, this.deptOf(jobNo, 'manufacturing')?.assigned_to_name || `#${id}`);
    });
    const options = [...byId.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], 'tr'))
      .map(([id, name]) => ({ value: id, label: name }));
    if (anyUnassigned) options.push({ value: UNASSIGNED, label: 'Atanmamış' });
    return options;
  }

  // A filtered value that no longer exists (the job finished, its owner
  // changed) would hide the whole board with no way back.
  private pruneFilters(): void {
    if (this.filterJobNos.length) {
      const jobs = this.boardJobs();
      this.filterJobNos = this.filterJobNos.filter((v) => jobs.has(v));
    }
    if (
      this.filterAssignee &&
      !this.assigneeFilterOptions().some((o) => o.value === this.filterAssignee)
    ) {
      this.filterAssignee = '';
    }
  }

  setFilters(next: { jobNos?: string[]; assignee?: string; text?: string }): void {
    if (next.jobNos) this.filterJobNos = [...next.jobNos];
    if (next.assignee !== undefined) this.filterAssignee = next.assignee;
    if (next.text !== undefined) this.filterText = next.text;
    this.onFilterChange();
  }

  clearFilters(): void {
    if (!this.hasActiveFilter()) return;
    this.filterJobNos = [];
    this.filterAssignee = '';
    this.filterText = '';
    this.filterResetCount += 1;
    this.onFilterChange();
  }

  // Filtering to a job that is not on the open sheet would leave the planner
  // staring at an empty grid, so the strip moves to a tab that has it. Never
  // hop away from "Tümü"; hop TO it when only unassigned rows match.
  private onFilterChange(): void {
    const res = this.activeResource();
    if (
      this.hasActiveFilter() &&
      this.activeResourceKey !== 'all' &&
      (!res || !this.visibleBlocks(res).length)
    ) {
      const next = this.resources.find((r) => this.visibleBlocks(r).length);
      this.activeResourceKey = next ? resourceKeyOf(next) : 'all';
    }
    this.changed();
  }

  filterSummary(): { text: string; empty: boolean } | null {
    if (!this.hasActiveFilter()) return null;
    const jobs = new Set<string>();
    let resourceCount = 0;
    this.resources.forEach((res) => {
      const blocks = this.visibleBlocks(res);
      if (!blocks.length) return;
      resourceCount += 1;
      blocks.forEach((b) => jobs.add(b.job_no));
    });
    const empty = !jobs.size;
    return {
      empty,
      text: empty
        ? 'Filtreye uyan iş bulunamadı'
        : `${jobs.size} iş emri · ${resourceCount} kaynak`,
    };
  }

  // What narrows the printed sheet, said on the sheet itself.
  exportContextText(): string {
    const parts: string[] = [];
    if (this.viewScope === 'welding') parts.push('Görünüm: yalnızca Kaynaklı İmalat');
    if (this.filterJobNos.length) {
      parts.push(
        `İş emri: ${this.filterJobNos.slice(0, 4).join(', ')}` +
          (this.filterJobNos.length > 4 ? ` +${this.filterJobNos.length - 4}` : ''),
      );
    }
    if (this.filterAssignee) {
      const opt = this.assigneeFilterOptions().find((o) => o.value === this.filterAssignee);
      parts.push(`Sorumlu: ${opt ? opt.label : this.filterAssignee}`);
    }
    if (this.filterText.trim()) parts.push(`Ara: "${this.filterText.trim()}"`);
    if (this.showCompleted) parts.push('Tamamlananlar dahil');
    return parts.length ? `Filtre — ${parts.join(' · ')}` : '';
  }

  // ---- tabs and warnings ----------------------------------------------------------

  tabStrip(): TabStrip {
    if (this.tabsCache?.version === this.version) return this.tabsCache.strip;
    const tab = (res: ResourceVM): TabInfo => {
      const key = resourceKeyOf(res);
      // Counts follow the filters, so the strip itself answers "who is on this job".
      const blocks = this.visibleBlocks(res);
      const blockCount = blocks.length;
      // REMAINING kg, not assigned kg (user 2026-09-16): each block discounts
      // by its OWN progress.
      const totalKg = round2(
        blocks.reduce((sum, b) => sum + Number(b.allocated_weight_kg || 0), 0),
      );
      const remainingKg = round2(
        blocks.reduce((sum, b) => {
          const done = Math.min(Math.max(blockProgress(b), 0), 100);
          return sum + Number(b.allocated_weight_kg || 0) * (1 - done / 100);
        }, 0),
      );
      const kgTitle =
        remainingKg === totalKg
          ? `${fmtKg(totalKg)} kg`
          : `kalan ${fmtKg(remainingKg)} kg / atanan ${fmtKg(totalKg)} kg`;
      // Unsaved work is never hidden by a view filter.
      const dirty =
        res.blocks.some((b) => this.dirtyBlocks.has(b.key)) ||
        this.deletedBlocks.some((d) => d.resourceKey === key);
      const emptyHint = this.hasActiveFilter() ? ' — filtreye uyan iş yok' : ' — atanmış iş yok';
      const cap = this.capacityByResourceKey.get(key);
      let capacity: TabInfo['capacity'] = null;
      if (cap && (cap.verdict === 'tight' || cap.verdict === 'overloaded')) {
        const label = cap.verdict === 'overloaded' ? 'Dolu' : 'Sıkışık';
        const text =
          cap.pressure != null
            ? `${Number(cap.pressure).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}×`
            : label;
        capacity = {
          level: cap.verdict === 'overloaded' ? 'over' : 'tight',
          text,
          title:
            cap.pressure != null
              ? `Kapasite: ${label} — terminler için gerekli hız mevcut hızın ${text}'ı`
              : `Kapasite: ${label}`,
        };
      }
      return {
        key,
        label: res.display_name || res.name,
        name: res.name,
        icon: res.resource_type === 'team' ? 'fas fa-users' : 'fas fa-industry',
        title: `${res.name}${blockCount ? ` — ${blockCount} iş, ${kgTitle}` : emptyHint}`,
        active: key === this.activeResourceKey,
        empty: !blockCount,
        remainingKg: blockCount ? remainingKg : null,
        dirty,
        capacity,
      };
    };
    const has = (res: ResourceVM) => this.visibleBlocks(res).length > 0;
    const filled = this.resources.filter(has);
    // Empty resources stay reachable but don't eat rows of the strip; the
    // active one is always shown even when empty.
    const empty = this.resources.filter((r) => !has(r));
    const visibleEmpty = this.showEmptyResources
      ? empty
      : empty.filter((r) => resourceKeyOf(r) === this.activeResourceKey);
    const hidden = empty.length - visibleEmpty.length;
    const strip: TabStrip = {
      allActive: this.activeResourceKey === 'all',
      allCount: this.resources.reduce((acc, res) => acc + this.visibleBlocks(res).length, 0),
      tabs: [...filled.map(tab), ...visibleEmpty.map(tab)],
      emptyToggle:
        hidden > 0 || this.showEmptyResources ? { showing: this.showEmptyResources, hidden } : null,
    };
    this.tabsCache = { version: this.version, strip };
    return strip;
  }

  overAllocations(): OverAllocation[] {
    if (this.overCache?.version === this.version) return this.overCache.lines;
    // Who holds the kg on each welding task, from the working copy.
    const holdersByTask = new Map<number, Holder[]>();
    const push = (id: number, h: Holder) => {
      const list = holdersByTask.get(id) || [];
      list.push(h);
      holdersByTask.set(id, list);
    };
    this.resources.forEach((res) =>
      res.blocks.forEach((b) => {
        if (b.deleted) return;
        push(b.welding_task_id, {
          name: res.display_name || res.name,
          type: res.resource_type,
          kg: Number(b.allocated_weight_kg || 0),
        });
      }),
    );
    this.weldingTasks.forEach((t) =>
      this.offSheetHolders(t.welding_task_id).forEach((h) => push(t.welding_task_id, h)),
    );
    const out: OverAllocation[] = [];
    this.weldingTasks.forEach((t) => {
      if (t.total_weight_kg == null) return;
      const allocated = this.allocatedForTask(t.welding_task_id);
      const total = Number(t.total_weight_kg);
      if (allocated <= total) return;
      out.push({
        welding_task_id: t.welding_task_id,
        job_no: t.job_no,
        job_order_title: t.job_order_title || '',
        allocated,
        total,
        holders: (holdersByTask.get(t.welding_task_id) || []).sort((a, b) => b.kg - a.kg),
      });
    });
    this.overCache = { version: this.version, lines: out };
    return out;
  }

  // ---- view controls -------------------------------------------------------------

  switchResource(key: string): void {
    if (key === this.activeResourceKey) return;
    this.activeResourceKey = key;
    this.changed();
  }

  toggleShowEmpty(): void {
    this.showEmptyResources = !this.showEmptyResources;
    this.changed();
  }

  setSortMode(mode: unknown): void {
    this.sortMode = normalizeSortMode(mode);
    this.changed();
  }

  setViewScope(mode: unknown): void {
    this.viewScope = mode === 'welding' ? 'welding' : 'full';
    this.changed();
  }

  toggleJob(jobNo: string): void {
    if (this.onAllTab()) {
      if (this.expandedJobsAll.has(jobNo)) this.expandedJobsAll.delete(jobNo);
      else this.expandedJobsAll.add(jobNo);
    } else if (this.collapsedJobs.has(jobNo)) {
      this.collapsedJobs.delete(jobNo);
    } else {
      this.collapsedJobs.add(jobNo);
    }
    this.changed();
  }

  // Every job with a visible block anywhere: the group rows of "Tümü".
  private allSheetJobNos(): Set<string> {
    const seen = new Set<string>();
    this.resources.forEach((res) => this.visibleBlocks(res).forEach((b) => seen.add(b.job_no)));
    return seen;
  }

  expandedJobCount(): number {
    if (this.onAllTab()) {
      let open = 0;
      this.allSheetJobNos().forEach((jobNo) => {
        if (this.expandedJobsAll.has(jobNo)) open += 1;
      });
      return open;
    }
    const res = this.activeResource();
    if (!res) return 0;
    return this.jobNosOf(res).filter((jobNo) => !this.collapsedJobs.has(jobNo)).length;
  }

  toggleAll(): void {
    const collapse = this.expandedJobCount() > 0;
    if (this.onAllTab()) {
      if (collapse) this.expandedJobsAll.clear();
      else this.allSheetJobNos().forEach((jobNo) => this.expandedJobsAll.add(jobNo));
      this.changed();
      return;
    }
    const res = this.activeResource();
    if (!res) return;
    this.jobNosOf(res).forEach((jobNo) => {
      if (collapse) this.collapsedJobs.add(jobNo);
      else this.collapsedJobs.delete(jobNo);
    });
    this.changed();
  }

  // ---- derive -----------------------------------------------------------------------

  private blocksByJob(): Map<string, BlockVM[]> {
    const map = new Map<string, BlockVM[]>();
    this.resources.forEach((res) =>
      res.blocks.forEach((b) => {
        if (b.deleted) return;
        const list = map.get(b.job_no) || [];
        list.push(b);
        map.set(b.job_no, list);
      }),
    );
    return map;
  }

  /** Runs the cascades of every job that changed since it last derived. */
  private ensureDerived(): void {
    const jobs = new Set<string>([...Object.keys(this.deptByJob), ...this.liveForecastJobs]);
    let byJob: Map<string, BlockVM[]> | null = null;
    const today = this.today();
    jobs.forEach((jobNo) => {
      const v = this.jobVersion.get(jobNo) ?? 0;
      if (this.derivedVersion.get(jobNo) === v) return;
      byJob ??= this.blocksByJob();
      deriveJob({
        calendar: this.calendar,
        slots: this.deptByJob[jobNo],
        info: this.jobInfo[jobNo] || {},
        machining: this.machiningByJob[jobNo],
        blocks: byJob.get(jobNo) || [],
        live: this.liveForecastJobs.has(jobNo),
        today,
      });
      this.derivedVersion.set(jobNo, v);
    });
  }

  // Signed working-day gap between the job's promised end and its plan:
  // positive = the plan lands N workdays AFTER the hedef.
  private targetDeltaWd(
    target: string | null | undefined,
    forecast: string | null | undefined,
  ): number | null {
    if (!target || !forecast) return null;
    if (target === forecast) return 0;
    const [from, to] = forecast > target ? [target, forecast] : [forecast, target];
    let n = 0;
    let cur = from;
    for (let i = 0; i < 1000 && cur < to; i++) {
      const d = new Date(`${cur}T00:00:00`);
      d.setDate(d.getDate() + 1);
      cur = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!this.calendar.isNonWorkingDay(cur)) n += 1;
    }
    return forecast > target ? n : -n;
  }

  // When the LAST row of this group ends: the largest Bitiş the group prints,
  // upstream rows included (RM045-17's material lands after İmalat's plan).
  private jobPlanEndOf(jobNo: string): { date: string | null; source: string | null } {
    const info = this.jobInfo[jobNo] || {};
    const slots = this.deptByJob[jobNo] || {};
    let date: string | null = null;
    let source: string | null = null;
    const offer = (
      vm: { end_date?: string | null; projected_end_date?: string | null } | null | undefined,
      label: string,
    ) => {
      // What the row's own cell shows: its plan, else the borrowed projection.
      const end = vm && (vm.end_date || vm.projected_end_date);
      if (end && (!date || end > date)) {
        date = end;
        source = label;
      }
    };
    offer(info.material_supply, 'Malzeme Tedarik');
    (info.cutting || []).forEach((c) => offer(c, 'Kesim'));
    offer(slots.manufacturing, 'İmalat');
    (info.machining || []).forEach((m) => offer(m, 'Talaşlı İmalat'));
    offer(slots.welding, 'Kaynaklı İmalat');
    offer(slots.painting, 'Boya');
    offer(info.logistics, 'Lojistik');
    return { date, source };
  }

  // The ORDER's projected finish (the Öngörü column): the latest forecast of
  // İmalat and everything that trails it. A job being edited recomputes it from
  // the live VMs; others keep the server's. Never the upstream rows.
  private jobForecastOf(jobNo: string): {
    date: string | null;
    kind: string | null;
    source: string | null;
  } {
    const info = this.jobInfo[jobNo] || {};
    const jo = info.job_order || null;
    if (!this.liveForecastJobs.has(jobNo)) {
      return {
        date: jo?.forecast_date || null,
        kind: jo?.forecast_kind || null,
        source: jo?.forecast_source || null,
      };
    }
    const slots = this.deptByJob[jobNo] || {};
    let date: string | null = null;
    let kind: string | null = null;
    let source: string | null = null;
    const offer = (
      row: { forecast_date?: string | null; forecast_kind?: string | null } | null | undefined,
      label: string,
    ) => {
      const end = row?.forecast_date;
      if (end && (!date || end > date)) {
        date = end;
        kind = row?.forecast_kind || null;
        source = label;
      }
    };
    offer(slots.manufacturing, 'İmalat');
    offer(slots.welding, 'Kaynaklı İmalat');
    offer(slots.painting, 'Boya');
    offer(info.logistics, 'Lojistik');
    (info.machining || []).forEach((m) => offer(m, 'Talaşlı İmalat'));
    return { date, kind, source };
  }

  private blockStartShown(b: BlockVM): string | null {
    if (b.stages.some((s) => !s.deleted))
      return blockRollup(b, this.calendar, this.today()).windowStart;
    return b.subtask.start_date || b.subtask.projected_start_date || null;
  }

  // The start the sheet prints for a job on this resource: the earliest of its
  // block rows here, else the İmalat start.
  private sheetStartOf(res: ResourceVM, jobNo: string): string | null {
    const starts = res.blocks
      .filter((b) => !b.deleted && b.job_no === jobNo)
      .map((b) => this.blockStartShown(b));
    return earliestDate(starts) || this.deptOf(jobNo, 'manufacturing')?.start_date || null;
  }

  // Distinct job orders on a resource sheet, in display order: by iş emri
  // number, or by the earliest start this resource's blocks show.
  jobNosOf(res: ResourceVM): string[] {
    const seen: string[] = [];
    this.visibleBlocks(res).forEach((b) => {
      if (!seen.includes(b.job_no)) seen.push(b.job_no);
    });
    return seen.sort(compareJobsBy(this.sortMode, (jobNo) => this.sheetStartOf(res, jobNo)));
  }

  // ---- rows -------------------------------------------------------------------------

  // One row per task, flat, in tree order; the grid draws the hierarchy from
  // `indent` and hides a job's rows when it is collapsed:
  //
  //   293-03-07 · COOLED PANEL 4      the JOB ORDER: opened → promised, read-only
  //     Diğer departmanlar
  //       Malzeme Tedarik, Kesim      other departments
  //     İmalat                        manufacturing main task, editable
  //       Talaşlı İmalat
  //       Kaynaklı İmalat
  //         HARUN METAL BAKIR         a subcontractor/team assignment
  //           Montaj, Kaynak ve Taşlama
  //       Boya
  //     Lojistik
  private buildSheetRows(res: ResourceVM): SheetRow[] {
    const rows: SheetRow[] = [];
    const today = this.today();

    this.jobNosOf(res).forEach((jobNo) => {
      const blocks = res.blocks.filter((b) => !b.deleted && b.job_no === jobNo);
      const first = blocks[0];
      const info = this.jobInfo[jobNo] || {};
      const jo = info.job_order || null;
      // The job order's promised end rides on EVERY row of the group: the
      // gantt draws it as one continuous target line.
      const jobForecast = this.jobForecastOf(jobNo);
      const jobPlanEnd = this.jobPlanEndOf(jobNo);
      // Late = the PLAN overshoots the termin (user 2026-09-17).
      const jobLate = !!(jo?.end_date && jobPlanEnd.date && jobPlanEnd.date > jo.end_date);
      const base = {
        job_no: jobNo,
        groupKey: jobNo as string | null,
        job_target: jo ? (jo.end_date ?? null) : null,
        job_target_late: jobLate,
        job_target_delta_wd: this.targetDeltaWd(jo ? jo.end_date : null, jobPlanEnd.date),
        // Adet is the ORDER's; a kg slice works out its own share below.
        quantity: jo ? (jo.quantity ?? null) : null,
        job_quantity: jo ? (jo.quantity ?? null) : null,
        job_total_kg: jo ? (jo.total_weight_kg ?? null) : null,
      };

      rows.push({
        ...base,
        key: `${jobNo}-group`,
        kind: 'group',
        groupKey: null,
        indent: 0,
        collapsed: this.isJobCollapsed(jobNo),
        title: jobNo,
        job_order_title: jo?.title || first?.job_order_title || '',
        customer_name: first?.customer_name || '',
        block_count: blocks.length,
        bar_label: jobNo,
        weight_is_kg: true,
        // A group row on a SHEET is this resource's slice of the order.
        resource_kg: round2(blocks.reduce((sum, b) => sum + Number(b.allocated_weight_kg || 0), 0)),
        start_date: jo?.start_date ?? null,
        end_date: jo?.end_date ?? null,
        duration_wd: jo?.duration_wd ?? null,
        weight: jo?.total_weight_kg ?? null,
        ...groupQuantity(blocks, jo),
        progress: jo?.progress ?? 0,
        status: jo?.status || 'active',
        hold_kind: jo?.hold_kind || '',
        completed_at: jo?.completed_at || null,
        forecast_date: jobForecast.date,
        forecast_kind: jobForecast.kind,
        forecast_source: jobForecast.source,
        job_plan_end: jobPlanEnd.date,
        job_plan_end_source: jobPlanEnd.source,
        note: '',
      });

      const infoRow = (
        item: InfoTask,
        label: string,
        kind: 'info' | 'machining',
        indent: number,
      ): SheetRow =>
        withEngineDates<SheetRow>(
          {
            ...base,
            key: `${jobNo}-info-${item.task_id}`,
            kind,
            indent,
            title: label,
            start_date: item.start_date ?? null,
            end_date: item.end_date ?? null,
            duration_wd: item.duration_wd ?? null,
            weight: item.weight ?? null,
            progress: item.progress ?? null,
            status: item.status ?? null,
            start_is_actual: !!item.start_is_actual,
            end_is_actual: !!item.end_is_actual,
            duration_is_derived: !!item.duration_is_derived,
            duration_source: item.duration_source || null,
            date_source: item.date_source || null,
            operation_hours: item.operation_hours == null ? null : item.operation_hours,
            entered_duration_wd: item.entered_duration_wd == null ? null : item.entered_duration_wd,
            completed_at: item.completed_at || null,
            forecast_date: item.forecast_date || null,
            forecast_kind: item.forecast_kind || null,
            note: '',
          },
          item,
        );

      const deptRow = (slot: DeptSlot, label: string, indent: number): SheetRow | null => {
        const vm = this.deptOf(jobNo, slot);
        if (!vm) return null;
        // İmalat keeps its entered start (the single date input); its end and
        // every other dept row's window are projections.
        return withDerivedDates<SheetRow>(
          {
            ...base,
            key: `${jobNo}-${slot}`,
            kind: 'dept',
            slot,
            indent,
            title: label,
            bar_label: label,
            start_date: vm.start_date,
            end_date: vm.end_date,
            duration_wd: vm.duration_wd,
            weight: vm.weight,
            progress: vm.progress,
            status: vm.status,
            has_subtasks: vm.has_subtasks,
            start_is_actual: vm.start_is_actual,
            end_is_actual: vm.end_is_actual,
            duration_is_derived: vm.duration_is_derived,
            duration_source: vm.duration_source,
            entered_duration_wd: vm.entered_duration_wd,
            entered_start_date: vm.entered_start_date,
            completed_at: vm.completed_at,
            forecast_date: vm.forecast_date,
            forecast_kind: vm.forecast_kind,
            note: '',
          },
          vm,
          { keepStart: slot === 'manufacturing' },
        );
      };

      // Other departments first: material supply and cutting run before any
      // of this, so the group reads top-to-bottom as a sequence.
      const cuttingRows = info.cutting || [];
      const otherRows: SheetRow[] = [];
      if (info.material_supply)
        otherRows.push(infoRow(info.material_supply, 'Malzeme Tedarik', 'info', 2));
      // Kesim's start and duration are typed here; its end follows from the
      // two (user 2026-09-23).
      cuttingRows.forEach((c) => {
        const cut = infoRow(c, `Kesim${cuttingRows.length > 1 ? ` — ${c.title}` : ''}`, 'info', 2);
        cut.editable_schedule = true;
        cut.cutting_task_id = c.task_id;
        otherRows.push(cut);
      });
      if (otherRows.length) {
        rows.push({
          ...base,
          key: `${jobNo}-band-other`,
          kind: 'band',
          indent: 1,
          title: 'Diğer departmanlar',
          start_date: null,
          end_date: null,
          duration_wd: null,
          weight: null,
          progress: null,
          status: null,
          note: '',
        });
        rows.push(...otherRows);
      }

      const manufacturing = deptRow('manufacturing', 'İmalat', 1);
      if (manufacturing) rows.push(manufacturing);

      const machiningRows = info.machining || [];
      machiningRows.forEach((x) => {
        const row = infoRow(
          x,
          `Talaşlı İmalat${machiningRows.length > 1 ? ` — ${x.title}` : ''}`,
          'machining',
          2,
        );
        row.machining_task_id = x.task_id;
        const vm = this.machiningByTask[x.task_id];
        if (vm) row.weight = vm.weight;
        rows.push(row);
      });

      const welding = deptRow('welding', 'Kaynaklı İmalat', 2);
      if (welding) rows.push(welding);
      const weldingBlockStarts: string[] = [];

      blocks.forEach((b) => {
        const staged = b.stages.filter((s) => !s.deleted);
        const rollup = blockRollup(b, this.calendar, today);
        // What this assignment is worth in units; stages take the same number.
        const qty = quantityShare(b.allocated_weight_kg, jo?.quantity, jo?.total_weight_kg);
        const qtyFields = {
          quantity: qty ? qty.whole : null,
          quantity_is_share: !!qty,
          quantity_exact: qty ? qty.exact : null,
          quantity_kg: b.allocated_weight_kg,
        };
        // With stages, the assignment row is their rollup and reports only.
        // Without them, it IS the schedule and takes the edits directly.
        const blockRow = withDerivedDates<SheetRow>(
          {
            ...base,
            key: `${b.key}-block`,
            blockRef: b.key,
            kind: 'block',
            indent: 3,
            isNew: b.isNew,
            is_billed: b.is_billed,
            move_locked: isMoveLocked(b),
            has_stages: staged.length > 0,
            title: b.resource_name || 'Kaynak İşi',
            bar_label: b.resource_name || 'Kaynak İşi',
            start_date: staged.length ? rollup.windowStart : b.subtask.start_date,
            end_date: staged.length ? rollup.windowEnd : b.subtask.end_date,
            actual_start_date: b.subtask.actual_start_date ?? null,
            duration_wd: staged.length ? rollup.totalDays : b.subtask.duration_wd,
            duration_is_derived: staged.length
              ? rollup.totalDays != null
              : !!b.subtask.duration_is_derived,
            duration_source: staged.length
              ? rollup.totalDays != null
                ? 'children_span'
                : null
              : b.subtask.duration_source,
            entered_duration_wd: b.subtask.entered_duration_wd ?? null,
            weight: b.allocated_weight_kg,
            weight_is_kg: true,
            ...qtyFields,
            progress: staged.length ? rollup.progress : b.subtask.progress,
            status: staged.length ? rollup.derived : b.subtask.status,
            completed_at: staged.length ? null : b.subtask.completed_at,
            forecast_date: staged.length ? rollup.forecastDate : b.subtask.forecast_date,
            forecast_kind: staged.length ? rollup.forecastKind : b.subtask.forecast_kind,
            note: b.notes,
            ...this.capacityFields(b.key, jobNo),
          },
          b.subtask,
        );
        rows.push(blockRow);
        if (blockRow.start_date) weldingBlockStarts.push(blockRow.start_date);

        staged.forEach((s) =>
          rows.push(
            withDerivedDates<SheetRow>(
              {
                ...base,
                key: `${b.key}-stage-${s.cid}`,
                blockRef: b.key,
                kind: 'stage',
                indent: 4,
                stageCid: s.cid,
                title: s.title,
                is_default: s.is_default,
                start_date: s.start_date,
                end_date: s.end_date,
                duration_wd: s.duration_wd,
                duration_is_derived: !!s.duration_is_derived,
                duration_source: s.duration_source || null,
                entered_duration_wd: s.entered_duration_wd ?? null,
                weight: s.weight,
                ...qtyFields,
                progress: s.progress,
                status: s.status,
                completed_at: s.completed_at,
                forecast_date: s.forecast_date,
                forecast_kind: s.forecast_kind,
                note: s.note,
              },
              s,
            ),
          ),
        );
      });

      // Kaynaklı İmalat is a container: its start is where its blocks start
      // (user 2026-09-01, 009-37). A stored start still wins.
      if (welding && !welding.entered_start_date && weldingBlockStarts.length) {
        const earliest = weldingBlockStarts.reduce((a, b) => (a < b ? a : b));
        if (welding.start_date !== earliest) {
          welding.start_date = earliest;
          welding.start_date_source = 'engine';
          welding.start_is_actual = false;
          // An assignment pinned past this row's own end leaves the window
          // pointing backwards; the end is the stale half, so it goes.
          if (welding.end_date && welding.end_date < earliest) {
            welding.end_date = null;
            welding.end_date_source = null;
          }
        }
      }

      const painting = deptRow('painting', 'Boya', 2);
      if (painting) rows.push(painting);

      // Lojistik closes the order: it only reports, but it is what the
      // group's projection usually ends on.
      if (info.logistics) {
        const shipping = infoRow(info.logistics, 'Lojistik', 'info', 1);
        // The tail of the İmalat PLAN, not a forecast it is not (009-37).
        if (info.logistics.date_source === 'plan_tail') {
          shipping.start_date_source = 'plan_tail';
          shipping.end_date_source = 'plan_tail';
        }
        // Its LENGTH is the one decision on this row (user 2026-09-22).
        shipping.editable_duration = true;
        rows.push(shipping);
      }
    });

    return rows;
  }

  // The "Tümü" tab: every resource's jobs on one sheet, resource by resource,
  // then an "Atanmamış / Eksik Atanan" section: each row is the job's İmalat
  // department task, listed while any of its welding weight is unassigned.
  private buildAllRows(): SheetRow[] {
    const rows: SheetRow[] = [];
    const band = (key: string, title: string): SheetRow => ({
      key,
      kind: 'band',
      indent: 0,
      job_no: null,
      title,
      start_date: null,
      end_date: null,
      duration_wd: null,
      weight: null,
      progress: null,
      status: null,
      note: '',
    });
    this.resources.forEach((res) => {
      if (!this.visibleBlocks(res).length) return;
      const key = resourceKeyOf(res);
      rows.push(
        band(
          `all-head-${key}`,
          `${res.resource_type === 'team' ? 'Ekip' : 'Taşeron'} — ${res.display_name || res.name}`,
        ),
      );
      // A job can sit under two resources here: namespace the row keys.
      this.buildSheetRows(res).forEach((r) => rows.push({ ...r, key: `${key}::${r.key}` }));
    });

    const assigned = new Set<string>();
    this.resources.forEach((res) =>
      res.blocks.forEach((b) => {
        if (!b.deleted) assigned.add(b.job_no);
      }),
    );
    // kg held off the sheet is assigned all the same.
    this.weldingTasks.forEach((t) => {
      if (this.offSheetKg(t.welding_task_id) > 0) assigned.add(t.job_no);
    });
    // The pending section lists the İMALAT DEPARTMENT TASK (user decision
    // 2026-08-29): its start and duration edit the real task, its weight is
    // the job order's.
    const pending = this.weldingTasks
      .filter((t) => this.jobMatchesFilters(t.job_no))
      .map((t) => ({
        t,
        vm: this.deptOf(t.job_no, 'manufacturing'),
        remaining: this.remainingForTask(t.welding_task_id, t.total_weight_kg),
      }))
      .filter(({ t, vm, remaining }) => {
        if (!vm) return false;
        if (!assigned.has(t.job_no)) return true;
        return remaining != null && remaining > 0.05;
      })
      .sort((a, b) =>
        compareJobsBy(
          this.sortMode,
          (jobNo) => this.deptOf(jobNo, 'manufacturing')?.start_date || null,
        )(a.t.job_no, b.t.job_no),
      );
    if (pending.length) {
      rows.push(band('all-head-unassigned', `Atanmamış / Eksik Atanan — ${pending.length} iş`));
      pending.forEach(({ t, vm, remaining }) => {
        if (!vm) return;
        const jo = this.jobInfo[t.job_no]?.job_order || null;
        const partly = assigned.has(t.job_no);
        const noteParts: string[] = [];
        if (vm.status === 'skipped') noteParts.push('İmalat görevi atlandı');
        if (partly) {
          noteParts.push(
            `Atanan ${fmtKg(this.allocatedForTask(t.welding_task_id))} / ${fmtKg(t.total_weight_kg)} kg` +
              (remaining != null ? ` · Kalan ${fmtKg(remaining)} kg` : ''),
          );
        }
        const target = jo?.end_date || t.target_completion_date || null;
        rows.push(
          withDerivedDates<SheetRow>(
            {
              key: `all-unassigned-${t.welding_task_id}`,
              kind: 'dept',
              slot: 'manufacturing',
              unassignedRow: true,
              welding_task_id: t.welding_task_id,
              job_no: t.job_no,
              // No group row above these: never folded away.
              groupKey: null,
              indent: 1,
              title: t.job_order_title ? `${t.job_no} — ${t.job_order_title}` : String(t.job_no),
              bar_label: String(t.job_no),
              customer_name: t.customer_name || '',
              task_id: vm.task_id,
              start_date: vm.start_date,
              end_date: vm.end_date,
              duration_wd: vm.duration_wd,
              entered_duration_wd: vm.entered_duration_wd,
              duration_is_derived: vm.duration_is_derived,
              duration_source: vm.duration_source,
              start_is_actual: vm.start_is_actual,
              end_is_actual: vm.end_is_actual,
              has_subtasks: vm.has_subtasks,
              weight:
                t.total_weight_kg != null
                  ? Number(t.total_weight_kg)
                  : (jo?.total_weight_kg ?? null),
              weight_is_kg: true,
              quantity: jo ? (jo.quantity ?? null) : null,
              job_quantity: jo ? (jo.quantity ?? null) : null,
              job_total_kg: jo ? (jo.total_weight_kg ?? null) : null,
              allocated_kg:
                partly && t.total_weight_kg != null
                  ? round2(this.allocatedForTask(t.welding_task_id))
                  : null,
              progress: vm.progress,
              status: vm.status,
              completed_at: vm.completed_at,
              forecast_date: vm.forecast_date,
              forecast_kind: vm.forecast_kind,
              job_target: target,
              job_target_late: !!(jo?.end_date && vm.end_date && vm.end_date > jo.end_date),
              job_target_delta_wd: this.targetDeltaWd(target, vm.end_date),
              note: noteParts.join(' — '),
            },
            vm,
            // This IS an İmalat row: its start shows (and edits) as typed.
            { keepStart: true },
          ),
        );
      });
    }
    return rows;
  }

  // "Kaynak" view (user 2026-09-17): ONE FLAT ROW PER ASSIGNMENT, a team's
  // worklist. The rows stay `kind: 'block'` and keep their blockRef, so the
  // start date is still editable and every action resolves to the assignment.
  private weldingScopeRows(rows: SheetRow[]): SheetRow[] {
    const flat: SheetRow[] = [];
    const blocksByKey = new Map<string, BlockVM>();
    this.resources.forEach((res) => res.blocks.forEach((b) => blocksByKey.set(b.key, b)));
    rows.forEach((row) => {
      // Resource headers survive on the Tümü tab.
      if (row.kind === 'band' && String(row.key).startsWith('all-head-')) {
        flat.push({ ...row, indent: 0 });
        return;
      }
      if (row.kind !== 'block') return;
      const jo = (row.job_no && this.jobInfo[row.job_no]?.job_order) || null;
      const vm = row.blockRef ? blocksByKey.get(row.blockRef) : undefined;
      flat.push({
        ...row,
        customer_name: vm?.customer_name || '',
        indent: 0,
        groupKey: null,
        collapsed: false,
        flat_assignment: true,
        resource_name: row.title,
        job_order_title: row.job_order_title || jo?.title || '',
        title: String(row.job_no),
        bar_label: String(row.job_no),
        // The order's promised date rides along under the assignment's end.
        show_termin: true,
      });
    });
    // "Back to back" only reads in time order, so the Başlangıç sort applies
    // to the ASSIGNMENTS here, each resource's run on its own.
    if (this.sortMode !== 'start') return flat;
    const out: SheetRow[] = [];
    let run: SheetRow[] = [];
    const flush = () => {
      run.sort((a, b) => compareDates(a.start_date, b.start_date));
      out.push(...run);
      run = [];
    };
    flat.forEach((row) => {
      if (row.kind === 'band') {
        flush();
        out.push(row);
      } else run.push(row);
    });
    flush();
    return out;
  }

  /** The open sheet's rows; unchanged rows keep their previous object. */
  sheetRows(): SheetRow[] {
    if (this.rowsCache?.version === this.version) return this.rowsCache.rows;
    this.ensureDerived();
    const res = this.activeResource();
    const built =
      this.activeResourceKey === 'all' ? this.buildAllRows() : res ? this.buildSheetRows(res) : [];
    const fresh = this.viewScope === 'welding' ? this.weldingScopeRows(built) : built;
    const next = new Map<string, SheetRow>();
    const rows = fresh.map((row) => {
      const prev = this.prevRows.get(row.key);
      const kept = prev && sameRow(prev, row) ? prev : row;
      next.set(row.key, kept);
      return kept;
    });
    this.prevRows = next;
    this.rowsCache = { version: this.version, rows };
    return rows;
  }

  /** The job groups the grid folds (the Tümü tab materialises its inverse). */
  collapsedForGrid(): ReadonlySet<string> {
    if (this.collapsedCache?.version === this.version) return this.collapsedCache.set;
    let set: Set<string>;
    if (!this.onAllTab()) {
      set = new Set(this.collapsedJobs);
    } else {
      set = new Set();
      this.allSheetJobNos().forEach((jobNo) => {
        if (!this.expandedJobsAll.has(jobNo)) set.add(jobNo);
      });
    }
    this.collapsedCache = { version: this.version, set };
    return set;
  }

  // ---- inline editing ----------------------------------------------------------------

  /** A cell edit from the sheet. Throws (with the reason) to refuse it. */
  editCell(row: SheetRow, field: string, newValue: string): void {
    if (row.editable_schedule) {
      this.editCutting(row, field, newValue);
      return;
    }
    const block = row.blockRef ? this.findBlock(row.blockRef) : null;
    const jobNo = row.job_no || '';

    type Target = StageVM | DeptVM | BlockVM['subtask'] | InfoTask | MachiningVM;
    let target: Target | null | undefined = null;
    if (row.kind === 'stage') target = block?.stages.find((s) => s.cid === row.stageCid);
    else if (row.kind === 'machining' && row.machining_task_id != null)
      target = this.machiningByTask[row.machining_task_id];
    else if (row.kind === 'dept' && row.slot) target = this.deptOf(jobNo, row.slot);
    else if (row.kind === 'block') target = block?.subtask;
    else if (row.editable_duration) target = this.jobInfo[jobNo]?.logistics;
    if (!target) return;
    const t = target as Partial<StageVM & DeptVM & InfoTask> & {
      weight?: number | null;
      status?: string;
    };

    const markDirty = () => {
      if (row.kind === 'dept' && row.slot) this.markDeptDirty(jobNo, row.slot, field);
      else if (row.kind === 'machining' && row.machining_task_id != null)
        this.markMachiningDirty(row.machining_task_id, jobNo, field);
      else if (row.editable_duration) this.markLogisticsDirty(jobNo, field);
      else if (block) this.markBlockDirty(block.key);
    };

    if (field === 'title') {
      if (row.kind !== 'stage' || row.is_default)
        throw new Error('Yalnızca özel aşamaların adı değiştirilebilir.');
      const title = String(newValue || '').trim();
      if (!title) throw new Error('Aşama adı boş olamaz.');
      t.title = title;
    } else if (field === 'weight') {
      if (!['stage', 'dept', 'machining'].includes(row.kind))
        throw new Error('Bu satırda ağırlık düzenlenemez.');
      const weight = parseInt(newValue, 10);
      if (!Number.isFinite(weight) || weight < 1)
        throw new Error('Ağırlık 1 veya daha büyük bir tam sayı olmalıdır.');
      t.weight = weight;
    } else if (field === 'progress') {
      if (row.kind === 'dept' && row.has_subtasks)
        throw new Error(`${row.title} ilerlemesi alt görevlerinden hesaplanır.`);
      const progress = Number(newValue);
      if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
        throw new Error('İlerleme 0 ile 100 arasında olmalıdır.');
      }
      t.progress = progress;
      // Entering progress is itself the signal that the row has started.
      if (progress > 0 && ['pending', 'blocked'].includes(t.status ?? '')) t.status = 'in_progress';
    } else if (field === 'status') {
      const status = String(newValue);
      if (!STATUS_META[status]) throw new Error('Geçersiz durum.');
      t.status = status;
      if (status === 'completed') {
        t.progress = 100;
        // Completing is itself a progress write (100): without marking it,
        // bulk-save would persist "completed" with the old percent.
        if (row.kind === 'dept' && row.slot) this.markDeptDirty(jobNo, row.slot, 'progress');
      }
    } else if (field === 'note') {
      if (row.kind === 'stage') t.note = String(newValue || '');
      else if (row.kind === 'block' && block) block.notes = String(newValue || '');
      else throw new Error('Bu satırda not düzenlenemez.');
    } else if (field === 'duration_wd' && row.kind === 'block') {
      // One team's span inside the job, on the assignment's own estimate;
      // cleared, the row goes back to spanning its parent's window.
      const raw = String(newValue ?? '').trim();
      const num = raw === '' ? null : Number(raw);
      if (num != null && (!Number.isFinite(num) || num <= 0))
        throw new Error('Süre 0’dan büyük olmalıdır.');
      t.entered_duration_wd = num;
      t.duration_wd = num;
      t.duration_is_derived = num == null;
      t.duration_source = num == null ? 'weight_share' : null;
      if (block) this.markBlockDirty(block.key);
      this.changed();
      return;
    } else if (field === 'duration_wd') {
      // The İmalat row (or Lojistik's own length). Duration is PURE SIZING: it
      // never moves a date, and the cascade redistributes every child slice.
      const raw = String(newValue ?? '').trim();
      const num = raw === '' ? null : Number(raw);
      if (num != null && (!Number.isFinite(num) || num < 0))
        throw new Error('Süre 0 veya daha büyük olmalıdır.');
      t.duration_wd = num;
      t.entered_duration_wd = num;
      t.duration_is_derived = false;
      t.duration_source = null;
      // Mirror of the server-side purge: asserting the İmalat number re-bases
      // the WHOLE subtree on it, stray child entries included. Shipping sits
      // beside İmalat, not under it, so its number re-bases nothing.
      if (num != null && !row.editable_duration) {
        const clearEntry = (
          vm: {
            entered_duration_wd?: number | null;
            duration_is_derived?: boolean;
            duration_source?: string | null;
          } | null,
        ) => {
          if (!vm) return;
          vm.entered_duration_wd = null;
          vm.duration_is_derived = true;
          vm.duration_source = 'weight_share';
        };
        clearEntry(this.deptOf(jobNo, 'welding'));
        clearEntry(this.deptOf(jobNo, 'painting'));
        this.resources.forEach((res) =>
          res.blocks.forEach((b) => {
            if (b.job_no !== jobNo || b.deleted) return;
            // An assignment's OWN span survives: the server's purge spares it.
            if (b.subtask.entered_duration_wd == null) clearEntry(b.subtask);
            b.stages.forEach((s) => {
              if (!s.deleted) clearEntry(s);
            });
          }),
        );
      }
    } else if (field === 'start_date' && row.kind === 'block') {
      // An assignment's own start, on `actual_start_date` (the one date below
      // İmalat the purge spares). A past date is when it began, a future one
      // when it WILL begin; both move the plan (user 2026-09-16).
      const entered = newValue || null;
      const st = target as BlockVM['subtask'];
      st.actual_start_date = entered;
      // Clearing hands the block BACK to the weight split (user 2026-09-17).
      st.start_date = entered;
      if (block) this.markBlockDirty(block.key);
      this.changed();
      return;
    } else if (field === 'start_date' || field === 'end_date') {
      // Dates are PURE SCHEDULING: they never derive a duration.
      const start = field === 'start_date' ? newValue || null : t.start_date || null;
      let end = field === 'end_date' ? newValue || null : t.end_date || null;
      // The İmalat START is the sheet's only date input and every end shown is
      // a PROJECTION re-derived from it, so a stale end does not block a
      // later start; it is dropped (the server nulls it the same way). A
      // typed end is a statement and keeps the refusal.
      if (start && end && end < start) {
        if (field === 'start_date') end = null;
        else throw new Error('Bitiş tarihi başlangıç tarihinden önce olamaz.');
      }
      const dept = t as Partial<DeptVM>;
      if (row.kind === 'dept' && row.slot !== 'painting') {
        dept.start_from_children = false;
        dept.end_from_children = false;
      }
      t.start_date = start;
      t.end_date = end;
      t.start_is_actual = false;
      t.end_is_actual = false;
      t.date_source = null;
      if (row.kind === 'dept') {
        dept.entered_start_date = start;
        // İmalat's end is its start's span, not an entry.
        dept.entered_end_date = row.slot === 'manufacturing' && field === 'start_date' ? null : end;
      }
      // Scheduling a cancelled default stage brings it back.
      if (row.kind === 'stage' && t.status === 'cancelled' && start) t.status = 'pending';
    } else {
      return;
    }

    markDirty();
    // Any edit that can move a projection switches the job to live client
    // projections until the next save/reload brings server truth.
    if (['duration_wd', 'progress', 'start_date', 'status', 'weight'].includes(field) && jobNo) {
      this.liveForecastJobs.add(jobNo);
      this.touch(jobNo);
    }
    this.changed();
  }

  // Kesim: a typed start and duration, and an end that is always span_end of
  // the two; the server computes the same and clears the end when either
  // input is cleared.
  private editCutting(row: SheetRow, field: string, newValue: string): void {
    const jobNo = row.job_no || '';
    const vm = this.cuttingOf(jobNo, row.cutting_task_id);
    if (!vm) return;
    if (field === 'start_date') {
      vm.start_date = newValue || null;
      vm.entered_start_date = vm.start_date;
      vm.start_is_actual = false;
    } else if (field === 'duration_wd') {
      const raw = String(newValue ?? '').trim();
      const num = raw === '' ? null : Number(raw);
      if (num != null && (!Number.isFinite(num) || num <= 0))
        throw new Error('Süre 0’dan büyük olmalıdır.');
      vm.duration_wd = num;
      vm.entered_duration_wd = num;
      vm.duration_is_derived = false;
      vm.duration_source = null;
      // A duration typed under a start the row is only SHOWING adopts it,
      // otherwise the date the planner was looking at would vanish.
      if (num != null && !vm.entered_start_date && row.start_date) {
        vm.entered_start_date = row.start_date;
        vm.start_date = row.start_date;
        vm.start_is_actual = false;
        this.markCuttingDirty(vm.task_id, jobNo, 'start_date');
      }
    } else {
      return;
    }
    const start = vm.entered_start_date ?? null;
    const days = vm.entered_duration_wd ?? null;
    vm.end_date = start && days ? this.calendar.spanEnd(start, days) : null;
    vm.end_is_actual = false;
    vm.date_source = null;
    // The engine's window must not leak back into a cell the planner planned.
    vm.projected_start_date = null;
    vm.projected_end_date = null;
    this.markCuttingDirty(vm.task_id, jobNo, field);
    this.changed();
  }

  // ---- block-level actions --------------------------------------------------------------

  createStages(blockRef: string): void {
    const block = this.findBlock(blockRef);
    if (!block) return;
    const existing = new Set(block.stages.filter((s) => !s.deleted).map((s) => s.title));
    defaultStagesFrom(block.subtask, () => `new-${++this.newCounter}`)
      .filter((s) => !existing.has(s.title))
      .forEach((s) => block.stages.push(s));
    // Stages travel in the payload; create_default_stages would insert them again.
    block.createDefaultStages = false;
    this.revealJob(block.job_no);
    this.markBlockDirty(block.key);
    this.changed();
  }

  /** Returns the refusal, or null once the stage is added. */
  addCustomStage(blockRef: string, titleInput: string, weightInput: unknown): string | null {
    const block = this.findBlock(blockRef);
    if (!block) return null;
    const title = String(titleInput || '').trim();
    if (!title) return 'Aşama adı zorunludur.';
    if (block.stages.some((s) => !s.deleted && s.title === title))
      return 'Bu adla bir aşama zaten var.';
    block.stages.push({
      cid: `new-${++this.newCounter}`,
      id: null,
      title,
      is_default: false,
      weight: Math.max(1, parseInt(String(weightInput), 10) || 10),
      status: 'pending',
      progress: 0,
      duration_wd: null,
      start_date: null,
      end_date: null,
      note: '',
      deleted: false,
    });
    this.revealJob(block.job_no);
    this.markBlockDirty(block.key);
    this.changed();
    return null;
  }

  stageOf(row: SheetRow): StageVM | null {
    return this.findBlock(row.blockRef)?.stages.find((s) => s.cid === row.stageCid) || null;
  }

  deleteStage(row: SheetRow, stage: StageVM): void {
    const liveBlock = this.findBlock(row.blockRef);
    if (!liveBlock) return;
    // The confirm was open while a save may have re-identified the stage.
    const liveStage =
      liveBlock.stages.find((s) => s.cid === stage.cid) ||
      (stage.id != null ? liveBlock.stages.find((s) => s.id === stage.id) : null) ||
      stage;
    if (shouldDiscardNewStageLocally(liveStage, this.inflightNewStageCids)) {
      liveBlock.stages = liveBlock.stages.filter((s) => s.cid !== liveStage.cid);
    } else {
      liveStage.deleted = true;
    }
    this.markBlockDirty(liveBlock.key);
    this.changed();
  }

  private resourceOfBlock(
    block: Pick<BlockVM, 'resource_type' | 'resource_id'> | null,
  ): ResourceVM | null {
    if (!block) return null;
    return (
      this.resources.find(
        (r) =>
          r.resource_type === block.resource_type && Number(r.id) === Number(block.resource_id),
      ) || null
    );
  }

  private resolveBlockForDelete(stale: BlockVM): BlockVM | null {
    const byKey = this.findBlock(stale.key);
    if (byKey) return byKey;
    if (stale.assignment_id != null) {
      const hydrated = this.findBlock(`${stale.assignment_type}-${stale.assignment_id}`);
      if (hydrated) return hydrated;
    }
    const res = this.resourceOfBlock(stale);
    if (!res) return null;
    const matches = res.blocks.filter(
      (b) =>
        !b.deleted &&
        Number(b.welding_task_id) === Number(stale.welding_task_id) &&
        Number(b.allocated_weight_kg) === Number(stale.allocated_weight_kg),
    );
    return matches.length === 1 ? (matches[0] ?? null) : null;
  }

  private queueDeletedBlock(block: BlockVM, res: ResourceVM | null): void {
    this.deletedBlocks = enqueueDeletedAssignment(
      this.deletedBlocks,
      block,
      res ? resourceKeyOf(res) : this.activeResourceKey,
    );
  }

  /** After the planner confirmed: `block` is the object the dialog opened on. */
  deleteBlock(block: BlockVM): void {
    // Hydrate may have replaced this object (new-N → type-id) while the
    // confirm dialog was open.
    const live = this.resolveBlockForDelete(block) || block;
    const res = this.resourceOfBlock(live);
    if (shouldDiscardNewBlockLocally(live, this.inflightNewKeys)) {
      if (res) res.blocks = res.blocks.filter((b) => b.key !== live.key);
      this.dirtyBlocks.delete(live.key);
    } else {
      live.deleted = true;
      this.dirtyBlocks.delete(live.key);
      this.queueDeletedBlock(live, res);
    }
    this.bumpMutation();
    // The deleted block's window no longer counts: recompute live.
    const jobNo = live.job_no || block.job_no;
    this.liveForecastJobs.add(jobNo);
    this.touch(jobNo);
    this.changed({ structure: true });
  }

  applyWeight(blockRef: string, weight: number, notes: string | undefined): void {
    const block = this.findBlock(blockRef);
    if (!block) return;
    block.allocated_weight_kg = weight;
    if (notes !== undefined) block.notes = notes || '';
    this.markBlockDirty(block.key);
    this.changed();
  }

  // Working copy only: the server applies the move on Kaydet.
  applyMove(block: BlockVM, res: ResourceVM, tierId: number | null): void {
    const from = this.resources.find(
      (r) => r.resource_type === block.resource_type && r.id === block.resource_id,
    );
    if (from) from.blocks = from.blocks.filter((b) => b.key !== block.key);
    block.resource_type = res.resource_type;
    block.resource_id = res.id;
    block.moveTo = {
      resource_type: res.resource_type,
      resource_id: res.id,
      ...(tierId ? { price_tier: tierId } : {}),
    };
    res.blocks.push(block);
    this.markBlockDirty(block.key);
    this.revealJob(block.job_no);
    this.changed({ structure: true });
    this.opts.notify.info(`${block.job_no} → ${res.display_name || res.name} (kaydedilmedi)`);
  }

  pushNewBlock(draft: {
    resource: ResourceVM;
    welding_task: WeldingTask;
    allocated_weight_kg: number;
    notes: string;
    price_tier: number | null;
  }): void {
    const res = draft.resource;
    const key = `new-${++this.newCounter}`;
    const block: BlockVM = {
      key,
      isNew: true,
      assignment_type: res.resource_type === 'team' ? 'internal_team' : 'subcontracting',
      assignment_id: null,
      subtask_id: null,
      welding_task_id: draft.welding_task.welding_task_id,
      job_no: draft.welding_task.job_no,
      job_order_title: draft.welding_task.job_order_title || '',
      customer_name: draft.welding_task.customer_name || '',
      allocated_weight_kg: draft.allocated_weight_kg,
      is_billed: false,
      has_statement_line: false,
      price_tier: draft.price_tier ? { id: draft.price_tier } : null,
      notes: draft.notes,
      subtask: {
        status: 'in_progress',
        progress: 0,
        start_date: null,
        end_date: null,
        duration_wd: null,
        actual_start_date: null,
      },
      // NO auto-stages (user decision 2026-08-29): a new assignment is ONE
      // task; the default pair is added on demand.
      stages: [],
      createDefaultStages: false,
      deleted: false,
      resource_type: res.resource_type,
      resource_id: res.id,
    };
    res.blocks.push(block);
    this.revealJob(block.job_no);
    this.markBlockDirty(key);
    // Adding a job the active filters hide would look like the add failed.
    const hidden = !this.jobMatchesFilters(block.job_no);
    if (hidden) {
      this.filterJobNos = [];
      this.filterAssignee = '';
      this.filterText = '';
      this.filterResetCount += 1;
    }
    this.changed({ structure: true });
    this.opts.notify.info(
      hidden
        ? 'Blok eklendi — filtre dışında kaldığı için filtreler temizlendi.'
        : 'Blok eklendi — Kaydet ile kalıcılaşır.',
    );
  }

  // Only jobs with capacity left are offerable. Each option carries what the
  // decision needs: how big the job is, how much is out, and who has it.
  weldingTaskOptions(): WeldingTaskOption[] {
    return this.weldingTasks
      .filter((t) => t.total_weight_kg != null)
      .map((t) => ({
        task: t,
        remaining: this.remainingForTask(t.welding_task_id, t.total_weight_kg) ?? 0,
      }))
      .filter(({ remaining }) => remaining > 0)
      .sort((a, b) => String(a.task.job_no).localeCompare(String(b.task.job_no), 'tr'))
      .map(({ task, remaining }) => ({
        value: String(task.welding_task_id),
        task,
        total: Number(task.total_weight_kg),
        assigned: this.allocatedForTask(task.welding_task_id),
        remaining,
        holders: this.holdersForTask(task.welding_task_id),
      }));
  }

  // ---- save -----------------------------------------------------------------------------

  private buildPayload(): BulkSavePayload {
    const payload: BulkSavePayload = {
      new_blocks: [],
      blocks: [],
      deleted_blocks: [],
      department_tasks: [],
    };
    // No duration_wd and no dates on a stage: its size is its weight-share
    // slice and the SERVER materializes its dates at save time.
    const stagePayload = (s: StageVM) => {
      const item: Record<string, unknown> = {
        title: s.title,
        weight: s.weight,
        status: s.status,
        progress: s.progress,
        note: s.note || '',
      };
      if (s.id != null) item.id = s.id;
      return item;
    };

    this.deletedBlocks.forEach((d) =>
      payload.deleted_blocks.push({
        assignment_type: d.assignment_type,
        assignment_id: d.assignment_id,
      }),
    );

    this.resources.forEach((res) =>
      res.blocks.forEach((b) => {
        if (b.deleted) return;
        if (shouldPostNewBlock(b)) {
          payload.new_blocks.push({
            resource_type: res.resource_type,
            resource_id: res.id,
            welding_task_id: b.welding_task_id,
            allocated_weight_kg: b.allocated_weight_kg,
            ...(b.price_tier ? { price_tier: b.price_tier.id } : {}),
            notes: b.notes || '',
            stages: b.stages.filter((s) => !s.deleted).map(stagePayload),
          });
          return;
        }
        // Created on the last save but the refresh has not given us an
        // assignment_id yet: posting again would duplicate the row.
        if (b.isNew) return;
        if (!this.dirtyBlocks.has(b.key)) return;

        const snap = this.snapBlocks.get(b.key);
        const item: BulkSaveBlock = {
          assignment_type: b.assignment_type,
          assignment_id: b.assignment_id,
        };
        // "Atamayı değiştir": the server re-homes the block with its subtask.
        if (b.moveTo) item.move_to = b.moveTo;
        if (Number(snap?.allocated_weight_kg) !== Number(b.allocated_weight_kg))
          item.allocated_weight_kg = b.allocated_weight_kg;
        if ((snap?.notes || '') !== (b.notes || '')) item.notes = b.notes || '';
        if (b.createDefaultStages) item.create_default_stages = true;

        const hasStages = b.stages.some((s) => !s.deleted);
        const stageItems: Record<string, unknown>[] = [];
        b.stages.forEach((s) => {
          if (s.deleted) {
            if (s.id != null) stageItems.push({ id: s.id, deleted: true });
            return;
          }
          stageItems.push(stagePayload(s));
        });
        if (stageItems.length) item.stages = stageItems;

        const schedule = blockSchedulePatch(snap?.subtask, b.subtask, hasStages);
        if (schedule) item.subtask_schedule = schedule;
        payload.blocks.push(item);
      }),
    );

    this.dirtyDept.forEach((fields, key) => {
      const [jobNo, slot] = key.split('|') as [string, DeptSlot];
      const vm = this.deptOf(jobNo, slot);
      if (!vm) return;
      const item: Record<string, unknown> = {
        task_id: vm.task_id,
        status: vm.status,
        ...deptSchedulePatch(slot, fields, vm),
      };
      // Leaf dept progress is omitted unless edited, except completed, which
      // always means 100.
      if (!vm.has_subtasks && (fields.has('progress') || vm.status === 'completed'))
        item.progress = vm.progress;
      if (fields.has('weight') && vm.weight != null) item.weight = vm.weight;
      payload.department_tasks.push(item);
    });

    // Talaşlı İmalat travels the same channel, but only ever its weight.
    payload.department_tasks.push(
      ...machiningWeightItems(this.dirtyMachining, this.machiningByTask),
    );

    // Lojistik too, and only ever its duration.
    this.dirtyLogistics.forEach((fields, jobNo) => {
      const vm = this.jobInfo[jobNo]?.logistics;
      if (!vm || !fields.has('duration_wd')) return;
      payload.department_tasks.push({
        task_id: vm.task_id,
        duration_wd: vm.entered_duration_wd ?? null,
      });
    });

    // Kesim: start and/or duration; the server computes the end.
    this.dirtyCutting.forEach((fields, taskId) => {
      let vm: InfoTask | null = null;
      Object.keys(this.jobInfo).some((j) => (vm = this.cuttingOf(j, taskId)));
      const cut = vm as InfoTask | null;
      if (!cut) return;
      const item: Record<string, unknown> = { task_id: taskId };
      if (fields.has('start_date')) item.start_date = cut.entered_start_date ?? null;
      if (fields.has('duration_wd')) item.duration_wd = cut.entered_duration_wd ?? null;
      payload.department_tasks.push(item);
    });

    return payload;
  }

  private findStageByCid(cid: string): StageVM | null {
    for (const res of this.resources) {
      for (const b of res.blocks) {
        const stage = b.stages.find((s) => s.cid === cid);
        if (stage) return stage;
      }
    }
    return null;
  }

  // Neutralize one-shot creates/moves/deletes so a second save (or a skipped
  // hydrate) cannot recreate them.
  private finalizeSavedStructuralOps(
    payload: BulkSavePayload,
    sentNewKeys: string[],
    sentNewStageCids: string[],
  ): void {
    sentNewKeys.forEach((key) => {
      const b = this.findBlock(key);
      if (!b) return;
      b.createdOnServer = true;
      b.createDefaultStages = false;
      delete b.moveTo;
    });
    const sentMoves = sentMoveToByAssignment(payload.blocks);
    sentNewStageCids.forEach((cid) => {
      const stage = this.findStageByCid(cid);
      if (stage) stage.createdOnServer = true;
    });
    const sentBlockIds = new Set(
      payload.blocks.map((b) => assignmentKey(b.assignment_type, b.assignment_id)),
    );
    this.resources.forEach((res) =>
      res.blocks.forEach((b) => {
        if (b.isNew || b.assignment_id == null) return;
        const key = assignmentKey(b.assignment_type, b.assignment_id);
        if (!sentBlockIds.has(key)) return;
        b.createDefaultStages = false;
        // Only drop a move this payload actually sent.
        if (shouldClearMoveTo(sentMoves.get(key), b.moveTo)) delete b.moveTo;
      }),
    );
    this.deletedBlocks = leftoverDeleted(this.deletedBlocks, payload.deleted_blocks);
  }

  private discardUnsentDeletedCreates(): void {
    this.resources.forEach((res) => {
      res.blocks = res.blocks.filter(
        (b) => !(b.deleted && b.isNew && b.assignment_id == null && !b.createdOnServer),
      );
    });
  }

  private discardUnsentDeletedStages(): void {
    this.resources.forEach((res) =>
      res.blocks.forEach((b) => {
        b.stages = b.stages.filter((s) => !(s.deleted && s.id == null && !s.createdOnServer));
      }),
    );
  }

  private flushPendingDeletedCreates(): void {
    this.resources.forEach((res) =>
      res.blocks.forEach((b) => {
        if (b.deleted) this.queueDeletedBlock(b, res);
      }),
    );
  }

  private adoptIdentitiesForDeletedCreates(
    board: PlanningBoard | undefined,
    knownIds: Set<string>,
    sentNewKeys: string[],
  ): void {
    if (!board) return;
    const created = createdBlocksFromBoard(board, knownIds);
    const clients = sentNewKeys
      .map((key) => this.findBlock(key))
      .filter((b): b is BlockVM => !!b && b.deleted);
    adoptDeletedCreateIdentities(clients, created, new Set());
    this.flushPendingDeletedCreates();
  }

  private adoptDeletedStageIdentities(board: PlanningBoard | undefined): void {
    if (!board) return;
    this.resources.forEach((res) =>
      res.blocks.forEach((b) => {
        if (b.assignment_id == null) return;
        const serverBlock = findBoardBlock(board, b.assignment_type, b.assignment_id);
        if (serverBlock) adoptDeletedStageIds(b.stages, serverBlock.stages);
      }),
    );
  }

  private adoptCreatedBlockIdentities(
    board: PlanningBoard,
    knownIds: Set<string>,
    sentNewKeys: string[],
  ): void {
    const created = createdBlocksFromBoard(board, knownIds);
    const used = new Set<string>();
    sentNewKeys.forEach((key) => {
      const client = this.findBlock(key);
      if (!client || !client.isNew || client.deleted) return;
      const idx = matchCreatedBlock(client, created, used);
      const matched = created[idx];
      if (idx < 0 || !matched) return;
      used.add(assignmentKey(matched.block.assignment_type, matched.block.assignment_id));
      client.isNew = false;
      client.createdOnServer = false;
      client.assignment_type = matched.block.assignment_type;
      client.assignment_id = matched.block.assignment_id;
      client.subtask_id = matched.block.subtask_id;
      client.createDefaultStages = false;
      delete client.moveTo;
      adoptStageIds(client.stages, matched.block.stages);
      this.snapBlocks.set(client.key, adoptedBlockSnap(matched.block));
    });
  }

  private stitchIdentitiesAfterSkippedHydrate(
    board: PlanningBoard | undefined,
    knownIds: Set<string>,
    sentNewKeys: string[],
  ): void {
    if (!board) return;
    this.adoptCreatedBlockIdentities(board, knownIds, sentNewKeys);
    this.adoptDeletedStageIdentities(board);
  }

  /** Kaydet. Resolves once the save (not the background rebuild) is done. */
  async save(): Promise<void> {
    if (this.saveInFlight) return;
    if (!this.hasUnsavedChanges()) {
      this.opts.notify.info('Kaydedilecek değişiklik yok.');
      return;
    }
    this.saveInFlight = true;
    this.changed();
    const payload = this.buildPayload();
    const clockAtSend = this.mutationClock;
    const knownIds = knownAssignmentKeys(this.resources);
    const sentNewKeys: string[] = [];
    const sentNewStageCids: string[] = [];
    this.resources.forEach((res) =>
      res.blocks.forEach((b) => {
        if (b.deleted) return;
        if (shouldPostNewBlock(b)) {
          sentNewKeys.push(b.key);
          sentNewStageCids.push(...newStageCidsFromBlock(b));
        } else if (!b.isNew && this.dirtyBlocks.has(b.key)) {
          sentNewStageCids.push(...newStageCidsFromBlock(b));
        }
      }),
    );
    this.inflightNewKeys = new Set(sentNewKeys);
    this.inflightNewStageCids = new Set(sentNewStageCids);
    let rebuild = false;
    try {
      const resp = await this.opts.api.bulkSave(payload);
      this.opts.notify.success('Plan kaydedildi.');
      // The capacity marks described the plan before this save.
      this.clearCapacityDecorations();
      // What the save changed on its own must not go unseen.
      (resp?.messages || []).forEach((m) => this.opts.notify.info(m));
      // Cell-level dirty stays until hydrate so an edit typed during this
      // request is not dropped.
      this.finalizeSavedStructuralOps(payload, sentNewKeys, sentNewStageCids);
      const board = resp?.board;
      if (shouldHydrateAfterSave(clockAtSend, this.mutationClock)) {
        // Fully committed and nobody typed during the request.
        this.dirtyBlocks = new Set();
        this.dirtyDept = new Map();
        this.dirtyMachining = new Map();
        this.dirtyLogistics = new Map();
        this.dirtyCutting = new Map();
        if (board) {
          this.hydrate(board);
          return;
        }
      } else if (board) {
        // Hydrate skipped: stitch stage ids NOW so a second Kaydet before the
        // background refresh cannot duplicate Montaj / custom stages.
        adoptExistingBlockStageIds(this.resources, board);
      }
      // A delete during this request skipped hydrate; stitch ids from the
      // response so Kaydet can send deleted_blocks without waiting.
      this.adoptIdentitiesForDeletedCreates(board, knownIds, sentNewKeys);
      this.stitchIdentitiesAfterSkippedHydrate(board, knownIds, sentNewKeys);
      rebuild = true;
    } catch (e) {
      this.discardUnsentDeletedCreates();
      this.discardUnsentDeletedStages();
      this.opts.notify.error(e);
    } finally {
      this.inflightNewKeys = new Set();
      this.inflightNewStageCids = new Set();
      this.saveInFlight = false;
      // Identities and structure may have moved under any job.
      this.resources.forEach((res) => res.blocks.forEach((b) => this.touch(b.job_no)));
      this.changed({ structure: true });
    }
    if (rebuild) void this.refreshBoardInBackground(clockAtSend, knownIds, sentNewKeys);
  }

  private async refreshBoardInBackground(
    clockAtSend: number,
    knownIds: Set<string>,
    sentNewKeys: string[],
  ): Promise<void> {
    try {
      const data = await this.opts.api.fetchBoard(this.showCompleted);
      if (shouldHydrateAfterSave(clockAtSend, this.mutationClock)) {
        this.hydrate(data);
        this.opts.onBoardLoaded?.();
        return;
      }
      this.opts.onBoardLoaded?.();
      // Planner typed during the rebuild: keep the working copy, but stitch
      // server identities onto the blocks this save created.
      this.adoptCreatedBlockIdentities(data, knownIds, sentNewKeys);
      this.adoptIdentitiesForDeletedCreates(data, knownIds, sentNewKeys);
      adoptExistingBlockStageIds(this.resources, data);
      this.adoptDeletedStageIdentities(data);
      this.resources.forEach((res) => res.blocks.forEach((b) => this.touch(b.job_no)));
      this.changed();
    } catch (e) {
      console.error('Board refresh failed:', e);
      this.opts.notify.error(
        new Error("Tablo arka planda güncellenemedi — gerekirse Yenile'ye basın."),
      );
    }
  }
}

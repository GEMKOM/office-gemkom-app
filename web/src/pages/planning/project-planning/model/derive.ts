// The live client cascades: what the sheet shows for a job between an edit and
// Kaydet. Ported from planning.js's rederive* passes, which ran over EVERY job
// on every render; here they run per job, and the store re-runs a job only
// when something on it changed (see PlanningStore.ensureDerived). Each pass
// reads and writes that one job's view models and nothing else, so running
// them job by job is the same arithmetic in the same order.

import type { WorkdayCalendar } from '@/lib/workdays';
import { canRederiveForecast, forecastRemainingWd } from './forecastLayout';
import { imalatPlanStart, imalatStageFractions, shippingAnchor } from './imalatPlan';
import type { MachiningVM } from './machiningWeight';
import type {
  BlockVM,
  DeptSlot,
  DeptVM,
  InfoTask,
  JobInfo,
  ScheduleFields,
  StageVM,
} from './types';

export interface JobContext {
  calendar: WorkdayCalendar;
  slots: Partial<Record<DeptSlot, DeptVM | null>> | undefined;
  info: JobInfo;
  /** The job's first Talaşlı İmalat (the İmalat share). */
  machining: MachiningVM | undefined;
  /** The job's live (not deleted) blocks across every resource. */
  blocks: BlockVM[];
  /** Edited this session: the client owns the job's projections. */
  live: boolean;
  today: string;
}

type Sched = Partial<ScheduleFields> & {
  progress?: number | null;
  weight?: number | null;
  status?: string;
};

const isoOf = (p: Date) =>
  `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}-${String(p.getDate()).padStart(2, '0')}`;

const later = (a: string | null | undefined, b: string | null | undefined): string | null =>
  a && b ? (a > b ? a : b) : a || b || null;

// ---- block rollups (shared with the row builders) ---------------------------

// This block's OWN progress: its stages rolled up by weight, or the assignment
// row itself when it has none. Never the job order's overall progress.
export function blockProgress(b: BlockVM): number {
  if (b.subtask.status === 'completed' || b.subtask.status === 'skipped') return 100;
  const active = b.stages.filter((s) => !s.deleted && !['skipped', 'cancelled'].includes(s.status));
  if (active.length) {
    const totalW = active.reduce((s, x) => s + Number(x.weight || 0), 0);
    if (totalW <= 0) return 0;
    const leaf = (s: StageVM) =>
      s.status === 'completed'
        ? 100
        : ['pending', 'blocked', 'cancelled'].includes(s.status)
          ? 0
          : Math.min(Number(s.progress || 0), 99);
    return Math.min(
      active.reduce((sum, s) => sum + leaf(s) * Number(s.weight || 0), 0) / totalW,
      99,
    );
  }
  return b.subtask.status === 'completed' ? 100 : Math.min(Number(b.subtask.progress || 0), 99);
}

export interface BlockRollup {
  progress: number;
  windowStart: string | null;
  windowEnd: string | null;
  totalDays: number | null;
  derived: string;
  overdue: boolean;
  forecastDate: string | null;
  forecastKind: string | null;
}

// Client mirror of the backend rollup for the block header.
export function blockRollup(b: BlockVM, calendar: WorkdayCalendar, today: string): BlockRollup {
  const active = b.stages.filter((s) => !s.deleted && !['skipped', 'cancelled'].includes(s.status));
  const progress = blockProgress(b);
  const hasStages = b.stages.some((s) => !s.deleted);
  const dated: Sched[] = hasStages
    ? b.stages.filter((s) => !s.deleted && s.status !== 'cancelled')
    : [b.subtask];
  // Projection-first (2026-08-31): stored dates are last-save snapshots, so
  // the rollup window follows the live projections when they exist.
  const starts = dated
    .map((s) => s.projected_start_date || s.start_date)
    .filter((d): d is string => Boolean(d))
    .sort();
  const ends = dated
    .map((s) => s.projected_end_date || s.end_date)
    .filter((d): d is string => Boolean(d))
    .sort();
  const windowStart = starts[0] || null;
  const windowEnd = ends[ends.length - 1] || null;
  const totalDays =
    windowStart && windowEnd ? calendar.workingDaysInclusive(windowStart, windowEnd) : null;

  let derived: string;
  if (b.subtask.status === 'completed' || b.subtask.status === 'skipped') {
    derived = 'completed';
  } else if (active.length) {
    const statuses = new Set(active.map((s) => s.status));
    if ([...statuses].every((s) => s === 'completed')) derived = 'completed';
    else if (statuses.has('in_progress') || statuses.has('completed')) derived = 'in_progress';
    else if (statuses.has('on_hold')) derived = 'on_hold';
    else derived = 'pending';
  } else {
    derived = b.subtask.status;
  }

  const overdue = !!(windowEnd && windowEnd < today && derived !== 'completed');

  // The block finishes when its last row does.
  const forecastRows: Sched[] = hasStages
    ? b.stages.filter((s) => !s.deleted && s.status !== 'cancelled')
    : [b.subtask];
  const forecastDates = forecastRows
    .map((s) => s.forecast_date)
    .filter((d): d is string => Boolean(d))
    .sort();
  const forecastDate = forecastDates[forecastDates.length - 1] || null;
  const allActual =
    forecastRows.length > 0 && forecastRows.every((s) => s.forecast_kind === 'actual');

  return {
    progress,
    windowStart,
    windowEnd,
    totalDays,
    derived,
    overdue,
    forecastDate,
    forecastKind: forecastDate ? (allActual ? 'actual' : 'rate') : null,
  };
}

// The department default, mirroring plan_sheet.DEFAULT_DURATIONS['logistics']
// on the server. Only reached when the row arrived with no window at all.
const LOGISTICS_DEFAULT_WD = 3;

// How long shipping takes: an entered duration, else the span it was last laid
// out over, else the default. Re-reading a window this file wrote is safe:
// every pass writes the same number of days.
export function logisticsDays(row: InfoTask, calendar: WorkdayCalendar): number {
  if (row.entered_duration_wd != null) return Math.max(Number(row.entered_duration_wd), 0.1);
  if (row.duration_wd != null) return Math.max(Number(row.duration_wd), 0.1);
  const start = row.projected_start_date || row.start_date;
  const end = row.projected_end_date || row.end_date;
  // Only a forward window measures anything. Callers must read this BEFORE
  // they move the row, or the span is start-of-the-new against end-of-the-old.
  if (start && end && end >= start)
    return Math.max(calendar.workingDaysInclusive(start, end) ?? 1, 1);
  return LOGISTICS_DEFAULT_WD;
}

// ---- pass 1: derived durations ----------------------------------------------

// Live top-down duration propagation (user model 2026-08-28): the İmalat entry
// divides down by weight at every level (dept rows, blocks, stages). Only rows
// with no entered duration take the slice. The server recomputes
// authoritatively on reload; this is the same arithmetic, sooner.
function deriveDurations(c: JobContext): void {
  const slots = c.slots;
  const imalat = slots?.manufacturing;
  if (!slots || !imalat) return;
  const round1 = (v: number) => Math.round(v * 10) / 10;
  const w = (x: unknown) => Number(x || 0);
  const top =
    imalat.entered_duration_wd != null
      ? Number(imalat.entered_duration_wd)
      : !imalat.duration_is_derived && imalat.duration_wd != null
        ? Number(imalat.duration_wd)
        : null;
  if (top == null || top <= 0) return;

  const skipped = (vm: { status?: string } | null | undefined) =>
    !vm || ['cancelled', 'skipped'].includes(vm.status ?? '');
  const weld = skipped(slots.welding) ? null : (slots.welding ?? null);
  const paint = skipped(slots.painting) ? null : (slots.painting ?? null);
  // A skipped row takes no share of the İmalat number: the server's plan split
  // drops it the same way.
  const mach = skipped(c.machining) ? null : (c.machining ?? null);
  // By STAGE, the mirror of task_durations / plan_windows: welding and
  // machining side by side, each spanning the first stage, then paint.
  const share = imalatStageFractions([
    weld && { key: 'weld', weight: weld.weight, paint: false },
    mach && { key: 'mach', weight: mach.weight, paint: false, own: true },
    paint && { key: 'paint', weight: paint.weight, paint: true },
  ]);
  if (!Object.keys(share).length) return;

  const setSlice = (vm: Sched | null, value: number) => {
    if (!vm || vm.entered_duration_wd != null) return;
    vm.duration_wd = round1(value);
    vm.duration_is_derived = true;
    vm.duration_source = 'weight_share';
  };

  const weldSlice = top * (share.weld || 0);
  // Kaynaklı İmalat contracts onto its teams once every one of them carries an
  // entered span (see planWindows), so re-imposing the inherited share would
  // print "≈28,5 g" over a 20-day window. The server already sends the
  // contracted number; leave it alone.
  const weldFits =
    c.blocks.length > 0 && c.blocks.every((b) => b.subtask.entered_duration_wd != null);
  if (!weldFits && share.weld) setSlice(weld, weldSlice);
  if (share.paint) setSlice(paint, top * share.paint);

  const kgSum = c.blocks.reduce((acc, b) => acc + w(b.allocated_weight_kg), 0);
  c.blocks.forEach((b) => {
    if (kgSum <= 0) return;
    // Simultaneous teams each take the welding slice WHOLE: the kg share
    // divides the work between them, not the calendar (user 2026-09-17). A
    // team with its own entered span keeps it.
    const entered = b.subtask.entered_duration_wd;
    const blockSlice = entered != null ? Number(entered) : weldSlice;
    if (entered == null) setSlice(b.subtask, blockSlice);
    const live = b.stages.filter((s) => !s.deleted && s.status !== 'cancelled');
    const stageSum = live.reduce((acc, s) => acc + w(s.weight), 0);
    if (stageSum <= 0) return;
    // Stages run one after another inside the block, so THEY split it.
    live.forEach((s) => setSlice(s, (blockSlice * w(s.weight)) / stageSum));
  });
}

// ---- pass 2: plan windows (live jobs only) ----------------------------------

// The PLAN, laid out live for a job the planner is editing: the client mirror
// of projects/services/plan_windows.py, so typing an İmalat start or duration
// moves every row under it before the save does (user 2026-09-01). Kaynaklı
// and Talaşlı run side by side from the start, Boya follows them, blocks are
// parallel and stages sequential, and machining keeps the operations' dates.
function derivePlanWindows(c: JobContext): void {
  const { calendar } = c;
  const w = (x: unknown) => Number(x || 0);
  const live = (vm: { status?: string } | null | undefined): boolean =>
    !!vm && !['cancelled', 'skipped'].includes(vm.status ?? '');
  const spanEnd = (start: string, days: number) => calendar.spanEnd(start, Math.max(days, 0.1));
  const nextWorkday = (d: string) => {
    const p = new Date(`${d}T00:00:00`);
    do {
      p.setDate(p.getDate() + 1);
    } while (calendar.isNonWorkingDay(isoOf(p)));
    return isoOf(p);
  };
  const slots = c.slots || {};
  const shipping = c.info.logistics || null;

  // Invariants that hold whether or not the job has an İmalat entry to split:
  // a pinned assignment starts where it was pinned, no window runs backwards,
  // and a parent covers its children (user 2026-09-17, 305-01).
  const honourPins = (planned: boolean) => {
    let earliest: string | null = null;
    let latest: string | null = null;
    c.blocks.forEach((b) => {
      const pin = b.subtask.actual_start_date;
      if (pin) {
        b.subtask.start_date = pin;
        b.subtask.start_is_actual = false;
      }
      const from = b.subtask.start_date;
      if (!from) return;
      // Nothing here can SIZE the block (that needs the İmalat entry), so an
      // end the move left behind collapses onto the start instead of pointing
      // backwards.
      if (b.subtask.end_date && b.subtask.end_date < from) {
        const days = w(b.subtask.duration_wd);
        b.subtask.end_date = days > 0 ? spanEnd(from, days) : from;
      }
      earliest = earliest && earliest < from ? earliest : from;
      latest = later(latest, b.subtask.end_date);
    });
    // With no plan there is no window for a parent to widen (2026-09-24).
    if (!planned) return;
    [slots.welding, slots.manufacturing].forEach((vm) => {
      if (!vm) return;
      // Backwards only, and only over a start it already has.
      if (earliest && vm.start_date && earliest < vm.start_date) {
        vm.start_date = earliest;
        vm.start_is_actual = false;
      }
      if (latest && (!vm.end_date || latest > vm.end_date)) {
        vm.end_date = latest;
        vm.end_is_actual = false;
      }
    });
  };

  // Lojistik has no plan of its own (it trails İmalat), so the sheet's last row
  // has to move with the entry above it.
  const chainLogistics = () => {
    const imalat = slots.manufacturing;
    if (!shipping) return;
    if (['completed', 'cancelled', 'skipped'].includes(shipping.status ?? '')) return;
    // An entered window is the planner's; the server never recomputes it.
    if (shipping.entered_start_date || shipping.entered_end_date) return;
    // Shipping waits for İmalat AND whatever else it is linked to, so the
    // preview lands where the save will.
    const anchor = shippingAnchor({
      imalatLive: live(imalat),
      imalatEnd: imalat ? imalat.end_date : null,
      after: shipping.shipping_after || null,
      afterInvented: !!shipping.shipping_after_invented,
    });
    if (!anchor) {
      if (shipping.date_source === 'plan_tail') {
        shipping.projected_start_date = null;
        shipping.projected_end_date = null;
        shipping.date_source = null;
      }
      return;
    }
    // Measured BEFORE the window is touched (009-37 grew on every edit).
    const days = logisticsDays(shipping, calendar);
    const from = nextWorkday(anchor);
    shipping.projected_start_date = from;
    shipping.projected_end_date = spanEnd(from, days);
    shipping.date_source = 'plan_tail';
  };

  // No plan (user 2026-09-24): nothing dates İmalat, so neither it nor the
  // shipping day after it has one.
  const clearPlan = () => {
    const imalat = slots.manufacturing;
    if (imalat && live(imalat) && imalat.status !== 'completed') {
      imalat.end_date = null;
      imalat.end_is_actual = false;
    }
    if (shipping && shipping.date_source === 'plan_tail') {
      shipping.projected_start_date = null;
      shipping.projected_end_date = null;
      shipping.date_source = null;
    }
  };

  // Returns whether the job HAS a plan to lay out.
  const splitFromImalat = (): boolean => {
    const imalat = slots.manufacturing;
    if (!imalat) return false;
    const total =
      imalat.entered_duration_wd != null
        ? Number(imalat.entered_duration_wd)
        : imalat.duration_wd != null
          ? Number(imalat.duration_wd)
          : null;
    // Nothing to size a plan with: the server lays nothing out either.
    if (!total || total <= 0) return false;

    // Where the plan starts: the mirror of plan_windows.imalat_plan_start. NOT
    // the start the row is showing (the widened window, or first progress).
    const { start } = imalatPlanStart({
      enteredStart: imalat.entered_start_date,
      enteredEnd: imalat.entered_end_date,
      duration: total,
      pins: c.blocks
        .filter((b) => !b.deleted && live(b.subtask))
        .map((b) => b.subtask.actual_start_date),
      spanStart: (end, days) => calendar.spanStart(end, days),
    });
    if (!start) {
      clearPlan();
      return false;
    }

    const weld = live(slots.welding) ? (slots.welding ?? null) : null;
    const paint = live(slots.painting) ? (slots.painting ?? null) : null;
    // A skipped Talaşlı takes no share: the server's split drops it too.
    const mach = live(c.machining) ? (c.machining ?? null) : null;
    const share = imalatStageFractions([
      weld && { key: 'weld', weight: weld.weight, paint: false },
      mach && { key: 'mach', weight: mach.weight, paint: false, own: true },
      paint && { key: 'paint', weight: paint.weight, paint: true },
    ]);
    if (!Object.keys(share).length) return false;

    const set = (vm: Sched | null, from: string, days: number): string | null => {
      if (!vm) return null;
      const end = spanEnd(from, days);
      vm.start_date = from;
      vm.end_date = end;
      vm.start_is_actual = false;
      vm.end_is_actual = false;
      return end;
    };

    let parallelEnd: string | null = null;
    // Only a row the board PAINTS can end the İmalat bar. Talaşlı İmalat keeps
    // no window of its own, so its share still holds İmalat open but must
    // never be what the bar contracts onto (plan_windows' drawn_latest).
    let drawnLatest: string | null = null;
    if (mach) parallelEnd = later(parallelEnd, spanEnd(start, total * (share.mach ?? 0)));
    if (weld) {
      const weldDays = total * (share.weld ?? 0);
      const derivedEnd = set(weld, start, weldDays);
      const kgSum = c.blocks.reduce((acc, b) => acc + w(b.allocated_weight_kg), 0);
      // Once EVERY team under Kaynaklı İmalat carries an entered span the
      // teams ARE the row: it contracts onto them (user 2026-09-21, 009-37).
      const liveBlocks = c.blocks.filter((b) => !b.deleted);
      const fitsBlocks =
        liveBlocks.length > 0 && liveBlocks.every((b) => b.subtask.entered_duration_wd != null);
      let weldEnd: string | null = fitsBlocks ? null : derivedEnd;
      c.blocks.forEach((b) => {
        if (kgSum <= 0) return;
        // Simultaneous teams span the whole welding window; the kg share
        // divides the WORK, never the calendar.
        const blockDays =
          b.subtask.entered_duration_wd != null ? Number(b.subtask.entered_duration_wd) : weldDays;
        // Pinned to its own start when the planner typed one.
        const blockStart = b.subtask.actual_start_date || start;
        const blockEnd = set(b.subtask, blockStart, blockDays);
        const stages = b.stages.filter((s) => !s.deleted && s.status !== 'cancelled');
        const stageSum = stages.reduce((acc, s) => acc + w(s.weight), 0);
        let cursor = blockStart;
        let deepest = null as string | null;
        stages.forEach((s) => {
          if (stageSum <= 0) return;
          const e = set(s, cursor, (blockDays * w(s.weight)) / stageSum);
          deepest = later(deepest, e);
          if (e) cursor = nextWorkday(e);
        });
        if (deepest && blockEnd && deepest > blockEnd) b.subtask.end_date = deepest;
        weldEnd = later(weldEnd, b.subtask.end_date);
        // Kaynaklı İmalat opens backwards too: a team pinned before the İmalat
        // start must not sit outside its own parent.
        if (b.subtask.start_date && weld.start_date && b.subtask.start_date < weld.start_date) {
          weld.start_date = b.subtask.start_date;
        }
      });
      weld.end_date = weldEnd;
      if (fitsBlocks && weld.start_date && weldEnd) {
        // The window is the number now: keep Süre from disagreeing with it.
        const span = calendar.workingDaysInclusive(weld.start_date, weldEnd) ?? 0;
        weld.duration_wd = Math.round(span * 10) / 10;
        weld.duration_is_derived = true;
        weld.duration_source = 'children_span';
      }
      parallelEnd = later(parallelEnd, weldEnd);
      drawnLatest = later(drawnLatest, weldEnd);
    }
    let latest = parallelEnd;
    if (paint) {
      const paintStart = parallelEnd ? nextWorkday(parallelEnd) : start;
      const paintEnd = set(paint, paintStart, total * (share.paint ?? 0));
      latest = later(latest, paintEnd);
      drawnLatest = later(drawnLatest, paintEnd);
    }

    // The mirror of plan_windows.children_settle: while ONE phase still takes
    // a weight share of the İmalat entry, that entry is the schedule; once
    // none does, stretching the bar to it claims weeks nobody is working
    // (user 2026-09-22, 009-37).
    const settles = (vm: Sched | null | undefined) =>
      !!vm && (vm.entered_duration_wd != null || vm.status === 'completed');
    const openStages = (b: BlockVM) =>
      b.stages.filter((st) => !st.deleted && !['cancelled', 'skipped'].includes(st.status));
    const blockSettles = (b: BlockVM) =>
      settles(b.subtask) || (openStages(b).length > 0 && openStages(b).every(settles));
    const openBlocks = c.blocks.filter(
      (b) => !b.deleted && !['cancelled', 'skipped'].includes(b.subtask.status),
    );
    const phases: Sched[] = [weld, paint, mach].filter((p): p is NonNullable<typeof p> =>
      Boolean(p),
    );
    const allSettle =
      phases.length > 0 &&
      phases.every(
        (vm) =>
          settles(vm) || (vm === weld && openBlocks.length > 0 && openBlocks.every(blockSettles)),
      );

    // İmalat covers what it contains: its own span, extended if the paint tail
    // spills past it, contracted onto the work below when nothing there still
    // takes its span from above, opened backwards for an early pinned team.
    const ownEnd = spanEnd(start, total);
    if (latest && latest > ownEnd) imalat.end_date = latest;
    else if (allSettle && drawnLatest && drawnLatest < ownEnd) imalat.end_date = drawnLatest;
    else imalat.end_date = ownEnd;
    imalat.end_is_actual = false;
    imalat.start_date = start;
    imalat.start_is_actual = false;
    if (weld && weld.start_date && weld.start_date < imalat.start_date)
      imalat.start_date = weld.start_date;
    return true;
  };

  const planned = splitFromImalat();
  honourPins(planned);
  // Always: shipping can be planned from what else it waits for even when
  // İmalat is not, and must lose its window when İmalat loses one.
  chainLogistics();
}

// ---- pass 3: progress rollup ------------------------------------------------

// Live parent-progress rollup: a stage edit re-weights its block, the Kaynaklı
// İmalat row and İmalat immediately. Display only; parent progress is never
// sent, the server recomputes the same rollup.
function deriveProgress(c: JobContext): void {
  const slots = c.slots;
  if (!slots) return;
  const cap99 = (p: unknown) => Math.min(Number(p || 0), 99);
  const weld = slots.welding;
  if (weld && weld.status !== 'completed' && c.blocks.length) {
    let wSum = 0;
    let earned = 0;
    c.blocks.forEach((b) => {
      if (['cancelled', 'skipped'].includes(b.subtask.status)) return;
      const hasStages = b.stages.some((s) => !s.deleted);
      const pct =
        b.subtask.status === 'completed'
          ? 100
          : cap99(hasStages ? blockRollup(b, c.calendar, c.today).progress : b.subtask.progress);
      const kg = Number(b.allocated_weight_kg || 0);
      wSum += kg;
      earned += kg * pct;
    });
    if (wSum > 0) weld.progress = Math.round((earned / wSum) * 100) / 100;
  }
  const imalat = slots.manufacturing;
  if (imalat && imalat.status !== 'completed') {
    const machInfo = (c.info.machining || [])[0];
    const parts: [unknown, string | undefined, unknown][] = [];
    if (weld) parts.push([weld.weight, weld.status, weld.progress]);
    if (machInfo) parts.push([machInfo.weight, machInfo.status, machInfo.progress]);
    if (slots.painting)
      parts.push([slots.painting.weight, slots.painting.status, slots.painting.progress]);
    let wSum = 0;
    let earned = 0;
    parts.forEach(([wt, st, p]) => {
      if (['cancelled', 'skipped'].includes(st ?? '')) return;
      const wp = Number(wt || 0);
      wSum += wp;
      earned += wp * (st === 'completed' ? 100 : cap99(p));
    });
    if (wSum > 0) imalat.progress = Math.round((earned / wSum) * 100) / 100;
  }
}

// ---- pass 4: engine dates (live jobs only) ----------------------------------

// LIVE projections for jobs the planner just edited: a client mini-scheduler
// over the workday calendar. From the İmalat start, stages lay out
// sequentially within each block, blocks run in parallel, Kaynaklı İmalat is
// the latest block, Boya starts the next workday AFTER welding and machining,
// and İmalat ends with its last child. A started row keeps its real start and
// projects what is left from today. The save's fresh board restores the
// engine's exact numbers; untouched jobs keep engine values verbatim.
function deriveEngineDates(c: JobContext): void {
  const { calendar, today } = c;
  const nextDay = (d: string) => {
    const p = new Date(`${d}T00:00:00`);
    p.setDate(p.getDate() + 1);
    return isoOf(p);
  };
  const nextWorkday = (d: string) => {
    let cur = nextDay(d);
    for (let i = 0; i < 60 && calendar.isNonWorkingDay(cur); i++) cur = nextDay(cur);
    return cur;
  };
  // One row's window: unstarted work spans its full duration from the chained
  // anchor; started work keeps its real start and runs on for what its own
  // measured tempo says is left (see forecastLayout.ts).
  const layout = (vm: Sched, chainedStart: string | null, durationWd: unknown): string | null => {
    const d = Number(durationWd || 0);
    const p = Math.min(Number(vm.progress || 0), 99);
    if (d <= 0) return null;
    if (p <= 0) {
      const start = chainedStart || today;
      const from = start > today ? start : today;
      vm.projected_start_date = from;
      const end = calendar.spanEnd(from, d);
      vm.projected_end_date = end;
      vm.forecast_date = end;
      return end;
    }
    const anchor = vm.start_date || vm.projected_start_date || chainedStart || today;
    // A row the board cannot honestly re-derive keeps the engine's date.
    if (!canRederiveForecast(vm.forecast_kind)) {
      const kept = vm.forecast_date || vm.projected_end_date;
      if (kept) {
        vm.projected_end_date = kept;
        vm.forecast_date = kept;
        return kept;
      }
    }
    // The tempo window: the engine's own measured one when it sent it, else
    // the row's start up to today.
    const elapsed =
      vm.forecast_elapsed_wd != null
        ? Number(vm.forecast_elapsed_wd)
        : anchor <= today
          ? (calendar.workingDaysInclusive(anchor, today) ?? 0)
          : 0;
    let end = calendar.spanEnd(
      nextWorkday(today),
      forecastRemainingWd(p, elapsed, d, vm.forecast_head_start_pct),
    );
    if (end < today) end = today;
    vm.projected_start_date = anchor;
    vm.projected_end_date = end;
    vm.forecast_date = end;
    return end;
  };

  const slots = c.slots || {};
  const imalat = slots.manufacturing;
  const jobStart = (imalat && imalat.start_date) || today;

  let weldEnd: string | null = null;
  c.blocks.forEach((b) => {
    let blockEnd: string | null = null;
    // Where this assignment begins: its own entered start (which planWindows
    // has already put on start_date), else the job's.
    let cursor = b.subtask.start_date || jobStart;
    const live = b.stages.filter((s) => !s.deleted && !['cancelled', 'skipped'].includes(s.status));
    if (live.length) {
      live.forEach((s) => {
        if (s.status === 'completed') {
          blockEnd = later(blockEnd, s.projected_end_date || s.end_date);
          if (blockEnd) cursor = nextWorkday(blockEnd);
          return;
        }
        const e = layout(s, cursor, s.duration_wd);
        blockEnd = later(blockEnd, e || s.projected_end_date);
        if (blockEnd) cursor = nextWorkday(blockEnd);
      });
    } else if (b.subtask.status !== 'completed') {
      blockEnd = layout(b.subtask, cursor, b.subtask.duration_wd);
    }
    if (blockEnd && b.subtask.status !== 'completed') {
      if (live.length) {
        // The header window must track its re-laid stages.
        const stageStarts = live
          .map((s) => s.projected_start_date || s.start_date)
          .filter((d): d is string => Boolean(d))
          .sort();
        if (stageStarts.length) b.subtask.projected_start_date = stageStarts[0];
      }
      b.subtask.projected_end_date = blockEnd;
      b.subtask.forecast_date = blockEnd;
    }
    weldEnd = later(weldEnd, blockEnd);
  });
  const weld = slots.welding;
  if (weld && weld.status !== 'completed' && weldEnd) {
    weld.projected_start_date = weld.start_date || weld.projected_start_date || jobStart;
    weld.projected_end_date = weldEnd;
    weld.forecast_date = weldEnd;
  }

  const machEnd = (c.info.machining || []).reduce<string | null>(
    (acc, m) => later(acc, m.forecast_date || m.end_date),
    null,
  );

  // Boya is ALWAYS after the rest of the manufacturing work.
  let paintEnd: string | null = null;
  const paint = slots.painting;
  if (paint && paint.status !== 'completed') {
    const preds = later(weldEnd, machEnd);
    paintEnd = layout(paint, preds ? nextWorkday(preds) : jobStart, paint.duration_wd);
  }

  if (imalat && imalat.status !== 'completed') {
    const kids = later(later(weldEnd, paintEnd), machEnd);
    const end = kids || layout(imalat, jobStart, imalat.entered_duration_wd ?? imalat.duration_wd);
    if (end) {
      imalat.projected_end_date = end;
      imalat.forecast_date = end;
    }
  }

  // Shipping trails the whole of İmalat here too, but off the ENGINE's finish,
  // not the plan's: Öngörü and Bitiş answer different questions.
  const shipping = c.info.logistics;
  const imalatEnd = imalat && (imalat.projected_end_date || imalat.forecast_date);
  if (
    shipping &&
    imalatEnd &&
    !['completed', 'cancelled', 'skipped'].includes(shipping.status ?? '')
  ) {
    shipping.forecast_date = calendar.spanEnd(
      nextWorkday(imalatEnd),
      Math.max(logisticsDays(shipping, calendar), 0.1),
    );
  }
}

/** All four passes for one job, in the legacy order. */
export function deriveJob(c: JobContext): void {
  deriveDurations(c);
  if (c.live) derivePlanWindows(c);
  deriveProgress(c);
  if (c.live) deriveEngineDates(c);
}

/**
 * The İmalat plan's two rules, as the board's live preview applies them: the
 * client mirror of projects/services/plan_windows.py (`imalat_plan_start` and
 * `phase_share_fractions`). Kept to exactly the server's arithmetic: the
 * preview a planner sees while typing has to be what the save then stores
 * (user 2026-09-24, 097-42).
 */

export interface PlanStartInput {
  enteredStart: string | null | undefined;
  enteredEnd: string | null | undefined;
  duration: number | null | undefined;
  pins: readonly (string | null | undefined)[] | null | undefined;
  spanStart: (end: string, days: number) => string;
}

/**
 * Where the İmalat plan starts, and where that date came from.
 *
 * The start entered on İmalat itself; else its entered end counted back over
 * the duration; else the earliest day a team under it was PINNED to; else
 * nothing: a duration with no date is not a schedule, and there is no plan.
 */
export function imalatPlanStart({
  enteredStart,
  enteredEnd,
  duration,
  pins,
  spanStart,
}: PlanStartInput): {
  start: string | null;
  source: 'entered' | 'entered_end' | 'team_start' | null;
} {
  if (enteredStart) return { start: enteredStart, source: 'entered' };
  if (!duration || duration <= 0) return { start: null, source: null };
  if (enteredEnd) return { start: spanStart(enteredEnd, duration), source: 'entered_end' };
  const pinned = (pins || []).filter((p): p is string => Boolean(p)).sort();
  if (pinned.length) return { start: pinned[0] ?? null, source: 'team_start' };
  return { start: null, source: null };
}

export interface Phase {
  key: string;
  weight: number | null | undefined;
  paint: boolean;
  own?: boolean;
}

/**
 * The fraction of İmalat's calendar each phase spans.
 *
 * The phases run in two STAGES: welding and machining side by side from the
 * start, then paint. Weights size the stages and welding spans the whole first
 * stage. Machining itself (`own: true`) keeps its own work share inside
 * welding's window: stretched to the whole stage, a 5 % row read as 66 days of
 * machining.
 *
 * Weights are truncated to whole numbers and, when none is set, count as 1
 * each: the server's `int(weight)` and its even fallback.
 */
export function imalatStageFractions(
  phases: readonly (Phase | null | false | undefined)[] | null | undefined,
): Record<string, number> {
  const live = (phases || []).filter((p): p is Phase => Boolean(p));
  if (!live.length) return {};
  let weights = live.map((p) => Math.max(Math.trunc(Number(p.weight || 0)), 0));
  if (weights.reduce((a, b) => a + b, 0) <= 0) weights = live.map(() => 1);
  const total = weights.reduce((a, b) => a + b, 0);
  const stage = (paint: boolean) =>
    live.reduce((acc, p, i) => acc + (!!p.paint === paint ? (weights[i] ?? 0) : 0), 0);
  const first = stage(false);
  const second = stage(true);
  const out: Record<string, number> = {};
  live.forEach((p, i) => {
    out[p.key] = (p.own ? (weights[i] ?? 0) : p.paint ? second : first) / total;
  });
  return out;
}

export interface ShippingAnchorInput {
  imalatLive: boolean;
  imalatEnd: string | null | undefined;
  after: string | null | undefined;
  afterInvented: boolean;
}

/**
 * The day shipping's plan hangs after, or null for no plan: the mirror of
 * planning_views._apply_logistics_plan_tail.
 *
 * Shipping waits for İmalat's plan end AND for whatever else it is linked to
 * (`after`, from the plan sheet's own pass). The later of the two wins. A live
 * İmalat with no plan means shipping has none; a skipped İmalat ships nothing,
 * so shipping waits only for the rest; and when the later date is only a plan
 * nobody entered, there is no plan. On a tie, İmalat's (entered) date wins.
 */
export function shippingAnchor({
  imalatLive,
  imalatEnd,
  after,
  afterInvented,
}: ShippingAnchorInput): string | null {
  if (imalatLive && !imalatEnd) return null;
  const end = imalatLive ? imalatEnd : null;
  if (after && (!end || after > end)) return afterInvented ? null : after;
  return end || null;
}

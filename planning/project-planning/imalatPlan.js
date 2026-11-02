/**
 * The İmalat plan's two rules, as the board's live preview applies them.
 *
 * The client mirror of projects/services/plan_windows.py —
 * `imalat_plan_start` and `phase_share_fractions`. Pure, so node can test it,
 * and kept to exactly the server's arithmetic: the preview a planner sees
 * while typing has to be what the save then stores (user 2026-09-24, 097-42
 * planned shipping for 16.11 on this page and 02.12 on project tracking).
 */

/**
 * Where the İmalat plan starts, and where that date came from.
 *
 * The start entered on İmalat itself; else its entered end counted back over
 * the duration; else the earliest day a team under it was PINNED to; else
 * nothing — a duration with no date is not a schedule, and there is no plan.
 *
 * @param {object} o
 * @param {string|null} o.enteredStart  İmalat's own start (ISO)
 * @param {string|null} o.enteredEnd    İmalat's own end (ISO)
 * @param {number|null} o.duration      İmalat's duration, working days
 * @param {Array<string|null>} o.pins   the live teams' pinned starts (ISO)
 * @param {(end: string, days: number) => string} o.spanStart
 * @returns {{start: string|null, source: string|null}}
 */
export function imalatPlanStart({ enteredStart, enteredEnd, duration, pins, spanStart }) {
    if (enteredStart) return { start: enteredStart, source: 'entered' };
    if (!duration || duration <= 0) return { start: null, source: null };
    if (enteredEnd) return { start: spanStart(enteredEnd, duration), source: 'entered_end' };
    const pinned = (pins || []).filter(Boolean).sort();
    if (pinned.length) return { start: pinned[0], source: 'team_start' };
    return { start: null, source: null };
}

/**
 * The fraction of İmalat's calendar each phase spans.
 *
 * The phases run in two STAGES: welding and machining side by side from the
 * start, then paint. Weights size the stages and welding spans the whole
 * first stage. Split phase by phase, Talaşlı took a slice of the calendar it
 * never occupied — it runs beside welding — and İmalat ended with that slice
 * empty before shipping. Machining itself (`own: true`) keeps its own work
 * share inside welding's window: stretched to the whole stage, a 5 % row
 * read as 66 days of machining.
 *
 * Weights are truncated to whole numbers and, when none is set, count as 1
 * each — the server's `int(weight)` and its even fallback.
 *
 * @param {Array<{key: string, weight: number|null, paint: boolean, own?: boolean}|null>} phases
 *        the LIVE phases (skipped/cancelled left out by the caller)
 * @returns {Object<string, number>} key -> fraction of İmalat's duration
 */
export function imalatStageFractions(phases) {
    const live = (phases || []).filter(Boolean);
    if (!live.length) return {};
    let weights = live.map(p => Math.max(Math.trunc(Number(p.weight || 0)), 0));
    if (weights.reduce((a, b) => a + b, 0) <= 0) weights = live.map(() => 1);
    const total = weights.reduce((a, b) => a + b, 0);
    const stage = (paint) => live.reduce(
        (acc, p, i) => acc + (!!p.paint === paint ? weights[i] : 0), 0);
    const first = stage(false);
    const second = stage(true);
    const out = {};
    live.forEach((p, i) => {
        out[p.key] = (p.own ? weights[i] : (p.paint ? second : first)) / total;
    });
    return out;
}

/**
 * The day shipping's plan hangs after, or null for no plan — the mirror of
 * planning_views._apply_logistics_plan_tail.
 *
 * Shipping ships what manufacturing makes: it waits for İmalat's plan end
 * AND for whatever else it is linked to (`after`, which the server sends from
 * the plan sheet's own pass). The later of the two wins. A live İmalat with
 * no plan means shipping has none; a skipped İmalat ships nothing, so shipping
 * waits only for the rest; and when the later date is only a plan nobody
 * entered, there is no plan. On a tie, İmalat's (entered) date wins.
 * 293-05-01's shipping, linked to procurement alone, was planned for 24.08 —
 * before manufacturing had started (user 2026-09-24).
 *
 * @param {object} o
 * @param {boolean} o.imalatLive       İmalat exists and is not skipped/cancelled
 * @param {string|null} o.imalatEnd    İmalat's plan end (ISO)
 * @param {string|null} o.after        latest plan end of the other tasks (ISO)
 * @param {boolean} o.afterInvented    that date is only a plan nobody entered
 * @returns {string|null}
 */
export function shippingAnchor({ imalatLive, imalatEnd, after, afterInvented }) {
    if (imalatLive && !imalatEnd) return null;
    const end = imalatLive ? imalatEnd : null;
    if (after && (!end || after > end)) return afterInvented ? null : after;
    return end || null;
}

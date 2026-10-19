/**
 * Single-flight poller for long-running estimate jobs.
 *
 * start() while already active is a no-op: it does not reset the counter
 * and it does not arm a second timeout. load() re-enters start() after
 * every fetch of a queued/running report; without this guard each tick
 * would double the timer set and the 15-minute cap would never fire.
 */

export const DEFAULT_POLL_MS = 5000;
export const DEFAULT_POLL_MAX = 180;

export function createStatusPoller({
    intervalMs = DEFAULT_POLL_MS,
    maxTicks = DEFAULT_POLL_MAX,
    schedule = setTimeout,
    cancel = clearTimeout,
} = {}) {
    let timer = null;
    let count = 0;
    let active = false;
    let destroyed = false;
    let onTick = null;

    function clearTimer() {
        if (timer != null) {
            cancel(timer);
            timer = null;
        }
    }

    function arm() {
        timer = schedule(runTick, intervalMs);
    }

    async function runTick() {
        timer = null;
        if (destroyed || !active) return;
        count += 1;
        if (count > maxTicks) {
            active = false;
            return;
        }
        try {
            await onTick?.(count);
        } catch {
            // caller surfaces the error; keep the schedule decision below
        }
        if (destroyed || !active) return;
        if (count < maxTicks) {
            arm();
        } else {
            active = false;
        }
    }

    return {
        get count() { return count; },
        get active() { return active; },
        get pending() { return timer != null; },

        start(tick) {
            if (destroyed) return;
            if (typeof tick === 'function') onTick = tick;
            if (active) return;
            active = true;
            count = 0;
            arm();
        },

        stop() {
            active = false;
            clearTimer();
        },

        destroy() {
            destroyed = true;
            this.stop();
        },
    };
}

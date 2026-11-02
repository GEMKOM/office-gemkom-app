// Single-flight wrapper for click handlers that POST. A second call while the
// first is still awaiting is ignored, so a double-click cannot start two writes.

export function createExclusiveRun() {
    let busy = false;
    return async function exclusiveRun(fn) {
        if (busy) return { started: false };
        busy = true;
        try {
            return { started: true, result: await fn() };
        } finally {
            busy = false;
        }
    };
}

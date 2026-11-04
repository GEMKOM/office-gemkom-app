// After a deploy the page chunks get new hashed names and the old files are
// gone, so a tab opened before the deploy fails the first time it loads a page
// it hasn't loaded yet ("Failed to fetch dynamically imported module"). A
// reload picks up the new index.html and its chunks. One reload per short
// window, so a chunk that is really missing doesn't reload forever.

const RELOAD_KEY = 'gk:staleChunkReloadAt';
const RELOAD_WINDOW_MS = 10_000;

/** Chromium, Firefox and Safari wordings, plus a failed CSS preload. */
const STALE_CHUNK =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i;

export function isStaleChunkError(error: unknown): boolean {
  if (!error) return false;
  const message =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? `${error.name} ${error.message}`
        : String((error as { message?: unknown }).message ?? '');
  return STALE_CHUNK.test(message) || /ChunkLoadError/.test(message);
}

/** Indirection so tests can watch the reload (jsdom has no real one). */
export const page = {
  reload: () => window.location.reload(),
};

/**
 * Reloads unless this tab already did so in the last few seconds. Returns
 * whether it reloaded. Storage can be off; then it reloads every time, which
 * is still better than an error page.
 */
export function reloadForNewVersion(now = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (now - last < RELOAD_WINDOW_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(now));
  } catch {
    // Private mode or blocked storage: no loop guard, reload anyway.
  }
  page.reload();
  return true;
}

import type { Location } from 'react-router';

// ScrollRestoration keys each history entry by location.key, so every filter,
// tab or page change (they all rewrite the query) counted as a new page and
// scrolled to the top. scrollKey gives a run of entries on the same pathname
// one key: a query-only change keeps the page where it is, another page (or
// the same page reached again from elsewhere) starts at the top, and Back
// still restores. The key is the first entry's location.key, so it stays
// unique across reloads (positions live in sessionStorage).

const runOf = new Map<string, string>();
let last: { pathname: string; run: string } | null = null;

export function scrollKey(location: Pick<Location, 'key' | 'pathname'>): string {
  let run = runOf.get(location.key);
  if (run === undefined) {
    run = last && samePath(last.pathname, location.pathname) ? last.run : location.key;
    runOf.set(location.key, run);
  }
  last = { pathname: location.pathname, run };
  return run;
}

const samePath = (a: string, b: string) => a.replace(/\/+$/, '') === b.replace(/\/+$/, '');

/** Tests only. */
export function resetScrollKeys() {
  runOf.clear();
  last = null;
}

import {
  REPORT_CATALOG,
  REPORT_DEPARTMENTS,
  REPORT_TOPICS,
  type ReportEntry,
} from '@legacy/reportCatalog.js';

// The Rapor Merkezi's rules, kept apart from the page so they test plainly.

/** A report as the catalog shows it: where it links, given the scope. */
export interface CatalogItem {
  entry: ReportEntry;
  /** The report, or its department's view of it (a merged report). */
  link: string;
}

export interface CatalogScope {
  /** A hub's departments; empty or missing = the whole catalog. */
  departments?: readonly string[];
  /** The department filter. */
  department?: string;
}

/**
 * The department whose view of a merged report applies: the filter, or the
 * hub's one department. With neither, the merged report opens as itself.
 */
function viewDepartment(entry: ReportEntry, scope: CatalogScope): string | null {
  if (scope.department && entry.views?.[scope.department]) return scope.department;
  const only = scope.departments?.length === 1 ? scope.departments[0] : undefined;
  if (only && entry.views?.[only]) return only;
  return null;
}

/**
 * The reports in scope that the user may open. A merged report's
 * department view follows the old page's grant, so a CNC-only user finds
 * Biten Zamanlayıcılar under CNC and not under Talaşlı.
 */
export function catalogItems(
  scope: CatalogScope,
  canOpen: (route: string) => boolean,
  entries: readonly ReportEntry[] = REPORT_CATALOG,
): CatalogItem[] {
  const hub = scope.departments ?? [];
  return entries.flatMap((entry) => {
    if (hub.length > 0 && !entry.departments.some((d) => hub.includes(d))) return [];
    if (scope.department && !entry.departments.includes(scope.department)) return [];
    const department = viewDepartment(entry, scope);
    const view = department ? entry.views?.[department] : undefined;
    if (view) return canOpen(view.route) ? [{ entry, link: `${entry.route}?${view.query}` }] : [];
    return canOpen(entry.route) ? [{ entry, link: entry.route }] : [];
  });
}

/** Lower case the Turkish way (İ → i, I → ı), so "iş" finds "İş Maliyeti". */
export function fold(text: string): string {
  return text.toLocaleLowerCase('tr-TR');
}

function searchText(entry: ReportEntry): string {
  return fold(
    [
      entry.title,
      entry.question,
      REPORT_TOPICS[entry.topic] ?? '',
      ...entry.departments.map((d) => REPORT_DEPARTMENTS[d] ?? ''),
      ...(entry.keywords ?? []),
    ].join(' '),
  );
}

/** Every word of the query appears in the title, question, topic, departments or keywords. */
export function matchesSearch(entry: ReportEntry, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = searchText(entry);
  return words.every((word) => text.includes(word));
}

export interface CatalogGroup {
  key: string;
  label: string;
  items: CatalogItem[];
}

export const FAVOURITES_GROUP = 'favourites';

/**
 * Favourites first, then one group per topic in REPORT_TOPICS order; a
 * favourite is not repeated under its topic. Empty groups are dropped.
 */
export function groupByTopic(items: readonly CatalogItem[], favourites: ReadonlySet<string>): CatalogGroup[] {
  const pinned = items.filter((item) => favourites.has(item.entry.route));
  const rest = items.filter((item) => !favourites.has(item.entry.route));
  const groups: CatalogGroup[] = [{ key: FAVOURITES_GROUP, label: 'Favoriler', items: pinned }];
  for (const [key, label] of Object.entries(REPORT_TOPICS)) {
    groups.push({ key, label, items: rest.filter((item) => item.entry.topic === key) });
  }
  return groups.filter((group) => group.items.length > 0);
}

/** The departments with at least one report the user may open, in REPORT_DEPARTMENTS order. */
export function departmentOptions(items: readonly CatalogItem[], within: readonly string[] = []) {
  const present = new Set(items.flatMap((item) => item.entry.departments));
  return Object.entries(REPORT_DEPARTMENTS)
    .filter(([key]) => present.has(key) && (within.length === 0 || within.includes(key)))
    .map(([value, label]) => ({ value, label }));
}

// ---- favourites (this browser only) ----

const favouritesKey = (userId: number | string) => `gk.reportFavourites.${userId}`;

/** Storage can be missing or throw (private windows, blocked site data): no favourites then. */
export function readFavourites(userId: number | string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(favouritesKey(userId)) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function writeFavourites(userId: number | string, routes: readonly string[]) {
  try {
    localStorage.setItem(favouritesKey(userId), JSON.stringify(routes));
  } catch {
    // Not saved; the star still flips for this visit.
  }
}

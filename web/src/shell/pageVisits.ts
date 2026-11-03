import { NAVIGATION_STRUCTURE, type NavTree } from '@legacy/navigationStructure.js';
import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { useAuth } from '@/auth/AuthProvider';
import { normalizeRoute } from '@/routes/migrated';

// The pages a user opens most, for the home page's shortcuts. Counted per
// user on this browser only; storage can be missing or throw (private
// windows, blocked site data), and the home page then falls back to the
// department's own pages.

interface Visit {
  count: number;
  /** ms since epoch. */
  last: number;
}

type Visits = Record<string, Visit>;

export interface NavPage {
  path: string;
  label: string;
  icon: string;
  /** The menu section it sits in ("Satın Alma"), when it is not a section itself. */
  section: string | null;
}

/** Kept small: the oldest entries go once there are more. */
const MAX_ENTRIES = 40;

const storageKey = (userId: number) => `gk.pageVisits.${userId}`;

/** The menu entry for exactly this route, or null for pages the menu does not list. */
export function findNavPage(route: string, tree: NavTree = NAVIGATION_STRUCTURE, section: string | null = null): NavPage | null {
  for (const [path, item] of Object.entries(tree)) {
    if (path === route) return { path, label: item.label, icon: item.icon, section };
    const children = item.children ?? {};
    if (Object.keys(children).length > 0) {
      const found = findNavPage(route, children, section ?? item.label);
      if (found) return found;
    }
  }
  return null;
}

export function readVisits(userId: number): Visits {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Visits) : {};
  } catch {
    return {};
  }
}

/** Counts one visit to a menu page; the home page itself and unlisted paths are skipped. */
export function recordVisit(userId: number, pathname: string, now = Date.now()) {
  const route = normalizeRoute(pathname);
  if (route === '/' || !findNavPage(route)) return;
  const visits = readVisits(userId);
  const previous = visits[route];
  visits[route] = { count: (previous?.count ?? 0) + 1, last: now };
  const kept = Object.entries(visits)
    .sort(([, a], [, b]) => b.last - a.last)
    .slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Not remembered; the shortcuts fall back to the department's pages.
  }
}

/** Most visited first, the latest visit breaking ties. */
export function topVisitedRoutes(userId: number, limit: number): string[] {
  return Object.entries(readVisits(userId))
    .filter(([, visit]) => typeof visit?.count === 'number')
    .sort(([, a], [, b]) => b.count - a.count || b.last - a.last)
    .slice(0, limit)
    .map(([route]) => route);
}

/** Mounted once in the shell: counts every page the user opens. */
export function useRecordVisits() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  useEffect(() => {
    recordVisit(user.id, pathname);
  }, [user.id, pathname]);
}

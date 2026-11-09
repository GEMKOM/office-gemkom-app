// Who may open which page, from the cached permission payload (authService).
// Ported from the legacy apis/accessControl.js; the rules are unchanged.
//
// Convention: route `/manufacturing/cnc-cutting/dashboard` -> codename
// `access_manufacturing_cnc_cutting_dashboard` (dashes become underscores),
// checked only when no "Page: /route/" grant decides it.

import { getGrantedPageRoutes, getPermissions, hasPerm, isAdmin } from './authService';
import { MOVED_ROUTES } from '@/routes/movedRoutes';
import { REPORT_CATALOG } from '@/routes/reportCatalog';
import type { NavTree } from '@/shell/navigationStructure';

// '/general/notifications' and '/general/discussions' are personal rather than
// departmental: they only ever show the signed-in user's own notifications,
// topics and comments, so they need no page permission.
//
// The İSG pages are open by design: a safety finding concerns everyone in the
// plant, and anyone can be assigned one. Raising or closing an issue still
// needs `create_isg_issues`, which the API enforces (isg/views.py) and the
// page reads from /isg/issues/my-permissions/ to hide the buttons.
//
// İSG Bildirimleri now hangs off Genel in the menus, so '/general' is open too
// — otherwise the entry would disappear for anyone without an access_general
// grant. Both Genel landing pages filter their cards by route access, so this
// only opens the hub, not the pages under it.
const ALWAYS_ALLOWED_ROUTES = new Set([
  '/',
  '/login',
  '/login/',
  '/general',
  '/general/notifications',
  '/general/discussions',
  '/isg',
  '/isg/issues',
]);

// Routes that are additionally unlocked by a non-page permission codename.
const ROUTE_EXTRA_CODENAMES: Record<string, string[]> = {
  // The Neo analytics page is gated in the backend by manage_assistant_analytics
  // (not a page grant), so holders must see the menu entry and pass the guard.
  '/it/neo': ['manage_assistant_analytics'],
  // Feedback management is gated by manage_feedback in the backend.
  '/it/feedback': ['manage_feedback'],
};

// Routes that inherit access from another page's grant: whoever can open the
// base page can also open the derived page. The derived page can still be
// granted independently via its own "Page:" permission — this is an OR.
const ROUTE_ACCESS_INHERITS: Record<string, string[]> = {
  // Puantaj Formları are printed by whoever keys the welding time entries;
  // the backend page grant (users 0062) mirrors the same rule.
  '/manufacturing/welding/timesheets': ['/manufacturing/welding/time-entries'],
  // Kritik Malzemeler is a companion view of Malzeme Takibi and the PR
  // create flow — whoever marks or buys critical items can monitor them.
  '/procurement/critical-items': [
    '/manufacturing/material-tracking',
    '/procurement/purchase-requests/create',
  ],
  // The Depo section's pages follow the warehouse grant ("Page: /warehouse/",
  // codename access_warehouse).
  '/warehouse/counts': ['/warehouse'],
  '/warehouse/production-slips': ['/warehouse'],
  '/warehouse/transfers': ['/warehouse'],
  // Depo Çekme Talepleri lists what Malzeme Takibi creates — same audience.
  '/manufacturing/material-tracking/pull-requests': ['/manufacturing/material-tracking'],
  // Reports merged from one page per department: the grants stay on the old
  // pages, and the merged page shows each user only the views whose old page
  // they can open (useReportView in pages/manufacturing/reports-shared).
  '/manufacturing/reports/finished-timers': [
    '/manufacturing/cnc-cutting/reports/finished-timers',
    '/manufacturing/machining/reports/finished-timers',
  ],
  '/manufacturing/reports/user-report': [
    '/manufacturing/cnc-cutting/reports/user-report',
    '/manufacturing/machining/reports/user-report',
  ],
  '/manufacturing/reports/job-costs': [
    '/manufacturing/reports/combined-job-costs',
    '/manufacturing/machining/reports/cost-analysis',
    '/manufacturing/welding/reports/cost-analysis',
  ],
};

// A moved page keeps its old route's grants: hasRouteAccess asks the old
// route (movedRoutes.ts), so it opens for exactly whoever could open it before.
const MOVED_FROM: Record<string, string> = Object.fromEntries(
  Object.entries(MOVED_ROUTES).map(([oldRoute, newRoute]) => [newRoute, oldRoute]),
);

/** Routes opened through another page's grant (ROUTE_ACCESS_INHERITS). */
export function inheritedAccessRoutes(): string[] {
  return Object.keys(ROUTE_ACCESS_INHERITS);
}

const REPORT_CENTER_ROUTE = '/reports';

// Everything from the first "?" or "#" on is dropped.
const stripQueryAndHash = (path: string) => path.replace(/[?#][\s\S]*$/, '');

function normalizePath(path: string | null | undefined): string {
  if (!path) return '/';
  const noQuery = stripQueryAndHash(String(path));
  if (noQuery.length > 1 && noQuery.endsWith('/')) return noQuery.slice(0, -1);
  return noQuery || '/';
}

function routeIsAllowedByGrantedPages(route: string): boolean {
  const normalized = normalizePath(route);
  if (ALWAYS_ALLOWED_ROUTES.has(normalized)) return true;
  return getGrantedPageRoutes().has(normalized);
}

/** Whether the current user may open `route` (query and hash are ignored). */
export function hasRouteAccess(route: string): boolean {
  try {
    const normalized = normalizePath(route);

    if (ALWAYS_ALLOWED_ROUTES.has(normalized)) return true;

    // Admin users have access to everything
    if (isAdmin()) return true;

    // The Rapor Merkezi lists only the reports the user can open, so it
    // opens for anyone who can open one of them (reportCatalog.ts).
    if (normalized === REPORT_CENTER_ROUTE) {
      return REPORT_CATALOG.some((report) => hasRouteAccess(report.route));
    }
    // The permission payload names pages: "name": "Page: /some/route/".
    if (routeIsAllowedByGrantedPages(normalized)) return true;

    // Codename-unlocked routes (see ROUTE_EXTRA_CODENAMES above).
    const extraCodenames = ROUTE_EXTRA_CODENAMES[normalized];
    if (extraCodenames && extraCodenames.some((codename) => hasPerm(codename))) {
      return true;
    }

    // A moved page keeps the grants of its old route (movedRoutes.ts).
    const oldRoute = MOVED_FROM[normalized];
    if (oldRoute && hasRouteAccess(oldRoute)) return true;

    // Inherited access: some pages follow another page's grant.
    const inheritsFrom = ROUTE_ACCESS_INHERITS[normalized];
    if (inheritsFrom && inheritsFrom.some((base) => hasRouteAccess(base))) {
      return true;
    }

    // Backward compatibility: codename-based checks for payloads that still
    // carry boolean permissions.
    const segments = normalized
      .split('/')
      .filter(Boolean)
      .map((s) => s.replace(/-/g, '_'));
    if (!segments.length) return false;
    return hasPerm(`access_${segments.join('_')}`);
  } catch (error) {
    console.error('Error checking route access:', error);
    return false; // Default to no access on error
  }
}

/**
 * Whether a navigation section (e.g. "quality_control") has any page the user
 * may open under it ("/quality-control/...").
 */
export function hasSectionAccess(section: string): boolean {
  try {
    if (isAdmin()) return true;

    const s = String(section || '').trim();
    if (!s) return false;

    const normalizedPrefix = normalizePath('/' + s.replace(/_/g, '-'));

    for (const r of getGrantedPageRoutes()) {
      if (!r) continue;
      if (r === normalizedPrefix) return true;
      if (r.startsWith(normalizedPrefix + '/')) return true;
    }

    // Backward compatibility: codename-based section checks
    const base = `access_${s.replace(/-/g, '_')}`;
    if (hasPerm(base)) return true;
    return Object.keys(getPermissions() || {}).some(
      (code) => code === base || code.startsWith(base + '_'),
    );
  } catch (error) {
    console.error('Error checking section access:', error);
    return false;
  }
}

/**
 * The navigation tree without the pages the user cannot open. A section stays
 * when the user may open it or any page under it.
 */
export function filterNavigationByAccess(navigationStructure: NavTree): NavTree {
  try {
    if (isAdmin()) {
      return navigationStructure;
    }

    const filteredStructure: NavTree = {};

    for (const [path, item] of Object.entries(navigationStructure)) {
      // Filter the children first so a section stays visible when the user
      // may open only some pages under it.
      const filteredChildren = filterNavigationByAccess(item.children || {});
      const hasDirectAccess = hasRouteAccess(path);
      const hasVisibleChildren = Object.keys(filteredChildren).length > 0;

      if (hasDirectAccess || hasVisibleChildren) {
        filteredStructure[path] = { ...item, children: filteredChildren };
      }
    }

    return filteredStructure;
  } catch (error) {
    console.error('Error filtering navigation:', error);
    return {};
  }
}

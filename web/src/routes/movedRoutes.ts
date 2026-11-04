// Pages that moved to a new URL, and hubs that gave way to their only page.
// Plain data with no imports, shared by the access rules (auth/accessControl.ts),
// the React router (routes/router.tsx forwards each old URL, query and
// hash kept) and the e2e tests.

// Moved pages, old route -> new route. The grants stay on the old routes:
// hasRouteAccess asks the old route, so a moved page opens for exactly whoever
// could open it before. CNC and linear cutting moved from İmalat to Planlama.
export const MOVED_ROUTES: Record<string, string> = {
  '/manufacturing/cnc-cutting': '/planning/cnc-cutting',
  '/manufacturing/cnc-cutting/dashboard': '/planning/cnc-cutting/dashboard',
  '/manufacturing/cnc-cutting/cuts': '/planning/cnc-cutting/cuts',
  '/manufacturing/cnc-cutting/remnants': '/planning/cnc-cutting/remnants',
  '/manufacturing/cnc-cutting/reports': '/planning/cnc-cutting/reports',
  '/manufacturing/cnc-cutting/reports/parts-search': '/planning/cnc-cutting/reports/parts-search',
  '/manufacturing/cnc-cutting/capacity/planning': '/planning/cnc-cutting/capacity',
  '/manufacturing/linear-cutting': '/planning/linear-cutting',
  '/manufacturing/linear-cutting/dashboard': '/planning/linear-cutting/dashboard',
  '/manufacturing/linear-cutting/cuts': '/planning/linear-cutting/cuts',
  '/manufacturing/linear-cutting/tasks': '/planning/linear-cutting/tasks',
  '/manufacturing/linear-cutting/capacity/planning': '/planning/linear-cutting/capacity',
};

// Hubs that held one card, old route -> that card's page. Forward only: a grant
// on the hub never opened the page, so it does not open it now either.
export const REPLACED_HUB_ROUTES: Record<string, string> = {
  '/manufacturing/cnc-cutting/capacity': '/planning/cnc-cutting/capacity',
  '/manufacturing/linear-cutting/capacity': '/planning/linear-cutting/capacity',
  '/manufacturing/machining/capacity': '/manufacturing/machining/capacity/planning',
};

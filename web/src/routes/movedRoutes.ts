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
  '/manufacturing/cnc-cutting/reports': '/planning/cnc-cutting/reports',
  '/manufacturing/cnc-cutting/reports/parts-search': '/planning/cnc-cutting/reports/parts-search',
  '/manufacturing/cnc-cutting/capacity/planning': '/planning/cnc-cutting/capacity',
  '/manufacturing/linear-cutting': '/planning/linear-cutting',
  '/manufacturing/linear-cutting/dashboard': '/planning/linear-cutting/dashboard',
  '/manufacturing/linear-cutting/cuts': '/planning/linear-cutting/cuts',
  '/manufacturing/linear-cutting/tasks': '/planning/linear-cutting/tasks',
  '/manufacturing/linear-cutting/capacity/planning': '/planning/linear-cutting/capacity',
  // The stock pages moved from Planlama › Stok to Depo › Stoklar.
  '/planning/inventory/cards': '/warehouse/stock',
  '/planning/inventory/equipment': '/warehouse/equipment',
  // Genel was reorganised (2026-11-19): Makineler moved to Depo, Mesailer to
  // İnsan Kaynakları; leave / overtime requests and approvals sit in the user menu.
  '/general/machines': '/warehouse/machines',
  '/general/overtime': '/human_resources/overtime',
  '/general/overtime/pending': '/human_resources/overtime/pending',
  '/general/overtime/registry': '/human_resources/overtime/registry',
  '/general/overtime/users': '/human_resources/overtime/users',
  '/general/overtime/welding-report': '/human_resources/overtime/welding-report',
  '/general/overtime/cost-report': '/human_resources/overtime/cost-report',
  '/general/overtime/machining-report': '/human_resources/overtime/machining-report',
};

// Retired pages, old route -> the page that does their work now. Forward
// only; the page they forward to says who may open it (Sac ve Boy Stoğu
// inherits the old Fire Plakalar grants in accessControl.ts). Fire Plakalar's
// remnant plates live on as plate pieces.
export const RETIRED_ROUTES: Record<string, string> = {
  '/planning/cnc-cutting/remnants': '/warehouse/plate-stock',
  '/manufacturing/cnc-cutting/remnants': '/warehouse/plate-stock',
  // Planlama › Stok held Stok Kartları and Ekipman, both now in Depo.
  '/planning/inventory': '/warehouse',
};

// Sac ve Boy Stoğu split into Sac Stoğu and Boy Stoğu (the same page, one kind
// each). Its old URL forwards by ?kind= (router.tsx): to Boy Stoğu for
// ?kind=boy, else to the page listed here.
export const PIECES_ROUTE = '/warehouse/pieces';
export const PLATE_STOCK_ROUTE = '/warehouse/plate-stock';
export const BAR_STOCK_ROUTE = '/warehouse/bar-stock';
export const PIECES_FORWARD: Record<string, string> = {
  '/warehouse/pieces': '/warehouse/plate-stock',
};

// Hubs that held one card, old route -> that card's page. Forward only: a grant
// on the hub never opened the page, so it does not open it now either.
export const REPLACED_HUB_ROUTES: Record<string, string> = {
  '/manufacturing/cnc-cutting/capacity': '/planning/cnc-cutting/capacity',
  '/manufacturing/linear-cutting/capacity': '/planning/linear-cutting/capacity',
  '/manufacturing/machining/capacity': '/manufacturing/machining/capacity/planning',
};

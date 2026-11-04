import migratedRoutes from './migrated-routes.json';

// Routes served by the React app; a link anywhere else is a full page load.
// The deployed site serves the SPA for every path (/404.html is the entry, see
// scripts/assemble.mjs), so the list is the router's table of pages, not a
// list of files.
const MIGRATED = new Set<string>(migratedRoutes.map(normalizeRoute));

// Dev-only screens (component preview etc.); never listed in the JSON, so they
// are never published.
const DEV_PREFIX = '/react-preview';

/** "/sales/customers/?q=1#x" -> "/sales/customers" (the root stays "/"). */
export function normalizeRoute(path: string): string {
  const bare = path.split(/[?#]/)[0] || '/';
  return bare.length > 1 && bare.endsWith('/') ? bare.slice(0, -1) : bare;
}

export function isMigratedRoute(path: string): boolean {
  const route = normalizeRoute(path);
  if (import.meta.env.DEV && (route === DEV_PREFIX || route.startsWith(DEV_PREFIX + '/'))) {
    return true;
  }
  return MIGRATED.has(route);
}

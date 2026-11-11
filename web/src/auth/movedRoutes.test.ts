import { filterNavigationByAccess, hasRouteAccess } from '@/auth/accessControl';
import { MOVED_ROUTES, REPLACED_HUB_ROUTES } from '@/routes/movedRoutes';
import { NAVIGATION_STRUCTURE } from '@/shell/navigationStructure';
import migratedRoutes from '@/routes/migrated-routes.json';
import { findTrail } from '@/shell/navModel';

// The real access rules (auth/accessControl.ts) for pages that moved: the
// grants stay on the old routes, so the new URL opens for exactly the same users.

const legacy = vi.hoisted(() => ({ grantedPages: new Set<string>() }));

vi.mock('@/auth/authService', () => ({
  isAdmin: () => false,
  hasPerm: () => false,
  getPermissions: () => ({}),
  getGrantedPageRoutes: () => legacy.grantedPages,
}));

const moved = Object.entries(MOVED_ROUTES);

describe('moved pages', () => {
  it.each(moved)('%s opens its new URL through the old grant only', (oldRoute, newRoute) => {
    legacy.grantedPages = new Set();
    expect(hasRouteAccess(newRoute)).toBe(false);
    legacy.grantedPages = new Set([oldRoute]);
    expect(hasRouteAccess(newRoute)).toBe(true);
    expect(hasRouteAccess(`${newRoute}/?x=1`)).toBe(true);
  });

  it('opens no other moved page through one grant', () => {
    legacy.grantedPages = new Set(['/manufacturing/cnc-cutting/remnants']);
    const open = moved.filter(([, newRoute]) => hasRouteAccess(newRoute)).map(([, n]) => n);
    expect(open).toEqual(['/planning/cnc-cutting/remnants']);
  });

  it('keeps a capacity hub grant from opening the planner it now forwards to', () => {
    legacy.grantedPages = new Set(Object.keys(REPLACED_HUB_ROUTES));
    for (const target of Object.values(REPLACED_HUB_ROUTES))
      expect(hasRouteAccess(target)).toBe(false);
  });

  it('serves every new URL and keeps every old one forwarding', () => {
    for (const [oldRoute, newRoute] of [...moved, ...Object.entries(REPLACED_HUB_ROUTES)]) {
      expect(migratedRoutes).toContain(oldRoute);
      expect(migratedRoutes).toContain(newRoute);
    }
  });

  it('puts the moved pages under Planlama in the menu', () => {
    for (const [oldRoute, newRoute] of moved) {
      expect(findTrail(NAVIGATION_STRUCTURE, newRoute).at(-1)?.path).toBe(newRoute);
      expect(findTrail(NAVIGATION_STRUCTURE, newRoute)[0]?.path).toBe('/planning');
      expect(findTrail(NAVIGATION_STRUCTURE, oldRoute).map((s) => s.path)).not.toContain(oldRoute);
    }
  });

  it('shows the menu entries an old grant opens', () => {
    legacy.grantedPages = new Set(['/manufacturing/cnc-cutting/remnants']);
    const tree = filterNavigationByAccess(NAVIGATION_STRUCTURE);
    // '/', '/quiz' and '/general' are open to everyone.
    expect(Object.keys(tree)).toEqual(['/', '/quiz', '/general', '/planning', '/warehouse']);
    const planning = tree['/planning']!.children;
    expect(Object.keys(planning)).toEqual(['/planning/cnc-cutting']);
    expect(Object.keys(planning['/planning/cnc-cutting']!.children)).toEqual([
      '/planning/cnc-cutting/remnants',
    ]);
    // Sac ve Boy Stoğu holds the remnants too, so the same grant opens it.
    expect(Object.keys(tree['/warehouse']!.children)).toEqual(['/warehouse/pieces']);
  });
});

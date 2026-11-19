import { filterNavigationByAccess, hasRouteAccess } from '@/auth/accessControl';
import { MOVED_ROUTES, REPLACED_HUB_ROUTES, RETIRED_ROUTES } from '@/routes/movedRoutes';
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
    legacy.grantedPages = new Set(['/manufacturing/cnc-cutting/cuts']);
    const open = moved.filter(([, newRoute]) => hasRouteAccess(newRoute)).map(([, n]) => n);
    expect(open).toEqual(['/planning/cnc-cutting/cuts']);
  });

  it('keeps a capacity hub grant from opening the planner it now forwards to', () => {
    legacy.grantedPages = new Set(Object.keys(REPLACED_HUB_ROUTES));
    for (const target of Object.values(REPLACED_HUB_ROUTES))
      expect(hasRouteAccess(target)).toBe(false);
  });

  it('serves every new URL and keeps every old one forwarding', () => {
    for (const [oldRoute, newRoute] of [
      ...moved,
      ...Object.entries(REPLACED_HUB_ROUTES),
      ...Object.entries(RETIRED_ROUTES),
    ]) {
      expect(migratedRoutes).toContain(oldRoute);
      expect(migratedRoutes).toContain(newRoute);
    }
  });

  it('puts each moved page in its new section of the menu (cutting under Planlama, stock under Depo)', () => {
    // Mesai onayları is reached from the user menu (Onayımı Bekleyenler), not a section.
    const userMenuOnly = new Set(['/human_resources/overtime/pending']);
    for (const [oldRoute, newRoute] of moved) {
      if (userMenuOnly.has(newRoute)) continue;
      expect(findTrail(NAVIGATION_STRUCTURE, newRoute).at(-1)?.path).toBe(newRoute);
      expect(findTrail(NAVIGATION_STRUCTURE, newRoute)[0]?.path).toBe(`/${newRoute.split('/')[1]}`);
      expect(findTrail(NAVIGATION_STRUCTURE, oldRoute).map((s) => s.path)).not.toContain(oldRoute);
    }
  });

  it('shows the menu entries an old grant opens', () => {
    legacy.grantedPages = new Set(['/manufacturing/cnc-cutting/cuts']);
    const tree = filterNavigationByAccess(NAVIGATION_STRUCTURE);
    // '/', '/quiz', '/general' (Talepler) and '/isg' are open to everyone.
    expect(Object.keys(tree)).toEqual(['/', '/quiz', '/general', '/isg', '/planning', '/warehouse']);
    const planning = tree['/planning']!.children;
    expect(Object.keys(planning)).toEqual(['/planning/cnc-cutting']);
    // A CNC planner also sees Sac Stoğu, the Depo page under CNC Kesim.
    expect(Object.keys(planning['/planning/cnc-cutting']!.children)).toEqual([
      '/planning/cnc-cutting/cuts',
      '/planning/cnc-cutting/plate-stock',
    ]);
    // ...and under Depo › Stoklar (they write plate pieces), nothing else of Depo.
    expect(Object.keys(tree['/warehouse']!.children)).toEqual(['/warehouse#stoklar']);
    expect(Object.keys(tree['/warehouse']!.children['/warehouse#stoklar']!.children)).toEqual([
      '/warehouse/plate-stock',
    ]);
  });

  it('an old Stok Kartları grant shows Tüm Stok Kartları under Depo › Stoklar', () => {
    legacy.grantedPages = new Set(['/planning/inventory/cards']);
    const tree = filterNavigationByAccess(NAVIGATION_STRUCTURE);
    expect(Object.keys(tree)).toEqual(['/', '/quiz', '/general', '/isg', '/warehouse']);
    expect(Object.keys(tree['/warehouse']!.children)).toEqual(['/warehouse#stoklar']);
    expect(Object.keys(tree['/warehouse']!.children['/warehouse#stoklar']!.children)).toEqual([
      '/warehouse/stock',
    ]);
  });

  it('a Fire Plakalar grant (retired page) opens Sac Stoğu, which took its remnants', () => {
    for (const grant of ['/planning/cnc-cutting/remnants', '/manufacturing/cnc-cutting/remnants']) {
      expect(RETIRED_ROUTES[grant]).toBe('/warehouse/plate-stock');
      legacy.grantedPages = new Set([grant]);
      const tree = filterNavigationByAccess(NAVIGATION_STRUCTURE);
      expect(Object.keys(tree)).toEqual(['/', '/quiz', '/general', '/isg', '/planning', '/warehouse']);
      expect(Object.keys(tree['/warehouse']!.children['/warehouse#stoklar']!.children)).toEqual([
        '/warehouse/plate-stock',
      ]);
      expect(Object.keys(tree['/planning']!.children['/planning/cnc-cutting']!.children)).toEqual([
        '/planning/cnc-cutting/plate-stock',
      ]);
    }
    expect(
      findTrail(NAVIGATION_STRUCTURE, '/planning/cnc-cutting/remnants').map((s) => s.path),
    ).not.toContain('/planning/cnc-cutting/remnants');
  });
});

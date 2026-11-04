import {
  filterNavigationByAccess,
  hasRouteAccess,
  hasSectionAccess,
  inheritedAccessRoutes,
} from './accessControl';
import type { NavTree } from '@/shell/navigationStructure';

// The access rules on top of the real permission cache (authService reads
// localStorage), as a signed-in session leaves it.

function grant(perms: Record<string, unknown>, user: object = { id: 1 }) {
  localStorage.setItem('permissions', JSON.stringify(perms));
  localStorage.setItem('user', JSON.stringify(user));
  // Another tab's write is how the cache learns about it.
  window.dispatchEvent(new StorageEvent('storage', { key: 'permissions' }));
}

const page = (route: string) => ({ granted: true, name: `Page: ${route}` });

afterEach(() => localStorage.clear());

describe('hasRouteAccess', () => {
  it('opens the always-open pages to everyone', () => {
    grant({});
    for (const route of ['/', '/general', '/general/notifications/', '/isg/issues?issue=3']) {
      expect(hasRouteAccess(route)).toBe(true);
    }
    expect(hasRouteAccess('/sales/offers')).toBe(false);
  });

  it('opens a granted page, with or without slash, query and hash', () => {
    grant({ p: page('/sales/offers/') });
    expect(hasRouteAccess('/sales/offers')).toBe(true);
    expect(hasRouteAccess('/sales/offers/?offer_no=1#x')).toBe(true);
    expect(hasRouteAccess('/sales/customers')).toBe(false);
  });

  it('lets admins through everywhere', () => {
    grant({}, { is_admin: true });
    expect(hasRouteAccess('/it/permissions')).toBe(true);
  });

  it('unlocks pages by codename, inheritance and the boolean fallback', () => {
    grant({
      manage_feedback: true,
      t: page('/manufacturing/welding/time-entries/'),
      access_quality_control_ncrs: true,
    });
    expect(hasRouteAccess('/it/feedback')).toBe(true);
    expect(hasRouteAccess('/manufacturing/welding/timesheets')).toBe(true);
    expect(hasRouteAccess('/quality-control/ncrs')).toBe(true);
    expect(inheritedAccessRoutes()).toContain('/manufacturing/welding/timesheets');
  });

  it('opens the report center for anyone who can open one report in it', () => {
    grant({});
    expect(hasRouteAccess('/reports')).toBe(false);
    grant({ p: page('/manufacturing/machining/reports/cost-analysis/') });
    expect(hasRouteAccess('/reports')).toBe(true);
  });
});

describe('sections and the menu', () => {
  const tree: NavTree = {
    '/sales': {
      label: 'Satış',
      icon: 'fas fa-handshake',
      children: {
        '/sales/offers': { label: 'Teklifler', icon: 'fas fa-file', children: {} },
        '/sales/customers': { label: 'Müşteriler', icon: 'fas fa-users', children: {} },
      },
    },
    '/finance': { label: 'Finans', icon: 'fas fa-coins', children: {} },
  };

  it('shows a section for a granted page under it', () => {
    grant({ p: page('/quality-control/ncrs/') });
    expect(hasSectionAccess('quality_control')).toBe(true);
    expect(hasSectionAccess('sales')).toBe(false);
  });

  it('keeps a parent for one visible child and drops the rest', () => {
    grant({ p: page('/sales/offers/') });
    expect(filterNavigationByAccess(tree)).toEqual({
      '/sales': {
        ...tree['/sales'],
        children: { '/sales/offers': tree['/sales']!.children['/sales/offers'] },
      },
    });
  });
});

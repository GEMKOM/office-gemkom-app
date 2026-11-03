import { NAVIGATION_STRUCTURE, type NavTree } from '@legacy/navigationStructure.js';
import { findNavPage, readVisits, recordVisit, topVisitedRoutes } from './pageVisits';

beforeEach(() => localStorage.clear());

it('finds a menu page with the section it sits in', () => {
  expect(findNavPage('/sales/offers')).toEqual({
    path: '/sales/offers',
    label: 'Teklifler',
    icon: expect.any(String),
    section: 'Satış',
  });
  expect(findNavPage('/sales')).toMatchObject({ label: 'Satış', section: null });
  expect(findNavPage('/sales/offers/123')).toBeNull();
});

it('counts menu pages per user, most visited first, the latest breaking ties', () => {
  recordVisit(1, '/sales/offers/', 100);
  recordVisit(1, '/sales/offers?offer_no=OF-1', 200);
  recordVisit(1, '/procurement/payment-lists', 300);
  recordVisit(1, '/sales/customers', 400);
  recordVisit(2, '/it/inventory', 500);

  expect(topVisitedRoutes(1, 5)).toEqual(['/sales/offers', '/sales/customers', '/procurement/payment-lists']);
  expect(readVisits(1)['/sales/offers']).toEqual({ count: 2, last: 200 });
  expect(topVisitedRoutes(2, 5)).toEqual(['/it/inventory']);
});

it('skips the home page and paths the menu does not list', () => {
  recordVisit(1, '/');
  recordVisit(1, '/react-preview/ui');
  expect(readVisits(1)).toEqual({});
});

it('keeps only the 40 most recent pages', () => {
  const routes: string[] = [];
  const walk = (tree: NavTree) => {
    for (const [path, item] of Object.entries(tree)) {
      if (path !== '/') routes.push(path);
      walk(item.children ?? {});
    }
  };
  walk(NAVIGATION_STRUCTURE);
  expect(routes.length).toBeGreaterThan(40);
  routes.forEach((route, i) => recordVisit(1, route, i));

  const kept = Object.keys(readVisits(1));
  expect(kept).toHaveLength(40);
  expect(kept).toContain(routes.at(-1));
  expect(kept).not.toContain(routes[0]);
});

it('reads broken storage as no visits', () => {
  localStorage.setItem('gk.pageVisits.1', '{not json');
  expect(topVisitedRoutes(1, 3)).toEqual([]);
  recordVisit(1, '/sales/offers', 1);
  expect(topVisitedRoutes(1, 3)).toEqual(['/sales/offers']);
});

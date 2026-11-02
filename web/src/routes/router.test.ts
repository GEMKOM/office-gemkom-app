import migratedRoutes from './migrated-routes.json';
import { normalizeRoute } from './migrated';
import { appRoutes } from './router';

// The router and migrated-routes.json have to agree: a route missing from the
// JSON never gets its index.html at deploy time, and a JSON entry without a
// route would publish an SPA page that only shows "Sayfa bulunamadı".
describe('migrated routes', () => {
  it('lists every app route in migrated-routes.json and nothing else', () => {
    const routerPaths = appRoutes.map((r) => normalizeRoute(r.path ?? '')).sort();
    const listed = migratedRoutes.map(normalizeRoute).sort();
    expect(routerPaths).toEqual(listed);
  });

  it('stores routes normalized', () => {
    for (const route of migratedRoutes) expect(route).toBe(normalizeRoute(route));
  });
});

describe('normalizeRoute', () => {
  it('drops the trailing slash, query and hash but keeps the root', () => {
    expect(normalizeRoute('/sales/customers/?q=1#top')).toBe('/sales/customers');
    expect(normalizeRoute('/')).toBe('/');
    expect(normalizeRoute('/?x=1')).toBe('/');
  });
});

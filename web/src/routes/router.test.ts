import migratedRoutes from './migrated-routes.json';
import { normalizeRoute } from './migrated';
import { appRoutes, publicRoutes, routeTree } from './router';
import { RouteLoading } from './RouteLoading';

// The router and migrated-routes.json have to agree: a route missing from the
// JSON never gets its index.html at deploy time, and a JSON entry without a
// route would publish an SPA page that only shows "Sayfa bulunamadı".
describe('migrated routes', () => {
  it('lists every app route in migrated-routes.json and nothing else', () => {
    const routerPaths = [...publicRoutes, ...appRoutes].map((r) => normalizeRoute(r.path ?? '')).sort();
    const listed = migratedRoutes.map(normalizeRoute).sort();
    expect(routerPaths).toEqual(listed);
  });

  it('stores routes normalized', () => {
    for (const route of migratedRoutes) expect(route).toBe(normalizeRoute(route));
  });
});

describe('route tree', () => {
  // Every page is lazy, so a full load needs a fallback above all of them.
  it('has one top route with the loading fallback over every page', () => {
    expect(routeTree).toHaveLength(1);
    expect(routeTree[0]!.HydrateFallback).toBe(RouteLoading);
    expect(routeTree[0]!.path).toBeUndefined();
    const children = routeTree[0]!.children ?? [];
    for (const route of publicRoutes) expect(children).toContain(route);
    expect(children.some((r) => appRoutes.every((a) => r.children?.includes(a)))).toBe(true);
  });
});

describe('normalizeRoute', () => {
  it('drops the trailing slash, query and hash but keeps the root', () => {
    expect(normalizeRoute('/sales/customers/?q=1#top')).toBe('/sales/customers');
    expect(normalizeRoute('/')).toBe('/');
    expect(normalizeRoute('/?x=1')).toBe('/');
  });
});

describe('merged reports', () => {
  async function landing(url: string) {
    const target = appRoutes.find((r) => r.path === url.split('?')[0]);
    expect(target?.loader).toBeTypeOf('function');
    const loader = target!.loader as (args: { request: Request }) => Response;
    const response = loader({ request: new Request(`https://ofis.test${url}`) });
    return response.headers.get('Location');
  }

  it('forward the old URLs with the view preset and the rest of the query', async () => {
    expect(await landing('/manufacturing/cnc-cutting/reports/finished-timers')).toBe(
      '/manufacturing/reports/finished-timers/?module=cnc_cutting',
    );
    expect(await landing('/manufacturing/machining/reports/finished-timers?edit=12')).toBe(
      '/manufacturing/reports/finished-timers/?edit=12&module=machining',
    );
    expect(await landing('/manufacturing/cnc-cutting/reports/user-report')).toBe(
      '/manufacturing/reports/user-report/?module=cnc_cutting',
    );
    expect(await landing('/manufacturing/machining/reports/user-report')).toBe(
      '/manufacturing/reports/user-report/?module=machining',
    );
    expect(await landing('/manufacturing/reports/combined-job-costs?job_no=225')).toBe(
      '/manufacturing/reports/job-costs/?job_no=225&breakdown=combined',
    );
    expect(await landing('/manufacturing/machining/reports/cost-analysis')).toBe(
      '/manufacturing/reports/job-costs/?breakdown=machining',
    );
    expect(await landing('/manufacturing/welding/reports/cost-analysis?date_after=2026-10-01')).toBe(
      '/manufacturing/reports/job-costs/?date_after=2026-10-01&breakdown=welding',
    );
  });
});

describe('moved pages', () => {
  async function landing(url: string) {
    const target = appRoutes.find((r) => r.path === url.split('?')[0]);
    expect(target?.loader).toBeTypeOf('function');
    const loader = target!.loader as (args: { request: Request }) => Response;
    const response = await loader({ request: new Request(`https://ofis.test${url}`) });
    return response.headers.get('Location');
  }

  it('forward the old URLs under Planlama with the query', async () => {
    expect(await landing('/manufacturing/cnc-cutting/cuts?cut=CNC-7&mode=edit')).toBe(
      '/planning/cnc-cutting/cuts/?cut=CNC-7&mode=edit',
    );
    expect(await landing('/manufacturing/linear-cutting')).toBe('/planning/linear-cutting/');
    expect(await landing('/manufacturing/linear-cutting/capacity/planning?machine=5')).toBe(
      '/planning/linear-cutting/capacity/?machine=5',
    );
  });

  it('open the planner from the one-card capacity hubs', async () => {
    expect(await landing('/manufacturing/cnc-cutting/capacity?machine=3')).toBe(
      '/planning/cnc-cutting/capacity/?machine=3',
    );
    expect(await landing('/manufacturing/machining/capacity?machine=21')).toBe(
      '/manufacturing/machining/capacity/planning/?machine=21',
    );
  });
});

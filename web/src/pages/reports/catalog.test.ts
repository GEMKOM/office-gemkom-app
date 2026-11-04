import { NAVIGATION_STRUCTURE, type NavTree } from '@/shell/navigationStructure';
import {
  REPORT_CATALOG,
  REPORT_DEPARTMENTS,
  REPORT_HUBS,
  REPORT_TOPICS,
} from '@/routes/reportCatalog';
import migratedRoutes from '@/routes/migrated-routes.json';
import { appRoutes } from '@/routes/router';
import {
  catalogItems,
  departmentOptions,
  groupByTopic,
  matchesSearch,
  readFavourites,
  writeFavourites,
} from './catalog';

const entry = (route: string) => REPORT_CATALOG.find((r) => r.route === route)!;
const links = (items: { link: string }[]) => items.map((i) => i.link);

function menuLeaves(tree: NavTree): string[] {
  return Object.entries(tree).flatMap(([path, item]) => {
    const children = Object.keys(item.children ?? {});
    return children.length ? menuLeaves(item.children) : [path];
  });
}

describe('reportCatalog', () => {
  it('lists real pages with known topics and departments', () => {
    const pages = new Set(migratedRoutes);
    for (const report of REPORT_CATALOG) {
      expect(pages, report.route).toContain(report.route);
      expect(Object.keys(REPORT_TOPICS)).toContain(report.topic);
      expect(report.question.endsWith('?'), report.route).toBe(true);
      for (const d of report.departments) expect(Object.keys(REPORT_DEPARTMENTS)).toContain(d);
      for (const [d, view] of Object.entries(report.views ?? {})) {
        expect(report.departments).toContain(d);
        expect(pages, view.route).toContain(view.route);
      }
    }
    expect(new Set(REPORT_CATALOG.map((r) => r.route)).size).toBe(REPORT_CATALOG.length);
  });

  it('has an entry for every report and dashboard in the menu', () => {
    const catalogued = new Set(REPORT_CATALOG.map((r) => r.route));
    const reports = menuLeaves(NAVIGATION_STRUCTURE).filter(
      (path) => /\/reports\/|\/dashboard$|\/analytics$|\/summary$|\/overview$/.test(path),
    );
    expect(reports.length).toBeGreaterThan(20);
    expect(reports.filter((path) => !catalogued.has(path))).toEqual([]);
  });

  it('has a hub route for every report hub', () => {
    const routes = new Map(appRoutes.map((r) => [r.path, r]));
    for (const [path, hub] of Object.entries(REPORT_HUBS)) {
      expect(routes.get(path)?.handle, path).toEqual({ access: 'hub' });
      for (const d of hub.departments) expect(Object.keys(REPORT_DEPARTMENTS)).toContain(d);
    }
  });
});

describe('catalogItems', () => {
  it('shows only what the user can open', () => {
    const granted = new Set(['/procurement/reports/items', '/management/dashboard']);
    expect(links(catalogItems({}, (r) => granted.has(r)))).toEqual([
      '/procurement/reports/items',
      '/management/dashboard',
    ]);
  });

  it("opens a merged report at the department's view, by that view's old grant", () => {
    const cncOnly = (route: string) =>
      route === '/manufacturing/cnc-cutting/reports/finished-timers' ||
      // The merged route itself opens through the CNC grant.
      route === '/manufacturing/reports/finished-timers';

    expect(links(catalogItems({ departments: ['cnc'] }, cncOnly))).toEqual([
      '/manufacturing/reports/finished-timers?module=cnc_cutting',
    ]);
    expect(catalogItems({ departments: ['machining'] }, cncOnly)).toEqual([]);
    // A filter picks the view too; with neither, the merged report opens as itself.
    expect(links(catalogItems({ department: 'cnc' }, cncOnly))).toEqual([
      '/manufacturing/reports/finished-timers?module=cnc_cutting',
    ]);
    expect(links(catalogItems({}, cncOnly))).toEqual(['/manufacturing/reports/finished-timers']);
  });

  it('keeps a hub to its departments and offers only those with something to open', () => {
    const items = catalogItems(REPORT_HUBS['/manufacturing/reports']!, () => true);
    // CNC and linear cutting pages sit under Planlama but are still the shop's reports.
    const shop = ['/manufacturing/', '/general/overtime/', '/planning/cnc-cutting/', '/planning/linear-cutting/'];
    expect(items.every((i) => shop.some((prefix) => i.entry.route.startsWith(prefix)))).toBe(true);
    expect(departmentOptions(items, REPORT_HUBS['/manufacturing/reports']!.departments).map((o) => o.value)).toEqual([
      'machining',
      'cnc',
      'linear',
      'welding',
      'maintenance',
      'subcontracting',
    ]);
  });
});

describe('matchesSearch', () => {
  it('matches every word, Turkish case-insensitively, over question, departments and keywords', () => {
    const jobCosts = entry('/manufacturing/reports/job-costs');
    expect(matchesSearch(jobCosts, 'İŞ MALİYETİ')).toBe(true);
    expect(matchesSearch(jobCosts, 'kaynaklı saat')).toBe(true);
    expect(matchesSearch(jobCosts, 'maliyet analizi')).toBe(true);
    expect(matchesSearch(jobCosts, 'tedarikçi')).toBe(false);
    expect(matchesSearch(entry('/procurement/reports/suppliers'), 'dbs')).toBe(true);
    expect(matchesSearch(jobCosts, '  ')).toBe(true);
  });
});

describe('groupByTopic', () => {
  it('pins favourites first without repeating them under their topic', () => {
    const items = catalogItems({ departments: ['procurement', 'finance'] }, () => true);
    const groups = groupByTopic(items, new Set(['/procurement/reports/staff']));
    expect(groups.map((g) => g.label)).toEqual(['Favoriler', 'Satın Alma', 'Finans']);
    expect(groups[0]!.items.map((i) => i.entry.title)).toEqual(['Personel Raporu']);
    expect(groups[1]!.items.map((i) => i.entry.title)).toEqual(['Ürün Raporu', 'Tedarikçi Raporu']);
  });
});

describe('favourites', () => {
  afterEach(() => localStorage.clear());

  it('are kept per user and survive broken storage', () => {
    writeFavourites(7, ['/management/dashboard']);
    expect(readFavourites(7)).toEqual(['/management/dashboard']);
    expect(readFavourites(8)).toEqual([]);
    localStorage.setItem('gk.reportFavourites.9', '{not json');
    expect(readFavourites(9)).toEqual([]);
  });
});

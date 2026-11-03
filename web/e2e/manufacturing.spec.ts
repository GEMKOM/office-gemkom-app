import { expect, mockBackend, paginated, seedSession, test } from './fixtures';

// The manufacturing hubs. Contracts:
//   /manufacturing/               "İmalat", a lane per area (pages, live figures,
//                                 records): GET /welding/hub-summary/,
//                                 /machining/timers/, /machines/faults/ (one-row
//                                 DRF pages for counts) and the area lists
//   /manufacturing/<area>/...     each area's hub; cards filtered by grants

const count = (n: number) => ({ json: { ...paginated([]), count: n } });

const cardTitles = (page: import('@playwright/test').Page) =>
  page.getByRole('main').locator('article h3').allTextContents();

const laneNames = (page: import('@playwright/test').Page) =>
  page
    .getByRole('main')
    .getByRole('region')
    .evaluateAll((lanes) => lanes.map((l) => l.getAttribute('aria-label')));

const WELDING_SUMMARY = {
  open_tasks: 9,
  open_kg: 40100,
  overdue_tasks: 2,
  overdue_kg: 7300,
  month_welded_kg: 12800,
  resources: [
    {
      resource_type: 'subcontractor',
      id: 1,
      name: 'Demir Çelik',
      open_tasks: 5,
      overdue_tasks: 2,
      open_kg: 30000,
      overdue_kg: 7300,
      month_kg: 9000,
    },
    {
      resource_type: 'team',
      id: 2,
      name: 'Usta Kaynak',
      open_tasks: 4,
      overdue_tasks: 0,
      open_kg: 10100,
      overdue_kg: 0,
      month_kg: 3800,
    },
  ],
};

test('admin: the section hub shows a lane per area with its live figures', async ({
  page,
  consoleErrors,
}) => {
  const session = await seedSession(page, { admin: true });
  const backend = await mockBackend(
    page,
    {
      'GET /welding/hub-summary/': { json: WELDING_SUMMARY },
      'GET /machining/timers/': {
        json: paginated([
          {
            id: 1,
            username: 'mehmet',
            machine_name: 'Torna 1',
            issue_key: 'TI-1',
            issue_name: 'Flanş',
            start_time: Date.now() - 600_000,
            timer_type: 'productive',
          },
        ]),
      },
      'GET /machines/faults/': count(12),
    },
    { session },
  );

  await page.goto('/manufacturing/');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'İmalat', level: 1 })).toBeVisible();
  await expect(main.getByRole('region').first()).toBeVisible();
  expect(await laneNames(page)).toEqual([
    'Kaynaklı İmalat',
    'Talaşlı İmalat',
    'Bakım',
    'Taşeron',
    'Malzeme',
    'Projeler',
  ]);

  const welding = main.getByRole('region', { name: 'Kaynaklı İmalat' });
  await expect(welding).toContainText('12,8 t');
  await expect(welding.getByRole('link', { name: /Demir Çelik/ })).toContainText('2 gecikmiş');
  await expect(main.locator('#lateWelding')).toContainText('2');
  await expect(main.locator('#timers')).toContainText('1');
  await expect(main.getByRole('region', { name: 'Talaşlı İmalat' })).toContainText('Torna 1');
  await expect(main.getByRole('region', { name: 'Bakım' })).toContainText('12');
  // The stopped-machine count is asked for once, though the band and the lane show it.
  const faultQueries = backend.callsTo('/machines/faults/', 'GET').map((c) => c.query);
  expect(
    faultQueries.filter((q) => q === '?unresolved=true&is_breaking=true&page_size=1'),
  ).toHaveLength(1);
  expect(backend.callsTo('/welding/hub-summary/')).toHaveLength(1);

  // Into an area hub without a page load.
  await page.evaluate(() => {
    (window as Window & { __spaMarker?: string }).__spaMarker = 'still-here';
  });
  await main
    .getByRole('region', { name: 'Talaşlı İmalat' })
    .getByRole('link', { name: 'Talaşlı İmalat', exact: true })
    .click();
  await expect(page).toHaveURL(/\/manufacturing\/machining\/?$/);
  await expect(main.getByRole('heading', { name: 'Talaşlı İmalat', level: 1 })).toBeVisible();
  expect(await cardTitles(page)).toEqual([
    'Dashboard',
    'Görevler',
    'Raporlar',
    'Kapasite Planlayıcı',
  ]);
  expect(await page.evaluate(() => (window as Window & { __spaMarker?: string }).__spaMarker)).toBe(
    'still-here',
  );
  consoleErrors.expectNone();
});

test('a user with some grants sees only their lanes and figures', async ({
  page,
  consoleErrors,
}) => {
  const session = await seedSession(page, {
    admin: false,
    grants: [
      '/manufacturing/maintenance/',
      '/manufacturing/maintenance/fault-requests/',
      '/manufacturing/welding/time-entries/',
    ],
  });
  const backend = await mockBackend(
    page,
    { 'GET /machines/faults/': count(4), 'GET /welding/hub-summary/': { json: WELDING_SUMMARY } },
    { session },
  );

  await page.goto('/manufacturing/');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'İmalat', level: 1 })).toBeVisible();
  await expect(main.getByRole('region').first()).toBeVisible();
  expect(await laneNames(page)).toEqual(['Kaynaklı İmalat', 'Bakım']);
  // Grants are per page: only the granted links stay (Puantaj Onayı follows
  // the time entries grant, ROUTE_ACCESS_INHERITS).
  await expect(
    main.getByRole('region', { name: 'Bakım' }).getByRole('navigation').getByRole('link'),
  ).toHaveText(['Arıza Talepleri']);
  await expect(
    main.getByRole('region', { name: 'Kaynaklı İmalat' }).getByRole('navigation').getByRole('link'),
  ).toHaveText(['Zaman Kayıtları', 'Puantaj Onayı']);
  await expect(main.getByRole('region', { name: 'Bakım' })).toContainText('4');
  await expect(main.locator('#timers')).toHaveCount(0);
  expect(backend.callsTo('/machining/timers/')).toHaveLength(0);
  expect(backend.callsTo('/cnc_cutting/timers/')).toHaveLength(0);

  await page.goto('/manufacturing/welding/');
  await expect(main.getByRole('heading', { name: 'Kaynak Modülü' })).toBeVisible();
  // Puantaj Onayı follows the time entries grant (ROUTE_ACCESS_INHERITS).
  expect(await cardTitles(page)).toEqual(['Zaman Kayıtları', 'Puantaj Onayı']);

  await page.goto('/manufacturing/machining/');
  await expect(main.getByRole('heading', { name: 'Erişim yetkiniz yok' })).toBeVisible();
  consoleErrors.expectNone();
});

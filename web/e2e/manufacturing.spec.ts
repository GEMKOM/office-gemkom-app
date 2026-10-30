import { expect, mockBackend, paginated, seedSession, test } from './fixtures';

// The manufacturing hubs (one React page, cards by path). Contracts:
//   /manufacturing/               "İmalat Modülü", ten cards, band counts from
//                                 GET /machining/timers/, /cnc_cutting/timers/
//                                 and /machines/faults/ (one-row DRF pages)
//   /manufacturing/<area>/...     each area's hub; cards filtered by grants

const count = (n: number) => ({ json: { ...paginated([]), count: n } });

const cardTitles = (page: import('@playwright/test').Page) =>
  page.getByRole('main').locator('article h3').allTextContents();

test('admin: the section hub shows every card and its live counts', async ({ page, consoleErrors }) => {
  const session = await seedSession(page, { admin: true });
  const backend = await mockBackend(
    page,
    {
      'GET /machining/timers/': count(7),
      'GET /cnc_cutting/timers/': count(2),
      'GET /machines/faults/': count(12),
    },
    { session },
  );

  await page.goto('/manufacturing/');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'İmalat Modülü' })).toBeVisible();
  await expect(main.locator('#openFaults')).toContainText('12');
  await expect(main.locator('#machiningTimers')).toContainText('7');
  await expect(main.locator('#cncTimers')).toContainText('2');
  expect(await cardTitles(page)).toEqual([
    'Projeler',
    'Talaşlı İmalat',
    'CNC Kesim',
    'Lineer Kesim',
    'Bakım',
    'Kaynak',
    'Raporlar',
    'Taşeron',
    'Malzeme Takibi',
    'Depo Çekme Talepleri',
  ]);
  expect(backend.callsTo('/machines/faults/', 'GET')).toHaveLength(1);

  // Into an area hub without a page load.
  await page.evaluate(() => {
    (window as Window & { __spaMarker?: string }).__spaMarker = 'still-here';
  });
  await main.getByRole('link', { name: 'Talaşlı İmalat', exact: true }).click();
  await expect(page).toHaveURL(/\/manufacturing\/machining\/?$/);
  await expect(main.getByRole('heading', { name: 'Talaşlı İmalat', level: 1 })).toBeVisible();
  expect(await cardTitles(page)).toEqual(['Dashboard', 'Görevler', 'Raporlar', 'Kapasite Planlayıcı']);
  expect(await page.evaluate(() => (window as Window & { __spaMarker?: string }).__spaMarker)).toBe(
    'still-here',
  );
  consoleErrors.expectNone();
});

test('a user with some grants sees only their cards and figures', async ({ page, consoleErrors }) => {
  const session = await seedSession(page, {
    admin: false,
    grants: [
      '/manufacturing/maintenance/',
      '/manufacturing/maintenance/fault-requests/',
      '/manufacturing/welding/time-entries/',
    ],
  });
  const backend = await mockBackend(page, { 'GET /machines/faults/': count(4) }, { session });

  await page.goto('/manufacturing/');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'İmalat Modülü' })).toBeVisible();
  // Kaynak's own page is not granted, so its card goes, as in legacy.
  // Grants are per page: only the granted feature link stays.
  expect(await cardTitles(page)).toEqual(['Bakım']);
  await expect(main.locator('article li')).toHaveText(['Arıza Talepleri']);
  await expect(main.locator('#openFaults')).toContainText('4');
  await expect(main.locator('#machiningTimers')).toHaveCount(0);
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

import { expect, mockBackend, seedSession, test } from './fixtures';

// CNC and linear cutting moved from İmalat to Planlama (routes/movedRoutes.ts): the
// old URLs forward with their query, and the grants stay on the old routes.
// Every page below a hub has a back arrow to its parent in the menu.

const cardTitles = (page: import('@playwright/test').Page) =>
  page.getByRole('main').locator('article h3').allTextContents();

test('old CNC grants open the moved pages and their hubs, nothing more', async ({
  page,
  consoleErrors,
}) => {
  const session = await seedSession(page, {
    admin: false,
    grants: ['/manufacturing/cnc-cutting/', '/manufacturing/cnc-cutting/cuts/'],
  });
  await mockBackend(page, {}, { session });

  await page.goto('/manufacturing/cnc-cutting/cuts/?status=pending');
  await expect(page).toHaveURL(/\/planning\/cnc-cutting\/cuts\/\?status=pending$/);
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'CNC Kesim Kesimler', level: 1 })).toBeVisible();

  // One level up at a time, by the menu: CNC Kesim, then Planlama.
  await main.getByRole('link', { name: 'CNC Kesim sayfasına dön' }).click();
  await expect(page).toHaveURL(/\/planning\/cnc-cutting\/?$/);
  await expect(main.getByRole('heading', { name: 'CNC Kesim', level: 1 })).toBeVisible();
  // Kesimler, and Sac Stoğu (the Depo page), which a cuts grant opens too.
  expect(await cardTitles(page)).toEqual(['Kesimler', 'Sac Stoğu']);

  await main.getByRole('link', { name: 'Planlama sayfasına dön' }).click();
  await expect(page).toHaveURL(/\/planning\/?$/);
  // The Planlama hub: only the CNC lane, with the pages the grants open.
  const regions = main.getByRole('region');
  await expect(regions).toHaveCount(1);
  const cnc = main.getByRole('region', { name: 'CNC Kesim' });
  await expect(cnc.getByRole('navigation').getByRole('link')).toHaveText(['Kesimler', 'Sac Stoğu']);
  await expect(cnc).toContainText('Açık kesim');
  // A section's own hub is the top: no arrow.
  await expect(main.getByRole('link', { name: /sayfasına dön$/ })).toHaveCount(0);

  // Pages the old grants never opened stay closed under their new URLs.
  for (const url of ['/planning/cnc-cutting/capacity/', '/planning/linear-cutting/cuts/']) {
    await page.goto(url);
    await expect(main.getByRole('heading', { name: 'Erişim yetkiniz yok' })).toBeVisible();
  }
  consoleErrors.expectNone();
});

test('the retired Fire Plakalar page forwards to Sac Stoğu, for its old grant', async ({
  page,
  consoleErrors,
}) => {
  const session = await seedSession(page, {
    admin: false,
    grants: ['/manufacturing/cnc-cutting/remnants/'],
  });
  await mockBackend(page, {}, { session });

  for (const url of ['/manufacturing/cnc-cutting/remnants/', '/planning/cnc-cutting/remnants/']) {
    await page.goto(url);
    await expect(page).toHaveURL(/\/warehouse\/plate-stock\/$/);
    await expect(
      page.getByRole('main').getByRole('heading', { name: 'Sac Stoğu', level: 1 }),
    ).toBeVisible();
  }
  consoleErrors.expectNone();
});

test('admin: the menu puts the cutting pages under Planlama', async ({ page, consoleErrors }) => {
  const session = await seedSession(page, { admin: true });
  await mockBackend(page, {}, { session });

  await page.goto('/manufacturing/linear-cutting/tasks/');
  await expect(page).toHaveURL(/\/planning\/linear-cutting\/tasks\/$/);
  const main = page.getByRole('main');
  await expect(main.getByRole('navigation', { name: 'Konum' })).toHaveText(
    'Planlama/Lineer Kesim/Görevler',
  );
  await main.getByRole('link', { name: 'Lineer Kesim sayfasına dön' }).click();
  await expect(page).toHaveURL(/\/planning\/linear-cutting\/?$/);
  expect(await cardTitles(page)).toEqual([
    'Dashboard',
    'Kesimler',
    'Görevler',
    'Kapasite Planlayıcı',
    'Boy Stoğu',
  ]);

  // İmalat no longer carries them: no lane for either.
  await page.goto('/manufacturing/');
  await expect(main.getByRole('heading', { name: 'İmalat', level: 1 })).toBeVisible();
  const lanes = await main
    .getByRole('region')
    .evaluateAll((regions) => regions.map((r) => r.getAttribute('aria-label')));
  expect(lanes).toContain('Talaşlı İmalat');
  expect(lanes).not.toContain('CNC Kesim');
  expect(lanes).not.toContain('Lineer Kesim');
  consoleErrors.expectNone();
});

test('Planlama › Stok moved to Depo: the old Stok Kartları URL opens Tüm Stok Kartları', async ({
  page,
  consoleErrors,
}) => {
  const session = await seedSession(page, { admin: false, grants: ['/planning/inventory/cards/'] });
  await mockBackend(page, {}, { session });

  await page.goto('/planning/inventory/cards/');
  await expect(page).toHaveURL(/\/warehouse\/stock\/$/);
  const main = page.getByRole('main');
  await expect(main.getByRole('navigation', { name: 'Konum' })).toHaveText(
    'Depo/Stoklar/Tüm Stok Kartları',
  );

  // The old Sac ve Boy Stoğu URL picks the page by kind.
  await page.goto('/warehouse/pieces/?kind=boy');
  await expect(page).toHaveURL(/\/warehouse\/bar-stock\/$/);
  consoleErrors.expectNone();
});

test("Depo's URLs are English: the old Hammadde and İş Emri URLs forward with the query", async ({
  page,
  consoleErrors,
}) => {
  const session = await seedSession(page, { admin: false, grants: ['/warehouse/'] });
  await mockBackend(page, {}, { session });
  const main = page.getByRole('main');

  await page.goto('/warehouse/hammadde/?search=civata');
  await expect(page).toHaveURL(/\/warehouse\/raw-materials\/\?search=civata$/);
  await expect(main.getByRole('heading', { name: 'Hammadde', level: 1 })).toBeVisible();

  await page.goto('/warehouse/is-emri/?job_search=254');
  await expect(page).toHaveURL(/\/warehouse\/job-stock\/\?job_search=254$/);
  await expect(main.getByRole('heading', { name: 'İş Emri', level: 1 })).toBeVisible();
  await expect(main.getByRole('checkbox', { name: 'Bitmiş işleri de göster' })).toBeVisible();
  consoleErrors.expectNone();
});

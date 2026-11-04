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
    grants: ['/manufacturing/cnc-cutting/', '/manufacturing/cnc-cutting/remnants/'],
  });
  await mockBackend(page, {}, { session });

  await page.goto('/manufacturing/cnc-cutting/remnants/?thickness_mm=10');
  await expect(page).toHaveURL(/\/planning\/cnc-cutting\/remnants\/\?thickness_mm=10$/);
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Fire Plakalar', level: 1 })).toBeVisible();

  // One level up at a time, by the menu: CNC Kesim, then Planlama.
  await main.getByRole('link', { name: 'CNC Kesim sayfasına dön' }).click();
  await expect(page).toHaveURL(/\/planning\/cnc-cutting\/?$/);
  await expect(main.getByRole('heading', { name: 'CNC Kesim', level: 1 })).toBeVisible();
  expect(await cardTitles(page)).toEqual(['Fire Plakalar']);

  await main.getByRole('link', { name: 'Planlama sayfasına dön' }).click();
  await expect(page).toHaveURL(/\/planning\/?$/);
  // The Planlama hub: only the CNC lane, with the one page the grants open.
  const regions = main.getByRole('region');
  await expect(regions).toHaveCount(1);
  const cnc = main.getByRole('region', { name: 'CNC Kesim' });
  await expect(cnc.getByRole('navigation').getByRole('link')).toHaveText(['Fire Plakalar']);
  await expect(cnc).toContainText('Kullanılabilir fire plaka');
  // A section's own hub is the top: no arrow.
  await expect(main.getByRole('link', { name: /sayfasına dön$/ })).toHaveCount(0);

  // Pages the old grants never opened stay closed under their new URLs.
  for (const url of ['/planning/cnc-cutting/capacity/', '/planning/linear-cutting/cuts/']) {
    await page.goto(url);
    await expect(main.getByRole('heading', { name: 'Erişim yetkiniz yok' })).toBeVisible();
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

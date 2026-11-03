import { expect, mockBackend, seedSession, test } from './fixtures';

// Rapor Merkezi. Contracts:
//   /reports/            every report the user can open (reportCatalog.js),
//                        grouped by topic; search (?q=) and department (?dept=)
//                        in the URL; favourites per user in localStorage
//   rail "Raporlar"      opens it; shown to anyone who can open one report
//   report hubs          the same catalog, filtered to their departments

const cardTitles = (page: import('@playwright/test').Page) =>
  page.getByRole('main').locator('article h3');

test('a user with a few report grants finds them, searches and pins one', async ({
  page,
  consoleErrors,
}) => {
  const session = await seedSession(page, {
    admin: false,
    grants: [
      '/procurement/reports/items/',
      '/procurement/reports/suppliers/',
      '/manufacturing/cnc-cutting/reports/finished-timers/',
    ],
  });
  await mockBackend(page, {}, { session });

  await page.goto('/');
  await page.getByRole('navigation', { name: 'Ana menü' }).getByRole('button', { name: 'Raporlar' }).click();
  await expect(page).toHaveURL(/\/reports\/?$/);
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Rapor Merkezi', level: 1 })).toBeVisible();
  await expect(cardTitles(page)).toHaveText(['Biten Zamanlayıcılar', 'Ürün Raporu', 'Tedarikçi Raporu']);

  // The CNC grant opens the merged report at its CNC view once CNC is picked.
  await main.getByLabel('Departman').click();
  await page.getByRole('option', { name: 'CNC Kesim' }).click();
  await expect(page).toHaveURL(/dept=cnc/);
  await expect(main.getByRole('link', { name: 'Biten Zamanlayıcılar' })).toHaveAttribute(
    'href',
    '/manufacturing/reports/finished-timers?module=cnc_cutting',
  );
  await page.goto('/reports/');

  await main.getByLabel('Rapor ara').fill('tedarikçi');
  await expect(cardTitles(page)).toHaveText(['Tedarikçi Raporu']);
  await main.getByLabel('Rapor ara').fill('');

  await main.getByRole('button', { name: 'Ürün Raporu: favorilere ekle' }).click();
  await page.reload();
  await expect(main.getByRole('heading', { level: 2 }).first()).toContainText('Favoriler');
  await expect(cardTitles(page).first()).toHaveText('Ürün Raporu');
  await page.screenshot({ path: 'test-results/report-center.png', fullPage: true });

  await main.getByRole('link', { name: 'Ürün Raporu' }).click();
  await expect(page).toHaveURL(/\/procurement\/reports\/items\/?$/);
  consoleErrors.expectNone();
});

test('a user without any report grant gets no Raporlar entry and no catalog', async ({
  page,
  consoleErrors,
}) => {
  const session = await seedSession(page, { admin: false, grants: ['/sales/customers/'] });
  await mockBackend(page, {}, { session });

  await page.goto('/sales/customers/');
  await expect(page.getByRole('main').getByRole('heading', { name: 'Müşteri Yönetimi' })).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Ana menü' }).getByRole('button', { name: 'Raporlar' }),
  ).toHaveCount(0);

  await page.goto('/reports/');
  await expect(page.getByRole('main').getByRole('heading', { name: 'Erişim yetkiniz yok' })).toBeVisible();
  consoleErrors.expectNone();
});

test('admin: a report hub is the catalog filtered to its departments', async ({ page, consoleErrors }) => {
  const session = await seedSession(page, { admin: true });
  await mockBackend(page, {}, { session });

  await page.goto('/manufacturing/maintenance/reports/');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Bakım Raporları', level: 1 })).toBeVisible();
  await expect(cardTitles(page)).toHaveText([
    'Arızalar Özeti',
    'Aylık Metrikler',
    'Personel Faaliyet Raporu',
    'Bakım Dashboard',
  ]);
  await main.getByRole('link', { name: 'Tüm Raporlar' }).click();
  await expect(page).toHaveURL(/\/reports\/?$/);
  await expect(main.getByRole('heading', { name: 'Rapor Merkezi', level: 1 })).toBeVisible();
  consoleErrors.expectNone();
});

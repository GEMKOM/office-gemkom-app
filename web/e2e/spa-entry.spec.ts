import { expect, mockBackend, MOCK_CUSTOMERS, seedSession, test } from './fixtures';

// The site has one SPA entry: /index.html, and the same file as /404.html,
// which GitHub Pages (and scripts/serve-site.mjs) answers for every path that
// has no file. Deep links, refreshes on nested routes and old bookmarks boot
// the SPA with the URL untouched, and its router takes it from there.

async function expectCustomers(page: import('@playwright/test').Page) {
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Müşteri Yönetimi' })).toBeVisible();
  await expect(main.getByRole('row').filter({ hasText: MOCK_CUSTOMERS[0]!.code })).toBeVisible();
}

test.describe('one SPA entry', () => {
  test('/, /404.html and any page path serve the same SPA document; its assets are files', async ({
    request,
  }) => {
    const root = await request.get('/');
    expect(root.status()).toBe(200);
    const html = await root.text();
    expect(html).toContain('<div id="root">');

    const notFound = await request.get('/404.html');
    expect(await notFound.text()).toBe(html);

    // No per-route copy any more: a page path is a 404 that carries the SPA.
    for (const path of ['/sales/customers/', '/sales/customers', '/no/such/page/']) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(404);
      expect(await res.text(), path).toBe(html);
    }

    // The hashed bundles the entry points at are real files.
    const assets = [...html.matchAll(/(?:src|href)="(\/app-assets\/[^"]+)"/g)].map((m) => m[1]!);
    expect(assets.length).toBeGreaterThan(0);
    for (const asset of assets) {
      const res = await request.get(asset);
      expect(res.status(), asset).toBe(200);
    }
  });

  test('a deep link keeps its query string and hash, and a refresh stays on the page', async ({
    page,
    consoleErrors,
  }) => {
    const session = await seedSession(page, { admin: true });
    await mockBackend(page, {}, { session });

    await page.goto('/sales/customers/?search=ACME#list');
    await expect(page).toHaveURL(/\/sales\/customers\/\?search=ACME#list$/);
    await expectCustomers(page);

    await page.reload();
    await expect(page).toHaveURL(/\/sales\/customers\/\?search=ACME#list$/);
    await expectCustomers(page);
    consoleErrors.expectNone();
  });

  test('a nested route without its trailing slash opens too', async ({ page, consoleErrors }) => {
    const session = await seedSession(page, { admin: true });
    await mockBackend(page, {}, { session });

    await page.goto('/sales/customers');
    await expectCustomers(page);
    consoleErrors.expectNone();
  });

  test('an old bookmark of a moved page forwards with its query string and hash', async ({
    page,
    consoleErrors,
  }) => {
    const session = await seedSession(page, { admin: true });
    await mockBackend(page, {}, { session });

    await page.goto('/manufacturing/linear-cutting/dashboard/?range=7#machines');
    await expect(page).toHaveURL(/\/planning\/linear-cutting\/dashboard\/\?range=7#machines$/);
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sayfa bulunamadı' })).toHaveCount(0);
    consoleErrors.expectNone();
  });

  test('an unknown path shows the SPA not-found page inside the shell', async ({ page }) => {
    const session = await seedSession(page, { admin: true });
    await mockBackend(page, {}, { session });

    await page.goto('/sales/nope/?x=1');
    await expect(page.getByRole('heading', { name: 'Sayfa bulunamadı' })).toBeVisible();
    await expect(page).toHaveURL(/\/sales\/nope\/\?x=1$/);
  });

  test('signed out, a deep link goes to the login page and is parked with its query and hash', async ({
    page,
  }) => {
    await mockBackend(page);
    await page.goto('/sales/customers/?search=ACME#list');
    await expect(page).toHaveURL(/\/login\/$/);
    const parked = await page.evaluate(() => sessionStorage.getItem('postLoginReturnUrl'));
    expect(parked).toBe('/sales/customers/?search=ACME#list');
  });
});

import {
  expect,
  FAKE,
  migratedRoutes,
  MOCK_CUSTOMERS,
  mockBackend,
  pageUrl,
  paginated,
  readSession,
  seedSession,
  test,
} from './fixtures';

// Smoke tests for the React/legacy split: one origin, one session in
// localStorage, migrated routes served by the SPA, everything else legacy.
// Contracts used here:
//   /sales/            hub, title "Satış Modülü", four cards (MenuCards)
//   /sales/customers/  title "Müşteri Yönetimi", table of code + name from
//                      GET /projects/customers/ (DRF page)

const SALES = '/sales/';
const CUSTOMERS = '/sales/customers/';

declare global {
  interface Window {
    __spaMarker?: string;
  }
}

async function expectCustomersTable(page: import('@playwright/test').Page) {
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Müşteri Yönetimi' })).toBeVisible();
  for (const customer of MOCK_CUSTOMERS) {
    const row = main.getByRole('row').filter({ hasText: customer.code });
    await expect(row).toBeVisible();
    await expect(row).toContainText(customer.name);
  }
}

/** The page is the React SPA, not a legacy page. */
async function expectSpa(page: import('@playwright/test').Page) {
  await expect(page.locator('#root')).toHaveCount(1);
  await expect(page.locator('#navbar-container')).toHaveCount(0);
}

test.describe('session guard', () => {
  test('signed out: a migrated page redirects to /login/ and remembers where it was', async ({
    page,
  }) => {
    await mockBackend(page);
    await page.goto(CUSTOMERS);
    await expect(page).toHaveURL(/\/login\/$/);
    const returnUrl = await page.evaluate(() => sessionStorage.getItem('postLoginReturnUrl'));
    expect(returnUrl).toBe(CUSTOMERS);
  });
});

test.describe('navigation', () => {
  test('admin: hub cards, then Müşteriler opens the customers page client-side', async ({
    page,
    consoleErrors,
  }) => {
    const session = await seedSession(page, { admin: true });
    const backend = await mockBackend(page, {}, { session });

    await page.goto(SALES);
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: 'Satış Modülü' })).toBeVisible();
    for (const title of ['Maliyet Tablosu', 'Müşteriler', 'Teklifler', 'Ürün Kataloğu']) {
      await expect(main.getByRole('heading', { name: title, exact: true })).toBeVisible();
    }
    await expectSpa(page);

    // A full page load would wipe this.
    await page.evaluate(() => {
      window.__spaMarker = 'still-here';
    });
    await main.getByRole('link', { name: 'Müşteriler', exact: true }).click();

    await expect(page).toHaveURL(/\/sales\/customers\/?$/);
    await expectCustomersTable(page);
    expect(await page.evaluate(() => window.__spaMarker)).toBe('still-here');
    expect(backend.callsTo('/projects/customers/', 'GET').length).toBeGreaterThan(0);
    consoleErrors.expectNone();
  });

  test('SPA -> legacy -> SPA keeps the session', async ({ page }) => {
    const session = await seedSession(page, { admin: true });
    await mockBackend(page, {}, { session });

    await page.goto(CUSTOMERS);
    await expectCustomersTable(page);

    // React rail: Genel -> Makineler is a legacy page, so a full load.
    await page.evaluate(() => {
      window.__spaMarker = 'spa';
    });
    await page.getByRole('navigation', { name: 'Ana menü' }).getByRole('button', { name: 'Genel' }).click();
    await page.getByRole('menuitem', { name: 'Makineler' }).click();

    await expect(page).toHaveURL(/\/general\/machines\/$/);
    await expect(page.locator('#navbar-container')).toHaveCount(1);
    await expect(page.locator('#root')).toHaveCount(0);
    expect(await page.evaluate(() => window.__spaMarker)).toBeUndefined();
    // The legacy navbar renders from the same session.
    const legacyNav = page.locator('#navbar-container #main-nav-items');
    await expect(legacyNav.locator('a[data-path="/general"]')).toBeVisible();
    let stored = await readSession(page);
    expect(stored.refreshToken).toBe(session.refreshToken);
    expect(stored.accessToken).toBe(session.accessToken);

    // Back to the SPA hub with a full load, as any legacy link does. (Driving
    // the legacy navbar's nested Bootstrap dropdowns here was flaky.)
    await page.goto('/sales/');

    await expect(page).toHaveURL(/\/sales\/$/);
    await expect(
      page.getByRole('main').getByRole('heading', { name: 'Satış Modülü' }),
    ).toBeVisible();
    await expectSpa(page);
    stored = await readSession(page);
    expect(stored.refreshToken).toBe(session.refreshToken);
    expect(stored.accessToken).toBe(session.accessToken);
    expect(JSON.parse(stored.user ?? '{}').username).toBe(session.user.username);
  });
});

test.describe('API session', () => {
  test('a 401 refreshes the token once and retries the request', async ({
    page,
    consoleErrors,
  }) => {
    const session = await seedSession(page, { admin: true });
    const backend = await mockBackend(
      page,
      {
        'GET /projects/customers/': ({ callIndex }) =>
          callIndex === 0
            ? {
                status: 401,
                json: {
                  detail: 'Given token not valid for any token type',
                  code: 'token_not_valid',
                },
              }
            : { json: paginated(MOCK_CUSTOMERS) },
        'POST /token/refresh/': {
          json: { access: FAKE.refreshedAccessToken, refresh: FAKE.refreshedRefreshToken },
        },
      },
      { session },
    );

    // Chrome logs every non-2xx response; this 401 is the one the test asks for.
    consoleErrors.allow(
      /status of 401 \(Unauthorized\) \(http:\/\/127\.0\.0\.1:8001\/projects\/customers\//,
    );

    await page.goto(CUSTOMERS);
    await expectCustomersTable(page);

    const refreshes = backend.callsTo('/token/refresh/', 'POST');
    expect(refreshes).toHaveLength(1);
    expect(refreshes[0]!.body).toEqual({ refresh: FAKE.refreshToken });

    const customerCalls = backend.callsTo('/projects/customers/', 'GET');
    expect(customerCalls[0]!.status).toBe(401);
    expect(customerCalls[0]!.authorization).toBe(`Bearer ${FAKE.accessToken}`);
    expect(customerCalls[1]!.status).toBe(200);
    expect(customerCalls[1]!.authorization).toBe(`Bearer ${FAKE.refreshedAccessToken}`);

    const stored = await readSession(page);
    expect(stored.accessToken).toBe(FAKE.refreshedAccessToken);
    expect(stored.refreshToken).toBe(FAKE.refreshedRefreshToken);
    consoleErrors.expectNone();
  });
});

test.describe('route permissions', () => {
  test('non-admin without a grant sees "Erişim yetkiniz yok"', async ({ page }) => {
    const session = await seedSession(page, { admin: false, grants: [] });
    const backend = await mockBackend(page, {}, { session });

    await page.goto(CUSTOMERS);
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: 'Erişim yetkiniz yok' })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Müşteri Yönetimi' })).toHaveCount(0);
    expect(backend.callsTo('/projects/customers/')).toHaveLength(0);
  });

  test('non-admin with the page grant sees the customers page', async ({ page, consoleErrors }) => {
    const session = await seedSession(page, { admin: false, grants: [CUSTOMERS] });
    expect(Object.values(session.permissions)).toContainEqual({
      granted: true,
      name: 'Page: /sales/customers/',
    });
    await mockBackend(page, {}, { session });

    await page.goto(CUSTOMERS);
    await expectCustomersTable(page);
    await expect(page.getByText('Erişim yetkiniz yok')).toHaveCount(0);
    consoleErrors.expectNone();
  });
});

test.describe('every migrated route loads as admin', () => {
  const routes = migratedRoutes();
  test('migrated-routes.json is not empty', () => {
    expect(routes.length).toBeGreaterThan(0);
  });

  for (const route of routes) {
    test(`${route} renders without console errors`, async ({ page, consoleErrors }) => {
      const session = await seedSession(page, { admin: true });
      await mockBackend(page, {}, { session });

      await page.goto(pageUrl(route));
      await expect(page).toHaveURL(
        new RegExp(`${pageUrl(route).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
      );
      await expectSpa(page);
      const main = page.getByRole('main');
      await expect(main).toBeVisible();
      await expect(main.getByRole('heading', { name: 'Sayfa bulunamadı' })).toHaveCount(0);
      await expect(main.getByRole('heading', { name: 'Erişim yetkiniz yok' })).toHaveCount(0);
      // Let the first queries settle so their errors (if any) are caught.
      await page.waitForLoadState('networkidle');
      await expect(page.locator('.mantine-Loader-root')).toHaveCount(0);
      consoleErrors.expectNone();
    });
  }
});

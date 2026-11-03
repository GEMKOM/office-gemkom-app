import type { Page } from '@playwright/test';
import {
  buildSession,
  expect,
  FAKE,
  MOCK_CUSTOMERS,
  mockBackend,
  readSession,
  test,
  type MockHandlers,
} from './fixtures';

// The React login (/login/) and reset-password (/login/reset-password/) pages
// against the mocked backend. No real credentials anywhere: POST /token/ is
// answered by the mock with the fake tokens from fixtures.ts.

const CUSTOMERS = '/sales/customers/';
const LEGACY_PAGE = '/planning/project-planning/'; // still legacy, and guarded by guardRoute()

// Chrome logs the 401 of a refused sign-in as a console error.
const REFUSED_LOGIN = /status of 401/;

function tokenHandler(seen: { headers: Record<string, string>; body: unknown }[]): MockHandlers {
  return {
    'POST /token/': (req) => {
      seen.push({ headers: req.headers, body: req.body });
      const { password } = req.body as { password: string };
      if (password !== 'e2e-dogru-sifre') return { status: 401, json: { detail: 'No account' } };
      return { json: { access: FAKE.accessToken, refresh: FAKE.refreshToken } };
    },
  };
}

async function signIn(page: Page, password = 'e2e-dogru-sifre') {
  await page.getByLabel('Kullanıcı Adı').fill('e2e.admin');
  await page.getByLabel('Şifre', { exact: true }).fill(password);
  await page.getByLabel('Şifre', { exact: true }).press('Enter');
}

test.describe('login', () => {
  test('signed out on a React page: sign in, then back to that page', async ({
    page,
    consoleErrors,
  }) => {
    const seen: { headers: Record<string, string>; body: unknown }[] = [];
    const session = buildSession({ admin: true });
    const backend = await mockBackend(page, tokenHandler(seen), { session });

    await page.goto(`${CUSTOMERS}?q=Alfa`);
    await expect(page).toHaveURL(/\/login\/$/);
    await page.evaluate(() => {
      window.__loginMarker = 'spa';
    });
    await signIn(page);

    await expect(page).toHaveURL(`${CUSTOMERS}?q=Alfa`);
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: 'Müşteri Yönetimi' })).toBeVisible();
    await expect(main.getByText(MOCK_CUSTOMERS[0]!.code)).toBeVisible();
    // Landed client-side: the SPA was not reloaded.
    expect(await page.evaluate(() => window.__loginMarker)).toBe('spa');

    // Same request and session format as the legacy page.
    expect(seen).toHaveLength(1);
    expect(seen[0]!.body).toEqual({ username: 'e2e.admin', password: 'e2e-dogru-sifre' });
    expect(seen[0]!.headers['x-subdomain']).toBe('ofis.gemcore.com.tr');
    const stored = await readSession(page);
    expect(stored.accessToken).toBe(FAKE.accessToken);
    expect(stored.refreshToken).toBe(FAKE.refreshToken);
    expect(JSON.parse(stored.user!)).toMatchObject({ username: 'e2e.admin' });
    expect(JSON.parse(stored.permissions!)).toMatchObject({ office_access: true });
    expect(backend.callsTo('/users/me/permissions/', 'GET').length).toBeGreaterThan(0);
    expect(await page.evaluate(() => sessionStorage.getItem('postLoginReturnUrl'))).toBeNull();
    consoleErrors.expectNone();
  });

  test('a legacy page sends a signed-out user to the React login and gets them back', async ({
    page,
  }) => {
    const session = buildSession({ admin: true });
    await mockBackend(page, tokenHandler([]), { session });

    await page.goto(LEGACY_PAGE);
    await expect(page).toHaveURL(/\/login\/$/);
    await expect(page.getByRole('heading', { name: 'Ofis Çalışanları' })).toBeVisible();
    await signIn(page);

    await expect(page).toHaveURL(LEGACY_PAGE);
    await expect(page.locator('#navbar-container')).toHaveCount(1);
  });

  test('a wrong password shows the message and keeps the user on the form', async ({
    page,
    consoleErrors,
  }) => {
    consoleErrors.allow(REFUSED_LOGIN);
    await mockBackend(page, tokenHandler([]));

    await page.goto('/login/');
    const button = page.getByRole('button', { name: 'Giriş Yap' });
    const before = await button.boundingBox();
    await signIn(page, 'yanlis');

    await expect(
      page.getByText('Kullanıcı adı veya şifre hatalı. Lütfen tekrar deneyin.'),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login\/$/);
    // The message has its own reserved line: nothing moved.
    expect(await button.boundingBox()).toEqual(before);
    expect((await readSession(page)).refreshToken).toBeNull();
    consoleErrors.expectNone();
  });

  test('must reset: login -> reset page -> new password -> the page they came from', async ({
    page,
    consoleErrors,
  }) => {
    const session = buildSession({ admin: true, user: { must_reset_password: true } });
    const resets: unknown[] = [];
    const backend = await mockBackend(
      page,
      {
        ...tokenHandler([]),
        'POST /users/reset-password/': (req) => {
          resets.push(req.body);
          return { json: { message: 'ok' } };
        },
      },
      { session },
    );

    await page.goto(CUSTOMERS);
    await expect(page).toHaveURL(/\/login\/$/);
    await signIn(page);

    await expect(page).toHaveURL(/\/login\/reset-password\/$/);
    await expect(page.getByRole('heading', { name: 'Şifre Sıfırla' })).toBeVisible();
    await page.getByLabel('Yeni Şifre', { exact: true }).fill('e2e-yeni-sifre');
    await page.getByLabel('Yeni Şifre (Tekrar)').fill('e2e-yeni-sifre');
    await page.getByRole('button', { name: 'Kaydet' }).click();

    await expect(
      page.getByText('Şifreniz başarıyla güncellendi. Yönlendiriliyorsunuz...'),
    ).toBeVisible();
    await expect(page).toHaveURL(CUSTOMERS);
    await expect(page.getByRole('heading', { name: 'Müşteri Yönetimi' })).toBeVisible();
    expect(resets).toEqual([{ new_password: 'e2e-yeni-sifre' }]);
    const stored = JSON.parse((await readSession(page)).user!) as Record<string, unknown>;
    expect(stored.must_reset_password).toBe(false);
    expect(backend.callsTo('/users/reset-password/', 'POST')).toHaveLength(1);
    consoleErrors.expectNone();
  });
});

declare global {
  interface Window {
    __loginMarker?: string;
  }
}

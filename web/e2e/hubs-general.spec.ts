import { expect, mockBackend, paginated, seedSession, test } from './fixtures';

// The landing page and the Genel / Bilgi İşlem / İSG hubs (MenuCards).
// Contracts used here:
//   /                       title "Çalışma Alanları", one card per work area
//   /general/               title "Genel Modülü"; Mesailer shows a pill when
//                           GET /overtime/requests/pending_approval/ counts any
//   /general/overtime/      title "Mesai Talepleri"
//   /it/                    hub; needs a grant under /it

declare global {
  interface Window {
    __spaMarker?: string;
  }
}

const cardTitles = (page: import('@playwright/test').Page) =>
  page.getByRole('main').getByRole('heading', { level: 3 }).allTextContents();

test('admin: landing page -> Genel -> Mesailer, all client-side', async ({ page, consoleErrors }) => {
  const session = await seedSession(page, { admin: true });
  await mockBackend(
    page,
    {
      'GET /overtime/requests/pending_approval/': {
        json: { ...paginated([]), count: 4 },
      },
      'GET /isg/issues/summary/': { json: { open: 2, overdue: 0, mine_open: 0 } },
    },
    { session },
  );

  await page.goto('/');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1, name: 'Çalışma Alanları' })).toBeVisible();
  expect(await cardTitles(page)).toHaveLength(14);
  await expect(page.locator('#root')).toHaveCount(1);

  // A full page load would wipe this.
  await page.evaluate(() => {
    window.__spaMarker = 'still-here';
  });
  await main.getByRole('link', { name: 'Genel', exact: true }).click();
  await expect(page).toHaveURL(/\/general\/?$/);
  await expect(main.getByRole('heading', { level: 1, name: 'Genel Modülü' })).toBeVisible();
  const overtime = main.locator('article').filter({ has: page.getByRole('heading', { name: 'Mesailer' }) });
  await expect(overtime).toContainText('4 onayınızı bekliyor');

  await overtime.getByRole('link', { name: 'Mesailer' }).click();
  await expect(page).toHaveURL(/\/general\/overtime\/?$/);
  await expect(main.getByRole('heading', { level: 1, name: 'Mesai Talepleri' })).toBeVisible();
  expect(await page.evaluate(() => window.__spaMarker)).toBe('still-here');
  consoleErrors.expectNone();
});

test.describe('a user with only some grants', () => {
  const grants = ['/general/overtime/', '/general/overtime/cost-report/', '/sales/'];

  test('sees only the areas and cards they can open', async ({ page, consoleErrors }) => {
    const session = await seedSession(page, { admin: false, grants });
    const backend = await mockBackend(page, {}, { session });

    await page.goto('/');
    await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Çalışma Alanları' })).toBeVisible();
    await expect.poll(() => cardTitles(page)).toEqual(['Genel', 'Satış']);

    await page.goto('/general/');
    await expect.poll(() => cardTitles(page)).toEqual(['Mesailer', 'İSG Bildirimleri', 'Tartışmalarım']);

    await page.goto('/general/overtime/');
    await expect.poll(() => cardTitles(page)).toEqual(['Mesai Maliyet Raporu']);
    // No grant for the pending list: its count is never asked for.
    expect(backend.callsTo('/overtime/requests/pending_approval/')).toHaveLength(0);

    await page.goto('/isg/');
    await expect.poll(() => cardTitles(page)).toEqual(['İSG Bildirimleri', 'Bana Atananlar']);
    consoleErrors.expectNone();
  });

  test('is turned away from a hub with nothing for them', async ({ page }) => {
    const session = await seedSession(page, { admin: false, grants });
    await mockBackend(page, {}, { session });

    await page.goto('/it/');
    await expect(page.getByRole('main').getByRole('heading', { name: 'Erişim yetkiniz yok' })).toBeVisible();

    await page.goto('/general/vacation/');
    await expect(page.getByRole('main').getByRole('heading', { name: 'Erişim yetkiniz yok' })).toBeVisible();
  });
});

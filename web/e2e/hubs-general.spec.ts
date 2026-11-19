import { expect, mockBackend, paginated, seedSession, test } from './fixtures';

// The landing page and the Talepler (was Genel) / Bilgi İşlem / İSG hubs (MenuCards).
// Contracts used here:
//   /                       the personal home; no work-area cards (the menu has them)
//   /general/               title "Talepler": Departman / Vinç Talepleri, Fason
//   user menu               the overtime approvals waiting (GET
//                           /overtime/requests/pending_approval/) count on the avatar
//   /human_resources/overtime/  title "Mesai Talepleri" (old /general/overtime/ forwards)
//   /it/                    hub; needs a grant under /it

declare global {
  interface Window {
    __spaMarker?: string;
  }
}

const cardTitles = (page: import('@playwright/test').Page) =>
  page.getByRole('main').getByRole('heading', { level: 3 }).allTextContents();

test('admin: landing page -> Talepler, overtime approvals on the avatar, all client-side', async ({
  page,
  consoleErrors,
}) => {
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
  await expect(main.getByRole('heading', { level: 1, name: /, E2E$/ })).toBeVisible();
  await expect(main.getByRole('heading', { name: 'Çalışma Alanları' })).toHaveCount(0);
  expect(await cardTitles(page)).toHaveLength(0);
  await expect(page.locator('#root')).toHaveCount(1);

  // A full page load would wipe this.
  await page.evaluate(() => {
    window.__spaMarker = 'still-here';
  });
  const menu = page.getByRole('navigation', { name: 'Ana menü' });
  await menu.getByRole('button', { name: 'Talepler' }).click();
  await expect(page).toHaveURL(/\/general\/?$/);
  await expect(main.getByRole('heading', { level: 1, name: 'Talepler' })).toBeVisible();
  expect(await cardTitles(page)).toEqual(['Departman Talepleri', 'Vinç Talepleri', 'Fason Talepleri']);

  // Overtime approvals moved to the user menu: the avatar wears their count.
  const avatar = page.getByRole('button', { name: /, 4 onay bekliyor$/ }).first();
  await expect(avatar).toBeVisible();
  await avatar.click();
  await page.getByRole('menuitem', { name: /Mesai Onayları/ }).click();
  await expect(page).toHaveURL(/\/human_resources\/overtime\/pending\/?$/);
  expect(await page.evaluate(() => window.__spaMarker)).toBe('still-here');
  consoleErrors.expectNone();
});

test.describe('a user with only some grants', () => {
  const grants = ['/general/overtime/', '/general/overtime/cost-report/', '/sales/'];

  test('sees only the areas and cards they can open', async ({ page, consoleErrors }) => {
    const session = await seedSession(page, { admin: false, grants });
    const backend = await mockBackend(page, {}, { session });

    await page.goto('/');
    await expect(page.getByRole('main').getByRole('heading', { level: 1, name: /, E2E$/ })).toBeVisible();
    await expect(page.getByRole('main').getByRole('heading', { name: 'Çalışma Alanları' })).toHaveCount(0);

    // Talepler has nothing for them (no department / crane / fason grant).
    await page.goto('/general/');
    await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Talepler' })).toBeVisible();
    expect(await cardTitles(page)).toEqual([]);

    // Mesailer moved to İnsan Kaynakları; the old address forwards, the old grants still open it.
    await page.goto('/general/overtime/');
    await expect(page).toHaveURL(/\/human_resources\/overtime\/?$/);
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

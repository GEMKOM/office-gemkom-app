import { expect, mockBackend, paginated, seedSession, test } from './fixtures';

// The management, HR, PDKS, quality control, projects and design hubs.
// Contracts used here:
//   /quality-control/  four cards; band counts from GET /quality-control/qc-reviews/
//                      (status=pending) and /quality-control/ncrs/ (open statuses)
//   /human_resources/  five cards; the PDKS count from GET /attendance/hr/pending-overrides/
//   /management/       Raporlar opens /management/reports/ inside the SPA

const count = (n: number) => ({ json: paginated([], { count: n }) });

declare global {
  interface Window {
    __spaMarker?: string;
  }
}

test('admin: quality control hub shows its cards and live counts', async ({ page, consoleErrors }) => {
  const session = await seedSession(page, { admin: true });
  const backend = await mockBackend(
    page,
    {
      'GET /quality-control/qc-reviews/': count(7),
      'GET /quality-control/ncrs/': count(12),
    },
    { session },
  );

  await page.goto('/quality-control/');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Kalite Kontrol Modülü' })).toBeVisible();
  for (const title of ['KK İncelemeleri', 'Uygunsuzluk Raporları', 'Maliyet Satırları', 'Kalite Evrakları']) {
    await expect(main.getByRole('heading', { name: title, exact: true })).toBeVisible();
  }
  await expect(page.locator('#pending-reviews')).toContainText('7');
  await expect(page.locator('#open-ncrs')).toContainText('12');
  expect(backend.callsTo('/quality-control/qc-reviews/', 'GET')[0]!.query).toBe('?status=pending&page_size=1');
  consoleErrors.expectNone();
});

test('admin: management hub opens the reports hub client-side', async ({ page, consoleErrors }) => {
  const session = await seedSession(page, { admin: true });
  await mockBackend(page, {}, { session });

  await page.goto('/management/');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Yönetim Modülü' })).toBeVisible();
  await page.evaluate(() => {
    window.__spaMarker = 'still-here';
  });
  await main.getByRole('link', { name: 'Raporlar', exact: true }).click();

  await expect(page).toHaveURL(/\/management\/reports\/?$/);
  await expect(main.getByRole('heading', { name: 'Yönetim Raporları' })).toBeVisible();
  await expect(main.getByRole('heading', { name: 'Nakit Akış Tablosu', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__spaMarker)).toBe('still-here');
  consoleErrors.expectNone();
});

test.describe('user with only the PDKS records page', () => {
  const grants = ['/human_resources/attendance/records/'];

  test('HR and PDKS hubs open with just that card and fetch no counts', async ({ page, consoleErrors }) => {
    const session = await seedSession(page, { admin: false, grants });
    const backend = await mockBackend(page, {}, { session });

    await page.goto('/human_resources/');
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: 'İnsan Kaynakları Modülü' })).toBeVisible();
    await expect(main.getByRole('heading', { level: 3 })).toHaveText(['PDKS Kayıtları']);
    await expect(page.locator('#pending-overrides')).toHaveCount(0);

    await page.goto('/human_resources/attendance/');
    await expect(main.getByRole('heading', { name: 'PDKS', exact: true })).toBeVisible();
    await expect(main.getByRole('heading', { level: 3 })).toHaveText(['Kayıtlar']);

    expect(backend.callsTo('/attendance/hr/pending-overrides/')).toHaveLength(0);
    consoleErrors.expectNone();
  });

  test('hubs of other sections say "Erişim yetkiniz yok"', async ({ page }) => {
    const session = await seedSession(page, { admin: false, grants });
    const backend = await mockBackend(page, {}, { session });

    for (const hub of ['/quality-control/', '/design/', '/management/']) {
      await page.goto(hub);
      await expect(page.getByRole('main').getByRole('heading', { name: 'Erişim yetkiniz yok' })).toBeVisible();
    }
    expect(backend.callsTo('/quality-control/qc-reviews/')).toHaveLength(0);
    expect(backend.callsTo('/projects/drawing-releases/pending_approvals/')).toHaveLength(0);
  });
});

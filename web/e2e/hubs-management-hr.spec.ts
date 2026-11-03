import { expect, mockBackend, paginated, seedSession, test } from './fixtures';

// The management, HR, PDKS, quality control, projects and design hubs.
// Contracts used here:
//   /quality-control/  four cards; band counts from GET /quality-control/qc-reviews/
//                      (status=pending) and /quality-control/ncrs/ (open statuses)
//   /human_resources/  four cards (one PDKS card); the PDKS count from
//                      GET /attendance/hr/pending-overrides/; Veri Eksikleri from
//                      GET /users/?is_active=true&page_size=1000 and /users/wages/
//   /management/       Raporlar opens /management/reports/ inside the SPA

const count = (n: number) => ({ json: paginated([], { count: n }) });

declare global {
  interface Window {
    __spaMarker?: string;
  }
}

test('admin: quality control hub shows its cards and live counts', async ({
  page,
  consoleErrors,
}) => {
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
  for (const title of [
    'KK İncelemeleri',
    'Uygunsuzluk Raporları',
    'Maliyet Satırları',
    'Kalite Evrakları',
  ]) {
    await expect(main.getByRole('heading', { name: title, exact: true })).toBeVisible();
  }
  await expect(page.locator('#pending-reviews')).toContainText('7');
  await expect(page.locator('#open-ncrs')).toContainText('12');
  expect(backend.callsTo('/quality-control/qc-reviews/', 'GET').map((c) => c.query)).toContain(
    '?status=pending&page_size=1',
  );
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
  await expect(
    main.getByRole('heading', { name: 'Nakit Akış Tablosu', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.__spaMarker)).toBe('still-here');
  consoleErrors.expectNone();
});

test('HR: a missing wage on the hub opens the employees without one, on Maaşlar', async ({
  page,
  consoleErrors,
}) => {
  // manage_hr: superusers have every role permission.
  const session = await seedSession(page, { admin: true, user: { is_superuser: true } });
  const staff = [
    {
      id: 41,
      username: 'ali.k',
      first_name: 'Ali',
      last_name: 'Kaya',
      is_active: true,
      position_id: 3,
      hire_date: '2021-02-01',
      personel_kodu: 'P41',
      tc_kimlik_no: '1',
    },
    {
      id: 42,
      username: 'ayse.d',
      first_name: 'Ayşe',
      last_name: 'Demir',
      is_active: true,
      position_id: 3,
      hire_date: '2023-05-02',
      personel_kodu: 'P42',
      tc_kimlik_no: '2',
    },
  ];
  const backend = await mockBackend(
    page,
    {
      'GET /users/': ({ query }) => ({
        json: paginated(query.get('page_size') === '1000' ? staff : [], { count: 2 }),
      }),
      'GET /users/wages/': {
        json: paginated([
          { id: 41, has_wage: true, current_wage: { id: 9, effective_from: '2026-07-01' } },
          { id: 42, has_wage: false, current_wage: null },
        ]),
      },
      'GET /users/42/wages/': { json: [] },
    },
    { session },
  );

  await page.goto('/human_resources/');
  const main = page.getByRole('main');
  const checks = main.locator('section', {
    has: page.getByRole('heading', { name: 'Veri Eksikleri' }),
  });
  const missing = checks.getByRole('link', { name: /Ücreti girilmemiş/ });
  await expect(missing).toContainText('1');
  await missing.click();

  await expect(page).toHaveURL(/\/human_resources\/users\/?\?issue=missing_wage$/);
  await expect(main.getByText('Veri kontrolü: Ücreti girilmemiş')).toBeVisible();
  await expect(main.getByText('ayse.d')).toBeVisible();
  await expect(main.getByText('ali.k')).toHaveCount(0);

  await main.getByRole('button', { name: 'Düzenle' }).click();
  const dialog = page.getByRole('dialog', { name: 'Çalışan Düzenle' });
  await expect(dialog.getByRole('tab', { name: 'Maaşlar' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect.poll(() => backend.callsTo('/users/42/wages/').length).toBeGreaterThan(0);
  consoleErrors.expectNone();
});

test.describe('user with only the PDKS records page', () => {
  const grants = ['/human_resources/attendance/records/'];

  test('HR and PDKS hubs open with just that card and fetch no counts', async ({
    page,
    consoleErrors,
  }) => {
    const session = await seedSession(page, { admin: false, grants });
    const backend = await mockBackend(page, {}, { session });

    await page.goto('/human_resources/');
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: 'İnsan Kaynakları Modülü' })).toBeVisible();
    await expect(main.getByRole('heading', { level: 3 })).toHaveText(['PDKS']);
    await expect(main.getByRole('link', { name: 'PDKS', exact: true })).toHaveAttribute(
      'href',
      '/human_resources/attendance/records',
    );
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
      await expect(
        page.getByRole('main').getByRole('heading', { name: 'Erişim yetkiniz yok' }),
      ).toBeVisible();
    }
    expect(backend.callsTo('/quality-control/qc-reviews/')).toHaveLength(0);
    expect(backend.callsTo('/projects/drawing-releases/pending_approvals/')).toHaveLength(0);
  });
});

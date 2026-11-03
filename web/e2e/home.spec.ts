import { expect, mockBackend, paginated, seedSession, test } from './fixtures';

// The personal home page at /. Contracts:
//   GET /procurement/purchase-requests/pending_approval/   approvals waiting on the user
//   GET /approvals/inbox/                                  the other approval types (plain array)
//   GET /projects/department-tasks/?assigned_to=<me>       the user's open tasks
//   GET /notifications/                                    the latest notifications

const ROW = {
  id: 5,
  request_number: 'SAT-5',
  title: 'e2e Konveyör',
  requestor_username: 'e2e',
  status: 'submitted',
  status_label: 'Gönderildi',
  priority: 'normal',
  created_at: '2026-10-30T10:00:00Z',
};

test('a waiting purchase request opens on the pending page, client-side', async ({ page, consoleErrors }) => {
  const session = await seedSession(page, { admin: true, user: { department_code: 'procurement' } });
  const backend = await mockBackend(
    page,
    {
      'GET /procurement/purchase-requests/pending_approval/': { json: paginated([ROW]) },
      'GET /approvals/inbox/': {
        json: [
          {
            workflow_id: 1,
            subject_type: 'quality_control.ncr',
            subject_id: 9,
            stage_name: 'Kalite',
            created_at: '2026-10-31T10:00:00Z',
            snapshot: { ncr_number: 'NCR-7', title: 'e2e Kaynak hatası' },
          },
        ],
      },
      'GET /procurement/purchase-requests/approved_by_me/': { json: paginated([]) },
      'GET /procurement/purchase-requests/': { json: paginated([ROW]) },
      'GET /procurement/purchase-requests/5/': { json: { ...ROW, request_items: [], offers: [], approval: { stage_instances: [] } } },
      'GET /currency-rates/': { json: { rates: { TRY: 1, EUR: 0.025 } } },
    },
    { session },
  );

  await page.goto('/');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1, name: /, E2E$/ })).toBeVisible();
  const queues = main.locator('section').filter({ has: page.getByRole('heading', { name: 'Onay Kuyruklarım' }) });
  await expect(queues.getByRole('link', { name: /Uygunsuzluk raporları/ })).toContainText('1');

  await page.evaluate(() => {
    (window as Window & { __spaMarker?: string }).__spaMarker = 'still-here';
  });
  await main.getByRole('link', { name: /SAT-5/ }).click();
  await expect(page).toHaveURL(/\/procurement\/purchase-requests\/pending\/?\?talep=SAT-5$/);
  await expect(page.getByRole('dialog', { name: 'Talep Detayları - SAT-5' })).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { __spaMarker?: string }).__spaMarker)).toBe('still-here');

  // The user's own tasks were asked for by their id.
  const tasks = backend.callsTo('/projects/department-tasks/', 'GET')[0]!;
  expect(new URLSearchParams(tasks.query).get('assigned_to')).toBe(String(session.user.id));
  consoleErrors.expectNone();
});

test('counts the pages a user opens and offers them as shortcuts', async ({ page }) => {
  const session = await seedSession(page, { admin: false, grants: ['/sales/customers/', '/sales/'] });
  await mockBackend(page, {}, { session });

  for (let i = 0; i < 2; i++) {
    await page.goto('/sales/customers/');
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
  }
  await page.goto('/');
  const shortcuts = page
    .getByRole('main')
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Kısayollar' }) });
  await expect(shortcuts.getByRole('link').first()).toHaveAttribute('href', '/sales/customers');
});

test('what waits on the user wears a red badge on the home sections, the menu and the bell', async ({ page, consoleErrors }) => {
  const session = await seedSession(page, { admin: true, user: { department_code: 'procurement' } });
  await mockBackend(
    page,
    {
      'GET /procurement/purchase-requests/pending_approval/': { json: { ...paginated([ROW]), count: 3 } },
      'GET /notifications/unread_count/': { json: { count: 5 } },
      'GET /approvals/inbox/': { json: [] },
    },
    { session },
  );

  await page.goto('/');
  const main = page.getByRole('main');
  const nav = page.getByRole('navigation', { name: 'Ana menü' });

  const waiting = main.locator('section').filter({ has: page.getByRole('heading', { name: 'Onayınızı Bekleyenler' }) });
  await expect(waiting.locator('[data-count-badge]')).toContainText('3');
  const queues = main.locator('section').filter({ has: page.getByRole('heading', { name: 'Onay Kuyruklarım' }) });
  await expect(queues.locator('[data-count-badge]')).toContainText(['3', '3']);
  const latest = main.locator('section').filter({ has: page.getByRole('heading', { name: 'Son Bildirimler' }) });
  await expect(latest.locator('[data-count-badge]')).toContainText('5');

  await expect(nav.getByRole('button', { name: 'Satın Alma, 3 bekleyen' })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Bildirimler, 5 okunmamış' })).toBeVisible();
  // Sections with nothing waiting carry no badge.
  await expect(nav.getByRole('button', { name: 'Satış' })).toBeVisible();
  consoleErrors.expectNone();
});

test('a pinned page stays first among the shortcuts', async ({ page }) => {
  const session = await seedSession(page, { admin: true });
  await mockBackend(page, {}, { session });

  await page.goto('/');
  const bar = page.getByRole('main').locator('section').filter({ has: page.getByRole('heading', { name: 'Kısayollar' }) });
  await bar.getByRole('button', { name: 'Kısayol ekle' }).click();
  await page.getByRole('textbox', { name: 'Sayfa ara' }).fill('teklifler');
  await page.getByRole('button', { name: /Teklifler/ }).click();
  await expect(bar.getByRole('link').first()).toHaveAttribute('href', '/sales/offers');

  await page.reload();
  await expect(bar.getByRole('link').first()).toHaveAttribute('href', '/sales/offers');
  await bar.getByRole('button', { name: 'Teklifler sabitlemesini kaldır' }).click();
  await expect(bar.getByRole('button', { name: 'Teklifler sabitlemesini kaldır' })).toHaveCount(0);
});

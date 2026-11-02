import { expect, mockBackend, seedSession, test } from './fixtures';
import { handlers } from './mocks/managementDashboard';

// /management/dashboard/: one GET /reports/dashboard/ fills the page (the slow
// cache is fresh in the mock, so no ?block=slow), plus the daily summary.

test('admin: the management dashboard shows the scorecard, queues, trends and the Neden? drawer', async ({
  page,
  consoleErrors,
}) => {
  const session = await seedSession(page, { admin: true });
  const backend = await mockBackend(page, handlers, { session });

  await page.goto('/management/dashboard/');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Yönetim Paneli' })).toBeVisible();

  // Band: pillar verdicts.
  await expect(page.locator('#dash-rag-red')).toContainText('2');
  await expect(page.locator('#dash-rag-orange')).toContainText('3');
  await expect(page.locator('#dash-rag-green')).toContainText('2');

  // Pillars, live strip, queues.
  const delivery = page.locator('#pillar-delivery');
  await expect(delivery).toContainText('%27');
  await expect(delivery).toContainText('Kritik');
  await expect(page.locator('#pillar-order_book')).toContainText('864,5 t');
  await expect(page.locator('#pillar-finance')).toContainText('€84k');
  await expect(page.locator('#dash-live')).toContainText('19/24');
  await expect(main.getByText('Sizi bekleyen 3 · en eski 2 gün')).toBeVisible();
  await expect(main.getByText('Termin geçti')).toBeVisible();

  // A trend chart draws.
  const trend = page.locator('[data-trend="ob"]');
  await expect(trend.locator('svg.recharts-surface').first()).toBeVisible();
  await expect(
    main.getByRole('heading', { name: 'Haftalık net ilerleme (13 hafta)' }),
  ).toBeVisible();

  // Daily summary.
  await expect(main.getByText(/Dün 4 yeni iş emri açıldı/)).toBeVisible();

  // Neden? drawer.
  await delivery.click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toContainText('Teslimat — Neden?');
  await expect(drawer.getByRole('link', { name: 'E2E-254-01' })).toBeVisible();

  expect(backend.callsTo('/reports/dashboard/', 'GET').map((c) => c.query)).toEqual(['']);
  // The page's own endpoints are all mocked (the shell's attendance call is not this page's).
  expect(backend.unhandled().filter((p) => /\/(reports|assistant)\//.test(p))).toEqual([]);
  consoleErrors.expectNone();
});

test('phone: the RAG dots lead and three trends wait behind "Daha fazla eğilim"', async ({
  page,
  consoleErrors,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const session = await seedSession(page, { admin: true });
  await mockBackend(page, handlers, { session });

  await page.goto('/management/dashboard/');
  const dots = page.getByRole('navigation', { name: 'Sütun durumları' });
  await expect(dots.getByRole('button')).toHaveCount(7);
  await expect(dots.getByRole('button', { name: 'Teslimat: Kritik' })).toBeVisible();
  await expect(page.locator('[data-trend]')).toHaveCount(3);
  await page.getByRole('button', { name: 'Daha fazla eğilim' }).click();
  await expect(page.locator('[data-trend]')).toHaveCount(6);
  consoleErrors.expectNone();
});

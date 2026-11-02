import { expect, mockBackend, seedSession, test } from './fixtures';
import { cashFlowHandlers, executiveOverviewHandlers } from './mocks/financeDashboards';

// The cash-flow (Nakit Akış Tablosu) and executive overview (Yönetici Özeti)
// dashboards, as admin, against realistic payloads.

test('cash flow: figures, charts, monthly table and the month drill-down', async ({
  page,
  consoleErrors,
}) => {
  const session = await seedSession(page, { admin: true });
  const backend = await mockBackend(page, cashFlowHandlers, { session });

  await page.goto('/management/reports/cash-flow/');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Nakit Akış Tablosu' })).toBeVisible();

  // Default period: this month, sent to both reports.
  const forecast = backend.callsTo('/procurement/reports/payment-forecast')[0];
  expect(forecast?.query).toMatch(/^\?created_gte=\d{4}-\d{2}-01&created_lte=\d{4}-\d{2}-\d{2}$/);
  await expect
    .poll(() => backend.callsTo('/sales/reports/revenue/')[0]?.query)
    .toBe(forecast?.query);

  await expect(page.locator('#kpi-in-tile')).toContainText('€5.838.100,00');
  await expect(page.locator('#kpi-out-tile')).toContainText('€5.784.870,00');
  await expect(page.locator('#kpi-net-tile')).toContainText('+€53.230,00');
  await expect(page.locator('#kpi-net-tile')).toContainText('Giriş fazla');
  await expect(page.locator('#kpi-dbs')).toContainText('€318.450,00');

  await expect(main.getByRole('figure', { name: 'Aylık giriş ve çıkış' })).toBeVisible();
  await expect(main.getByRole('figure', { name: 'Kümülatif net' })).toBeVisible();
  await expect(main.locator('.recharts-surface').first()).toBeVisible();

  const october = main.getByRole('row', { name: /Ekim 2026/ }).first();
  await expect(october).toContainText('−€53.850,00');
  await expect(main.getByRole('row', { name: /Toplam/ }).first()).toContainText('€5.838.100,00');
  await expect(main.getByText('E2E Çelik Tedarik A.Ş.')).toBeVisible();

  await october.click();
  const drawer = page.getByRole('dialog', { name: /Ekim 2026 — Nakit Akış Detayı/ });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('tab', { name: 'Gelen (3)' })).toBeVisible();
  await expect(drawer).toContainText('Net: −€53.850,00');
  await expect(drawer).toContainText('Örnek Makine GmbH');
  expect(backend.callsTo('/sales/reports/inflow-detail/')[0]?.query).toBe('?month=2026-10');
  expect(backend.callsTo('/procurement/reports/outflow-detail/')[0]?.query).toBe('?month=2026-10');

  await drawer.getByRole('tab', { name: 'Giden (10)' }).click();
  await expect(drawer).toContainText('Tedarik / Satın Alma');
  await expect(drawer).toContainText('214 çalışan');
  await expect(drawer).toContainText('Bekleyen');

  consoleErrors.expectNone();
});

test('executive overview: KPIs, charts and the monthly table', async ({ page, consoleErrors }) => {
  const session = await seedSession(page, { admin: true });
  const backend = await mockBackend(page, executiveOverviewHandlers, { session });

  await page.goto('/finance/reports/executive-overview/?created_gte=2025-12-01');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Yönetici Özeti' })).toBeVisible();
  expect(backend.callsTo('/procurement/reports/payment-forecast')[0]?.query).toBe(
    '?created_gte=2025-12-01',
  );

  await expect(page.locator('#total-spent')).toContainText('€3.671.870,00');
  await expect(page.locator('#po-count')).toContainText('412');
  await expect(page.locator('#mom-percent')).toContainText('Azalış');
  await expect(page.locator('#yoy-percent')).toContainText('Artış');

  await expect(main.getByRole('figure', { name: 'Kümülatif harcama trendi' })).toBeVisible();
  await expect(main.getByRole('figure', { name: 'Ödeme dağılımı' })).toContainText('80,0%');

  const table = main.locator('section').filter({ hasText: 'Aylık Detaylar' });
  await expect(table.getByRole('row', { name: /Eki 2026/ })).toContainText('€392.150,00');

  consoleErrors.expectNone();
});

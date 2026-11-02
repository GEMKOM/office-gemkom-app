import { expect, mockBackend, seedSession, test } from './fixtures';
import { handlers } from './mocks/managementOverview';

// /management/reports/overview: six tabs, each loading its slice of
// GET /reports/overview/{slice}/, with the period and comparison in the URL.

test('admin: the overview report shows the period, the figures and the charts, and follows its filters', async ({
  page,
  consoleErrors,
}) => {
  const session = await seedSession(page, { admin: true });
  const backend = await mockBackend(page, handlers, { session });

  await page.goto('/management/reports/overview/');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Genel Bakış' })).toBeVisible();

  // The band names both periods; the first tab loads only its slice.
  await expect(page.locator('#ov-period')).toContainText('1 Kas 2026 – 30 Kas 2026');
  await expect(page.locator('#ov-prev-period')).toContainText('1 Eki 2026 – 31 Eki 2026');
  await expect(page.locator('#ov-active')).toContainText('42');
  await expect(main.getByRole('figure', { name: /İş emirleri duruma göre/ })).toBeVisible();
  expect(backend.callsTo('/reports/overview/job-orders/')[0]?.query).toBe(
    '?preset=current_month&compare=true',
  );
  expect(backend.callsTo('/reports/overview/operations/')).toHaveLength(0);

  // Procurement: tiles with the previous period, the overdue warning, the supplier chart.
  await main.getByRole('tab', { name: 'Satınalma' }).click();
  await expect(page).toHaveURL(/tab=proc/);
  await expect(page.locator('#ov-proc-requests')).toContainText('64');
  await expect(page.locator('#ov-proc-requests')).toContainText('Önceki: 58');
  await expect(main.getByRole('alert')).toContainText('Gecikmiş ödeme: 4 adet');
  await expect(
    main.getByRole('figure', { name: 'En yüksek tedarikçi harcaması (EUR)' }),
  ).toBeVisible();

  // Comparison off: the URL says so and the request drops compare=true.
  await main.getByRole('checkbox', { name: 'Önceki dönemle karşılaştır' }).click();
  await expect(page).toHaveURL(/compare=false/);
  await expect
    .poll(() => backend.callsTo('/reports/overview/procurement/').at(-1)?.query)
    .toBe('?preset=current_month');
  await expect(page.locator('#ov-prev-period')).toHaveCount(0);
  await expect(page.locator('#ov-proc-requests')).not.toContainText('Önceki');

  // Another preset.
  await main.getByRole('button', { name: /Dönem: Bu Ay/ }).click();
  await page.getByRole('menuitem', { name: 'Son 6 Ay' }).click();
  await expect(page).toHaveURL(/preset=last_6_months/);
  await expect
    .poll(() => backend.callsTo('/reports/overview/procurement/').at(-1)?.query)
    .toBe('?preset=last_6_months');

  // Taşeron: the top 10 chart.
  await main.getByRole('tab', { name: 'Taşeron' }).click();
  await expect(main.getByRole('figure', { name: /Taşeron Top 10/ })).toBeVisible();
  expect(backend.callsTo('/reports/overview/subcontracting/').at(-1)?.query).toBe(
    '?preset=last_6_months',
  );

  consoleErrors.expectNone();
});

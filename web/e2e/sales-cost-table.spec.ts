import { expect, mockBackend, seedSession, test } from './fixtures';
import { handlers as analyticsHandlers } from './mocks/managementAnalytics';

// Maliyet Tablosu (/sales/cost-table): the cost table with its tree, the
// inline selling price, a drill-down and a URL filter. It reads the same
// endpoints as Analitik, so it reuses that page's mocks.

const handlers = {
  ...analyticsHandlers,
  'GET /subcontracting/assignments/': {
    json: [
      {
        id: 1,
        subcontractor_name: 'E2E Usta Kaynak',
        price_tier_name: 'Kademe A',
        price_per_kg: '2.40',
        cost_currency: 'EUR',
        allocated_weight_kg: '4200',
        current_cost: '10080',
        unbilled_cost: '2016',
        current_progress: '60',
        last_billed_progress: '40',
        unbilled_progress: '20',
      },
    ],
  },
  'PATCH /projects/job-orders/E2E-254-01/cost_summary/': { json: { selling_price: '305000.00' } },
};

test('admin reads the cost table, edits a selling price and drills into a job', async ({
  page,
  consoleErrors,
}) => {
  const session = await seedSession(page, { admin: true });
  const backend = await mockBackend(page, handlers, { session });

  await page.goto('/sales/cost-table/');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Maliyet Tablosu' }).first()).toBeVisible();
  await expect(main.getByRole('cell', { name: 'E2E Tav Fırını Hattı' })).toBeVisible();
  expect(backend.callsTo('/projects/job-orders/cost_table/')[0]?.query).toContain(
    'ordering=job_no',
  );

  // A job's children.
  await main.getByRole('button', { name: 'E2E-254-01 genişlet' }).click();
  await expect(main.getByRole('cell', { name: 'E2E Fırın Gövdesi' })).toBeVisible();

  // Inline selling price: Turkish input, saved as an EUR decimal string.
  const price = main.locator('tr[data-row-id="0-E2E-254-01"] td[data-col="selling_price"]');
  await price.click();
  const input = main.getByRole('textbox', { name: 'Satış Fiyatı' });
  await input.fill('305.000');
  await input.press('Enter');
  await expect
    .poll(() => backend.callsTo('/projects/job-orders/E2E-254-01/cost_summary/', 'PATCH').length)
    .toBe(1);
  expect(
    backend.callsTo('/projects/job-orders/E2E-254-01/cost_summary/', 'PATCH')[0]?.body,
  ).toEqual({ selling_price: '305000.00', selling_price_currency: 'EUR' });
  await expect(price).toContainText('€305.000,00');
  // The children stay open: a saved price does not reload the table.
  await expect(main.getByRole('cell', { name: 'E2E Fırın Gövdesi' })).toBeVisible();

  // Taşeron drill-down.
  // The cost breakdown columns are collapsed until Toplam Maliyet expands them.
  await main.getByRole('button', { name: 'Maliyet kalemlerini göster', exact: true }).click();
  await main
    .locator('tr[data-row-id="0-E2E-254-01"] td[data-col="subcontractor_cost"]')
    .getByRole('button')
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('E2E-254-01 - Taşeron Detayları')).toBeVisible();
  await expect(dialog.getByRole('cell', { name: 'E2E Usta Kaynak' })).toBeVisible();
  await page.keyboard.press('Escape');

  // A filter pill goes to the URL and the API.
  await main.getByRole('button', { name: 'Durum' }).first().click();
  await page.getByRole('menuitem', { name: 'Aktif' }).click();
  await expect(page).toHaveURL(/status=active/);
  await expect
    .poll(() => backend.callsTo('/projects/job-orders/cost_table/').at(-1)?.query ?? '')
    .toContain('status=active');

  expect(
    backend.unhandled().filter((p) => /\/(projects|reports|subcontracting)\//.test(p)),
  ).toEqual([]);
  consoleErrors.expectNone();
});

test('the cost table renders empty without errors', async ({ page, consoleErrors }) => {
  const session = await seedSession(page, { admin: true });
  await mockBackend(page, {}, { session });
  await page.goto('/sales/cost-table/');
  await expect(page.getByRole('main').getByText('Kayıt bulunamadı.')).toBeVisible();
  consoleErrors.expectNone();
});

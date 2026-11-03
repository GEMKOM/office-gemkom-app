import { expect, mockBackend, seedSession, test } from './fixtures';
import { handlers } from './mocks/managementAnalytics';

// Analitik (/management/analytics): the band figures, the Top 15 chart, the
// cost table with its tree and footer, a URL filter and the drill-downs.

test('admin reads the analytics page, filters it and drills into a job', async ({
  page,
  consoleErrors,
}) => {
  const session = await seedSession(page, { admin: true });
  const backend = await mockBackend(page, handlers, { session });

  await page.goto('/management/analytics/');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Analitik', exact: true })).toBeVisible();

  // Band: İş Sayısı is the server count; the sums are over the page's rows.
  await expect(page.locator('#count dd')).toHaveText('46');
  await expect(page.locator('#avgMargin dd')).toHaveText('13,0%');
  await expect(page.locator('#revenue dd')).toHaveText('€621.000,00');
  await expect(page.locator('#cost dd')).toHaveText('€571.040,00');

  // The chart and its table view.
  const chart = main.getByRole('figure', { name: /En yüksek maliyetli 15 iş/ });
  await expect(chart.getByText('Malzeme').first()).toBeVisible();
  await chart.getByText('Tablo olarak göster').click();
  await expect(chart.getByRole('row').nth(1)).toContainText('E2E-254-01');

  // Cost table: rows, the footer, and a job's children.
  await expect(main.getByRole('cell', { name: /^E2E Tav Fırını/ })).toBeVisible();
  await expect(main.getByText('6 satır')).toBeVisible();
  await main.getByRole('button', { name: 'E2E-254-01 genişlet' }).click();
  await expect(main.getByRole('cell', { name: /^E2E Fırın/ })).toBeVisible();

  // Estimated cost drill-down.
  await main.getByRole('button', { name: 'Tahmini maliyet hesabı' }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('E2E-254-01 - Tahmini Maliyet Hesabı')).toBeVisible();
  await expect(dialog.getByText('Malzeme satırları toplamı')).toBeVisible();
  await dialog.getByRole('button', { name: 'Kapat' }).last().click();

  // Labor drill-down, then machining from it.
  await main.getByRole('button', { name: 'Maliyet detaylarını göster' }).click();
  await main.getByRole('button', { name: 'İşçilik Detayları' }).first().click();
  await expect(
    page.getByRole('dialog').getByText('E2E-254-01 - İş Maliyeti Detayları'),
  ).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Detay', exact: true })
    .first()
    .click();
  await expect(page.getByText('E2E-254-01 - Talaşlı İmalat Detayları')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'E2E Usta İki' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // A filter pill goes to the URL and the API.
  await main.getByRole('button', { name: 'İmalat' }).first().click();
  await page.getByRole('menuitem', { name: 'İmalat Harici' }).click();
  await expect(page).toHaveURL(/manufactured=false/);
  await expect
    .poll(() => backend.callsTo('/projects/job-orders/cost_table/').at(-1)?.query ?? '')
    .toContain('manufactured=false');

  expect(
    backend.unhandled().filter((p) => /\/(projects|reports|machining|welding)\//.test(p)),
  ).toEqual([]);
  consoleErrors.expectNone();
});

// The cost table fits a laptop screen without a horizontal scrollbar, Katalog
// Kalemi is not a column, and Top 15 can be folded away (and stays folded).
for (const width of [1366, 1440]) {
  test(`the analytics table fits ${width}px without scrolling sideways`, async ({
    page,
    consoleErrors,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    const session = await seedSession(page, { admin: true });
    await mockBackend(page, handlers, { session });
    await page.goto('/management/analytics/');
    const main = page.getByRole('main');
    await expect(main.getByRole('cell', { name: /^E2E Tav Fırını/ })).toBeVisible();

    await expect(main.getByRole('columnheader', { name: 'Katalog Kalemi' })).toHaveCount(0);
    await expect(main.getByRole('button', { name: /Katalog Kalemi/ })).toBeVisible();
    // Short customer name, the full one on hover.
    await expect(main.getByText('Alfa', { exact: true }).first()).toHaveAttribute(
      'title',
      'E2E Test Müşteri Alfa A.Ş.',
    );

    const overflow = await main
      .locator('table')
      .filter({ has: page.getByRole('columnheader', { name: 'İş No' }) })
      .evaluate((table) => {
        for (let el = table.parentElement; el; el = el.parentElement) {
          if (/(auto|scroll)/.test(getComputedStyle(el).overflowX)) {
            return { scroll: el.scrollWidth, client: el.clientWidth };
          }
        }
        return null;
      });
    expect(overflow).not.toBeNull();
    expect(overflow!.scroll).toBeLessThanOrEqual(overflow!.client);
    consoleErrors.expectNone();
  });
}

test('Top 15 folds away and stays folded after a reload', async ({ page, consoleErrors }) => {
  const session = await seedSession(page, { admin: true });
  await mockBackend(page, handlers, { session });
  await page.goto('/management/analytics/');
  const main = page.getByRole('main');
  const chart = main.getByRole('figure', { name: /En yüksek maliyetli 15 iş/ });
  await expect(chart).toBeVisible();

  await main.getByRole('button', { name: 'Top 15 grafiğini gizle' }).click();
  await expect(chart).toHaveCount(0);
  await page.reload();
  await expect(main.getByRole('cell', { name: /^E2E Tav Fırını/ })).toBeVisible();
  await expect(chart).toHaveCount(0);

  await main.getByRole('button', { name: 'Top 15 grafiğini göster' }).click();
  await expect(chart).toBeVisible();
  consoleErrors.expectNone();
});

test('the analytics page renders empty without errors', async ({ page, consoleErrors }) => {
  const session = await seedSession(page, { admin: true });
  await mockBackend(page, {}, { session });
  await page.goto('/management/analytics/');
  await expect(page.getByRole('main').getByText('Kayıt bulunamadı.')).toBeVisible();
  await expect(page.locator('#count dd')).toHaveText('0');
  consoleErrors.expectNone();
});

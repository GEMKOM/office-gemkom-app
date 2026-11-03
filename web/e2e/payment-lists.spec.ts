import { expect, mockBackend, seedSession, test } from './fixtures';

// Ödeme Listeleri (/procurement/payment-lists/, React since this port). The
// Listeler / Ödeme Havuzu switcher is the only active-state marker: the
// selected view's button is filled, the other one is outlined.
//   GET /procurement/payment-lists/          Listeler (?view=lists, default)
//   GET /procurement/payment-pool/           Ödeme Havuzu (?view=pool)
//   GET /procurement/payment-pool/facets/    pool filter options

const page1 = (results: unknown[]) => ({
  count: results.length,
  next: null,
  previous: null,
  results,
});

const LIST = {
  id: 7,
  title: '27.10.2026 Ödeme Listesi',
  list_date: '2026-10-27',
  status: 'draft',
  status_label: 'Taslak',
  budget_eur: '10000.00',
  created_by_name: 'Ayşe',
  totals: { total_eur: '0', paid_eur: '0', included_count: 0, paid_count: 0, proforma_missing: 0 },
};

const FACETS = { job_nos: [], suppliers: [], gs_numbers: [] };

test('switcher: only the selected view is filled, through clicks and a reload', async ({
  page,
  consoleErrors,
}) => {
  const session = await seedSession(page, { admin: true });
  await mockBackend(
    page,
    {
      'GET /procurement/payment-lists/': { json: page1([LIST]) },
      'GET /procurement/payment-pool/': { json: page1([]) },
      'GET /procurement/payment-pool/facets/': { json: FACETS },
    },
    { session },
  );

  await page.goto('/procurement/payment-lists/');
  const main = page.getByRole('main');
  const lists = main.getByRole('button', { name: 'Listeler', exact: true });
  const pool = main.getByRole('button', { name: 'Ödeme Havuzu', exact: true });

  // Filled = the red primary background; the outlined button has a white/transparent one.
  const background = (locator: typeof lists) =>
    locator.evaluate((el) => getComputedStyle(el).backgroundColor);
  const expectOnlyListsFilled = async () => {
    await expect(lists).toHaveAttribute('aria-pressed', 'true');
    await expect(pool).toHaveAttribute('aria-pressed', 'false');
    const listsBg = await background(lists);
    const poolBg = await background(pool);
    expect(listsBg).not.toBe(poolBg);
    expect(await lists.getAttribute('data-variant')).toBe('filled');
    expect(await pool.getAttribute('data-variant')).toBe('default');
  };

  await expect(main.getByText('27.10.2026 Ödeme Listesi')).toBeVisible();
  await expectOnlyListsFilled();

  await pool.click();
  await expect(page).toHaveURL(/[?&]view=pool/);
  await expect(pool).toHaveAttribute('aria-pressed', 'true');
  await expect(lists).toHaveAttribute('aria-pressed', 'false');
  expect(await pool.getAttribute('data-variant')).toBe('filled');
  expect(await lists.getAttribute('data-variant')).toBe('default');

  await lists.click();
  await expect(main.getByText('27.10.2026 Ödeme Listesi')).toBeVisible();
  await expect(page).not.toHaveURL(/view=pool/);
  await expectOnlyListsFilled();

  // Reload keeps the state the URL names.
  await page.reload();
  await expect(main.getByText('27.10.2026 Ödeme Listesi')).toBeVisible();
  await expectOnlyListsFilled();

  await page.goto('/procurement/payment-lists/?view=pool');
  await expect(pool).toHaveAttribute('aria-pressed', 'true');
  await expect(lists).toHaveAttribute('aria-pressed', 'false');

  consoleErrors.expectNone();
});

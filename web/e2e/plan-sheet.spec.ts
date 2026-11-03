import { expect, mockBackend, test } from './fixtures';

// /projects/plan-sheet/ is the page a customer's share link opens: no session,
// no shell, the sheet behind the token.

const SHEET = {
  job_order: { job_no: '009-37', title: 'Kazan Gövdesi', customer_name: 'ACME Enerji', created_at: '2026-03-12' },
  today: '2026-09-01',
  termin: '2026-09-30',
  plan_end: '2026-10-16',
  projected_end: '2026-11-04',
  deviation_wd: 13,
  termin_gap_wd: 25,
  plan_vs_termin_wd: 12,
  holidays: [],
  nodes: [
    {
      job_no: '009-37',
      parent: null,
      depth: 0,
      title: 'Kazan Gövdesi',
      status: 'active',
      plan_start: '2026-06-01',
      plan_end: '2026-10-16',
      projected_end: '2026-11-04',
      completion_percentage: 38,
      deviation_wd: 13,
      termin: '2026-09-30',
      termin_gap_wd: 25,
    },
  ],
  rows: [
    {
      key: 'task:1',
      job_no: '009-37',
      depth: 0,
      kind: 'main',
      department: 'design',
      department_display: 'Dizayn',
      title: 'KAZAN',
      status: 'in_progress',
      plan_start: '2026-06-01',
      plan_end: '2026-07-15',
      projected_end: '2026-07-22',
      progress_pct: 20,
      expected_pct: 60,
      deviation_wd: 5,
      own_deviation_wd: 5,
      chain_deviation_wd: 0,
    },
  ],
};

test.describe('plan sheet share link', () => {
  test('opens without a session, outside the shell', async ({ page, consoleErrors }) => {
    const backend = await mockBackend(page, {
      'GET /projects/plan-sheet/shared/tok123/': {
        json: { link: { expires_at: '2026-12-31T00:00:00Z', options: {} }, sheet: SHEET },
      },
    });

    await page.goto('/projects/plan-sheet/?share=tok123');
    await expect(page).toHaveURL(/\/projects\/plan-sheet\/\?share=tok123$/);
    await expect(page.locator('#root')).toHaveCount(1);
    await expect(page.getByText('Plan ve Sapmalar', { exact: true })).toBeVisible();
    await expect(page.getByText('ACME Enerji')).toBeVisible();
    await expect(page.locator('[data-row="task:1"] [data-field="title"]')).toHaveText('Dizayn · KAZAN');
    await expect(page.getByText(/Bu bağlantı .* tarihine kadar geçerlidir/)).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Ana menü' })).toHaveCount(0);

    const calls = backend.callsTo('/projects/plan-sheet/shared/tok123/', 'GET');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.authorization).toBeUndefined();
    await expect(page).toHaveTitle('Plan ve Sapmalar · 009-37');
    consoleErrors.expectNone();
  });

  test('says so when neither a link nor a job order is given', async ({ page, consoleErrors }) => {
    await mockBackend(page);
    await page.goto('/projects/plan-sheet/');
    await expect(page.getByText('İş emri belirtilmedi.')).toBeVisible();
    await expect(page).toHaveURL(/\/projects\/plan-sheet\/$/);
    consoleErrors.expectNone();
  });
});

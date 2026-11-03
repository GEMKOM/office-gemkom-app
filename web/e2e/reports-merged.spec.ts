import { expect, mockBackend, paginated, seedSession, test } from './fixtures';

// Reports that were one page per department, merged into one report with a
// view switch. Contracts:
//   /manufacturing/reports/finished-timers/?module=   GET /<module>/timers/
//   /manufacturing/reports/job-costs/?breakdown=      combined: GET /reports/combined-job-costs
//                                                     welding: GET /welding/reports/job-costs/
//   the old per-department URLs forward there with the view preset.

const TIMER = {
  id: 21,
  username: 'kesimci',
  nesting_id: 'E9035',
  issue_key: 'CNC-12',
  thickness_mm: '10',
  machine_fk: 3,
  machine_name: 'Plazma 1',
  start_time: Date.UTC(2026, 9, 30, 6, 0),
  finish_time: Date.UTC(2026, 9, 30, 6, 45),
  comment: '',
  manual_entry: false,
};

test('a CNC-only user follows an old link to the merged report and sees only CNC', async ({
  page,
  consoleErrors,
}) => {
  const session = await seedSession(page, {
    admin: false,
    grants: ['/manufacturing/cnc-cutting/reports/finished-timers/'],
  });
  const backend = await mockBackend(
    page,
    {
      'GET /cnc_cutting/timers/': { json: paginated([TIMER]) },
      'GET /users/dropdown/': { json: [] },
    },
    { session },
  );

  await page.goto('/manufacturing/cnc-cutting/reports/finished-timers/?nesting_id=E90');
  await expect(page).toHaveURL(
    /\/manufacturing\/reports\/finished-timers\/\?nesting_id=E90&module=cnc_cutting$/,
  );
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Biten Zamanlayıcılar Raporu' })).toBeVisible();
  await expect(main.getByRole('link', { name: 'E9035' })).toBeVisible();
  // One shop granted: no switch, and nothing asked of the machining endpoints.
  await expect(main.getByRole('radiogroup', { name: 'Rapor görünümü' })).toHaveCount(0);
  expect(backend.callsTo('/cnc_cutting/timers/', 'GET')[0]!.query).toContain('nesting_id=E90');
  expect(backend.callsTo('/machining/timers/')).toHaveLength(0);

  // The İmalat › Raporlar hub opens through the inherited grant, with this card only.
  await page.goto('/manufacturing/reports/');
  await expect(main.getByRole('heading', { name: 'Raporlar', level: 1 })).toBeVisible();
  await expect(main.locator('article h3')).toHaveText(['Biten Zamanlayıcılar']);
  consoleErrors.expectNone();
});

test('admin: İş Maliyeti switches between the shops and the combined hours', async ({
  page,
  consoleErrors,
}) => {
  const session = await seedSession(page, { admin: true });
  const backend = await mockBackend(
    page,
    {
      'GET /welding/reports/job-costs/': {
        json: paginated([
          {
            job_no: '225-01',
            hours: { regular: 10, after_hours: 2, holiday: 0 },
            costs: { regular: 400, after_hours: 120, holiday: 0 },
            total_cost: 520,
            currency: 'EUR',
          },
        ]),
      },
      'GET /reports/combined-job-costs': {
        json: paginated([
          {
            job_no: '225-01',
            machining: { hours: { weekday_work: 4, after_hours: 0, sunday: 0 }, total_hours: 4 },
            welding: { hours: { regular: 10, after_hours: 2, holiday: 0 }, total_hours: 12 },
            combined_total_hours: 16,
          },
        ]),
      },
    },
    { session },
  );

  await page.goto('/manufacturing/welding/reports/cost-analysis/?job_no=225');
  await expect(page).toHaveURL(/\/manufacturing\/reports\/job-costs\/\?job_no=225&breakdown=welding$/);
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'İş Maliyeti Raporu', level: 1 })).toBeVisible();
  const views = main.getByRole('radiogroup', { name: 'Rapor görünümü' });
  await expect(views.getByRole('radio')).toHaveCount(3);
  await expect(views.getByRole('radio', { name: 'Kaynaklı İmalat' })).toBeChecked();
  await expect(main.getByRole('cell', { name: '€520,00' }).first()).toBeVisible();
  await page.screenshot({ path: 'test-results/job-costs-welding.png' });

  await views.getByText('Birleşik (saat)').click();
  await expect(main.getByRole('columnheader', { name: 'Kaynak Toplam Saat' })).toBeVisible();
  await expect(page).toHaveURL(/\/manufacturing\/reports\/job-costs\/\?job_no=225&breakdown=combined$/);
  await expect.poll(() => backend.callsTo('/reports/combined-job-costs', 'GET').length).toBe(1);
  expect(backend.callsTo('/reports/combined-job-costs', 'GET')[0]!.query).toContain('job_no=225');
  consoleErrors.expectNone();
});

import { expect, mockBackend, seedSession, test } from './fixtures';

// A grouped DataTable report: talaşlı imalat günlük verimlilik. Contract:
//   GET /machining/reports/daily-efficiency/?date=YYYY-MM-DD[&include_worked=true]
//     { users: [{ user_id, username, first_name, last_name, total_daily_hours, tasks: [...] }] }
// Each user's tasks sit under a collapsible header with the day's total hours.
//
// SHOT_GROUPING=<file.png> also saves a full-page screenshot with one group collapsed.

const REPORT = {
  users: [
    {
      user_id: 7,
      username: 'e2e.ahmet',
      first_name: 'Ahmet',
      last_name: 'Test',
      total_daily_hours: 7.5,
      tasks: [
        {
          task_key: 'TI-E2E-101',
          task_name: 'Flanş delik delme',
          job_no: 'E2E-254-01',
          machine_name: 'Torna 1',
          daily_duration_hours: 5,
          estimated_hours: 6,
          total_hours_spent: 5.5,
          efficiency: 109,
          completed_on_date: true,
        },
        {
          task_key: 'TI-E2E-102',
          task_name: 'Mil tornalama',
          job_no: 'E2E-254-02',
          machine_name: 'Torna 1',
          daily_duration_hours: 2.5,
          estimated_hours: 2,
          total_hours_spent: 3,
          efficiency: 67,
          completed_on_date: false,
        },
      ],
    },
    {
      user_id: 9,
      username: 'e2e.mehmet',
      first_name: 'Mehmet',
      last_name: 'Test',
      total_daily_hours: 4.25,
      tasks: [
        {
          task_key: 'TI-E2E-201',
          task_name: 'Kama yuvası',
          job_no: 'E2E-254-03',
          machine_name: 'Freze 2',
          daily_duration_hours: 4.25,
          estimated_hours: 4,
          total_hours_spent: 4.25,
          efficiency: 94,
          completed_on_date: false,
        },
      ],
    },
    {
      user_id: 12,
      username: 'e2e.ayse',
      first_name: 'Ayşe',
      last_name: 'Test',
      total_daily_hours: 6,
      tasks: [
        {
          task_key: 'TI-E2E-301',
          task_name: 'Dişli frezeleme',
          job_no: 'E2E-254-04',
          machine_name: 'Freze 1',
          daily_duration_hours: 6,
          estimated_hours: 5,
          total_hours_spent: 6,
          efficiency: 83,
          completed_on_date: true,
        },
      ],
    },
  ],
};

const ENDPOINT = '/machining/reports/daily-efficiency/';

test('daily efficiency: user groups collapse and expand, show their totals and follow the filters', async ({
  page,
  consoleErrors,
}) => {
  const session = await seedSession(page, { admin: true });
  const backend = await mockBackend(page, { [`GET ${ENDPOINT}`]: { json: REPORT } }, { session });

  await page.goto('/manufacturing/machining/reports/daily-efficiency/');
  const main = page.getByRole('main');
  await expect(
    main.getByRole('heading', { name: 'Günlük Verimlilik Raporu' }).first(),
  ).toBeVisible();

  // One header per user, in user id order, with the task count and the day's hours.
  const headers = main.locator('tr[data-group-row="header"]');
  await expect(headers).toHaveCount(3);
  const ahmet = headers.nth(0);
  await expect(ahmet).toContainText('Ahmet Test');
  await expect(ahmet).toContainText('(@e2e.ahmet)');
  await expect(ahmet).toContainText('2 görev');
  await expect(ahmet).toContainText('Toplam: 7,50 saat');
  await expect(headers.nth(1)).toContainText('Toplam: 4,25 saat');
  await expect(headers.nth(2)).toContainText('Toplam: 6,00 saat');

  // Figures on the band: users, the sum of the day's hours, tasks.
  await expect(main.locator('#total-users-count')).toContainText('3');
  await expect(main.locator('#total-work-hours')).toContainText('17,75');
  await expect(main.locator('#total-tasks')).toContainText('4');

  // Every group starts open.
  const task = (key: string) => main.getByRole('link', { name: key });
  await expect(task('TI-E2E-101')).toBeVisible();
  await expect(task('TI-E2E-102')).toBeVisible();
  await expect(task('TI-E2E-201')).toBeVisible();

  // The first request asked for one local day, without include_worked.
  const first = new URLSearchParams(backend.callsTo(ENDPOINT, 'GET')[0]!.query);
  expect(first.get('date')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(first.has('include_worked')).toBe(false);

  // Collapse Ahmet: his tasks go, the other groups stay.
  await ahmet.getByRole('button', { name: 'Grubu daralt' }).click();
  await expect(task('TI-E2E-101')).toHaveCount(0);
  await expect(task('TI-E2E-102')).toHaveCount(0);
  await expect(task('TI-E2E-201')).toBeVisible();
  await expect(ahmet.getByRole('button', { name: 'Grubu genişlet' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  // The header still carries the totals while collapsed.
  await expect(ahmet).toContainText('Toplam: 7,50 saat');

  const shot = process.env.SHOT_GROUPING;
  if (shot) await page.screenshot({ path: shot, fullPage: true });

  // Expand again: the rows come back.
  await ahmet.getByRole('button', { name: 'Grubu genişlet' }).click();
  await expect(task('TI-E2E-101')).toBeVisible();
  await expect(task('TI-E2E-102')).toBeVisible();

  // A filter change reaches the request and the URL.
  await main
    .getByRole('checkbox', { name: 'O gün çalışılan tüm görevler (tamamlanmamış dahil)' })
    .click();
  await expect
    .poll(() =>
      backend
        .callsTo(ENDPOINT, 'GET')
        .some((call) => new URLSearchParams(call.query).get('include_worked') === 'true'),
    )
    .toBe(true);
  await expect(page).toHaveURL(/include_worked=true/);
  const last = new URLSearchParams(backend.callsTo(ENDPOINT, 'GET').at(-1)!.query);
  expect(last.get('date')).toBe(first.get('date'));
  // The completion column comes with it.
  await expect(main.getByRole('columnheader', { name: 'Tarihte tamamlandı' })).toBeVisible();

  consoleErrors.expectNone();
});

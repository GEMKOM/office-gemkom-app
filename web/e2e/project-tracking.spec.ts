import { expect, mockBackend, paginated, seedSession, test } from './fixtures';

// /projects/project-tracking/ (Proje Takibi). Contracts used here:
//   GET /projects/job-orders/[?root_only&search&status__in&customer&ordering&page&page_size]
//   GET /projects/job-orders/<no>/ · department_tasks/ · production-plan/
//   GET /projects/job-orders/production-plan-overview/?status=all|active
//   GET /projects/job-orders/<no>/meeting-brief/ · plan-sheet/

const JOB = {
  job_no: 'E2E-270',
  title: 'E2E Kazan Projesi',
  status: 'active',
  customer_short_name: 'E2E Müşteri',
  children_count: 1,
  department_task_count: 0,
  completion_percentage: 40,
  target_completion_date: '2099-06-01',
  created_at: '2026-10-01T09:00:00Z',
};
const CHILD = { job_no: 'E2E-270-01', title: 'E2E Alt İş', status: 'active', parent: 'E2E-270' };

async function openPage(page: import('@playwright/test').Page, path = '/projects/project-tracking/') {
  const session = await seedSession(page, { admin: true });
  const backend = await mockBackend(
    page,
    {
      'GET /projects/job-orders/': { json: paginated([JOB]) },
      'GET /projects/job-orders/status_choices/': {
        json: [
          { value: 'active', label: 'Aktif' },
          { value: 'draft', label: 'Taslak' },
        ],
      },
      [`GET /projects/job-orders/${JOB.job_no}/`]: { json: { ...JOB, children: [CHILD] } },
      'GET /projects/job-orders/production-plan-overview/': {
        json: {
          items: [
            {
              job_no: JOB.job_no,
              title: JOB.title,
              forecast: { verdict: 'on_track', variance_wd: 0, projected_completion_date: '2099-05-20' },
            },
          ],
          generated_at: '2026-11-03T08:00:00Z',
        },
      },
      [`GET /projects/job-orders/${JOB.job_no}/production-plan/`]: { json: { tasks: [], nodes: [] } },
    },
    { session },
  );
  await page.goto(path);
  return backend;
}

test('lists job orders, expands a sub-job and opens the detail modal', async ({ page, consoleErrors }) => {
  const backend = await openPage(page);
  const main = page.getByRole('main');
  await expect(main.getByRole('button', { name: JOB.job_no, exact: true })).toBeVisible();
  await expect(main.getByText('E2E Müşteri')).toBeVisible();
  await expect(main.getByText('Zamanında')).toBeVisible();
  const list = backend.callsTo('/projects/job-orders/', 'GET')[0]!;
  expect(new URLSearchParams(list.query).get('root_only')).toBe('true');

  await main.getByRole('button', { name: 'Alt işleri göster' }).click();
  await expect(main.getByRole('button', { name: CHILD.job_no, exact: true })).toBeVisible();

  await main.getByRole('button', { name: JOB.job_no, exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(`İş Emri Detayları: ${JOB.job_no}`);
  await expect(page).toHaveURL(/job_no=E2E-270/);
  consoleErrors.expectNone();
});

test('Sunum Modu opens from the header and takes the job_no of its slide', async ({ page }) => {
  await openPage(page);
  await page.getByRole('button', { name: 'Sunum Modu' }).click();
  await expect(page).toHaveURL(/meeting=1/);
  await expect(page.getByText(JOB.title).first()).toBeVisible();
  await expect(page).toHaveURL(/job_no=E2E-270/);
});

import { expect, mockBackend, paginated, seedSession, test } from './fixtures';

// The five department task pages (one shared React component, per-department
// config). Contracts:
//   GET   /projects/department-tasks/?department=<d>&main_only=true...   the list
//   GET   /projects/department-tasks/<id>/                               the task modal
//   PATCH /projects/department-tasks/<id>/                               an inline edit

const PAGES = [
  { path: '/design/projects/', department: 'design', title: 'Dizayn Departmanı Görevleri' },
  { path: '/logistics/projects/', department: 'logistics', title: 'Lojistik Departmanı Görevleri' },
  {
    path: '/manufacturing/projects/',
    department: 'manufacturing',
    title: 'İmalat Departmanı Görevleri',
  },
  { path: '/planning/projects/', department: 'planning', title: 'Planlama Departmanı Görevleri' },
  {
    path: '/procurement/projects/',
    department: 'procurement',
    title: 'Satın Alma Departmanı Görevleri',
  },
];

const TASK = {
  id: 41,
  job_order: 'E2E-300',
  job_order_title: 'e2e Konveyör',
  title: 'e2e görev',
  customer_name: 'e2e Müşteri',
  status: 'pending',
  can_start: true,
  subtasks_count: 0,
  weight: 10,
  completion_percentage: 0,
};

for (const { path, department, title } of PAGES) {
  test(`${path}: lists the department's tasks and opens a task`, async ({
    page,
    consoleErrors,
  }) => {
    const session = await seedSession(page, { admin: true });
    const backend = await mockBackend(
      page,
      {
        'GET /projects/department-tasks/': { json: paginated([{ ...TASK, department }]) },
        'GET /projects/department-tasks/41/': { json: { ...TASK, department } },
        'PATCH /projects/department-tasks/41/': ({ body }) => ({
          json: { ...TASK, ...(body as object) },
        }),
      },
      { session },
    );

    await page.goto(path);
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: title })).toBeVisible();
    const row = page.locator('tr[data-row-id="41"]');
    await expect(row).toContainText('e2e Konveyör');
    const list = backend.callsTo('/projects/department-tasks/', 'GET')[0]!;
    const query = new URLSearchParams(list.query);
    expect(query.get('department')).toBe(department);
    expect(query.get('main_only')).toBe('true');

    // The Tamamlanma bar is drawn (it once collapsed to zero width inside the editable cell).
    const bar = row
      .locator('td[data-col="completion_percentage"] [role="progressbar"]')
      .locator('..');
    expect((await bar.boundingBox())?.width ?? 0).toBeGreaterThan(60);
    await expect(row.locator('td[data-col="completion_percentage"]')).toContainText('0.0%');

    // Ağırlık starts hidden at laptop width (1440); the Sütunlar menu brings it back.
    await expect(row.locator('td[data-col="weight"]')).toHaveCount(0);
    await main.getByRole('button', { name: /^Sütunlar \(\d+ gizli\)$/ }).click();
    await page.getByRole('checkbox', { name: 'Ağırlık' }).click();
    await page.keyboard.press('Escape');

    // Inline edit: one PATCH with the field.
    await row.locator('td[data-col="weight"]').click();
    const weight = page.getByRole('textbox', { name: 'Ağırlık' });
    await weight.fill('12,5');
    await weight.press('Enter');
    await expect
      .poll(() => backend.callsTo('/projects/department-tasks/41/', 'PATCH').length)
      .toBe(1);
    expect(backend.callsTo('/projects/department-tasks/41/', 'PATCH')[0]!.body).toEqual({
      weight: 12.5,
    });

    // Detay: the task modal, deep-linked by ?task=.
    await row.getByRole('button', { name: 'Detay' }).click();
    await expect(page).toHaveURL(/[?&]task=41/);
    const dialog = page.getByRole('dialog', { name: 'Görev İşlemleri' });
    await expect(dialog.getByRole('tab', { name: 'Düzenle' })).toBeVisible();
    await expect(dialog.getByRole('tab', { name: 'Başlat' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page).not.toHaveURL(/task=41/);

    // Gantt: the list is asked for the visible month, by start date.
    await page.getByText('Gantt', { exact: true }).click();
    await expect(page.getByText('Gantt Gorunumu')).toBeVisible();
    await expect
      .poll(() =>
        backend
          .callsTo('/projects/department-tasks/', 'GET')
          .some((c) => c.query.includes('date_range_start')),
      )
      .toBe(true);
    const ganttCall = backend
      .callsTo('/projects/department-tasks/', 'GET')
      .find((c) => c.query.includes('date_range_start'))!;
    expect(new URLSearchParams(ganttCall.query).get('ordering')).toBe('target_start_date');

    consoleErrors.expectNone();
  });
}

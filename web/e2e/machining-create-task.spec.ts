import { expect, mockBackend, paginated, seedSession, test } from './fixtures';

// /manufacturing/machining/create-task/: draft rows and "Oluşturduğum Görevler".
//   GET  /machining/tasks/?created_by=<me>...   the creator's tasks
//   POST /machining/tasks/bulk-create/          [{ name, job_no, ..., finish_time }]

test('create-task: fill a draft row, create it, see the new key', async ({
  page,
  consoleErrors,
}) => {
  const session = await seedSession(page, { admin: true });
  const backend = await mockBackend(
    page,
    {
      'GET /machining/tasks/': {
        json: paginated([{ key: 'TI-E2E-1', name: 'e2e Mil', job_no: 'E2E-1', quantity: 1 }]),
      },
      'POST /machining/tasks/bulk-create/': {
        status: 201,
        json: [{ key: 'TI-E2E-2', name: 'e2e Flanş', job_no: 'E2E-1' }],
      },
    },
    { session },
  );

  await page.goto('/manufacturing/machining/create-task/');
  await expect(
    page.getByRole('main').getByRole('heading', { name: 'Görev Oluştur', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('e2e Mil')).toBeVisible();
  const list = backend.callsTo('/machining/tasks/', 'GET')[0]!;
  expect(new URLSearchParams(list.query).get('ordering')).toBe('key');
  expect(new URLSearchParams(list.query).get('created_by')).not.toBeNull();

  const draft = page.locator('tr[data-row-id^="draft-"]').first();
  const fill = async (col: string, value: string) => {
    await draft.locator(`td[data-col="${col}"]`).click();
    const input = draft.locator(`td[data-col="${col}"] input`);
    await input.fill(value);
    await input.press('Enter');
  };
  await fill('name', 'e2e Flanş');
  await fill('job_no', 'E2E-1');
  await fill('quantity', '3');
  await fill('finish_time', '2026-11-20');

  await page.getByRole('button', { name: 'Görevleri Oluştur' }).click();
  const dialog = page.getByRole('dialog', { name: 'Görevler Başarıyla Oluşturuldu' });
  await expect(dialog.getByText('TI-E2E-2')).toBeVisible();
  expect(backend.callsTo('/machining/tasks/bulk-create/', 'POST')[0]!.body).toEqual([
    {
      name: 'e2e Flanş',
      job_no: 'E2E-1',
      image_no: null,
      position_no: null,
      quantity: 3,
      finish_time: '2026-11-20',
      description: null,
    },
  ]);
  consoleErrors.expectNone();
});

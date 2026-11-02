import { expect, mockBackend, paginated, seedSession, test } from './fixtures';

// DataTable inline cell editing on the machining parts list
// (/manufacturing/machining/tasks/list/). Contracts:
//   GET   /tasks/parts/            the list (PT-2 is converted: locked)
//   PATCH /tasks/parts/<key>/      { <field>: <value> } per edited cell

const SCREENSHOT = process.env.E2E_EDIT_SCREENSHOT;

const PARTS = [
  {
    key: 'PT-1',
    name: 'e2e Flanş',
    description: 'e2e ön yüz',
    job_no: 'E2E-254',
    job_allocations: [{ job_no: 'E2E-254', quantity: 4, share: 1 }],
    is_multi_job: false,
    image_no: 'R-1',
    position_no: 'P-1',
    quantity: 4,
    material: 'St37',
    weight_kg: '1.500',
    operation_count: 2,
    incomplete_operation_count: 1,
    finish_time: '2026-11-20',
    files: [],
    is_locked: false,
  },
  {
    key: 'PT-2',
    name: 'e2e Mil',
    description: '',
    job_no: 'E2E-255',
    is_multi_job: false,
    quantity: 2,
    material: 'C45',
    operation_count: 1,
    incomplete_operation_count: 0,
    finish_time: null,
    files: [],
    is_locked: true,
    department_request_number: 'DR-E2E',
  },
];

test('parts list: inline edit saves, Escape cancels, a failed save rolls back, locked rows stay read-only', async ({
  page,
  consoleErrors,
}) => {
  // The browser logs the 400 this test provokes.
  consoleErrors.allow(/status of 400/);
  const session = await seedSession(page, { admin: true });
  const backend = await mockBackend(
    page,
    {
      'GET /tasks/parts/': { json: paginated(PARTS) },
      'GET /tasks/parts/stats/': {
        json: {
          parts_with_unassigned_operations: 0,
          parts_with_unplanned_operations: 0,
          parts_without_operations: 0,
        },
      },
      'PATCH /tasks/parts/PT-1/': async ({ body }) => {
        const patch = body as Record<string, unknown>;
        if (patch.material === 'e2e-hatalı') {
          return { status: 400, json: { material: ['Geçersiz malzeme.'] } };
        }
        // A slow save keeps the optimistic state visible for a moment.
        await new Promise((resolve) => setTimeout(resolve, 150));
        return { json: { ...PARTS[0], ...patch } };
      },
    },
    { session },
  );

  await page.goto('/manufacturing/machining/tasks/list/');
  const row = page.locator('tr[data-row-id="PT-1"]');
  const cell = (col: string) => row.locator(`td[data-col="${col}"]`);
  await expect(cell('name')).toContainText('e2e Flanş');

  // Click, type, Enter: one PATCH with the field, the cell shows the new value.
  await cell('name').click();
  const nameInput = page.getByRole('textbox', { name: 'Ad', exact: true });
  await expect(nameInput).toBeFocused();
  await nameInput.fill('e2e Flanş B');
  await nameInput.press('Enter');
  await expect(cell('name')).toContainText('e2e Flanş B');
  await expect.poll(() => backend.callsTo('/tasks/parts/PT-1/', 'PATCH').length).toBe(1);
  expect(backend.callsTo('/tasks/parts/PT-1/', 'PATCH')[0]!.body).toEqual({ name: 'e2e Flanş B' });
  await expect(cell('name')).not.toHaveAttribute('data-cell-state', 'saving');
  await expect(page.getByText('Parça başarıyla güncellendi')).toBeVisible();

  // Numbers go typed; the Turkish decimal comma is read.
  await cell('weight_kg').click();
  const weight = page.getByRole('textbox', { name: 'Ağırlık (kg)' });
  await weight.fill('2,25');
  await weight.press('Enter');
  await expect(cell('weight_kg')).toContainText('2.250 kg');
  await expect.poll(() => backend.callsTo('/tasks/parts/PT-1/', 'PATCH').length).toBe(2);
  expect(backend.callsTo('/tasks/parts/PT-1/', 'PATCH')[1]!.body).toEqual({ weight_kg: 2.25 });

  // Escape cancels: no request, the old value stays.
  await cell('description').click();
  const description = page.getByRole('textbox', { name: 'Açıklama' });
  await description.fill('e2e vazgeçildi');
  await description.press('Escape');
  await expect(description).toBeHidden();
  await expect(cell('description')).toContainText('e2e ön yüz');
  await expect(cell('description')).toBeFocused();
  expect(backend.callsTo('/tasks/parts/PT-1/', 'PATCH')).toHaveLength(2);

  // A rejected save rolls the value back and marks the cell.
  await cell('material').click();
  const material = page.getByRole('textbox', { name: 'Malzeme' });
  await material.fill('e2e-hatalı');
  await material.press('Enter');
  await expect(cell('material')).toHaveAttribute('data-cell-state', 'error');
  await expect(cell('material')).toContainText('St37');
  await expect(cell('material')).not.toContainText('e2e-hatalı');
  await expect(
    cell('material').getByRole('img', { name: /Parça güncellenirken hata oluştu/ }),
  ).toBeVisible();
  await expect(page.getByText(/Parça güncellenirken hata oluştu/).first()).toBeVisible();
  expect(backend.callsTo('/tasks/parts/PT-1/', 'PATCH')[2]!.body).toEqual({
    material: 'e2e-hatalı',
  });

  // The converted part is not editable: no edit cells, a click opens nothing.
  const locked = page.locator('tr[data-row-id="PT-2"]');
  await expect(locked.locator('td[data-edit-cell]')).toHaveCount(0);
  await locked.getByText('e2e Mil').click();
  await expect(page.getByRole('textbox', { name: 'Ad', exact: true })).toHaveCount(0);
  expect(backend.callsTo('/tasks/parts/PT-2/', 'PATCH')).toHaveLength(0);

  // A cell in edit mode next to the failed one, for the record.
  await cell('image_no').click();
  await expect(page.getByRole('textbox', { name: 'Resim No' })).toBeFocused();
  if (SCREENSHOT) {
    await page.locator('table').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: SCREENSHOT, fullPage: false });
  }
  await page.keyboard.press('Escape');

  consoleErrors.expectNone();
});

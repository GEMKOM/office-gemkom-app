import { expect, mockBackend, paginated, seedSession, test } from './fixtures';

// Aktarılacak Departman Talepleri (/planning/department-requests/): the three
// tables load with their own filters, and Transfer Et opens the planning
// request form filled from the department request, with one job-order request
// for all of its rows.

const APPROVED = [
  {
    id: 31,
    requestor_username: 'ayse',
    department: 'maintenance',
    priority: 'urgent',
    needed_date: '2026-12-01',
    status: 'approved',
    status_label: 'Onaylandı',
    items_count: 2,
  },
];

const DEPARTMENT_DETAIL = {
  ...APPROVED[0],
  title: 'Hat 2 bakım malzemesi',
  items: [
    { item_code: 'K-1', item_name: 'Rulman', quantity: 4, item_unit: 'adet', job_no: '24-118' },
    { item_code: 'K-2', item_name: 'Kayış', quantity: 1, item_unit: 'metre', job_no: '24-120' },
  ],
  files: [],
};

const PLANNING = [
  {
    id: 7,
    request_number: 'PT-2026-0042',
    title: 'Rulman alımı',
    created_by_username: 'plan',
    priority: 'normal',
    status: 'draft',
    status_label: 'Taslak',
    items_count: 1,
  },
];

test('admin: department requests to transfer, and the transfer form', async ({
  page,
  consoleErrors,
}) => {
  const session = await seedSession(page, { admin: true });
  const backend = await mockBackend(
    page,
    {
      'GET /planning/department-requests/approved_requests/': {
        json: paginated(APPROVED, { count: 1 }),
      },
      'GET /planning/department-requests/31/': { json: DEPARTMENT_DETAIL },
      'GET /planning/requests/': (req) => ({
        json: paginated(req.query.get('status') === 'pending_erp_entry' ? [] : PLANNING),
      }),
      'GET /projects/job-orders/dropdown/': {
        json: [
          { job_no: '24-118', title: 'Vinç' },
          { job_no: '24-120', title: 'Konveyör' },
        ],
      },
    },
    { session },
  );

  await page.goto('/planning/department-requests/?dr_department=maintenance');
  const main = page.getByRole('main');
  await expect(
    main.getByRole('heading', { name: 'Aktarılacak Departman Talepleri' }).first(),
  ).toBeVisible();
  await expect(main.getByRole('row').filter({ hasText: 'ayse' })).toBeVisible();
  await expect(main.getByRole('row').filter({ hasText: 'Rulman alımı' })).toBeVisible();
  await expect(main.getByText('ERP girişi bekleyen planlama talebi bulunamadı.')).toBeVisible();
  const approved = new URLSearchParams(
    backend.callsTo('/planning/department-requests/approved_requests/', 'GET')[0]!.query,
  );
  expect(approved.get('department')).toBe('maintenance');

  await main
    .getByRole('row')
    .filter({ hasText: 'ayse' })
    .getByRole('button', { name: 'Transfer Et' })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Planlama Talebi Oluştur (Departman Talebinden)');
  await expect(dialog.getByLabel('Ürün kodu 2')).toHaveValue('K-2');
  await expect(dialog.getByLabel('İş no 2')).toHaveValue('24-120 - Konveyör');
  expect(backend.callsTo('/projects/job-orders/dropdown/', 'GET')).toHaveLength(1);
  consoleErrors.expectNone();
});

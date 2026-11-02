import { expect, mockBackend, paginated, seedSession, test } from './fixtures';

// /it/inventory/, the most used Bilgi İşlem list. Contracts used here:
//   GET /machines/?used_in=it&page&page_size[&name…]   DRF page of devices
//   GET /machines/types/                               [{value,label}]
//   PATCH /machines/<id>/                              the edit modal's save

const DEVICES = [
  {
    id: 1,
    name: 'e2e-laptop-1',
    code: 'E2E-IT-1',
    machine_type: 'laptop',
    machine_type_label: 'Laptop',
    used_in: 'it',
    is_active: true,
    is_under_maintenance: false,
    assigned_users: [],
    properties: { ram: '16 GB' },
  },
  {
    id: 2,
    name: 'e2e-printer',
    code: 'E2E-IT-2',
    machine_type: 'printer',
    machine_type_label: 'Yazıcı',
    used_in: 'it',
    is_active: false,
    is_under_maintenance: false,
    assigned_users: [],
    properties: {},
  },
];

test('admin: filter the device list, then edit a device', async ({ page, consoleErrors }) => {
  const session = await seedSession(page, { admin: true });
  const backend = await mockBackend(
    page,
    {
      'GET /machines/': { json: paginated(DEVICES) },
      'GET /machines/types/': {
        json: [
          { value: 'laptop', label: 'Laptop' },
          { value: 'printer', label: 'Yazıcı' },
        ],
      },
      'PATCH /machines/1/': ({ body }) => ({ json: { ...DEVICES[0], ...(body as object) } }),
    },
    { session },
  );

  await page.goto('/it/inventory/');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1, name: 'IT Envanter' })).toBeVisible();
  await expect(main.getByRole('row').filter({ hasText: 'E2E-IT-1' })).toContainText('e2e-laptop-1');
  await expect(main.getByRole('row').filter({ hasText: 'E2E-IT-2' })).toContainText('e2e-printer');

  // The search box applies on Enter, goes into the URL and reaches the request.
  const search = main.getByLabel('Cihaz Adı');
  await search.fill('laptop');
  await search.press('Enter');
  await expect(page).toHaveURL(/[?&]name=laptop/);
  await expect
    .poll(() =>
      backend.callsTo('/machines/', 'GET').some((call) => {
        const query = new URLSearchParams(call.query);
        return query.get('name') === 'laptop' && query.get('used_in') === 'it';
      }),
    )
    .toBe(true);

  // Edit: rename and save; the PATCH carries the form.
  await main.getByRole('row').filter({ hasText: 'E2E-IT-1' }).getByRole('button', { name: 'Düzenle' }).click();
  const dialog = page.getByRole('dialog', { name: 'Cihaz Düzenle' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/^Cihaz Adı/).fill('e2e-laptop-renamed');
  await dialog.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('Cihaz başarıyla güncellendi')).toBeVisible();
  await expect(dialog).toBeHidden();

  const [patch] = backend.callsTo('/machines/1/', 'PATCH');
  expect(patch?.body).toMatchObject({
    name: 'e2e-laptop-renamed',
    code: 'E2E-IT-1',
    machine_type: 'laptop',
    used_in: 'it',
    is_active: true,
  });
  consoleErrors.expectNone();
});

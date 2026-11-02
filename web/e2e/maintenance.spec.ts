import { expect, mockBackend, paginated, seedSession, test } from './fixtures';

// Arıza Talepleri, the most-used page of the shop-floor batch. Contracts:
//   /manufacturing/maintenance/fault-requests/   "Arıza Talepleri", rows from
//       GET /machines/faults/ (DRF page; unresolved=true by default), filter
//       pills in the URL, create via POST /machines/faults/

const FAULTS = [
  {
    id: 101,
    machine: 3,
    machine_name: 'CNC Torna 1',
    description: 'Mil sesi geliyor',
    is_breaking: true,
    is_maintenance: false,
    reported_by: 7,
    reported_by_full_name: 'Ali Yılmaz',
    reported_at: '2026-10-30T08:00:00Z',
    resolved_at: null,
  },
  {
    id: 103,
    machine: 4,
    machine_name: 'Pres 2',
    description: 'Yağ kaçağı',
    is_breaking: false,
    is_maintenance: false,
    reported_by: 8,
    reported_at: '2026-10-28T08:00:00Z',
    resolved_at: null,
  },
];

test('admin filters the fault requests and reports a new fault', async ({
  page,
  consoleErrors,
}) => {
  const session = await seedSession(page, { admin: true });
  const backend = await mockBackend(
    page,
    {
      'GET /machines/faults/': { json: paginated(FAULTS) },
      'POST /machines/faults/': ({ body }) => ({
        status: 201,
        json: { id: 120, ...(body as object) },
      }),
      'GET /machines/dropdown/': {
        json: [
          { id: 3, name: 'CNC Torna 1' },
          { id: 4, name: 'Pres 2' },
        ],
      },
    },
    { session },
  );

  await page.goto('/manufacturing/maintenance/fault-requests/');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Arıza Talepleri', level: 1 })).toBeVisible();
  await expect(main.getByText('CNC Torna 1')).toBeVisible();
  await expect(main.getByText('Yağ kaçağı')).toBeVisible();
  const lastList = () =>
    new URLSearchParams(backend.callsTo('/machines/faults/', 'GET').at(-1)!.query);
  expect(lastList().get('unresolved')).toBe('true');

  // A pill writes the URL and refetches with the legacy params.
  await main.getByRole('button', { name: /^Tür/ }).click();
  await page.getByRole('menuitem', { name: 'Makine Duruşu' }).click();
  await expect(page).toHaveURL(/[?&]type=breaking/);
  await expect.poll(() => lastList().get('is_breaking')).toBe('true');
  expect(lastList().get('unresolved')).toBe('true');

  // Report a fault on equipment that is not in the machine list.
  await page.getByRole('button', { name: 'Yeni Arıza Talebi' }).click();
  const dialog = page.getByRole('dialog', { name: 'Yeni Arıza Talebi' });
  await dialog.getByRole('button', { name: 'Gönder' }).click();
  await expect(dialog.getByText('Açıklama zorunludur')).toBeVisible();
  expect(backend.callsTo('/machines/faults/', 'POST')).toHaveLength(0);

  await dialog.getByLabel('Özel Ekipman Bilgisi Gir').check();
  await dialog.getByLabel('Ekipman Adı').fill('Kompresör');
  await dialog.getByLabel('Konum').fill('Bahçe');
  await dialog.getByLabel('Açıklama').fill('Basınç düşük');
  await dialog.getByRole('textbox', { name: 'Tür' }).click();
  await page.getByRole('option', { name: 'Arıza', exact: true }).click();
  await dialog.getByRole('button', { name: 'Gönder' }).click();

  await expect(page.getByText('Arıza talebi başarıyla oluşturuldu')).toBeVisible();
  await expect(dialog).toBeHidden();
  const [post] = backend.callsTo('/machines/faults/', 'POST');
  expect(post!.body).toEqual({
    description: 'Basınç düşük',
    is_maintenance: false,
    is_breaking: false,
    asset_name: 'Kompresör',
    location: 'Bahçe',
  });
  consoleErrors.expectNone();
});

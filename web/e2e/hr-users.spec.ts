import { expect, mockBackend, paginated, seedSession, test } from './fixtures';

// /human_resources/users/, the most used page of the quality control / HR batch.
// Contracts used here:
//   GET  /users/        DRF page of users (username, names, is_active)
//   POST /users/        creates the user, answers its id
//   POST /users/wages/  the first wage, sent after the user when Aylık Ücret is set

const USERS = '/human_resources/users/';

const MOCK_USERS = [
  { id: 9201, username: 'e2e-user', first_name: 'E2e', last_name: 'Kişi', is_active: true },
];

test('admin: creates a user with a first wage and the list reloads', async ({
  page,
  consoleErrors,
}) => {
  const session = await seedSession(page, { admin: true });
  const backend = await mockBackend(
    page,
    {
      'GET /users/': { json: paginated(MOCK_USERS) },
      'POST /users/': ({ body }) => ({ status: 201, json: { id: 9299, ...(body as object) } }),
      'POST /users/wages/': ({ body }) => ({ status: 201, json: { id: 1, ...(body as object) } }),
    },
    { session },
  );

  await page.goto(USERS);
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Çalışanlar' })).toBeVisible();
  await expect(main.getByRole('row').filter({ hasText: 'e2e-user' })).toBeVisible();
  // Durum defaults to active, as the legacy filter did.
  expect(backend.callsTo('/users/', 'GET')[0]!.query).toContain('is_active=true');
  const listsBefore = backend.callsTo('/users/', 'GET').length;

  await page.getByRole('button', { name: 'Yeni Çalışan' }).click();
  const dialog = page.getByRole('dialog', { name: 'Yeni Çalışan Oluştur' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Kullanıcı Adı').fill('e2e-yeni');
  await dialog.getByLabel(/^Ad\b/).fill('Yeni');
  await dialog.getByLabel('Soyad').fill('Çalışan');
  await dialog.getByLabel('Aylık Ücret').fill('25000');
  await dialog.getByRole('button', { name: 'Kaydet' }).click();

  await expect(page.getByText('Çalışan başarıyla oluşturuldu')).toBeVisible();
  await expect(dialog).toBeHidden();

  const [create] = backend.callsTo('/users/', 'POST');
  expect(create!.body).toMatchObject({
    username: 'e2e-yeni',
    first_name: 'Yeni',
    last_name: 'Çalışan',
    is_active: true,
  });
  const [wage] = backend.callsTo('/users/wages/', 'POST');
  expect(wage!.body).toMatchObject({ user: 9299, base_monthly: '25000.0000' });

  await expect.poll(() => backend.callsTo('/users/', 'GET').length).toBeGreaterThan(listsBefore);
  consoleErrors.expectNone();
});

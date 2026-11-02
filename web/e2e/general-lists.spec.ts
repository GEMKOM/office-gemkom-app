import { expect, mockBackend, paginated, seedSession, test } from './fixtures';

// The Genel list pages. /general/vacation/requests/ is in every user's menu
// ("İzin Taleplerim"), so it gets a full flow here.
//   GET  /vacation-requests/requests/?mine=true   the user's own requests
//   GET  /vacation-requests/my-summary/           band figures
//   GET  /vacation-requests/preview/              working-day preview in the form
//   POST /vacation-requests/requests/             create

const REQUEST = {
  id: 7101,
  leave_type: 'annual_leave',
  leave_type_display: 'Yıllık İzin',
  start_date: '2026-11-16',
  end_date: '2026-11-18',
  duration_days: 3,
  status: 'submitted',
  status_label: 'Onay Bekliyor',
  created_at: '2026-11-01T09:00:00+03:00',
};

test('vacation requests: list, summary figures and a new request', async ({ page, consoleErrors }) => {
  const session = await seedSession(page, { admin: false, grants: ['/general/vacation/requests/'] });
  const backend = await mockBackend(
    page,
    {
      'GET /vacation-requests/requests/': ({ callIndex }) => ({
        json: paginated(callIndex === 0 ? [REQUEST] : [REQUEST, { ...REQUEST, id: 7102, start_date: '2026-12-01', end_date: '2026-12-02' }]),
      }),
      'GET /vacation-requests/my-summary/': {
        json: { annual_leave: { remaining_days: '12.5', used_days: '7.5' }, years_of_service: 4 },
      },
      'GET /vacation-requests/upcoming-leaves/': { json: { results: [] } },
      'GET /vacation-requests/preview/': {
        json: { start_date: '2026-12-01', end_date: '2026-12-02', duration_days: 2, excluded: [] },
      },
      'POST /vacation-requests/requests/': { status: 201, json: { ...REQUEST, id: 7102 } },
    },
    { session },
  );

  await page.goto('/general/vacation/requests/');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1, name: 'İzin Taleplerim' })).toBeVisible();
  await expect(page.locator('#remaining-annual-leave')).toContainText('12.5 gün');
  await expect(page.locator('#years-of-service')).toContainText('4 yıl');
  await expect(main.locator('tbody tr')).toHaveCount(1);
  expect(backend.callsTo('/vacation-requests/requests/', 'GET')[0]!.query).toContain('mine=true');

  await main.getByRole('button', { name: 'Yeni İzin Talebi' }).click();
  const dialog = page.getByRole('dialog', { name: 'Yeni İzin Talebi' });
  await dialog.getByLabel('Başlangıç Tarihi').fill('2026-12-01');
  await dialog.getByLabel('Bitiş Tarihi').fill('2026-12-02');
  await expect(dialog.getByTestId('preview-days')).toHaveText('2');
  await dialog.getByLabel('Gerekçe (opsiyonel)').fill('E2E izin');
  await dialog.getByRole('button', { name: 'Talep Oluştur' }).click();

  await expect(page.getByText('İzin talebi oluşturuldu.')).toBeVisible();
  await expect(dialog).toHaveCount(0);
  const [post] = backend.callsTo('/vacation-requests/requests/', 'POST');
  expect(post!.body).toEqual({
    leave_type: 'annual_leave',
    start_date: '2026-12-01',
    end_date: '2026-12-02',
    reason: 'E2E izin',
  });
  await expect(main.locator('tbody tr')).toHaveCount(2);
  consoleErrors.expectNone();
});

import { expect, mockBackend, paginated, seedSession, test } from './fixtures';

// Planlama Kalemleri (/planning/items/), the busiest list of the planning and
// procurement batch: filters travel in the URL and reach the request, and the
// Kullanıldı action posts after its confirm. The admin load of every migrated
// route lives in smoke.spec.ts.

const ITEMS = [
  {
    id: 11,
    item_code: '0100-SAC-10',
    item_name: 'Sac Levha 10 mm',
    planning_request_number: 'PT-2026-0042',
    job_no: '24-118',
    is_consumed: false,
  },
  {
    id: 12,
    item_code: '0200-PROFIL',
    item_name: 'HEA 200 Profil',
    planning_request_number: 'PT-2026-0043',
    job_no: '24-120',
    is_consumed: false,
  },
];

test('admin: planning items filter through the URL and mark an item consumed', async ({
  page,
  consoleErrors,
}) => {
  const session = await seedSession(page, { admin: true });
  const backend = await mockBackend(
    page,
    {
      'GET /planning/items/': (req) => ({
        json: paginated(
          req.query.get('job_no')
            ? ITEMS.filter((i) => i.job_no === req.query.get('job_no'))
            : ITEMS,
          { count: 2 },
        ),
      }),
      'POST /planning/items/11/mark_consumed/': { json: { ...ITEMS[0], is_consumed: true } },
    },
    { session },
  );

  await page.goto('/planning/items/?job_no=24-118');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Planlama Kalemleri' })).toBeVisible();
  await expect(main.getByRole('row').filter({ hasText: '0100-SAC-10' })).toBeVisible();
  await expect(main.getByRole('row').filter({ hasText: '0200-PROFIL' })).toHaveCount(0);

  const first = backend.callsTo('/planning/items/', 'GET')[0]!;
  const query = new URLSearchParams(first.query);
  expect(query.get('job_no')).toBe('24-118');
  expect(query.get('include_price')).toBe('true');
  expect(query.get('ordering')).toBe('-id');
  expect(query.get('page')).toBe('1');

  await main
    .getByRole('row')
    .filter({ hasText: '0100-SAC-10' })
    .getByRole('button', { name: 'Kullanıldı' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Kullanıldı İşareti' });
  await expect(dialog).toContainText('0100-SAC-10 kalemi "kullanıldı" olarak işaretlenecek.');
  await dialog.getByRole('button', { name: 'Evet' }).click();

  await expect(page.getByText('Kalem kullanıldı olarak işaretlendi')).toBeVisible();
  expect(backend.callsTo('/planning/items/11/mark_consumed/', 'POST')).toHaveLength(1);
  // The list reloads after the change.
  await expect.poll(() => backend.callsTo('/planning/items/', 'GET').length).toBeGreaterThan(1);
  consoleErrors.expectNone();
});

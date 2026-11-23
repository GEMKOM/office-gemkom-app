import { expect, mockBackend, paginated, seedSession, test } from './fixtures';

// Planlama Kalemleri (/planning/items/), the busiest list of the planning and
// procurement batch: filters travel in the URL and reach the request. It is a
// report: no row actions. The admin load of every migrated route lives in
// smoke.spec.ts.

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

test('admin: planning items filter through the URL, with no row actions', async ({
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

  await expect(
    main
      .getByRole('row')
      .filter({ hasText: '0100-SAC-10' })
      .getByRole('button', { name: 'Kullanıldı' }),
  ).toHaveCount(0);
  consoleErrors.expectNone();
});

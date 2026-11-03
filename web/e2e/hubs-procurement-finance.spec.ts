import { expect, mockBackend, paginated, seedSession, test } from './fixtures';

// The procurement, planning, logistics, accounting and finance hubs (MenuCards).
// The admin run of every migrated route lives in smoke.spec.ts; these check the
// cards per user and the one live figure, purchase requests awaiting approval.

const PENDING = {
  'GET /procurement/purchase-requests/pending_approval/': { json: paginated([], { count: 5 }) },
};

const cardTitles = (page: import('@playwright/test').Page) =>
  page.getByRole('main').locator('article h3');

test('admin: the procurement hub shows its cards, live queues and band buttons', async ({
  page,
  consoleErrors,
}) => {
  const session = await seedSession(page, { admin: true });
  const backend = await mockBackend(
    page,
    {
      'GET /procurement/purchase-requests/pending_approval/': {
        json: paginated(
          [
            {
              id: 418,
              request_number: 'PR-2026-0418',
              title: 'Paslanmaz sac 4 mm',
              requestor_username: 'ayse.kaya',
              status: 'submitted',
              priority: 'urgent',
              total_amount_eur: '12480.00',
            },
          ],
          { count: 5 },
        ),
      },
    },
    { session },
  );

  await page.goto('/procurement/');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Satın Alma', exact: true })).toBeVisible();
  await expect(cardTitles(page)).toHaveText([
    'Satın Alma Talepleri',
    'Ödeme Listeleri',
    'Tedarikçiler',
    'Projeler',
  ]);
  await expect(page.locator('#pending-requests')).toContainText('5');
  const pending = main.locator('section').filter({
    has: page.getByRole('heading', { name: 'Onayınızı Bekleyen Talepler' }),
  });
  await expect(pending.getByRole('link', { name: /PR-2026-0418/ })).toHaveAttribute(
    'href',
    '/procurement/purchase-requests/pending?talep=PR-2026-0418',
  );
  for (const title of [
    'Talep Bekleyen Malzemeler',
    'Teslim Bekleyen Kritik Malzemeler',
    'Bu Hafta Ödenecekler',
  ]) {
    await expect(main.getByRole('heading', { name: title })).toBeVisible();
  }
  expect(backend.callsTo('/procurement/purchase-requests/pending_approval/')[0]?.query).toBe(
    '?page_size=5',
  );

  // The band's Raporlar opens the report hub client-side.
  await main.getByRole('link', { name: 'Raporlar', exact: true }).click();
  await expect(page).toHaveURL(/\/procurement\/reports\/?$/);
  await expect(cardTitles(page)).toHaveText(['Ürün Raporu', 'Tedarikçi Raporu', 'Personel Raporu']);
  consoleErrors.expectNone();
});

test('admin: planning and finance hubs list their cards in the legacy order', async ({
  page,
  consoleErrors,
}) => {
  const session = await seedSession(page, { admin: true });
  await mockBackend(page, {}, { session });

  await page.goto('/planning/');
  await expect(cardTitles(page)).toHaveText([
    'Departman Talepleri',
    'Görev Şablonları',
    'Stok',
    'Projeler',
    'Proje Planlama',
    'Malzeme Maliyeti Satırları',
    'Planlama Kalemleri',
  ]);

  await page.goto('/finance/');
  await expect(cardTitles(page)).toHaveText(['Finans İşlemleri', 'Raporlar']);
  consoleErrors.expectNone();
});

test('a user with some grants sees only those cards, and no hub without one', async ({
  page,
  consoleErrors,
}) => {
  // Grants match routes exactly: a sub-page needs its own grant.
  const session = await seedSession(page, {
    grants: [
      '/procurement/purchase-requests/',
      '/procurement/purchase-requests/pending/',
      '/finance/reports/',
    ],
  });
  const backend = await mockBackend(page, PENDING, { session });

  await page.goto('/procurement/');
  const main = page.getByRole('main');
  await expect(cardTitles(page)).toHaveText(['Satın Alma Talepleri']);
  const card = main.locator('article');
  await expect(card.getByRole('link', { name: 'Bekleyen Talepler' })).toBeVisible();
  await expect(card.getByRole('link', { name: 'Talep Oluştur' })).toHaveCount(0);
  await expect(card.getByRole('link', { name: 'Kayıt Defteri' })).toHaveCount(0);
  await expect(page.locator('#pending-requests')).toContainText('5');

  await page.goto('/finance/');
  await expect(cardTitles(page)).toHaveText(['Raporlar']);
  await expect(main.getByRole('link', { name: 'Yönetici Özeti' })).toHaveCount(0);
  await expect(page.locator('#pending-requests')).toHaveCount(0);
  const pendingCalls = backend.callsTo('/procurement/purchase-requests/pending_approval/').length;

  await page.goto('/logistics/');
  await expect(main.getByRole('heading', { name: 'Erişim yetkiniz yok' })).toBeVisible();
  await expect(main.locator('article')).toHaveCount(0);

  await page.goto('/accounting/');
  await expect(main.getByRole('heading', { name: 'Erişim yetkiniz yok' })).toBeVisible();
  // The hubs without access ask for nothing themselves: each full load adds
  // only the menu badge's one request for the approvals count.
  expect(backend.callsTo('/procurement/purchase-requests/pending_approval/')).toHaveLength(
    pendingCalls + 2,
  );
  consoleErrors.expectNone();
});

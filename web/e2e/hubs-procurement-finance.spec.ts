import { expect, mockBackend, paginated, seedSession, test } from './fixtures';

// The procurement, planning, logistics, accounting and finance hubs (MenuCards).
// The admin run of every migrated route lives in smoke.spec.ts; these check the
// cards per user and the one live figure, purchase requests awaiting approval.

const PENDING = {
  'GET /procurement/purchase-requests/pending_approval/': { json: paginated([], { count: 5 }) },
};

const cardTitles = (page: import('@playwright/test').Page) =>
  page.getByRole('main').locator('article h3');

test('admin: the procurement hub shows every card and the requests awaiting approval', async ({
  page,
  consoleErrors,
}) => {
  const session = await seedSession(page, { admin: true });
  const backend = await mockBackend(page, PENDING, { session });

  await page.goto('/procurement/');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Satın Alma Modülü' })).toBeVisible();
  await expect(cardTitles(page)).toHaveText([
    'Projeler',
    'Tedarikçiler',
    'Kritik Malzemeler',
    'Ödeme Listeleri',
    'Satın Alma Talepleri',
    'Raporlar',
  ]);
  await expect(page.locator('#pending-requests')).toContainText('5');
  await expect(main.locator('article').filter({ hasText: 'Satın Alma Talepleri' })).toContainText(
    '5 talep onayınızı bekliyor',
  );
  expect(backend.callsTo('/procurement/purchase-requests/pending_approval/')[0]?.query).toBe(
    '?page_size=1',
  );

  // Sub-hubs open client-side.
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
  // Only the procurement hub asked for the figure.
  expect(backend.callsTo('/procurement/purchase-requests/pending_approval/')).toHaveLength(
    pendingCalls,
  );
  consoleErrors.expectNone();
});

import { expect, mockBackend, paginated, seedSession, test } from './fixtures';

// The three purchase-request pages (React since this port). Contracts:
//   GET  /procurement/purchase-requests/pending_approval/ and approved_by_me/   pending lists
//   GET  /procurement/purchase-requests/?request_number=<talep>                  ?talep= deep link
//   GET  /procurement/purchase-requests/<id>/                                    the details modal
//   POST /procurement/purchase-requests/<id>/approve/                            Onayla
//   POST /procurement/purchase-requests/ + <id>/submit/                          create → Gönder

const ROW = {
  id: 5,
  request_number: 'SAT-5',
  title: 'e2e Konveyör',
  requestor_username: 'e2e',
  status: 'submitted',
  status_label: 'Gönderildi',
  priority: 'normal',
  created_at: '2026-10-30T10:00:00Z',
};
const DETAIL = {
  ...ROW,
  request_items: [{ id: 51, quantity: '4.00', item: { code: 'A1', name: 'e2e Flanş', unit: 'adet' } }],
  offers: [
    {
      currency: 'TRY',
      supplier: { id: 3, name: 'e2e Tedarikçi' },
      item_offers: [{ id: 501, purchase_request_item: 51, unit_price: '10.00', is_recommended: true }],
    },
  ],
  approval: { stage_instances: [] },
};

test('pending: ?talep= opens the request and Onayla approves it', async ({ page, consoleErrors }) => {
  const session = await seedSession(page, { admin: true });
  const backend = await mockBackend(
    page,
    {
      'GET /procurement/purchase-requests/pending_approval/': { json: paginated([ROW]) },
      'GET /procurement/purchase-requests/approved_by_me/': { json: paginated([]) },
      'GET /procurement/purchase-requests/': { json: paginated([ROW]) },
      'GET /procurement/purchase-requests/5/': { json: DETAIL },
      'GET /currency-rates/': { json: { rates: { TRY: 1, EUR: 0.025 } } },
      'POST /procurement/purchase-requests/5/approve/': { json: { ok: true } },
    },
    { session },
  );

  await page.goto('/procurement/purchase-requests/pending/?talep=SAT-5');
  const dialog = page.getByRole('dialog', { name: 'Talep Detayları - SAT-5' });
  await expect(dialog.getByText('e2e Tedarikçi')).toBeVisible();
  const lookup = backend.callsTo('/procurement/purchase-requests/', 'GET')[0]!;
  expect(new URLSearchParams(lookup.query).get('request_number')).toBe('SAT-5');

  await dialog.getByRole('button', { name: 'Onayla' }).click();
  await page.getByRole('button', { name: 'Evet, Onayla' }).click();
  await expect.poll(() => backend.callsTo('/procurement/purchase-requests/5/approve/', 'POST').length).toBe(1);
  await expect(page).not.toHaveURL(/talep=/);
  consoleErrors.expectNone();
});

test('registry: lists the requests and keeps filters in the URL', async ({ page, consoleErrors }) => {
  const session = await seedSession(page, { admin: true });
  const backend = await mockBackend(
    page,
    {
      'GET /procurement/purchase-requests/': { json: paginated([ROW]) },
      'GET /procurement/status-choices/': { json: [{ value: 'submitted', label: 'Gönderildi' }] },
    },
    { session },
  );
  await page.goto('/procurement/purchase-requests/registry/?priority=urgent');
  await expect(page.getByRole('heading', { name: 'Satın Alma Talepleri Kayıt Defteri' })).toBeVisible();
  await expect(page.locator('tr[data-row-id="5"]')).toContainText('e2e Konveyör');
  const list = backend.callsTo('/procurement/purchase-requests/', 'GET').at(-1)!;
  expect(new URLSearchParams(list.query).get('priority')).toBe('urgent');
  consoleErrors.expectNone();
});

test('create: builds a request and sends it', async ({ page, consoleErrors }) => {
  const session = await seedSession(page, { admin: true });
  const backend = await mockBackend(
    page,
    {
      'GET /currency-rates/': { json: { rates: { TRY: 1, EUR: 0.025 } } },
      'GET /planning/items/available_count/': { json: { count: 0 } },
      'GET /procurement/payment-terms/': { json: [{ id: 3, name: '30 gün' }] },
      'PUT /procurement/purchase-request-draft/autosave/': { json: { id: 1 } },
      'POST /procurement/purchase-requests/': { json: { id: 77 } },
      'POST /procurement/purchase-requests/77/submit/': { json: { ok: true } },
    },
    { session },
  );
  // A page restored from the browser's autosave copy (legacy localStorage shape).
  await page.addInitScript(() => {
    const supplier = (id: string, name: string) => ({
      id,
      name,
      contact_person: '',
      phone: '',
      email: '',
      default_currency: 'TRY',
      default_payment_terms: '3',
      default_tax_rate: 20,
    });
    const offer = (p: number) => ({ unitPrice: p, totalPrice: p * 4, deliveryDays: 5, notes: '' });
    if (sessionStorage.getItem('e2e-seeded')) return;
    sessionStorage.setItem('e2e-seeded', '1');
    localStorage.setItem(
      'purchaseRequestDraft',
      JSON.stringify({
        title: 'e2e talep',
        description: '',
        priority: 'normal',
        needed_date: '2026-11-20',
        items: [
          // Rows come only from planning lines (the PR create rule since 2026-11-09).
          { id: 'i1', code: 'A1', name: 'e2e Flanş', job_no: '254-01', quantity: 4, unit: 'adet', specs: '', specifications: '', item_description: '', source_planning_request_item_id: 21 },
        ],
        planning_request_item_ids: [21],
        suppliers: [supplier('s1', 'Acme'), supplier('s2', 'Beta')],
        offers: { s1: { 0: offer(10) }, s2: { 0: offer(12) } },
        itemRecommendations: {},
        timestamp: new Date().toISOString(),
      }),
    );
  });
  await page.goto('/procurement/purchase-requests/create/');
  await expect(page.getByRole('heading', { name: 'Satın Alma Talebi Oluştur' })).toBeVisible();
  await expect(page.getByLabel('Talep Başlığı')).toHaveValue('e2e talep');

  // No recommendation yet: Gönder is refused and nothing is posted.
  await page.getByRole('button', { name: 'Gönder' }).click();
  await expect(page.getByText('Malzeme 1: Bu malzeme için tedarikçi önerisi seçmelisiniz').first()).toBeVisible();
  expect(backend.callsTo('/procurement/purchase-requests/', 'POST')).toHaveLength(0);

  await page.getByRole('button', { name: 'Acme öner' }).click();
  await page.getByRole('button', { name: 'Gönder' }).click();
  await expect.poll(() => backend.callsTo('/procurement/purchase-requests/77/submit/', 'POST').length).toBe(1);
  const body = backend.callsTo('/procurement/purchase-requests/', 'POST')[0]!.body as Record<string, unknown>;
  expect(body.recommendations).toEqual({ 0: 's1' });
  expect(body.items).toEqual([
    expect.objectContaining({
      code: 'A1',
      quantity: '4.00',
      allocations: [{ job_no: '254-01', quantity: '4.00' }],
      planning_request_item_id: 21,
    }),
  ]);
  expect(body.planning_request_item_ids).toEqual([21]);
  await expect(page.getByLabel('Talep Başlığı')).toHaveValue('');
  consoleErrors.expectNone();
});

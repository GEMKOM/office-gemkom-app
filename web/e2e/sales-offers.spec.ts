import { expect, MOCK_CUSTOMERS, mockBackend, paginated, seedSession, test } from './fixtures';

// /sales/offers/ (Satış Teklifleri). Contracts used here:
//   GET  /sales/offers/[?search&status__in&created_by&customer&ordering&page&page_size]
//   GET  /sales/offers/<id>/ · items/ · files/ · consultations/ · price-history/ · approval-status/
//   POST /sales/offers/<id>/add-items/ · set-prices/ · mark-won/ …
//   GET  /sales/offer-templates/ · <id>/nodes/ · <id>/nodes/<node>/

const customer = MOCK_CUSTOMERS[0]!;

const OFFER = {
  id: 9201,
  offer_no: 'E2E-TKL-001',
  title: 'Test Teklif',
  status: 'pricing',
  status_display: 'Fiyatlandırma',
  customer: customer.id,
  customer_name: customer.name,
  customer_code: customer.code,
  customer_detail: { ...customer, phone: '', address: '' },
  total_price: '1500.00',
  item_count: 2,
  pricing_mode: 'flat',
  approval_round: 0,
  created_by_name: 'Satış Kullanıcı',
  created_at: '2026-10-01T09:00:00Z',
  offer_expiry_date: '2099-01-01',
};

const ITEMS = [
  {
    id: 1,
    parent: null,
    sequence: 1,
    template_node: 77,
    template_node_detail: { id: 77, title: 'Konveyör' },
    resolved_title: 'Konveyör',
    quantity: 2,
    unit_price: '500',
    weight_kg: '100',
    children: [
      {
        id: 2,
        parent: 1,
        sequence: 1,
        title_override: 'Motor',
        resolved_title: 'Motor',
        quantity: 1,
        children: [],
      },
    ],
  },
];

async function openPage(page: import('@playwright/test').Page) {
  const session = await seedSession(page, { admin: true });
  const backend = await mockBackend(
    page,
    {
      'GET /sales/offers/': { json: paginated([OFFER]) },
      [`GET /sales/offers/${OFFER.id}/`]: { json: OFFER },
      [`GET /sales/offers/${OFFER.id}/items/`]: { json: ITEMS },
      [`GET /sales/offers/${OFFER.id}/files/`]: { json: [] },
      [`GET /sales/offers/${OFFER.id}/price-history/`]: { json: [] },
      [`GET /sales/offers/${OFFER.id}/approval-status/`]: { status: 404, json: { detail: 'yok' } },
      [`POST /sales/offers/${OFFER.id}/set-prices/`]: { json: { offer: OFFER, items: ITEMS } },
      [`POST /sales/offers/${OFFER.id}/add-items/`]: { json: [] },
      [`GET /projects/customers/${customer.id}/`]: { json: customer },
      'GET /sales/offer-templates/': { json: [{ id: 5, name: 'Ekipman' }] },
      'GET /sales/offer-templates/5/nodes/': {
        json: [{ id: 77, title: 'Konveyör', children_count: 1 }],
      },
      'GET /sales/offer-templates/5/nodes/77/': {
        json: [{ id: 78, title: 'Bant', children_count: 0 }],
      },
    },
    { session },
  );
  await page.goto('/sales/offers/');
  return backend;
}

test('lists offers and opens one on the tab its status is about', async ({
  page,
  consoleErrors,
}) => {
  const backend = await openPage(page);
  const row = page.locator('tr').filter({ hasText: OFFER.offer_no });
  await expect(row).toBeVisible();
  await page.screenshot({ path: 'test-results/offers-list.png' });

  // The status badge opens Fiyatlandırma and puts the offer in the URL.
  await row.getByTitle('Fiyatlandırma sekmesini aç').click();
  const dialog = page.getByRole('dialog', { name: `${OFFER.offer_no} — ${OFFER.title}` });
  await expect(dialog.getByRole('tab', { name: 'Fiyatlandırma' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page).toHaveURL(/offer_no=E2E-TKL-001/);
  await expect(page).toHaveURL(/tab=pricing/);
  await expect(dialog.getByTestId('pricing-items-total')).toHaveText(/1\.000/);
  await page.screenshot({ path: 'test-results/offers-pricing.png' });

  // A price change: the totals follow, then one set-prices POST.
  await dialog.getByRole('textbox', { name: 'Birim fiyat' }).fill('750');
  await expect(dialog.getByTestId('pricing-items-total')).toHaveText(/1\.500/);
  await dialog.getByRole('button', { name: 'Fiyatları Kaydet' }).click();
  await expect
    .poll(() => backend.callsTo(`/sales/offers/${OFFER.id}/set-prices/`, 'POST').length)
    .toBe(1);
  const [save] = backend.callsTo(`/sales/offers/${OFFER.id}/set-prices/`, 'POST');
  expect(save!.body).toMatchObject({
    pricing_mode: 'flat',
    items: expect.arrayContaining([expect.objectContaining({ id: 1, unit_price: 750 })]),
  });

  // Genel: the customer edit opens the React customer form.
  await dialog.getByRole('tab', { name: 'Genel' }).click();
  await dialog.getByRole('button', { name: 'Düzenle' }).first().click();
  const customerForm = page.getByRole('dialog', { name: 'Müşteri Düzenle' });
  await expect(customerForm.getByLabel(/Müşteri Kodu/)).toHaveValue(customer.code);
  await customerForm.getByRole('button', { name: 'İptal' }).click();

  // Kalemler: a catalog node opens lazily and stages under the offer.
  await dialog.getByRole('tab', { name: 'Kalemler' }).click();
  await dialog.getByRole('button', { name: 'Ekipman' }).click();
  await dialog.getByRole('button', { name: 'Konveyör genişlet' }).click();
  await dialog.getByRole('button', { name: 'Bant teklife ekle' }).click();
  await expect(dialog.getByTestId('staged-count')).toHaveText('+1');
  await page.screenshot({ path: 'test-results/offers-kalemler.png' });
  await dialog.getByRole('button', { name: 'Değişiklikleri Kaydet' }).click();
  await expect
    .poll(() => backend.callsTo(`/sales/offers/${OFFER.id}/add-items/`, 'POST').length)
    .toBe(1);
  expect(backend.callsTo(`/sales/offers/${OFFER.id}/add-items/`, 'POST')[0]!.body).toEqual({
    items: [{ _ref: 'item-1', quantity: 1, template_node: 78 }],
  });

  // Closing drops the offer from the URL.
  await dialog.getByRole('button', { name: 'Kapat' }).last().click();
  await expect(page).not.toHaveURL(/offer_no=/);
  consoleErrors.expectNone();
});

import { expect, mockBackend, seedSession, test } from './fixtures';

// Finans İşlemleri (/finance/purchase-orders/, React since this port). Contracts:
//   GET  /procurement/purchase-orders/?status=awaiting_payment     orders tab
//   GET  /procurement/purchase-orders/<id>/                         ?order=<id> details
//   POST /procurement/purchase-orders/<id>/mark_schedule_paid/      Ödeme İşaretle
//   GET  /finance/reports/inflow-tracker/                           Beklenen Tahsilatlar

const page1 = (results: unknown[]) => ({ count: results.length, next: null, previous: null, results });

const ORDER = {
  id: 44,
  supplier_name: 'e2e Çelik A.Ş.',
  purchase_request_number: 'SAT-44',
  status: 'awaiting_payment',
  status_label: 'Ödeme Bekliyor',
  total_amount: '12000.00',
  total_tax_amount: '2400.00',
  tax_rate: '20.00',
  tax_outstanding: '2400.00',
  currency: 'EUR',
  priority: 'normal',
  created_at: '2026-10-20T08:00:00Z',
  payment_schedules: [
    {
      id: 441,
      sequence: 1,
      label: 'Peşin',
      percentage: '30.00',
      amount: '3600.00',
      currency: 'EUR',
      due_date: '2026-10-25',
      is_paid: false,
      effective_tax_due: '720.00',
    },
    {
      id: 442,
      sequence: 2,
      label: 'Teslimde',
      percentage: '70.00',
      amount: '8400.00',
      currency: 'EUR',
      due_date: '2099-12-01',
      is_paid: false,
      effective_tax_due: '1680.00',
    },
  ],
  lines: [
    {
      id: 1,
      item_code: 'e2e-SAC',
      item_name: 'e2e Sac levha',
      quantity: '150',
      unit_price: '80',
      total_price: '12000',
      delivery_days: 10,
      allocations: [{ job_no: '254-01' }],
    },
  ],
};

test('orders: list, ?order= details and marking an instalment paid', async ({ page, consoleErrors }) => {
  const session = await seedSession(page, { admin: true });
  const backend = await mockBackend(
    page,
    {
      'GET /procurement/purchase-orders/': { json: page1([ORDER]) },
      'GET /procurement/purchase-orders/44/': { json: ORDER },
      'POST /procurement/purchase-orders/44/mark_schedule_paid/': { json: ORDER },
    },
    { session },
  );

  await page.goto('/finance/purchase-orders/');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Finans İşlemleri' })).toBeVisible();
  const row = main.getByRole('row', { name: /e2e Çelik A\.Ş\./ });
  await expect(row).toContainText('Gecikmiş');
  expect(backend.callsTo('/procurement/purchase-orders/')[0]?.query).toContain('status=awaiting_payment');

  await row.getByRole('button', { name: 'Detayları Görüntüle' }).click();
  await expect(page).toHaveURL(/\?order=44/);
  const dialog = page.getByRole('dialog', { name: /Sipariş Detayları/ });
  await expect(dialog.getByText('e2e Sac levha')).toBeVisible();
  await dialog.getByRole('button', { name: 'Ödeme İşaretle: Teslimde' }).click();

  const form = page.getByRole('dialog', { name: 'Ödeme İşaretle' });
  await expect(form.getByLabel('Ödeme tutarı')).toHaveValue('€10.080,00');
  await form.getByRole('button', { name: 'Ödeme İşaretle' }).click();
  await expect(form).toBeHidden();
  const mark = backend.callsTo('/procurement/purchase-orders/44/mark_schedule_paid/', 'POST')[0];
  expect(mark?.body).toEqual({ schedule_id: 442, paid_with_tax: true });

  consoleErrors.expectNone();
});

test('receipts: grouped by due month', async ({ page, consoleErrors }) => {
  const session = await seedSession(page, { admin: true });
  await mockBackend(
    page,
    {
      'GET /finance/reports/inflow-tracker/': {
        json: [
          {
            source: 'sales_offer',
            offer_id: 5,
            offer_no: 'OF-E2E-5',
            sequence: 1,
            title: 'e2e Tank',
            customer_name: 'e2e Rafineri',
            label: 'Avans',
            amount: '1000.00',
            currency: 'EUR',
            amount_eur: '1000.00',
            due_date: '2026-11-15',
            is_received: false,
            editable: false,
          },
          {
            source: 'expected_receipt',
            receipt_id: 7,
            installment_id: 70,
            sequence: 1,
            title: 'e2e Teminat',
            customer_name: 'e2e Petrokimya',
            label: 'İade',
            amount: '250.00',
            currency: 'EUR',
            amount_eur: '250.00',
            due_date: null,
            is_received: false,
            editable: true,
          },
        ],
      },
    },
    { session },
  );

  await page.goto('/finance/purchase-orders/?tab=receipts');
  const main = page.getByRole('main');
  await expect(main.getByText('Kasım 2026')).toBeVisible();
  await expect(main.getByText('Vade tarihi yok')).toBeVisible();
  await expect(main.getByRole('link', { name: 'OF-E2E-5' })).toHaveAttribute(
    'href',
    '/sales/offers?offer_no=OF-E2E-5',
  );

  consoleErrors.expectNone();
});

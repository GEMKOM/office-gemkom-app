import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { TransfersPage } from './TransfersPage';

vi.mock('@/auth/authService', () => ({
  authedFetch: vi.fn(),
  // A warehouse user: may write and cancel transfers.
  isAdmin: () => false,
  isSuperuser: () => false,
  hasPerm: (code: string) => code === 'access_warehouse',
}));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const SLIP = {
  id: 4,
  number: 'DTR-2026-0004',
  from_warehouse_code: 'HAMMADDE',
  from_warehouse_name: 'Hammadde Deposu',
  from_job_no: '',
  to_warehouse_code: 'IS_EMRI',
  to_warehouse_name: 'İş Emri Deposu',
  to_job_no: '254-01',
  note: '',
  went_negative: false,
  status: 'posted',
  status_label: 'İşlendi',
  created_by_name: 'Depo',
  created_at: '2026-11-09T08:00:00Z',
  cancelled_by_name: null,
  cancelled_at: null,
  lines: [
    {
      id: 9,
      item: 7,
      item_code: '0018 0012 0040 000 001',
      item_name: 'CİVATA M12x40',
      item_unit: 'adet',
      quantity: '25.000',
      note: '',
    },
  ],
};

const CARD = {
  id: 7,
  code: '0018 0012 0040 000 001',
  name: 'CİVATA M12x40',
  unit: 'adet',
  is_active: true,
};

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

type Call = { url: URL; method: string; body: unknown };
function calls(): Call[] {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: new URL(String(url), 'https://api.test'),
    method: init?.method ?? 'GET',
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
  }));
}

function renderPage(route = '/warehouse/transfers') {
  return renderWithProviders(
    <ModalsProvider>
      <TransfersPage />
    </ModalsProvider>,
    { route },
  );
}

let cancelled = false;

beforeEach(() => {
  cancelled = false;
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const u = new URL(String(url), 'https://api.test');
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
    const current = cancelled
      ? { ...SLIP, status: 'cancelled', status_label: 'İptal Edildi' }
      : SLIP;
    if (method === 'GET' && u.pathname === '/warehouse/transfers/') {
      return json({ count: 1, results: [current] });
    }
    if (method === 'POST' && u.pathname === '/warehouse/transfers/') {
      if (!body.allow_negative) {
        return json(
          {
            detail: 'Kaynakta yeterli stok yok.',
            shortages: [
              {
                item: 7,
                item_code: CARD.code,
                item_name: CARD.name,
                available: '20.000',
                quantity: '25.000',
              },
            ],
          },
          409,
        );
      }
      return json({ ...SLIP, went_negative: true }, 201);
    }
    if (method === 'POST' && u.pathname === '/warehouse/transfers/4/cancel/') {
      cancelled = true;
      return json({ ...SLIP, status: 'cancelled' });
    }
    if (u.pathname === '/projects/job-orders/dropdown/') {
      return json([{ job_no: '254-01', title: 'Pres Hattı' }]);
    }
    if (u.pathname === '/procurement/items/') {
      return json({ count: 1, results: u.searchParams.get('is_active') === 'true' ? [CARD] : [] });
    }
    if (u.pathname === '/warehouse/stock-balances/') {
      return json([
        {
          id: 1,
          item: 7,
          warehouse_code: 'HAMMADDE',
          warehouse_name: 'Hammadde',
          job_no: '',
          quantity: '20.000',
          updated_at: '',
        },
      ]);
    }
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
  vi.spyOn(notify, 'warning');
});

afterEach(() => vi.restoreAllMocks());

it('moves Hammadde stock to a job, confirming the shortage', async () => {
  renderPage();
  expect(await screen.findByText('DTR-2026-0004')).toBeInTheDocument();
  expect(screen.getByText('İş Emri Deposu · 254-01')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Yeni Transfer' }));
  const dialog = await screen.findByRole('dialog', { name: 'Yeni Transfer' });

  // The İş Emri side needs a job (or Atanmamış) first.
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet ve İşle' }));
  expect(notify.warning).toHaveBeenCalledWith('Hedef için iş numarası seçin');

  fireEvent.click(within(dialog).getByLabelText('Hedef iş no'));
  fireEvent.click(await screen.findByRole('option', { name: '254-01 - Pres Hattı', hidden: true }));

  const product = within(dialog).getByLabelText('Ürün 1');
  product.focus();
  fireEvent.change(product, { target: { value: 'civata' } });
  fireEvent.click(
    await screen.findByRole('option', { name: /0018 0012 0040 000 001/, hidden: true }),
  );
  fireEvent.change(within(dialog).getByLabelText('Miktar 1'), { target: { value: '25' } });
  expect(await within(dialog).findByText('Mevcut: 20,00 adet')).toBeInTheDocument();

  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet ve İşle' }));
  expect(await screen.findByText('Kaynakta yeterli stok yok')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Yine de Kaydet' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('DTR-2026-0004 işlendi'));

  const posts = calls().filter(
    (c) => c.method === 'POST' && c.url.pathname === '/warehouse/transfers/',
  );
  expect(posts).toHaveLength(2);
  expect(posts[0]!.body).toEqual({
    from_warehouse_code: 'HAMMADDE',
    from_job_no: '',
    to_warehouse_code: 'IS_EMRI',
    to_job_no: '254-01',
    note: '',
    lines: [{ item: 7, quantity: '25' }],
  });
  expect(posts[1]!.body).toMatchObject({ allow_negative: true });
});

it('opens a transfer from the link and cancels it after the confirm', async () => {
  renderPage('/warehouse/transfers?transfer=4');
  expect(await screen.findByText('CİVATA M12x40')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Geri Al' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Evet, Geri Al' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('DTR-2026-0004 geri alındı'));
  expect(calls().some((c) => c.url.pathname === '/warehouse/transfers/4/cancel/')).toBe(true);
  await waitFor(() => expect(screen.getByText('İptal Edildi')).toBeInTheDocument());
});

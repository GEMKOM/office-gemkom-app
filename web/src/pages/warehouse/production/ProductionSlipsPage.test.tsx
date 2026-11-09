import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { ProductionSlipsPage } from './ProductionSlipsPage';

vi.mock('@/auth/authService', () => ({
  authedFetch: vi.fn(),
  // A warehouse user: may write and cancel slips.
  isAdmin: () => false,
  isSuperuser: () => false,
  hasPerm: (code: string) => code === 'access_warehouse',
}));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const SLIP = {
  id: 3,
  number: 'IMC-2026-0003',
  kind: 'issue',
  kind_label: 'İmalata Çıkış',
  warehouse_code: 'IS_EMRI',
  warehouse_name: 'İş Emri Deposu',
  job_no: '254-01',
  recipient: 'Kaynak 1',
  note: '',
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
      quantity: '6.000',
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

function renderPage(route = '/warehouse/production-slips') {
  return renderWithProviders(
    <ModalsProvider>
      <ProductionSlipsPage />
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
    const current = cancelled
      ? { ...SLIP, status: 'cancelled', status_label: 'İptal Edildi' }
      : SLIP;
    if (method === 'GET' && u.pathname === '/warehouse/production-slips/') {
      return json({ count: 1, results: [current] });
    }
    if (method === 'POST' && u.pathname === '/warehouse/production-slips/') return json(SLIP, 201);
    if (method === 'POST' && u.pathname === '/warehouse/production-slips/3/cancel/') {
      cancelled = true;
      return json({ ...SLIP, status: 'cancelled' });
    }
    if (u.pathname === '/projects/job-orders/dropdown/') {
      return json([{ job_no: '254-01', title: 'Pres Hattı' }]);
    }
    if (u.pathname === '/procurement/items/') {
      return json({ count: 1, results: u.searchParams.get('is_active') === 'true' ? [CARD] : [] });
    }
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
  vi.spyOn(notify, 'warning');
});

afterEach(() => vi.restoreAllMocks());

it('writes an issue slip for a job from the İş Emri area', async () => {
  renderPage();
  expect(await screen.findByText('IMC-2026-0003')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'İmalata Çıkış' }));
  const dialog = await screen.findByRole('dialog', { name: 'İmalata Çıkış' });

  // Nothing is sent without a job.
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet ve İşle' }));
  expect(notify.warning).toHaveBeenCalledWith('İş numarası seçin');

  fireEvent.click(within(dialog).getByLabelText(/İş No/));
  fireEvent.click(await screen.findByRole('option', { name: '254-01 - Pres Hattı', hidden: true }));

  const product = within(dialog).getByLabelText('Ürün 1');
  product.focus();
  fireEvent.change(product, { target: { value: 'civata' } });
  fireEvent.click(
    await screen.findByRole('option', { name: /0018 0012 0040 000 001/, hidden: true }),
  );
  fireEvent.change(within(dialog).getByLabelText('Miktar 1'), {
    target: { value: '6' },
  });
  fireEvent.change(within(dialog).getByLabelText('Alan kişi / ekip'), {
    target: { value: 'Kaynak 1' },
  });

  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet ve İşle' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('IMC-2026-0003 işlendi'));
  const create = calls().find(
    (c) => c.method === 'POST' && c.url.pathname === '/warehouse/production-slips/',
  )!;
  expect(create.body).toEqual({
    kind: 'issue',
    warehouse_code: 'IS_EMRI',
    job_no: '254-01',
    recipient: 'Kaynak 1',
    note: '',
    lines: [{ item: 7, quantity: '6' }],
  });
});

it('opens a slip from the link and cancels it after the confirm', async () => {
  renderPage('/warehouse/production-slips?fis=3');
  expect(await screen.findByText('CİVATA M12x40')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Geri Al' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Evet, Geri Al' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('IMC-2026-0003 geri alındı'));
  expect(calls().some((c) => c.url.pathname === '/warehouse/production-slips/3/cancel/')).toBe(
    true,
  );
  await waitFor(() => expect(screen.getByText('İptal Edildi')).toBeInTheDocument());
});

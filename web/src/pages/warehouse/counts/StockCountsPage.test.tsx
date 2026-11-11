import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { StockCountsPage } from './StockCountsPage';

vi.mock('@/auth/authService', () => ({
  authedFetch: vi.fn(),
  // A warehouse user: may create, count and post.
  isAdmin: () => false,
  isSuperuser: () => false,
  hasPerm: (code: string) => code === 'access_warehouse',
}));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const DRAFT = {
  id: 5,
  number: 'SAY-2026-0005',
  warehouse: 1,
  warehouse_code: 'HAMMADDE',
  warehouse_name: 'Hammadde Deposu',
  status: 'draft',
  status_label: 'Taslak',
  counted_on: '2026-11-09',
  note: '',
  created_by_name: 'Depo',
  created_at: '2026-11-09T08:00:00Z',
  posted_by_name: null,
  posted_at: null,
  line_count: 1,
  counted_count: 0,
  difference_count: 0,
};

const LINE = {
  id: 31,
  item: 7,
  item_code: '0018 0012 0040 000 002',
  item_name: 'CİVATA M12x40 DIN 933 8.8',
  item_unit: 'adet',
  job_no: '',
  counted_quantity: null,
  system_quantity: '2.000',
  difference: null,
  note: '',
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

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/warehouse/counts') {
  return renderWithProviders(
    <ModalsProvider>
      <StockCountsPage />
      <LocationProbe />
    </ModalsProvider>,
    { route },
  );
}

let posted = false;

beforeEach(() => {
  posted = false;
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url), 'https://api.test').pathname;
    const current = posted
      ? { ...DRAFT, status: 'posted', status_label: 'İşlendi', posted_at: '2026-11-09T09:00:00Z' }
      : DRAFT;
    if (method === 'GET' && path === '/warehouse/stock-counts/') {
      return json({ count: 1, results: [current] });
    }
    if (method === 'POST' && path === '/warehouse/stock-counts/') return json(DRAFT, 201);
    if (method === 'GET' && path === '/warehouse/stock-counts/5/') return json(current);
    if (method === 'GET' && path === '/warehouse/stock-counts/5/lines/') {
      return json({ count: 1, results: [LINE] });
    }
    if (method === 'POST' && path === '/warehouse/stock-counts/5/lines/') {
      return json({ ...DRAFT, counted_count: 1 });
    }
    if (method === 'POST' && path === '/warehouse/stock-counts/5/post/') {
      posted = true;
      return json({ ...DRAFT, status: 'posted', status_label: 'İşlendi' });
    }
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => vi.restoreAllMocks());

it('lists the counts and opens a new one after creating it', async () => {
  renderPage();
  expect(await screen.findByText('SAY-2026-0005')).toBeInTheDocument();
  expect(screen.getByText('Taslak')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Yeni Sayım' }));
  const dialog = await screen.findByRole('dialog', { name: 'Yeni Sayım' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Oluştur' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('SAY-2026-0005 oluşturuldu'));
  const create = calls().find((c) => c.method === 'POST')!;
  expect(create.body).toMatchObject({ warehouse_code: 'HAMMADDE' });
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('sayim=5'));
});

it('saves a counted quantity and posts the count after the confirm', async () => {
  renderPage('/warehouse/counts?sayim=5');
  expect(await screen.findByText('CİVATA M12x40 DIN 933 8.8')).toBeInTheDocument();

  const input = screen.getByLabelText('Sayılan 0018 0012 0040 000 002');
  fireEvent.change(input, { target: { value: '5' } });
  fireEvent.blur(input);
  await waitFor(() =>
    expect(calls().some((c) => c.method === 'POST' && c.url.pathname.endsWith('/lines/'))).toBe(
      true,
    ),
  );
  const save = calls().find((c) => c.method === 'POST' && c.url.pathname.endsWith('/lines/'))!;
  expect(save.body).toEqual([{ item: 7, job_no: '', counted_quantity: '5' }]);

  fireEvent.click(screen.getByRole('button', { name: 'Sayımı İşle' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Evet, İşle' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('SAY-2026-0005 işlendi'));
  expect(calls().some((c) => c.method === 'POST' && c.url.pathname.endsWith('/post/'))).toBe(true);
  // A posted count is read-only.
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Sayımı İşle' })).toBeNull());
});

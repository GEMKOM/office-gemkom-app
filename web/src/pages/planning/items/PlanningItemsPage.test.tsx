import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { PlanningItemsPage } from './PlanningItemsPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const ITEMS = [
  {
    id: 1,
    item_code: 'PLT-001',
    item_name: 'Sac Levha',
    planning_request_number: 'PLR-12',
    job_no: '2501',
    quantity: '2.00',
    item_unit: 'adet',
    latest_unit_price_eur: '10.50',
    latest_unit_price_source: 'po_line',
    is_delivered: false,
    delivered_quantity: '1',
    is_consumed: false,
    cnc_cuts_count: 0,
    purchase_request_number: 'PR-7',
  },
  {
    id: 2,
    item_code: 'PLT-002',
    item_name: 'Profil',
    quantity: 3,
    latest_unit_price_eur: 4,
    latest_unit_price_source: null,
    is_delivered: true,
    is_consumed: true,
    consumed_by_username: 'ahmet',
    cnc_cuts_count: 2,
  },
];

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(body === undefined ? null : JSON.stringify(body), { status }),
  );
}

type Call = { url: URL; method: string };
function calls(): Call[] {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: new URL(String(url)),
    method: init?.method ?? 'GET',
  }));
}
const listCalls = () =>
  calls().filter((c) => c.method === 'GET' && c.url.pathname === '/planning/items/');
const postCalls = () => calls().filter((c) => c.method === 'POST');
const lastParams = () => Object.fromEntries(listCalls().at(-1)!.url.searchParams);

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/planning/items') {
  return renderWithProviders(
    <ModalsProvider>
      <PlanningItemsPage />
      <LocationProbe />
    </ModalsProvider>,
    { route },
  );
}

const rowOf = (code: string) => screen.getByText(code).closest('tr')!;

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url)).pathname;
    if (method === 'GET' && path === '/planning/items/') {
      return json({ count: 57, next: null, previous: null, results: ITEMS });
    }
    if (method === 'POST') return json({ id: 1 });
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
  vi.spyOn(notify, 'info');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('renders the rows, the page total and asks with the legacy defaults', async () => {
  renderPage();
  expect(screen.getByRole('heading', { name: 'Planlama Kalemleri' })).toBeInTheDocument();
  expect(await screen.findByText('PLT-001')).toBeInTheDocument();
  expect(screen.getByText('PLT-002')).toBeInTheDocument();
  expect(
    within(document.getElementById('planning-items-total')!).getByText('57'),
  ).toBeInTheDocument();

  const first = rowOf('PLT-001');
  expect(within(first).getByText('PLR-12')).toBeInTheDocument();
  expect(within(first).getByText('PO')).toBeInTheDocument();
  expect(within(first).getByText('Kısmi 1 / 2 adet')).toBeInTheDocument();
  expect(within(first).getByRole('img', { name: 'Hayır' })).toBeInTheDocument();
  const second = rowOf('PLT-002');
  expect(within(second).getByText('YOK')).toBeInTheDocument();
  expect(within(second).getByRole('img', { name: 'Teslim edildi' })).toBeInTheDocument();
  expect(within(second).getByText('Kullanıldı').closest('[title]')).toHaveAttribute(
    'title',
    'Fiziksel stok tükendi (ahmet) — yeni CNC kesimleri için seçilemez',
  );

  // Footer: 2 × 10,50 + 3 × 4 = 33 €.
  expect(screen.getByText('TOPLAM:')).toBeInTheDocument();
  expect(screen.getByText(/33,00/)).toBeInTheDocument();

  expect(lastParams()).toEqual({
    include_price: 'true',
    ordering: '-id',
    page: '1',
    page_size: '20',
  });
});

it('reads the filters from the URL and sends the legacy params', async () => {
  renderPage('/planning/items?is_delivered=partial&search=sac&ordering=job_no&page=2');
  await screen.findByText('PLT-001');
  expect(lastParams()).toEqual({
    search: 'sac',
    is_delivered: 'false',
    partially_delivered: 'true',
    include_price: 'true',
    ordering: 'job_no',
    page: '2',
    page_size: '20',
  });

  // A pill applies at once and goes back to page 1.
  fireEvent.click(screen.getByRole('button', { name: 'Kalem Tipi' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Masraf' }));

  await waitFor(() => {
    const search = new URLSearchParams(screen.getByTestId('location').textContent ?? '');
    expect(search.get('item_type')).toBe('expenditure');
    expect(search.has('page')).toBe(false);
  });
  await waitFor(() => expect(lastParams().item_type).toBe('expenditure'));
  expect(lastParams()).toMatchObject({ page: '1', ordering: 'job_no', search: 'sac' });
});

it('a column header click writes the ordering the Sıralama filter uses', async () => {
  renderPage();
  await screen.findByText('PLT-001');
  fireEvent.click(
    within(screen.getByRole('columnheader', { name: /Ürün Kodu/ })).getByRole('button'),
  );
  await waitFor(() => expect(lastParams().ordering).toBe('item_code'));
  expect(screen.getByTestId('location').textContent).toContain('ordering=item_code');
});

it('Temizle empties the filters, resets the ordering and says so', async () => {
  renderPage('/planning/items?is_consumed=true&ordering=item_name');
  await screen.findByText('PLT-001');
  fireEvent.click(screen.getByText('Temizle'));
  await waitFor(() =>
    expect(lastParams()).toEqual({
      include_price: 'true',
      ordering: '-id',
      page: '1',
      page_size: '20',
    }),
  );
  expect(notify.info).toHaveBeenCalledWith('Filtreler temizlendi');
});

it('marks an item consumed after the confirm and reloads the list', async () => {
  renderPage();
  await screen.findByText('PLT-001');
  const before = listCalls().length;

  fireEvent.click(within(rowOf('PLT-001')).getByRole('button', { name: 'Kullanıldı' }));
  expect(
    await screen.findByText('PLT-001 kalemi "kullanıldı" olarak işaretlenecek.'),
  ).toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: 'Kullanıldı İşareti' })).toBeInTheDocument();
  expect(postCalls()).toHaveLength(0);

  fireEvent.click(screen.getByRole('button', { name: 'Evet' }));
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Kalem kullanıldı olarak işaretlendi'),
  );
  expect(postCalls().map((c) => c.url.pathname)).toEqual(['/planning/items/1/mark_consumed/']);
  await waitFor(() => expect(listCalls().length).toBeGreaterThan(before));
});

it('unmarks a consumed item after the confirm', async () => {
  renderPage();
  await screen.findByText('PLT-002');
  fireEvent.click(within(rowOf('PLT-002')).getByRole('button', { name: 'Kullanıldı' }));
  expect(
    await screen.findByText('PLT-002 kaleminin "kullanıldı" işareti kaldırılacak.'),
  ).toBeInTheDocument();
  expect(
    screen.getByText('Kalem yeniden CNC kesimleri için seçilebilir hale gelir.'),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Evet' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Kullanıldı işareti kaldırıldı'));
  expect(postCalls().map((c) => c.url.pathname)).toEqual(['/planning/items/2/unmark_consumed/']);
});

it('cancelling the confirm sends nothing; a failed request shows the backend message', async () => {
  renderPage();
  await screen.findByText('PLT-001');
  fireEvent.click(within(rowOf('PLT-001')).getByRole('button', { name: 'Kullanıldı' }));
  fireEvent.click(await screen.findByRole('button', { name: 'İptal' }));
  await waitFor(() =>
    expect(screen.queryByText('PLT-001 kalemi "kullanıldı" olarak işaretlenecek.')).toBeNull(),
  );
  expect(postCalls()).toHaveLength(0);

  fetchMock.mockImplementation((_url, init) =>
    init?.method === 'POST'
      ? json({ detail: 'Kalem zaten kullanıldı.' }, 400)
      : json({ count: 2, next: null, previous: null, results: ITEMS }),
  );
  vi.spyOn(console, 'error').mockImplementation(() => {});
  fireEvent.click(within(rowOf('PLT-001')).getByRole('button', { name: 'Kullanıldı' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Evet' }));
  await waitFor(() => expect(notify.error).toHaveBeenCalled());
  expect(vi.mocked(notify.error).mock.calls[0]![0]).toMatchObject({
    message: 'Kalem zaten kullanıldı.',
  });
});

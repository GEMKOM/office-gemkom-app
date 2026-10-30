import { authedFetch } from '@legacy/authService.js';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { CustomersPage } from './CustomersPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const CUSTOMERS = [
  { id: 1, code: 'C-001', name: 'Arçelik A.Ş.', is_active: true, default_currency: 'TRY', created_at: '2026-01-05T10:00:00Z' },
  { id: 2, code: 'C-002', name: 'Tüpraş', is_active: false, default_currency: 'EUR', created_at: '2026-02-05T10:00:00Z' },
];

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(body === undefined ? null : JSON.stringify(body), { status }));
}

type Call = { url: URL; method: string; body: unknown };
function calls(): Call[] {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: new URL(String(url)),
    method: init?.method ?? 'GET',
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
  }));
}
const listCalls = () => calls().filter((c) => c.method === 'GET' && c.url.pathname === '/projects/customers/');

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/sales/customers/') {
  return renderWithProviders(
    <ModalsProvider>
      <CustomersPage />
      <LocationProbe />
    </ModalsProvider>,
    { route },
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url)).pathname;
    if (method === 'GET' && path === '/projects/customers/') {
      return json({ count: 42, next: null, previous: null, results: CUSTOMERS });
    }
    if (method === 'POST') return json({ id: 99, code: 'N-1', name: 'Yeni Firma' }, 201);
    if (method === 'DELETE') return json(undefined, 204);
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('renders the header, stats and the customer rows', async () => {
  renderPage();
  expect(screen.getByText('Müşteri Yönetimi')).toBeInTheDocument();
  expect(await screen.findByText('C-001')).toBeInTheDocument();
  expect(screen.getByText('Arçelik A.Ş.')).toBeInTheDocument();
  expect(screen.getByText('Tüpraş')).toBeInTheDocument();

  // Total from count; active / inactive / currencies from the loaded page (legacy).
  expect(within(document.getElementById('total-customers-count')!).getByText('42')).toBeInTheDocument();
  expect(within(document.getElementById('active-customers-count')!).getByText('1')).toBeInTheDocument();
  expect(within(document.getElementById('inactive-customers-count')!).getByText('1')).toBeInTheDocument();
  expect(within(document.getElementById('currencies-count')!).getByText('2')).toBeInTheDocument();

  const [first] = listCalls();
  expect(Object.fromEntries(first!.url.searchParams)).toEqual({ ordering: 'code', page: '1', page_size: '20' });
});

it('applying filters writes the URL and refetches with the legacy params', async () => {
  renderPage('/sales/customers/?page=3');
  await screen.findByText('C-001');

  fireEvent.change(screen.getByLabelText('Arama'), { target: { value: 'arç' } });
  // A pill applies at once and takes the typed search with it.
  fireEvent.click(screen.getByLabelText('Pasifleri Göster'));

  await waitFor(() => {
    const search = new URLSearchParams(screen.getByTestId('location').textContent ?? '');
    expect(search.get('search')).toBe('arç');
    expect(search.get('show_inactive')).toBe('true');
    // Back to page 1, which is the default and so leaves the URL.
    expect(search.has('page')).toBe(false);
  });
  await waitFor(() => expect(listCalls()).toHaveLength(2));
  expect(Object.fromEntries(listCalls()[1]!.url.searchParams)).toEqual({
    search: 'arç',
    show_inactive: 'true',
    ordering: 'code',
    page: '1',
    page_size: '20',
  });
});

it('show_inactive in the URL reaches the request next to is_active, as legacy sent them', async () => {
  // The backend lists active customers only unless show_inactive=true.
  renderPage('/sales/customers/?is_active=false&show_inactive=true');
  await screen.findByText('C-001');
  expect(screen.getByRole('checkbox', { name: 'Pasifleri Göster' })).toHaveAttribute('aria-checked', 'true');

  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    is_active: 'false',
    show_inactive: 'true',
    ordering: 'code',
    page: '1',
    page_size: '20',
  });

  // Turning the pill off drops the param again.
  fireEvent.click(screen.getByRole('checkbox', { name: 'Pasifleri Göster' }));
  await waitFor(() => expect(listCalls()).toHaveLength(2));
  expect(listCalls()[1]!.url.searchParams.has('show_inactive')).toBe(false);
  expect(listCalls()[1]!.url.searchParams.get('is_active')).toBe('false');
});

it('the create form validates and then posts every field', async () => {
  renderPage();
  await screen.findByText('C-001');
  fireEvent.click(screen.getByRole('button', { name: 'Yeni Müşteri' }));
  const dialog = await screen.findByRole('dialog', { name: 'Yeni Müşteri Oluştur' });

  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  expect(await within(dialog).findAllByText('Bu alan gereklidir')).toHaveLength(2);

  fireEvent.change(within(dialog).getByLabelText(/Müşteri Kodu/), { target: { value: 'N-1' } });
  fireEvent.change(within(dialog).getByLabelText(/Firma Adı/), { target: { value: 'Yeni Firma' } });
  fireEvent.change(within(dialog).getByLabelText('E-posta'), { target: { value: 'yanlis' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  expect(await within(dialog).findByText('Geçerli bir e-posta adresi girin')).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'POST')).toBe(false);

  fireEvent.change(within(dialog).getByLabelText('E-posta'), { target: { value: 'info@firma.com' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));

  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Müşteri başarıyla oluşturuldu'));
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe('/projects/customers/');
  expect(post.body).toEqual({
    code: 'N-1',
    name: 'Yeni Firma',
    short_name: '',
    default_currency: 'TRY',
    contact_person: '',
    phone: '',
    email: 'info@firma.com',
    address: '',
    tax_id: '',
    tax_office: '',
    is_active: true,
    notes: '',
  });
  // The list is invalidated and loaded again.
  await waitFor(() => expect(listCalls().length).toBeGreaterThan(1));
});

it('shows the backend field errors when create fails', async () => {
  fetchMock.mockImplementation((_url, init) =>
    init?.method === 'POST'
      ? json({ code: ['Bu kod zaten kullanılıyor.'] }, 400)
      : json({ count: 0, next: null, previous: null, results: [] }),
  );
  renderPage();
  fireEvent.click(screen.getByRole('button', { name: 'Yeni Müşteri' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText(/Müşteri Kodu/), { target: { value: 'C-001' } });
  fireEvent.change(within(dialog).getByLabelText(/Firma Adı/), { target: { value: 'X' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Bu kod zaten kullanılıyor.'));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

it('deletes a customer only after the confirm', async () => {
  renderPage();
  await screen.findByText('C-001');

  fireEvent.click(screen.getAllByRole('button', { name: 'Sil' })[0]!);
  expect(await screen.findByText('Bu müşteriyi silmek istediğinize emin misiniz?')).toBeInTheDocument();
  expect(screen.getByText('Bu işlem geri alınamaz')).toBeInTheDocument();
  expect(screen.getByText('Müşteri kalıcı olarak silinecektir.')).toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: 'Müşteri Silme Onayı' })).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'DELETE')).toBe(false);

  fireEvent.click(screen.getByRole('button', { name: 'Evet, Sil' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Müşteri silindi'));
  const del = calls().find((c) => c.method === 'DELETE')!;
  expect(del.url.pathname).toBe('/projects/customers/1/');
  await waitFor(() => expect(listCalls().length).toBeGreaterThan(1));
});

it('cancelling the confirm deletes nothing', async () => {
  renderPage();
  await screen.findByText('C-001');
  fireEvent.click(screen.getAllByRole('button', { name: 'Sil' })[0]!);
  fireEvent.click(await screen.findByRole('button', { name: 'İptal' }));
  await waitFor(() => expect(screen.queryByText('Bu müşteriyi silmek istediğinize emin misiniz?')).toBeNull());
  expect(calls().some((c) => c.method === 'DELETE')).toBe(false);
});

it('opens the edit modal from ?customer_id and patches the customer', async () => {
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url)).pathname;
    if (path === '/projects/customers/2/' && method === 'GET') return json({ ...CUSTOMERS[1], phone: '555' });
    if (path === '/projects/customers/2/' && method === 'PATCH') return json({ ...CUSTOMERS[1], name: 'Tüpraş A.Ş.' });
    return json({ count: 2, next: null, previous: null, results: CUSTOMERS });
  });
  renderPage('/sales/customers/?customer_id=2');
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('Müşteri Düzenle')).toBeInTheDocument();
  const name = within(dialog).getByLabelText(/Firma Adı/);
  expect(name).toHaveValue('Tüpraş');
  expect(within(dialog).getByLabelText('Aktif')).not.toBeChecked();

  fireEvent.change(name, { target: { value: 'Tüpraş A.Ş.' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Müşteri başarıyla güncellendi'));
  const patch = calls().find((c) => c.method === 'PATCH')!;
  expect(patch.body).toMatchObject({ code: 'C-002', name: 'Tüpraş A.Ş.', phone: '555', default_currency: 'EUR', is_active: false });
  await waitFor(() => expect(screen.getByTestId('location').textContent).not.toContain('customer_id'));
});

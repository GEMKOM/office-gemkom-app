import { authedFetch } from '@legacy/authService.js';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { toCsv } from './exportSubcontractors';
import { SubcontractorsPage } from './SubcontractorsPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const SUBCONTRACTORS = [
  {
    id: 1,
    name: 'Kaya Kaynak Ltd.',
    short_name: 'Kaya',
    is_active: true,
    default_currency: 'TRY',
    phone: '555',
  },
  { id: 2, name: 'Demir Montaj', short_name: 'Demir', is_active: false, default_currency: 'EUR' },
];

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(body === undefined ? null : JSON.stringify(body), { status }),
  );
}

type Call = { url: URL; method: string; body: unknown };
function calls(): Call[] {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: new URL(String(url)),
    method: init?.method ?? 'GET',
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
  }));
}
const LIST_PATH = '/subcontracting/subcontractors/';
const listCalls = () => calls().filter((c) => c.method === 'GET' && c.url.pathname === LIST_PATH);

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/manufacturing/subcontracting/subcontractors') {
  return renderWithProviders(
    <ModalsProvider>
      <SubcontractorsPage />
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
    if (method === 'GET' && path === LIST_PATH) {
      return json({ count: 37, next: null, previous: null, results: SUBCONTRACTORS });
    }
    if (method === 'POST') return json({ id: 99, name: 'Yeni Taşeron' }, 201);
    if (method === 'PATCH') return json({ ...SUBCONTRACTORS[1], name: 'Demir Montaj A.Ş.' });
    if (method === 'DELETE') return json(undefined, 204);
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('renders the header, stats and rows with the legacy first request', async () => {
  renderPage();
  expect(screen.getByText('Taşeron Yönetimi')).toBeInTheDocument();
  expect(await screen.findByText('Kaya Kaynak Ltd.')).toBeInTheDocument();
  expect(screen.getByText('Demir Montaj')).toBeInTheDocument();
  expect(screen.getByText('Pasif')).toBeInTheDocument();

  // Total from the server count, active from the loaded page.
  expect(
    within(document.getElementById('total-subcontractors-count')!).getByText('37'),
  ).toBeInTheDocument();
  expect(
    within(document.getElementById('active-subcontractors-count')!).getByText('1'),
  ).toBeInTheDocument();

  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    page: '1',
    page_size: '20',
    ordering: 'name',
  });
});

it('filters and sorting go to the URL and the request', async () => {
  renderPage('/manufacturing/subcontracting/subcontractors?page=2&is_active=false');
  await screen.findByText('Kaya Kaynak Ltd.');
  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    page: '2',
    page_size: '20',
    is_active: 'false',
    ordering: 'name',
  });

  fireEvent.change(screen.getByLabelText('Firma Adı'), { target: { value: 'kaya' } });
  fireEvent.keyDown(screen.getByLabelText('Firma Adı'), { key: 'Enter' });
  await waitFor(() => {
    const search = new URLSearchParams(screen.getByTestId('location').textContent ?? '');
    expect(search.get('search')).toBe('kaya');
    expect(search.has('page')).toBe(false);
  });
  await waitFor(() =>
    expect(Object.fromEntries(listCalls().at(-1)!.url.searchParams)).toEqual({
      page: '1',
      page_size: '20',
      search: 'kaya',
      is_active: 'false',
      ordering: 'name',
    }),
  );

  // Clicking the sorted Firma Adı header flips it to descending.
  fireEvent.click(screen.getByRole('button', { name: /Firma Adı/ }));
  await waitFor(() => expect(listCalls().at(-1)!.url.searchParams.get('ordering')).toBe('-name'));
});

it('the create form requires the name and posts the legacy payload', async () => {
  renderPage();
  await screen.findByText('Kaya Kaynak Ltd.');
  fireEvent.click(screen.getByRole('button', { name: 'Yeni Taşeron' }));
  const dialog = await screen.findByRole('dialog', { name: 'Yeni Taşeron Oluştur' });

  fireEvent.click(within(dialog).getByRole('button', { name: 'Taşeron Oluştur' }));
  expect(await within(dialog).findByText('Bu alan gereklidir')).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'POST')).toBe(false);

  fireEvent.change(within(dialog).getByLabelText(/Firma Adı/), {
    target: { value: 'Yeni Taşeron' },
  });
  fireEvent.change(within(dialog).getByLabelText('Banka Bilgisi'), {
    target: { value: 'TR00 0000' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Taşeron Oluştur' }));

  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Taşeron başarıyla oluşturuldu'));
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe(LIST_PATH);
  expect(post.body).toEqual({
    name: 'Yeni Taşeron',
    short_name: '',
    contact_person: '',
    phone: '',
    email: '',
    default_currency: 'TRY',
    address: '',
    tax_id: '',
    tax_office: '',
    bank_info: 'TR00 0000',
    agreement_details: '',
    is_active: true,
  });
  await waitFor(() => expect(listCalls().length).toBeGreaterThan(1));
});

it('shows the backend field errors joined when create fails', async () => {
  fetchMock.mockImplementation((_url, init) =>
    init?.method === 'POST'
      ? json({ name: ['Bu isim zaten kullanılıyor.'], email: ['Geçersiz.'] }, 400)
      : json({ count: 0, next: null, previous: null, results: [] }),
  );
  renderPage();
  fireEvent.click(screen.getByRole('button', { name: 'Yeni Taşeron' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText(/Firma Adı/), { target: { value: 'X' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Taşeron Oluştur' }));
  await waitFor(() =>
    expect(notify.error).toHaveBeenCalledWith('Bu isim zaten kullanılıyor., Geçersiz.'),
  );
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

it('edits the row and patches it', async () => {
  renderPage();
  await screen.findByText('Demir Montaj');
  fireEvent.click(screen.getAllByRole('button', { name: 'Düzenle' })[1]!);
  const dialog = await screen.findByRole('dialog', { name: /Taşeron Düzenle/ });
  const name = within(dialog).getByLabelText(/Firma Adı/);
  expect(name).toHaveValue('Demir Montaj');
  expect(within(dialog).getByLabelText('Aktif')).not.toBeChecked();

  fireEvent.change(name, { target: { value: 'Demir Montaj A.Ş.' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Değişiklikleri Kaydet' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Taşeron başarıyla güncellendi'));
  const patch = calls().find((c) => c.method === 'PATCH')!;
  expect(patch.url.pathname).toBe('/subcontracting/subcontractors/2/');
  expect(patch.body).toMatchObject({
    name: 'Demir Montaj A.Ş.',
    default_currency: 'EUR',
    is_active: false,
  });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

it('deletes only after the confirm', async () => {
  renderPage();
  await screen.findByText('Kaya Kaynak Ltd.');
  fireEvent.click(screen.getAllByRole('button', { name: 'Sil' })[0]!);
  expect(
    await screen.findByText(
      '"Kaya Kaynak Ltd." adlı taşeronu silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.',
    ),
  ).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'DELETE')).toBe(false);

  fireEvent.click(screen.getByText('Kapat'));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(calls().some((c) => c.method === 'DELETE')).toBe(false);

  fireEvent.click(screen.getAllByRole('button', { name: 'Sil' })[0]!);
  const confirmDialog = await screen.findByRole('dialog', { name: 'Taşeron Silme Onayı' });
  fireEvent.click(within(confirmDialog).getByRole('button', { name: 'Sil' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Taşeron başarıyla silindi'));
  expect(calls().find((c) => c.method === 'DELETE')!.url.pathname).toBe(
    '/subcontracting/subcontractors/1/',
  );
  await waitFor(() => expect(listCalls().length).toBeGreaterThan(1));
});

it('writes the legacy CSV columns', () => {
  const csv = toCsv([{ id: 1, name: 'A "B"', is_active: false, default_currency: 'USD' }]);
  const [header, row] = csv.split('\n');
  expect(header).toBe(
    '"Firma Adı","Kısa Ad","İletişim Kişisi","Telefon","E-posta","Adres","Vergi No","Vergi Dairesi","Banka Bilgisi","Para Birimi","Durum"',
  );
  expect(row).toBe('"A ""B""","","","","","","","","","USD","Pasif"');
});

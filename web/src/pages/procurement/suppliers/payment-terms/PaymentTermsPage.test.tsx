import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { PaymentTermsPage } from './PaymentTermsPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const BASIS = [
  { value: 'after_invoice', label: 'Fatura Sonrası' },
  { value: 'on_delivery', label: 'Teslimatta' },
];

const TERMS = [
  {
    id: 7,
    name: 'Peşin',
    code: 'PESIN',
    is_custom: false,
    active: true,
    default_lines: [{ label: 'Peşin', percentage: '100.00', basis: 'on_delivery', offset_days: 0 }],
    created_at: '2026-01-05T10:00:00Z',
  },
  {
    id: 8,
    name: 'Yarı yarıya',
    code: 'YY',
    is_custom: true,
    active: false,
    default_lines: [],
    created_at: '2026-02-05T10:00:00Z',
  },
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
const listCalls = () =>
  calls().filter((c) => c.method === 'GET' && c.url.pathname === '/procurement/payment-terms/');

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/procurement/suppliers/payment-terms') {
  return renderWithProviders(
    <ModalsProvider>
      <PaymentTermsPage />
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
    if (method === 'GET' && path === '/procurement/payment-terms/') {
      return json({ count: 2, next: null, previous: null, results: TERMS });
    }
    if (method === 'GET' && path === '/procurement/basis-choices/') return json(BASIS);
    if (method === 'POST') return json({ id: 99, name: 'Yeni' }, 201);
    if (method === 'DELETE') return json(undefined, 204);
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
  vi.spyOn(notify, 'info');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('renders the header, stats and rows with basis labels', async () => {
  renderPage();
  expect(screen.getByRole('heading', { name: 'Ödeme Koşulları' })).toBeInTheDocument();
  expect(await screen.findByText('Yarı yarıya')).toBeInTheDocument();
  expect(screen.getByText('Standart')).toBeInTheDocument();
  expect(await screen.findByText('(Teslimatta)')).toBeInTheDocument();

  expect(
    within(document.getElementById('all-payment-terms-count')!).getByText('2'),
  ).toBeInTheDocument();
  expect(
    within(document.getElementById('active-payment-terms-count')!).getByText('1'),
  ).toBeInTheDocument();
  expect(
    within(document.getElementById('inactive-payment-terms-count')!).getByText('1'),
  ).toBeInTheDocument();
  expect(
    within(document.getElementById('custom-payment-terms-count')!).getByText('1'),
  ).toBeInTheDocument();

  // Only custom payment terms can be deleted.
  expect(screen.getAllByRole('button', { name: 'Sil' })).toHaveLength(1);

  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    ordering: '-id',
    page: '1',
    page_size: '20',
  });
});

it('filters from the URL and the filter bar reach the request with the legacy params', async () => {
  renderPage(
    '/procurement/suppliers/payment-terms?is_custom=true&created_at__gte=2026-01-01&page=2',
  );
  await screen.findByText('Yarı yarıya');
  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    is_custom: 'true',
    created_at__gte: '2026-01-01',
    ordering: '-id',
    page: '2',
    page_size: '20',
  });

  fireEvent.change(screen.getByLabelText('Ödeme Koşulu Adı'), { target: { value: 'peş' } });
  fireEvent.keyDown(screen.getByLabelText('Ödeme Koşulu Adı'), { key: 'Enter' });

  await waitFor(() => {
    const search = new URLSearchParams(screen.getByTestId('location').textContent ?? '');
    expect(search.get('name')).toBe('peş');
    expect(search.has('page')).toBe(false);
  });
  await waitFor(() => expect(listCalls()).toHaveLength(2));
  expect(Object.fromEntries(listCalls()[1]!.url.searchParams)).toEqual({
    name: 'peş',
    is_custom: 'true',
    created_at__gte: '2026-01-01',
    ordering: '-id',
    page: '1',
    page_size: '20',
  });
});

it('sorting a new column starts ascending and goes back to page 1', async () => {
  renderPage('/procurement/suppliers/payment-terms?page=2');
  await screen.findByText('Yarı yarıya');
  fireEvent.click(screen.getByText('Ödeme Koşulu Adı', { selector: 'th *' }));
  await waitFor(() => expect(listCalls()).toHaveLength(2));
  expect(Object.fromEntries(listCalls()[1]!.url.searchParams)).toMatchObject({
    ordering: 'name',
    page: '1',
  });
});

it(
  'create validates the lines, checks the 100% total and posts the legacy body',
  { timeout: 30_000 },
  async () => {
    renderPage();
    await screen.findByText('Yarı yarıya');
    fireEvent.click(screen.getByRole('button', { name: 'Yeni Ödeme Koşulu' }));
    const dialog = await screen.findByRole('dialog', { name: 'Yeni Ödeme Koşulu' });

    // Required fields.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    expect(await within(dialog).findAllByText('Bu alan gereklidir')).toHaveLength(2);

    fireEvent.change(within(dialog).getByLabelText(/Ödeme Koşulu Adı/), {
      target: { value: ' Vadeli ' },
    });
    fireEvent.change(within(dialog).getByLabelText(/^Kod/), { target: { value: 'V30' } });

    // No lines yet.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('En az bir ödeme satırı eklemelisiniz'),
    );

    // Two lines; the basis defaults to the first choice.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ödeme Satırı Ekle' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ödeme Satırı Ekle' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ödeme Satırı Ekle' }));
    expect(within(dialog).getAllByTestId('payment-line')).toHaveLength(3);
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Ödeme satırını kaldır' })[2]!);
    expect(within(dialog).getAllByTestId('payment-line')).toHaveLength(2);

    const [first, second] = within(dialog).getAllByTestId('payment-line');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    expect(await within(first!).findAllByText('Bu alan gereklidir')).toHaveLength(2);

    fireEvent.change(within(first!).getByLabelText(/Etiket/), { target: { value: 'Avans' } });
    fireEvent.change(within(first!).getByLabelText(/Yüzde/), { target: { value: '30' } });
    fireEvent.change(within(second!).getByLabelText(/Etiket/), { target: { value: 'Kalan' } });
    fireEvent.change(within(second!).getByLabelText(/Yüzde/), { target: { value: '60' } });
    fireEvent.change(within(second!).getByLabelText(/Gecikme/), { target: { value: '30' } });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith(
        'Ödeme satırlarının yüzde toplamı tam olarak 100 olmalıdır. Mevcut toplam: 90.00%',
      ),
    );
    expect(calls().some((c) => c.method === 'POST')).toBe(false);

    fireEvent.change(within(second!).getByLabelText(/Yüzde/), { target: { value: '70' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));

    await waitFor(() =>
      expect(notify.success).toHaveBeenCalledWith('Ödeme koşulu başarıyla oluşturuldu'),
    );
    const post = calls().find((c) => c.method === 'POST')!;
    expect(post.url.pathname).toBe('/procurement/payment-terms/');
    expect(post.body).toEqual({
      name: 'Vadeli',
      code: 'V30',
      is_custom: true,
      active: true,
      default_lines: [
        { label: 'Avans', percentage: 30, basis: 'after_invoice', offset_days: 0 },
        { label: 'Kalan', percentage: 70, basis: 'after_invoice', offset_days: 30 },
      ],
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(listCalls().length).toBeGreaterThan(1));
  },
);

it('shows the backend error when create fails and keeps the modal open', async () => {
  fetchMock.mockImplementation((url, init) => {
    const path = new URL(String(url)).pathname;
    if (init?.method === 'POST') return json({ error: 'Bu kod zaten var' }, 400);
    if (path === '/procurement/basis-choices/') return json(BASIS);
    return json({ count: 0, next: null, previous: null, results: [] });
  });
  renderPage();
  expect(await screen.findByText('Henüz ödeme koşulu bulunmuyor')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Yeni Ödeme Koşulu' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText(/Ödeme Koşulu Adı/), { target: { value: 'X' } });
  fireEvent.change(within(dialog).getByLabelText(/^Kod/), { target: { value: 'X' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Ödeme Satırı Ekle' }));
  fireEvent.change(within(dialog).getByLabelText(/Etiket/), { target: { value: 'Tümü' } });
  fireEvent.change(within(dialog).getByLabelText(/Yüzde/), { target: { value: '100' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() =>
    expect(notify.error).toHaveBeenCalledWith(
      'Ödeme koşulu kaydedilirken hata oluştu: Bu kod zaten var',
    ),
  );
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

it('deletes a custom payment term only after the confirm', async () => {
  renderPage();
  await screen.findByText('Yarı yarıya');

  fireEvent.click(screen.getByRole('button', { name: 'Sil' }));
  expect(
    await screen.findByText(
      '"Yarı yarıya" ödeme koşulunu silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.',
    ),
  ).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'DELETE')).toBe(false);

  fireEvent.click(screen.getByRole('button', { name: 'Evet' }));
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Ödeme koşulu başarıyla silindi'),
  );
  const del = calls().find((c) => c.method === 'DELETE')!;
  expect(del.url.pathname).toBe('/procurement/payment-terms/8/');
  await waitFor(() => expect(listCalls().length).toBeGreaterThan(1));
});

it('cancelling the confirm deletes nothing; export shows the legacy notice', async () => {
  renderPage();
  await screen.findByText('Yarı yarıya');
  fireEvent.click(screen.getByRole('button', { name: 'Sil' }));
  fireEvent.click(await screen.findByRole('button', { name: 'İptal' }));
  await waitFor(() =>
    expect(screen.queryByText(/ödeme koşulunu silmek istediğinizden/)).toBeNull(),
  );
  expect(calls().some((c) => c.method === 'DELETE')).toBe(false);

  fireEvent.click(screen.getByRole('button', { name: 'Dışa Aktar' }));
  expect(notify.info).toHaveBeenCalledWith('Dışa aktarma özelliği yakında eklenecek');
});

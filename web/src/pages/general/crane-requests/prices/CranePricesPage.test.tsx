import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { CranePricesPage } from './CranePricesPage';

// Mantine modals with many fields are slow in jsdom when the whole suite runs in parallel.
vi.setConfig({ testTimeout: 20_000 });

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const TYPES = [
  {
    id: 1,
    name: '25 ton',
    category_label: 'Mobil Vinç',
    is_active: true,
    current_rate: {
      price_up_to_3h: '1000',
      price_up_to_8h: '2000',
      currency: 'TRY',
      effective_from: '2026-01-01',
    },
  },
  {
    id: 2,
    name: 'Eski Platform',
    category_label: 'Makaslı Platform',
    is_active: false,
    current_rate: null,
  },
];

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

type Call = { url: URL; method: string; body: unknown };
function calls(): Call[] {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: new URL(String(url)),
    method: init?.method ?? 'GET',
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
  }));
}
const typeCalls = () => calls().filter((c) => c.url.pathname === '/cranes/crane-types/');

function setup(canManage: boolean) {
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url)).pathname;
    if (path === '/cranes/requests/my_permissions/')
      return json({ can_complete: false, can_manage_prices: canManage });
    if (path === '/cranes/crane-types/') return json({ count: 2, results: TYPES });
    if (path === '/cranes/rates/' && method === 'GET')
      return json([
        {
          id: 5,
          effective_from: '2025-01-01',
          price_up_to_3h: '900',
          currency: 'TRY',
          note: 'Eski',
        },
      ]);
    if (path === '/cranes/rates/' && method === 'POST') return json({ id: 6 }, 201);
    return json({ detail: 'not mocked' }, 404);
  });
}

function renderPage() {
  return renderWithProviders(
    <ModalsProvider>
      <CranePricesPage />
    </ModalsProvider>,
    { route: '/general/crane-requests/prices' },
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('without can_manage_prices: active types only and no new-price action', async () => {
  setup(false);
  renderPage();
  expect(await screen.findByText('1.000 TRY')).toBeInTheDocument();
  expect(screen.getByText('Pasif')).toBeInTheDocument();
  expect(Object.fromEntries(typeCalls()[0]!.url.searchParams)).toEqual({});
  expect(typeCalls()).toHaveLength(1);
  expect(screen.queryByRole('button', { name: 'Yeni Fiyat Gir' })).toBeNull();

  fireEvent.click(screen.getAllByRole('button', { name: 'Fiyat Geçmişi' })[0]!);
  const dialog = await screen.findByRole('dialog', { name: /Fiyat Geçmişi/ });
  expect(await within(dialog).findByText('900')).toBeInTheDocument();
  expect(within(dialog).getByText('TRY · Eski')).toBeInTheDocument();
  expect(
    calls()
      .find((c) => c.url.pathname === '/cranes/rates/')!
      .url.searchParams.get('crane_type'),
  ).toBe('1');
});

it('with can_manage_prices: lists inactive types and posts a new rate', async () => {
  setup(true);
  renderPage();
  await screen.findByText('1.000 TRY');
  expect(typeCalls()[0]!.url.searchParams.get('include_inactive')).toBe('true');

  fireEvent.click(screen.getAllByRole('button', { name: 'Yeni Fiyat Gir' })[1]!);
  const dialog = await screen.findByRole('dialog', { name: /Yeni Fiyat — Eski Platform/ });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  expect(await within(dialog).findByText('En az bir fiyat girmelisiniz')).toBeInTheDocument();

  fireEvent.change(within(dialog).getByLabelText('Günlük Fiyat'), { target: { value: '750' } });
  fireEvent.change(within(dialog).getByLabelText(/Geçerlilik Başlangıcı/), {
    target: { value: '2026-12-01' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Yeni fiyat kaydedildi'));
  expect(calls().find((c) => c.method === 'POST')!.body).toEqual({
    crane_type: 2,
    effective_from: '2026-12-01',
    currency: 'TRY',
    price_up_to_3h: null,
    price_up_to_8h: null,
    price_per_day: '750',
    transport_fee: null,
    rigger_fee: null,
    note: '',
  });
  await waitFor(() => expect(typeCalls().length).toBeGreaterThan(1));
});

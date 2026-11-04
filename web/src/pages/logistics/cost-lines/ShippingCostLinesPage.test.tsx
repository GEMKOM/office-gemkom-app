import { authedFetch } from '@/auth/authService';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { ShippingCostLinesPage } from './ShippingCostLinesPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const PENDING = [
  {
    job_no: '254-01',
    title: 'Kazan',
    customer_name: 'Arçelik',
    status: 'active',
    target_completion_date: '2026-12-01',
  },
];
const HAS = [
  { job_no: '250-07', title: 'Tank', status: 'completed', shipping_total_eur: '1250.5' },
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
const callsTo = (path: string) => calls().filter((c) => c.url.pathname === path);

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const path = new URL(String(url)).pathname;
    if (path === '/projects/job-orders/shipping_pending/') {
      return json({ count: 1, next: null, previous: null, results: PENDING });
    }
    if (path === '/projects/job-orders/has_shipping/') {
      return json({ count: 1, next: null, previous: null, results: HAS });
    }
    if (path === '/projects/shipping-cost-lines/') {
      return json([
        {
          id: 1,
          description: 'Nakliye',
          amount_eur: '100.00',
          date: '2026-10-05T00:00:00Z',
          notes: '',
        },
      ]);
    }
    if (path === '/projects/shipping-cost-lines/submit/' && init?.method === 'POST')
      return json([]);
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('loads the pending list at once and the has-entries list only on Yenile, as legacy', async () => {
  renderWithProviders(<ShippingCostLinesPage />, { route: '/logistics/cost-lines/?status=active' });
  expect(await screen.findByText('254-01')).toBeInTheDocument();
  expect(
    Object.fromEntries(callsTo('/projects/job-orders/shipping_pending/')[0]!.url.searchParams),
  ).toEqual({
    status: 'active',
    ordering: 'job_no',
    page: '1',
    page_size: '20',
  });
  expect(screen.getByText('Aktif')).toBeInTheDocument();
  expect(callsTo('/projects/job-orders/has_shipping/')).toHaveLength(0);
  expect(
    screen.getByText('Listeyi yüklemek için Filtrele veya Yenile butonuna tıklayın.'),
  ).toBeInTheDocument();

  // The band's Yenile reloads both tables.
  fireEvent.click(screen.getAllByRole('button', { name: 'Yenile' })[0]!);
  expect(await screen.findByText('250-07')).toBeInTheDocument();
  expect(screen.getByText('€1.250,50')).toBeInTheDocument();
  expect(
    Object.fromEntries(callsTo('/projects/job-orders/has_shipping/')[0]!.url.searchParams),
  ).toEqual({
    ordering: 'job_no',
    page: '1',
    page_size: '20',
  });
});

it('edits the lines of a job order and submits the ones with a description', async () => {
  renderWithProviders(<ShippingCostLinesPage />, { route: '/logistics/cost-lines/' });
  await screen.findByText('254-01');
  fireEvent.click(screen.getByRole('button', { name: 'Satırları Aç' }));

  const dialog = await screen.findByRole('dialog', { name: /Sevkiyat Maliyet Satırları — 254-01/ });
  expect(await within(dialog).findByDisplayValue('Nakliye')).toBeInTheDocument();
  expect(callsTo('/projects/shipping-cost-lines/')[0]!.url.searchParams.get('job_order')).toBe(
    '254-01',
  );
  expect(within(dialog).getByLabelText('Tarih 1')).toHaveValue('2026-10-05');
  expect(within(dialog).getByTestId('lines-summary')).toHaveTextContent('1 satır, Toplam: €100.00');

  fireEvent.click(within(dialog).getByRole('button', { name: 'Satır Ekle' }));
  fireEvent.change(within(dialog).getByLabelText('Açıklama 2'), { target: { value: ' Gümrük ' } });
  fireEvent.change(within(dialog).getByLabelText('Tutar 2'), { target: { value: '50.25' } });
  // A third row without a description is dropped on save.
  fireEvent.click(within(dialog).getByRole('button', { name: 'Satır Ekle' }));
  expect(within(dialog).getByTestId('lines-summary')).toHaveTextContent('3 satır, Toplam: €150.25');

  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Satırlar kaydedildi.'));
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe('/projects/shipping-cost-lines/submit/');
  expect(post.body).toEqual({
    job_order: '254-01',
    lines: [
      { description: 'Nakliye', amount_eur: '100.00', date: '2026-10-05' },
      { description: 'Gümrük', amount_eur: '50.25' },
    ],
  });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  // Both lists load again after a save.
  await waitFor(() =>
    expect(callsTo('/projects/job-orders/has_shipping/').length).toBeGreaterThan(0),
  );
  expect(callsTo('/projects/job-orders/shipping_pending/').length).toBeGreaterThan(1);
});

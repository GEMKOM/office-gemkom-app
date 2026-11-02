import { authedFetch } from '@legacy/authService.js';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { CostLinesPage } from './CostLinesPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const PENDING = [
  { job_no: '254-01', title: 'Konveyör', customer_name: 'Arçelik', status: 'active' },
];
const HAS_QC = [
  {
    job_no: '250-07',
    title: 'Pota',
    customer_name: 'Tüpraş',
    status: 'completed',
    qc_total_eur: '1234.5',
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
const callsTo = (path: string) => calls().filter((c) => c.url.pathname === path);

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/quality-control/cost-lines/') {
  return renderWithProviders(
    <ModalsProvider>
      <CostLinesPage />
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
    if (path === '/projects/job-orders/qc_pending/')
      return json({ count: 7, next: null, previous: null, results: PENDING });
    if (path === '/projects/job-orders/has_qc/')
      return json({ count: 3, next: null, previous: null, results: HAS_QC });
    if (path === '/projects/qc-cost-lines/' && method === 'GET') {
      return json([
        {
          id: 1,
          description: 'Penetrant testi',
          amount_eur: '100.00',
          date: '2026-10-01',
          notes: '',
        },
      ]);
    }
    if (path === '/projects/qc-cost-lines/submit/') return json([]);
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('loads both lists with the legacy params and shows the counts', async () => {
  renderPage();
  expect(await screen.findByText('254-01')).toBeInTheDocument();
  expect(screen.getByText('250-07')).toBeInTheDocument();
  expect(screen.getByText('€1.234,50')).toBeInTheDocument();
  expect(within(document.getElementById('qc-pending-count')!).getByText('7')).toBeInTheDocument();
  expect(
    within(document.getElementById('qc-has-entries-count')!).getByText('3'),
  ).toBeInTheDocument();

  const params = { ordering: 'job_no', page: '1', page_size: '20' };
  expect(
    Object.fromEntries(callsTo('/projects/job-orders/qc_pending/')[0]!.url.searchParams),
  ).toEqual(params);
  expect(Object.fromEntries(callsTo('/projects/job-orders/has_qc/')[0]!.url.searchParams)).toEqual(
    params,
  );
});

it('each table filters on its own URL keys', async () => {
  renderPage();
  await screen.findByText('254-01');

  const [pendingSearch, hasSearch] = screen.getAllByLabelText('Arama');
  fireEvent.change(hasSearch!, { target: { value: 'pota' } });
  fireEvent.keyDown(hasSearch!, { key: 'Enter' });

  await waitFor(() => {
    const search = new URLSearchParams(screen.getByTestId('location').textContent ?? '');
    expect(search.get('has_search')).toBe('pota');
    expect(search.has('search')).toBe(false);
  });
  await waitFor(() => expect(callsTo('/projects/job-orders/has_qc/')).toHaveLength(2));
  expect(callsTo('/projects/job-orders/has_qc/')[1]!.url.searchParams.get('search')).toBe('pota');
  // The pending list did not reload.
  expect(callsTo('/projects/job-orders/qc_pending/')).toHaveLength(1);
  expect(pendingSearch).toHaveValue('');
});

it('the lines modal loads, edits and replaces the lines', async () => {
  renderPage();
  await screen.findByText('254-01');
  fireEvent.click(screen.getAllByRole('button', { name: 'Satırları Aç' })[0]!);

  const dialog = await screen.findByRole('dialog', { name: 'KK Maliyet Satırları — 254-01' });
  expect(await within(dialog).findByDisplayValue('Penetrant testi')).toBeInTheDocument();
  expect(callsTo('/projects/qc-cost-lines/')[0]!.url.searchParams.get('job_order')).toBe('254-01');
  expect(within(dialog).getByText('1 satır, Toplam: €100.00')).toBeInTheDocument();

  // A new line; one without a description is dropped on save.
  fireEvent.click(within(dialog).getByRole('button', { name: 'Satır Ekle' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Satır Ekle' }));
  const descriptions = within(dialog).getAllByLabelText('Açıklama');
  expect(descriptions).toHaveLength(3);
  fireEvent.change(descriptions[1]!, { target: { value: 'UT muayene' } });
  fireEvent.change(within(dialog).getAllByLabelText('Tutar (EUR)')[1]!, {
    target: { value: '50' },
  });
  await waitFor(() =>
    expect(within(dialog).getByText('3 satır, Toplam: €150.00')).toBeInTheDocument(),
  );

  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Satırlar kaydedildi.'));
  expect(callsTo('/projects/qc-cost-lines/submit/')[0]!.body).toEqual({
    job_order: '254-01',
    lines: [
      { description: 'Penetrant testi', amount_eur: '100.00', date: '2026-10-01' },
      { description: 'UT muayene', amount_eur: '50' },
    ],
  });
  // Both lists reload.
  await waitFor(() =>
    expect(callsTo('/projects/job-orders/qc_pending/').length).toBeGreaterThan(1),
  );
  await waitFor(() => expect(callsTo('/projects/job-orders/has_qc/').length).toBeGreaterThan(1));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

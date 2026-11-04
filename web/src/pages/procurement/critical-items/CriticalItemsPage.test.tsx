import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { CriticalItemsPage } from './CriticalItemsPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const ITEMS = [
  {
    id: 11,
    item_code: 'MTR-01',
    item_name: 'Motor',
    planning_request_number: 'PLR-3',
    job_no: '2502',
    quantity_to_purchase: '1.00',
    item_unit: 'adet',
    is_delivered: false,
    is_critical: true,
    critical_marked_by_username: 'ayse',
    critical_marked_at: '2026-10-05T09:00:00Z',
  },
];

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const listCalls = () =>
  fetchMock.mock.calls
    .map(([url]) => new URL(String(url)))
    .filter((url) => url.pathname === '/planning/items/');
const lastParams = () => Object.fromEntries(listCalls().at(-1)!.searchParams);

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/procurement/critical-items') {
  return renderWithProviders(
    <ModalsProvider>
      <CriticalItemsPage />
      <LocationProbe />
    </ModalsProvider>,
    { route },
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(() =>
    json({ count: 1, next: null, previous: null, results: ITEMS }),
  );
  vi.spyOn(notify, 'error');
  vi.spyOn(notify, 'info');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('lists the undelivered critical items by default', async () => {
  renderPage();
  expect(screen.getByRole('heading', { name: 'Kritik Malzemeler' })).toBeInTheDocument();
  expect(await screen.findByText('MTR-01')).toBeInTheDocument();
  const row = screen.getByText('MTR-01').closest('tr')!;
  expect(within(row).getByText('Kritik')).toBeInTheDocument();
  expect(within(row).getByText('PLR-3')).toBeInTheDocument();
  expect(within(row).getByText('ayse')).toBeInTheDocument();
  expect(within(row).getByText('05.10.2026')).toBeInTheDocument();
  expect(within(row).getByRole('img', { name: 'Teslim edilmedi' })).toBeInTheDocument();
  const figure = document.getElementById('critical-items-total')!;
  expect(within(figure).getByText('Teslim Edilmemiş Kritik Kalemler')).toBeInTheDocument();
  expect(within(figure).getByText('1')).toBeInTheDocument();

  expect(lastParams()).toEqual({
    is_critical: 'true',
    is_delivered: 'false',
    include_price: 'false',
    ordering: '-id',
    page: '1',
    page_size: '20',
  });
});

it('the delivered toggle and the filters reach the request', async () => {
  renderPage('/procurement/critical-items?page=2');
  await screen.findByText('MTR-01');

  fireEvent.click(screen.getByRole('checkbox', { name: 'Teslim Edilenleri de Göster' }));
  await waitFor(() => {
    const search = new URLSearchParams(screen.getByTestId('location').textContent ?? '');
    expect(search.get('show_delivered')).toBe('true');
    expect(search.has('page')).toBe(false);
  });
  await waitFor(() => expect(lastParams().is_delivered).toBeUndefined());
  expect(lastParams()).toEqual({
    is_critical: 'true',
    include_price: 'false',
    ordering: '-id',
    page: '1',
    page_size: '20',
  });
  expect(
    within(document.getElementById('critical-items-total')!).getByText('Kritik Kalemler'),
  ).toBeInTheDocument();

  // The first text filter (İş No) is the search box.
  const jobNo = screen.getByLabelText('İş No');
  fireEvent.change(jobNo, { target: { value: '2502' } });
  fireEvent.keyDown(jobNo, { key: 'Enter' });
  await waitFor(() => expect(lastParams().job_no).toBe('2502'));
});

it('shows the scope empty message and sorts on the server', async () => {
  fetchMock.mockImplementation(() => json({ count: 0, next: null, previous: null, results: [] }));
  renderPage('/procurement/critical-items?show_delivered=true');
  expect(await screen.findByText('Kritik işaretli kalem yok.')).toBeInTheDocument();

  fireEvent.click(within(screen.getByRole('columnheader', { name: /İş No/ })).getByRole('button'));
  await waitFor(() => expect(lastParams().ordering).toBe('job_no'));
});

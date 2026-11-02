import { authedFetch } from '@legacy/authService.js';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { PartsSearchPage } from './PartsSearchPage';
import { plateSourceText } from './plateSource';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const PARTS = [
  {
    id: 1,
    job_no: '225-01',
    image_no: 'R-10',
    position_no: 'P1',
    weight_kg: '1.5',
    quantity: 2,
    nesting_id: 'N-7',
    planning_request_item: 44,
    plate_item_name: '10 mm S235JR',
    plate_item_is_delivered: true,
    completion_date: '2026-10-01T08:00:00Z',
  },
  {
    id: 2,
    job_no: '225-01',
    image_no: 'R-11',
    position_no: 'P2',
    weight_kg: '0.25',
    quantity: null,
    nesting_id: 'N-8',
    has_remnant_plate: true,
    thickness_mm: '8',
    material: 'S355',
  },
];

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const searchCalls = () =>
  fetchMock.mock.calls
    .map(([url]) => new URL(String(url)))
    .filter((url) => url.pathname === '/cnc_cutting/parts/search/');

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/manufacturing/cnc-cutting/reports/parts-search/') {
  return renderWithProviders(
    <>
      <PartsSearchPage />
      <LocationProbe />
    </>,
    { route },
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(() =>
    json({ count: 2, next: null, previous: null, results: PARTS }),
  );
});

it('loads the first page, shows plate sources and the weight total', async () => {
  renderPage();
  expect(await screen.findByText('R-10')).toBeInTheDocument();
  expect(screen.getByText('Teslim')).toBeInTheDocument();
  expect(screen.getByText('Fire Plaka')).toBeInTheDocument();
  expect(screen.getByText('8 mm S355')).toBeInTheDocument();
  // 1.5 × 2 + 0.25 × 1 (missing quantity counts as one).
  expect(screen.getByTestId('parts-total-weight')).toHaveTextContent('3.250 kg');
  expect(Object.fromEntries(searchCalls()[0]!.searchParams)).toEqual({
    page: '1',
    page_size: '20',
  });
});

it('search fields go to the URL and the request', async () => {
  renderPage('/manufacturing/cnc-cutting/reports/parts-search/?image_no=R-1&page=3');
  await screen.findByText('R-10');
  expect(Object.fromEntries(searchCalls()[0]!.searchParams)).toEqual({
    image_no: 'R-1',
    page: '3',
    page_size: '20',
  });

  const search = screen.getByLabelText('İş No');
  fireEvent.change(search, { target: { value: '225' } });
  fireEvent.keyDown(search, { key: 'Enter' });

  await waitFor(() => {
    const params = new URLSearchParams(screen.getByTestId('location').textContent ?? '');
    expect(params.get('job_no')).toBe('225');
    expect(params.has('page')).toBe(false);
  });
  await waitFor(() => expect(searchCalls()).toHaveLength(2));
  expect(Object.fromEntries(searchCalls()[1]!.searchParams)).toEqual({
    job_no: '225',
    image_no: 'R-1',
    page: '1',
    page_size: '20',
  });
});

it('says why the table is empty', async () => {
  fetchMock.mockImplementation(() => json({ count: 0, next: null, previous: null, results: [] }));
  renderPage('/manufacturing/cnc-cutting/reports/parts-search/?job_no=999');
  expect(await screen.findByText('Arama kriterlerine uygun sonuç bulunamadı.')).toBeInTheDocument();
});

it('export text names the plate state', () => {
  expect(plateSourceText(PARTS[0]!)).toBe('10 mm S235JR (Teslim)');
  expect(plateSourceText(PARTS[1]!)).toBe('8 mm S355 (Fire Plaka)');
  expect(plateSourceText({ id: 3, planning_request_item: 1, plate_item_code: 'PL-1' })).toBe(
    'PL-1 (Malzeme Bekliyor)',
  );
});

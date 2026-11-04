import { authedFetch } from '@/auth/authService';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { ItemsReportPage } from './ItemsReportPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const ROWS = [
  {
    code: 'SAC-01',
    name: 'Sac Levha',
    unit: 'kg',
    buy_count: 4,
    total_quantity: '1250.5',
    total_spent_eur: '9876.5',
    min_unit_price_eur: '1.2',
    suppliers: ['Borusan', 'Tosyalı'],
    last_bought_at: '2026-03-04T10:00:00Z',
  },
];

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

const requests = () => fetchMock.mock.calls.map(([url]) => new URL(String(url)));

beforeEach(() => {
  fetchMock.mockReset();
  // The endpoint answers with a bare array.
  fetchMock.mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify(ROWS), { status: 200 })),
  );
});

it('loads the report ordered by total spend and renders the legacy formatting', async () => {
  renderWithProviders(<ItemsReportPage />, { route: '/procurement/reports/items/' });
  expect(await screen.findByText('SAC-01')).toBeInTheDocument();
  expect(screen.getByText('9.876,50 €')).toBeInTheDocument();
  expect(screen.getByText('1.250,50')).toBeInTheDocument();
  expect(screen.getByText('Borusan')).toBeInTheDocument();
  expect(screen.getByText('Tosyalı')).toBeInTheDocument();

  const [first] = requests();
  expect(first!.pathname).toBe('/procurement/reports/items');
  expect(Object.fromEntries(first!.searchParams)).toEqual({ ordering: '-total_spent_eur' });
});

it('sends the code and name filters as __icontains (legacy never sent them)', async () => {
  renderWithProviders(
    <>
      <ItemsReportPage />
      <LocationProbe />
    </>,
    { route: '/procurement/reports/items/?ordering=name' },
  );
  await screen.findByText('SAC-01');
  expect(requests()[0]!.searchParams.get('ordering')).toBe('name');

  fireEvent.change(screen.getByLabelText('Ürün Kodu'), { target: { value: 'sac' } });
  fireEvent.keyDown(screen.getByLabelText('Ürün Kodu'), { key: 'Enter' });

  await waitFor(() => expect(screen.getByTestId('location').textContent).toContain('code=sac'));
  await waitFor(() => expect(requests()).toHaveLength(2));
  expect(Object.fromEntries(requests()[1]!.searchParams)).toEqual({
    code__icontains: 'sac',
    ordering: 'name',
  });
});

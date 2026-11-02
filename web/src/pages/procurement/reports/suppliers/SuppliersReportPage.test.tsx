import { authedFetch } from '@legacy/authService.js';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { SuppliersReportPage } from './SuppliersReportPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const ROWS = [
  {
    id: 1,
    code: 'T-01',
    name: 'Borusan',
    has_dbs: true,
    dbs_limit: '50000',
    total_spent_eur: '1000',
    unpaid_amount_eur: '250',
  },
  {
    id: 2,
    code: 'T-02',
    name: 'Tosyalı',
    has_dbs: false,
    dbs_limit: null,
    total_spent_eur: '500',
    unpaid_amount_eur: '0',
  },
];

const requests = () => fetchMock.mock.calls.map(([url]) => new URL(String(url)));

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify({ results: ROWS }), { status: 200 })),
  );
});

it('renders DBS and unpaid columns the legacy way', async () => {
  renderWithProviders(<SuppliersReportPage />, { route: '/procurement/reports/suppliers/' });
  expect(await screen.findByText('Borusan')).toBeInTheDocument();
  expect(screen.getByText('DBS Var')).toBeInTheDocument();
  expect(screen.getByText('DBS Yok')).toBeInTheDocument();
  expect(screen.getByText('50.000,00')).toBeInTheDocument();
  expect(screen.getByText('250,00 €')).toBeInTheDocument();
  // Nothing left to pay reads Ödendi.
  expect(screen.getByText('Ödendi')).toBeInTheDocument();
});

it('maps every URL filter to the getSuppliersReport params', async () => {
  renderWithProviders(<SuppliersReportPage />, {
    route:
      '/procurement/reports/suppliers/?name=bor&code=T-&has_dbs=true&created_gte=2026-01-01&created_lte=2026-02-01&min_total_spent_eur=100&ordering=name',
  });
  await screen.findByText('Borusan');
  const [first] = requests();
  expect(first!.pathname).toBe('/procurement/reports/suppliers');
  expect(Object.fromEntries(first!.searchParams)).toEqual({
    name__icontains: 'bor',
    code__icontains: 'T-',
    has_dbs: 'true',
    created_gte: '2026-01-01',
    created_lte: '2026-02-01',
    min_total_spent_eur: '100',
    ordering: 'name',
  });
});

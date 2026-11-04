import { authedFetch } from '@/auth/authService';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { StaffReportPage } from './StaffReportPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const ROWS = [
  {
    username: 'ayse',
    full_name: 'Ayşe Yılmaz',
    pr_count: 12,
    po_count: 7,
    total_spent_eur: '1500',
    requested_qty_by_unit: { kg: '20', adet: '3' },
  },
  { username: 'mehmet', full_name: 'Mehmet Kaya', pr_count: 2, po_count: 1, total_spent_eur: '90' },
];
const USERS = [
  { id: 5, username: 'ayse', full_name: 'Ayşe Yılmaz' },
  { id: 6, username: 'mehmet', full_name: 'Mehmet Kaya' },
];

function json(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}
const reportRequests = () =>
  fetchMock.mock.calls
    .map(([url]) => new URL(String(url)))
    .filter((u) => u.pathname === '/procurement/reports/staff');

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) =>
    new URL(String(url)).pathname === '/users/dropdown/' ? json(USERS) : json(ROWS),
  );
});

it('loads the staff report with the default ordering and renders quantities per unit', async () => {
  renderWithProviders(<StaffReportPage />, { route: '/procurement/reports/staff/' });
  expect(await screen.findByText('Ayşe Yılmaz')).toBeInTheDocument();
  expect(screen.getByText('Mehmet Kaya')).toBeInTheDocument();
  expect(screen.getByText('20,00 kg')).toBeInTheDocument();
  expect(screen.getByText('3,00 adet')).toBeInTheDocument();
  expect(screen.getByText('1.500,00 €')).toBeInTheDocument();
  expect(Object.fromEntries(reportRequests()[0]!.searchParams)).toEqual({
    ordering: '-total_spent_eur',
  });
});

it('the Personel filter narrows the rows to that user', async () => {
  renderWithProviders(<StaffReportPage />, { route: '/procurement/reports/staff/?user=6' });
  expect(await screen.findByText('Mehmet Kaya')).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText('Ayşe Yılmaz')).toBeNull());
  // The report request itself carries no user param (the backend has none).
  expect(reportRequests()[0]!.searchParams.has('user')).toBe(false);
});

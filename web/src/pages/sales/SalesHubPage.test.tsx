import { authedFetch } from '@legacy/authService.js';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { SalesHubPage } from './SalesHubPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));
vi.mock('@legacy/apis/accessControl.js', () => ({ hasRouteAccess: () => true }));
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 42, username: 'satis' } }) }));

const fetchMock = vi.mocked(authedFetch);

// Counts per stage filter, as the backend would answer a one-row page.
const COUNTS: Record<string, number> = {
  'status=draft': 6,
  'status__in=consultation,pricing': 9,
  'status=pending_approval': 4,
  'status__in=approved,submitted_customer': 3,
  'status__in=won,converted': 57,
};

const offer = (id: number, createdAt: string, status: string, total: string) => ({
  id,
  offer_no: `OF-2026-${String(id).padStart(4, '0')}`,
  title: `Teklif ${id}`,
  status,
  customer_name: `Müşteri ${id}`,
  total_price: total,
  created_at: createdAt,
});

// The backend puts offers awaiting the user's approval first (id 1 is older).
const MINE = [
  offer(1, '2026-09-01T09:00:00Z', 'pending_approval', '1500.00'),
  ...[2, 3, 4, 5, 6, 7, 8].map((id) => offer(id, `2026-10-${10 + id}T09:00:00Z`, 'draft', id === 8 ? '0.00' : '1284500.50')),
];

function json(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

const offerCalls = () =>
  fetchMock.mock.calls
    .map(([url]) => new URL(String(url)))
    .filter((url) => url.pathname === '/sales/offers/');

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => {
    const { pathname, searchParams } = new URL(String(url));
    if (pathname === '/projects/customers/') return json({ count: 148, next: null, previous: null, results: [] });
    if (searchParams.has('created_by')) return json({ count: MINE.length, next: null, previous: null, results: MINE });
    const filter = [...searchParams].find(([key]) => key.startsWith('status'));
    return json({ count: COUNTS[filter ? `${filter[0]}=${filter[1]}` : ''] ?? 0, next: null, previous: null, results: [] });
  });
});

it('counts each stage with its own status filter and adds up the open ones', async () => {
  renderWithProviders(<SalesHubPage />, { route: '/sales/' });

  const pipeline = (await screen.findByRole('heading', { name: 'Teklif Hattı' })).closest('section')!;
  await waitFor(() => expect(pipeline).toHaveTextContent('Kazanılan Teklif57'));
  for (const [label, count] of [
    ['Taslak', '6'],
    ['Danışma / Fiyatlandırma', '9'],
    ['Onay Bekliyor', '4'],
    ['Onaylandı / Sunuldu', '3'],
  ]) {
    expect(within(pipeline).getByText(label!).parentElement).toHaveTextContent(`${label}${count}`);
  }

  // Open = draft + consultation/pricing + pending + approved/submitted; won, lost, cancelled stay out.
  expect(document.getElementById('open-offers')).toHaveTextContent('22');
  expect(document.getElementById('pending-offers')).toHaveTextContent('4');
  expect(document.getElementById('active-customers')).toHaveTextContent('148');

  const counted = offerCalls().filter((url) => url.searchParams.get('page_size') === '1');
  expect(counted.map((url) => url.search).sort()).toEqual(
    [
      '?status=draft&page_size=1',
      '?status__in=consultation%2Cpricing&page_size=1',
      '?status=pending_approval&page_size=1',
      '?status__in=approved%2Csubmitted_customer&page_size=1',
      '?status__in=won%2Cconverted&page_size=1',
    ].sort(),
  );
});

it("lists the user's own latest offers, newest first", async () => {
  renderWithProviders(<SalesHubPage />, { route: '/sales/' });

  const panel = (await screen.findByRole('heading', { name: 'Son Tekliflerim' })).closest('section')!;
  await within(panel).findByText('OF-2026-0008');

  const recent = offerCalls().find((url) => url.searchParams.has('created_by'))!;
  expect(Object.fromEntries(recent.searchParams)).toEqual({
    created_by: '42',
    ordering: '-created_at',
    page_size: '12',
  });

  // Six rows, by date, though the backend sent the older offer awaiting approval first.
  const numbers = within(panel)
    .getAllByRole('link')
    .map((link) => link.textContent)
    .filter((text) => text?.startsWith('OF-'))
    .map((text) => text!.slice(0, 12));
  expect(numbers).toEqual(['OF-2026-0008', 'OF-2026-0007', 'OF-2026-0006', 'OF-2026-0005', 'OF-2026-0004', 'OF-2026-0003']);

  // No currency in the list: a plain amount, and "-" before any price is set.
  const priced = within(panel).getByText('OF-2026-0007').closest('a')!;
  expect(priced).toHaveTextContent('1.284.500,50');
  expect(priced).not.toHaveTextContent('₺');
  expect(within(within(panel).getByText('OF-2026-0008').closest('a')!).getByText('-')).toBeInTheDocument();

  expect(within(panel).getByRole('link', { name: /Tümü/ })).toHaveAttribute('href', '/sales/offers/?created_by=42');
});

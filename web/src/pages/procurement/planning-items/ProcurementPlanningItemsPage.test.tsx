import { authedFetch } from '@/auth/authService';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { isDeliveryLate } from './columns';
import { ProcurementPlanningItemsPage } from './ProcurementPlanningItemsPage';

vi.mock('@/auth/authService', () => ({
  authedFetch: vi.fn(),
  isAdmin: vi.fn(() => true),
  hasPerm: vi.fn(() => false),
  getPermissions: vi.fn(() => []),
  getGrantedPageRoutes: vi.fn(() => new Set()),
}));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysFromToday = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
};

const procurement = (over: Record<string, unknown> = {}) => ({
  pr_number: 'PR-2026-0101',
  pr_status: 'approved',
  pr_status_label: 'Onaylandı',
  pr_count: 2,
  po_id: 345,
  po_supplier_name: 'Demir A.Ş.',
  po_ordered_at: daysFromToday(-20),
  po_delivery_days: 10,
  po_expected_delivery: daysFromToday(-10),
  po_unit_price: '12.50',
  po_currency: 'EUR',
  po_count: 1,
  ordered_quantity: '8.00',
  ...over,
});

const ITEMS = [
  {
    id: 1,
    item_code: 'LATE-1',
    item_name: 'Rulman',
    planning_request_number: 'GR-1',
    job_no: '254-01',
    quantity_to_purchase: '8.00',
    item_unit: 'adet',
    is_delivered: false,
    delivered_quantity: '3.00',
    needed_date: daysFromToday(5),
    request_priority: 'urgent',
    request_priority_label: 'Acil',
    procurement: procurement(),
  },
  {
    id: 2,
    item_code: 'NEW-2',
    item_name: 'Keçe',
    job_no: '254-02',
    quantity_to_purchase: '2.00',
    item_unit: 'adet',
    is_delivered: false,
    delivered_quantity: '0.00',
    procurement: procurement({
      pr_number: null,
      pr_status: null,
      pr_status_label: null,
      pr_count: 0,
      po_id: null,
      po_supplier_name: null,
      po_ordered_at: null,
      po_delivery_days: null,
      po_expected_delivery: null,
      po_unit_price: null,
      po_currency: null,
      po_count: 0,
      ordered_quantity: '0.00',
    }),
  },
];

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => {
    const path = new URL(String(url)).pathname;
    const body =
      path === '/planning/items/'
        ? { count: 2, next: null, previous: null, results: ITEMS }
        : { detail: 'not mocked' };
    return Promise.resolve(
      new Response(JSON.stringify(body), { status: path === '/planning/items/' ? 200 : 404 }),
    );
  });
});

const listParams = () =>
  Object.fromEntries(
    fetchMock.mock.calls
      .map(([url]) => new URL(String(url)))
      .filter((u) => u.pathname === '/planning/items/')
      .at(-1)!.searchParams,
  );

it('shows each line with its request, order, supplier, expected delivery and quantities', async () => {
  renderWithProviders(<ProcurementPlanningItemsPage />, {
    route: '/procurement/planning-items?has_po=true&request_priority=urgent',
  });
  const late = (await screen.findByText('LATE-1')).closest('tr')!;
  expect(within(late).getByRole('link', { name: 'PR-2026-0101' })).toBeInTheDocument();
  expect(within(late).getByText('+1')).toBeInTheDocument(); // on 2 PRs
  expect(within(late).getByText('Onaylandı')).toBeInTheDocument();
  expect(within(late).getByRole('link', { name: '#345' })).toHaveAttribute(
    'href',
    '/finance/purchase-orders?order=345',
  );
  expect(within(late).getByText('Demir A.Ş.')).toBeInTheDocument();
  expect(within(late).getByText('10 gün gecikti')).toBeInTheDocument();
  expect(within(late).getByText(/12,50 EUR/)).toBeInTheDocument();
  expect(within(late).getByText('Acil')).toBeInTheDocument();
  expect(late).toHaveStyle({ backgroundColor: 'var(--mantine-color-red-0)' });

  const fresh = screen.getByText('NEW-2').closest('tr')!;
  expect(within(fresh).getByText('Talep yok')).toBeInTheDocument();
  expect(within(fresh).queryByText(/gecikti/)).toBeNull();

  expect(listParams()).toMatchObject({
    include_procurement: 'true',
    has_po: 'true',
    request_priority: 'urgent',
    ordering: '-id',
  });
});

it('a delivery is late only while the line is not fully received', () => {
  const row = ITEMS[0]!;
  expect(isDeliveryLate(row as never)).toBe(true);
  expect(isDeliveryLate({ ...row, is_delivered: true } as never)).toBe(false);
  expect(
    isDeliveryLate({
      ...row,
      procurement: procurement({ po_expected_delivery: daysFromToday(3) }),
    } as never),
  ).toBe(false);
});

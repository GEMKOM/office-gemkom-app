import { authedFetch } from '@legacy/authService.js';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { InventoryHubPage } from './InventoryHubPage';
import { PlanningHubPage } from './PlanningHubPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));
vi.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 42, username: 'planlama' } }),
}));
const granted = vi.hoisted(() => ({ routes: null as Set<string> | null }));
vi.mock('@legacy/apis/accessControl.js', () => ({
  hasRouteAccess: (route: string) =>
    granted.routes === null || granted.routes.has(route.replace(/[?#].*$/, '').replace(/\/$/, '')),
}));

const fetchMock = vi.mocked(authedFetch);
const page = (count: number, results: unknown[] = []) => ({
  count,
  next: null,
  previous: null,
  results,
});
const json = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
const calls = () => fetchMock.mock.calls.map(([u]) => new URL(String(u)));

const TASK = {
  id: 77,
  job_order: '265-04',
  job_order_title: 'Konveyör Hattı',
  customer_name: 'Acme',
  assigned_to_name: 'Zeynep',
  status: 'in_progress',
  status_display: 'Devam Ediyor',
  target_completion_date: '2020-01-10',
};

beforeEach(() => {
  granted.routes = null;
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => {
    const { pathname, searchParams } = new URL(String(url));
    if (pathname === '/planning/department-requests/approved_requests/') return json(page(5));
    if (pathname === '/planning/requests/')
      return json(page(searchParams.get('status') === 'pending_erp_entry' ? 3 : 1));
    if (pathname === '/projects/job-orders/procurement_pending/') return json(page(8));
    if (pathname === '/projects/department-tasks/') {
      if (searchParams.get('page_size') !== '1') return json(page(1, [TASK]));
      if (searchParams.has('assigned_to')) return json(page(2));
      if (searchParams.has('target_completion_date__lte')) return json(page(4));
      if (searchParams.get('status') === 'blocked') return json(page(1));
      return json(page(19));
    }
    if (pathname === '/procurement/items/') return json(page(1240));
    if (pathname === '/equipment/items/') return json(page(87));
    return json(page(0));
  });
});

it('shows the queues planning works through and the tasks by target date', async () => {
  renderWithProviders(<PlanningHubPage />, { route: '/planning/' });

  await waitFor(() => expect(document.getElementById('to-transfer')).toHaveTextContent('5'));
  expect(document.getElementById('erp-entry')).toHaveTextContent('3');
  await waitFor(() => expect(document.getElementById('planning-mine')).toHaveTextContent('2'));
  expect(document.getElementById('planning-overdue')).toHaveTextContent('4');
  expect(within(document.getElementById('planning-mine')!).getByRole('link')).toHaveAttribute(
    'href',
    '/planning/projects?assigned_to=42',
  );

  const queues = screen
    .getByRole('heading', { name: 'Planlamayı Bekleyenler' })
    .closest('section')!;
  await waitFor(() =>
    expect(within(queues).getByRole('link', { name: /Malzeme maliyeti/ })).toHaveTextContent('8'),
  );
  expect(within(queues).getByRole('link', { name: /Stok kontrolü/ })).toHaveAttribute(
    'href',
    '/planning/department-requests?pr_status=pending_inventory',
  );

  const deadlines = screen.getByRole('heading', { name: 'Teslim Sırası' }).closest('section')!;
  const row = await within(deadlines).findByRole('link', { name: /265-04/ });
  expect(row).toHaveAttribute('href', '/planning/projects?task=77');
  expect(row).toHaveTextContent('Konveyör Hattı');
  // Past its target: the date shows in red.
  expect(row.querySelector('[data-alert]')).not.toBeNull();

  // Counts match the Projeler page: the department's main tasks only.
  const tasks = calls().filter((url) => url.pathname === '/projects/department-tasks/');
  expect(tasks.every((url) => url.searchParams.get('department') === 'planning')).toBe(true);
  expect(tasks.every((url) => url.searchParams.get('main_only') === 'true')).toBe(true);
  const list = tasks.find((url) => url.searchParams.get('page_size') === '6')!;
  expect(list.searchParams.get('ordering')).toBe('target_completion_date');
  expect(list.searchParams.get('status__in')).toBe('pending,in_progress');
});

it('fetches only what the user can open', async () => {
  granted.routes = new Set(['/planning/procurement-lines']);
  renderWithProviders(<PlanningHubPage />, { route: '/planning/' });

  expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
    'Malzeme Maliyeti Satırları',
  ]);
  await waitFor(() =>
    expect(screen.getByRole('link', { name: /Malzeme maliyeti/ })).toHaveTextContent('8'),
  );
  expect(new Set(calls().map((url) => url.pathname))).toEqual(
    new Set(['/projects/job-orders/procurement_pending/']),
  );
  expect(screen.queryByRole('heading', { name: 'Teslim Sırası' })).not.toBeInTheDocument();
});

it('Stok: counts stock cards and active equipment', async () => {
  renderWithProviders(<InventoryHubPage />, { route: '/planning/inventory/' });

  const card = (title: string) =>
    screen.getByRole('heading', { level: 3, name: title }).closest('article')!;
  await waitFor(() => expect(card('Stok Kartları')).toHaveTextContent('1.240 stok kartı'));
  await waitFor(() => expect(card('Ekipman')).toHaveTextContent('87 aktif ekipman'));
  const items = calls().find((url) => url.pathname === '/procurement/items/')!;
  expect(items.searchParams.get('item_type')).toBe('stock');
});

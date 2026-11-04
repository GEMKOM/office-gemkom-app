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
const lane = (name: string) => screen.getByRole('region', { name });

const PLAN_END = Date.UTC(2026, 10, 14, 12);

beforeEach(() => {
  granted.routes = null;
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => {
    const { pathname, searchParams } = new URL(String(url));
    if (pathname === '/planning/department-requests/approved_requests/') {
      const rows =
        searchParams.get('page_size') === '1'
          ? []
          : [
              {
                id: 187,
                request_number: 'DT-0187',
                title: 'Rulman seti',
                department_label: 'Bakım',
                needed_date: '2026-01-02',
              },
            ];
      return json(page(5, rows));
    }
    if (pathname === '/planning/requests/')
      return json(page(searchParams.get('status') === 'pending_erp_entry' ? 3 : 1));
    if (pathname === '/projects/job-orders/procurement_pending/') return json(page(8));
    if (pathname === '/planning/items/') return json(page(18));
    if (pathname === '/projects/department-tasks/') {
      if (searchParams.has('assigned_to')) return json(page(2));
      if (searchParams.has('target_completion_date__lte')) return json(page(4));
      if (searchParams.get('status') === 'blocked') return json(page(1));
      return json(page(19));
    }
    if (pathname === '/cnc_cutting/tasks/')
      return json(page(searchParams.get('in_plan') === 'false' ? 6 : 14));
    if (pathname === '/machines/')
      return json(
        page(2, [
          { id: 3, name: 'Fiber Lazer', is_active: true },
          { id: 4, name: 'Plazma', is_active: true },
        ]),
      );
    if (pathname === '/cnc_cutting/planning/list/')
      return json(
        searchParams.get('machine_fk') === '3'
          ? [
              { key: 'C-1', estimated_hours: '10', planned_end_ms: PLAN_END },
              { key: 'C-2', estimated_hours: '9', remaining_hours: '4.5' },
            ]
          : [],
      );
    if (pathname === '/linear_cutting/tasks/')
      return json(
        page(2, [
          {
            key: 'LC-1',
            session: 'S-1',
            session_title: 'Şase',
            item_name: 'HEA 200',
            stock_length_mm: 12000,
            estimated_hours: '1.5',
            in_plan: false,
          },
          { key: 'LC-2', session: 'S-1', estimated_hours: '0.5', in_plan: true },
        ]),
      );
    if (pathname === '/cnc_cutting/remnants/')
      return json(page(searchParams.get('unassigned') === 'true' ? 17 : 42));
    if (pathname === '/projects/job-orders/') {
      if (searchParams.has('target_completion_date__gte')) return json(page(6));
      if (searchParams.has('target_completion_date__lte')) return json(page(4));
      return json(page(38));
    }
    if (pathname === '/procurement/items/') return json(page(1240));
    if (pathname === '/equipment/items/') return json(page(87));
    return json(page(0));
  });
});

it('leads with what waits on planning: its tasks, the request flow and the requests to pass on', async () => {
  renderWithProviders(<PlanningHubPage />, { route: '/planning/' });

  await waitFor(() => expect(document.getElementById('to-transfer')).toHaveTextContent('5'));
  await waitFor(() => expect(document.getElementById('planning-active')).toHaveTextContent('19'));

  const waiting = lane('Planlamayı Bekleyenler');
  await waitFor(() =>
    expect(within(waiting).getByRole('link', { name: /aktif planlama görevi/ })).toHaveTextContent(
      '19',
    ),
  );
  expect(within(waiting).getByRole('link', { name: /Bana atanan/ })).toHaveAttribute(
    'href',
    '/planning/projects?assigned_to=42',
  );
  await waitFor(() =>
    expect(within(waiting).getByRole('link', { name: /Hedefi geçen/ })).toHaveTextContent('4'),
  );

  // The steps in the order a request passes them, each opening its list.
  const steps = within(waiting)
    .getAllByRole('link')
    .filter((link) => link.closest('ol'));
  expect(steps.map((link) => link.textContent)).toEqual([
    expect.stringMatching(/^1Aktarılacak departman talebi/),
    expect.stringMatching(/^2Stok kontrolü/),
    expect.stringMatching(/^3ERP girişi/),
    expect.stringMatching(/^4Malzeme maliyeti/),
    expect.stringMatching(/^5Talebe dönüşmemiş malzeme/),
  ]);
  expect(steps[1]).toHaveAttribute(
    'href',
    '/planning/department-requests?pr_status=pending_inventory',
  );
  expect(steps[2]).toHaveAttribute(
    'href',
    '/planning/department-requests?pr_status=pending_erp_entry',
  );
  await waitFor(() => expect(steps[3]).toHaveTextContent('8'));
  expect(steps[4]).toHaveAttribute('href', '/procurement/purchase-requests/create');
  await waitFor(() =>
    expect(within(waiting).getByRole('link', { name: /DT-0187/ })).toHaveAttribute(
      'href',
      '/planning/department-requests?request=187',
    ),
  );

  // Counts match the Projeler page: the department's main tasks only.
  const tasks = calls().filter((url) => url.pathname === '/projects/department-tasks/');
  expect(tasks.every((url) => url.searchParams.get('department') === 'planning')).toBe(true);
  expect(tasks.every((url) => url.searchParams.get('main_only') === 'true')).toBe(true);
  expect(tasks.every((url) => url.searchParams.get('page_size') === '1')).toBe(true);
  expect(screen.queryByRole('heading', { name: 'Teslim Sırası' })).not.toBeInTheDocument();
});

it('shows a lane per area with its live figures', async () => {
  renderWithProviders(<PlanningHubPage />, { route: '/planning/' });

  // CNC: open and unplanned cuts, and each machine's planned load.
  const cnc = lane('CNC Kesim');
  await waitFor(() => expect(cnc).toHaveTextContent('14Açık kesim'));
  expect(cnc).toHaveTextContent('6Plana alınmamış');
  await waitFor(() => expect(cnc).toHaveTextContent('14,5 saPlanlı iş yükü'));
  expect(within(cnc).getByRole('link', { name: /Fiber Lazer/ })).toHaveAttribute(
    'href',
    '/planning/cnc-cutting/capacity?machine=3',
  );
  // A machine with nothing in its plan is left out.
  expect(within(cnc).queryByText('Plazma')).not.toBeInTheDocument();
  const plans = calls().filter((url) => url.pathname === '/cnc_cutting/planning/list/');
  expect(plans.map((url) => url.searchParams.get('machine_fk')).sort()).toEqual(['3', '4']);
  expect(plans.every((url) => url.searchParams.get('only_in_plan') === 'true')).toBe(true);

  const linear = lane('Lineer Kesim');
  await waitFor(() => expect(linear).toHaveTextContent('2Açık bar görevi'));
  expect(linear).toHaveTextContent('1Plana alınmamış');
  expect(within(linear).getByRole('link', { name: /LC-1/ })).toHaveAttribute(
    'href',
    '/planning/linear-cutting/tasks?session=S-1',
  );

  const stock = lane('Stok');
  await waitFor(() => expect(stock).toHaveTextContent('42Kullanılabilir fire plaka'));
  await waitFor(() => expect(stock).toHaveTextContent('hiç kullanılmamış: 17'));
  await waitFor(() => expect(stock).toHaveTextContent('1.240Stok kartı'));

  const projects = lane('Proje');
  await waitFor(() => expect(projects).toHaveTextContent('38Açık iş emri'));
  expect(projects).toHaveTextContent('4Termini geçen');
  expect(projects).toHaveTextContent('614 gün içinde teslim');
  expect(within(projects).getByRole('link', { name: 'Görev Şablonları' })).toHaveAttribute(
    'href',
    '/planning/task-templates',
  );
});

it('fetches only what the user can open', async () => {
  granted.routes = new Set(['/planning/procurement-lines']);
  renderWithProviders(<PlanningHubPage />, { route: '/planning/' });

  const waiting = lane('Planlamayı Bekleyenler');
  await waitFor(() =>
    expect(within(waiting).getByRole('link', { name: /Malzeme maliyeti/ })).toHaveTextContent('8'),
  );
  expect(
    within(waiting)
      .getAllByRole('link')
      .map((link) => link.textContent),
  ).toEqual(['Malzeme Maliyeti Satırları', expect.stringMatching(/^1Malzeme maliyeti/)]);
  for (const name of ['CNC Kesim', 'Lineer Kesim', 'Stok', 'Proje']) {
    expect(screen.queryByRole('region', { name })).not.toBeInTheDocument();
  }
  expect(new Set(calls().map((url) => url.pathname))).toEqual(
    new Set(['/projects/job-orders/procurement_pending/']),
  );
});

it('a cutting planner sees the CNC lane and its load, nothing else', async () => {
  granted.routes = new Set(['/planning/cnc-cutting/capacity']);
  renderWithProviders(<PlanningHubPage />, { route: '/planning/' });

  const cnc = lane('CNC Kesim');
  await waitFor(() => expect(cnc).toHaveTextContent('14,5 saPlanlı iş yükü'));
  expect(cnc).not.toHaveTextContent('Açık kesim');
  expect(screen.queryByRole('region', { name: 'Planlamayı Bekleyenler' })).not.toBeInTheDocument();
  expect(new Set(calls().map((url) => url.pathname))).toEqual(
    new Set(['/cnc_cutting/tasks/', '/machines/', '/cnc_cutting/planning/list/']),
  );
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

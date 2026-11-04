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
        page(4, [
          { id: 3, name: 'Fiber Lazer', is_active: true },
          { id: 4, name: 'Plazma', is_active: true },
          { id: 5, name: 'Oksijen', is_active: true },
          { id: 6, name: 'Su Jeti', is_active: true },
        ]),
      );
    if (pathname === '/cnc_cutting/planning/list/') {
      const machine = searchParams.get('machine_fk');
      if (machine === '3')
        return json([
          { key: 'C-1', estimated_hours: '10', planned_end_ms: PLAN_END },
          { key: 'C-2', estimated_hours: '9', remaining_hours: '4.5' },
        ]);
      if (machine === '4') return json([{ key: 'C-3', estimated_hours: '2' }]);
      return json([]);
    }
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
    if (pathname === '/cnc_cutting/timers/')
      return json(
        page(2, [
          {
            id: 71,
            machine_fk: 3,
            machine_name: 'Fiber Lazer',
            issue_key: 'CNC-88',
            issue_name: 'Flanş 20 mm',
            username: 'ayse',
            timer_type: 'productive',
            start_time: Date.now() - 50 * 60_000,
          },
          {
            id: 72,
            machine_fk: 5,
            machine_name: 'Oksijen',
            issue_key: 'CNC-90',
            issue_name: 'Taban plakası',
            username: 'mehmet',
            timer_type: 'productive',
            start_time: Date.now() - 20 * 60_000,
          },
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
  // Requests, materials, cost lines and stock: one group of pages.
  expect(
    within(within(waiting).getByRole('navigation'))
      .getAllByRole('link')
      .map((link) => link.textContent),
  ).toEqual(['Departman Talepleri', 'Planlama Kalemleri', 'Malzeme Maliyeti Satırları', 'Stok']);

  // The active tasks first, then the steps in the order a request passes them.
  const figure = (name: RegExp) => within(waiting).getByRole('link', { name });
  await waitFor(() => expect(figure(/Aktif planlama görevi/)).toHaveTextContent('19'));
  const figures = within(waiting)
    .getAllByRole('link')
    .filter((link) => link.closest('nav') === null && !link.closest('ul[aria-label]'))
    .map((link) => link.textContent);
  expect(figures.slice(0, 6)).toEqual([
    expect.stringMatching(/^Aktif planlama görevi/),
    expect.stringMatching(/^Aktarılacak talep/),
    expect.stringMatching(/^Stok kontrolünde/),
    expect.stringMatching(/^ERP girişi bekleyen/),
    expect.stringMatching(/^Maliyet bekleyen iş emri/),
    expect.stringMatching(/^Talebe dönüşmemiş malzeme/),
  ]);
  expect(figure(/Stok kontrolünde/)).toHaveAttribute(
    'href',
    '/planning/department-requests?pr_status=pending_inventory',
  );
  expect(figure(/ERP girişi bekleyen/)).toHaveAttribute(
    'href',
    '/planning/department-requests?pr_status=pending_erp_entry',
  );
  await waitFor(() => expect(figure(/Maliyet bekleyen iş emri/)).toHaveTextContent('8'));
  expect(figure(/Talebe dönüşmemiş malzeme/)).toHaveAttribute(
    'href',
    '/procurement/purchase-requests/create',
  );
  await waitFor(() =>
    expect(figure(/DT-0187/)).toHaveAttribute('href', '/planning/department-requests?request=187'),
  );
  expect(waiting).toHaveTextContent('+1 daha');

  // Counts match the Projeler page: the department's main tasks only.
  const tasks = calls().filter((url) => url.pathname === '/projects/department-tasks/');
  expect(tasks.every((url) => url.searchParams.get('department') === 'planning')).toBe(true);
  expect(tasks.every((url) => url.searchParams.get('main_only') === 'true')).toBe(true);
  expect(tasks.every((url) => url.searchParams.get('page_size') === '1')).toBe(true);
});

it('shows a lane per area with its live figures', async () => {
  renderWithProviders(<PlanningHubPage />, { route: '/planning/' });

  expect(screen.getAllByRole('region').map((region) => region.getAttribute('aria-label'))).toEqual([
    'Planlamayı Bekleyenler',
    'CNC Kesim',
    'Lineer Kesim',
    'Projeler',
  ]);

  // CNC: running timers (as İmalat shows machining's), open and unplanned
  // cuts, each machine's planned load, the remnants.
  const cnc = lane('CNC Kesim');
  await waitFor(() => expect(cnc).toHaveTextContent('Aktif zamanlayıcı2 makinede2'));
  expect(within(cnc).getByRole('link', { name: /Aktif zamanlayıcı/ })).toHaveAttribute(
    'href',
    '/planning/cnc-cutting/dashboard',
  );
  await waitFor(() => expect(cnc).toHaveTextContent('Açık kesim14'));
  expect(cnc).toHaveTextContent('Plana alınmamış kesim6');
  await waitFor(() => expect(cnc).toHaveTextContent('Planlı iş yükü'));
  await waitFor(() => expect(cnc).toHaveTextContent('14,5 sa'));
  // One list: each machine's load and what it does now (its running timer, or
  // "Boşta"), the running machines first. No switch any more.
  const load = within(cnc).getByRole('list', { name: 'Makine yükü' });
  await waitFor(() =>
    expect(
      within(load)
        .getAllByRole('listitem')
        .map((row) => row.textContent),
    ).toEqual([
      expect.stringMatching(/^Fiber Lazer.*CNC-88 · ayse/),
      expect.stringMatching(/^Oksijen.*CNC-90 · mehmet/),
      expect.stringMatching(/^PlazmaBoşta/),
    ]),
  );
  expect(within(cnc).queryByRole('button', { name: 'Makine yükü' })).not.toBeInTheDocument();
  expect(within(cnc).getByRole('link', { name: /Fiber Lazer/ })).toHaveAttribute(
    'href',
    '/planning/cnc-cutting/capacity?machine=3',
  );
  // A machine with nothing in its plan and no timer is left out.
  expect(within(cnc).queryByText('Su Jeti')).not.toBeInTheDocument();
  await waitFor(() => expect(cnc).toHaveTextContent('17 kullanılmamış42'));
  const plans = calls().filter((url) => url.pathname === '/cnc_cutting/planning/list/');
  expect(plans.map((url) => url.searchParams.get('machine_fk')).sort()).toEqual([
    '3',
    '4',
    '5',
    '6',
  ]);
  expect(plans.every((url) => url.searchParams.get('only_in_plan') === 'true')).toBe(true);

  const linear = lane('Lineer Kesim');
  await waitFor(() => expect(linear).toHaveTextContent('Açık bar görevi1 kesim planında2'));
  expect(linear).toHaveTextContent('Plana alınmamış bar1');
  expect(within(linear).getByRole('link', { name: /LC-1/ })).toHaveAttribute(
    'href',
    '/planning/linear-cutting/tasks?session=S-1',
  );

  // Projeler holds project planning and the task templates.
  const projects = lane('Projeler');
  expect(
    within(within(projects).getByRole('navigation'))
      .getAllByRole('link')
      .map((link) => link.textContent),
  ).toEqual(['Görevler', 'Proje Planlama', 'Görev Şablonları']);
  await waitFor(() => expect(projects).toHaveTextContent('Bana atanan görev2'));
  await waitFor(() => expect(projects).toHaveTextContent('Termini geçen iş emri4'));
  expect(projects).toHaveTextContent('14 gün içinde teslim6');
});

it('fetches only what the user can open', async () => {
  granted.routes = new Set(['/planning/procurement-lines']);
  renderWithProviders(<PlanningHubPage />, { route: '/planning/' });

  const waiting = lane('Planlamayı Bekleyenler');
  await waitFor(() =>
    expect(within(waiting).getByRole('link', { name: /Maliyet bekleyen/ })).toHaveTextContent('8'),
  );
  expect(
    within(waiting)
      .getAllByRole('link')
      .map((link) => link.textContent),
  ).toEqual(['Malzeme Maliyeti Satırları', expect.stringMatching(/^Maliyet bekleyen iş emri/)]);
  expect(screen.getAllByRole('region')).toHaveLength(1);
  expect(new Set(calls().map((url) => url.pathname))).toEqual(
    new Set(['/projects/job-orders/procurement_pending/']),
  );
});

it('a cutting planner sees the CNC lane and its load, nothing else', async () => {
  granted.routes = new Set(['/planning/cnc-cutting/capacity']);
  renderWithProviders(<PlanningHubPage />, { route: '/planning/' });

  const cnc = lane('CNC Kesim');
  await waitFor(() => expect(cnc).toHaveTextContent('14,5 sa'));
  expect(cnc).not.toHaveTextContent('Açık kesim');
  expect(screen.getAllByRole('region')).toHaveLength(1);
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

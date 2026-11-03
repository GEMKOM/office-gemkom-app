import { authedFetch } from '@legacy/authService.js';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { AttendanceHubPage } from './attendance/AttendanceHubPage';
import { HumanResourcesHubPage } from './HumanResourcesHubPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));
const granted = vi.hoisted(() => ({ routes: null as Set<string> | null }));
vi.mock('@legacy/apis/accessControl.js', () => ({
  hasRouteAccess: (route: string) =>
    granted.routes === null || granted.routes.has(route.replace(/[?#].*$/, '').replace(/\/$/, '')),
}));

const fetchMock = vi.mocked(authedFetch);

// Today's PDKS records by state.
const TODAY: Record<string, number> = { active: 41, complete: 6, leave: 3, pending_override: 2 };

const OVERRIDES = [
  {
    id: 11,
    user_display: 'Mehmet Kaya',
    date: '2026-11-02',
    status: 'pending_override',
    sessions: [
      { id: 1, check_in_time: '2026-11-02T08:12:00+03:00', override_reason: 'Sahada montaj' },
    ],
  },
];

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const page = (count: number, results: unknown[] = []) => ({
  count,
  next: null,
  previous: null,
  results,
});

function respond(status = 200) {
  fetchMock.mockImplementation((url) => {
    if (status !== 200) return json(status, { detail: 'Bu işlem için yetkiniz yok.' });
    const { pathname, searchParams } = new URL(String(url));
    if (pathname === '/attendance/hr/pending-overrides/') return json(200, page(3, OVERRIDES));
    if (pathname === '/attendance/hr/records/')
      return json(200, page(TODAY[searchParams.get('status')!] ?? 0));
    if (pathname === '/users/') return json(200, page(128));
    if (pathname === '/vacation-requests/requests/approvals-inbox/')
      return json(200, { count: 4, results: [] });
    return json(200, page(0));
  });
}

const calls = () => fetchMock.mock.calls.map(([u]) => new URL(String(u)));

beforeEach(() => {
  granted.routes = null;
  fetchMock.mockReset();
  respond();
});

it('HR hub: both PDKS cards open the page they describe, with the pending count', async () => {
  renderWithProviders(<HumanResourcesHubPage />, { route: '/human_resources/' });

  expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
    'Çalışanlar',
    'Organizasyon',
    'PDKS Onayları',
    'PDKS Kayıtları',
    'İzin Yönetimi',
  ]);
  expect(screen.getByRole('link', { name: 'PDKS Onayları' })).toHaveAttribute(
    'href',
    '/human_resources/attendance/pending-overrides',
  );
  expect(screen.getByRole('link', { name: 'PDKS Kayıtları' })).toHaveAttribute(
    'href',
    '/human_resources/attendance/records',
  );

  await waitFor(() => expect(document.getElementById('pending-overrides')).toHaveTextContent('3'));
  const count = calls().find(
    (url) =>
      url.pathname === '/attendance/hr/pending-overrides/' && url.searchParams.has('page_size'),
  )!;
  expect(count.search).toBe('?page_size=1');
});

it('HR hub: what waits on HR, who is in today and the head count, each linking to its list', async () => {
  renderWithProviders(<HumanResourcesHubPage />, { route: '/human_resources/' });

  await waitFor(() => expect(document.getElementById('leave-inbox')).toHaveTextContent('4'));
  await waitFor(() => expect(document.getElementById('inside-now')).toHaveTextContent('41'));
  await waitFor(() => expect(document.getElementById('active-staff')).toHaveTextContent('128'));
  expect(within(document.getElementById('inside-now')!).getByRole('link')).toHaveAttribute(
    'href',
    '/human_resources/attendance/records?status=active',
  );

  // Today's records, counted state by state for today's date.
  const counted = calls().filter((url) => url.pathname === '/attendance/hr/records/');
  expect(counted.map((url) => url.searchParams.get('status')).sort()).toEqual([
    'active',
    'complete',
    'leave',
    'pending_override',
  ]);
  expect(counted.every((url) => /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('date')!))).toBe(
    true,
  );
  const today = screen.getByRole('heading', { name: 'Bugünkü Yoklama' }).closest('section')!;
  await waitFor(() => expect(today).toHaveTextContent('İzinli3'));

  const overrides = screen
    .getByRole('heading', { name: 'Ofis Dışı Giriş Onayları' })
    .closest('section')!;
  const row = await within(overrides).findByRole('link', { name: /Mehmet Kaya/ });
  expect(row).toHaveTextContent('Sahada montaj');
  expect(row).toHaveTextContent('Giriş');
  expect(row).toHaveAttribute('href', '/human_resources/attendance/pending-overrides');
});

it('HR hub: a refused count shows "-" and the cards stay', async () => {
  respond(403);
  renderWithProviders(<HumanResourcesHubPage />, { route: '/human_resources/' });

  await waitFor(() => expect(document.getElementById('pending-overrides')).toHaveTextContent('-'));
  expect(screen.getByRole('heading', { name: 'PDKS Onayları' })).toBeInTheDocument();
});

it("PDKS hub: a user with only the records page sees one card and only today's counts", async () => {
  granted.routes = new Set(['/human_resources/attendance/records']);
  renderWithProviders(<AttendanceHubPage />, { route: '/human_resources/attendance/' });

  expect(screen.getByRole('heading', { name: 'PDKS' })).toBeInTheDocument();
  expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
    'Kayıtlar',
  ]);
  expect(document.getElementById('pending-overrides')).toBeNull();
  await waitFor(() => expect(document.getElementById('on-leave')).toHaveTextContent('3'));
  expect(new Set(calls().map((url) => url.pathname))).toEqual(new Set(['/attendance/hr/records/']));
  expect(
    screen.queryByRole('heading', { name: 'Ofis Dışı Giriş Onayları' }),
  ).not.toBeInTheDocument();
});

it('PDKS hub: a user without the records page asks for none of them', () => {
  granted.routes = new Set(['/human_resources/attendance/shift-rules']);
  renderWithProviders(<AttendanceHubPage />, { route: '/human_resources/attendance/' });

  expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
    'Vardiya Kuralları',
  ]);
  expect(fetchMock).not.toHaveBeenCalled();
});

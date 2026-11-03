import { authedFetch, hasPerm } from '@legacy/authService.js';
import dayjs from 'dayjs';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { AttendanceHubPage } from './attendance/AttendanceHubPage';
import { HumanResourcesHubPage } from './HumanResourcesHubPage';

vi.mock('@legacy/authService.js', () => ({
  authedFetch: vi.fn(),
  hasPerm: vi.fn(() => true),
  isSuperuser: () => false,
}));
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

// Active employees for the data checks: Ali is complete; Ayşe has no
// position, hire date or personel kodu; Can has no TC kimlik no.
const STAFF = [
  {
    id: 1,
    username: 'ali',
    position_id: 4,
    hire_date: '2020-01-06',
    personel_kodu: 'P1',
    tc_kimlik_no: '1',
  },
  {
    id: 2,
    username: 'ayse',
    position_id: null,
    hire_date: null,
    personel_kodu: '',
    tc_kimlik_no: '2',
  },
  { id: 3, username: 'can', position_id: 5, hire_date: '2024-03-01', personel_kodu: 'P3' },
];
const since = (n: number, unit: 'year' | 'month') => dayjs().subtract(n, unit).format('YYYY-MM-DD');
// Ali's wage is two years old, Ayşe has none, Can's is recent.
const WAGES = [
  { id: 1, has_wage: true, current_wage: { effective_from: since(2, 'year') } },
  { id: 2, has_wage: false, current_wage: null },
  { id: 3, has_wage: true, current_wage: { effective_from: since(1, 'month') } },
];
const SUMMARY = [
  { user_id: 1, days_absent: 0 },
  { user_id: 2, days_absent: 2 },
  { user_id: 3, days_absent: 1 },
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
    // Open days in a date range, else today's records by state.
    if (pathname === '/attendance/hr/records/')
      return json(
        200,
        page(searchParams.has('date_from') ? 5 : (TODAY[searchParams.get('status')!] ?? 0)),
      );
    if (pathname === '/attendance/hr/summary/') return json(200, SUMMARY);
    if (pathname === '/users/wages/') return json(200, page(3, WAGES));
    if (pathname === '/users/')
      return json(200, searchParams.get('page_size') === '1000' ? page(3, STAFF) : page(128));
    if (pathname === '/vacation-requests/requests/approvals-inbox/')
      return json(200, { count: 4, results: [] });
    return json(200, page(0));
  });
}

const calls = () => fetchMock.mock.calls.map(([u]) => new URL(String(u)));

beforeEach(() => {
  granted.routes = null;
  vi.mocked(hasPerm).mockReturnValue(true);
  fetchMock.mockReset();
  respond();
});

it('HR hub: one PDKS card opens the PDKS hub, with who is in and the approvals waiting', async () => {
  renderWithProviders(<HumanResourcesHubPage />, { route: '/human_resources/' });

  expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
    'Çalışanlar',
    'Organizasyon',
    'PDKS',
    'İzin Yönetimi',
  ]);
  const card = screen.getByRole('link', { name: 'PDKS' });
  expect(card).toHaveAttribute('href', '/human_resources/attendance');
  await waitFor(() => expect(card.closest('article')).toHaveTextContent('41 kişi şu an içeride'));
  await waitFor(() => expect(card.closest('article')).toHaveTextContent('3 onay bekliyor'));

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
  const counted = calls().filter(
    (url) => url.pathname === '/attendance/hr/records/' && url.searchParams.has('date'),
  );
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
  expect(screen.getByRole('heading', { name: 'PDKS', level: 3 })).toBeInTheDocument();
});

it('HR hub: with only the approvals page the PDKS card opens it, with the pending count', async () => {
  granted.routes = new Set(['/human_resources/attendance/pending-overrides']);
  renderWithProviders(<HumanResourcesHubPage />, { route: '/human_resources/' });

  const card = screen.getByRole('link', { name: 'PDKS' });
  expect(card).toHaveAttribute('href', '/human_resources/attendance/pending-overrides');
  await waitFor(() => expect(card.closest('article')).toHaveTextContent('3 onay bekliyor'));
});

const checks = () => screen.getByRole('heading', { name: 'Veri Eksikleri' }).closest('section')!;
const checkRow = (name: RegExp) => within(checks()).getByRole('link', { name });

it('HR hub: Veri Eksikleri counts each gap and links to the list that fixes it', async () => {
  renderWithProviders(<HumanResourcesHubPage />, { route: '/human_resources/' });

  const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
  const monthAgo = dayjs().subtract(30, 'day').format('YYYY-MM-DD');
  const twoWeeksAgo = dayjs().subtract(14, 'day').format('YYYY-MM-DD');
  const expected: [RegExp, string, string][] = [
    [/Ücreti girilmemiş/, '1', '/human_resources/users?issue=missing_wage'],
    [/Ücreti güncellenmemiş/, '1', '/human_resources/users?issue=stale_wage'],
    [/Pozisyonu \/ departmanı yok/, '1', '/human_resources/users?issue=no_position'],
    [/İşe giriş tarihi eksik/, '1', '/human_resources/users?issue=no_hire_date'],
    [/Personel kodu eksik/, '1', '/human_resources/users?issue=no_personel_kodu'],
    [/TC kimlik no eksik/, '1', '/human_resources/users?issue=no_tc'],
    [
      /Çıkışı yapılmamış günler/,
      '5',
      `/human_resources/attendance/records?date=&date_from=${monthAgo}&date_to=${yesterday}&status=active`,
    ],
    [
      /Giriş kaydı eksik çalışanlar/,
      '2',
      `/human_resources/attendance/summary?date_from=${twoWeeksAgo}&date_to=${yesterday}&absent=1`,
    ],
    [/Onay bekleyen izin talepleri/, '4', '/human_resources/vacation'],
  ];
  for (const [name, count, href] of expected) {
    await waitFor(() => expect(checkRow(name).querySelector('b')).toHaveTextContent(count));
    expect(checkRow(name)).toHaveAttribute('href', href);
  }

  // Open days: still "active" from a month ago to yesterday, counted from a one-row page.
  const open = calls().find(
    (url) => url.pathname === '/attendance/hr/records/' && url.searchParams.has('date_from'),
  )!;
  expect(Object.fromEntries(open.searchParams)).toEqual({
    date_from: monthAgo,
    date_to: yesterday,
    status: 'active',
    page_size: '1',
  });
  const summary = calls().find((url) => url.pathname === '/attendance/hr/summary/')!;
  expect(Object.fromEntries(summary.searchParams)).toEqual({
    date_from: twoWeeksAgo,
    date_to: yesterday,
  });
});

it('HR hub: wage and TC checks are for manage_hr only; the wage list is never asked for', async () => {
  vi.mocked(hasPerm).mockReturnValue(false);
  renderWithProviders(<HumanResourcesHubPage />, { route: '/human_resources/' });

  await waitFor(() =>
    expect(checkRow(/Personel kodu eksik/).querySelector('b')).toHaveTextContent('1'),
  );
  expect(checks()).not.toHaveTextContent('Ücret');
  expect(checks()).not.toHaveTextContent('TC kimlik');
  expect(calls().some((url) => url.pathname === '/users/wages/')).toBe(false);
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

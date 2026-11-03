import { authedFetch } from '@legacy/authService.js';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { QualityControlHubPage } from './QualityControlHubPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));
const granted = vi.hoisted(() => ({ routes: null as Set<string> | null }));
vi.mock('@legacy/apis/accessControl.js', () => ({
  hasRouteAccess: (route: string) =>
    granted.routes === null || granted.routes.has(route.replace(/[?#].*$/, '').replace(/\/$/, '')),
}));

const fetchMock = vi.mocked(authedFetch);

const calls = () => fetchMock.mock.calls.map(([url]) => new URL(String(url)));
const page = (count: number, results: unknown[] = []) => ({
  count,
  next: null,
  previous: null,
  results,
});

const REVIEW = {
  id: 12,
  job_order: '265-07',
  task_title: 'Kaynak - Şase',
  submitted_by_name: 'Ali Usta',
  submitted_at: '2026-11-02T09:30:00Z',
  status: 'pending',
  open_ncr_count: 1,
};

beforeEach(() => {
  granted.routes = null;
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => {
    const { pathname, searchParams } = new URL(String(url));
    let body = page(0);
    if (pathname === '/quality-control/qc-reviews/')
      body = searchParams.get('page_size') === '1' ? page(7) : page(7, [REVIEW]);
    else if (pathname === '/quality-control/ncrs/')
      body = page(
        searchParams.has('severity')
          ? 2
          : searchParams.get('status') === 'draft'
            ? 5
            : searchParams.get('status') === 'approved'
              ? 55
              : 1284,
      );
    else if (pathname === '/projects/job-orders/qc_pending/') body = page(9);
    else if (pathname === '/quality-control/documents/')
      body = page(searchParams.get('expiry_status') === 'expired' ? 1 : 3);
    return Promise.resolve(new Response(JSON.stringify(body)));
  });
});

it('shows the four cards in legacy order with pending reviews and open NCRs', async () => {
  renderWithProviders(<QualityControlHubPage />, { route: '/quality-control/' });

  expect(screen.getByRole('heading', { name: 'Kalite Kontrol Modülü' })).toBeInTheDocument();
  expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
    'KK İncelemeleri',
    'Uygunsuzluk Raporları',
    'Maliyet Satırları',
    'Kalite Evrakları',
  ]);

  await waitFor(() => expect(document.getElementById('pending-reviews')).toHaveTextContent('7'));
  expect(document.getElementById('open-ncrs')).toHaveTextContent('1.284');
  await waitFor(() => expect(document.getElementById('critical-ncrs')).toHaveTextContent('2'));
  expect(screen.getByText('inceleme bekliyor').parentElement).toHaveTextContent(
    '7 inceleme bekliyor',
  );
  // The figures open lists that count the same rows: pending only, every team.
  expect(within(document.getElementById('pending-reviews')!).getByRole('link')).toHaveAttribute(
    'href',
    '/quality-control/qc-reviews?status=pending',
  );
  expect(within(document.getElementById('critical-ncrs')!).getByRole('link')).toHaveAttribute(
    'href',
    '/quality-control/ncrs?severity=critical&assigned_team__in=all',
  );

  const counts = calls()
    .filter((url) => url.searchParams.get('page_size') === '1')
    .map((url) => `${url.pathname}${url.search}`);
  expect(counts).toContain('/quality-control/qc-reviews/?status=pending&page_size=1');
  expect(counts).toContain(
    '/quality-control/ncrs/?status__in=draft%2Csubmitted%2Crejected&page_size=1',
  );
});

it('lists the reviews that have waited longest, NCRs by stage and what to follow up', async () => {
  renderWithProviders(<QualityControlHubPage />, { route: '/quality-control/' });

  const waiting = screen.getByRole('heading', { name: 'İnceleme Bekleyenler' }).closest('section')!;
  const row = await within(waiting).findByRole('link', { name: /265-07/ });
  expect(row).toHaveAttribute('href', '/quality-control/qc-reviews?review=12');
  expect(row).toHaveTextContent('1 açık NCR');
  const list = calls().find(
    (url) =>
      url.pathname === '/quality-control/qc-reviews/' && url.searchParams.get('page_size') === '6',
  )!;
  expect(list.searchParams.get('ordering')).toBe('submitted_at');

  const ncrs = screen.getByRole('heading', { name: 'Açık Uygunsuzluklar' }).closest('section')!;
  await waitFor(() => expect(ncrs).toHaveTextContent('Aksiyon Bekliyor5'));
  expect(within(ncrs).getByRole('link', { name: /Aksiyon Bekliyor/ })).toHaveAttribute(
    'href',
    '/quality-control/ncrs?status__in=draft&assigned_team__in=all',
  );

  await waitFor(() => expect(ncrs).toHaveTextContent('(açık sayılmaz)55'));
  // Approved-but-not-closed reports are listed apart and not in the open count.
  expect(within(ncrs).getByRole('link', { name: /Onaylandı, Kapanmadı/ })).toHaveTextContent(
    'Onaylandı, Kapanmadı (açık sayılmaz)55',
  );
  expect(within(ncrs).getByRole('link', { name: /Onaylandı, Kapanmadı/ })).toHaveAttribute(
    'href',
    '/quality-control/ncrs?status__in=approved&assigned_team__in=all',
  );
  await waitFor(() => expect(ncrs).toHaveTextContent('Açık rapor (onaylananlar hariç)1.284'));
  const open = calls().filter(
    (url) => url.pathname === '/quality-control/ncrs/' && url.searchParams.has('status__in'),
  );
  expect(open.every((url) => !url.searchParams.get('status__in')!.includes('approved'))).toBe(true);

  const follow = screen.getByRole('heading', { name: 'Takip Edilecekler' }).closest('section')!;
  await waitFor(() =>
    expect(within(follow).getByRole('link', { name: /Süresi dolan/ })).toHaveTextContent('1'),
  );
  expect(within(follow).getByRole('link', { name: /KK maliyeti/ })).toHaveTextContent('9');
});

it('fetches only what the user can open', async () => {
  granted.routes = new Set(['/quality-control/documents']);
  renderWithProviders(<QualityControlHubPage />, { route: '/quality-control/' });

  expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
    'Kalite Evrakları',
  ]);
  expect(document.getElementById('pending-reviews')).toBeNull();
  expect(document.getElementById('open-ncrs')).toBeNull();
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(new Set(calls().map((url) => url.pathname))).toEqual(
    new Set(['/quality-control/documents/']),
  );
});

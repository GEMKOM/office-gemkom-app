import { authedFetch } from '@legacy/authService.js';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { AttendanceHubPage } from './attendance/AttendanceHubPage';
import { HumanResourcesHubPage } from './HumanResourcesHubPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));
const granted = vi.hoisted(() => ({ routes: null as Set<string> | null }));
vi.mock('@legacy/apis/accessControl.js', () => ({
  hasRouteAccess: (route: string) => granted.routes === null || granted.routes.has(route.replace(/\/$/, '')),
}));

const fetchMock = vi.mocked(authedFetch);

function respond(status: number, body: unknown) {
  fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
}

beforeEach(() => {
  granted.routes = null;
  fetchMock.mockReset();
  respond(200, { count: 3, next: null, previous: null, results: [] });
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
  const [url] = fetchMock.mock.calls.map(([u]) => new URL(String(u)));
  expect(`${url!.pathname}${url!.search}`).toBe('/attendance/hr/pending-overrides/?page_size=1');
});

it('HR hub: a refused count shows "-" and the cards stay', async () => {
  respond(403, { detail: 'Bu işlem için yetkiniz yok.' });
  renderWithProviders(<HumanResourcesHubPage />, { route: '/human_resources/' });

  await waitFor(() => expect(document.getElementById('pending-overrides')).toHaveTextContent('-'));
  expect(screen.getByRole('heading', { name: 'PDKS Onayları' })).toBeInTheDocument();
});

it('PDKS hub: a user with only the records page sees one card and fetches nothing', () => {
  granted.routes = new Set(['/human_resources/attendance/records']);
  renderWithProviders(<AttendanceHubPage />, { route: '/human_resources/attendance/' });

  expect(screen.getByRole('heading', { name: 'PDKS' })).toBeInTheDocument();
  expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Kayıtlar']);
  expect(document.getElementById('pending-overrides')).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});

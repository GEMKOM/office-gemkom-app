import { authedFetch } from '@legacy/authService.js';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { DesignHubPage } from './DesignHubPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));
vi.mock('@legacy/apis/accessControl.js', () => ({ hasRouteAccess: () => true }));

const fetchMock = vi.mocked(authedFetch);

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => {
    const count = new URL(String(url)).pathname.includes('drawing-releases') ? 2 : 5;
    return Promise.resolve(new Response(JSON.stringify({ count, next: null, previous: null, results: [] })));
  });
});

it('counts pending revision requests and release reviews with the legacy pages\' filters', async () => {
  renderWithProviders(<DesignHubPage />, { route: '/design/' });

  expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
    'Projeler',
    'Revizyon Talepleri',
    'Çizim İncelemesi',
  ]);
  await waitFor(() => expect(document.getElementById('pending-revisions')).toHaveTextContent('5'));
  expect(document.getElementById('pending-releases')).toHaveTextContent('2');

  const urls = fetchMock.mock.calls.map(([u]) => new URL(String(u))).map((u) => `${u.pathname}${u.search}`);
  expect(urls.sort()).toEqual([
    '/projects/department-tasks/?department=design&has_pending_revision=true&page_size=1',
    '/projects/drawing-releases/pending_approvals/?page_size=1',
  ]);
});

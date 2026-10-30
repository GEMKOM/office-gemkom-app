import { authedFetch } from '@legacy/authService.js';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { IsgHubPage } from './IsgHubPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));
vi.mock('@legacy/apis/accessControl.js', () => ({ hasRouteAccess: () => true }));

const fetchMock = vi.mocked(authedFetch);

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify({ total: 30, open: 7, in_progress: 4, overdue: 2, mine_open: 3 }), {
        status: 200,
      }),
    ),
  );
});

it('shows the open, overdue and assigned counters from one summary request, each linking to its list', async () => {
  renderWithProviders(<IsgHubPage />, { route: '/isg/' });

  expect(screen.getByRole('heading', { level: 1, name: 'İş Sağlığı ve Güvenliği' })).toBeInTheDocument();
  await waitFor(() => expect(document.getElementById('isg-open')).toHaveTextContent('7'));
  expect(document.getElementById('isg-overdue')).toHaveTextContent('2');
  expect(document.getElementById('isg-mine')).toHaveTextContent('3');
  expect(within(document.getElementById('isg-overdue')!).getByRole('link')).toHaveAttribute(
    'href',
    '/isg/issues?overdue=true',
  );
  expect(within(document.getElementById('isg-mine')!).getByRole('link')).toHaveAttribute(
    'href',
    '/isg/issues?mine=true',
  );

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(new URL(String(fetchMock.mock.calls[0]![0])).pathname).toBe('/isg/issues/summary/');
});

it('keeps the legacy cards, Bana Atananlar with its count', async () => {
  renderWithProviders(<IsgHubPage />, { route: '/isg/' });

  const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
  expect(titles).toEqual(['İSG Bildirimleri', 'Bana Atananlar']);
  const mine = screen.getByRole('heading', { level: 3, name: 'Bana Atananlar' }).closest('article')!;
  expect(within(mine).getByRole('link')).toHaveAttribute('href', '/isg/issues?mine=true');
  await waitFor(() => expect(mine).toHaveTextContent('3 açık aksiyon'));
});

it('shows "-" when the counters cannot be loaded', async () => {
  fetchMock.mockImplementation(() => Promise.resolve(new Response('{}', { status: 500 })));
  renderWithProviders(<IsgHubPage />, { route: '/isg/' });

  await waitFor(() => expect(document.getElementById('isg-open')).toHaveTextContent('-'));
});

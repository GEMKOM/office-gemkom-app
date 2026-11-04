import { authedFetch } from '@/auth/authService';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import {
  durationText,
  flattenOvertimeUsers,
  localToday,
  OvertimeUsersPage,
} from './OvertimeUsersPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}
const paths = () => fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname);

beforeEach(() => {
  fetchMock.mockReset();
});

it('flattens users into a row per entry', () => {
  const rows = flattenOvertimeUsers([
    {
      full_name: 'Ali Kaya',
      team_label: 'Kaynak',
      entries: [
        {
          job_no: '270-01',
          description: 'Kazan',
          request_start_at: '2026-11-02T15:00:00Z',
          request_end_at: '2026-11-02T18:30:00Z',
        },
        { job_no: '270-02', request_start_at: null, request_end_at: null },
      ],
    },
    { full_name: 'Veli Can' },
  ]);
  expect(rows.map((r) => [r.full_name, r.job_no, r.description])).toEqual([
    ['Ali Kaya', '270-01', 'Kazan'],
    ['Ali Kaya', '270-02', '-'],
    ['Veli Can', '-', '-'],
  ]);
  expect(durationText(rows[0]!)).toBe('3 saat 30 dakika');
  expect(durationText(rows[1]!)).toBe('-');
});

it('loads today by default and a ?date= from the URL', async () => {
  fetchMock.mockImplementation(() =>
    json([
      {
        full_name: 'Ali Kaya',
        team_label: 'Kaynak',
        entries: [{ job_no: '270-01', description: 'Kazan' }],
      },
    ]),
  );
  const { unmount } = renderWithProviders(<OvertimeUsersPage />, {
    route: '/general/overtime/users',
  });
  expect(await screen.findByText('Ali Kaya')).toBeInTheDocument();
  expect(paths()).toEqual([`/overtime/users-for-date/${localToday()}/`]);
  unmount();

  renderWithProviders(<OvertimeUsersPage />, { route: '/general/overtime/users?date=2026-10-15' });
  await waitFor(() => expect(paths()).toContain('/overtime/users-for-date/2026-10-15/'));
});

it('shows the empty message for an empty response', async () => {
  fetchMock.mockImplementation(() => json({}));
  renderWithProviders(<OvertimeUsersPage />, { route: '/general/overtime/users' });
  expect(
    await screen.findByText('Seçilen tarihte mesai yapacak kullanıcı bulunamadı'),
  ).toBeInTheDocument();
});

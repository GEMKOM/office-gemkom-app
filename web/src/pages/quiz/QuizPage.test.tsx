import { authedFetch } from '@/auth/authService';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { QuizPage } from './QuizPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));
const access = vi.hoisted(() => ({ manager: false }));
vi.mock('@/auth/accessControl', () => ({
  hasRouteAccess: (route: string) => route !== '/quiz/manage' || access.manager,
  hasSectionAccess: () => true,
}));

const fetchMock = vi.mocked(authedFetch);

const today = {
  date: '2026-11-11',
  status: 'finished',
  opens_at: '2026-11-11T07:00:00+03:00',
  closes_at: '2026-11-12T00:00:00+03:00',
  question_count: 5,
  seconds_per_question: 20,
  attempt: null,
  streak: 1,
  yesterday: { date: '2026-11-10', winners: [], review_available: false },
  review: { date: '2026-11-12', status: 'draft' },
};

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => {
    const path = new URL(String(url)).pathname;
    const body =
      path === '/quiz/today/'
        ? today
        : { period: 'week', start: '2026-11-09', end: '2026-11-15', players: 0, top: [], me: null };
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  });
});

it('gives approvers a way to the review page, pointing at the draft that waits', async () => {
  access.manager = true;
  renderWithProviders(<QuizPage />, { route: '/quiz' });
  const link = await screen.findByRole('link', { name: /Onay Bekliyor/ });
  expect(link).toHaveAttribute('href', '/quiz/manage?date=2026-11-12');
});

it('shows players no review button', async () => {
  access.manager = false;
  renderWithProviders(<QuizPage />, { route: '/quiz' });
  await screen.findByText('1 gün'); // the band has loaded today's data
  expect(screen.queryByRole('link', { name: /Onay|Quiz Onayı/ })).not.toBeInTheDocument();
});

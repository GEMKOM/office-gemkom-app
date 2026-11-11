import { authedFetch } from '@/auth/authService';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { AdminDay, QuizToday } from '@/api/quiz';
import { renderWithProviders } from '@/test/render';
import { ManagePage } from './ManagePage';
import { QuizHomeCard } from './QuizHomeCard';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const draft = (over: Partial<AdminDay> = {}): AdminDay => ({
  date: '2026-11-12',
  status: 'draft',
  editable: true,
  opens_at: '2026-11-12T07:00:00+03:00',
  generated_at: '2026-11-11T15:00:00+03:00',
  approved_by: null,
  approved_at: null,
  players: 0,
  error_detail: '',
  spares: { general: 1 },
  questions: [
    {
      id: 1,
      order: 1,
      category: 'data',
      category_label: 'Dünün Rakamı',
      kind: 'estimate',
      prompt: 'Dün CNC kesimde kaç kesim işi tamamlandı?',
      explanation: '',
      is_voided: false,
      voided_reason: '',
      unit: 'adet',
      correct_value: null,
      value_pending: true,
      metric: 'cnc_nestings',
      metric_label: 'CNC Kesim',
    },
    {
      id: 2,
      order: 2,
      category: 'general',
      category_label: 'Genel Kültür',
      kind: 'choice',
      prompt: 'Fe hangi elementtir?',
      explanation: 'Fe demirdir.',
      is_voided: false,
      voided_reason: '',
      choices: ['Flor', 'Demir', 'Fosfor', 'Fermiyum'],
      correct_index: 1,
    },
  ],
  ...over,
});

let routes: Record<string, (body: unknown) => unknown>;
const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  routes = {};
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const key = `${init?.method ?? 'GET'} ${new URL(String(url)).pathname}`;
    const handler = routes[key];
    return handler ? json(handler(init?.body ? JSON.parse(String(init.body)) : null)) : json({});
  });
});

const days = (day: AdminDay | null) => ({
  days: [{ date: '2026-11-12', is_today: false, day }],
});

it('shows every question with its answer, swaps one and approves the day', async () => {
  routes['GET /quiz/admin/days/'] = () => days(draft());
  routes['POST /quiz/admin/questions/2/replace/'] = () => ({
    date: '2026-11-12',
    question_id: 2,
    day: draft({
      spares: {},
      questions: [
        draft().questions[0]!,
        {
          ...draft().questions[1]!,
          prompt: 'Ankara hangi yıl başkent oldu?',
          choices: ['1920', '1923', '1921', '1925'],
        },
      ],
    }),
  });
  routes['POST /quiz/admin/days/2026-11-12/approve/'] = () => ({
    date: '2026-11-12',
    day: draft({
      status: 'ready',
      approved_by: 'Onay Veren',
      approved_at: '2026-11-11T15:30:00+03:00',
    }),
  });
  renderWithProviders(<ManagePage />, { route: '/quiz/manage?date=2026-11-12' });

  const card = (await screen.findByRole('heading', { name: 'Fe hangi elementtir?' })).closest(
    'section',
  )!;
  expect(within(card).getByText('Doğru cevap')).toBeInTheDocument();
  expect(within(card).getByText('Demir')).toBeInTheDocument();
  expect(within(card).getByText(/1 hazır yedek soru/)).toBeInTheDocument();
  expect(screen.getByText(/otomatik doldurulur/)).toBeInTheDocument();
  expect(screen.getByText('CNC Kesim')).toBeInTheDocument();

  fireEvent.click(within(card).getByRole('button', { name: /Başka soru öner/ }));
  expect(
    await screen.findByRole('heading', { name: 'Ankara hangi yıl başkent oldu?' }),
  ).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Fe hangi elementtir?' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Onayla ve Yayınla/ }));
  expect(await screen.findByText(/Onay Veren .* onayladı/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Onayla ve Yayınla/ })).not.toBeInTheDocument();
});

it('freezes the questions once players have started', async () => {
  routes['GET /quiz/admin/days/'] = () =>
    days(draft({ status: 'ready', editable: false, players: 12, approved_by: 'Onay Veren' }));
  renderWithProviders(<ManagePage />, { route: '/quiz/manage' });

  expect(await screen.findByText(/12 kişi oynamaya başladı/)).toBeInTheDocument();
  for (const button of screen.getAllByRole('button', { name: /Başka soru öner/ })) {
    expect(button).toBeDisabled();
  }
  expect(screen.queryByRole('button', { name: /Yeniden Oluştur/ })).not.toBeInTheDocument();
});

it('offers to draft a day that has none yet', async () => {
  routes['GET /quiz/admin/days/'] = () => days(null);
  routes['POST /quiz/admin/days/2026-11-12/generate/'] = (body) => {
    expect(body).toEqual({ force: false });
    return { date: '2026-11-12', status: 'ok', day: draft() };
  };
  renderWithProviders(<ManagePage />, { route: '/quiz/manage' });

  fireEvent.click(await screen.findByRole('button', { name: 'Taslak Oluştur' }));
  expect(await screen.findByRole('heading', { name: 'Fe hangi elementtir?' })).toBeInTheDocument();
});

const today = (over: Partial<QuizToday> = {}): QuizToday => ({
  date: '2026-11-11',
  status: 'finished',
  opens_at: '2026-11-11T07:00:00+03:00',
  closes_at: '2026-11-12T00:00:00+03:00',
  question_count: 5,
  seconds_per_question: 20,
  attempt: null,
  streak: 2,
  yesterday: { date: '2026-11-10', winners: [], review_available: false },
  review: null,
  ...over,
});

it('nudges approvers from the home card and tells players the quiz is being prepared', async () => {
  routes['GET /quiz/today/'] = () => today({ review: { date: '2026-11-12', status: 'draft' } });
  const { unmount } = renderWithProviders(<QuizHomeCard />);
  const nudge = await screen.findByTestId('quiz-review-card');
  expect(within(nudge).getByRole('link', { name: 'İncele' })).toHaveAttribute(
    'href',
    '/quiz/manage?date=2026-11-12',
  );
  unmount();

  routes['GET /quiz/today/'] = () => today({ status: 'preparing' });
  renderWithProviders(<QuizHomeCard />);
  expect(await screen.findByText('Günün Quizi hazırlanıyor')).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByTestId('quiz-review-card')).not.toBeInTheDocument());
});

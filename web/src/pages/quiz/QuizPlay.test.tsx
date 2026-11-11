import { authedFetch } from '@/auth/authService';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { QuizQuestion, QuizToday } from '@/api/quiz';
import { renderWithProviders } from '@/test/render';
import { quizKeys } from './queries';
import { QuizPlay } from './QuizPlay';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const today = (over: Partial<QuizToday> = {}): QuizToday => ({
  date: '2026-11-11',
  status: 'available',
  opens_at: '2026-11-11T07:00:00+03:00',
  closes_at: '2026-11-12T00:00:00+03:00',
  question_count: 5,
  seconds_per_question: 20,
  attempt: null,
  streak: 4,
  yesterday: { date: '2026-11-10', winners: [], review_available: true },
  ...over,
});

const choiceQ = (over: Partial<QuizQuestion> = {}): QuizQuestion => ({
  id: 11,
  number: 1,
  total: 2,
  category: 'general',
  category_label: 'Genel Kültür',
  kind: 'choice',
  prompt: 'Fe hangi elementtir?',
  time_limit_ms: 20000,
  remaining_ms: 20000,
  choices: ['Flor', 'Demir', 'Fosfor', 'Fermiyum'],
  ...over,
});

const estimateQ: QuizQuestion = {
  id: 12,
  number: 2,
  total: 2,
  category: 'data',
  category_label: 'Dünün Rakamı',
  kind: 'estimate',
  prompt: "Dün Neo'ya kaç soru soruldu?",
  time_limit_ms: 20000,
  remaining_ms: 20000,
  unit: 'soru',
};

const attempt = {
  started_at: '2026-11-11T09:00:00+03:00',
  finished_at: '2026-11-11T09:01:00+03:00',
  total_score: 275,
  total_ms: 9000,
  answered: 2,
  timed_out: 0,
  rank: 4,
  players: 23,
};

/** "METHOD /path" -> successive bodies. */
let queue: Record<string, unknown[]>;
const json = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

beforeEach(() => {
  queue = {};
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const key = `${init?.method ?? 'GET'} ${new URL(String(url)).pathname}`;
    const next = queue[key]?.shift();
    return json(next ?? {});
  });
});

const posted = () =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method === 'POST')
    .map(([url, init]) => [
      new URL(String(url)).pathname,
      init?.body ? JSON.parse(String(init.body)) : null,
    ]);

it('plays through without ever saying right or wrong, then shows the score', async () => {
  queue['POST /quiz/today/start/'] = [{ question: choiceQ(), done: false, attempt: null }];
  queue['POST /quiz/today/answer/'] = [
    { accepted: true, timed_out: false, question: estimateQ, done: false, attempt: null },
    { accepted: true, timed_out: false, question: null, done: true, attempt },
  ];
  renderWithProviders(<QuizPlay today={today()} />);

  fireEvent.click(screen.getByRole('button', { name: /Başla/ }));
  expect(await screen.findByRole('heading', { name: 'Fe hangi elementtir?' })).toBeInTheDocument();
  expect(screen.getByText('Soru 1 / 2')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Demir/ }));
  const input = await screen.findByLabelText('Tahmininiz');
  expect(screen.queryByText(/Doğru|Yanlış/)).not.toBeInTheDocument();

  fireEvent.change(input, { target: { value: '4a2' } });
  expect(input).toHaveValue('42');
  fireEvent.click(screen.getByRole('button', { name: 'Gönder' }));

  expect(await screen.findByTestId('quiz-summary')).toHaveTextContent('275');
  expect(screen.getByText('4. / 23')).toBeInTheDocument();
  expect(posted()).toEqual([
    ['/quiz/today/start/', null],
    ['/quiz/today/answer/', { question_id: 11, choice: 1 }],
    ['/quiz/today/answer/', { question_id: 12, value: '42' }],
  ]);
});

it('answers a choice question from the keyboard', async () => {
  queue['POST /quiz/today/start/'] = [{ question: choiceQ(), done: false, attempt: null }];
  queue['POST /quiz/today/answer/'] = [{ accepted: true, question: null, done: true, attempt }];
  renderWithProviders(<QuizPlay today={today()} />);
  fireEvent.click(screen.getByRole('button', { name: /Başla/ }));
  await screen.findByRole('heading', { name: 'Fe hangi elementtir?' });

  fireEvent.keyDown(window, { key: 'c' });
  await screen.findByTestId('quiz-summary');
  expect(posted()[1]).toEqual(['/quiz/today/answer/', { question_id: 11, choice: 2 }]);
});

it('locks the answers when time runs out and moves on after the grace', async () => {
  queue['POST /quiz/today/next/'] = [
    { question: choiceQ({ remaining_ms: 0 }), done: false, attempt: null },
    { question: { ...estimateQ, number: 2 }, done: false, attempt: null },
  ];
  renderWithProviders(<QuizPlay today={today({ status: 'in_progress' })} />);
  fireEvent.click(screen.getByRole('button', { name: 'Devam Et' }));

  expect(await screen.findByText('Süre doldu')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Demir/ })).toBeDisabled();
  expect(await screen.findByLabelText('Tahmininiz', {}, { timeout: 4000 })).toBeInTheDocument();
  expect(posted().map(([path]) => path)).toEqual(['/quiz/today/next/', '/quiz/today/next/']);
});

it('shows the opening hour before the quiz opens and the summary once played', () => {
  const { unmount } = renderWithProviders(<QuizPlay today={today({ status: 'not_open' })} />);
  expect(screen.getByRole('heading', { name: /açılır/ })).toBeInTheDocument();
  unmount();

  renderWithProviders(<QuizPlay today={today({ status: 'finished', attempt })} />);
  expect(screen.getByTestId('quiz-summary')).toHaveTextContent('275');
  expect(screen.getByRole('link', { name: 'Dünün Cevapları' })).toHaveAttribute(
    'href',
    '/quiz/review?date=2026-11-10',
  );
});

it('says when there is no quiz at the weekend', async () => {
  renderWithProviders(<QuizPlay today={today({ status: 'none', date: '2026-11-14' })} />);
  expect(screen.getByRole('heading', { name: 'Hafta sonu quiz yok' })).toBeInTheDocument();
  await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
});

it('marks the cached day as stale once a question is served, so nothing offers Başla again', async () => {
  queue['POST /quiz/today/start/'] = [{ question: choiceQ(), done: false, attempt: null }];
  const { queryClient } = renderWithProviders(<QuizPlay today={today()} />);
  queryClient.setQueryData(quizKeys.today, today());

  fireEvent.click(screen.getByRole('button', { name: /Başla/ }));
  await screen.findByRole('heading', { name: 'Fe hangi elementtir?' });
  expect(queryClient.getQueryState(quizKeys.today)?.isInvalidated).toBe(true);
});

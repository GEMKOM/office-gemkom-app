import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { NeoUsagePage } from './NeoUsagePage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const SUMMARY = {
  days: 30,
  questions: 1250,
  active_users: 7,
  total_cost_usd: '12.5',
  avg_latency_ms: 2300,
  feedback: { up: 5, down: 2 },
  outcomes: [
    { outcome: 'answered', count: 1240 },
    { outcome: 'declined_budget', count: 3 },
    { outcome: 'declined_permission', count: 1 },
  ],
  per_user: [{ conversation__user__username: 'ali.veli', messages: 10, cost_usd: '1.5', thumbs_down: 1 }],
  per_tool: [{ tool_name: 'search_job_orders', calls: 4, denied: 0, avg_duration_ms: 120.4 }],
  top_job_orders: [{ job_no: 'GS-10162', times_asked: 3 }],
};

const QUESTIONS = [
  {
    id: 1,
    created_at: '2026-10-30T10:00:00Z',
    user_full_name: 'Ali Veli',
    content: 'GS-10162 ne durumda?',
    conversation_id: 11,
  },
];

const SUMMARY_ROWS = [
  {
    id: 5,
    summary_date: '2026-10-30',
    status: 'ok',
    headline: 'Yoğun bir gün',
    model: 'claude',
    input_tokens: 1000,
    output_tokens: 200,
    cost_usd: '0.25',
    read_count: 4,
    avg_read_seconds: 40,
    expand_rate: 0.5,
    latency_ms: 1500,
    attempts: 1,
    triggered_by: 'schedule',
  },
];

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(body === undefined ? null : JSON.stringify(body), { status }));
}

type Call = { url: URL; method: string; body: unknown };
function calls(): Call[] {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: new URL(String(url)),
    method: init?.method ?? 'GET',
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
  }));
}
const callsTo = (path: string, method = 'GET') =>
  calls().filter((c) => c.method === method && c.url.pathname === path);
const params = (call: Call | undefined) => Object.fromEntries(call!.url.searchParams);

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}
const location = () => new URLSearchParams(screen.getByTestId('location').textContent ?? '');

function renderPage(route = '/it/neo') {
  return renderWithProviders(
    <ModalsProvider>
      <NeoUsagePage />
      <LocationProbe />
    </ModalsProvider>,
    { route },
  );
}

function respond(overrides: Record<string, () => Promise<Response>> = {}) {
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url)).pathname;
    const override = overrides[`${method} ${path}`];
    if (override) return override();
    if (path === '/assistant/analytics/summary/') return json(SUMMARY);
    if (path === '/assistant/analytics/questions/') {
      return json({ count: 60, next: null, previous: null, results: QUESTIONS });
    }
    if (path === '/assistant/analytics/daily-summaries/') return json({ results: SUMMARY_ROWS });
    if (path === '/assistant/analytics/conversations/11/') {
      return json({
        id: 11,
        user: 'ali.veli',
        title: 'İş emri sorusu',
        messages: [
          { id: 1, role: 'user', content: 'GS-10162 ne durumda?' },
          {
            id: 2,
            role: 'assistant',
            content: '**Üretimde**, teslim <b>yakın</b>.',
            outcome: 'answered',
            cost_usd: '0.0123',
            latency_ms: 2100,
            feedback: 1,
            tool_calls: [{ tool_name: 'get_job_order_brief', job_no: 'GS-10162', allowed: true }],
          },
        ],
      });
    }
    if (method === 'POST' && path === '/assistant/analytics/daily-summaries/5/regenerate/') {
      return json({ ...SUMMARY_ROWS[0], status: 'ok' });
    }
    return json({ detail: 'not mocked' }, 404);
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  respond();
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
  vi.spyOn(notify, 'show');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('renders the figures and every table from the analytics endpoints', async () => {
  renderPage();
  expect(screen.getByRole('heading', { name: 'Neo Kullanımı' })).toBeInTheDocument();
  expect(await screen.findByText('ali.veli')).toBeInTheDocument();
  expect(screen.getByText('İş emri arama')).toBeInTheDocument();
  expect(screen.getByText('GS-10162')).toBeInTheDocument();
  expect(await screen.findByText('Yoğun bir gün')).toBeInTheDocument();
  expect(await screen.findByText('GS-10162 ne durumda?')).toBeInTheDocument();

  const figure = (id: string) => document.getElementById(id)!;
  expect(within(figure('neo-stat-questions')).getByText('Soru (30 gün)')).toBeInTheDocument();
  expect(within(figure('neo-stat-questions')).getByText('1.250')).toBeInTheDocument();
  expect(within(figure('neo-stat-cost')).getByText('$12,50')).toBeInTheDocument();
  expect(within(figure('neo-stat-latency')).getByText('2.3 sn')).toBeInTheDocument();
  expect(within(figure('neo-stat-feedback')).getByText('Geri Bildirim · 4 red')).toBeInTheDocument();
  expect(within(figure('neo-stat-feedback')).getByText('5 👍 · 2 👎')).toBeInTheDocument();
  await waitFor(() => expect(within(figure('neo-stat-summary-cost')).getByText('$0,25')).toBeInTheDocument());
  expect(within(figure('neo-stat-summary-read')).getByText('40 sn')).toBeInTheDocument();

  // Legacy defaults: 30 days, page 1 of 25, no q.
  expect(params(callsTo('/assistant/analytics/summary/')[0])).toEqual({ days: '30' });
  expect(params(callsTo('/assistant/analytics/daily-summaries/')[0])).toEqual({ days: '30' });
  expect(params(callsTo('/assistant/analytics/questions/')[0])).toEqual({ days: '30', page: '1', page_size: '25' });
});

it('shows reach, answer-time percentiles, entry points and thumbs-down reasons', async () => {
  respond({
    'GET /assistant/analytics/summary/': () =>
      json({
        ...SUMMARY,
        engagement: {
          questions_per_user: 2.5,
          weekly: [
            { week_start: '2026-10-26', active_users: 1, questions: 2 },
            { week_start: '2026-11-02', active_users: 0, questions: 0 },
            { week_start: '2026-11-09', active_users: 4, questions: 8 },
          ],
          latency: { samples: 9, p50_ms: 8000, p90_ms: 31000 },
          feedback_reasons: [
            { reason: 'slow', count: 3 },
            { reason: 'none', count: 1 },
          ],
          truncated: 1,
          tool_limit_hits: 2,
          sources: [
            { source: 'page_button', count: 6 },
            { source: 'panel', count: 3 },
            { source: 'unknown', count: 1 },
          ],
          with_page_context: 6,
        },
      }),
  });
  renderPage();

  const figure = (id: string) => document.getElementById(id)!;
  await waitFor(() => expect(within(figure('neo-stat-latency')).getByText('8.0 / 31.0 sn')).toBeInTheDocument());
  expect(within(figure('neo-stat-latency')).getByText('Yanıt Süresi (medyan / %90)')).toBeInTheDocument();
  expect(within(figure('neo-stat-per-user')).getByText('2,5')).toBeInTheDocument();
  expect(within(figure('neo-stat-incomplete')).getByText('1 kesik · 2 limit')).toBeInTheDocument();

  // Newest week first, empty weeks kept.
  const weeks = screen.getByText('Haftalık Kullanım').closest('section, div[class]')!.parentElement!;
  const weekCells = within(weeks).getAllByText(/– \d+ (Eki|Kas)/).map((el) => el.textContent);
  expect(weekCells).toEqual(['9 Kas – 15 Kas', '2 Kas – 8 Kas', '26 Eki – 1 Kas']);

  expect(screen.getByText("Sayfadaki “Neo'ya sor”")).toBeInTheDocument();
  expect(screen.getByText('60%')).toBeInTheDocument();      // 6 of 10 questions
  expect(screen.getByText('Bilinmiyor (eski kayıt)')).toBeInTheDocument();
  expect(screen.getByText('6 soru açık kayıtla soruldu')).toBeInTheDocument();
  expect(screen.getByText('Çok yavaş')).toBeInTheDocument();
  expect(screen.getByText('75%')).toBeInTheDocument();      // 3 of 4 thumbs down
  expect(screen.getByText('Neden seçilmedi')).toBeInTheDocument();
});

it('filters go into the URL and reach every request with the legacy params', async () => {
  renderPage('/it/neo?page=3');
  await screen.findByText('GS-10162 ne durumda?');
  expect(params(callsTo('/assistant/analytics/questions/')[0]).page).toBe('3');

  fireEvent.change(screen.getByLabelText('Soru Ara'), { target: { value: 'maliyet' } });
  fireEvent.click(screen.getByRole('button', { name: 'Dönem' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Son 7 gün' }));

  await waitFor(() => {
    expect(location().get('q')).toBe('maliyet');
    expect(location().get('days')).toBe('7');
    // Back to page 1, which is the default and so leaves the URL.
    expect(location().has('page')).toBe(false);
  });
  await waitFor(() =>
    expect(params(callsTo('/assistant/analytics/questions/').at(-1))).toEqual({
      days: '7',
      page: '1',
      page_size: '25',
      q: 'maliyet',
    }),
  );
  expect(params(callsTo('/assistant/analytics/summary/').at(-1))).toEqual({ days: '7' });
  expect(params(callsTo('/assistant/analytics/daily-summaries/').at(-1))).toEqual({ days: '7' });
});

it('shows the permission notice instead of the page on 403, without a toast', async () => {
  respond({
    'GET /assistant/analytics/summary/': () => json({ detail: 'Bu işlem için yetkiniz yok.' }, 403),
    'GET /assistant/analytics/questions/': () => json({ detail: 'Bu işlem için yetkiniz yok.' }, 403),
    'GET /assistant/analytics/daily-summaries/': () => json({ detail: 'Bu işlem için yetkiniz yok.' }, 403),
  });
  renderPage();
  expect(await screen.findByText(/görüntüleme yetkiniz yok/)).toBeInTheDocument();
  expect(screen.queryByText('Soru Kayıtları')).toBeNull();
  expect(screen.queryByText('Günlük Özetler')).toBeNull();
  expect(document.getElementById('neo-stat-questions')).toBeNull();
  expect(notify.error).not.toHaveBeenCalled();
});

it('opens the transcript of a question with the rich text escaped', async () => {
  renderPage();
  fireEvent.click(await screen.findByText('GS-10162 ne durumda?'));
  const dialog = await screen.findByRole('dialog', { name: 'ali.veli — İş emri sorusu' });
  expect(within(dialog).getByText('Üretimde').tagName).toBe('STRONG');
  // Server text never becomes markup.
  expect(dialog.querySelector('b')).toBeNull();
  expect(within(dialog).getByText(/<b>yakın<\/b>/)).toBeInTheDocument();
  expect(within(dialog).getByText('Yanıtlandı')).toBeInTheDocument();
  expect(within(dialog).getByText('$0.0123')).toBeInTheDocument();
  expect(within(dialog).getByText('İş emri özeti (GS-10162)')).toBeInTheDocument();
});

it('regenerates a summary only after the confirm', async () => {
  renderPage();
  await screen.findByText('Yoğun bir gün');

  fireEvent.click(screen.getByRole('button', { name: 'Yeniden üret' }));
  const dialog = await screen.findByRole('dialog', { name: 'Özeti yeniden üret' });
  expect(within(dialog).getByText(/özeti yeniden üretilsin mi\?/)).toBeInTheDocument();
  expect(callsTo('/assistant/analytics/daily-summaries/5/regenerate/', 'POST')).toHaveLength(0);

  const before = callsTo('/assistant/analytics/daily-summaries/').length;
  fireEvent.click(within(dialog).getByRole('button', { name: 'Yeniden üret' }));

  await waitFor(() => expect(notify.show).toHaveBeenCalledWith('Özet yeniden üretildi', 'success'));
  const [post] = callsTo('/assistant/analytics/daily-summaries/5/regenerate/', 'POST');
  expect(post!.body).toEqual({ reset_reads: false });
  // The summaries reload afterwards.
  await waitFor(() => expect(callsTo('/assistant/analytics/daily-summaries/').length).toBeGreaterThan(before));
});

it('cancelling the confirm regenerates nothing', async () => {
  renderPage();
  await screen.findByText('Yoğun bir gün');
  fireEvent.click(screen.getByRole('button', { name: 'Yeniden üret' }));
  fireEvent.click(await screen.findByRole('button', { name: 'İptal' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(callsTo('/assistant/analytics/daily-summaries/5/regenerate/', 'POST')).toHaveLength(0);
});

it('runs today\'s summary and reports a failed run with its reason', async () => {
  respond({
    'POST /assistant/analytics/daily-summaries/run/': () => json({ status: 'failed', error: 'cost_cap' }, 500),
  });
  renderPage();
  await screen.findByText('Yoğun bir gün');
  fireEvent.click(screen.getByRole('button', { name: 'Bugünkü özeti üret' }));
  await waitFor(() => expect(notify.error).toHaveBeenCalled());
  expect(vi.mocked(notify.error).mock.calls[0]![0]).toMatchObject({ message: 'cost_cap', status: 500 });
  expect(callsTo('/assistant/analytics/daily-summaries/run/', 'POST')[0]!.body).toEqual({ force: false });
});

it('opens a daily summary with its ledger and body', async () => {
  respond({
    'GET /assistant/analytics/daily-summaries/5/': () =>
      json({
        ...SUMMARY_ROWS[0],
        payload: {
          headline: 'Yoğun bir gün',
          stats: { new_jobs_root: 2, topics_new: 1, comments: 4, ncr_created: 1 },
          highlights: [{ text: 'Yeni NCR açıldı', refs: [{ type: 'ncr', id: 'NCR-2026-0004' }] }],
          job_orders: { new: [{ job_no: 'GS-10200', title: 'Tank', kind: 'root' }] },
          areas: { kalite: { note: 'Kalite notu', lines: [{ text: 'Kontrol yapıldı', refs: [] }] } },
        },
        warnings: ['Bir uyarı'],
      }),
  });
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Görüntüle' }));
  const dialog = await screen.findByRole('dialog', { name: /^Günlük Özet · / });
  expect(within(dialog).getByText('Hazır')).toBeInTheDocument();
  expect(within(dialog).getByText('$0,25')).toBeInTheDocument();
  expect(within(dialog).getByText('2 iş emri')).toBeInTheDocument();
  expect(within(dialog).getByText('1 NCR')).toBeInTheDocument();
  expect(within(dialog).getByRole('link', { name: 'NCR-2026-0004' })).toHaveAttribute(
    'href',
    '/quality-control/ncrs/?ncr=NCR-2026-0004',
  );
  expect(within(dialog).getByRole('link', { name: 'GS-10200' })).toBeInTheDocument();
  expect(within(dialog).getByText('Kalite notu')).toBeInTheDocument();
  expect(within(dialog).getByText('Uyarılar (1)')).toBeInTheDocument();
});

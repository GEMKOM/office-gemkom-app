import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { FeedbackPage } from './FeedbackPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const STATS = { open_total: 6, awaiting_decision: 2, in_pipeline: 3, done_30d: 11, ai_cost_30d: '4.5' };
const REPORTS = [
  {
    id: 41,
    created_at: '2026-10-30T09:15:00Z',
    reporter_name: 'Ayşe Kaya',
    kind: 'bug',
    title: 'Kaydet butonu çalışmıyor',
    ai_summary: 'Teklif formunda kayıt hatası',
    priority: 'high',
    status: 'analyzed',
    github_issues: [],
  },
  {
    id: 42,
    created_at: '2026-10-31T09:15:00Z',
    reporter_username: 'mehmet',
    kind: 'feature',
    title: 'Excel çıktısı',
    status: 'in_review',
    github_issues: [{ repo: 'frontend', issue_number: 5, pr_number: 9 }],
  },
];
const DETAIL = {
  ...REPORTS[0],
  description: 'Teklif kaydedilirken hata veriyor.',
  page_url: 'https://ofis.gemkom.com.tr/sales/offers/',
  analyzed_at: '2026-10-30T09:20:00Z',
  ai_recommendation: 'implement',
  ai_analysis: { severity: 'major', acceptance_criteria: ['Kayıt başarılı olmalı'] },
};

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

type Call = { url: URL; method: string; body: unknown };
function calls(): Call[] {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: new URL(String(url)),
    method: init?.method ?? 'GET',
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
  }));
}
const listCalls = () => calls().filter((c) => c.method === 'GET' && c.url.pathname === '/feedback/reports/');

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/it/feedback/') {
  return renderWithProviders(
    <ModalsProvider>
      <FeedbackPage />
      <LocationProbe />
    </ModalsProvider>,
    { route },
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url)).pathname;
    if (path === '/feedback/reports/stats/') return json(STATS);
    if (path === '/feedback/reports/') return json({ count: 2, results: REPORTS });
    if (path === '/feedback/reports/41/' && method === 'GET') return json(DETAIL);
    if (method === 'POST') return json({ ok: true });
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('shows the stats and the reports', async () => {
  renderPage();
  expect(await screen.findByText('Kaydet butonu çalışmıyor')).toBeInTheDocument();
  expect(screen.getByText('Teklif formunda kayıt hatası')).toBeInTheDocument();
  expect(screen.getByText('mehmet')).toBeInTheDocument();
  expect(screen.getByLabelText('PR açık')).toBeInTheDocument();
  expect(within(document.getElementById('fb-open')!).getByText('6')).toBeInTheDocument();
  expect(within(document.getElementById('fb-cost')!).getByText('$4,50')).toBeInTheDocument();
  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({ all: '1' });
});

it('filters go to the URL and to the request', async () => {
  renderPage('/it/feedback/?status=queued');
  await screen.findByText('Kaydet butonu çalışmıyor');
  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({ all: '1', status: 'queued' });

  fireEvent.change(screen.getByLabelText('Ara'), { target: { value: 'excel' } });
  fireEvent.keyDown(screen.getByLabelText('Ara'), { key: 'Enter' });
  await waitFor(() => expect(screen.getByTestId('location').textContent).toContain('q=excel'));
  await waitFor(() =>
    expect(Object.fromEntries(listCalls().at(-1)!.url.searchParams)).toEqual({ all: '1', status: 'queued', q: 'excel' }),
  );
});

it('says so when the user lacks manage_feedback (403)', async () => {
  fetchMock.mockImplementation(() => json({ detail: 'Yetkiniz yok.' }, 403));
  renderPage();
  expect(await screen.findByText(/Geri bildirim yönetimi yetkiniz yok/)).toBeInTheDocument();
  expect(screen.queryByText('Bildirimler')).toBeNull();
  expect(notify.error).not.toHaveBeenCalled();
});

it('opens a report and queues it', async () => {
  renderPage();
  fireEvent.click(await screen.findByText('Kaydet butonu çalışmıyor'));
  const dialog = await screen.findByRole('dialog', { name: '#41 — Kaydet butonu çalışmıyor' });
  expect(await within(dialog).findByText('Teklif kaydedilirken hata veriyor.')).toBeInTheDocument();
  expect(within(dialog).getByText('Kayıt başarılı olmalı')).toBeInTheDocument();
  // analyzed: re-analyze, queue and dismiss; no sync.
  expect(within(dialog).getByRole('button', { name: 'Yeniden Analiz Et' })).toBeInTheDocument();
  expect(within(dialog).queryByRole('button', { name: 'GitHub Senkronize' })).toBeNull();

  fireEvent.click(within(dialog).getByRole('button', { name: 'Kuyruğa Al (Issue Aç)' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('İşlem tamamlandı.'));
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe('/feedback/reports/41/queue/');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

it('dismisses with the typed note, and not at all when cancelled', async () => {
  renderPage();
  fireEvent.click(await screen.findByText('Kaydet butonu çalışmıyor'));
  const dialog = await screen.findByRole('dialog', { name: '#41 — Kaydet butonu çalışmıyor' });
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Reddet' }));

  let prompt = await screen.findByRole('dialog', { name: 'Bildirimi Reddet' });
  fireEvent.click(within(prompt).getByRole('button', { name: 'İptal' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Bildirimi Reddet' })).toBeNull());
  expect(calls().some((c) => c.method === 'POST')).toBe(false);

  fireEvent.click(await screen.findByRole('button', { name: 'Reddet' }));
  prompt = await screen.findByRole('dialog', { name: 'Bildirimi Reddet' });
  fireEvent.change(within(prompt).getByLabelText(/Reddetme nedeni/), { target: { value: 'Yinelenen talep' } });
  fireEvent.click(within(prompt).getByRole('button', { name: 'Reddet' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('İşlem tamamlandı.'));
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe('/feedback/reports/41/dismiss/');
  expect(post.body).toEqual({ note: 'Yinelenen talep' });
});

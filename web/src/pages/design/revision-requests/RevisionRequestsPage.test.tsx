import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { RevisionRequestsPage } from './RevisionRequestsPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const TASKS = [
  {
    id: 11,
    job_order: 'JO-100',
    customer_name: 'Arçelik',
    title: 'Konveyör çizimi',
    description: 'Ana montaj',
    pending_revision_request: {
      release_id: 501,
      topic_id: 77,
      revision_code: 'R-A',
      revision_number: 2,
      reason: 'Ölçü hatası',
      requested_by: 'Ayşe Yılmaz',
      requested_at: '2026-10-01T09:30:00Z',
    },
  },
  {
    id: 12,
    job_order: 'JO-200',
    customer_name: null,
    title: 'Platform',
    pending_revision_request: {
      release_id: 502,
      revision_code: 'R-B',
      revision_number: 1,
      reason: 'x'.repeat(120),
    },
  },
];

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(body === undefined ? null : JSON.stringify(body), { status }),
  );
}

type Call = { url: URL; method: string; body: unknown };
function calls(): Call[] {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: new URL(String(url)),
    method: init?.method ?? 'GET',
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
  }));
}
const listCalls = () =>
  calls().filter((c) => c.method === 'GET' && c.url.pathname === '/projects/department-tasks/');

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/design/revision-requests/') {
  return renderWithProviders(
    <ModalsProvider>
      <RevisionRequestsPage />
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
    if (method === 'GET' && path === '/projects/department-tasks/') {
      return json({ count: 2, next: null, previous: null, results: TASKS });
    }
    if (method === 'POST') return json({ ok: true });
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('lists pending design revisions with the legacy request params', async () => {
  renderPage();
  expect(screen.getByRole('heading', { name: 'Revizyon Talepleri' })).toBeInTheDocument();
  expect(await screen.findByText('JO-100')).toBeInTheDocument();
  expect(screen.getByText('R-A (Rev. 2)')).toBeInTheDocument();
  expect(screen.getByText(`${'x'.repeat(100)}...`)).toBeInTheDocument();
  expect(
    within(document.getElementById('pending-revision-requests-count')!).getByText('2'),
  ).toBeInTheDocument();

  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    has_pending_revision: 'true',
    department: 'design',
    page: '1',
    page_size: '20',
    ordering: '-revision_request__requested_at',
  });
});

it('reads the page from the URL', async () => {
  renderPage('/design/revision-requests/?page=2&page_size=50');
  await screen.findByText('JO-100');
  expect(listCalls()[0]!.url.searchParams.get('page')).toBe('2');
  expect(listCalls()[0]!.url.searchParams.get('page_size')).toBe('50');
});

it('approves after the confirm, sending the topic id', async () => {
  renderPage();
  await screen.findByText('JO-100');

  fireEvent.click(screen.getAllByRole('button', { name: 'Onayla' })[0]!);
  expect(
    await screen.findByText('Bu revizyon talebini onaylamak istediğinizden emin misiniz?'),
  ).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'POST')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Evet, Onayla' }));

  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Revizyon talebi başarıyla onaylandı'),
  );
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe('/projects/drawing-releases/501/approve_revision/');
  expect(post.body).toEqual({ topic_id: 77 });
  await waitFor(() => expect(listCalls().length).toBeGreaterThan(1));
});

it('reject needs a reason and posts it without a topic when there is none', async () => {
  renderPage();
  await screen.findByText('JO-200');

  fireEvent.click(screen.getAllByRole('button', { name: 'Reddet' })[1]!);
  const dialog = await screen.findByRole('dialog', { name: 'Revizyon Talebini Reddet' });
  fireEvent.change(within(dialog).getByLabelText(/Reddetme Nedeni/), { target: { value: '   ' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Reddet' }));
  expect(await within(dialog).findByText('Reddetme nedeni gereklidir')).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'POST')).toBe(false);

  fireEvent.change(within(dialog).getByLabelText(/Reddetme Nedeni/), {
    target: { value: '  Gerek yok  ' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Reddet' }));
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Revizyon talebi başarıyla reddedildi'),
  );
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe('/projects/drawing-releases/502/reject_revision/');
  expect(post.body).toEqual({ reason: 'Gerek yok' });
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Revizyon Talebini Reddet' })).toBeNull(),
  );
});

it('the details modal shows the request and can approve from its footer', async () => {
  renderPage();
  await screen.findByText('JO-100');
  fireEvent.click(screen.getAllByRole('button', { name: 'Detaylar' })[0]!);
  const dialog = await screen.findByRole('dialog', { name: 'Revizyon Talebi Detayları' });
  expect(within(dialog).getByText('#11')).toBeInTheDocument();
  expect(within(dialog).getByText('Ana montaj')).toBeInTheDocument();
  expect(within(dialog).getByText('Ölçü hatası')).toBeInTheDocument();
  expect(within(dialog).getByText('Ayşe Yılmaz')).toBeInTheDocument();

  fireEvent.click(within(dialog).getByRole('button', { name: 'Onayla' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Evet, Onayla' }));
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Revizyon talebi başarıyla onaylandı'),
  );
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Revizyon Talebi Detayları' })).toBeNull(),
  );
});

it('shows the backend error when approving fails', async () => {
  fetchMock.mockImplementation((_url, init) =>
    init?.method === 'POST'
      ? json({ detail: 'Yetkiniz yok' }, 403)
      : json({ count: 2, next: null, previous: null, results: TASKS }),
  );
  renderPage();
  await screen.findByText('JO-100');
  fireEvent.click(screen.getAllByRole('button', { name: 'Onayla' })[0]!);
  fireEvent.click(await screen.findByRole('button', { name: 'Evet, Onayla' }));
  await waitFor(() =>
    expect(notify.error).toHaveBeenCalledWith(
      'Revizyon talebi onaylanırken hata oluştu: Yetkiniz yok',
    ),
  );
});

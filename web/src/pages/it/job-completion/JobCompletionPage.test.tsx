import { authedFetch } from '@legacy/authService.js';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { buildTree, computeVisible, withSelection } from './completionTree';
import { JobCompletionPage } from './JobCompletionPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const ROWS = [
  { job_no: '100', parent: null, title: 'Kazan', customer_name: 'İzmir Enerji', status: 'active', status_display: 'Aktif', completion_percentage: 40, task_count: 6, open_task_count: 4 },
  { job_no: '100-01', parent: '100', title: 'Gövde', customer_name: 'İzmir Enerji', status: 'active', status_display: 'Aktif', completion_percentage: 20, task_count: 3, open_task_count: 2 },
  { job_no: '100-02', parent: '100', title: 'Kapak', customer_name: 'İzmir Enerji', status: 'completed', status_display: 'Tamamlandı', completion_percentage: 100, task_count: 2, open_task_count: 0 },
  { job_no: '200', parent: null, title: 'Tank', customer_name: 'Bursa', status: 'cancelled', status_display: 'İptal Edildi', completion_percentage: 0, task_count: 1, open_task_count: 1 },
  { job_no: '300', parent: null, title: 'Silo', customer_name: 'Ankara', status: 'on_hold', status_display: 'Beklemede', completion_percentage: 10, task_count: 2, open_task_count: 1 },
];

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(body === undefined ? null : JSON.stringify(body), { status }));
}

function renderPage(route = '/it/job-completion/') {
  return renderWithProviders(
    <ModalsProvider>
      <JobCompletionPage />
    </ModalsProvider>,
    { route },
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const path = new URL(String(url)).pathname;
    if (path === '/projects/job-orders/completion-tree/') return json(ROWS);
    if (path === '/projects/job-orders/force-complete/' && init?.method === 'POST') {
      return json({
        completed_job_orders: ['100', '100-01'],
        tasks_completed: 6,
        tasks_by_department: { manufacturing: 4, design: 2 },
        overridden: { qc_missing_approval: 1 },
      });
    }
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'show');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('completion tree', () => {
  const tree = buildTree(ROWS);

  it('ticking a parent takes its open subtree; unticking a child drops the parent', () => {
    const parent = tree.nodes.get('100')!;
    const picked = withSelection(new Set(), parent, true);
    expect([...picked].sort()).toEqual(['100', '100-01']);
    const dropped = withSelection(picked, tree.nodes.get('100-01')!, false);
    expect([...dropped]).toEqual([]);
  });

  it('the open filter hides resolved jobs but keeps the ancestors and subtree of a match', () => {
    expect([...computeVisible(tree, '', 'open')].sort()).toEqual(['100', '100-01', '100-02', '300']);
    expect([...computeVisible(tree, 'gövde', 'all')].sort()).toEqual(['100', '100-01']);
    // Turkish casing: 'İzmir' matches 'izmir'.
    expect(computeVisible(tree, 'izmir', 'all').has('100')).toBe(true);
  });

  it('a parent cycle does not hang', () => {
    const cyclic = buildTree([
      { job_no: 'A', parent: 'B' },
      { job_no: 'B', parent: 'A' },
    ]);
    expect(cyclic.roots).toHaveLength(0);
    expect(computeVisible(cyclic, '', 'all').size).toBe(2);
  });
});

it('shows open roots collapsed; the caret expands a job', async () => {
  renderPage();
  expect(await screen.findByText('Kazan')).toBeInTheDocument();
  expect(screen.getByText('Silo')).toBeInTheDocument();
  // Cancelled jobs are filtered out by default; children start collapsed.
  expect(screen.queryByText('Tank')).toBeNull();
  expect(screen.queryByText('Gövde')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '100 genişlet' }));
  expect(screen.getByText('Gövde')).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: '100-02 seç' })).toBeDisabled();
});

it('the status pill comes from the URL', async () => {
  renderPage('/it/job-completion/?status=cancelled');
  expect(await screen.findByText('Tank')).toBeInTheDocument();
  expect(screen.queryByText('Silo')).toBeNull();
});

it('confirms and force-completes the ticked jobs', async () => {
  renderPage();
  fireEvent.click(await screen.findByRole('checkbox', { name: '100 seç' }));
  expect(screen.getByTestId('selection-summary')).toHaveTextContent('2 iş emri • 6 açık görev seçildi');
  // The subtree opened to show what was ticked.
  expect(screen.getByRole('checkbox', { name: '100-01 seç' })).toBeChecked();

  fireEvent.click(screen.getByRole('button', { name: 'Seçilenleri Tamamla' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('2 iş emri tamamlanacak')).toBeInTheDocument();
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Evet, Tamamla' }));

  await waitFor(() => expect(notify.show).toHaveBeenCalled());
  const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!;
  expect(JSON.parse(String(post[1]!.body))).toEqual({ job_nos: ['100', '100-01'], include_descendants: false });
  expect(vi.mocked(notify.show).mock.calls[0]![1]).toBe('success');
  await waitFor(() => expect(screen.getByTestId('selection-summary')).toHaveTextContent('Seçim yok'));
});

it('select-all ticks only the visible open jobs', async () => {
  renderPage();
  await screen.findByText('Kazan');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Filtreye uyan tüm iş emirlerini seç' }));
  // 100, 100-01 (visible as children of a match) and 300; 100-02 is completed.
  expect(screen.getByTestId('selection-summary')).toHaveTextContent('3 iş emri • 7 açık görev seçildi');
});

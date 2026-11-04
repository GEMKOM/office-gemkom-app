import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { ProjectTrackingPage } from './ProjectTrackingPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn(), hasPerm: vi.fn(() => false) }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));
const auth = vi.hoisted(() => ({ isAdmin: true, groups: [] as string[] }));
vi.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ isAdmin: auth.isAdmin, user: { user_groups: auth.groups } }),
}));

// The modals are tested on their own; here only what the page hands them.
vi.mock('./detail/JobOrderDetailModal', () => ({
  JobOrderDetailModal: ({ jobNo, topicId }: { jobNo: string | null; topicId?: number | null }) =>
    jobNo ? <div data-testid="detail">{`${jobNo}|${topicId ?? ''}`}</div> : null,
  TopicDetailModal: ({ topicId }: { topicId: number }) => <div data-testid="topic">{topicId}</div>,
  releaseReviewUrl: () => null,
}));
vi.mock('./meeting/MeetingView', () => ({
  MeetingView: ({ jobNo }: { jobNo: string | null }) => <div data-testid="meeting">{jobNo ?? 'first'}</div>,
}));
vi.mock('./task-planner/TaskPlannerModal', () => ({
  TaskPlannerModal: ({ jobNo }: { jobNo: string | null }) => (jobNo ? <div data-testid="task-planner">{jobNo}</div> : null),
}));
vi.mock('./weight-planner/WeightPlannerModal', () => ({
  WeightPlannerModal: ({ jobNo }: { jobNo: string | null }) =>
    jobNo ? <div data-testid="weight-planner">{jobNo}</div> : null,
}));

const fetchMock = vi.mocked(authedFetch);

const JOBS = [
  {
    job_no: '270',
    title: 'Kazan Projesi',
    status: 'active',
    customer_short_name: 'ACME',
    children_count: 1,
    department_task_count: 1,
    completion_percentage: 42.5,
    target_completion_date: '2099-01-10',
  },
  { job_no: '271', title: 'Taslak İş', status: 'draft', completion_percentage: 0 },
];
const CHILD = { job_no: '270-01', title: 'Alt İş', status: 'active', parent: '270' };

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
const listCalls = () => calls().filter((c) => c.method === 'GET' && c.url.pathname === '/projects/job-orders/');

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/projects/project-tracking/') {
  return renderWithProviders(
    <ModalsProvider>
      <ProjectTrackingPage />
      <LocationProbe />
    </ModalsProvider>,
    { route },
  );
}

beforeEach(() => {
  auth.isAdmin = true;
  auth.groups = [];
  localStorage.clear();
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url)).pathname;
    if (method === 'GET') {
      if (path === '/projects/job-orders/') return json({ count: 2, next: null, previous: null, results: JOBS });
      if (path === '/projects/job-orders/status_choices/') {
        return json([
          { value: 'active', label: 'Aktif' },
          { value: 'draft', label: 'Taslak' },
        ]);
      }
      if (path === '/projects/job-orders/production-plan-overview/') {
        return json({
          items: [{ job_no: '270', forecast: { verdict: 'late_risk', variance_wd: 3, projected_completion_date: '2099-01-20' } }],
        });
      }
      if (path === '/projects/job-orders/270/') return json({ ...JOBS[0], children: [CHILD] });
      if (path === '/projects/job-orders/270/department_tasks/') {
        return json([{ id: 5, title: 'Montaj', department: 'manufacturing', department_display: 'İmalat', status: 'pending' }]);
      }
      if (path === '/projects/job-orders/270/production-plan/') {
        return json({ tasks: [], nodes: [
            {
              job_no: '270-01',
              depth: 1,
              target_completion_date: '2099-03-01',
              summary: { projected_completion: '2099-02-01' },
            },
          ] });
      }
      if (path === '/projects/customers/') return json({ count: 0, results: [] });
    }
    if (method === 'POST' && path === '/projects/job-orders/271/start/') {
      return json({ status: 'success', message: 'İş emri başlatıldı' });
    }
    if (method === 'POST' && path === '/projects/job-orders/') return json({ job_no: '270-02' }, 201);
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('lists root job orders with stats, forecast and the legacy request', async () => {
  renderPage();
  expect(screen.getByRole('heading', { name: 'Proje Takibi' })).toBeInTheDocument();
  expect(await screen.findByRole('button', { name: '270' })).toBeInTheDocument();
  expect(screen.getByText('Kazan Projesi')).toBeInTheDocument();
  expect(screen.getByText('ACME')).toBeInTheDocument();
  expect(screen.getByText('42.5%')).toBeInTheDocument();
  expect(within(document.getElementById('total-job-orders-count')!).getByText('2')).toBeInTheDocument();
  expect(within(document.getElementById('active-job-orders-count')!).getByText('1')).toBeInTheDocument();
  expect(await screen.findByText('+3 iş günü geç')).toBeInTheDocument();

  const [first] = listCalls();
  expect(Object.fromEntries(first!.url.searchParams)).toEqual({
    root_only: 'true',
    ordering: 'job_no',
    page: '1',
    page_size: '100',
  });
});

it('"Tüm İşler" drops root_only and is kept in the URL', async () => {
  renderPage('/projects/project-tracking/?show_all=true&search=kazan');
  await screen.findByRole('button', { name: '270' });
  const params = Object.fromEntries(listCalls().at(-1)!.url.searchParams);
  expect(params.root_only).toBeUndefined();
  expect(params.search).toBe('kazan');
});

it('expands sub-jobs and department tasks under their job', async () => {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Alt işleri göster' }));
  expect(await screen.findByRole('button', { name: '270-01' })).toBeInTheDocument();
  // The sub-job reads its projection from the expanded job's plan.
  expect(await screen.findByText('Hedef içinde')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Departman görevlerini göster' }));
  expect(await screen.findByText('Montaj')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'İmalat' })).toHaveAttribute('href', '/manufacturing/projects/?task=5');
  const taskCall = calls().find((c) => c.url.pathname === '/projects/job-orders/270/department_tasks/');
  expect(taskCall!.url.searchParams.get('main_only')).toBe('true');
  expect(taskCall!.url.searchParams.get('ordering')).toBe('sequence');
});

it('opens the detail modal from the job number and keeps it in the URL', async () => {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: '270' }));
  expect(await screen.findByTestId('detail')).toHaveTextContent('270|');
  expect(screen.getByTestId('location')).toHaveTextContent('job_no=270');
});

it('opens a deep-linked job order with its topic', async () => {
  renderPage('/projects/project-tracking/?job_no=270&topic_id=12');
  expect(await screen.findByTestId('detail')).toHaveTextContent('270|12');
});

it('starts a draft job after confirming', async () => {
  renderPage();
  await screen.findByRole('button', { name: '271' });
  fireEvent.click(screen.getByRole('button', { name: 'Başlat' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('İş emri 271 başlatılsın mı?')).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Başlat' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('İş emri başlatıldı'));
  expect(calls().some((c) => c.method === 'POST' && c.url.pathname === '/projects/job-orders/271/start/')).toBe(true);
});

it('hides the actions with "Aksiyonları Gizle" and remembers it', async () => {
  renderPage();
  await screen.findByRole('button', { name: '271' });
  expect(screen.getByRole('button', { name: 'Başlat' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Aksiyonları Gizle' }));
  expect(screen.queryByRole('button', { name: 'Başlat' })).not.toBeInTheDocument();
  expect(localStorage.getItem('hideJobOrderActions')).toBe('true');
});

it('creates a child job order with the parent prefix and next extension', async () => {
  renderPage();
  await screen.findByRole('button', { name: '270' });
  fireEvent.click(screen.getAllByRole('button', { name: 'Diğer İşlemler' })[0]!);
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Alt İş Oluştur' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('270-')).toBeInTheDocument();
  expect(within(dialog).getByLabelText(/İş Emri No/)).toHaveValue('02');
  fireEvent.change(within(dialog).getByLabelText(/Başlık/), { target: { value: 'Yeni Alt İş' } });
  fireEvent.change(within(dialog).getByLabelText(/Genel Gider Oranı/), { target: { value: '0.1500' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /Kaydet/ }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('İş emri başarıyla oluşturuldu'));
  const post = calls().find((c) => c.method === 'POST' && c.url.pathname === '/projects/job-orders/');
  expect(post!.body).toMatchObject({
    parent: '270',
    job_no: '270-02',
    title: 'Yeni Alt İş',
    quantity: 1,
    general_expenses_rate: '0.1500',
    target_completion_date: '2099-01-10',
  });
  expect(post!.body).not.toHaveProperty('customer');
});

it('hides planning actions from users outside planlama', async () => {
  auth.isAdmin = false;
  renderPage();
  await screen.findByRole('button', { name: '270' });
  fireEvent.click(screen.getAllByRole('button', { name: 'Diğer İşlemler' })[0]!);
  await screen.findByRole('menu');
  expect(screen.queryByRole('menuitem', { name: 'Görev Ekle' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Beklet' })).not.toBeInTheDocument();
});

it('opens Sunum Modu from the header', async () => {
  renderPage();
  fireEvent.click(screen.getByRole('button', { name: 'Sunum Modu' }));
  expect(await screen.findByTestId('meeting')).toHaveTextContent('first');
  expect(screen.getByTestId('location')).toHaveTextContent('meeting=1');
});

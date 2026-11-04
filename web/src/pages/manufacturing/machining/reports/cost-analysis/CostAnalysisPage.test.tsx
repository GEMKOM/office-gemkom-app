import { authedFetch } from '@/auth/authService';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { CostAnalysisPage, costLeaders, toTableRow } from './CostAnalysisPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const JOBS = [
  {
    job_no: '225-01',
    hours: { weekday_work: 10, after_hours: 2, sunday: 0 },
    costs: { weekday_work: 300, after_hours: 90, sunday: 0 },
    total_cost: 390,
  },
  {
    job_no: '225-02',
    hours: { weekday_work: 1, after_hours: 0, sunday: 1 },
    costs: { weekday_work: 40, after_hours: 0, sunday: 120 },
    total_cost: 160,
  },
];

const USERS = [
  {
    user: 'ahmet.y',
    hours: { weekday_work: 8, after_hours: 2, sunday: 0 },
    costs: { weekday_work: 240, after_hours: 90, sunday: 0 },
    total_cost: 330,
    issues: [{ key: 'TI-5', status: 'completed' }],
  },
];

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const urls = () => fetchMock.mock.calls.map(([url]) => new URL(String(url)));

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => {
    const path = new URL(String(url)).pathname;
    if (path === '/machining/reports/job-costs/') return json({ count: 2, results: JOBS });
    if (path === '/machining/reports/job-costs/225-01') return json({ results: USERS });
    return json({ detail: 'not mocked' }, 404);
  });
});

it('lists every job with its costs and the leader cards', async () => {
  renderWithProviders(<CostAnalysisPage />, {
    route: '/manufacturing/machining/reports/cost-analysis/',
  });
  expect(await screen.findByRole('cell', { name: '225-02' })).toBeInTheDocument();
  expect(urls()[0]!.search).toBe('');

  const card = document.getElementById('most-expensive-per-hour')!;
  // 160 € over 2 hours beats 390 € over 12.
  expect(within(card).getByText('225-02')).toBeInTheDocument();
  expect(within(card).getByText(/80,00.*\/saat/)).toBeInTheDocument();
  expect(
    within(document.getElementById('most-hours-job')!).getByText('225-01'),
  ).toBeInTheDocument();
});

it('the job filter goes to the request', async () => {
  renderWithProviders(<CostAnalysisPage />, {
    route: '/manufacturing/machining/reports/cost-analysis/?job_no=225-01',
  });
  await screen.findByRole('cell', { name: '225-01' });
  expect(urls()[0]!.searchParams.get('job_no')).toBe('225-01');
});

it('a row opens the per-user details of that job', async () => {
  renderWithProviders(<CostAnalysisPage />, {
    route: '/manufacturing/machining/reports/cost-analysis/',
  });
  fireEvent.click((await screen.findAllByRole('button', { name: 'Detaylar' }))[0]!);
  const dialog = await screen.findByRole('dialog', { name: '225-01 - Kullanıcı Detayları' });
  expect(await within(dialog).findByText('ahmet.y')).toBeInTheDocument();
  const link = within(dialog).getByRole('link', { name: 'TI-5' });
  expect(link).toHaveAttribute('href', '/manufacturing/machining/tasks/list/?task=TI-5');
  await waitFor(() =>
    expect(urls().some((u) => u.pathname === '/machining/reports/job-costs/225-01')).toBe(true),
  );
});

it('computes the leaders like updateStatistics', () => {
  const leaders = costLeaders(JOBS.map(toTableRow))!;
  expect(leaders.map((l) => l.job_no)).toEqual(['225-01', '225-02', '225-02', '225-01']);
  expect(costLeaders([])).toBeNull();
});

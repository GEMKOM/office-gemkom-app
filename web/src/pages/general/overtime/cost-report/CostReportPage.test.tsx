import { authedFetch } from '@legacy/authService.js';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { CostReport } from '@/api/general/overtime';
import { renderWithProviders } from '@/test/render';
import { buildJobOptions } from '../shared/jobFilter';
import { bucketRows, buildJobTree, jobDetail, jobParentKey } from './costReport';
import { costReportDefaults, costReportParams, CostReportPage } from './CostReportPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);
// Mantine modals and selects are slow in jsdom when the suite runs in parallel.
vi.setConfig({ testTimeout: 20_000 });

const cost = (total: number) => ({
  cost_eur: String(total),
  wage_cost_eur: String(total * 0.6),
  employer_cost_eur: String(total * 0.4),
});

const REPORT = {
  summary: {
    total_cost_eur: '1000',
    total_wage_cost_eur: '600',
    total_employer_cost_eur: '400',
    employer_overhead_rate: '0.65',
    total_hours: '20',
    avg_cost_per_hour_eur: '50',
    user_count: 3,
    request_count: 2,
    estimated_wage_entry_count: 1,
    unpriced_hours: '0',
  },
  by_bucket: {
    weekday: { hours: '12', ...cost(600) },
    sunday: { hours: '8', ...cost(400) },
  },
  by_team: [{ team: 'machining', request_count: 2, entry_count: 4, hours: '20', ...cost(1000) }],
  by_user: [
    {
      user_id: 1,
      full_name: 'Ali Kaya',
      estimated_wage: true,
      request_count: 2,
      entry_count: 2,
      hours: '12',
      ...cost(600),
    },
    {
      user_id: 2,
      full_name: 'Veli Can',
      request_count: 1,
      entry_count: 2,
      hours: '8',
      ...cost(400),
    },
  ],
  by_job: [
    { job_no: '272-01-01', request_count: 1, entry_count: 1, hours: '6', ...cost(300) },
    { job_no: '272-01-02', request_count: 2, entry_count: 2, hours: '10', ...cost(500) },
    { job_no: '300-05', request_count: 1, entry_count: 1, hours: '4', ...cost(200) },
  ],
  requests: [
    {
      id: 11,
      team: 'machining',
      requester_name: 'Usta Bir',
      start_at: '2026-10-05T17:00:00Z',
      end_at: '2026-10-05T23:00:00Z',
      counted_start_at: '2026-10-05T17:00:00Z',
      counted_end_at: '2026-10-05T23:00:00Z',
      duration_hours: '6',
      entry_count: 2,
      hours: '12',
      status: 'approved',
      reason: 'Acil sipariş',
      buckets: { weekday: { hours: '12', ...cost(600) } },
      ...cost(600),
      entries: [
        {
          full_name: 'Ali Kaya',
          job_no: '272-01-01',
          hours: '6',
          status: 'approved',
          estimated_wage: true,
          ...cost(300),
        },
        {
          full_name: 'Veli Can',
          job_no: '272-01-02',
          hours: '6',
          status: 'approved',
          ...cost(300),
        },
      ],
    },
    {
      id: 12,
      team: 'rollingmill',
      requester_name: 'Usta İki',
      counted_start_at: '2026-10-11T08:00:00Z',
      counted_end_at: '2026-10-11T16:00:00Z',
      entry_count: 2,
      hours: '8',
      status: 'submitted',
      is_partial: true,
      ...cost(400),
      entries: [
        { full_name: 'Veli Can', job_no: '272-01-02', hours: '4', status: 'pending', ...cost(200) },
        { full_name: 'Ayşe Er', job_no: '300-05', hours: '4', status: 'pending', ...cost(200) },
      ],
    },
  ],
};

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}
const reportCalls = () =>
  fetchMock.mock.calls
    .map(([url]) => new URL(String(url)))
    .filter((u) => u.pathname === '/overtime/requests/cost_report/');

let reportResponse: () => Promise<Response> = () => json(REPORT);

beforeEach(() => {
  fetchMock.mockReset();
  reportResponse = () => json(REPORT);
  fetchMock.mockImplementation((url) => {
    const path = new URL(String(url)).pathname;
    if (path === '/overtime/requests/cost_report/') return reportResponse();
    if (path === '/users/dropdown/')
      return json([{ id: 1, username: 'ali', full_name: 'Ali Kaya' }]);
    if (path === '/projects/job-orders/dropdown/')
      return json([
        { job_no: '272-01', title: 'Hadde', customer_name: 'ACME' },
        { job_no: '272-02', title: 'Fırın', customer_name: 'ACME' },
        { job_no: '300', title: 'Tek', customer_name: null },
      ]);
    return json({ detail: 'not mocked' }, 404);
  });
});

const asReport = (r: unknown) => r as CostReport;

it('rolls the job breakdown up to two segments; requests count once per parent', () => {
  expect(jobParentKey(' 272-01-03 ')).toBe('272-01');
  const tree = buildJobTree(asReport(REPORT));
  expect(
    tree.map((p) => [p.key, p.cost_eur, p.request_count, p.entry_count, p.expandable]),
  ).toEqual([
    ['272-01', 800, 2, 3, true],
    ['300-05', 200, 1, 1, false],
  ]);
  expect(tree[0]!.children.map((c) => c.job_no)).toEqual(['272-01-02', '272-01-01']);
  expect(tree[0]!.share).toBe(80);

  const parent = jobDetail(asReport(REPORT), '272-01', tree[0]!);
  expect(parent.rows).toHaveLength(3);
  expect(parent.people.map((p) => [p.name, p.count])).toEqual([
    ['Veli Can', 2],
    ['Ali Kaya', 1],
  ]);
  // A child line is exact.
  expect(jobDetail(asReport(REPORT), '272-01-01', null).rows).toHaveLength(1);
});

it('keeps buckets with hours or cost, in the fixed order', () => {
  expect(bucketRows(REPORT.by_bucket, '1000').map((b) => [b.key, b.share])).toEqual([
    ['weekday', 60],
    ['sunday', 40],
  ]);
});

it('lists each project, then its top-level job orders', () => {
  expect(
    buildJobOptions([
      { job_no: '272-01', title: 'Hadde', customer_name: 'ACME' },
      { job_no: '272-02', title: '', customer_name: 'ACME' },
      { job_no: '300', title: 'Tek' },
    ]),
  ).toEqual([
    { value: '272', label: '272 — tüm işler (2 iş emri) · ACME' },
    { value: '272-01', label: '272-01 - Hadde · ACME' },
    { value: '272-02', label: '272-02 - ACME' },
    { value: '300', label: '300 - Tek' },
  ]);
});

it('sends this month and approved by default; picks go out one by one', () => {
  const defaults = costReportDefaults(new Date(2026, 10, 17));
  expect(costReportParams(defaults)).toEqual({
    start_date: '2026-11-01',
    end_date: '2026-11-17',
    status: 'approved',
  });
  expect(
    costReportParams({
      ...defaults,
      status: '',
      team: 'welding',
      job_no: ['272', '300-05'],
      user: '4',
    }),
  ).toEqual({
    start_date: '2026-11-01',
    end_date: '2026-11-17',
    status: 'approved',
    team: 'welding',
    job_no: ['272', '300-05'],
    user: '4',
  });
});

it('renders the figures, the notice and every table; filters reach the request', async () => {
  renderWithProviders(<CostReportPage />, {
    route:
      '/general/overtime/cost-report?start_date=2026-10-01&end_date=2026-10-31&status=approved%2Csubmitted&team=machining&job_no=272&job_no=300-05&user=1',
  });
  expect(await screen.findByText('Usta Bir')).toBeInTheDocument();

  const params = reportCalls()[0]!.searchParams;
  expect(params.get('start_date')).toBe('2026-10-01');
  expect(params.get('end_date')).toBe('2026-10-31');
  expect(params.get('status')).toBe('approved,submitted');
  expect(params.get('team')).toBe('machining');
  expect(params.getAll('job_no')).toEqual(['272', '300-05']);
  expect(params.get('user')).toBe('1');
  expect(params.has('group_by')).toBe(false);

  // Figures on the band.
  expect(screen.getByText('Toplam Mesai Maliyeti (SGK dahil)')).toBeInTheDocument();
  expect(screen.getByText('SGK / İşveren Payı (%65)')).toBeInTheDocument();
  expect(screen.getAllByText('€1.000,00').length).toBeGreaterThan(0);
  expect(screen.getByText('Maliyet doğruluğu uyarısı')).toBeInTheDocument();

  // Buckets, breakdown by team, request list.
  expect(screen.getByText('Hafta içi (1.5x)')).toBeInTheDocument();
  expect(screen.getByText('Pazar (2x)')).toBeInTheDocument();
  expect(screen.queryByText('Cumartesi (1.5x)')).not.toBeInTheDocument();
  expect(screen.getByText('Ekip Bazında Dağılım')).toBeInTheDocument();
  expect(screen.getByText('Onay Bekliyor')).toBeInTheDocument();
  expect(screen.getByText('kısmi')).toBeInTheDocument();
  expect(screen.getAllByText('Haddehane').length).toBeGreaterThan(0);
});

it('groups the job tree under its parents with the parent sums; links open the detail', async () => {
  renderWithProviders(<CostReportPage />, { route: '/general/overtime/cost-report' });
  await screen.findByText('Usta Bir');

  const headers = document.querySelectorAll('tr[data-group-row="header"]');
  expect(headers).toHaveLength(2);
  const first = headers[0] as HTMLElement;
  expect(within(first).getByText('272-01')).toBeInTheDocument();
  expect(within(first).getByText('2 alt iş')).toBeInTheDocument();
  expect(within(first).getByText('€800,00')).toBeInTheDocument();
  expect(within(first).getByText('16 saat')).toBeInTheDocument();
  // The single-line parent has no badge.
  expect(within(headers[1] as HTMLElement).queryByText(/alt iş/)).not.toBeInTheDocument();

  // Two parents (≤ 5): the expandable one starts open; the lone one has no
  // toggle and stays closed, as legacy.
  expect(screen.getByText('272-01-02')).toBeInTheDocument();
  expect(first.querySelector('[aria-expanded]')).toHaveAttribute('aria-expanded', 'true');
  expect((headers[1] as HTMLElement).querySelector('[aria-expanded]')).toBeNull();

  // Collapsing hides the sub-jobs.
  fireEvent.click(within(first).getByRole('button', { name: 'Grubu daralt' }));
  await waitFor(() => expect(screen.queryByText('272-01-02')).not.toBeInTheDocument());

  // The parent link opens the detail and does not toggle the group.
  fireEvent.click(within(first).getByText('272-01'));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('İş Emri 272-01 — Mesai Detayı')).toBeInTheDocument();
  expect(within(dialog).getByText('Alt İş Emirleri')).toBeInTheDocument();
  expect(within(dialog).getByText('Mesai Kayıtları')).toBeInTheDocument();
  expect(first.querySelector('[aria-expanded]')).toHaveAttribute('aria-expanded', 'false');
});

it('switches the breakdown with Dağılım', async () => {
  renderWithProviders(<CostReportPage />, {
    route: '/general/overtime/cost-report?group_by=by_user',
  });
  expect(await screen.findByText('Kişi Bazında Dağılım')).toBeInTheDocument();
  // by_user does not go to the backend.
  expect(reportCalls()[0]!.searchParams.has('group_by')).toBe(false);
  expect(screen.getByRole('columnheader', { name: /Personel/ })).toBeInTheDocument();
});

it('Detay opens the request cost from the loaded report', async () => {
  renderWithProviders(<CostReportPage />, { route: '/general/overtime/cost-report' });
  await screen.findByText('Usta Bir');
  fireEvent.click(screen.getAllByRole('button', { name: 'Detay' })[0]!);
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText(/Maliyet Detayı/)).toBeInTheDocument();
  expect(within(dialog).getByText('Kişi Bazında Maliyet')).toBeInTheDocument();
  expect(within(dialog).getByText('Ücret Katsayısı Dağılımı')).toBeInTheDocument();
  // Only one request call: the modal reads the report payload.
  expect(reportCalls()).toHaveLength(1);
});

it('shows the permission notice on 403', async () => {
  reportResponse = () => json({ detail: 'forbidden' }, 403);
  renderWithProviders(<CostReportPage />, { route: '/general/overtime/cost-report' });
  expect(await screen.findByText(/Bu raporu görüntüleme yetkiniz yok/)).toBeInTheDocument();
  expect(screen.getByText('Seçilen dönemde mesai talebi bulunamadı')).toBeInTheDocument();
  expect(screen.queryByText('Toplam Mesai Saati')).not.toBeInTheDocument();
});

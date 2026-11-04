import { authedFetch } from '@/auth/authService';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { CostAnalysisPage } from './CostAnalysisPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const JOBS = [
  {
    job_no: '010-24',
    hours: { regular: 10, after_hours: 2, holiday: 0 },
    costs: { regular: 100, after_hours: 40, holiday: 0 },
    total_cost: 140,
  },
  {
    job_no: '002-24',
    hours: { regular: 4, after_hours: 0, holiday: 4 },
    costs: { regular: 40, after_hours: 0, holiday: 160 },
    total_cost: 200,
  },
];

const DETAIL = {
  job_no: '010-24',
  summary: { total_hours: 12, breakdown_by_type: { regular: 10, after_hours: 2 } },
  entries: [
    {
      id: 1,
      employee_id: 7,
      employee_full_name: 'Ali Kaynak',
      overtime_type: 'regular',
      hours: '6',
      cost: '60',
      issue_key: 'W-1',
    },
    {
      id: 2,
      employee_id: 7,
      employee_full_name: 'Ali Kaynak',
      overtime_type: 'after_hours',
      hours: '2',
      cost: '40',
      issue_key: 'W-1',
    },
    {
      id: 3,
      employee_id: 8,
      employee_full_name: 'Veli Usta',
      overtime_type: 'regular',
      hours: '4',
      cost: '40',
    },
  ],
};

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const urls = () => fetchMock.mock.calls.map(([url]) => new URL(String(url)));
const totalsCalls = () => urls().filter((u) => u.pathname === '/welding/reports/job-costs/');
const detailCalls = () => urls().filter((u) => u.pathname === '/welding/reports/job-entries/');

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/manufacturing/welding/reports/cost-analysis/') {
  return renderWithProviders(
    <>
      <CostAnalysisPage />
      <LocationProbe />
    </>,
    { route },
  );
}

/** İş No cells in table order. */
function jobOrder(): string[] {
  const table = screen.getAllByRole('table')[0]!;
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0]!.textContent ?? '');
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => {
    const path = new URL(String(url)).pathname;
    if (path === '/welding/reports/job-costs/') return json({ count: 2, results: JOBS });
    if (path === '/welding/reports/job-entries/') return json(DETAIL);
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('loads every job once, sorts by İş No and shows the leaders', async () => {
  renderPage();
  expect(screen.getByText('İş Maliyeti Raporu', { selector: 'h1' })).toBeInTheDocument();
  await screen.findAllByText('010-24');

  // No ordering or paging is sent: the page sorts the loaded rows (numeric-aware).
  expect(Object.fromEntries(totalsCalls()[0]!.searchParams)).toEqual({});
  expect(jobOrder()).toEqual(['002-24', '010-24']);

  const card = (id: string) => within(document.getElementById(id)!);
  expect(card('most-expensive-job').getByText('002-24')).toBeInTheDocument();
  expect(card('most-expensive-per-hour').getByText('002-24')).toBeInTheDocument(); // 200 / 8 h
  expect(card('most-overtime-cost').getByText('002-24')).toBeInTheDocument(); // 160 vs 40
  expect(card('most-hours-job').getByText('010-24')).toBeInTheDocument(); // 12 h vs 8 h
  expect(card('most-hours-job').getByText('12,0 saat')).toBeInTheDocument();
});

it('sorting a column reorders the loaded rows without a new request', async () => {
  renderPage();
  await screen.findAllByText('010-24');

  fireEvent.click(screen.getByRole('button', { name: 'Toplam Maliyet' }));
  expect(jobOrder()).toEqual(['010-24', '002-24']);
  fireEvent.click(screen.getByRole('button', { name: 'Toplam Maliyet' }));
  expect(jobOrder()).toEqual(['002-24', '010-24']);
  expect(totalsCalls()).toHaveLength(1);
});

it('sends the URL filters and writes a typed İş No back to the URL', async () => {
  renderPage(
    '/manufacturing/welding/reports/cost-analysis/?date_after=2026-10-01&date_before=2026-10-31',
  );
  await screen.findAllByText('010-24');
  expect(Object.fromEntries(totalsCalls()[0]!.searchParams)).toEqual({
    date_after: '2026-10-01',
    date_before: '2026-10-31',
  });

  fireEvent.change(screen.getByLabelText('İş No'), { target: { value: '010' } });
  fireEvent.keyDown(screen.getByLabelText('İş No'), { key: 'Enter' });

  await waitFor(() => {
    const search = new URLSearchParams(screen.getByTestId('location').textContent ?? '');
    expect(search.get('job_no')).toBe('010');
  });
  await waitFor(() => expect(totalsCalls()).toHaveLength(2));
  expect(Object.fromEntries(totalsCalls()[1]!.searchParams)).toEqual({
    job_no: '010',
    date_after: '2026-10-01',
    date_before: '2026-10-31',
  });
});

it('a row click opens the user details for that job and date range', async () => {
  renderPage('/manufacturing/welding/reports/cost-analysis/?date_after=2026-10-01');
  await screen.findAllByText('010-24');

  fireEvent.click(screen.getAllByText('010-24').find((el) => el.closest('tr'))!);
  const dialog = await screen.findByRole('dialog', { name: '010-24 - Kullanıcı Detayları' });
  expect(await within(dialog).findByText('Ali Kaynak')).toBeInTheDocument();

  expect(Object.fromEntries(detailCalls()[0]!.searchParams)).toEqual({
    job_no: '010-24',
    date_after: '2026-10-01',
  });

  // Entries are summed per user; string hours/costs are numbers.
  const ali = within(dialog).getByText('Ali Kaynak').closest('tr')!;
  expect(within(ali).getByText('8,0')).toBeInTheDocument();
  expect(within(ali).getByText('W-1')).toHaveAttribute(
    'href',
    '/manufacturing/welding/tasks/list/?task=W-1',
  );
  const veli = within(dialog).getByText('Veli Usta').closest('tr')!;
  expect(within(veli).getByText('-')).toBeInTheDocument();
  // Summary: 2 users, total hours from the server summary.
  expect(within(dialog).getByText('Toplam Kullanıcı').nextSibling).toHaveTextContent('2');
  expect(within(dialog).getByText('Toplam Saat', { selector: 'p' }).nextSibling).toHaveTextContent(
    '12,0 saat',
  );
});

it('opens the modal with a message when the job has no entries', async () => {
  fetchMock.mockImplementation((url) => {
    const path = new URL(String(url)).pathname;
    if (path === '/welding/reports/job-costs/') return json({ count: 2, results: JOBS });
    return json({ summary: {}, entries: [] });
  });
  renderPage();
  await screen.findAllByText('010-24');
  fireEvent.click(screen.getAllByRole('button', { name: 'Kullanıcı Detaylarını Görüntüle' })[0]!);
  expect(await screen.findByText('Bu iş için kullanıcı detayı bulunamadı.')).toBeInTheDocument();
});

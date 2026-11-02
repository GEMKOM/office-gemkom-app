import { authedFetch } from '@legacy/authService.js';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { CombinedJobCostsPage } from './CombinedJobCostsPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const JOBS = [
  {
    job_no: '001-24',
    machining: { hours: { weekday_work: 10, after_hours: 2, sunday: 0 } },
    welding: { hours: { regular: 5, after_hours: 0, holiday: 3 } },
    combined_total_hours: 20,
  },
  {
    job_no: '002-24',
    machining: null,
    welding: { hours: { regular: 4, after_hours: 0, holiday: 0 } },
    combined_total_hours: 4,
  },
];

const MACHINING = {
  summary: {
    total_entries: 2,
    total_hours: 12,
    breakdown_by_type: { weekday_work: 10, after_hours: 2 },
  },
  entries: [
    {
      id: 2,
      start_time: Date.UTC(2026, 9, 12, 8),
      employee_full_name: 'Can Torna',
      employee_username: 'can',
      operation_key: 'OP-2',
      hours: 2,
      work_type: 'after_hours',
    },
    {
      id: 1,
      start_time: Date.UTC(2026, 9, 10, 8),
      employee_full_name: 'Can Torna',
      employee_username: 'can',
      operation_key: 'OP-1',
      hours: 10,
      work_type: 'weekday_work',
    },
  ],
};

const WELDING = {
  summary: { total_entries: 1, total_hours: 8 },
  entries: [
    { id: 5, date: '2026-10-11', employee_username: 'ali', hours: '8', overtime_type: 'holiday' },
  ],
};

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const urls = () => fetchMock.mock.calls.map(([url]) => new URL(String(url)));
const listCalls = () => urls().filter((u) => u.pathname === '/reports/combined-job-costs');

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/manufacturing/reports/combined-job-costs/') {
  return renderWithProviders(
    <>
      <CombinedJobCostsPage />
      <LocationProbe />
    </>,
    { route },
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => {
    const path = new URL(String(url)).pathname;
    if (path === '/reports/combined-job-costs') return json({ count: 2, results: JOBS });
    if (path === '/machining/reports/job-entries/') return json(MACHINING);
    if (path === '/welding/reports/job-entries/') return json(WELDING);
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('lists the jobs by total hours and shows the busiest job', async () => {
  renderPage();
  const row = (await screen.findAllByText('002-24')).find((el) => el.closest('tr'))!.closest('tr')!;
  // No machining entries: '-' instead of 0.
  expect(within(row).getAllByRole('cell')[1]).toHaveTextContent('-');
  expect(within(row).getAllByRole('cell')[2]).toHaveTextContent('4,0');

  expect(Object.fromEntries(listCalls()[0]!.searchParams)).toEqual({
    ordering: '-combined_total_hours',
  });
  const card = within(document.getElementById('most-hours-job')!);
  expect(card.getByText('001-24')).toBeInTheDocument();
  expect(card.getByText('20,0 saat')).toBeInTheDocument();
});

it('sorting and filtering go to the server and the URL', async () => {
  renderPage();
  await screen.findAllByText('002-24');

  fireEvent.click(screen.getByRole('button', { name: 'İş No' }));
  await waitFor(() => expect(listCalls()).toHaveLength(2));
  expect(listCalls()[1]!.searchParams.get('ordering')).toBe('job_no');

  fireEvent.change(screen.getByLabelText('İş No', { selector: 'input' }), {
    target: { value: '001' },
  });
  fireEvent.keyDown(screen.getByLabelText('İş No', { selector: 'input' }), { key: 'Enter' });
  await waitFor(() => expect(listCalls()).toHaveLength(3));
  expect(Object.fromEntries(listCalls()[2]!.searchParams)).toEqual({
    job_no: '001',
    ordering: 'job_no',
  });
  const search = new URLSearchParams(screen.getByTestId('location').textContent ?? '');
  expect(search.get('job_no')).toBe('001');
  expect(search.get('ordering')).toBe('job_no');
});

it('the job modal opens the machining entries, oldest first', async () => {
  renderPage();
  fireEvent.click((await screen.findAllByText('001-24')).find((el) => el.closest('tr'))!);
  const job = await screen.findByRole('dialog', { name: '001-24 - İş Maliyeti Detayları' });
  expect(within(job).getByText('Talaşlı İmalat Departmanı')).toBeInTheDocument();
  expect(within(job).getAllByRole('button', { name: 'Detayları Görüntüle' })).toHaveLength(2);

  fireEvent.click(within(job).getAllByRole('button', { name: 'Detayları Görüntüle' })[0]!);
  const dialog = await screen.findByRole('dialog', { name: '001-24 - Talaşlı İmalat Detayları' });
  expect(await within(dialog).findByText('OP-1')).toBeInTheDocument();
  expect(
    urls()
      .find((u) => u.pathname === '/machining/reports/job-entries/')!
      .searchParams.get('job_no'),
  ).toBe('001-24');

  const keys = within(dialog)
    .getAllByText(/^OP-/)
    .map((el) => el.textContent);
  expect(keys).toEqual(['OP-1', 'OP-2']);
  expect(within(dialog).getByText('Hafta İçi')).toBeInTheDocument();
  expect(within(dialog).getByText('Mesai')).toBeInTheDocument();
});

it('a job without machining says so; welding entries load without a date range', async () => {
  renderPage();
  fireEvent.click((await screen.findAllByText('002-24')).find((el) => el.closest('tr'))!);
  const job = await screen.findByRole('dialog', { name: '002-24 - İş Maliyeti Detayları' });
  expect(
    within(job).getByText('Bu iş için talaşlı imalat verisi bulunmamaktadır.'),
  ).toBeInTheDocument();

  fireEvent.click(within(job).getByRole('button', { name: 'Detayları Görüntüle' }));
  const dialog = await screen.findByRole('dialog', { name: '002-24 - Kaynaklı İmalat Detayları' });
  expect(await within(dialog).findByText('Tatil')).toBeInTheDocument();
  const welding = urls().find((u) => u.pathname === '/welding/reports/job-entries/')!;
  expect(Object.fromEntries(welding.searchParams)).toEqual({ job_no: '002-24' });
});

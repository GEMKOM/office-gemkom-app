import { authedFetch } from '@legacy/authService.js';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { TimesheetsPage } from './TimesheetsPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const day = (indexes: number[]) => Array.from({ length: 14 }, (_, i) => indexes.includes(i));

const DAILY = {
  counts: { pending: 2, approved: 1, none: 1 },
  results: [
    {
      full_name: 'Ahmet Kaynak',
      team_names: ['A Ekibi'],
      state: 'pending',
      scan_id: 51,
      scan_status: 'clean',
      submitted_at: '2026-11-05T15:10:00Z',
      total_hours: 9.5,
      rows: [{ job_no: '270-01', title: 'Kazan', cells: day([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), hours: { regular: 9.5 } }],
      flags: [],
    },
    {
      full_name: 'Mehmet Usta',
      team_names: ['B Ekibi'],
      state: 'pending',
      scan_id: 52,
      scan_status: 'flagged',
      has_errors: true,
      total_hours: 3,
      rows: [{ job_no: '1000', cells: day([1, 2, 3]), hours: { regular: 3 } }],
      flags: [{ level: 'error', text: 'Saat çakışması' }],
    },
    { full_name: 'Veli Demir', team_names: ['A Ekibi'], state: 'approved', scan_id: 53, approved_at: '2026-11-05T16:00:00Z', approved_by: 'ofis' },
    { full_name: 'Can Yılmaz', team_names: ['B Ekibi'], state: 'none' },
  ],
};

const SUBMISSION = {
  id: 51,
  status: 'pending',
  employee_name: 'Ahmet Kaynak',
  date: '2026-11-05',
  parsed: {
    date: '2026-11-05',
    kind: 'weekday',
    kind_label: 'Hafta içi',
    code: 'KP-51',
    rows: [
      { key: 'pre-0', kind: 'preprinted', job_no: '270-01', title: 'Kazan', cells: day([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) },
      { key: 'pre-1', kind: 'preprinted', job_no: '281-02', title: 'Silo', cells: day([]) },
      { key: 'blank-0', kind: 'blank', job_no: '', cells: day([]) },
    ],
    note: '',
    flags: [],
  },
};

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

type Call = { path: string; method: string; body: unknown; search: string };
function calls(): Call[] {
  return fetchMock.mock.calls.map(([url, init]) => {
    const u = new URL(String(url));
    return {
      path: u.pathname,
      search: u.search,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
  });
}
const writes = () => calls().filter((c) => c.method !== 'GET');

function renderPage(route = '/manufacturing/welding/timesheets/?date=2026-11-05') {
  return renderWithProviders(
    <ModalsProvider>
      <TimesheetsPage />
    </ModalsProvider>,
    { route },
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url)).pathname;
    if (path === '/welding/timesheets/daily-status/') return json(DAILY);
    if (path === '/welding/timesheets/submissions/51/' && method === 'GET') return json(SUBMISSION);
    if (path === '/welding/timesheets/submissions/51/' && method === 'PATCH') return json(SUBMISSION);
    if (path.endsWith('/approve/')) return json({ created_count: 2 });
    if (path.endsWith('/approve-clean/')) return json({ approved: [51], failed: [] });
    if (path.endsWith('/send-back/')) return json({});
    if (path === '/projects/job-orders/dropdown/') return json([{ job_no: '300-01', title: 'Tank' }]);
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
  vi.spyOn(notify, 'show');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('loads the day from ?date= and lists the welders with their jobs', async () => {
  renderPage();
  expect(await screen.findByText('Ahmet Kaynak')).toBeInTheDocument();
  expect(calls()[0]).toMatchObject({ path: '/welding/timesheets/daily-status/', search: '?date=2026-11-05' });
  expect(screen.getByText('Perşembe')).toBeInTheDocument();
  expect(screen.getByTestId('timesheet-counts')).toHaveTextContent('2 kontrol bekliyor');
  expect(screen.getByText('07:30–12:00, 12:30–17:00')).toBeInTheDocument();
  expect(screen.getByText('normal 9,5 sa')).toBeInTheDocument();
  expect(screen.getByText('GENEL')).toBeInTheDocument();
  // A row with errors cannot be approved from the list.
  expect(screen.getByRole('button', { name: 'Mehmet Usta onayla' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Veli Demir görüntüle' })).toBeInTheDocument();
  expect(screen.getByTestId('timesheet-count')).toHaveTextContent('(4/4)');
});

it('the next-day button moves ?date= and reloads', async () => {
  renderPage();
  await screen.findByText('Ahmet Kaynak');
  fireEvent.click(screen.getByRole('button', { name: 'Sonraki gün' }));
  await waitFor(() =>
    expect(calls().some((c) => c.search === '?date=2026-11-06')).toBe(true),
  );
});

it('approves a row and approves the clean ones after a confirm', async () => {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Ahmet Kaynak onayla' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('2 zaman kaydı oluşturuldu'));

  fireEvent.click(screen.getByRole('button', { name: /Uyarısız girişleri onayla \(1\)/ }));
  expect(await screen.findByText(/1 uyarısız giriş onaylanacak/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Onayla' }));
  await waitFor(() => expect(notify.show).toHaveBeenCalledWith('1 giriş onaylandı', 'success'));
  expect(writes()).toEqual([
    { path: '/welding/timesheets/submissions/51/approve/', search: '', method: 'POST', body: {} },
    {
      path: '/welding/timesheets/submissions/approve-clean/',
      search: '',
      method: 'POST',
      body: { date: '2026-11-05', submission_ids: [51] },
    },
  ]);
});

it('the editor moves an hour between jobs and saves rows with their keys', async () => {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Ahmet Kaynak düzelt' }));
  const editor = await screen.findByTestId('timesheet-editor');
  expect(screen.getByTestId('timesheet-total')).toHaveTextContent('9 saat');
  // Silo is offered from the sheet; add it and give it the 16–17 hour.
  fireEvent.click(within(editor).getByRole('button', { name: /281-02/ }));
  fireEvent.click(within(editor).getByRole('button', { name: '281-02 16:00–17:00' }));
  expect(within(editor).getByRole('button', { name: '270-01 16:00–17:00' })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByTestId('timesheet-total')).toHaveTextContent('9 saat');

  fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Kaydedildi'));
  const patch = writes()[0]!;
  expect(patch.path).toBe('/welding/timesheets/submissions/51/');
  const body = patch.body as { blank_day: boolean; rows: { key?: string; cells: boolean[] }[] };
  expect(body.blank_day).toBe(false);
  expect(body.rows.map((r) => r.key)).toEqual(['pre-0', 'pre-1', 'blank-0']);
  expect(body.rows[0]!.cells[9]).toBe(false);
  expect(body.rows[1]!.cells[9]).toBe(true);
});

it('Kaydet refuses an empty day', async () => {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Ahmet Kaynak düzelt' }));
  const editor = await screen.findByTestId('timesheet-editor');
  fireEvent.click(within(editor).getByRole('button', { name: '270-01 temizle' }));
  expect(screen.getByRole('button', { name: 'Kaydet' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Kaydet ve onayla' })).toBeDisabled();
  // Marking the day blank makes it sendable again.
  fireEvent.click(within(editor).getByRole('button', { name: /Bugün çalışmadım/ }));
  expect(screen.getByTestId('timesheet-total')).toHaveTextContent('Çalışılmadı');
  expect(screen.getByRole('button', { name: 'Kaydet' })).toBeEnabled();
});

it('sends a submission back with a reason', async () => {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Ahmet Kaynak düzelt' }));
  await screen.findByTestId('timesheet-editor');
  fireEvent.click(screen.getByRole('button', { name: 'Kaynakçıya geri gönder' }));
  fireEvent.change(await screen.findByLabelText(/Kaynakçıya iletilecek açıklama/), {
    target: { value: 'Öğle arası yanlış' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Geri gönder' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Giriş kaynakçıya geri gönderildi'));
  expect(writes()).toEqual([
    {
      path: '/welding/timesheets/submissions/51/send-back/',
      search: '',
      method: 'POST',
      body: { reason: 'Öğle arası yanlış' },
    },
  ]);
});

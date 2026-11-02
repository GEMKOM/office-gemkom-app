import { authedFetch } from '@legacy/authService.js';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { AttendanceRecordsPage } from './AttendanceRecordsPage';
import { todayIso } from './recordsFormat';

// Mantine modals with many fields are slow in jsdom when the whole suite runs in parallel.
vi.setConfig({ testTimeout: 20_000 });

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const RECORDS = [
  {
    id: 1,
    user_display: 'Ayşe Kaya',
    reviewed_by_display: 'İK Uzmanı',
    date: '2026-11-02',
    status: 'pending_override',
    leave_type: null,
    notes: 'Saha ziyareti',
    first_check_in: '08:30:00',
    last_check_out: '17:45:00',
    overtime_minutes: 15,
    total_present_minutes: 540,
    sessions: [
      {
        id: 101,
        status: 'closed',
        method: 'ip',
        method_display: 'IP (Ofis Ağı)',
        client_ip: '10.0.0.7',
        check_in_time: '2026-11-02T08:30:00',
        check_out_time: '2026-11-02T12:00:00',
        duration_minutes: 210,
      },
      {
        id: 102,
        status: 'pending_override',
        method: 'manual_override',
        check_in_time: '2026-11-02T13:00:00',
        check_out_time: '2026-11-02T17:45:00',
        override_reason: 'Müşteride',
        duration_minutes: 285,
      },
    ],
  },
  {
    id: 2,
    user_display: 'Ali Can',
    date: '2026-11-02',
    status: 'leave',
    sessions: [],
  },
];

const POSITIONS = [
  { id: 7, title: 'Muhasebe', is_active: true },
  { id: 8, title: 'Eski Birim', is_active: false },
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
const recordGets = () =>
  calls().filter((c) => c.method === 'GET' && c.url.pathname === '/attendance/hr/records/');
const writes = () => calls().filter((c) => c.method !== 'GET');

function renderPage(route = '/human_resources/attendance/records') {
  return renderWithProviders(
    <ModalsProvider>
      <AttendanceRecordsPage />
    </ModalsProvider>,
    { route },
  );
}

const groupRow = (name: string) => screen.getByText(name).closest('tr')!;

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const { pathname } = new URL(String(url));
    if (method === 'GET' && pathname === '/attendance/hr/records/') return json(RECORDS);
    if (method === 'GET' && pathname.startsWith('/organization/positions'))
      return json(POSITIONS);
    if (method === 'DELETE') return json(undefined, 204);
    if (method !== 'GET') return json({ id: 999 });
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it("lists today's records collapsed, with the record's own cells on each group row", async () => {
  renderPage();
  expect(await screen.findByText('Ayşe Kaya')).toBeInTheDocument();
  expect(screen.getByText('Ali Can')).toBeInTheDocument();

  // Legacy default: today's date only.
  expect(Object.fromEntries(recordGets()[0]!.url.searchParams)).toEqual({ date: todayIso() });

  const ayse = groupRow('Ayşe Kaya');
  expect(within(ayse).getByText('2')).toBeInTheDocument(); // session count
  expect(within(ayse).getByText('08:30')).toBeInTheDocument();
  expect(within(ayse).getByText('17:45')).toBeInTheDocument();
  expect(within(ayse).getByText('HR Onayı Bekliyor (Giriş)')).toBeInTheDocument();
  expect(within(ayse).getByText('Müşteride')).toBeInTheDocument();
  expect(within(ayse).getByText('15 dk')).toBeInTheDocument();
  expect(within(ayse).getByText('540 dk')).toBeInTheDocument();
  expect(within(groupRow('Ali Can')).getByText('+')).toBeInTheDocument();
  expect(within(groupRow('Ali Can')).getByText('İzinli')).toBeInTheDocument();

  // Collapsed: no session rows yet.
  expect(screen.queryByText('↳ Oturum #101')).not.toBeInTheDocument();
  expect(within(document.getElementById('records-count')!).getByText('2')).toBeInTheDocument();
  expect(within(document.getElementById('sessions-count')!).getByText('2')).toBeInTheDocument();
});

it('expands a record into its sessions and an add row', async () => {
  renderPage();
  await screen.findByText('Ayşe Kaya');
  fireEvent.click(within(groupRow('Ayşe Kaya')).getByRole('button', { name: 'Grubu genişlet' }));

  expect(screen.getByText('↳ Oturum #101')).toBeInTheDocument();
  expect(screen.getByText('IP: 10.0.0.7')).toBeInTheDocument();
  expect(screen.getByText('↳ Oturum #102')).toBeInTheDocument();
  expect(screen.getByText('210 dk')).toBeInTheDocument();
  expect(screen.getByText('Yeni oturum ekle')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Düzenle' })).toHaveLength(2);
  expect(screen.getAllByRole('button', { name: 'Sil' })).toHaveLength(2);
  expect(screen.getAllByRole('button', { name: 'Oturum Ekle' })).toHaveLength(1);

  fireEvent.click(within(groupRow('Ayşe Kaya')).getByRole('button', { name: 'Grubu daralt' }));
  expect(screen.queryByText('↳ Oturum #101')).not.toBeInTheDocument();
});

it('sends the URL filters, leaving empty ones out', async () => {
  renderPage(
    '/human_resources/attendance/records?date=&date_from=2026-10-01&date_to=2026-10-31&user_id=5&username=ayse&name=Ay&group_id=7&status=complete',
  );
  await screen.findByText('Ayşe Kaya');
  expect(Object.fromEntries(recordGets().at(-1)!.url.searchParams)).toEqual({
    date_from: '2026-10-01',
    date_to: '2026-10-31',
    user_id: '5',
    username: 'ayse',
    name: 'Ay',
    group_id: '7',
    status: 'complete',
  });
});

it('Temizle drops every filter, the date too', async () => {
  renderPage('/human_resources/attendance/records?status=complete');
  await screen.findByText('Ayşe Kaya');
  fireEvent.click(screen.getByRole('button', { name: /Temizle/ }));
  await waitFor(() => expect(recordGets().at(-1)!.url.search).toBe(''));
});

it('edits a record from its group row without toggling the group', async () => {
  renderPage();
  await screen.findByText('Ayşe Kaya');
  fireEvent.click(within(groupRow('Ayşe Kaya')).getByRole('button', { name: 'Kaydı Düzenle' }));

  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('Kayıt Düzenle')).toBeInTheDocument();
  expect(within(dialog).getByLabelText('Kullanıcı')).toHaveValue('Ayşe Kaya');
  expect(within(dialog).getByLabelText('İnceleyen')).toHaveValue('İK Uzmanı');
  expect(within(dialog).getByLabelText('Notlar')).toHaveValue('Saha ziyareti');
  expect(screen.queryByText('↳ Oturum #101')).not.toBeInTheDocument();

  fireEvent.change(within(dialog).getByLabelText('Notlar'), { target: { value: 'Güncel not' } });
  const loads = recordGets().length;
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));

  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Kayıt güncellendi'));
  expect(writes().map((c) => [c.method, c.url.pathname, c.body])).toEqual([
    [
      'PATCH',
      '/attendance/hr/records/1/',
      { status: 'pending_override', leave_type: null, notes: 'Güncel not' },
    ],
  ]);
  await waitFor(() => expect(recordGets().length).toBeGreaterThan(loads));
});

it('adds a session to a record, requiring the check-in time', async () => {
  renderPage();
  await screen.findByText('Ali Can');
  fireEvent.click(within(groupRow('Ali Can')).getByRole('button', { name: 'Grubu genişlet' }));
  fireEvent.click(screen.getByRole('button', { name: 'Oturum Ekle' }));

  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('Yeni Oturum Ekle')).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  expect(notify.error).toHaveBeenCalledWith('Giriş saati zorunludur.');
  expect(writes()).toHaveLength(0);

  fireEvent.change(within(dialog).getByLabelText(/Giriş Saati/), {
    target: { value: '2026-11-02T09:15' },
  });
  fireEvent.change(within(dialog).getByLabelText('Açıklama'), {
    target: { value: ' Unutulmuş giriş ' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));

  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Oturum eklendi'));
  expect(writes().map((c) => [c.method, c.url.pathname, c.body])).toEqual([
    [
      'POST',
      '/attendance/hr/records/2/sessions/',
      {
        check_in_time: '2026-11-02T09:15',
        check_out_time: null,
        method: 'hr_manual',
        status: 'closed',
        override_reason: 'Unutulmuş giriş',
      },
    ],
  ]);
});

it('edits a session with its current values', async () => {
  renderPage();
  await screen.findByText('Ayşe Kaya');
  fireEvent.click(within(groupRow('Ayşe Kaya')).getByRole('button', { name: 'Grubu genişlet' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Düzenle' })[1]!);

  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('Oturum #102 Düzenle')).toBeInTheDocument();
  expect(within(dialog).getByLabelText(/Giriş Saati/)).toHaveValue('2026-11-02T13:00');
  expect(within(dialog).getByLabelText('Çıkış Saati')).toHaveValue('2026-11-02T17:45');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));

  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Oturum güncellendi'));
  expect(writes().map((c) => [c.method, c.url.pathname, c.body])).toEqual([
    [
      'PATCH',
      '/attendance/hr/sessions/102/',
      {
        check_in_time: '2026-11-02T13:00',
        check_out_time: '2026-11-02T17:45',
        method: 'manual_override',
        status: 'pending_override',
        override_reason: 'Müşteride',
      },
    ],
  ]);
});

it('deletes a session after confirming, and reports a failure', async () => {
  renderPage();
  await screen.findByText('Ayşe Kaya');
  fireEvent.click(within(groupRow('Ayşe Kaya')).getByRole('button', { name: 'Grubu genişlet' }));

  fireEvent.click(screen.getAllByRole('button', { name: 'Sil' })[0]!);
  expect(
    await screen.findByText('Oturum #101 silinecek. Bu işlem geri alınamaz.'),
  ).toBeInTheDocument();
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sil' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Oturum silindi'));
  expect(writes().map((c) => [c.method, c.url.pathname])).toEqual([
    ['DELETE', '/attendance/hr/sessions/101/'],
  ]);

  fetchMock.mockImplementationOnce(() => json({ detail: 'Kilitli kayıt' }, 400));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  fireEvent.click(screen.getAllByRole('button', { name: 'Sil' })[1]!);
  fireEvent.click(
    within(await screen.findByRole('dialog')).getByRole('button', { name: 'Sil' }),
  );
  await waitFor(() =>
    expect(notify.error).toHaveBeenCalledWith('Silme başarısız: Kilitli kayıt'),
  );
});

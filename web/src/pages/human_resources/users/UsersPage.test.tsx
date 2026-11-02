import { authedFetch, impersonateUser, isSuperuser } from '@legacy/authService.js';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { UsersPage } from './UsersPage';

vi.mock('@legacy/authService.js', () => ({
  authedFetch: vi.fn(),
  isSuperuser: vi.fn(() => false),
  impersonateUser: vi.fn(() => Promise.resolve()),
}));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const USERS = [
  {
    id: 7,
    username: 'aliveli',
    first_name: 'Ali',
    last_name: 'Veli',
    email: 'ali@example.test',
    personel_kodu: 'P-7',
    birth_date: '1986-05-15',
    position_title: 'Kaynakçı',
    is_active: true,
    shift_rule_id: 3,
    gender: 'M',
  },
  { id: 8, username: 'aysekara', first_name: 'Ayşe', last_name: 'Kara', is_active: false },
];
const POSITIONS = [
  { id: 11, title: 'Kaynakçı', level: 4, department_code: 'welding', department_name: 'Kaynak' },
  {
    id: 12,
    title: 'Planlamacı',
    level: 3,
    department_code: 'planning',
    department_name: 'Planlama',
  },
];
const SHIFT_RULES = [
  { id: 3, name: 'Gündüz', expected_start: '08:00:00', expected_end: '17:30:00', is_active: true },
  { id: 4, name: 'Eski', expected_start: '07:00:00', expected_end: '16:00:00', is_active: false },
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
const listCalls = () => calls().filter((c) => c.method === 'GET' && c.url.pathname === '/users/');
const callTo = (method: string, path: string) =>
  calls().find((c) => c.method === method && c.url.pathname === path);

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/human_resources/users/') {
  return renderWithProviders(
    <ModalsProvider>
      <UsersPage />
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
    if (method === 'GET' && path === '/users/')
      return json({ count: 2, next: null, previous: null, results: USERS });
    if (method === 'GET' && path === '/organization/positions/') return json(POSITIONS);
    if (method === 'GET' && path === '/attendance/hr/shift-rules/') return json(SHIFT_RULES);
    if (method === 'POST' && path === '/users/') return json({ id: 99, username: 'yeni' }, 201);
    if (method === 'POST' && path === '/users/wages/') return json({ id: 1 }, 201);
    if (method === 'PATCH') return json({ id: 7 });
    if (method === 'POST') return json({});
    if (method === 'DELETE') return json(undefined, 204);
    return json({});
  });
  vi.mocked(isSuperuser).mockReturnValue(false);
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
  vi.spyOn(notify, 'warning');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('lists the employees with the legacy default params', async () => {
  renderPage();
  expect(screen.getByRole('heading', { name: 'Çalışanlar' })).toBeInTheDocument();
  expect(await screen.findByText('aliveli')).toBeInTheDocument();
  expect(screen.getByText('15 Mayıs 1986')).toBeInTheDocument();
  expect(screen.getByText('Kaynakçı')).toBeInTheDocument();
  expect(screen.getByText('Pasif')).toBeInTheDocument();
  expect(within(document.getElementById('total-users-count')!).getByText('2')).toBeInTheDocument();

  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    page: '1',
    page_size: '20',
    is_active: 'true',
    ordering: 'username',
  });
});

it('filters write the URL and reach the request', async () => {
  renderPage('/human_resources/users/?page=2');
  await screen.findByText('aliveli');

  fireEvent.change(screen.getByLabelText('Kullanıcı Adı'), { target: { value: 'ali' } });
  fireEvent.keyDown(screen.getByLabelText('Kullanıcı Adı'), { key: 'Enter' });

  await waitFor(() => {
    const search = new URLSearchParams(screen.getByTestId('location').textContent ?? '');
    expect(search.get('username')).toBe('ali');
    expect(search.has('page')).toBe(false);
  });
  await waitFor(() => expect(listCalls().at(-1)!.url.searchParams.get('username')).toBe('ali'));
  expect(listCalls().at(-1)!.url.searchParams.get('page')).toBe('1');
});

it('position sort asks for the nested ordering field', async () => {
  renderPage('/human_resources/users/?ordering=-profile__position__title&is_active=all');
  await screen.findByText('aliveli');
  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toMatchObject({
    ordering: '-profile__position__title',
    is_active: 'all',
  });
});

it('Impersonate is offered to superusers only', async () => {
  const { unmount } = renderPage();
  await screen.findByText('aliveli');
  expect(screen.queryAllByRole('button', { name: 'Impersonate' })).toHaveLength(0);
  unmount();

  vi.mocked(isSuperuser).mockReturnValue(true);
  renderPage();
  await screen.findByText('aliveli');
  fireEvent.click(screen.getAllByRole('button', { name: 'Impersonate' })[0]!);
  expect(
    await screen.findByText('@aliveli kullanıcısı olarak impersonate yapmak istiyor musunuz?'),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Evet' }));
  await waitFor(() => expect(impersonateUser).toHaveBeenCalledWith(7));
});

it('creates an employee, then the first wage', async () => {
  renderPage();
  await screen.findByText('aliveli');
  fireEvent.click(screen.getByRole('button', { name: 'Yeni Çalışan' }));
  const dialog = await screen.findByRole('dialog', { name: 'Yeni Çalışan Oluştur' });

  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  expect(await within(dialog).findAllByText('Bu alan gereklidir')).toHaveLength(3);
  expect(callTo('POST', '/users/')).toBeUndefined();

  fireEvent.change(within(dialog).getByLabelText(/Kullanıcı Adı/), { target: { value: ' yeni ' } });
  fireEvent.change(within(dialog).getByLabelText(/^Ad/), { target: { value: 'Yeni' } });
  fireEvent.change(within(dialog).getByLabelText(/^Soyad/), { target: { value: 'Kişi' } });
  fireEvent.change(within(dialog).getByLabelText('Aylık Ücret'), { target: { value: '25000' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));

  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Çalışan başarıyla oluşturuldu'));
  // Blank email, birth date and position stay out of the payload.
  expect(callTo('POST', '/users/')!.body).toEqual({
    username: 'yeni',
    first_name: 'Yeni',
    last_name: 'Kişi',
    is_active: true,
  });
  expect(callTo('POST', '/users/wages/')!.body).toEqual({
    user: 99,
    effective_from: new Date().toISOString().split('T')[0],
    base_monthly: '25000.0000',
  });
});

it('shows the backend field errors when create fails', async () => {
  fetchMock.mockImplementation((url, init) => {
    const path = new URL(String(url)).pathname;
    if (init?.method === 'POST' && path === '/users/')
      return json({ username: ['Bu kullanıcı adı alınmış.'] }, 400);
    return json({ count: 0, next: null, previous: null, results: [] });
  });
  renderPage();
  fireEvent.click(screen.getByRole('button', { name: 'Yeni Çalışan' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText(/Kullanıcı Adı/), {
    target: { value: 'aliveli' },
  });
  fireEvent.change(within(dialog).getByLabelText(/^Ad/), { target: { value: 'Ali' } });
  fireEvent.change(within(dialog).getByLabelText(/^Soyad/), { target: { value: 'Veli' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() =>
    expect(notify.error).toHaveBeenCalledWith('username: Bu kullanıcı adı alınmış.'),
  );
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

it('edits an employee: patches the fields, then assigns the shift rule', async () => {
  renderPage();
  await screen.findByText('aliveli');
  fireEvent.click(screen.getAllByRole('button', { name: 'Düzenle' })[0]!);
  const dialog = await screen.findByRole('dialog', { name: 'Çalışan Düzenle' });

  expect(within(dialog).getByLabelText(/Kullanıcı Adı/)).toHaveValue('aliveli');
  fireEvent.change(within(dialog).getByLabelText(/^Soyad/), { target: { value: 'Yılmaz' } });
  fireEvent.change(within(dialog).getByLabelText('TC Kimlik No'), {
    target: { value: ' 12345678901 ' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));

  await waitFor(() => expect(callTo('POST', '/attendance/hr/shift-rules/assign/')).toBeDefined());
  expect(callTo('PATCH', '/users/7/')!.body).toEqual({
    username: 'aliveli',
    email: 'ali@example.test',
    first_name: 'Ali',
    last_name: 'Yılmaz',
    tc_kimlik_no: '12345678901',
    gender: 'M',
    sigorta_yuzde_grubu: null,
    birth_date: '1986-05-15',
    is_active: true,
  });
  expect(callTo('POST', '/attendance/hr/shift-rules/assign/')!.body).toEqual({
    user_id: 7,
    shift_rule_id: 3,
  });
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Çalışan Düzenle' })).toBeNull());
});

it('the İzinler tab loads lazily, saves itself and hides the footer Kaydet', async () => {
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url)).pathname;
    if (path === '/vacation-requests/users/7/leave-setup/' && method === 'GET') {
      return json({
        hire_date: '2020-01-01',
        total_days: '14.0',
        used_days: '3.0',
        remaining_days: '11.0',
      });
    }
    if (path === '/vacation-requests/users/7/leave-setup/' && method === 'PATCH') return json({});
    if (path === '/vacation-requests/requests/') {
      return json({
        count: 2,
        results: [
          {
            id: 501,
            requester: 7,
            leave_type_label: 'Yıllık İzin',
            status: 'approved',
            status_label: 'Onaylandı',
          },
          { id: 502, requester: 9, leave_type_label: 'Başkası', status: 'approved' },
        ],
      });
    }
    if (path === '/users/') return json({ count: 2, next: null, previous: null, results: USERS });
    return json([]);
  });
  renderPage();
  await screen.findByText('aliveli');
  fireEvent.click(screen.getAllByRole('button', { name: 'Düzenle' })[0]!);
  const dialog = await screen.findByRole('dialog', { name: 'Çalışan Düzenle' });
  expect(calls().some((c) => c.url.pathname.includes('leave-setup'))).toBe(false);

  fireEvent.click(within(dialog).getByRole('tab', { name: 'İzinler' }));
  expect(await within(dialog).findByText('#501')).toBeInTheDocument();
  expect(within(dialog).queryByText('#502')).toBeNull();
  await waitFor(() => expect(within(dialog).getByLabelText('Toplam Gün')).toHaveValue(14));
  expect(within(dialog).getByText('11.0')).toBeInTheDocument();
  // Only the tab's own Kaydet is left; the footer submit is gone.
  expect(dialog.querySelector('button[type="submit"]')).toBeNull();
  expect(
    calls()
      .find((c) => c.url.pathname === '/vacation-requests/requests/')!
      .url.searchParams.get('requester'),
  ).toBe('7');

  fireEvent.change(within(dialog).getByLabelText('Toplam Gün'), { target: { value: '20' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('İzin tanımı güncellendi'));
  expect(callTo('PATCH', '/vacation-requests/users/7/leave-setup/')!.body).toEqual({
    hire_date: '2020-01-01',
    total_days: '20.0',
  });
});

it('deletes an employee only after the confirm', async () => {
  renderPage();
  await screen.findByText('aliveli');
  fireEvent.click(screen.getAllByRole('button', { name: 'Sil' })[0]!);
  expect(
    await screen.findByText('"aliveli" kullanıcısını silmek istediğinize emin misiniz?'),
  ).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'DELETE')).toBe(false);

  const confirmDialog = screen.getByRole('dialog', { name: 'Çalışan Silme Onayı' });
  fireEvent.click(within(confirmDialog).getByRole('button', { name: 'Sil' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Çalışan silindi'));
  expect(callTo('DELETE', '/users/7/')).toBeDefined();
  await waitFor(() => expect(listCalls().length).toBeGreaterThan(1));
});

it('PDKS Özeti: adds an HR record for a day without one', async () => {
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url)).pathname;
    if (path === '/attendance/monthly-summary/') {
      return json({
        shift_rule: {
          expected_start: '08:00:00',
          expected_end: '17:00:00',
          overtime_threshold_minutes: 30,
        },
        summary: { total_working_days: 21, total_present: 20 },
        days: [
          {
            date: '2026-11-02',
            weekday: 'monday',
            day_type: 'working',
            flag: 'absent',
            record: null,
          },
        ],
      });
    }
    if (path === '/attendance/hr/records/' && method === 'POST') return json({ id: 900 }, 201);
    if (path === '/users/') return json({ count: 2, next: null, previous: null, results: USERS });
    return json({});
  });
  renderPage();
  await screen.findByText('aliveli');
  fireEvent.click(screen.getAllByRole('button', { name: 'Düzenle' })[0]!);
  const dialog = await screen.findByRole('dialog', { name: 'Çalışan Düzenle' });
  fireEvent.click(within(dialog).getByRole('tab', { name: 'PDKS Özeti' }));

  expect(await within(dialog).findByText('Gelmedi', { selector: 'span' })).toBeInTheDocument();
  expect(within(dialog).getByText('Pazartesi')).toBeInTheDocument();
  const summary = calls().find((c) => c.url.pathname === '/attendance/monthly-summary/')!;
  expect(summary.url.searchParams.get('user_id')).toBe('7');

  fireEvent.click(within(dialog).getByRole('button', { name: 'Ekle' }));
  const record = await screen.findByRole('dialog', { name: 'PDKS Kaydı' });
  fireEvent.click(within(record).getByRole('button', { name: 'Kaydet' }));
  expect(notify.warning).toHaveBeenCalledWith('En az bir alan giriniz (Giriş veya Çıkış).');

  fireEvent.change(within(record).getByLabelText('Giriş'), { target: { value: '08:15:00' } });
  fireEvent.click(within(record).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('PDKS kaydı oluşturuldu'));
  expect(callTo('POST', '/attendance/hr/records/')!.body).toEqual({
    user: 7,
    date: '2026-11-02',
    check_in_time: new Date('2026-11-02T08:15:00').toISOString(),
  });
});

it('Yetkiler & Gruplar copes with an empty answer and toggles portal access', async () => {
  renderPage();
  await screen.findByText('aliveli');
  fireEvent.click(screen.getAllByRole('button', { name: 'Düzenle' })[0]!);
  const dialog = await screen.findByRole('dialog', { name: 'Çalışan Düzenle' });
  fireEvent.click(within(dialog).getByRole('tab', { name: /Yetkiler/ }));

  expect(await within(dialog).findByText('Bireysel geçersiz kılma yok.')).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: /Ofis: Kapalı/ }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Portal erişimi güncellendi'));
  expect(callTo('POST', '/users/7/permission-overrides/')!.body).toEqual({
    codename: 'office_access',
    granted: true,
    reason: '',
  });
});

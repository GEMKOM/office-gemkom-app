import { authedFetch } from '@legacy/authService.js';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { NotificationConfigsPage } from './NotificationConfigsPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));
const auth = vi.hoisted(() => ({ isAdmin: true }));
vi.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 1, username: 'admin' }, isAdmin: auth.isAdmin }),
}));

const fetchMock = vi.mocked(authedFetch);

const CONFIGS = {
  group_choices: [
    { value: 'planning', label: 'Planlama' },
    { value: 'manufacturing', label: 'İmalat' },
  ],
  configs: [
    {
      notification_type: 'job_on_hold',
      notification_type_display: 'İş Emri Beklemede',
      category: 'projects',
      category_display: 'Projeler',
      always_notified: 'Proje sorumlusu',
      title_template: '[Beklemede] {job_no}',
      body_template: '',
      link_template: '',
      available_vars: ['job_no', 'reason'],
      default_send_email: true,
      default_send_in_app: false,
      is_routable: true,
      enabled: true,
      users: [{ id: 1, username: 'ahmet' }],
      groups: [{ name: 'planning', display: 'Planlama' }],
      user_groups: [{ id: 5, name: 'Planlama Ofisi' }, 'Kalite'],
      updated_at: '2026-10-05T14:05:00',
    },
    {
      notification_type: 'job_completed',
      notification_type_display: 'İş Emri Tamamlandı',
      category: 'projects',
      category_display: 'Projeler',
      is_routable: true,
      is_default: true,
    },
    {
      notification_type: 'password_reset',
      notification_type_display: 'Şifre Sıfırlama',
      category: 'system',
      category_display: 'Sistem',
      default_send_in_app: true,
      is_routable: false,
    },
  ],
};

const USERS = [
  { id: 1, username: 'ahmet', first_name: 'Ahmet', last_name: 'Yılmaz' },
  { id: 2, username: 'ayse', first_name: 'Ayşe', last_name: 'Kaya' },
];
const ORG_GROUPS = [
  { id: 5, name: 'Planlama Ofisi' },
  { id: 6, name: 'Kalite' },
];

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

type Call = { path: string; method: string; body: unknown };
const calls = (): Call[] =>
  fetchMock.mock.calls.map(([url, init]) => ({
    path: new URL(String(url)).pathname,
    method: init?.method ?? 'GET',
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
  }));

function LocationProbe() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

function renderPage() {
  return renderWithProviders(
    <ModalsProvider>
      <NotificationConfigsPage />
      <LocationProbe />
    </ModalsProvider>,
    { route: '/it/notifications' },
  );
}

beforeEach(() => {
  auth.isAdmin = true;
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url)).pathname;
    if (method === 'GET' && path === '/notifications/config/') return json(CONFIGS);
    if (method === 'GET' && path === '/users/dropdown/') return json(USERS);
    if (method === 'GET' && path === '/organization/groups/') return json(ORG_GROUPS);
    if (method === 'PATCH') return json({});
    if (method === 'POST' && path === '/notifications/config/reset/')
      return json({ message: '3 yapılandırma sıfırlandı' });
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

function bodyRowKinds() {
  return [...document.querySelectorAll('tbody tr')].map((tr) =>
    tr.getAttribute('data-group-row')
      ? `${tr.getAttribute('data-group-row')}:${tr.getAttribute('data-group-id')}`
      : `row:${tr.getAttribute('data-row-id')}`,
  );
}

it('groups the configs by category with the legacy header and routing text', async () => {
  renderPage();
  expect(screen.getByText('Bildirim Yapılandırmaları', { selector: 'h1' })).toBeInTheDocument();
  expect(await screen.findByText('İş Emri Beklemede')).toBeInTheDocument();

  expect(bodyRowKinds()).toEqual([
    'header:projects',
    'row:job_on_hold',
    'row:job_completed',
    'header:system',
    'row:password_reset',
  ]);
  const projects = document.querySelector('tr[data-group-id="projects"]')!;
  expect(projects).toHaveTextContent('Projeler');
  expect(projects).toHaveTextContent('2 bildirim');
  expect(document.querySelector('tr[data-group-id="system"]')).toHaveTextContent('1 bildirim');

  expect(
    screen.getByText('1 kullanıcı + Departman: Planlama + Org. gruplar: Planlama Ofisi, Kalite'),
  ).toBeInTheDocument();
  expect(screen.getByText('Yönlendirilemez')).toBeInTheDocument();
  expect(screen.getByText('Varsayılan')).toBeInTheDocument();
  expect(screen.getByText('Proje sorumlusu')).toBeInTheDocument();

  // Collapsing a category hides its rows.
  fireEvent.click(screen.getAllByRole('button', { name: 'Grubu daralt' })[0]!);
  expect(bodyRowKinds()).toEqual(['header:projects', 'header:system', 'row:password_reset']);
});

it('sends non-admins back to the IT hub', async () => {
  auth.isAdmin = false;
  renderPage();
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/it/'));
  expect(notify.error).toHaveBeenCalledWith('Bu sayfaya erişim yetkiniz bulunmamaktadır.');
  expect(calls().some((c) => c.path === '/notifications/config/')).toBe(false);
});

it('edits a routable config and patches templates and routing', async () => {
  renderPage();
  await screen.findByText('İş Emri Beklemede');
  // Wait for the pickers.
  await waitFor(() =>
    expect(calls().filter((c) => c.path === '/organization/groups/')).toHaveLength(1),
  );
  await waitFor(() => expect(calls().some((c) => c.path === '/users/dropdown/')).toBe(true));
  fireEvent.click(screen.getAllByRole('button', { name: 'Düzenle' })[0]!);
  const dialog = await screen.findByRole('dialog', { name: /Bildirim Yapılandırması Düzenle/ });

  expect(within(dialog).getByLabelText('Her Zaman Bildirilenler')).toHaveValue('Proje sorumlusu');
  expect(within(dialog).getByText('Yönlendirme')).toBeInTheDocument();

  // A chip inserts its variable at the caret.
  const title = within(dialog).getByRole('textbox', {
    name: /^Başlık Şablonu/,
  }) as HTMLInputElement;
  title.setSelectionRange(0, 0);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Başlık Şablonu: {reason} ekle' }));
  expect(title).toHaveValue('{reason}[Beklemede] {job_no}');

  fireEvent.click(within(dialog).getByLabelText('Uygulama İçi Bildirim'));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));

  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Bildirim yapılandırması güncellendi'),
  );
  const patch = calls().find((c) => c.method === 'PATCH')!;
  expect(patch.path).toBe('/notifications/config/job_on_hold/');
  expect(patch.body).toEqual({
    title_template: '{reason}[Beklemede] {job_no}',
    body_template: '',
    link_template: '',
    default_send_email: true,
    default_send_in_app: true,
    enabled: true,
    user_ids: [1],
    groups: ['planning'],
    // The name-only group resolves through /organization/groups/.
    user_groups: [5, 6],
  });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await waitFor(() =>
    expect(calls().filter((c) => c.path === '/notifications/config/')).toHaveLength(2),
  );
});

it('sends only templates and delivery for a config that cannot be routed', async () => {
  renderPage();
  await screen.findByText('Şifre Sıfırlama');
  fireEvent.click(screen.getAllByRole('button', { name: 'Düzenle' })[2]!);
  const dialog = await screen.findByRole('dialog', { name: /Bildirim Yapılandırması Düzenle/ });
  expect(within(dialog).queryByText('Yönlendirme')).toBeNull();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(calls().some((c) => c.method === 'PATCH')).toBe(true));
  expect(calls().find((c) => c.method === 'PATCH')!.body).toEqual({
    title_template: '',
    body_template: '',
    link_template: '',
    default_send_email: true,
    default_send_in_app: true,
  });
});

it('shows the backend detail when saving fails', async () => {
  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((url, init) =>
    init?.method === 'PATCH' ? json({ detail: 'Geçersiz şablon' }, 400) : base(url, init),
  );
  renderPage();
  await screen.findByText('Şifre Sıfırlama');
  fireEvent.click(screen.getAllByRole('button', { name: 'Düzenle' })[2]!);
  const dialog = await screen.findByRole('dialog', { name: /Bildirim Yapılandırması Düzenle/ });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Geçersiz şablon'));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

it('resets every config only after the confirm', async () => {
  renderPage();
  await screen.findByText('İş Emri Beklemede');
  fireEvent.click(screen.getByRole('button', { name: 'Tümünü Sıfırla' }));
  const dialog = await screen.findByRole('dialog', { name: 'Tümünü Sıfırla' });
  expect(within(dialog).getByText(/Bu işlem geri alınamaz/)).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'POST')).toBe(false);

  fireEvent.click(within(dialog).getByRole('button', { name: 'Tümünü Sıfırla' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('3 yapılandırma sıfırlandı'));
  expect(calls().find((c) => c.method === 'POST')!.path).toBe('/notifications/config/reset/');
  await waitFor(() =>
    expect(calls().filter((c) => c.path === '/notifications/config/')).toHaveLength(2),
  );
});

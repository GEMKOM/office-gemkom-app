import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { PermissionsPage } from './PermissionsPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));
const auth = vi.hoisted(() => ({ isAdmin: true }));
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => auth }));

const fetchMock = vi.mocked(authedFetch);

const MATRIX = {
  codenames: ['office_access', 'workshop_access', 'access_sales'],
  users: [
    {
      id: 1,
      username: 'ali',
      full_name: 'Ali Veli',
      is_superuser: false,
      position_title: 'Satış Uzmanı',
      position_level: 3,
      position_department_code: 'sales',
      permissions: { office_access: { value: true }, access_sales: { value: true }, workshop_access: { value: false } },
    },
    { id: 2, username: 'root', full_name: 'Kök', is_superuser: true, permissions: {} },
  ],
};
const CATALOG = [
  { codename: 'office_access', name: 'Ofis erişimi', section: 'office', users: [{ username: 'ali' }], overrides: [] },
  { codename: 'workshop_access', name: 'Atölye erişimi', section: 'workshop', users: [], overrides: [] },
  {
    codename: 'access_sales',
    name: 'Satış',
    section: 'sales',
    users: [{ username: 'ali' }],
    overrides: [{ username: 'ali', granted: true }],
  },
];
const POSITIONS = [
  { id: 10, title: 'Satış Uzmanı', level: 3, department_name: 'Proje Taahhüt', holder_count: 1, permission_count: 1, is_active: true },
  { id: 11, title: 'Genel Müdür', level: 1, department_name: 'Yönetim', holder_count: 1, permission_count: 0, is_active: true },
];
const USER_DETAIL = {
  user: { id: 1, username: 'ali', full_name: 'Ali Veli', is_superuser: false, position_id: 10, position_title: 'Satış Uzmanı' },
  effective_permissions: {
    office_access: { value: true, source: 'position', source_detail: 'Satış Uzmanı' },
    access_sales: { value: true, source: 'override', source_detail: '' },
  },
  overrides: [{ codename: 'access_sales', granted: true, reason: 'test', created_at: '2026-10-01T09:00:00Z' }],
};
const POSITION_DETAIL = {
  ...POSITIONS[0],
  permission_codenames: ['office_access'],
  holders: [{ id: 1, full_name: 'Ali Veli', username: 'ali' }],
};

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(body === undefined ? null : JSON.stringify(body), { status }));
}

type Call = { path: string; method: string; body: unknown };
function calls(): Call[] {
  return fetchMock.mock.calls.map(([url, init]) => ({
    path: new URL(String(url)).pathname,
    method: init?.method ?? 'GET',
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
  }));
}
const writes = () => calls().filter((c) => c.method !== 'GET');

function renderPage() {
  return renderWithProviders(
    <ModalsProvider>
      <PermissionsPage />
    </ModalsProvider>,
    { route: '/it/permissions/' },
  );
}

beforeEach(() => {
  auth.isAdmin = true;
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url)).pathname;
    if (path === '/users/permissions/matrix/') return json(MATRIX);
    if (path === '/users/permissions/') return json(CATALOG);
    if (path === '/organization/positions/') return json(POSITIONS);
    if (path === '/users/1/permissions/') return json(USER_DETAIL);
    if (path === '/organization/positions/10/' && method === 'GET') return json(POSITION_DETAIL);
    if (method === 'POST' || method === 'PATCH') return json({});
    if (method === 'DELETE') return json(undefined, 204);
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('non-admins get the access message and nothing loads', () => {
  auth.isAdmin = false;
  renderPage();
  expect(screen.getByText('Erişim yetkiniz yok')).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});

it('lists users with their permission counts and loads only the users tab', async () => {
  renderPage();
  const row = (await screen.findByText('Ali Veli')).closest('tr')!;
  expect(within(row).getByText('2')).toBeInTheDocument();
  const root = screen.getByText('Kök').closest('tr')!;
  expect(within(root).getByText('Tümü')).toBeInTheDocument();
  expect(within(root).getByText('Süper')).toBeInTheDocument();
  expect(calls().map((c) => c.path)).toEqual(['/users/permissions/matrix/']);
});

it('a user row opens their permissions; Engelle posts an override and refreshes the detail', async () => {
  renderPage();
  fireEvent.click(await screen.findByText('Ali Veli'));
  const panel = await screen.findByTestId('user-permissions');
  expect(within(panel).getByText('@ali')).toBeInTheDocument();
  const salesRow = await within(panel).findByText('Satış');
  const tr = salesRow.closest('tr')!;
  expect(within(tr).getByText('Bireysel')).toBeInTheDocument();
  // Only access_sales has an override, so only its Sıfırla is enabled.
  expect(within(tr).getByRole('button', { name: 'Sıfırla' })).toBeEnabled();
  const officeRow = within(panel).getByText('Ofis erişimi').closest('tr')!;
  expect(within(officeRow).getByRole('button', { name: 'Sıfırla' })).toBeDisabled();

  const before = calls().filter((c) => c.path === '/users/1/permissions/').length;
  fireEvent.click(within(officeRow).getByRole('button', { name: 'Engelle' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('office_access izni kullanıcı için engellendi'));
  expect(writes()).toEqual([
    { path: '/users/1/permission-overrides/', method: 'POST', body: { codename: 'office_access', granted: false, reason: '' } },
  ]);
  await waitFor(() =>
    expect(calls().filter((c) => c.path === '/users/1/permissions/').length).toBe(before + 1),
  );
  // The matrix is not reloaded for a single user's change.
  expect(calls().filter((c) => c.path === '/users/permissions/matrix/')).toHaveLength(1);
});

it('the portal toggle and override delete send the legacy requests', async () => {
  renderPage();
  fireEvent.click(await screen.findByText('Ali Veli'));
  const panel = await screen.findByTestId('user-permissions');
  fireEvent.click(await within(panel).findByRole('button', { name: /Atölye: Kapalı/ }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Atölye erişimi açıldı'));
  fireEvent.click(within(panel).getByRole('button', { name: 'access_sales geçersiz kılmasını sil' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Geçersiz kılma kaldırıldı'));
  expect(writes()).toEqual([
    { path: '/users/1/permission-overrides/', method: 'POST', body: { codename: 'workshop_access', granted: true, reason: '' } },
    { path: '/users/1/permission-overrides/access_sales/', method: 'DELETE', body: undefined },
  ]);
});

it('the Detay modal saves a deny with a reason', async () => {
  renderPage();
  fireEvent.click(await screen.findByText('Ali Veli'));
  const panel = await screen.findByTestId('user-permissions');
  const officeRow = (await within(panel).findByText('Ofis erişimi')).closest('tr')!;
  fireEvent.click(within(officeRow).getByRole('button', { name: 'Detay' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('office_access — Yetki Geçersiz Kılma')).toBeInTheDocument();
  fireEvent.change(within(dialog).getByLabelText('Durum'), { target: { value: 'false' } });
  fireEvent.change(within(dialog).getByLabelText('Sebep (opsiyonel)'), { target: { value: 'Geçici' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Geçersiz kılma kaydedildi'));
  expect(writes()).toEqual([
    { path: '/users/1/permission-overrides/', method: 'POST', body: { codename: 'office_access', granted: false, reason: 'Geçici' } },
  ]);
});

it('applies a position change from the select', async () => {
  renderPage();
  fireEvent.click(await screen.findByText('Ali Veli'));
  const panel = await screen.findByTestId('user-permissions');
  const select = within(panel).getByLabelText('Pozisyon seç');
  await within(select).findByRole('option', { name: /Genel Müdür/ });
  fireEvent.change(select, { target: { value: '11' } });
  fireEvent.click(within(panel).getByRole('button', { name: 'Uygula' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Kullanıcının pozisyonu güncellendi.'));
  expect(writes()).toEqual([{ path: '/users/1/', method: 'PATCH', body: { position: 11 } }]);
});

it('positions: a draft of checkboxes is saved in one PATCH, Vazgeç restores it', async () => {
  renderPage();
  fireEvent.click(screen.getByRole('tab', { name: 'Pozisyonlar' }));
  // Sorted by level: Genel Müdür (L1) first.
  const table = await screen.findByText('Genel Müdür');
  expect(table.closest('tbody')!.querySelector('tr')).toHaveTextContent('Genel Müdür');
  fireEvent.click(screen.getByText('Satış Uzmanı'));
  const panel = await screen.findByTestId('position-permissions');
  expect(within(panel).getByText('Ali Veli')).toBeInTheDocument();
  expect(within(panel).getByTestId('position-perm-count')).toHaveTextContent('Yetki: 1');
  const save = within(panel).getByRole('button', { name: 'Kaydet' });
  expect(save).toBeDisabled();

  // Ticking the whole Satış section adds access_sales.
  fireEvent.click(within(panel).getByRole('checkbox', { name: 'Satış bölümünün tümü' }));
  expect(within(panel).getByTestId('position-perm-count')).toHaveTextContent('Yetki: 2');
  expect(within(panel).getByText('Kaydedilmemiş değişiklikler')).toBeInTheDocument();
  fireEvent.click(within(panel).getByRole('button', { name: 'Vazgeç' }));
  expect(within(panel).getByTestId('position-perm-count')).toHaveTextContent('Yetki: 1');

  fireEvent.click(within(panel).getByRole('checkbox', { name: 'Satış bölümünün tümü' }));
  fireEvent.click(within(panel).getByRole('checkbox', { name: 'Ofis bölümünün tümü' }));
  fireEvent.click(within(panel).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Pozisyon yetkileri kaydedildi'));
  expect(writes()).toEqual([
    { path: '/organization/positions/10/permissions/', method: 'PATCH', body: { codenames: ['access_sales'] } },
  ]);
});

it('permissions tab lists users, overrides and the positions whose detail is known', async () => {
  renderPage();
  fireEvent.click(screen.getByRole('tab', { name: 'Pozisyonlar' }));
  fireEvent.click(await screen.findByText('Satış Uzmanı'));
  await screen.findByTestId('position-permissions');
  fireEvent.click(screen.getByRole('tab', { name: 'Yetkiler' }));
  // The Pozisyonlar tab stays mounted (hidden); look in the open one.
  const tab = screen.getByRole('tabpanel', { name: 'Yetkiler' });
  const sales = (await within(tab).findByText('access_sales')).closest('tr')!;
  expect(within(sales).getByText('ali(+)')).toBeInTheDocument();
  const office = within(tab).getByText('office_access').closest('tr')!;
  expect(within(office).getByText('Satış Uzmanı (L3)')).toBeInTheDocument();
});

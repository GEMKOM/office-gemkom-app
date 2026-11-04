import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { ShiftRulesPage } from './ShiftRulesPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const RULES = [
  {
    id: 1,
    name: 'Standart',
    expected_start: '08:30:00',
    expected_end: '17:30:00',
    overtime_threshold_minutes: 15,
    is_active: true,
    is_default: true,
    assigned_user_count: 40,
  },
  {
    id: 2,
    name: 'Gece',
    expected_start: '22:00:00',
    expected_end: '06:00:00',
    overtime_threshold_minutes: 30,
    is_active: false,
    is_default: false,
    assigned_user_count: 3,
  },
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

function renderPage() {
  return renderWithProviders(
    <ModalsProvider>
      <ShiftRulesPage />
    </ModalsProvider>,
    { route: '/human_resources/attendance/shift-rules/' },
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((_url, init) => {
    const method = init?.method ?? 'GET';
    if (method === 'GET') return json(RULES);
    if (method === 'POST') return json({ id: 3 }, 201);
    if (method === 'PATCH') return json({});
    if (method === 'DELETE') return json(undefined, 204);
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('lists the rules with HH:MM times and offers Varsayılan Yap only off the default', async () => {
  renderPage();
  expect(await screen.findByText('Standart')).toBeInTheDocument();
  expect(screen.getByText('22:00')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Varsayılan Yap' })).toHaveLength(1);

  fireEvent.click(screen.getByRole('button', { name: 'Varsayılan Yap' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Varsayılan kural güncellendi'));
  const patch = calls().find((c) => c.method === 'PATCH')!;
  expect(patch.url.pathname).toBe('/attendance/hr/shift-rules/2/');
  expect(patch.body).toEqual({ is_default: true });
});

it('creates a rule from the legacy defaults', async () => {
  renderPage();
  await screen.findByText('Standart');
  fireEvent.click(screen.getByRole('button', { name: 'Yeni Kural' }));
  const dialog = await screen.findByRole('dialog', { name: 'Yeni Vardiya Kuralı' });

  fireEvent.click(within(dialog).getByRole('button', { name: 'Oluştur' }));
  expect(await within(dialog).findByText('Bu alan gereklidir')).toBeInTheDocument();

  fireEvent.change(within(dialog).getByLabelText(/^Ad/), { target: { value: 'Sabah' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Oluştur' }));

  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Kural oluşturuldu'));
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe('/attendance/hr/shift-rules/');
  expect(post.body).toEqual({
    name: 'Sabah',
    expected_start: '08:30',
    expected_end: '17:30',
    overtime_threshold_minutes: 15,
    is_active: true,
    is_default: false,
  });
});

it('edits a rule and patches the trimmed times', async () => {
  renderPage();
  await screen.findByText('Gece');
  fireEvent.click(screen.getAllByRole('button', { name: 'Düzenle' })[1]!);
  const dialog = await screen.findByRole('dialog', { name: 'Vardiya Kuralı Düzenle' });
  expect(within(dialog).getByLabelText(/Başlangıç/)).toHaveValue('22:00');
  expect(within(dialog).getByLabelText('Aktif')).not.toBeChecked();

  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Kural güncellendi'));
  const patch = calls().find((c) => c.method === 'PATCH')!;
  expect(patch.url.pathname).toBe('/attendance/hr/shift-rules/2/');
  expect(patch.body).toEqual({
    name: 'Gece',
    expected_start: '22:00',
    expected_end: '06:00',
    overtime_threshold_minutes: 30,
    is_active: false,
    is_default: false,
  });
});

it('warns about assigned users before deleting', async () => {
  renderPage();
  await screen.findByText('Gece');
  fireEvent.click(screen.getAllByRole('button', { name: 'Sil' })[1]!);
  expect(await screen.findByText('"Gece" kuralını silmek istiyor musunuz?')).toBeInTheDocument();
  expect(
    screen.getByText('3 kullanıcı bu kurala atanmış. Silerseniz varsayılan kurala geçerler.'),
  ).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'DELETE')).toBe(false);

  fireEvent.click(
    within(screen.getByRole('dialog', { name: 'Sil' })).getByRole('button', { name: 'Sil' }),
  );
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Kural silindi'));
  expect(calls().find((c) => c.method === 'DELETE')!.url.pathname).toBe(
    '/attendance/hr/shift-rules/2/',
  );
});

import { authedFetch } from '@legacy/authService.js';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { GroupsPage } from './GroupsPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const GROUPS = [
  { id: 1, name: 'Kaynakçılar', description: 'Kaynak atölyesi', is_active: true, position_count: 2, member_count: 5 },
  { id: 2, name: 'Eski Grup', description: '', is_active: false, position_count: 1, member_count: 0 },
];
const POSITIONS = [
  { id: 10, title: 'Kaynakçı', level: 3, is_active: true },
  { id: 11, title: 'Usta', level: 2, is_active: true },
  { id: 12, title: 'Formen', level: 1, is_active: true },
  { id: 13, title: 'Eski Pozisyon', is_active: false },
];
const DETAIL = {
  ...GROUPS[0],
  positions: [POSITIONS[0], POSITIONS[1]],
  members: [{ id: 3, full_name: 'Ali Veli', username: 'aliv' }],
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
      <GroupsPage />
    </ModalsProvider>,
    { route: '/it/groups/' },
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url)).pathname;
    if (path === '/organization/groups/' && method === 'GET') return json(GROUPS);
    if (path === '/organization/positions/') return json({ count: 4, results: POSITIONS });
    if (path === '/organization/groups/1/' && method === 'GET') return json(DETAIL);
    if (path === '/organization/groups/' && method === 'POST') return json({ id: 9, name: 'Yeni' }, 201);
    if (path === '/organization/groups/9/') return json({ id: 9, name: 'Yeni', positions: [], members: [] });
    if (method === 'PATCH') return json(DETAIL);
    if (method === 'DELETE') return json(undefined, 204);
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'warning');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('lists the groups with the summed figures', async () => {
  renderPage();
  expect(await screen.findByText('Kaynakçılar')).toBeInTheDocument();
  expect(screen.getByText('Eski Grup')).toBeInTheDocument();
  expect(within(document.getElementById('stat-total')!).getByText('2')).toBeInTheDocument();
  expect(within(document.getElementById('stat-active')!).getByText('1')).toBeInTheDocument();
  expect(within(document.getElementById('stat-positions')!).getByText('3')).toBeInTheDocument();
  expect(within(document.getElementById('stat-members')!).getByText('5')).toBeInTheDocument();
  expect(screen.getByText('Detay görmek için listeden bir grup seçin.')).toBeInTheDocument();
});

it('a row click opens the detail; adding positions sends the merged list', async () => {
  renderPage();
  fireEvent.click(await screen.findByText('Kaynakçılar'));
  const detail = await screen.findByTestId('group-detail');
  expect(within(detail).getByText('Kaynakçı (L3)')).toBeInTheDocument();
  expect(within(detail).getByText('Ali Veli')).toBeInTheDocument();

  // Nothing picked: a warning, no request.
  fireEvent.click(within(detail).getByRole('button', { name: 'Seçilenleri gruba ekle' }));
  expect(notify.warning).toHaveBeenCalledWith('Önce en az bir pozisyon seçin.');
  expect(writes()).toHaveLength(0);

  // Only active positions that are not in the group yet are offered.
  fireEvent.click(within(detail).getByLabelText('Eklenecek pozisyonlar'));
  expect(screen.queryByRole('option', { name: 'Kaynakçı (L3)', hidden: true })).toBeNull();
  expect(screen.queryByRole('option', { name: 'Eski Pozisyon', hidden: true })).toBeNull();
  fireEvent.click(await screen.findByRole('option', { name: 'Formen (L1)', hidden: true }));
  fireEvent.click(within(detail).getByRole('button', { name: 'Seçilenleri gruba ekle' }));

  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Pozisyon gruba eklendi.'));
  expect(writes()).toEqual([
    { path: '/organization/groups/1/positions/', method: 'PATCH', body: { position_ids: [10, 11, 12] } },
  ]);
});

it('removes a position only after the confirm', async () => {
  renderPage();
  fireEvent.click(await screen.findByText('Kaynakçılar'));
  const detail = await screen.findByTestId('group-detail');
  fireEvent.click(within(detail).getByRole('button', { name: 'Usta (L2) gruptan çıkar' }));
  expect(await screen.findByText('"Usta (L2)" pozisyonu bu gruptan kaldırılacak.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Kaldır' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Pozisyon gruptan kaldırıldı.'));
  expect(writes()).toEqual([
    { path: '/organization/groups/1/positions/', method: 'PATCH', body: { position_ids: [10] } },
  ]);
});

it('the create form needs a name and posts the picked positions', async () => {
  renderPage();
  await screen.findByText('Kaynakçılar');
  fireEvent.click(screen.getByRole('button', { name: 'Yeni Grup' }));
  const dialog = await screen.findByRole('dialog', { name: 'Yeni Grup' });

  fireEvent.change(within(dialog).getByLabelText(/Grup adı/), { target: { value: '   ' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  expect(await within(dialog).findByText('Grup adı zorunludur.')).toBeInTheDocument();
  expect(writes()).toHaveLength(0);

  fireEvent.change(within(dialog).getByLabelText(/Grup adı/), { target: { value: ' Yeni ' } });
  fireEvent.click(within(dialog).getByLabelText('Başlangıç pozisyonları (isteğe bağlı)'));
  fireEvent.click(await screen.findByRole('option', { name: 'Usta (L2)', hidden: true }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));

  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Grup oluşturuldu.'));
  expect(writes()).toEqual([
    { path: '/organization/groups/', method: 'POST', body: { name: 'Yeni', is_active: true, position_ids: [11] } },
  ]);
});

it('toggles the status through the confirm', async () => {
  renderPage();
  await screen.findByText('Eski Grup');
  const row = () => screen.getByText('Eski Grup').closest('tr')!;
  fireEvent.click(within(row()).getByRole('button', { name: 'Diğer işlemler' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Durum' }));
  expect(await screen.findByText('"Eski Grup" aktifleştirilecek.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Aktifleştir' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Grup durumu güncellendi.'));
  expect(writes()).toEqual([{ path: '/organization/groups/2/', method: 'PATCH', body: { is_active: true } }]);

});

it('deletes a group only after the confirm', async () => {
  renderPage();
  await screen.findByText('Eski Grup');
  const row = () => screen.getByText('Eski Grup').closest('tr')!;
  fireEvent.click(within(row()).getByRole('button', { name: 'Diğer işlemler' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Sil' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Sil' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Grup silindi.'));
  expect(writes()).toEqual([{ path: '/organization/groups/2/', method: 'DELETE', body: undefined }]);
});

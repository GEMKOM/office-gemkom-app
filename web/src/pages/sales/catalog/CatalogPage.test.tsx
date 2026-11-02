import { authedFetch } from '@legacy/authService.js';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { CatalogPage } from './CatalogPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const TEMPLATES = [
  { id: 1, name: 'MELTSHOP EQUIPMENT', description: 'Çelikhane', is_active: true, node_count: 3 },
  { id: 2, name: '<b>Eski</b>', description: '', is_active: false, node_count: 0 },
];
const DETAIL = {
  ...TEMPLATES[0],
  root_nodes: [
    { id: 10, title: 'Konveyör', description: 'Bant', sequence: 1, children_count: 2 },
    { id: 11, title: 'Kantar', sequence: 2, children_count: 0 },
  ],
};
const CHILDREN = { results: [{ id: 20, title: 'Tambur', sequence: 1, children_count: 0, is_active: false }] };

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
      <CatalogPage />
    </ModalsProvider>,
    { route: '/sales/catalog/' },
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url)).pathname;
    if (path === '/sales/offer-templates/' && method === 'GET') return json(TEMPLATES);
    if (path === '/sales/offer-templates/1/' && method === 'GET') return json(DETAIL);
    if (path === '/sales/offer-templates/1/nodes/10/' && method === 'GET') return json(CHILDREN);
    if (method === 'DELETE') return json(undefined, 204);
    if (method === 'POST' || method === 'PATCH') return json({ id: 99 });
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('lists catalogs (names as text, not HTML) and opens one', async () => {
  renderPage();
  expect(await screen.findByText('MELTSHOP EQUIPMENT')).toBeInTheDocument();
  // Legacy put the name into innerHTML; here it stays text.
  expect(screen.getByText('<b>Eski</b>')).toBeInTheDocument();
  expect(screen.getByText('3 ekipman')).toBeInTheDocument();
  expect(screen.getByText('Ürün ağacını görüntülemek için soldaki listeden bir katalog seçin.')).toBeInTheDocument();

  fireEvent.click(screen.getByText('MELTSHOP EQUIPMENT'));
  const tree = await screen.findByTestId('catalog-tree');
  expect(within(tree).getByText('Konveyör')).toBeInTheDocument();
  expect(within(tree).getByText('#2')).toBeInTheDocument();
});

it('loads children only when a node is opened', async () => {
  renderPage();
  fireEvent.click(await screen.findByText('MELTSHOP EQUIPMENT'));
  const tree = await screen.findByTestId('catalog-tree');
  expect(calls().some((c) => c.path === '/sales/offer-templates/1/nodes/10/')).toBe(false);
  // Kantar has no children: no toggle.
  expect(within(tree).queryByRole('button', { name: 'Kantar genişlet' })).toBeNull();
  fireEvent.click(within(tree).getByRole('button', { name: 'Konveyör genişlet' }));
  expect(await within(tree).findByText('Tambur')).toBeInTheDocument();
});

it('adds a child node with the parent and an integer sequence', async () => {
  renderPage();
  fireEvent.click(await screen.findByText('MELTSHOP EQUIPMENT'));
  const tree = await screen.findByTestId('catalog-tree');
  fireEvent.click(within(tree).getByRole('button', { name: 'Konveyör altına ekipman ekle' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('Alt Ekipman Ekle')).toBeInTheDocument();

  // Title is required.
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  expect(await within(dialog).findByText('Başlık zorunludur.')).toBeInTheDocument();
  expect(writes()).toHaveLength(0);

  fireEvent.change(within(dialog).getByLabelText(/Başlık/), { target: { value: 'Rulman' } });
  fireEvent.change(within(dialog).getByLabelText('Sıra'), { target: { value: '3' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Ekipman eklendi'));
  expect(writes()).toEqual([
    {
      path: '/sales/offer-templates/1/nodes/',
      method: 'POST',
      body: { title: 'Rulman', description: '', sequence: 3, is_active: true, parent: 10 },
    },
  ]);
});

it('deletes a node after the confirm', async () => {
  renderPage();
  fireEvent.click(await screen.findByText('MELTSHOP EQUIPMENT'));
  const tree = await screen.findByTestId('catalog-tree');
  fireEvent.click(within(tree).getByRole('button', { name: 'Kantar sil' }));
  expect(
    await screen.findByText('Bu ekipmanı ve alt ekipmanlarını silmek istediğinize emin misiniz?'),
  ).toBeInTheDocument();
  expect(writes()).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Evet' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Ekipman silindi'));
  expect(writes()).toEqual([{ path: '/sales/offer-templates/1/nodes/11/', method: 'DELETE', body: undefined }]);
});

it('creates and edits catalogs', async () => {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Yeni Katalog' }));
  let dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText(/Katalog Adı/), { target: { value: 'Yeni' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Katalog oluşturuldu'));

  fireEvent.click(screen.getByText('MELTSHOP EQUIPMENT'));
  fireEvent.click(await screen.findByRole('button', { name: 'Düzenle' }));
  dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByLabelText(/Katalog Adı/)).toHaveValue('MELTSHOP EQUIPMENT');
  fireEvent.click(within(dialog).getByLabelText('Aktif'));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Katalog güncellendi'));
  expect(writes()).toEqual([
    { path: '/sales/offer-templates/', method: 'POST', body: { name: 'Yeni', description: '', is_active: true } },
    {
      path: '/sales/offer-templates/1/',
      method: 'PATCH',
      body: { name: 'MELTSHOP EQUIPMENT', description: 'Çelikhane', is_active: false },
    },
  ]);
});

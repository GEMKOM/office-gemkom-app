import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { flattenItems } from './ManageItemsModal';
import { TaskTemplatesPage } from './TaskTemplatesPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const ITEMS = [
  {
    id: 11,
    parent: null,
    title: 'Tasarım',
    department: 'design',
    sequence: 2,
    weight: 20,
    task_type: null,
    depends_on: [12],
    children_count: 1,
    children: [{ id: 21, parent: 11, title: 'Malzeme Listesi', sequence: 1, weight: 5, task_type: 'welding' }],
  },
  { id: 12, parent: null, title: 'Planlama', department: 'planning', sequence: 1, weight: null, depends_on: [], children: [] },
];

const TEMPLATES = [
  {
    id: 1,
    name: 'Standart Üretim Akışı',
    description: 'Varsayılan akış',
    is_active: true,
    is_default: true,
    created_at: '2026-10-01T09:00:00Z',
    created_by_name: 'Ayşe',
    items: ITEMS,
  },
  { id: 2, name: 'Boya Akışı', description: '', is_active: false, is_default: false, items: [] },
];

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(body === undefined ? null : JSON.stringify(body), { status }));
}

type Call = { url: URL; method: string; body: unknown };
function calls(): Call[] {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: new URL(String(url)),
    method: init?.method ?? 'GET',
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
  }));
}
const callsTo = (method: string, path: string) => calls().filter((c) => c.method === method && c.url.pathname === path);
const listCalls = () => callsTo('GET', '/projects/task-templates/');

let patchStatus = 200;
let patchBody: unknown = {};

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/planning/task-templates/') {
  return renderWithProviders(
    <ModalsProvider>
      <TaskTemplatesPage />
      <LocationProbe />
    </ModalsProvider>,
    { route },
  );
}

beforeEach(() => {
  patchStatus = 200;
  patchBody = {};
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url)).pathname;
    if (method === 'GET' && path === '/projects/task-templates/') {
      return json({ count: 2, next: null, previous: null, results: TEMPLATES });
    }
    if (method === 'GET' && path === '/projects/task-templates/department_choices/') {
      return json([{ value: 'design', label: 'Tasarım' }, { value: 'planning', label: 'Planlama' }]);
    }
    if (method === 'GET' && path === '/projects/task-templates/task_type_choices/') {
      return json([{ value: 'welding', label: 'Kaynaklı İmalat' }]);
    }
    if (method === 'GET' && path === '/projects/task-templates/1/') return json(TEMPLATES[0]);
    if (method === 'GET' && path === '/projects/task-templates/1/items/') return json(ITEMS);
    if (method === 'PATCH') return json(patchBody, patchStatus);
    if (method === 'POST') return json({ id: 99 }, 201);
    if (method === 'PUT') return json({ id: 1 });
    if (method === 'DELETE') return json(undefined, 204);
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('lists the templates newest first with the item count', async () => {
  renderPage();
  expect(await screen.findByText('Standart Üretim Akışı')).toBeInTheDocument();
  expect(screen.getByText('Boya Akışı')).toBeInTheDocument();
  const first = document.querySelector<HTMLElement>('tr[data-row-id="1"]')!;
  expect(within(first).getByText('Varsayılan')).toBeInTheDocument();
  expect(within(first).getByText('Aktif')).toBeInTheDocument();
  expect(within(first).getByText('2')).toBeInTheDocument();
  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({ page: '1', ordering: '-created_at' });
});

it('filters go to the URL and reach the request as booleans', async () => {
  renderPage('/planning/task-templates/?is_active=false&search=boya');
  await screen.findByText('Boya Akışı');
  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    page: '1',
    ordering: '-created_at',
    search: 'boya',
    is_active: 'false',
  });

  fireEvent.change(screen.getByLabelText('Ara'), { target: { value: 'akış' } });
  fireEvent.keyDown(screen.getByLabelText('Ara'), { key: 'Enter' });
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('search=ak'));
  await waitFor(() => expect(listCalls()).toHaveLength(2));
  expect(listCalls()[1]!.url.searchParams.get('search')).toBe('akış');
});

it('creates a template with the legacy body', async () => {
  renderPage();
  await screen.findByText('Boya Akışı');
  fireEvent.click(screen.getByRole('button', { name: 'Yeni Şablon' }));
  const dialog = await screen.findByRole('dialog', { name: 'Yeni Görev Şablonu Oluştur' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Şablon Oluştur' }));
  expect(await within(dialog).findByText('Bu alan gereklidir')).toBeInTheDocument();

  fireEvent.change(within(dialog).getByLabelText(/Şablon Adı/), { target: { value: 'Yeni Akış' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Şablon Oluştur' }));
  await waitFor(() => expect(callsTo('POST', '/projects/task-templates/')).toHaveLength(1));
  expect(callsTo('POST', '/projects/task-templates/')[0]!.body).toEqual({
    name: 'Yeni Akış',
    description: '',
    is_active: true,
    is_default: false,
  });
  expect(notify.success).toHaveBeenCalledWith('Şablon başarıyla oluşturuldu');
});

it('edits a template from a fresh copy with PUT', async () => {
  renderPage();
  await screen.findByText('Standart Üretim Akışı');
  const row = document.querySelector<HTMLElement>('tr[data-row-id="1"]')!;
  fireEvent.click(within(row).getByRole('button', { name: 'Düzenle' }));
  const dialog = await screen.findByRole('dialog', { name: 'Görev Şablonu Düzenle' });
  expect(within(dialog).getByLabelText(/Şablon Adı/)).toHaveValue('Standart Üretim Akışı');
  fireEvent.click(within(dialog).getByLabelText('Aktif'));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Değişiklikleri Kaydet' }));
  await waitFor(() => expect(callsTo('PUT', '/projects/task-templates/1/')).toHaveLength(1));
  expect(callsTo('PUT', '/projects/task-templates/1/')[0]!.body).toEqual({
    name: 'Standart Üretim Akışı',
    description: 'Varsayılan akış',
    is_active: false,
    is_default: true,
  });
});

it('deletes a template after the confirm', async () => {
  renderPage();
  await screen.findByText('Standart Üretim Akışı');
  const row = document.querySelector<HTMLElement>('tr[data-row-id="1"]')!;
  fireEvent.click(within(row).getByRole('button', { name: 'Sil' }));
  const dialog = await screen.findByRole('dialog', { name: 'Şablon Silme Onayı' });
  expect(dialog).toHaveTextContent('"Standart Üretim Akışı" şablonunu silmek istediğinizden emin misiniz?');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Sil' }));
  await waitFor(() => expect(callsTo('DELETE', '/projects/task-templates/1/')).toHaveLength(1));
  expect(notify.success).toHaveBeenCalledWith('Şablon başarıyla silindi');
});

describe('Görevleri Yönet', () => {
  async function openManage() {
    renderPage();
    await screen.findByText('Standart Üretim Akışı');
    const row = document.querySelector<HTMLElement>('tr[data-row-id="1"]')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Görevleri Yönet' }));
    const dialog = await screen.findByRole('dialog', { name: 'Standart Üretim Akışı - Görev Yönetimi' });
    await within(dialog).findByText('Malzeme Listesi');
    return dialog;
  }
  const cell = (rowId: string, col: string) =>
    document.querySelector<HTMLElement>(`tr[data-row-id="${rowId}"] td[data-col="${col}"]`)!;

  it('flattens main items by sequence with their children after them', () => {
    const rows = flattenItems(ITEMS, [{ value: 'design', label: 'Tasarım' }]);
    expect(rows.map((r) => r.id)).toEqual([12, 11, 21]);
    expect(rows[1]).toMatchObject({ depends_on: 'Planlama', children_count: 1, isChildItem: false });
    expect(rows[2]).toMatchObject({ isChildItem: true, parentId: 11, department_display: 'Tasarım', weight: 5 });
    // A missing weight shows as the legacy default 10.
    expect(rows[0]!.weight).toBe(10);
  });

  it('shows the template info and the item table', async () => {
    const dialog = await openManage();
    expect(within(dialog).getByText('Şablon Görevleri')).toBeInTheDocument();
    expect(within(dialog).getByText('(2 ana + 0 alt görev)', { exact: false })).toBeInTheDocument();
    expect(within(dialog).getByText('1 alt görev')).toBeInTheDocument();
    expect(within(dialog).getByText('Kaynaklı İmalat')).toBeInTheDocument();
  });

  it('edits a weight inline and PATCHes it', async () => {
    await openManage();
    fireEvent.click(cell('21', 'weight'));
    const input = screen.getByRole('textbox', { name: 'Ağırlık' });
    expect(input).toHaveValue('5');
    fireEvent.change(input, { target: { value: '40' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(callsTo('PATCH', '/projects/task-templates/1/items/21/')).toHaveLength(1));
    expect(callsTo('PATCH', '/projects/task-templates/1/items/21/')[0]!.body).toEqual({ weight: 40 });
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Ağırlık başarıyla güncellendi'));
    expect(cell('21', 'weight')).toHaveTextContent('40');
  });

  it('refuses a weight outside 1-100 without a request', async () => {
    await openManage();
    fireEvent.click(cell('11', 'weight'));
    const input = screen.getByRole('textbox', { name: 'Ağırlık' });
    fireEvent.change(input, { target: { value: '150' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(callsTo('PATCH', '/projects/task-templates/1/items/11/')).toHaveLength(0);
    expect(notify.error).toHaveBeenCalled();
  });

  it('a rejected weight rolls back and shows the backend message', async () => {
    patchStatus = 400;
    patchBody = { weight: ['Geçersiz ağırlık.'] };
    await openManage();
    fireEvent.click(cell('11', 'weight'));
    const input = screen.getByRole('textbox', { name: 'Ağırlık' });
    fireEvent.change(input, { target: { value: '30' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(cell('11', 'weight')).toHaveAttribute('data-cell-state', 'error'));
    expect(cell('11', 'weight')).toHaveTextContent('20');
    expect(notify.error).toHaveBeenCalledWith(expect.objectContaining({ message: 'Geçersiz ağırlık.' }), expect.anything());
  });

  it('adds a main item with the legacy payload', async () => {
    const dialog = await openManage();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ana Görev Ekle' }));
    const add = await screen.findByRole('dialog', { name: 'Ana Görev Ekle' });
    expect(within(add).getByLabelText('Sıra')).toHaveValue(3);
    fireEvent.click(within(add).getByRole('button', { name: 'Görev Ekle' }));
    expect(await within(add).findByText('Bu alan gereklidir')).toBeInTheDocument();
  });

  it('adds a child item under its parent', async () => {
    await openManage();
    const row = document.querySelector<HTMLElement>('tr[data-row-id="11"]')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Alt Görev Ekle' }));
    const add = await screen.findByRole('dialog', { name: 'Alt Görev Ekle' });
    expect(within(add).getByLabelText('Sıra')).toHaveValue(2);
    fireEvent.change(within(add).getByLabelText(/Alt Görev Başlığı/), { target: { value: 'İş Programı' } });
    fireEvent.click(within(add).getByRole('button', { name: 'Alt Görev Ekle' }));
    await waitFor(() => expect(callsTo('POST', '/projects/task-templates/1/items/11/children/')).toHaveLength(1));
    expect(callsTo('POST', '/projects/task-templates/1/items/11/children/')[0]!.body).toEqual({
      title: 'İş Programı',
      sequence: 2,
      weight: 10,
      task_type: null,
    });
    expect(notify.success).toHaveBeenCalledWith('Alt görev başarıyla eklendi');
    // Child rows have no "Alt Görev Ekle".
    const child = document.querySelector<HTMLElement>('tr[data-row-id="21"]')!;
    expect(within(child).queryByRole('button', { name: 'Alt Görev Ekle' })).not.toBeInTheDocument();
  });

  it('removes an item after the confirm', async () => {
    await openManage();
    const row = document.querySelector<HTMLElement>('tr[data-row-id="12"]')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Sil' }));
    const confirmDialog = await screen.findByRole('dialog', { name: 'Görev Silme Onayı' });
    fireEvent.click(within(confirmDialog).getByRole('button', { name: 'Sil' }));
    await waitFor(() => expect(callsTo('DELETE', '/projects/task-templates/1/items/12/')).toHaveLength(1));
    expect(notify.success).toHaveBeenCalledWith('Görev başarıyla silindi');
  });
});

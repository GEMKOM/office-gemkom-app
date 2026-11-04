import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { DepartmentRequestsListPage } from './DepartmentRequestsListPage';

// Mantine modals with many fields are slow in jsdom when the whole suite runs in parallel.
vi.setConfig({ testTimeout: 20_000 });

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const ROWS = [
  {
    id: 11,
    title: 'Taslak talep',
    department: 'maintenance',
    priority: 'urgent',
    status: 'draft',
    status_label: 'Taslak',
    items_count: 2,
    planning_request_keys: ['GS-10162'],
  },
  {
    id: 12,
    title: 'Gönderilen talep',
    department_label: 'İmalat',
    priority: 'normal',
    status: 'submitted',
    status_label: 'Gönderildi',
    items_count: 1,
  },
  {
    id: 13,
    title: 'Onaylı talep',
    department: 'it',
    priority: 'critical',
    status: 'approved',
    status_label: 'Onaylandı',
    items_count: 0,
  },
];

const DETAIL = {
  ...ROWS[0],
  request_number: 'DR-11',
  requestor_full_name: 'Ali Veli',
  description: 'Bakım için malzeme',
  purchase_request_keys: [],
  items: [{ item_code: 'K-1', item_name: 'Rulman', quantity: 4, item_unit: 'adet' }],
  files: [{ id: 1, file_name: 'uploads/teklif.pdf', file_url: 'https://files.test/teklif.pdf' }],
};

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
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body,
  }));
}
const listCalls = () =>
  calls().filter((c) => c.method === 'GET' && c.url.pathname === '/planning/department-requests/');

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/general/department-requests/list') {
  return renderWithProviders(
    <ModalsProvider>
      <DepartmentRequestsListPage />
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
    if (method === 'GET' && path === '/planning/department-requests/') {
      return json({ count: 3, next: null, previous: null, results: ROWS });
    }
    if (method === 'GET' && path === '/planning/department-requests/11/') return json(DETAIL);
    if (method === 'GET' && path === '/users/dropdown/') {
      return json([{ id: 5, username: 'ali', full_name: 'Ali Veli' }]);
    }
    if (method === 'GET' && path === '/projects/job-orders/dropdown/') {
      return json([{ job_no: '254-01', title: 'Vinç' }]);
    }
    if (method === 'POST') return json({ id: 99 }, 201);
    if (method === 'PATCH') return json({ id: 11 });
    if (method === 'DELETE') return json(undefined, 204);
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
  vi.spyOn(notify, 'info');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('renders the rows with the legacy request and status-dependent actions', async () => {
  renderPage();
  expect(screen.getByText('Tüm Departman Talepleri')).toBeInTheDocument();
  expect(await screen.findByText('Taslak talep')).toBeInTheDocument();
  expect(screen.getByText('GS-10162')).toBeInTheDocument();
  expect(screen.getByText('Bakım')).toBeInTheDocument();
  expect(screen.getByText('İmalat')).toBeInTheDocument();
  expect(screen.getByText('Kritik')).toBeInTheDocument();
  expect(screen.getByText('2 ürün')).toBeInTheDocument();

  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    page: '1',
    page_size: '20',
    ordering: '-id',
  });

  const row = (title: string) => screen.getByText(title).closest('tr')!;
  // Edit: draft / submitted. Delete: draft / cancelled.
  expect(within(row('Taslak talep')).getByRole('button', { name: 'Düzenle' })).toBeInTheDocument();
  expect(within(row('Taslak talep')).getByRole('button', { name: 'Sil' })).toBeInTheDocument();
  expect(
    within(row('Gönderilen talep')).getByRole('button', { name: 'Düzenle' }),
  ).toBeInTheDocument();
  expect(within(row('Gönderilen talep')).queryByRole('button', { name: 'Sil' })).toBeNull();
  expect(within(row('Onaylı talep')).queryByRole('button', { name: 'Düzenle' })).toBeNull();
  expect(within(row('Onaylı talep')).queryByRole('button', { name: 'Sil' })).toBeNull();
});

it('sends URL filters with the legacy param names and writes typed search to the URL', async () => {
  renderPage(
    '/general/department-requests/list?status=submitted&department=it&priority=urgent&requestor=5&page=2',
  );
  await screen.findByText('Taslak talep');
  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    page: '2',
    page_size: '20',
    ordering: '-id',
    status: 'submitted',
    department: 'it',
    priority: 'urgent',
    requestor: '5',
  });

  const search = screen.getByLabelText('Ara');
  fireEvent.change(search, { target: { value: 'GS-10162' } });
  fireEvent.keyDown(search, { key: 'Enter' });
  await waitFor(() => {
    const params = new URLSearchParams(screen.getByTestId('location').textContent ?? '');
    expect(params.get('search')).toBe('GS-10162');
    expect(params.has('page')).toBe(false);
  });
  await waitFor(() => expect(listCalls().at(-1)!.url.searchParams.get('search')).toBe('GS-10162'));
  expect(listCalls().at(-1)!.url.searchParams.get('page')).toBe('1');
});

it('create validates the title, requires an item and posts multipart data', async () => {
  renderPage();
  await screen.findByText('Taslak talep');
  fireEvent.click(screen.getByRole('button', { name: 'Yeni Talep Oluştur' }));
  const dialog = await screen.findByRole('dialog', { name: 'Yeni Departman Talebi' });

  fireEvent.click(within(dialog).getByRole('button', { name: 'Oluştur' }));
  expect(await within(dialog).findByText('Bu alan gereklidir')).toBeInTheDocument();

  fireEvent.change(within(dialog).getByLabelText(/Başlık/), {
    target: { value: 'Rulman ihtiyacı' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Oluştur' }));
  await waitFor(() => expect(notify.error).toHaveBeenCalledWith('En az bir ürün eklemelisiniz'));
  expect(calls().some((c) => c.method === 'POST')).toBe(false);

  // A nameless row is skipped; the named one is sent.
  fireEvent.click(within(dialog).getByRole('button', { name: 'Ürün Ekle' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Ürün Ekle' }));
  expect(within(dialog).getAllByTestId('item-row')).toHaveLength(2);
  fireEvent.change(within(dialog).getByLabelText('Ürün adı 2'), { target: { value: 'Rulman' } });
  fireEvent.change(within(dialog).getByLabelText('Ürün kodu 2'), { target: { value: 'K-1' } });
  fireEvent.change(within(dialog).getByLabelText('Miktar 2'), { target: { value: '3' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Oluştur' }));

  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Departman talebi başarıyla oluşturuldu'),
  );
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe('/planning/department-requests/');
  const body = post.body as FormData;
  expect(body).toBeInstanceOf(FormData);
  expect(body.get('title')).toBe('Rulman ihtiyacı');
  expect(body.get('priority')).toBe('normal');
  expect(body.has('needed_date')).toBe(false);
  expect(JSON.parse(String(body.get('items')))).toEqual([
    {
      item_code: 'K-1',
      item_name: 'Rulman',
      job_no: null,
      item_unit: null,
      quantity: 3,
      item_description: null,
      item_specifications: null,
    },
  ]);
  expect(body.has('file_item_mapping')).toBe(false);
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Yeni Departman Talebi' })).toBeNull(),
  );
});

it('removing an item row keeps a file mapped to the later row', async () => {
  renderPage();
  await screen.findByText('Taslak talep');
  fireEvent.click(screen.getByRole('button', { name: 'Yeni Talep Oluştur' }));
  const dialog = await screen.findByRole('dialog', { name: 'Yeni Departman Talebi' });
  fireEvent.change(within(dialog).getByLabelText(/Başlık/), { target: { value: 'T' } });
  for (let i = 0; i < 3; i += 1)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ürün Ekle' }));
  ['A', 'B', 'C'].forEach((name, i) =>
    fireEvent.change(within(dialog).getByLabelText(`Ürün adı ${i + 1}`), {
      target: { value: name },
    }),
  );

  const file = new File(['x'], 'cizim.pdf', { type: 'application/pdf' });
  const input = dialog.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
  expect(await within(dialog).findByText('0.00 KB')).toBeInTheDocument();

  // Map to item C only (the file must keep a target, so check C before unchecking Talep).
  fireEvent.click(within(dialog).getByRole('checkbox', { name: 'C' }));
  fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Talep' }));
  // Remove item A: C moves from index 2 to 1.
  fireEvent.click(within(dialog).getAllByRole('button', { name: 'Ürünü Kaldır' })[0]!);
  expect(within(dialog).getByRole('checkbox', { name: 'C' })).toBeChecked();

  fireEvent.click(within(dialog).getByRole('button', { name: 'Oluştur' }));
  await waitFor(() => expect(calls().some((c) => c.method === 'POST')).toBe(true));
  const body = calls().find((c) => c.method === 'POST')!.body as FormData;
  expect(body.getAll('files')).toHaveLength(1);
  expect(JSON.parse(String(body.get('file_item_mapping')))).toEqual({ '0': [1] });
  expect(
    JSON.parse(String(body.get('items'))).map((i: { item_name: string }) => i.item_name),
  ).toEqual(['B', 'C']);
});

it('edit patches the four basic fields', async () => {
  renderPage();
  await screen.findByText('Taslak talep');
  fireEvent.click(
    within(screen.getByText('Taslak talep').closest('tr')!).getByRole('button', {
      name: 'Düzenle',
    }),
  );
  const dialog = await screen.findByRole('dialog', { name: 'Departman Talebini Düzenle' });
  // Items and files of the full record are shown read-only.
  expect(within(dialog).getByText('Rulman')).toBeInTheDocument();
  expect(within(dialog).getByText('teklif.pdf')).toBeInTheDocument();

  fireEvent.change(within(dialog).getByLabelText(/Başlık/), { target: { value: 'Yeni başlık' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Departman talebi başarıyla güncellendi'),
  );
  const patch = calls().find((c) => c.method === 'PATCH')!;
  expect(patch.url.pathname).toBe('/planning/department-requests/11/');
  expect(patch.body).toEqual({
    title: 'Yeni başlık',
    description: 'Bakım için malzeme',
    priority: 'urgent',
    needed_date: null,
  });
});

it('deletes only after the confirm', async () => {
  renderPage();
  await screen.findByText('Taslak talep');
  fireEvent.click(screen.getByRole('button', { name: 'Sil' }));
  expect(
    await screen.findByText(
      'Bu departman talebini silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.',
    ),
  ).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'DELETE')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Evet, Sil' }));
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Departman talebi başarıyla silindi'),
  );
  expect(calls().find((c) => c.method === 'DELETE')!.url.pathname).toBe(
    '/planning/department-requests/11/',
  );
});

it('?request=<id> opens the details with items and files', async () => {
  renderPage('/general/department-requests/list?request=11');
  const dialog = await screen.findByRole('dialog', { name: 'Departman Talebi Detayları' });
  expect(await within(dialog).findByText('DR-11')).toBeInTheDocument();
  expect(within(dialog).getByText('Ali Veli')).toBeInTheDocument();
  expect(within(dialog).getByText('Rulman')).toBeInTheDocument();
  expect(within(dialog).getByText('teklif.pdf')).toHaveAttribute(
    'href',
    'https://files.test/teklif.pdf',
  );

  fireEvent.click(within(dialog).getAllByRole('button', { name: 'Kapat' }).at(-1)!);
  await waitFor(() => expect(screen.getByTestId('location').textContent).not.toContain('request='));
});

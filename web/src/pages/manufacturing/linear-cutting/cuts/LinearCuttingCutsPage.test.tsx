import { authedFetch } from '@legacy/authService.js';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { searchOpenJobOrders, searchStockItems } from '@/api/manufacturing/linearCuttingSessions';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { LinearCuttingCutsPage } from './LinearCuttingCutsPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const SESSION = {
  key: 'LC-0001',
  title: 'Korkuluk',
  stock_length_mm: 6000,
  kerf_mm: '3.00',
  notes: 'not',
  tasks_created: false,
  planning_request_created: false,
  stock_entry_complete: true,
  optimization_summary: [{ bars_needed: 2 }],
  stock_bars: [
    {
      item_code: 'BR-40',
      item_name: 'Boru 40x40',
      length_mm: 6000,
      quantity: 2,
      item_unit: 'adet',
      declared_by_username: 'ayse',
    },
    { item_code: 'BR-40', item_name: 'Boru 40x40', length_mm: 3000, quantity: 1 },
  ],
  optimization_result: {
    warnings: ['Kesit şüpheli görünüyor'],
    groups: [
      {
        item_name: 'Boru 40x40',
        stock_length_mm: 6000,
        kerf_mm: 3,
        bars_needed: 2,
        efficiency_pct: 91.5,
        total_waste_mm: 800,
        total_pass_count: 3,
        bars: [
          {
            bar_index: 1,
            global_bar_index: 1,
            stock_length_mm: 6000,
            waste_mm: 400,
            is_remnant: true,
            cuts: [{ label: 'Dikme', nominal_mm: 1000, offset_mm: 0 }],
            passes: [{ seq: 1, kind: 'end', releases: 'Dikme' }],
          },
        ],
      },
      { item_code: 'NPU-80', bars_needed: 0, efficiency_pct: 80, total_waste_mm: 0, bars: [] },
    ],
  },
};

const PARTS = [
  {
    id: 12,
    item: 5,
    item_name: 'Boru 40x40',
    item_code: 'BR-40',
    label: '',
    nominal_length_mm: '800.00',
    quantity: 1,
    angle_left_deg: 45,
    angle_right_deg: 0,
    profile_height_mm: 0,
    setback_left_mm: '40.00',
    job_no: '',
    order: 2,
  },
  {
    id: 11,
    item: 5,
    item_name: 'Boru 40x40',
    item_code: 'BR-40',
    label: 'Dikme',
    image_no: 'R-7',
    nominal_length_mm: '1000.00',
    quantity: 2,
    angle_left_deg: 0,
    angle_right_deg: 0,
    profile_height_mm: 40,
    job_no: '254-01',
    order: 1,
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
const callsTo = (method: string, path: string) =>
  calls().filter((c) => c.method === method && c.url.pathname === path);

type Handler = (call: { method: string; path: string; body: unknown }) => Promise<Response> | null;
let extra: Handler = () => null;

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/planning/linear-cutting/cuts/?session=LC-0001') {
  return renderWithProviders(
    <ModalsProvider>
      <LinearCuttingCutsPage />
      <LocationProbe />
    </ModalsProvider>,
    { route },
  );
}

beforeEach(() => {
  extra = () => null;
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url)).pathname;
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const custom = extra({ method, path, body });
    if (custom) return custom;
    if (method === 'GET' && path === '/linear_cutting/sessions/') {
      return json({ count: 2, results: [SESSION, { key: 'LC-0002', title: 'Merdiven' }] });
    }
    if (method === 'GET' && path === '/linear_cutting/sessions/LC-0001/') return json(SESSION);
    if (method === 'GET' && path === '/linear_cutting/parts/') return json(PARTS);
    if (method === 'GET' && path === '/linear_cutting/tasks/LC-0001-01/') {
      return json({ key: 'LC-0001-01', session: 'LC-0001' });
    }
    if (method === 'PATCH' && path.startsWith('/linear_cutting/parts/')) return json({ id: 1 });
    if (method === 'DELETE') return json(undefined, 204);
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'info');
  vi.spyOn(notify, 'warning');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

const partRow = (id: number | string) =>
  screen.getAllByRole('row').find((r) => r.getAttribute('data-row-id') === `p-${id}`)!;

it('shows the empty state until a plan is chosen', async () => {
  renderPage('/planning/linear-cutting/cuts/');
  expect(screen.getByRole('heading', { name: 'Lineer Kesim' })).toBeInTheDocument();
  expect(screen.getByText(/Bir kesim planı seçin veya/)).toBeInTheDocument();
  await waitFor(() => expect(callsTo('GET', '/linear_cutting/sessions/')).toHaveLength(1));
  expect(callsTo('GET', '/linear_cutting/sessions/')[0]!.url.searchParams.get('ordering')).toBe(
    '-created_at',
  );
});

it('loads the plan from ?session=: details, parts in order, stock bars and the result', async () => {
  renderPage();
  expect(await screen.findByDisplayValue('Korkuluk')).toBeInTheDocument();
  expect(screen.getByLabelText('Plan No')).toHaveValue('LC-0001');
  expect(screen.getByDisplayValue('6000')).toBeInTheDocument();
  expect(screen.getByDisplayValue('3')).toBeInTheDocument();
  expect(screen.getByDisplayValue('not')).toBeInTheDocument();
  // (The matcher collapses the label's double spaces.)
  expect(
    await screen.findByDisplayValue('LC-0001 — Korkuluk · 2 bar · Stok: Tamam'),
  ).toBeInTheDocument();

  // Sorted by order; a part without a name shows a dash.
  expect(await screen.findByText('Dikme', { selector: 'div' })).toBeInTheDocument();
  const bodyRows = screen.getAllByRole('row').filter((r) => r.getAttribute('data-row-id'));
  expect(bodyRows.map((r) => r.getAttribute('data-row-id'))).toEqual(['p-11', 'p-12']);
  expect(within(bodyRows[1]!).getByText('45° (alt uzun)')).toBeInTheDocument();
  expect(within(bodyRows[0]!).getByText('254-01')).toBeInTheDocument();

  // Result: summary, warnings (also as toasts), a tab per material.
  expect(screen.getByText('91.5%', { exact: false })).toBeInTheDocument();
  expect(screen.getByText('800 mm')).toBeInTheDocument();
  expect(screen.getByText('2 profil grubu')).toBeInTheDocument();
  expect(screen.getByText('Kesit şüpheli görünüyor')).toBeInTheDocument();
  expect(notify.warning).toHaveBeenCalledWith('Kesit şüpheli görünüyor');
  expect(screen.getByRole('tab', { name: 'NPU-80' })).toBeInTheDocument();
  expect(screen.getByText('Bar #1')).toBeInTheDocument();
  expect(screen.getByText('Stoktan')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Kesim sırası (1)' }));
  expect(await screen.findByText('Parça ayırma')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Stok Barlar (3)' }));
  const modal = await screen.findByRole('dialog');
  expect(within(modal).getByText('ayse')).toBeInTheDocument();
  expect(within(modal).getByText('3000')).toBeInTheDocument();
});

it('opens the plan of a ?task= link', async () => {
  renderPage('/planning/linear-cutting/cuts/?task=LC-0001-01');
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('?session=LC-0001'));
  expect(await screen.findByDisplayValue('Korkuluk')).toBeInTheDocument();
});

it('saves the plan details', async () => {
  extra = ({ method, path }) =>
    method === 'PATCH' && path === '/linear_cutting/sessions/LC-0001/'
      ? json({ ...SESSION, title: 'Korkuluk B' })
      : null;
  renderPage();
  fireEvent.change(await screen.findByDisplayValue('Korkuluk'), {
    target: { value: 'Korkuluk B' },
  });
  fireEvent.change(screen.getByLabelText('Kerf (mm)'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Plan kaydedildi.'));
  expect(callsTo('PATCH', '/linear_cutting/sessions/LC-0001/')[0]!.body).toEqual({
    title: 'Korkuluk B',
    stock_length_mm: 6000,
    kerf_mm: 3,
    notes: 'not',
  });
});

it('copies a part into a new row and bulk-saves it, naming unnamed parts in one go', async () => {
  extra = ({ method, path }) =>
    method === 'POST' && path === '/linear_cutting/parts/'
      ? json([{ id: 21 }, { id: 22 }], 201)
      : null;
  renderPage();
  await screen.findByText('Dikme', { selector: 'div' });
  expect(screen.getByRole('button', { name: 'Toplu Kaydet' })).toBeDisabled();

  fireEvent.click(within(partRow(11)).getByRole('button', { name: 'Kopyala' }));
  fireEvent.click(within(partRow(12)).getByRole('button', { name: 'Kopyala' }));

  const newRows = screen
    .getAllByRole('row')
    .filter((r) => r.getAttribute('data-row-id')?.startsWith('new-'));
  expect(newRows).toHaveLength(2);
  // The newest copy comes first and takes the next order.
  expect(within(newRows[0]!).getByLabelText('Sıra')).toHaveValue(4);
  expect(within(newRows[1]!).getByLabelText('Parça Adı')).toHaveValue('Dikme');
  fireEvent.change(within(newRows[1]!).getByLabelText('Adet'), { target: { value: '5' } });

  fireEvent.click(screen.getByRole('button', { name: 'Toplu Kaydet' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('2 parça kaydedildi.'));
  const [post] = callsTo('POST', '/linear_cutting/parts/');
  expect(post!.body).toEqual([
    expect.objectContaining({
      session: 'LC-0001',
      item: 5,
      label: '',
      nominal_length_mm: 800,
      angle_left_deg: 45,
      setback_left_mm: 40,
      order: 4,
    }),
    expect.objectContaining({ label: 'Dikme', quantity: 5, job_no: '254-01', order: 3 }),
  ]);
  // Only the unnamed one is renamed.
  expect(callsTo('PATCH', '/linear_cutting/parts/21/').map((c) => c.body)).toEqual([
    { label: 'Parça 21' },
  ]);
  expect(callsTo('PATCH', '/linear_cutting/parts/22/')).toHaveLength(0);
  await waitFor(() => expect(callsTo('GET', '/linear_cutting/parts/')).toHaveLength(2));
});

it('refuses to bulk-save an invalid new row', async () => {
  renderPage();
  await screen.findByText('Dikme', { selector: 'div' });
  fireEvent.click(screen.getByRole('button', { name: 'Parça Ekle' }));
  fireEvent.click(screen.getByRole('button', { name: 'Toplu Kaydet' }));
  expect(notify.warning).toHaveBeenCalledWith('Satır 1: Malzeme seçilmelidir.');
  expect(callsTo('POST', '/linear_cutting/parts/')).toHaveLength(0);

  // A new row can be removed again.
  const newRow = screen
    .getAllByRole('row')
    .find((r) => r.getAttribute('data-row-id')?.startsWith('new-'))!;
  fireEvent.click(within(newRow).getByRole('button', { name: 'Satırı Kaldır' }));
  expect(screen.getByRole('button', { name: 'Toplu Kaydet' })).toBeDisabled();
});

it('searches stock items and open job orders as the legacy dropdowns did', async () => {
  extra = ({ method, path }) => {
    if (method === 'GET' && path === '/procurement/items/') {
      return json({ results: [{ id: 8, name: 'Lama 40x5', code: 'LM-40', unit: 'kg' }] });
    }
    if (method === 'GET' && path === '/projects/job-orders/') {
      return json({ results: [{ job_no: '254-01', title: 'Kazan' }, { job_no: '254-02' }] });
    }
    return null;
  };
  expect(await searchStockItems('la')).toEqual([{ value: '8', label: 'Lama 40x5 — LM-40 • kg' }]);
  expect(Object.fromEntries(callsTo('GET', '/procurement/items/')[0]!.url.searchParams)).toEqual({
    search: 'la',
    page_size: '20',
    item_type: 'stock',
  });
  expect(await searchOpenJobOrders('25')).toEqual([
    { value: '254-01', label: '254-01 — Kazan' },
    { value: '254-02', label: '254-02' },
  ]);
  expect(Object.fromEntries(callsTo('GET', '/projects/job-orders/')[0]!.url.searchParams)).toEqual({
    search: '25',
    page_size: '20',
    ordering: '-created_at',
    status__in: 'active,draft,on_hold',
  });
});

it('edits a saved part in place and saves it with a default name', async () => {
  renderPage();
  await screen.findByText('Dikme', { selector: 'div' });
  const unnamed = () => partRow(12);
  fireEvent.click(within(unnamed()).getByRole('button', { name: 'Düzenle' }));
  fireEvent.change(within(unnamed()).getByLabelText('Uzunluk (mm)'), { target: { value: '900' } });
  fireEvent.click(within(unnamed()).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Parça güncellendi.'));
  expect(callsTo('PATCH', '/linear_cutting/parts/12/')[0]!.body).toMatchObject({
    label: 'Parça 12',
    nominal_length_mm: 900,
    setback_left_mm: 40,
    profile_height_mm: 0,
  });

  // Cancel leaves the row as it was.
  fireEvent.click(within(partRow(11)).getByRole('button', { name: 'Düzenle' }));
  fireEvent.change(within(partRow(11)).getByLabelText('Parça Adı'), { target: { value: 'X' } });
  fireEvent.click(screen.getByRole('button', { name: 'İptal' }));
  expect(screen.getByText('Dikme', { selector: 'div' })).toBeInTheDocument();
});

it('derives an angle from the corner offset in the measurement panel', async () => {
  renderPage();
  await screen.findByText('Dikme', { selector: 'div' });
  const row = () => partRow(11);
  fireEvent.click(within(row()).getByRole('button', { name: 'Düzenle' }));
  fireEvent.click(within(row()).getByRole('button', { name: 'Ölçü paneli' }));
  expect(screen.getByText('Kenar ölçüsünden açı')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Sağ uç köşe farkı (mm)'), { target: { value: '40' } });
  fireEvent.change(screen.getByLabelText('Sağ uç uzun kenar'), { target: { value: 'far' } });
  expect(within(row()).getByLabelText('Sağ Açı')).toHaveValue(-45);
  // Typing the angle by hand clears the measurement.
  fireEvent.change(within(row()).getByLabelText('Sağ Açı'), { target: { value: '10' } });
  expect(screen.getByLabelText('Sağ uç köşe farkı (mm)')).toHaveValue(null);
  fireEvent.click(within(row()).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(callsTo('PATCH', '/linear_cutting/parts/11/')).toHaveLength(1));
  expect(callsTo('PATCH', '/linear_cutting/parts/11/')[0]!.body).toMatchObject({
    angle_right_deg: 10,
    setback_right_mm: null,
  });
});

it('deletes a part after confirmation', async () => {
  renderPage();
  await screen.findByText('Dikme', { selector: 'div' });
  fireEvent.click(within(partRow(11)).getByRole('button', { name: 'Sil' }));
  expect(await screen.findByText('"Dikme" parçasını silmek istiyor musunuz?')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Evet, Sil' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Parça silindi.'));
  expect(callsTo('DELETE', '/linear_cutting/parts/11/')).toHaveLength(1);
});

it('optimizes with the plan inputs, but not while new rows are unsaved', async () => {
  const result = { groups: [{ item_name: 'Yeni Sonuç', bars_needed: 1, bars: [] }] };
  extra = ({ method, path }) =>
    method === 'POST' && path === '/linear_cutting/sessions/LC-0001/optimize/'
      ? json(result)
      : null;
  renderPage();
  await screen.findByText('Dikme', { selector: 'div' });

  fireEvent.click(screen.getByRole('button', { name: 'Parça Ekle' }));
  fireEvent.click(screen.getByRole('button', { name: 'Optimize Et' }));
  expect(notify.warning).toHaveBeenCalledWith('Önce yeni parçaları "Toplu Kaydet" ile kaydedin.');
  const newRow = screen
    .getAllByRole('row')
    .find((r) => r.getAttribute('data-row-id')?.startsWith('new-'))!;
  fireEvent.click(within(newRow).getByRole('button', { name: 'Satırı Kaldır' }));

  fireEvent.change(screen.getByLabelText('Stok Boyu (mm)'), { target: { value: '12000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Optimize Et' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Optimizasyon tamamlandı.'));
  expect(callsTo('POST', '/linear_cutting/sessions/LC-0001/optimize/')[0]!.body).toEqual({
    stock_length_mm: 12000,
    kerf_mm: 3,
  });
  expect(await screen.findByRole('tab', { name: 'Yeni Sonuç' })).toBeInTheDocument();
  // The typed stock length survives the new result.
  expect(screen.getByLabelText('Stok Boyu (mm)')).toHaveValue(12000);
});

it('confirms the plan and lists what was created', async () => {
  let confirmed = false;
  extra = ({ method, path }) => {
    if (method === 'POST' && path === '/linear_cutting/sessions/LC-0001/confirm/') {
      confirmed = true;
      return json({ created_tasks: ['LC-0001-01'], planning_request_number: 'PR-0042' });
    }
    if (method === 'GET' && path === '/linear_cutting/sessions/LC-0001/' && confirmed) {
      return json({ ...SESSION, tasks_created: true });
    }
    return null;
  };
  renderPage();
  await screen.findByDisplayValue('Korkuluk');
  fireEvent.click(screen.getByRole('button', { name: 'Onayla & Görevler' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Evet, Onayla' }));
  const result = await screen.findByText('Onay Sonucu');
  const modal = result.closest('[role="dialog"]') as HTMLElement;
  expect(within(modal).getByText('LC-0001-01')).toBeInTheDocument();
  const links = within(modal).getAllByRole('link', { name: 'Aç' });
  expect(links.map((a) => a.getAttribute('href'))).toEqual([
    '/planning/linear-cutting/cuts/?task=LC-0001-01',
    '/planning/department-requests/?talep=PR-0042',
  ]);
  expect(await screen.findByText('Görevler Oluşturuldu')).toBeInTheDocument();
  expect(screen.getByText('Bu plan daha önce onaylanmış.')).toBeInTheDocument();
});

it('says so when the plan was already confirmed', async () => {
  extra = ({ method, path }) =>
    method === 'POST' && path === '/linear_cutting/sessions/LC-0001/confirm/'
      ? json({ error: 'Already confirmed' }, 409)
      : null;
  renderPage();
  await screen.findByDisplayValue('Korkuluk');
  fireEvent.click(screen.getByRole('button', { name: 'Onayla & Görevler' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Evet, Onayla' }));
  await waitFor(() => expect(notify.warning).toHaveBeenCalledWith('Bu plan zaten onaylanmış.'));
});

it('creates a plan and opens it', async () => {
  extra = ({ method, path }) => {
    if (method === 'POST' && path === '/linear_cutting/sessions/') {
      return json({ ...SESSION, key: 'LC-0003', title: 'Yeni' }, 201);
    }
    if (method === 'GET' && path === '/linear_cutting/sessions/LC-0003/') {
      return json({ ...SESSION, key: 'LC-0003', title: 'Yeni', optimization_result: null });
    }
    return null;
  };
  renderPage('/planning/linear-cutting/cuts/');
  fireEvent.click(screen.getByRole('button', { name: 'Yeni Kesim Planı' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Plan Oluştur' }));
  expect(await within(dialog).findByText('Başlık zorunludur.')).toBeInTheDocument();
  fireEvent.change(within(dialog).getByLabelText(/Başlık/), { target: { value: ' Yeni ' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Plan Oluştur' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('LC-0003 oluşturuldu.'));
  expect(callsTo('POST', '/linear_cutting/sessions/')[0]!.body).toEqual({
    title: 'Yeni',
    stock_length_mm: 6000,
    kerf_mm: 3,
    notes: '',
    parts_data: [],
  });
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('?session=LC-0003'));
  expect(await screen.findByText(/Optimizasyon henüz çalıştırılmadı/)).toBeInTheDocument();
});

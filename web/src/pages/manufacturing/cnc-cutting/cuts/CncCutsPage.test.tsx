import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { CncCutsPage } from './CncCutsPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const CUTS = [
  {
    key: 'CNC-7',
    name: 'Kazan sacı',
    nesting_id: 'NST-1',
    dimensions: '1500x3000',
    quantity: 2,
    machine_fk: 3,
    machine_name: 'Lazer 1',
    parts_count: 4,
    completion_date: null,
    estimated_hours: '1.5',
    total_hours_spent: null,
    planning_request_item: 12,
    plate_item_code: '0100-20',
    plate_item_name: '20 mm P265GH',
    plate_item_is_delivered: true,
    material: '20 mm P265GH',
    thickness_mm: '20.00',
  },
  {
    key: 'CNC-8',
    name: 'Flanş',
    nesting_id: 'NST-2',
    dimensions: '600x400',
    quantity: null,
    machine_name: null,
    parts_count: 1,
    completion_date: '2026-10-01T10:00:00Z',
    has_remnant_plate: true,
    material: 'S235JR',
    thickness_mm: '10.00',
  },
];

const DETAIL = {
  ...CUTS[0],
  parts: [
    {
      id: 1,
      job_no: '114-09',
      image_no: '0124',
      position_no: 'P8-B',
      weight_kg: '38.33',
      quantity: 2,
    },
    {
      id: 2,
      job_no: '114-10',
      image_no: '0001',
      position_no: 'P1',
      weight_kg: null,
      quantity: null,
    },
  ],
  files: [
    {
      id: 5,
      file_name: 'cnc/files/nest.pdf',
      file_url: 'https://files.test/nest.pdf',
      uploaded_at: '2026-10-01T08:00:00Z',
      uploaded_by_username: 'acan',
    },
  ],
  plate_usage_records: [],
  plate_item: {
    id: 12,
    item_code: '0100-20',
    item_name: '20 mm P265GH',
    planning_request_number: 'PR-9',
    is_delivered: true,
    is_consumed: false,
    cnc_cuts_count: 3,
    quantity: '4',
  },
};

const PLANNING_ITEMS = [
  {
    id: 44,
    item_code: '0101-10',
    item_name: '10 mm S235',
    job_no: '270-01',
    quantity: '2',
    item_unit: 'adet',
    is_delivered: false,
    delivered_quantity: '0',
    cnc_cuts_count: 0,
    planning_request_number: 'PR-1',
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
    body:
      typeof init?.body === 'string'
        ? JSON.parse(init.body)
        : init?.body instanceof FormData
          ? init.body
          : undefined,
  }));
}
const listCalls = () =>
  calls().filter((c) => c.method === 'GET' && c.url.pathname === '/cnc_cutting/tasks/');
const location = () => new URLSearchParams(screen.getByTestId('location').textContent ?? '');

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/planning/cnc-cutting/cuts/') {
  return renderWithProviders(
    <ModalsProvider>
      <CncCutsPage />
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
    if (method === 'GET') {
      if (path === '/cnc_cutting/tasks/')
        return json({ count: 41, next: null, previous: null, results: CUTS });
      if (path === '/cnc_cutting/tasks/CNC-7/') return json(DETAIL);
      if (path === '/cnc_cutting/tasks/CNC-404/') return json({ detail: 'Bulunamadı' }, 404);
      if (path === '/cnc_cutting/parts/') return json(DETAIL.parts);
      if (path === '/machines/') return json({ count: 1, results: [{ id: 3, name: 'Lazer 1' }] });
      if (path === '/projects/job-orders/dropdown/')
        return json([
          { job_no: '114-09', title: 'Kazan' },
          { job_no: '114-10', title: 'Tank' },
        ]);
      if (path === '/planning/items/') return json({ count: 1, results: PLANNING_ITEMS });
      if (path === '/warehouse/pieces/')
        return json({
          count: 1,
          results: [
            {
              id: 9,
              item: 12,
              item_code: '0100-10',
              item_name: '10 mm S235',
              kind: 'plate',
              plate_thickness_mm: '10.00',
              width_mm: '1500.0',
              length_mm: '3000.0',
              quantity: 3,
              reserved_quantity: 1,
              available_quantity: 2,
              unit_kg: '353.250',
              heat_number: 'H-1',
              warehouse_code: 'HAMMADDE',
              job_no: '',
              supplier_name: null,
            },
          ],
        });
    }
    if (method === 'POST' && path === '/cnc_cutting/tasks/CNC-7/finish-preview/')
      return json({
        key: 'CNC-7',
        sheets: 1,
        consumed: [],
        consumed_kg: '400.000',
        consumed_estimated: true,
        parts_kg: '300.000',
        parts_without_weight: 0,
        remnants: [],
        remnant_kg: '70.650',
        fire_kg: '29.350',
        parts: [],
      });
    if (method === 'POST' && path.endsWith('-completed/')) return json({ status: 'ok' });
    if (method === 'POST' && path === '/cnc_cutting/parts/bulk-create/')
      return json([{ id: 90 }], 201);
    if (method === 'POST') return json({ key: 'CNC-9' }, 201);
    if (method === 'PATCH') return json({ ok: true });
    if (method === 'DELETE') return json(undefined, 204);
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
  vi.spyOn(notify, 'warning');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('lists the cuts with the legacy columns, figures and default query', async () => {
  renderPage();
  expect(screen.getByRole('heading', { level: 1, name: 'CNC Kesim Kesimler' })).toBeInTheDocument();
  expect(await screen.findByText('CNC-7')).toBeInTheDocument();
  expect(screen.getByText('20 mm P265GH')).toBeInTheDocument();
  expect(screen.getByText('Teslim')).toBeInTheDocument();
  expect(screen.getByText('Fire Plaka')).toBeInTheDocument();
  expect(screen.getByText('1.5 saat')).toBeInTheDocument();
  expect(screen.getAllByText('0 saat')).toHaveLength(2);
  expect(screen.getByRole('button', { name: 'CNC-8 durumunu değiştir' })).toHaveTextContent(
    'Tamamlandı',
  );

  expect(within(document.getElementById('all-cuts-count')!).getByText('41')).toBeInTheDocument();
  expect(
    within(document.getElementById('completed-cuts-count')!).getByText('1'),
  ).toBeInTheDocument();
  expect(within(document.getElementById('pending-cuts-count')!).getByText('1')).toBeInTheDocument();

  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    ordering: '-key',
    page: '1',
    page_size: '20',
  });
  // The machine filter and forms list the cutting machines.
  expect(
    calls().some(
      (c) => c.url.pathname === '/machines/' && c.url.searchParams.get('used_in') === 'cutting',
    ),
  ).toBe(true);
});

it('reads legacy URL aliases and maps the status filter', async () => {
  renderPage('/planning/cnc-cutting/cuts/?nesting-id=NST&thickness-mm=10&status=pending');
  await screen.findByText('CNC-7');
  await waitFor(() => expect(location().get('nesting_id')).toBe('NST'));
  expect(location().has('nesting-id')).toBe(false);
  await waitFor(() =>
    expect(Object.fromEntries(listCalls().at(-1)!.url.searchParams)).toEqual({
      nesting_id: 'NST',
      thickness_mm: '10',
      completion_date__isnull: 'true',
      ordering: '-key',
      page: '1',
      page_size: '20',
    }),
  );

  fireEvent.change(screen.getByLabelText('Kesim No'), { target: { value: ' CNC-62 ' } });
  fireEvent.keyDown(screen.getByLabelText('Kesim No'), { key: 'Enter' });
  await waitFor(() => expect(listCalls().at(-1)!.url.searchParams.get('key')).toBe('CNC-62'));
});

it('?cut opens the details and filters the list to that cut', async () => {
  renderPage('/planning/cnc-cutting/cuts/?cut=CNC-7');
  const dialog = await screen.findByRole('dialog', { name: 'Kesim Detayları' });
  expect(await within(dialog).findByText('P8-B')).toBeInTheDocument();
  expect(within(dialog).getByText('38.33 kg')).toBeInTheDocument();
  expect(within(dialog).getByText('nest.pdf')).toBeInTheDocument();
  expect(
    within(dialog).getByText(
      '0100-20 — 20 mm P265GH (PR-9) · Teslim edildi · 3 kesimde kullanıldı',
    ),
  ).toBeInTheDocument();
  await waitFor(() => expect(listCalls().at(-1)!.url.searchParams.get('key')).toBe('CNC-7'));

  fireEvent.click(within(dialog).getAllByRole('button', { name: 'Kapat' })[0]!);
  await waitFor(() => expect(location().has('cut')).toBe(false));
  expect(location().get('key')).toBe('CNC-7');
});

it('a missing ?cut reports it and cleans the URL', async () => {
  renderPage('/planning/cnc-cutting/cuts/?cut=CNC-404&mode=edit');
  await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Kesim bulunamadı'));
  await waitFor(() => expect(location().has('cut')).toBe(false));
  expect(location().has('mode')).toBe(false);
});

it('finishing a cut asks for its remnants, then books it', async () => {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'CNC-7 durumunu değiştir' }));
  const dialog = await screen.findByRole('dialog', { name: /Kesimi Bitir/ });
  const finish = await within(dialog).findByRole('button', { name: 'Kesimi Bitir' });
  fireEvent.change(within(dialog).getByLabelText('Fire sac eni 1'), { target: { value: '600' } });
  fireEvent.change(within(dialog).getByLabelText('Fire sac boyu 1'), { target: { value: '1500' } });
  await waitFor(() =>
    expect(
      calls()
        .filter((c) => c.url.pathname === '/cnc_cutting/tasks/CNC-7/finish-preview/')
        .at(-1)?.body,
    ).toEqual({ remnants: [{ width_mm: '600', length_mm: '1500', quantity: 1 }] }),
  );
  await waitFor(() => expect(finish).toBeEnabled());
  fireEvent.click(finish);
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Kesim tamamlandı olarak işaretlendi'),
  );
  const post = calls().find((c) => c.url.pathname === '/cnc_cutting/tasks/mark-completed/')!;
  expect(post.body).toEqual({
    key: 'CNC-7',
    remnants: [{ width_mm: '600', length_mm: '1500', quantity: 1 }],
    no_remnant: false,
  });
});

it('reopening a finished cut asks first', async () => {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'CNC-8 durumunu değiştir' }));
  expect(await screen.findByText(/Kesim yeniden açılır/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Evet, Değiştir' }));
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Kesim tamamlanmadı olarak işaretlendi'),
  );
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe('/cnc_cutting/tasks/unmark-completed/');
  expect(post.body).toEqual({ key: 'CNC-8' });
});

it('deletes a cut after the confirm', async () => {
  renderPage();
  await screen.findByText('CNC-7');
  fireEvent.click(screen.getAllByRole('button', { name: 'Sil' })[0]!);
  expect(
    await screen.findByText('Bu kesimi silmek istediğinize emin misiniz?'),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Evet, Sil' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Kesim silindi'));
  expect(calls().find((c) => c.method === 'DELETE')!.url.pathname).toBe(
    '/cnc_cutting/tasks/CNC-7/',
  );
});

const PASTE = [
  'Geometry\tPart\tNested\tWeight',
  '\t114-09 0124 P1\t2\t10kg',
  '\t114-10 0124 P2\t3\t11kg',
  '\t114-09 0125 P3\t4\t12kg',
].join('\n');

it('create needs a plate source and a part, then posts the multipart body', async () => {
  renderPage();
  await screen.findByText('CNC-7');
  fireEvent.click(screen.getByRole('button', { name: 'Yeni Kesim' }));
  const dialog = await screen.findByRole('dialog', { name: 'Yeni Kesim Oluştur' });

  fireEvent.change(within(dialog).getByLabelText(/^Kesim Adı/), { target: { value: 'Yeni' } });
  fireEvent.change(within(dialog).getByLabelText(/^Nesting ID/), { target: { value: 'N-9' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kesim Oluştur' }));
  await waitFor(() =>
    expect(notify.error).toHaveBeenCalledWith('Stoktan sac veya plaka kalemi seçmelisiniz'),
  );

  // Pick a planning item.
  fireEvent.click(within(dialog).getByRole('button', { name: 'Plaka Kalemi Seç' }));
  const picker = await screen.findByRole('dialog', { name: 'Plaka Kalemi Seç' });
  fireEvent.click(await within(picker).findByRole('button', { name: 'Seç' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Plaka Kalemi Seç' })).not.toBeInTheDocument(),
  );
  expect(within(dialog).getByText('Seçili: 0101-10 — 10 mm S235')).toBeInTheDocument();
  expect(
    within(dialog).getByText('Malzeme henüz teslim edilmedi — satın alma bekleniyor.'),
  ).toBeInTheDocument();
  const itemCall = calls().find((c) => c.url.pathname === '/planning/items/')!;
  expect(Object.fromEntries(itemCall.url.searchParams)).toEqual({
    is_plate: 'true',
    sized: 'false',
    is_consumed: 'false',
    mine: 'true',
    fields: 'simple',
    ordering: '-id',
    page: '1',
    page_size: '20',
  });

  fireEvent.click(within(dialog).getByRole('button', { name: 'Kesim Oluştur' }));
  await waitFor(() => expect(notify.error).toHaveBeenCalledWith('En az bir parça eklemelisiniz'));

  // Paste three parts, then drop the middle one: the others keep their jobs.
  fireEvent.change(within(dialog).getByLabelText(/^Toplu Yapıştır/), { target: { value: PASTE } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Yapıştırılanı Ayrıştır ve Ekle' }));
  expect(await within(dialog).findAllByTestId('part-row')).toHaveLength(3);
  fireEvent.click(within(dialog).getAllByRole('button', { name: 'Parçayı Kaldır' })[1]!);
  expect(within(dialog).getAllByTestId('part-row')).toHaveLength(2);

  fireEvent.click(within(dialog).getByRole('button', { name: 'Kesim Oluştur' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Kesim başarıyla oluşturuldu'));
  const post = calls().find(
    (c) => c.method === 'POST' && c.url.pathname === '/cnc_cutting/tasks/',
  )!;
  const body = post.body as FormData;
  expect(body.get('name')).toBe('Yeni');
  expect(body.get('nesting_id')).toBe('N-9');
  expect(body.get('planning_request_item_id')).toBe('44');
  expect(body.get('mark_item_consumed')).toBe('false');
  expect(body.has('selected_plate_id')).toBe(false);
  expect(JSON.parse(String(body.get('parts_data')))).toEqual([
    { job_no: '114-09', image_no: '0124', position_no: 'P1', weight_kg: 10, quantity: 2 },
    { job_no: '114-09', image_no: '0125', position_no: 'P3', weight_kg: 12, quantity: 4 },
  ]);
});

it('edit keeps the plate source, saves with PATCH and updates pasted parts together', async () => {
  renderPage('/planning/cnc-cutting/cuts/?cut=CNC-7&mode=edit');
  const dialog = await screen.findByRole('dialog', { name: 'Kesim Düzenle' });
  expect(await within(dialog).findByLabelText(/^Kesim Adı/)).toHaveValue('Kazan sacı');
  expect(within(dialog).getByText('Seçili: 0100-20 — 20 mm P265GH')).toBeInTheDocument();
  expect(within(dialog).getByText('P8-B')).toBeInTheDocument();

  // Paste: P8-B exists (update), P8-A is new (bulk create); both go out at once.
  fireEvent.click(within(dialog).getByRole('button', { name: 'Toplu Yapıştır' }));
  fireEvent.change(within(dialog).getByLabelText(/^Toplu Yapıştır/), {
    target: {
      value:
        'Part\tNested\tWeight\n\t114-09 0124 P8-B\t5\t40kg\n\t114-09 0124 P8-A\t1\t2kg'.replace(
          /\n\t/g,
          '\n',
        ),
    },
  });
  // The first Önizle is the paste preview (the file list has its own).
  fireEvent.click(within(dialog).getAllByRole('button', { name: 'Önizle' })[0]!);
  expect(await within(dialog).findByText(/2 parça bulundu/)).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Onayla ve Değiştir' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Evet, Güncelle' }));
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('1 parça güncellendi, 1 parça eklendi'),
  );
  const patch = calls().find((c) => c.method === 'PATCH')!;
  expect(patch.url.pathname).toBe('/cnc_cutting/parts/1/');
  expect(patch.body).toEqual({
    job_no: '114-09',
    image_no: '0124',
    position_no: 'P8-B',
    weight_kg: 40,
    quantity: 5,
  });
  const bulk = calls().find((c) => c.url.pathname === '/cnc_cutting/parts/bulk-create/')!;
  expect(bulk.body).toEqual([
    {
      job_no: '114-09',
      image_no: '0124',
      position_no: 'P8-A',
      weight_kg: 2,
      quantity: 1,
      cnc_task: 'CNC-7',
    },
  ]);

  fireEvent.change(within(dialog).getByLabelText(/^Kesim Adı/), { target: { value: 'Kazan 2' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Değişiklikleri Kaydet' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Kesim başarıyla güncellendi'));
  const save = calls().find(
    (c) => c.method === 'PATCH' && c.url.pathname === '/cnc_cutting/tasks/CNC-7/',
  )!;
  const body = save.body as FormData;
  expect(body.get('name')).toBe('Kazan 2');
  expect(body.get('machine_fk')).toBe('3');
  expect(body.get('estimated_hours')).toBe('1.5');
  // The plate source was left alone: it isn't sent (a changed one sends every key).
  expect(body.has('selected_plate_id')).toBe(false);
  expect(body.has('selected_piece_id')).toBe(false);
  expect(body.has('planning_request_item_id')).toBe(false);
  expect(body.has('mark_item_consumed')).toBe(false);
  await waitFor(() => expect(location().has('cut')).toBe(false));
});

it('a Talep Edilen Sac cut holding two lots can be renamed and resized: its sheets are not resent', async () => {
  const base = fetchMock.getMockImplementation()!;
  const lot = (id: number) => ({
    id,
    piece: id,
    quantity: 1,
    available_quantity: 1,
    piece_details: { id, item_code: '0100-20', width_mm: '1500.0', length_mm: '3000.0' },
  });
  fetchMock.mockImplementation((url, init) => {
    const path = new URL(String(url), 'http://x').pathname;
    if ((!init?.method || init.method === 'GET') && path === '/cnc_cutting/tasks/CNC-7/')
      return json({
        ...DETAIL,
        quantity: 3,
        plate_item: {
          ...DETAIL.plate_item,
          ordered_line: true,
          piece_count: 5,
          piece_width_mm: '1500.0',
          piece_length_mm: '3000.0',
          sheets_free: 0,
        },
        piece_reservations: [lot(81), lot(82)],
        sheets_waiting: 1,
        plate_mismatch: [
          { piece: 90, width_mm: '1250.0', length_mm: '2500.0', available_quantity: 2 },
        ],
      });
    return base(url, init);
  });
  renderPage('/planning/cnc-cutting/cuts/?cut=CNC-7&mode=edit');
  const dialog = await screen.findByRole('dialog', { name: 'Kesim Düzenle' });
  expect(await within(dialog).findByText(/Ayrılan saclar:/)).toBeInTheDocument();
  expect(within(dialog).getByText('Sac bekleniyor: 1 sac')).toBeInTheDocument();
  expect(within(dialog).getByText(/farklı ölçüde sac geldi/)).toBeInTheDocument();
  fireEvent.change(within(dialog).getByLabelText(/^Kesim Adı/), { target: { value: 'Yeni ad' } });
  fireEvent.change(within(dialog).getByLabelText(/^Adet/), { target: { value: '4' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Değişiklikleri Kaydet' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Kesim başarıyla güncellendi'));
  const body = calls().find(
    (c) => c.method === 'PATCH' && c.url.pathname === '/cnc_cutting/tasks/CNC-7/',
  )!.body as FormData;
  expect(body.get('name')).toBe('Yeni ad');
  expect(body.get('quantity')).toBe('4');
  expect(body.has('selected_piece_id')).toBe(false);
  expect(body.has('quantity_used')).toBe(false);
  expect(body.has('planning_request_item_id')).toBe(false);
});

it('a refused part delete shows the backend reason', async () => {
  renderPage('/planning/cnc-cutting/cuts/?cut=CNC-7&mode=edit');
  const dialog = await screen.findByRole('dialog', { name: 'Kesim Düzenle' });
  await within(dialog).findByText('P8-B');
  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((url, init) =>
    init?.method === 'DELETE' ? json({ detail: 'Bu parça bir plana bağlı' }, 400) : base(url, init),
  );
  const partRow = within(dialog).getByText('P8-B').closest('tr')!;
  fireEvent.click(within(partRow).getByRole('button', { name: 'Sil' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Evet, Sil' }));
  await waitFor(() =>
    expect(notify.error).toHaveBeenCalledWith('Parça silinemedi: Bu parça bir plana bağlı'),
  );
});

it('a cut takes sheets from a stock lot: the picker lists free sheets, the pick caps the count', async () => {
  renderPage();
  await screen.findByText('CNC-7');
  fireEvent.click(screen.getByRole('button', { name: 'Yeni Kesim' }));
  const dialog = await screen.findByRole('dialog', { name: 'Yeni Kesim Oluştur' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Stoktan Sac Seç' }));
  const picker = await screen.findByRole('dialog', { name: 'Stoktan Sac Seç' });
  fireEvent.click(await within(picker).findByRole('button', { name: 'Seç' }));
  const pieceCall = calls().find((c) => c.url.pathname === '/warehouse/pieces/')!;
  expect(Object.fromEntries(pieceCall.url.searchParams)).toEqual({
    kind: 'plate',
    available: 'true',
    page: '1',
    page_size: '20',
  });
  expect(notify.success).toHaveBeenCalledWith('Sac seçildi');
  expect(await within(dialog).findByText('Seçili: 0100-10 · 1500 × 3000 mm')).toBeInTheDocument();

  const used = within(dialog).getByLabelText('Kullanılacak Adet');
  expect(used).toHaveValue('1');
  fireEvent.change(used, { target: { value: '5' } });
  expect(notify.warning).toHaveBeenCalledWith('Maksimum 2 adet kullanılabilir');
  await waitFor(() => expect(used).toHaveValue('2'));
});

it('a cut may finish with no remnant rows: it left none', async () => {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'CNC-7 durumunu değiştir' }));
  const dialog = await screen.findByRole('dialog', { name: /Kesimi Bitir/ });
  const finish = await within(dialog).findByRole('button', { name: 'Kesimi Bitir' });
  await waitFor(() => expect(finish).toBeEnabled());
  fireEvent.click(finish);
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Kesim tamamlandı olarak işaretlendi'),
  );
  const post = calls().find((c) => c.url.pathname === '/cnc_cutting/tasks/mark-completed/')!;
  expect(post.body).toEqual({ key: 'CNC-7', remnants: [], no_remnant: true });
});

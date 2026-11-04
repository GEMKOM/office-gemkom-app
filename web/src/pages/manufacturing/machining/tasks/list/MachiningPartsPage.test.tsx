import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { MachiningPartsPage } from './MachiningPartsPage';

vi.mock('@/auth/authService', () => ({
  authedFetch: vi.fn(),
  hasPerm: vi.fn(() => false),
  isSuperuser: vi.fn(() => false),
}));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const PARTS = [
  {
    key: 'PT-1',
    task_key: null,
    name: 'Flanş',
    description: 'Ön',
    job_no: '254-01',
    job_allocations: [{ job_no: '254-01', quantity: 4, share: 1 }],
    is_multi_job: false,
    image_no: 'R-1',
    position_no: 'P-1',
    quantity: 4,
    material: 'St37',
    weight_kg: '1.500',
    operation_count: 2,
    incomplete_operation_count: 1,
    finish_time: '2026-11-20',
    files: [],
    is_locked: false,
  },
  {
    key: 'PT-2',
    name: 'Mil',
    job_no: '254-02 +1',
    job_allocations: [
      { job_no: '254-02', quantity: 3, share: 0.75 },
      { job_no: '254-03', quantity: 1, share: 0.25 },
    ],
    is_multi_job: true,
    quantity: 4,
    operation_count: 0,
    incomplete_operation_count: 0,
    finish_time: null,
    files: [{ id: 5, file_name: 'a.pdf' }],
    is_locked: true,
    department_request_number: 'DR-9',
  },
];

const OPERATIONS = [
  {
    key: 'PT-1-OP-1',
    name: 'Torna',
    description: '',
    order: 1,
    machine_fk: 11,
    estimated_hours: '2.00',
    total_hours_spent: 1.5,
    interchangeable: false,
    completion_date: null,
  },
  {
    key: 'PT-1-OP-2',
    name: 'Freze',
    description: 'x',
    order: 2,
    machine_fk: 11,
    estimated_hours: null,
    total_hours_spent: 0,
    interchangeable: true,
    completion_date: '2026-10-01T10:00:00Z',
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
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body,
  }));
}
const listCalls = () =>
  calls().filter((c) => c.method === 'GET' && c.url.pathname === '/tasks/parts/');
const callsTo = (method: string, path: string) =>
  calls().filter((c) => c.method === method && c.url.pathname === path);

let patchStatus = 200;

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/manufacturing/machining/tasks/list/') {
  return renderWithProviders(
    <ModalsProvider>
      <MachiningPartsPage />
      <LocationProbe />
    </ModalsProvider>,
    { route },
  );
}

function cell(rowId: string, col: string): HTMLElement {
  const td = document.querySelector<HTMLElement>(
    `tr[data-row-id="${rowId}"] td[data-col="${col}"]`,
  );
  if (!td) throw new Error(`no editable cell ${rowId}/${col}`);
  return td;
}

beforeEach(() => {
  patchStatus = 200;
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url)).pathname;
    if (method === 'GET' && path === '/tasks/parts/')
      return json({ count: 42, next: null, previous: null, results: PARTS });
    if (method === 'GET' && path === '/tasks/parts/stats/') {
      return json({
        parts_with_unassigned_operations: 3,
        parts_with_unplanned_operations: 0,
        parts_without_operations: 1,
      });
    }
    if (method === 'GET' && path === '/users/dropdown/')
      return json([{ id: 7, username: 'ali', full_name: 'Ali Veli' }]);
    if (method === 'GET' && path === '/machines/dropdown/')
      return json([{ id: 11, name: 'CNC-1' }]);
    if (method === 'GET' && path === '/projects/job-orders/dropdown/') {
      return json([
        { job_no: '254-01', title: 'Kazan' },
        { job_no: '254-05', title: 'Tank' },
      ]);
    }
    if (method === 'PATCH' && path.startsWith('/tasks/parts/')) {
      const body = JSON.parse(String(init?.body));
      return patchStatus === 200
        ? json({ ...PARTS[0], ...body, job_no: body.job_allocations ? '254-05' : PARTS[0]!.job_no })
        : json({ name: ['Bu alan boş bırakılamaz.'] }, patchStatus);
    }
    if (method === 'GET' && path === '/tasks/operations/')
      return json({ count: 2, results: OPERATIONS });
    if (method === 'GET' && path === '/tasks/parts/PT-1/') {
      return json({
        ...PARTS[0],
        plan_summary: { due_date: '2026-11-20', due_source: 'part', projected_late: true },
      });
    }
    if (method === 'POST' && path === '/tasks/parts/PT-1/update_operations/')
      return json({ ok: true });
    if (method === 'POST' && path.endsWith('/mark_completed/')) return json({ ok: true });
    if (method === 'DELETE') return json(undefined, 204);
    if (method === 'POST' && path === '/tasks/parts/')
      return json({ key: 'PT-77', operations: [] }, 201);
    if (method === 'POST' && path === '/tasks/parts/convert-to-department-request/') {
      return json({ id: 31, request_number: 'DR-31' }, 201);
    }
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
  vi.spyOn(notify, 'info');
  vi.spyOn(notify, 'warning');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('renders the parts, the figures and asks for the legacy defaults', async () => {
  renderPage();
  expect(screen.getAllByText('Parça Listesi').length).toBeGreaterThan(0);
  expect(await screen.findByText('Flanş')).toBeInTheDocument();
  expect(screen.getByText('1.500 kg')).toBeInTheDocument();
  expect(screen.getByText('Talebe Dönüştü').closest('[title]')).toHaveAttribute(
    'title',
    'Departman Talebine Dönüştürüldü → DR-9',
  );
  await waitFor(() =>
    expect(
      within(document.getElementById('unassigned-operations-count')!).getByText('3'),
    ).toBeInTheDocument(),
  );

  const params = listCalls()[0]!.url.searchParams;
  expect(params.get('page')).toBe('1');
  expect(params.get('page_size')).toBe('20');
  expect(params.get('ordering')).toBe('-created_at');
});

it('maps URL filters (legacy names and aliases) to the request', async () => {
  renderPage(
    '/manufacturing/machining/tasks/list/?key=12&status=completed&has-operations=true&created_by=7',
  );
  await screen.findByText('Flanş');
  await waitFor(() => {
    const params = listCalls().at(-1)!.url.searchParams;
    expect(params.get('key')).toBe('PT-12');
    expect(params.get('completion_date__isnull')).toBe('false');
    expect(params.get('has_operations')).toBe('false');
    expect(params.get('created_by')).toBe('7');
  });
  expect(screen.getByTestId('location').textContent).toContain('has_operations=true');
  expect(screen.getByTestId('location').textContent).not.toContain('has-operations');
});

it('a figure with a count applies its filter', async () => {
  renderPage();
  const figure = await within(document.getElementById('unassigned-operations-count')!).findByRole(
    'button',
  );
  fireEvent.click(figure);
  await waitFor(() =>
    expect(listCalls().at(-1)!.url.searchParams.get('has_unassigned_operations')).toBe('true'),
  );
  expect(notify.info).toHaveBeenCalledWith('Makine Atanmamış filtresi uygulandı');
});

it('edits a cell inline and PATCHes the part', async () => {
  renderPage();
  await screen.findByText('Flanş');
  fireEvent.click(cell('PT-1', 'name'));
  const input = await screen.findByRole('textbox', { name: 'Ad' });
  fireEvent.change(input, { target: { value: 'Flanş B' } });
  fireEvent.keyDown(input, { key: 'Enter' });

  await waitFor(() => expect(callsTo('PATCH', '/tasks/parts/PT-1/')).toHaveLength(1));
  expect(callsTo('PATCH', '/tasks/parts/PT-1/')[0]!.body).toEqual({ name: 'Flanş B' });
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Parça başarıyla güncellendi'));
  expect(screen.getByText('Flanş B')).toBeInTheDocument();

  // Numbers and dates go typed.
  fireEvent.click(cell('PT-1', 'weight_kg'));
  const weight = await screen.findByRole('textbox', { name: 'Ağırlık (kg)' });
  fireEvent.change(weight, { target: { value: '2,25' } });
  fireEvent.keyDown(weight, { key: 'Enter' });
  await waitFor(() => expect(callsTo('PATCH', '/tasks/parts/PT-1/')).toHaveLength(2));
  expect(callsTo('PATCH', '/tasks/parts/PT-1/')[1]!.body).toEqual({ weight_kg: 2.25 });
});

it('rolls a failed edit back and leaves locked rows read-only', async () => {
  patchStatus = 400;
  renderPage();
  await screen.findByText('Flanş');
  // The converted part has no editable cells and no selection box.
  expect(document.querySelector('tr[data-row-id="PT-2"] td[data-edit-cell]')).toBeNull();

  fireEvent.click(cell('PT-1', 'material'));
  const input = await screen.findByRole('textbox', { name: 'Malzeme' });
  fireEvent.change(input, { target: { value: 'Paslanmaz' } });
  fireEvent.keyDown(input, { key: 'Enter' });

  await waitFor(() => expect(cell('PT-1', 'material')).toHaveAttribute('data-cell-state', 'error'));
  expect(within(cell('PT-1', 'material')).getByText('St37')).toBeInTheDocument();
  expect(notify.error).toHaveBeenCalled();
  expect(notify.success).not.toHaveBeenCalledWith('Parça başarıyla güncellendi');
});

it('deletes a part after the confirm', async () => {
  renderPage();
  await screen.findByText('Flanş');
  const row = document.querySelector<HTMLElement>('tr[data-row-id="PT-1"]')!;
  fireEvent.click(within(row).getByRole('button', { name: 'Sil' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Evet, Sil' }));
  await waitFor(() => expect(callsTo('DELETE', '/tasks/parts/PT-1/')).toHaveLength(1));
  expect(notify.success).toHaveBeenCalledWith('Parça silindi');
  // The locked part cannot be deleted.
  const locked = document.querySelector<HTMLElement>('tr[data-row-id="PT-2"]')!;
  expect(within(locked).queryByRole('button', { name: 'Sil' })).toBeNull();
});

it('saves a job order split from the İş No cell', async () => {
  renderPage();
  await screen.findByText('Flanş');
  const row = document.querySelector<HTMLElement>('tr[data-row-id="PT-1"]')!;
  fireEvent.click(within(row).getAllByTitle('İş emri dağılımı')[0]!);
  expect(await screen.findByText('İş Emri Dağılımı')).toBeInTheDocument();

  // A row without a job order is refused.
  fireEvent.click(screen.getByRole('button', { name: 'İş emri ekle' }));
  fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
  expect(await screen.findByText('2. satırda iş emri seçilmemiş')).toBeInTheDocument();

  fireEvent.click(screen.getAllByRole('button', { name: 'Satırı kaldır' })[1]!);
  fireEvent.change(screen.getByRole('textbox', { name: '1. adet' }), { target: { value: '6' } });
  fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(callsTo('PATCH', '/tasks/parts/PT-1/')).toHaveLength(1));
  expect(callsTo('PATCH', '/tasks/parts/PT-1/')[0]!.body).toEqual({
    job_allocations: [{ job_no: '254-01', quantity: 6 }],
  });
  expect(notify.success).toHaveBeenCalledWith('İş emri dağılımı güncellendi');
  expect(await screen.findByText('254-05')).toBeInTheDocument();

  // A locked part only warns.
  const locked = document.querySelector<HTMLElement>('tr[data-row-id="PT-2"]')!;
  fireEvent.click(within(locked).getAllByTitle(/254-02/)[0]!);
  expect(notify.warning).toHaveBeenCalledWith(
    'Bu parça departman talebine dönüştürüldü, düzenlenemez.',
  );
});

it('creates a part with its operations', async () => {
  renderPage();
  await screen.findByText('Flanş');
  fireEvent.click(screen.getByRole('button', { name: 'Yeni Parça' }));
  expect(await screen.findByText('Yeni Parça Oluştur')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Parça Oluştur' }));
  expect(await screen.findByText('Parça adı zorunludur')).toBeInTheDocument();

  fireEvent.change(screen.getByRole('textbox', { name: 'Parça Adı *' }), {
    target: { value: 'Kapak' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Parça Oluştur' }));
  expect(notify.error).toHaveBeenCalledWith('Satır 1: Sıra, operasyon adı ve makine zorunludur');

  const opRow = document.querySelector<HTMLElement>('[role="dialog"] tr[data-row-id]')!;
  const opId = opRow.dataset.rowId!;
  fireEvent.click(cell(opId, 'name'));
  const name = await screen.findByRole('textbox', { name: 'Operasyon Adı *' });
  fireEvent.change(name, { target: { value: 'Torna' } });
  fireEvent.keyDown(name, { key: 'Enter' });
  fireEvent.click(cell(opId, 'machine'));
  const machine = await screen.findByRole('combobox', { name: 'Makine *' });
  fireEvent.change(machine, { target: { value: '11' } });
  fireEvent.keyDown(machine, { key: 'Enter' });
  await waitFor(() => expect(within(cell(opId, 'machine')).getByText('CNC-1')).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: 'Parça Oluştur' }));
  await waitFor(() => expect(callsTo('POST', '/tasks/parts/')).toHaveLength(1));
  expect(callsTo('POST', '/tasks/parts/')[0]!.body).toEqual({
    name: 'Kapak',
    description: null,
    image_no: null,
    position_no: null,
    material: null,
    dimensions: null,
    weight_kg: null,
    finish_time: null,
    job_no: null,
    quantity: null,
    operations: [
      {
        name: 'Torna',
        description: null,
        order: 1,
        machine_fk: 11,
        estimated_hours: null,
        interchangeable: false,
      },
    ],
  });
  expect(notify.success).toHaveBeenCalledWith('Parça oluşturuldu: PT-77');
});

it('converts the selected parts into a department request', async () => {
  renderPage();
  await screen.findByText('Flanş');
  const row = document.querySelector<HTMLElement>('tr[data-row-id="PT-1"]')!;
  fireEvent.click(within(row).getByRole('checkbox', { name: 'Satırı seç' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Departman Talebine Dönüştür (1)' }));
  expect(
    await screen.findByText('1 iş emri için 1 talep kalemi oluşturulacak'),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Oluştur ve Gönder' }));
  await waitFor(() =>
    expect(callsTo('POST', '/tasks/parts/convert-to-department-request/')).toHaveLength(1),
  );
  expect(callsTo('POST', '/tasks/parts/convert-to-department-request/')[0]!.body).toEqual({
    part_keys: ['PT-1'],
    title: 'Parça Talebi',
    priority: 'normal',
    needed_date: null,
    description: '',
  });
  await waitFor(() => expect(notify.success).toHaveBeenCalled());
});

it('edits the operations of a part in the details modal', async () => {
  renderPage();
  await screen.findByText('Flanş');
  const row = document.querySelector<HTMLElement>('tr[data-row-id="PT-1"]')!;
  fireEvent.click(within(row).getByRole('button', { name: 'Parça Detayları' }));
  expect(
    await screen.findByText('Operasyonlar - PT-1 - Flanş · İş No: 254-01'),
  ).toBeInTheDocument();
  expect(await screen.findByText('Torna')).toBeInTheDocument();
  expect(screen.getByText('20.11.2026 (parça)')).toBeInTheDocument();
  expect(screen.getByText('Geç')).toBeInTheDocument();
  // The completed operation is read-only.
  expect(document.querySelector('tr[data-row-id="PT-1-OP-2"] td[data-edit-cell]')).toBeNull();

  fireEvent.click(cell('PT-1-OP-1', 'name'));
  const input = await screen.findByRole('textbox', { name: 'Operasyon Adı' });
  fireEvent.change(input, { target: { value: 'Torna 2' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() =>
    expect(cell('PT-1-OP-1', 'name')).toHaveAttribute('data-cell-state', 'dirty'),
  );

  // A new row without a machine is refused.
  fireEvent.click(screen.getByRole('button', { name: 'Satır Ekle' }));
  fireEvent.click(screen.getByRole('button', { name: 'Değişiklikleri Kaydet' }));
  expect(notify.error).toHaveBeenCalledWith('Lütfen tüm operasyonlar için ad ve makine seçin');
  const newRow = [...document.querySelectorAll<HTMLElement>('tr[data-row-id^="new-"]')][0]!;
  fireEvent.click(within(newRow).getByRole('button', { name: 'Kaldır' }));

  fireEvent.click(screen.getByRole('button', { name: 'Değişiklikleri Kaydet' }));
  await waitFor(() =>
    expect(callsTo('POST', '/tasks/parts/PT-1/update_operations/')).toHaveLength(1),
  );
  expect(callsTo('POST', '/tasks/parts/PT-1/update_operations/')[0]!.body).toEqual({
    operations: [
      {
        key: 'PT-1-OP-1',
        name: 'Torna 2',
        description: null,
        machine_fk: 11,
        order: 1,
        interchangeable: false,
        estimated_hours: 2,
      },
    ],
    delete_operations: [],
  });
  expect(notify.success).toHaveBeenCalledWith('Operasyonlar başarıyla güncellendi');

  fireEvent.click(screen.getByRole('button', { name: 'Tamamla' }));
  await waitFor(() =>
    expect(callsTo('POST', '/tasks/operations/PT-1-OP-1/mark_completed/')).toHaveLength(1),
  );
});

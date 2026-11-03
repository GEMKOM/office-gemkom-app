import { authedFetch } from '@legacy/authService.js';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import {
  MachiningCreateTasksPage,
  validateDrafts,
  type TaskDraft,
} from './MachiningCreateTasksPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 42, username: 'op' } }) }));

const fetchMock = vi.mocked(authedFetch);

const TASKS = [
  {
    key: 'PT-10',
    name: 'Flanş',
    job_no: '254-01',
    quantity: 3,
    estimated_hours: 2,
    total_hours_spent: 1,
    planned_end_ms: Date.UTC(2026, 10, 20, 9),
    completion_date: null,
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
const callsTo = (method: string, path: string) =>
  calls().filter((c) => c.method === method && c.url.pathname === path);

function renderPage(route = '/manufacturing/machining/tasks/create/') {
  return renderWithProviders(
    <ModalsProvider>
      <MachiningCreateTasksPage />
    </ModalsProvider>,
    { route },
  );
}

function draftRows(): HTMLElement[] {
  return [
    ...document.querySelectorAll<HTMLElement>('[data-testid="bulk-create-table"] tr[data-row-id]'),
  ];
}

function cell(row: HTMLElement, col: string): HTMLElement {
  const td = row.querySelector<HTMLElement>(`td[data-col="${col}"]`);
  if (!td) throw new Error(`no cell ${col}`);
  return td;
}

async function typeInto(row: HTMLElement, col: string, label: string, value: string) {
  fireEvent.click(cell(row, col));
  const input = await screen.findByLabelText(label, { selector: 'input' });
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => expect(screen.queryByLabelText(label, { selector: 'input' })).toBeNull());
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url)).pathname;
    if (method === 'GET' && path === '/tasks/parts/')
      return json({ count: 1, next: null, previous: null, results: TASKS });
    if (method === 'GET' && path === '/users/dropdown/') {
      return json([
        { id: 42, username: 'op', full_name: 'Oya Pala' },
        { id: 7, username: 'ali', full_name: 'Ali Çelik' },
      ]);
    }
    if (method === 'GET' && path === '/projects/job-orders/dropdown/') {
      return json([
        { job_no: '254-01', title: 'Kazan' },
        { job_no: '254-02', title: 'Tank' },
      ]);
    }
    if (method === 'POST' && path === '/tasks/parts/bulk-create/') {
      const body = JSON.parse(String(init?.body)) as { name: string; job_no: string }[];
      return json(
        {
          created: body.length,
          parts: body.map((p, i) => ({ key: `PT-${100 + i}`, name: p.name, job_no: p.job_no })),
        },
        201,
      );
    }
    if (method === 'POST' && path.endsWith('/add-file/')) return json({ ok: true }, 201);
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
  vi.spyOn(notify, 'info');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('lists the current user’s parts with the legacy defaults', async () => {
  renderPage();
  expect(screen.getAllByText('Görev Oluştur').length).toBeGreaterThan(0);
  expect(await screen.findByText('PT-10')).toBeInTheDocument();
  expect(screen.getByText('Toplam satır sayısı: 1')).toBeInTheDocument();
  const params = callsTo('GET', '/tasks/parts/')[0]!.url.searchParams;
  expect(params.get('created_by')).toBe('42');
  expect(params.get('ordering')).toBe('key');
  expect(params.get('page_size')).toBe('20');
});

it('shows the creator filter, defaulting to me, and lets it be changed or cleared', async () => {
  renderPage();
  await screen.findByText('PT-10');
  const pill = await screen.findByRole('button', { name: /Oluşturan/ });
  await waitFor(() => expect(pill).toHaveTextContent('Oya Pala (op)'));

  fireEvent.click(pill);
  fireEvent.change(await screen.findByLabelText('Seçeneklerde ara'), { target: { value: 'celik' } });
  fireEvent.click(await screen.findByText('Ali Çelik (ali)'));
  await waitFor(() =>
    expect(callsTo('GET', '/tasks/parts/').at(-1)!.url.searchParams.get('created_by')).toBe('7'),
  );

  fireEvent.click(screen.getByRole('button', { name: /Oluşturan/ }));
  fireEvent.click(await screen.findByText('Tümü'));
  await waitFor(() =>
    expect(callsTo('GET', '/tasks/parts/').at(-1)!.url.searchParams.has('created_by')).toBe(false),
  );
});

it('passes list filters to the request', async () => {
  renderPage(
    '/manufacturing/machining/tasks/create/?key=7&has_timer=true&finish_time_gte=2026-11-01',
  );
  await screen.findByText('PT-10');
  const params = callsTo('GET', '/tasks/parts/').at(-1)!.url.searchParams;
  expect(params.get('key')).toBe('PT-7');
  expect(params.get('has_timer')).toBe('true');
  expect(params.get('finish_time__gte')).toBe('2026-11-01');
});

it('validates like legacy', () => {
  const row: TaskDraft = {
    id: 'x',
    name: 'A',
    job_no: '',
    image_no: '',
    position_no: '',
    quantity: 0,
    material: '',
    weight_kg: -1,
    finish_time: null,
    description: '',
    files: [],
  };
  expect(validateDrafts([row])).toBe(
    'Lütfen aşağıdaki zorunlu alanları doldurun:\nSatır 1: İş No\nSatır 1: Bitiş Tarihi',
  );
  expect(validateDrafts([{ ...row, job_no: '254-01', finish_time: '2026-11-30' }])).toBe(
    "Lütfen aşağıdaki hataları düzeltin:\nSatır 1: Adet 0'dan büyük olmalıdır\nSatır 1: Ağırlık geçerli bir pozitif sayı olmalıdır",
  );
});

it('refuses empty required fields', async () => {
  renderPage();
  await screen.findByText('PT-10');
  fireEvent.click(screen.getByRole('button', { name: 'Görevleri Oluştur' }));
  expect(notify.error).toHaveBeenCalled();
  expect(callsTo('POST', '/tasks/parts/bulk-create/')).toHaveLength(0);
});

it('copies and removes rows, then creates the parts and uploads their files', async () => {
  renderPage();
  await screen.findByText('PT-10');
  const [first] = draftRows();
  // The only row cannot be removed.
  expect(within(first!).getByRole('button', { name: 'Sil' })).toBeDisabled();

  await typeInto(first!, 'name', 'Ad *', 'Kapak');
  expect(cell(draftRows()[0]!, 'name')).toHaveAttribute('data-cell-state', 'dirty');
  await typeInto(draftRows()[0]!, 'quantity', 'Adet *', '3');
  await typeInto(draftRows()[0]!, 'finish_time', 'Bitiş Tarihi *', '2026-11-30');
  await typeInto(draftRows()[0]!, 'weight_kg', 'Ağırlık (kg)', '1,5');

  // Job order: the searchable picker.
  const picker = within(draftRows()[0]!).getByLabelText('İş No', { selector: 'input' });
  fireEvent.click(picker);
  fireEvent.click(await screen.findByRole('option', { name: '254-01 - Kazan', hidden: true }));

  // A file on the first row.
  const file = new File(['x'], 'cizim.pdf', { type: 'application/pdf' });
  fireEvent.click(within(draftRows()[0]!).getByRole('button', { name: 'Dosya ekle' }));
  fireEvent.change(screen.getByTestId('bulk-file-upload-input'), { target: { files: [file] } });
  expect(await screen.findByText('cizim.pdf')).toBeInTheDocument();

  // Copy the row (files too), then add and remove an empty one.
  fireEvent.click(within(draftRows()[0]!).getByRole('button', { name: 'Kopyala' }));
  expect(draftRows()).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Satır Ekle' }));
  expect(draftRows()).toHaveLength(3);
  fireEvent.click(within(draftRows()[2]!).getByRole('button', { name: 'Sil' }));
  expect(draftRows()).toHaveLength(2);
  await typeInto(draftRows()[1]!, 'name', 'Ad *', 'Kapak 2');

  fireEvent.click(screen.getByRole('button', { name: 'Görevleri Oluştur' }));
  await waitFor(() => expect(callsTo('POST', '/tasks/parts/bulk-create/')).toHaveLength(1));
  const base = {
    job_no: '254-01',
    image_no: null,
    position_no: null,
    quantity: 3,
    material: null,
    weight_kg: 1.5,
    finish_time: '2026-11-30',
    description: null,
    operations: [],
  };
  expect(callsTo('POST', '/tasks/parts/bulk-create/')[0]!.body).toEqual([
    { name: 'Kapak', ...base },
    { name: 'Kapak 2', ...base },
  ]);
  await waitFor(() => expect(callsTo('POST', '/tasks/parts/PT-101/add-file/')).toHaveLength(1));
  expect(callsTo('POST', '/tasks/parts/PT-100/add-file/')).toHaveLength(1);
  const sent = callsTo('POST', '/tasks/parts/PT-100/add-file/')[0]!.body as FormData;
  expect((sent.getAll('files')[0] as File).name).toBe('cizim.pdf');

  expect(await screen.findByText('Görevler Başarıyla Oluşturuldu')).toBeInTheDocument();
  expect(screen.getByText('PT-100')).toBeInTheDocument();
  expect(notify.success).toHaveBeenCalledWith('2 parça başarıyla oluşturuldu! (2 dosya eklendi)');
  // The form starts over.
  await waitFor(() => expect(draftRows()).toHaveLength(1));
});

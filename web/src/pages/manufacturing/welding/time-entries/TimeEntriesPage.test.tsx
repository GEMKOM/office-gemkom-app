import { authedFetch } from '@legacy/authService.js';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { TimeEntriesPage } from './TimeEntriesPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const USERS = [
  { id: 1, username: 'ahmet', first_name: 'Ahmet', last_name: 'Yılmaz' },
  { id: 2, username: 'sukru', full_name: 'Şükrü Öztürk' },
];
const ALL_USERS = [...USERS, { id: 9, username: 'gitti', full_name: 'İsmail Gider' }];
const JOBS = [
  { job_no: '270-01', title: 'Tank' },
  { job_no: '270-02', title: 'Kazan' },
];

const ENTRIES = [
  {
    id: 101,
    employee: 1,
    employee_full_name: 'Ahmet Yılmaz',
    employee_username: 'ahmet',
    job_no: '270-01',
    date: '2026-10-05',
    hours: '7.50',
    overtime_type: 'after_hours',
    description: 'Gövde kaynağı',
    created_at: '2026-10-05T17:30:00',
  },
  {
    id: 102,
    employee: { id: 2, username: 'sukru', full_name: 'Şükrü Öztürk' },
    job_no: '270-02',
    date: '2026-10-06',
    hours: 8,
    overtime_type: 'holiday',
    description: '',
    created_at: '2026-10-06T08:00:00',
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
const listCalls = () =>
  calls().filter((c) => c.method === 'GET' && c.url.pathname === '/welding/time-entries/');

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/manufacturing/welding/time-entries') {
  return renderWithProviders(
    <ModalsProvider>
      <TimeEntriesPage />
      <LocationProbe />
    </ModalsProvider>,
    { route },
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const u = new URL(String(url));
    if (method === 'GET' && u.pathname === '/welding/time-entries/')
      return json({ count: 2, next: null, previous: null, results: ENTRIES });
    if (method === 'GET' && u.pathname === '/users/dropdown/')
      return json(u.searchParams.get('is_active') === 'all' ? ALL_USERS : USERS);
    if (method === 'GET' && u.pathname === '/projects/job-orders/dropdown/') return json(JOBS);
    if (method === 'POST' && u.pathname === '/welding/time-entries/bulk-create/')
      return json({ created_count: 2 }, 201);
    if (method === 'PATCH') return json(ENTRIES[0]);
    if (method === 'DELETE') return json(undefined, 204);
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('lists the entries with the legacy request and formatting', async () => {
  renderPage();
  expect(screen.getByText('Kaynak Zaman Kayıtları')).toBeInTheDocument();
  expect(await screen.findByText('Gövde kaynağı')).toBeInTheDocument();
  expect(screen.getByText('Ahmet Yılmaz')).toBeInTheDocument();
  // Nested employee shape.
  expect(screen.getByText('Şükrü Öztürk')).toBeInTheDocument();
  expect(screen.getByText('7.50')).toBeInTheDocument();
  expect(screen.getByText('Fazla Mesai (1.5x)')).toBeInTheDocument();
  expect(screen.getByText('Tatil (2x)')).toBeInTheDocument();
  // Tarih, and the Oluşturulma day above its time.
  expect(screen.getAllByText('05.10.2026')).toHaveLength(2);
  expect(screen.getByText('17:30:00')).toBeInTheDocument();

  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    page: '1',
    page_size: '20',
    ordering: '-date',
  });
  // Pickers: active users; paste matching: every account; all job orders.
  const lookups = calls().map((c) => `${c.url.pathname}${c.url.search}`);
  expect(lookups).toContain('/users/dropdown/');
  expect(lookups).toContain('/users/dropdown/?is_active=all');
  expect(lookups).toContain('/projects/job-orders/dropdown/?all=true');
});

it('sends the URL filters as the legacy params', async () => {
  renderPage(
    '/manufacturing/welding/time-entries?employee=2&job_no=270&date_after=2026-10-01&hours_min=1.5&overtime_type=holiday&ordering=hours&page=2',
  );
  await screen.findByText('Gövde kaynağı');
  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    employee: '2',
    job_no: '270',
    date_after: '2026-10-01',
    hours_min: '1.5',
    overtime_type: 'holiday',
    page: '2',
    page_size: '20',
    ordering: 'hours',
  });

  fireEvent.change(screen.getByLabelText('İş No'), { target: { value: '270-02' } });
  fireEvent.keyDown(screen.getByLabelText('İş No'), { key: 'Enter' });
  await waitFor(() =>
    expect(Object.fromEntries(listCalls().at(-1)!.url.searchParams)).toMatchObject({
      job_no: '270-02',
      page: '1',
    }),
  );
});

it('edits an entry and patches the legacy payload', async () => {
  renderPage();
  await screen.findByText('Gövde kaynağı');
  fireEvent.click(screen.getAllByRole('button', { name: 'Düzenle' })[0]!);
  const dialog = await screen.findByRole('dialog', { name: 'Zaman Kaydı Düzenle' });
  expect(within(dialog).getByLabelText(/Saat/)).toHaveValue(7.5);
  await waitFor(() =>
    expect(
      within(dialog).getByLabelText(/^Çalışan/, { selector: 'input:not([type=hidden])' }),
    ).toHaveValue('Ahmet Yılmaz (ahmet)'),
  );

  fireEvent.change(within(dialog).getByLabelText(/Saat/), { target: { value: '6.25' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));

  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Zaman kaydı başarıyla güncellendi'),
  );
  const patch = calls().find((c) => c.method === 'PATCH')!;
  expect(patch.url.pathname).toBe('/welding/time-entries/101/');
  expect(patch.body).toEqual({
    employee: 1,
    job_no: '270-01',
    date: '2026-10-05',
    hours: 6.25,
    overtime_type: 'after_hours',
    description: 'Gövde kaynağı',
  });
});

it('deletes an entry only after the confirm', async () => {
  renderPage();
  await screen.findByText('Gövde kaynağı');
  fireEvent.click(screen.getAllByRole('button', { name: 'Sil' })[0]!);
  const dialog = await screen.findByRole('dialog', { name: 'Zaman Kaydını Sil' });
  expect(
    within(dialog).getByText('Bu zaman kaydını silmek istediğinizden emin misiniz?'),
  ).toBeInTheDocument();
  expect(within(dialog).getByText('7.50')).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'DELETE')).toBe(false);

  fireEvent.click(within(dialog).getByRole('button', { name: 'Evet, Sil' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Zaman kaydı başarıyla silindi'));
  expect(calls().find((c) => c.method === 'DELETE')!.url.pathname).toBe(
    '/welding/time-entries/101/',
  );
});

// ---- Toplu Zaman Kaydı ----

function bulkRows(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>('tbody tr[data-row-id]'));
}
function bulkCell(dialog: HTMLElement, index: number, col: string): HTMLElement {
  const td = bulkRows(dialog)[index]?.querySelector<HTMLElement>(`td[data-col="${col}"]`);
  if (!td) throw new Error(`no cell ${index}/${col}`);
  return td;
}

async function openBulk() {
  renderPage();
  await screen.findByText('Gövde kaynağı');
  // Wait for the pickers to arrive so the editors have their options.
  await waitFor(() =>
    expect(calls().filter((c) => c.url.pathname === '/users/dropdown/')).toHaveLength(2),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Toplu Oluştur' }));
  return screen.findByRole('dialog', { name: 'Toplu Zaman Kaydı Oluştur' });
}

it('edits the draft grid inline, marks changed cells, and posts every row', async () => {
  const dialog = await openBulk();
  expect(bulkRows(dialog)).toHaveLength(1);
  expect(within(dialog).getByTestId('bulk-row-count')).toHaveTextContent(
    'Toplam satır sayısı: 1 / 300',
  );

  // Saving an empty row lists the required fields, as legacy did.
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kayıtları Oluştur' }));
  expect(await within(dialog).findByText('Satır 1: Çalışan')).toBeInTheDocument();
  expect(within(dialog).getByText('Satır 1: Mesai Tipi')).toBeInTheDocument();

  const editSelect = (col: string, label: RegExp, value: string) => {
    fireEvent.click(bulkCell(dialog, 0, col));
    const select = within(dialog).getByRole('combobox', { name: label });
    fireEvent.change(select, { target: { value } });
    fireEvent.keyDown(select, { key: 'Enter' });
  };
  editSelect('employee', /^Çalışan/, '2');
  expect(bulkCell(dialog, 0, 'employee')).toHaveTextContent('Şükrü Öztürk (sukru)');
  expect(bulkCell(dialog, 0, 'employee')).toHaveAttribute('data-cell-state', 'dirty');
  expect(bulkCell(dialog, 0, 'job_no')).not.toHaveAttribute('data-cell-state');
  editSelect('job_no', /^İş No/, '270-02');
  editSelect('overtime_type', /^Mesai Tipi/, 'regular');

  fireEvent.click(bulkCell(dialog, 0, 'date'));
  const date = within(dialog).getByLabelText(/^Tarih/);
  fireEvent.change(date, { target: { value: '2026-10-07' } });
  fireEvent.keyDown(date, { key: 'Enter' });

  fireEvent.click(bulkCell(dialog, 0, 'hours'));
  const hours = within(dialog).getByRole('textbox', { name: /^Saat/ });
  fireEvent.change(hours, { target: { value: '7,5' } });
  // Tab saves and opens the next editable cells (Mesai Tipi, then Açıklama).
  fireEvent.keyDown(hours, { key: 'Tab' });
  fireEvent.keyDown(within(dialog).getByRole('combobox', { name: /^Mesai Tipi/ }), { key: 'Tab' });
  const description = within(dialog).getByRole('textbox', { name: /^Açıklama/ });
  fireEvent.change(description, { target: { value: 'Kök paso' } });
  fireEvent.keyDown(description, { key: 'Enter' });
  expect(bulkCell(dialog, 0, 'hours')).toHaveTextContent('7,5');

  // Kopyala inserts a copy under the row; Sil is off while one row is left.
  fireEvent.click(within(bulkRows(dialog)[0]!).getByRole('button', { name: 'Kopyala' }));
  expect(bulkRows(dialog)).toHaveLength(2);
  expect(bulkCell(dialog, 1, 'description')).toHaveTextContent('Kök paso');

  fireEvent.click(within(dialog).getByRole('button', { name: 'Kayıtları Oluştur' }));
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('2 zaman kaydı başarıyla oluşturuldu'),
  );
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe('/welding/time-entries/bulk-create/');
  const entry = {
    employee: 2,
    job_no: '270-02',
    date: '2026-10-07',
    hours: 7.5,
    overtime_type: 'regular',
    description: 'Kök paso',
  };
  expect(post.body).toEqual({ entries: [entry, entry] });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await waitFor(() => expect(listCalls().length).toBeGreaterThan(1));
});

it('adds, removes and clears rows', async () => {
  const dialog = await openBulk();
  const remove = () => within(bulkRows(dialog)[0]!).getByRole('button', { name: 'Sil' });
  expect(remove()).toBeDisabled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Satır Ekle' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Satır Ekle' }));
  expect(bulkRows(dialog)).toHaveLength(3);
  fireEvent.click(remove());
  expect(bulkRows(dialog)).toHaveLength(2);

  fireEvent.click(within(dialog).getByRole('button', { name: 'Tümünü Temizle' }));
  expect(
    await screen.findByText('Tüm satırları temizlemek istediğinize emin misiniz?'),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Evet' }));
  await waitFor(() => expect(bulkRows(dialog)).toHaveLength(1));
  expect(within(dialog).getByText('Tüm satırlar temizlendi')).toBeInTheDocument();
});

it('pastes Excel rows: preview, failures, then into the grid', async () => {
  const dialog = await openBulk();
  fireEvent.click(within(dialog).getByRole('button', { name: "Excel'den Yapıştır" }));
  const input = within(dialog).getByLabelText('Excel verisi');

  fireEvent.click(within(dialog).getByRole('button', { name: 'Önizle' }));
  expect(within(dialog).getByText('Lütfen Excel verilerini yapıştırın')).toBeInTheDocument();

  fireEvent.change(input, {
    target: {
      value: [
        'Çalışan\tİş No\tTarih\tSaat\tMesai Tipi\tAçıklama',
        'yilmaz ahmet\t270-01\t05.10.2026\t7,5\tmesai\tGövde',
        'Ismail Gider (gitti)\t270-02\t06.10.2026\t4\t\t',
        'Kimse\t999\t07.10.2026\t3',
      ].join('\n'),
    },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Önizle' }));
  expect(within(dialog).getByText('2 satır eklenecek, 1 satır başarısız')).toBeInTheDocument();

  const preview = within(dialog).getByRole('region', { name: 'Önizleme' });
  expect(within(preview).getByText('2 satır')).toBeInTheDocument();
  expect(within(preview).getByText('Ahmet Yılmaz')).toBeInTheDocument();
  // A departed employee keeps the matched label.
  expect(within(preview).getByText('İsmail Gider (gitti)')).toBeInTheDocument();
  const failed = within(dialog).getByRole('region', { name: 'Başarısız Satırlar' });
  expect(within(failed).getByText('Çalışan bulunamadı, İş no listede yok')).toBeInTheDocument();
  expect(within(failed).getByText('4')).toBeInTheDocument();

  fireEvent.click(within(preview).getByRole('button', { name: 'Ekle' }));
  expect(within(dialog).getByText('2 satır tabloya eklendi')).toBeInTheDocument();
  expect(within(dialog).queryByLabelText('Excel verisi')).toBeNull();
  // The blank starting row made way for the pasted ones.
  expect(bulkRows(dialog)).toHaveLength(2);
  expect(bulkCell(dialog, 0, 'employee')).toHaveTextContent('Ahmet Yılmaz (ahmet)');
  expect(bulkCell(dialog, 0, 'job_no')).toHaveTextContent('270-01 - Tank');
  expect(bulkCell(dialog, 0, 'date')).toHaveTextContent('05.10.2026');
  expect(bulkCell(dialog, 0, 'overtime_type')).toHaveTextContent('Fazla Mesai (1.5x)');
  expect(bulkCell(dialog, 1, 'employee')).toHaveTextContent('İsmail Gider (gitti)');
  expect(bulkCell(dialog, 1, 'overtime_type')).toHaveTextContent('Normal (1x)');

  fireEvent.click(within(dialog).getByRole('button', { name: 'Kayıtları Oluştur' }));
  await waitFor(() => expect(calls().some((c) => c.method === 'POST')).toBe(true));
  expect(calls().find((c) => c.method === 'POST')!.body).toEqual({
    entries: [
      {
        employee: 1,
        job_no: '270-01',
        date: '2026-10-05',
        hours: 7.5,
        overtime_type: 'after_hours',
        description: 'Gövde',
      },
      {
        employee: 9,
        job_no: '270-02',
        date: '2026-10-06',
        hours: 4,
        overtime_type: 'regular',
        description: '',
      },
    ],
  });
});

it('shows the backend error inside the bulk modal', async () => {
  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((url, init) =>
    init?.method === 'POST' ? json({ errors: ['Satır 1: iş emri kapalı'] }, 400) : base(url, init),
  );
  const dialog = await openBulk();
  fireEvent.click(within(dialog).getByRole('button', { name: "Excel'den Yapıştır" }));
  fireEvent.change(within(dialog).getByLabelText('Excel verisi'), {
    target: { value: 'Ahmet Yılmaz\t270-01\t05.10.2026\t8' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Önizle' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Ekle' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kayıtları Oluştur' }));
  expect(await within(dialog).findByText('Hata: Satır 1: iş emri kapalı')).toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: 'Toplu Zaman Kaydı Oluştur' })).toBeInTheDocument();
});

it('caps the grid at 300 rows', async () => {
  const dialog = await openBulk();
  fireEvent.click(within(dialog).getByRole('button', { name: "Excel'den Yapıştır" }));
  const lines = Array.from(
    { length: 305 },
    (_, i) => `Ahmet Yılmaz\t270-01\t05.10.2026\t${(i % 9) + 1}`,
  );
  fireEvent.change(within(dialog).getByLabelText('Excel verisi'), {
    target: { value: lines.join('\n') },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Önizle' }));
  expect(within(dialog).getByText('305 satır başarıyla ayrıştırıldı')).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Ekle' }));
  expect(
    within(dialog).getByText(
      'Sadece 300 satır eklenebilir (Maksimum 300 satır limiti). İlk 300 satır eklenecek.',
    ),
  ).toBeInTheDocument();
  expect(within(dialog).getByTestId('bulk-row-count')).toHaveTextContent(
    'Toplam satır sayısı: 300 / 300 (Maksimum limit)',
  );
  expect(within(dialog).getByRole('button', { name: 'Satır Ekle' })).toBeDisabled();
});

import { authedFetch } from '@legacy/authService.js';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import {
  DESIGN_TASKS,
  MANUFACTURING_TASKS,
  PLANNING_TASKS,
  type DepartmentTasksConfig,
} from './config';
import { DepartmentTasksPage } from './DepartmentTasksPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ user: { username: 'ali' } }) }));

const fetchMock = vi.mocked(authedFetch);

const MAIN = {
  id: 1,
  job_order: '254-01',
  job_order_title: 'Konveyör Hattı',
  title: 'Dizayn',
  customer_name: 'Arçelik',
  status: 'in_progress',
  department: 'planning',
  subtasks_count: 2,
  weight: 10,
  completion_percentage: 40,
  assigned_to: 7,
  assigned_to_name: 'Ali Veli',
};
const STANDALONE = {
  id: 2,
  job_order: null,
  title: 'Kendi işimiz',
  status: 'pending',
  subtasks_count: 0,
};
const SUB = {
  id: 11,
  parent: 1,
  job_order: '254-01',
  title: 'Alt iş',
  status: 'pending',
  subtasks_count: 0,
};

let detail: Record<string, unknown> = { ...MAIN };
let rows: Record<string, unknown>[] = [MAIN, STANDALONE];
let standalone: Record<string, unknown> = STANDALONE;

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
  calls().filter(
    (c) =>
      c.method === 'GET' &&
      c.url.pathname === '/projects/department-tasks/' &&
      !c.url.searchParams.has('parent'),
  );
const lastParams = () => Object.fromEntries(listCalls().at(-1)!.url.searchParams);

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(config: DepartmentTasksConfig = PLANNING_TASKS, route = '/planning/projects/') {
  return renderWithProviders(
    <ModalsProvider>
      <DepartmentTasksPage config={config} />
      <LocationProbe />
    </ModalsProvider>,
    { route },
  );
}

function cell(rowId: string, col: string): HTMLElement {
  const td = document.querySelector<HTMLElement>(
    `tr[data-row-id="${rowId}"] td[data-col="${col}"]`,
  );
  if (!td) throw new Error(`no cell ${rowId}/${col}`);
  return td;
}

beforeEach(() => {
  detail = { ...MAIN };
  rows = [MAIN, STANDALONE];
  standalone = STANDALONE;
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const u = new URL(String(url));
    const path = u.pathname;
    if (method === 'GET' && path === '/projects/department-tasks/') {
      if (u.searchParams.get('parent') === '1')
        return json({ count: 1, next: null, previous: null, results: [SUB] });
      return json({ count: rows.length, next: null, previous: null, results: rows });
    }
    if (path === '/projects/department-tasks/status_choices/') {
      return json([
        { value: 'pending', label: 'Bekliyor' },
        { value: 'in_progress', label: 'Devam Ediyor' },
        { value: 'completed', label: 'Tamamlandı' },
      ]);
    }
    if (path === '/users/dropdown/')
      return json([{ id: 7, username: 'ali', full_name: 'Ali Veli' }]);
    if (method === 'GET' && path === '/projects/department-tasks/1/') return json(detail);
    if (method === 'GET' && path === '/projects/department-tasks/2/') return json(standalone);
    if (method === 'PATCH') return json({ ...MAIN });
    if (method === 'DELETE') return json(undefined, 204);
    if (path === '/projects/department-tasks/1/complete/')
      return json({ status: 'success', task: { ...MAIN, status: 'completed' } });
    if (method === 'POST') return json({ ok: true });
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
  vi.spyOn(notify, 'warning');
  vi.spyOn(notify, 'info');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('lists main tasks of the department with the legacy params', async () => {
  renderPage();
  expect(
    screen.getByRole('heading', { name: 'Planlama Departmanı Görevleri' }),
  ).toBeInTheDocument();
  expect(await screen.findByText('Konveyör Hattı')).toBeInTheDocument();
  expect(screen.getByText('Bağımsız')).toBeInTheDocument();
  expect(lastParams()).toEqual({
    department: 'planning',
    status__in: 'pending,in_progress',
    main_only: 'true',
    page: '1',
    page_size: '20',
  });
  // Users come from the cached dropdown, scoped to the department.
  const users = calls().find((c) => c.url.pathname === '/users/dropdown/')!;
  expect(Object.fromEntries(users.url.searchParams)).toEqual({
    is_active: 'true',
    department_code: 'planning',
  });
});

it('reads the filters from the URL; Tümü (status=) sends no status', async () => {
  renderPage(
    PLANNING_TASKS,
    '/planning/projects/?status=&search=abc&assigned_to=__unassigned__&page=2',
  );
  await screen.findByText('Konveyör Hattı');
  expect(lastParams()).toEqual({
    department: 'planning',
    assigned_to__isnull: 'true',
    main_only: 'true',
    search: 'abc',
    page: '2',
    page_size: '20',
  });
});

it('Temizle empties every filter, Durum included, and says so', async () => {
  renderPage(PLANNING_TASKS, '/planning/projects/?search=abc');
  await screen.findByText('Konveyör Hattı');
  fireEvent.click(screen.getByRole('button', { name: /Temizle/ }));
  await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('?status='));
  expect(notify.info).toHaveBeenCalledWith('Filtreler temizlendi');
});

it('expands a row: subtasks by parent and sequence, indented under it', async () => {
  renderPage();
  await screen.findByText('Konveyör Hattı');
  fireEvent.click(screen.getByRole('button', { name: 'Genişlet' }));
  expect(await screen.findByText('Alt iş')).toBeInTheDocument();
  const sub = calls().find((c) => c.url.searchParams.get('parent') === '1')!;
  expect(Object.fromEntries(sub.url.searchParams)).toEqual({
    department: 'planning',
    parent: '1',
    ordering: 'sequence',
  });
  const rows = [...document.querySelectorAll('tr[data-row-id]')].map((tr) =>
    tr.getAttribute('data-row-id'),
  );
  expect(rows).toEqual(['1', '11', '2']);
  fireEvent.click(screen.getByRole('button', { name: 'Daralt' }));
  await waitFor(() => expect(screen.queryByText('Alt iş')).not.toBeInTheDocument());
});

it('inline edit: PATCHes only the edited field and keeps the row', async () => {
  renderPage();
  await screen.findByText('Konveyör Hattı');
  fireEvent.click(cell('1', 'weight'));
  const input = screen.getByRole('textbox', { name: 'Ağırlık' });
  fireEvent.change(input, { target: { value: '7,5' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Ağırlık güncellendi'));
  const patch = calls().find((c) => c.method === 'PATCH')!;
  expect(patch.url.pathname).toBe('/projects/department-tasks/1/');
  expect(patch.body).toEqual({ weight: 7.5 });
  // No list reload for an inline edit.
  expect(listCalls()).toHaveLength(1);
});

it('inline progress refuses values over 99 without a request', async () => {
  renderPage();
  await screen.findByText('Konveyör Hattı');
  fireEvent.click(cell('1', 'completion_percentage'));
  const input = screen.getByRole('textbox', { name: 'Tamamlanma' });
  fireEvent.change(input, { target: { value: '120' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() =>
    expect(cell('1', 'completion_percentage')).toHaveAttribute('data-cell-state', 'error'),
  );
  expect(calls().some((c) => c.method === 'PATCH')).toBe(false);
});

it('Tamamla asks, completes and swaps in the returned task', async () => {
  renderPage();
  await screen.findByText('Konveyör Hattı');
  fireEvent.click(screen.getByRole('button', { name: 'Tamamla' }));
  expect(
    await screen.findByText('Bu görevi tamamlamak istediğinize emin misiniz?'),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Evet, Tamamla' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Görev tamamlandı'));
  expect(
    calls().find((c) => c.url.pathname === '/projects/department-tasks/1/complete/')!.body,
  ).toEqual({});
  expect(await within(cell('1', 'status')).findByText('Tamamlandı')).toBeInTheDocument();
});

it('manufacturing main tasks need the ERP acknowledgement', async () => {
  rows = [
    {
      ...MAIN,
      department: 'manufacturing',
      erp_product_codes: ' ABC-1\nABC-2 ',
      job_order_total_weight_kg: '1250.5',
    },
  ];
  renderPage(MANUFACTURING_TASKS, '/manufacturing/projects/');
  await screen.findByText('Konveyör Hattı');
  expect(screen.getByRole('columnheader', { name: 'İş Emri Ağırlığı' })).toBeInTheDocument();
  expect(screen.getByText('1.250,50 kg')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Tamamla' }));
  const dialog = await screen.findByRole('dialog', { name: 'Ürün Girişi Onayı' });
  expect(within(dialog).getByText(/ABC-1/)).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Onayla ve Tamamla' }));
  expect(notify.warning).toHaveBeenCalledWith(
    'Devam etmek için ürün girişini onaylamanız gerekir.',
  );
  fireEvent.click(within(dialog).getByRole('checkbox'));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Onayla ve Tamamla' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Görev tamamlandı'));
  expect(
    calls().find((c) => c.url.pathname === '/projects/department-tasks/1/complete/')!.body,
  ).toEqual({
    erp_acknowledged: true,
  });
});

it('?task= opens the task modal with its tabs; closing drops the param', async () => {
  renderPage(PLANNING_TASKS, '/planning/projects/?task=1');
  const dialog = await screen.findByRole('dialog', { name: 'Görev İşlemleri' });
  expect(await within(dialog).findByRole('tab', { name: 'Düzenle' })).toBeInTheDocument();
  // in_progress, has subtasks: no start, no delete.
  expect(within(dialog).queryByRole('tab', { name: 'Başlat' })).not.toBeInTheDocument();
  expect(within(dialog).queryByRole('tab', { name: 'Sil' })).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Görev güncellendi'));
  const patch = calls().find((c) => c.method === 'PATCH')!;
  expect(patch.body).toEqual({
    description: null,
    assigned_to: 7,
    target_start_date: null,
    target_completion_date: null,
    estimated_duration_wd: null,
    notes: null,
  });
  await waitFor(() => expect(screen.getByTestId('location').textContent).toBe(''));
});

it('Detay opens the modal through the URL', async () => {
  renderPage();
  await screen.findByText('Konveyör Hattı');
  fireEvent.click(screen.getAllByRole('button', { name: 'Detay' })[0]!);
  await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('?task=1'));
  expect(await screen.findByRole('dialog', { name: 'Görev İşlemleri' })).toBeInTheDocument();
});

it('Sil re-reads the task, confirms, deletes and reloads the list', async () => {
  renderPage();
  await screen.findByText('Konveyör Hattı');
  // Only the standalone row (no subtasks) shows Sil.
  fireEvent.click(screen.getByRole('button', { name: 'Sil' }));
  expect(
    await screen.findByText('Bu alt görevi silmek istediğinize emin misiniz?'),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Evet, Sil' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Görev silindi'));
  expect(calls().find((c) => c.method === 'DELETE')!.url.pathname).toBe(
    '/projects/department-tasks/2/',
  );
  await waitFor(() => expect(listCalls().length).toBeGreaterThan(1));
});

it('Sil is refused when the fresh task has subtasks', async () => {
  standalone = { ...STANDALONE, subtasks_count: 3 };
  renderPage();
  await screen.findByText('Konveyör Hattı');
  fireEvent.click(screen.getByRole('button', { name: 'Sil' }));
  await waitFor(() =>
    expect(notify.warning).toHaveBeenCalledWith('Alt görevi olan görev silinemez.'),
  );
  expect(calls().some((c) => c.method === 'DELETE')).toBe(false);
});

it('design: Tamamla on a job order task opens the release form and posts the release', async () => {
  detail = { ...MAIN, department: 'design' };
  renderPage(DESIGN_TASKS, '/design/projects/');
  await screen.findByText('Konveyör Hattı');
  expect(screen.getByRole('button', { name: /Yeni Görev/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Tamamla' }));
  const dialog = await screen.findByRole('dialog', { name: 'Teknik Çizim Yayını Oluştur' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Klasör yolu gereklidir'));
  fireEvent.change(within(dialog).getByLabelText(/Klasör Yolu/), { target: { value: 'C:\\X' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith(
      'Teknik çizim yayını incelemeye gönderildi. Görev, 2 değerlendirme sonrası tamamlanacaktır.',
    ),
  );
  const post = calls().find((c) => c.url.pathname === '/projects/drawing-releases/')!;
  expect(post.body).toEqual({
    job_order: '254-01',
    folder_path: 'C:\\X',
    changelog: '',
    revision_code: '',
    auto_complete_design_task: true,
  });
});

it('Gantt view asks for the visible month, ordered by start date', async () => {
  renderPage();
  await screen.findByText('Konveyör Hattı');
  fireEvent.click(screen.getByText('Gantt'));
  await waitFor(() => expect(lastParams().date_range_start).toBeDefined());
  expect(lastParams().ordering).toBe('target_start_date');
  expect(lastParams().date_range_start).toMatch(/-01$/);
  expect(await screen.findByText('Gantt Gorunumu')).toBeInTheDocument();
  // The table is gone; the rows-by-user switch shows up.
  expect(screen.queryByRole('columnheader', { name: 'Görev Başlığı' })).not.toBeInTheDocument();
  expect(screen.getByText('Kullanıcılara Göre')).toBeInTheDocument();
});

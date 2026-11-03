import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { ApiError, apiFetch, type ApiFetchOptions } from '@/api/client';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { TaskPlannerModal } from './TaskPlannerModal';

vi.mock('@/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/client')>()),
  apiFetch: vi.fn(),
  apiUpload: vi.fn(),
}));

const fetchMock = vi.mocked(apiFetch);

const TREE = {
  job_orders: [
    {
      job_no: '900',
      title: 'Ana İş',
      depth: 0,
      status: 'active',
      status_display: 'Aktif',
      can_plan: true,
      tasks: [
        { id: 1, title: 'Tasarım', department_display: 'Tasarım', sequence: 1, status: 'completed', status_display: 'Tamamlandı', subtask_count: 0 },
      ],
    },
    { job_no: '900-01', title: 'Alt İş 1', depth: 1, status: 'active', status_display: 'Aktif', can_plan: true, tasks: [] },
    {
      job_no: '900-02',
      title: 'Alt İş 2',
      depth: 1,
      status: 'active',
      status_display: 'Aktif',
      can_plan: true,
      tasks: [{ id: 2, title: 'Boya', department_display: 'Boya', sequence: 3, status: 'pending', status_display: 'Bekliyor' }],
    },
    { job_no: '900-03', title: 'Bitti', depth: 1, status: 'completed', status_display: 'Tamamlandı', can_plan: false, tasks: [] },
  ],
};

const TEMPLATE = {
  id: 2,
  name: 'Standart Üretim Akışı',
  is_default: true,
  items: [
    { id: 8, department: 'design', title: 'Dizayn', sequence: 1, weight: 10, task_type: null, depends_on: [], parent: null, children: [] },
    {
      id: 9,
      department: 'planning',
      title: 'Planlama',
      sequence: 2,
      weight: 10,
      task_type: null,
      depends_on: [8],
      parent: null,
      children: [{ id: 19, title: 'Talepler', sequence: 1, weight: 2, task_type: null }],
    },
  ],
};

type Handler = (path: string, options: ApiFetchOptions) => unknown;
let bulkPlan: Handler;
let treeFails = false;

beforeEach(() => {
  treeFails = false;
  bulkPlan = () => ({ message: '3 görev oluşturuldu' });
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (path: string, options: ApiFetchOptions = {}) => {
    if (path === '/projects/job-orders/900/task-planner/') {
      if (treeFails) throw new ApiError(500, {}, 'HTTP 500');
      return TREE;
    }
    if (path === '/projects/department-tasks/department_choices/') {
      return [
        { value: 'design', label: 'Tasarım' },
        { value: 'planning', label: 'Planlama' },
      ];
    }
    if (path === '/projects/task-templates/') return { count: 1, next: null, previous: null, results: [TEMPLATE] };
    if (path === '/projects/task-templates/2/') return TEMPLATE;
    if (path === '/projects/department-tasks/bulk_plan/') return bulkPlan(path, options);
    throw new ApiError(404, {}, `not mocked: ${path}`);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
  vi.spyOn(notify, 'warning');
  vi.spyOn(notify, 'info');
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderPlanner() {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  renderWithProviders(<TaskPlannerModal jobNo="900" onClose={onClose} onSaved={onSaved} />);
  return { onClose, onSaved };
}

const jobRow = (no: string) => document.querySelector<HTMLElement>(`[role="listitem"][data-job="${no}"]`)!;
const detail = () => document.querySelector<HTMLElement>('[data-tp-detail]')!;
const planRows = () => [...detail().querySelectorAll<HTMLElement>('tbody tr')];
const titleOf = (row: HTMLElement) => within(row).getByLabelText<HTMLInputElement>('Başlık').value;
const bulkPlanCalls = () => fetchMock.mock.calls.filter(([path]) => path === '/projects/department-tasks/bulk_plan/');

async function loaded() {
  await waitFor(() => expect(jobRow('900-01')).not.toBeNull());
}

it('loads the tree and focuses the first plannable job without tasks', async () => {
  renderPlanner();
  expect(screen.getByText('Yükleniyor…')).toBeInTheDocument();
  await loaded();
  expect(screen.getByText('Görev Planlama — 900')).toBeInTheDocument();
  expect(screen.getByText('Ana İş · 4 iş emri')).toBeInTheDocument();
  expect(jobRow('900-01')).toHaveAttribute('aria-current', 'true');
  expect(within(detail()).getByText('Bu iş emrinde kayıtlı görev yok.')).toBeInTheDocument();
  expect(within(detail()).getByText(/Bu iş emrine eklenecek görev yok\./)).toBeInTheDocument();
  expect(within(jobRow('900-03')).getByLabelText('900-03 seç')).toBeDisabled();
  expect(screen.getByText('Henüz eklenecek görev yok')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Kaydet/ })).toBeDisabled();
  const templateCall = fetchMock.mock.calls.find(([path]) => path === '/projects/task-templates/');
  expect(templateCall?.[1]?.params).toEqual({ is_active: true });

  // A job that is done cannot be planned.
  fireEvent.click(jobRow('900-03'));
  expect(within(detail()).getByText('Bu iş emri tamamlanmış; görev eklenemez.')).toBeInTheDocument();
  // Keyboard: Enter on a focused row opens it.
  fireEvent.keyDown(jobRow('900'), { key: 'Enter' });
  expect(within(detail()).getByText('Tasarım')).toBeInTheDocument();
});

it('shows the load error', async () => {
  treeFails = true;
  renderPlanner();
  expect(await screen.findByText('İş emri ağacı yüklenemedi.')).toBeInTheDocument();
});

it('adds main and sub rows by hand and removes a main row with its subtasks', async () => {
  renderPlanner();
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: 'Görev ekle' }));
  expect(planRows()).toHaveLength(1);
  expect(titleOf(planRows()[0]!)).toBe('Tasarım');
  expect(within(planRows()[0]!).getByLabelText<HTMLInputElement>('Sıra').value).toBe('1');
  expect(within(jobRow('900-01')).getByText('+1')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Kaydet (1)' })).toBeEnabled();

  fireEvent.click(within(planRows()[0]!).getByRole('button', { name: 'Alt görev ekle' }));
  expect(planRows()).toHaveLength(2);
  expect(within(planRows()[1]!).getByLabelText('Departman')).toBeDisabled();
  expect(within(planRows()[1]!).getByLabelText('Başlık')).toHaveAttribute('placeholder', 'Alt görev başlığı');

  // The department follows down, and a title still reading the old name follows it.
  fireEvent.change(within(planRows()[0]!).getByLabelText('Departman'), { target: { value: 'planning' } });
  expect(titleOf(planRows()[0]!)).toBe('Planlama');
  expect(within(planRows()[1]!).getByLabelText<HTMLSelectElement>('Departman').value).toBe('planning');

  fireEvent.click(within(planRows()[0]!).getByRole('button', { name: 'Sil' }));
  expect(planRows()).toHaveLength(0);
  expect(screen.getByText('Henüz eklenecek görev yok')).toBeInTheDocument();
});

it('refuses a weight below 1 and puts the old value back', async () => {
  renderPlanner();
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: 'Görev ekle' }));
  const weight = within(planRows()[0]!).getByLabelText<HTMLInputElement>('Ağırlık');
  fireEvent.change(weight, { target: { value: '0' } });
  fireEvent.blur(weight);
  expect(notify.warning).toHaveBeenCalledWith('Ağırlık en az 1 olmalıdır');
  expect(weight.value).toBe('10');

  fireEvent.change(weight, { target: { value: '25' } });
  fireEvent.keyDown(weight, { key: 'Enter' });
  expect(weight.value).toBe('25');
});

it('adds a template to the focused job', async () => {
  renderPlanner();
  await loaded();
  const select = within(detail()).getByLabelText('Şablon');
  expect(within(select).getByRole('option', { name: 'Standart Üretim Akışı (Varsayılan)' })).toBeInTheDocument();
  fireEvent.change(select, { target: { value: '2' } });
  fireEvent.click(within(detail()).getByRole('button', { name: 'Şablonu ekle' }));
  await waitFor(() => expect(planRows()).toHaveLength(3));
  expect(planRows().map(titleOf)).toEqual(['Dizayn', 'Planlama', 'Talepler']);
  expect(notify.success).toHaveBeenCalledWith('«Standart Üretim Akışı» eklendi');
  expect(screen.getByText('Kaydet (3)')).toBeInTheDocument();
});

it('applies a template to the selection, asking about jobs that already have tasks', async () => {
  renderPlanner();
  await loaded();
  fireEvent.click(within(jobRow('900-01')).getByLabelText('900-01 seç'));
  // Shift-click ticks the range (the done 900-03 stays out).
  fireEvent.click(within(jobRow('900-03')).getByLabelText('900-03 seç'));
  fireEvent.click(within(jobRow('900-02')).getByLabelText('900-02 seç'), { shiftKey: true });
  expect(screen.getByText('iş emri seçili').textContent).toBe('2 iş emri seçili');

  const bulk = document.querySelector('aside')!;
  fireEvent.change(within(bulk).getByLabelText('Şablon'), { target: { value: '2' } });
  fireEvent.click(within(bulk).getByRole('button', { name: /Seçililere uygula/ }));
  const prompt = await within(bulk).findByRole('alert');
  expect(prompt).toHaveTextContent('Seçili 2 iş emrinin 1 tanesinde zaten kayıtlı görev var. «Standart Üretim Akışı» nereye uygulansın?');

  fireEvent.click(within(prompt).getByRole('button', { name: 'Yalnızca görevsizlere (1)' }));
  await waitFor(() => expect(within(jobRow('900-01')).getByText('+3')).toBeInTheDocument());
  expect(within(jobRow('900-02')).queryByText('+3')).not.toBeInTheDocument();
  // One target: the short message (legacy).
  expect(notify.success).toHaveBeenCalledWith('«Standart Üretim Akışı» eklendi');

  // Copy the focused plan to the other selected job.
  fireEvent.click(within(detail()).getByRole('button', { name: 'Seçililere kopyala (1)' }));
  expect(within(jobRow('900-02')).getByText('+3')).toBeInTheDocument();
  expect(notify.success).toHaveBeenCalledWith('3 görev 1 iş emrine kopyalandı');

  // The eraser clears what the selection got.
  fireEvent.click(within(bulk).getByRole('button', { name: 'Seçililere eklenen yeni görevleri temizle' }));
  expect(notify.info).toHaveBeenCalledWith('2 iş emrinden 6 yeni görev kaldırıldı');
  expect(screen.getByText('Henüz eklenecek görev yok')).toBeInTheDocument();
});

it('stops the save on a plan problem and shows it on the job', async () => {
  renderPlanner();
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: 'Görev ekle' }));
  fireEvent.click(within(planRows()[0]!).getByRole('button', { name: 'Alt görev ekle' }));
  fireEvent.click(screen.getByRole('button', { name: 'Kaydet (2)' }));
  expect(notify.error).toHaveBeenCalledWith('900-01: Alt görev başlığı boş');
  expect(within(detail()).getByRole('alert')).toHaveTextContent('900-01: Alt görev başlığı boş');
  expect(planRows()[1]).toHaveAttribute('data-error', 'true');
  expect(jobRow('900-01')).toHaveAttribute('data-error', 'true');
  expect(bulkPlanCalls()).toHaveLength(0);
});

it('saves every plan in one request', async () => {
  const { onClose, onSaved } = renderPlanner();
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: 'Görev ekle' }));
  fireEvent.click(within(planRows()[0]!).getByRole('button', { name: 'Alt görev ekle' }));
  fireEvent.change(within(planRows()[1]!).getByLabelText('Başlık'), { target: { value: ' Çizim ' } });
  fireEvent.change(within(planRows()[1]!).getByLabelText('Görev tipi'), { target: { value: 'welding' } });
  // A second job gets a row too.
  fireEvent.click(jobRow('900-02'));
  fireEvent.click(screen.getByRole('button', { name: 'Görev ekle' }));
  expect(within(planRows()[0]!).getByLabelText<HTMLInputElement>('Sıra').value).toBe('4');

  fireEvent.click(screen.getByRole('button', { name: 'Kaydet (3)' }));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(bulkPlanCalls()).toHaveLength(1);
  const [, options] = bulkPlanCalls()[0]!;
  expect(options?.method).toBe('POST');
  expect(options?.body).toEqual({
    plans: [
      {
        job_order: '900-01',
        tasks: [
          { temp_id: -1, department: 'design', title: 'Tasarım', sequence: 1, weight: 10 },
          { temp_id: -2, department: 'design', title: 'Çizim', sequence: 1, weight: 10, parent: -1, task_type: 'welding' },
        ],
        dependencies: [],
      },
      {
        job_order: '900-02',
        tasks: [{ temp_id: -1, department: 'design', title: 'Tasarım', sequence: 4, weight: 10 }],
        dependencies: [],
      },
    ],
  });
  expect(notify.success).toHaveBeenCalledWith('3 görev oluşturuldu');
  expect(onSaved).toHaveBeenCalled();
});

it('points a server error at its job and row', async () => {
  bulkPlan = () => {
    throw new ApiError(400, { message: 'Plan geçersiz', job_order: '900-01', temp_id: -1, errors: { weight: ['Çok büyük'] } }, 'Plan geçersiz');
  };
  const { onClose } = renderPlanner();
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: 'Görev ekle' }));
  fireEvent.click(jobRow('900'));
  fireEvent.click(screen.getByRole('button', { name: 'Kaydet (1)' }));
  await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Plan geçersiz Ağırlık: Çok büyük'));
  expect(jobRow('900-01')).toHaveAttribute('aria-current', 'true');
  expect(within(detail()).getByRole('alert')).toHaveTextContent('Plan geçersiz Ağırlık: Çok büyük');
  expect(planRows()[0]).toHaveAttribute('data-error', 'true');
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Kaydet (1)' })).toBeEnabled();
});

it('asks before closing with unsaved rows', async () => {
  const { onClose } = renderPlanner();
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: 'Görev ekle' }));
  fireEvent.click(screen.getByRole('button', { name: 'İptal' }));
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByText('Kaydedilmemiş 1 görev silinecek.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
  expect(screen.queryByText('Kaydedilmemiş 1 görev silinecek.')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'İptal' }));
  fireEvent.click(screen.getByRole('button', { name: 'Kaydetmeden kapat' }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('closes at once when nothing is planned', async () => {
  const { onClose } = renderPlanner();
  await loaded();
  fireEvent.click(screen.getByRole('button', { name: 'İptal' }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('filters and searches the job list', async () => {
  renderPlanner();
  await loaded();
  fireEvent.change(screen.getByLabelText('Filtre'), { target: { value: 'no_tasks' } });
  expect(jobRow('900')).toBeNull();
  expect(jobRow('900-01')).not.toBeNull();
  expect(jobRow('900-03')).not.toBeNull();
  fireEvent.change(screen.getByLabelText('Filtre'), { target: { value: 'all' } });
  fireEvent.change(screen.getByPlaceholderText('İş emri no veya başlık ara'), { target: { value: 'BİTTİ' } });
  expect(document.querySelectorAll('[role="listitem"]')).toHaveLength(1);
  fireEvent.change(screen.getByPlaceholderText('İş emri no veya başlık ara'), { target: { value: 'yok' } });
  expect(screen.getByText('Filtreye uyan iş emri yok.')).toBeInTheDocument();
});

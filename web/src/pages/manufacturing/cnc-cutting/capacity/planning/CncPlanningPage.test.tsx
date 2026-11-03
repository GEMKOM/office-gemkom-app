import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import {
  bar,
  dragRowBefore,
  ganttOrder,
  json,
  mockBackend,
  stubLayout,
  tableOrder,
  typeOrder,
} from '../../../capacity-shared/testSupport';
import { cncApiFilters, CncPlanningPage } from './CncPlanningPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const HOUR = 3_600_000;
const T0 = new Date(2026, 10, 3, 8).getTime(); // Tue 3 Nov 2026 08:00
const TASKS = [
  {
    key: 'CNC-1',
    name: 'Sac A',
    nesting_id: 'N-1',
    in_plan: true,
    plan_order: 1,
    plan_locked: false,
    planned_start_ms: T0,
    planned_end_ms: T0 + 4 * HOUR,
    machine_fk: 3,
  },
  {
    key: 'CNC-2',
    name: 'Sac B',
    nesting_id: 'N-2',
    in_plan: true,
    plan_order: 2,
    plan_locked: false,
    planned_start_ms: T0 + 4 * HOUR,
    planned_end_ms: T0 + 6 * HOUR,
    machine_fk: 3,
  },
  {
    key: 'CNC-3',
    name: 'Sac C',
    nesting_id: 'N-3',
    in_plan: false,
    plan_order: null,
    plan_locked: false,
    machine_fk: 3,
  },
];

// A third planned row, for the reorder tests.
const QUEUE = [
  ...TASKS,
  {
    key: 'CNC-4',
    name: 'Sac D',
    nesting_id: 'N-4',
    in_plan: true,
    plan_order: 3,
    plan_locked: false,
    planned_start_ms: T0 + 6 * HOUR,
    planned_end_ms: T0 + 7 * HOUR,
    machine_fk: 3,
  },
];

let saveStatus = 200;
let planTasks: typeof TASKS = TASKS;
let backend: ReturnType<typeof mockBackend>;
let restoreLayout: () => void;

beforeAll(() => {
  restoreLayout = stubLayout();
});
afterAll(() => restoreLayout());

beforeEach(() => {
  saveStatus = 200;
  planTasks = TASKS;
  backend = mockBackend((url, method) => {
    if (url.pathname === '/machines/')
      return json({ count: 1, results: [{ id: 3, name: 'Plazma 1', tasks_count: 3 }] });
    if (url.pathname === '/cnc_cutting/planning/list/') return json(planTasks);
    if (url.pathname === '/machines/calendar') return json({});
    if (url.pathname === '/cnc_cutting/planning/bulk-save/' && method === 'POST') {
      return saveStatus === 200
        ? json({ ok: true })
        : json({ detail: 'Sunucu hatası' }, saveStatus);
    }
    return undefined;
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
  vi.spyOn(notify, 'info');
});
afterEach(() => vi.restoreAllMocks());

function renderPage(route = '/manufacturing/cnc-cutting/capacity/planning/?machine=3') {
  return renderWithProviders(
    <ModalsProvider>
      <CncPlanningPage />
    </ModalsProvider>,
    { route },
  );
}

const saves = () =>
  backend
    .calls()
    .filter((c) => c.method === 'POST' && c.url.pathname === '/cnc_cutting/planning/bulk-save/');

it('maps the filters like legacy buildPlanningFilters', () => {
  expect(
    cncApiFilters({
      nesting_id: ' N-1 ',
      thickness_mm: '10',
      material: '',
      machine_fk: '4',
      status: 'pending',
    }),
  ).toEqual({
    nesting_id: 'N-1',
    thickness_mm: '10',
    completion_date__isnull: 'true',
  });
});

it('loads the selected machine and its plan with the machine_fk', async () => {
  renderPage();
  expect(await screen.findByText('N-1')).toBeInTheDocument();
  const list = backend.calls().find((c) => c.url.pathname === '/cnc_cutting/planning/list/')!;
  expect(list.url.searchParams.get('machine_fk')).toBe('3');
  expect(
    backend
      .calls()
      .find((c) => c.url.pathname === '/machines/')!
      .url.searchParams.get('used_in'),
  ).toBe('cutting');
  await waitFor(() => expect(bar('CNC-1')).not.toBeNull());
});

it('moves a bar, shows it unsaved and saves the legacy payload', async () => {
  renderPage();
  await waitFor(() => expect(bar('CNC-1')).not.toBeNull());
  // Alt+→ moves the bar one snap step (1 h in the month view).
  fireEvent.keyDown(bar('CNC-1')!, { key: 'ArrowRight', altKey: true });
  expect(await screen.findByText('Kaydedilmemiş değişiklik: 1')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Planı Kaydet' }));
  await waitFor(() => expect(saves()).toHaveLength(1));
  expect(saves()[0]!.body).toEqual({
    items: [
      {
        key: 'CNC-1',
        in_plan: true,
        machine_fk: 3,
        name: 'Sac A',
        planned_start_ms: T0 + HOUR,
        planned_end_ms: T0 + 5 * HOUR,
        plan_order: 1,
        plan_locked: false,
      },
    ],
  });
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Plan başarıyla kaydedildi'));
});

it('keeps the change when saving fails and sends it once more on retry', async () => {
  saveStatus = 500;
  renderPage();
  await waitFor(() => expect(bar('CNC-2')).not.toBeNull());
  fireEvent.keyDown(bar('CNC-2')!, { key: 'ArrowRight', altKey: true, shiftKey: true });
  await screen.findByText('Kaydedilmemiş değişiklik: 1');

  fireEvent.click(screen.getByRole('button', { name: 'Planı Kaydet' }));
  expect(await screen.findByText('Kaydedilemedi: 1 değişiklik bekliyor')).toBeInTheDocument();
  expect(notify.error).toHaveBeenCalledWith(
    expect.stringContaining('Plan kaydedilirken hata oluştu'),
  );
  // Rolled back to the draft: the bar still shows the edited end.
  expect(bar('CNC-2')).toHaveAttribute('aria-label', expect.stringContaining('15:00'));

  saveStatus = 200;
  fireEvent.click(screen.getByRole('button', { name: 'Planı Kaydet' }));
  await waitFor(() => expect(saves()).toHaveLength(2));
  expect(saves()[1]!.body).toEqual(saves()[0]!.body);
  expect((saves()[1]!.body as { items: unknown[] }).items).toHaveLength(1);
});

it('removes from and adds to the plan', async () => {
  renderPage();
  await screen.findByText('N-1');
  const row = screen.getByText('N-2').closest('tr')!;
  fireEvent.click(within(row).getByRole('button', { name: 'Plandan Çıkar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Planlanmamış Görevler' }));
  const unplanned = await screen.findByText('N-3');
  fireEvent.click(within(unplanned.closest('tr')!).getByRole('button', { name: 'Plana Ekle' }));
  fireEvent.click(screen.getByRole('button', { name: 'Planı Kaydet' }));
  await waitFor(() => expect(saves()).toHaveLength(1));
  expect(saves()[0]!.body).toEqual({
    items: [
      { key: 'CNC-2', in_plan: false },
      {
        key: 'CNC-3',
        in_plan: true,
        machine_fk: 3,
        name: 'Sac C',
        plan_order: 2,
        plan_locked: false,
      }, // after CNC-1 (CNC-2 left)
    ],
  });
});

it('says there is nothing to save', async () => {
  renderPage();
  await screen.findByText('N-1');
  fireEvent.click(screen.getByRole('button', { name: 'Planı Kaydet' }));
  expect(notify.info).toHaveBeenCalledWith('Kaydedilecek değişiklik bulunmuyor');
  expect(saves()).toHaveLength(0);
});

/** The planned table's rows (the machine list is a table too). */
const queue = () => tableOrder(screen.getByText('N-1').closest('tbody')!);
const orders = (body: unknown) =>
  Object.fromEntries(
    (body as { items: { key: string; plan_order?: number }[] }).items.map((i) => [
      i.key,
      i.plan_order,
    ]),
  );

it('drags a row in the table: the timeline follows and one save sends the new sequence', async () => {
  planTasks = QUEUE;
  renderPage();
  await screen.findByText('N-4');
  await waitFor(() => expect(ganttOrder()).toEqual(['CNC-1', 'CNC-2', 'CNC-4']));
  expect(queue()).toEqual(['CNC-1', 'CNC-2', 'CNC-4']);

  dragRowBefore('CNC-4', 'CNC-1');
  expect(queue()).toEqual(['CNC-4', 'CNC-1', 'CNC-2']);
  expect(ganttOrder()).toEqual(['CNC-4', 'CNC-1', 'CNC-2']);
  expect(screen.getByText('Kaydedilmemiş değişiklik: 3')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Planı Kaydet' }));
  await waitFor(() => expect(saves()).toHaveLength(1));
  expect(orders(saves()[0]!.body)).toEqual({ 'CNC-1': 2, 'CNC-2': 3, 'CNC-4': 1 });
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Plan başarıyla kaydedildi'));
});

it('moves a row to a typed Sıra, shifting the others, and keeps it when the save fails', async () => {
  planTasks = QUEUE;
  saveStatus = 500;
  renderPage();
  await screen.findByText('N-4');

  // 1 -> 3: the rows in between move up.
  typeOrder('CNC-1', '3');
  expect(queue()).toEqual(['CNC-2', 'CNC-4', 'CNC-1']);
  expect(ganttOrder()).toEqual(['CNC-2', 'CNC-4', 'CNC-1']);
  const sira = (key: string) =>
    document.querySelector(`tr[data-row-id="${key}"] td[data-col="plan_order"]`);
  expect(sira('CNC-2')).toHaveTextContent('1');
  expect(sira('CNC-1')).toHaveTextContent('3');

  // 3 -> 1 through "Görev Düzenle": the others move down.
  fireEvent.click(
    within(screen.getByText('N-4').closest('tr')!).getByRole('button', { name: 'Düzenle' }),
  );
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Sıra' }), {
    target: { value: '1' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(queue()).toEqual(['CNC-4', 'CNC-2', 'CNC-1']));

  // Out of range: refused in the cell, nothing moves.
  typeOrder('CNC-2', '9');
  expect(sira('CNC-2')).toHaveAttribute('data-cell-state', 'error');
  expect(queue()).toEqual(['CNC-4', 'CNC-2', 'CNC-1']);

  fireEvent.click(screen.getByRole('button', { name: 'Planı Kaydet' }));
  // CNC-2 is back on its server place, so only the two others go out.
  expect(await screen.findByText('Kaydedilemedi: 2 değişiklik bekliyor')).toBeInTheDocument();
  expect(saves()).toHaveLength(1);
  expect(orders(saves()[0]!.body)).toEqual({ 'CNC-1': 3, 'CNC-4': 1 });
  // Rolled back into the draft: the new order is still on screen.
  expect(queue()).toEqual(['CNC-4', 'CNC-2', 'CNC-1']);
  expect(ganttOrder()).toEqual(['CNC-4', 'CNC-2', 'CNC-1']);
});

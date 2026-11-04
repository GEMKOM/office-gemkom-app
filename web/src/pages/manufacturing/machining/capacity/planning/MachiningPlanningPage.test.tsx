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
import { formatDueDate, MachiningPlanningPage } from './MachiningPlanningPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const HOUR = 3_600_000;
const T0 = new Date(2026, 10, 3, 8).getTime();
const OPS = [
  {
    key: 'OP-1',
    name: 'Kaba torna',
    part_name: 'Mil',
    in_plan: true,
    plan_order: 1,
    plan_locked: false,
    planned_start_ms: T0,
    planned_end_ms: T0 + 2 * HOUR,
    estimated_hours: 2,
    total_hours_spent: 0,
  },
  {
    key: 'OP-2',
    name: 'Freze',
    part_name: 'Flanş',
    in_plan: true,
    plan_order: 2,
    plan_locked: true,
    planned_start_ms: T0 + 2 * HOUR,
    planned_end_ms: T0 + 4 * HOUR,
    estimated_hours: 2,
  },
  {
    key: 'OP-3',
    name: 'Taşlama',
    part_name: 'Burç',
    in_plan: true,
    plan_order: 3,
    plan_locked: false,
    planned_start_ms: T0 + 4 * HOUR,
    planned_end_ms: T0 + 5 * HOUR,
    estimated_hours: 1,
  },
  {
    key: 'OP-9',
    name: 'Delme',
    part_name: 'Kapak',
    in_plan: false,
    plan_order: null,
    plan_locked: false,
  },
];

let backend: ReturnType<typeof mockBackend>;
let restoreLayout: () => void;
beforeAll(() => {
  restoreLayout = stubLayout();
});
afterAll(() => restoreLayout());

beforeEach(() => {
  backend = mockBackend((url, method) => {
    if (url.pathname === '/machines/dropdown/') return json([{ id: 21, name: 'Torna 1' }]);
    if (url.pathname === '/tasks/operations/') return json({ count: OPS.length, results: OPS });
    if (url.pathname === '/machines/calendar') return json({});
    if (url.pathname === '/tasks/operations/planning/bulk-save/' && method === 'PUT')
      return json([]);
    if (url.pathname === '/tasks/operations/planning/reschedule/' && method === 'POST') {
      return json({
        scheduled: 12,
        late_parts: ['P-1'],
        flags: { estimate_missing: 2, due_missing: [] },
      });
    }
    if (/\/tasks\/operations\/OP-\d\/(lock|unlock)\/$/.test(url.pathname)) return json({});
    if (url.pathname === '/tasks/operations/OP-1/' && method === 'PATCH') return json({});
    return undefined;
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'info');
  vi.spyOn(notify, 'show');
});
afterEach(() => vi.restoreAllMocks());

function renderPage() {
  return renderWithProviders(
    <ModalsProvider>
      <MachiningPlanningPage />
    </ModalsProvider>,
    { route: '/manufacturing/machining/capacity/planning/?machine=21' },
  );
}

it('formats due dates without timezone drift', () => {
  expect(formatDueDate('2026-09-30')).toBe('30.09.2026');
  expect(formatDueDate(null)).toBe('');
});

it('loads incomplete operations of the machine', async () => {
  renderPage();
  expect(await screen.findByText('Mil')).toBeInTheDocument();
  const list = backend.calls().find((c) => c.url.pathname === '/tasks/operations/')!;
  expect(Object.fromEntries(list.url.searchParams)).toEqual({
    machine_fk: '21',
    completion_date__isnull: 'true',
    page_size: '1000',
  });
});

it('reorders the queue in the Gantt and saves dragged rows locked', async () => {
  renderPage();
  await waitFor(() => expect(bar('OP-3')).not.toBeNull());
  fireEvent.keyDown(bar('OP-3')!, { key: 'ArrowUp', altKey: true });
  expect(await screen.findByText('Kaydedilmemiş değişiklik: 2')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Planı Kaydet' }));
  await waitFor(() => expect(backend.calls().some((c) => c.method === 'PUT')).toBe(true));
  expect(backend.calls().find((c) => c.method === 'PUT')!.body).toEqual([
    { key: 'OP-2', in_plan: true, plan_order: 3 },
    { key: 'OP-3', in_plan: true, plan_order: 2, plan_locked: true },
  ]);
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith(
      'Plan kaydedildi; sıra ve tarihler yeniden hesaplandı',
    ),
  );
});

/** The operations table's rows (the machine list is a table too). */
const queue = () => tableOrder(screen.getByText('Mil').closest('tbody')!);
const put = () => backend.calls().find((c) => c.method === 'PUT')?.body;

it('drags an unplanned row into the queue in the table, locked where it is dropped', async () => {
  renderPage();
  await screen.findByText('Mil');
  expect(queue()).toEqual(['OP-1', 'OP-2', 'OP-3', 'OP-9']);
  dragRowBefore('OP-9', 'OP-2');
  expect(queue()).toEqual(['OP-1', 'OP-9', 'OP-2', 'OP-3']);
  await waitFor(() => expect(ganttOrder().slice(0, 4)).toEqual(['OP-1', 'OP-9', 'OP-2', 'OP-3']));
  fireEvent.click(screen.getByRole('button', { name: 'Planı Kaydet' }));
  await waitFor(() => expect(put()).toBeDefined());
  expect(put()).toEqual([
    { key: 'OP-2', in_plan: true, plan_order: 3 },
    { key: 'OP-3', in_plan: true, plan_order: 4 },
    { key: 'OP-9', in_plan: true, plan_order: 2, plan_locked: true },
  ]);
});

it('moves an operation to a typed Sıra and pulls the ones in between up', async () => {
  renderPage();
  await screen.findByText('Mil');
  typeOrder('OP-1', '3');
  expect(queue()).toEqual(['OP-2', 'OP-3', 'OP-1', 'OP-9']);
  expect(await screen.findByText('Kaydedilmemiş değişiklik: 3')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Planı Kaydet' }));
  await waitFor(() => expect(put()).toBeDefined());
  expect(put()).toEqual([
    { key: 'OP-1', in_plan: true, plan_order: 3, plan_locked: true },
    { key: 'OP-2', in_plan: true, plan_order: 1 },
    { key: 'OP-3', in_plan: true, plan_order: 2 },
  ]);
});

it('does not change a lock while the queue has unsaved changes', async () => {
  renderPage();
  await waitFor(() => expect(bar('OP-3')).not.toBeNull());
  fireEvent.keyDown(bar('OP-3')!, { key: 'ArrowUp', altKey: true });
  await screen.findByText('Kaydedilmemiş değişiklik: 2');
  fireEvent.click(screen.getByRole('button', { name: 'OP-1 sırasını kilitle' }));
  expect(notify.info).toHaveBeenCalledWith('Kilidi değiştirmeden önce planı kaydedin');
  expect(backend.calls().some((c) => c.url.pathname.endsWith('/lock/'))).toBe(false);
});

it('locks and unlocks through the thin endpoints', async () => {
  renderPage();
  await screen.findByText('Mil');
  fireEvent.click(screen.getByRole('button', { name: 'OP-2 kilidini aç' }));
  await waitFor(() =>
    expect(
      backend
        .calls()
        .some((c) => c.method === 'POST' && c.url.pathname === '/tasks/operations/OP-2/unlock/'),
    ).toBe(true),
  );
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith(
      'Kilit açıldı; sıra termine göre yeniden hesaplandı',
      { autoClose: 2000 },
    ),
  );
});

it('reschedules on the server and reports the result', async () => {
  renderPage();
  await screen.findByText('Mil');
  fireEvent.click(screen.getByRole('button', { name: 'Yeniden Planla' }));
  await waitFor(() =>
    expect(notify.show).toHaveBeenCalledWith(
      'Yeniden planlandı: 12 operasyon, 1 geç parça (2 tahmin eksik)',
      'info',
      { autoClose: 5000 },
    ),
  );
});

it('edits the estimate with a PATCH', async () => {
  renderPage();
  await screen.findByText('Mil');
  fireEvent.click(screen.getByRole('button', { name: 'OP-1 tahmini saatini düzenle' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Tahmini Saat'), { target: { value: '3.5' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() =>
    expect(backend.calls().find((c) => c.method === 'PATCH')?.body).toEqual({
      estimated_hours: 3.5,
    }),
  );
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Tahmini saat güncellendi', { autoClose: 2000 }),
  );
});

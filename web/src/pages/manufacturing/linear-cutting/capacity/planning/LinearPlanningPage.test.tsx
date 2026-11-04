import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor } from '@testing-library/react';
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
import { linearApiFilters, LinearPlanningPage } from './LinearPlanningPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const HOUR = 3_600_000;
const T0 = new Date(2026, 10, 3, 8).getTime();

let backend: ReturnType<typeof mockBackend>;
let restoreLayout: () => void;
beforeAll(() => {
  restoreLayout = stubLayout();
});
afterAll(() => restoreLayout());

beforeEach(() => {
  backend = mockBackend((url, method) => {
    if (url.pathname === '/machines/')
      return json({ count: 1, results: [{ id: 5, name: 'Testere 1' }] });
    if (url.pathname === '/linear_cutting/planning/list/') {
      return json({
        tasks: [
          {
            key: 'LC-1',
            name: 'Bar 1',
            item_name: 'NPU 100',
            in_plan: true,
            plan_order: 1,
            plan_locked: false,
            planned_start_ms: T0,
            planned_end_ms: T0 + 2 * HOUR,
            machine_fk: 5,
          },
          { key: 'LC-2', name: 'Bar 2', material: 'Boru', in_plan: false },
          { key: 'LC-3', name: 'Bar 3', item_name: 'HEA 200', in_plan: true, plan_order: 2 },
          { key: 'LC-4', name: 'Bar 4', item_name: 'IPE 80', in_plan: true, plan_order: 3 },
        ],
      });
    }
    if (url.pathname === '/machines/calendar') return json({});
    if (url.pathname === '/linear_cutting/planning/bulk-save/' && method === 'POST')
      return json({});
    return undefined;
  });
  vi.spyOn(notify, 'success');
});
afterEach(() => vi.restoreAllMocks());

it('sends the session and completed filters (legacy never did: it read them with a missing method)', () => {
  expect(linearApiFilters({ session: 'LC-0004', completed: 'false' })).toEqual({
    session: 'LC-0004',
    completed: 'false',
  });
  expect(linearApiFilters({ session: '', completed: '' })).toEqual({});
});

it('reads the { tasks } list, edits a bar and saves', async () => {
  renderWithProviders(
    <ModalsProvider>
      <LinearPlanningPage />
    </ModalsProvider>,
    { route: '/planning/linear-cutting/capacity/?machine=5&session=LC-0004' },
  );
  expect(await screen.findByText('NPU 100')).toBeInTheDocument();
  const list = backend.calls().find((c) => c.url.pathname === '/linear_cutting/planning/list/')!;
  expect(Object.fromEntries(list.url.searchParams)).toEqual({
    session: 'LC-0004',
    machine_fk: '5',
  });

  const save = screen.getByRole('button', { name: 'Planı Kaydet' });
  expect(save).toBeDisabled();
  await waitFor(() => expect(bar('LC-1')).not.toBeNull());
  fireEvent.keyDown(bar('LC-1')!, { key: 'ArrowRight', altKey: true });
  await waitFor(() => expect(save).toBeEnabled());
  fireEvent.click(save);
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Plan kaydedildi'));
  expect(backend.calls().find((c) => c.method === 'POST')!.body).toEqual({
    items: [
      {
        key: 'LC-1',
        in_plan: true,
        machine_fk: 5,
        name: 'Bar 1',
        planned_start_ms: T0 + HOUR,
        planned_end_ms: T0 + 3 * HOUR,
        plan_order: 1,
        plan_locked: false,
      },
    ],
  });
});

it('reorders by dragging a row and by typing a new #', async () => {
  renderWithProviders(
    <ModalsProvider>
      <LinearPlanningPage />
    </ModalsProvider>,
    { route: '/planning/linear-cutting/capacity/?machine=5' },
  );
  await screen.findByText('NPU 100');
  const queue = () => tableOrder(screen.getByText('NPU 100').closest('tbody')!);
  expect(queue()).toEqual(['LC-1', 'LC-3', 'LC-4']);

  dragRowBefore('LC-4', 'LC-1');
  expect(queue()).toEqual(['LC-4', 'LC-1', 'LC-3']);
  typeOrder('LC-3', '2', '#');
  expect(queue()).toEqual(['LC-4', 'LC-3', 'LC-1']);
  await waitFor(() => expect(ganttOrder()).toEqual(['LC-4', 'LC-3', 'LC-1']));

  fireEvent.click(screen.getByRole('button', { name: 'Planı Kaydet' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Plan kaydedildi'));
  const saved = backend.calls().filter((c) => c.method === 'POST');
  expect(saved).toHaveLength(1);
  expect(
    (saved[0]!.body as { items: { key: string; plan_order: number }[] }).items.map((i) => [
      i.key,
      i.plan_order,
    ]),
  ).toEqual([
    ['LC-1', 3],
    ['LC-4', 1],
  ]); // LC-3 is back on 2
});

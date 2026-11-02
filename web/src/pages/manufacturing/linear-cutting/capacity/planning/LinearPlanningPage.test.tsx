import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { bar, json, mockBackend, stubLayout } from '../../../capacity-shared/testSupport';
import { linearApiFilters, LinearPlanningPage } from './LinearPlanningPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

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
    { route: '/manufacturing/linear-cutting/capacity/planning/?machine=5&session=LC-0004' },
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

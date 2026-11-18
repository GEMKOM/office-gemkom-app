import { authedFetch } from '@/auth/authService';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { DepartmentTask } from '@/api/projects/departmentTasks';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { DepartmentTasksContext, type DepartmentTasksContextValue } from '../context';
import { DeliveryDialog } from './OtherDialogs';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const TASK = {
  id: 'procurement-item-7',
  planning_request_item_id: 7,
  title: '0005 0140 0000 000 000 - IPE 140',
  quantity: 16,
  delivered_quantity: 0,
  item_unit: 'metre',
  is_bar: true,
  bar_length_mm: null,
} as unknown as DepartmentTask;

function renderDialog(task: DepartmentTask = TASK) {
  const ctx = {
    reloadList: vi.fn().mockResolvedValue(undefined),
  } as unknown as DepartmentTasksContextValue;
  return renderWithProviders(
    <DepartmentTasksContext.Provider value={ctx}>
      <DeliveryDialog task={task} onClose={() => {}} />
    </DepartmentTasksContext.Provider>,
  );
}

const posted = () =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method === 'POST')
    .map(([url, init]) => ({ url: String(url), body: JSON.parse(String(init?.body)) }));

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => json({ is_delivered: true }));
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => vi.restoreAllMocks());

it('asks a bar line without a size for the bars that came and sends them', async () => {
  renderDialog();
  const confirm = await screen.findByRole('button', { name: 'Evet, Teslim Alındı' });
  // No lengths yet: refused.
  fireEvent.click(confirm);
  expect(notify.error).toHaveBeenCalledWith('Gelen boyların uzunluğunu ve adedini girin');
  fireEvent.change(screen.getByLabelText('Boy 1 uzunluk'), { target: { value: '6000' } });
  fireEvent.change(screen.getByLabelText('Boy 1 adet'), { target: { value: '2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Başka uzunluk' }));
  fireEvent.change(screen.getByLabelText('Boy 2 uzunluk'), { target: { value: '4000' } });
  fireEvent.change(screen.getByLabelText('Boy 2 adet'), { target: { value: '1' } });
  expect(screen.getByTestId('delivery-bars-metres')).toHaveTextContent('16 / 16 m');
  fireEvent.click(confirm);
  await waitFor(() => expect(notify.success).toHaveBeenCalled());
  expect(posted()).toEqual([
    {
      url: expect.stringContaining('/planning/items/7/mark_delivered/'),
      body: {
        quantity: '16',
        bars: [
          { length_mm: 6000, quantity: 2 },
          { length_mm: 4000, quantity: 1 },
        ],
      },
    },
  ]);
});

it('a line ordered in sizes says its bars and asks nothing', async () => {
  renderDialog({ ...TASK, quantity: 18, bar_length_mm: 6000 } as DepartmentTask);
  expect(await screen.findByTestId('delivery-bars-sized')).toHaveTextContent(
    '3 boy × 6.000 mm iş emri stoğuna girer.',
  );
  expect(screen.queryByLabelText('Boy 1 uzunluk')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Evet, Teslim Alındı' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalled());
  expect(posted()[0]!.body).toEqual({ quantity: '18' });
});

it('other cards show no bar section', async () => {
  renderDialog({ ...TASK, is_bar: false, item_unit: 'adet' } as DepartmentTask);
  await screen.findByRole('button', { name: 'Evet, Teslim Alındı' });
  expect(screen.queryByText('Gelen boylar')).not.toBeInTheDocument();
});

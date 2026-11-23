import { authedFetch } from '@/auth/authService';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import type { PlanningItem } from '@/api/planning/planningItems';
import { CreatePullRequestModal, pickedText } from './CreatePullRequestModal';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn(), hasPerm: () => false }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);
const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const BAR_LINE = {
  id: 3,
  item: 21,
  item_code: '0010 0114 0015 000 000',
  item_name: '114,3*15 BORU',
  item_unit: 'metre',
  item_material_class: 'boy',
  job_no: '254-01',
  quantity: '18.00',
  delivered_quantity: '0',
  pulled_quantity: '0',
  quantity_available_to_pull: '0',
} as unknown as PlanningItem;

const LOTS = [
  { id: 41, item: 21, length_mm: '6000.0', quantity: 3, available_quantity: 3, heat_number: 'H-7' },
  { id: 42, item: 21, length_mm: '4000.0', quantity: 2, available_quantity: 2, heat_number: '' },
];

function posts() {
  return fetchMock.mock.calls
    .filter(([, init]) => init?.method === 'POST')
    .map(([, init]) => JSON.parse(String(init!.body)));
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const u = new URL(String(url));
    if (u.pathname === '/subcontracting/subcontractors/') return json([]);
    if (u.pathname === '/teams/') return json([{ id: 9, name: 'Ekip A' }]);
    if (u.pathname === '/warehouse/pieces/') return json({ count: 2, results: LOTS });
    if (init?.method === 'POST') return json({ id: 60, number: 'MPR-2026-0060' }, 201);
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'warning');
});

afterEach(() => vi.restoreAllMocks());

it('a bar line picks its bars from the job İş Emri stock', async () => {
  renderWithProviders(<CreatePullRequestModal items={[BAR_LINE]} onClose={() => {}} />);
  const dialog = await screen.findByRole('dialog', { name: 'İmalata Çıkış Talebi Oluştur' });
  expect(await within(dialog).findByText('254-01 iş emri stoğundaki boylar')).toBeInTheDocument();
  // Only this card's free lots in this job's İş Emri are asked for.
  const lotsCall = fetchMock.mock.calls
    .map(([url]) => new URL(String(url)))
    .find((u) => u.pathname === '/warehouse/pieces/')!;
  expect(
    ['item', 'warehouse', 'job_no', 'available'].map((k) => lotsCall.searchParams.get(k)),
  ).toEqual(['21', 'IS_EMRI', '254-01', 'true']);

  fireEvent.click(within(dialog).getByLabelText('Kaynak Ekibi'));
  fireEvent.click(within(dialog).getByPlaceholderText('Ekip seçin...'));
  fireEvent.click(await screen.findByRole('option', { name: 'Ekip A', hidden: true }));
  // Nothing picked: refused before the request.
  fireEvent.click(within(dialog).getByRole('button', { name: 'Talep Gönder' }));
  await waitFor(() => expect(notify.warning).toHaveBeenCalled());
  expect(posts()).toHaveLength(0);

  // The lots read in metres, never mm.
  expect(within(dialog).queryByText(/6000 mm/)).not.toBeInTheDocument();
  fireEvent.change(within(dialog).getByLabelText('0010 0114 0015 000 000 6 m boy adedi'), {
    target: { value: '2' },
  });
  fireEvent.change(within(dialog).getByLabelText('0010 0114 0015 000 000 4 m boy adedi'), {
    target: { value: '1' },
  });
  expect(within(dialog).getByText('3 boy · 16 m')).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Talep Gönder' }));
  await waitFor(() => expect(posts()).toHaveLength(1));
  expect(posts()[0]).toEqual({
    note: '',
    team: 9,
    items: [
      {
        planning_item: 3,
        pieces: [
          { piece: 41, quantity: 2 },
          { piece: 42, quantity: 1 },
        ],
      },
    ],
  });
});

it('parçasız bars go by quantity as before', async () => {
  renderWithProviders(
    <CreatePullRequestModal
      items={[
        { ...BAR_LINE, quantity_available_to_pull: '6', delivered_quantity: '6' } as PlanningItem,
      ]}
      onClose={() => {}}
    />,
  );
  const dialog = await screen.findByRole('dialog', { name: 'İmalata Çıkış Talebi Oluştur' });
  fireEvent.click(within(dialog).getByLabelText(/Parçasız/));
  fireEvent.click(within(dialog).getByLabelText('Kaynak Ekibi'));
  fireEvent.click(within(dialog).getByPlaceholderText('Ekip seçin...'));
  fireEvent.click(await screen.findByRole('option', { name: 'Ekip A', hidden: true }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Talep Gönder' }));
  await waitFor(() => expect(posts()).toHaveLength(1));
  expect(posts()[0].items).toEqual([{ planning_item: 3, quantity: 6 }]);
});

it('says what was picked', () => {
  expect(pickedText({ 41: 2, 42: '1', 43: 0 }, LOTS)).toBe('3 boy · 16 m');
  expect(pickedText({}, LOTS)).toBe('Boy seçilmedi');
});

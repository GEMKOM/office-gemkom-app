import { authedFetch } from '@/auth/authService';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { PlanningRequestFormModal } from './PlanningRequestFormModal';

vi.mock('@/auth/authService', () => ({
  authedFetch: vi.fn(),
  isSuperuser: () => true,
  hasPerm: () => false,
}));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const MIXED = {
  id: 7,
  title: 'Rulman alımı',
  description: '',
  priority: 'normal',
  needed_date: '2026-12-10',
  check_inventory: false,
  files: [],
  items: [
    {
      id: 101,
      item_code: 'K-1',
      item_name: 'Rulman',
      item_unit: 'adet',
      job_no: '254-01',
      quantity: '4.00',
      quantity_from_inventory: '2',
    },
    {
      id: 102,
      item_code: 'K-2',
      item_name: 'Kayış',
      item_unit: 'metre',
      job_no: '254-02',
      quantity: 1,
    },
    {
      id: 103,
      item_code: 'K-3',
      item_name: 'Somun',
      item_unit: 'adet',
      job_no: '254-01',
      quantity: 3,
      is_converted: true,
      is_deletable: false,
      quantity_in_active_prs: '3',
    },
  ],
};

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
const patches = () =>
  calls().filter((c) => c.method === 'PATCH' && c.url.pathname === '/planning/requests/7/');

const codeInput = (n: number) =>
  screen
    .getAllByLabelText(`Ürün kodu ${n}`)
    .find((el) => (el as HTMLInputElement).type !== 'hidden')!;

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url)).pathname;
    if (method === 'GET' && path === '/projects/job-orders/dropdown/') {
      return json([
        { job_no: '254-01', title: 'Vinç' },
        { job_no: '254-02', title: 'Konveyör' },
      ]);
    }
    if (method === 'PATCH' && path === '/planning/requests/7/') return json({ id: 7 });
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
  vi.spyOn(notify, 'info');
  vi.spyOn(notify, 'warning');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('Tümünü Temizle keeps inventory and PR-locked lines, then PATCH sends those ids', async () => {
  renderWithProviders(
    <PlanningRequestFormModal mode={{ kind: 'edit', request: MIXED }} onClose={() => {}} />,
  );

  expect(await screen.findByText('Planlama Talebi Düzenle')).toBeInTheDocument();
  expect(screen.getAllByTestId('item-row')).toHaveLength(3);
  expect(codeInput(1)).toHaveValue('K-1');
  expect(codeInput(2)).toHaveValue('K-2');
  expect(codeInput(3)).toHaveValue('K-3');

  fireEvent.click(screen.getByRole('button', { name: 'Tümünü Temizle' }));
  expect(notify.info).toHaveBeenCalledWith('Silinemeyen ürünler bırakıldı; diğerleri temizlendi');
  expect(screen.getAllByTestId('item-row')).toHaveLength(2);
  expect(codeInput(1)).toHaveValue('K-1');
  expect(codeInput(2)).toHaveValue('K-3');

  fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(patches()).toHaveLength(1));
  expect(patches()[0]!.body).toEqual({
    items: [
      {
        id: 101,
        job_no: '254-01',
        quantity: 4,
        item_code: 'K-1',
        item_name: 'Rulman',
        item_unit: 'adet',
      },
      {
        id: 103,
        job_no: '254-01',
        quantity: 3,
        item_code: 'K-3',
        item_name: 'Somun',
        item_unit: 'adet',
      },
    ],
  });
});

it('Tümünü Temizle does not drop a request that is only locked lines', async () => {
  renderWithProviders(
    <PlanningRequestFormModal
      mode={{
        kind: 'edit',
        request: { ...MIXED, items: [MIXED.items[0]!, MIXED.items[2]!] },
      }}
      onClose={() => {}}
    />,
  );

  expect(await screen.findByText('Planlama Talebi Düzenle')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Tümünü Temizle' }));
  expect(notify.warning).toHaveBeenCalledWith(
    'Envanterden verilmiş veya satın alma talebine bağlı ürünler silinemez; önce stoğa iade edin veya bağlı talebi iptal edin.',
  );
  expect(screen.getAllByTestId('item-row')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(notify.info).toHaveBeenCalledWith('Değişiklik yapılmadı'));
  expect(patches()).toHaveLength(0);
});

import { authedFetch } from '@/auth/authService';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { FasonPage } from './FasonPage';

vi.mock('@/auth/authService', () => ({
  authedFetch: vi.fn(),
  hasPerm: () => true,
  isAdmin: () => false,
}));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const JOB = {
  id: 5,
  department_request: {
    id: 9,
    number: 'DR-2026-0042',
    title: '304-02 BÜKÜM TALEBİ',
    status: 'transferred',
    status_label: 'Satın Almaya Aktarıldı',
    priority: 'normal',
    department: 'imalat',
    requestor: 'Ali Usta',
    created_at: '2026-11-19T08:00:00Z',
    needed_date: '2026-11-25',
  },
  operations: ['BÜKÜM'],
  job_nos: ['304-02'],
  purchase_step: 'ordered',
  purchase_label: 'Sipariş verildi',
  material_step: 'ready',
  material_label: 'Gönderime hazır',
  suppliers: ['Sezgin Metal'],
  material_note: 'P-26 × 2',
  discussion_topic_id: null,
  can_hand_over: false,
  can_receive: false,
  can_mark_ready: false,
  can_send: true,
  created_at: '2026-11-19T08:00:00Z',
};

const DETAIL = {
  ...JOB,
  rows: [
    {
      item_code: 'F001',
      item_name: 'BÜKÜM',
      quantity: 2,
      unit: 'adet',
      job_no: '304-02',
      description: 'P-26',
    },
  ],
  lines: [
    {
      id: 1,
      planning_request: 'GS-10367',
      item_code: 'F001',
      item_name: 'BÜKÜM İŞLEMİ',
      description: 'P-26',
      job_no: '304-02',
      quantity: '2.00',
      delivered_quantity: '0.00',
      pulled_quantity: '0.00',
      purchase_step: 'ordered',
      purchase_label: 'Sipariş verildi',
      orders: [{ id: 77, supplier: 'Sezgin Metal' }],
    },
  ],
  unsent_orders: [{ id: 77, supplier: 'Sezgin Metal', lines: 1 }],
  shipments: [],
  steps: {
    handed_over: { at: '2026-11-19T09:00:00Z', by: 'Ali Usta' },
    received: { at: '2026-11-19T10:00:00Z', by: 'Depo' },
    ready: { at: '2026-11-19T11:00:00Z', by: 'Depo' },
  },
};

const calls = () =>
  fetchMock.mock.calls.map(([url, init]) => ({
    url: new URL(String(url)),
    method: init?.method ?? 'GET',
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
  }));

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (init?.method === 'POST' && path === '/fason/jobs/5/send/')
      return json({
        ...DETAIL,
        material_step: 'sent',
        material_label: 'Fasonda',
        can_send: false,
        unsent_orders: [],
        shipments: [
          {
            id: 1,
            supplier: 'Sezgin Metal',
            purchase_order: 77,
            irsaliye_no: 'IRS-9',
            note: '',
            sent_at: '2026-11-19T12:00:00Z',
            sent_by: 'Depo',
          },
        ],
      });
    if (path === '/fason/jobs/5/') return json(DETAIL);
    if (path === '/fason/jobs/') return json({ count: 1, results: [JOB] });
    return json({});
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => vi.restoreAllMocks());

it('lists the jobs with purchasing and material side by side, by tab', async () => {
  renderWithProviders(<FasonPage />, { route: '/general/fason' });
  expect(await screen.findByText('DR-2026-0042')).toBeInTheDocument();
  expect(screen.getByText('Sipariş verildi')).toBeInTheDocument();
  expect(screen.getByText('Gönderime hazır')).toBeInTheDocument();
  expect(calls()[0]!.url.searchParams.get('tab')).toBe('open');
  fireEvent.click(screen.getByText('Fasonda'));
  await waitFor(() =>
    expect(calls().some((c) => c.url.searchParams.get('tab') === 'at_supplier')).toBe(true),
  );
});

it('opens a job and sends its material to the order’s supplier', async () => {
  renderWithProviders(<FasonPage />, { route: '/general/fason?job=5' });
  const dialog = await screen.findByRole('dialog', { name: /Fason · DR-2026-0042/ });
  expect(await within(dialog).findByText('P-26 × 2')).toBeInTheDocument();
  expect(within(dialog).getByText('Depo hazırladı')).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Tedarikçiye Gönder' }));
  const send = await screen.findByRole('dialog', { name: 'Tedarikçiye Gönder' });
  fireEvent.change(within(send).getByLabelText('İrsaliye No'), { target: { value: 'IRS-9' } });
  fireEvent.click(within(send).getByRole('button', { name: 'Gönder' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Malzeme gönderildi'));
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe('/fason/jobs/5/send/');
  expect(post.body).toEqual({ purchase_order: 77, irsaliye_no: 'IRS-9', note: '' });
  expect(
    await within(dialog).findByText(/Gönderildi → Sezgin Metal \(İrsaliye IRS-9\)/),
  ).toBeInTheDocument();
});

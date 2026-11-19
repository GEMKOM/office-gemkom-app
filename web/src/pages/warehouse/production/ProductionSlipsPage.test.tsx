import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { ProductionSlipsPage } from './ProductionSlipsPage';

vi.mock('@/auth/authService', () => ({
  authedFetch: vi.fn(),
  // A warehouse user: may write and cancel slips.
  isAdmin: () => false,
  isSuperuser: () => false,
  hasPerm: (code: string) => code === 'access_warehouse',
}));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

// An old direct issue slip (no longer made, still listed).
const SLIP = {
  id: 3,
  number: 'IMC-2026-0003',
  kind: 'issue',
  kind_label: 'İmalata Çıkış',
  warehouse_code: 'IS_EMRI',
  warehouse_name: 'İş Emri Deposu',
  job_no: '254-01',
  recipient: 'Kaynak 1',
  note: '',
  status: 'posted',
  status_label: 'İşlendi',
  created_by_name: 'Depo',
  created_at: '2026-11-09T08:00:00Z',
  cancelled_by_name: null,
  cancelled_at: null,
  lines: [
    {
      id: 9,
      item: 7,
      item_code: '0018 0012 0040 000 001',
      item_name: 'CİVATA M12x40',
      item_unit: 'adet',
      quantity: '6.000',
      note: '',
      pull_item: null,
      pull_request: null,
      pull_request_number: null,
      pieces: [],
    },
  ],
};

const RETURN = {
  ...SLIP,
  id: 4,
  number: 'IMI-2026-0004',
  kind: 'return',
  kind_label: 'İmalattan İade',
  lines: [
    {
      id: 10,
      item: 7,
      item_code: '0018 0012 0040 000 001',
      item_name: 'CİVATA M12x40',
      item_unit: 'adet',
      quantity: '2.000',
      note: '',
      pull_item: 31,
      pull_request: 5,
      pull_request_number: 'DCT-2026-0005',
      pieces: [],
    },
    {
      id: 11,
      item: 8,
      item_code: '0010 0114 0015 000 000',
      item_name: '114,3*15 BORU',
      item_unit: 'metre',
      quantity: '8.500',
      note: '',
      pull_item: 32,
      pull_request: 5,
      pull_request_number: 'DCT-2026-0005',
      pieces: [
        { piece: 50, length_mm: '6000.0', quantity: 1 },
        { piece: 51, length_mm: '2500.0', quantity: 1 },
      ],
    },
  ],
};

// The job's handed-over request lines: bolts by quantity, a pipe picked as bars, one all back.
const RETURNABLE = [
  {
    id: 31,
    pull_request: 5,
    pull_request_number: 'DCT-2026-0005',
    destination_name: 'Kaynak Ekibi 1',
    transferred_at: '2026-11-17T09:00:00Z',
    item_code: '0018 0012 0040 000 001',
    item_name: 'CİVATA M12x40',
    item_unit: 'adet',
    job_no: '254-01',
    is_bar: false,
    quantity: '6.00',
    returned_quantity: '1.000',
    returnable_quantity: '5.000',
    pieces: [],
  },
  {
    id: 32,
    pull_request: 5,
    pull_request_number: 'DCT-2026-0005',
    destination_name: 'Kaynak Ekibi 1',
    transferred_at: '2026-11-17T09:00:00Z',
    item_code: '0010 0114 0015 000 000',
    item_name: '114,3*15 BORU',
    item_unit: 'metre',
    job_no: '254-01',
    is_bar: true,
    quantity: '12.00',
    returned_quantity: '0',
    returnable_quantity: '12.000',
    pieces: [{ id: 1, piece: 41, quantity: 2, length_mm: '6000.0' }],
  },
  {
    id: 33,
    pull_request: 6,
    pull_request_number: 'DCT-2026-0006',
    destination_name: 'Montaj',
    transferred_at: '2026-11-18T09:00:00Z',
    item_code: '0024 0012 0000 000 001',
    item_name: 'PUL M12',
    item_unit: 'adet',
    job_no: '254-01',
    is_bar: false,
    quantity: '4.00',
    returned_quantity: '4.000',
    returnable_quantity: '0',
    pieces: [],
  },
];

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

type Call = { url: URL; method: string; body: unknown };
function calls(): Call[] {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: new URL(String(url), 'https://api.test'),
    method: init?.method ?? 'GET',
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
  }));
}

function renderPage(route = '/warehouse/production-slips') {
  return renderWithProviders(
    <ModalsProvider>
      <ProductionSlipsPage />
    </ModalsProvider>,
    { route },
  );
}

let cancelled = false;

beforeEach(() => {
  cancelled = false;
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const u = new URL(String(url), 'https://api.test');
    const current = cancelled
      ? { ...SLIP, status: 'cancelled', status_label: 'İptal Edildi' }
      : SLIP;
    if (method === 'GET' && u.pathname === '/warehouse/production-slips/') {
      return json({ count: 2, results: [current, RETURN] });
    }
    if (u.pathname === '/warehouse/production-slips/returnable/') {
      return json(u.searchParams.get('job_no') === '254-01' ? RETURNABLE : []);
    }
    if (method === 'POST' && u.pathname === '/warehouse/production-slips/') {
      return json(RETURN, 201);
    }
    if (method === 'POST' && u.pathname === '/warehouse/production-slips/3/cancel/') {
      cancelled = true;
      return json({ ...SLIP, status: 'cancelled' });
    }
    if (u.pathname === '/projects/job-orders/dropdown/') {
      return json([
        { job_no: '254-01', title: 'Pres Hattı' },
        { job_no: '300-02', title: 'Konveyör' },
      ]);
    }
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
  vi.spyOn(notify, 'warning');
});

afterEach(() => vi.restoreAllMocks());

async function pickJob(dialog: HTMLElement, label: string) {
  fireEvent.click(within(dialog).getByLabelText(/İş No/));
  fireEvent.click(await screen.findByRole('option', { name: label, hidden: true }));
}

it('is a returns page: one İmalattan İade button, no direct issue', async () => {
  renderPage();
  // Old direct issue slips still list.
  expect(await screen.findByText('IMC-2026-0003')).toBeInTheDocument();
  expect(screen.getByText('IMI-2026-0004')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'İmalata Çıkış' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'İmalattan İade' })).toBeInTheDocument();
});

it("returns from the job's handed-over lines: by quantity, and bars by length × count", async () => {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'İmalattan İade' }));
  const dialog = await screen.findByRole('dialog', { name: 'İmalattan İade' });

  // Nothing is sent without a job.
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet ve İşle' }));
  expect(notify.warning).toHaveBeenCalledWith('İş numarası seçin');

  await pickJob(dialog, '254-01 - Pres Hattı');
  // Bars read in metres, never mm.
  expect(await within(dialog).findByText('6 m × 2 boy')).toBeInTheDocument();
  expect(within(dialog).getByText('Tamamı iade edildi')).toBeInTheDocument();
  expect(within(dialog).getByText('En fazla 5 adet')).toBeInTheDocument();

  // Nothing entered yet.
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet ve İşle' }));
  expect(notify.warning).toHaveBeenCalledWith('En az bir satıra iade miktarı girin');

  fireEvent.change(within(dialog).getByLabelText('0018 0012 0040 000 001 iade miktarı'), {
    target: { value: '2' },
  });
  // The pipe: the picked length is filled (in metres); one full bar and a 2,5 m piece come back.
  const pipe = '0010 0114 0015 000 000';
  expect(within(dialog).getByLabelText(`${pipe} boy 1 uzunluk`)).toHaveValue('6 m');
  fireEvent.change(within(dialog).getByLabelText(`${pipe} boy 1 adet`), {
    target: { value: '1' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Başka boy' }));
  // Typed in metres with a comma; sent in mm.
  fireEvent.change(within(dialog).getByLabelText(`${pipe} boy 2 uzunluk`), {
    target: { value: '2,5' },
  });
  fireEvent.change(within(dialog).getByLabelText(`${pipe} boy 2 adet`), {
    target: { value: '1' },
  });
  expect(within(dialog).getByText('= 8,5 m')).toBeInTheDocument();
  fireEvent.change(within(dialog).getByLabelText('Getiren kişi / ekip'), {
    target: { value: 'Kaynak 1' },
  });

  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet ve İşle' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('IMI-2026-0004 işlendi'));
  const create = calls().find(
    (c) => c.method === 'POST' && c.url.pathname === '/warehouse/production-slips/',
  )!;
  expect(create.body).toEqual({
    job_no: '254-01',
    recipient: 'Kaynak 1',
    note: '',
    lines: [
      { pull_item: 31, quantity: '2' },
      {
        pull_item: 32,
        pieces: [
          { length_mm: '6000', quantity: 1 },
          { length_mm: '2500', quantity: 1 },
        ],
      },
    ],
  });
});

it('says so when the job has nothing handed over', async () => {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'İmalattan İade' }));
  const dialog = await screen.findByRole('dialog', { name: 'İmalattan İade' });
  await pickJob(dialog, '300-02 - Konveyör');
  expect(await within(dialog).findByTestId('no-returnable')).toHaveTextContent(
    'Bu işte teslim edilmiş imalata çıkış talebi yok.',
  );
});

it("shows a return's request and the bars that came back", async () => {
  renderPage('/warehouse/production-slips?fis=4');
  expect(await screen.findByTestId('returned-bars')).toHaveTextContent(
    '6 m × 1 boy · 2,5 m × 1 boy',
  );
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getAllByText('DCT-2026-0005')).toHaveLength(2);
});

it('opens a slip from the link and cancels it after the confirm', async () => {
  renderPage('/warehouse/production-slips?fis=3');
  expect(await screen.findByText('CİVATA M12x40')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Geri Al' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Evet, Geri Al' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('IMC-2026-0003 geri alındı'));
  expect(calls().some((c) => c.url.pathname === '/warehouse/production-slips/3/cancel/')).toBe(
    true,
  );
  await waitFor(() => expect(screen.getByText('İptal Edildi')).toBeInTheDocument());
});

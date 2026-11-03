import { authedFetch } from '@legacy/authService.js';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { DepartmentRequestsPage } from './DepartmentRequestsPage';

// Mantine modals with many fields are slow in jsdom when the whole suite runs in parallel.
vi.setConfig({ testTimeout: 30_000 });

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));
vi.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 7, username: 'ben', first_name: 'Ben', last_name: 'Kendim' } }),
}));

const fetchMock = vi.mocked(authedFetch);

const APPROVED = [
  {
    id: 3,
    requestor_username: 'ayse',
    department: 'maintenance',
    priority: 'urgent',
    needed_date: '2026-12-01',
    status: 'approved',
    status_label: 'Onaylandı',
    items_count: 2,
  },
];

const DEPARTMENT_DETAIL = {
  ...APPROVED[0],
  title: 'Bakım malzemesi',
  description: 'Hat 2',
  requestor_full_name: 'Ayşe Yılmaz',
  items: [
    { item_code: 'K-1', item_name: 'Rulman', quantity: 4, item_unit: 'adet', job_no: '254-01' },
    { code: 'K-2', name: 'Kayış', quantity: 1, unit: 'metre', job_no: '254-02' },
  ],
  files: [],
  approvals: [
    {
      stage_instances: [
        {
          name: 'Müdür',
          decisions: [{ decision: 'rejected', comment: 'Önce fiyat', approver_name: 'Can' }],
        },
      ],
    },
  ],
};

const PLANNING = [
  {
    id: 7,
    request_number: 'PT-7',
    title: 'Rulman alımı',
    created_by_username: 'ben',
    priority: 'normal',
    status: 'draft',
    status_label: 'Taslak',
    items_count: 1,
  },
  {
    id: 9,
    request_number: 'PT-9',
    title: 'Tamamlanan',
    status: 'completed',
    status_label: 'Tamamlandı',
  },
];

const PENDING_ERP = [
  {
    id: 8,
    title: 'ERP bekleyen',
    status: 'pending_erp_entry',
    status_label: 'ERP Girişi Bekliyor',
    items_count: 1,
  },
];

const PLANNING_DETAIL = {
  ...PLANNING[0],
  description: '',
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
      quantity_to_purchase: '4.00',
      purchase_request_info: [{ request_number: 'SAT-1', status: 'approved' }],
    },
  ],
};

const ERP_DETAIL = {
  ...PENDING_ERP[0],
  items: [{ id: 201, item_code: 'K-9', job_no: '254-01', quantity: 2 }],
  files: [],
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
const callsTo = (path: string, method = 'GET') =>
  calls().filter((c) => c.method === method && c.url.pathname === path);
const params = (call: Call | undefined) => Object.fromEntries(call!.url.searchParams);

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/planning/department-requests') {
  return renderWithProviders(
    <ModalsProvider>
      <DepartmentRequestsPage />
      <LocationProbe />
    </ModalsProvider>,
    { route },
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const u = new URL(String(url));
    const path = u.pathname;
    if (method === 'GET' && path === '/planning/department-requests/approved_requests/') {
      return json({ count: 1, results: APPROVED });
    }
    if (method === 'GET' && path === '/planning/department-requests/3/') {
      return json(DEPARTMENT_DETAIL);
    }
    if (method === 'GET' && path === '/planning/requests/') {
      if (u.searchParams.get('status') === 'pending_erp_entry') {
        return json({ count: 1, results: PENDING_ERP });
      }
      if (u.searchParams.get('request_number') === 'PT-7') {
        return json({ count: 1, results: [PLANNING[0]] });
      }
      return json({ count: 2, results: PLANNING });
    }
    if (method === 'GET' && path === '/planning/requests/7/') return json(PLANNING_DETAIL);
    if (method === 'GET' && path === '/planning/requests/8/') return json(ERP_DETAIL);
    if (method === 'GET' && path === '/users/dropdown/') {
      return json(
        u.searchParams.get('group') === 'planlama'
          ? [{ id: 5, username: 'plan', full_name: 'Plan Ci' }]
          : [{ id: 6, username: 'ayse', full_name: 'Ayşe Yılmaz' }],
      );
    }
    if (method === 'GET' && path === '/projects/job-orders/dropdown/') {
      return json([
        { job_no: '254-01', title: 'Vinç' },
        { job_no: '254-02', title: 'Konveyör' },
      ]);
    }
    if (method === 'POST' && path === '/planning/requests/') return json({ id: 50 }, 201);
    if (method === 'PATCH') return json({ id: 7 });
    if (method === 'POST') return json({});
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
  vi.spyOn(notify, 'info');
  vi.spyOn(notify, 'warning');
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const row = (text: string) => screen.getByText(text).closest('tr')!;

it('loads the three tables with the legacy requests', async () => {
  renderPage('/planning/department-requests?dr_department=maintenance&pr_status=draft');
  expect(screen.getAllByText('Aktarılacak Departman Talepleri').length).toBeGreaterThan(0);
  expect(await screen.findByText('ayse')).toBeInTheDocument();
  expect(await screen.findByText('Rulman alımı')).toBeInTheDocument();
  expect(await screen.findByText('ERP bekleyen')).toBeInTheDocument();
  expect(screen.getByText('Acil')).toBeInTheDocument();

  expect(params(callsTo('/planning/department-requests/approved_requests/')[0])).toEqual({
    page: '1',
    page_size: '20',
    ordering: '-id',
    department: 'maintenance',
  });
  const planningCalls = callsTo('/planning/requests/').map(params);
  expect(planningCalls).toContainEqual({
    page: '1',
    page_size: '20',
    ordering: '-id',
    status: 'pending_erp_entry',
  });
  expect(planningCalls).toContainEqual({
    page: '1',
    page_size: '20',
    ordering: '-id',
    status: 'draft',
  });
  // "Oluştur" lists the planlama group; job orders wait for the form.
  expect(params(callsTo('/users/dropdown/').find((c) => c.url.searchParams.has('group')))).toEqual({
    group: 'planlama',
  });
  expect(callsTo('/projects/job-orders/dropdown/')).toHaveLength(0);

  // Cancel is offered until converted / completed.
  expect(within(row('Rulman alımı')).getByRole('button', { name: 'İptal Et' })).toBeInTheDocument();
  expect(within(row('Tamamlanan')).queryByRole('button', { name: 'İptal Et' })).toBeNull();
  expect(within(row('ERP bekleyen')).queryByRole('button', { name: 'Düzenle' })).toBeNull();
});

it('shows a department request with its rejection comments, then transfers it through the 3 steps', async () => {
  renderPage();
  await screen.findByText('ayse');
  fireEvent.click(within(row('ayse')).getByRole('button', { name: 'Detayları Görüntüle' }));
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('request=3'));
  expect(await screen.findByText('Önce fiyat')).toBeInTheDocument();
  expect(screen.getByText('Can - Müdür')).toBeInTheDocument();
  expect(screen.getByText('Kayış')).toBeInTheDocument();

  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Transfer Et' }));
  expect(
    await screen.findByText('Planlama Talebi Oluştur (Departman Talebinden)'),
  ).toBeInTheDocument();
  await waitFor(() => expect(screen.getByTestId('location')).not.toHaveTextContent('request='));
  const rows = screen.getAllByTestId('item-row');
  expect(rows).toHaveLength(2);
  expect(within(rows[1]!).getByLabelText('Ürün kodu 2')).toHaveValue('K-2');
  // One job-order request for every row.
  await waitFor(() => expect(callsTo('/projects/job-orders/dropdown/')).toHaveLength(1));

  fireEvent.click(screen.getByRole('button', { name: 'Oluştur' }));
  expect(await screen.findByText('Departman Talebi Transfer İşlemi')).toBeInTheDocument();
  expect(callsTo('/planning/requests/', 'POST')).toHaveLength(0);

  fireEvent.click(screen.getByRole('button', { name: 'Excel Dışa Aktar' }));
  expect(notify.success).toHaveBeenCalledWith('Ürünler CSV olarak dışa aktarıldı');
  fireEvent.click(await screen.findByRole('button', { name: 'Devam Et' }));
  expect(notify.warning).toHaveBeenCalledWith('Lütfen ERP kodunu girin');
  fireEvent.change(screen.getByRole('textbox', { name: /ERP Kodu/ }), {
    target: { value: ' ERP-55 ' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Devam Et' }));
  expect(await screen.findByText('ERP-55')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Talebi Gönder' }));

  await waitFor(() => expect(callsTo('/planning/requests/', 'POST')).toHaveLength(1));
  const body = callsTo('/planning/requests/', 'POST')[0]!.body as FormData;
  expect(body.get('department_request_id')).toBe('3');
  expect(body.get('request_number')).toBe('ERP-55');
  expect(body.get('needed_date')).toBe('2026-12-01');
  expect(body.get('priority')).toBe('urgent');
  expect(body.has('check_inventory')).toBe(false);
  expect(JSON.parse(String(body.get('items')))).toEqual([
    {
      job_no: '254-01',
      quantity: 4,
      item_code: 'K-1',
      item_name: 'Rulman',
      item_unit: 'adet',
      source_item_index: 0,
    },
    {
      job_no: '254-02',
      quantity: 1,
      item_code: 'K-2',
      item_name: 'Kayış',
      item_unit: 'metre',
      source_item_index: 1,
    },
  ]);
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Talep başarıyla gönderildi'));
});

it('creates a standalone request only with a title, a date and items', async () => {
  renderPage();
  await screen.findByText('Rulman alımı');
  fireEvent.click(screen.getByRole('button', { name: 'Yeni Planlama Talebi' }));
  expect(await screen.findByText('Yeni Planlama Talebi Oluştur')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Oluştur' }));
  expect(await screen.findAllByText('Bu alan gereklidir')).toHaveLength(2);

  fireEvent.change(screen.getByRole('textbox', { name: /Başlık/ }), { target: { value: 'Yeni' } });
  fireEvent.change(screen.getByLabelText(/İhtiyaç Tarihi/), { target: { value: '2026-12-20' } });
  fireEvent.click(screen.getByRole('button', { name: 'Oluştur' }));
  await waitFor(() =>
    expect(notify.warning).toHaveBeenCalledWith('En az bir ürün eklemeniz gerekiyor'),
  );

  fireEvent.click(screen.getByRole('button', { name: 'Ürün Ekle' }));
  fireEvent.change(screen.getByLabelText('Ürün kodu 1'), { target: { value: 'K-5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Oluştur' }));
  await waitFor(() =>
    expect(notify.error).toHaveBeenCalledWith('Tüm ürünler için iş no gereklidir'),
  );
  expect(screen.queryByText('Departman Talebi Transfer İşlemi')).toBeNull();
});

it('edits a planning request with a PATCH of the changed fields only', async () => {
  renderPage();
  await screen.findByText('Rulman alımı');
  fireEvent.click(within(row('Rulman alımı')).getByRole('button', { name: 'Düzenle' }));
  expect(await screen.findByText('Planlama Talebi Düzenle')).toBeInTheDocument();
  expect(screen.getByLabelText('Ürün kodu 1')).toHaveValue('K-1');

  fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(notify.info).toHaveBeenCalledWith('Değişiklik yapılmadı'));
  expect(callsTo('/planning/requests/7/', 'PATCH')).toHaveLength(0);

  fireEvent.change(screen.getByRole('textbox', { name: /Başlık/ }), {
    target: { value: 'Rulman alımı 2' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(callsTo('/planning/requests/7/', 'PATCH')).toHaveLength(1));
  expect(callsTo('/planning/requests/7/', 'PATCH')[0]!.body).toEqual({ title: 'Rulman alımı 2' });
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Planlama talebi başarıyla güncellendi'),
  );
});

it('cancels a planning request after the confirm', async () => {
  renderPage();
  await screen.findByText('Rulman alımı');
  fireEvent.click(within(row('Rulman alımı')).getByRole('button', { name: 'İptal Et' }));
  expect(
    await screen.findByText('Bu planlama talebini iptal etmek istediğinizden emin misiniz?'),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Evet, İptal Et' }));
  await waitFor(() => expect(callsTo('/planning/requests/7/cancel/', 'POST')).toHaveLength(1));
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Planlama talebi başarıyla iptal edildi'),
  );
});

it('opens ?talep=<number> as the planning request and drops the param on close', async () => {
  renderPage('/planning/department-requests?talep=PT-7');
  expect(await screen.findByText('Planlama Talebi Detayları')).toBeInTheDocument();
  expect(await screen.findByText('SAT-1')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'CSV Dışa Aktar' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Satın Alma İçin Hazır İşaretle' })).toBeNull();
  // The header's close button and the footer's Kapat.
  fireEvent.click(
    within(screen.getByRole('dialog')).getAllByRole('button', { name: 'Kapat' }).at(-1)!,
  );
  await waitFor(() => expect(screen.getByTestId('location')).not.toHaveTextContent('talep='));
});

it('marks a pending ERP request ready with its ERP code', async () => {
  renderPage();
  await screen.findByText('ERP bekleyen');
  fireEvent.click(within(row('ERP bekleyen')).getByRole('button', { name: 'Detayları Görüntüle' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Satın Alma İçin Hazır İşaretle' }));
  fireEvent.change(await screen.findByRole('textbox', { name: /ERP Kodu/ }), {
    target: { value: 'E-1' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
  await waitFor(() =>
    expect(callsTo('/planning/requests/8/mark_ready_for_procurement/', 'POST')).toHaveLength(1),
  );
  expect(callsTo('/planning/requests/8/mark_ready_for_procurement/', 'POST')[0]!.body).toEqual({
    erp_code: 'E-1',
    request_number: 'E-1',
  });
  await waitFor(() => expect(screen.queryByText('Planlama Talebi Detayları')).toBeNull());
});

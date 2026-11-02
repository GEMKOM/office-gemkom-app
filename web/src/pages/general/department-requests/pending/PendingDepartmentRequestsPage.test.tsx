import { authedFetch } from '@legacy/authService.js';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { PendingDepartmentRequestsPage } from './PendingDepartmentRequestsPage';

// Mantine modals with many fields are slow in jsdom when the whole suite runs in parallel.
vi.setConfig({ testTimeout: 20_000 });

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const PENDING = [
  {
    id: 21,
    requestor_username: 'ayse',
    department_label: 'Bakım',
    priority: 'critical',
    status: 'submitted',
    status_label: 'Gönderildi',
    items_count: 3,
    needed_date: '2026-11-20',
  },
];
const APPROVED = [
  {
    id: 7,
    requestor_username: 'mehmet',
    department: 'it',
    priority: 'normal',
    status: 'approved',
    status_label: 'Onaylandı',
    items_count: 1,
    created_at: '2026-10-01T09:00:00Z',
  },
];
const DETAIL = {
  ...PENDING[0],
  title: 'Kaynak işçiliği',
  description: 'Satır 1\nSatır 2',
  items: [
    { item_code: 'F001', item_name: 'BÜKÜM', quantity: 2, job_no: '254-01', file_asset_ids: [501] },
    { name: 'Eski kalem', unit: 'kg', quantity: 1 },
  ],
  files: [
    {
      id: 1,
      asset_id: 501,
      file_name: 'uploads/0d9f5c1e-1111-4222-8333-944445555666_resim.pdf',
      file_url: 'https://files.test/resim.pdf',
    },
  ],
  approvals: [
    {
      stage_instances: [
        {
          name: 'Müdür Onayı',
          decisions: [
            {
              decision: 'rejected',
              comment: 'Eksik bilgi',
              approver_name: 'Hakan',
              decision_date: '2026-10-05T08:00:00Z',
            },
            { decision: 'approved', comment: 'ok', approver_name: 'Veli' },
          ],
        },
      ],
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
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
  }));
}

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/general/department-requests/pending') {
  return renderWithProviders(
    <ModalsProvider>
      <PendingDepartmentRequestsPage />
      <LocationProbe />
    </ModalsProvider>,
    { route },
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url)).pathname;
    if (path === '/planning/department-requests/pending_approval/') return json(PENDING);
    if (path === '/planning/department-requests/approved_requests/') {
      return json({ count: 1, next: null, previous: null, results: APPROVED });
    }
    if (path === '/planning/department-requests/21/') return json(DETAIL);
    if (method === 'POST') return json({ status: 'ok' });
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('lists pending and approved requests with the legacy requests', async () => {
  renderPage();
  expect(await screen.findByText('ayse')).toBeInTheDocument();
  expect(await screen.findByText('mehmet')).toBeInTheDocument();
  expect(screen.getByText('Kritik')).toBeInTheDocument();
  expect(screen.getByText('3 ürün')).toBeInTheDocument();
  expect(screen.getByText('Bilgi İşlem')).toBeInTheDocument();

  const pendingCall = calls().find((c) => c.url.pathname.endsWith('/pending_approval/'))!;
  expect(pendingCall.url.search).toBe('');
  const approvedCall = calls().find((c) => c.url.pathname.endsWith('/approved_requests/'))!;
  expect(Object.fromEntries(approvedCall.url.searchParams)).toEqual({ page: '1', page_size: '20' });

  // Approve / reject only on the pending table.
  const approvedRow = screen.getByText('mehmet').closest('tr')!;
  expect(within(approvedRow).queryByRole('button', { name: 'Onayla' })).toBeNull();
  expect(
    within(approvedRow).getByRole('button', { name: 'Detayları Görüntüle' }),
  ).toBeInTheDocument();
});

it('approves after the confirm and reloads both tables', async () => {
  renderPage();
  const row = (await screen.findByText('ayse')).closest('tr')!;
  fireEvent.click(within(row).getByRole('button', { name: 'Onayla' }));
  expect(
    await screen.findByText('Bu departman talebini onaylamak istediğinizden emin misiniz?'),
  ).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'POST')).toBe(false);

  const before = calls().filter((c) => c.method === 'GET').length;
  fireEvent.click(screen.getByRole('button', { name: 'Evet, Onayla' }));
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Departman talebi başarıyla onaylandı'),
  );
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe('/planning/department-requests/21/approve/');
  expect(post.body).toEqual({ comment: '' });
  await waitFor(() =>
    expect(calls().filter((c) => c.method === 'GET').length).toBeGreaterThanOrEqual(before + 2),
  );
});

it('rejects with the typed comment', async () => {
  renderPage();
  const row = (await screen.findByText('ayse')).closest('tr')!;
  fireEvent.click(within(row).getByRole('button', { name: 'Reddet' }));
  const dialog = await screen.findByRole('dialog', { name: 'Departman Talebini Reddet' });
  fireEvent.change(
    within(dialog).getByPlaceholderText('Departman talebini neden reddettiğinizi açıklayın...'),
    {
      target: { value: '  Bütçe yok  ' },
    },
  );
  expect(within(dialog).getByText('13/500 karakter')).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Reddet' }));

  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Departman talebi başarıyla reddedildi'),
  );
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe('/planning/department-requests/21/reject/');
  expect(post.body).toEqual({ comment: 'Bütçe yok' });
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Departman Talebini Reddet' })).toBeNull(),
  );
});

it('?request=<id> opens the details with rejection comments and per-item files', async () => {
  renderPage('/general/department-requests/pending?request=21');
  const dialog = await screen.findByRole('dialog', { name: 'Departman Talebi Detayları' });
  expect(
    await within(dialog).findByText('Kaynak işçiliği', { selector: 'div' }),
  ).toBeInTheDocument();
  expect(within(dialog).getByText('Hakan - Müdür Onayı')).toBeInTheDocument();
  expect(within(dialog).getByText('Eksik bilgi')).toBeInTheDocument();
  expect(within(dialog).queryByText('ok')).toBeNull();
  expect(within(dialog).getByText('Eski kalem')).toBeInTheDocument();
  expect(within(dialog).getByText('kg')).toBeInTheDocument();
  // The uuid prefix is dropped; the file shows on its item row and in the attachments.
  expect(within(dialog).getAllByText('resim.pdf', { exact: false }).length).toBeGreaterThanOrEqual(
    2,
  );

  // Submitted: approve / reject from the footer.
  expect(within(dialog).getByRole('button', { name: 'Onayla' })).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Reddet' }));
  expect(
    await screen.findByRole('dialog', { name: 'Departman Talebini Reddet' }),
  ).toBeInTheDocument();
});

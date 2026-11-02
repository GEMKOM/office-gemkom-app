import { authedFetch } from '@legacy/authService.js';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { callsTo, json, page } from '../testUtils';
import { RegistryPage } from './RegistryPage';

vi.mock('@legacy/authService.js', () => ({
  authedFetch: vi.fn(),
  hasPerm: vi.fn(() => true),
  isSuperuser: vi.fn(() => false),
}));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));
vi.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 5, username: 'ali', first_name: 'Ali', last_name: 'Kaya' } }),
}));

const ROWS = [
  { id: 1, request_number: 'SAT-1', title: 'Konveyör', status: 'submitted', po_count: 2, evaluated_po_count: 1, planning_request_keys: ['PLR-7'], purchase_orders: [44] },
  { id: 2, request_number: 'SAT-2', title: 'Rulman', status: 'cancelled', po_count: 0 },
  { id: 3, request_number: 'SAT-3', title: 'Cıvata', status: 'completed', po_count: 1, evaluated_po_count: 1 },
];
const DETAIL = {
  ...ROWS[0],
  request_items: [],
  offers: [],
  approval: {
    current_stage_order: 1,
    stage_instances: [
      {
        order: 1,
        name: 'Müdür Onayı',
        required_approvals: 1,
        approved_count: 0,
        approvers: [{ id: 9, full_name: 'Ayşe Demir' }],
        decisions: [{ approver: 9, decision: 'reject', comment: 'Bütçe yok', approver_detail: { full_name: 'Ayşe Demir' } }],
        is_rejected: true,
      },
    ],
    is_rejected: true,
  },
};

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

const lastListParams = () =>
  Object.fromEntries(callsTo('/procurement/purchase-requests/').filter((c) => !c.url.searchParams.has('request_number') || c.url.searchParams.has('page')).at(-1)!.url.searchParams);

function renderPage(route = '/procurement/purchase-requests/registry/') {
  return renderWithProviders(
    <ModalsProvider>
      <RegistryPage />
      <LocationProbe />
    </ModalsProvider>,
    { route },
  );
}

beforeEach(() => {
  vi.mocked(authedFetch).mockReset();
  vi.mocked(authedFetch).mockImplementation((url, init) => {
    const u = new URL(String(url));
    const method = init?.method ?? 'GET';
    if (u.pathname === '/procurement/purchase-requests/' && method === 'GET') {
      if (u.searchParams.has('request_number') && !u.searchParams.has('page')) return json(page([ROWS[0]]));
      return json({ count: 30, next: null, previous: null, results: ROWS });
    }
    if (u.pathname === '/procurement/purchase-requests/1/') return json(DETAIL);
    if (u.pathname === '/procurement/status-choices/') return json([{ value: 'submitted', label: 'Gönderildi' }]);
    if (u.pathname === '/users/dropdown/') return json([{ id: 7, username: 'veli' }]);
    if (u.pathname === '/currency-rates/') return json({ rates: null });
    if (method === 'POST') return json({ ok: true });
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
  vi.spyOn(notify, 'info');
});
afterEach(() => vi.restoreAllMocks());

describe('RegistryPage', () => {
  it("opens on the current user's requests and counts each status", async () => {
    renderPage();
    expect(await screen.findByText('Konveyör')).toBeInTheDocument();
    expect(lastListParams()).toEqual({ requestor: '5', ordering: '-request_number', page: '1', page_size: '20' });
    expect(callsTo('/users/dropdown/')[0]!.url.searchParams.get('group')).toBe('satn-alma');
    // Bekleyen 1 (submitted), Tamamlanan 1, İptal Edilen 1, from the page rows.
    const band = screen.getByText('Bekleyen').parentElement!;
    expect(band).toHaveTextContent('1');
    const row1 = screen.getByText('Konveyör').closest('tr')!;
    expect(within(row1).getByRole('button', { name: 'Tedarikçi Değerlendir' })).toBeInTheDocument();
    expect(within(row1).getByRole('link', { name: /PLR-7/ })).toHaveAttribute('href', '/planning/department-requests/?talep=PLR-7');
    expect(within(row1).getByRole('link', { name: /44/ })).toHaveAttribute('href', '/finance/purchase-orders/?order=44');
    const row2 = screen.getByText('Rulman').closest('tr')!;
    expect(within(row2).queryByRole('button', { name: 'Revize Et' })).toBeNull();
    const row3 = screen.getByText('Cıvata').closest('tr')!;
    expect(within(row3).getByRole('button', { name: 'Değerlendirildi' })).toBeInTheDocument();
  });

  it('reads filters from the URL and Temizle shows every user', async () => {
    renderPage('/procurement/purchase-requests/registry/?status=submitted&priority=urgent&page=2');
    await screen.findByText('Konveyör');
    expect(lastListParams()).toMatchObject({ requestor: '5', status: 'submitted', priority: 'urgent', page: '2' });
    fireEvent.click(screen.getByRole('button', { name: /Temizle/ }));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('?requestor='));
    await waitFor(() => expect(lastListParams()).toEqual({ ordering: '-request_number', page: '1', page_size: '20' }));
  });

  it('opens ?talep= with the approval workflow and cancels the request', async () => {
    renderPage('/procurement/purchase-requests/registry/?talep=SAT-1');
    const dialog = await screen.findByRole('dialog', { name: 'Talep Detayları - SAT-1' });
    expect(within(dialog).getByText('Onay Süreci')).toBeInTheDocument();
    expect(within(dialog).getByText('1. Müdür Onayı')).toBeInTheDocument();
    expect(within(dialog).getByText('Reddetme Gerekçeleri')).toBeInTheDocument();
    expect(within(dialog).getAllByText('Bütçe yok').length).toBeGreaterThan(0);
    fireEvent.click(within(dialog).getByRole('button', { name: 'İptal Et' }));
    expect(
      await screen.findByText('"SAT-1" numaralı talebi iptal etmek istediğinizden emin misiniz? Bu işlem geri alınamaz.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Evet' }));
    await waitFor(() => expect(callsTo('/procurement/purchase-requests/1/cancel/', 'POST')).toHaveLength(1));
    expect(notify.success).toHaveBeenCalledWith('Talep başarıyla iptal edildi');
  });

  it('revises from the row after confirming', async () => {
    renderPage();
    const row = (await screen.findByText('Konveyör')).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Revize Et' }));
    const confirmDialog = await screen.findByRole('dialog', { name: 'Revize Et' });
    fireEvent.click(within(confirmDialog).getByRole('button', { name: 'Revize Et' }));
    await waitFor(() => expect(callsTo('/procurement/purchase-requests/1/revise/', 'POST')).toHaveLength(1));
    expect(notify.success).toHaveBeenCalledWith('Talep başarıyla revize edildi');
  });
});

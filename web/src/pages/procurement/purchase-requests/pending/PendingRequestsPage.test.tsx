import { authedFetch } from '@legacy/authService.js';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { calls, callsTo, json, page } from '../testUtils';
import { PendingRequestsPage } from './PendingRequestsPage';

vi.mock('@legacy/authService.js', () => ({
  authedFetch: vi.fn(),
  hasPerm: vi.fn(() => false),
  isSuperuser: vi.fn(() => false),
}));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 5, username: 'ali' } }) }));

const ROW = {
  id: 1,
  request_number: 'SAT-1',
  title: 'Konveyör',
  requestor_username: 'veli',
  status: 'submitted',
  status_label: 'Gönderildi',
  priority: 'urgent',
  total_amount_eur: '1250.00',
  created_at: '2026-10-30T10:00:00Z',
  item_type: 'subcontracting',
};
const DETAIL = {
  ...ROW,
  request_items: [{ id: 11, quantity: '10.00', item: { code: 'A1', name: 'Flanş', unit: 'adet' } }],
  offers: [
    {
      currency: 'TRY',
      supplier: { id: 3, name: 'Acme' },
      item_offers: [{ id: 101, purchase_request_item: 11, unit_price: '100.00', is_recommended: true }],
    },
  ],
  approval: { stage_instances: [{ order: 1, name: 'Müdür', required_approvals: 1, approved_count: 0, decisions: [] }] },
};

let lookup: unknown[] = [ROW];

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/procurement/purchase-requests/pending/') {
  return renderWithProviders(
    <ModalsProvider>
      <PendingRequestsPage />
      <LocationProbe />
    </ModalsProvider>,
    { route },
  );
}

beforeEach(() => {
  lookup = [ROW];
  vi.mocked(authedFetch).mockReset();
  vi.mocked(authedFetch).mockImplementation((url, init) => {
    const u = new URL(String(url));
    const method = init?.method ?? 'GET';
    if (u.pathname === '/procurement/purchase-requests/pending_approval/') return json(page([ROW]));
    if (u.pathname === '/procurement/purchase-requests/approved_by_me/') return json(page([]));
    if (u.pathname === '/procurement/purchase-requests/' && method === 'GET') return json(page(lookup));
    if (u.pathname === '/procurement/purchase-requests/1/') return json(DETAIL);
    if (u.pathname === '/currency-rates/') return json({ rates: { TRY: 1, EUR: 0.025 } });
    if (method === 'POST') return json({ ok: true });
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});
afterEach(() => vi.restoreAllMocks());

describe('PendingRequestsPage', () => {
  it('lists both tables with the legacy params', async () => {
    renderPage();
    expect(await screen.findByText('Konveyör')).toBeInTheDocument();
    expect(screen.getByText('Henüz onayladığınız satın alma talebi bulunmamaktadır.')).toBeInTheDocument();
    const params = Object.fromEntries(callsTo('/procurement/purchase-requests/pending_approval/')[0]!.url.searchParams);
    expect(params).toEqual({ ordering: '-request_number', page: '1', page_size: '20' });
    expect(callsTo('/procurement/purchase-requests/approved_by_me/')).toHaveLength(1);
    expect(screen.getByText('DAŞ')).toBeInTheDocument();
  });

  it('opens ?talep= by exact number and approves from the modal', async () => {
    renderPage('/procurement/purchase-requests/pending/?talep=SAT-1');
    const dialog = await screen.findByRole('dialog', { name: 'Talep Detayları - SAT-1' });
    expect(callsTo('/procurement/purchase-requests/')[0]!.url.searchParams.get('request_number')).toBe('SAT-1');
    expect(within(dialog).getByText('Mali Özet')).toBeInTheDocument();
    expect(within(dialog).getByTestId('comparison-table')).toHaveTextContent('Acme');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Onayla' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Evet, Onayla' }));
    await waitFor(() => expect(callsTo('/procurement/purchase-requests/1/approve/', 'POST')).toHaveLength(1));
    expect(notify.success).toHaveBeenCalledWith('Talep başarıyla onaylandı');
    await waitFor(() => expect(screen.getByTestId('location')).not.toHaveTextContent('talep'));
  });

  it('does not open a request whose number only partly matches', async () => {
    lookup = [{ ...ROW, id: 2, request_number: 'SAT-12' }];
    renderPage('/procurement/purchase-requests/pending/?talep=SAT-1');
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Talep SAT-1 bulunamadı'));
    expect(calls().some((c) => c.url.pathname === '/procurement/purchase-requests/2/')).toBe(false);
  });

  it('rejects with the optional comment', async () => {
    renderPage();
    const row = (await screen.findByText('Konveyör')).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Reddet' }));
    const dialog = await screen.findByRole('dialog', { name: 'Satın Alma Talebini Reddet' });
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '  fiyat yüksek ' } });
    expect(within(dialog).getByText('15/500 karakter')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reddet' }));
    await waitFor(() =>
      expect(callsTo('/procurement/purchase-requests/1/reject/', 'POST')[0]?.body).toEqual({ comment: 'fiyat yüksek' }),
    );
    expect(notify.success).toHaveBeenCalledWith('Talep başarıyla reddedildi');
  });

  it('opening a row writes ?talep= to the URL', async () => {
    renderPage();
    const row = (await screen.findByText('Konveyör')).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Detayları Görüntüle' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('talep=SAT-1'));
    expect(await screen.findByRole('dialog', { name: 'Talep Detayları - SAT-1' })).toBeInTheDocument();
    // A clicked row is not looked up by number again.
    expect(callsTo('/procurement/purchase-requests/')).toHaveLength(0);
  });
});

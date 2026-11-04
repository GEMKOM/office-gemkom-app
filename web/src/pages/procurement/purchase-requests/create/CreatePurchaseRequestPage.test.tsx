import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { callsTo, json } from '../testUtils';
import { CreatePurchaseRequestPage } from './CreatePurchaseRequestPage';
import { emptyState, STORAGE_KEY, toStorage, type PrState } from './model';

vi.mock('@/auth/authService', () => ({
  authedFetch: vi.fn(),
  hasPerm: vi.fn(() => false),
  isSuperuser: vi.fn(() => false),
}));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const offer = (unitPrice: number, qty: number) => ({ unitPrice, totalPrice: unitPrice * qty, deliveryDays: 5, notes: '' });

function readyState(): PrState {
  const supplier = (id: string, name: string) => ({
    id,
    name,
    contact_person: '',
    phone: '',
    email: '',
    default_currency: 'TRY',
    default_payment_terms: '3',
    default_tax_rate: 20,
  });
  return {
    ...emptyState(),
    title: 'Konveyör malzemeleri',
    needed_date: '2026-11-20',
    items: [
      { id: 'i1', code: 'A1', name: 'Flanş', job_no: '254-01', quantity: 4, unit: 'adet', specs: '', specifications: '', item_description: '' },
    ],
    suppliers: [supplier('s1', 'Acme'), supplier('s2', 'Beta')],
    offers: { s1: { i1: offer(10, 4) }, s2: { i1: offer(12, 4) } },
    recommendations: { i1: 's1' },
  };
}

let submitFails = false;

beforeEach(() => {
  submitFails = false;
  localStorage.clear();
  vi.mocked(authedFetch).mockReset();
  vi.mocked(authedFetch).mockImplementation((url, init) => {
    const u = new URL(String(url));
    const method = init?.method ?? 'GET';
    if (u.pathname === '/currency-rates/') return json({ rates: { TRY: 1, EUR: 0.025 } });
    if (u.pathname === '/planning/items/available_count/') return json({ count: 3 });
    if (u.pathname === '/procurement/payment-terms/') return json([{ id: 3, name: '30 gün' }]);
    if (u.pathname === '/procurement/purchase-requests/' && method === 'POST') return json({ id: 77 });
    if (u.pathname === '/procurement/purchase-requests/77/submit/') {
      return submitFails ? json({ error: 'Onay akışı yok' }, 400) : json({ ok: true });
    }
    if (u.pathname === '/procurement/purchase-request-draft/autosave/') return json({ id: 1 });
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
  vi.spyOn(notify, 'info');
});
afterEach(() => vi.restoreAllMocks());

function renderPage() {
  return renderWithProviders(
    <ModalsProvider>
      <CreatePurchaseRequestPage />
    </ModalsProvider>,
    { route: '/procurement/purchase-requests/create/' },
  );
}

describe('CreatePurchaseRequestPage', () => {
  it('refuses an empty request with the legacy messages', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Gönder' }));
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Talep başlığı zorunludur'));
    expect(notify.error).toHaveBeenCalledWith('En az bir malzeme eklemelisiniz');
    expect(notify.error).toHaveBeenCalledWith('En az 2 tedarikçi eklemelisiniz');
    expect(callsTo('/procurement/purchase-requests/', 'POST')).toHaveLength(0);
    expect(screen.getByText('Talep başlığı zorunludur')).toBeInTheDocument();
  });

  it('restores the page from localStorage and submits the legacy payload', async () => {
    localStorage.setItem(STORAGE_KEY, toStorage(readyState()));
    renderPage();
    expect(screen.getByDisplayValue('Konveyör malzemeleri')).toBeInTheDocument();
    expect(await screen.findByText('3')).toBeInTheDocument(); // planning items badge
    const table = screen.getByTestId('comparison-table');
    expect(within(table).getByRole('button', { name: 'Acme öner' })).toHaveAttribute('aria-pressed', 'true');
    // Wait for the rates so total_amount_eur is computed.
    await waitFor(() => expect(callsTo('/currency-rates/')).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.click(screen.getByRole('button', { name: 'Gönder' }));
    await waitFor(() => expect(callsTo('/procurement/purchase-requests/77/submit/', 'POST')).toHaveLength(1));
    const body = callsTo('/procurement/purchase-requests/', 'POST')[0]!.body as Record<string, unknown>;
    expect(body).toMatchObject({
      title: 'Konveyör malzemeleri',
      priority: 'normal',
      needed_date: '2026-11-20',
      items: [
        {
          code: 'A1',
          name: 'Flanş',
          unit: 'adet',
          quantity: '4.00',
          allocations: [{ job_no: '254-01', quantity: '4.00' }],
          planning_request_item_id: null,
        },
      ],
      offers: { s1: { 0: offer(10, 4) }, s2: { 0: offer(12, 4) } },
      recommendations: { 0: 's1' },
      total_amount_eur: 1,
      is_rolling_mill: false,
    });
    expect((body.suppliers as object[])[0]).toMatchObject({ id: 's1', currency: 'TRY', payment_terms_id: 3, tax_rate: 20 });
    expect(notify.success).toHaveBeenCalledWith('Talep başarıyla gönderildi!');
    // The page is cleared.
    await waitFor(() => expect(screen.queryByDisplayValue('Konveyör malzemeleri')).toBeNull());
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('after a failed submit, Gönder again submits the created request instead of creating another', async () => {
    submitFails = true;
    localStorage.setItem(STORAGE_KEY, toStorage(readyState()));
    renderPage();
    await waitFor(() => expect(callsTo('/currency-rates/')).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Gönder' }));
    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('Talep gönderilirken hata oluştu: Onay akışı yok'),
    );
    submitFails = false;
    fireEvent.click(screen.getByRole('button', { name: 'Gönder' }));
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Talep başarıyla gönderildi!'));
    expect(callsTo('/procurement/purchase-requests/', 'POST')).toHaveLength(1);
    expect(callsTo('/procurement/purchase-requests/77/submit/', 'POST')).toHaveLength(2);
  });

  it('toggles a recommendation star from the comparison table', async () => {
    localStorage.setItem(STORAGE_KEY, toStorage(readyState()));
    renderPage();
    const table = screen.getByTestId('comparison-table');
    fireEvent.click(within(table).getByRole('button', { name: 'Beta öner' }));
    expect(within(table).getByRole('button', { name: 'Beta öner' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(table).getByRole('button', { name: 'Acme öner' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('validates the Malzeme Ekle modal and adds the row', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Malzeme Ekle' }));
    const dialog = await screen.findByRole('dialog', { name: 'Malzeme Ekle' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    expect(notify.error).toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText(/Malzeme Kodu/), { target: { value: 'C3' } });
    fireEvent.change(within(dialog).getByLabelText('Malzeme Adı'), { target: { value: 'Somun' } });
    fireEvent.change(within(dialog).getByLabelText('İş No'), { target: { value: '254-09' } });
    fireEvent.change(within(dialog).getByLabelText('Miktar'), { target: { value: '3' } });
    fireEvent.change(within(dialog).getByLabelText('Birim'), { target: { value: 'adet' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Malzeme Ekle' })).toBeNull());
    expect(screen.getAllByText('Somun').length).toBeGreaterThan(0);
  });
});

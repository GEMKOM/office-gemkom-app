import { authedFetch } from '@legacy/authService.js';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { PurchaseRequestDetail } from '@/api/procurement/purchaseRequests';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { callsTo, json } from '../testUtils';
import { AdjustPricesModal } from './AdjustPricesModal';

vi.mock('@legacy/authService.js', () => ({
  authedFetch: vi.fn(),
  hasPerm: vi.fn(() => false),
  isSuperuser: vi.fn(() => false),
}));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const REQUEST = {
  id: 7,
  request_number: 'PR-2026-1028',
  request_items: [{ id: 11, quantity: '1250.5', item: { code: 'A1', name: 'Flanş', unit: 'adet' } }],
  offers: [
    {
      id: 1,
      currency: 'TRY',
      supplier: { id: 3, name: 'Acme' },
      item_offers: [
        {
          id: 101,
          purchase_request_item: 11,
          unit_price: '2408.74',
          original_unit_price: '2400.00',
          price_min: '2160.00',
          price_max: '2640.00',
          is_recommended: true,
        },
      ],
    },
    {
      id: 2,
      currency: 'EUR',
      supplier: { id: 4, name: 'Beta' },
      item_offers: [
        {
          id: 102,
          purchase_request_item: 11,
          unit_price: '10.00',
          price_min: '9.00',
          price_max: '11.00',
        },
      ],
    },
  ],
} as unknown as PurchaseRequestDetail;

const onSaved = vi.fn();
const onClose = vi.fn();

beforeEach(() => {
  vi.mocked(authedFetch).mockReset();
  vi.mocked(authedFetch).mockImplementation(() => json({ detail: 'Güncellendi' }));
  onSaved.mockReset();
  onClose.mockReset();
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});
afterEach(() => vi.restoreAllMocks());

function renderModal() {
  return renderWithProviders(
    <AdjustPricesModal request={REQUEST} onClose={onClose} onSaved={onSaved} />,
  );
}

describe('AdjustPricesModal', () => {
  it('shows prices with Turkish formatting and the currency per supplier', async () => {
    renderModal();
    const dialog = await screen.findByRole('dialog', { name: /Teklif Fiyatlarını Güncelle/ });
    const row = dialog.querySelector('[data-offer-id="101"]') as HTMLElement;
    expect(within(row).getByText('1.250,5')).toBeInTheDocument();
    expect(within(row).getByText('2.400,00')).toBeInTheDocument();
    expect(within(row).getAllByText('2.408,74').length).toBeGreaterThan(0);
    expect(within(row).getByText(/2\.160,00\s+–\s+2\.640,00/)).toBeInTheDocument();
    expect(within(row).getByRole('textbox', { name: 'Yeni Birim Fiyat' })).toHaveValue('2408,74');
    expect(within(dialog).getByText('₺ TRY')).toBeInTheDocument();
    expect(within(dialog).getByText('€ EUR')).toBeInTheDocument();
  });

  it('applies a percent from the original prices and saves only changed rows', async () => {
    renderModal();
    const dialog = await screen.findByRole('dialog', { name: /Teklif Fiyatlarını Güncelle/ });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Yüzde' }), { target: { value: '5' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Uygula' }));
    fireEvent.click(within(dialog).getByRole('button', { name: /Kaydet/ }));
    await waitFor(() => expect(callsTo('/procurement/purchase-requests/7/adjust_offers/', 'POST')).toHaveLength(1));
    expect(callsTo('/procurement/purchase-requests/7/adjust_offers/', 'POST')[0]!.body).toEqual({
      items: [
        { item_offer_id: 101, unit_price: '2520.00' },
        { item_offer_id: 102, unit_price: '10.50' },
      ],
    });
    expect(onSaved).toHaveBeenCalled();
  });
});

import { authedFetch } from '@/auth/authService';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { ExecutiveOverviewPage } from './ExecutiveOverviewPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const REPORT = {
  kpis: {
    total_spent_eur: '1500.5',
    total_paid_eur: '1000',
    total_awaiting_eur: '500.5',
    po_count: 12,
    active_suppliers: 4,
    mom_percent: -3.25,
    yoy_percent: 10,
  },
  series: [
    {
      month: '2026-10',
      total_spent_eur: '1000',
      paid_eur: '600',
      awaiting_eur: '400',
      po_count: 8,
      active_suppliers: 3,
    },
    {
      month: '2026-09',
      total_spent_eur: '500.5',
      paid_eur: '400',
      awaiting_eur: '100.5',
      po_count: 4,
      active_suppliers: 1,
    },
  ],
};

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const reportCalls = () =>
  fetchMock.mock.calls
    .map(([url]) => new URL(String(url)))
    .filter((url) => url.pathname === '/procurement/reports/payment-forecast');

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => json(REPORT));
  vi.spyOn(notify, 'error');
});

describe('ExecutiveOverviewPage', () => {
  it('shows the KPIs and the months from the payment forecast', async () => {
    renderWithProviders(<ExecutiveOverviewPage />, {
      route: '/finance/reports/executive-overview',
    });

    await screen.findAllByText('Eki 2026');
    expect(reportCalls()[0]!.search).toBe('');
    expect(
      within(document.getElementById('total-spent')!).getByText('€1.500,50'),
    ).toBeInTheDocument();
    expect(within(document.getElementById('po-count')!).getByText('12')).toBeInTheDocument();
    const mom = document.getElementById('mom-percent')!;
    expect(within(mom).getByText('-3,3%')).toBeInTheDocument();
    expect(within(mom).getByText('Azalış')).toBeInTheDocument();
    expect(within(document.getElementById('yoy-percent')!).getByText('Artış')).toBeInTheDocument();

    // The table row (the charts' table views repeat the month).
    const row = screen
      .getAllByText('Eyl 2026')
      .map((el) => el.closest('tr'))
      .find((tr) => tr?.textContent?.includes('€100,50'));
    expect(row).toHaveTextContent('€500,50');
    expect(row).toHaveTextContent('€400,00');
    // Ödeme Dağılımı: the months' paid and awaiting, with their shares.
    const split = screen.getByRole('figure', { name: 'Ödeme dağılımı' });
    expect(within(split).getByText('€1.000,00')).toBeInTheDocument();
    expect(within(split).getByText('66,6%')).toBeInTheDocument();
  });

  it('sends the dates from the URL', async () => {
    renderWithProviders(<ExecutiveOverviewPage />, {
      route: '/finance/reports/executive-overview?created_gte=2026-01-01&created_lte=2026-06-30',
    });
    await screen.findAllByText('Eki 2026');
    expect(reportCalls()[0]!.searchParams.get('created_gte')).toBe('2026-01-01');
    expect(reportCalls()[0]!.searchParams.get('created_lte')).toBe('2026-06-30');
  });

  it('reports a failed load', async () => {
    fetchMock.mockImplementation(() => json({ error: 'kapalı' }, 500));
    renderWithProviders(<ExecutiveOverviewPage />, {
      route: '/finance/reports/executive-overview',
    });
    await vi.waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('Yönetici özeti yüklenirken hata oluştu: kapalı'),
    );
    expect((await screen.findAllByText('Aylık veri bulunamadı.')).length).toBeGreaterThan(0);
  });
});

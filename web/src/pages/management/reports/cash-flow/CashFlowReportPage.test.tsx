import { authedFetch } from '@/auth/authService';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { CashFlowReportPage } from './CashFlowReportPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const FORECAST = {
  kpis: {
    total_outflow_eur: '700',
    total_procurement_paid_eur: '300',
    total_procurement_awaiting_eur: '100',
    mom_percent: 5,
  },
  series: [
    { month: '2026-09', total_outflow_eur: '400', procurement_paid_eur: '300', po_count: 2 },
    { month: '2026-10', total_outflow_eur: '300', procurement_awaiting_eur: '100', po_count: 1 },
  ],
  dbs_summary: {
    total_dbs_used_eur: '90',
    suppliers: [
      {
        supplier_name: 'Test Tedarikçi',
        dbs_currency: 'EUR',
        dbs_used: '90',
        dbs_used_eur: '90',
        dbs_limit_eur: '100',
      },
    ],
  },
  undated_schedules: { total_outflow_eur: '12', po_count: 1 },
};

const REVENUE = {
  kpis: { total_inflow_eur: '1000' },
  series: [
    { month: '2026-09', total_inflow_eur: '200', offer_count: 1 },
    { month: '2026-10', total_inflow_eur: '800', offer_count: 2 },
  ],
};

const INFLOW_DETAIL = [
  {
    customer_name: 'Müşteri A',
    offer_no: 'OF-1',
    offer_title: 'Kazan',
    installment_amount_eur: '800',
    installment_amount_original: '800',
    original_currency: 'EUR',
  },
];
const OUTFLOW_DETAIL = {
  totals: { grand_total_eur: '300', procurement_eur: '300' },
  procurement: [
    {
      supplier_name: 'Test Tedarikçi',
      pr_title: 'Sac',
      amount_eur: '300',
      is_paid: false,
      due_date: '2026-10-10',
    },
  ],
};

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

function route(overrides: Record<string, () => Promise<Response>> = {}) {
  fetchMock.mockImplementation((input) => {
    const url = new URL(String(input));
    const custom = overrides[url.pathname];
    if (custom) return custom();
    switch (url.pathname) {
      case '/procurement/reports/payment-forecast':
        return json(FORECAST);
      case '/sales/reports/revenue/':
        return json(REVENUE);
      case '/sales/reports/inflow-detail/':
        return json(INFLOW_DETAIL);
      case '/procurement/reports/outflow-detail/':
        return json(OUTFLOW_DETAIL);
      default:
        return json({});
    }
  });
}

const callsTo = (path: string) =>
  fetchMock.mock.calls.map(([url]) => new URL(String(url))).filter((url) => url.pathname === path);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 2, 10, 0));
  fetchMock.mockReset();
  route();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CashFlowReportPage', () => {
  it('asks both reports for this month by default and merges them', async () => {
    renderWithProviders(<CashFlowReportPage />, { route: '/management/reports/cash-flow' });

    expect(await screen.findByText('Eylül 2026')).toBeInTheDocument();
    for (const path of ['/procurement/reports/payment-forecast', '/sales/reports/revenue/']) {
      const url = callsTo(path)[0]!;
      expect(url.searchParams.get('created_gte')).toBe('2026-11-01');
      expect(url.searchParams.get('created_lte')).toBe('2026-11-30');
    }

    // KPI tiles: totals, net with its sign, paid / awaiting / DBS.
    expect(
      within(document.getElementById('kpi-net-tile')!).getByText('+€300,00'),
    ).toBeInTheDocument();
    expect(
      within(document.getElementById('kpi-net-tile')!).getByText('Giriş fazla'),
    ).toBeInTheDocument();
    expect(within(document.getElementById('kpi-paid')!).getByText('€300,00')).toBeInTheDocument();
    expect(within(document.getElementById('kpi-dbs')!).getByText('€90,00')).toBeInTheDocument();

    // Monthly rows: September is negative (200 - 400), October brings the total back up.
    const september = screen.getByText('Eylül 2026').closest('tr')!;
    expect(september).toHaveTextContent('−€200,00');
    expect(september).toHaveTextContent('işaret değişti');
    const footer = screen.getByText('Toplam').closest('tr')!;
    expect(footer).toHaveTextContent('€1.000,00');
    expect(footer).toHaveTextContent('+€300,00');

    // Undated and DBS.
    expect(screen.getByText('Test Tedarikçi')).toBeInTheDocument();
    expect(screen.getByText('90%')).toBeInTheDocument();
  });

  it('uses the dates from the URL when there is no preset', async () => {
    renderWithProviders(<CashFlowReportPage />, {
      route: '/management/reports/cash-flow?preset=&created_gte=2026-03-01&created_lte=2026-06-30',
    });
    await screen.findByText('Eylül 2026');
    const url = callsTo('/procurement/reports/payment-forecast')[0]!;
    expect(url.searchParams.get('created_gte')).toBe('2026-03-01');
    expect(url.searchParams.get('created_lte')).toBe('2026-06-30');
  });

  it('asks for everything with the Tümü preset', async () => {
    renderWithProviders(<CashFlowReportPage />, {
      route: '/management/reports/cash-flow?preset=all',
    });
    await screen.findByText('Eylül 2026');
    expect(callsTo('/sales/reports/revenue/')[0]!.search).toBe('');
  });

  it('warns and shows the outflows when the revenue report fails', async () => {
    route({ '/sales/reports/revenue/': () => json({ detail: 'boom' }, 500) });
    renderWithProviders(<CashFlowReportPage />, { route: '/management/reports/cash-flow' });
    expect(
      await screen.findByText('Giriş verisi kullanılamıyor — yalnızca çıkış gösteriliyor.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Eylül 2026')).toBeInTheDocument();
  });

  it('says so when both reports fail', async () => {
    route({
      '/sales/reports/revenue/': () => json({ detail: 'boom' }, 500),
      '/procurement/reports/payment-forecast': () => json({ detail: 'boom' }, 500),
    });
    renderWithProviders(<CashFlowReportPage />, { route: '/management/reports/cash-flow' });
    expect(await screen.findByText('Nakit akış verisi yüklenemedi.')).toBeInTheDocument();
  });

  it('opens the month detail from a row', async () => {
    renderWithProviders(<CashFlowReportPage />, { route: '/management/reports/cash-flow' });
    fireEvent.click(await screen.findByText('Ekim 2026'));

    expect(await screen.findByText('Ekim 2026 — Nakit Akış Detayı')).toBeInTheDocument();
    await waitFor(() =>
      expect(callsTo('/sales/reports/inflow-detail/')[0]?.searchParams.get('month')).toBe(
        '2026-10',
      ),
    );
    expect(callsTo('/procurement/reports/outflow-detail/')[0]?.searchParams.get('month')).toBe(
      '2026-10',
    );

    expect(await screen.findByRole('tab', { name: 'Gelen (1)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Giden (1)' })).toBeInTheDocument();
    expect(screen.getByText('Müşteri A')).toBeInTheDocument();
    expect(screen.getByText('Net: +€500,00')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Giden (1)' }));
    expect(await screen.findByText('Tedarik / Satın Alma')).toBeInTheDocument();
    expect(screen.getByText('Bekliyor')).toBeInTheDocument();
  });
});

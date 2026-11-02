import { authedFetch } from '@legacy/authService.js';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { ManagementDashboardPage } from './ManagementDashboardPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);
const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const FULL = {
  meta: {
    generated_at: '2026-11-02T07:31:00Z',
    money_visible: true,
    rag_summary: { delivery: 'red', order_book: 'green', finance: 'green' },
    cache_state: { slow: 'fresh' },
    fx: { date: '2026-10-31', age_days: 2 },
  },
  errors: {},
  sections: {
    order_book: {
      rag: 'green',
      live_roots: 4,
      customers: 2,
      remaining_kg: '864500.0',
      total_kg: '1412300.0',
      value: null,
    },
    delivery: {
      rag: 'red',
      overdue: {
        count: 2,
        live_total: 4,
        share_kg_pct: '27.4',
        jobs: [
          {
            job_no: 'T-254-01',
            customer: 'Müşteri A',
            title: 'Tank',
            target: '2026-10-09',
            late_wd: 16,
          },
        ],
      },
      otd_13w: { pct: '71', on_time: 22, total: 31 },
      series_6m: [{ month: '2026-10', on_time: 7, late: 3, pct: '70' }],
    },
    finance: {
      rag: 'green',
      committed: { mtd_eur: '84200', po_count_mtd: 6, prev_same_day_eur: '112600' },
    },
    live: {
      generated_at: '2026-11-02T07:31:00Z',
      machines: { total: 24, running: 19, down: 2, down_list: [] },
    },
    decisions: {
      by_type: {
        purchase_request: { count: 7, oldest_days: 5, critical: 2 },
        crane_request: null,
        sales_offer: { count: 0 },
      },
      mine: { count: 3, oldest_days: 2, by_type: { purchase_request: 2 } },
    },
    exceptions: {
      generated_at: '2026-11-02T07:05:00Z',
      total_candidates: 12,
      rows: [
        {
          kind: 'overdue',
          job_no: 'T-254-01',
          customer: 'Müşteri A',
          title: 'Tank',
          impact_kg: '48200',
          urgency: 16,
          urgency_unit: 'iş günü geç',
          owner: 'Planlama',
        },
      ],
    },
  },
};

const calls = () =>
  fetchMock.mock.calls
    .map(([url]) => new URL(String(url)))
    .filter((u) => u.pathname === '/reports/dashboard/')
    .map((u) => u.search);

function backend(full: unknown = FULL, slow: unknown = { sections: {} }) {
  fetchMock.mockImplementation((url) => {
    const u = new URL(String(url));
    if (u.pathname === '/assistant/daily-summary/latest/') return json({ detail: 'yok' }, 404);
    if (u.searchParams.get('block') === 'slow') return json(slow);
    return json(full);
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.spyOn(notify, 'error');
});
afterEach(() => vi.restoreAllMocks());

it('shows the pillars, verdict counts, queues and the drawer from one request', async () => {
  backend();
  renderWithProviders(<ManagementDashboardPage />, { route: '/management/dashboard' });
  expect(screen.getByRole('heading', { name: 'Yönetim Paneli' })).toBeInTheDocument();

  const delivery = await screen.findByRole('button', { name: /Teslimat — Kritik — Neden\?/ });
  expect(within(delivery).getByText('%27')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Sipariş Defteri — İyi/ })).toHaveTextContent(
    '864,5 t',
  );
  // The finance pillar: €84k this month, down 25% against the same day last month (good for spend).
  const finance = screen.getByRole('button', { name: /Finans — İyi/ });
  expect(within(finance).getByText('€84k')).toBeInTheDocument();
  expect(within(finance).getByLabelText('↓ 25% (iyi yönde)')).toBeInTheDocument();

  expect(document.getElementById('dash-rag-red')).toHaveTextContent('1');
  expect(document.getElementById('dash-rag-green')).toHaveTextContent('2');
  expect(screen.getByText('Sizi bekleyen 3 · en eski 2 gün')).toBeInTheDocument();
  expect(
    screen.getByText('12 aday · sıralama: öncelik × iş günü · hesaplama 10:05'),
  ).toBeInTheDocument();
  expect(screen.getByText('Termin geçti')).toBeInTheDocument();
  // Zero-count subjects outside the always-visible set are hidden; null ones too.
  expect(screen.queryByText('Teklif')).toBeNull();
  expect(screen.getByText('19/24')).toBeInTheDocument();
  expect(screen.getByText(/Kur 31 Eki 2026 \(2 gün önce\)/)).toBeInTheDocument();

  // The slow cache is fresh: no ?block=slow, and the live strip waits for its first poll.
  expect(calls()).toEqual(['']);

  fireEvent.click(delivery);
  const drawer = await screen.findByRole('dialog');
  expect(within(drawer).getByText('Termini geçen işler')).toBeInTheDocument();
  expect(within(drawer).getByRole('link', { name: 'T-254-01' })).toHaveAttribute(
    'href',
    '/projects/project-tracking?job_no=T-254-01',
  );
});

it('fetches the slow tier when its cache is missing and merges it in', async () => {
  backend(
    { ...FULL, meta: { ...FULL.meta, cache_state: { slow: 'missing' } } },
    {
      sections: { order_book: { value: { value_eur: '6840000', unpriced_roots: 4 } } },
      meta: { cache_state: { slow: 'fresh' } },
    },
  );
  renderWithProviders(<ManagementDashboardPage />);
  expect(await screen.findByText(/^€6,8M defter/)).toBeInTheDocument();
  expect(calls()).toEqual(['', '?block=slow']);
});

it('Yenile reloads with refresh=1 and rebuilds the slow tier', async () => {
  backend();
  renderWithProviders(<ManagementDashboardPage />);
  await screen.findByRole('button', { name: /Teslimat — / });
  fireEvent.click(screen.getByRole('button', { name: 'Yenile' }));
  await waitFor(() => expect(calls()).toEqual(['', '?refresh=1', '?block=slow&refresh=1']));
});

it('says so when the dashboard cannot load', async () => {
  fetchMock.mockImplementation(() => json({ detail: 'Sunucu hatası' }, 500));
  renderWithProviders(<ManagementDashboardPage />);
  expect(await screen.findByText('Veriler yüklenemedi: Sunucu hatası')).toBeInTheDocument();
  expect(notify.error).toHaveBeenCalledWith('Yönetim paneli yüklenemedi: Sunucu hatası');
  expect(screen.getByText('Canlı şerit yüklenemedi')).toBeInTheDocument();
});

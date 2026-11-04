import { authedFetch } from '@/auth/authService';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { AnalyticsPage } from './AnalyticsPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const ROWS = [
  {
    job_no: '254-01',
    title: 'Tav Fırını',
    customer_name: 'Alfa Isıl İşlem Sanayi A.Ş.',
    customer_short_name: 'Alfa',
    catalog_nodes: [{ id: 501, title: 'Tav Fırını', path: 'Şablon › Fırınlar › Tav Fırını' }],
    status: 'active',
    is_manufactured: true,
    has_children: true,
    total_weight_kg: '1000',
    labor_cost: '1000',
    employee_overhead_cost: '200',
    material_cost: '3000',
    subcontractor_cost: '500',
    actual_total_cost: '5000',
    estimated_total_cost: '4800',
    price_per_kg: '5',
    selling_price: '8000',
    selling_price_currency: 'EUR',
    margin_eur: '3000',
    margin_pct: '37.5',
    completion_pct: '60',
    target_completion_date: '2026-12-01',
  },
  {
    job_no: '254-02',
    title: 'Pota Ocağı için çok uzun bir iş emri başlığı, kırpılmalı',
    customer_name: 'Beta Makina Ltd. Şti.',
    status: 'on_hold',
    total_weight_kg: '1000',
    actual_total_cost: '3000',
    selling_price: '2000',
    selling_price_currency: 'USD',
    margin_pct: '-50',
  },
];

const CHILDREN = [
  { job_no: '254-01-01', title: 'Gövde', actual_total_cost: '2500', has_children: false },
];

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const callsTo = (path: string) =>
  fetchMock.mock.calls.map(([url]) => new URL(String(url))).filter((url) => url.pathname === path);

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/management/analytics') {
  return renderWithProviders(
    <>
      <AnalyticsPage />
      <LocationProbe />
    </>,
    { route },
  );
}

beforeEach(() => {
  window.localStorage.clear();
  fetchMock.mockReset();
  fetchMock.mockImplementation((input) => {
    const url = new URL(String(input));
    switch (url.pathname) {
      case '/projects/job-orders/cost_table/':
        return url.searchParams.get('search') === '254-01'
          ? json({ count: 1, results: [ROWS[0]] })
          : json({ count: 42, next: null, previous: null, results: ROWS });
      case '/projects/job-orders/254-01/cost_children/':
        return json(CHILDREN);
      case '/reports/combined-job-costs':
        return json({
          results: [
            {
              job_no: '254-01',
              machining: { total_cost: 600, hours: { weekday_work: 10 }, costs: {} },
              welding: { total_cost: 200, hours: { regular: 5 }, costs: {} },
              combined_total_hours: 15,
              by_job: [{ job_no: '254-01' }],
            },
          ],
        });
      default:
        return json({});
    }
  });
});

describe('AnalyticsPage', () => {
  it('loads the cost table with the legacy defaults and shows the summary figures', async () => {
    renderPage();
    expect(await screen.findByText('Tav Fırını')).toBeInTheDocument();
    const call = callsTo('/projects/job-orders/cost_table/')[0]!;
    expect(Object.fromEntries(call.searchParams)).toEqual({
      ordering: '-date',
      page: '1',
      page_size: '20',
    });

    // İş Sayısı is the server count; the rest are over the rows of the page.
    const figure = (id: string) => document.getElementById(id)!.querySelector('dd')!;
    expect(figure('count')).toHaveTextContent('42');
    // Average margin over rows with a price: (37,5 − 50) / 2.
    expect(figure('avgMargin')).toHaveTextContent('-6,3%');
    expect(figure('revenue')).toHaveTextContent('€10.000,00');
    expect(figure('cost')).toHaveTextContent('€8.000,00');

    // An entered price in another currency is shown in that currency.
    expect(screen.getByText('$2.000,00')).toBeInTheDocument();
    // Footer: two top-level rows, total cost.
    expect(screen.getByText('2 satır')).toBeInTheDocument();
  });

  it('sends the URL filters, with the date range on the chosen date field', async () => {
    renderPage(
      '/management/analytics?status=active&status=draft&date_field=created&date_start=2026-01-01&customer=7&manufactured=true&template_node=4,5',
    );
    await screen.findByText('Tav Fırını');
    const params = Object.fromEntries(callsTo('/projects/job-orders/cost_table/')[0]!.searchParams);
    expect(params).toEqual({
      created_at__date__gte: '2026-01-01',
      status__in: 'active,draft',
      customer: '7',
      ordering: '-date',
      template_node: '4,5',
      manufactured: 'true',
      page: '1',
      page_size: '20',
    });
  });

  it('sorts on the server through the column header and keeps it in the URL', async () => {
    renderPage();
    await screen.findByText('Tav Fırını');
    fireEvent.click(screen.getByRole('button', { name: /Toplam Maliyet/ }));
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('ordering=actual_cost'),
    );
    await waitFor(() =>
      expect(callsTo('/projects/job-orders/cost_table/').at(-1)!.searchParams.get('ordering')).toBe(
        'actual_cost',
      ),
    );
  });

  it('expands a job into its cost children', async () => {
    renderPage();
    await screen.findByText('Tav Fırını');
    fireEvent.click(screen.getByRole('button', { name: '254-01 genişlet' }));
    expect(await screen.findByText('Gövde')).toBeInTheDocument();
    expect(callsTo('/projects/job-orders/254-01/cost_children/')).toHaveLength(1);
    expect(screen.getByRole('button', { name: '254-01 daralt' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    // Children are already in their parent's totals: the footer still counts two rows.
    expect(screen.getByText('2 satır')).toBeInTheDocument();
  });

  it('shows the cost detail columns on demand and drills into labor', async () => {
    renderPage();
    await screen.findByText('Tav Fırını');
    expect(screen.queryByRole('button', { name: 'İşçilik Detayları' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Maliyet detaylarını göster' }));
    // İşçilik + Vergi = labor + overhead.
    expect(screen.getAllByText('€1.200,00').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'İşçilik Detayları' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('254-01 - İş Maliyeti Detayları')).toBeInTheDocument();
    // Özet follows the table row; the vergi splits 3:1 by machining/welding labor.
    expect(await within(dialog).findByText('Talaşlı İmalat')).toBeInTheDocument();
    expect(within(dialog).getAllByText('€150,00').length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('€50,00').length).toBeGreaterThan(0);
    const combined = callsTo('/reports/combined-job-costs')[0]!;
    expect(Object.fromEntries(combined.searchParams)).toEqual({
      job_no: '254-01',
      include_descendants: 'true',
    });
  });

  it('crops a long Başlık to a title and keeps the full text on hover', async () => {
    renderPage();
    await screen.findByText('Tav Fırını');
    // 20 characters, then an ellipsis; the whole title is the hover text.
    const cropped = screen.getByText('Pota Ocağı için çok…');
    expect(cropped).toHaveAttribute(
      'title',
      'Pota Ocağı için çok uzun bir iş emri başlığı, kırpılmalı',
    );
    expect(screen.getByText('Tav Fırını')).not.toHaveAttribute('title');
  });

  it('shows customers by short name with the full name on hover', async () => {
    renderPage();
    await screen.findByText('Tav Fırını');
    expect(screen.getByText('Alfa')).toHaveAttribute('title', 'Alfa Isıl İşlem Sanayi A.Ş.');
    expect(screen.queryByText('Alfa Isıl İşlem Sanayi A.Ş.')).toBeNull();
    // Without a short name the full one stands in.
    expect(screen.getByText('Beta Makina Ltd. Şti.')).toBeInTheDocument();
  });

  it('does not show the Katalog Kalemi column, but its filter still works', async () => {
    renderPage('/management/analytics?template_node=4,5');
    await screen.findByText('Tav Fırını');
    expect(screen.queryByRole('columnheader', { name: 'Katalog Kalemi' })).toBeNull();
    expect(screen.queryByText('Şablon › Fırınlar › Tav Fırını')).toBeNull();
    expect(callsTo('/projects/job-orders/cost_table/')[0]!.searchParams.get('template_node')).toBe(
      '4,5',
    );
    // The picker button stays in the table toolbar, with the count of chosen items.
    const picker = screen.getByRole('button', { name: /Katalog Kalemi/ });
    expect(picker).toHaveTextContent('2');
  });

  it('folds the Top 15 chart away and remembers it', async () => {
    const { unmount } = renderPage();
    await screen.findByText('Tav Fırını');
    const chart = () => screen.queryByRole('figure', { name: /En yüksek maliyetli 15 iş/ });
    expect(chart()).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Top 15 grafiğini gizle' }));
    expect(chart()).toBeNull();
    const show = screen.getByRole('button', { name: 'Top 15 grafiğini göster' });
    expect(show).toHaveAttribute('aria-expanded', 'false');
    // The table is untouched.
    expect(screen.getByText('Tav Fırını')).toBeInTheDocument();

    // A new visit opens it folded.
    unmount();
    renderPage();
    await screen.findByText('Tav Fırını');
    expect(chart()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Top 15 grafiğini göster' }));
    expect(chart()).toBeInTheDocument();
  });
});

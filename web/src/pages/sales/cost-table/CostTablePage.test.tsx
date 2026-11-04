import { authedFetch } from '@/auth/authService';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { costColumns } from './columns';
import { CostTablePage } from './CostTablePage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const ROWS = [
  {
    job_no: '254-01',
    title: 'Tav Fırını',
    customer_short_name: 'Alfa',
    status: 'active',
    is_manufactured: true,
    has_children: true,
    total_weight_kg: '1000',
    labor_cost: '1000',
    employee_overhead_cost: '200',
    material_cost: '3000',
    subcontractor_cost: '500',
    paint_cost: '100',
    paint_material_cost: '50',
    general_expenses_cost: '400',
    general_expenses_rate: '0.1500',
    actual_total_cost: '5000',
    price_per_kg: '5',
    selling_price: '8000',
    selling_price_currency: 'EUR',
    margin_eur: '3000',
    margin_pct: '37.5',
    last_updated: '2026-10-30T09:00:00Z',
  },
  {
    job_no: '254-02',
    title: 'Pota Ocağı',
    status: 'on_hold',
    is_manufactured: false,
    selling_price: null,
    selling_price_is_derived: true,
    selling_price_display: '1234.50',
    selling_price_display_source: 'rolled_up_from_children',
  },
];

const CHILDREN = [
  { job_no: '254-01-01', title: 'Gövde', actual_total_cost: '2500', has_children: false },
];

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const calls = (path: string, method = 'GET') =>
  fetchMock.mock.calls.filter(
    ([url, init]) => new URL(String(url)).pathname === path && (init?.method ?? 'GET') === method,
  );
const urlsTo = (path: string) => calls(path).map(([url]) => new URL(String(url)));

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/sales/cost-table') {
  return renderWithProviders(
    <>
      <CostTablePage />
      <LocationProbe />
    </>,
    { route },
  );
}

const cell = (rowId: string, col: string) =>
  document
    .querySelector<HTMLElement>(`tr[data-row-id="${rowId}"]`)!
    .querySelector<HTMLElement>(`td[data-col="${col}"]`)!;

beforeEach(() => {
  // The breakdown columns are collapsed by default; most tests need them.
  window.localStorage.setItem('cost-table-breakdown', 'true');
  fetchMock.mockReset();
  fetchMock.mockImplementation((input, init) => {
    const url = new URL(String(input));
    switch (url.pathname) {
      case '/projects/job-orders/cost_table/':
        return json({ count: 42, next: null, previous: null, results: ROWS });
      case '/projects/job-orders/254-01/cost_children/':
        return json(CHILDREN);
      case '/projects/job-orders/254-01/cost_summary/':
        return init?.method === 'PATCH' ? json({ selling_price: '9000.50' }) : json({});
      case '/reports/combined-job-costs':
        return json({
          results: [
            {
              job_no: '254-01',
              combined_total_cost: 800,
              combined_total_hours: 20,
              machining: {
                total_cost: 600,
                hours: { weekday_work: 10, after_hours: 2, sunday: 0 },
                costs: { after_hours: 90, sunday: 0 },
              },
              welding: null,
            },
          ],
        });
      case '/machining/reports/job-entries/':
        return json({
          summary: { total_entries: 2, total_hours: 3, breakdown_by_type: { weekday_work: 3 } },
          entries: [
            {
              id: 2,
              start_time: Date.UTC(2026, 9, 2, 8),
              employee_full_name: 'Ayşe Kaya',
              employee_username: 'akaya',
              operation_key: 'OP-2',
              operation_name: 'Frezeleme',
              hours: 2,
              work_type: 'weekday_work',
            },
            {
              id: 1,
              start_time: Date.UTC(2026, 9, 1, 8),
              employee_full_name: 'Ali Veli',
              operation_key: 'OP-1',
              operation_name: 'Tornalama',
              hours: 1,
              work_type: 'after_hours',
            },
          ],
        });
      case '/projects/procurement-lines/':
        return json([
          { id: 1, item_code: 'M-1', item_name: 'Sac', quantity: '2', amount_eur: '1500' },
          { id: 2, item_code: 'M-2', item_name: 'Profil', quantity: '1', amount_eur: '1500' },
        ]);
      case '/subcontracting/assignments/':
        return json({
          results: [
            {
              id: 1,
              subcontractor_name: 'Usta Kaynak',
              cost_currency: 'EUR',
              current_cost: '500',
              unbilled_cost: '100',
              allocated_weight_kg: '250',
              current_progress: '40',
            },
          ],
        });
      default:
        return json({});
    }
  });
});

describe('CostTablePage', () => {
  it('loads the cost table with the legacy defaults and shows its columns', async () => {
    renderPage();
    expect(await screen.findByText('Tav Fırını')).toBeInTheDocument();
    expect(Object.fromEntries(urlsTo('/projects/job-orders/cost_table/')[0]!.searchParams)).toEqual(
      { ordering: 'job_no', page: '1', page_size: '20' },
    );

    // İşçilik + Vergi = labor + overhead; Boya = paint + paint material.
    expect(cell('0-254-01', 'labor_cost')).toHaveTextContent('€1.200,00');
    expect(cell('0-254-01', 'paint_cost')).toHaveTextContent('€150,00');
    expect(cell('0-254-01', 'general_expenses_cost')).toHaveTextContent('€400,00(0.15)');
    expect(cell('0-254-01', 'status')).toHaveTextContent('Aktif');
    expect(cell('0-254-01', 'is_manufactured')).toHaveTextContent('Bizde');
    expect(cell('0-254-02', 'is_manufactured')).toHaveTextContent('Harici');
    expect(cell('0-254-01', 'margin_pct')).toHaveTextContent('37,50%');
    expect(screen.getByRole('link', { name: '254-01' })).toHaveAttribute(
      'href',
      '/projects/project-tracking/?job_no=254-01',
    );
    // A derived price is shown beside the (empty) entered one.
    expect(cell('0-254-02', 'selling_price')).toHaveTextContent('Fiyat≈€1.234,50');
  });

  it('collapses the cost breakdown columns by default and toggles them from Toplam Maliyet', async () => {
    window.localStorage.setItem('cost-table-breakdown', 'false');
    renderPage();
    await screen.findByText('Tav Fırını');
    expect(document.querySelector('td[data-col="labor_cost"]')).toBeNull();
    expect(document.querySelector('td[data-col="general_expenses_cost"]')).toBeNull();
    expect(cell('0-254-01', 'actual_total_cost')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Maliyet kalemlerini göster' }));
    expect(cell('0-254-01', 'labor_cost')).toHaveTextContent('€1.200,00');
    expect(window.localStorage.getItem('cost-table-breakdown')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Maliyet kalemlerini gizle' }));
    expect(document.querySelector('td[data-col="labor_cost"]')).toBeNull();
  });

  it('truncates a long Başlık and keeps the full text as the hover title', () => {
    const column = costColumns({
      expanded: new Set(),
      loadingChildren: new Set(),
      withChildren: new Set(),
      onToggle: () => {},
      breakdown: false,
      onToggleBreakdown: () => {},
      onDrill: () => {},
    }).find((c) => c.key === 'title')!;
    const long = `${'Ağır '.repeat(20)}parça`;
    render(<>{column.render!({ title: long } as never, 0)}</>);
    const shown = screen.getByTitle(long);
    expect(shown.textContent!.length).toBeLessThan(long.length);
    expect(shown.textContent).toMatch(/…$/);
  });

  it('sends the URL filters, with the date range on the chosen date field', async () => {
    renderPage(
      '/sales/cost-table?status=active&search=pump&date_field=last_updated&date_start=2026-01-01&date_end=2026-02-01&customer=7&manufactured=false&template_node=4,5',
    );
    await screen.findByText('Tav Fırını');
    expect(Object.fromEntries(urlsTo('/projects/job-orders/cost_table/')[0]!.searchParams)).toEqual(
      {
        cost_summary__last_updated__date__gte: '2026-01-01',
        cost_summary__last_updated__date__lte: '2026-02-01',
        status: 'active',
        customer: '7',
        search: 'pump',
        ordering: 'job_no',
        template_node: '4,5',
        manufactured: 'false',
        page: '1',
        page_size: '20',
      },
    );
  });

  it('sorts on the server with the backend ordering names', async () => {
    renderPage();
    await screen.findByText('Tav Fırını');
    fireEvent.click(screen.getByRole('button', { name: /Toplam Ağırlık/ }));
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('ordering=weight'),
    );
    await waitFor(() =>
      expect(urlsTo('/projects/job-orders/cost_table/').at(-1)!.searchParams.get('ordering')).toBe(
        'weight',
      ),
    );
  });

  it('expands a job into its cost children', async () => {
    renderPage();
    await screen.findByText('Tav Fırını');
    fireEvent.click(screen.getByRole('button', { name: '254-01 genişlet' }));
    expect(await screen.findByText('Gövde')).toBeInTheDocument();
    expect(calls('/projects/job-orders/254-01/cost_children/')).toHaveLength(1);
    expect(screen.getByRole('button', { name: '254-01 daralt' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: '254-01 daralt' }));
    await waitFor(() => expect(screen.queryByText('Gövde')).toBeNull());
  });

  it('saves an edited selling price in EUR and keeps the new value', async () => {
    renderPage();
    await screen.findByText('Tav Fırını');
    fireEvent.click(cell('0-254-01', 'selling_price'));
    const input = screen.getByRole('textbox', { name: 'Satış Fiyatı' });
    expect(input).toHaveValue('8000');
    fireEvent.change(input, { target: { value: '9.000,5' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() =>
      expect(calls('/projects/job-orders/254-01/cost_summary/', 'PATCH')).toHaveLength(1),
    );
    const [, init] = calls('/projects/job-orders/254-01/cost_summary/', 'PATCH')[0]!;
    expect(JSON.parse(String(init!.body))).toEqual({
      selling_price: '9000.50',
      selling_price_currency: 'EUR',
    });
    await waitFor(() => expect(cell('0-254-01', 'selling_price')).toHaveTextContent('€9.000,50'));
    // The save does not reload the table.
    expect(calls('/projects/job-orders/cost_table/')).toHaveLength(1);
  });

  it('refuses a negative price and does not send a change under a cent', async () => {
    renderPage();
    await screen.findByText('Tav Fırını');
    fireEvent.click(cell('0-254-01', 'selling_price'));
    let input = screen.getByRole('textbox', { name: 'Satış Fiyatı' });
    fireEvent.change(input, { target: { value: '-5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(cell('0-254-01', 'selling_price')).toHaveAttribute('data-cell-state', 'error');

    fireEvent.click(cell('0-254-01', 'selling_price'));
    input = screen.getByRole('textbox', { name: 'Satış Fiyatı' });
    fireEvent.change(input, { target: { value: '8000,004' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(calls('/projects/job-orders/254-01/cost_summary/', 'PATCH')).toHaveLength(0);
  });

  it('drills from labor into the job cost summary and on to machining entries', async () => {
    renderPage();
    await screen.findByText('Tav Fırını');
    fireEvent.click(within(cell('0-254-01', 'labor_cost')).getByRole('button'));

    const job = await screen.findByRole('dialog', { name: /254-01 - İş Maliyeti Detayları/ });
    expect(Object.fromEntries(urlsTo('/reports/combined-job-costs')[0]!.searchParams)).toEqual({
      job_no: '254-01',
    });
    // 800 € over 20 hours; machining: 12 hours, overtime 90 €, 50 €/hour.
    expect(await within(job).findByText('€40,00')).toBeInTheDocument();
    expect(within(job).getByText('€90,00')).toBeInTheDocument();
    expect(within(job).getByText('€50,00')).toBeInTheDocument();
    expect(
      within(job).getByText('Bu iş için kaynaklı imalat verisi bulunmamaktadır.'),
    ).toBeInTheDocument();

    fireEvent.click(within(job).getByRole('button', { name: 'Detayları Görüntüle' }));
    const machining = await screen.findByRole('dialog', {
      name: /254-01 - Talaşlı İmalat Detayları/,
    });
    expect(await within(machining).findByText('Frezeleme')).toBeInTheDocument();
    // Oldest entry first.
    const names = within(machining)
      .getAllByText(/Tornalama|Frezeleme/)
      .map((el) => el.textContent);
    expect(names).toEqual(['Tornalama', 'Frezeleme']);
    expect(within(machining).getByText('Mesai')).toBeInTheDocument();
  });

  it('shows the material lines and the subcontractor assignments of a job', async () => {
    renderPage();
    await screen.findByText('Tav Fırını');
    fireEvent.click(within(cell('0-254-01', 'material_cost')).getByRole('button'));
    const material = await screen.findByRole('dialog', { name: /Malzeme Detayları/ });
    expect(await within(material).findByText('Profil')).toBeInTheDocument();
    expect(within(material).getByText('€3.000,00')).toBeInTheDocument();
    expect(urlsTo('/projects/procurement-lines/')[0]!.searchParams.get('job_order')).toBe('254-01');
    fireEvent.click(within(material).getAllByRole('button', { name: /Kapat/ })[0]!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(within(cell('0-254-01', 'subcontractor_cost')).getByRole('button'));
    const sub = await screen.findByRole('dialog', { name: /Taşeron Detayları/ });
    expect(await within(sub).findByText('Usta Kaynak')).toBeInTheDocument();
    expect(within(sub).getByText('250,00 kg')).toBeInTheDocument();
    expect(urlsTo('/subcontracting/assignments/')[0]!.searchParams.get('job_no')).toBe('254-01');
  });

  it('shows no info button for a zero cost', async () => {
    renderPage();
    await screen.findByText('Pota Ocağı');
    expect(within(cell('0-254-02', 'labor_cost')).queryByRole('button')).toBeNull();
    expect(within(cell('0-254-02', 'material_cost')).queryByRole('button')).toBeNull();
  });
});

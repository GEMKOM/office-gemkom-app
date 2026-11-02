import { authedFetch } from '@legacy/authService.js';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { AdjustmentsPage } from './AdjustmentsPage';
import { amountTotals, formatPeriod } from './columns';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const ADJUSTMENTS = [
  {
    id: 1,
    adjustment_type: 'addition',
    created_at: '2026-03-01T10:00:00Z',
    statement_year: 2026,
    statement_month: 3,
    subcontractor_name: 'Kaya Kaynak',
    job_no: '094-175',
    weight_kg: '120.50',
    amount: '1500.00',
    currency: 'TRY',
    reason: 'Ek iş',
    description: '',
  },
  {
    id: 2,
    adjustment_type: 'addition',
    created_at: '2026-04-01T10:00:00Z',
    statement_year: 2026,
    statement_month: 4,
    subcontractor_name: 'Demir Montaj',
    job_no: '094-180',
    weight_kg: '0',
    amount: '200.00',
    currency: 'EUR',
    reason: 'Fazla mesai',
    description: 'Hafta sonu',
  },
  {
    id: 3,
    adjustment_type: 'deduction',
    created_at: '2026-04-02T10:00:00Z',
    statement_year: 2026,
    statement_month: 4,
    subcontractor_name: 'Kaya Kaynak',
    job_no: null,
    weight_kg: null,
    amount: '75.25',
    currency: 'TRY',
    reason: 'Fire',
    description: null,
  },
];

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const urls = () => fetchMock.mock.calls.map(([url]) => new URL(String(url)));
const reportCalls = () => urls().filter((u) => u.pathname === '/subcontracting/adjustments/');

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/manufacturing/subcontracting/adjustments') {
  return renderWithProviders(
    <>
      <AdjustmentsPage />
      <LocationProbe />
    </>,
    { route },
  );
}

/** The DataTable panel whose title is `title`. */
function panel(title: string): HTMLElement {
  return screen.getByRole('heading', { name: title }).closest('section')!;
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => {
    const path = new URL(String(url)).pathname;
    if (path === '/subcontracting/subcontractors/') {
      return json({
        count: 2,
        next: null,
        previous: null,
        results: [
          { id: 7, name: 'Kaya Kaynak' },
          { id: 8, name: '', short_name: 'Demir' },
        ],
      });
    }
    if (path === '/subcontracting/adjustments/')
      return json({ count: 3, results: ADJUSTMENTS, summary: [] });
    return json({ detail: 'not mocked' }, 404);
  });
});

it('splits the report into additions and deductions with per-currency totals', async () => {
  renderPage();
  expect(screen.getByText('Taşeron Düzeltmeleri')).toBeInTheDocument();
  await screen.findByText('094-175');

  const additions = panel('Ek Ödemeler');
  const deductions = panel('Kesintiler');
  expect(within(additions).getByText('Demir Montaj')).toBeInTheDocument();
  expect(within(additions).queryByText('Fire')).toBeNull();
  expect(within(deductions).getByText('Fire')).toBeInTheDocument();

  // Newest first (legacy initial sort created_at desc).
  const firstRow = within(additions).getAllByRole('row')[1]!;
  expect(within(firstRow).getByText('Demir Montaj')).toBeInTheDocument();
  expect(within(firstRow).getByText('Nisan 2026')).toBeInTheDocument();

  expect(within(additions).getByText('Toplam: 200,00 EUR + 1.500,00 TRY')).toBeInTheDocument();
  expect(within(deductions).getByText('Toplam: 75,25 TRY')).toBeInTheDocument();
  expect(within(additions).getByText('120,50 kg')).toBeInTheDocument();

  // The subcontractor dropdown is fed by the active subcontractors, as legacy.
  const sub = urls().find((u) => u.pathname === '/subcontracting/subcontractors/')!;
  expect(Object.fromEntries(sub.searchParams)).toEqual({ is_active: 'true' });
  expect(Object.fromEntries(reportCalls()[0]!.searchParams)).toEqual({});
});

it('sends the filters from the URL and writes new ones back', async () => {
  renderPage('/manufacturing/subcontracting/adjustments?subcontractor=7&year=2026&month=4');
  await screen.findByText('094-175');
  expect(Object.fromEntries(reportCalls()[0]!.searchParams)).toEqual({
    subcontractor: '7',
    year: '2026',
    month: '4',
  });
  // The pill names the picked subcontractor once the dropdown list arrives.
  expect(await screen.findByText(/Kaya Kaynak/, { selector: 'span' })).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('İş No'), { target: { value: '094' } });
  fireEvent.keyDown(screen.getByLabelText('İş No'), { key: 'Enter' });
  await waitFor(() =>
    expect(
      new URLSearchParams(screen.getByTestId('location').textContent ?? '').get('job_no'),
    ).toBe('094'),
  );
  await waitFor(() =>
    expect(Object.fromEntries(reportCalls().at(-1)!.searchParams)).toEqual({
      subcontractor: '7',
      year: '2026',
      month: '4',
      job_no: '094',
    }),
  );
});

it('formats periods and totals like legacy', () => {
  expect(
    formatPeriod({ id: 1, adjustment_type: 'addition', statement_year: 2026, statement_month: 1 }),
  ).toBe('Ocak 2026');
  expect(formatPeriod({ id: 1, adjustment_type: 'addition', statement_period: '2026-02' })).toBe(
    '2026-02',
  );
  expect(formatPeriod({ id: 1, adjustment_type: 'addition' })).toBe('-');
  expect(
    amountTotals([
      { id: 1, adjustment_type: 'deduction', amount: '10', currency: 'USD' },
      { id: 2, adjustment_type: 'deduction', amount: '5.5', currency: 'USD' },
    ]),
  ).toBe('15,50 USD');
});

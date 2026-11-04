import { authedFetch } from '@/auth/authService';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { SubcontractingStatementsPage } from './SubcontractingStatementsPage';
import { mapRowToSchema, parseLocaleNumber } from './statementRows';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const ROWS = [
  {
    Stock_Code: 'STK-1',
    amount: '10,5',
    unit_price: '2.000,00',
    total_price: '21.000,00',
    job_no: '254-01',
    subcontractor_name: 'Usta Kaynak',
  },
  {
    stock_code: 'STK-2',
    amount: 4.5,
    unit_price: 100,
    total_price: '450.00',
    job_no: '254-02',
    subcontractor_name: 'Usta Kaynak',
  },
];

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const exportCalls = () =>
  fetchMock.mock.calls
    .map(([url]) => new URL(String(url)))
    .filter((url) => url.pathname === '/subcontracting/statements/accounting-export/');

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => json(ROWS));
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('maps the export rows onto the accounting layout like legacy', () => {
  expect(mapRowToSchema(ROWS[0]!)).toMatchObject({
    s: 'S',
    stock_code: 'STK-1',
    quantity_done: '10,5',
    amount: '21.000,00',
    project_code: '254-01',
    subcontractor: 'Usta Kaynak',
    b1: '',
  });
  expect(parseLocaleNumber('1.234,56')).toBe(1234.56);
  expect(parseLocaleNumber('1,234.56')).toBe(1234.56);
  expect(parseLocaleNumber('abc')).toBeNull();
});

it('loads nothing until Yükle, then loads the chosen month and totals the sums', async () => {
  renderWithProviders(<SubcontractingStatementsPage />, {
    route: '/accounting/subcontracting-statements/',
  });
  expect(screen.getByRole('heading', { name: 'Hakedişler' })).toBeInTheDocument();
  expect(screen.getByText('Henüz veri yok. Yıl/Ay seçip "Yükle" tıklayın.')).toBeInTheDocument();
  expect(exportCalls()).toHaveLength(0);

  fireEvent.change(screen.getByLabelText('Yıl'), { target: { value: '2026' } });
  fireEvent.click(screen.getByRole('button', { name: 'Yükle' }));

  expect(await screen.findByText('STK-1')).toBeInTheDocument();
  const params = exportCalls()[0]!.searchParams;
  expect(params.get('year')).toBe('2026');
  expect(params.get('month')).toBe(String(new Date().getMonth() + 1));
  expect(screen.getByTestId('status-text')).toHaveTextContent('Yüklendi (2 satır)');
  // Footer: Yapılan Miktar and Tutar summed; Birim Fiyat left blank.
  const footer = document.querySelector('tfoot')!;
  expect(within(footer as HTMLElement).getByText('Toplam')).toBeInTheDocument();
  expect(within(footer as HTMLElement).getByText('15,00')).toBeInTheDocument();
  expect(within(footer as HTMLElement).getByText('21.450,00')).toBeInTheDocument();
});

it('rejects a year outside 2000–2100 without a request', async () => {
  renderWithProviders(<SubcontractingStatementsPage />, {
    route: '/accounting/subcontracting-statements/',
  });
  fireEvent.change(screen.getByLabelText('Yıl'), { target: { value: '1999' } });
  fireEvent.click(screen.getByRole('button', { name: 'Yükle' }));
  expect(await screen.findByText('Geçersiz yıl')).toBeInTheDocument();
  expect(exportCalls()).toHaveLength(0);
});

it('loads the month in the URL and shows a failed load in the status line', async () => {
  fetchMock.mockImplementation(() => json({ detail: 'Yetkiniz yok' }, 403));
  renderWithProviders(<SubcontractingStatementsPage />, {
    route: '/accounting/subcontracting-statements/?year=2025&month=3',
  });
  await waitFor(() =>
    expect(screen.getByTestId('status-text')).toHaveTextContent('HTTP 403 - Yetkiniz yok'),
  );
  expect(exportCalls()[0]!.searchParams.get('month')).toBe('3');
  expect(screen.getByLabelText('Yıl')).toHaveValue(2025);
});

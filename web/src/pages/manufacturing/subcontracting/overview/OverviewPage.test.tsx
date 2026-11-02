import { authedFetch } from '@legacy/authService.js';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import type { MonthlyReport } from '@/api/subcontracting/subcontractors';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { OverviewPage } from './OverviewPage';
import {
  buildLookup,
  buildTree,
  GROUPING_STORAGE_KEY,
  monthlyPerPerson,
  treeRows,
} from './overviewTree';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const xlsx = vi.hoisted(() => ({
  utils: {
    book_new: vi.fn(() => ({ sheets: [] as string[] })),
    aoa_to_sheet: vi.fn((rows: unknown[][]) => ({ rows })),
    book_append_sheet: vi.fn((book: { sheets: string[] }, _sheet: unknown, name: string) => {
      book.sheets.push(name);
    }),
  },
  writeFile: vi.fn(),
}));
vi.mock('xlsx', () => xlsx);

const fetchMock = vi.mocked(authedFetch);

const REPORT: MonthlyReport = {
  period: { start: null, end: null },
  subcontractors: [
    {
      id: 1,
      name: 'Kaya Kaynak Ltd',
      short_name: 'Kaya',
      avg_employee_count: '4.0',
      employee_count_months: 2,
    },
    { id: 2, name: 'Demir Montaj', short_name: null, is_active: false, avg_employee_count: null },
  ],
  kalems: [
    { key: 'celik', label: 'ÇELİK' },
    { key: '__adjustment__', label: 'Düzeltmeler' },
  ],
  statements: [
    { id: 31, subcontractor_id: 1, period: '2026-02', status: 'approved', employee_count: 4 },
    { id: 32, subcontractor_id: 1, period: '2026-03', status: 'draft', employee_count: 4 },
  ],
  facts: [
    {
      subcontractor_id: 1,
      period: '2026-02',
      kalem_key: 'celik',
      job_no: '240-01',
      job_title: 'Kazan',
      customer_name: 'Tüpraş',
      job_status: 'active',
      kind: 'billed',
      previous_progress: '0',
      current_progress: '50',
      allocated_weight_kg: '200',
      weight_kg: '100',
      price_per_kg: '50',
      amount: '5000',
      currency: 'TRY',
    },
    {
      subcontractor_id: 1,
      period: '2026-03',
      kalem_key: 'celik',
      job_no: '240-02',
      job_title: 'Silo',
      kind: 'pending',
      previous_progress: '0',
      current_progress: '25',
      allocated_weight_kg: '200',
      weight_kg: '50',
      amount: '2500',
      currency: 'TRY',
    },
    {
      subcontractor_id: 1,
      period: '2026-03',
      kalem_key: '__adjustment__',
      job_no: '240-02',
      job_title: 'Silo',
      kind: 'adjustment',
      adjustment_type: 'deduction',
      reason: 'Fire',
      amount: '-300',
      currency: 'TRY',
    },
  ],
  backlog: [
    {
      subcontractor_id: 1,
      kalem_key: 'celik',
      job_no: '240-01',
      allocated_weight_kg: '200',
      done_weight_kg: '100',
      remaining_weight_kg: '100',
      contract_amount: '10000',
      remaining_amount: '5000',
      currency: 'TRY',
    },
    {
      subcontractor_id: 2,
      kalem_key: 'celik',
      job_no: '250-01',
      allocated_weight_kg: '40',
      done_weight_kg: '0',
      remaining_weight_kg: '40',
      contract_amount: '2000',
      remaining_amount: '2000',
      currency: 'TRY',
    },
  ],
};

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}
const reportCalls = () =>
  fetchMock.mock.calls
    .map(([url]) => new URL(String(url)))
    .filter((u) => u.pathname === '/subcontracting/subcontractors/monthly-report/');

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/manufacturing/subcontracting/overview') {
  return renderWithProviders(
    <>
      <OverviewPage />
      <LocationProbe />
    </>,
    { route },
  );
}

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => json(REPORT));
  vi.spyOn(notify, 'error');
  xlsx.writeFile.mockClear();
});

const headers = () => [...document.querySelectorAll<HTMLElement>('tr[data-group-row="header"]')];
const visibleHeaders = () => headers().filter((tr) => !tr.dataset.groupId?.includes('~hidden'));
const header = (text: string) => visibleHeaders().find((tr) => tr.textContent?.includes(text))!;

it('shows the subcontractors with their period sums, the backlog and the figures', async () => {
  renderPage();
  await screen.findByText('Kaya');
  expect(reportCalls()[0]!.search).toBe('');
  const kaya = header('Kaya');
  expect(kaya).toHaveTextContent('2 ay');
  expect(kaya).toHaveTextContent('Kaya Kaynak Ltd');
  expect(kaya).toHaveTextContent('150 kg');
  expect(kaya).toHaveTextContent('5.000,00 ₺'); // faturalanan
  expect(kaya).toHaveTextContent('2.500,00 ₺'); // bekleyen
  expect(kaya).toHaveTextContent('-300,00 ₺');
  expect(kaya).toHaveTextContent('7.200,00 ₺'); // dönem toplamı
  // (5000 + 2200) ÷ (4 + 4) kişi-ay
  expect(kaya).toHaveTextContent('900,00 ₺');
  expect(kaya).toHaveTextContent('%50');

  // Remaining work only: a row with nothing to open.
  const demir = header('Demir Montaj');
  expect(demir).toHaveTextContent('Pasif');
  expect(demir).toHaveTextContent('40 kg');
  expect(demir.querySelector('[data-leafless]')).not.toBeNull();
  // Nothing to open: no toggle.
  expect(demir.querySelector('[aria-expanded]')).toBeNull();

  expect(screen.queryByText('Şubat 2026')).toBeNull();
  expect(screen.getByTestId('overview-total')).toHaveTextContent('Genel Toplam');
  expect(screen.getByTestId('overview-total')).toHaveTextContent('7.000,00 ₺'); // kalan tutar
  expect(document.getElementById('overview-total-subcontractors')).toHaveTextContent('2');
  expect(document.getElementById('overview-done-kg')).toHaveTextContent('150 kg');
  expect(screen.getByTestId('period-label')).toHaveTextContent('Tüm dönemler');
});

it('opens months and job orders, with the statement link and the per-person figures', async () => {
  renderPage();
  await screen.findByText('Kaya');
  fireEvent.click(header('Kaya'));
  const february = header('Şubat 2026');
  expect(february).toHaveTextContent('Onaylandı');
  expect(within(february).getByRole('link')).toHaveAttribute(
    'href',
    '/manufacturing/subcontracting/statements/?statement=31',
  );
  expect(february).toHaveTextContent('1.250,00 ₺'); // 5000 ÷ 4
  expect(header('Mart 2026')).toHaveTextContent('Taslak');

  fireEvent.click(header('Mart 2026'));
  expect(await screen.findByText('Fire')).toBeInTheDocument();
  expect(screen.getByText('Kesinti')).toBeInTheDocument();
  expect(screen.getAllByText('Bekleyen')).toHaveLength(2); // column + badge
  // Without a kalem level the job row names its kalem.
  expect(screen.getByText('ÇELİK')).toBeInTheDocument();
});

it('Tümünü Aç / Kapat and the grouping switch', async () => {
  renderPage();
  await screen.findByText('Kaya');
  fireEvent.click(screen.getByRole('button', { name: 'Tümünü Aç' }));
  expect(await screen.findByText('Kazan')).toBeInTheDocument();
  expect(screen.getAllByText('Silo')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Tümünü Kapat' }));
  await waitFor(() => expect(screen.queryByText('Kazan')).toBeNull());

  fireEvent.click(screen.getByText('Kalem › Taşeron › Ay'));
  expect(await screen.findByText('Düzeltmeler')).toBeInTheDocument();
  // Welding kalems first, adjustments last.
  expect(visibleHeaders().map((tr) => tr.dataset.depth)).toEqual(['0', '0']);
  expect(visibleHeaders()[0]).toHaveTextContent('ÇELİK');
  expect(visibleHeaders()[0]).toHaveTextContent('2 taşeron');
  expect(localStorage.getItem(GROUPING_STORAGE_KEY)).toBe('kalem-sub-month');
});

it('filters go to the request and the URL; a start after the end is refused', async () => {
  renderPage();
  await screen.findByText('Kaya');
  fireEvent.click(screen.getByRole('button', { name: 'Taşeron Durumu' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Aktif' }));
  await waitFor(() => expect(reportCalls().at(-1)!.searchParams.get('is_active')).toBe('true'));
  expect(screen.getByTestId('location')).toHaveTextContent('is_active=true');

  fireEvent.click(screen.getByRole('button', { name: 'İş Emri Durumu' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Aktif + Tamamlandı' }));
  await waitFor(() =>
    expect(reportCalls().at(-1)!.searchParams.get('job_status')).toBe('active,completed'),
  );
});

it('refuses a start month after the end month', async () => {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  renderPage(`/manufacturing/subcontracting/overview?end=${now.getFullYear() - 1}-01`);
  await screen.findByText('Kaya');
  expect(reportCalls()[0]!.searchParams.get('end')).toBe(`${now.getFullYear() - 1}-01`);
  const count = reportCalls().length;
  fireEvent.click(screen.getByRole('button', { name: /Başlangıç Ayı/ }));
  // Tümü, then the months newest first.
  fireEvent.click((await screen.findAllByRole('menuitem'))[1]!);
  expect(notify.error).toHaveBeenCalledWith('Başlangıç ayı bitiş ayından sonra olamaz.');
  expect(reportCalls()).toHaveLength(count);
  expect(screen.getByTestId('location')).not.toHaveTextContent(`start=${thisMonth}`);
});

it('exports the three sheets', async () => {
  renderPage();
  await screen.findByText('Kaya');
  fireEvent.click(screen.getByRole('button', { name: 'Dışa Aktar' }));
  await waitFor(() => expect(xlsx.writeFile).toHaveBeenCalled());
  const [book, name] = xlsx.writeFile.mock.calls[0]! as unknown as [{ sheets: string[] }, string];
  expect(name).toBe('taseron-aylik-is-raporu_tum-donemler.xlsx');
  expect(book.sheets).toEqual(['Aylık İş', 'Kalan İş', 'Kişi Başı']);
  const work = (xlsx.utils.aoa_to_sheet.mock.calls[0]![0] as unknown[][])!;
  expect(work).toHaveLength(4);
  expect(work[1]!.slice(0, 4)).toEqual(['Kaya', '2026-02', 'ÇELİK', '240-01']);
  expect(work[1]![7]).toBe('Faturalanan');
  expect(work[1]![14]).toBe(5000);
  const perPerson = xlsx.utils.aoa_to_sheet.mock.calls[2]![0] as unknown[][];
  expect(perPerson.at(-1)).toEqual(['Kaya', 'Aylık ortalama (2 ay)', '', 7200, 4, 900, 'TRY']);
});

describe('overviewTree', () => {
  it('a backlog-only node gets one hidden placeholder row; facts keep tree order', () => {
    const lookup = buildLookup(REPORT);
    const tree = buildTree(lookup, ['sub', 'kalem', 'month']);
    const rows = treeRows(tree);
    // Top-level subcontractors A–Z: Demir Montaj (backlog only) before Kaya.
    expect(rows.map((r) => r.kind)).toEqual(['placeholder', 'fact', 'fact', 'fact']);
    // Mart: the pending job before the adjustment (job no, then kind).
    const facts = rows
      .filter((r) => r.kind === 'fact')
      .map((r) => (r.kind === 'fact' ? r.fact.kind : ''));
    expect(facts).toEqual(['billed', 'pending', 'adjustment']);
    const placeholder = rows[0]!;
    expect(placeholder.path[0]).toBe('root/sub:2');
    expect(placeholder.path[1]).toBe('root/sub:2/kalem:celik');
    expect(placeholder.path[2]).toContain('~hidden');
  });

  it('per person leaves out months without a headcount', () => {
    const report = {
      ...REPORT,
      statements: [{ ...REPORT.statements[0]!, employee_count: null }, REPORT.statements[1]!],
    };
    const pp = monthlyPerPerson(buildLookup(report), new Set(['1']));
    expect(pp).toMatchObject({ total: 2200, personMonths: 4, months: 1, skipped: 1, value: 550 });
  });
});

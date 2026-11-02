import { authedFetch } from '@legacy/authService.js';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { LaborPricingPage } from './LaborPricingPage';
import { rowTint, THRESHOLD_KEY } from './laborPricingFormat';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const JOBS = [
  { job_no: '1000', title: 'Fabrika İşleri' },
  { job_no: '240-01', title: 'Kazan', customer_name: 'Tüpraş' },
  { job_no: '240-02', title: 'Silo', customer_name: null },
];

function line(jobNo: string, extra: Record<string, unknown> = {}) {
  return {
    job_no: jobNo,
    title: `Kalem ${jobNo}`,
    root_job_no: '240-01',
    root_title: 'Kazan',
    quantity: 2,
    weight_kg: '12.5',
    total_weight_kg: '25',
    sell_per_kg: '4.2',
    size_factor: '1.10',
    difficulty: '1.00',
    labor_per_kg: '0.80',
    labor_per_kg_try: '28.40',
    labor_per_piece_eur: '10',
    labor_total_eur: '20',
    line_margin_pct: '31.5',
    ...extra,
  };
}

function report(difficulty = '1.00') {
  return {
    params: { margin_pct: '30', alpha: '0.75' },
    totals: {
      line_count: 2,
      piece_count: 4,
      total_weight_kg: '50',
      total_price_eur: '210',
      revenue_per_kg: '4.2',
      material_per_kg: '1.5',
      general_per_kg: '0.7',
      profit_per_kg: '1.26',
      profit_eur: '63',
      labor_per_kg: '0.74',
      labor_per_kg_try: '26.3',
      kg_labor_per_kg: '0.74',
      support_eur: '0',
      labor_pool_eur: '37',
      labor_allocated_eur: '37',
      base_rate_k: '0.7',
      reference_weight_kg: '25',
      is_feasible: true,
      eur_try_rate: '35.5',
      fx_date: '2026-10-30',
    },
    lines: [line('240-01-1', { difficulty }), line('240-01-2', { labor_per_kg: '2.40' })],
    skipped: [{ job_no: '240-01-9' }],
  };
}

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

type Call = { url: URL; method: string; body: unknown };
function calls(): Call[] {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: new URL(String(url)),
    method: init?.method ?? 'GET',
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
  }));
}
const computeCalls = () =>
  calls().filter((c) => c.method === 'GET' && c.url.pathname === '/subcontracting/labor-pricing/');

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const u = new URL(String(url));
    if (u.pathname === '/projects/job-orders/dropdown/') return json(JOBS);
    if (u.pathname === '/subcontracting/labor-pricing/' && method === 'GET') {
      const difficulty = u.searchParams.get('difficulty');
      return json(report(difficulty ? difficulty.split(':')[1] : '1.00'));
    }
    if (u.pathname === '/subcontracting/labor-pricing/' && method === 'POST')
      return json({ saved: ['240-01', '240-02'], params: {} });
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
  vi.spyOn(notify, 'warning');
});

function cell(rowId: string, col: string): HTMLElement {
  const td = document.querySelector<HTMLElement>(
    `tr[data-row-id="${rowId}"] td[data-col="${col}"]`,
  );
  if (!td) throw new Error(`no cell ${rowId}/${col}`);
  return td;
}

async function pickJobs(...labels: string[]) {
  const input = screen.getByRole('combobox', { name: 'İş Emirleri' });
  for (const label of labels) {
    fireEvent.click(input);
    fireEvent.click(await screen.findByRole('option', { name: label, hidden: true }));
  }
}

async function calculate() {
  renderWithProviders(<LaborPricingPage />);
  await waitFor(() =>
    expect(calls().some((c) => c.url.pathname === '/projects/job-orders/dropdown/')).toBe(true),
  );
  await pickJobs('240-01 · Kazan · Tüpraş');
  fireEvent.click(screen.getByRole('button', { name: 'Hesapla' }));
  await screen.findByText('Kalem 240-01-1');
}

it('starts with the explainer, root job orders only and an empty table', async () => {
  renderWithProviders(<LaborPricingPage />);
  expect(screen.getByText('Nasıl Çalışır')).toBeInTheDocument();
  expect(screen.getByText('İş emri seçin ve Hesapla’ya basın')).toBeInTheDocument();
  await waitFor(() => expect(calls().length).toBeGreaterThan(0));
  const dropdown = calls().find((c) => c.url.pathname === '/projects/job-orders/dropdown/')!;
  expect(dropdown.url.searchParams.get('root_only')).toBe('true');
  expect(dropdown.url.searchParams.get('with_customer')).toBe('true');

  fireEvent.click(screen.getByRole('combobox', { name: 'İş Emirleri' }));
  expect(
    await screen.findByRole('option', { name: '240-02 · Silo', hidden: true }),
  ).toBeInTheDocument();
  // The synthetic "Fabrika İşleri" job is not priceable.
  expect(screen.queryByRole('option', { name: /^1000/, hidden: true })).toBeNull();
  expect(computeCalls()).toHaveLength(0);
});

it('Hesapla sends the selection, the knobs and the yevmiye, then shows the report grouped by root job', async () => {
  await calculate();
  const call = computeCalls()[0]!;
  expect(call.url.searchParams.getAll('job_no')).toEqual(['240-01']);
  expect(call.url.searchParams.get('material_rate')).toBe('1.50');
  expect(call.url.searchParams.get('general_rate')).toBe('0.70');
  expect(call.url.searchParams.get('margin_pct')).toBe('30');
  expect(call.url.searchParams.get('alpha')).toBe('0.75');
  expect(call.url.searchParams.get('factor_min')).toBe('0.70');
  expect(call.url.searchParams.get('factor_max')).toBe('2.00');
  expect(call.url.searchParams.get('support_days')).toBe('0');
  expect(call.url.searchParams.get('support_day_rate_try')).toBe('0');
  expect(call.url.searchParams.has('difficulty')).toBe(false);

  // Group header: root job, its title and the sums of its lines.
  const header = document.querySelector<HTMLElement>('tr[data-group-row="header"]')!;
  expect(header).toHaveTextContent('240-01');
  expect(header).toHaveTextContent('2 kalem');
  expect(header).toHaveTextContent('50 kg');
  expect(header).toHaveTextContent('40 € işçilik');

  expect(screen.getByText('Bir Kilogram Nereye Gidiyor')).toBeInTheDocument();
  expect(screen.getByText('0,740 €/kg')).toBeInTheDocument();
  expect(screen.getByText(/1 kalem hesaba katılmadı/)).toBeInTheDocument();
  expect(screen.getByTestId('fx-note')).toHaveTextContent('30.10.2026');
  expect(document.querySelector('tr[data-row-id="240-01-1"]')).toHaveTextContent('%31,5');
});

it('changed knobs and yevmiye go into the next calculation', async () => {
  await calculate();
  fireEvent.change(screen.getByRole('spinbutton', { name: /Hedef Kâr/ }), {
    target: { value: '25' },
  });
  fireEvent.change(screen.getByRole('spinbutton', { name: /Yevmiye \(gün\)/ }), {
    target: { value: '2' },
  });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Yevmiye Ücreti ₺' }), {
    target: { value: '3550' },
  });
  // 2 days × 3550 ₺ at the report's 35,5 rate.
  expect(screen.getByTestId('support-summary')).toHaveTextContent('= 18 saat · 7.100 ₺ ≈ 200 €');
  fireEvent.keyDown(screen.getByRole('spinbutton', { name: 'Yevmiye Ücreti ₺' }), { key: 'Enter' });
  await waitFor(() => expect(computeCalls()).toHaveLength(2));
  const call = computeCalls()[1]!;
  expect(call.url.searchParams.get('margin_pct')).toBe('25');
  expect(call.url.searchParams.get('support_days')).toBe('2');
  expect(call.url.searchParams.get('support_day_rate_try')).toBe('3550');
});

it('editing Zorluk recalculates with the override and keeps it', async () => {
  await calculate();
  fireEvent.click(cell('240-01-1', 'difficulty'));
  const input = screen.getByRole('textbox', { name: 'Zorluk' });
  fireEvent.change(input, { target: { value: '1,5' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => expect(computeCalls()).toHaveLength(2));
  expect(computeCalls()[1]!.url.searchParams.get('difficulty')).toBe('240-01-1:1.5');
  await waitFor(() => expect(cell('240-01-1', 'difficulty')).toHaveTextContent('1,50'));

  // Yenile keeps the override.
  fireEvent.click(screen.getByRole('button', { name: 'Yenile' }));
  await waitFor(() => expect(computeCalls()).toHaveLength(3));
  expect(computeCalls()[2]!.url.searchParams.get('difficulty')).toBe('240-01-1:1.5');
});

it('refuses a Zorluk above 5 without a request', async () => {
  await calculate();
  fireEvent.click(cell('240-01-1', 'difficulty'));
  const input = screen.getByRole('textbox', { name: 'Zorluk' });
  fireEvent.change(input, { target: { value: '6' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(computeCalls()).toHaveLength(1);
});

it('Sıfırla clears the selection and the report', async () => {
  await calculate();
  fireEvent.click(screen.getByRole('button', { name: 'Sıfırla' }));
  expect(await screen.findByText('Nasıl Çalışır')).toBeInTheDocument();
  expect(screen.getByText('İş emri seçin ve Hesapla’ya basın')).toBeInTheDocument();
  expect(screen.getByRole('spinbutton', { name: /Hedef Kâr/ })).toHaveValue(30);
});

it('Parametreleri Kaydet posts the knobs onto the jobs in the dropdown', async () => {
  renderWithProviders(<LaborPricingPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Parametreleri Kaydet' }));
  expect(notify.warning).toHaveBeenCalledWith('Önce iş emri seçin');
  await waitFor(() =>
    expect(calls().some((c) => c.url.pathname === '/projects/job-orders/dropdown/')).toBe(true),
  );

  await pickJobs('240-01 · Kazan · Tüpraş', '240-02 · Silo');
  fireEvent.click(screen.getByRole('button', { name: 'Parametreleri Kaydet' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('2 iş emrine kaydedildi'));
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.body).toEqual({
    job_no: ['240-01', '240-02'],
    material_rate: '1.50',
    general_rate: '0.70',
    margin_pct: '30',
    alpha: '0.75',
    factor_min: '0.70',
    factor_max: '2.00',
  });
});

it('tints rows by the rate thresholds and remembers them', async () => {
  await calculate();
  const row = (id: string) => document.querySelector<HTMLElement>(`tr[data-row-id="${id}"]`)!;
  expect(row('240-01-1').style.background).toContain('rgba(39, 107, 76');
  expect(row('240-01-2').style.background).toContain('rgba(176, 46, 46');

  fireEvent.change(screen.getByRole('spinbutton', { name: 'Kırmızı sınır, €/kg' }), {
    target: { value: '' },
  });
  await waitFor(() => expect(row('240-01-2').style.background).toBe(''));
  expect(JSON.parse(localStorage.getItem(THRESHOLD_KEY)!)).toEqual({ green: 1, red: null });
  expect(within(row('240-01-2')).getByText('2,400')).toBeInTheDocument();
});

it('rowTint: red wins where the limits overlap, and an empty rate is not tinted', () => {
  expect(rowTint('1.5', { green: 2, red: 1 })).toContain('176, 46, 46');
  expect(rowTint(null, { green: 1, red: 2 })).toBeNull();
  expect(rowTint('1.5', { green: null, red: null })).toBeNull();
});

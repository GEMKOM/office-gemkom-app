import { authedFetch } from '@legacy/authService.js';
import { ModalsProvider } from '@mantine/modals';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { EstimateReport } from './EstimateReport';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const DONE = {
  id: 7,
  version: 2,
  status: 'done',
  subject_key: '270-01',
  job_no: '270-01',
  created_at: '2026-10-20T09:00:00Z',
  created_by_name: 'Onat',
  usage_usd: 3.2,
  model: 'claude',
  review_decision: '',
  markdown: [
    '# Rapor',
    '## 1. Özet',
    '**En önemli 3 risk**',
    '- Bakır fiyatı',
    '## 2. Maliyet tablosu',
    'Maliyet girişi.',
    '## 3. Teklif önerisi',
    '- Önerilen fiyat: 100.000 € (toplam 100.000 €)',
    '## 4. Dikkat noktaları',
    '- Kaynak kalitesi <script>',
  ].join('\n'),
  cost_table: {
    found: true,
    routes: ['in_house'],
    expected_total: { in_house: 80000 },
    rows: [
      { key: 'material', label: 'Malzeme', in_house: { low: 10, expected: 20, high: 30 }, basis: 'BOM' },
      { key: 'total', label: 'TOPLAM', in_house: { low: 70000, expected: 80000, high: 90000 } },
    ],
  },
  versions: [
    { id: 5, version: 1, status: 'done', review_decision: 'accept' },
    { id: 7, version: 2, status: 'done', review_decision: '' },
  ],
  weld_schedule: {
    version: 1,
    joints: [{ joint_id: 'J1', description: 'Kollektör girişi', joint_type: 'pipe_butt', material: 'copper', count_per_unit: 4 }],
    totals: { joints_total: 4, weld_m_total: 1.2 },
    bottom_up: {},
  },
};

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

type Call = { path: string; method: string; body: unknown };
const calls = (): Call[] =>
  fetchMock.mock.calls.map(([url, init]) => ({
    path: new URL(String(url)).pathname,
    method: init?.method ?? 'GET',
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
  }));
const writes = () => calls().filter((c) => c.method !== 'GET');

function render(subject: Parameters<typeof EstimateReport>[0]['subject']) {
  return renderWithProviders(
    <ModalsProvider>
      <EstimateReport subject={subject} />
    </ModalsProvider>,
  );
}

let routes: Record<string, () => Promise<Response>>;

beforeEach(() => {
  localStorage.clear();
  routes = {};
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const u = new URL(String(url));
    const key = `${init?.method ?? 'GET'} ${u.pathname}`;
    const handler = routes[key];
    return handler ? handler() : json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'info');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('renders a finished report, escaped', async () => {
  routes['GET /estimator/estimates/7/'] = () => json(DONE);
  render({ reportId: 7 });
  const card = await screen.findByTestId('estimate-report');
  expect(await within(card).findByText('Tahmin raporu')).toBeInTheDocument();
  expect(within(card).getByRole('combobox', { name: 'Sürüm' })).toHaveValue('7');
  // The sections: the nav and the risk list.
  expect(card.querySelector('[data-est-nav]')).not.toBeNull();
  // (the report text section repeats it)
  expect(within(card).getAllByText('Bakır fiyatı').length).toBeGreaterThan(0);
  // Payload text is escaped, never markup.
  expect(card.querySelector('script')).toBeNull();
  expect(card.textContent).toContain('Kaynak kalitesi <script>');
  // Fixed report: a new version is created for its job order.
  expect(within(card).getByRole('button', { name: /Yenile/ })).toBeInTheDocument();
});

it('Kabul posts the review and updates the badge', async () => {
  routes['GET /estimator/estimates/7/'] = () => json(DONE);
  routes['POST /estimator/estimates/7/review/'] = () => json({ ...DONE, review_decision: 'accept', reviewed_by_name: 'Onat' });
  render({ reportId: 7 });
  const card = await screen.findByTestId('estimate-report');
  fireEvent.click(await within(card).findByRole('button', { name: /Kabul/ }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Tahmin kabul edildi.'));
  expect(writes()).toEqual([{ path: '/estimator/estimates/7/review/', method: 'POST', body: { decision: 'accept', note: '' } }]);
  expect(within(card).queryByRole('button', { name: /Kabul$/ })).toBeNull();
});

it('a section header collapses its section and the choice is remembered', async () => {
  routes['GET /estimator/estimates/7/'] = () => json(DONE);
  render({ reportId: 7 });
  const card = await screen.findByTestId('estimate-report');
  await within(card).findAllByText('Bakır fiyatı');
  const section = card.querySelector('section[data-sec="maliyet"]')!;
  expect(section.classList.contains('is-collapsed')).toBe(false);
  fireEvent.click(within(section as HTMLElement).getByRole('button', { name: /Maliyet tablosu/ }));
  expect(section.classList.contains('is-collapsed')).toBe(true);
  expect(JSON.parse(localStorage.getItem('estimateSectionsCollapsed')!)).toContain('maliyet');
});

it('the weld list opens as a table', async () => {
  routes['GET /estimator/estimates/7/'] = () => json(DONE);
  render({ reportId: 7 });
  const card = await screen.findByTestId('estimate-report');
  fireEvent.click(await within(card).findByRole('button', { name: 'Listeyi göster' }));
  expect(await within(card).findByText('Kollektör girişi', { selector: 'td' })).toBeInTheDocument();
  expect(localStorage.getItem('estimateWeldListOpen')).toBe('1');
});

it('a job order without a report offers Oluştur; a 409 shows the running one', async () => {
  routes['GET /estimator/estimates/latest/'] = () => json({ detail: 'yok' }, 404);
  routes['GET /estimator/weld-schedules/270-01/'] = () => json({ detail: 'yok' }, 404);
  routes['POST /estimator/estimates/'] = () => json({ detail: 'Çalışıyor', id: 9 }, 409);
  routes['GET /estimator/estimates/9/'] = () =>
    json({ id: 9, version: 3, status: 'running', job_no: '270-01', versions: [{ id: 9, version: 3, status: 'running' }] });
  render({ jobNo: '270-01' });
  expect(await screen.findByText('Henüz tahmin yok')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Kapsam' }), { target: { value: 'programme' } });
  fireEvent.click(screen.getAllByRole('button', { name: /Oluştur/ })[0]!);
  expect(await screen.findByText(/^Çalışıyor/, { selector: '.est-state-title' })).toBeInTheDocument();
  expect(writes()).toEqual([
    { path: '/estimator/estimates/', method: 'POST', body: { job_no: '270-01', scope: 'programme' } },
  ]);
  expect(screen.getByRole('button', { name: /Durdur/ })).toBeInTheDocument();
});

it('polls an open run every 5 s until it is done', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  let status = 'running';
  routes['GET /estimator/estimates/9/'] = () =>
    json({ id: 9, version: 3, status, job_no: '270-01', markdown: '## 1. Özet\nHazır.', versions: [{ id: 9, version: 3, status }] });
  render({ reportId: 9 });
  expect(await screen.findByText(/^Çalışıyor/, { selector: '.est-state-title' })).toBeInTheDocument();
  const gets = () => calls().filter((c) => c.path === '/estimator/estimates/9/').length;
  const before = gets();
  status = 'done';
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  await waitFor(() => expect(gets()).toBe(before + 1));
  expect((await screen.findAllByText('Hazır.')).length).toBeGreaterThan(0);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15000);
  });
  expect(gets()).toBe(before + 1);
});

it('a user without access sees nothing (403)', async () => {
  routes['GET /estimator/estimates/latest/'] = () => json({ detail: 'yetki yok' }, 403);
  const { container } = render({ jobNo: '270-01' });
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  await waitFor(() => expect(container.querySelector('[data-testid="estimate-report"]')).toBeNull());
});

it('Nasıl çalışır? opens the method section and loads its text; the route buttons switch the cost table', async () => {
  routes['GET /estimator/estimates/7/'] = () =>
    json({
      ...DONE,
      cost_table: { ...DONE.cost_table, routes: ['in_house', 'subcontract'], expected_total: { in_house: 80000, subcontract: 70000 } },
    });
  routes['GET /estimator/method/'] = () => json({ markdown: '## Yöntem\nBirim **süreler**.' });
  render({ reportId: 7 });
  const card = await screen.findByTestId('estimate-report');
  await within(card).findAllByText('Bakır fiyatı');
  const method = card.querySelector('section[data-sec="yontem"]')!;
  expect(method.classList.contains('is-collapsed')).toBe(true);
  fireEvent.click(card.querySelector('.est-help-link')!);
  expect(method.classList.contains('is-collapsed')).toBe(false);
  expect(await within(method as HTMLElement).findByText('süreler', { selector: 'strong' })).toBeInTheDocument();
  expect(card.querySelector('table.est-cost.is-compare')).toBeNull();
  fireEvent.click(within(card).getByRole('button', { name: /Karşılaştır/ }));
  expect(card.querySelector('table.est-cost.is-compare')).not.toBeNull();
});

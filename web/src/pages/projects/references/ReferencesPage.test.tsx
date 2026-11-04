import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { ReferencesPage } from './ReferencesPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));
vi.mock('@/shell/navigationStructure', () => ({ NAVIGATION_STRUCTURE: {} }));

const fetchMock = vi.mocked(authedFetch);

const ROWS = [
  {
    job_no: '250-03',
    job_status: 'completed',
    title: 'Kazan',
    customer: 'İzmir Enerji',
    family: 'shell',
    route: 'in_house',
    structure_class: 'sac_yapi',
    schema_version: 2,
    quantity: 2,
    unit_mass_kg: 9000,
    weld_m_total: 40,
    joints_total: 12,
    recorded_welding_h_per_unit: 300,
    shop_h_per_unit: 250,
    shop_in_house_h_per_unit: 250,
    factor: 1.2,
    weld_schedule_confidence: 0.62,
    review_status: 'unreviewed',
  },
  {
    job_no: '260-01',
    job_status: 'active',
    title: 'Panel',
    family: 'panel',
    route: 'subcontract',
    structure_class: 'boru_panel',
    schema_version: 1,
    factor: 0.4,
    in_house_exclusion: 'built by a subcontractor',
    review_status: 'excluded',
    review_note: 'taşeron',
  },
];
const SUMMARY = {
  counts: { total: 66, review_status: { verified: 3, unreviewed: 60, excluded: 3 }, schema_version: { '1': 20, '2': 46 } },
  jobs_used: ['250-03'],
  all: { n: 5, mean: 1.1, median: 1.05, p25: 0.9, p75: 1.3, min: 0.7, max: 1.6 },
  families: { shell: { n: 2, mean: 1.2, median: 1.2, p25: 1.1, p75: 1.3, min: 1, max: 1.4 } },
  machining: {},
};
const WELD = {
  version: 2,
  is_latest: true,
  unit_mass_kg: 9000,
  pieces_to_cut_per_unit: 10,
  bends_per_unit: 0,
  joints: [{ joint_id: 'J1', description: 'Gövde dikişi', joint_type: 'plate_butt', material: 'carbon_steel', process: 'MAG', count_per_unit: 2, length_m_each: 5, total_m_per_unit: 10 }],
  totals: { joints_total: 2, weld_m_total: 10 },
  bottom_up: { lines: [{ unit_h: 1.2, unit: 'h/m', hours: 12 }], non_welding_lines: [], welding_h: 12, non_welding_h: 0, total_h: 12 },
  version_history: [
    { version: 1, created_at: '2026-10-01T10:00:00Z' },
    { version: 2, created_at: '2026-10-19T10:00:00Z', edited: true, edited_by_name: 'Onat', edit_note: 'kep' },
  ],
};
const ARCHIVE = {
  count: 2,
  families: [{ family: 'ladle', label: 'Pota', n: 2, median_eur_per_kg_now: 3.2, reliability: { n: 2, median_error: 0.12, level: 'good' } }],
  results: [
    {
      id: 7, job_no: '026-42', product: '60T POTA', customer: 'HOD ASSAF', family: 'ladle', family_label: 'Pota', qty: 1,
      kg_each: 20936, kg_total: 20936, cost_month: '2024-06', date_source: 'pdm',
      then: { labour: 6000, material: 40000, overhead: 6000, total: 52000, eur_per_kg: 2.48 },
      now: { labour: 7000, material: 41000, overhead: 14000, total: 62000, eur_per_kg: 2.96, restated_to: '2026-11' },
      factors: { labour: 1.18, steel: 1.02 }, basis: 'components', sale_eur: null, flags: [], review: 'unreviewed',
      in_app: true, plan: { unit_mass_kg: 20936, joints: 40, weld_m: 300, total_h: 2500, shop_h: 2000, h_per_t: { shop: 95.5 } },
      plan_source: 'claude_code',
    },
    {
      id: 8, job_no: '026-35', product: '80T POTA', customer: 'HOD ASSAF', family: 'ladle', family_label: 'Pota', qty: 1,
      kg_each: 30000, kg_total: 30000, cost_month: '2021-02', date_source: 'pdm',
      then: { total: 900000, eur_per_kg: 30 }, now: { total: 1200000, eur_per_kg: 40, restated_to: '2026-11' },
      factors: {}, basis: 'total_only', sale_eur: null, flags: ['per_kg_outlier'], review: 'unreviewed', plan: null,
    },
  ],
};
const PARAMS = {
  parameters: [
    { key: 'mag_h_per_m', label: 'MAG', unit: 'h/m', group: 'weld', value: 1.2, default: 1.2, is_default: true },
    { key: 'tig_h_per_m', label: 'TIG', unit: 'h/m', group: 'weld', value: 2, default: 1.8, is_default: false },
  ],
  groups: { weld: 'Kaynak' },
  changes: [],
};

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

type Call = { path: string; method: string; body: unknown; search: string };
const calls = (): Call[] =>
  fetchMock.mock.calls.map(([url, init]) => {
    const u = new URL(String(url));
    return { path: u.pathname, search: u.search, method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined };
  });
const writes = () => calls().filter((c) => c.method !== 'GET');

function renderPage(route = '/projects/references/') {
  return renderWithProviders(
    <ModalsProvider>
      <ReferencesPage />
    </ModalsProvider>,
    { route },
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url)).pathname;
    if (path === '/estimator/reference-profiles/') return json({ count: 2, results: ROWS, families: ['shell', 'panel'] });
    if (path === '/estimator/reference-profiles/summary/') return json(SUMMARY);
    if (path === '/estimator/reference-profiles/250-03/review/') {
      const body = JSON.parse(String(init!.body)) as { review_status: string; note: string };
      return json({ ...ROWS[0], review_status: body.review_status, review_note: body.note });
    }
    if (path === '/estimator/weld-schedules/250-03/' && method === 'GET') return json(WELD);
    if (path === '/estimator/weld-schedules/250-03/versions/preview/') {
      return json({ bottom_up: { lines: [{ hours: 18 }], welding_h: 18, non_welding_h: 0, total_h: 18 } });
    }
    if (path === '/estimator/weld-schedules/250-03/versions/') {
      return json({ weld_schedule: { ...WELD, version: 3 }, profile: { ...ROWS[0], factor: 1.05 } });
    }
    if (path === '/estimator/cost-history/') return json(ARCHIVE);
    if (path === '/estimator/cost-history/7/review/') {
      const body = JSON.parse(String(init!.body)) as { review_status: string; note: string };
      return json({ id: 7, review_status: body.review_status, review_note: body.note });
    }
    if (path === '/estimator/parameters/' && method === 'GET') return json(PARAMS);
    if (path === '/estimator/parameters/' && method === 'PUT') return json({ ...PARAMS, changed: ['mag_h_per_m'] });
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('lists the references with the summary and the library count', async () => {
  renderPage();
  expect(await screen.findByText('250-03')).toBeInTheDocument();
  expect(screen.getByText('260-01')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByTestId('reference-count')).toHaveTextContent('66 referans'));
  // The per-family table replaces the card wall; it opens on demand.
  fireEvent.click(screen.getByRole('button', { name: /Göster/ }));
  const summary = screen.getByTestId('reference-summary');
  expect(within(summary).getByText(/Tüm aileler/)).toBeInTheDocument();
  expect(within(summary).getByText(/Gövde/)).toBeInTheDocument();
  // Usage is spelled out: the excluded job says why.
  const out = screen.getByText('260-01').closest('tr')!;
  expect(within(out).getByText('Kullanılmıyor')).toBeInTheDocument();
  expect(within(out).getByText(/Hariç tutuldu: taşeron/)).toBeInTheDocument();
  // An excluded factor is greyed with its reason in the tooltip.
  const excluded = screen.getByText('0,40').closest('span')!;
  expect(excluded.getAttribute('title')).toContain('Taşeronda yapılmış');
});

it('API filters are joined with commas; class filters on the page', async () => {
  renderPage('/projects/references/?route=in_house&route=subcontract&class=sac_yapi');
  expect(await screen.findByText('250-03')).toBeInTheDocument();
  expect(screen.queryByText('260-01')).toBeNull();
  const list = calls().find((c) => c.path === '/estimator/reference-profiles/')!;
  expect(new URLSearchParams(list.search).get('route')).toBe('in_house,subcontract');
  expect(screen.getByTestId('reference-count')).toHaveTextContent('1 / 66 referans');
});

it('Hariç tut needs a note; Doğrula saves the review', async () => {
  renderPage();
  const row = (await screen.findByText('250-03')).closest('tr')!;
  // Three actions for an unreviewed row: all inline.
  expect(within(row).queryByRole('button', { name: 'İncelemeyi geri al' })).toBeNull();
  fireEvent.click(within(row).getByRole('button', { name: 'Hariç tut' }));
  let dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Hariç tut' }));
  expect(await within(dialog).findByText('Hariç tutmak için not gerekli.')).toBeInTheDocument();
  expect(writes()).toHaveLength(0);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Vazgeç' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

  fireEvent.click(within(row).getByRole('button', { name: 'Doğrula' }));
  dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('İnceleme notu'), { target: { value: 'pafta 3' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Doğrula' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('250-03: Doğrulandı'));
  expect(writes()).toEqual([
    { path: '/estimator/reference-profiles/250-03/review/', search: '', method: 'POST', body: { review_status: 'verified', note: 'pafta 3' } },
  ]);
});

it('Düzenle: a count edit updates the totals and the preview; the note is required; save posts the next version', async () => {
  renderPage();
  fireEvent.click(await screen.findByText('Kazan'));
  const dialog = await screen.findByRole('dialog');
  expect(await within(dialog).findByText('Gövde dikişi')).toBeInTheDocument();
  expect(within(dialog).getByTestId('version-history')).toHaveTextContent('Elle');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Düzenle' }));
  const editor = await within(dialog).findByTestId('weld-editor');

  fireEvent.change(within(editor).getByLabelText('Adet'), { target: { value: '3' } });
  // count × length now: 3 × 5.
  expect(within(editor).getByText('15,00')).toBeInTheDocument();
  await waitFor(() => expect(within(editor).getByTestId('weld-totals')).toHaveTextContent('18,0 h/adet'));
  expect(calls().some((c) => c.path.endsWith('/versions/preview/'))).toBe(true);

  fireEvent.click(within(dialog).getByRole('button', { name: 'Yeni sürüm olarak kaydet' }));
  expect(await within(editor).findByText(/Neyi neden düzelttiğinizi yazın/)).toBeInTheDocument();
  expect(writes().filter((c) => c.path.endsWith('/versions/'))).toHaveLength(0);

  fireEvent.change(within(editor).getByLabelText('Düzeltme notu'), { target: { value: 'adet 2→3' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Yeni sürüm olarak kaydet' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('250-03: kaynak listesi v3 kaydedildi; faktör yeniden hesaplandı.'));
  const save = writes().find((c) => c.path.endsWith('/versions/'))!;
  expect(save.body).toMatchObject({
    base_version: 2,
    unit_mass_kg: 9000,
    pieces_per_unit: 10,
    note: 'adet 2→3',
    joints: [{ joint_id: 'J1', count_per_unit: 3, length_m_each: 5, total_m_per_unit: null }],
  });
});

it('Birim süreler: a changed value is counted and saved with the note', async () => {
  renderPage();
  await screen.findByText('250-03');
  fireEvent.click(screen.getByRole('tab', { name: 'Birim süreler' }));
  const panel = await screen.findByTestId('units-panel');
  fireEvent.change(within(panel).getByLabelText('MAG'), { target: { value: '1,4' } });
  expect(within(panel).getByTestId('units-dirty')).toHaveTextContent('1 değişiklik kaydedilmedi');
  fireEvent.change(within(panel).getByLabelText('Değişiklik notu'), { target: { value: 'kalibrasyon' } });
  fireEvent.click(within(panel).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('1 parametre kaydedildi; faktörler yeniden hesaplandı.'));
  expect(writes()).toEqual([
    { path: '/estimator/parameters/', search: '', method: 'PUT', body: { values: { mag_h_per_m: 1.4 }, note: 'kalibrasyon' } },
  ]);
});

it('Geçmiş maliyetler: the archive with family reliability; exclusion needs a note; review posts', async () => {
  renderPage('/projects/references/?tab=archive');
  expect(await screen.findByText('026-42')).toBeInTheDocument();
  expect(screen.getByText('026-35')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Göster/ }));
  const families = screen.getByTestId('archive-families');
  expect(within(families).getByText('Pota')).toBeInTheDocument();
  expect(within(families).getByText(/İyi · %12/)).toBeInTheDocument();
  // An outlier row says so; a row with a plan shows its shop h/t.
  expect(within(screen.getByText('026-35').closest('tr')!).getByText(/Aykırı/)).toBeInTheDocument();
  expect(within(screen.getByText('026-42').closest('tr')!).getByText(/96 h.t/)).toBeInTheDocument();

  fireEvent.click(screen.getByText('60T POTA'));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('çizimden okundu')).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Hariç tut' }));
  expect(await within(dialog).findByText('Hariç tutmak için not gerekli.')).toBeInTheDocument();
  expect(writes()).toHaveLength(0);
  fireEvent.change(within(dialog).getByLabelText('İnceleme notu'), { target: { value: 'kapsam farklı' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Hariç tut' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('026-42: Hariç tutuldu'));
  expect(writes()).toEqual([
    { path: '/estimator/cost-history/7/review/', search: '', method: 'POST', body: { review_status: 'excluded', note: 'kapsam farklı' } },
  ]);
});

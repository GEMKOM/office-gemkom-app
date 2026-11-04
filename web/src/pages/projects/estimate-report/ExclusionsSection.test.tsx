import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { ExclusionHistory, ExclusionNotesBadge } from '../references/costHistoryParts';
import { EstimateReport } from './EstimateReport';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const NOTE = {
  id: 3,
  category: 'scope',
  category_label: 'Kapsam farklı',
  reason: 'taşeron talaşlı dahil',
  report: 'OF-2026-0200 v1',
  by: 'Onat',
  at: '2026-11-01T09:00:00Z',
  reverted: false,
};

const REPORT = {
  id: 7,
  version: 2,
  status: 'done',
  subject_key: '270-01',
  job_no: '270-01',
  markdown: '## 1. Özet\nÖzet.\n## 3. Teklif önerisi\n- Önerilen fiyat: 100.000 €',
  cost_table: {
    found: true,
    routes: ['in_house'],
    expected_total: { in_house: 80000 },
    rows: [{ key: 'total', label: 'TOPLAM', in_house: { low: 70000, expected: 80000, high: 90000 } }],
    archive: {
      applied: true,
      widened: true,
      eur_per_kg: { low: 3, median: 3.4, high: 5 },
      band_eur: { low: 60000, median: 68000, high: 100000 },
      rows: [{ id: 11 }, { id: 12 }, { id: 13 }],
    },
  },
  hours: {
    calibration: { in_house: { factor_mean: 1.1, references_used: ['293-04', '275-11'] }, machining: { policy: 'drawing_analysis' } },
    references: {
      in_house: [
        { job_no: '293-04', factor: 1.5, structure_class: 'sac_yapi', similarity_to_target: 0.9, labor_eur_per_h: 7 },
        { job_no: '275-11', factor: 0.7, structure_class: 'sac_yapi', similarity_to_target: 0.8, labor_eur_per_h: 6 },
        {
          job_no: '114-12',
          factor: 2,
          structure_class: 'other',
          similarity_to_target: 0.5,
          exclusion_notes: [NOTE],
          exclusion_effect: 'down_weighted',
        },
      ],
    },
    historical_costs: {
      family: 'ladle',
      items: [
        { id: 11, job_no: '026-42', product: '60T POTA', now: { eur_per_kg: 3.4 }, same_customer: true, kg_each: 20000, cost_month: '2024-06' },
        { id: 12, job_no: '026-35', product: '80T POTA', now: { eur_per_kg: 3.0 }, design_distance: 0.2, kg_each: 30000 },
        { id: 13, job_no: '026-50', product: '70T POTA', now: { eur_per_kg: 5.0 }, design_distance: 0.9, kg_each: 25000 },
      ],
    },
  },
  adjustments: {},
  exclusion_categories: [
    { value: 'scope', label: 'Kapsam farklı' },
    { value: 'data_error', label: 'Veri hatası' },
  ],
  versions: [{ id: 7, version: 2, status: 'done' }],
};

const EXCLUDED = {
  ...REPORT,
  hours: { ...REPORT.hours, calibration: { ...REPORT.hours.calibration, in_house: { factor_mean: 0.7, references_used: ['275-11'] } } },
  adjustments: {
    excluded: {
      reference: {
        '293-04': { exclusion_id: 9, category: 'scope', category_label: 'Kapsam farklı', reason: 'montaj dahil', by: 'Vey Sel' },
      },
    },
    effects: {
      shop_factor: { before: { factor: 1.1 }, after: { factor: 0.7 } },
      stale_sections: [{ key: 'iscilik', label: '§2.2 İşçilik' }],
      labour_recomputable: true,
    },
  },
};

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const writes = () =>
  fetchMock.mock.calls
    .filter(([, init]) => (init?.method ?? 'GET') !== 'GET')
    .map(([url, init]) => ({ path: new URL(String(url)).pathname, body: JSON.parse(String(init?.body)) }));

let routes: Record<string, () => Promise<Response>>;

beforeEach(() => {
  localStorage.clear();
  routes = {};
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const handler = routes[`${init?.method ?? 'GET'} ${new URL(String(url)).pathname}`];
    return handler ? handler() : json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
});

afterEach(() => vi.restoreAllMocks());

function renderCard() {
  return renderWithProviders(
    <ModalsProvider>
      <EstimateReport subject={{ reportId: 7 }} />
    </ModalsProvider>,
  );
}

it('lists the references and archive rows with checkboxes and the archive contribution', async () => {
  routes['GET /estimator/estimates/7/'] = () => json(REPORT);
  renderCard();
  const card = await screen.findByTestId('estimate-report');
  const refs = await within(card).findByTestId('excl-references');
  expect(within(refs).getAllByRole('checkbox')).toHaveLength(3);
  expect(within(refs).getByRole('checkbox', { name: '293-04 raporda kullanılsın' })).toBeChecked();
  expect(within(refs).getAllByText('atölye faktörü')).toHaveLength(2);
  // an exclusion made on another report: its note and what it does
  expect(within(refs).getByText(/1 not · geri itilir/)).toBeInTheDocument();
  const arch = within(card).getByTestId('excl-archive');
  expect(within(arch).getAllByRole('checkbox')).toHaveLength(3);
  expect(within(card).getByTestId('excl-contribution').textContent).toContain('3,00–5,00 €/kg');
  expect(card.querySelector('section[data-sec="haric"]')).not.toBeNull();
  expect(within(card).queryByTestId('excl-banner')).toBeNull();
});

it('unchecking asks for a category and a reason, then shows the recomputed report', async () => {
  routes['GET /estimator/estimates/7/'] = () => json(REPORT);
  routes['POST /estimator/estimates/7/exclusions/'] = () => json(EXCLUDED);
  renderCard();
  const card = await screen.findByTestId('estimate-report');
  fireEvent.click(await within(card).findByRole('checkbox', { name: '293-04 raporda kullanılsın' }));
  const dialog = await screen.findByRole('dialog');
  // both are required
  fireEvent.click(within(dialog).getByRole('button', { name: /Hariç tut/ }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Gerekçe türünü seçin.');
  fireEvent.click(within(dialog).getByRole('radio', { name: 'Kapsam farklı' }));
  fireEvent.click(within(dialog).getByRole('button', { name: /Hariç tut/ }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Gerekçe yazın');
  expect(writes()).toEqual([]);
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Gerekçe' }), { target: { value: 'montaj dahil' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /Hariç tut/ }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Hariç tutuldu; rapor güncellendi.'));
  expect(writes()).toEqual([
    {
      path: '/estimator/estimates/7/exclusions/',
      body: { kind: 'reference', key: '293-04', excluded: true, category: 'scope', reason: 'montaj dahil' },
    },
  ]);
  // the card shows the saved report: the banner, the excluded row with its reason
  const banner = await within(card).findByTestId('excl-banner');
  expect(banner.textContent).toContain('293-04');
  expect(banner.textContent).toContain('faktör 1,10 → 0,70');
  expect(within(banner).getByRole('button', { name: '§2.2 İşçilik' })).toBeInTheDocument();
  const box = within(card).getByRole('checkbox', { name: '293-04 raporda kullanılsın' });
  expect(box).not.toBeChecked();
  expect(box.closest('tr')!.textContent).toContain('montaj dahil');
});

it('checking an excluded reference again re-includes it after a confirmation', async () => {
  routes['GET /estimator/estimates/7/'] = () => json(EXCLUDED);
  routes['POST /estimator/estimates/7/exclusions/'] = () => json(REPORT);
  renderCard();
  const card = await screen.findByTestId('estimate-report');
  fireEvent.click(await within(card).findByRole('checkbox', { name: '293-04 raporda kullanılsın' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Dahil et' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Yeniden dahil edildi; rapor güncellendi.'));
  expect(writes()).toEqual([{ path: '/estimator/estimates/7/exclusions/', body: { kind: 'reference', key: '293-04', excluded: false } }]);
  await waitFor(() => expect(within(card).queryByTestId('excl-banner')).toBeNull());
});

it('a report saved before the archive rows were stored says so', async () => {
  const hours: Record<string, unknown> = { ...REPORT.hours };
  delete hours.historical_costs;
  routes['GET /estimator/estimates/7/'] = () => json({ ...REPORT, hours, cost_table: { ...REPORT.cost_table, archive: undefined } });
  renderCard();
  const card = await screen.findByTestId('estimate-report');
  expect(await within(card).findByText(/geçmiş maliyet satırlarını kaydetmeden önce oluşturuldu/)).toBeInTheDocument();
  expect(within(card).queryByTestId('excl-archive')).toBeNull();
});

it('the Referanslar badge and history show the exclusions and their effect', () => {
  const reverted = { ...NOTE, id: 4, reason: 'yanlış', reverted: true, reverted_by: 'Onat' };
  const { container } = rtlRender(
    <>
      <ExclusionNotesBadge notes={[NOTE, reverted]} effect="down_weighted" />
      <ExclusionHistory notes={[NOTE, reverted]} effect="down_weighted" />
      <ExclusionNotesBadge notes={[reverted]} effect={null} />
    </>,
  );
  expect(screen.getByText(/1 rapor · geri itilir/)).toBeInTheDocument();
  const history = screen.getByTestId('exclusion-history');
  expect(history.textContent).toContain('taşeron talaşlı dahil');
  expect(history.textContent).toContain('OF-2026-0200 v1');
  expect(history.textContent).toContain('geri alındı (Onat)');
  expect(container.querySelectorAll('li')).toHaveLength(2);
});

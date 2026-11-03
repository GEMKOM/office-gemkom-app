import { expect, mockBackend, seedSession, test } from './fixtures';

// /projects/estimates/ (Tahminler) and the React estimate report (a finished
// report's sections: estimate-report/ReportSections.tsx).
// Contracts used here:
//   GET /estimator/estimates/?limit=500[&q&customer&status&reviewed]   {count, results}
//   GET /estimator/estimates/<id>/                                      the full report
//   GET /estimator/method/                                              {markdown}

const ROW = {
  id: 41,
  version: 2,
  status: 'done',
  subject_key: 'E2E-270-01',
  subject_kind: 'job',
  job_no: 'E2E-270-01',
  title: 'Basınçlı kazan',
  customer: 'E2E Enerji',
  expected_total_eur: { in_house: 82000, subcontract: 74000 },
  eur_per_kg: { in_house: 4.1, subcontract: 3.7 },
  suggested_price_eur: 98000,
  review_decision: '',
  usage_usd: '3.10',
  created_at: '2026-10-20T09:00:00Z',
  created_by_name: 'E2E Admin',
};

export const REPORT = {
  ...ROW,
  model: 'claude-opus',
  started_at: '2026-10-20T09:00:00Z',
  finished_at: '2026-10-20T09:11:00Z',
  markdown: [
    '# Tahmin raporu',
    '## 1. Özet',
    '| Parça | Adet | Birim kg | Toplam kg | Termin |',
    '|---|---|---|---|---|',
    '| Kazan gövdesi | 2 | 10.000 | 20.000 (BOM P1) | 12 hafta |',
    '',
    '**En önemli 3 risk**',
    '- Bakır fiyatı oynak [Teklif T-12]',
    '- Hidrotest süresi (§2.2)',
    '- Termin sıkışık',
    '## 2. Maliyet tablosu',
    'Maliyetler iki rota için hesaplandı.',
    '### 2.1 Malzeme',
    'Sac ve boru fiyatları güncel listeden.',
    '### 2.2 İşçilik',
    'Kaynak saatleri benzer işlerden kalibre edildi.',
    '## 3. Teklif önerisi',
    '- Önerilen fiyat: 49.000 €/adet (toplam 98.000 €; 4,90 €/kg)',
    '- Taban fiyat: 42.000 €/adet',
    '- Dayandığı rota: İç imalat. Atölye kapasitesi uygun.',
    '- Hedef marj: %16',
    '## 4. Dikkat noktaları',
    '### Kalite',
    '- PT ve hidrotest planlanmalı',
    '## 5. Teklif öncesi istenecekler',
    '- Güncel çizim seti',
  ].join('\n'),
  hours: { quantity: 2, expected_h_total: 1400, low_h_total: 1200, high_h_total: 1700, summary: {} },
  cost_table: {
    found: true,
    routes: ['in_house', 'subcontract'],
    expected_total: { in_house: 82000, subcontract: 74000 },
    eur_per_kg: { in_house: 4.1, subcontract: 3.7 },
    rows: [
      { key: 'material', label: 'Malzeme', in_house: { low: 30000, expected: 32000, high: 35000 }, subcontract: { low: 30000, expected: 32000, high: 35000 }, basis: 'BOM P1' },
      { key: 'labor', label: 'Atölye İşçiliği', in_house: { low: 28000, expected: 31000, high: 36000 }, subcontract: null, basis: '1.400 h × 22 €/h' },
      { key: 'subcontractor', label: 'Taşeron', in_house: null, subcontract: { low: 20000, expected: 23000, high: 27000 }, basis: 'benzer işler' },
      { key: 'general_expenses', label: 'Genel Giderler', in_house: { low: 18000, expected: 19000, high: 20000 }, subcontract: { low: 18000, expected: 19000, high: 20000 }, basis: '0,95 €/kg' },
      { key: 'total', label: 'TOPLAM', in_house: { low: 76000, expected: 82000, high: 91000 }, subcontract: { low: 68000, expected: 74000, high: 82000 } },
      { key: 'eur_per_kg', label: '€/kg', in_house: { low: 3.8, expected: 4.1, high: 4.55 }, subcontract: { low: 3.4, expected: 3.7, high: 4.1 } },
    ],
  },
  similar_jobs: [
    { job_no: '250-03', title: 'Kazan', similarity: 0.82, weight_kg: 18000, selling_price_eur: 90000, actual_total_cost_eur: 76000 },
  ],
  versions: [
    { id: 40, version: 1, status: 'done', review_decision: 'correct' },
    { id: 41, version: 2, status: 'done', review_decision: '' },
  ],
  weld_schedule: {
    version: 3,
    confidence: 0.62,
    unit_mass_kg: 10000,
    pieces_to_cut_per_unit: 120,
    bends_per_unit: 8,
    totals: { joints_total: 14, weld_m_total: 42.5, weld_m_by_material: { carbon_steel: 42.5 } },
    bottom_up: { total_h: 700, welding_h: 420, non_welding_h: 280 },
    joints: [
      { joint_id: 'J1', description: 'Gövde boyuna dikiş', joint_type: 'plate_butt', material: 'carbon_steel', size: 't=12', process: 'MAG', count_per_unit: 2, length_m_each: 6, total_m_per_unit: 12, ndt: 'RT' },
      { joint_id: 'J2', description: 'Nozul', joint_type: 'nozzle_coupling', material: 'carbon_steel', size: 'DN50', process: 'TIG_root_MAG_fill', count_per_unit: 12, length_m_each: 0.2, total_m_per_unit: 2.4, ndt: 'PT' },
    ],
  },
};

test('Tahminler: open a report, read its sections, open the weld list', async ({ page, consoleErrors }) => {
  const session = await seedSession(page, { admin: true });
  const backend = await mockBackend(
    page,
    {
      'GET /estimator/estimates/': { json: { count: 1, results: [ROW] } },
      'GET /estimator/estimates/41/': { json: REPORT },
      'GET /estimator/method/': { json: { markdown: '## Yöntem\n\nKaynak listesi çizimlerden çıkarılır.' } },
    },
    { session },
  );

  await page.goto('/projects/estimates/');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Tahminler' })).toBeVisible();
  const row = main.locator('tr').filter({ hasText: 'E2E-270-01' });
  await expect(row).toContainText('98.000');
  expect(backend.callsTo('/estimator/estimates/', 'GET')[0]!.query).toContain('limit=500');

  await row.click();
  await expect(page).toHaveURL(/\?report=41$/);
  const dialog = page.getByRole('dialog');
  const card = dialog.getByTestId('estimate-report');
  await expect(card.locator('.est-head-title')).toContainText('Tahmin raporu');
  // The report's sections, styled by EstimateReport.module.css.
  await expect(card.locator('[data-est-nav]')).toBeVisible();
  await expect(card.locator('.est-price-value')).toContainText('98.000 €');
  await expect(card.locator('section[data-sec="maliyet"] table.est-cost')).toBeVisible();

  // Karşılaştır swaps the cost table in place.
  await card.locator('.est-seg [data-route="compare"]').click();
  await expect(card.locator('table.est-cost.is-compare')).toBeVisible();

  // The weld list: a DataTable inside its section.
  await card.getByRole('button', { name: 'Listeyi göster' }).click();
  await expect(card.getByRole('cell', { name: 'Gövde boyuna dikiş' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/projects\/estimates\/$/);
  consoleErrors.expectNone();
});

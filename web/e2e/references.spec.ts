import { expect, mockBackend, seedSession, test } from './fixtures';

// /projects/references/ (Referanslar). Contracts used here:
//   GET  /estimator/reference-profiles/[?family&route&…]        {count, results, families}
//   GET  /estimator/reference-profiles/summary/                  factor distributions + counts
//   GET  /estimator/weld-schedules/<job>/[?version]              a job's weld list (+ version_history)
//   POST /estimator/weld-schedules/<job>/versions/preview/       hours of a draft, nothing saved
//   GET  /estimator/parameters/                                  unit times and cost parameters

export const PROFILE = {
  job_no: 'E2E-250-03',
  job_status: 'completed',
  title: 'Basınçlı kazan',
  customer: 'E2E Enerji',
  family: 'shell',
  route: 'in_house',
  structure_class: 'sac_yapi',
  schema_version: 2,
  quantity: 2,
  unit_mass_kg: 9000,
  weld_m_total: 40,
  weld_m_by_material: { carbon_steel: 40 },
  joints_total: 12,
  recorded_welding_h_per_unit: 300,
  recorded_welding_h_total: 600,
  hours_reliability: 'ok',
  shop_h_per_unit: 250,
  shop_in_house_h_per_unit: 250,
  total_h_per_unit: 280,
  work_centres: [{ key: 'shop', label: 'Kaynak atölyesi', hours: 250 }, { key: 'cnc', label: 'CNC kesim', hours: 30 }],
  factor: 1.2,
  weld_schedule_confidence: 0.62,
  weld_schedule_version: 2,
  review_status: 'unreviewed',
};

export const SUMMARY = {
  counts: { total: 66, review_status: { verified: 3, unreviewed: 60, excluded: 3 }, schema_version: { '1': 20, '2': 46 } },
  jobs_used: ['E2E-250-03'],
  all: { n: 5, mean: 1.1, median: 1.05, p25: 0.9, p75: 1.3, min: 0.7, max: 1.6 },
  families: { shell: { n: 2, mean: 1.2, median: 1.2, p25: 1.1, p75: 1.3, min: 1, max: 1.4 } },
  classes: { sac_yapi: { n: 3, mean: 1.15, median: 1.1, p25: 1, p75: 1.3, min: 0.9, max: 1.4 } },
  machining: {},
};

export const WELD = {
  version: 2,
  is_latest: true,
  confidence: 0.62,
  unit_mass_kg: 9000,
  pieces_to_cut_per_unit: 10,
  bends_per_unit: 0,
  mass_basis: 'BOM toplamı',
  joints: [
    { joint_id: 'J1', description: 'Gövde boyuna dikiş', joint_type: 'plate_butt', material: 'carbon_steel', process: 'MAG', size: 't=12', count_per_unit: 2, length_m_each: 5, total_m_per_unit: 10, ndt: 'RT' },
    { joint_id: 'J2', description: 'Nozul', joint_type: 'nozzle_coupling', material: 'carbon_steel', process: 'TIG_root_MAG_fill', count_per_unit: 4, length_m_each: 0.5, total_m_per_unit: 2 },
  ],
  totals: { joints_total: 6, weld_m_total: 12 },
  bottom_up: {
    lines: [{ unit_h: 1.2, unit: 'h/m', hours: 12 }, { unit_h: 1.5, unit: 'h/m', hours: 3 }],
    non_welding_lines: [{ step: 'cutting', qty: 10, unit: 'h/piece', unit_h: 0.5, hours: 5 }],
    welding_h: 15,
    non_welding_h: 5,
    total_h: 20,
  },
  version_history: [
    { version: 1, created_at: '2026-10-01T10:00:00Z', joints_total: 5, weld_m_total: 11, unit_mass_kg: 9000 },
    { version: 2, created_at: '2026-10-19T10:00:00Z', edited: true, edited_by_name: 'E2E Admin', based_on_version: 1, edit_note: 'kep sayısı', joints_total: 6, weld_m_total: 12, unit_mass_kg: 9000 },
  ],
};

export const PARAMS = {
  parameters: [
    { key: 'mag_h_per_m', label: 'MAG kaynak', unit: 'h/m', group: 'weld', value: 1.2, default: 1.2, is_default: true },
    { key: 'tig_h_per_m', label: 'TIG kaynak', unit: 'h/m', group: 'weld', value: 2, default: 1.8, is_default: false },
    { key: 'labor_eur_per_h', label: 'İşçilik ücreti', unit: '€/h', group: 'cost', value: 22, default: 22, is_default: true },
  ],
  groups: { weld: 'Kaynak', cost: 'Maliyet' },
  changes: [],
};

test('Referanslar: weld list, Düzenle with live hours, unit times', async ({ page, consoleErrors }) => {
  const session = await seedSession(page, { admin: true });
  const backend = await mockBackend(
    page,
    {
      'GET /estimator/reference-profiles/': { json: { count: 1, results: [PROFILE], families: ['shell'] } },
      'GET /estimator/reference-profiles/summary/': { json: SUMMARY },
      'GET /estimator/weld-schedules/E2E-250-03/': { json: WELD },
      'POST /estimator/weld-schedules/E2E-250-03/versions/preview/': {
        json: { bottom_up: { lines: [{ hours: 18 }, { hours: 3 }], welding_h: 21, non_welding_h: 5, total_h: 26 } },
      },
      'GET /estimator/parameters/': { json: PARAMS },
    },
    { session },
  );

  await page.goto('/projects/references/');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Referanslar' })).toBeVisible();
  await expect(main.getByTestId('reference-count')).toContainText('66 referans');
  // The factor table (one row per group) opens on demand and leads with the
  // all-families row: n, median and the middle half of SUMMARY.all.
  await main.getByRole('button', { name: /^Göster/ }).click();
  const allFamilies = main.getByTestId('reference-summary').getByRole('row', { name: /Tüm aileler/ });
  await expect(allFamilies).toContainText('1,05');
  await expect(allFamilies).toContainText('0,90–1,30');

  await main.locator('tr').filter({ hasText: 'E2E-250-03' }).getByText('Basınçlı kazan').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('cell', { name: /Gövde boyuna dikiş/ })).toBeVisible();
  await expect(dialog.getByTestId('version-history')).toContainText('Elle');

  await dialog.getByRole('button', { name: 'Düzenle' }).click();
  const editor = dialog.getByTestId('weld-editor');
  await editor.getByLabel('Adet', { exact: true }).first().fill('3');
  await expect(editor.locator('[data-cell="total"]').first()).toHaveText('15,00');
  await expect(editor.getByTestId('weld-totals')).toContainText('26,0 h/adet');
  expect(backend.callsTo('/estimator/weld-schedules/E2E-250-03/versions/preview/', 'POST').length).toBeGreaterThan(0);

  // Leaving with unsaved edits asks first.
  await dialog.getByRole('button', { name: 'Vazgeç' }).click();
  await page.getByRole('button', { name: 'Devam' }).click();
  await expect(dialog.getByRole('button', { name: 'Düzenle' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // Birim süreler is the third tab now (İş referansları, Geçmiş maliyetler, Birim süreler).
  await main.getByRole('tab', { name: 'Birim süreler' }).click();
  await expect(page).toHaveURL(/[?&]tab=units/);
  const units = main.getByTestId('units-panel');
  await units.getByLabel('MAG kaynak').fill('1,4');
  await expect(units.getByTestId('units-dirty')).toHaveText('1 değişiklik kaydedilmedi');
  consoleErrors.expectNone();
});

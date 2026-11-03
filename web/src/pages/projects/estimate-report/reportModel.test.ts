// Port of the legacy components/estimate-report/report-model.test.mjs: every case kept.
import {
  PROGRESS_CAP,
  exclusionLabel,
  fmt,
  hoursBreakdown,
  hoursInfo,
  isPlanBottomUp,
  labeledLine,
  mdBlocks,
  parsePrice,
  parseTrNumber,
  progressModel,
  remainingLabel,
  reportModel,
  routeOf,
  similarRow,
  splitMarkdown,
  tableRows,
  withoutFirstTable,
} from './reportModel';

it('fmt: Turkish grouping and decimals, dash when empty', () => {
  expect(fmt(1161600)).toBe('1.161.600');
  expect(fmt(2.2, 2)).toBe('2,20');
  expect(fmt(null)).toBe('—');
  expect(fmt('')).toBe('—');
  expect(fmt('abc')).toBe('—');
});

it('parseTrNumber: Turkish, plain and grouped numbers', () => {
  expect(parseTrNumber('1.161.600')).toBe(1161600);
  expect(parseTrNumber('2,20')).toBe(2.2);
  expect(parseTrNumber('%12,5')).toBe(12.5);
  expect(parseTrNumber('−3')).toBe(-3);
  expect(parseTrNumber('1.5')).toBe(1.5);
  expect(parseTrNumber(42)).toBe(42);
  expect(parseTrNumber('yok')).toBeNull();
  expect(parseTrNumber(null)).toBeNull();
});

it('splitMarkdown: title, preamble, numbered sections and sub-sections', () => {
  const md = splitMarkdown(
    [
      '# Tahmin raporu',
      'Not: taslak.',
      '## 1. Özet',
      'Kısa özet.',
      '## 2. Maliyet tablosu',
      'Giriş.',
      '### 2.1 Malzeme',
      'Sac.',
      '#### Ayrıntı',
      'derin',
      '### 2.2 İşçilik',
      'Saatler.',
      '## Ek bölüm',
      'serbest',
    ].join('\n'),
  );
  expect(md.title).toBe('Tahmin raporu');
  expect(md.preamble).toBe('Not: taslak.');
  expect(md.sections.map((s) => [s.num, s.title])).toEqual([
    ['1', 'Özet'],
    ['2', 'Maliyet tablosu'],
    [null, 'Ek bölüm'],
  ]);
  expect(md.sections[1]!.subs.map((s) => s.num)).toEqual(['2.1', '2.2']);
  // A level-4 heading stays inside its sub-section.
  expect(md.sections[1]!.subs[0]!.body).toMatch(/#### Ayrıntı\nderin/);
});

it('mdBlocks / tableRows / withoutFirstTable', () => {
  const body = 'Önce\n| A | B |\n|---|---|\n| **1** | 2 |\nSonra\n| X |\n| y |';
  expect(mdBlocks(body).map((b) => b.type)).toEqual(['text', 'table', 'text', 'table']);
  expect(tableRows('| A | B |\n|---|---|\n| **1** | 2 |')).toEqual([
    ['A', 'B'],
    ['1', '2'],
  ]);
  expect(withoutFirstTable(body)).toBe('Önce\n\nSonra\n\n| X |\n| y |');
});

it('labeledLine: text after the label, bullets and bold removed', () => {
  expect(labeledLine('- **Önerilen fiyat:** 193.600 €/adet', /önerilen fiyat/i)).toBe('193.600 €/adet');
  expect(labeledLine('başka satır', /önerilen fiyat/i)).toBeNull();
});

it('parsePrice: per unit, total and €/kg; the missing one computed from the quantity', () => {
  const full = parsePrice('Önerilen fiyat: 193.600 €/adet (toplam 1.161.600 €; 3,21 €/kg)', /önerilen fiyat/i, 6)!;
  expect(full.perUnit).toBe(193600);
  expect(full.total).toBe(1161600);
  expect(full.perKg).toBe(3.21);
  expect(full.computed).toBeNull();

  const perUnitOnly = parsePrice('Önerilen fiyat: 10.000 €/adet', /önerilen fiyat/i, 3)!;
  expect(perUnitOnly.total).toBe(30000);
  expect(perUnitOnly.computed).toBe('total');

  const totalOnly = parsePrice('Önerilen fiyat: 30.000 €', /önerilen fiyat/i, 3)!;
  expect(totalOnly.perUnit).toBe(10000);
  expect(totalOnly.computed).toBe('perUnit');

  expect(parsePrice('Önerilen fiyat: belirlenmedi', /önerilen fiyat/i, 3)).toBeNull();
});

it('routeOf: the first sentence decides the route', () => {
  expect(routeOf('Taşeron (karma). Benzer işler iç imalatta.')).toEqual({ key: 'subcontract', label: 'Taşeron (karma)' });
  expect(routeOf('Şirket içi; taşeron alternatif')!.key).toBe('in_house');
  expect(routeOf('Rota: iç imalat')!.key).toBe('in_house');
  expect(routeOf('Belirsiz')!.key).toBeNull();
  expect(routeOf('')).toBeNull();
});

const REPORT = {
  markdown: [
    '# Rapor',
    '## 1. Özet',
    '| Parça | Adet | Birim kg | Toplam kg |',
    '|---|---|---|---|',
    '| Kazan | 2 | 1.000 | 2.000 (BOM P1) |',
    '**En önemli 3 risk**',
    '- Bakır fiyatı',
    '- Termin',
    '',
    'Genel değerlendirme.',
    '## 2. Maliyet tablosu',
    '### 2.1 Malzeme',
    'Sac',
    '### 2.2 İşçilik',
    'Saat',
    '## 3. Teklif önerisi',
    '- Önerilen fiyat: 50.000 €/adet',
    '- Taban fiyat: 40.000 €/adet',
    '- Dayandığı rota: Taşeron. Gerekçe.',
    '- Hedef marj: %15',
    '## 4. Dikkat noktaları',
    '- Kaynak',
    '## 5. Teklif öncesi istenecekler',
    '- Çizim',
    '## 6. Ek notlar',
    'Serbest.',
  ].join('\n'),
  hours: { summary: { summary_row: { Parça: 'Kazan', Adet: '2', 'Birim kg': '1.000', 'Toplam kg': '2.000 (BOM P1)' } } },
  cost_table: { found: true, routes: ['in_house', 'subcontract'], expected_total: { in_house: 90000, subcontract: 80000 } },
};

it('reportModel: quantities, prices, route, margin, risks and sections from the markdown', () => {
  const m = reportModel(REPORT);
  expect(m.quantity).toBe(2);
  expect(m.unitKg).toBe(1000);
  expect(m.totalKg).toBe(2000);
  expect(m.totalKgBasis).toBe('BOM P1');
  expect(m.part).toBe('Kazan');
  expect(m.price!.perUnit).toBe(50000);
  expect(m.price!.total).toBe(100000);
  expect(m.price!.perKg).toBe(50);
  expect(m.floor!.total).toBe(80000);
  expect(m.basis!.key).toBe('subcontract');
  expect(m.targetMargin).toBe('%15');
  expect(m.margin).toBe((100000 - 80000) / 100000);
  expect(m.risks).toMatch(/Bakır fiyatı\n- Termin/);
  expect(m.summaryRest).toMatch(/Genel değerlendirme/);
  expect(m.sections.malzeme!.title).toBe('Malzeme');
  expect(m.sections.iscilik!.title).toBe('İşçilik');
  expect(m.extra.map((s) => s.num)).toEqual(['6']);
  expect(m.routes).toEqual(['in_house', 'subcontract']);
});

it("reportModel: the backend's figures win over the text", () => {
  const m = reportModel({
    ...REPORT,
    hours: {
      ...REPORT.hours,
      summary: { ...REPORT.hours.summary, suggested_price_eur: 120000, suggested_eur_per_kg: 60, basis_route: 'in_house', margin_pct: 25 },
    },
  });
  expect(m.price!.total).toBe(120000);
  expect(m.price!.perUnit).toBe(60000);
  expect(m.price!.perKg).toBe(60);
  expect(m.basis!.key).toBe('in_house');
  expect(m.margin).toBe(0.25);
});

it('reportModel: an empty payload does not throw', () => {
  const m = reportModel(null);
  expect(m.price).toBeNull();
  expect(m.routes).toEqual([]);
  expect(m.extra).toEqual([]);
});

it('hoursInfo / isPlanBottomUp', () => {
  expect(isPlanBottomUp({ work_centres: [] })).toBe(true);
  expect(isPlanBottomUp({ method: 'geometry_v4' })).toBe(false);
  const info = hoursInfo({ method: 'geometry_v4', calibration: { in_house: { no_reference: true } } });
  expect(info).toEqual({ plan: false, geometry: true, noInHouseRef: true, noMachRef: false });
});

it('hoursBreakdown: welding grouped by joint type × material, averaged when unit times differ', () => {
  const b = hoursBreakdown({
    lines: [
      { joint_type: 'pipe_butt', material: 'copper', qty: 2, hours: 4, unit_h: 2 },
      { joint_type: 'pipe_butt', material: 'copper', qty: 2, hours: 2, unit_h: 1 },
      { joint_type: 'plate_fillet', material: 'carbon_steel', qty: 1, hours: 1, unit_h: 1 },
    ],
    non_welding_lines: [
      { step: 'cutting', hours: 3 },
      { step: 'hydrotest', hours: 0, applies: false },
    ],
    total_h: 10,
    welding_h: 7,
    non_welding_h: 3,
  });
  expect(b.plan).toBe(false);
  expect(b.welding.length).toBe(2);
  expect(b.welding[0]!.hours).toBe(6);
  expect(b.welding[0]!.averaged).toBe(true);
  expect(b.welding[0]!.unit_h).toBe(1.5);
  expect(b.other.map((l) => [l.label, l.applies])).toEqual([
    ['Kesim', true],
    ['Hidrotest', false],
  ]);
  expect(b.total).toBe(10);
});

it('exclusionLabel: known reasons, the subcontracted share, unknown kept', () => {
  expect(exclusionLabel('no recorded hours')).toBe('Kayıtlı saat yok');
  expect(exclusionLabel('unreliable: 4 h')).toBe('Güvenilmez saat kaydı (≤ 10 h)');
  expect(exclusionLabel('mostly subcontracted (72 %)')).toBe("Kilosunun %72'i taşeronda kaynaklanmış");
  expect(exclusionLabel('mostly subcontracted', { subcontracted_kg_share: 0.6 })).toBe("Kilosunun %60'i taşeronda kaynaklanmış");
  expect(exclusionLabel('something else')).toBe('something else');
  expect(exclusionLabel('')).toBe('');
});

it('similarRow: €/kg and margin of a reference job', () => {
  const row = similarRow({ weight_kg: 1000, selling_price_eur: 5000, actual_total_cost_eur: 4000 });
  expect(row.sell_per_kg).toBe(5);
  expect(row.margin).toBe(0.2);
  expect(similarRow({ weight_kg: 0 }).sell_per_kg).toBeNull();
});

it('progressModel: fill, remaining time and steps; capped below 100 %', () => {
  const start = Date.parse('2026-11-02T10:00:00Z');
  const progress = {
    stage_index: 1,
    detail: 'sayfa 3/10',
    stages: [
      { key: 'a', label: 'Çizimler', expected_s: 60 },
      { key: 'b', label: 'Kaynak listesi', expected_s: 120, started_at: '2026-11-02T10:00:00Z' },
      { key: 'c', label: 'Rapor', expected_s: 60 },
    ],
  };
  const m = progressModel(progress, start + 60_000)!;
  expect(m.fraction).toBe((60 + 60) / 240);
  expect(m.remainingS).toBe(60 + 60);
  expect(m.overdue).toBe(false);
  expect(m.steps.map((s) => s.state)).toEqual(['done', 'current', 'pending']);
  expect(m.steps[1]!.detail).toBe('sayfa 3/10');
  expect(remainingLabel(m)).toBe('~2 dk kaldı');

  // A slow stage waits at its boundary; the bar never reaches 100 %.
  const late = progressModel(
    { ...progress, stage_index: 2, stages: progress.stages.map((s) => ({ ...s, started_at: '2026-11-02T10:00:00Z' })) },
    start + 3_600_000,
  )!;
  expect(late.fraction).toBe(PROGRESS_CAP);
  expect(late.overdue).toBe(true);
  expect(remainingLabel(late)).toBe('biraz daha sürüyor');

  expect(progressModel(null)).toBeNull();
  expect(progressModel({ stages: [] })).toBeNull();
  expect(remainingLabel(null)).toBe('');
});

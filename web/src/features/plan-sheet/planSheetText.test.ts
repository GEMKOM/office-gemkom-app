// Ported from projects/project-tracking/planSheetText.test.mjs.
import {
  barState,
  causeSentence,
  deviationChip,
  fmtDateTr,
  fmtWd,
  groupRows,
  headerSummary,
  isDefaultDuration,
  planSourceLabel,
  progressText,
  rootCauseLabel,
  signedFigure,
  summaryChips,
} from './planSheetText';
import { setSheetLang, taskTitle } from './sheetLang';
import type { PlanSheet } from './types';

afterEach(() => setSheetLang('tr'));

it('formats dates and working days', () => {
  expect(fmtDateTr('2026-10-15')).toBe('15.10.2026');
  expect(fmtDateTr(null)).toBe('—');
  expect(fmtWd(12)).toBe('12 iş günü');
  expect(fmtWd(-2.5)).toBe('2,5 iş günü');
});

it('builds deviation chips', () => {
  expect(deviationChip({ deviation_wd: 8, own_deviation_wd: 8, chain_deviation_wd: 0 })).toEqual({
    text: '+8',
    cls: 'ps-chip-late',
    kind: 'own',
  });
  expect(deviationChip({ deviation_wd: 8, own_deviation_wd: 0, chain_deviation_wd: 8 })).toEqual({
    text: '+8 zincir',
    cls: 'ps-chip-chain',
    kind: 'chain',
  });
  expect(deviationChip({ deviation_wd: 11, own_deviation_wd: 3, chain_deviation_wd: 8 })).toEqual({
    text: '+11 (3 kendi)',
    cls: 'ps-chip-late',
    kind: 'own',
  });
  expect(deviationChip({ deviation_wd: -2, own_deviation_wd: -2, chain_deviation_wd: 0 })).toEqual({
    text: '−2',
    cls: 'ps-chip-early',
    kind: 'early',
  });
  expect(deviationChip({ deviation_wd: 0, own_deviation_wd: 0, chain_deviation_wd: 0 })).toEqual({
    text: '0',
    cls: 'ps-chip-ok',
    kind: 'ontime',
  });
  expect(deviationChip({ deviation_wd: null }).text).toBe('plan yok');
  expect(deviationChip({ dead: true }).text).toBe('');
});

it('names bar states and plan sources', () => {
  expect(barState({ done: true })).toBe('done');
  expect(barState({ deviation_wd: 3 })).toBe('late');
  expect(barState({ deviation_wd: 0 })).toBe('on-time');
  expect(barState({ deviation_wd: 0 }, { status: 'on_hold' })).toBe('hold');
  expect(planSourceLabel({ plan_source: 'chain', duration_source: 'default' })).toBe(
    'önceki görevin bitişinden · varsayılan süre',
  );
  expect(planSourceLabel({ plan_source: 'imalat_split', duration_source: 'share' })).toBe(
    'İmalat planından (ağırlık payı)',
  );
  expect(isDefaultDuration({ duration_source: 'default' })).toBe(true);
  expect(isDefaultDuration({ duration_source: 'entered' })).toBe(false);
});

it('writes cause sentences', () => {
  expect(
    causeSentence({
      cause: { code: 'material', what: 'boru/profil', pending: 3, unordered: 1, until: '2026-10-02', overdue: false },
    }),
  ).toBe('boru/profil bekleniyor: 3 kalem (1 sipariş verilmemiş), tahmini teslim 02.10.2026.');
  expect(
    causeSentence({
      cause: { code: 'material', what: 'plaka', pending: 2, unordered: 0, until: '2026-09-10', overdue: true },
    }),
  ).toBe('plaka bekleniyor: 2 kalem, tahmini teslim 10.09.2026, söz verilen tarih geçti.');
  expect(causeSentence({ cause: { code: 'ncr_open', count: 2 } })).toBe('2 açık NCR tamamlamayı engelliyor.');
  expect(causeSentence({ cause: { code: 'cnc_plan', plan_end: '2026-09-24', unplanned_cuts: 1 } })).toBe(
    'Kesim planı 24.09.2026 tarihinde bitiyor (1 kesim planlanmamış).',
  );
  expect(causeSentence({ cause: { code: 'not_started', late_start_wd: 4 } })).toBe(
    'Plan başlangıcı 4 iş günü önce geçti, başlanmadı.',
  );
  expect(causeSentence({ cause: { code: 'progress', progress: 38, expected: 55 } })).toBe(
    'İlerleme %38, plana göre %55 olmalıydı.',
  );
  expect(causeSentence({ cause: { code: 'finished_late' }, own_deviation_wd: 5 })).toBe('5 iş günü geç bitti.');
  expect(causeSentence({ cause: { code: 'revision_hold' } })).toBe('İş emri çizim revizyonunda bekliyor.');
  expect(causeSentence({ cause: { code: 'progress', progress: 5, expected: 20, via: 'SERHAN USTA' } })).toBe(
    'SERHAN USTA: İlerleme %5, plana göre %20 olmalıydı.',
  );
  expect(causeSentence({ cause: null, chain_deviation_wd: 8, pushed_by_title: 'Üretim' })).toBe(
    'Üretim geç bitiyor (+8 iş günü zincir).',
  );
  expect(
    causeSentence({
      cause: { code: 'progress', progress: 10, expected: 30 },
      own_deviation_wd: 2,
      chain_deviation_wd: 5,
      pushed_by_title: 'Satın Alma',
    }),
  ).toBe('İlerleme %10, plana göre %30 olmalıydı. Satın Alma geç bitiyor (+5 iş günü zincir).');
  expect(causeSentence({ cause: null })).toBe('');
});

it('summarises the header', () => {
  const sheet: PlanSheet = {
    plan_end: '2026-10-31',
    projected_end: '2026-11-18',
    deviation_wd: 12,
    termin: '2026-10-15',
    termin_gap_wd: 24,
    plan_vs_termin_wd: 12,
    root_cause: {
      title: 'Üretim',
      job_no: '293-15',
      own_deviation_wd: 8,
      cause: { code: 'material', what: 'boru/profil', pending: 3, unordered: 0, until: '2026-10-02' },
    },
  };
  const h = headerSummary(sheet);
  expect(h.theme).toBe('red');
  expect(
    h.planLine.startsWith(
      'Plana göre +12 iş günü geride: plan bitişi 31.10.2026, öngörülen 18.11.2026. Nedeni: Üretim (293-15) — boru/profil bekleniyor',
    ),
  ).toBe(true);
  expect(h.terminLine).toBe(
    'Termin 15.10.2026: öngörülen bitiş termini 24 iş günü aşar (planın kendisi termini 12 iş günü aşıyor).',
  );
  const ok = headerSummary({
    plan_end: '2026-10-10',
    projected_end: '2026-10-10',
    deviation_wd: 0,
    termin: '2026-10-15',
    termin_gap_wd: -3,
  });
  expect(ok.theme).toBe('green');
  expect(ok.planLine).toBe('Plana uygun: bitiş 10.10.2026.');
  expect(ok.terminLine).toBe('Termin 15.10.2026: öngörülen bitiş terminden 3 iş günü önce.');
  expect(headerSummary({ plan_end: null }).planLine).toBe('Plan yok: hiçbir görevde tarih ya da süre girilmemiş.');
  expect(
    headerSummary({ plan_end: '2026-10-10', projected_end: '2026-10-10', deviation_wd: 0, termin: null }).terminLine,
  ).toBe('Termin girilmemiş.');
});

it('builds figures, progress text and groups', () => {
  expect(signedFigure(12)).toEqual({ text: '+12 iş günü', cls: 'ps-fig-late' });
  expect(signedFigure(-3)).toEqual({ text: '-3 iş günü', cls: 'ps-fig-early' });
  expect(signedFigure(0)).toEqual({ text: 'tam plan', cls: 'ps-fig-ok' });
  expect(signedFigure(null)).toEqual({ text: '—', cls: '' });
  expect(progressText({ progress_pct: 38, expected_pct: 55 })).toBe('%38 / %55');
  expect(progressText({ progress_pct: 100, expected_pct: 100, done: true })).toBe('%100');
  // Skipped work carries 100 % so it does not drag a roll-up down, but it
  // was never done — printing the number read as "Tamamlandı".
  expect(progressText({ progress_pct: 100, expected_pct: 40, done: true, dead: true })).toBe('—');
  expect(progressText({ progress_pct: 0, expected_pct: 40, done: false, dead: true })).toBe('—');
  const groups = groupRows({
    nodes: [
      { job_no: 'A', depth: 0 },
      { job_no: 'B', depth: 0 },
    ],
    rows: [
      { key: '1', job_no: 'B', depth: 0, title: 'x' },
      { key: '2', job_no: 'A', depth: 0, title: 'y' },
    ],
  });
  expect(groups.map((g) => [g.node.job_no, g.rows.length])).toEqual([
    ['A', 1],
    ['B', 1],
  ]);
});

it('keeps the house tone: no exclamation marks', () => {
  const samples = [
    causeSentence({ cause: { code: 'ncr_open', count: 1 } }),
    headerSummary({
      plan_end: '2026-10-10',
      projected_end: '2026-10-20',
      deviation_wd: 6,
      termin: '2026-10-15',
      termin_gap_wd: 3,
    }).planLine,
  ];
  for (const s of samples) expect(s).not.toContain('!');
});

it('names a root cause by its own row, not its department', () => {
  // 061-60: the headline said "Üretim" — the department shared by Talaşlı
  // İmalat, Kaynaklı İmalat, Boya and every assignment.
  expect(rootCauseLabel({ kind: 'phase', title: 'Talaşlı İmalat', department_display: 'Üretim' })).toBe(
    'Talaşlı İmalat',
  );
  expect(rootCauseLabel({ kind: 'block', title: 'ERK MAKİNE', department_display: 'Üretim' })).toBe('ERK MAKİNE');
  // A MAIN's title is the product name, so there the department says more.
  expect(rootCauseLabel({ kind: 'main', title: 'LF ROOF', department_display: 'Üretim' })).toBe('Üretim');
  expect(rootCauseLabel(null)).toBe('');
});

it('writes everything in English on an English sheet', () => {
  setSheetLang('en');
  expect(fmtWd(12)).toBe('12 working days');
  expect(fmtWd(1)).toBe('1 working day');
  expect(progressText({ progress_pct: 38, expected_pct: 55 })).toBe('38% / 55%');
  expect(deviationChip({ deviation_wd: 19, own_deviation_wd: 8, chain_deviation_wd: 11 }).text).toBe('+19 (8 own)');
  expect(deviationChip({ deviation_wd: 9, own_deviation_wd: 0, chain_deviation_wd: 9 }).text).toBe('+9 chain');
  expect(causeSentence({ cause: { code: 'progress', progress: 99, expected: 100 } })).toBe(
    'Progress 99%; the plan expected 100% by now.',
  );
  expect(causeSentence({ cause: { code: 'material', what: 'boru/profil', pending: 3 } })).toBe(
    'waiting for pipe/profile: 3 items.',
  );
  expect(causeSentence({ pushed_by_title: 'Dizayn', chain_deviation_wd: 11 })).toBe(
    'Design finishing late (+11 working days, chained).',
  );
  expect(
    rootCauseLabel({ kind: 'main', title: 'LF ROOF', department: 'manufacturing', department_display: 'Üretim' }),
  ).toBe('Manufacturing');
  expect(rootCauseLabel({ kind: 'block', title: 'ERK MAKİNE' })).toBe('ERK MAKİNE');
  expect(taskTitle('CNC Kesim')).toBe('CNC Cutting');
  expect(taskTitle('Talaşlı İmalat')).toBe('Machining');
  setSheetLang('tr');
  expect(fmtWd(12)).toBe('12 iş günü');
});

describe('summaryChips', () => {
  it('does not call a job nobody planned on plan', () => {
    // 096-22: ten live rows, not one entered date.
    const chips = summaryChips({
      rows: 10,
      late_rows: 0,
      own_late_rows: 0,
      chain_only_rows: 0,
      default_duration_rows: 0,
      unplanned_rows: 10,
    });
    expect(chips).toHaveLength(1);
    expect(chips[0]!.text).toBe('10 görevde plan yok');
    expect(chips.some((c) => c.cls === 'ps-chip-ok')).toBe(false);
  });

  it('still gives the all-clear when everything is planned', () => {
    const chips = summaryChips({ rows: 10, late_rows: 0, unplanned_rows: 0 });
    expect(chips).toHaveLength(1);
    expect(chips[0]!.cls).toBe('ps-chip-ok');
  });

  it('reports both the late rows and the gap when partly planned', () => {
    const chips = summaryChips({ rows: 12, late_rows: 3, own_late_rows: 2, chain_only_rows: 1, unplanned_rows: 4 });
    expect(chips.map((c) => c.text)).toEqual([
      '3 görev planın gerisinde',
      '2 kendi',
      '1 zincir',
      '4 görevde plan yok',
    ]);
  });
});

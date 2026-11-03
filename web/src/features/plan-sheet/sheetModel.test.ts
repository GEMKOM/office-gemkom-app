import { applyCellEdit, headerValues, normalizeCellValue, sheetWithHeader } from './editing';
import { SHEET } from './fixtures.test-data';
import { PRINT_W, printLayout } from './printFit';
import { setSheetLang } from './sheetLang';
import {
  applyRowOverrides,
  buildSheetRows,
  columnsWidth,
  domainBar,
  rowBar,
  sheetColumns,
  visibleSheetRows,
} from './sheetRows';
import { createWorkdayCalendar, workingDayDelta } from './workdays';

const calendar = createWorkdayCalendar(SHEET.holidays);

afterEach(() => setSheetLang('tr'));

describe('buildSheetRows', () => {
  it('puts a group row per job and its tasks beneath', () => {
    const rows = buildSheetRows(SHEET);
    expect(rows.map((r) => r.key)).toEqual([
      'job-009-37',
      'task:1',
      'task:2',
      'task:3',
      'job-009-37-01',
      'task:4',
      'task:5',
    ]);
    const [job, design, mfg] = rows;
    expect(job).toMatchObject({ kind: 'group', title: '009-37', job_title: 'Kazan Gövdesi', job_target_delta_wd: 25 });
    expect(job!.cause).toBe('Dizayn: İlerleme %20, plana göre %60 olmalıydı.');
    // A main's title says more than the job's own only when it differs.
    expect(design!.title).toBe('Dizayn · KAZAN');
    expect(mfg!.title).toBe('Üretim');
    expect(mfg!.cause).toBe('Dizayn geç bitiyor (+13 iş günü zincir).');
  });

  it('folds a collapsed job with every sub-job under it', () => {
    const collapsed = new Set(['job-009-37']);
    const rows = buildSheetRows(SHEET, collapsed);
    expect(rows.map((r) => r.key)).toEqual(['job-009-37', 'task:1', 'task:2', 'task:3']);
    expect(visibleSheetRows(rows, collapsed).map((r) => r.key)).toEqual(['job-009-37']);
  });

  it('keeps the department tasks only for a customer view', () => {
    const rows = buildSheetRows(SHEET, new Set(), { mainOnly: true });
    expect(rows.map((r) => r.key)).not.toContain('task:3');
  });

  it('names columns in the sheet language and sizes the table from them', () => {
    expect(columnsWidth(sheetColumns())).toBe(1116);
    expect(sheetColumns(['cause']).map((c) => c.field)).toEqual(['title', 'cause']);
    setSheetLang('en');
    expect(sheetColumns(['cause']).map((c) => c.label)).toEqual(['Task', 'Reason']);
    expect(buildSheetRows(SHEET)[1]!.title).toBe('Design · KAZAN');
  });
});

describe('bars', () => {
  const rows = buildSheetRows(SHEET);
  const byKey = (key: string) => rows.find((r) => r.key === key)!;

  it('draws the plan window, coloured by the schedule state', () => {
    expect(rowBar(byKey('task:1'))).toMatchObject({ start: '2026-06-01', end: '2026-07-15', state: 'late' });
    expect(rowBar(byKey('task:3'))).toMatchObject({ state: 'on-time' });
    expect(rowBar(byKey('job-009-37'))).toMatchObject({ state: 'late', progress: 38 });
  });

  it('draws nothing for skipped work and the forecast for an unplanned row', () => {
    expect(rowBar(byKey('task:4'))).toBeNull();
    expect(rowBar(byKey('task:5'))).toMatchObject({ start: '2026-09-01', end: '2026-09-10', state: 'projected' });
  });

  it('widens the domain to the projected end', () => {
    expect(domainBar(byKey('task:1'))).toMatchObject({ end: '2026-07-22' });
  });

  it('lets an edited status or deviation decide the colour', () => {
    const [edited] = applyRowOverrides([byKey('task:1')], { 'task:1': { deviation: 0 } });
    expect(rowBar(edited!)).toMatchObject({ state: 'on-time' });
  });
});

describe('editable links', () => {
  const rows = applyRowOverrides(buildSheetRows(SHEET), {});
  const design = rows.find((r) => r.key === 'task:1')!;

  it('stores an edit and drops it when the computed value is written back', () => {
    const once = applyCellEdit({}, design, 'progress', '150', calendar);
    expect(once).toEqual({ 'task:1': { progress: 100 } });
    expect(applyCellEdit(once, design, 'progress', '20', calendar)).toEqual({});
  });

  it('moves a task length with its plan dates', () => {
    const next = applyCellEdit({}, design, 'plan_end', '2026-06-05', calendar);
    expect(next).toEqual({ 'task:1': { plan_end: '2026-06-05', plan_wd: 5 } });
  });

  it('refuses a number field that is not a number', () => {
    expect(() => normalizeCellValue('deviation', 'abc')).toThrow('Geçerli bir sayı girin.');
    expect(normalizeCellValue('cause', '')).toBeNull();
  });

  it('lays header edits over the sheet and recomputes the pills from the dates', () => {
    const shown = sheetWithHeader(SHEET, { termin: '2026-10-16', title: 'Yeni ad' }, calendar);
    expect(shown.job_order?.title).toBe('Yeni ad');
    expect(shown.plan_vs_termin_wd).toBe(0);
    expect(shown.termin_gap_wd).toBe(workingDayDelta(calendar, '2026-10-16', '2026-11-04'));
    expect(shown.nodes![0]!.termin).toBe('2026-10-16');
    expect(shown.nodes![1]!.termin).toBeNull();
    expect(headerValues(SHEET).start).toBe('2026-03-12T09:00:00Z');
  });

  it('keeps a typed pill over the recomputed one', () => {
    const shown = sheetWithHeader(SHEET, { termin: '2026-10-16', plan_vs_termin_wd: 4 }, calendar);
    expect(shown.plan_vs_termin_wd).toBe(4);
  });
});

describe('workdays', () => {
  it('counts working days the backend way', () => {
    // 2026-08-28 is a Friday; the weekend and the 30th (a holiday) do not count.
    expect(calendar.workingDaysInclusive('2026-08-28', '2026-08-31')).toBe(2);
    expect(workingDayDelta(calendar, '2026-08-28', '2026-08-31')).toBe(1);
    expect(workingDayDelta(calendar, '2026-08-31', '2026-08-28')).toBe(-1);
    expect(calendar.isNonWorkingDay('2026-08-29')).toBe(true);
  });
});

describe('printLayout', () => {
  const rows = buildSheetRows(SHEET);
  const today = new Date(2026, 8, 1);

  it('zooms the page down when the table leaves no readable lane', () => {
    const layout = printLayout(rows, 'week', 1116, today);
    expect(layout.scale).toBeLessThan(1);
    expect(layout.gridWidth).toBe(1118);
    expect(layout.hostWidth).toBe(Math.floor(PRINT_W / layout.scale));
  });

  it('keeps the screen scale when its columns fit, and only ever goes coarser', () => {
    const narrow = printLayout(rows, 'week', 220, today);
    expect(narrow.scale).toBe(1);
    expect(narrow.zoom).toBe('week');
    expect(printLayout(rows, 'day', 220, today).zoom).not.toBe('day');
    expect(printLayout(rows, 'month', 220, today).zoom).toBe('month');
  });
});

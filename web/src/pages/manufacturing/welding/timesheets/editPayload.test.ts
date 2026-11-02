import { buildSubmissionEdits, CELL_COUNT, padCells, type SourceRow } from './editPayload';
import { hoursFor, rangesText } from './timesheetCells';

// Ported from the legacy editPayload.test.mjs.

const weekday: SourceRow[] = [
  { key: 'pre-0', kind: 'preprinted', job_no: '270-01' },
  { key: 'gen', kind: 'general', job_no: '1000' },
  { key: 'blank-0', kind: 'blank', job_no: '195-02' },
];

describe('buildSubmissionEdits', () => {
  it('sends rows, not jobs — otherwise Kaydet silently drops hour edits', () => {
    const body = buildSubmissionEdits({ jobs: [{ job_no: '270-01', cells: [true, true] }], sourceRows: weekday });
    expect('jobs' in body).toBe(false);
    expect(Array.isArray(body.rows)).toBe(true);
    expect(body.blank_day).toBe(false);
  });

  it('keeps the original key so a keyed PATCH updates the same line', () => {
    const cells = padCells([true, true, true]);
    const body = buildSubmissionEdits({ jobs: [{ job_no: '270-01', cells }], sourceRows: weekday });
    expect(body.rows).toHaveLength(3);
    expect(body.rows[0]).toEqual({ key: 'pre-0', cells });
  });

  it('sends job_no only for blank (or new) rows, matching the previous editor', () => {
    const body = buildSubmissionEdits({
      jobs: [
        { job_no: '270-01', cells: [true] },
        { job_no: '195-02', cells: [false, true] },
      ],
      sourceRows: weekday,
    });
    expect(body.rows.find((row) => row.key === 'blank-0')!.job_no).toBe('195-02');
    expect('job_no' in body.rows.find((row) => row.key === 'pre-0')!).toBe(false);
  });

  it('a newly added job reuses an unused blank-row key when the sheet has one', () => {
    const cells = padCells([true]);
    const body = buildSubmissionEdits({ jobs: [{ job_no: '280-03', cells }], sourceRows: weekday });
    expect(body.rows.find((row) => row.job_no === '280-03')).toEqual({ key: 'blank-0', job_no: '280-03', cells });
  });

  it('a newly added job is sent as job_no + cells when there is no blank slot (no invented key)', () => {
    const cells = padCells([true]);
    const body = buildSubmissionEdits({
      jobs: [{ job_no: '280-03', cells }],
      sourceRows: [{ key: 'pre-0', kind: 'preprinted', job_no: '270-01' }],
    });
    const added = body.rows.find((row) => row.job_no === '280-03')!;
    expect(added).toEqual({ job_no: '280-03', cells });
    expect('key' in added).toBe(false);
  });

  it('dropped jobs emit a cleared row so leftover hours are not approved', () => {
    const body = buildSubmissionEdits({ jobs: [{ job_no: '270-01', cells: [true] }], sourceRows: weekday });
    const cleared = body.rows.filter((row) => !row.cells.some(Boolean));
    expect(cleared.map((row) => row.key).sort()).toEqual(['blank-0', 'gen']);
    expect(cleared.find((row) => row.key === 'blank-0')!.job_no).toBe('');
    expect('job_no' in cleared.find((row) => row.key === 'gen')!).toBe(false);
  });

  it('blank day matches the phone submit: empty rows, blank_day true', () => {
    const body = buildSubmissionEdits({
      blankDay: true,
      note: 'izin',
      jobs: [{ job_no: '270-01', cells: [true] }],
      sourceRows: weekday,
    });
    expect(body).toEqual({ blank_day: true, note: 'izin', rows: [] });
  });

  it('jobs with no marked cells are omitted from the active set', () => {
    const body = buildSubmissionEdits({
      jobs: [
        { job_no: '270-01', cells: [false, false] },
        { job_no: '1000', cells: [true] },
      ],
      sourceRows: weekday,
    });
    expect(body.rows.some((row) => row.key === 'pre-0' && row.cells.some(Boolean))).toBe(false);
    expect(body.rows.find((row) => row.key === 'gen')!.cells[0]).toBe(true);
  });

  it('pads cells to the timesheet layout length', () => {
    const body = buildSubmissionEdits({ jobs: [{ job_no: '270-01', cells: [true] }], sourceRows: weekday });
    expect(body.rows[0]!.cells).toHaveLength(CELL_COUNT);
    expect(body.rows[0]!.cells[0]).toBe(true);
    expect(body.rows[0]!.cells[1]).toBe(false);
  });

  it("prefers the job's own key when the editor still has it", () => {
    const cells = padCells([true]);
    const body = buildSubmissionEdits({
      jobs: [{ key: 'blank-0', kind: 'blank', job_no: '195-02', cells }],
      sourceRows: weekday,
    });
    expect(body.rows[0]).toEqual({ key: 'blank-0', cells, job_no: '195-02' });
  });
});

describe('cell arithmetic', () => {
  const cells = (indexes: number[]) => padCells([], 14).map((_, i) => indexes.includes(i));

  it('splits the ranges at the lunch gap', () => {
    expect(rangesText(cells([0, 1, 2, 3, 4, 5, 6]))).toBe('07:30–12:00, 12:30–14:00');
    expect(rangesText(cells([]))).toBe('');
  });

  it('buckets hours by the kind of day', () => {
    expect(hoursFor(cells([0, 1, 10]), 'weekday')).toEqual({ regular: 1.5, after_hours: 1 });
    expect(hoursFor(cells([0, 1]), 'saturday')).toEqual({ after_hours: 1.5 });
    expect(hoursFor(cells([4, 5]), 'half_holiday')).toEqual({ regular: 1, holiday: 0.5 });
    expect(hoursFor(cells([1]), 'sunday')).toEqual({ holiday: 1 });
  });
});

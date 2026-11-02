/**
 * PATCH body for /welding/timesheets/submissions/{id}/ (port of editPayload.js).
 *
 * The submissions API (and the welder's /mobile/submit/) take `rows`; an
 * earlier editor sent `jobs`, which the server ignored while still answering
 * 200, so Onayla booked the unedited hours.
 *
 * Original row `key`s are kept so a keyed PATCH updates the same lines, and a
 * cleared row goes out for every source key the editor dropped, so those
 * hours do not stay on the submission.
 */

export const CELL_COUNT = 15;

export function padCells(cells: readonly unknown[] | null | undefined, length = CELL_COUNT): boolean[] {
  return Array.from({ length }, (_, i) => !!(cells && cells[i]));
}

export interface SourceRow {
  key?: string;
  kind?: string;
  job_no?: string;
}

export interface DraftJob {
  key?: string;
  kind?: string;
  job_no?: string;
  cells?: readonly boolean[];
}

export interface SubmissionDraft {
  blankDay?: boolean;
  note?: string;
  jobs?: readonly DraftJob[];
  sourceRows?: readonly SourceRow[];
  cellCount?: number;
}

export interface SubmissionRowEdit {
  key?: string;
  job_no?: string;
  cells: boolean[];
}

export interface SubmissionEdits {
  blank_day: boolean;
  note: string;
  rows: SubmissionRowEdit[];
}

function sourceForJob(job: DraftJob, sourceRows: readonly SourceRow[], usedKeys: Set<string>): SourceRow | undefined {
  if (job.key && !usedKeys.has(job.key)) {
    return sourceRows.find((row) => row.key === job.key) || { key: job.key, kind: job.kind };
  }
  return sourceRows.find(
    (row) => row.job_no && String(row.job_no) === String(job.job_no) && row.key && !usedKeys.has(row.key),
  );
}

export function buildSubmissionEdits(draft: SubmissionDraft = {}): SubmissionEdits {
  const cellCount = draft.cellCount || CELL_COUNT;
  const note = draft.note || '';
  if (draft.blankDay) return { blank_day: true, note, rows: [] };

  const sourceRows = draft.sourceRows || [];
  const usedKeys = new Set<string>();
  const rows: SubmissionRowEdit[] = [];

  for (const job of draft.jobs || []) {
    if (!job.job_no || !(job.cells || []).some(Boolean)) continue;
    const source = sourceForJob(job, sourceRows, usedKeys);
    const item: SubmissionRowEdit = { cells: padCells(job.cells, cellCount) };
    if (source && source.key) {
      item.key = source.key;
      usedKeys.add(source.key);
      if (source.kind === 'blank' || !source.kind) item.job_no = job.job_no;
    } else {
      item.job_no = job.job_no;
      const blank = sourceRows.find((row) => row.kind === 'blank' && row.key && !usedKeys.has(row.key));
      if (blank?.key) {
        item.key = blank.key;
        usedKeys.add(blank.key);
      }
    }
    rows.push(item);
  }

  for (const source of sourceRows) {
    if (!source.key || usedKeys.has(source.key)) continue;
    const item: SubmissionRowEdit = { key: source.key, cells: padCells([], cellCount) };
    if (source.kind === 'blank') item.job_no = '';
    rows.push(item);
  }

  return { blank_day: false, note, rows };
}

import { SHEET_COLUMN_LABELS, SHEET_FIELDS } from '@/features/plan-sheet';

// What Sunum Modu reads from the plan sheet module besides its components:
// the share dialog's column picker (Turkish labels, Görev first and fixed).

export const SHEET_COLUMNS = SHEET_FIELDS.map((field) => ({ field, label: SHEET_COLUMN_LABELS[field] }));

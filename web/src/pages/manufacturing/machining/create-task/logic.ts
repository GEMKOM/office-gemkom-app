import type { MachiningTaskInput } from '@/api/manufacturing/machiningTasks';
import type { QueryParams } from '@/api/client';

// The rules of manufacturing/machining/create-task/createTask.js.

export interface DraftRow {
  id: string;
  name: string;
  job_no: string;
  image_no: string;
  position_no: string;
  quantity: string;
  finish_time: string;
  description: string;
}

export type DraftField = Exclude<keyof DraftRow, 'id'>;

export const DRAFT_COLUMNS: { key: DraftField; label: string; required: boolean }[] = [
  { key: 'name', label: 'Ad', required: true },
  { key: 'job_no', label: 'İş No', required: true },
  { key: 'image_no', label: 'Resim No', required: false },
  { key: 'position_no', label: 'Pozisyon No', required: false },
  { key: 'quantity', label: 'Adet', required: true },
  { key: 'finish_time', label: 'Bitiş Tarihi', required: true },
  { key: 'description', label: 'Açıklama', required: false },
];

let nextId = 0;

export function emptyRow(): DraftRow {
  return {
    id: `draft-${++nextId}`,
    name: '',
    job_no: '',
    image_no: '',
    position_no: '',
    quantity: '',
    finish_time: '',
    description: '',
  };
}

export function duplicateRow(row: DraftRow): DraftRow {
  return { ...row, id: `draft-${++nextId}` };
}

/**
 * Legacy handleBulkCreateSave's two checks, in order: every required field,
 * then a positive Adet. Returns the messages of the first check that fails.
 */
export function validateRows(
  rows: readonly DraftRow[],
): { title: string; messages: string[] } | null {
  const missing: string[] = [];
  rows.forEach((row, index) => {
    for (const col of DRAFT_COLUMNS) {
      if (col.required && !String(row[col.key] ?? '').trim())
        missing.push(`Satır ${index + 1}: ${col.label}`);
    }
  });
  if (missing.length)
    return { title: 'Lütfen aşağıdaki zorunlu alanları doldurun:', messages: missing };
  const invalid: string[] = [];
  rows.forEach((row, index) => {
    if (row.quantity && Number.parseInt(row.quantity, 10) <= 0) {
      invalid.push(`Satır ${index + 1}: Adet 0'dan büyük olmalıdır`);
    }
  });
  if (invalid.length) return { title: 'Lütfen aşağıdaki hataları düzeltin:', messages: invalid };
  return null;
}

export function toPayload(rows: readonly DraftRow[]): MachiningTaskInput[] {
  return rows.map((row) => ({
    name: row.name,
    job_no: row.job_no,
    image_no: row.image_no || null,
    position_no: row.position_no || null,
    quantity: row.quantity ? Number.parseInt(row.quantity, 10) : null,
    finish_time: row.finish_time,
    description: row.description || null,
  }));
}

export const FILTER_DEFAULTS = {
  key: '',
  name: '',
  job_no: '',
  image_no: '',
  position_no: '',
  finish_time: '',
  finish_time__gte: '',
  finish_time__lte: '',
  has_timer: false,
  exceeded_estimated_hours: false,
  page: '1',
  page_size: '20',
};

export type TaskFilters = typeof FILTER_DEFAULTS;

/** Legacy buildTaskQuery: the creator's own tasks, the filters, page and ordering. */
export function taskQuery(
  values: TaskFilters,
  userId: number | undefined,
  sort: { sortBy: string; sortDir: 'asc' | 'desc' },
): QueryParams {
  let key = values.key.trim();
  // A bare number is a TI number.
  if (/^\d+$/.test(key)) key = `TI-${key}`;
  return {
    created_by: userId,
    key,
    name: values.name.trim(),
    job_no: values.job_no.trim(),
    image_no: values.image_no.trim(),
    position_no: values.position_no.trim(),
    finish_time: values.finish_time,
    finish_time__gte: values.finish_time__gte,
    finish_time__lte: values.finish_time__lte,
    has_timer: values.has_timer ? 'true' : undefined,
    exceeded_estimated_hours: values.exceeded_estimated_hours ? 'true' : undefined,
    page: values.page,
    page_size: values.page_size,
    ordering: sort.sortDir === 'asc' ? sort.sortBy : `-${sort.sortBy}`,
  };
}

/** Legacy Durum cell. */
export function taskStatus(task: {
  completion_date?: string | null;
  total_hours_spent?: number | string | null;
}) {
  if (task.completion_date) return { color: 'green', label: 'Tamamlandı' } as const;
  if (Number(task.total_hours_spent) > 0) return { color: 'yellow', label: 'Çalışıldı' } as const;
  return { color: 'grey', label: 'Bekliyor' } as const;
}

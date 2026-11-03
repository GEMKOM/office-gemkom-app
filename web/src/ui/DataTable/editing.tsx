import { NativeSelect, Textarea, TextInput } from '@mantine/core';
import { useRef, useState, type KeyboardEvent } from 'react';
import { columnValue } from './sorting';
import type { CellValue, ColumnEditor, DataTableColumn, EditOption } from './types';

/** How an editor was left: the key decides where focus goes next. */
export type CommitVia = 'enter' | 'blur' | 'next' | 'prev';

export function editorOf<T>(column: DataTableColumn<T>): ColumnEditor<T> | null {
  if (!column.editable) return null;
  return column.editable === true ? {} : column.editable;
}

export function editorOptions<T>(editor: ColumnEditor<T>, row: T): readonly EditOption[] {
  const { options } = editor;
  return typeof options === 'function' ? options(row) : (options ?? []);
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** 'YYYY-MM-DD' for a Date (local day) or an ISO string; '' when empty. */
export function toDateInput(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? ''
      : `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? '' : toDateInput(parsed);
}

/** '1.234,5', '1234.5' and '1,5' all read as numbers; '' is null; junk is NaN. */
export function parseNumberInput(raw: string): number | null {
  const text = raw.trim().replace(/\s/g, '');
  if (text === '') return null;
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text;
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(normalized)) return Number.NaN;
  return Number(normalized);
}

/** The value as the editor's input text. */
export function toEditorText<T>(editor: ColumnEditor<T>, value: unknown): string {
  const type = editor.type ?? 'text';
  if (value === null || value === undefined) return '';
  if (type === 'date') return toDateInput(value);
  if (type === 'number') {
    const n = typeof value === 'number' ? value : parseNumberInput(String(value));
    return n === null || Number.isNaN(n) ? String(value) : String(n).replace('.', ',');
  }
  return String(value);
}

/** The current cell value in editor terms (what onCellEdit gets as oldValue). */
export function editorValue<T>(
  editor: ColumnEditor<T>,
  column: DataTableColumn<T>,
  row: T,
): CellValue {
  const raw = editor.value ? editor.value(row) : columnValue(column, row);
  const type = editor.type ?? 'text';
  if (raw === null || raw === undefined) return null;
  if (type === 'number') {
    const n = typeof raw === 'number' ? raw : parseNumberInput(String(raw));
    return n === null || Number.isNaN(n) ? null : n;
  }
  if (type === 'date') return toDateInput(raw) || null;
  return String(raw);
}

export type ParseResult = { ok: true; value: CellValue } | { ok: false; error: string };

export function parseEditorText<T>(editor: ColumnEditor<T>, raw: string, row: T): ParseResult {
  const type = editor.type ?? 'text';
  let value: CellValue;
  if (type === 'number') {
    const n = parseNumberInput(raw);
    if (n !== null && Number.isNaN(n)) return { ok: false, error: 'Geçerli bir sayı girin' };
    if (n !== null && editor.min !== undefined && n < editor.min)
      return { ok: false, error: `Değer en az ${String(editor.min).replace('.', ',')} olmalıdır` };
    if (n !== null && editor.max !== undefined && n > editor.max)
      return {
        ok: false,
        error: `Değer en fazla ${String(editor.max).replace('.', ',')} olmalıdır`,
      };
    value = n;
  } else if (type === 'date') {
    if (raw !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(raw))
      return { ok: false, error: 'Geçerli bir tarih girin' };
    value = raw === '' ? null : raw;
  } else {
    value = raw;
  }
  const verdict = editor.validate?.(value, row);
  if (typeof verdict === 'string') return { ok: false, error: verdict };
  if (verdict === false) return { ok: false, error: 'Geçersiz değer' };
  return { ok: true, value };
}

/** Legacy isInlineEditValueUnchanged: numbers by value, empties alike. */
export function sameCellValue(a: CellValue, b: CellValue): boolean {
  const norm = (v: CellValue) => (v === null || v === '' ? null : v);
  return norm(a) === norm(b);
}

/** The row as it looks once the value is saved (the optimistic row). */
export function applyCellValue<T>(
  column: DataTableColumn<T>,
  editor: ColumnEditor<T>,
  row: T,
  value: CellValue,
): T {
  if (editor.apply) return editor.apply(row, value);
  if (typeof column.accessor === 'function') return row;
  const field = (column.accessor ?? column.key) as string;
  return { ...row, [field]: value };
}

interface CellEditorProps<T> {
  editor: ColumnEditor<T>;
  row: T;
  initial: string;
  label: string;
  onCommit: (raw: string, via: CommitVia) => void;
  onCancel: () => void;
}

/** The input inside an editing cell. Enter saves, Escape cancels, Tab saves and moves on, blur saves. */
export function CellEditor<T>({
  editor,
  row,
  initial,
  label,
  onCommit,
  onCancel,
}: CellEditorProps<T>) {
  const [raw, setRaw] = useState(initial);
  // Enter/Escape/Tab end the edit; the blur that follows must not save again.
  const done = useRef(false);
  const multiline = editor.type === 'textarea';
  const finish = (via: CommitVia) => {
    if (done.current) return;
    done.current = true;
    onCommit(raw, via);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // Keep the cell's own keys (Enter opens, arrows move) out of the editor.
    event.stopPropagation();
    if (event.key === 'Enter' && multiline && !(event.ctrlKey || event.metaKey)) {
      // A new line; Ctrl+Enter saves (legacy textarea editors).
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      finish('enter');
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (done.current) return;
      done.current = true;
      onCancel();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      finish(event.shiftKey ? 'prev' : 'next');
    }
  };
  const common = {
    size: 'xs' as const,
    autoFocus: true,
    'aria-label': label,
    'data-dirty': raw !== initial ? true : undefined,
    onKeyDown,
    onBlur: () => finish('blur'),
    onClick: (event: { stopPropagation: () => void }) => event.stopPropagation(),
  };
  const type = editor.type ?? 'text';
  if (type === 'select') {
    const options = editorOptions(editor, row);
    const data = options.some((o) => o.value === raw)
      ? options
      : [{ value: raw, label: raw === '' ? 'Seçiniz' : raw }, ...options];
    return (
      <NativeSelect
        {...common}
        data={data.map((o) => ({ value: o.value, label: o.label }))}
        value={raw}
        onChange={(event) => setRaw(event.currentTarget.value)}
      />
    );
  }
  if (type === 'textarea') {
    return (
      <Textarea
        {...common}
        rows={3}
        styles={{ input: { resize: 'vertical', minHeight: 60, maxHeight: 120 } }}
        placeholder={editor.placeholder}
        value={raw}
        onChange={(event) => setRaw(event.currentTarget.value)}
      />
    );
  }
  return (
    <TextInput
      {...common}
      type={type === 'date' ? 'date' : 'text'}
      inputMode={type === 'number' ? 'decimal' : undefined}
      placeholder={editor.placeholder}
      value={raw}
      onChange={(event) => setRaw(event.currentTarget.value)}
      onFocus={(event) => {
        if (type !== 'date') event.currentTarget.select();
      }}
    />
  );
}

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { mockBoxSize } from '@/test/layout';
import { renderWithProviders } from '@/test/render';
import { DataTable } from './DataTable';
import { parseEditorText, parseNumberInput, toDateInput, toEditorText } from './editing';
import type { CellEdit, DataTableColumn } from './types';

interface Item {
  id: number;
  name: string;
  qty: number | null;
  status: string;
  due: string | null;
  locked?: boolean;
}

const items: Item[] = [
  { id: 1, name: 'Flanş', qty: 4, status: 'open', due: '2026-11-20', locked: false },
  { id: 2, name: 'Mil', qty: 2.5, status: 'done', due: null, locked: true },
  { id: 3, name: 'Somun', qty: null, status: 'open', due: '2026-12-01T08:00:00Z', locked: false },
];

const columns: DataTableColumn<Item>[] = [
  { key: 'name', header: 'Ad', editable: true },
  { key: 'qty', header: 'Miktar', editable: { type: 'number', min: 0 } },
  {
    key: 'status',
    header: 'Durum',
    editable: {
      type: 'select',
      options: [
        { value: 'open', label: 'Açık' },
        { value: 'done', label: 'Tamamlandı' },
      ],
    },
  },
  { key: 'due', header: 'Termin', editable: { type: 'date' } },
  { key: 'id', header: 'No' },
];

const getRowId = (row: Item) => String(row.id);

function cell(rowId: string, col: string): HTMLElement {
  const tr = document.querySelector<HTMLElement>(`tr[data-row-id="${rowId}"]`);
  const td = tr?.querySelector<HTMLElement>(`td[data-col="${col}"]`);
  if (!td) throw new Error(`no cell ${rowId}/${col}`);
  return td;
}

describe('parsing helpers', () => {
  it('reads Turkish and dotted numbers', () => {
    expect(parseNumberInput('1,5')).toBe(1.5);
    expect(parseNumberInput('1.234,5')).toBe(1234.5);
    expect(parseNumberInput('12.5')).toBe(12.5);
    expect(parseNumberInput('')).toBeNull();
    expect(parseNumberInput('abc')).toBeNaN();
  });

  it('validates numbers, limits, dates and custom rules', () => {
    expect(parseEditorText({ type: 'number', min: 0 }, '-1', {})).toEqual({
      ok: false,
      error: 'Değer en az 0 olmalıdır',
    });
    expect(parseEditorText({ type: 'number', max: 5 }, '5,5', {})).toEqual({
      ok: false,
      error: 'Değer en fazla 5 olmalıdır',
    });
    expect(parseEditorText({ type: 'number' }, 'x', {})).toEqual({
      ok: false,
      error: 'Geçerli bir sayı girin',
    });
    expect(parseEditorText({ type: 'date' }, '', {})).toEqual({ ok: true, value: null });
    expect(parseEditorText({ validate: (v) => (v === '' ? 'Boş olamaz' : true) }, '', {})).toEqual({
      ok: false,
      error: 'Boş olamaz',
    });
  });

  it('formats editor text', () => {
    expect(toEditorText({ type: 'number' }, 2.5)).toBe('2,5');
    expect(toEditorText({ type: 'number' }, '3.50')).toBe('3,5');
    expect(toDateInput('2026-12-01T08:00:00')).toBe('2026-12-01');
    expect(toDateInput(new Date(2026, 0, 9))).toBe('2026-01-09');
  });
});

describe('DataTable inline editing', () => {
  it('opens on click, saves on Enter with typed values, and keeps the row click out', () => {
    const onCellEdit = vi.fn();
    const onRowClick = vi.fn();
    renderWithProviders(
      <DataTable
        data={items}
        columns={columns}
        getRowId={getRowId}
        onCellEdit={onCellEdit}
        onRowClick={onRowClick}
      />,
    );
    fireEvent.click(cell('1', 'qty'));
    const input = screen.getByRole('textbox', { name: 'Miktar' });
    expect(input).toHaveValue('4');
    fireEvent.change(input, { target: { value: '7,25' } });
    expect(input).toHaveAttribute('data-dirty');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCellEdit).toHaveBeenCalledWith(
      expect.objectContaining({ rowId: '1', columnKey: 'qty', value: 7.25, oldValue: 4 }),
    );
    expect(onRowClick).not.toHaveBeenCalled();
    // A sync save shows the new value until the page passes a new row.
    expect(cell('1', 'qty')).toHaveTextContent('7.25');
  });

  it('edits multi-line text: Enter is a new line, Ctrl+Enter saves', () => {
    const onCellEdit = vi.fn();
    const notes: DataTableColumn<Item>[] = [{ key: 'name', header: 'Not', editable: { type: 'textarea' } }];
    renderWithProviders(
      <DataTable data={items} columns={notes} getRowId={getRowId} onCellEdit={onCellEdit} />,
    );
    fireEvent.click(cell('1', 'name'));
    const box = screen.getByRole('textbox', { name: 'Not' });
    expect(box.tagName).toBe('TEXTAREA');
    fireEvent.change(box, { target: { value: 'satır 1\nsatır 2' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onCellEdit).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    expect(onCellEdit).toHaveBeenCalledWith(
      expect.objectContaining({ rowId: '1', columnKey: 'name', value: 'satır 1\nsatır 2' }),
    );
  });

  it('cancels on Escape and does not save an unchanged value', () => {
    const onCellEdit = vi.fn();
    renderWithProviders(
      <DataTable data={items} columns={columns} getRowId={getRowId} onCellEdit={onCellEdit} />,
    );
    fireEvent.click(cell('1', 'name'));
    const input = screen.getByRole('textbox', { name: 'Ad' });
    fireEvent.change(input, { target: { value: 'Yeni' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: 'Ad' })).not.toBeInTheDocument();
    expect(cell('1', 'name')).toHaveTextContent('Flanş');
    expect(cell('1', 'name')).toHaveFocus();

    fireEvent.click(cell('1', 'name'));
    fireEvent.blur(screen.getByRole('textbox', { name: 'Ad' }));
    expect(onCellEdit).not.toHaveBeenCalled();
  });

  it('shows the optimistic value while saving and rolls back on error', async () => {
    let reject: (error: Error) => void = () => {};
    const onCellEdit = vi.fn(
      () =>
        new Promise((_, r) => {
          reject = r;
        }),
    );
    renderWithProviders(
      <DataTable data={items} columns={columns} getRowId={getRowId} onCellEdit={onCellEdit} />,
    );
    fireEvent.click(cell('2', 'name'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Ad' }), { target: { value: 'Mil 2' } });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Ad' }), { key: 'Enter' });
    expect(cell('2', 'name')).toHaveTextContent('Mil 2');
    expect(cell('2', 'name')).toHaveAttribute('data-cell-state', 'saving');

    await act(async () => reject(new Error('Sunucu reddetti')));
    await waitFor(() => expect(cell('2', 'name')).toHaveAttribute('data-cell-state', 'error'));
    expect(cell('2', 'name')).toHaveTextContent('Mil');
    expect(cell('2', 'name')).not.toHaveTextContent('Mil 2');
    expect(
      within(cell('2', 'name')).getByRole('img', { name: 'Sunucu reddetti' }),
    ).toBeInTheDocument();
  });

  it('keeps a saved value until the page passes the updated row', async () => {
    function Page() {
      const [rows, setRows] = useState(items);
      const [pending, setPending] = useState<(() => void) | null>(null);
      return (
        <>
          <button type="button" onClick={() => pending?.()}>
            refetch
          </button>
          <DataTable
            data={rows}
            columns={columns}
            getRowId={getRowId}
            onCellEdit={(edit: CellEdit<Item>) => {
              setPending(
                () => () =>
                  setRows((prev) =>
                    prev.map((r) => (r.id === edit.row.id ? { ...r, name: 'Sunucudan' } : r)),
                  ),
              );
              return Promise.resolve();
            }}
          />
        </>
      );
    }
    renderWithProviders(<Page />);
    fireEvent.click(cell('1', 'name'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Ad' }), { target: { value: 'Yerel' } });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Ad' }), { key: 'Enter' });
    await waitFor(() => expect(cell('1', 'name')).not.toHaveAttribute('data-cell-state'));
    expect(cell('1', 'name')).toHaveTextContent('Yerel');
    fireEvent.click(screen.getByRole('button', { name: 'refetch' }));
    expect(cell('1', 'name')).toHaveTextContent('Sunucudan');
  });

  it('refuses invalid input with the error state and no save', () => {
    const onCellEdit = vi.fn();
    renderWithProviders(
      <DataTable data={items} columns={columns} getRowId={getRowId} onCellEdit={onCellEdit} />,
    );
    fireEvent.click(cell('1', 'qty'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Miktar' }), { target: { value: '-3' } });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Miktar' }), { key: 'Enter' });
    expect(onCellEdit).not.toHaveBeenCalled();
    expect(cell('1', 'qty')).toHaveAttribute('data-cell-state', 'error');
    expect(cell('1', 'qty')).toHaveTextContent('4');
  });

  it('edits select and date cells', () => {
    const onCellEdit = vi.fn();
    renderWithProviders(
      <DataTable data={items} columns={columns} getRowId={getRowId} onCellEdit={onCellEdit} />,
    );
    // The select column shows option labels.
    expect(cell('2', 'status')).toHaveTextContent('Tamamlandı');
    fireEvent.click(cell('1', 'status'));
    const select = screen.getByRole('combobox', { name: 'Durum' });
    fireEvent.change(select, { target: { value: 'done' } });
    fireEvent.keyDown(select, { key: 'Enter' });
    expect(onCellEdit).toHaveBeenLastCalledWith(
      expect.objectContaining({ value: 'done', oldValue: 'open' }),
    );

    fireEvent.click(cell('3', 'due'));
    const date = screen.getByLabelText('Termin');
    expect(date).toHaveValue('2026-12-01');
    fireEvent.change(date, { target: { value: '2027-01-15' } });
    fireEvent.keyDown(date, { key: 'Enter' });
    expect(onCellEdit).toHaveBeenLastCalledWith(
      expect.objectContaining({ columnKey: 'due', value: '2027-01-15', oldValue: '2026-12-01' }),
    );
  });

  it('respects isRowEditable and per-column enabled', () => {
    renderWithProviders(
      <DataTable
        data={items}
        columns={columns.map((c) =>
          c.key === 'status'
            ? { ...c, editable: { type: 'select' as const, enabled: (r: Item) => r.id !== 3 } }
            : c,
        )}
        getRowId={getRowId}
        onCellEdit={vi.fn()}
        isRowEditable={(row) => !row.locked}
      />,
    );
    const row2 = document.querySelector('tr[data-row-id="2"]')!;
    expect(row2.querySelector('[data-edit-cell]')).toBeNull();
    expect(cell('1', 'status')).toHaveAttribute('data-edit-cell');
    const row3 = document.querySelector('tr[data-row-id="3"]')!;
    expect(row3.querySelector('td[data-col="status"]')).not.toHaveAttribute('data-edit-cell');
  });

  it('is read-only without onCellEdit', () => {
    renderWithProviders(<DataTable data={items} columns={columns} getRowId={getRowId} />);
    expect(document.querySelector('[data-edit-cell]')).toBeNull();
  });

  it('moves between editable cells with the arrows and Tab', () => {
    const onCellEdit = vi.fn();
    renderWithProviders(
      <DataTable data={items} columns={columns} getRowId={getRowId} onCellEdit={onCellEdit} />,
    );
    // One tab stop: the first editable cell.
    expect(cell('1', 'name')).toHaveAttribute('tabindex', '0');
    expect(cell('2', 'name')).toHaveAttribute('tabindex', '-1');

    cell('1', 'name').focus();
    fireEvent.keyDown(cell('1', 'name'), { key: 'ArrowDown' });
    expect(cell('2', 'name')).toHaveFocus();
    fireEvent.keyDown(cell('2', 'name'), { key: 'ArrowRight' });
    expect(cell('2', 'qty')).toHaveFocus();
    expect(cell('2', 'qty')).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(cell('2', 'qty'), { key: 'Enter' });
    const input = screen.getByRole('textbox', { name: 'Miktar' });
    fireEvent.change(input, { target: { value: '3' } });
    // Tab saves and opens the next editable cell.
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(onCellEdit).toHaveBeenCalledWith(
      expect.objectContaining({ rowId: '2', columnKey: 'qty', value: 3 }),
    );
    expect(screen.getByRole('combobox', { name: 'Durum' })).toBeInTheDocument();
    // Shift+Tab goes back.
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Durum' }), {
      key: 'Tab',
      shiftKey: true,
    });
    expect(screen.getByRole('textbox', { name: 'Miktar' })).toBeInTheDocument();
  });

  it('marks draft cells with isCellDirty', () => {
    renderWithProviders(
      <DataTable
        data={items}
        columns={columns}
        getRowId={getRowId}
        onCellEdit={vi.fn()}
        isCellDirty={(row, key) => row.id === 3 && key === 'qty'}
      />,
    );
    expect(cell('3', 'qty')).toHaveAttribute('data-cell-state', 'dirty');
    expect(cell('1', 'qty')).not.toHaveAttribute('data-cell-state');
  });

  it('edits rows in a virtualized table', () => {
    // jsdom has no layout; give the scroll box a height so the virtualizer renders a window.
    const restore = mockBoxSize(400);
    const many = Array.from({ length: 500 }, (_, i) => ({
      ...items[0]!,
      id: i + 1,
      name: `Parça ${i + 1}`,
    }));
    const onCellEdit = vi.fn();
    renderWithProviders(
      <DataTable
        data={many}
        columns={columns}
        getRowId={getRowId}
        onCellEdit={onCellEdit}
        virtualize
      />,
    );
    // Only a window of rows is in the DOM.
    expect(document.querySelectorAll('tbody tr[data-row-id]').length).toBeLessThan(100);
    fireEvent.click(cell('1', 'name'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Ad' }), { target: { value: 'X' } });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Ad' }), { key: 'Enter' });
    expect(onCellEdit).toHaveBeenCalledWith(expect.objectContaining({ rowId: '1', value: 'X' }));
    restore();
  });
});

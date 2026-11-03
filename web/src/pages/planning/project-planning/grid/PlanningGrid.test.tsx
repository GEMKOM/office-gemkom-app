import { fireEvent, render, screen } from '@testing-library/react';
import { PlanningGrid, type GridBar, type GridColumn } from './PlanningGrid';

interface Row {
  key: string;
  groupKey?: string | null;
  title: string;
  start_date: string | null;
  end_date: string | null;
}

const renders = vi.fn();
const columns: GridColumn<Row>[] = [
  {
    field: 'title',
    label: 'Görev',
    width: '200px',
    render: (row) => {
      renders(row.key);
      return row.title;
    },
  },
  {
    field: 'start_date',
    label: 'Başlangıç',
    width: '96px',
    type: 'date',
    render: (row) => row.start_date ?? '—',
  },
];
const bar = (row: Row): GridBar | null =>
  row.start_date && row.end_date
    ? { start: row.start_date, end: row.end_date, label: row.title }
    : null;
const editable = (_row: Row, field: string) => field === 'start_date';

function rowsOf(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    key: `r${i}`,
    groupKey: i === 0 ? null : 'g',
    title: `Satır ${i}`,
    start_date: '2026-11-02',
    end_date: '2026-11-06',
  }));
}

const today = new Date(2026, 10, 3);

describe('PlanningGrid', () => {
  beforeEach(() => renders.mockClear());

  it('re-renders only the row whose object changed', () => {
    const rows = rowsOf(200);
    const { rerender } = render(
      <PlanningGrid rows={rows} columns={columns} bar={bar} today={today} />,
    );
    expect(renders).toHaveBeenCalledTimes(200);
    renders.mockClear();

    // An edit hands over a new object for one row and the same objects for
    // the rest, on the same timeline: one row renders (the legacy grid rebuilt
    // all 200 through innerHTML).
    const next = rows.slice();
    next[5] = { ...rows[5]!, title: 'Değişti' };
    rerender(<PlanningGrid rows={next} columns={columns} bar={bar} today={today} />);
    expect(renders.mock.calls).toEqual([['r5']]);
    expect(screen.getByText('Değişti')).toBeInTheDocument();
  });

  it('hides collapsed groups and edits a date day-first', () => {
    const onEdit = vi.fn();
    const rows = rowsOf(3);
    const { rerender } = render(
      <PlanningGrid
        rows={rows}
        columns={columns}
        bar={bar}
        today={today}
        isCellEditable={editable}
        onEdit={onEdit}
        collapsed={new Set(['g'])}
      />,
    );
    expect(screen.queryByText('Satır 1')).not.toBeInTheDocument();
    rerender(
      <PlanningGrid
        rows={rows}
        columns={columns}
        bar={bar}
        today={today}
        isCellEditable={editable}
        onEdit={onEdit}
      />,
    );
    const cell = document.querySelector('.pg-cell[data-row="r1"][data-field="start_date"]')!;
    expect(cell).toHaveClass('pg-editable');
    fireEvent.click(cell);
    const input = cell.querySelector('input')!;
    expect(input).toHaveValue('02.11.2026');
    fireEvent.change(input, { target: { value: '10112026' } });
    expect(input).toHaveValue('10.11.2026');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onEdit).toHaveBeenCalledWith(rows[1], 'start_date', '2026-11-10');
  });

  it('refuses a date that does not exist instead of committing it', () => {
    const onEdit = vi.fn();
    const onEditError = vi.fn();
    const rows = rowsOf(1);
    render(
      <PlanningGrid
        rows={rows}
        columns={columns}
        bar={bar}
        today={today}
        isCellEditable={editable}
        onEdit={onEdit}
        onEditError={onEditError}
      />,
    );
    const cell = document.querySelector('.pg-cell[data-field="start_date"]')!;
    fireEvent.click(cell);
    const input = cell.querySelector('input')!;
    fireEvent.change(input, { target: { value: '31.04.2026' } });
    fireEvent.blur(input);
    expect(onEdit).not.toHaveBeenCalled();
    expect((onEditError.mock.calls[0]![0] as Error).message).toBe(
      'Geçerli bir tarih girin (gg.aa.yyyy).',
    );
  });

  it('draws the bar from the row dates', () => {
    render(<PlanningGrid rows={rowsOf(1)} columns={columns} bar={bar} today={today} zoom="day" />);
    const barEl = document.querySelector('.pg-bar') as HTMLElement;
    // Monday to Friday inclusive at 30 px a day.
    expect(barEl.style.width).toBe('150px');
    expect(barEl).toHaveTextContent('Satır 0');
    expect(barEl).toHaveAttribute('data-tone', 'blue');
  });

  it('turns a dragged bar into whole days, and its right edge into a new end', () => {
    const onBarChange = vi.fn();
    const rows = rowsOf(1);
    render(
      <PlanningGrid
        rows={rows}
        columns={columns}
        bar={bar}
        today={today}
        zoom="day"
        barEditing={() => ({ move: true, resize: true })}
        onBarChange={onBarChange}
      />,
    );
    const barEl = document.querySelector<HTMLElement>('.pg-bar')!;
    // 30 px a day: 62 px is two days.
    fireEvent.pointerDown(barEl, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 162, pointerId: 1 });
    expect(barEl).toHaveClass('pg-bar-dragging');
    fireEvent.pointerUp(window, { clientX: 162, pointerId: 1 });
    expect(onBarChange).toHaveBeenLastCalledWith(rows[0], {
      mode: 'move',
      start: '2026-11-04',
      end: '2026-11-08',
      days: 2,
    });

    const handle = barEl.querySelector<HTMLElement>('[data-handle="end"]')!;
    fireEvent.pointerDown(handle, { button: 0, clientX: 200, pointerId: 2 });
    fireEvent.pointerMove(window, { clientX: 140, pointerId: 2 });
    fireEvent.pointerUp(window, { clientX: 140, pointerId: 2 });
    expect(onBarChange).toHaveBeenLastCalledWith(rows[0], {
      mode: 'end',
      start: '2026-11-02',
      end: '2026-11-04',
      days: -2,
    });
  });

  it('leaves a fixed bar alone and cancels a drag on Escape', () => {
    const onBarChange = vi.fn();
    render(
      <PlanningGrid
        rows={rowsOf(2)}
        columns={columns}
        bar={bar}
        today={today}
        zoom="day"
        barEditing={(row) => (row.key === 'r1' ? { move: true } : null)}
        onBarChange={onBarChange}
      />,
    );
    const [fixed, movable] = document.querySelectorAll<HTMLElement>('.pg-bar');
    expect(fixed).not.toHaveAttribute('data-move');
    expect(fixed!.querySelector('[data-handle]')).toBeNull();
    fireEvent.pointerDown(fixed!, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 200, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 200, pointerId: 1 });

    fireEvent.pointerDown(movable!, { button: 0, clientX: 100, pointerId: 2 });
    fireEvent.pointerMove(window, { clientX: 200, pointerId: 2 });
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.pointerUp(window, { clientX: 200, pointerId: 2 });
    expect(onBarChange).not.toHaveBeenCalled();
  });

  it('shows the hover card and draws the sequence arrows', () => {
    const rows = rowsOf(2).map((r, i) =>
      i === 1 ? { ...r, start_date: '2026-11-09', end_date: '2026-11-11' } : r,
    );
    render(
      <PlanningGrid
        rows={rows}
        columns={columns}
        bar={bar}
        today={today}
        zoom="day"
        links={() => [{ from: 'r0', to: 'r1' }]}
        tooltip={(row) => ({ title: row.title, lines: [`${row.start_date} – ${row.end_date}`] })}
      />,
    );
    expect(document.querySelectorAll('.pg-links .pg-link')).toHaveLength(1);
    expect(document.querySelector('path.pg-link.pg-link-broken')).toBeNull();
    fireEvent.pointerOver(document.querySelectorAll('.pg-bar')[1]!);
    const card = screen.getByRole('tooltip');
    expect(card).toHaveTextContent('Satır 1');
    expect(card).toHaveTextContent('2026-11-09 – 2026-11-11');
  });
});

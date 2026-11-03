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
  });
});

import { createEvent, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { DataTable } from './DataTable';
import { moveId } from './reorder';
import type { DataTableColumn } from './types';

interface Step {
  id: string;
  name: string;
  phase: string;
}

const steps: Step[] = [
  { id: 'a', name: 'Kesim', phase: '1' },
  { id: 'b', name: 'Kaynak', phase: '1' },
  { id: 'c', name: 'Boya', phase: '2' },
  { id: 'd', name: 'Montaj', phase: '2' },
];

const columns: DataTableColumn<Step>[] = [{ key: 'name', header: 'Adım', sortable: true }];
const getRowId = (row: Step) => row.id;

function order() {
  return [...document.querySelectorAll('tbody tr[data-row-id]')].map((tr) =>
    tr.getAttribute('data-row-id'),
  );
}

function handle(rowId: string): HTMLElement {
  return document.querySelector<HTMLElement>(`tr[data-row-id="${rowId}"] [data-drag-handle]`)!;
}

/** jsdom has no DragEvent, so clientY has to be put on the event by hand. */
function drag(type: 'dragOver' | 'drop', el: Element, clientY: number, dataTransfer: object) {
  const event = createEvent[type](el, { dataTransfer });
  Object.defineProperty(event, 'clientY', { value: clientY });
  fireEvent(el, event);
}

describe('moveId', () => {
  it('moves before or after a target', () => {
    expect(moveId(['a', 'b', 'c', 'd'], 'a', 'c', 'after')).toEqual(['b', 'c', 'a', 'd']);
    expect(moveId(['a', 'b', 'c', 'd'], 'd', 'b', 'before')).toEqual(['a', 'd', 'b', 'c']);
    expect(moveId(['a', 'b'], 'a', 'a', 'before')).toEqual(['a', 'b']);
  });
});

describe('DataTable reorder', () => {
  it('moves a row with the keyboard: Space, arrows, Space', () => {
    const onReorder = vi.fn();
    renderWithProviders(
      <DataTable data={steps} columns={columns} getRowId={getRowId} reorder={{ onReorder }} />,
    );
    const grip = handle('a');
    expect(grip).toHaveAccessibleName('Satırı taşı');
    fireEvent.keyDown(grip, { key: ' ' });
    expect(handle('a')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Satır seçildi, konum 1 \/ 4/)).toBeInTheDocument();
    fireEvent.keyDown(handle('a'), { key: 'ArrowDown' });
    fireEvent.keyDown(handle('a'), { key: 'ArrowDown' });
    // The preview shows the new place before the drop.
    expect(order()).toEqual(['b', 'c', 'a', 'd']);
    expect(onReorder).not.toHaveBeenCalled();
    fireEvent.keyDown(handle('a'), { key: ' ' });
    expect(onReorder).toHaveBeenCalledWith(['b', 'c', 'a', 'd'], {
      id: 'a',
      targetId: 'c',
      position: 'after',
      from: 0,
      to: 2,
    });
  });

  it('cancels a keyboard move with Escape', () => {
    const onReorder = vi.fn();
    renderWithProviders(
      <DataTable data={steps} columns={columns} getRowId={getRowId} reorder={{ onReorder }} />,
    );
    fireEvent.keyDown(handle('c'), { key: 'Enter' });
    fireEvent.keyDown(handle('c'), { key: 'ArrowUp' });
    expect(order()).toEqual(['a', 'c', 'b', 'd']);
    fireEvent.keyDown(handle('c'), { key: 'Escape' });
    expect(order()).toEqual(['a', 'b', 'c', 'd']);
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('drops a row dragged with the mouse before or after the target', () => {
    const onReorder = vi.fn();
    renderWithProviders(
      <DataTable data={steps} columns={columns} getRowId={getRowId} reorder={{ onReorder }} />,
    );
    const target = document.querySelector<HTMLElement>('tr[data-row-id="b"]')!;
    target.getBoundingClientRect = () => ({ top: 100, height: 40, bottom: 140 }) as DOMRect;
    const dataTransfer = {
      setData: vi.fn(),
      setDragImage: vi.fn(),
      effectAllowed: '',
      dropEffect: '',
    };
    fireEvent.dragStart(handle('d'), { dataTransfer });
    expect(document.querySelector('tr[data-row-id="d"]')).toHaveAttribute('data-drag', 'dragging');
    drag('dragOver', target.querySelector('td')!, 105, dataTransfer);
    expect(target).toHaveAttribute('data-drop', 'before');
    drag('drop', target.querySelector('td')!, 105, dataTransfer);
    expect(onReorder).toHaveBeenCalledWith(['a', 'd', 'b', 'c'], {
      id: 'd',
      targetId: 'a',
      position: 'after',
      from: 3,
      to: 1,
    });
    expect(target).not.toHaveAttribute('data-drop');
  });

  it('keeps moves inside a group', () => {
    const onReorder = vi.fn();
    renderWithProviders(
      <DataTable
        data={steps}
        columns={columns}
        getRowId={getRowId}
        grouping={{ by: 'phase' }}
        reorder={{ onReorder }}
      />,
    );
    fireEvent.keyDown(handle('b'), { key: ' ' });
    // Last in its group: down does nothing.
    fireEvent.keyDown(handle('b'), { key: 'ArrowDown' });
    expect(order()).toEqual(['a', 'b', 'c', 'd']);
    fireEvent.keyDown(handle('b'), { key: 'ArrowUp' });
    fireEvent.keyDown(handle('b'), { key: ' ' });
    expect(onReorder).toHaveBeenCalledWith(
      ['b', 'a', 'c', 'd'],
      expect.objectContaining({ targetId: 'a', position: 'before' }),
    );

    // A drag over another group's row shows no drop target.
    const other = document.querySelector<HTMLElement>('tr[data-row-id="c"]')!;
    const dataTransfer = {
      setData: vi.fn(),
      setDragImage: vi.fn(),
      effectAllowed: '',
      dropEffect: '',
    };
    fireEvent.dragStart(handle('a'), { dataTransfer });
    drag('dragOver', other.querySelector('td')!, 0, dataTransfer);
    expect(other).not.toHaveAttribute('data-drop');
  });

  it('turns the handles off while a column sort is active and for pinned rows', () => {
    renderWithProviders(
      <DataTable
        data={steps}
        columns={columns}
        getRowId={getRowId}
        reorder={{ onReorder: vi.fn(), isRowDraggable: (row) => row.id !== 'd' }}
      />,
    );
    expect(handle('d')).toBeDisabled();
    expect(handle('a')).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /Adım/ }));
    expect(handle('a')).toBeDisabled();
  });
});

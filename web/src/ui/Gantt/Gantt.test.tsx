import { fireEvent, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { Gantt } from './Gantt';
import { HOUR } from './timeScale';
import type { GanttBar, GanttRow } from './types';

const day = new Date(2026, 10, 4).getTime(); // Wednesday 4 Nov 2026
const rows: GanttRow[] = [
  { id: 'r1', label: 'OP-1', sublabel: 'Kaba torna' },
  { id: 'r2', label: 'OP-2', sublabel: 'Freze', locked: true },
  { id: 'r3', label: 'OP-3', sublabel: 'Taşlama' },
];
const bars: GanttBar[] = [
  { id: 'OP-1', rowId: 'r1', start: day + 8 * HOUR, end: day + 12 * HOUR, label: 'OP-1' },
  {
    id: 'OP-2',
    rowId: 'r2',
    start: day + 13 * HOUR,
    end: day + 15 * HOUR,
    label: 'OP-2',
    locked: true,
  },
  { id: 'OP-3', rowId: 'r3', start: day + 9 * HOUR, end: day + 10 * HOUR, label: 'OP-3' },
];

// jsdom has no layout; give elements a size so the row virtualizer renders rows.
const sizes = ['clientWidth', 'clientHeight'] as const;
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 1200,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 600,
  });
});
afterAll(() => {
  // The stubs shadow jsdom's getters on Element.prototype; removing them restores those.
  for (const key of sizes)
    delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
});

function bar(id: string) {
  return document.querySelector<HTMLElement>(`[data-bar-id="${id}"]`)!;
}

describe('Gantt', () => {
  it('renders rows, bars and the week axis', () => {
    renderWithProviders(
      <Gantt
        title="Zaman Çizelgesi"
        rows={rows}
        bars={bars}
        defaultScale="week"
        defaultAnchor={day}
      />,
    );
    expect(screen.getByText('Zaman Çizelgesi')).toBeInTheDocument();
    expect(screen.getByText('2-8 Kas')).toBeInTheDocument();
    expect(screen.getByText('Kaba torna')).toBeInTheDocument();
    expect(screen.getByText('Çar 11')).toBeInTheDocument();
    expect(bar('OP-1')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('04.11.2026 08:00 - 04.11.2026 12:00'),
    );
    expect(bar('OP-2')).toHaveAttribute('aria-label', expect.stringContaining('kilitli'));
    // The first bar is the tab stop.
    expect(bar('OP-1')).toHaveAttribute('tabindex', '0');
    expect(bar('OP-3')).toHaveAttribute('tabindex', '-1');
  });

  it('opens a bar on click and on Enter', () => {
    const onBarOpen = vi.fn();
    renderWithProviders(
      <Gantt
        rows={rows}
        bars={bars}
        defaultScale="week"
        defaultAnchor={day}
        onBarOpen={onBarOpen}
      />,
    );
    fireEvent.pointerDown(bar('OP-3'), { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(bar('OP-3'), { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
    expect(onBarOpen).toHaveBeenLastCalledWith(bars[2]);
    fireEvent.keyDown(bar('OP-1'), { key: 'Enter' });
    expect(onBarOpen).toHaveBeenLastCalledWith(bars[0]);
  });

  it('moves the selection with the arrow keys', async () => {
    renderWithProviders(<Gantt rows={rows} bars={bars} defaultScale="week" defaultAnchor={day} />);
    fireEvent.keyDown(bar('OP-1'), { key: 'ArrowDown' });
    expect(bar('OP-2')).toHaveAttribute('data-selected', 'true');
    expect(bar('OP-1')).not.toHaveAttribute('data-selected');
    await vi.waitFor(() => expect(document.activeElement).toBe(bar('OP-2')));
  });

  it('moves a bar by one snap step with Alt+→ and resizes with Alt+Shift+→', () => {
    const onBarChange = vi.fn();
    renderWithProviders(
      <Gantt
        rows={rows}
        bars={bars}
        defaultScale="week"
        defaultAnchor={day}
        editable
        onBarChange={onBarChange}
      />,
    );
    fireEvent.keyDown(bar('OP-1'), { key: 'ArrowRight', altKey: true });
    expect(onBarChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        start: day + 9 * HOUR,
        end: day + 13 * HOUR,
        rowId: 'r1',
        via: 'keyboard',
      }),
    );
    fireEvent.keyDown(bar('OP-1'), { key: 'ArrowRight', altKey: true, shiftKey: true });
    expect(onBarChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ start: day + 8 * HOUR, end: day + 13 * HOUR }),
    );
    // Locked bars do not move.
    onBarChange.mockClear();
    fireEvent.keyDown(bar('OP-2'), { key: 'ArrowRight', altKey: true });
    expect(onBarChange).not.toHaveBeenCalled();
  });

  it('does not edit when the chart is read-only', () => {
    const onBarChange = vi.fn();
    renderWithProviders(
      <Gantt
        rows={rows}
        bars={bars}
        defaultScale="week"
        defaultAnchor={day}
        onBarChange={onBarChange}
      />,
    );
    fireEvent.keyDown(bar('OP-1'), { key: 'ArrowRight', altKey: true });
    expect(onBarChange).not.toHaveBeenCalled();
    expect(document.querySelector('[data-handle]')).toBeNull();
  });

  it('reorders rows with Alt+↑/↓ and shows drag handles', () => {
    const onRowReorder = vi.fn();
    renderWithProviders(
      <Gantt
        rows={rows}
        bars={bars}
        defaultScale="week"
        defaultAnchor={day}
        onRowReorder={onRowReorder}
      />,
    );
    expect(document.querySelectorAll('[data-reorder]')).toHaveLength(3);
    fireEvent.keyDown(bar('OP-3'), { key: 'ArrowUp', altKey: true });
    expect(onRowReorder).toHaveBeenLastCalledWith('r3', 'r2', 'before');
    fireEvent.keyDown(bar('OP-1'), { key: 'ArrowDown', altKey: true });
    expect(onRowReorder).toHaveBeenLastCalledWith('r1', 'r2', 'after');
  });

  it('navigates periods and reports the view', () => {
    const onViewChange = vi.fn();
    renderWithProviders(
      <Gantt
        rows={rows}
        bars={bars}
        defaultScale="week"
        defaultAnchor={day}
        onViewChange={onViewChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sonraki Dönem' }));
    expect(screen.getByText('9-15 Kas')).toBeInTheDocument();
    expect(onViewChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        scale: 'week',
        range: { start: new Date(2026, 10, 9).getTime(), end: new Date(2026, 10, 16).getTime() },
      }),
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Gün' }));
    expect(onViewChange).toHaveBeenLastCalledWith(expect.objectContaining({ scale: 'day' }));
  });

  it('shows the empty message without rows', () => {
    renderWithProviders(<Gantt rows={[]} bars={[]} emptyMessage="Planlanmış görev bulunmuyor" />);
    expect(screen.getByText('Planlanmış görev bulunmuyor')).toBeInTheDocument();
  });
});

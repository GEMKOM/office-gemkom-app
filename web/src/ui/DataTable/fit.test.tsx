import { fireEvent, screen, within } from '@testing-library/react';
import { Table } from '@mantine/core';
import { renderWithProviders } from '@/test/render';
import { DataTable } from './DataTable';
import type { DataTableColumn } from './types';

// Fitting a table to the screen: clipped cells, columns that start hidden on a
// narrow screen, and the Sütunlar menu that shows them again.

interface Part {
  id: number;
  name: string;
  note: string;
  weight: number;
}

const parts: Part[] = [
  { id: 1, name: 'Flanş', note: 'Sertleştirme sonrası taşlama yapılacak', weight: 12 },
  { id: 2, name: 'Mil', note: '', weight: 3 },
];

const getRowId = (row: Part) => String(row.id);

const realMatchMedia = window.matchMedia;

/** A viewport `width` px wide, as far as `(max-width: …)` queries go. */
function viewport(width: number) {
  window.matchMedia = ((query: string) => {
    const max = /max-width:\s*([\d.]+)px/.exec(query);
    return {
      matches: max ? width <= Number(max[1]) : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    };
  }) as typeof window.matchMedia;
}

function headers() {
  return screen.getAllByRole('columnheader').map((th) => th.textContent);
}

afterEach(() => {
  window.matchMedia = realMatchMedia;
  localStorage.clear();
});

describe('DataTable maxWidth', () => {
  const columns: DataTableColumn<Part>[] = [
    { key: 'name', header: 'Ad' },
    { key: 'note', header: 'Not', maxWidth: 120 },
  ];

  it('clips the cell to the width and titles it on hover only when cut', () => {
    renderWithProviders(<DataTable data={parts} columns={columns} getRowId={getRowId} />);
    const clip = screen.getByText('Sertleştirme sonrası taşlama yapılacak');
    expect(clip).toHaveStyle({ maxWidth: '120px' });

    // jsdom has no layout: say the text is wider than its box.
    Object.defineProperty(clip, 'scrollWidth', { configurable: true, value: 300 });
    Object.defineProperty(clip, 'clientWidth', { configurable: true, value: 120 });
    fireEvent.mouseEnter(clip);
    expect(clip).toHaveAttribute('title', 'Sertleştirme sonrası taşlama yapılacak');

    Object.defineProperty(clip, 'scrollWidth', { configurable: true, value: 100 });
    fireEvent.mouseEnter(clip);
    expect(clip).not.toHaveAttribute('title');
  });

  it('uses cellTitle for the hover text', () => {
    renderWithProviders(
      <DataTable
        data={parts}
        columns={[
          { key: 'name', header: 'Ad', maxWidth: 60, cellTitle: (row) => `#${row.id} ${row.name}` },
        ]}
        getRowId={getRowId}
      />,
    );
    const clip = screen.getByText('Flanş');
    Object.defineProperty(clip, 'scrollWidth', { configurable: true, value: 90 });
    Object.defineProperty(clip, 'clientWidth', { configurable: true, value: 60 });
    fireEvent.mouseEnter(clip);
    expect(clip).toHaveAttribute('title', '#1 Flanş');
  });

  it('sizes the header by minWidth', () => {
    renderWithProviders(
      <DataTable
        data={parts}
        columns={[{ key: 'name', header: 'Ad', minWidth: 90 }]}
        getRowId={getRowId}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'Ad' })).toHaveStyle({ minWidth: '90px' });
  });
});

describe('DataTable hideBelow and the Sütunlar menu', () => {
  const columns: DataTableColumn<Part>[] = [
    { key: 'name', header: 'Ad' },
    { key: 'note', header: 'Not' },
    { key: 'weight', header: 'Ağırlık', hideBelow: 1600 },
  ];

  it('shows every column on a wide screen', () => {
    viewport(1920);
    renderWithProviders(<DataTable data={parts} columns={columns} getRowId={getRowId} />);
    expect(headers()).toEqual(['Ad', 'Not', 'Ağırlık']);
    expect(screen.getByRole('button', { name: 'Sütunlar' })).toBeInTheDocument();
  });

  it('starts the column hidden on a narrow screen and the menu brings it back', async () => {
    viewport(1440);
    const footer = vi.fn(({ columns: shown }: { columns: readonly DataTableColumn<Part>[] }) => (
      <Table.Tr>
        {shown.map((c) => (
          <Table.Td key={c.key}>{c.key}</Table.Td>
        ))}
      </Table.Tr>
    ));
    renderWithProviders(
      <DataTable data={parts} columns={columns} getRowId={getRowId} footer={footer} />,
    );
    expect(headers()).toEqual(['Ad', 'Not']);
    expect(screen.queryByText('12')).not.toBeInTheDocument();
    // The footer lines up with the columns on screen.
    expect(footer.mock.lastCall?.[0].columns.map((c) => c.key)).toEqual(['name', 'note']);

    fireEvent.click(screen.getByRole('button', { name: 'Sütunlar (1 gizli)' }));
    const item = await screen.findByRole('checkbox', { name: 'Ağırlık' });
    expect(item).not.toBeChecked();
    fireEvent.click(item);
    expect(headers()).toEqual(['Ad', 'Not', 'Ağırlık']);
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sütunlar' })).toBeInTheDocument();
    expect(footer.mock.lastCall?.[0].columns.map((c) => c.key)).toEqual(['name', 'note', 'weight']);

    // Any column can be hidden; Varsayılana dön goes back to the screen's default.
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Not' }));
    expect(headers()).toEqual(['Ad', 'Ağırlık']);
    fireEvent.click(await screen.findByRole('button', { name: 'Varsayılana dön' }));
    expect(headers()).toEqual(['Ad', 'Not']);
  });

  it('keeps the last column on screen', async () => {
    viewport(1920);
    renderWithProviders(
      <DataTable
        data={parts}
        columns={[{ key: 'name', header: 'Ad' }]}
        getRowId={getRowId}
        columnsKey="test-parts"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sütunlar' }));
    const menu = await screen.findByRole('group', { name: 'Görünen sütunlar' });
    expect(await within(menu).findByRole('checkbox', { name: 'Ad' })).toBeDisabled();
  });

  it('remembers the choices under columnsKey', async () => {
    viewport(1440);
    const { unmount } = renderWithProviders(
      <DataTable data={parts} columns={columns} getRowId={getRowId} columnsKey="test-parts" />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sütunlar (1 gizli)' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Ağırlık' }));
    unmount();

    renderWithProviders(
      <DataTable data={parts} columns={columns} getRowId={getRowId} columnsKey="test-parts" />,
    );
    expect(headers()).toEqual(['Ad', 'Not', 'Ağırlık']);
  });

  it('has no menu when no column can start hidden and there is no columnsKey', () => {
    renderWithProviders(
      <DataTable
        data={parts}
        columns={[{ key: 'name', header: 'Ad' }]}
        getRowId={getRowId}
        title="Parçalar"
      />,
    );
    expect(screen.queryByRole('button', { name: /Sütunlar/ })).not.toBeInTheDocument();
  });
});

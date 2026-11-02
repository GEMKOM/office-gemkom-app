import { fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { DataTable } from './DataTable';
import { toOrdering } from './sorting';
import type { DataTableColumn } from './types';

interface Person {
  id: number;
  name: string;
  age: number;
}

const people: Person[] = [
  { id: 1, name: 'Ayşe', age: 34 },
  { id: 2, name: 'Mehmet', age: 28 },
  { id: 3, name: 'Zeynep', age: 41 },
];

const renderSpy = vi.fn();

const columns: DataTableColumn<Person>[] = [
  {
    key: 'name',
    header: 'Ad',
    sortable: true,
    render: (row) => {
      renderSpy(row.id);
      return row.name;
    },
  },
  { key: 'age', header: 'Yaş', sortable: true },
];

const getRowId = (row: Person) => String(row.id);

function bodyRows() {
  // The first row group is the header.
  return screen.getAllByRole('row').filter((row) => row.closest('tbody'));
}

describe('DataTable', () => {
  beforeEach(() => renderSpy.mockClear());

  it('renders a row per item', () => {
    renderWithProviders(<DataTable data={people} columns={columns} getRowId={getRowId} />);
    expect(bodyRows()).toHaveLength(3);
    expect(screen.getByText('Mehmet')).toBeInTheDocument();
    expect(screen.getByText('41')).toBeInTheDocument();
  });

  it('keeps the rows on screen while loading again', () => {
    const { rerender } = renderWithProviders(
      <DataTable data={people} columns={columns} getRowId={getRowId} />,
    );
    const before = screen.getByText('Ayşe').closest('tr');
    rerender(<DataTable data={people} columns={columns} getRowId={getRowId} loading />);
    // Same DOM node: the row was not unmounted for the refetch.
    expect(screen.getByText('Ayşe').closest('tr')).toBe(before);
    expect(document.querySelector('[data-skeleton-row]')).toBeNull();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('shows skeleton rows only when there is no data yet', () => {
    renderWithProviders(<DataTable data={[]} columns={columns} getRowId={getRowId} loading />);
    expect(document.querySelectorAll('[data-skeleton-row]')).toHaveLength(5);
    expect(screen.queryByText('Kayıt bulunamadı')).not.toBeInTheDocument();
  });

  it('shows the empty state', () => {
    renderWithProviders(<DataTable data={[]} columns={columns} getRowId={getRowId} />);
    expect(screen.getByText('Kayıt bulunamadı')).toBeInTheDocument();
  });

  it('does not re-render rows when the parent re-renders with the same data', () => {
    const { rerender } = renderWithProviders(
      <DataTable data={people} columns={columns} getRowId={getRowId} onRowClick={() => {}} />,
    );
    expect(renderSpy).toHaveBeenCalledTimes(3);
    // New inline callbacks, same data and columns.
    rerender(
      <DataTable
        data={people}
        columns={columns}
        getRowId={(row) => String(row.id)}
        onRowClick={() => {}}
        rowActions={undefined}
      />,
    );
    expect(renderSpy).toHaveBeenCalledTimes(3);
  });

  it('reports server sort like legacy onSort: new field asc, same field toggles', () => {
    const onSortChange = vi.fn();
    const { rerender } = renderWithProviders(
      <DataTable
        data={people}
        columns={columns}
        getRowId={getRowId}
        sort={{ sortBy: null, sortDir: 'asc', onSortChange }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Yaş/ }));
    expect(onSortChange).toHaveBeenLastCalledWith('age', 'asc');

    rerender(
      <DataTable
        data={people}
        columns={columns}
        getRowId={getRowId}
        sort={{ sortBy: 'age', sortDir: 'asc', onSortChange }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Yaş/ }));
    expect(onSortChange).toHaveBeenLastCalledWith('age', 'desc');
    expect(toOrdering('age', 'desc')).toBe('-age');
    // Server mode leaves the order to the server.
    expect(within(bodyRows()[0]!).getByText('Ayşe')).toBeInTheDocument();
  });

  it('sorts loaded rows on the client without a sort prop', () => {
    renderWithProviders(<DataTable data={people} columns={columns} getRowId={getRowId} />);
    const ageHeader = screen.getByRole('button', { name: /Yaş/ });
    fireEvent.click(ageHeader);
    expect(within(bodyRows()[0]!).getByText('Mehmet')).toBeInTheDocument();
    fireEvent.click(ageHeader);
    expect(within(bodyRows()[0]!).getByText('Zeynep')).toBeInTheDocument();
  });

  it('calls the server pagination callbacks', () => {
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();
    renderWithProviders(
      <DataTable
        data={people}
        columns={columns}
        getRowId={getRowId}
        pagination={{ page: 2, pageSize: 20, total: 95, onPageChange, onPageSizeChange }}
      />,
    );
    expect(screen.getByText(/Sayfa 2 \/ 5/)).toBeInTheDocument();
    expect(screen.getByText(/21-40 \/ 95 kayıt/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '3' }));
    expect(onPageChange).toHaveBeenLastCalledWith(3);

    fireEvent.change(screen.getByLabelText('Sayfa başına'), { target: { value: '50' } });
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
    // Like legacy changePageSize, a new size starts over at page 1.
    expect(onPageChange).toHaveBeenLastCalledWith(1);
  });

  it('slices client pages', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, name: `Kişi ${i + 1}`, age: i }));
    renderWithProviders(
      <DataTable data={many} columns={columns} getRowId={getRowId} pagination={{ pageSize: 10 }} />,
    );
    expect(bodyRows()).toHaveLength(10);
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    expect(bodyRows()).toHaveLength(5);
    expect(screen.getByText('Kişi 21')).toBeInTheDocument();
  });

  it('renders row actions as buttons and folds extras into a menu', async () => {
    const onEdit = vi.fn();
    const onRowClick = vi.fn();
    renderWithProviders(
      <DataTable
        data={people.slice(0, 1)}
        columns={columns}
        getRowId={getRowId}
        onRowClick={onRowClick}
        rowActions={(row) => [
          { label: 'Düzenle', icon: 'fas fa-edit', onClick: () => onEdit(row.id) },
          { label: 'Gizli', icon: 'fas fa-eye', onClick: () => {}, hidden: true },
          { label: 'Sil', icon: 'fas fa-trash', color: 'red', onClick: () => {}, disabled: true },
        ]}
      />,
    );
    expect(screen.getByText('İşlemler')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Düzenle' }));
    expect(onEdit).toHaveBeenCalledWith(1);
    // The action click does not count as a row click.
    expect(onRowClick).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Gizli' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sil' })).toBeDisabled();

    fireEvent.click(screen.getByText('Ayşe'));
    expect(onRowClick).toHaveBeenCalledWith(people[0], 0);
  });

  it('puts actions beyond three into a menu', async () => {
    const onArchive = vi.fn();
    renderWithProviders(
      <DataTable
        data={people.slice(0, 1)}
        columns={columns}
        getRowId={getRowId}
        rowActions={() => [
          { label: 'Görüntüle', icon: 'fas fa-eye', onClick: () => {} },
          { label: 'Düzenle', icon: 'fas fa-edit', onClick: () => {} },
          { label: 'Kopyala', icon: 'fas fa-copy', onClick: () => {} },
          { label: 'Arşivle', icon: 'fas fa-archive', onClick: onArchive },
        ]}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Kopyala' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Diğer işlemler' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Arşivle/ }));
    expect(onArchive).toHaveBeenCalled();
  });

  it('selects rows through the controlled selection', () => {
    const onChange = vi.fn();
    const { rerender } = renderWithProviders(
      <DataTable
        data={people}
        columns={columns}
        getRowId={getRowId}
        selection={{ selectedIds: [], onChange }}
      />,
    );
    fireEvent.click(screen.getAllByLabelText('Satırı seç')[1]!);
    expect(onChange).toHaveBeenLastCalledWith(['2']);

    rerender(
      <DataTable
        data={people}
        columns={columns}
        getRowId={getRowId}
        selection={{ selectedIds: ['2'], onChange }}
      />,
    );
    fireEvent.click(screen.getByLabelText('Tümünü seç'));
    expect(onChange).toHaveBeenLastCalledWith(['2', '1', '3']);
  });
});

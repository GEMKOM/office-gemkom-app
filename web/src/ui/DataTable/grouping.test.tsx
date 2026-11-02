import { fireEvent, screen, within } from '@testing-library/react';
import { mockBoxSize } from '@/test/layout';
import { renderWithProviders } from '@/test/render';
import { DataTable } from './DataTable';
import { buildGroupTree, flattenGroups } from './grouping';
import type { DataTableColumn, DataTableGrouping } from './types';

interface Entry {
  id: number;
  user: string;
  month: string;
  job: string;
  hours: number;
}

const entries: Entry[] = [
  { id: 1, user: 'Zeynep', month: '2026-10', job: 'A-1', hours: 3 },
  { id: 2, user: 'Ali', month: '2026-10', job: 'A-2', hours: 2 },
  { id: 3, user: 'Zeynep', month: '2026-11', job: 'B-1', hours: 4.5 },
  { id: 4, user: 'Ali', month: '2026-11', job: 'B-2', hours: 1 },
  { id: 5, user: 'Ali', month: '2026-10', job: 'A-3', hours: 6 },
];

const columns: DataTableColumn<Entry>[] = [
  { key: 'job', header: 'İş' },
  { key: 'hours', header: 'Saat', align: 'right' },
];

const getRowId = (row: Entry) => String(row.id);

function bodyRowKinds() {
  return [...document.querySelectorAll('tbody tr')].map((tr) =>
    tr.getAttribute('data-group-row')
      ? `${tr.getAttribute('data-group-row')}:${tr.getAttribute('data-group-id')}`
      : `row:${tr.getAttribute('data-row-id')}`,
  );
}

const sum = (rows: Entry[]) => rows.reduce((total, row) => total + row.hours, 0);

describe('grouping helpers', () => {
  it('groups, sorts and nests, keeping row order inside a group', () => {
    const rows = entries.map((original, index) => ({ id: String(original.id), index, original }));
    const tree = buildGroupTree(rows, ['user', 'month'], 'asc');
    expect(tree.map((n) => n.value)).toEqual(['Ali', 'Zeynep']);
    expect(tree[0]!.children!.map((n) => n.id)).toEqual(['Ali\u001f2026-10', 'Ali\u001f2026-11']);
    expect(tree[0]!.children![0]!.rows.map((r) => r.id)).toEqual(['2', '5']);
    const flat = flattenGroups(tree, (n) => n.id !== 'Zeynep', true);
    expect(flat.map((i) => i.key)).toEqual([
      'group:Ali',
      'group:Ali\u001f2026-10',
      '2',
      '5',
      'footer:Ali\u001f2026-10',
      'group:Ali\u001f2026-11',
      '4',
      'footer:Ali\u001f2026-11',
      'footer:Ali',
      'group:Zeynep',
    ]);
  });

  it('puts empty values in one group and can keep data order or sort descending', () => {
    const rows = [{ v: null }, { v: '' }, { v: 'b' }, { v: 'a' }].map((original, index) => ({
      id: String(index),
      index,
      original,
    }));
    expect(buildGroupTree(rows, ['v'], false).map((n) => n.id)).toEqual(['__null__', 'b', 'a']);
    expect(buildGroupTree(rows, ['v'], 'desc').map((n) => n.value)).toEqual(['b', 'a', null]);
  });
});

describe('DataTable grouping', () => {
  const grouping: DataTableGrouping<Entry> = {
    by: 'user',
    footer: (group) => ({ cells: { job: 'Toplam', hours: sum(group.rows).toFixed(1) } }),
  };

  it('renders a header, the rows and a footer per group', () => {
    renderWithProviders(
      <DataTable data={entries} columns={columns} getRowId={getRowId} grouping={grouping} />,
    );
    expect(bodyRowKinds()).toEqual([
      'header:Ali',
      'row:2',
      'row:4',
      'row:5',
      'footer:Ali',
      'header:Zeynep',
      'row:1',
      'row:3',
      'footer:Zeynep',
    ]);
    const header = document.querySelector('tr[data-group-row="header"]')!;
    expect(header).toHaveTextContent('Ali');
    expect(header).toHaveTextContent('3 kayıt');
    // Footer cells line up with the columns.
    const footer = document.querySelector<HTMLElement>(
      'tr[data-group-row="footer"][data-group-id="Zeynep"]',
    )!;
    const cells = within(footer).getAllByRole('cell');
    expect(cells.map((c) => c.textContent)).toEqual(['Toplam', '7.5']);
  });

  it('collapses and expands a group from the toggle', () => {
    renderWithProviders(
      <DataTable data={entries} columns={columns} getRowId={getRowId} grouping={grouping} />,
    );
    const toggles = screen.getAllByRole('button', { name: 'Grubu daralt' });
    fireEvent.click(toggles[0]!);
    expect(bodyRowKinds()).toEqual([
      'header:Ali',
      'header:Zeynep',
      'row:1',
      'row:3',
      'footer:Zeynep',
    ]);
    const expand = screen.getByRole('button', { name: 'Grubu genişlet' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(expand);
    expect(bodyRowKinds()).toHaveLength(9);
  });

  it('starts collapsed with defaultExpanded and uses a custom header', () => {
    renderWithProviders(
      <DataTable
        data={entries}
        columns={columns}
        getRowId={getRowId}
        grouping={{
          by: 'user',
          defaultExpanded: (group) => group.value === 'Zeynep',
          header: (group) => (
            <span>
              Kullanıcı {String(group.value)}: {sum(group.rows)} saat
            </span>
          ),
        }}
      />,
    );
    expect(screen.getByText('Kullanıcı Ali: 9 saat')).toBeInTheDocument();
    expect(bodyRowKinds()).toEqual(['header:Ali', 'header:Zeynep', 'row:1', 'row:3']);
  });

  it('aligns header cells and can turn collapsing off', () => {
    renderWithProviders(
      <DataTable
        data={entries}
        columns={columns}
        getRowId={getRowId}
        rowActions={() => []}
        grouping={{
          by: 'user',
          collapsible: false,
          header: (group) => ({
            cells: { job: String(group.value), hours: sum(group.rows), _actions: 'x' },
          }),
        }}
      />,
    );
    expect(screen.queryByRole('button', { name: /Grubu/ })).not.toBeInTheDocument();
    const header = document.querySelector<HTMLElement>('tr[data-group-row="header"]')!;
    expect(
      within(header)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['Ali', '9', 'x']);
  });

  it('nests groups for several keys and sorts rows inside groups', () => {
    renderWithProviders(
      <DataTable
        data={entries}
        columns={[{ ...columns[0]!, sortable: true }, columns[1]!]}
        getRowId={getRowId}
        grouping={{ by: ['month', 'user'], sort: 'desc' }}
      />,
    );
    expect(bodyRowKinds()).toEqual([
      'header:2026-11',
      'header:2026-11\u001fZeynep',
      'row:3',
      'header:2026-11\u001fAli',
      'row:4',
      'header:2026-10',
      'header:2026-10\u001fZeynep',
      'row:1',
      'header:2026-10\u001fAli',
      'row:2',
      'row:5',
    ]);
    // Sorting by İş descending reorders rows within their group only.
    fireEvent.click(screen.getByRole('button', { name: /İş/ }));
    fireEvent.click(screen.getByRole('button', { name: /İş/ }));
    expect(bodyRowKinds().slice(-2)).toEqual(['row:5', 'row:2']);
  });

  it('virtualizes grouped rows', () => {
    const restore = mockBoxSize(400);
    const many = Array.from({ length: 1000 }, (_, i) => ({
      id: i + 1,
      user: `Kullanıcı ${String(i % 10).padStart(2, '0')}`,
      month: '2026-10',
      job: `İş ${i}`,
      hours: 1,
    }));
    renderWithProviders(
      <DataTable
        data={many}
        columns={columns}
        getRowId={getRowId}
        grouping={grouping}
        virtualize
      />,
    );
    const rendered = bodyRowKinds().filter((k) => !k.startsWith('row:undefined'));
    expect(rendered[0]).toBe('header:Kullanıcı 00');
    expect(rendered.length).toBeLessThan(60);
    restore();
  });
});

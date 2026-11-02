import type { WorkBook } from 'xlsx';
import { exportToExcel } from './exportExcel';
import type { DataTableColumn } from './types';

const writeFile = vi.fn<(book: WorkBook, name: string) => void>();
vi.mock('xlsx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('xlsx')>();
  return { ...actual, writeFile: (book: WorkBook, name: string) => writeFile(book, name) };
});

interface Row {
  id: number;
  name: string;
  amount: number;
  active: boolean;
}

const columns: DataTableColumn<Row>[] = [
  { key: 'name', header: 'Ad' },
  { key: 'amount', header: 'Tutar', exportFormat: '#,##0.00 "₺"' },
  { key: 'active', header: 'Aktif' },
  { key: 'secret', header: 'Gizli', hidden: true },
  { key: 'actions', header: 'Butonlar', exportable: false },
  { key: 'label', header: <b>JSX</b>, exportHeader: 'Etiket', exportValue: (row) => `#${row.id}` },
];

describe('exportToExcel', () => {
  it('writes visible columns with typed numbers', async () => {
    await exportToExcel(
      [
        { id: 1, name: 'Vana', amount: 1234.5, active: true },
        { id: 2, name: 'Boru', amount: 10, active: false },
      ],
      columns,
      { fileName: 'liste', sheetName: 'Ürünler' },
    );
    expect(writeFile).toHaveBeenCalledTimes(1);
    const [book, name] = writeFile.mock.calls[0]!;
    expect(name).toBe('liste.xlsx');
    expect(book.SheetNames).toEqual(['Ürünler']);
    const sheet = book.Sheets['Ürünler']!;
    expect(['A1', 'B1', 'C1', 'D1'].map((ref) => sheet[ref]?.v)).toEqual(['Ad', 'Tutar', 'Aktif', 'Etiket']);
    expect(sheet['E1']).toBeUndefined();
    expect(sheet['B2']).toMatchObject({ t: 'n', v: 1234.5, z: '#,##0.00 "₺"' });
    expect(sheet['C3']?.v).toBe('Hayır');
    expect(sheet['D2']?.v).toBe('#1');
  });
});

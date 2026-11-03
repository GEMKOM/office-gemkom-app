import { notify } from '@/ui';
import { saveBlob } from '@/ui/files';
import { csvFileName, itemsCsv, type CsvItem } from './logic';

/** Legacy exportItemsToCSV: the ERP import file, UTF-8 with a BOM for Excel. */
export function downloadItemsCsv(
  items: readonly CsvItem[] | null | undefined,
  neededDate: string | null | undefined,
  departmentRequestId?: number | string | null,
) {
  if (!items || items.length === 0) {
    notify.error('Dışa aktarılacak ürün bulunamadı');
    return;
  }
  const blob = new Blob(['\uFEFF' + itemsCsv(items, neededDate)], {
    type: 'text/csv;charset=utf-8;',
  });
  saveBlob(blob, csvFileName(departmentRequestId));
  notify.success('Ürünler CSV olarak dışa aktarıldı');
}

import { apiFetch, toPaginated, type Customer, type CustomersParams } from '@/api';
import { customerColumns } from './columns';

/** Legacy table.js default file name: `<containerId>_<YYYY-MM-DD>.xlsx`. */
function exportFileName() {
  return `customers-table-container_${new Date().toISOString().split('T')[0]}`;
}

/**
 * Port of legacy exportCustomers: walks every page of the list (no page_size,
 * as legacy) and writes one sheet. Returns the row count; 0 writes nothing.
 * Always fresh from the server, not from the list cache.
 */
export async function exportCustomers(params: Omit<CustomersParams, 'page' | 'page_size'>): Promise<number> {
  const all: Customer[] = [];
  for (let page = 1; ; page++) {
    const response = toPaginated<Customer>(
      await apiFetch<unknown>('/projects/customers/', { params: { ...params, page } }),
    );
    all.push(...response.results);
    if (!response.next || response.results.length === 0) break;
  }
  if (all.length === 0) return 0;

  // SheetJS stays out of the page bundle until the first export.
  const { exportToExcel } = await import('@/ui/DataTable/exportExcel');
  await exportToExcel(all, customerColumns, { fileName: exportFileName(), sheetName: 'Sheet1' });
  return all.length;
}

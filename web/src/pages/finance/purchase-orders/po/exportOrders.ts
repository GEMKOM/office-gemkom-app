import {
  getPurchaseOrders,
  type PurchaseOrder,
  type PurchaseOrdersParams,
} from '@/api/procurement/purchaseOrders';
import { toDate } from '@/lib/format';
import type { DataTableColumn } from '@/ui';
import { parseMoney } from '../shared';
import { orderStatusLabel, priorityLabel, remainingAmount } from './orderParts';

const amount = (value: unknown) => {
  const n = parseMoney(value);
  return Number.isFinite(n) ? n : null;
};

const EXPORT_COLUMNS: DataTableColumn<PurchaseOrder>[] = [
  { key: 'id', header: 'Sipariş No' },
  { key: 'supplier_name', header: 'Tedarikçi' },
  { key: 'purchase_request_number', header: 'PR No' },
  { key: 'status', header: 'Durum', exportValue: (o) => orderStatusLabel(o) },
  {
    key: 'total_amount',
    header: 'Toplam Tutar',
    exportValue: (o) => amount(o.total_amount),
    exportFormat: '#,##0.00',
  },
  {
    key: 'total_tax_amount',
    header: 'KDV Tutarı',
    exportValue: (o) => amount(o.total_tax_amount),
    exportFormat: '#,##0.00',
  },
  {
    key: 'remaining',
    header: 'Kalan Tutar',
    exportValue: (o) => remainingAmount(o),
    exportFormat: '#,##0.00',
  },
  {
    key: 'tax_outstanding',
    header: 'Kalan KDV Borcu',
    exportValue: (o) => amount(o.tax_outstanding),
    exportFormat: '#,##0.00',
  },
  { key: 'currency', header: 'Para Birimi' },
  { key: 'priority', header: 'Öncelik', exportValue: (o) => priorityLabel(o.priority) },
  { key: 'created_at', header: 'Oluşturulma Tarihi', exportValue: (o) => toDate(o.created_at) },
  { key: 'next_unpaid_due', header: 'Sonraki Vade', exportValue: (o) => toDate(o.next_unpaid_due) },
];

/**
 * Dışa Aktar: every order matching the status filter, one sheet. Legacy asked
 * /procurement/purchase-orders/export/, which the backend does not have
 * (it answered 404), so the sheet is built here. Returns the row count.
 */
export async function exportPurchaseOrders(
  params: Omit<PurchaseOrdersParams, 'page' | 'page_size'>,
): Promise<number> {
  const all: PurchaseOrder[] = [];
  for (let page = 1; ; page++) {
    const response = await getPurchaseOrders({ ...params, page, page_size: 100 });
    all.push(...response.results);
    if (!response.next || response.results.length === 0) break;
  }
  if (all.length === 0) return 0;
  const { exportToExcel } = await import('@/ui/DataTable/exportExcel');
  await exportToExcel(all, EXPORT_COLUMNS, {
    fileName: `purchase-orders-${new Date().toISOString().split('T')[0]}`,
    sheetName: 'Siparişler',
  });
  return all.length;
}

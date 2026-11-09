import type { DataTableColumn } from '@/ui';
import { truncate } from '../shared/columns';
import { isValidFieldValue, UNIT_CHOICES, type EditableField, type PrItem } from './model';

// itemsManager.renderItemsTable: every cell edits in place. Merged rows (with
// allocations) keep their job number and quantity: legacy let both be edited,
// but submission reads the allocations, so an edit there was silently lost.

const merged = (row: PrItem) => (row.allocations?.length ?? 0) > 0;
const valid = (field: EditableField) => (value: unknown, row: PrItem) =>
  isValidFieldValue(row, field, value) ? null : 'Geçersiz değer';

const longText = (text: string) => (text ? (text.length > 50 ? <span title={text}>{truncate(text, 50)}</span> : text) : '-');

export function itemColumns(): DataTableColumn<PrItem>[] {
  return [
    { key: 'index', header: '#', render: (_row, index) => index + 1, width: 48 },
    // Rows come from planning lines; changing the card would break the link.
    { key: 'code', header: 'Malzeme Kodu' },
    { key: 'name', header: 'Malzeme Adı', editable: { validate: valid('name') } },
    {
      key: 'job_no',
      header: 'İş No',
      render: (row) =>
        merged(row) ? row.allocations!.map((a) => `${a.job_no} (${a.quantity})`).join(', ') : row.job_no || '-',
      editable: { validate: valid('job_no'), enabled: (row) => !merged(row) },
    },
    {
      key: 'quantity',
      header: 'Miktar',
      editable: { type: 'number', min: 0, step: 0.01, validate: valid('quantity'), enabled: (row) => !merged(row) },
    },
    {
      key: 'unit',
      header: 'Birim',
      editable: { type: 'select', options: UNIT_CHOICES, validate: valid('unit') },
    },
    {
      key: 'item_description',
      header: 'Malzeme Açıklaması',
      render: (row) => longText(row.item_description),
      editable: { type: 'textarea' },
    },
    {
      key: 'specifications',
      header: 'Teknik Özellikler',
      render: (row) => longText(row.specifications || row.specs),
      editable: {
        type: 'textarea',
        value: (row) => row.specifications || row.specs || '',
        apply: (row, value) => ({ ...row, specifications: String(value ?? ''), specs: String(value ?? '') }),
      },
    },
  ];
}

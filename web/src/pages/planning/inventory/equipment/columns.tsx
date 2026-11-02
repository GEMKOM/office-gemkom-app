import { Button } from '@mantine/core';
import type { EquipmentItem } from '@/api/equipment/equipment';
import { FaIcon, StatusBadge, type DataTableColumn } from '@/ui';
import uiClasses from '@/ui/ui.module.css';

const dash = (value: unknown) =>
  value === null || value === undefined || value === '' ? '-' : String(value);
const count = (value: unknown) => (value === null || value === undefined ? '-' : String(value));

/**
 * The legacy table columns, all sortable on the server except Detay. Build
 * once per page (useMemo): Detay calls back into the page.
 */
export function equipmentColumns(
  onView: (item: EquipmentItem) => void,
): DataTableColumn<EquipmentItem>[] {
  return [
    { key: 'id', header: 'ID', sortable: true, width: 70, render: (row) => count(row.id) },
    {
      key: 'code',
      header: 'Kod',
      sortable: true,
      render: (row) => <span className={uiClasses.code}>{dash(row.code)}</span>,
    },
    {
      key: 'name',
      header: 'Ad',
      sortable: true,
      render: (row) => <strong>{dash(row.name)}</strong>,
    },
    { key: 'asset_type', header: 'Tip', sortable: true, render: (row) => dash(row.asset_type) },
    { key: 'category', header: 'Kategori', sortable: true, render: (row) => dash(row.category) },
    { key: 'location', header: 'Lokasyon', sortable: true, render: (row) => dash(row.location) },
    {
      key: 'quantity',
      header: 'Adet',
      sortable: true,
      align: 'right',
      render: (row) => count(row.quantity),
    },
    {
      key: 'available_quantity',
      header: 'Uygun',
      sortable: true,
      align: 'right',
      render: (row) => count(row.available_quantity),
    },
    {
      key: 'checked_out_quantity',
      header: 'Zimmetli',
      sortable: true,
      align: 'right',
      render: (row) => count(row.checked_out_quantity),
    },
    {
      key: 'is_active',
      header: 'Aktif',
      sortable: true,
      render: (row) =>
        row.is_active ? (
          <StatusBadge color="green">Aktif</StatusBadge>
        ) : (
          <StatusBadge color="grey">Pasif</StatusBadge>
        ),
      exportValue: (row) => (row.is_active ? 'Aktif' : 'Pasif'),
    },
    {
      key: 'detail',
      header: 'Detay',
      sortable: false,
      exportable: false,
      render: (row) => (
        <Button
          size="compact-xs"
          variant="light"
          leftSection={<FaIcon icon="fas fa-eye" />}
          onClick={(event) => {
            event.stopPropagation();
            onView(row);
          }}
        >
          Görüntüle
        </Button>
      ),
    },
  ];
}

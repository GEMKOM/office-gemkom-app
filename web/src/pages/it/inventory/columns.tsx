import { Button, Text } from '@mantine/core';
import type { ItDevice, ItDeviceUser } from '@/api/it/inventory';
import { FaIcon, StatusBadge, type DataTableColumn } from '@/ui';
import uiClasses from '@/ui/ui.module.css';

/** Legacy formatter: "Ad Soyad", or the username when there is no name. */
export function deviceUserName(user: ItDeviceUser): string {
  const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
  return fullName || user.username;
}

export function assignedUsersText(device: ItDevice): string {
  const users = device.assigned_users;
  if (!users || users.length === 0) return '-';
  return users.map(deviceUserName).join(', ');
}

/** Property entries; anything but a plain object counts as none (legacy). */
export function propertyEntries(device: ItDevice): [string, unknown][] {
  const props = device.properties;
  return props && typeof props === 'object' ? Object.entries(props) : [];
}

const yesNo = (value: boolean | undefined) => (value ? 'Evet' : 'Hayır');

function dash() {
  return (
    <Text size="sm" c="dimmed" span>
      -
    </Text>
  );
}

/**
 * The legacy table's columns (same fields, labels and sortable set). The sort
 * key is the field itself, which legacy sent as `ordering`.
 */
export function inventoryColumns(onShowProperties: (device: ItDevice) => void): DataTableColumn<ItDevice>[] {
  return [
    { key: 'id', header: 'ID', sortable: true, width: 70, render: (row) => row.id ?? '-' },
    {
      key: 'name',
      header: 'Cihaz Adı',
      sortable: true,
      render: (row) => (
        <Text size="sm" fw={600} span>
          {row.name || '-'}
        </Text>
      ),
    },
    {
      key: 'code',
      header: 'Kod',
      sortable: true,
      render: (row) => (row.code ? <span className={uiClasses.code}>{row.code}</span> : dash()),
    },
    { key: 'machine_type_label', header: 'Cihaz Tipi', sortable: true, render: (row) => row.machine_type_label || '-' },
    {
      key: 'assigned_users',
      header: 'Atanan Kullanıcılar',
      sortable: false,
      render: (row) => assignedUsersText(row),
      exportValue: (row) => assignedUsersText(row),
    },
    {
      key: 'is_active',
      header: 'Aktif',
      sortable: true,
      render: (row) =>
        row.is_active ? <StatusBadge color="green">Aktif</StatusBadge> : <StatusBadge color="grey">Pasif</StatusBadge>,
      exportValue: (row) => yesNo(row.is_active),
    },
    {
      key: 'is_under_maintenance',
      header: 'Bakımda',
      sortable: true,
      render: (row) =>
        row.is_under_maintenance ? <StatusBadge color="orange">Bakımda</StatusBadge> : dash(),
      exportValue: (row) => yesNo(row.is_under_maintenance),
    },
    {
      key: 'properties',
      header: 'Özellikler',
      sortable: false,
      render: (row) => {
        const count = propertyEntries(row).length;
        if (count === 0) return 'Yok';
        return (
          <Button
            size="compact-xs"
            variant="light"
            color="cyan"
            leftSection={<FaIcon icon="fas fa-list" />}
            onClick={(event) => {
              event.stopPropagation();
              onShowProperties(row);
            }}
          >
            Özellikler ({count})
          </Button>
        );
      },
      exportHeader: 'Özellik Sayısı',
      exportValue: (row) => propertyEntries(row).length,
    },
  ];
}

/** Legacy exportDevices columns: no assigned users, a property count at the end. */
export const inventoryExportColumns: DataTableColumn<ItDevice>[] = [
  { key: 'id', header: 'ID', exportValue: (row) => row.id ?? '' },
  { key: 'name', header: 'Cihaz Adı', exportValue: (row) => row.name || '' },
  { key: 'code', header: 'Cihaz Kodu', exportValue: (row) => row.code || '' },
  { key: 'machine_type_label', header: 'Cihaz Tipi', exportValue: (row) => row.machine_type_label || '' },
  { key: 'is_active', header: 'Aktif', exportValue: (row) => yesNo(row.is_active) },
  { key: 'is_under_maintenance', header: 'Bakımda', exportValue: (row) => yesNo(row.is_under_maintenance) },
  { key: 'properties', header: 'Özellik Sayısı', exportValue: (row) => propertyEntries(row).length },
];

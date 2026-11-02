import { Text } from '@mantine/core';
import type { WeldingTimeEntry } from '@/api/welding/timeEntries';
import { formatDate, formatTime, toNumber } from '@/lib/format';
import { StatusBadge, type DataTableColumn, type StatusFamily } from '@/ui';

const OVERTIME_BADGES: Record<string, { label: string; color: StatusFamily; multiplier: string }> =
  {
    regular: { label: 'Normal', color: 'grey', multiplier: '1x' },
    after_hours: { label: 'Fazla Mesai', color: 'yellow', multiplier: '1.5x' },
    holiday: { label: 'Tatil', color: 'red', multiplier: '2x' },
  };

/** Name and username of the row's employee, from whichever shape the backend sent. */
export function employeeNames(row: WeldingTimeEntry): { name: string | null; username: string } {
  if (row.employee_full_name) {
    return { name: row.employee_full_name, username: row.employee_username || '-' };
  }
  const emp = row.employee;
  if (emp && typeof emp === 'object') {
    const fullName =
      emp.full_name ||
      (emp.first_name && emp.last_name ? `${emp.first_name} ${emp.last_name}` : null);
    return { name: fullName, username: emp.username || '-' };
  }
  return { name: null, username: row.employee_username || '-' };
}

/** The employee's id from `employee` (id or nested) or `employee_id`. */
export function employeeIdOf(row: WeldingTimeEntry): string {
  const emp = row.employee;
  if (emp && typeof emp === 'object' && emp.id) return String(emp.id);
  if (row.employee_id) return String(row.employee_id);
  if (emp !== null && emp !== undefined && typeof emp !== 'object') return String(emp);
  return '';
}

/** Legacy hours formatter: two decimals. */
export function formatHours(value: WeldingTimeEntry['hours']): string {
  const n = toNumber(value);
  return n === null ? '-' : n.toFixed(2);
}

export const timeEntryColumns: DataTableColumn<WeldingTimeEntry>[] = [
  {
    key: 'id',
    header: 'ID',
    sortable: true,
    width: '5%',
    render: (row) => row.id || '-',
  },
  {
    key: 'employee',
    header: 'Çalışan',
    sortable: true,
    width: '15%',
    exportValue: (row) => employeeNames(row).name ?? employeeNames(row).username,
    render: (row) => {
      const { name, username } = employeeNames(row);
      if (!name) return username;
      return (
        <div>
          <Text size="sm" fw={600}>
            {name}
          </Text>
          <Text size="xs" c="dimmed">
            {username}
          </Text>
        </div>
      );
    },
  },
  {
    key: 'job_no',
    header: 'İş No',
    sortable: true,
    width: '10%',
  },
  {
    key: 'date',
    header: 'Tarih',
    sortable: true,
    width: '10%',
    render: (row) => formatDate(row.date),
  },
  {
    key: 'hours',
    header: 'Saat',
    sortable: true,
    width: '8%',
    exportValue: (row) => toNumber(row.hours),
    render: (row) =>
      row.hours === null || row.hours === undefined ? (
        '-'
      ) : (
        <Text size="sm" fw={600} ff="monospace">
          {formatHours(row.hours)}
        </Text>
      ),
  },
  {
    key: 'overtime_type',
    header: 'Mesai Tipi',
    sortable: true,
    width: '12%',
    exportValue: (row) => {
      if (!row.overtime_type) return '';
      const info = OVERTIME_BADGES[row.overtime_type];
      return info ? `${info.label} (${info.multiplier})` : row.overtime_type;
    },
    render: (row) => {
      if (!row.overtime_type) return '-';
      const info = OVERTIME_BADGES[row.overtime_type] ?? {
        label: row.overtime_type,
        color: 'grey' as const,
        multiplier: '',
      };
      return (
        <StatusBadge color={info.color}>
          {info.label}
          {info.multiplier ? ` (${info.multiplier})` : ''}
        </StatusBadge>
      );
    },
  },
  {
    key: 'description',
    header: 'Açıklama',
    sortable: true,
    width: '20%',
  },
  {
    key: 'created_at',
    header: 'Oluşturulma',
    sortable: true,
    width: '12%',
    render: (row) =>
      row.created_at ? (
        <div>
          {formatDate(row.created_at)}
          <Text size="xs" c="dimmed">
            {formatTime(row.created_at, { second: '2-digit' })}
          </Text>
        </div>
      ) : (
        '-'
      ),
  },
];

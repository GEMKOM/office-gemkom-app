import { Anchor, Group, Text } from '@mantine/core';
import { formatCurrency, formatNumber } from '@/lib/format';
import type { DataTableColumn } from '@/ui';
import uiClasses from '@/ui/ui.module.css';
import type { JobCostRow, UserCostRow } from './costAnalysis';

// Legacy shows every figure in euros.
export const euro = (value: number) => formatCurrency(value, 'EUR');
export const hours = (value: number) => formatNumber(value, 1);

const HOURS_FORMAT = '#,##0.0';
const EURO_FORMAT = '#,##0.00 "€"';

type Row = JobCostRow | UserCostRow;

function hoursColumn<T extends Row>(
  key: keyof T & string,
  header: string,
  bold = false,
): DataTableColumn<T> {
  return {
    key,
    header,
    align: 'right',
    render: (row) => (
      <Text span size="sm" fw={bold ? 600 : undefined}>
        {hours(row[key] as number)}
      </Text>
    ),
    exportFormat: HOURS_FORMAT,
  };
}

function costColumn<T extends Row>(
  key: keyof T & string,
  header: string,
  bold = false,
): DataTableColumn<T> {
  return {
    key,
    header,
    align: 'right',
    render: (row) => (
      <Text span size="sm" fw={bold ? 600 : undefined}>
        {euro(row[key] as number)}
      </Text>
    ),
    exportFormat: EURO_FORMAT,
  };
}

// Module scope so DataTable rows stay memoized. Every column sorts the loaded
// rows (legacy sortJobHoursData), the table is sortable as a whole.
export const jobCostColumns: DataTableColumn<JobCostRow>[] = [
  {
    key: 'job_no',
    header: 'İş No',
    render: (row) => <span className={uiClasses.code}>{row.job_no || '-'}</span>,
  },
  hoursColumn('weekday_work_hours', 'Hafta İçi Saat'),
  hoursColumn('after_hours_hours', 'Mesai Saat'),
  hoursColumn('sunday_hours', 'Pazar Saat'),
  costColumn('weekday_work_cost', 'Hafta İçi Maliyet'),
  costColumn('after_hours_cost', 'Mesai Maliyet'),
  costColumn('sunday_cost', 'Pazar Maliyet'),
  costColumn('total_cost', 'Toplam Maliyet', true),
  costColumn('cost_per_hour', 'Saat Başı Maliyet', true),
];

/** The user table inside the detail modal. */
export const userCostColumns: DataTableColumn<UserCostRow>[] = [
  {
    key: 'user',
    header: 'Kullanıcı',
    render: (row) => (
      <Text span size="sm" fw={600}>
        {row.user}
      </Text>
    ),
  },
  hoursColumn('weekday_work_hours', 'Hafta İçi Saat'),
  hoursColumn('after_hours_hours', 'Mesai Saat'),
  hoursColumn('sunday_hours', 'Pazar Saat'),
  hoursColumn('total_hours', 'Toplam Saat', true),
  costColumn('weekday_work_cost', 'Hafta İçi Maliyet'),
  costColumn('after_hours_cost', 'Mesai Maliyet'),
  costColumn('sunday_cost', 'Pazar Maliyet'),
  costColumn('total_cost', 'Toplam Maliyet', true),
  costColumn('cost_per_hour', 'Saat Başı Maliyet', true),
  {
    key: 'issue_keys',
    header: 'İş Anahtarları',
    sortable: false,
    render: (row) =>
      row.issue_keys.length === 0 ? (
        '-'
      ) : (
        <Group gap={4}>
          {row.issue_keys.map((key) => (
            <Anchor
              key={key}
              href={`/manufacturing/welding/tasks/list/?task=${encodeURIComponent(key)}`}
              target="_blank"
              rel="noopener noreferrer"
              size="xs"
              className={uiClasses.code}
            >
              {key}
            </Anchor>
          ))}
        </Group>
      ),
    exportValue: (row) => row.issue_keys.join(', '),
  },
];

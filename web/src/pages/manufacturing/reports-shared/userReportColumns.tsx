import { Anchor, Group, Table, Text, Tooltip } from '@mantine/core';
import type { TimerModule } from '@/api/manufacturing/counts';
import type { UserReportUser, UserTaskRow } from '@/api/manufacturing/userReport';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import {
  FaIcon,
  StatusBadge,
  type DataTableColumn,
  type DataTableFooterContext,
  type StatusFamily,
} from '@/ui';
import uiClasses from '@/ui/ui.module.css';
import { CommentButton } from './CommentButton';

/** A report row with the figures legacy renderUsersTable worked out. */
export interface UserReportRow extends UserReportUser {
  _displayName: string;
  _totalTimeInOffice: number;
  _efficiency: number;
  _warnings: string[];
}

/** Legacy getWarnings. */
export function userWarnings(user: UserReportUser, totalTimeInOffice: number): string[] {
  const warnings: string[] = [];
  const efficiency = totalTimeInOffice > 0 ? (user.total_work_hours / totalTimeInOffice) * 100 : 0;
  if (user.total_work_hours === 0) warnings.push('Kullanıcı hiç görev çalıştırmamış');
  if (efficiency < 50) warnings.push(`Verimlilik çok düşük: %${efficiency.toFixed(1)}`);
  else if (efficiency < 70) warnings.push(`Verimlilik düşük: %${efficiency.toFixed(1)}`);
  const idle = (user.total_idle_hours || 0) + (user.total_hold_hours || 0);
  if (idle > user.total_work_hours * 1.5)
    warnings.push('Boşta geçen ve bekleme süresi çalışma süresinden çok fazla');
  return warnings;
}

export function officeHours(user: UserReportUser): number {
  return (
    user.total_time_in_office_hours ||
    user.total_work_hours + user.total_idle_hours + (user.total_hold_hours || 0)
  );
}

export function toReportRow(user: UserReportUser): UserReportRow {
  const total = officeHours(user);
  return {
    ...user,
    _displayName:
      user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : user.username,
    _totalTimeInOffice: total,
    // Legacy rounds to one decimal before sorting and averaging.
    _efficiency: total > 0 ? Number(((user.total_work_hours / total) * 100).toFixed(1)) : 0,
    _warnings: userWarnings(user, total),
  };
}

/** Purple from 100%, green from 80%, yellow from 60%, red below. */
function efficiencyColor(value: number): string {
  if (value >= 100) return 'grape.7';
  if (value >= 80) return 'green.7';
  if (value >= 60) return 'yellow.8';
  return 'red.7';
}

const hours = (value: number | undefined) => formatNumber(value || 0, 2);

function Hours({ value, color }: { value: number | undefined; color: string }) {
  return (
    <Text span size="sm" fw={700} c={color}>
      {hours(value)}
    </Text>
  );
}

function Efficiency({ value }: { value: number }) {
  return (
    <Text span size="sm" fw={700} c={efficiencyColor(value)}>
      {formatNumber(value, 1)}%
    </Text>
  );
}

function Count({ value, color }: { value: number; color: StatusFamily }) {
  return <StatusBadge color={color}>{value}</StatusBadge>;
}

type CountKey =
  | 'total_tasks_completed'
  | 'total_tasks_worked_on'
  | 'total_parts_completed'
  | 'total_parts_worked_on';

/** Count columns: `undefined` shows '-' for the completed ones, 0 for the worked-on ones (legacy). */
function countColumn(key: CountKey, header: string, color: StatusFamily, dashWhenMissing: boolean) {
  return {
    key,
    header,
    sortable: true,
    accessor: (row: UserReportRow) => row[key],
    render: (row: UserReportRow) => {
      const value = row[key];
      if (value === undefined && dashWhenMissing) return '-';
      return <Count value={Number(value ?? 0)} color={color} />;
    },
  } satisfies DataTableColumn<UserReportRow>;
}

export function userReportColumns(module: TimerModule): DataTableColumn<UserReportRow>[] {
  const columns: DataTableColumn<UserReportRow>[] = [
    {
      key: '_displayName',
      header: 'Kullanıcı',
      sortable: true,
      exportValue: (row) => row._displayName,
      render: (row) => (
        <Group gap={8} wrap="nowrap">
          <FaIcon icon="fas fa-user" style={{ color: 'var(--mantine-color-dimmed)' }} />
          <span>
            {row._displayName}
            {row.first_name && row.last_name ? (
              <Text span size="xs" c="dimmed" ml={6}>
                (@{row.username})
              </Text>
            ) : null}
          </span>
          {row._warnings.length > 0 ? (
            <Tooltip label={row._warnings.join('; ')} multiline maw={320} withinPortal>
              <span>
                <StatusBadge color="yellow">
                  <FaIcon icon="fas fa-exclamation-triangle" style={{ marginRight: 4 }} />
                  Uyarı
                </StatusBadge>
              </span>
            </Tooltip>
          ) : null}
        </Group>
      ),
    },
    {
      key: 'total_work_hours',
      header: 'Çalışma Saati',
      sortable: true,
      render: (row) => <Hours value={row.total_work_hours} color="green.7" />,
    },
    {
      key: 'total_idle_hours',
      header: 'Boşta Geçen Saat',
      sortable: true,
      render: (row) => <Hours value={row.total_idle_hours} color="red.7" />,
    },
    {
      key: 'total_hold_hours',
      header: 'Bekleme Saati',
      sortable: true,
      render: (row) => <Hours value={row.total_hold_hours} color="dimmed" />,
    },
    {
      key: '_efficiency',
      header: 'Verimlilik',
      sortable: true,
      render: (row) => <Efficiency value={row._efficiency} />,
    },
    countColumn('total_tasks_completed', 'Tamamlanan Görev', 'green', true),
    countColumn('total_tasks_worked_on', 'Görev Sayısı', 'blue', false),
  ];
  if (module === 'cnc_cutting') {
    columns.push(
      countColumn('total_parts_completed', 'Tamamlanan Parça', 'yellow', true),
      countColumn('total_parts_worked_on', 'Parça (işlem)', 'blue', false),
    );
  }
  return columns;
}

function sum(rows: UserReportRow[], key: keyof UserReportRow): number {
  return rows.reduce((total, row) => {
    const value = row[key];
    if (value === undefined || value === null || value === '') return total;
    const n = Number(value);
    return total + (Number.isNaN(n) ? 0 : n);
  }, 0);
}

const COUNT_COLORS: Partial<Record<string, StatusFamily>> = {
  total_tasks_completed: 'green',
  total_tasks_worked_on: 'blue',
  total_parts_completed: 'yellow',
  total_parts_worked_on: 'blue',
};

/**
 * Port of components/table/userReportSummaryFooter.js: sums of the hour and
 * count columns over every row, the plain average of the efficiencies.
 */
export function summaryFooter(columns: DataTableColumn<UserReportRow>[]) {
  return function SummaryFooter({ allRows }: DataTableFooterContext<UserReportRow>) {
    if (allRows.length === 0) return null;
    const efficiency = allRows.length ? sum(allRows, '_efficiency') / allRows.length : 0;
    return (
      <Table.Tr style={{ background: 'var(--gk-surface-subtle)' }}>
        {columns.map((column) => {
          let content;
          if (column.key === '_displayName') {
            content = (
              <Text span size="xs" fw={700} c="dimmed">
                Özet
              </Text>
            );
          } else if (column.key === 'total_work_hours') {
            content = <Hours value={sum(allRows, 'total_work_hours')} color="green.7" />;
          } else if (column.key === 'total_idle_hours') {
            content = <Hours value={sum(allRows, 'total_idle_hours')} color="red.7" />;
          } else if (column.key === 'total_hold_hours') {
            content = <Hours value={sum(allRows, 'total_hold_hours')} color="dimmed" />;
          } else if (column.key === '_efficiency') {
            content = <Efficiency value={efficiency} />;
          } else if (COUNT_COLORS[column.key]) {
            content = (
              <Count
                value={sum(allRows, column.key as CountKey)}
                color={COUNT_COLORS[column.key]!}
              />
            );
          } else {
            content = '—';
          }
          return <Table.Td key={column.key}>{content}</Table.Td>;
        })}
        <Table.Td />
      </Table.Tr>
    );
  };
}

// ---- detail tables ----

/** A detail row with the day it belongs to, for multi-day ranges. */
export type ActivityRow = UserTaskRow & { _activityDateLabel: string; _activityDateTitle: string };

function dayLabel(date: string): string {
  return date ? formatDate(date) : '—';
}

function dayTitle(date: string): string {
  return date
    ? formatDate(date, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : 'Gün';
}

export function withDay(row: UserTaskRow, date: string): ActivityRow {
  return { ...row, _activityDateLabel: dayLabel(date), _activityDateTitle: dayTitle(date) };
}

/** Legacy formatDurationFromMinutes: "2s 5dk", "2s", "5dk". */
export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '-';
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0 && m > 0) return `${h}s ${m}dk`;
  if (h > 0) return `${h}s`;
  return `${m}dk`;
}

const text = (value: unknown) =>
  value === undefined || value === null || value === '' ? '-' : String(value);

function badgeLink(href: string, label: string) {
  return (
    <Anchor
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={uiClasses.code}
      c="inherit"
    >
      {label}
    </Anchor>
  );
}

type Col = DataTableColumn<ActivityRow>;

const dateCol: Col = {
  key: '_activityDateLabel',
  header: 'Tarih',
  sortable: true,
  render: (row) => <span title={row._activityDateTitle}>{row._activityDateLabel}</span>,
};
const timerCol: Col = {
  key: 'timer_id',
  header: '#',
  sortable: true,
  render: (row) =>
    row.timer_id
      ? badgeLink(
          `/manufacturing/reports/finished-timers/?module=machining&edit=${row.timer_id}`,
          `#${row.timer_id}`,
        )
      : '-',
};
const startCol: Col = {
  key: 'start_time',
  header: 'Başlangıç',
  sortable: true,
  render: (r) => formatDateTime(r.start_time),
};
const finishCol: Col = {
  key: 'finish_time',
  header: 'Bitiş',
  sortable: true,
  render: (r) => formatDateTime(r.finish_time),
};
const tiCol: Col = {
  key: 'task_key',
  header: 'TI No',
  sortable: true,
  render: (row) =>
    row.task_key
      ? badgeLink(`/manufacturing/machining/tasks/list/?task=${row.task_key}`, row.task_key)
      : '-',
};
const cutCol: Col = {
  key: 'task_key',
  header: 'Görev',
  sortable: true,
  render: (row) =>
    row.task_key
      ? badgeLink(
          `/planning/cnc-cutting/cuts/?cut=${encodeURIComponent(row.task_key)}`,
          row.task_key,
        )
      : '-',
};
const nameCol: Col = { key: 'task_name', header: 'Görev Adı', sortable: true };
const jobCol: Col = { key: 'job_no', header: 'İş No', sortable: true };
const durationCol: Col = {
  key: 'duration_minutes',
  header: 'Süre',
  sortable: true,
  render: (row) => formatMinutes(row.duration_minutes),
};
const estimatedCol: Col = {
  key: 'estimated_hours',
  header: 'Tahmini',
  sortable: true,
  render: (row) => (row.estimated_hours != null ? `${formatNumber(row.estimated_hours, 1)}s` : '-'),
};
const spentCol: Col = {
  key: 'total_hours_spent',
  header: 'Toplam Harcanan',
  sortable: true,
  render: (row) =>
    row.total_hours_spent != null ? `${formatNumber(row.total_hours_spent, 2)}s` : '-',
};
const machineCol: Col = { key: 'machine_name', header: 'Makine', sortable: true };
const manualCol: Col = {
  key: 'manual_entry',
  header: 'Manuel',
  sortable: true,
  render: (row) => (row.manual_entry ? <StatusBadge color="green">Manuel</StatusBadge> : '-'),
};
const commentCol: Col = {
  key: 'comment',
  header: 'Yorum',
  render: (row) => (row.comment ? <CommentButton comment={row.comment} /> : '-'),
};
const cncPartCols: Col[] = [
  { key: 'nesting_id', header: 'Nesting', sortable: true, render: (r) => text(r.nesting_id) },
  { key: 'material', header: 'Malzeme', sortable: true, render: (r) => text(r.material) },
  {
    key: 'thickness_mm',
    header: 'Kalınlık',
    sortable: true,
    render: (row) => {
      const value = row.thickness_mm;
      if (value === null || value === undefined || value === '') return '-';
      const n = Number(value);
      return Number.isNaN(n) ? String(value) : `${n} mm`;
    },
  },
  { key: 'parts_count', header: 'Parça adedi', sortable: true, render: (r) => text(r.parts_count) },
];

export interface DetailColumns {
  tasks: Col[];
  idle: Col[];
  hold: Col[];
}

/** The three detail tables; machining adds a Tarih column for multi-day ranges. */
export function detailColumns(module: TimerModule, withDate: boolean): DetailColumns {
  if (module === 'cnc_cutting') {
    return {
      tasks: [
        cutCol,
        startCol,
        finishCol,
        nameCol,
        ...cncPartCols,
        durationCol,
        estimatedCol,
        spentCol,
        machineCol,
        commentCol,
      ],
      idle: [startCol, finishCol, durationCol],
      hold: [
        cutCol,
        startCol,
        finishCol,
        nameCol,
        jobCol,
        ...cncPartCols,
        durationCol,
        estimatedCol,
        machineCol,
        manualCol,
        commentCol,
      ],
    };
  }
  const date = withDate ? [dateCol] : [];
  return {
    tasks: [
      ...date,
      timerCol,
      startCol,
      finishCol,
      tiCol,
      nameCol,
      durationCol,
      estimatedCol,
      spentCol,
      machineCol,
      commentCol,
    ],
    idle: [...date, startCol, finishCol, durationCol],
    hold: [
      ...date,
      timerCol,
      startCol,
      finishCol,
      tiCol,
      nameCol,
      jobCol,
      durationCol,
      estimatedCol,
      machineCol,
      manualCol,
      commentCol,
    ],
  };
}

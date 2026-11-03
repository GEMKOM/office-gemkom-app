import { Anchor, Text } from '@mantine/core';
import type { FinishedTimer } from '@/api/manufacturing/finishedTimers';
import { formatDateTime, formatNumber } from '@/lib/format';
import { StatusBadge, type DataTableColumn } from '@/ui';
import uiClasses from '@/ui/ui.module.css';
import { CommentButton } from './CommentButton';

/** Hours between start and finish (legacy calculateDuration); null without both. */
export function timerHours(row: FinishedTimer): number | null {
  if (!row.start_time || !row.finish_time) return null;
  return (row.finish_time - row.start_time) / 3600000;
}

const dash = (value: unknown) =>
  value === null || value === undefined || value === '' ? '-' : String(value);

function newTabLink(href: string, text: string, title?: string) {
  return (
    <Anchor
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={uiClasses.code}
      c="inherit"
      title={title}
      onClick={(event) => event.stopPropagation()}
    >
      {text}
    </Anchor>
  );
}

const machine: DataTableColumn<FinishedTimer> = { key: 'machine_name', header: 'Makine' };

// The time, duration, comment and manual columns both pages share; sortable as legacy.
const timeColumns: DataTableColumn<FinishedTimer>[] = [
  {
    key: 'start_time',
    header: 'Başlangıç',
    sortable: true,
    render: (row) => formatDateTime(row.start_time),
    exportValue: (row) => (row.start_time ? new Date(row.start_time) : null),
  },
  {
    key: 'finish_time',
    header: 'Bitiş',
    sortable: true,
    render: (row) => formatDateTime(row.finish_time),
    exportValue: (row) => (row.finish_time ? new Date(row.finish_time) : null),
  },
  {
    key: 'duration',
    header: 'Süre (Saat)',
    sortable: true,
    accessor: timerHours,
    render: (row) => {
      const hours = timerHours(row);
      return hours === null ? '-' : formatNumber(hours, 2);
    },
  },
  {
    key: 'comment',
    header: 'Yorum',
    sortable: true,
    render: (row) => (row.comment ? <CommentButton comment={row.comment} label="Yorum" /> : '-'),
  },
  {
    key: 'manual_entry',
    header: 'Manuel Giriş',
    sortable: true,
    render: (row) => (row.manual_entry ? <StatusBadge color="green">Manuel</StatusBadge> : '-'),
    exportValue: (row) => (row.manual_entry ? 'Manuel' : ''),
  },
];

const username: DataTableColumn<FinishedTimer> = {
  key: 'username',
  header: 'Kullanıcı',
  render: (row) => (
    <Text size="sm" fw={600}>
      {dash(row.username)}
    </Text>
  ),
};

/** cnc-cutting/reports/finished-timers columns. */
export const cncTimerColumns: DataTableColumn<FinishedTimer>[] = [
  username,
  {
    key: 'nesting_id',
    header: 'Nesting ID',
    // nesting_id lives on the task; ordering=nesting_id is a backend 500.
    sortable: false,
    render: (row) => {
      if (!row.nesting_id) return '-';
      if (!row.issue_key) return <span className={uiClasses.code}>{row.nesting_id}</span>;
      return newTabLink(
        `/planning/cnc-cutting/cuts?cut=${encodeURIComponent(row.issue_key)}`,
        row.nesting_id,
        'Kesim detaylarını görüntüle',
      );
    },
  },
  {
    key: 'thickness_mm',
    header: 'Kalınlık (mm)',
    render: (row) => (row.thickness_mm ? `${row.thickness_mm} mm` : '-'),
  },
  machine,
  ...timeColumns,
];

/** machining/reports/finished-timers columns. */
export const machiningTimerColumns: DataTableColumn<FinishedTimer>[] = [
  {
    key: 'id',
    header: 'ID',
    sortable: true,
    render: (row) => <span className={uiClasses.code}>{row.id}</span>,
  },
  username,
  {
    key: 'issue_key',
    header: 'TI No',
    sortable: true,
    // issue_key is a generic FK (ordering=issue_key is a backend 500); its column is object_id.
    sortKey: 'object_id',
    width: '12%',
    render: (row) =>
      row.issue_key
        ? newTabLink(
            `/manufacturing/machining/tasks/list/?task=${encodeURIComponent(row.issue_key)}`,
            row.issue_key,
          )
        : '-',
  },
  { key: 'job_no', header: 'İş No' },
  { key: 'image_no', header: 'Resim No' },
  { key: 'position_no', header: 'Poz No' },
  { key: 'quantity', header: 'Adet', render: (row) => (row.quantity ? String(row.quantity) : '-') },
  machine,
  ...timeColumns,
];

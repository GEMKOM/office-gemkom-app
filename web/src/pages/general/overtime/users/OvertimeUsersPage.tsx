import { Badge, Group, Text, Tooltip } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { overtimeUsersForDateQueryOptions, type OvertimeDateUser } from '@/api/general/overtime';
import { formatDateTime, toDate } from '@/lib/format';
import {
  DataTable,
  FaIcon,
  FilterBar,
  PageHeader,
  notify,
  useUrlFilters,
  type DataTableColumn,
  type FilterConfig,
} from '@/ui';
import uiClasses from '@/ui/ui.module.css';

/** One table row: a user's overtime entry (legacy flattened users × entries). */
export interface OvertimeUserRow {
  id: string;
  full_name: string;
  team_label: string;
  job_no: string;
  description: string;
  start_time: string | null;
  end_time: string | null;
}

/** Local today as YYYY-MM-DD. */
export function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Port of the flattening in loadOvertimeUsers: a row per entry, or one bare row for a user without entries. */
export function flattenOvertimeUsers(users: OvertimeDateUser[]): OvertimeUserRow[] {
  const rows: OvertimeUserRow[] = [];
  users.forEach((user, userIndex) => {
    const base = { full_name: user.full_name || '-', team_label: user.team_label || '-' };
    if (user.entries && user.entries.length > 0) {
      user.entries.forEach((entry, entryIndex) => {
        rows.push({
          id: `${userIndex}-${entryIndex}`,
          ...base,
          job_no: entry.job_no || '-',
          description: entry.description || '-',
          start_time: entry.request_start_at ?? null,
          end_time: entry.request_end_at ?? null,
        });
      });
    } else {
      rows.push({
        id: `${userIndex}`,
        ...base,
        job_no: '-',
        description: '-',
        start_time: null,
        end_time: null,
      });
    }
  });
  return rows;
}

function durationMs(row: OvertimeUserRow): number | null {
  const start = toDate(row.start_time);
  const end = toDate(row.end_time);
  if (!start || !end) return null;
  const diff = end.getTime() - start.getTime();
  return diff > 0 ? diff : null;
}

/** "3 saat 30 dakika" from the entry's window, '-' without one. */
export function durationText(row: OvertimeUserRow): string {
  const diff = durationMs(row);
  if (diff === null) return '-';
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} saat`);
  if (minutes > 0) parts.push(`${minutes} dakika`);
  return parts.join(' ');
}

const DESCRIPTION_MAX = 60;

const columns: DataTableColumn<OvertimeUserRow>[] = [
  {
    key: 'full_name',
    header: 'Kullanıcı Adı',
    sortable: true,
    render: (row) => (
      <Group gap={6} wrap="nowrap">
        <FaIcon icon="fas fa-user-circle" style={{ color: 'var(--mantine-color-dimmed)' }} />
        <Text size="sm" fw={500}>
          {row.full_name}
        </Text>
      </Group>
    ),
  },
  {
    key: 'team_label',
    header: 'Takım',
    sortable: true,
    render: (row) => (
      <Badge variant="default" tt="none" leftSection={<FaIcon icon="fas fa-users" />}>
        {row.team_label}
      </Badge>
    ),
  },
  {
    key: 'job_no',
    header: 'İş Numarası',
    sortable: true,
    render: (row) =>
      row.job_no && row.job_no !== '-' ? <span className={uiClasses.code}>{row.job_no}</span> : '-',
  },
  {
    key: 'description',
    header: 'Açıklama',
    sortable: false,
    render: (row) =>
      row.description.length > DESCRIPTION_MAX ? (
        <Tooltip label={row.description} multiline w={320}>
          <span>{row.description.slice(0, DESCRIPTION_MAX)}...</span>
        </Tooltip>
      ) : (
        row.description
      ),
  },
  {
    key: 'start_time',
    header: 'Başlangıç',
    sortable: true,
    render: (row) => formatDateTime(row.start_time),
    exportValue: (row) => formatDateTime(row.start_time),
  },
  {
    key: 'end_time',
    header: 'Bitiş',
    sortable: true,
    render: (row) => formatDateTime(row.end_time),
    exportValue: (row) => formatDateTime(row.end_time),
  },
  {
    key: 'duration',
    header: 'Süre',
    sortable: true,
    accessor: durationMs,
    render: durationText,
    exportValue: durationText,
  },
];

const filterConfig: FilterConfig<'date'>[] = [{ type: 'date', key: 'date', label: 'Tarih' }];

/** Port of general/overtime/users (users.js): who works overtime on a given day. */
export function OvertimeUsersPage() {
  const today = useMemo(() => localToday(), []);
  const { values, apply, reset } = useUrlFilters({ date: today });
  // Temizle (or a cleared pill) falls back to today, as legacy did.
  const date = values.date || today;

  const query = useQuery(overtimeUsersForDateQueryOptions(date));
  const rows = useMemo(() => flattenOvertimeUsers(query.data ?? []), [query.data]);

  useEffect(() => {
    if (!query.isError) return;
    const message =
      query.error instanceof Error && query.error.message ? query.error.message : 'Bilinmeyen hata';
    notify.error(`Mesai kullanıcıları yüklenirken hata oluştu: ${message}`);
  }, [query.isError, query.error, query.errorUpdatedAt]);

  return (
    <>
      <PageHeader
        title="Mesai Kullanıcıları"
        subtitle="Belirli bir tarihte mesai yapacak kullanıcıların listesi"
        icon="users"
        backTo="/general/overtime"
      />

      <DataTable
        title="Mesai Kullanıcıları"
        icon="fas fa-users"
        filters={
          <FilterBar
            inline
            filters={filterConfig}
            values={{ date }}
            onApply={(next) => apply(next)}
            onClear={reset}
          />
        }
        data={rows}
        columns={columns}
        getRowId={(row) => row.id}
        loading={query.isFetching}
        sortable
        emptyMessage="Seçilen tarihte mesai yapacak kullanıcı bulunamadı"
        onRefresh={() => void query.refetch()}
        exportable={{ fileName: `mesai-kullanicilari_${date}` }}
      />
    </>
  );
}

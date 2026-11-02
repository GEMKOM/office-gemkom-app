import { Button, TextInput } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  downloadTimerReportExport,
  teamUsersQueryOptions,
  timerReportQueryOptions,
  type TeamUser,
  type TimerReportGroupBy,
  type TimerReportParams,
  type TimerReportRow,
} from '@/api/manufacturing/machiningReports';
import { useMachines, type Machine } from '@/api/reference';
import { formatNumber } from '@/lib/format';
import {
  DataTable,
  FaIcon,
  FilterBar,
  notify,
  PageHeader,
  StatusBadge,
  useUrlFilters,
  type DataTableColumn,
  type FilterConfig,
} from '@/ui';

/** A row of the summary (legacy processReportData). */
export interface SumRow {
  group: string;
  total_hours: number;
  timer_count: number;
  avg_hours: number;
}

const GROUP_BY_OPTIONS: { value: TimerReportGroupBy; label: string }[] = [
  { value: 'user', label: 'Kullanıcı' },
  { value: 'machine', label: 'Makine' },
  { value: 'job_no', label: 'İş No' },
  { value: 'issue_key', label: 'TI Numarası' },
];

type FilterKeys = 'group_by' | 'manual_only';

const filterConfig: FilterConfig<FilterKeys>[] = [
  {
    type: 'select',
    key: 'group_by',
    label: 'Gruplama',
    placeholder: 'Kullanıcı',
    searchable: false,
    options: GROUP_BY_OPTIONS,
  },
  { type: 'checkbox', key: 'manual_only', label: 'Sadece Manuel Girişler' },
];

const EMPTY_ROWS: SumRow[] = [];
const DATETIME = 'YYYY-MM-DDTHH:mm';

/** Today 07:00 – 17:15, local (legacy setDefaultDateFilters). */
function urlDefaults() {
  const today = dayjs();
  return {
    group_by: 'user',
    start: today.hour(7).minute(0).format(DATETIME),
    finish: today.hour(17).minute(15).format(DATETIME),
    manual_only: false,
  };
}

const asGroupBy = (value: string): TimerReportGroupBy =>
  GROUP_BY_OPTIONS.some((o) => o.value === value) ? (value as TimerReportGroupBy) : 'user';

/** Legacy buildReportQuery. */
export function timerReportParams(values: {
  group_by: string;
  start: string;
  finish: string;
  manual_only: boolean;
}): TimerReportParams {
  const params: TimerReportParams = { group_by: asGroupBy(values.group_by) };
  const start = values.start ? new Date(values.start).getTime() : NaN;
  const finish = values.finish ? new Date(values.finish).getTime() : NaN;
  if (Number.isFinite(start)) params.start_after = Math.floor(start);
  if (Number.isFinite(finish)) params.start_before = Math.floor(finish);
  if (values.manual_only) params.manual_only = 'true';
  return params;
}

const count = (row: TimerReportRow) => row.timer_count || 0;
const hoursOf = (row: TimerReportRow) => row.total_hours || 0;
const average = (row: TimerReportRow) =>
  row.avg_duration || (row.timer_count ? hoursOf(row) / row.timer_count : 0);

function summaryRow(group: string, found: TimerReportRow | undefined): SumRow {
  return {
    group,
    total_hours: found ? hoursOf(found) : 0,
    timer_count: found ? count(found) : 0,
    avg_hours: found ? average(found) : 0,
  };
}

/**
 * Legacy processReportData: user and machine groups are named from the team's
 * users and the machining machines (groups without timers dropped); job and TI
 * groups come straight from the report.
 */
export function summarize(
  groupBy: TimerReportGroupBy,
  data: TimerReportRow[],
  users: TeamUser[],
  machines: Machine[],
): SumRow[] {
  let rows: SumRow[];
  if (groupBy === 'user') {
    if (users.length > 0) {
      rows = users.map((user) => {
        const name = String(user.username ?? '').toLowerCase();
        const found = data.find((row) => {
          const value = row.group_val;
          if (value === null || value === undefined) return false;
          if (value === user.id || value === String(user.id)) return true;
          return String(value).toLowerCase() === name;
        });
        return summaryRow(String(user.display_name || user.username || user.id), found);
      });
    } else {
      // User list unavailable: label the rows by username.
      rows = data.map((row) => summaryRow(row.group_val?.toString() || '-', row));
    }
  } else if (groupBy === 'machine') {
    rows = machines.map((machine) =>
      summaryRow(
        String(machine.name || machine.id),
        data.find((row) => String(row.group_val) === String(machine.id)),
      ),
    );
  } else {
    // These groupings answer with `group` rather than `group_val`.
    rows = data.map((row) => summaryRow((row.group || row.group_val)?.toString() || '-', row));
  }
  return rows.filter((row) => row.timer_count > 0);
}

const columns: DataTableColumn<SumRow>[] = [
  { key: 'group', header: 'Grup', sortable: true, render: (row) => <strong>{row.group}</strong> },
  {
    key: 'total_hours',
    header: 'Toplam Saat',
    sortable: true,
    render: (row) => <StatusBadge color="blue">{formatNumber(row.total_hours, 2)}</StatusBadge>,
  },
  {
    key: 'timer_count',
    header: 'Zamanlayıcı Sayısı',
    sortable: true,
    render: (row) => <StatusBadge color="purple">{row.timer_count}</StatusBadge>,
  },
  {
    key: 'avg_hours',
    header: 'Ortalama Saat',
    sortable: true,
    render: (row) => <StatusBadge color="green">{formatNumber(row.avg_hours, 2)}</StatusBadge>,
  },
];

const DATETIME_DELAY_MS = 400;

/** A datetime-local box (legacy addDatetimeFilter) that applies once typing settles. */
function DateTimeFilter({
  label,
  value,
  onApply,
}: {
  label: string;
  value: string;
  onApply: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  // Follow the applied value when it changes from outside (Temizle, URL).
  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }
  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => onApply(draft), DATETIME_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft, value, onApply]);
  return (
    <TextInput
      size="xs"
      type="datetime-local"
      aria-label={label}
      leftSection={
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--gk-ink-2)' }}>{label}</span>
      }
      leftSectionWidth={label.length * 7 + 14}
      w={label.length * 7 + 200}
      value={draft}
      onChange={(event) => setDraft(event.currentTarget.value)}
    />
  );
}

/** Port of manufacturing/machining/reports/sum-report (sumReport.js). */
export function SumReportPage() {
  const [defaults] = useState(urlDefaults);
  const { values, apply, reset } = useUrlFilters(defaults);
  const params = timerReportParams(values);
  const applyStart = useCallback((start: string) => apply({ start }), [apply]);
  const applyFinish = useCallback((finish: string) => apply({ finish }), [apply]);
  const groupBy = params.group_by;

  const report = useQuery({
    ...timerReportQueryOptions(params),
    placeholderData: keepPreviousData,
  });
  const users = useQuery({
    ...teamUsersQueryOptions('machining_team'),
    enabled: groupBy === 'user',
  });
  const machines = useMachines({ used_in: 'machining' }, { enabled: groupBy === 'machine' });

  const failed = report.isError || (groupBy === 'machine' && machines.isError);
  useEffect(() => {
    if (failed) notify.error('Rapor yüklenirken hata oluştu');
  }, [failed, report.errorUpdatedAt, machines.errorUpdatedAt]);

  const namesReady =
    groupBy === 'user' ? users.isSuccess : groupBy === 'machine' ? machines.isSuccess : true;
  const rows = useMemo(
    () =>
      report.data && namesReady && !failed
        ? summarize(groupBy, report.data, users.data ?? [], machines.data?.results ?? [])
        : EMPTY_ROWS,
    [report.data, namesReady, failed, groupBy, users.data, machines.data],
  );

  // Legacy updateStatistics: users or machines count the groups of that grouping.
  const totalHours = rows.reduce((sum, row) => sum + (row.total_hours || 0), 0);
  const groups = new Set(rows.map((row) => row.group)).size;
  const pending = report.isPending || !namesReady;
  const figure = (value: string) => (pending && !failed ? '–' : value);

  const [exporting, setExporting] = useState(false);
  const runExport = async () => {
    setExporting(true);
    try {
      await downloadTimerReportExport(params, `toplam-raporu-${dayjs().format('YYYY-MM-DD')}.xlsx`);
      notify.success('Rapor başarıyla indiriliyor');
    } catch (error) {
      console.error('Error exporting report:', error);
      notify.error('Rapor indirilirken hata oluştu');
    } finally {
      setExporting(false);
    }
  };

  const refresh = () => {
    void report.refetch();
    if (groupBy === 'user') void users.refetch();
    if (groupBy === 'machine') void machines.refetch();
  };

  return (
    <>
      <PageHeader
        title="Toplam Raporu"
        subtitle="Talaşlı imalat süreçlerinin gruplandırılmış analizi"
        icon="chart-pie"
        backTo="/manufacturing/machining/reports"
        stats={[
          {
            id: 'total-users-count',
            label: 'Toplam Kullanıcı',
            value: figure(String(groupBy === 'user' ? groups : 0)),
          },
          {
            id: 'total-machines-count',
            label: 'Toplam Makine',
            value: figure(String(groupBy === 'machine' ? groups : 0)),
          },
          { id: 'total-hours', label: 'Toplam Saat', value: figure(formatNumber(totalHours, 2)) },
          { id: 'total-jobs', label: 'Toplam İş', value: figure(String(groups)) },
        ]}
      />

      <DataTable
        title="Toplam Raporu"
        icon="fas fa-table"
        filters={
          <FilterBar
            inline
            filters={filterConfig}
            values={{ group_by: values.group_by, manual_only: values.manual_only }}
            onApply={(next) => apply(next)}
            onClear={() => {
              reset();
              notify.info('Filtreler temizlendi');
            }}
            extra={
              <>
                <DateTimeFilter label="Başlangıç" value={values.start} onApply={applyStart} />
                <DateTimeFilter label="Bitiş" value={values.finish} onApply={applyFinish} />
              </>
            }
          />
        }
        data={rows}
        columns={columns}
        getRowId={(row, index) => `${row.group}:${index}`}
        sortable
        defaultSort={{ sortBy: 'group', sortDir: 'asc' }}
        loading={report.isFetching || users.isFetching || machines.isFetching}
        emptyMessage="Rapor verisi bulunamadı"
        onRefresh={refresh}
        toolbar={
          <Button
            size="xs"
            variant="default"
            onClick={() => void runExport()}
            loading={exporting}
            leftSection={<FaIcon icon="fas fa-download" />}
          >
            Dışa Aktar
          </Button>
        }
      />
    </>
  );
}

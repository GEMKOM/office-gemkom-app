import { Alert, Badge, Group, Stack, Table, Text, Tooltip } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  machiningOperatorsQueryOptions,
  machiningReportQueryOptions,
  machiningSummaryQueryOptions,
  type MachiningReportParams,
  type MachiningReportRow,
} from '@/api/general/overtime';
import { formatDate, formatTime, toDate } from '@/lib/format';
import {
  DataTable,
  DetailModal,
  FaIcon,
  FilterBar,
  notify,
  PageHeader,
  StatusBadge,
  useUrlFilters,
  type DataTableColumn,
  type FilterConfig,
} from '@/ui';
import uiClasses from '@/ui/ui.module.css';
import { JobFilter } from '../shared/jobFilter';
import {
  computeTotals,
  fmtNum,
  formatHours,
  jobParam,
  num,
  operatorRows,
  summaryLines,
  type OperatorRow,
  type SummaryLine,
} from './machiningReport';

type FilterKeys = 'start_date' | 'end_date' | 'user';
type FilterState = Record<FilterKeys, string>;

/** No defaults: legacy loads every approved overtime with operations. */
export const MACHINING_DEFAULTS = {
  start_date: '',
  end_date: '',
  job_no: [] as string[],
  user: '',
};

type UrlState = typeof MACHINING_DEFAULTS;

/** Port of mapFilters: only set values go out. */
export function machiningParams(values: UrlState): MachiningReportParams {
  const out: MachiningReportParams = {};
  if (values.start_date) out.start_date = values.start_date;
  if (values.end_date) out.end_date = values.end_date;
  const jobNo = jobParam(values.job_no);
  if (jobNo) out.job_no = jobNo;
  if (values.user) out.user = values.user;
  return out;
}

type ReportRow = MachiningReportRow & { id: string };

const fmtDateTime = (iso: string | null | undefined) =>
  iso ? `${formatDate(iso)} ${formatTime(iso)}` : '-';

const summaryColumns: DataTableColumn<SummaryLine>[] = [
  {
    key: 'label',
    header: 'Kalem',
    render: (row) => (
      <Group gap={8} wrap="nowrap" pl={row.sub ? 24 : 0} style={{ whiteSpace: 'nowrap' }}>
        {row.sub ? (
          <Text span c="dimmed">
            <FaIcon icon="fas fa-level-up-alt fa-rotate-90" />
          </Text>
        ) : null}
        <Text span c={row.color}>
          <FaIcon icon={row.icon} />
        </Text>
        <Text span size="sm" fw={row.sub ? undefined : 600}>
          {row.label}
        </Text>
      </Group>
    ),
    exportValue: (row) => (row.sub ? `  ↳ ${row.label}` : row.label),
  },
  {
    key: 'value',
    header: 'Değer',
    render: (row) => (
      <Text span size="sm" fw={row.sub ? undefined : 600} style={{ whiteSpace: 'nowrap' }}>
        {row.value}
      </Text>
    ),
  },
  { key: 'share', header: 'Talebe Oranı', render: (row) => row.share || '' },
  {
    key: 'note',
    header: 'Ne gösterir?',
    render: (row) => <Text size="xs">{row.note}</Text>,
  },
];

const operatorColumns: DataTableColumn<OperatorRow>[] = [
  { key: 'full_name', header: 'Operatör', render: (row) => row.full_name || '-' },
  {
    key: 'requested_hours',
    header: 'Talep Edilen',
    align: 'right',
    render: (row) => formatHours(row.requested_hours),
    exportFormat: '#,##0.00',
  },
  {
    key: 'worked_hours',
    header: 'Mesaide Çalışılan (tüm işler)',
    align: 'right',
    render: (row) => formatHours(row.worked_hours),
    exportFormat: '#,##0.00',
  },
  {
    key: 'no_timer_hours',
    header: 'Zamanlayıcı Kaydı Olmayan',
    align: 'right',
    render: (row) =>
      row.no_timer_hours > 0 ? (
        <Text span size="sm" c="red.7">
          {formatHours(row.no_timer_hours)}
        </Text>
      ) : (
        formatHours(row.no_timer_hours)
      ),
    exportFormat: '#,##0.00',
  },
  {
    key: 'ratio',
    header: 'Çalışma Oranı',
    align: 'right',
    render: (row) => `%${fmtNum(row.ratio)}`,
    exportValue: (row) => `%${fmtNum(row.ratio)}`,
  },
];

const reportColumns: DataTableColumn<ReportRow>[] = [
  {
    key: 'date',
    header: 'Tarih',
    render: (row) => formatDate(row.date),
    exportValue: (row) => toDate(row.date),
  },
  {
    key: 'request_id',
    header: 'Talep No',
    render: (row) => <Badge size="sm">#{row.request_id}</Badge>,
  },
  { key: 'user_full_name', header: 'Operatör', render: (row) => row.user_full_name || '-' },
  {
    key: 'job_no',
    header: 'İş No',
    render: (row) =>
      row.job_no?.trim() ? (
        <span className={uiClasses.code}>{row.job_no.trim()}</span>
      ) : (
        <Text span c="dimmed" size="sm">
          -
        </Text>
      ),
    exportValue: (row) => row.job_no || '-',
  },
  {
    key: 'operation_name',
    header: 'Operasyon',
    accessor: (row) => row.operation_name || row.operation_key || '-',
  },
  { key: 'part_name', header: 'Parça', render: (row) => row.part_name || '-' },
  {
    key: 'worked',
    header: 'Çalışıldı mı?',
    render: (row) =>
      row.worked ? (
        <StatusBadge color="green">
          <FaIcon icon="fas fa-check" /> Evet
        </StatusBadge>
      ) : (
        <StatusBadge color="red">
          <FaIcon icon="fas fa-times" /> Hayır
        </StatusBadge>
      ),
    exportValue: (row) => (row.worked ? 'Evet' : 'Hayır'),
  },
  {
    key: 'worked_hours',
    header: 'Çalışılan Saat',
    accessor: (row) => num(row.worked_hours),
    render: (row) => formatHours(row.worked_hours),
    exportFormat: '#,##0.00',
  },
  {
    key: 'overtime_window_hours',
    header: 'Mesai Süresi',
    accessor: (row) => num(row.overtime_window_hours),
    render: (row) => formatHours(row.overtime_window_hours),
    exportFormat: '#,##0.00',
  },
];

// Tarih … Parça take the "Toplam" label.
const TOTAL_LABEL_SPAN = 6;

function TotalsRow({ rows }: { rows: ReportRow[] }) {
  const t = computeTotals(rows);
  return (
    <Table.Tr bg="var(--mantine-color-gray-0)">
      <Table.Td colSpan={TOTAL_LABEL_SPAN} ta="right" fw={600}>
        Toplam
      </Table.Td>
      <Table.Td fw={600}>{`${t.workedCount} / ${t.rowCount}`}</Table.Td>
      <Table.Td fw={600}>{formatHours(t.workedHours)}</Table.Td>
      <Table.Td fw={600}>
        <Tooltip
          label="Aynı mesai kaydı birden fazla operasyon satırında tekrar ettiği için bir kez sayılmıştır"
          multiline
          w={280}
          withArrow
        >
          <span>{formatHours(t.windowHours)}</span>
        </Tooltip>
      </Table.Td>
      <Table.Td />
    </Table.Tr>
  );
}

function TimerDetailModal({ row, onClose }: { row: ReportRow; onClose: () => void }) {
  const timers = row.timers ?? [];
  return (
    <DetailModal
      opened
      onClose={onClose}
      title={`${row.operation_name || row.operation_key} — ${formatDate(row.date)}`}
      icon="fas fa-stopwatch"
      size="lg"
      sections={[
        {
          title: 'Mesai Kaydı',
          icon: 'fas fa-info-circle',
          fields: [
            { label: 'Operatör', value: row.user_full_name || '-', span: 4 },
            { label: 'Talep No', value: `#${row.request_id}`, span: 4 },
            { label: 'İş No', value: row.job_no || '-', span: 4 },
            { label: 'Parça', value: row.part_name || '-', span: 4 },
            {
              label: 'Mesai süresi (bu gün)',
              value: formatHours(row.overtime_window_hours),
              span: 4,
            },
            { label: 'Mesai içinde çalışılan', value: formatHours(row.worked_hours), span: 4 },
          ],
        },
        {
          hidden: !(num(row.outside_window_hours) > 0),
          content: (
            <Alert color="gray" variant="light" icon={<FaIcon icon="fas fa-scissors" />}>
              <Text size="sm">
                Bu operasyonda o gün toplam <strong>{formatHours(row.timer_hours)}</strong> timer
                kaydı var; bunun <strong>{formatHours(row.outside_window_hours)}</strong> kadarı
                mesai penceresinin dışında kaldığı için mesaiye sayılmadı. Öğle molası her iki
                tarafta da düşülmüştür.
              </Text>
            </Alert>
          ),
        },
        {
          title: 'Timer Kayıtları',
          icon: 'fas fa-list',
          content: (
            <Table highlightOnHover verticalSpacing="xs" fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Başlangıç</Table.Th>
                  <Table.Th>Bitiş</Table.Th>
                  <Table.Th ta="right">Toplam</Table.Th>
                  <Table.Th ta="right">Mesai İçi</Table.Th>
                  <Table.Th ta="right">Mesai Dışı</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {timers.length ? (
                  timers.map((t, index) => (
                    <Table.Tr key={index}>
                      <Table.Td>{fmtDateTime(t.start_at)}</Table.Td>
                      <Table.Td>{t.finish_at ? formatTime(t.finish_at) : '-'}</Table.Td>
                      <Table.Td ta="right">{formatHours(t.total_hours)}</Table.Td>
                      <Table.Td
                        ta="right"
                        fw={num(t.in_window_hours) > 0 ? 600 : undefined}
                        c={num(t.in_window_hours) > 0 ? 'green.7' : 'dimmed'}
                      >
                        {formatHours(t.in_window_hours)}
                      </Table.Td>
                      <Table.Td ta="right" c="dimmed">
                        {formatHours(t.outside_window_hours)}
                      </Table.Td>
                    </Table.Tr>
                  ))
                ) : (
                  <Table.Tr>
                    <Table.Td colSpan={5} ta="center" c="dimmed" py="md">
                      Bu operasyonda o gün timer kaydı yok
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
              {timers.length ? (
                <Table.Tfoot bg="var(--mantine-color-gray-0)">
                  <Table.Tr>
                    <Table.Th colSpan={2} ta="right">
                      Toplam
                    </Table.Th>
                    <Table.Th ta="right">{formatHours(row.timer_hours)}</Table.Th>
                    <Table.Th ta="right">{formatHours(row.worked_hours)}</Table.Th>
                    <Table.Th ta="right">{formatHours(row.outside_window_hours)}</Table.Th>
                  </Table.Tr>
                </Table.Tfoot>
              ) : null}
            </Table>
          ),
        },
      ]}
    />
  );
}

/** Port of general/overtime/machining-report (machiningReport.js). */
export function MachiningReportPage() {
  const { values, apply, reset } = useUrlFilters(MACHINING_DEFAULTS);
  const filters = useMemo<FilterState>(
    () => ({ start_date: values.start_date, end_date: values.end_date, user: values.user }),
    [values.start_date, values.end_date, values.user],
  );
  const params = useMemo(
    () =>
      machiningParams({
        start_date: values.start_date,
        end_date: values.end_date,
        job_no: values.job_no,
        user: values.user,
      }),
    [values.start_date, values.end_date, values.job_no, values.user],
  );

  const operators = useQuery(machiningOperatorsQueryOptions());
  const report = useQuery({
    ...machiningReportQueryOptions(params),
    placeholderData: keepPreviousData,
  });
  const summary = useQuery({
    ...machiningSummaryQueryOptions(params),
    placeholderData: keepPreviousData,
  });

  // Legacy loaded both with Promise.all: either failing clears the page.
  const failed = report.isError || summary.isError;
  const error = report.error ?? summary.error;
  const errorAt = Math.max(report.errorUpdatedAt, summary.errorUpdatedAt);
  useEffect(() => {
    if (!failed) return;
    const message = error instanceof Error && error.message ? error.message : 'Bilinmeyen hata';
    notify.error(`Rapor yüklenirken hata oluştu: ${message}`);
  }, [failed, error, errorAt]);

  const rows = useMemo<ReportRow[]>(
    () =>
      failed
        ? []
        : (report.data ?? []).map((row, index) => ({
            ...row,
            id: `${row.request_id}|${row.user_id}|${row.date}|${row.operation_key}|${index}`,
          })),
    [report.data, failed],
  );
  const summaryData = failed ? null : summary.data;
  const lines = useMemo(() => summaryLines(summaryData, rows), [summaryData, rows]);
  const operatorList = useMemo(() => operatorRows(summaryData), [summaryData]);

  const [detail, setDetail] = useState<ReportRow | null>(null);

  const filterConfig = useMemo<FilterConfig<FilterKeys>[]>(
    () => [
      { type: 'date', key: 'start_date', label: 'Başlangıç Tarihi' },
      { type: 'date', key: 'end_date', label: 'Bitiş Tarihi' },
      {
        type: 'select',
        key: 'user',
        label: 'Operatör',
        placeholder: 'Tümü',
        options: (operators.data ?? []).map((u) => ({
          value: String(u.id),
          label: u.full_name || u.username || '',
        })),
      },
    ],
    [operators.data],
  );

  const loading = report.isFetching || summary.isFetching;
  const refresh = () => {
    void report.refetch();
    void summary.refetch();
  };

  return (
    <>
      <PageHeader
        title="Talaşlı İmalat Mesai Raporu"
        subtitle="Onaylı mesailerde seçilen operasyonların mesai saatleri içinde çalışılıp çalışılmadığı"
        icon="cogs"
        backTo="/general/overtime"
      />

      <Stack gap="lg">
        <FilterBar
          filters={filterConfig}
          values={filters}
          onApply={(next) => apply(next)}
          onClear={reset}
          extra={<JobFilter value={values.job_no} onChange={(job_no) => apply({ job_no })} />}
        />

        <DataTable
          title="Dönem Özeti"
          icon="fas fa-list-check"
          data={lines}
          columns={summaryColumns}
          getRowId={(row) => row.label}
          loading={loading}
          verticalSpacing="xs"
          emptyMessage="Veri yok"
          exportable={{ fileName: 'talasli-mesai-donem-ozeti' }}
        />

        <DataTable
          title="Operatör Bazında"
          icon="fas fa-user-clock"
          data={operatorList}
          columns={operatorColumns}
          getRowId={(row) => row.id}
          loading={loading}
          sortable
          verticalSpacing="xs"
          emptyMessage="Veri yok"
          exportable={{ fileName: 'talasli-mesai-operator-bazinda' }}
        />

        <DataTable
          title="Mesai / Operasyon Çalışma Raporu"
          icon="fas fa-cogs"
          data={rows}
          columns={reportColumns}
          getRowId={(row) => row.id}
          loading={loading}
          sortable
          defaultSort={{ sortBy: 'date', sortDir: 'desc' }}
          // Long report; keep the column headers in view while scrolling.
          stickyHeader
          footer={({ allRows }) => (allRows.length ? <TotalsRow rows={allRows} /> : null)}
          rowActions={() => [
            {
              key: 'detail',
              label: 'Detay',
              icon: 'fas fa-eye',
              color: 'primary',
              onClick: (row) => setDetail(row),
            },
          ]}
          onRefresh={refresh}
          emptyMessage="Seçilen kriterlerde operasyonlu onaylı mesai bulunamadı"
          exportable={{ fileName: 'talasli-mesai-raporu' }}
        />
      </Stack>

      {detail ? <TimerDetailModal row={detail} onClose={() => setDetail(null)} /> : null}
    </>
  );
}

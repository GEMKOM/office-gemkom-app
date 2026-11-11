import { Alert, Badge, Group, Progress, Stack, Table, Text, Tooltip } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  weldingOperatorsQueryOptions,
  weldingReportQueryOptions,
  type WeldingReportParams,
} from '@/api/general/overtime';
import { formatDate, toDate } from '@/lib/format';
import {
  DataTable,
  DetailModal,
  FaIcon,
  FilterBar,
  PageHeader,
  StatusBadge,
  notify,
  useUrlFilters,
  type DataTableColumn,
  type FilterConfig,
} from '@/ui';
import uiClasses from '@/ui/ui.module.css';
import { FlagRowsModal } from './FlagRowsModal';
import {
  countFlags,
  decorate,
  DEFAULT_TOLERANCE,
  flagMeta,
  fmtHours,
  fmtPercent,
  fmtSignedHours,
  isPending,
  OVERTIME_TYPE_LABELS,
  summarize,
  TOLERANCE_OPTIONS,
  totals,
  type DecoratedRow,
  type FlagCount,
  type SummaryItem,
} from './weldingReport';

type FilterKeys = 'job_no' | 'start_date' | 'end_date' | 'only_outliers' | 'tolerance' | 'user';
type FilterState = Record<FilterKeys, string>;

function toInputDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** This month so far, tolerance 0,5 saat: the legacy defaults (and what Temizle goes back to). */
export function weldingDefaults(today = new Date()): FilterState {
  return {
    job_no: '',
    start_date: toInputDate(new Date(today.getFullYear(), today.getMonth(), 1)),
    end_date: toInputDate(today),
    only_outliers: '',
    tolerance: DEFAULT_TOLERANCE,
    user: '',
  };
}

/** Port of mapFilters: only set values go out ('0' is a real tolerance). */
export function weldingParams(values: FilterState): WeldingReportParams {
  const out: WeldingReportParams = {};
  if (values.start_date) out.start_date = values.start_date;
  if (values.end_date) out.end_date = values.end_date;
  if (values.job_no) out.job_no = values.job_no;
  if (values.user) out.user = values.user;
  if (values.only_outliers) out.only_outliers = values.only_outliers;
  // A cleared tolerance pill means the default, as the legacy select had no empty option.
  out.tolerance = values.tolerance !== '' ? values.tolerance : DEFAULT_TOLERANCE;
  return out;
}

function JobList({ jobs }: { jobs: string[] }) {
  if (!jobs.length)
    return (
      <Text span c="dimmed" size="sm">
        -
      </Text>
    );
  return (
    <>
      {jobs.map((job, index) => (
        <span key={`${job}-${index}`}>
          {index > 0 ? ', ' : null}
          <span className={uiClasses.code}>{job}</span>
        </span>
      ))}
    </>
  );
}

function FlagBadges({ flags }: { flags: string[] }) {
  if (!flags.length) {
    return (
      <StatusBadge color="green">
        <FaIcon icon="fas fa-check" /> Uyumlu
      </StatusBadge>
    );
  }
  return (
    <Group gap={4}>
      {flags.map((flag) => {
        const meta = flagMeta(flag);
        return (
          <Tooltip key={flag} label={meta.hint} disabled={!meta.hint} multiline w={280} withArrow>
            <span>
              <StatusBadge color={meta.family}>
                <FaIcon icon={meta.icon} /> {meta.label}
              </StatusBadge>
            </span>
          </Tooltip>
        );
      })}
    </Group>
  );
}

function Variance({ value }: { value: number }) {
  const text = fmtSignedHours(value);
  if (Math.abs(value) < 0.005)
    return (
      <Text span size="sm" c="dimmed">
        {text}
      </Text>
    );
  return (
    <Text span size="sm" fw={600} c={value < 0 ? 'red.8' : 'blue.7'}>
      {text}
    </Text>
  );
}

const summaryColumns: DataTableColumn<SummaryItem>[] = [
  {
    key: 'label',
    header: 'Kalem',
    render: (row) => (
      <Group gap={8} wrap="nowrap">
        <Text span c={row.color}>
          <FaIcon icon={row.icon} />
        </Text>
        {row.label}
      </Group>
    ),
  },
  { key: 'value', header: 'Değer' },
  {
    key: 'note',
    header: 'Açıklama',
    render: (row) => (
      <Text size="xs" c="dimmed">
        {row.note}
      </Text>
    ),
  },
];

const flagColumns: DataTableColumn<FlagCount>[] = [
  {
    key: 'label',
    header: 'Durum',
    render: (row) => (
      <Group gap="xs" wrap="nowrap">
        <StatusBadge color={row.family}>
          <FaIcon icon={row.icon} /> {row.label}
        </StatusBadge>
        <Text size="xs" c="dimmed">
          {row.hint}
        </Text>
      </Group>
    ),
  },
  { key: 'count', header: 'Kayıt', align: 'right' },
  {
    key: 'share',
    header: 'Pay',
    render: (row) => (
      <Group gap="xs" wrap="nowrap">
        <Progress
          value={Math.min(100, row.share)}
          color="yellow"
          size="sm"
          miw={60}
          style={{ flexGrow: 1 }}
        />
        <Text size="xs" c="dimmed">
          {fmtPercent(row.share)}%
        </Text>
      </Group>
    ),
    exportValue: (row) => `${fmtPercent(row.share)}%`,
  },
];

const reportColumns: DataTableColumn<DecoratedRow>[] = [
  {
    key: 'date',
    header: 'Tarih',
    sortable: true,
    render: (row) => formatDate(row.date),
    exportValue: (row) => toDate(row.date),
  },
  {
    key: 'user_full_name',
    header: 'Kaynakçı',
    sortable: true,
    render: (row) => row.user_full_name || '-',
  },
  {
    key: 'request_label',
    header: 'Talep',
    sortable: false,
    render: (row) =>
      row.request_ids.length ? (
        <Group gap={4}>
          {row.request_ids.map((id) => (
            <Badge key={id} size="sm">
              #{id}
            </Badge>
          ))}
        </Group>
      ) : (
        <Text span c="dimmed" size="sm">
          -
        </Text>
      ),
  },
  {
    key: 'planned_jobs_label',
    header: 'Talep Edilen İş',
    sortable: true,
    render: (row) => <JobList jobs={row.planned_jobs} />,
  },
  {
    key: 'worked_jobs_label',
    header: 'Çalışılan İş',
    sortable: true,
    render: (row) => <JobList jobs={row.worked_jobs} />,
  },
  {
    key: 'planned_hours',
    header: 'Onaylı Mesai',
    sortable: true,
    render: (row) => fmtHours(row.planned_hours),
    exportFormat: '#,##0.00',
  },
  {
    key: 'logged_overtime_hours',
    header: 'İşlenen Mesai',
    sortable: true,
    render: (row) => fmtHours(row.logged_overtime_hours),
    exportFormat: '#,##0.00',
  },
  {
    key: 'variance_hours',
    header: 'Fark',
    sortable: true,
    render: (row) => <Variance value={row.variance_hours} />,
    exportFormat: '#,##0.00',
  },
  {
    key: 'logged_regular_hours',
    header: 'Normal Mesai',
    sortable: true,
    render: (row) => fmtHours(row.logged_regular_hours),
    exportFormat: '#,##0.00',
  },
  {
    key: 'flags_label',
    header: 'Durum',
    sortable: true,
    render: (row) => <FlagBadges flags={row.flags} />,
  },
];

// Columns before the first total (Tarih … Çalışılan İş) take the label.
const TOTAL_LABEL_SPAN = 5;

function TotalsRow({ rows }: { rows: DecoratedRow[] }) {
  const t = totals(rows);
  return (
    <Table.Tr bg="var(--mantine-color-gray-0)">
      <Table.Td colSpan={TOTAL_LABEL_SPAN} ta="right" fw={600}>
        {t.label}
      </Table.Td>
      <Table.Td fw={600}>{t.planned_hours}</Table.Td>
      <Table.Td fw={600}>{t.logged_overtime_hours}</Table.Td>
      <Table.Td fw={600}>{t.variance_hours}</Table.Td>
      <Table.Td fw={600}>{t.logged_regular_hours}</Table.Td>
      <Table.Td fw={600}>{t.flags_label}</Table.Td>
      <Table.Td />
    </Table.Tr>
  );
}

function WeldingDetailModal({ row, onClose }: { row: DecoratedRow; onClose: () => void }) {
  return (
    <DetailModal
      opened
      onClose={onClose}
      title={`${row.user_full_name || '-'} — ${formatDate(row.date)}`}
      icon="fas fa-fire"
      size="lg"
      sections={[
        {
          title: 'Karşılaştırma',
          icon: 'fas fa-scale-balanced',
          fields: [
            { label: 'Onaylı Mesai', value: fmtHours(row.planned_hours), span: 4 },
            { label: 'İşlenen Mesai', value: fmtHours(row.logged_overtime_hours), span: 4 },
            { label: 'Fark', value: fmtSignedHours(row.variance_hours), span: 4 },
            { label: 'Mesai Talebi', value: row.request_label, span: 4 },
            { label: 'Talep Edilen İş', value: row.planned_jobs_label, span: 4 },
            { label: 'Normal Mesai', value: fmtHours(row.logged_regular_hours), span: 4 },
            {
              label: 'Talep Açıklaması',
              value: row.planned_note,
              span: 12,
              hidden: !row.planned_note,
            },
          ],
        },
        {
          hidden: !row.flags.length,
          content: (
            <Alert
              color="yellow"
              variant="light"
              icon={<FaIcon icon="fas fa-triangle-exclamation" />}
              title="Sapmalar"
            >
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {row.flags.map((flag) => {
                  const meta = flagMeta(flag);
                  return (
                    <li key={flag}>
                      <Text size="sm" span>
                        <b>{meta.label}</b> — {meta.hint}
                      </Text>
                    </li>
                  );
                })}
              </ul>
            </Alert>
          ),
        },
        {
          title: 'Kaynak Zaman Kayıtları',
          icon: 'fas fa-list',
          content: (
            <Table striped verticalSpacing="xs" fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>İş No</Table.Th>
                  <Table.Th>Tür</Table.Th>
                  <Table.Th>Açıklama</Table.Th>
                  <Table.Th ta="right">Saat</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {row.lines?.length ? (
                  row.lines.map((line, index) => (
                    <Table.Tr key={index}>
                      <Table.Td>
                        {line.job_no ? (
                          <span className={uiClasses.code}>{line.job_no}</span>
                        ) : (
                          <Text span c="dimmed">
                            -
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        {OVERTIME_TYPE_LABELS[line.overtime_type ?? ''] ?? line.overtime_type}
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" c="dimmed">
                          {line.description || '-'}
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right">{fmtHours(line.hours)}</Table.Td>
                    </Table.Tr>
                  ))
                ) : (
                  <Table.Tr>
                    <Table.Td colSpan={4} ta="center" c="dimmed" py="md">
                      O gün için kaynak zaman kaydı girilmemiş
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          ),
        },
      ]}
    />
  );
}

/** Port of general/overtime/welding-report (weldingReport.js). */
export function WeldingReportPage() {
  const defaults = useMemo(() => weldingDefaults(), []);
  const { values, apply, reset } = useUrlFilters(defaults);
  const filters = useMemo<FilterState>(
    () => ({
      job_no: values.job_no,
      start_date: values.start_date,
      end_date: values.end_date,
      only_outliers: values.only_outliers,
      tolerance: values.tolerance,
      user: values.user,
    }),
    [
      values.job_no,
      values.start_date,
      values.end_date,
      values.only_outliers,
      values.tolerance,
      values.user,
    ],
  );

  const welders = useQuery(weldingOperatorsQueryOptions());
  const report = useQuery({
    ...weldingReportQueryOptions(weldingParams(filters)),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (!report.isError) return;
    const message =
      report.error instanceof Error && report.error.message
        ? report.error.message
        : 'Bilinmeyen hata';
    notify.error(`Rapor yüklenirken hata oluştu: ${message}`);
  }, [report.isError, report.error, report.errorUpdatedAt]);

  const rows = useMemo(
    () => (report.isError ? [] : decorate(report.data?.rows ?? [])),
    [report.data, report.isError],
  );
  const summary = useMemo(() => summarize(rows), [rows]);
  const flagCounts = useMemo(() => countFlags(rows), [rows]);
  const pendingCount = useMemo(() => rows.filter(isPending).length, [rows]);
  const dataThrough = report.isError ? null : report.data?.meta?.welding_data_through;

  const [detail, setDetail] = useState<DecoratedRow | null>(null);
  const [flagDetail, setFlagDetail] = useState<string | null>(null);

  const filterConfig = useMemo<FilterConfig<FilterKeys>[]>(
    () => [
      {
        type: 'text',
        key: 'job_no',
        label: 'İş No',
        placeholder: 'İş emri no...',
        suggestions: 'jobOrders',
      },
      { type: 'date', key: 'start_date', label: 'Başlangıç Tarihi' },
      { type: 'date', key: 'end_date', label: 'Bitiş Tarihi' },
      {
        type: 'select',
        key: 'only_outliers',
        label: 'Görünüm',
        placeholder: 'Tüm kayıtlar',
        searchable: false,
        options: [{ value: '1', label: 'Sadece sapmalar' }],
      },
      {
        type: 'select',
        key: 'tolerance',
        label: 'Tolerans',
        placeholder: '0,5 saat',
        options: TOLERANCE_OPTIONS,
      },
      {
        type: 'select',
        key: 'user',
        label: 'Kaynakçı',
        placeholder: 'Tümü',
        options: (welders.data ?? []).map((u) => ({
          value: String(u.id),
          label: u.full_name || u.username || '',
        })),
      },
    ],
    [welders.data],
  );

  const loading = report.isFetching;

  return (
    <>
      <PageHeader
        title="Kaynaklı İmalat Mesai Raporu"
        subtitle="Onaylı mesai saatleri ile kaynak zaman kayıtlarının karşılaştırması ve sapmalar"
        icon="fire"
        backTo="/general/overtime"
      />

      <Stack gap="lg">
        <FilterBar
          filters={filterConfig}
          values={filters}
          onApply={(next) => apply(next)}
          onClear={reset}
        />

        {dataThrough && pendingCount > 0 ? (
          <Alert color="blue" variant="light" icon={<FaIcon icon="fas fa-hourglass-half" />}>
            <Text size="sm">
              Kaynak zaman kayıtları en son <b>{formatDate(dataThrough)}</b> tarihine kadar
              girilmiş. Sonraki günlerdeki <b>{pendingCount}</b> kayıt{' '}
              <StatusBadge color="grey">Veri girilmemiş</StatusBadge> olarak işaretlendi ve özet
              rakamlara dahil edilmedi — bunlar çalışılmadığı anlamına gelmez, kaydın henüz
              işlenmediğini gösterir.
            </Text>
          </Alert>
        ) : null}

        <DataTable
          title="Dönem Özeti"
          icon="fas fa-list-check"
          data={summary}
          columns={summaryColumns}
          getRowId={(row) => row.label}
          loading={loading}
          verticalSpacing="xs"
          emptyMessage="Veri yok"
          exportable={{ fileName: 'kaynak-mesai-donem-ozeti' }}
        />

        <DataTable
          title="Sapma Dağılımı"
          icon="fas fa-triangle-exclamation"
          data={flagCounts}
          columns={flagColumns}
          getRowId={(row) => row.flag}
          loading={loading}
          verticalSpacing="xs"
          onRowClick={(row) => setFlagDetail(row.flag)}
          rowActions={() => [
            {
              key: 'records',
              label: 'Kayıtları göster',
              icon: 'fas fa-list',
              color: 'primary',
              onClick: (row) => setFlagDetail(row.flag),
            },
          ]}
          emptyMessage="Sapma bulunamadı — tüm kayıtlar uyumlu"
          exportable={{ fileName: 'kaynak-mesai-sapma-dagilimi' }}
        />

        <DataTable
          title="Mesai / Kaynak Zaman Karşılaştırması"
          icon="fas fa-fire"
          data={rows}
          columns={reportColumns}
          getRowId={(row) => row.id}
          loading={loading}
          sortable
          defaultSort={{ sortBy: 'date', sortDir: 'desc' }}
          pagination={{ pageSize: 25 }}
          stickyHeader
          rowStyle={(row) =>
            row.flags.length ? { backgroundColor: 'var(--mantine-color-orange-0)' } : undefined
          }
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
          emptyMessage="Seçilen kriterlerde kaynak mesai kaydı bulunamadı"
          onRefresh={() => void report.refetch()}
          exportable={{ fileName: 'kaynak-mesai-raporu' }}
        />
      </Stack>

      {flagDetail ? (
        <FlagRowsModal
          flag={flagDetail}
          rows={rows}
          onClose={() => setFlagDetail(null)}
          onOpenDay={(row) => {
            setFlagDetail(null);
            setDetail(row);
          }}
        />
      ) : null}
      {detail ? <WeldingDetailModal row={detail} onClose={() => setDetail(null)} /> : null}
    </>
  );
}

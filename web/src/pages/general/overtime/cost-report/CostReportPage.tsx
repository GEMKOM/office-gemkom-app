import { Alert, Badge, Group, Select, Stack, Text, Tooltip } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { costReportQueryOptions, type CostReportParams } from '@/api/general/overtime';
import { useUsers } from '@/api/reference/users';
import { formatDateTime, toDate } from '@/lib/format';
import {
  DataTable,
  FaIcon,
  FilterBar,
  notify,
  PageHeader,
  StatusBadge,
  useUrlFilters,
  type DataTableColumn,
  type DataTableGrouping,
  type FilterConfig,
  type PageFigure,
} from '@/ui';
import { JobFilter } from '../shared/jobFilter';
import {
  breakdownRows,
  bucketRows,
  buildJobTree,
  dataQualityNotes,
  fmtEur,
  fmtHours,
  fmtShare,
  GROUP_OPTIONS,
  GROUP_TITLES,
  groupMode,
  NO_JOB_LABEL,
  num,
  pctOfWage,
  requestRows,
  requestStatusLabel,
  STATUS_OPTIONS,
  TEAM_OPTIONS,
  teamLabel,
  type BreakdownRow,
  type BucketRow,
  type GroupMode,
  type JobChild,
  type JobParent,
  type RequestRow,
} from './costReport';
import { JobCostModal, RequestCostModal } from './CostReportModals';
import { BucketLabel, costColumns, JobLink, JobNo, ShareBar } from './parts';

type FilterKeys = 'start_date' | 'end_date' | 'status' | 'team' | 'group_by';
type FilterState = Record<FilterKeys, string>;

function toInputDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** This month so far, approved only, by team: the legacy defaults (and what Temizle goes back to). */
export function costReportDefaults(today = new Date()) {
  return {
    start_date: toInputDate(new Date(today.getFullYear(), today.getMonth(), 1)),
    end_date: toInputDate(today),
    status: 'approved',
    team: '',
    job_no: [] as string[],
    group_by: 'by_team',
    user: '',
  };
}

type UrlState = ReturnType<typeof costReportDefaults>;

/** Port of mapFilters: only set values go out; `group_by` stays on the page. */
export function costReportParams(values: Omit<UrlState, 'group_by'>): CostReportParams {
  const out: CostReportParams = {};
  if (values.start_date) out.start_date = values.start_date;
  if (values.end_date) out.end_date = values.end_date;
  // The legacy select had no empty option.
  out.status = values.status || 'approved';
  if (values.team) out.team = values.team;
  if (values.job_no.length) out.job_no = values.job_no;
  if (values.user) out.user = values.user;
  return out;
}

const filterConfig: FilterConfig<FilterKeys>[] = [
  { type: 'date', key: 'start_date', label: 'Başlangıç Tarihi' },
  { type: 'date', key: 'end_date', label: 'Bitiş Tarihi' },
  {
    type: 'select',
    key: 'status',
    label: 'Durum',
    placeholder: 'Sadece onaylı',
    searchable: false,
    options: STATUS_OPTIONS,
  },
  { type: 'select', key: 'team', label: 'Ekip', placeholder: 'Tümü', options: TEAM_OPTIONS },
  {
    type: 'select',
    key: 'group_by',
    label: 'Dağılım',
    placeholder: 'Ekibe göre',
    searchable: false,
    options: GROUP_OPTIONS,
  },
];

const hoursColumn = <T extends { hours: number }>(
  header = 'Saat',
  sortable = true,
): DataTableColumn<T> => ({
  key: 'hours',
  header,
  sortable,
  align: 'right',
  render: (row) => fmtHours(row.hours),
  exportFormat: '#,##0.00',
});

const bucketColumns: DataTableColumn<BucketRow>[] = [
  {
    key: 'label',
    header: 'Kategori',
    render: (row) => <BucketLabel icon={row.icon} color={row.color} label={row.label} />,
  },
  hoursColumn<BucketRow>('Saat', false),
  ...costColumns<BucketRow>({ sortable: false, bold: () => false }),
  {
    key: 'share',
    header: 'Maliyet Payı',
    render: (row) => <ShareBar value={row.share} color="red" />,
    exportValue: (row) => fmtShare(row.share),
  },
];

function breakdownColumns(mode: GroupMode): DataTableColumn<BreakdownRow>[] {
  const first: DataTableColumn<BreakdownRow> = {
    by_team: {
      key: 'team',
      header: 'Ekip',
      sortable: true,
      render: (row: BreakdownRow) => teamLabel(row.team),
      exportValue: (row: BreakdownRow) => teamLabel(row.team),
    },
    by_user: {
      key: 'full_name',
      header: 'Personel',
      sortable: true,
      accessor: (row: BreakdownRow) => row.full_name || row.username || '-',
      render: (row: BreakdownRow) => (
        <>
          {row.full_name || row.username || '-'}
          {row.estimated_wage ? (
            <Tooltip
              label="Bu personelin tanımlı maaşı yok; sistem ortalaması kullanıldı."
              withArrow
            >
              <Text span c="yellow.7" ml={6}>
                <FaIcon icon="fas fa-exclamation-triangle" />
              </Text>
            </Tooltip>
          ) : null}
        </>
      ),
      exportValue: (row: BreakdownRow) =>
        (row.full_name || row.username || '-') + (row.estimated_wage ? ' (tahmini ücret)' : ''),
    },
    by_job: {
      key: 'job_no',
      header: 'İş No',
      sortable: true,
      render: (row: BreakdownRow) => <JobNo jobNo={row.job_no} />,
      exportValue: (row: BreakdownRow) => row.job_no || '-',
    },
  }[mode];

  return [
    first,
    {
      key: 'request_count',
      header: 'Talep',
      sortable: true,
      align: 'right',
      render: (row) => row.request_count ?? 0,
    },
    {
      key: 'entry_count',
      header: 'Kayıt',
      sortable: true,
      align: 'right',
      render: (row) => row.entry_count ?? 0,
    },
    hoursColumn<BreakdownRow>(),
    ...costColumns<BreakdownRow>(),
    {
      key: 'share',
      header: 'Pay',
      sortable: true,
      align: 'right',
      render: (row) => fmtShare(row.share),
      exportValue: (row) => fmtShare(row.share),
    },
  ];
}

function RequestStatus({ row }: { row: RequestRow }) {
  return (
    <Group gap={4} wrap="nowrap">
      <StatusBadge color={row.status === 'approved' ? 'green' : 'yellow'}>
        {requestStatusLabel(row.status)}
      </StatusBadge>
      {row.is_partial ? (
        <Tooltip
          label="Bu talep seçilen dönemin dışına taşıyor; sadece dönem içindeki kısmı hesaplandı."
          multiline
          w={260}
          withArrow
        >
          <Badge size="sm" color="gray">
            kısmi
          </Badge>
        </Tooltip>
      ) : null}
    </Group>
  );
}

const requestColumns: DataTableColumn<RequestRow>[] = [
  {
    key: 'id',
    header: 'Talep No',
    sortable: true,
    render: (row) => <Badge size="sm">#{row.id}</Badge>,
  },
  {
    key: 'counted_start_at',
    header: 'Başlangıç',
    sortable: true,
    render: (row) => formatDateTime(row.counted_start_at),
    exportValue: (row) => toDate(row.counted_start_at),
  },
  {
    key: 'counted_end_at',
    header: 'Bitiş',
    sortable: true,
    render: (row) => formatDateTime(row.counted_end_at),
    exportValue: (row) => toDate(row.counted_end_at),
  },
  {
    key: 'team',
    header: 'Ekip',
    sortable: true,
    render: (row) => teamLabel(row.team),
    exportValue: (row) => teamLabel(row.team),
  },
  {
    key: 'requester_name',
    header: 'Talep Eden',
    sortable: true,
    render: (row) => row.requester_name || '-',
  },
  {
    key: 'entry_count',
    header: 'Kişi',
    sortable: true,
    align: 'right',
    render: (row) => (
      <Badge size="sm" variant="light" color="gray">
        {row.entry_count ?? 0}
      </Badge>
    ),
  },
  hoursColumn<RequestRow>('Toplam Saat'),
  ...costColumns<RequestRow>(),
  {
    key: 'status',
    header: 'Durum',
    sortable: true,
    render: (row) => <RequestStatus row={row} />,
    exportValue: (row) => requestStatusLabel(row.status) + (row.is_partial ? ' (kısmi)' : ''),
  },
];

/** The job tree's open line: a parent (group header) or one of its sub-jobs. */
type OpenJob = { key: string; parent: JobParent | null };

function jobTreeColumns(open: (job: OpenJob) => void): DataTableColumn<JobChild>[] {
  return [
    {
      key: 'parent_job_no',
      header: 'Ana İş No',
      exportOnly: true,
      exportValue: (row) => row.parentKey || NO_JOB_LABEL,
    },
    {
      key: 'job_no',
      header: 'İş No',
      render: (row) => (
        <span style={{ paddingLeft: 24 }}>
          <JobLink jobNo={row.job_no} onOpen={() => open({ key: row.job_no, parent: null })} />
        </span>
      ),
      exportValue: (row) => row.job_no || NO_JOB_LABEL,
    },
    { key: 'request_count', header: 'Talep', align: 'right' },
    { key: 'entry_count', header: 'Kayıt', align: 'right' },
    hoursColumn<JobChild>('Saat', false),
    ...costColumns<JobChild>({ sortable: false, bold: () => false }),
    {
      key: 'share',
      header: 'Pay',
      render: (row) => <ShareBar value={row.share} color="green" />,
      exportValue: (row) => fmtShare(row.share),
    },
  ];
}

function JobTreeTable({
  tree,
  loading,
  onOpen,
  resetKey,
}: {
  tree: JobParent[];
  loading: boolean;
  onOpen: (job: OpenJob) => void;
  resetKey: number;
}) {
  const parents = useMemo(() => new Map(tree.map((p) => [p.key, p])), [tree]);
  // Parents sorted by cost, sub-jobs by cost inside; the groups keep this order.
  const rows = useMemo(() => tree.flatMap((p) => p.children), [tree]);
  const columns = useMemo(() => jobTreeColumns(onOpen), [onOpen]);

  const grouping = useMemo<DataTableGrouping<JobChild>>(() => {
    // Filtered views are small enough to read at a glance; a broad period
    // would be a wall of sub-jobs, so start collapsed there.
    const small = tree.length <= 5;
    const parentOf = (value: unknown) => parents.get(String(value ?? ''));
    return {
      by: 'parentKey',
      sort: false,
      // Legacy: a parent whose only sub-job is itself has no toggle and stays closed.
      collapsible: (group) => Boolean(parentOf(group.value)?.expandable),
      defaultExpanded: (group) => small && Boolean(parentOf(group.value)?.expandable),
      header: (group) => {
        const p = parentOf(group.value);
        if (!p) return null;
        return {
          cells: {
            job_no: (
              <Group gap="xs" wrap="nowrap" component="span">
                <strong>
                  <JobLink jobNo={p.key} onOpen={() => onOpen({ key: p.key, parent: p })} />
                </strong>
                {p.expandable ? (
                  <Badge size="sm" variant="light" color="gray">
                    {p.child_count} alt iş
                  </Badge>
                ) : null}
              </Group>
            ),
            request_count: <strong>{p.request_count}</strong>,
            entry_count: <strong>{p.entry_count}</strong>,
            hours: <strong>{fmtHours(p.hours)}</strong>,
            wage_cost_eur: fmtEur(p.wage_cost_eur),
            employer_cost_eur: (
              <Text span size="sm" c="dimmed">
                {fmtEur(p.employer_cost_eur)}
              </Text>
            ),
            cost_eur: <strong>{fmtEur(p.cost_eur)}</strong>,
            share: <ShareBar value={p.share} color="green" />,
          },
        };
      },
    };
  }, [tree, parents, onOpen]);

  return (
    <DataTable
      // Like legacy, every load starts from the default expansion.
      key={resetKey}
      title="İş Emri Numarasına Göre Dağılım"
      icon="fas fa-sitemap"
      data={rows}
      columns={columns}
      getRowId={(row) => row.id}
      loading={loading}
      grouping={grouping}
      verticalSpacing="xs"
      emptyMessage="Seçilen dönemde iş emrine bağlı mesai kaydı bulunamadı"
      exportable={{ fileName: 'mesai-maliyet-is-emri-dagilimi' }}
    />
  );
}

/** Port of general/overtime/cost-report (costReport.js). */
export function CostReportPage() {
  const defaults = useMemo(() => costReportDefaults(), []);
  const { values, apply, reset } = useUrlFilters(defaults);
  const mode = groupMode(values.group_by);
  const filters = useMemo<FilterState>(
    () => ({
      start_date: values.start_date,
      end_date: values.end_date,
      status: values.status,
      team: values.team,
      group_by: values.group_by,
    }),
    [values.start_date, values.end_date, values.status, values.team, values.group_by],
  );
  const params = useMemo(
    () =>
      costReportParams({
        start_date: values.start_date,
        end_date: values.end_date,
        status: values.status,
        team: values.team,
        job_no: values.job_no,
        user: values.user,
      }),
    [values.start_date, values.end_date, values.status, values.team, values.job_no, values.user],
  );

  const users = useUsers({ is_active: true });
  const report = useQuery({
    ...costReportQueryOptions(params),
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

  // A failed load clears every table, like legacy clearAll().
  const data = report.isError ? undefined : report.data;
  const forbidden = data === null;
  const loaded = data ?? null;

  const buckets = useMemo(
    () => (loaded ? bucketRows(loaded.by_bucket, loaded.summary.total_cost_eur) : []),
    [loaded],
  );
  const jobTree = useMemo(() => (loaded ? buildJobTree(loaded) : []), [loaded]);
  const breakdown = useMemo(() => (loaded ? breakdownRows(loaded, mode) : []), [loaded, mode]);
  const breakdownCols = useMemo(() => breakdownColumns(mode), [mode]);
  const requests = useMemo(() => (loaded ? requestRows(loaded) : []), [loaded]);
  const notes = useMemo(() => (loaded ? dataQualityNotes(loaded) : []), [loaded]);

  const [openRequest, setOpenRequest] = useState<number | null>(null);
  const [openJob, setOpenJob] = useState<OpenJob | null>(null);
  const request =
    openRequest !== null ? loaded?.requests.find((r) => r.id === openRequest) : undefined;

  const stats = useMemo<PageFigure[] | undefined>(() => {
    if (!loaded) return undefined;
    const s = loaded.summary;
    return [
      { label: 'Toplam Mesai Maliyeti (SGK dahil)', value: fmtEur(s.total_cost_eur) },
      { label: 'Ücret', value: fmtEur(s.total_wage_cost_eur) },
      {
        label: `SGK / İşveren Payı (%${pctOfWage(s.employer_overhead_rate)})`,
        value: fmtEur(s.total_employer_cost_eur),
      },
      { label: 'Toplam Mesai Saati', value: fmtHours(s.total_hours) },
      { label: 'Ortalama Saat Maliyeti (SGK dahil)', value: fmtEur(s.avg_cost_per_hour_eur) },
      { label: 'Mesai Yapan Kişi', value: num(s.user_count) },
      { label: 'Talep Sayısı', value: num(s.request_count) },
    ];
  }, [loaded]);

  const userOptions = useMemo(
    () =>
      (users.data ?? []).map((u) => ({ value: String(u.id), label: u.full_name || u.username })),
    [users.data],
  );

  const loading = report.isFetching;

  return (
    <>
      <PageHeader
        title="Mesai Maliyet Raporu"
        subtitle="Seçilen dönemdeki toplam mesai maliyeti — ekip, kişi ve iş bazında dağılım"
        icon="coins"
        backTo="/general/overtime"
        stats={stats}
      />

      <Stack gap="lg">
        <FilterBar
          filters={filterConfig}
          values={filters}
          // A cleared Durum / Dağılım pill goes back to its default: neither had an empty option.
          onApply={(next) =>
            apply({
              ...next,
              status: next.status || 'approved',
              group_by: next.group_by || 'by_team',
            })
          }
          onClear={reset}
          extra={
            <Group gap="xs">
              <JobFilter value={values.job_no} onChange={(job_no) => apply({ job_no })} />
              {users.isError ? null : (
                <Select
                  size="xs"
                  w={220}
                  aria-label="Personel"
                  placeholder="Personel: Tümü"
                  searchable
                  clearable
                  data={userOptions}
                  value={values.user || null}
                  onChange={(user) => apply({ user: user ?? '' })}
                  nothingFoundMessage="Sonuç bulunamadı"
                  comboboxProps={{ withinPortal: true }}
                />
              )}
            </Group>
          }
        />

        {forbidden ? (
          <Alert color="red" variant="light" icon={<FaIcon icon="fas fa-lock" />}>
            Bu raporu görüntüleme yetkiniz yok. Mesai maliyet raporu için{' '}
            <strong>maliyet görüntüleme</strong> yetkisi gerekir.
          </Alert>
        ) : notes.length ? (
          <Alert
            color="yellow"
            variant="light"
            icon={<FaIcon icon="fas fa-exclamation-triangle" />}
            title="Maliyet doğruluğu uyarısı"
          >
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {notes.map((note) => (
                <li key={note.text}>
                  <Text size="sm" span>
                    <strong>{note.count}</strong> {note.text}
                  </Text>
                </li>
              ))}
            </ul>
          </Alert>
        ) : null}

        <DataTable
          title="Ücret Katsayısına Göre Dağılım"
          icon="fas fa-layer-group"
          data={buckets}
          columns={bucketColumns}
          getRowId={(row) => row.key}
          loading={loading}
          verticalSpacing="xs"
          emptyMessage="Veri yok"
          exportable={{ fileName: 'mesai-maliyet-katsayi-dagilimi' }}
        />

        <JobTreeTable
          tree={jobTree}
          loading={loading}
          onOpen={setOpenJob}
          resetKey={report.dataUpdatedAt}
        />

        <DataTable
          key={mode}
          title={GROUP_TITLES[mode]}
          icon="fas fa-chart-pie"
          data={breakdown}
          columns={breakdownCols}
          getRowId={(row, index) =>
            `${row.team ?? ''}|${row.user_id ?? row.username ?? ''}|${row.job_no ?? ''}|${index}`
          }
          loading={loading}
          sortable
          pagination={{ pageSize: 15 }}
          emptyMessage="Seçilen dönemde mesai kaydı bulunamadı"
          exportable={{ fileName: 'mesai-maliyet-dagilim' }}
        />

        <DataTable
          title="Mesai Talepleri"
          icon="fas fa-clock"
          data={requests}
          columns={requestColumns}
          getRowId={(row) => String(row.id)}
          loading={loading}
          sortable
          pagination={{ pageSize: 20 }}
          rowActions={() => [
            {
              key: 'detail',
              label: 'Detay',
              icon: 'fas fa-eye',
              color: 'primary',
              onClick: (row) => {
                if (loaded?.requests.some((r) => r.id === row.id)) setOpenRequest(row.id);
                else notify.error('Talep detayı bulunamadı');
              },
            },
          ]}
          onRefresh={() => void report.refetch()}
          emptyMessage="Seçilen dönemde mesai talebi bulunamadı"
          exportable={{ fileName: 'mesai-talepleri-maliyet' }}
        />
      </Stack>

      {openRequest !== null && request ? (
        <RequestCostModal request={request} onClose={() => setOpenRequest(null)} />
      ) : null}
      {openJob && loaded ? (
        <JobCostModal
          report={loaded}
          jobKey={openJob.key}
          parent={openJob.parent}
          onClose={() => setOpenJob(null)}
        />
      ) : null}
    </>
  );
}

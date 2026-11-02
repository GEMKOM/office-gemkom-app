import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import {
  projectsReportQueryOptions,
  type ProjectReportRow,
  type ProjectsReportParams,
} from '@/api/finance/projectsReport';
import {
  DataTable,
  errorMessage,
  FilterBar,
  fromOrdering,
  notify,
  PageHeader,
  toOrdering,
  useUrlFilters,
  type FilterConfig,
} from '@/ui';
import { projectReportColumns } from './columns';

// The legacy page kept nothing in the URL; these keys are the API params.
const URL_DEFAULTS = {
  job_no: '',
  job_prefix: '',
  created_gte: '',
  created_lte: '',
  include_empty: '',
  ordering: 'job_no',
};

type FilterKeys = 'job_no' | 'job_prefix' | 'created_gte' | 'created_lte' | 'include_empty';
type FilterState = Record<FilterKeys, string>;

const filterConfig: FilterConfig<FilterKeys>[] = [
  {
    type: 'text',
    key: 'job_no',
    label: 'İş Numarası',
    placeholder: 'İş numarası giriniz',
    span: 3,
  },
  { type: 'text', key: 'job_prefix', label: 'İş Öneki', placeholder: 'İş öneki giriniz', span: 3 },
  { type: 'date', key: 'created_gte', label: 'Başlangıç Tarihi', span: 3 },
  { type: 'date', key: 'created_lte', label: 'Bitiş Tarihi', span: 3 },
  {
    type: 'select',
    key: 'include_empty',
    label: 'Boş Projeler',
    placeholder: 'Tüm Projeler',
    searchable: false,
    options: [
      { value: 'true', label: 'Boş Projeler Dahil' },
      { value: 'false', label: 'Sadece Aktif Projeler' },
    ],
  },
];

const EMPTY_FILTERS: FilterState = {
  job_no: '',
  job_prefix: '',
  created_gte: '',
  created_lte: '',
  include_empty: '',
};
const EMPTY_ROWS: ProjectReportRow[] = [];

/** Legacy table.js default export name: `<containerId>_<YYYY-MM-DD>`. */
function exportFileName() {
  return `table-placeholder_${new Date().toISOString().split('T')[0]}`;
}

/** Port of finance/reports/projects (projects.js). */
export function ProjectsReportPage() {
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const filters = useMemo<FilterState>(
    () => ({
      job_no: values.job_no,
      job_prefix: values.job_prefix,
      created_gte: values.created_gte,
      created_lte: values.created_lte,
      include_empty: values.include_empty,
    }),
    [
      values.job_no,
      values.job_prefix,
      values.created_gte,
      values.created_lte,
      values.include_empty,
    ],
  );
  const sort = fromOrdering(values.ordering || 'job_no');
  const ordering = toOrdering(sort.sortBy, sort.sortDir) ?? 'job_no';

  const params: ProjectsReportParams = { ...filters, ordering };
  const report = useQuery({
    ...projectsReportQueryOptions(params),
    placeholderData: keepPreviousData,
  });
  // Legacy empties the table when a load fails.
  const rows = report.isError ? EMPTY_ROWS : (report.data ?? EMPTY_ROWS);

  useEffect(() => {
    if (report.isError)
      notify.error(`Proje raporu yüklenirken hata oluştu: ${errorMessage(report.error)}`);
  }, [report.isError, report.errorUpdatedAt, report.error]);

  const figure = (value: number) => (report.isPending ? '–' : value.toLocaleString('tr-TR'));

  return (
    <>
      <PageHeader
        title="Proje Raporu"
        subtitle="Proje bazlı satın alma analizleri ve maliyet metrikleri"
        backTo="/finance/reports"
        stats={[{ id: 'projects-count', label: 'Proje', value: figure(rows.length) }]}
      />

      <DataTable
        title="Proje Raporu"
        filters={
          <FilterBar
            inline
            filters={filterConfig}
            values={filters}
            onApply={(next) => apply(next)}
            onClear={() => apply(EMPTY_FILTERS)}
          />
        }
        data={rows}
        columns={projectReportColumns}
        getRowId={(row, index) => `${row.job_no}-${index}`}
        loading={report.isFetching}
        sort={{
          sortBy: sort.sortBy,
          sortDir: sort.sortDir,
          onSortChange: (sortBy, sortDir) =>
            apply({ ordering: toOrdering(sortBy, sortDir) ?? 'job_no' }),
        }}
        emptyMessage="Proje raporu verisi bulunamadı."
        onRefresh={() => void report.refetch()}
        exportable={{ fileName: exportFileName() }}
      />
    </>
  );
}

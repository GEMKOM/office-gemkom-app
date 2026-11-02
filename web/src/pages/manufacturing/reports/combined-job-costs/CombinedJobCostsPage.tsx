import { Text } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { combinedJobCostsQueryOptions } from '@/api/jobCosts/combinedJobCosts';
import {
  DataTable,
  FilterBar,
  fromOrdering,
  notify,
  PageHeader,
  StatCards,
  toOrdering,
  useUrlFilters,
  type FilterConfig,
  type RowAction,
} from '@/ui';
import uiClasses from '@/ui/ui.module.css';
import { combinedJobCostColumns, hours, toCombinedRow, type CombinedJobCostRow } from './columns';
import { MachiningDetailsModal, WeldingDetailsModal } from './DepartmentEntriesModal';
import { JobDetailsModal } from './JobDetailsModal';

const DEFAULT_ORDERING = '-combined_total_hours';
const URL_DEFAULTS = { job_no: '', ordering: DEFAULT_ORDERING };

const filterConfig: FilterConfig<'job_no'>[] = [
  {
    type: 'text',
    key: 'job_no',
    label: 'İş No',
    placeholder: 'İş numarası girin (isteğe bağlı)',
    span: 8,
  },
];

const EMPTY_ROWS: CombinedJobCostRow[] = [];

/** Port of manufacturing/reports/combined-job-costs (combinedJobCosts.js). */
export function CombinedJobCostsPage() {
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const filters = useMemo(() => ({ job_no: values.job_no }), [values.job_no]);
  const sort = fromOrdering(values.ordering || DEFAULT_ORDERING);

  // The server orders (legacy handleSort); every row comes in one response
  // and the table pages them.
  const list = useQuery({
    ...combinedJobCostsQueryOptions({
      job_no: filters.job_no || undefined,
      ordering: toOrdering(sort.sortBy, sort.sortDir),
    }),
    placeholderData: keepPreviousData,
  });
  const rows = useMemo(() => list.data?.results.map(toCombinedRow) ?? EMPTY_ROWS, [list.data]);

  useEffect(() => {
    if (list.isError) notify.error('Veri yüklenirken bir hata oluştu. Lütfen sayfayı yenileyin.');
  }, [list.isError, list.errorUpdatedAt]);

  // Legacy updateStatistics: the first job with the most hours.
  const mostHours = useMemo(
    () =>
      rows.reduce<CombinedJobCostRow | null>(
        (max, row) => (!max || row.combined_total_hours > max.combined_total_hours ? row : max),
        null,
      ),
    [rows],
  );

  // The job modal stays open under a department modal, as legacy stacked them.
  const [detailRow, setDetailRow] = useState<CombinedJobCostRow | null>(null);
  const [department, setDepartment] = useState<'machining' | 'welding' | null>(null);
  const closeJob = useCallback(() => {
    setDetailRow(null);
    setDepartment(null);
  }, []);
  const closeDepartment = useCallback(() => setDepartment(null), []);

  const rowActions = (row: CombinedJobCostRow): RowAction<CombinedJobCostRow>[] => [
    {
      key: 'details',
      label: 'İş Detaylarını Görüntüle',
      icon: 'fas fa-info-circle',
      color: 'primary',
      onClick: () => setDetailRow(row),
    },
  ];

  return (
    <>
      <PageHeader
        title="İş Maliyeti Raporu"
        subtitle="İş maliyeti analizi. Tüm iş numaraları görüntülenir, belirli bir iş numarası için filtreleme yapabilirsiniz."
        icon="fas fa-calculator"
        backTo="/manufacturing/reports/"
        backLabel="Raporlara Dön"
      />

      <StatCards
        loading={list.isPending}
        cards={[
          {
            id: 'most-hours-job',
            title: 'En Çok Çalışılan İş',
            icon: 'fas fa-chart-bar',
            color: 'success',
            value: mostHours ? (
              <>
                <span className={uiClasses.code}>{mostHours.job_no}</span>
                <Text size="xs" c="dimmed" fw={500}>
                  {hours(mostHours.combined_total_hours)} saat
                </Text>
              </>
            ) : (
              '-'
            ),
          },
        ]}
      />

      <DataTable
        title="İş Maliyeti Raporu"
        filters={
          <FilterBar
            inline
            filters={filterConfig}
            values={filters}
            onApply={(next) => apply(next)}
            onClear={() => apply({ job_no: '' })}
          />
        }
        data={rows}
        columns={combinedJobCostColumns}
        getRowId={(row) => row.job_no}
        loading={list.isFetching}
        sort={{
          sortBy: sort.sortBy,
          sortDir: sort.sortDir,
          onSortChange: (sortBy, sortDir) =>
            apply({ ordering: toOrdering(sortBy, sortDir) ?? DEFAULT_ORDERING }),
        }}
        pagination
        rowActions={rowActions}
        onRowClick={(row) => setDetailRow(row)}
        emptyMessage="Veri bulunamadı"
        exportable={{ fileName: 'birlesik-is-maliyeti-raporu' }}
        onRefresh={() => void list.refetch()}
      />

      {detailRow ? (
        <JobDetailsModal
          row={detailRow}
          onClose={closeJob}
          onShowMachining={() => setDepartment('machining')}
          onShowWelding={() => setDepartment('welding')}
        />
      ) : null}
      {detailRow && department === 'machining' ? (
        <MachiningDetailsModal jobNo={detailRow.job_no} onClose={closeDepartment} />
      ) : null}
      {detailRow && department === 'welding' ? (
        <WeldingDetailsModal jobNo={detailRow.job_no} onClose={closeDepartment} />
      ) : null}
    </>
  );
}

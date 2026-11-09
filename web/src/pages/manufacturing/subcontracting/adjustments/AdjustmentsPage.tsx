import { Button, SimpleGrid, Stack } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';
import { DEFAULT_STALE_TIME } from '@/api';
import {
  adjustmentsReportQueryOptions,
  type AdjustmentsParams,
  type SubcontractingAdjustment,
} from '@/api/subcontracting/adjustments';
import {
  subcontractorsQueryOptions,
  type Subcontractor,
} from '@/api/subcontracting/subcontractors';
import {
  DataTable,
  FaIcon,
  FilterBar,
  notify,
  PageHeader,
  useUrlFilters,
  type FilterConfig,
} from '@/ui';
import {
  adjustmentColumns,
  MONTH_NAMES,
  reportSubcontractorName,
  totalsFooter,
  type SubcontractorLabel,
} from './columns';

// Applied filters live in the URL (legacy kept them in the filter panel only).
const URL_DEFAULTS = { subcontractor: '', year: '', month: '', job_no: '' };
type FilterState = typeof URL_DEFAULTS;
type FilterKeys = keyof FilterState;

const EMPTY_FILTERS: FilterState = { subcontractor: '', year: '', month: '', job_no: '' };
const EMPTY_ROWS: SubcontractingAdjustment[] = [];
const DEFAULT_SORT = { sortBy: 'created_at', sortDir: 'desc' } as const;

const today = () => new Date().toISOString().slice(0, 10);

/** Port of manufacturing/subcontracting/adjustments (adjustments.js). */
export function AdjustmentsPage() {
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const filters = useMemo<FilterState>(
    () => ({
      subcontractor: values.subcontractor,
      year: values.year,
      month: values.month,
      job_no: values.job_no,
    }),
    [values.subcontractor, values.year, values.month, values.job_no],
  );

  // One unfiltered list serves both the name lookup (inactive subcontractors too,
  // their rows still need a name) and the dropdown, which stays active-only as legacy.
  const subcontractors = useQuery(subcontractorsQueryOptions());
  const subcontractorList = subcontractors.data?.results;

  const subcontractorById = useMemo(
    () => new Map<number, Subcontractor>((subcontractorList ?? []).map((s) => [s.id, s] as const)),
    [subcontractorList],
  );

  // Short name, else the full name, else the name the report itself carries.
  const subcontractorLabel = useCallback<SubcontractorLabel>(
    (row) => {
      const sub = row.subcontractor != null ? subcontractorById.get(row.subcontractor) : undefined;
      return sub?.short_name || sub?.name || reportSubcontractorName(row);
    },
    [subcontractorById],
  );

  const columns = useMemo(
    () => ({
      addition: adjustmentColumns('addition', subcontractorLabel),
      deduction: adjustmentColumns('deduction', subcontractorLabel),
    }),
    [subcontractorLabel],
  );

  const filterConfig = useMemo<FilterConfig<FilterKeys>[]>(() => {
    const currentYear = new Date().getFullYear();
    return [
      {
        type: 'text',
        key: 'job_no',
        label: 'İş No',
        placeholder: 'İş numarası',
        suggestions: 'jobOrders',
      },
      {
        type: 'select',
        key: 'subcontractor',
        label: 'Taşeron',
        placeholder: 'Tümü',
        searchable: true,
        options: (subcontractorList ?? [])
          .filter((s) => s.is_active !== false)
          .map((s) => ({
            value: String(s.id),
            label: s.short_name || s.name || String(s.id),
          })),
      },
      {
        type: 'select',
        key: 'year',
        label: 'Yıl',
        placeholder: 'Tümü',
        searchable: false,
        options: Array.from({ length: 5 }, (_, i) => String(currentYear - i)).map((y) => ({
          value: y,
          label: y,
        })),
      },
      {
        type: 'select',
        key: 'month',
        label: 'Ay',
        placeholder: 'Tümü',
        searchable: false,
        options: MONTH_NAMES.map((name, i) => ({ value: String(i + 1), label: name })),
      },
    ];
  }, [subcontractorList]);

  const params: AdjustmentsParams = {
    subcontractor: filters.subcontractor || undefined,
    year: filters.year || undefined,
    month: filters.month || undefined,
    job_no: filters.job_no || undefined,
  };
  const report = useQuery({
    ...adjustmentsReportQueryOptions(params),
    staleTime: DEFAULT_STALE_TIME,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (report.isError)
      notify.error(report.error, { fallback: 'Düzeltmeler yüklenirken hata oluştu' });
  }, [report.isError, report.error, report.errorUpdatedAt]);

  const { additions, deductions } = useMemo(() => {
    const rows = report.data?.results ?? EMPTY_ROWS;
    return {
      additions: rows.filter((r) => r.adjustment_type === 'addition'),
      deductions: rows.filter((r) => r.adjustment_type === 'deduction'),
    };
  }, [report.data]);

  return (
    <>
      <PageHeader
        title="Taşeron Düzeltmeleri"
        subtitle="Tüm hakediş düzeltmeleri — ek ödemeler ve kesintiler"
        icon="balance-scale-left"
        backTo="/manufacturing/subcontracting"
        actions={
          <Button
            variant="default"
            leftSection={<FaIcon icon="fas fa-sync-alt" />}
            onClick={() => void report.refetch()}
          >
            Yenile
          </Button>
        }
      />

      <Stack gap="md">
        <FilterBar
          title="Düzeltme Filtreleri"
          filters={filterConfig}
          values={filters}
          onApply={(next) => apply(next)}
          onClear={() => apply(EMPTY_FILTERS)}
        />

        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
          <DataTable
            title="Ek Ödemeler"
            icon="fas fa-plus-circle"
            data={additions}
            columns={columns.addition}
            getRowId={(row) => String(row.id)}
            loading={report.isFetching}
            sortable
            defaultSort={DEFAULT_SORT}
            footer={totalsFooter}
            emptyMessage="Ek ödeme bulunamadı"
            exportable={{ fileName: `taseron-ek-odemeler_${today()}.xlsx` }}
          />
          <DataTable
            title="Kesintiler"
            icon="fas fa-minus-circle"
            data={deductions}
            columns={columns.deduction}
            getRowId={(row) => String(row.id)}
            loading={report.isFetching}
            sortable
            defaultSort={DEFAULT_SORT}
            footer={totalsFooter}
            emptyMessage="Kesinti bulunamadı"
            exportable={{ fileName: `taseron-kesintiler_${today()}.xlsx` }}
          />
        </SimpleGrid>
      </Stack>
    </>
  );
}

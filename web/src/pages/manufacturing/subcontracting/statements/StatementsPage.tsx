import { Badge, Button, Group, Text } from '@mantine/core';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { DEFAULT_STALE_TIME } from '@/api';
import {
  patchStatement,
  statementKeys,
  statementsQueryOptions,
  type StatementsParams,
} from '@/api/subcontracting/statements';
import { subcontractorsQueryOptions } from '@/api/subcontracting/subcontractors';
import {
  DataTable,
  FaIcon,
  FilterBar,
  notify,
  PageHeader,
  useUrlFilters,
  type CellEdit,
  type FilterConfig,
  type RowAction,
  type RowGroup,
} from '@/ui';
import { statementColumns, type StatementRow } from './columns';
import { StatementDetailModal } from './StatementDetailModal';
import { GenerateStatementsModal, PaintInputModal } from './StatementFormModals';
import {
  MONTH_NAMES,
  periodText,
  STATUS_OPTIONS,
  statementErrorMessage,
  statementPeriod,
} from './statementShared';

// Filters, page, sort live in the URL; ?statement=<id> is the legacy deep link
// (daily summary e-mails) that opens the detail.
const URL_DEFAULTS = {
  subcontractor: '',
  year: '',
  month: '',
  status: '',
  page: '1',
  page_size: '20',
  ordering: '',
};
type FilterKeys = 'subcontractor' | 'year' | 'month' | 'status';
type FilterState = Record<FilterKeys, string>;
const EMPTY_FILTERS: FilterState = { subcontractor: '', year: '', month: '', status: '' };
// Newest period on top unless a column sort is picked.
const DEFAULT_ORDERING = '-year,-month';
const ACTIVE_SUBCONTRACTORS = { is_active: true };
const EMPTY_ROWS: StatementRow[] = [];

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Legacy onSort: year and month stay coupled so the newest period stays on top. */
function orderingFor(field: string, dir: 'asc' | 'desc'): string {
  const clean = field.replace(/^-+/, '');
  if (clean === 'year' || clean === 'month') return dir === 'asc' ? 'year,month' : DEFAULT_ORDERING;
  return dir === 'asc' ? clean : `-${clean}`;
}

/** Port of manufacturing/subcontracting/statements (statements.js). */
export function StatementsPage() {
  const queryClient = useQueryClient();
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo<FilterState>(
    () => ({
      subcontractor: values.subcontractor,
      year: values.year,
      month: values.month,
      status: values.status,
    }),
    [values.subcontractor, values.year, values.month, values.status],
  );
  const page = positiveInt(values.page, 1);
  const pageSize = positiveInt(values.page_size, 20);
  const ordering = values.ordering || DEFAULT_ORDERING;
  const sortBy = values.ordering ? values.ordering.replace(/^-/, '').split(',')[0]! : null;
  const sortDir = values.ordering.startsWith('-') ? 'desc' : 'asc';

  const subcontractors = useQuery(subcontractorsQueryOptions(ACTIVE_SUBCONTRACTORS));

  const filterConfig = useMemo<FilterConfig<FilterKeys>[]>(() => {
    const currentYear = new Date().getFullYear();
    return [
      {
        type: 'select',
        key: 'subcontractor',
        label: 'Taşeron',
        placeholder: 'Tümü',
        searchable: true,
        options: (subcontractors.data?.results ?? []).map((s) => ({
          value: String(s.id),
          label: s.name || s.short_name || String(s.id),
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
      {
        type: 'select',
        key: 'status',
        label: 'Durum',
        placeholder: 'Tümü',
        searchable: false,
        options: STATUS_OPTIONS,
      },
    ];
  }, [subcontractors.data]);

  const params: StatementsParams = {
    subcontractor: filters.subcontractor || undefined,
    year: filters.year || undefined,
    month: filters.month || undefined,
    status: filters.status || undefined,
    ordering,
    page,
    page_size: pageSize,
  };
  const list = useQuery({
    ...statementsQueryOptions(params),
    staleTime: DEFAULT_STALE_TIME,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (list.isError)
      notify.error(statementErrorMessage(list.error, 'Hakedişler yüklenirken hata oluştu'));
  }, [list.isError, list.error, list.errorUpdatedAt]);

  const rows = useMemo<StatementRow[]>(
    () => (list.data?.results ?? EMPTY_ROWS).map((s) => ({ ...s, period: statementPeriod(s) })),
    [list.data],
  );
  const total = list.data?.count ?? 0;

  // The latest loaded period opens; the others start collapsed.
  const latestPeriod = useMemo(() => {
    const periods = rows.map((r) => r.period).filter((p) => p && p !== 'unknown');
    return periods.length ? [...periods].sort().at(-1)! : null;
  }, [rows]);

  // ---- detail (?statement=<id>) ----
  const statementParam = Number.parseInt(searchParams.get('statement') ?? '', 10);
  const openId = Number.isFinite(statementParam) ? statementParam : null;
  const openStatement = (id: number) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('statement', String(id));
      return next;
    });
  // Closing replaces the entry, so Back does not reopen it.
  const closeStatement = useCallback(
    () =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('statement');
          return next;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  // ---- modals ----
  const [generating, setGenerating] = useState(false);
  const [paintPeriod, setPaintPeriod] = useState<{ year: number; month: number } | null>(null);

  const reloadFirstPage = () => {
    if (page === 1) void list.refetch();
    else {
      void queryClient.invalidateQueries({ queryKey: statementKeys.lists(), refetchType: 'none' });
      apply({ page: '1' });
    }
  };

  const editEmployeeCount = async ({ row, value }: CellEdit<StatementRow>) => {
    const n = Number.parseInt(`${value ?? ''}`.trim(), 10);
    if (!Number.isFinite(n) || n < 0) throw new Error('Geçersiz çalışan sayısı');
    try {
      const updated = await patchStatement(row.id, { employee_count: n });
      queryClient.setQueryData(statementsQueryOptions(params).queryKey, (old) =>
        old
          ? {
              ...old,
              results: old.results.map((s) =>
                s.id === row.id ? { ...s, employee_count: updated?.employee_count ?? n } : s,
              ),
            }
          : old,
      );
      void queryClient.invalidateQueries({ queryKey: statementKeys.detail(row.id) });
    } catch (error) {
      throw new Error(statementErrorMessage(error, 'Hakediş güncellenirken hata oluştu'), {
        cause: error,
      });
    }
  };

  const rowActions = (row: StatementRow): RowAction<StatementRow>[] => [
    {
      key: 'view',
      label: 'Detay',
      icon: 'fas fa-eye',
      color: 'primary',
      onClick: () => openStatement(row.id),
    },
  ];

  const groupHeader = (group: RowGroup<StatementRow>) => {
    const period = String(group.value ?? '');
    const [year, month] = period.split('-').map((p) => Number.parseInt(p, 10));
    const valid = Boolean(year && month);
    const count = group.rows.length;
    return (
      <Group justify="space-between" wrap="nowrap" w="100%">
        <Group gap="xs" wrap="nowrap">
          <Text span fw={500} ff="monospace" c="blue.7">
            {valid ? periodText(year!, month!) : '-'}
          </Text>
          <Badge size="sm" color="gray">
            {count} hakediş
          </Badge>
        </Group>
        {valid ? (
          <Button
            size="compact-xs"
            variant="outline"
            title="Aylık boya girişi"
            leftSection={<FaIcon icon="fas fa-fill-drip" />}
            onClick={(event) => {
              event.stopPropagation();
              setPaintPeriod({ year: year!, month: month! });
            }}
          >
            Boya Girişi
          </Button>
        ) : null}
      </Group>
    );
  };

  return (
    <>
      <PageHeader
        title="Hakediş Yönetimi"
        subtitle="Taşeron hakediş listesi ve yönetimi"
        icon="file-invoice-dollar"
        backTo="/manufacturing/"
        actions={
          <>
            <Button
              variant="default"
              leftSection={<FaIcon icon="fas fa-sync-alt" />}
              onClick={reloadFirstPage}
            >
              Yenile
            </Button>
            <Button leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => setGenerating(true)}>
              Yeni Hakediş Oluştur
            </Button>
          </>
        }
      />

      <DataTable
        title="Hakediş Listesi"
        filters={
          <FilterBar
            inline
            filters={filterConfig}
            values={filters}
            onApply={(next) => apply({ ...next, page: '1' })}
            onClear={() => apply({ ...EMPTY_FILTERS, page: '1' })}
          />
        }
        data={rows}
        columns={statementColumns}
        getRowId={(row) => String(row.id)}
        loading={list.isFetching}
        sort={{
          sortBy,
          sortDir,
          onSortChange: (field, dir) => apply({ ordering: orderingFor(field, dir), page: '1' }),
        }}
        pagination={{
          page,
          pageSize,
          total,
          onPageChange: (next) => apply({ page: String(next) }),
          onPageSizeChange: (size) => apply({ page_size: String(size), page: '1' }),
        }}
        onRowClick={(row) => openStatement(row.id)}
        rowActions={rowActions}
        onCellEdit={editEmployeeCount}
        grouping={{
          by: 'period',
          sort: 'desc',
          defaultExpanded: (group) => latestPeriod === null || group.value === latestPeriod,
          header: groupHeader,
        }}
        onRefresh={reloadFirstPage}
        emptyMessage="Hakediş bulunamadı"
      />

      {openId !== null ? (
        <StatementDetailModal key={openId} statementId={openId} onClose={closeStatement} />
      ) : null}

      {generating ? (
        <GenerateStatementsModal
          onClose={() => setGenerating(false)}
          onGenerated={() =>
            void queryClient.invalidateQueries({ queryKey: statementKeys.lists() })
          }
        />
      ) : null}

      {paintPeriod ? (
        <PaintInputModal
          year={paintPeriod.year}
          month={paintPeriod.month}
          onClose={() => setPaintPeriod(null)}
          onSaved={() => {
            void queryClient.invalidateQueries({
              queryKey: statementKeys.paintInput(paintPeriod.year, paintPeriod.month),
            });
            void queryClient.invalidateQueries({ queryKey: statementKeys.details() });
          }}
        />
      ) : null}
    </>
  );
}

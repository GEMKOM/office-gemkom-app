import { Button, Grid, Text } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { isApiError } from '@/api/client';
import type { TimerModule } from '@/api/manufacturing/counts';
import {
  downloadTimersExport,
  finishedTimersQueryOptions,
  machinesDropdownQueryOptions,
  timerQueryOptions,
  useDeleteTimer,
  type FinishedTimer,
  type FinishedTimersParams,
} from '@/api/manufacturing/finishedTimers';
import { useMachines, useUsers } from '@/api/reference';
import { formatDateTime, formatNumber } from '@/lib/format';
import {
  confirm,
  DataTable,
  FaIcon,
  FilterBar,
  fromOrdering,
  notify,
  PageHeader,
  toOrdering,
  useUrlFilters,
  type DataTableColumn,
  type FilterConfig,
  type FilterOption,
  type RowAction,
} from '@/ui';
import { cncTimerColumns, machiningTimerColumns, timerHours } from './finishedTimerColumns';
import { TimerEditModal } from './TimerEditModal';

type TextKey = 'nesting_id' | 'issue_key' | 'job_no';

interface Variant {
  backTo: string;
  columns: DataTableColumn<FinishedTimer>[];
  /** Legacy text filters, in order; the first is the search box. */
  textFilters: { key: TextKey; label: string; placeholder: string }[];
  /** Rows of the delete confirmation. */
  deleteDetails: (timer: FinishedTimer) => [string, ReactNode][];
}

const VARIANTS: Record<TimerModule, Variant> = {
  cnc_cutting: {
    backTo: '/planning/cnc-cutting/reports',
    columns: cncTimerColumns,
    textFilters: [{ key: 'nesting_id', label: 'Nesting ID', placeholder: 'E9035' }],
    deleteDetails: (t) => [
      ['ID', t.id],
      ['Kullanıcı', t.username || '-'],
      ['Nesting ID', t.nesting_id || '-'],
      ['Kalınlık', t.thickness_mm ? `${t.thickness_mm} mm` : '-'],
      ['Makine', t.machine_name || '-'],
      ['Başlangıç', t.start_time ? formatDateTime(t.start_time) : '-'],
    ],
  },
  machining: {
    backTo: '/manufacturing/machining/reports',
    columns: machiningTimerColumns,
    textFilters: [
      { key: 'issue_key', label: 'TI No', placeholder: 'TI-123' },
      { key: 'job_no', label: 'İş No', placeholder: 'İş no' },
    ],
    deleteDetails: (t) => [
      ['ID', t.id],
      ['Kullanıcı', t.username || '-'],
      ['TI No', t.issue_key || '-'],
      ['İş No', t.job_no || '-'],
      ['Makine', t.machine_name || '-'],
      ['Başlangıç', t.start_time ? formatDateTime(t.start_time) : '-'],
    ],
  },
};

const DAY = 'YYYY-MM-DD';
const EMPTY_ROWS: FinishedTimer[] = [];

/** Legacy opened on yesterday – today (local days). */
function urlDefaults() {
  return {
    user: '',
    nesting_id: '',
    issue_key: '',
    job_no: '',
    machine: '',
    start_date: dayjs().subtract(1, 'day').format(DAY),
    finish_date: dayjs().format(DAY),
    page: '1',
    page_size: '20',
    ordering: '-finish_time',
    // Deep link from the history and user-report pages: opens the edit modal.
    edit: '',
  };
}

type FilterKeys = 'user' | TextKey | 'machine' | 'start_date' | 'finish_date';
type FilterState = Record<FilterKeys, string>;

/** Legacy buildTimerQuery, minus paging and ordering. */
export function timerFilterParams(module: TimerModule, values: FilterState): FinishedTimersParams {
  const params: FinishedTimersParams = {};
  if (values.user) params.user = values.user;
  for (const { key } of VARIANTS[module].textFilters) {
    if (values[key]) params[key] = values[key];
  }
  if (values.machine) params.machine_fk = values.machine;
  if (values.start_date) params.start_after = new Date(`${values.start_date}T00:00:00`).getTime();
  if (values.finish_date)
    params.start_before = new Date(`${values.finish_date}T23:59:59`).getTime();
  return params;
}

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function useMachineOptions(module: TimerModule): FilterOption[] {
  // CNC asked /machines/ (first 100), machining the dropdown endpoint.
  const cnc = useMachines({ used_in: 'cnc_cutting' }, { enabled: module === 'cnc_cutting' });
  const machining = useQuery({
    ...machinesDropdownQueryOptions('machining'),
    enabled: module === 'machining',
  });
  const machines = module === 'cnc_cutting' ? cnc.data?.results : machining.data;
  return useMemo(
    () => (machines ?? []).map((m) => ({ value: String(m.id), label: m.name })),
    [machines],
  );
}

/**
 * Port of {machining,cnc-cutting}/reports/finished-timers/finishedTimers.js:
 * finished timers with server paging and sorting, edit and delete.
 */
export function FinishedTimersReport({
  module,
  switcher,
}: {
  module: TimerModule;
  /** The CNC / machining switch of the merged report, shown on the band. */
  switcher?: ReactNode;
}) {
  const variant = VARIANTS[module];
  const [defaults] = useState(urlDefaults);
  const { values, apply } = useUrlFilters(defaults);

  const filters = useMemo<FilterState>(
    () => ({
      user: values.user,
      nesting_id: values.nesting_id,
      issue_key: values.issue_key,
      job_no: values.job_no,
      machine: values.machine,
      start_date: values.start_date,
      finish_date: values.finish_date,
    }),
    [
      values.user,
      values.nesting_id,
      values.issue_key,
      values.job_no,
      values.machine,
      values.start_date,
      values.finish_date,
    ],
  );
  const page = positiveInt(values.page, 1);
  const pageSize = positiveInt(values.page_size, 20);
  const sort = fromOrdering(values.ordering || '-finish_time');
  const ordering = toOrdering(sort.sortBy, sort.sortDir);
  const filterParams = timerFilterParams(module, filters);

  const list = useQuery({
    ...finishedTimersQueryOptions(module, { ...filterParams, ordering, page, page_size: pageSize }),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.results ?? EMPTY_ROWS;
  const total = list.data?.count ?? 0;

  useEffect(() => {
    if (list.isError) notify.error('Zamanlayıcılar yüklenirken hata oluştu');
  }, [list.isError, list.errorUpdatedAt]);

  // ---- filter options ----
  const users = useUsers();
  const userOptions = useMemo(
    () => (users.data ?? []).map((u) => ({ value: u.username, label: u.username })),
    [users.data],
  );
  const machineOptions = useMachineOptions(module);
  const filterConfig = useMemo<FilterConfig<FilterKeys>[]>(
    () => [
      {
        type: 'select',
        key: 'user',
        label: 'Kullanıcı',
        placeholder: 'Tüm Kullanıcılar',
        options: userOptions,
      },
      ...variant.textFilters.map(({ key, label, placeholder }) => ({
        type: 'text' as const,
        key,
        label,
        placeholder,
      })),
      {
        type: 'select',
        key: 'machine',
        label: 'Makine',
        placeholder: 'Tüm Makineler',
        options: machineOptions,
      },
      { type: 'date', key: 'start_date', label: 'Başlangıç' },
      { type: 'date', key: 'finish_date', label: 'Bitiş' },
    ],
    [userOptions, machineOptions, variant.textFilters],
  );

  // Hours, users and machines are counted on the loaded page, as legacy did.
  const stats = useMemo(() => {
    const hours = rows.reduce((sum, row) => sum + (timerHours(row) ?? 0), 0);
    const users = new Set(rows.map((r) => r.username).filter(Boolean)).size;
    const machines = new Set(rows.map((r) => r.machine_name).filter(Boolean)).size;
    return { hours, users, machines };
  }, [rows]);
  const figure = (value: string) => (list.isPending ? '–' : value);

  // ---- edit (URL-backed) ----
  const editId = values.edit;
  const rowMatch = editId ? rows.find((r) => String(r.id) === editId) : undefined;
  const editQuery = useQuery({
    ...timerQueryOptions(module, editId || '0'),
    enabled: Boolean(editId) && !list.isPending && !rowMatch,
  });
  const editing = rowMatch ?? (editId ? editQuery.data : undefined);
  const closeEdit = () => apply({ edit: '' });

  useEffect(() => {
    if (!editId || !editQuery.isError) return;
    notify.error(
      isApiError(editQuery.error) && editQuery.error.status === 404
        ? 'Zamanlayıcı bulunamadı'
        : 'Zamanlayıcı yüklenirken hata oluştu',
    );
    apply({ edit: '' });
  }, [editId, editQuery.isError, editQuery.error, apply]);

  // ---- delete ----
  const remove = useDeleteTimer(module);
  const deleteTimer = async (timer: FinishedTimer) => {
    const ok = await confirm({
      title: 'Zamanlayıcı Silme Onayı',
      icon: 'fas fa-exclamation-triangle',
      message: 'Bu zamanlayıcıyı silmek istediğinize emin misiniz?',
      description: 'Bu işlem geri alınamaz ve zamanlayıcı kalıcı olarak silinecektir.',
      details: (
        <Grid gap={4}>
          {variant.deleteDetails(timer).map(([label, value]) => (
            <Grid.Col key={label} span={6}>
              <Text size="sm">
                <strong>{label}:</strong> {value}
              </Text>
            </Grid.Col>
          ))}
        </Grid>
      ),
      confirmLabel: 'Evet, Sil',
      cancelLabel: 'İptal',
      danger: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(timer.id);
      notify.success('Zamanlayıcı başarıyla silindi');
    } catch {
      notify.error('Zamanlayıcı silinirken hata oluştu');
    }
  };

  const rowActions = (row: FinishedTimer): RowAction<FinishedTimer>[] => [
    {
      key: 'edit',
      label: 'Düzenle',
      icon: 'fas fa-edit',
      color: 'primary',
      onClick: () => apply({ edit: String(row.id) }),
    },
    {
      key: 'delete',
      label: 'Sil',
      icon: 'fas fa-trash',
      color: 'danger',
      onClick: (r) => void deleteTimer(r),
    },
  ];

  // ---- export ----
  const [exporting, setExporting] = useState(false);
  const runExport = async () => {
    setExporting(true);
    try {
      await downloadTimersExport(
        module,
        { ...filterParams, ordering, page: 1, page_size: pageSize },
        `biten-zamanlayicilar-${dayjs().format(DAY)}.xlsx`,
      );
      notify.success('Rapor başarıyla indiriliyor');
    } catch (error) {
      console.error('Error exporting timers:', error);
      notify.error('Rapor indirilirken hata oluştu');
    } finally {
      setExporting(false);
    }
  };

  const emptyFilters: FilterState = {
    user: '',
    nesting_id: '',
    issue_key: '',
    job_no: '',
    machine: '',
    start_date: '',
    finish_date: '',
  };

  return (
    <>
      <PageHeader
        title="Biten Zamanlayıcılar Raporu"
        subtitle="Tamamlanan zamanlayıcıların detaylı raporu"
        icon="fas fa-clock"
        backTo={variant.backTo}
        actions={switcher}
        stats={[
          {
            id: 'total-timers-count',
            label: 'Toplam Zamanlayıcı',
            value: figure(formatNumber(total)),
          },
          {
            id: 'total-hours',
            label: 'Toplam Süre (Saat)',
            value: figure(formatNumber(stats.hours, 2)),
          },
          {
            id: 'active-users-count',
            label: 'Aktif Kullanıcı',
            value: figure(formatNumber(stats.users)),
          },
          {
            id: 'active-machines-count',
            label: 'Aktif Makine',
            value: figure(formatNumber(stats.machines)),
          },
        ]}
      />

      <DataTable
        title="Zamanlayıcı Listesi"
        filters={
          <FilterBar
            inline
            filters={filterConfig}
            values={filters}
            onApply={(next) => apply({ ...next, page: '1' })}
            onClear={() => {
              // Legacy Temizle empties every filter, the dates included.
              apply({ ...emptyFilters, page: '1' });
              notify.info('Filtreler temizlendi');
            }}
          />
        }
        data={rows}
        columns={variant.columns}
        getRowId={(row) => String(row.id)}
        loading={list.isFetching}
        sort={{
          sortBy: sort.sortBy,
          sortDir: sort.sortDir,
          onSortChange: (sortBy, sortDir) =>
            apply({ ordering: toOrdering(sortBy, sortDir) ?? '-finish_time', page: '1' }),
        }}
        pagination={{
          page,
          pageSize,
          total,
          onPageChange: (next) => apply({ page: String(next) }),
          onPageSizeChange: (size) => apply({ page_size: String(size), page: '1' }),
        }}
        rowActions={rowActions}
        emptyMessage="Zamanlayıcı bulunamadı"
        onRefresh={() => void list.refetch()}
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

      {editing ? (
        <TimerEditModal key={editing.id} module={module} timer={editing} onClose={closeEdit} />
      ) : null}
    </>
  );
}

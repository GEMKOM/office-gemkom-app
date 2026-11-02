import { Button } from '@mantine/core';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  lcTaskKeys,
  linearCuttingTaskQueryOptions,
  linearCuttingTasksQueryOptions,
  useLinearCuttingMachines,
  useLinearCuttingTask,
  useSetLinearCuttingTaskCompleted,
  type LinearCuttingTask,
  type LinearCuttingTasksParams,
} from '@/api/manufacturing/linearCutting';
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
  type FilterConfig,
  type RowAction,
} from '@/ui';
import { taskColumns } from './columns';
import { TaskDetailModal, TaskEditModal } from './TaskModals';

const DEFAULT_ORDERING = '-completion_date';

const URL_DEFAULTS = {
  session: '',
  completed: '',
  page: '1',
  page_size: '20',
  ordering: DEFAULT_ORDERING,
};

type FilterState = { session: string; completed: string };

const filterConfig: FilterConfig<keyof FilterState>[] = [
  { type: 'text', key: 'session', label: 'Kesim Planı', placeholder: 'LC-0004' },
  {
    type: 'select',
    key: 'completed',
    label: 'Durum',
    placeholder: 'Tümü',
    options: [
      { value: 'false', label: 'Tamamlanmamış' },
      { value: 'true', label: 'Tamamlanan' },
    ],
  },
];

const EMPTY_FILTERS: FilterState = { session: '', completed: '' };
const EMPTY_ROWS: LinearCuttingTask[] = [];

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Port of manufacturing/linear-cutting/tasks (tasks.js). */
export function LinearCuttingTasksPage() {
  const queryClient = useQueryClient();
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const filters = useMemo<FilterState>(
    () => ({ session: values.session, completed: values.completed }),
    [values.session, values.completed],
  );
  const page = positiveInt(values.page, 1);
  const pageSize = positiveInt(values.page_size, 20);
  const ordering = values.ordering || DEFAULT_ORDERING;
  const sort = fromOrdering(ordering);

  const params: LinearCuttingTasksParams = {
    page,
    page_size: pageSize,
    session: filters.session.trim(),
    completed: filters.completed,
    ordering,
  };
  const list = useQuery({
    ...linearCuttingTasksQueryOptions(params),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.results ?? EMPTY_ROWS;

  useEffect(() => {
    if (list.isError) notify.error(list.error, { fallback: 'Görevler yüklenemedi' });
  }, [list.isError, list.error, list.errorUpdatedAt]);

  const machinesQuery = useLinearCuttingMachines();
  const machines = machinesQuery.data;
  const machineName = useCallback(
    (fk: number | null | undefined) =>
      fk == null ? null : (machines?.find((m) => String(m.id) === String(fk))?.name ?? null),
    [machines],
  );

  // ---- completed toggle ----
  const { mutateAsync: setCompleted } = useSetLinearCuttingTaskCompleted();
  const toggleStatus = useCallback(
    async (task: LinearCuttingTask) => {
      const completing = !task.completion_date;
      if (completing) {
        const ok = await confirm({
          title: 'Görev Tamamlama',
          icon: 'fas fa-check-circle',
          message: 'Bu görevi tamamlandı olarak işaretlemek istiyor musunuz?',
          confirmLabel: 'Evet, Tamamla',
          cancelLabel: 'İptal',
        });
        if (!ok) return;
      }
      try {
        await setCompleted({ key: task.key, completed: completing });
        if (completing) notify.success('Görev tamamlandı');
        else notify.info('Görev tamamlanmadı olarak işaretlendi');
      } catch (error) {
        notify.error(error, { fallback: 'İşlem başarısız' });
      }
    },
    [setCompleted],
  );
  const columns = useMemo(
    () => taskColumns({ machineName, onToggleStatus: (task) => void toggleStatus(task) }),
    [machineName, toggleStatus],
  );

  // ---- details / edit: load the task first, then open (legacy) ----
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [editKey, setEditKey] = useState<string | null>(null);
  const detail = useLinearCuttingTask(detailKey);
  const editing = useLinearCuttingTask(editKey);

  const openTask = async (key: string, open: (key: string) => void, failure: string) => {
    try {
      await queryClient.fetchQuery(linearCuttingTaskQueryOptions(key));
      open(key);
    } catch (error) {
      console.error(error);
      notify.error(failure);
    }
  };

  const rowActions = (row: LinearCuttingTask): RowAction<LinearCuttingTask>[] => [
    {
      key: 'view',
      label: 'Detaylar',
      icon: 'fas fa-eye',
      color: 'info',
      onClick: () => void openTask(row.key, setDetailKey, 'Detay yüklenemedi'),
    },
    {
      key: 'edit',
      label: 'Düzenle',
      icon: 'fas fa-edit',
      color: 'primary',
      onClick: () => void openTask(row.key, setEditKey, 'Görev yüklenemedi'),
    },
  ];

  // Header Yenile: back to page 1, as legacy did.
  const refreshFirstPage = () => {
    if (page === 1) {
      void list.refetch();
    } else {
      void queryClient.invalidateQueries({ queryKey: lcTaskKeys.all, refetchType: 'none' });
      apply({ page: '1' });
    }
  };

  return (
    <>
      <PageHeader
        title="Lineer Kesim Görevler"
        subtitle="Bar görevleri listesi ve yönetimi"
        icon="fas fa-tasks"
        backTo="/manufacturing/linear-cutting/"
        actions={
          <Button
            variant="default"
            leftSection={<FaIcon icon="fas fa-sync-alt" />}
            onClick={refreshFirstPage}
          >
            Yenile
          </Button>
        }
      />

      <DataTable
        title="Görev Listesi"
        filters={
          <FilterBar
            inline
            filters={filterConfig}
            values={filters}
            onApply={(next) => apply({ ...next, page: '1' })}
            onClear={() => {
              apply({ ...EMPTY_FILTERS, page: '1' });
              notify.info('Filtreler temizlendi');
            }}
          />
        }
        data={rows}
        columns={columns}
        getRowId={(row) => row.key}
        loading={list.isFetching}
        sort={{
          sortBy: sort.sortBy,
          sortDir: sort.sortDir,
          onSortChange: (sortBy, sortDir) =>
            apply({ ordering: toOrdering(sortBy, sortDir) ?? DEFAULT_ORDERING, page: '1' }),
        }}
        pagination={{
          page,
          pageSize,
          total: list.data?.count ?? 0,
          onPageChange: (next) => apply({ page: String(next) }),
          onPageSizeChange: (size) => apply({ page_size: String(size), page: '1' }),
        }}
        rowActions={rowActions}
        emptyMessage="Görev bulunamadı"
        onRefresh={() => void list.refetch()}
        exportable={{ fileName: 'lineer-kesim-gorevler' }}
      />

      {detailKey && detail.data ? (
        <TaskDetailModal
          task={detail.data}
          machineName={machineName(detail.data.machine_fk)}
          onClose={() => setDetailKey(null)}
        />
      ) : null}

      {editKey && editing.data ? (
        <TaskEditModal
          key={editKey}
          task={editing.data}
          machines={machines ?? []}
          onClose={() => setEditKey(null)}
        />
      ) : null}
    </>
  );
}

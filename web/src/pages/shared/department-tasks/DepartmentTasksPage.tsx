import { Button, Group, SegmentedControl } from '@mantine/core';
import { keepPreviousData, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router';
import { apiFetch } from '@/api/client';
import {
  departmentTasksQueryOptions,
  departmentTaskKeys,
  fetchAllDepartmentTasks,
  normalizeStatusColors,
  patchDepartmentTask,
  patchTaskInCache,
  refreshTaskRow,
  replaceTaskInCache,
  statusChoicesQueryOptions,
  STATUS_OPTIONS,
  subtasksQueryOptions,
  type DepartmentTask,
  type DepartmentTaskListParams,
} from '@/api/projects/departmentTasks';
import { useUsers } from '@/api/reference/users';
import { extractResults } from '@/api/types';
import {
  DataTable,
  FaIcon,
  FilterBar,
  notify,
  PageHeader,
  SelectRemote,
  useUrlFilters,
  type CellEdit,
  type FilterConfig,
  type RemoteOption,
  type RowAction,
  type SortDir,
} from '@/ui';
import { taskActions } from './actions';
import { buildColumns, TreeContext, type TreeState } from './columns';
import type { DepartmentTasksConfig } from './config';
import {
  DepartmentTasksContext,
  type DepartmentTasksContextValue,
  type TaskDialog,
  type TaskUser,
} from './context';
import { TaskDialogs } from './dialogs/TaskDialogs';
import { GanttView } from './GanttView';
import {
  canCompleteRow,
  canSelfStartRevision,
  canSkipRow,
  canViewRow,
  FILTER_DEFAULTS,
  filterParams,
  flattenTasks,
  ganttDateRange,
  isPotentiallyDeletable,
  legacyErrorText,
  listOrdering,
  positiveInt,
  statusFilterOptions,
  toGanttTask,
  toGanttUserRows,
  UNASSIGNED,
  type GanttPeriod,
  type TaskFilterValues,
} from './logic';
import { TaskModal } from './TaskModal';

const EMPTY: DepartmentTask[] = [];
const NO_IDS: ReadonlySet<number> = new Set();

async function searchJobOrders(term: string, signal: AbortSignal): Promise<RemoteOption[]> {
  const data = await apiFetch<unknown>('/projects/job-orders/', {
    params: {
      search: term.trim(),
      page_size: 30,
      ordering: '-created_at',
      status__in: 'active,draft,on_hold',
    },
    signal,
  });
  return extractResults<{ job_no: string; title?: string }>(data).map((job) => ({
    value: job.job_no,
    label: [job.job_no, job.title].filter(Boolean).join(' - '),
  }));
}

async function searchCustomers(term: string, signal: AbortSignal): Promise<RemoteOption[]> {
  const data = await apiFetch<unknown>('/projects/customers/', {
    params: { search: term.trim(), is_active: true, page_size: 50 },
    signal,
  });
  return extractResults<{ id: number; code?: string; name?: string }>(data).map((c) => ({
    value: String(c.id),
    label: [c.code, c.name].filter(Boolean).join(' - ') || `#${c.id}`,
  }));
}

/** Legacy table.js export name: `<containerId>_<YYYY-MM-DD>`. */
function exportFileName() {
  return `tasks-table-container-table-host_${new Date().toISOString().split('T')[0]}`;
}

const EDIT_MESSAGES: Record<string, { ok: string; fail: string }> = {
  title: { ok: 'Başlık güncellendi', fail: 'Başlık güncellenirken hata oluştu' },
  assigned_to_name: {
    ok: 'Atanan kişi güncellendi',
    fail: 'Atanan kişi güncellenirken hata oluştu',
  },
  target_start_date: {
    ok: 'Hedef başlangıç tarihi güncellendi',
    fail: 'Hedef başlangıç tarihi güncellenirken hata oluştu',
  },
  target_completion_date: {
    ok: 'Hedef bitiş tarihi güncellendi',
    fail: 'Hedef bitiş tarihi güncellenirken hata oluştu',
  },
  estimated_duration_wd: {
    ok: 'Tahmini süre güncellendi',
    fail: 'Tahmini süre güncellenirken hata oluştu',
  },
  completion_percentage: {
    ok: 'İlerleme güncellendi',
    fail: 'İlerleme güncellenirken hata oluştu',
  },
  weight: { ok: 'Ağırlık güncellendi', fail: 'Ağırlık güncellenirken hata oluştu' },
};

/** The PATCH body and the cached-row patch for an inline edit. */
function editPayload(
  edit: CellEdit<DepartmentTask>,
  users: TaskUser[],
): { body: Record<string, unknown>; patch: Partial<DepartmentTask> } | null {
  const { columnKey, value } = edit;
  switch (columnKey) {
    case 'title': {
      const title = String(value ?? '').trim();
      return { body: { title }, patch: { title } };
    }
    case 'assigned_to_name': {
      const id = value ? Number.parseInt(String(value), 10) : null;
      const user = users.find((u) => u.id === id);
      return {
        body: { assigned_to: id },
        patch: { assigned_to: id, assigned_to_name: user ? user.name || user.username : null },
      };
    }
    case 'target_start_date':
    case 'target_completion_date':
      return {
        body: { [columnKey]: value || null },
        patch: { [columnKey]: (value as string) || null },
      };
    case 'estimated_duration_wd':
      return {
        body: { estimated_duration_wd: value },
        patch: { estimated_duration_wd: value as number | null },
      };
    case 'completion_percentage':
      return {
        body: { manual_progress: value },
        patch: { completion_percentage: value as number },
      };
    case 'weight':
      return { body: { weight: value }, patch: { weight: value as number | null } };
    default:
      return null;
  }
}

/**
 * Port of components/department-tasks (initDepartmentTasksPage): the
 * department's task list with its tree of subtasks, inline edits, a Gantt
 * view and the task modal. Each department page passes its config.
 */
export function DepartmentTasksPage({ config }: { config: DepartmentTasksConfig }) {
  const queryClient = useQueryClient();
  const { values, apply } = useUrlFilters(FILTER_DEFAULTS);
  const page = positiveInt(values.page, 1);
  const pageSize = positiveInt(values.page_size, 20);
  const [searchParams, setSearchParams] = useSearchParams();
  const taskParam = searchParams.get('task');

  // ---- reference data (cached, in parallel with the list) ----
  const usersQuery = useUsers({ is_active: true, department_code: config.department });
  const users = useMemo<TaskUser[]>(
    () =>
      (usersQuery.data ?? []).map((u) => ({
        id: u.id,
        username: u.username,
        name: u.full_name || '',
      })),
    [usersQuery.data],
  );
  const statusesQuery = useQuery(statusChoicesQueryOptions());
  const statuses = useMemo(
    () => statusesQuery.data ?? normalizeStatusColors(STATUS_OPTIONS),
    [statusesQuery.data],
  );

  // ---- view, sort, Gantt window (legacy kept these in memory) ----
  const [view, setView] = useState<'table' | 'gantt'>('table');
  const [ganttRows, setGanttRows] = useState<'tasks' | 'users'>('tasks');
  const [ganttWindow, setGanttWindow] = useState<{ period: GanttPeriod; date: Date }>(() => ({
    period: 'month',
    date: new Date(),
  }));
  const [sort, setSort] = useState<{ sortBy: string | null; sortDir: SortDir }>({
    sortBy: null,
    sortDir: 'asc',
  });

  const params = useMemo<DepartmentTaskListParams>(() => {
    const p: DepartmentTaskListParams = {
      page,
      page_size: pageSize,
      department: config.department,
      main_only: true,
      ordering: listOrdering(sort.sortBy, sort.sortDir, view === 'gantt'),
      ...filterParams(values),
    };
    if (view === 'gantt') {
      const range = ganttDateRange(ganttWindow.period, ganttWindow.date);
      p.date_range_start = range.start;
      p.date_range_end = range.end;
    }
    return p;
  }, [page, pageSize, config.department, sort, view, values, ganttWindow]);

  const list = useQuery({
    ...departmentTasksQueryOptions(params),
    placeholderData: keepPreviousData,
  });
  const mainTasks = list.data?.results ?? EMPTY;
  const total = list.data?.count ?? 0;

  useEffect(() => {
    if (list.isError) notify.error('Görevler yüklenirken hata oluştu');
  }, [list.isError, list.errorUpdatedAt]);

  // ---- expanded rows: reset by every new list (legacy loadTasks cleared them) ----
  const listKey = JSON.stringify(departmentTaskKeys.list(params));
  const [expansion, setExpansion] = useState<{ key: string; ids: ReadonlySet<number> }>({
    key: listKey,
    ids: NO_IDS,
  });
  const expanded = expansion.key === listKey ? expansion.ids : NO_IDS;
  const [loadingIds, setLoadingIds] = useState<ReadonlySet<number>>(NO_IDS);
  const expandedIds = useMemo(() => [...expanded], [expanded]);
  const subtaskQueries = useQueries({
    queries: expandedIds.map((id) => ({
      ...subtasksQueryOptions(config.department, id),
      // Fetched on expand; invalidations still refetch it.
      staleTime: Infinity,
      refetchOnMount: false,
    })),
  });
  const subtaskData = subtaskQueries.map((q) => q.data);
  const subtaskKey = JSON.stringify(subtaskQueries.map((q) => q.dataUpdatedAt));
  const subtasksById = useMemo(() => {
    const map = new Map<number, DepartmentTask[]>();
    expandedIds.forEach((id, i) => {
      const rows = subtaskData[i];
      if (rows) map.set(id, rows);
    });
    return map;
    // subtaskKey tracks the query data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedIds, subtaskKey]);

  const flat = useMemo(
    () => flattenTasks(mainTasks, expanded, (id) => subtasksById.get(id)),
    [mainTasks, expanded, subtasksById],
  );

  const toggle = useCallback(
    async (task: DepartmentTask) => {
      if (expanded.has(task.id)) {
        const next = new Set(expanded);
        next.delete(task.id);
        setExpansion({ key: listKey, ids: next });
        return;
      }
      setLoadingIds((prev) => new Set(prev).add(task.id));
      try {
        // Always fresh on expand, like legacy.
        await queryClient.fetchQuery({
          ...subtasksQueryOptions(config.department, task.id),
          staleTime: 0,
        });
        setExpansion((prev) => {
          const base = prev.key === listKey ? prev.ids : NO_IDS;
          return { key: listKey, ids: new Set(base).add(task.id) };
        });
      } catch {
        notify.error('Alt görevler yüklenirken hata oluştu');
      } finally {
        setLoadingIds((prev) => {
          const next = new Set(prev);
          next.delete(task.id);
          return next;
        });
      }
    },
    [expanded, listKey, queryClient, config.department],
  );

  const tree = useMemo<TreeState>(
    () => ({ levels: flat.levels, expanded, loading: loadingIds, toggle }),
    [flat.levels, expanded, loadingIds, toggle],
  );

  // ---- shared context for the modal, tabs and dialogs ----
  const [dialog, setDialog] = useState<TaskDialog | null>(null);
  const openTask = useCallback(
    (id: number) =>
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('task', String(id));
        return next;
      }),
    [setSearchParams],
  );
  const closeTask = useCallback(
    () =>
      setSearchParams(
        (prev) => {
          if (!prev.has('task')) return prev;
          const next = new URLSearchParams(prev);
          next.delete('task');
          return next;
        },
        { replace: true },
      ),
    [setSearchParams],
  );
  const reloadList = useCallback(async () => {
    setExpansion({ key: listKey, ids: NO_IDS });
    await queryClient.invalidateQueries({ queryKey: departmentTaskKeys.lists });
  }, [queryClient, listKey]);
  const subtasksChanged = useCallback(
    async (parentId: number) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: departmentTaskKeys.subtasksOf(config.department, parentId),
        }),
        refreshTaskRow(queryClient, parentId),
      ]);
    },
    [queryClient, config.department],
  );

  const ctx = useMemo<DepartmentTasksContextValue>(
    () => ({
      config,
      users,
      statuses,
      openTask,
      closeTask,
      openDialog: setDialog,
      closeDialog: () => setDialog(null),
      reloadList,
      refreshRow: (id) => refreshTaskRow(queryClient, id),
      applyTask: (task) => {
        if (task) replaceTaskInCache(queryClient, task);
      },
      cachedSubtasks: (id) => subtasksById.get(id),
      subtasksChanged,
    }),
    [
      config,
      users,
      statuses,
      openTask,
      closeTask,
      setDialog,
      reloadList,
      queryClient,
      subtasksById,
      subtasksChanged,
    ],
  );

  const actions = useMemo(() => taskActions(ctx), [ctx]);

  // ---- table ----
  const userOptions = useMemo(
    () => users.map((u) => ({ value: String(u.id), label: u.name || u.username })),
    [users],
  );
  const columns = useMemo(
    () => buildColumns({ config, statuses, userOptions }),
    [config, statuses, userOptions],
  );

  const onCellEdit = useCallback(
    async (edit: CellEdit<DepartmentTask>) => {
      const payload = editPayload(edit, users);
      if (!payload) return;
      const messages = EDIT_MESSAGES[edit.columnKey]!;
      try {
        await patchDepartmentTask(edit.row.id, payload.body);
      } catch (error) {
        // The table rolls the cell back and shows this.
        throw new Error(legacyErrorText(error, messages.fail), { cause: error });
      }
      patchTaskInCache(queryClient, edit.row.id, payload.patch);
      notify.success(messages.ok);
    },
    [queryClient, users],
  );

  const rowActions = useCallback(
    (row: DepartmentTask): RowAction<DepartmentTask>[] => [
      {
        key: 'view',
        label: 'Detay',
        icon: 'fas fa-cog',
        color: 'primary',
        hidden: !canViewRow(row),
        onClick: (r) => openTask(r.id),
      },
      {
        key: 'delete',
        label: 'Sil',
        icon: 'fas fa-trash',
        color: 'danger',
        hidden: !isPotentiallyDeletable(row),
        onClick: (r) => void actions.remove(r.id),
      },
      {
        key: 'complete',
        label: 'Tamamla',
        icon: 'fas fa-check',
        color: 'success',
        hidden: !canCompleteRow(config, row),
        onClick: (r) => void actions.complete(r),
      },
      {
        key: 'self-start-revision',
        label: 'Revizyonu Başlat',
        icon: 'fas fa-rotate',
        color: 'warning',
        hidden: !canSelfStartRevision(config, row),
        onClick: (r) => {
          if (!r.current_release_id) notify.error('Mevcut yayın bulunamadı');
          else setDialog({ kind: 'self-start', task: r });
        },
      },
      {
        key: 'skip',
        label: 'Atla',
        icon: 'fas fa-forward',
        color: 'secondary',
        hidden: !canSkipRow(row),
        onClick: (r) => void actions.skip(r.id),
      },
    ],
    [actions, config, openTask, setDialog],
  );

  const rowStyle = useCallback((row: DepartmentTask): CSSProperties | undefined => {
    if (row.is_under_revision) return { backgroundColor: 'rgba(255, 193, 7, 0.12)' };
    if (row.parent) return { backgroundColor: 'var(--gk-surface-subtle)' };
    return undefined;
  }, []);

  // ---- filters ----
  const filters = useMemo<FilterConfig<keyof TaskFilterValues>[]>(
    () => [
      {
        key: 'search',
        type: 'text',
        label: 'Arama',
        placeholder: 'Görev başlığı, açıklama, iş emri...',
      },
      { key: 'status', type: 'select', label: 'Durum', options: statusFilterOptions(statuses) },
      {
        key: 'assigned_to',
        type: 'select',
        label: 'Atanan Kişi',
        searchable: true,
        options: [
          { value: '', label: 'Tümü' },
          { value: UNASSIGNED, label: 'Atanmamış' },
          ...userOptions,
        ],
      },
      { key: 'target_start_date', type: 'date', label: 'Hedef Başlangıç' },
      { key: 'target_completion_date', type: 'date', label: 'Hedef Bitiş' },
    ],
    [statuses, userOptions],
  );

  const applyFilters = (next: Partial<TaskFilterValues>) => apply({ ...next, page: '1' });
  const clearFilters = () => {
    // Legacy Temizle empties every filter, Durum included ("Tümü").
    apply({
      search: '',
      status: '',
      job_order: '',
      customer: '',
      assigned_to: '',
      target_start_date: '',
      target_completion_date: '',
      page: '1',
    });
    notify.info('Filtreler temizlendi');
  };

  const refresh = () => {
    if (page === 1) void reloadList();
    else {
      setExpansion({ key: listKey, ids: NO_IDS });
      apply({ page: '1' });
    }
  };

  // ---- export ----
  const [exporting, setExporting] = useState(false);
  const exportTasks = async () => {
    setExporting(true);
    try {
      const all = await fetchAllDepartmentTasks({
        department: config.department,
        main_only: true,
        ordering: 'sequence',
        ...filterParams(values),
      });
      if (all.length === 0) {
        notify.warning('Dışa aktarılacak görev bulunamadı');
        return;
      }
      const { exportToExcel } = await import('@/ui/DataTable/exportExcel');
      await exportToExcel(all, columns, { fileName: exportFileName() });
    } catch {
      notify.error('Dışa aktarma sırasında hata oluştu');
    } finally {
      setExporting(false);
    }
  };

  // ---- Gantt ----
  const ganttTasks = useMemo(
    () => (ganttRows === 'users' ? toGanttUserRows(mainTasks, users) : mainTasks.map(toGanttTask)),
    [ganttRows, mainTasks, users],
  );

  const switchView = (next: 'table' | 'gantt') => {
    if (next === view) return;
    setView(next);
    if (page !== 1) apply({ page: '1' });
  };

  const taskId = taskParam && Number.isFinite(Number(taskParam)) ? Number(taskParam) : null;

  return (
    <DepartmentTasksContext.Provider value={ctx}>
      <TreeContext.Provider value={tree}>
        <PageHeader
          title={config.title}
          subtitle={config.subtitle}
          icon="project-diagram"
          backTo={config.backTo}
          actions={
            <>
              {config.canCreateTasks ? (
                <Button
                  leftSection={<FaIcon icon="fas fa-plus" />}
                  onClick={() => setDialog({ kind: 'create-task' })}
                >
                  Yeni Görev
                </Button>
              ) : null}
              <Button
                variant="default"
                leftSection={<FaIcon icon="fas fa-sync-alt" />}
                onClick={refresh}
              >
                Yenile
              </Button>
            </>
          }
        />

        <Group gap="sm" mb="sm">
          <SegmentedControl
            size="xs"
            aria-label="Görünüm seçimi"
            value={view}
            onChange={(v) => switchView(v as 'table' | 'gantt')}
            data={[
              { value: 'table', label: 'Tablo' },
              { value: 'gantt', label: 'Gantt' },
            ]}
          />
          {view === 'gantt' ? (
            <SegmentedControl
              size="xs"
              aria-label="Gantt satır modu"
              value={ganttRows}
              onChange={(v) => setGanttRows(v as 'tasks' | 'users')}
              data={[
                { value: 'tasks', label: 'Görevlere Göre' },
                { value: 'users', label: 'Kullanıcılara Göre' },
              ]}
            />
          ) : null}
        </Group>

        {view === 'gantt' ? (
          <GanttView
            tasks={ganttTasks}
            title={ganttRows === 'users' ? 'Gantt Gorunumu - Kullanicilar' : 'Gantt Gorunumu'}
            period={ganttWindow.period}
            anchor={ganttWindow.date}
            onPeriodChange={(period, date) => {
              setGanttWindow({ period, date });
              if (page !== 1) apply({ page: '1' });
            }}
            onTaskClick={openTask}
          />
        ) : (
          <DataTable
            columnsKey="department-tasks"
            title="Görev Listesi"
            filters={
              <FilterBar
                inline
                filters={filters}
                values={values}
                onApply={(next) => applyFilters(next)}
                onClear={clearFilters}
                extra={
                  <>
                    <SelectRemote
                      aria-label="İş Emri"
                      placeholder="İş emri ara (en az 2 karakter)"
                      minSearchLength={2}
                      queryKey={['departmentTasks', 'jobOrderSearch']}
                      search={searchJobOrders}
                      initialOptions={
                        values.job_order
                          ? [{ value: values.job_order, label: values.job_order }]
                          : []
                      }
                      value={values.job_order || null}
                      onChange={(value) => applyFilters({ job_order: value ?? '' })}
                    />
                    <SelectRemote
                      aria-label="Müşteri"
                      placeholder="Müşteri ara (en az 3 karakter)"
                      minSearchLength={3}
                      queryKey={['departmentTasks', 'customerSearch']}
                      search={searchCustomers}
                      initialOptions={
                        values.customer
                          ? [{ value: values.customer, label: `#${values.customer}` }]
                          : []
                      }
                      value={values.customer || null}
                      onChange={(value) => applyFilters({ customer: value ?? '' })}
                    />
                  </>
                }
              />
            }
            data={flat.rows}
            columns={columns}
            getRowId={(row) => String(row.id)}
            loading={list.isFetching}
            sortable
            sort={{
              sortBy: sort.sortBy,
              sortDir: sort.sortDir,
              onSortChange: (sortBy, sortDir) => {
                setSort({ sortBy, sortDir });
                if (page !== 1) apply({ page: '1' });
              },
            }}
            pagination={{
              page,
              pageSize,
              total,
              onPageChange: (next) => apply({ page: String(next) }),
              onPageSizeChange: (size) => apply({ page_size: String(size), page: '1' }),
            }}
            rowActions={rowActions}
            rowStyle={rowStyle}
            onCellEdit={onCellEdit}
            emptyMessage="Görev bulunamadı"
            onRefresh={refresh}
            toolbar={
              <Button
                size="xs"
                variant="default"
                loading={exporting}
                leftSection={<FaIcon icon="fas fa-file-excel" />}
                onClick={() => void exportTasks()}
              >
                Dışa Aktar
              </Button>
            }
          />
        )}

        {taskId ? <TaskModal key={taskId} taskId={taskId} /> : null}
        <TaskDialogs dialog={dialog} />
      </TreeContext.Provider>
    </DepartmentTasksContext.Provider>
  );
}

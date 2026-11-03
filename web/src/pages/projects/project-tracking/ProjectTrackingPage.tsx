import { Button } from '@mantine/core';
import { keepPreviousData, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/api/client';
import {
  deleteDepartmentTask,
  departmentTasksQueryOptions,
  type DepartmentTask,
} from '@/api/projects/departmentTasks';
import {
  cancelJobOrder,
  fetchJobOrders,
  jobOrderDepartmentTasksQueryOptions,
  jobOrderKeys,
  jobOrderQueryOptions,
  jobOrdersQueryOptions,
  jobOrderStatusChoicesQueryOptions,
  productionPlanOverviewQueryOptions,
  productionPlanQueryOptions,
  recalculateJobOrderProgress,
  resumeJobOrder,
  startJobOrder,
  type JobOrder,
  type JobOrderListParams,
} from '@/api/projects/jobOrders';
import { topicQueryOptions } from '@/api/projects/topics';
import { extractResults } from '@/api/types';
import {
  confirm,
  DataTable,
  FaIcon,
  FilterBar,
  fromOrdering,
  notify,
  PageHeader,
  SelectRemote,
  toOrdering,
  useUrlFilters,
  type FilterConfig,
  type RemoteOption,
} from '@/ui';
import { HoldJobOrderModal, TargetDateRevisionModal } from './ActionModals';
import { buildColumns, ToggleActionsButton, TrackingContext, type TrackingState } from './columns';
import { JobOrderDetailModal, releaseReviewUrl, TopicDetailModal } from './detail/JobOrderDetailModal';
import {
  nodeProjections,
  type Forecast,
  type NodeProjection,
  type ProductionPlan,
  type TaskSchedule,
} from './forecast';
import { JobOrderActionsProvider, useJobOrderPermissions, type JobOrderActions } from './jobOrderActions';
import { JobOrderFormModal, joinedErrorMessage, type JobOrderFormMode } from './JobOrderFormModal';
import { MeetingView } from './meeting/MeetingView';
import classes from './ProjectTracking.module.css';
import {
  computeFit,
  dueTone,
  isTaskRow,
  mergeRows,
  normalizeJobOrderStatus,
  rowId,
  type TaskRow,
  type TrackingRow,
} from './rows';
import { TaskPlannerModal } from './task-planner/TaskPlannerModal';
import { WeightPlannerModal } from './weight-planner/WeightPlannerModal';

// Port of projects/project-tracking (jobOrderList.js): the job order list
// with its tree of sub-jobs and department tasks, the Öngörülen Bitiş
// forecast, the create/edit/hold/target-date forms, the planners, the
// detail modal and Sunum Modu (?meeting=1).

const URL_DEFAULTS = {
  search: '',
  status: [] as string[],
  customer: '',
  show_all: false,
  hide_phases: false,
  page: '1',
  page_size: '100',
  ordering: 'job_no',
  job_no: '',
  topic_id: '',
  meeting: '',
};

type FilterKeys = 'search' | 'status' | 'show_all' | 'hide_phases';
type FilterState = { search: string; status: string[]; show_all: boolean; hide_phases: boolean };

const EMPTY_FILTERS: FilterState = { search: '', status: [], show_all: false, hide_phases: false };
const NO_JOBS: ReadonlySet<string> = new Set();
const NO_IDS: ReadonlySet<number> = new Set();
const EMPTY: JobOrder[] = [];

const HIDE_ACTIONS_KEY = 'hideJobOrderActions';

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Filter params as legacy loadJobOrders built them. */
function filterParams(values: FilterState & { customer: string }): JobOrderListParams {
  const params: JobOrderListParams = {};
  if (values.search) params.search = values.search;
  if (values.status.length) params.status__in = values.status.join(',');
  if (values.customer) params.customer = values.customer;
  return params;
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

function readHideActions(): boolean {
  try {
    if (localStorage.getItem(HIDE_ACTIONS_KEY) === 'true') return true;
  } catch {
    // Storage blocked: fall through to the URL.
  }
  return new URLSearchParams(window.location.search).get('hideActions') === 'true';
}

/** Notification links for a department task's topic carry a pseudo job_no "Task-2310". */
const isTaskPseudoJobNo = (jobNo: string) => /^Task-\d+$/i.test(jobNo);

/** Legacy table.js export name: `<containerId>_<YYYY-MM-DD>`. */
function exportFileName() {
  return `job-orders-table-container_${new Date().toISOString().split('T')[0]}`;
}

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(Math.ceil(el.getBoundingClientRect().width));
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      setWidth(Math.ceil(entries[0]?.contentRect.width ?? 0));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export function ProjectTrackingPage() {
  const queryClient = useQueryClient();
  const url = useUrlFilters(URL_DEFAULTS);
  const { values, apply } = url;
  const permissions = useJobOrderPermissions();

  const filters = useMemo<FilterState>(
    () => ({
      search: values.search,
      status: values.status,
      show_all: values.show_all,
      hide_phases: values.hide_phases,
    }),
    [values.search, values.status, values.show_all, values.hide_phases],
  );
  const page = positiveInt(values.page, 1);
  const pageSize = positiveInt(values.page_size, 100);
  const sort = fromOrdering(values.ordering || 'job_no');
  const ordering = toOrdering(sort.sortBy, sort.sortDir) ?? 'job_no';

  const statusChoices = useQuery(jobOrderStatusChoicesQueryOptions());
  const filterConfig = useMemo<FilterConfig<FilterKeys>[]>(
    () => [
      { type: 'text', key: 'search', label: 'Arama', placeholder: 'İş emri no, başlık, açıklama, müşteri' },
      {
        type: 'multiselect',
        key: 'status',
        label: 'Durum',
        placeholder: 'Tümü',
        options: (statusChoices.data ?? []).map((s) => ({ value: s.value, label: s.label })),
      },
      { type: 'checkbox', key: 'show_all', label: 'Tüm İşler (Ana + Alt)' },
      { type: 'checkbox', key: 'hide_phases', label: 'Fazları Gizle' },
    ],
    [statusChoices.data],
  );

  // ---- list ----
  const params: JobOrderListParams = {
    ...filterParams({ ...filters, customer: values.customer }),
    // Root jobs only unless "Tüm İşler" is ticked.
    root_only: values.show_all ? undefined : true,
    ordering,
    page,
    page_size: pageSize,
  };
  const list = useQuery({ ...jobOrdersQueryOptions(params), placeholderData: keepPreviousData });
  const roots = list.data?.results ?? EMPTY;
  const total = list.data?.count ?? 0;

  useEffect(() => {
    if (list.isError) notify.error('İş emirleri yüklenirken hata oluştu');
  }, [list.isError, list.errorUpdatedAt]);

  const counts = useMemo(() => {
    const normalized = roots.map(normalizeJobOrderStatus);
    return {
      active: normalized.filter((j) => j.status === 'active').length,
      onHold: normalized.filter((j) => j.status === 'on_hold').length,
      completed: normalized.filter((j) => j.status === 'completed').length,
    };
  }, [roots]);

  // ---- expansion: reset by every new list (legacy loadJobOrders cleared it) ----
  const listKey = JSON.stringify(jobOrderKeys.list(params));
  type Expansion = {
    key: string;
    children: ReadonlySet<string>;
    tasks: ReadonlySet<string>;
    subtasks: ReadonlySet<number>;
  };
  const [expansion, setExpansion] = useState<Expansion>({
    key: listKey,
    children: NO_JOBS,
    tasks: NO_JOBS,
    subtasks: NO_IDS,
  });
  const current = useMemo<Expansion>(
    () =>
      expansion.key === listKey ? expansion : { key: listKey, children: NO_JOBS, tasks: NO_JOBS, subtasks: NO_IDS },
    [expansion, listKey],
  );
  const [loading, setLoading] = useState<ReadonlySet<string>>(new Set());

  const childJobNos = useMemo(() => [...current.children], [current.children]);
  const taskJobNos = useMemo(() => [...current.tasks], [current.tasks]);
  const subtaskIds = useMemo(() => [...current.subtasks], [current.subtasks]);

  const childQueries = useQueries({ queries: childJobNos.map((no) => jobOrderQueryOptions(no)) });
  const taskQueries = useQueries({
    queries: taskJobNos.map((no) =>
      jobOrderDepartmentTasksQueryOptions<DepartmentTask>(no, { main_only: true, ordering: 'sequence' }),
    ),
  });
  const subtaskQueries = useQueries({
    queries: subtaskIds.map((id) => departmentTasksQueryOptions({ parent: id, ordering: 'sequence' })),
  });
  // Sub-job and task rows read their projection from the expanded job's plan.
  const planJobNos = useMemo(() => [...new Set([...childJobNos, ...taskJobNos])], [childJobNos, taskJobNos]);
  const planQueries = useQueries({
    queries: planJobNos.map((no) => ({ ...productionPlanQueryOptions<ProductionPlan>(no), retry: false })),
  });

  const dataStamp = (qs: { dataUpdatedAt: number }[]) => qs.map((q) => q.dataUpdatedAt).join(',');
  const childStamp = dataStamp(childQueries);
  const taskStamp = dataStamp(taskQueries);
  const subtaskStamp = dataStamp(subtaskQueries);
  const planStamp = dataStamp(planQueries);

  const rows = useMemo<TrackingRow[]>(() => {
    const children = new Map<string, JobOrder[]>();
    childJobNos.forEach((no, i) => {
      const detail = childQueries[i]?.data;
      if (detail) children.set(no, Array.isArray(detail.children) ? (detail.children as JobOrder[]) : []);
    });
    const tasks = new Map<string, DepartmentTask[]>();
    taskJobNos.forEach((no, i) => {
      const data = taskQueries[i]?.data;
      if (data) tasks.set(no, data);
    });
    const subtasks = new Map<number, DepartmentTask[]>();
    subtaskIds.forEach((id, i) => {
      const data = subtaskQueries[i]?.data;
      if (data) subtasks.set(id, data.results);
    });
    return mergeRows(roots, {
      showAll: values.show_all,
      hidePhases: values.hide_phases,
      expandedChildren: current.children,
      expandedTasks: current.tasks,
      expandedSubtasks: current.subtasks,
      children: (no) => children.get(no),
      tasks: (no) => tasks.get(no),
      subtasks: (id) => subtasks.get(id),
    });
    // The *Stamp strings track the query data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roots, values.show_all, values.hide_phases, current, childStamp, taskStamp, subtaskStamp]);

  // ---- forecasts (Öngörülen Bitiş) ----
  // "all", not the table's status filter: the column needs a value whatever is filtered.
  const overview = useQuery({
    ...productionPlanOverviewQueryOptions<{ items?: { job_no: string; forecast?: Forecast }[] }>('all'),
    retry: false,
  });
  const rootForecasts = useMemo(() => {
    const map = new Map<string, Forecast>();
    for (const item of overview.data?.items ?? []) if (item.forecast) map.set(item.job_no, item.forecast);
    return map;
  }, [overview.data]);
  useEffect(() => {
    if (overview.isError) console.error('Öngörülen bitiş verisi yüklenemedi:', overview.error);
  }, [overview.isError, overview.error]);

  const { schedules, projections } = useMemo(() => {
    const schedules = new Map<number, TaskSchedule>();
    const projections = new Map<string, NodeProjection>();
    for (const q of planQueries) {
      const plan = q.data;
      if (!plan) continue;
      for (const task of plan.tasks ?? []) schedules.set(task.id, task.schedule);
      for (const [no, projection] of nodeProjections(plan)) projections.set(no, projection);
    }
    return { schedules, projections };
    // planStamp tracks the query data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planStamp]);
  const plansPending = planQueries.some((q) => q.isFetching);

  // ---- layout ----
  const [hideActions, setHideActions] = useState(readHideActions);
  const toggleHideActions = () => {
    setHideActions((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(HIDE_ACTIONS_KEY, String(next));
      } catch {
        // Not remembered; the toggle still works for this visit.
      }
      return next;
    });
  };
  const [tableRef, tableWidth] = useElementWidth<HTMLDivElement>();
  const fit = useMemo(() => computeFit(tableWidth, hideActions), [tableWidth, hideActions]);
  const fitKey = `${fit.level}|${hideActions}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const columns = useMemo(() => buildColumns(fit), [fitKey]);

  // ---- modals ----
  const [form, setForm] = useState<JobOrderFormMode | null>(null);
  const [holding, setHolding] = useState<string | null>(null);
  const [revising, setRevising] = useState<{ jobNo: string; date: string | null | undefined } | null>(null);
  const [taskPlannerJob, setTaskPlannerJob] = useState<string | null>(null);
  const [weightPlannerJob, setWeightPlannerJob] = useState<string | null>(null);

  const reload = useCallback(
    () => queryClient.invalidateQueries({ queryKey: jobOrderKeys.all }),
    [queryClient],
  );

  // ---- deep links: ?job_no=X[&topic_id=Y], ?topic_id=Y ----
  const jobNoParam = values.job_no;
  const topicParam = Number.parseInt(values.topic_id, 10);
  const topicId = Number.isNaN(topicParam) ? null : topicParam;
  const inMeeting = Boolean(values.meeting);
  // In Sunum Modu job_no names the current slide, not a modal to open.
  const detailJobNo = jobNoParam && !isTaskPseudoJobNo(jobNoParam) && !inMeeting ? jobNoParam : null;

  const topic = useQuery({ ...topicQueryOptions(topicId ?? 0), enabled: topicId !== null });
  const topicRedirect = topic.data ? releaseReviewUrl(topic.data) : null;
  useEffect(() => {
    if (topicRedirect) window.location.assign(topicRedirect);
  }, [topicRedirect]);
  // A topic link without job_no opens its job order, or the topic alone when it has none.
  const inferredJobNo = topic.data
    ? (topic.data.job_order as string | undefined) || (topic.data.job_order_no as string | undefined) || null
    : null;
  useEffect(() => {
    if (topicId !== null && !detailJobNo && !topicRedirect && inferredJobNo) apply({ job_no: inferredJobNo });
  }, [topicId, detailJobNo, topicRedirect, inferredJobNo, apply]);
  const standaloneTopic =
    topicId !== null && !detailJobNo && topic.data && !topicRedirect && !inferredJobNo ? topicId : null;
  useEffect(() => {
    if (topic.isError) notify.error('Tartışma detayı açılırken hata oluştu');
  }, [topic.isError]);

  const closeDetail = useCallback(() => {
    apply({ job_no: '', topic_id: '' });
    void reload();
  }, [apply, reload]);

  // ---- actions ----
  const view = useCallback((jobNo: string) => apply({ job_no: jobNo, topic_id: '' }), [apply]);

  const edit = useCallback(
    async (jobNo: string) => {
      if (!jobNo) {
        notify.error('Geçersiz iş emri numarası');
        return;
      }
      try {
        const jobOrder = await queryClient.fetchQuery({ ...jobOrderQueryOptions(jobNo), staleTime: 0 });
        // One modal at a time: the detail view closes and the form takes its place.
        apply({ job_no: '', topic_id: '' });
        setForm({ kind: 'edit', jobOrder });
      } catch {
        notify.error('İş emri bilgileri yüklenirken hata oluştu');
      }
    },
    [apply, queryClient],
  );

  const createChild = useCallback(
    async (parentJobNo: string) => {
      let parent: JobOrder | undefined = rows.find(
        (r): r is Extract<TrackingRow, { _kind: 'job' }> => !isTaskRow(r) && r.job_no === parentJobNo,
      );
      if (!parent) {
        try {
          parent = await queryClient.fetchQuery(jobOrderQueryOptions(parentJobNo));
        } catch {
          notify.error('Ana iş emri bulunamadı');
          return;
        }
      }
      setForm({ kind: 'child', parent });
    },
    [rows, queryClient],
  );

  const start = useCallback(
    async (jobNo: string) => {
      if (!(await confirm({ title: 'İş Emri Başlatma', message: `İş emri ${jobNo} başlatılsın mı?`, confirmLabel: 'Başlat' })))
        return;
      try {
        const response = await startJobOrder(jobNo);
        if (response?.status !== 'success') throw new Error('İş emri başlatılamadı');
        notify.success(response.message || 'İş emri başlatıldı');
        await reload();
      } catch (error) {
        notify.error(joinedErrorMessage(error, 'İş emri başlatılırken hata oluştu'));
      }
    },
    [reload],
  );

  const resume = useCallback(
    async (jobNo: string) => {
      const ok = await confirm({
        title: 'İş Emri Devam Ettirme',
        message: `İş emri ${jobNo} devam ettirilsin mi?`,
        icon: 'fas fa-play-circle',
        confirmLabel: 'Evet, Devam Ettir',
        cancelLabel: 'Vazgeç',
      });
      if (!ok) return;
      try {
        const response = await resumeJobOrder(jobNo);
        if (response?.status !== 'success') throw new Error('İş emri devam ettirilemedi');
        notify.success(response.message || 'İş emri devam ediyor');
        await reload();
      } catch (error) {
        notify.error(joinedErrorMessage(error, 'İş emri devam ettirilirken hata oluştu'));
      }
    },
    [reload],
  );

  const cancel = useCallback(
    async (jobNo: string) => {
      const ok = await confirm({
        title: 'İş Emri İptal Onayı',
        message: `İş emri ${jobNo} iptal edilecek mi? Bu işlem geri alınamaz.`,
        icon: 'fas fa-exclamation-triangle',
        confirmLabel: 'Evet',
        cancelLabel: 'Vazgeç',
        danger: true,
      });
      if (!ok) return;
      try {
        const response = await cancelJobOrder(jobNo);
        if (response?.status !== 'success') throw new Error('İş emri iptal edilemedi');
        notify.success(response.message || 'İş emri iptal edildi');
        await reload();
      } catch (error) {
        notify.error(joinedErrorMessage(error, 'İş emri iptal edilirken hata oluştu'));
      }
    },
    [reload],
  );

  const recalculate = useCallback(
    async (jobNo: string) => {
      const ok = await confirm({
        title: 'İlerleme Yeniden Hesaplama',
        message: `İş emri ${jobNo} için ilerleme yüzdesi yeniden hesaplansın mı?`,
        icon: 'fas fa-calculator',
        confirmLabel: 'Evet, Hesapla',
        cancelLabel: 'Vazgeç',
      });
      if (!ok) return;
      try {
        const response = await recalculateJobOrderProgress(jobNo);
        if (!response?.job_no) throw new Error('İlerleme yeniden hesaplanamadı');
        const pct = (v: unknown) => (typeof v === 'number' ? v.toFixed(1) : 'N/A');
        notify.success(
          `İlerleme yeniden hesaplandı. Eski: %${pct(response.old_percentage)}, Yeni: %${pct(response.new_percentage)}`,
        );
        await reload();
      } catch (error) {
        notify.error(joinedErrorMessage(error, 'İlerleme yeniden hesaplanırken hata oluştu'));
      }
    },
    [reload],
  );

  const deleteTask = useCallback(
    async (task: TaskRow) => {
      if ((task.subtasks_count || 0) > 0) {
        notify.warning('Alt görevi olan görev silinemez. Önce alt görevleri silin.');
        return;
      }
      const ok = await confirm({
        title: 'Görevi Sil',
        message: `"${task.title || `#${task.id}`}" görevini silmek istediğinizden emin misiniz?`,
        confirmLabel: 'Evet, Sil',
        cancelLabel: 'İptal',
        danger: true,
      });
      if (!ok) return;
      try {
        await deleteDepartmentTask(task.id);
        notify.success('Görev silindi');
        // Only the task lists: the rest of the table stays as it is.
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: jobOrderKeys.departmentTasks(task._parentJobNo) }),
          queryClient.invalidateQueries({ queryKey: ['departmentTasks', 'list'] }),
        ]);
      } catch (error) {
        notify.error(error, { fallback: 'Görev silinirken hata oluştu' });
      }
    },
    [queryClient],
  );

  // Expanding fetches fresh rows and the job's plan first, then shows them.
  const toggle = useCallback(
    async (
      kind: 'children' | 'tasks' | 'subtasks',
      id: string | number,
      load: () => Promise<unknown>,
      failMessage: string,
    ) => {
      const setKey = kind === 'subtasks' ? 'subtasks' : kind;
      const set = current[setKey] as ReadonlySet<string | number>;
      if (set.has(id as never)) {
        const next = new Set(set);
        next.delete(id as never);
        setExpansion({ ...current, [setKey]: next });
        return;
      }
      const loadingKey = `${kind}:${id}`;
      setLoading((prev) => new Set(prev).add(loadingKey));
      try {
        await load();
        setExpansion((prev) => {
          const base = prev.key === listKey ? prev : current;
          const next = new Set(base[setKey] as ReadonlySet<string | number>).add(id);
          return { ...base, key: listKey, [setKey]: next };
        });
      } catch (error) {
        console.error(error);
        notify.error(failMessage);
      } finally {
        setLoading((prev) => {
          const next = new Set(prev);
          next.delete(loadingKey);
          return next;
        });
      }
    },
    [current, listKey],
  );

  const loadPlan = useCallback(
    (jobNo: string) =>
      queryClient.fetchQuery(productionPlanQueryOptions(jobNo)).catch((error: unknown) => {
        console.error(`Öngörü verisi alınamadı (${jobNo}):`, error);
        return null;
      }),
    [queryClient],
  );

  const toggleChildren = useCallback(
    (jobNo: string) =>
      void toggle(
        'children',
        jobNo,
        () => Promise.all([queryClient.fetchQuery({ ...jobOrderQueryOptions(jobNo), staleTime: 0 }), loadPlan(jobNo)]),
        'Alt işler yüklenirken hata oluştu',
      ),
    [toggle, queryClient, loadPlan],
  );
  const toggleTasks = useCallback(
    (jobNo: string) =>
      void toggle(
        'tasks',
        jobNo,
        () =>
          Promise.all([
            queryClient.fetchQuery({
              ...jobOrderDepartmentTasksQueryOptions(jobNo, { main_only: true, ordering: 'sequence' }),
              staleTime: 0,
            }),
            loadPlan(jobNo),
          ]),
        'Departman görevleri yüklenirken hata oluştu',
      ),
    [toggle, queryClient, loadPlan],
  );
  const toggleSubtasks = useCallback(
    (taskId: number) =>
      void toggle(
        'subtasks',
        taskId,
        () =>
          queryClient.fetchQuery({
            ...departmentTasksQueryOptions({ parent: taskId, ordering: 'sequence' }),
            staleTime: 0,
          }),
        'Alt görevler yüklenirken hata oluştu',
      ),
    [toggle, queryClient],
  );

  const actions = useMemo<JobOrderActions>(
    () => ({
      view,
      edit: (jobNo) => void edit(jobNo),
      reviseTargetDate: (jobNo, date) => setRevising({ jobNo, date }),
      start,
      hold: (jobNo) => setHolding(jobNo),
      resume,
      cancel,
      recalculateProgress: recalculate,
      createChild: (jobNo) => void createChild(jobNo),
      openTaskPlanner: (jobNo) => setTaskPlannerJob(jobNo),
      openWeightPlanner: (jobNo) => setWeightPlannerJob(jobNo),
      hideActions,
    }),
    [view, edit, start, resume, cancel, recalculate, createChild, hideActions],
  );

  const forecastState: TrackingState['forecastState'] = overview.isPending
    ? 'loading'
    : overview.isError
      ? 'failed'
      : 'ready';

  const tracking = useMemo<TrackingState>(
    () => ({
      fit,
      hideActions,
      canEdit: permissions.canEdit,
      showAll: values.show_all,
      expandedChildren: current.children,
      expandedTasks: current.tasks,
      expandedSubtasks: current.subtasks,
      loading,
      toggleChildren,
      toggleTasks,
      toggleSubtasks,
      rootForecast: (no) => rootForecasts.get(no),
      nodeProjection: (no) => projections.get(no),
      taskSchedule: (id) => schedules.get(id),
      forecastState,
      plansPending,
      view,
      reviseTargetDate: actions.reviseTargetDate,
      start: (no) => void start(no),
      hold: actions.hold,
      resume: (no) => void resume(no),
      cancel: (no) => void cancel(no),
      recalculate: (no) => void recalculate(no),
      createChild: actions.createChild,
      openTaskPlanner: actions.openTaskPlanner,
      openWeightPlanner: actions.openWeightPlanner,
      deleteTask: (task) => void deleteTask(task),
    }),
    [
      fit,
      hideActions,
      permissions.canEdit,
      values.show_all,
      current,
      loading,
      toggleChildren,
      toggleTasks,
      toggleSubtasks,
      rootForecasts,
      projections,
      schedules,
      forecastState,
      plansPending,
      view,
      actions,
      start,
      resume,
      cancel,
      recalculate,
      deleteTask,
    ],
  );

  // ---- export ----
  const [exporting, setExporting] = useState(false);
  const runExport = async () => {
    setExporting(true);
    try {
      // Legacy export: every page, the filters and sort, root and child jobs alike.
      const base = { ...filterParams({ ...filters, customer: values.customer }), ordering };
      const all: JobOrder[] = [];
      for (let p = 1; ; p++) {
        const response = await fetchJobOrders({ ...base, page: p });
        all.push(...response.results);
        if (!response.next || response.results.length === 0) break;
      }
      if (all.length === 0) {
        notify.warning('Dışa aktarılacak iş emri bulunamadı');
        return;
      }
      const exportRows: TrackingRow[] = all.map((job) => ({
        ...job,
        _kind: 'job',
        hierarchy_level: job.hierarchy_level ?? 0,
      }));
      const { exportToExcel } = await import('@/ui/DataTable/exportExcel');
      await exportToExcel(exportRows, columns, { fileName: exportFileName() });
    } catch (error) {
      console.error('Export error:', error);
      notify.error('Dışa aktarma sırasında hata oluştu');
    } finally {
      setExporting(false);
    }
  };

  const refresh = () => {
    if (page === 1) void list.refetch();
    else apply({ page: '1' });
  };

  const figure = (value: number) => (list.isPending ? '–' : value.toLocaleString('tr-TR'));
  const fitAttr = fit.ultra ? 'ultra' : fit.tight ? 'tight' : undefined;

  return (
    <JobOrderActionsProvider value={actions}>
      <PageHeader
        title="Proje Takibi"
        subtitle="İş emirleri ve proje durumu takibi"
        backTo="/projects/"
        stats={[
          { id: 'total-job-orders-count', label: 'Toplam İş Emri', value: figure(total) },
          { id: 'active-job-orders-count', label: 'Aktif', value: figure(counts.active) },
          { id: 'on-hold-job-orders-count', label: 'Beklemede', value: figure(counts.onHold) },
          { id: 'completed-job-orders-count', label: 'Tamamlanan', value: figure(counts.completed) },
        ]}
        actions={
          <>
            <Button
              variant="default"
              leftSection={<FaIcon icon="fas fa-tv" />}
              onClick={() => apply({ meeting: '1', job_no: '', topic_id: '' })}
            >
              Sunum Modu
            </Button>
            <Button leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => setForm({ kind: 'create' })}>
              Yeni İş Emri
            </Button>
          </>
        }
      />

      <div ref={tableRef} className={classes.root} data-fit={fitAttr}>
        <TrackingContext.Provider value={tracking}>
          <DataTable
            title="İş Emri Listesi"
            filters={
              <FilterBar
                inline
                filters={filterConfig}
                values={filters}
                onApply={(next) => apply({ ...next, page: '1' })}
                onClear={() => apply({ ...EMPTY_FILTERS, customer: '', page: '1' })}
                extra={
                  <SelectRemote
                    aria-label="Müşteri"
                    placeholder="Müşteri ara (en az 3 karakter)"
                    minSearchLength={3}
                    queryKey={['projectTracking', 'customerFilter']}
                    search={searchCustomers}
                    initialOptions={values.customer ? [{ value: values.customer, label: `#${values.customer}` }] : []}
                    value={values.customer || null}
                    onChange={(value) => apply({ customer: value ?? '', page: '1' })}
                  />
                }
              />
            }
            data={rows}
            columns={columns}
            getRowId={rowId}
            loading={list.isFetching}
            stickyHeader
            sort={{
              sortBy: sort.sortBy,
              sortDir: sort.sortDir,
              onSortChange: (sortBy, sortDir) => apply({ ordering: toOrdering(sortBy, sortDir) ?? 'job_no', page: '1' }),
            }}
            pagination={{
              page,
              pageSize,
              total,
              onPageChange: (next) => apply({ page: String(next) }),
              onPageSizeChange: (size) => apply({ page_size: String(size), page: '1' }),
            }}
            rowStyle={(row) => {
              if (isTaskRow(row)) {
                return { backgroundColor: row.parent ? 'rgba(13, 110, 253, 0.03)' : 'rgba(25, 135, 84, 0.04)' };
              }
              const tone = dueTone(row);
              if (tone === 'past-due') return { backgroundColor: '#fee2e2' };
              if (tone === 'due-soon') return { backgroundColor: '#fef3c7' };
              return undefined;
            }}
            extraData={tracking}
            emptyMessage="İş emri bulunamadı"
            onRefresh={refresh}
            toolbar={
              <>
                <ToggleActionsButton hidden={hideActions} onToggle={toggleHideActions} />
                <Button
                  size="xs"
                  variant="default"
                  onClick={() => void runExport()}
                  loading={exporting}
                  leftSection={<FaIcon icon="fas fa-download" />}
                >
                  Dışa Aktar
                </Button>
              </>
            }
          />
        </TrackingContext.Provider>
      </div>

      <JobOrderDetailModal
        jobNo={detailJobNo}
        topicId={detailJobNo ? topicId : null}
        onClose={closeDetail}
        onTopicChange={(id) => apply({ topic_id: id === null ? '' : String(id) })}
      />

      {standaloneTopic !== null ? (
        <TopicDetailModal
          topicId={standaloneTopic}
          jobNo={null}
          onClose={() => apply({ topic_id: '' })}
        />
      ) : null}

      {form ? (
        <JobOrderFormModal
          mode={form}
          onClose={() => setForm(null)}
          onSaved={() => {
            if (form.kind !== 'edit') apply({ page: '1' });
            void reload();
          }}
        />
      ) : null}

      {holding ? (
        <HoldJobOrderModal jobNo={holding} onClose={() => setHolding(null)} onDone={() => void reload()} />
      ) : null}

      {revising ? (
        <TargetDateRevisionModal
          jobNo={revising.jobNo}
          currentDate={revising.date}
          onClose={() => setRevising(null)}
          onDone={() => void reload()}
        />
      ) : null}

      <TaskPlannerModal jobNo={taskPlannerJob} onClose={() => setTaskPlannerJob(null)} onSaved={() => void reload()} />
      <WeightPlannerModal
        jobNo={weightPlannerJob}
        onClose={() => setWeightPlannerJob(null)}
        onSaved={() => void reload()}
      />

      {inMeeting ? (
        <MeetingView
          jobNo={jobNoParam || null}
          onJobChange={(no) => apply({ job_no: no ?? '' })}
          onExit={() => apply({ meeting: '', job_no: '' })}
        />
      ) : null}
    </JobOrderActionsProvider>
  );
}

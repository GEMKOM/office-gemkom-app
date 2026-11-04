import { hasRouteAccess } from '@/auth/accessControl';
import { useQueries, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { HUB_STALE_TIME } from '@/api/counts';
import {
  cuttingPlanQueryOptions,
  type CuttingPlanTask,
} from '@/api/manufacturing/capacityPlanning';
import { pendingCncCutCountQueryOptions, SHOP_FLOOR_STALE_TIME } from '@/api/manufacturing/counts';
import { activeTimersQueryOptions, type Timer } from '@/api/manufacturing/timers';
import type { LinearCuttingTask } from '@/api/manufacturing/linearCutting';
import type { DepartmentRequest } from '@/api/general/departmentRequests';
import {
  approvedDepartmentRequestsPageQueryOptions,
  departmentRequestsToTransferCountQueryOptions,
  jobOrdersByTerminQueryOptions,
  openJobOrderCountQueryOptions,
  openLinearTasksPageQueryOptions,
  planningRequestCountQueryOptions,
  procurementLinesPendingCountQueryOptions,
  remnantCountQueryOptions,
  requestablePlanningItemCountQueryOptions,
  unplannedCncCutCountQueryOptions,
} from '@/api/planning/hubs';
import type { JobOrder } from '@/api/projects/jobOrders';
import { machinesQueryOptions } from '@/api/reference/machines';
import { useAuth } from '@/auth/AuthProvider';
import { formatDate, formatNumber, toNumber } from '@/lib/format';
import { PageHeader, StatusBadge, type PageFigure } from '@/ui';
import { useDepartmentTaskFigures } from '../hub/departmentTasks';
import { countFigure, countValue, type CountQuery } from '../hubCount';
import {
  AreaLane,
  AreaLanes,
  LaneAlert,
  visibleLinks,
  type LaneFigure,
  type LaneLink,
  type LaneRow,
} from '../manufacturing/section/AreaLane';
import { LiveDuration } from '../manufacturing/dashboard-shared/parts';
import { sortTimers } from '../manufacturing/section/timerLane';
import css from './PlanningHubPage.module.css';

// /planning: one lane per area in the İmalat hub's lane view. First what
// waits on planning (the active tasks and the steps a request passes, next to
// the requests, materials, cost lines and stock pages), then CNC and linear
// cutting, then Projeler with project planning and the task templates. A lane,
// a figure and its request exist only when the user can open the page behind.

const REQUESTS = '/planning/department-requests';
const ITEMS = '/planning/items';
const PROCUREMENT_LINES = '/planning/procurement-lines';
const INVENTORY = '/planning/inventory';
const PROJECTS = '/planning/projects';
const PURCHASE_CREATE = '/procurement/purchase-requests/create';
const CNC = '/planning/cnc-cutting';
const CNC_CUTS = '/planning/cnc-cutting/cuts';
const CNC_CAPACITY = '/planning/cnc-cutting/capacity';
const REMNANTS = '/planning/cnc-cutting/remnants';
const CNC_DASHBOARD = '/planning/cnc-cutting/dashboard';
const LINEAR = '/planning/linear-cutting';
const LINEAR_TASKS = '/planning/linear-cutting/tasks';
const LINEAR_CAPACITY = '/planning/linear-cutting/capacity';
const TRACKING = '/projects/project-tracking';
const TRACKING_OPEN = `${TRACKING}?status=active&status=on_hold&ordering=target_completion_date`;

const LINKS = {
  // Requests, materials, cost lines and stock: one group on the hub.
  waiting: [
    { label: 'Departman Talepleri', link: REQUESTS },
    { label: 'Planlama Kalemleri', link: ITEMS },
    { label: 'Malzeme Maliyeti Satırları', link: PROCUREMENT_LINES },
    { label: 'Stok', link: INVENTORY },
  ],
  cnc: [
    { label: 'Kesimler', link: CNC_CUTS },
    { label: 'Kapasite Planlayıcı', link: CNC_CAPACITY },
    { label: 'Fire Plakalar', link: REMNANTS },
    { label: 'Raporlar', link: '/planning/cnc-cutting/reports' },
    { label: 'Dashboard', link: CNC_DASHBOARD },
  ],
  linear: [
    { label: 'Kesimler', link: '/planning/linear-cutting/cuts' },
    { label: 'Görevler', link: LINEAR_TASKS },
    { label: 'Kapasite Planlayıcı', link: LINEAR_CAPACITY },
    { label: 'Dashboard', link: '/planning/linear-cutting/dashboard' },
  ],
  // Projeler holds project planning and the task templates.
  projects: [
    { label: 'Görevler', link: PROJECTS },
    { label: 'Proje Planlama', link: '/planning/project-planning' },
    { label: 'Görev Şablonları', link: '/planning/task-templates' },
  ],
} satisfies Record<string, LaneLink[]>;

/** Records per list; each list's own page has the rest. */
const ROWS = 4;
/** Open linear bars read at once for their plan state and hours. */
const LINEAR_PAGE = 100;

const dayOf = (offset = 0) => dayjs().add(offset, 'day').format('YYYY-MM-DD');
/** Only where the user can open the page behind it. */
const when = (route: string, link: string = route) => (hasRouteAccess(route) ? link : undefined);
const shortDate = (value: string | number | null | undefined) =>
  value ? formatDate(dayjs(value).toDate(), { day: 'numeric', month: 'short' }) : undefined;
const hours = (value: number) => `${formatNumber(value, 1)} sa`;

/** A lane figure for a count, left out for a page the user can't open. */
function countLaneFigure(
  route: string,
  figure: Omit<LaneFigure, 'value'>,
  query: CountQuery,
): LaneFigure[] {
  return hasRouteAccess(route) ? [{ ...figure, value: countValue(query) }] : [];
}

/** "+3 daha" under a list cut to its first rows. */
const more = (total: number | undefined, shown: number) =>
  total !== undefined && total > shown ? `+${formatNumber(total - shown)} daha` : undefined;

// ---- Planlamayı Bekleyenler -------------------------------------------------

function requestRow(request: DepartmentRequest, today: string): LaneRow {
  const needed = request.needed_date ?? undefined;
  return {
    key: request.id,
    link: `${REQUESTS}?request=${request.id}`,
    lead: request.request_number || `#${request.id}`,
    main: request.title || '-',
    sub: request.requestor_username || undefined,
    cells: [
      request.department_label || request.department || '-',
      needed && needed < today ? (
        <LaneAlert key="needed">{shortDate(needed)}</LaneAlert>
      ) : (
        (shortDate(needed) ?? '-')
      ),
    ],
  };
}

function WaitingLane() {
  const links = visibleLinks(LINKS.waiting);
  const canRequests = hasRouteAccess(REQUESTS);
  const canLines = hasRouteAccess(PROCUREMENT_LINES);
  const canItems = hasRouteAccess(ITEMS);
  const tasks = useDepartmentTaskFigures('planning', PROJECTS);
  const today = dayOf();

  const toTransfer = useQuery({
    ...departmentRequestsToTransferCountQueryOptions(),
    enabled: canRequests,
  });
  const stockCheck = useQuery({
    ...planningRequestCountQueryOptions('pending_inventory'),
    enabled: canRequests,
  });
  const erpEntry = useQuery({
    ...planningRequestCountQueryOptions('pending_erp_entry'),
    enabled: canRequests,
  });
  const missingCost = useQuery({
    ...procurementLinesPendingCountQueryOptions(),
    enabled: canLines,
  });
  const requestable = useQuery({
    ...requestablePlanningItemCountQueryOptions(),
    enabled: canItems,
  });
  const requests = useQuery({
    ...approvedDepartmentRequestsPageQueryOptions(ROWS),
    enabled: canRequests,
  });

  // The active tasks first, then the steps in the order a request passes them.
  const figures: LaneFigure[] = [
    ...(tasks.enabled
      ? [
          {
            id: 'waiting-tasks',
            label: 'Aktif planlama görevi',
            value: countValue(tasks.active),
            link: PROJECTS,
          },
        ]
      : []),
    ...(canRequests
      ? [
          {
            id: 'flow-transfer',
            label: 'Aktarılacak talep',
            hint: 'onaylı',
            value: countValue(toTransfer),
            link: REQUESTS,
          },
          {
            id: 'flow-stock',
            label: 'Stok kontrolünde',
            value: countValue(stockCheck),
            link: `${REQUESTS}?pr_status=pending_inventory`,
          },
          {
            id: 'flow-erp',
            label: 'ERP girişi bekleyen',
            value: countValue(erpEntry),
            link: `${REQUESTS}?pr_status=pending_erp_entry`,
          },
        ]
      : []),
    ...countLaneFigure(
      PROCUREMENT_LINES,
      { id: 'flow-cost', label: 'Maliyet bekleyen iş emri', link: PROCUREMENT_LINES },
      missingCost,
    ),
    ...(canItems
      ? [
          {
            id: 'flow-requestable',
            label: 'Talebe dönüşmemiş malzeme',
            value: countValue(requestable),
            link: when(PURCHASE_CREATE) ?? ITEMS,
          },
        ]
      : []),
  ];
  return (
    <AreaLane
      title="Planlamayı Bekleyenler"
      icon="fas fa-inbox"
      family="red"
      links={links}
      figures={figures}
      list={
        canRequests
          ? {
              title: 'Aktarılacak departman talepleri',
              columns: [
                { label: 'Talep', width: '120px' },
                { label: 'Talep · talep eden' },
                { label: 'Departman', width: '128px' },
                { label: 'İhtiyaç', width: '72px', align: 'end' },
              ],
              more: REQUESTS,
              rows: requests.data?.results.map((request) => requestRow(request, today)),
              isError: requests.isError,
              empty: 'Aktarılmayı bekleyen departman talebi yok.',
              footnote: more(requests.data?.count, ROWS),
            }
          : undefined
      }
    />
  );
}

// ---- CNC Kesim ----------------------------------------------------------------

interface MachineLoad {
  id: number;
  name: string;
  cuts: number;
  hours: number;
  endMs: number | undefined;
}

function machineLoad(id: number, name: string, tasks: CuttingPlanTask[]): MachineLoad {
  let hoursSum = 0;
  let endMs: number | undefined;
  for (const task of tasks) {
    hoursSum += toNumber(task.remaining_hours ?? task.estimated_hours) ?? 0;
    if (task.planned_end_ms && (endMs === undefined || task.planned_end_ms > endMs)) {
      endMs = task.planned_end_ms;
    }
  }
  return { id, name, cuts: tasks.length, hours: hoursSum, endMs };
}

/** In a machine's load row: its running timer's time, job and operator. */
function RunningTimer({ timer }: { timer: Timer }) {
  const job = timer.issue_key || timer.issue_name;
  return (
    <span className={css.running} title="Çalışıyor">
      <span className={css.runningDot} data-family="green" aria-hidden />
      <LiveDuration start={timer.start_time} />
      {[job, timer.username].filter(Boolean).map((part) => ` · ${part}`)}
    </span>
  );
}

function LoadBar({ share }: { share: number }) {
  return (
    <span className={css.bar} data-family="blue" aria-hidden>
      <span style={{ width: `${Math.round(Math.min(1, share) * 100)}%` }} />
    </span>
  );
}

function CncLane() {
  const links = visibleLinks(LINKS.cnc);
  const shown = links.length > 0;
  const canCuts = hasRouteAccess(CNC_CUTS);
  const canPlan = hasRouteAccess(CNC_CAPACITY);
  const canRemnants = shown && hasRouteAccess(REMNANTS);
  // Running timers, as İmalat shows machining's: only with the dashboard.
  const live = shown && hasRouteAccess(CNC_DASHBOARD);
  const timers = useQuery({
    ...activeTimersQueryOptions('cnc_cutting'),
    staleTime: SHOP_FLOOR_STALE_TIME,
    enabled: live,
  });
  const open = useQuery({ ...pendingCncCutCountQueryOptions(), enabled: canCuts });
  const unplanned = useQuery({ ...unplannedCncCutCountQueryOptions(), enabled: canPlan });
  const remnants = useQuery({ ...remnantCountQueryOptions(), enabled: canRemnants });
  const unused = useQuery({ ...remnantCountQueryOptions(true), enabled: canRemnants });
  const machines = useQuery({ ...machinesQueryOptions({ used_in: 'cutting' }), enabled: canPlan });
  const list = (machines.data?.results ?? []).filter((m) => m.is_active !== false);
  // One in-plan list per machine, as the planner reads it.
  const plans = useQueries({
    queries: list.map((machine) => ({
      ...cuttingPlanQueryOptions('cnc_cutting', String(machine.id), { only_in_plan: 'true' }),
      staleTime: HUB_STALE_TIME,
      enabled: canPlan,
    })),
  });
  if (!shown) return null;

  const running = sortTimers(timers.data);
  // A machine's running timer shows in its own load row (longest-running).
  const runningOn = new Map<number, Timer>();
  for (const timer of running ?? []) {
    if (timer.machine_fk != null && !runningOn.has(timer.machine_fk)) {
      runningOn.set(timer.machine_fk, timer);
    }
  }
  const loadFailed = machines.isError || plans.some((plan) => plan.isError);
  // Machines with planned cuts or a running timer; the running ones first.
  const loads =
    machines.data && plans.every((plan) => plan.data)
      ? list
          .map((machine, i) => machineLoad(machine.id, machine.name, plans[i]!.data!))
          .filter((load) => load.cuts > 0 || runningOn.has(load.id))
          .sort(
            (a, b) =>
              Number(runningOn.has(b.id)) - Number(runningOn.has(a.id)) || b.hours - a.hours,
          )
      : undefined;
  const total = loads?.reduce((sum, load) => sum + load.hours, 0);
  const lastEnd = loads?.reduce<number | undefined>(
    (end, load) => (load.endMs && (!end || load.endMs > end) ? load.endMs : end),
    undefined,
  );
  const top = loads?.reduce((max, load) => Math.max(max, load.hours), 0) ?? 0;

  const figures: LaneFigure[] = [
    ...(live
      ? [
          {
            id: 'cnc-timers',
            label: 'Aktif zamanlayıcı',
            value: timers.isError ? '-' : running ? formatNumber(running.length) : undefined,
            hint: running
              ? `${formatNumber(new Set(running.map((t) => t.machine_name)).size)} makinede`
              : undefined,
            link: CNC_DASHBOARD,
          },
        ]
      : []),
    ...countLaneFigure(
      CNC_CUTS,
      { id: 'cnc-open', label: 'Açık kesim', link: `${CNC_CUTS}?status=pending` },
      open,
    ),
    ...countLaneFigure(
      CNC_CAPACITY,
      {
        id: 'cnc-unplanned',
        label: 'Plana alınmamış kesim',
        link: CNC_CAPACITY,
        alert: Boolean(unplanned.data),
      },
      unplanned,
    ),
    ...(canPlan
      ? [
          {
            id: 'cnc-load',
            label: 'Planlı iş yükü',
            hint: lastEnd ? `son bitiş ${shortDate(lastEnd)}` : undefined,
            value: loadFailed ? '-' : total === undefined ? undefined : hours(total),
            link: CNC_CAPACITY,
          },
        ]
      : []),
    ...(canRemnants
      ? [
          {
            id: 'remnants',
            label: 'Kullanılabilir fire plaka',
            hint:
              unused.data !== undefined ? `${formatNumber(unused.data)} kullanılmamış` : undefined,
            value: countValue(remnants),
            link: REMNANTS,
          },
        ]
      : []),
  ];
  return (
    <AreaLane
      title="CNC Kesim"
      icon="fas fa-cut"
      family="blue"
      hub={CNC}
      links={links}
      figures={figures}
      list={
        canPlan
          ? {
              title: 'Makine yükü',
              columns: [
                { label: 'Makine' },
                { label: 'Kesim', width: '64px', align: 'end' },
                { label: 'Bitiş', width: '72px', align: 'end' },
                { label: 'Planlı yük', width: '144px', align: 'end' },
              ],
              more: CNC_CAPACITY,
              moreLabel: 'Kapasite Planlayıcı',
              rows: loads?.slice(0, ROWS).map((load) => {
                const timer = live ? runningOn.get(load.id) : undefined;
                return {
                  key: load.id,
                  link: `${CNC_CAPACITY}?machine=${load.id}`,
                  main: load.name,
                  sub: timer ? <RunningTimer timer={timer} /> : undefined,
                  cells: [
                    formatNumber(load.cuts),
                    shortDate(load.endMs) ?? '-',
                    <span key="load" className={css.load}>
                      <LoadBar share={top ? load.hours / top : 0} />
                      {hours(load.hours)}
                    </span>,
                  ],
                };
              }),
              isError: loadFailed,
              empty: 'Plana alınmış kesim yok.',
              footnote: loads ? more(loads.length, ROWS) : undefined,
            }
          : undefined
      }
    />
  );
}

// ---- Lineer Kesim -------------------------------------------------------------

function linearRow(task: LinearCuttingTask): LaneRow {
  const length = toNumber(task.stock_length_mm);
  const est = toNumber(task.estimated_hours);
  return {
    key: task.key,
    link: task.session
      ? `${LINEAR_TASKS}?session=${encodeURIComponent(task.session)}`
      : LINEAR_TASKS,
    lead: task.key,
    main: task.item_name || task.name || task.material || '-',
    sub: task.session_title || task.session || undefined,
    cells: [length ? `${formatNumber(length)} mm` : '-', est ? hours(est) : '-'],
  };
}

function LinearLane() {
  const links = visibleLinks(LINKS.linear);
  const canTasks = hasRouteAccess(LINEAR_TASKS);
  const tasks = useQuery({ ...openLinearTasksPageQueryOptions(LINEAR_PAGE), enabled: canTasks });
  if (links.length === 0) return null;

  const page = tasks.data;
  const failed = tasks.isError ? '-' : undefined;
  const partial = page && page.count > page.results.length;
  const sessions = page ? new Set(page.results.map((t) => t.session).filter(Boolean)).size : 0;
  const unplanned = page?.results.filter((t) => t.in_plan !== true).length;
  const est = page?.results.reduce((sum, t) => sum + (toNumber(t.estimated_hours) ?? 0), 0);
  const scope = partial ? `ilk ${formatNumber(LINEAR_PAGE)} görevde` : undefined;

  const figures: LaneFigure[] = canTasks
    ? [
        {
          id: 'linear-open',
          label: 'Açık bar görevi',
          hint: sessions ? `${formatNumber(sessions)} kesim planında` : undefined,
          value: failed ?? (page ? formatNumber(page.count) : undefined),
          link: `${LINEAR_TASKS}?completed=false`,
        },
        {
          id: 'linear-unplanned',
          label: 'Plana alınmamış bar',
          hint: scope,
          value: failed ?? (unplanned === undefined ? undefined : formatNumber(unplanned)),
          link: when(LINEAR_CAPACITY),
          alert: Boolean(unplanned),
        },
        {
          id: 'linear-hours',
          label: 'Tahmini süre',
          hint: scope ?? 'açık görevler',
          value: failed ?? (est === undefined ? undefined : hours(est)),
        },
      ]
    : [];
  return (
    <AreaLane
      title="Lineer Kesim"
      icon="fas fa-ruler-horizontal"
      family="green"
      hub={LINEAR}
      links={links}
      figures={figures}
      list={
        canTasks
          ? {
              title: 'Açık bar görevleri',
              columns: [
                { label: 'Görev', width: '88px' },
                { label: 'Malzeme · kesim planı' },
                { label: 'Boy', width: '88px', align: 'end' },
                { label: 'Süre', width: '64px', align: 'end' },
              ],
              more: `${LINEAR_TASKS}?completed=false`,
              rows: page?.results.slice(0, ROWS).map(linearRow),
              isError: tasks.isError,
              empty: 'Açık bar görevi yok.',
              footnote: more(page?.count, ROWS),
            }
          : undefined
      }
    />
  );
}

// ---- Projeler -----------------------------------------------------------------

function jobRow(job: JobOrder, today: string, canOpen: boolean): LaneRow {
  const target = job.target_completion_date ?? undefined;
  const done = toNumber(job.completion_percentage);
  return {
    key: job.job_no,
    link: canOpen ? `${TRACKING}?job_no=${encodeURIComponent(job.job_no)}` : undefined,
    lead: job.job_no,
    main: job.title,
    sub: job.customer_short_name || job.customer_name || undefined,
    cells: [
      job.status === 'on_hold' ? (
        <StatusBadge key="status" color="orange">
          Beklemede
        </StatusBadge>
      ) : (
        <StatusBadge key="status" color="blue">
          {done !== null ? `%${formatNumber(done, 0)}` : 'Aktif'}
        </StatusBadge>
      ),
      target && target < today ? (
        <LaneAlert key="target">{shortDate(target)}</LaneAlert>
      ) : (
        (shortDate(target) ?? '-')
      ),
    ],
  };
}

function ProjectsLane() {
  const links = visibleLinks(LINKS.projects);
  const shown = links.length > 0;
  const { user } = useAuth();
  const tasks = useDepartmentTaskFigures('planning', PROJECTS);
  const canOpen = hasRouteAccess(TRACKING);
  const today = dayOf();
  const late = useQuery({
    ...openJobOrderCountQueryOptions({ before: dayOf(-1) }),
    enabled: shown,
  });
  const soon = useQuery({
    ...openJobOrderCountQueryOptions({ after: today, before: dayOf(14) }),
    enabled: shown,
  });
  const jobs = useQuery({ ...jobOrdersByTerminQueryOptions(ROWS), enabled: shown });
  if (!shown) return null;

  const jobLink = canOpen ? TRACKING_OPEN : undefined;
  const figures: LaneFigure[] = [
    ...(tasks.enabled
      ? [
          {
            id: 'tasks-mine',
            label: 'Bana atanan görev',
            value: countValue(tasks.mine),
            link: `${PROJECTS}?assigned_to=${user.id}`,
          },
          {
            id: 'tasks-overdue',
            label: 'Hedefi geçen görev',
            value: countValue(tasks.overdue),
            link: PROJECTS,
            alert: Boolean(tasks.overdue.data),
          },
          {
            id: 'tasks-blocked',
            label: 'Engellenen görev',
            value: countValue(tasks.blocked),
            link: `${PROJECTS}?status=blocked`,
            alert: Boolean(tasks.blocked.data),
          },
        ]
      : []),
    {
      id: 'jobs-late',
      label: 'Termini geçen iş emri',
      value: countValue(late),
      link: jobLink,
      alert: Boolean(late.data),
    },
    { id: 'jobs-soon', label: '14 gün içinde teslim', value: countValue(soon), link: jobLink },
  ];
  return (
    <AreaLane
      title="Projeler"
      icon="fas fa-project-diagram"
      family="purple"
      hub={PROJECTS}
      links={links}
      figures={figures}
      list={{
        title: 'Termine göre iş emirleri',
        columns: [
          { label: 'İş', width: '72px' },
          { label: 'İş emri · müşteri' },
          { label: 'Durum', width: '112px' },
          { label: 'Termin', width: '72px', align: 'end' },
        ],
        more: jobLink,
        rows: jobs.data?.results.map((job) => jobRow(job, today, canOpen)),
        isError: jobs.isError,
        empty: 'Açık iş emri yok.',
        footnote: more(jobs.data?.count, ROWS),
      }}
    />
  );
}

// ---- the band -----------------------------------------------------------------

function useBandFigures(): PageFigure[] {
  const tasks = useDepartmentTaskFigures('planning', PROJECTS);
  const canRequests = hasRouteAccess(REQUESTS);
  const canPlan = hasRouteAccess(CNC_CAPACITY);
  const projects = visibleLinks(LINKS.projects).length > 0;
  // The same queries as the lanes below: one request each.
  const toTransfer = useQuery({
    ...departmentRequestsToTransferCountQueryOptions(),
    enabled: canRequests,
  });
  const unplanned = useQuery({ ...unplannedCncCutCountQueryOptions(), enabled: canPlan });
  const late = useQuery({
    ...openJobOrderCountQueryOptions({ before: dayOf(-1) }),
    enabled: projects,
  });
  return [
    ...(tasks.enabled
      ? [
          countFigure(
            {
              id: 'planning-active',
              label: 'Aktif Görev',
              icon: 'fas fa-list-check',
              link: PROJECTS,
            },
            tasks.active,
          ),
        ]
      : []),
    ...(canRequests
      ? [
          countFigure(
            {
              id: 'to-transfer',
              label: 'Aktarım Bekleyen',
              icon: 'fas fa-right-left',
              link: REQUESTS,
            },
            toTransfer,
          ),
        ]
      : []),
    ...(canPlan
      ? [
          countFigure(
            {
              id: 'cnc-unplanned-tile',
              label: 'Plansız Kesim',
              icon: 'fas fa-cut',
              link: CNC_CAPACITY,
            },
            unplanned,
          ),
        ]
      : []),
    ...(projects
      ? [
          countFigure(
            {
              id: 'jobs-late-tile',
              label: 'Termini Geçen İş',
              icon: 'fas fa-calendar-xmark',
              link: when(TRACKING, TRACKING_OPEN),
            },
            late,
          ),
        ]
      : []),
  ];
}

export function PlanningHubPage() {
  const stats = useBandFigures();
  return (
    <>
      <PageHeader
        title="Planlama"
        subtitle="Talepten kesime, planlamanın bugünkü işi"
        stats={stats}
        figureStyle="tiles"
      />
      <AreaLanes>
        <WaitingLane />
        <CncLane />
        <LinearLane />
        <ProjectsLane />
      </AreaLanes>
    </>
  );
}

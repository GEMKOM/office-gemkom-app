import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import { useQueries, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import type { ReactNode } from 'react';
import { HUB_STALE_TIME } from '@/api/counts';
import {
  cuttingPlanQueryOptions,
  type CuttingPlanTask,
} from '@/api/manufacturing/capacityPlanning';
import { pendingCncCutCountQueryOptions } from '@/api/manufacturing/counts';
import type { LinearCuttingTask } from '@/api/manufacturing/linearCutting';
import type { RemnantPlate } from '@/api/manufacturing/remnants';
import type { DepartmentRequest } from '@/api/general/departmentRequests';
import {
  approvedDepartmentRequestsPageQueryOptions,
  departmentRequestsToTransferCountQueryOptions,
  equipmentCountQueryOptions,
  jobOrdersByTerminQueryOptions,
  openJobOrderCountQueryOptions,
  openLinearTasksPageQueryOptions,
  planningRequestCountQueryOptions,
  procurementLinesPendingCountQueryOptions,
  recentRemnantsQueryOptions,
  remnantCountQueryOptions,
  requestablePlanningItemCountQueryOptions,
  stockCardCountQueryOptions,
  unplannedCncCutCountQueryOptions,
} from '@/api/planning/hubs';
import type { JobOrder } from '@/api/projects/jobOrders';
import { machinesQueryOptions } from '@/api/reference/machines';
import { formatDate, formatNumber, toNumber } from '@/lib/format';
import { AppLink } from '@/shell/AppLink';
import {
  FaIcon,
  PageHeader,
  PendingValue,
  StatusBadge,
  type PageFigure,
  type StatusFamily,
} from '@/ui';
import { useDepartmentTaskFigures } from '../hub/departmentTasks';
import { countFigure, countValue, type CountQuery } from '../hubCount';
import {
  AreaLane,
  AreaLanes,
  LaneRecords,
  visibleLinks,
  type LaneFigure,
  type LaneLink,
  type LaneList,
  type LaneRow,
} from '../manufacturing/section/AreaLane';
import css from './PlanningHubPage.module.css';

// /planning: what waits on planning first (its tasks, the steps a request
// passes and the requests to pass on), then one lane per area with its
// pages, three live figures and the few records that matter. A block, a
// figure and its request exist only when the user can open the page behind.

const REQUESTS = '/planning/department-requests';
const ITEMS = '/planning/items';
const PROCUREMENT_LINES = '/planning/procurement-lines';
const PROJECTS = '/planning/projects';
const PURCHASE_CREATE = '/procurement/purchase-requests/create';
const CNC = '/planning/cnc-cutting';
const CNC_CUTS = '/planning/cnc-cutting/cuts';
const CNC_CAPACITY = '/planning/cnc-cutting/capacity';
const REMNANTS = '/planning/cnc-cutting/remnants';
const LINEAR = '/planning/linear-cutting';
const LINEAR_TASKS = '/planning/linear-cutting/tasks';
const LINEAR_CAPACITY = '/planning/linear-cutting/capacity';
const INVENTORY = '/planning/inventory';
const STOCK_CARDS = '/planning/inventory/cards';
const EQUIPMENT = '/planning/inventory/equipment';
const TRACKING = '/projects/project-tracking';
const TRACKING_OPEN = `${TRACKING}?status=active&status=on_hold&ordering=target_completion_date`;

const LINKS = {
  requests: [
    { label: 'Departman Talepleri', link: REQUESTS },
    { label: 'Planlama Kalemleri', link: ITEMS },
    { label: 'Malzeme Maliyeti Satırları', link: PROCUREMENT_LINES },
  ],
  cnc: [
    { label: 'Kesimler', link: CNC_CUTS },
    { label: 'Kapasite Planlayıcı', link: CNC_CAPACITY },
    { label: 'Fire Plakalar', link: REMNANTS },
    { label: 'Raporlar', link: '/planning/cnc-cutting/reports' },
    { label: 'Dashboard', link: '/planning/cnc-cutting/dashboard' },
  ],
  linear: [
    { label: 'Kesimler', link: '/planning/linear-cutting/cuts' },
    { label: 'Görevler', link: LINEAR_TASKS },
    { label: 'Kapasite Planlayıcı', link: LINEAR_CAPACITY },
    { label: 'Dashboard', link: '/planning/linear-cutting/dashboard' },
  ],
  stock: [
    { label: 'Stok', link: INVENTORY },
    { label: 'Stok Kartları', link: STOCK_CARDS },
    { label: 'Ekipman', link: EQUIPMENT },
  ],
  projects: [
    { label: 'Projeler', link: PROJECTS },
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

// ---- Planlamayı Bekleyenler -------------------------------------------------

interface FlowStep {
  id: string;
  label: string;
  hint: string;
  color: StatusFamily;
  link: string;
  count: CountQuery;
}

function FlowSteps({ steps }: { steps: FlowStep[] }) {
  return (
    <div>
      <div className={css.colHead}>Talep akışı</div>
      <ol className={css.flow}>
        {steps.map((step, index) => {
          const { data, isError } = step.count;
          const waiting = Boolean(data);
          return (
            <li key={step.id}>
              <AppLink
                to={step.link}
                className={css.step}
                data-family={waiting ? step.color : 'grey'}
                data-idle={!waiting || undefined}
              >
                <span className={css.stepNo} aria-hidden>
                  {index + 1}
                </span>
                <span className={css.stepText}>
                  <span className={css.stepLabel}>{step.label}</span>
                  <span className={css.stepHint}>{step.hint}</span>
                </span>
                <b className={css.stepCount}>
                  {isError ? '-' : data === undefined ? <PendingValue /> : formatNumber(data)}
                </b>
                <FaIcon icon="fas fa-chevron-right" className={css.chevron} />
              </AppLink>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function requestRow(request: DepartmentRequest, today: string): LaneRow {
  const needed = request.needed_date ?? undefined;
  return {
    key: request.id,
    link: `${REQUESTS}?request=${request.id}`,
    lead: request.request_number || `#${request.id}`,
    main: request.title || '-',
    sub:
      [request.department_label || request.department, request.requestor_username]
        .filter(Boolean)
        .join(' · ') || undefined,
    end: needed ? (
      <span className={css.date} data-alert={needed < today || undefined}>
        ihtiyaç {shortDate(needed)}
      </span>
    ) : undefined,
  };
}

function WaitingForPlanning() {
  const links = visibleLinks(LINKS.requests);
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
    select: (page) => page.results.map((request) => requestRow(request, today)),
    enabled: canRequests,
  });

  // In the order a request passes them.
  const steps: FlowStep[] = [];
  if (canRequests) {
    steps.push(
      {
        id: 'flow-transfer',
        label: 'Aktarılacak departman talebi',
        hint: 'Onaylandı, planlama talebi açılmadı',
        color: 'yellow',
        link: REQUESTS,
        count: toTransfer,
      },
      {
        id: 'flow-stock',
        label: 'Stok kontrolü',
        hint: 'Planlama talebi stokta kontrol ediliyor',
        color: 'blue',
        link: `${REQUESTS}?pr_status=pending_inventory`,
        count: stockCheck,
      },
      {
        id: 'flow-erp',
        label: 'ERP girişi',
        hint: "Planlama talebi ERP'ye girilmedi",
        color: 'yellow',
        link: `${REQUESTS}?pr_status=pending_erp_entry`,
        count: erpEntry,
      },
    );
  }
  if (canLines) {
    steps.push({
      id: 'flow-cost',
      label: 'Malzeme maliyeti',
      hint: 'İş emrinde maliyet satırı yok',
      color: 'orange',
      link: PROCUREMENT_LINES,
      count: missingCost,
    });
  }
  if (canItems) {
    steps.push({
      id: 'flow-requestable',
      label: 'Talebe dönüşmemiş malzeme',
      hint: 'Satın alma talebi açılmamış kalem',
      color: 'purple',
      link: when(PURCHASE_CREATE) ?? ITEMS,
      count: requestable,
    });
  }

  const columns: ReactNode[] = [];
  if (tasks.enabled) {
    const mini = (label: string, link: string, query: CountQuery, alert = false) => (
      <li>
        <AppLink
          to={link}
          className={css.mini}
          data-alert={(alert && Boolean(query.data)) || undefined}
        >
          <span>{label}</span>
          <b>{countValue(query) ?? <PendingValue />}</b>
        </AppLink>
      </li>
    );
    columns.push(
      <div key="tasks">
        <AppLink to={PROJECTS} className={css.big}>
          <b>{countValue(tasks.active) ?? <PendingValue />}</b>
          <span>aktif planlama görevi</span>
        </AppLink>
        <ul className={css.minis}>
          {mini('Bana atanan', tasks.figures[0]!.link!, tasks.mine)}
          {mini('Hedefi geçen', PROJECTS, tasks.overdue, true)}
          {mini('Engellenen', `${PROJECTS}?status=blocked`, tasks.blocked, true)}
        </ul>
      </div>,
    );
  }
  if (steps.length > 0) columns.push(<FlowSteps key="flow" steps={steps} />);
  if (canRequests) {
    const list: LaneList = {
      title: 'Aktarılacak departman talepleri',
      more: REQUESTS,
      rows: requests.data,
      isError: requests.isError,
      empty: 'Aktarılmayı bekleyen departman talebi yok.',
    };
    columns.push(<LaneRecords key="requests" list={list} />);
  }

  if (links.length === 0 && columns.length === 0) return null;
  return (
    <section className={css.lead} aria-labelledby="planning-waiting">
      <div className={css.leadHead}>
        <h2 id="planning-waiting" className={css.title}>
          <span className={css.tile} data-family="brand" aria-hidden>
            <FaIcon icon="fas fa-inbox" />
          </span>
          Planlamayı Bekleyenler
        </h2>
        {links.length > 0 ? (
          <nav className={css.links} aria-label="Talep sayfaları">
            {links.map((item) => (
              <AppLink key={item.link} to={item.link}>
                {item.label}
              </AppLink>
            ))}
          </nav>
        ) : null}
      </div>
      {columns.length > 0 ? (
        <div className={css.leadBody} data-columns={columns.length}>
          {columns}
        </div>
      ) : null}
    </section>
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

function LoadBar({ share }: { share: number }) {
  return (
    <span className={css.bar} data-family="blue" aria-hidden>
      <span style={{ width: `${Math.round(Math.min(1, share) * 100)}%` }} />
    </span>
  );
}

function CncLane() {
  const links = visibleLinks(LINKS.cnc);
  const canCuts = hasRouteAccess(CNC_CUTS);
  const canPlan = hasRouteAccess(CNC_CAPACITY);
  const open = useQuery({ ...pendingCncCutCountQueryOptions(), enabled: canCuts });
  const unplanned = useQuery({ ...unplannedCncCutCountQueryOptions(), enabled: canPlan });
  const machines = useQuery({ ...machinesQueryOptions({ used_in: 'cutting' }), enabled: canPlan });
  // Without the cuts or the planner, the remnants are this lane's figure.
  const remnantsOnly = !canCuts && !canPlan && hasRouteAccess(REMNANTS);
  const remnants = useQuery({ ...remnantCountQueryOptions(), enabled: remnantsOnly });
  const list = (machines.data?.results ?? []).filter((m) => m.is_active !== false);
  // One in-plan list per machine, as the planner reads it.
  const plans = useQueries({
    queries: list.map((machine) => ({
      ...cuttingPlanQueryOptions('cnc_cutting', String(machine.id), { only_in_plan: 'true' }),
      staleTime: HUB_STALE_TIME,
      enabled: canPlan,
    })),
  });
  if (links.length === 0) return null;

  const loadFailed = machines.isError || plans.some((plan) => plan.isError);
  const loads =
    machines.data && plans.every((plan) => plan.data)
      ? list
          .map((machine, i) => machineLoad(machine.id, machine.name, plans[i]!.data!))
          .filter((load) => load.cuts > 0)
          .sort((a, b) => b.hours - a.hours)
      : undefined;
  const total = loads?.reduce((sum, load) => sum + load.hours, 0);
  const lastEnd = loads?.reduce<number | undefined>(
    (end, load) => (load.endMs && (!end || load.endMs > end) ? load.endMs : end),
    undefined,
  );
  const top = loads?.[0]?.hours ?? 0;

  const figures: LaneFigure[] = [
    ...countLaneFigure(
      CNC_CUTS,
      { id: 'cnc-open', label: 'Açık kesim', link: `${CNC_CUTS}?status=pending` },
      open,
    ),
    ...countLaneFigure(
      CNC_CAPACITY,
      {
        id: 'cnc-unplanned',
        label: 'Plana alınmamış',
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
            value: loadFailed ? '-' : total === undefined ? undefined : hours(total),
            hint: lastEnd ? `son bitiş ${shortDate(lastEnd)}` : undefined,
            link: CNC_CAPACITY,
          },
        ]
      : []),
    ...(remnantsOnly
      ? [
          {
            id: 'cnc-remnants',
            label: 'Kullanılabilir fire plaka',
            value: countValue(remnants),
            link: REMNANTS,
          },
        ]
      : []),
  ];
  const records: LaneList | undefined = canPlan
    ? {
        title: 'Makine yükü',
        more: CNC_CAPACITY,
        moreLabel: 'Planlayıcı',
        rows: loads?.slice(0, ROWS).map((load) => ({
          key: load.id,
          link: `${CNC_CAPACITY}?machine=${load.id}`,
          main: load.name,
          sub: [
            `${formatNumber(load.cuts)} kesim`,
            load.endMs ? `bitiş ${shortDate(load.endMs)}` : null,
          ]
            .filter(Boolean)
            .join(' · '),
          end: (
            <>
              <LoadBar share={top ? load.hours / top : 0} />
              {hours(load.hours)}
            </>
          ),
        })),
        isError: loadFailed,
        empty: 'Plana alınmış kesim yok.',
        footnote:
          loads && loads.length > ROWS
            ? `+${formatNumber(loads.length - ROWS)} makine daha`
            : undefined,
      }
    : undefined;
  return (
    <AreaLane
      title="CNC Kesim"
      icon="fas fa-cut"
      family="blue"
      hub={CNC}
      links={links}
      figures={figures}
      list={records}
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
    main: [
      task.item_name || task.name || task.material || '-',
      length ? `${formatNumber(length)} mm` : null,
    ]
      .filter(Boolean)
      .join(' · '),
    sub: task.session_title || task.session || undefined,
    end: est ? hours(est) : undefined,
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
          value: failed ?? (page ? formatNumber(page.count) : undefined),
          hint: sessions ? `${formatNumber(sessions)} kesim planında` : undefined,
          link: `${LINEAR_TASKS}?completed=false`,
        },
        {
          id: 'linear-unplanned',
          label: 'Plana alınmamış',
          value: failed ?? (unplanned === undefined ? undefined : formatNumber(unplanned)),
          hint: scope,
          link: when(LINEAR_CAPACITY),
          alert: Boolean(unplanned),
        },
        {
          id: 'linear-hours',
          label: 'Tahmini süre',
          value: failed ?? (est === undefined ? undefined : hours(est)),
          hint: scope ?? 'açık görevlerin toplamı',
        },
      ]
    : [];
  const records: LaneList | undefined = canTasks
    ? {
        title: 'Açık bar görevleri',
        more: `${LINEAR_TASKS}?completed=false`,
        rows: page?.results.slice(0, ROWS - 1).map(linearRow),
        isError: tasks.isError,
        empty: 'Açık bar görevi yok.',
      }
    : undefined;
  return (
    <AreaLane
      title="Lineer Kesim"
      icon="fas fa-ruler-horizontal"
      family="green"
      hub={LINEAR}
      links={links}
      figures={figures}
      list={records}
    />
  );
}

// ---- Stok ---------------------------------------------------------------------

function remnantRow(plate: RemnantPlate): LaneRow {
  const thickness = toNumber(plate.thickness_mm);
  const filter = new URLSearchParams();
  if (plate.thickness_mm != null) filter.set('thickness_mm', String(plate.thickness_mm));
  if (plate.dimensions) filter.set('dimensions', plate.dimensions);
  return {
    key: plate.id,
    link: `${REMNANTS}?${filter.toString()}`,
    main:
      [thickness !== null ? `${formatNumber(thickness)} mm` : null, plate.dimensions]
        .filter(Boolean)
        .join(' · ') || '-',
    sub:
      [plate.material, plate.heat_number ? `şarj ${plate.heat_number}` : null]
        .filter(Boolean)
        .join(' · ') || undefined,
    end:
      plate.available_quantity != null
        ? `${formatNumber(plate.available_quantity)} adet`
        : undefined,
  };
}

function StockLane() {
  const links = visibleLinks(LINKS.stock);
  const shown = links.length > 0;
  const canRemnants = shown && hasRouteAccess(REMNANTS);
  const remnants = useQuery({ ...remnantCountQueryOptions(), enabled: canRemnants });
  const unused = useQuery({ ...remnantCountQueryOptions(true), enabled: canRemnants });
  const recent = useQuery({
    ...recentRemnantsQueryOptions(ROWS - 1),
    select: (page) => page.results.map(remnantRow),
    enabled: canRemnants,
  });
  const cards = useQuery({ ...stockCardCountQueryOptions(), enabled: hasRouteAccess(STOCK_CARDS) });
  const equipment = useQuery({
    ...equipmentCountQueryOptions(),
    enabled: hasRouteAccess(EQUIPMENT),
  });
  if (!shown) return null;

  const figures: LaneFigure[] = [
    ...(canRemnants
      ? [
          {
            id: 'remnants',
            label: 'Kullanılabilir fire plaka',
            value: countValue(remnants),
            hint:
              unused.data !== undefined
                ? `hiç kullanılmamış: ${formatNumber(unused.data)}`
                : undefined,
            link: REMNANTS,
          },
        ]
      : []),
    ...countLaneFigure(
      STOCK_CARDS,
      { id: 'stock-cards', label: 'Stok kartı', link: STOCK_CARDS },
      cards,
    ),
    ...countLaneFigure(
      EQUIPMENT,
      { id: 'equipment', label: 'Aktif ekipman', link: EQUIPMENT },
      equipment,
    ),
  ];
  const records: LaneList | undefined = canRemnants
    ? {
        title: 'Son eklenen fire plakalar',
        more: REMNANTS,
        moreLabel: 'Fire Plakalar',
        rows: recent.data,
        isError: recent.isError,
        empty: 'Kullanılabilir fire plaka yok.',
      }
    : undefined;
  return (
    <AreaLane
      title="Stok"
      icon="fas fa-warehouse"
      family="orange"
      hub={INVENTORY}
      links={links}
      figures={figures}
      list={records}
    />
  );
}

// ---- Proje --------------------------------------------------------------------

function jobRow(job: JobOrder, today: string, canOpen: boolean): LaneRow {
  const target = job.target_completion_date ?? undefined;
  const done = toNumber(job.completion_percentage);
  return {
    key: job.job_no,
    link: canOpen ? `${TRACKING}?job_no=${encodeURIComponent(job.job_no)}` : undefined,
    lead: job.job_no,
    main: job.title,
    sub: job.customer_short_name || job.customer_name || undefined,
    end: (
      <>
        {job.status === 'on_hold' ? (
          <StatusBadge color="orange">Beklemede</StatusBadge>
        ) : done !== null ? (
          <StatusBadge color="blue">%{formatNumber(done, 0)}</StatusBadge>
        ) : null}
        {target ? (
          <span className={css.date} data-alert={target < today || undefined}>
            {formatDate(target, { day: 'numeric', month: 'short', year: '2-digit' })}
          </span>
        ) : null}
      </>
    ),
  };
}

function ProjectsLane() {
  const links = visibleLinks(LINKS.projects);
  const shown = links.length > 0;
  const canOpen = hasRouteAccess(TRACKING);
  const today = dayOf();
  const open = useQuery({ ...openJobOrderCountQueryOptions(), enabled: shown });
  const late = useQuery({
    ...openJobOrderCountQueryOptions({ before: dayOf(-1) }),
    enabled: shown,
  });
  const soon = useQuery({
    ...openJobOrderCountQueryOptions({ after: today, before: dayOf(14) }),
    enabled: shown,
  });
  const jobs = useQuery({
    ...jobOrdersByTerminQueryOptions(ROWS - 1),
    select: (page) => page.results.map((job) => jobRow(job, today, canOpen)),
    enabled: shown,
  });
  if (!shown) return null;

  const link = canOpen ? TRACKING_OPEN : undefined;
  const figures: LaneFigure[] = [
    { id: 'jobs-open', label: 'Açık iş emri', value: countValue(open), link },
    {
      id: 'jobs-late',
      label: 'Termini geçen',
      value: countValue(late),
      link,
      alert: Boolean(late.data),
    },
    { id: 'jobs-soon', label: '14 gün içinde teslim', value: countValue(soon), link },
  ];
  return (
    <AreaLane
      title="Proje"
      icon="fas fa-project-diagram"
      family="purple"
      links={links}
      figures={figures}
      list={{
        title: 'Termine göre iş emirleri',
        more: link,
        rows: jobs.data,
        isError: jobs.isError,
        empty: 'Açık iş emri yok.',
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
  // The same queries as the blocks below: one request each.
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
        <WaitingForPlanning />
        <CncLane />
        <LinearLane />
        <StockLane />
        <ProjectsLane />
      </AreaLanes>
    </>
  );
}

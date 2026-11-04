import { useQuery } from '@tanstack/react-query';
import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import dayjs from 'dayjs';
import { listCountQueryOptions, listPageQueryOptions } from '@/api/counts';
import type { MachineFault } from '@/api/maintenance/faults';
import type { MaterialPullRequest } from '@/api/materialTracking/pullRequests';
import {
  incompletePartCountQueryOptions,
  openFaultCountQueryOptions,
  pendingPullRequestCountQueryOptions,
  pendingTimesheetCountQueryOptions,
  SHOP_FLOOR_STALE_TIME,
  statementsInApprovalCountQueryOptions,
} from '@/api/manufacturing/counts';
import { activeTimersQueryOptions, type Timer } from '@/api/manufacturing/timers';
import type { Statement } from '@/api/subcontracting/statements';
import { weldingHubSummaryQueryOptions, type WeldingHubResource } from '@/api/welding/hubSummary';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { useAuth } from '@/auth/AuthProvider';
import { PageHeader, PendingValue, StatusBadge, type PageFigure, type StatusFamily } from '@/ui';
import { countValue, type CountQuery } from '../../hubCount';
import {
  taskDeadlinesQueryOptions,
  taskStatusFamily,
  useDepartmentTaskFigures,
} from '../../hub/departmentTasks';
import { LiveDuration } from '../dashboard-shared/parts';
import {
  AreaLane,
  AreaLanes,
  LaneAlert,
  visibleLinks,
  type LaneFigure,
  type LaneLink,
  type LaneList,
} from './AreaLane';

// /manufacturing: one lane per area (Kaynaklı İmalat, Talaşlı İmalat, Bakım,
// Taşeron, Malzeme, Projeler), each with its pages, three live figures and the
// few records that need someone. A lane, a figure and its request exist only
// when the user can open the page behind them. CNC and linear cutting live
// under Planlama.

const WELDING = '/manufacturing/welding';
const MACHINING = '/manufacturing/machining';
const MACHINING_DASHBOARD = '/manufacturing/machining/dashboard';
const PARTS = '/manufacturing/machining/tasks/list';
const MAINTENANCE = '/manufacturing/maintenance';
const MAINTENANCE_DASHBOARD = '/manufacturing/maintenance/dashboard';
const FAULTS = '/manufacturing/maintenance/fault-requests';
const SUBCONTRACTING = '/manufacturing/subcontracting';
const STATEMENTS = '/manufacturing/subcontracting/statements';
const SUBCONTRACTORS = '/manufacturing/subcontracting/subcontractors';
const MATERIALS = '/manufacturing/material-tracking';
const PULL_REQUESTS = '/manufacturing/material-tracking/pull-requests';
const PROJECTS = '/manufacturing/projects';
const PLANNING_BOARD = '/planning/project-planning';
const REPORTS = '/manufacturing/reports';
/** The report hub link shows when the user can open any of its reports. */
const REPORT_PAGES = [
  REPORTS,
  '/manufacturing/reports/job-costs',
  '/manufacturing/reports/finished-timers',
  '/manufacturing/reports/user-report',
];

const LINKS = {
  welding: [
    { label: 'Zaman Kayıtları', link: '/manufacturing/welding/time-entries' },
    { label: 'Puantaj Onayı', link: '/manufacturing/welding/timesheets' },
    { label: 'Ekipler', link: '/manufacturing/welding/teams' },
    { label: 'Çalışma Saatleri', link: '/manufacturing/welding/reports/user-work-hours' },
  ],
  machining: [
    { label: 'Dashboard', link: MACHINING_DASHBOARD },
    { label: 'Görev Listesi', link: PARTS },
    { label: 'Görev Oluştur', link: '/manufacturing/machining/tasks/create' },
    { label: 'Kapasite Planlayıcı', link: '/manufacturing/machining/capacity/planning' },
  ],
  maintenance: [
    { label: 'Dashboard', link: MAINTENANCE_DASHBOARD },
    { label: 'Arıza Talepleri', link: FAULTS },
  ],
  subcontracting: [
    { label: 'Genel Bakış', link: '/manufacturing/subcontracting/overview' },
    { label: 'Taşeronlar', link: SUBCONTRACTORS },
    { label: 'İşçilik Fiyatı', link: '/manufacturing/subcontracting/labor-pricing' },
    { label: 'Hakedişler', link: STATEMENTS },
    { label: 'Düzeltmeler', link: '/manufacturing/subcontracting/adjustments' },
  ],
  materials: [
    { label: 'Malzeme Takibi', link: MATERIALS },
    { label: 'Çekme Talepleri', link: PULL_REQUESTS },
  ],
  projects: [{ label: 'İmalat Görevleri', link: PROJECTS }],
} satisfies Record<string, LaneLink[]>;

const today = () => dayjs().format('YYYY-MM-DD');
const yesterday = () => dayjs().subtract(1, 'day').format('YYYY-MM-DD');
/** Only where the user can open the page behind it. */
const when = (route: string, link: string = route) => (hasRouteAccess(route) ? link : undefined);

/** "12,5 t" from kilograms. */
export function tonnes(kg: number | null | undefined) {
  return `${formatNumber((kg ?? 0) / 1000, 1)} t`;
}

function shortDate(value: string | null | undefined) {
  return value ? formatDate(value, { day: 'numeric', month: 'short' }) : undefined;
}

function openFor(seconds: number | null | undefined) {
  if (!seconds) return undefined;
  const hours = seconds / 3600;
  return hours < 24
    ? `${formatNumber(Math.max(1, Math.round(hours)))} sa`
    : `${formatNumber(Math.floor(hours / 24))} gün`;
}

/** "+3 arıza daha" when the list shows fewer rows than there are. */
function moreThan(total: number | undefined, shown: number, noun: string) {
  return total !== undefined && total > shown
    ? `+${formatNumber(total - shown)} ${noun} daha`
    : undefined;
}

/** A figure from a count query; nothing is shown for a page the user can't open. */
function countFigureFor(
  route: string,
  figure: Omit<LaneFigure, 'value'>,
  query: CountQuery,
): LaneFigure[] {
  return hasRouteAccess(route) ? [{ ...figure, value: countValue(query) }] : [];
}

// ---- Kaynaklı İmalat --------------------------------------------------------

function resourceRow(resource: WeldingHubResource) {
  const team = resource.resource_type === 'team';
  return {
    key: `${resource.resource_type}-${resource.id}`,
    link: team ? when('/manufacturing/welding/teams') : when(SUBCONTRACTORS),
    main: resource.short_name || resource.name,
    sub: team ? 'İç ekip' : 'Taşeron',
    cells: [
      formatNumber(resource.open_tasks),
      resource.overdue_tasks ? (
        <LaneAlert key="late">{formatNumber(resource.overdue_tasks)}</LaneAlert>
      ) : (
        '-'
      ),
      tonnes(resource.open_kg),
    ],
  };
}

const RESOURCE_ROWS = 4;
const FAULT_ROWS = 4;
const STATEMENT_ROWS = 4;
const PULL_ROWS = 4;

function WeldingLane() {
  const links = visibleLinks(LINKS.welding);
  const shown = links.length > 0;
  const summary = useQuery({ ...weldingHubSummaryQueryOptions(), enabled: shown });
  const timesheets = useQuery({
    ...pendingTimesheetCountQueryOptions(today()),
    enabled: hasRouteAccess('/manufacturing/welding/timesheets'),
  });
  const s = summary.data;
  const failed = summary.isError ? '-' : undefined;
  const resources = s?.resources ?? [];
  const list: LaneList = {
    title: 'Ekipler ve taşeronlar',
    columns: [
      { label: 'Ekip / taşeron' },
      { label: 'Açık iş', width: '64px', align: 'end' },
      { label: 'Geciken', width: '72px', align: 'end' },
      { label: 'Açık tonaj', width: '88px', align: 'end' },
    ],
    more: when(PLANNING_BOARD),
    moreLabel: 'Planlama panosu',
    rows: s ? resources.slice(0, RESOURCE_ROWS).map(resourceRow) : undefined,
    isError: summary.isError,
    empty: 'Açık kaynak işi olan ekip ya da taşeron yok.',
    footnote:
      resources.length > RESOURCE_ROWS
        ? `+${formatNumber(resources.length - RESOURCE_ROWS)} ekip / taşeron daha`
        : undefined,
  };
  return (
    <AreaLane
      title="Kaynaklı İmalat"
      icon="fas fa-fire"
      family="red"
      hub={WELDING}
      links={links}
      figures={[
        {
          id: 'overdue',
          label: 'Termini geçen iş',
          value: failed ?? (s ? formatNumber(s.overdue_tasks) : undefined),
          hint: s ? tonnes(s.overdue_kg) : undefined,
          alert: Boolean(s?.overdue_tasks),
          link: when(PLANNING_BOARD),
        },
        {
          id: 'month',
          label: 'Bu ay imal edilen',
          value: failed ?? (s ? tonnes(s.month_welded_kg) : undefined),
          hint: s ? `${tonnes(s.open_kg)} açık işte` : undefined,
        },
        ...countFigureFor(
          '/manufacturing/welding/timesheets',
          {
            id: 'timesheets',
            label: 'Puantaj onayda',
            link: '/manufacturing/welding/timesheets?state=pending',
          },
          timesheets,
        ),
      ]}
      list={list}
    />
  );
}

// ---- Talaşlı İmalat ---------------------------------------------------------

const TIMER_ROWS = 4;

function timerRow(timer: Timer) {
  const downtime = Boolean(timer.timer_type && timer.timer_type !== 'productive');
  return {
    key: timer.id,
    lead: timer.machine_name || '-',
    main: downtime ? (
      <span style={{ color: 'var(--gk-danger)' }}>{timer.downtime_reason_name || 'Duruş'}</span>
    ) : (
      [timer.issue_key, timer.issue_name].filter(Boolean).join(' · ') || '-'
    ),
    sub: timer.username || undefined,
    cells: [<LiveDuration key="duration" start={timer.start_time} />],
  };
}

function MachiningLane() {
  const links = visibleLinks(LINKS.machining);
  const live = hasRouteAccess(MACHINING_DASHBOARD) && links.length > 0;
  const parts = hasRouteAccess(PARTS);
  const timers = useQuery({
    ...activeTimersQueryOptions('machining'),
    staleTime: SHOP_FLOOR_STALE_TIME,
    enabled: live,
  });
  const incomplete = useQuery({ ...incompletePartCountQueryOptions(), enabled: parts });
  const late = useQuery({ ...incompletePartCountQueryOptions(yesterday()), enabled: parts });
  const running = timers.data
    ? [...timers.data].sort((a, b) => Number(a.start_time ?? 0) - Number(b.start_time ?? 0))
    : undefined;
  return (
    <AreaLane
      title="Talaşlı İmalat"
      icon="fas fa-cog"
      family="green"
      hub={MACHINING}
      links={links}
      figures={[
        ...(live
          ? [
              {
                id: 'timers',
                label: 'Aktif zamanlayıcı',
                value: timers.isError ? '-' : running ? formatNumber(running.length) : undefined,
                hint: running
                  ? `${formatNumber(new Set(running.map((t) => t.machine_name)).size)} makinede`
                  : undefined,
                link: MACHINING_DASHBOARD,
              },
            ]
          : []),
        ...countFigureFor(
          PARTS,
          { id: 'incomplete', label: 'Tamamlanmamış parça', link: `${PARTS}?status=incomplete` },
          incomplete,
        ),
        ...countFigureFor(
          PARTS,
          {
            id: 'late',
            label: 'Termini geçen parça',
            link: `${PARTS}?status=incomplete`,
            alert: Boolean(late.data),
          },
          late,
        ),
      ]}
      list={
        live
          ? {
              title: 'Şu an çalışanlar',
              columns: [
                { label: 'Makine', width: '128px' },
                { label: 'İş · operatör' },
                { label: 'Süre', width: '84px', align: 'end' },
              ],
              more: MACHINING_DASHBOARD,
              moreLabel: 'Dashboard',
              rows: running?.slice(0, TIMER_ROWS).map(timerRow),
              isError: timers.isError,
              empty: 'Çalışan zamanlayıcı yok.',
              footnote:
                running && running.length > TIMER_ROWS
                  ? `+${formatNumber(running.length - TIMER_ROWS)} zamanlayıcı daha`
                  : undefined,
            }
          : undefined
      }
    />
  );
}

// ---- Bakım ------------------------------------------------------------------

function faultRow(fault: MachineFault) {
  const kind: { label: string; color: StatusFamily } = fault.is_breaking
    ? { label: 'Duruşta', color: 'red' }
    : fault.is_maintenance
      ? { label: 'Bakım', color: 'blue' }
      : { label: 'Arıza', color: 'orange' };
  return {
    key: fault.id,
    link: FAULTS,
    lead: fault.machine_name || fault.asset_name || '-',
    main: fault.description || '-',
    sub: fault.reported_by_full_name || undefined,
    cells: [
      <StatusBadge key="kind" color={kind.color}>
        {kind.label}
      </StatusBadge>,
      openFor(fault.open_duration_seconds) ?? '-',
    ],
  };
}

function MaintenanceLane() {
  const links = visibleLinks(LINKS.maintenance);
  const faultsOpen = hasRouteAccess(FAULTS);
  const open = useQuery({ ...openFaultCountQueryOptions(), enabled: faultsOpen });
  const stopped = useQuery({
    ...openFaultCountQueryOptions({ is_breaking: true }),
    enabled: faultsOpen,
  });
  const resolved = useQuery({
    ...listCountQueryOptions(
      ['machineFaults'],
      '/machines/faults/',
      { resolved_date: today() },
      SHOP_FLOOR_STALE_TIME,
    ),
    enabled: faultsOpen,
  });
  const latest = useQuery({
    ...listPageQueryOptions<MachineFault>(['machineFaults', 'list'], '/machines/faults/', {
      unresolved: true,
      page_size: FAULT_ROWS,
    }),
    select: (page) => page.results.map(faultRow),
    enabled: faultsOpen,
  });
  return (
    <AreaLane
      title="Bakım"
      icon="fas fa-wrench"
      family="orange"
      hub={MAINTENANCE}
      links={links}
      figures={[
        ...countFigureFor(FAULTS, { id: 'open', label: 'Açık arıza', link: FAULTS }, open),
        ...countFigureFor(
          FAULTS,
          {
            id: 'stopped',
            label: 'Makine duruşta',
            link: `${FAULTS}?type=breaking`,
            alert: Boolean(stopped.data),
          },
          stopped,
        ),
        ...countFigureFor(
          FAULTS,
          { id: 'resolved', label: 'Bugün çözülen', link: when(MAINTENANCE_DASHBOARD) },
          resolved,
        ),
      ]}
      list={
        faultsOpen
          ? {
              title: 'Açık arızalar',
              columns: [
                { label: 'Makine', width: '128px' },
                { label: 'Arıza · bildiren' },
                { label: 'Durum', width: '88px' },
                { label: 'Açık', width: '56px', align: 'end' },
              ],
              more: FAULTS,
              moreLabel: 'Tüm arızalar',
              rows: latest.data,
              isError: latest.isError,
              empty: 'Açık arıza yok.',
              footnote: moreThan(open.data, FAULT_ROWS, 'arıza'),
            }
          : undefined
      }
    />
  );
}

// ---- Taşeron ----------------------------------------------------------------

function statementRow(statement: Statement) {
  const period =
    statement.year && statement.month
      ? formatDate(new Date(statement.year, statement.month - 1, 1), {
          month: 'long',
          year: 'numeric',
        })
      : undefined;
  return {
    key: statement.id,
    link: `${STATEMENTS}?status=submitted`,
    main: statement.subcontractor_name || '-',
    cells: [period ?? '-', formatCurrency(statement.grand_total, statement.currency || 'TRY', 0)],
  };
}

function SubcontractingLane() {
  const links = visibleLinks(LINKS.subcontracting);
  const statements = hasRouteAccess(STATEMENTS);
  const submitted = useQuery({ ...statementsInApprovalCountQueryOptions(), enabled: statements });
  const drafts = useQuery({
    ...listCountQueryOptions(['subcontractingStatements', 'list'], '/subcontracting/statements/', {
      status: 'draft',
    }),
    enabled: statements,
  });
  const active = useQuery({
    ...listCountQueryOptions(['subcontractors'], '/subcontracting/subcontractors/', {
      is_active: true,
    }),
    enabled: hasRouteAccess(SUBCONTRACTORS),
  });
  const waiting = useQuery({
    ...listPageQueryOptions<Statement>(
      ['subcontractingStatements', 'list'],
      '/subcontracting/statements/',
      {
        status: 'submitted',
        page_size: STATEMENT_ROWS,
      },
    ),
    select: (page) => page.results.map(statementRow),
    enabled: statements,
  });
  return (
    <AreaLane
      title="Taşeron"
      icon="fas fa-handshake"
      family="blue"
      hub={SUBCONTRACTING}
      links={links}
      figures={[
        ...countFigureFor(
          STATEMENTS,
          { id: 'submitted', label: 'Hakediş onayda', link: `${STATEMENTS}?status=submitted` },
          submitted,
        ),
        ...countFigureFor(
          STATEMENTS,
          { id: 'draft', label: 'Taslak hakediş', link: `${STATEMENTS}?status=draft` },
          drafts,
        ),
        ...countFigureFor(
          SUBCONTRACTORS,
          { id: 'active', label: 'Aktif taşeron', link: SUBCONTRACTORS },
          active,
        ),
      ]}
      list={
        statements
          ? {
              title: 'Onay bekleyen hakedişler',
              columns: [
                { label: 'Onay bekleyen hakediş' },
                { label: 'Dönem', width: '120px' },
                { label: 'Tutar', width: '120px', align: 'end' },
              ],
              more: `${STATEMENTS}?status=submitted`,
              moreLabel: 'Onay bekleyenler',
              rows: waiting.data,
              isError: waiting.isError,
              empty: 'Onay bekleyen hakediş yok.',
              footnote: moreThan(submitted.data, STATEMENT_ROWS, 'hakediş'),
            }
          : undefined
      }
    />
  );
}

// ---- Malzeme ----------------------------------------------------------------

function pullRequestRow(request: MaterialPullRequest) {
  return {
    key: request.id,
    link: `${PULL_REQUESTS}?status=pending`,
    lead: request.number,
    main: request.destination_name || '-',
    sub: request.job_nos?.join(', ') || undefined,
    cells: [request.requested_by_name || '-', shortDate(request.requested_at) ?? '-'],
  };
}

function MaterialsLane() {
  const links = visibleLinks(LINKS.materials);
  const requests = hasRouteAccess(PULL_REQUESTS);
  const pending = useQuery({ ...pendingPullRequestCountQueryOptions(), enabled: requests });
  const transferred = useQuery({
    ...listCountQueryOptions(['materialTracking', 'pullRequests'], '/warehouse/pull-requests/', {
      status: 'transferred',
      confirmed_after: today(),
    }),
    enabled: requests,
  });
  const latest = useQuery({
    ...listPageQueryOptions<MaterialPullRequest>(
      ['materialTracking', 'pullRequests'],
      '/warehouse/pull-requests/',
      {
        status: 'pending',
        page_size: PULL_ROWS,
      },
    ),
    select: (page) => page.results.map(pullRequestRow),
    enabled: requests,
  });
  return (
    <AreaLane
      title="Malzeme"
      icon="fas fa-dolly"
      family="purple"
      hub={when(MATERIALS)}
      links={links}
      figures={[
        ...countFigureFor(
          PULL_REQUESTS,
          {
            id: 'pending',
            label: 'Depoda bekleyen talep',
            link: `${PULL_REQUESTS}?status=pending`,
          },
          pending,
        ),
        ...countFigureFor(
          PULL_REQUESTS,
          {
            id: 'transferred',
            label: 'Bugün aktarılan',
            link: `${PULL_REQUESTS}?status=transferred`,
          },
          transferred,
        ),
      ]}
      list={
        requests
          ? {
              title: 'Bekleyen çekme talepleri',
              columns: [
                { label: 'Talep', width: '96px' },
                { label: 'Hedef · iş no' },
                { label: 'Talep eden', width: '136px' },
                { label: 'Tarih', width: '64px', align: 'end' },
              ],
              more: `${PULL_REQUESTS}?status=pending`,
              moreLabel: 'Bekleyen talepler',
              rows: latest.data,
              isError: latest.isError,
              empty: 'Depoda bekleyen talep yok.',
              footnote: moreThan(pending.data, PULL_ROWS, 'talep'),
            }
          : undefined
      }
    />
  );
}

// ---- Projeler ---------------------------------------------------------------

function ProjectsLane() {
  const links = [
    ...visibleLinks(LINKS.projects),
    ...(REPORT_PAGES.some((route) => hasRouteAccess(route))
      ? [{ label: 'Raporlar', link: REPORTS }]
      : []),
  ];
  const { user } = useAuth();
  const { enabled, active, mine, overdue } = useDepartmentTaskFigures('manufacturing', PROJECTS);
  const day = today();
  const tasks = useQuery({
    ...taskDeadlinesQueryOptions('manufacturing', 4),
    select: (page) =>
      page.results.map((task) => {
        const target = task.target_completion_date ?? undefined;
        return {
          key: task.id,
          link: `${PROJECTS}?task=${task.id}`,
          lead: task.job_order || '-',
          main: task.job_order_title || task.title || '-',
          sub: task.assigned_to_name || undefined,
          cells: [
            <StatusBadge key="status" color={taskStatusFamily(task.status)}>
              {task.status_display || task.status || '-'}
            </StatusBadge>,
            target && target < day ? (
              <LaneAlert key="target">{shortDate(target)}</LaneAlert>
            ) : (
              (shortDate(target) ?? '-')
            ),
          ],
        };
      }),
    enabled,
  });
  return (
    <AreaLane
      title="Projeler"
      icon="fas fa-project-diagram"
      family="grey"
      links={links}
      figures={
        enabled
          ? [
              { id: 'active', label: 'Aktif görev', value: countValue(active), link: PROJECTS },
              {
                id: 'mine',
                label: 'Bana atanan',
                value: countValue(mine),
                link: `${PROJECTS}?assigned_to=${user.id}`,
              },
              {
                id: 'overdue',
                label: 'Hedefi geçen',
                value: countValue(overdue),
                link: PROJECTS,
                alert: Boolean(overdue.data),
              },
            ]
          : []
      }
      list={
        enabled
          ? {
              title: 'Teslim sırası',
              columns: [
                { label: 'İş', width: '56px' },
                { label: 'Görev · sorumlu' },
                { label: 'Durum', width: '128px' },
                { label: 'Hedef', width: '64px', align: 'end' },
              ],
              more: PROJECTS,
              moreLabel: 'Tüm görevler',
              rows: tasks.data,
              isError: tasks.isError,
              empty: 'Hedef tarihi olan açık görev yok.',
            }
          : undefined
      }
    />
  );
}

// ---- the page ---------------------------------------------------------------

/** Band tiles: what is running, what is stopped, what is late. */
function useBandFigures(): PageFigure[] {
  const live = hasRouteAccess(MACHINING_DASHBOARD);
  const faults = hasRouteAccess(FAULTS);
  const parts = hasRouteAccess(PARTS);
  const welding = visibleLinks(LINKS.welding).length > 0;
  const timers = useQuery({
    ...activeTimersQueryOptions('machining'),
    staleTime: SHOP_FLOOR_STALE_TIME,
    enabled: live,
  });
  const stopped = useQuery({
    ...openFaultCountQueryOptions({ is_breaking: true }),
    enabled: faults,
  });
  const late = useQuery({ ...incompletePartCountQueryOptions(yesterday()), enabled: parts });
  const summary = useQuery({ ...weldingHubSummaryQueryOptions(), enabled: welding });
  const tile = (figure: Omit<PageFigure, 'value'>, value: string | undefined): PageFigure => ({
    ...figure,
    value: value ?? <PendingValue />,
  });
  return [
    ...(live
      ? [
          tile(
            {
              id: 'timers',
              label: 'Aktif Zamanlayıcı',
              icon: 'fas fa-stopwatch',
              link: MACHINING_DASHBOARD,
            },
            timers.isError ? '-' : timers.data ? formatNumber(timers.data.length) : undefined,
          ),
        ]
      : []),
    ...(faults
      ? [
          tile(
            {
              id: 'stopped',
              label: 'Duruşta Makine',
              icon: 'fas fa-power-off',
              link: `${FAULTS}?type=breaking`,
            },
            countValue(stopped),
          ),
        ]
      : []),
    ...(parts
      ? [
          tile(
            {
              id: 'lateParts',
              label: 'Geciken Parça',
              icon: 'fas fa-calendar-xmark',
              link: `${PARTS}?status=incomplete`,
            },
            countValue(late),
          ),
        ]
      : []),
    ...(welding
      ? [
          tile(
            {
              id: 'lateWelding',
              label: 'Geciken Kaynak İşi',
              icon: 'fas fa-fire',
              link: when(PLANNING_BOARD) ?? WELDING,
            },
            summary.isError
              ? '-'
              : summary.data
                ? formatNumber(summary.data.overdue_tasks)
                : undefined,
          ),
        ]
      : []),
  ];
}

export function ManufacturingSectionHubPage() {
  const stats = useBandFigures();
  return (
    <>
      <PageHeader
        title="İmalat"
        subtitle="Alan alan atölyenin güncel durumu"
        stats={stats}
        figureStyle="tiles"
      />
      <AreaLanes>
        <WeldingLane />
        <MachiningLane />
        <MaintenanceLane />
        <SubcontractingLane />
        <MaterialsLane />
        <ProjectsLane />
      </AreaLanes>
    </>
  );
}

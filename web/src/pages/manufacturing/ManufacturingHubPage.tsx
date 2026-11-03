import { useQueries, useQuery, type QueryKey, type UseQueryOptions } from '@tanstack/react-query';
import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import dayjs from 'dayjs';
import { useLocation } from 'react-router';
import { listPageQueryOptions } from '@/api/counts';
import type { MachineFault } from '@/api/maintenance/faults';
import {
  activeTimerCountQueryOptions,
  incompletePartCountQueryOptions,
  openFaultCountQueryOptions,
  pendingCncCutCountQueryOptions,
  pendingLinearTaskCountQueryOptions,
  pendingPullRequestCountQueryOptions,
  pendingTimesheetCountQueryOptions,
  statementsInApprovalCountQueryOptions,
  weldingEntryCountQueryOptions,
} from '@/api/manufacturing/counts';
import { partsStatsQueryOptions } from '@/api/manufacturing/machiningParts';
import { formatDate, formatNumber } from '@/lib/format';
import { NotFound } from '@/pages/NotFound';
import { normalizeRoute } from '@/routes/migrated';
import { MenuCards, PendingValue, type MenuCard, type PageFigure, type StatusFamily } from '@/ui';
import {
  AttentionPanel,
  BreakdownPanel,
  HubPanels,
  PanelTotal,
  RecordsPanel,
  type HubRecord,
} from '../hub/HubPanels';
import { MANUFACTURING_HUBS, type HubFigure, type HubPanel } from './hubs';

type CountOptions = UseQueryOptions<number, Error, number, QueryKey>;

interface FigureDef {
  /** Band tile label. */
  label: string;
  /** Tile label on /manufacturing, where several areas share the band. */
  sectionLabel?: string;
  /** Label beside the figure on a card. */
  cardLabel: string;
  icon: string;
  /** The page behind the figure: the tile links there, and no grant, no request. */
  link: string;
  /** The grant to check when `link` carries a query. */
  route?: string;
  /** Built on render, so date-bound counts move with the day. */
  query: () => CountOptions;
  /** The row in the shop's queue panel, for figures that wait on someone. */
  queue?: { label: string; hint?: string; color: StatusFamily };
}

const today = () => dayjs().format('YYYY-MM-DD');
const yesterday = () => dayjs().subtract(1, 'day').format('YYYY-MM-DD');

const FAULTS = '/manufacturing/maintenance/fault-requests';
const PARTS = '/manufacturing/machining/tasks/list';

const FIGURES: Record<HubFigure, FigureDef> = {
  machiningTimers: {
    label: 'Aktif Zamanlayıcı',
    sectionLabel: 'Talaşlı Aktif Zamanlayıcı',
    cardLabel: 'aktif zamanlayıcı',
    icon: 'fas fa-stopwatch',
    link: '/manufacturing/machining/dashboard',
    query: () => activeTimerCountQueryOptions('machining'),
  },
  cncTimers: {
    label: 'Aktif Zamanlayıcı',
    sectionLabel: 'CNC Aktif Zamanlayıcı',
    cardLabel: 'aktif zamanlayıcı',
    icon: 'fas fa-stopwatch',
    link: '/manufacturing/cnc-cutting/dashboard',
    query: () => activeTimerCountQueryOptions('cnc_cutting'),
  },
  openFaults: {
    label: 'Açık Arıza',
    cardLabel: 'açık arıza',
    icon: 'fas fa-exclamation-triangle',
    link: FAULTS,
    query: () => openFaultCountQueryOptions(),
  },
  stoppedMachines: {
    label: 'Makine Duruşta',
    cardLabel: 'makine duruşta',
    icon: 'fas fa-power-off',
    link: `${FAULTS}?type=breaking`,
    route: FAULTS,
    query: () => openFaultCountQueryOptions({ is_breaking: true }),
  },
  incompleteParts: {
    label: 'Tamamlanmamış Parça',
    cardLabel: 'parça tamamlanmadı',
    icon: 'fas fa-cubes',
    link: `${PARTS}?status=incomplete`,
    route: PARTS,
    query: () => incompletePartCountQueryOptions(),
  },
  lateParts: {
    label: 'Termini Geçen Parça',
    cardLabel: 'parça termini geçti',
    icon: 'fas fa-calendar-xmark',
    // The parts list cannot filter on the finish date; it opens on the open parts.
    link: `${PARTS}?status=incomplete`,
    route: PARTS,
    query: () => incompletePartCountQueryOptions(yesterday()),
    queue: { label: 'Termini geçen parçalar', hint: 'Talaşlı imalat, tamamlanmadı', color: 'red' },
  },
  cncPendingCuts: {
    label: 'Bekleyen Kesim',
    cardLabel: 'kesim bekliyor',
    icon: 'fas fa-cut',
    link: '/manufacturing/cnc-cutting/cuts?status=pending',
    route: '/manufacturing/cnc-cutting/cuts',
    query: () => pendingCncCutCountQueryOptions(),
    queue: { label: 'CNC kesimleri', hint: 'Tamamlanmamış nesting', color: 'blue' },
  },
  linearPendingTasks: {
    label: 'Bekleyen Lineer Kesim',
    cardLabel: 'görev bekliyor',
    icon: 'fas fa-ruler-horizontal',
    link: '/manufacturing/linear-cutting/tasks?completed=false',
    route: '/manufacturing/linear-cutting/tasks',
    query: () => pendingLinearTaskCountQueryOptions(),
    queue: { label: 'Lineer kesim görevleri', hint: 'Tamamlanmadı', color: 'blue' },
  },
  weldingEntriesToday: {
    label: 'Bugünkü Zaman Kaydı',
    cardLabel: 'kayıt bugün',
    icon: 'fas fa-fire',
    link: `/manufacturing/welding/time-entries?date=${today()}`,
    route: '/manufacturing/welding/time-entries',
    query: () => weldingEntryCountQueryOptions(today()),
  },
  timesheetsPending: {
    label: 'Onay Bekleyen Puantaj',
    cardLabel: 'puantaj onay bekliyor',
    icon: 'fas fa-clipboard-check',
    link: '/manufacturing/welding/timesheets?state=pending',
    route: '/manufacturing/welding/timesheets',
    query: () => pendingTimesheetCountQueryOptions(today()),
  },
  pendingPullRequests: {
    label: 'Bekleyen Çekme Talebi',
    cardLabel: 'talep depoda bekliyor',
    icon: 'fas fa-dolly',
    link: '/manufacturing/material-tracking/pull-requests?status=pending',
    route: '/manufacturing/material-tracking/pull-requests',
    query: () => pendingPullRequestCountQueryOptions(),
    queue: { label: 'Depo çekme talepleri', hint: 'Depodan aktarılmayı bekliyor', color: 'yellow' },
  },
  statementsInApproval: {
    label: 'Onay Bekleyen Hakediş',
    cardLabel: 'hakediş onay bekliyor',
    icon: 'fas fa-file-invoice-dollar',
    link: '/manufacturing/subcontracting/statements?status=submitted',
    route: '/manufacturing/subcontracting/statements',
    query: () => statementsInApprovalCountQueryOptions(),
    queue: { label: 'Taşeron hakedişleri', hint: 'Onay bekliyor', color: 'yellow' },
  },
};

const QUEUE_ORDER: HubFigure[] = [
  'lateParts',
  'cncPendingCuts',
  'linearPendingTasks',
  'pendingPullRequests',
  'statementsInApproval',
];

const canOpen = (key: HubFigure) => hasRouteAccess(FIGURES[key].route ?? FIGURES[key].link);

/** Fetches the hub's figures in parallel; the raw results, keyed. */
function useFigures(keys: HubFigure[]) {
  const results = useQueries({
    queries: keys.map((key) => ({ ...FIGURES[key].query(), enabled: canOpen(key) })),
  });
  return new Map(keys.map((key, i) => [key, results[i]!] as const));
}

function figureText(result: { data?: number; isError: boolean } | undefined) {
  if (!result) return undefined;
  return result.isError ? '-' : result.data === undefined ? undefined : formatNumber(result.data);
}

function openFor(seconds: number | null | undefined) {
  if (!seconds) return undefined;
  const hours = seconds / 3600;
  return hours < 24
    ? `${formatNumber(Math.max(1, Math.round(hours)))} sa`
    : `${formatNumber(Math.floor(hours / 24))} gün`;
}

function faultRecord(fault: MachineFault): HubRecord {
  const kind: { label: string; color: StatusFamily } = fault.is_breaking
    ? { label: 'Duruşta', color: 'red' }
    : fault.is_maintenance
      ? { label: 'Bakım', color: 'blue' }
      : { label: 'Arıza', color: 'orange' };
  return {
    key: fault.id,
    link: FAULTS,
    code: fault.machine_name || fault.asset_name || '-',
    title: fault.description || '-',
    subtitle:
      [
        fault.reported_by_full_name,
        fault.reported_at
          ? formatDate(fault.reported_at, { day: 'numeric', month: 'short' })
          : null,
      ]
        .filter(Boolean)
        .join(' · ') || undefined,
    status: kind,
    meta: openFor(fault.open_duration_seconds),
    alert: Boolean(fault.is_breaking),
  };
}

/** The latest unresolved faults, stopped machines in red. */
function OpenFaultsPanel() {
  const faults = useQuery({
    ...listPageQueryOptions<MachineFault>(['machineFaults', 'list'], '/machines/faults/', {
      unresolved: true,
      page_size: 6,
    }),
    select: (page) => page.results.map(faultRecord),
    enabled: hasRouteAccess(FAULTS),
  });
  return (
    <RecordsPanel
      title="Açık Arızalar"
      icon="fas fa-screwdriver-wrench"
      more={FAULTS}
      noun="Arızalar"
      empty="Açık arıza yok."
      query={faults}
    />
  );
}

/** Machining parts held up before production: no operations, unassigned or unplanned ones. */
function PartsBacklogPanel() {
  const stats = useQuery({ ...partsStatsQueryOptions(), enabled: hasRouteAccess(PARTS) });
  const s = stats.data as
    (NonNullable<typeof stats.data> & { incomplete_parts?: number }) | undefined;
  const value = (n: number | undefined) => (s ? (n ?? 0) : undefined);
  return (
    <BreakdownPanel
      title="Parça Hazırlığı"
      icon="fas fa-list-check"
      failed={stats.isError}
      more={PARTS}
      rows={[
        {
          key: 'without',
          label: 'Operasyonu olmayan',
          color: 'red',
          count: value(s?.parts_without_operations),
          link: `${PARTS}?has_operations=true`,
        },
        {
          key: 'unassigned',
          label: 'Makinesi atanmamış operasyonu olan',
          color: 'orange',
          count: value(s?.parts_with_unassigned_operations),
          link: `${PARTS}?has_unassigned_operations=true`,
        },
        {
          key: 'unplanned',
          label: 'Plana alınmamış operasyonu olan',
          color: 'yellow',
          count: value(s?.parts_with_unplanned_operations),
          link: `${PARTS}?has_unplanned_operations=true`,
        },
      ]}
      footer={
        s?.incomplete_parts !== undefined ? (
          <PanelTotal label="Tamamlanmamış parça" value={s.incomplete_parts} />
        ) : undefined
      }
    />
  );
}

/** Every manufacturing hub; the path picks its cards from MANUFACTURING_HUBS. */
export function ManufacturingHubPage() {
  const path = normalizeRoute(useLocation().pathname);
  const hub = MANUFACTURING_HUBS[path];
  const panels: HubPanel[] = hub?.panels ?? [];
  const bandKeys = (hub?.figures ?? []).filter(canOpen);
  const cardKeys = (hub?.cards ?? []).flatMap((card) =>
    card.figure && canOpen(card.figure) ? [card.figure] : [],
  );
  const queueKeys = panels.includes('shopQueues') ? QUEUE_ORDER.filter(canOpen) : [];
  const results = useFigures([...new Set([...bandKeys, ...cardKeys, ...queueKeys])]);
  if (!hub) return <NotFound />;

  const stats: PageFigure[] = bandKeys.map((key) => ({
    id: key,
    label: (path === '/manufacturing' && FIGURES[key].sectionLabel) || FIGURES[key].label,
    value: figureText(results.get(key)) ?? <PendingValue />,
    icon: FIGURES[key].icon,
    link: FIGURES[key].link,
  }));
  const cards: MenuCard[] = hub.cards.map(({ figure, ...card }) =>
    figure && results.has(figure)
      ? {
          ...card,
          stat: { value: figureText(results.get(figure)), label: FIGURES[figure].cardLabel },
        }
      : card,
  );
  const queues = queueKeys.map((key) => ({
    id: key,
    label: FIGURES[key].queue!.label,
    hint: FIGURES[key].queue!.hint,
    icon: FIGURES[key].icon,
    color: FIGURES[key].queue!.color,
    link: FIGURES[key].link,
    count: results.get(key)!,
  }));
  const shown = panels.filter((panel) =>
    panel === 'shopQueues'
      ? queues.length > 0
      : hasRouteAccess(panel === 'openFaults' ? FAULTS : PARTS),
  );

  return (
    <MenuCards
      title={hub.title}
      subtitle={hub.subtitle}
      stats={stats}
      // Compact cards only where no card lists feature links: a tall feature card
      // would leave its compact neighbours mostly empty.
      compact={shown.length > 0 && hub.cards.every((card) => !card.features?.length)}
      cards={cards}
    >
      {shown.length > 0 ? (
        <HubPanels>
          {shown.map((panel) =>
            panel === 'openFaults' ? (
              <OpenFaultsPanel key={panel} />
            ) : panel === 'partsBacklog' ? (
              <PartsBacklogPanel key={panel} />
            ) : (
              <AttentionPanel
                key={panel}
                title="Atölyeyi Bekleyenler"
                icon="fas fa-inbox"
                items={queues}
              />
            ),
          )}
        </HubPanels>
      ) : null}
    </MenuCards>
  );
}

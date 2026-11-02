import { useQueries } from '@tanstack/react-query';
import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import { useLocation } from 'react-router';
import {
  activeTimerCountQueryOptions,
  openFaultCountQueryOptions,
  type CountQueryOptions,
} from '@/api/manufacturing/counts';
import { formatNumber } from '@/lib/format';
import { NotFound } from '@/pages/NotFound';
import { normalizeRoute } from '@/routes/migrated';
import { MenuCards, PendingValue, type MenuCard, type PageFigure } from '@/ui';
import { MANUFACTURING_HUBS, type HubFigure } from './hubs';

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
  query: CountQueryOptions;
}

const FIGURES: Record<HubFigure, FigureDef> = {
  machiningTimers: {
    label: 'Aktif Zamanlayıcı',
    sectionLabel: 'Talaşlı Aktif Zamanlayıcı',
    cardLabel: 'aktif zamanlayıcı',
    icon: 'fas fa-stopwatch',
    link: '/manufacturing/machining/dashboard',
    query: activeTimerCountQueryOptions('machining'),
  },
  cncTimers: {
    label: 'Aktif Zamanlayıcı',
    sectionLabel: 'CNC Aktif Zamanlayıcı',
    cardLabel: 'aktif zamanlayıcı',
    icon: 'fas fa-stopwatch',
    link: '/manufacturing/cnc-cutting/dashboard',
    query: activeTimerCountQueryOptions('cnc_cutting'),
  },
  openFaults: {
    label: 'Açık Arıza',
    cardLabel: 'açık arıza',
    icon: 'fas fa-exclamation-triangle',
    link: '/manufacturing/maintenance/fault-requests',
    query: openFaultCountQueryOptions(),
  },
  stoppedMachines: {
    label: 'Makine Duruşta',
    cardLabel: 'makine duruşta',
    icon: 'fas fa-power-off',
    link: '/manufacturing/maintenance/fault-requests',
    query: openFaultCountQueryOptions({ is_breaking: true }),
  },
};

/** Fetches the hub's figures in parallel; undefined while loading, '-' on failure. */
function useFigures(keys: HubFigure[]) {
  const results = useQueries({
    queries: keys.map((key) => ({ ...FIGURES[key].query, enabled: hasRouteAccess(FIGURES[key].link) })),
  });
  return new Map(
    keys.map((key, i) => {
      const { data, isError } = results[i]!;
      return [key, isError ? '-' : data === undefined ? undefined : formatNumber(data)] as const;
    }),
  );
}

/** Every manufacturing hub; the path picks its cards from MANUFACTURING_HUBS. */
export function ManufacturingHubPage() {
  const path = normalizeRoute(useLocation().pathname);
  const hub = MANUFACTURING_HUBS[path];
  const bandKeys = (hub?.figures ?? []).filter((key) => hasRouteAccess(FIGURES[key].link));
  const cardKeys = (hub?.cards ?? []).flatMap((card) =>
    card.figure && hasRouteAccess(FIGURES[card.figure].link) ? [card.figure] : [],
  );
  const values = useFigures([...new Set([...bandKeys, ...cardKeys])]);
  if (!hub) return <NotFound />;

  const stats: PageFigure[] = bandKeys.map((key) => ({
    id: key,
    label: (path === '/manufacturing' && FIGURES[key].sectionLabel) || FIGURES[key].label,
    value: values.get(key) ?? <PendingValue />,
    icon: FIGURES[key].icon,
    link: FIGURES[key].link,
  }));
  const cards: MenuCard[] = hub.cards.map(({ figure, ...card }) =>
    figure && values.has(figure)
      ? { ...card, stat: { value: values.get(figure), label: FIGURES[figure].cardLabel } }
      : card,
  );

  return <MenuCards title={hub.title} subtitle={hub.subtitle} stats={stats} cards={cards} />;
}

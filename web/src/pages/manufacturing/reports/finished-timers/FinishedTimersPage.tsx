import type { TimerModule } from '@/api/manufacturing/counts';
import { FinishedTimersReport } from '../../reports-shared/FinishedTimersReport';
import { useReportView, type ReportView } from '../../reports-shared/reportView';

export const FINISHED_TIMER_VIEWS: ReportView<TimerModule>[] = [
  {
    value: 'machining',
    label: 'Talaşlı İmalat',
    route: '/manufacturing/machining/reports/finished-timers',
  },
  {
    value: 'cnc_cutting',
    label: 'CNC Kesim',
    route: '/manufacturing/cnc-cutting/reports/finished-timers',
  },
];

/**
 * Biten Zamanlayıcılar for both shops: the CNC and machining pages were the
 * same report on two timer endpoints. `?module=` picks the shop; the user,
 * dates survive a switch, the shop's own filters (machine, nesting, TI) don't.
 */
export function FinishedTimersPage() {
  const { view, switcher } = useReportView('module', FINISHED_TIMER_VIEWS, [
    'user',
    'start_date',
    'finish_date',
  ]);
  if (!view) return null;
  return <FinishedTimersReport key={view} module={view} switcher={switcher} />;
}

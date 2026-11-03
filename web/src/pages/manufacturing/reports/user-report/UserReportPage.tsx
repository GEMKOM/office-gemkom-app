import type { TimerModule } from '@/api/manufacturing/counts';
import { UserReport } from '../../reports-shared/UserReport';
import { useReportView, type ReportView } from '../../reports-shared/reportView';

export const USER_REPORT_VIEWS: ReportView<TimerModule>[] = [
  { value: 'machining', label: 'Talaşlı İmalat', route: '/manufacturing/machining/reports/user-report' },
  { value: 'cnc_cutting', label: 'CNC Kesim', route: '/manufacturing/cnc-cutting/reports/user-report' },
];

/**
 * Kullanıcı Raporu for both shops: the CNC and machining pages were the same
 * report on two endpoints. `?module=` picks the shop; the date range stays.
 */
export function UserReportPage() {
  const { view, switcher } = useReportView('module', USER_REPORT_VIEWS, ['date_start', 'date_end']);
  if (!view) return null;
  return <UserReport key={view} module={view} switcher={switcher} />;
}

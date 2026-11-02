import { FinishedTimersReport } from '../../../reports-shared/FinishedTimersReport';

/** Port of manufacturing/cnc-cutting/reports/finished-timers. */
export function CncFinishedTimersPage() {
  return <FinishedTimersReport module="cnc_cutting" />;
}

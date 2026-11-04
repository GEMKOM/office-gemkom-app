import type { Timer } from '@/api/manufacturing/timers';
import { formatNumber } from '@/lib/format';
import { LiveDuration } from '../dashboard-shared/parts';
import type { LaneList, LaneRow } from './AreaLane';

// The running timers of a shop (machining on İmalat, CNC on Planlama) as a
// lane list: machine, job and operator, and the live duration.

export const TIMER_ROWS = 4;

/** Longest-running first. */
export function sortTimers(timers: Timer[] | undefined) {
  return timers
    ? [...timers].sort((a, b) => Number(a.start_time ?? 0) - Number(b.start_time ?? 0))
    : undefined;
}

export function timerRow(timer: Timer): LaneRow {
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

/** The "Şu an çalışanlar" list; `running` comes from sortTimers. */
export function timersList(
  running: Timer[] | undefined,
  { isError, dashboard }: { isError: boolean; dashboard: string },
): LaneList {
  return {
    title: 'Şu an çalışanlar',
    columns: [
      { label: 'Makine', width: '128px' },
      { label: 'İş · operatör' },
      { label: 'Süre', width: '84px', align: 'end' },
    ],
    more: dashboard,
    moreLabel: 'Dashboard',
    rows: running?.slice(0, TIMER_ROWS).map(timerRow),
    isError,
    empty: 'Çalışan zamanlayıcı yok.',
    footnote:
      running && running.length > TIMER_ROWS
        ? `+${formatNumber(running.length - TIMER_ROWS)} zamanlayıcı daha`
        : undefined,
  };
}

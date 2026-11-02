import type {
  MachineTimelineResponse,
  TimelineSegment,
  TimelineTotals,
} from '@/api/manufacturing/machiningCapacityReports';
import type { GanttBar, GanttRow, GanttTone } from '@/ui/Gantt';

// Legacy loadMachineTimelineForPeriod + updateGanttChart of
// manufacturing/machining/reports/history/history.js, as one pure function.

export interface SegmentBar extends GanttBar {
  timerId: number | null;
}

export interface TimelineView {
  totals: Required<TimelineTotals>;
  rows: GanttRow[];
  bars: SegmentBar[];
}

const TONE: Record<string, GanttTone> = { work: 'green', hold: 'yellow', idle: 'red' };

function titleAndKey(segment: TimelineSegment): { title: string; key: string } {
  switch (segment.category) {
    case 'work':
      return { title: segment.task_name || 'Bilinmeyen Görev', key: segment.task_key ?? '' };
    case 'hold':
      return { title: segment.task_name || 'Bekleme', key: segment.task_key ?? '' };
    case 'idle':
      return { title: 'Boşta', key: 'Boşta' };
    default:
      return { title: segment.task_name || 'Bilinmeyen', key: segment.task_key ?? '' };
  }
}

function segmentBar(segment: TimelineSegment, id: string, rowId: string): SegmentBar {
  const { title, key } = titleAndKey(segment);
  return {
    id,
    rowId,
    start: segment.start_ms,
    end: Math.max(segment.end_ms, segment.start_ms),
    label: key || title,
    title: key && key !== title ? `${key} · ${title}` : title,
    tone: TONE[segment.category ?? ''] ?? 'grey',
    timerId: segment.timer_id ?? null,
  };
}

const zero = (t: TimelineTotals | null | undefined): Required<TimelineTotals> => ({
  productive_seconds: t?.productive_seconds ?? 0,
  hold_seconds: t?.hold_seconds ?? 0,
  idle_seconds: t?.idle_seconds ?? 0,
});

/**
 * One machine: a row per segment (legacy). "Tüm Makineler" ('all'): a row per
 * machine that has segments, its segments side by side. Totals prefer the
 * response's overall_totals.
 */
export function timelineView(
  response: MachineTimelineResponse | undefined,
  machineId: string,
): TimelineView | null {
  if (!response) return null;
  const rows: GanttRow[] = [];
  const bars: SegmentBar[] = [];

  if (!Array.isArray(response) && 'machines' in response && Array.isArray(response.machines)) {
    const overall =
      response.overall_totals && typeof response.overall_totals === 'object'
        ? response.overall_totals
        : null;
    if (machineId === 'all') {
      const sum = { productive_seconds: 0, hold_seconds: 0, idle_seconds: 0 };
      response.machines.forEach((machine, index) => {
        sum.productive_seconds += machine.totals?.productive_seconds || 0;
        sum.hold_seconds += machine.totals?.hold_seconds || 0;
        sum.idle_seconds += machine.totals?.idle_seconds || 0;
        const segments = [...(machine.segments ?? [])].sort((a, b) => a.start_ms - b.start_ms);
        if (segments.length === 0) return;
        const name = machine.machine_name || 'Bilinmeyen Makine';
        const rowId = `machine-${index}`;
        rows.push({ id: rowId, label: name });
        segments.forEach((s, i) => bars.push(segmentBar(s, `${rowId}-segment-${i}`, rowId)));
      });
      return { totals: zero(overall ?? sum), rows, bars };
    }
    const machine = response.machines.find((m) => String(m.machine_id) === String(machineId));
    (machine?.segments ?? []).forEach((s, i) => {
      const id = `segment-${i}`;
      const bar = segmentBar(s, id, id);
      rows.push({ id, label: bar.label ?? '', sublabel: titleAndKey(s).title });
      bars.push(bar);
    });
    return { totals: zero(overall ?? machine?.totals), rows, bars };
  }

  if (!Array.isArray(response) && 'segments' in response && Array.isArray(response.segments)) {
    response.segments.forEach((s, i) => {
      const id = `segment-${i}`;
      const bar = segmentBar(s, id, id);
      rows.push({ id, label: bar.label ?? '', sublabel: titleAndKey(s).title });
      bars.push(bar);
    });
    return { totals: zero(response.overall_totals ?? response.totals), rows, bars };
  }

  if (Array.isArray(response)) {
    // Oldest format: tasks with hours spent, drawn as if just finished (legacy workaround).
    const now = Date.now();
    const totals = zero(null);
    response.forEach((task, i) => {
      const spent = task.total_hours_spent ?? 0;
      if (spent <= 0) return;
      const id = `segment-${i}`;
      const s: TimelineSegment = {
        start_ms: now - spent * 3_600_000,
        end_ms: now,
        task_key: task.key,
        task_name: task.name,
        category: 'work',
        is_hold: false,
      };
      const bar = segmentBar(s, id, id);
      rows.push({ id, label: bar.label ?? '', sublabel: titleAndKey(s).title });
      bars.push(bar);
      totals.productive_seconds += spent * 3600;
    });
    return { totals, rows, bars };
  }
  return null;
}

/** Seconds -> "3h 25m" / "25m" / "0m" (legacy formatDuration). */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '0m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

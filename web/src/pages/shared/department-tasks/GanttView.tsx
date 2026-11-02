import { useMemo } from 'react';
import { Gantt, type GanttBar, type GanttRow, type GanttTone } from '@/ui/Gantt';
import type { GanttPeriod, GanttTask } from './logic';

export interface GanttViewProps {
  /** Legacy GanttChart input: task rows, or user rows with `segments`. */
  tasks: GanttTask[];
  title: string;
  period: GanttPeriod;
  anchor: Date;
  onPeriodChange: (period: GanttPeriod, date: Date) => void;
  onTaskClick: (id: number) => void;
}

interface TaskBar extends GanttBar {
  taskId: number;
}

function tone(task: GanttTask): GanttTone {
  if (task.is_overdue) return 'red';
  if (task.status === 'completed') return 'green';
  if (task.status === 'in_progress') return 'blue';
  if (task.status === 'skipped') return 'grey';
  return 'brand';
}

function toBar(task: GanttTask, rowId: string): TaskBar | null {
  if (
    !task.planned_start_ms ||
    !task.planned_end_ms ||
    task.planned_end_ms <= task.planned_start_ms
  )
    return null;
  return {
    id: String(task.id),
    taskId: Number(task.id),
    rowId,
    start: task.planned_start_ms,
    end: task.planned_end_ms,
    label: String(task.ti_number),
    title: `${task.ti_number} - ${task.title}`,
    tone: tone(task),
    progress: task.progress_percentage ?? null,
  };
}

/** The legacy rows (task or user rows) as the shared Gantt's rows and bars. */
export function toGanttModel(tasks: readonly GanttTask[]): { rows: GanttRow[]; bars: TaskBar[] } {
  const rows: GanttRow[] = [];
  const bars: TaskBar[] = [];
  for (const task of tasks) {
    const rowId = String(task.id);
    rows.push({ id: rowId, label: String(task.ti_number), sublabel: task.title });
    const parts = task.segments ?? [task];
    for (const part of parts) {
      const bar = toBar(part, rowId);
      if (bar) bars.push(bar);
    }
  }
  return { rows, bars };
}

/** Legacy initializeGanttComponent: the period window drives the list request. */
export function GanttView({
  tasks,
  title,
  period,
  anchor,
  onPeriodChange,
  onTaskClick,
}: GanttViewProps) {
  const { rows, bars } = useMemo(() => toGanttModel(tasks), [tasks]);
  return (
    <Gantt
      title={title}
      icon="fas fa-chart-gantt"
      rows={rows}
      bars={bars}
      scale={period}
      anchor={anchor.getTime()}
      onViewChange={(view) => onPeriodChange(view.scale, new Date(view.anchor))}
      onBarOpen={(bar) => onTaskClick(bar.taskId)}
      workingWindows={null}
      ariaLabel={title}
      emptyMessage="Gantt çizelgesi için görev bulunamadı"
    />
  );
}

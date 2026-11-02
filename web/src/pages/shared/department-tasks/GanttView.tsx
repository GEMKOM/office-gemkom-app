import '@legacy/components/gantt/gantt.css';
import { GanttChart } from '@legacy/components/gantt/gantt.js';
import { useEffect, useId, useLayoutEffect, useRef } from 'react';
import classes from './DepartmentTasks.module.css';
import type { GanttPeriod, GanttTask } from './logic';

export interface GanttViewProps {
  tasks: GanttTask[];
  title: string;
  onPeriodChange: (period: GanttPeriod, date: Date) => void;
  onTaskClick: (id: number) => void;
}

/**
 * The legacy GanttChart in a React host (legacy initializeGanttComponent):
 * created once, fed with setTasks, its callbacks always the latest props.
 */
export function GanttView({ tasks, title, onPeriodChange, onTaskClick }: GanttViewProps) {
  const id = `dt-gantt-${useId().replace(/:/g, '')}`;
  const chart = useRef<GanttChart | null>(null);
  const callbacks = useRef({ onPeriodChange, onTaskClick });
  useLayoutEffect(() => {
    callbacks.current = { onPeriodChange, onTaskClick };
  });

  useEffect(() => {
    const instance = new GanttChart(id, {
      title: 'Gantt Gorunumu',
      defaultPeriod: 'month',
      filterByWorkingDays: false,
      onPeriodChange: (period, date) =>
        callbacks.current.onPeriodChange(
          (period || 'month') as GanttPeriod,
          date ? new Date(date) : new Date(),
        ),
      onTaskClick: (task) => {
        const taskId = Number(task?.id);
        if (Number.isFinite(taskId) && taskId > 0) callbacks.current.onTaskClick(taskId);
      },
    });
    chart.current = instance;
    return () => {
      instance.destroy();
      chart.current = null;
    };
  }, [id]);

  useEffect(() => {
    chart.current?.updateTitle(title);
    chart.current?.setTasks(tasks);
  }, [tasks, title]);

  return <div id={id} className={classes.gantt} data-testid="department-tasks-gantt" />;
}

// The legacy Gantt chart (components/gantt/gantt.js), mounted as it is by the
// department task pages' Gantt view until a React chart exists.
declare module '@legacy/components/gantt/gantt.js' {
  export interface GanttOptions {
    title?: string;
    defaultPeriod?: 'day' | 'week' | 'month' | 'year';
    filterByWorkingDays?: boolean;
    onPeriodChange?: (period: string, date: Date) => void;
    onTaskClick?: (task: { id?: number | string }, event: Event) => void;
  }
  export class GanttChart {
    constructor(containerId: string, options?: GanttOptions);
    setTasks(tasks: unknown[]): void;
    updateTitle(title: string): void;
    destroy(): void;
  }
}

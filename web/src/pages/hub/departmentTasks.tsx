import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import { useQueries, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { listCountQueryOptions, listPageQueryOptions } from '@/api/counts';
import type { QueryParams } from '@/api/client';
import type { DepartmentTask } from '@/api/projects/departmentTasks';
import { useAuth } from '@/auth/AuthProvider';
import { formatDate } from '@/lib/format';
import type { PageFigure, StatusFamily } from '@/ui';
import { countFigure } from '../hubCount';
import { RecordsPanel, type HubRecord } from './HubPanels';

// A department's own work on its hub: the job orders' main tasks for the
// department, as its "Projeler" page lists them (department + main_only,
// active = pending or in progress).

const PATH = '/projects/department-tasks/';
const KEY = ['departmentTasks', 'list'] as const;
const ACTIVE = 'pending,in_progress';

const STATUS_FAMILY: Record<string, StatusFamily> = {
  pending: 'yellow',
  in_progress: 'blue',
  blocked: 'red',
  on_hold: 'orange',
  completed: 'green',
  cancelled: 'grey',
  skipped: 'grey',
};

function taskCount(department: string, params: QueryParams) {
  return listCountQueryOptions(KEY, PATH, { department, main_only: true, ...params });
}

/**
 * Counts behind a department's band: active tasks, the user's own, blocked
 * ones and those past their target date. `route` is the department's
 * Projeler page; nothing is fetched without it.
 */
export function useDepartmentTaskFigures(department: string, route: string) {
  const { user } = useAuth();
  const enabled = hasRouteAccess(route);
  const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
  const [active, mine, blocked, overdue] = useQueries({
    queries: [
      taskCount(department, { status__in: ACTIVE }),
      taskCount(department, { status__in: ACTIVE, assigned_to: user.id }),
      taskCount(department, { status: 'blocked' }),
      taskCount(department, { status__in: ACTIVE, target_completion_date__lte: yesterday }),
    ].map((options) => ({ ...options, enabled })),
  });
  // The page reads status and assigned_to from the URL; the target date it
  // does not, so the overdue tile opens the active list.
  const figures: PageFigure[] = enabled
    ? [
        countFigure(
          {
            id: `${department}-mine`,
            label: 'Bana Atanan',
            icon: 'fas fa-user-check',
            link: `${route}?assigned_to=${user.id}`,
          },
          mine!,
        ),
        countFigure(
          {
            id: `${department}-overdue`,
            label: 'Hedefi Geçen',
            icon: 'fas fa-calendar-xmark',
            link: route,
          },
          overdue!,
        ),
        countFigure(
          {
            id: `${department}-blocked`,
            label: 'Engellenen',
            icon: 'fas fa-ban',
            link: `${route}?status=blocked`,
          },
          blocked!,
        ),
      ]
    : [];
  return { enabled, active: active!, mine: mine!, blocked: blocked!, overdue: overdue!, figures };
}

function taskRecord(task: DepartmentTask, route: string, today: string): HubRecord {
  const target = task.target_completion_date ?? undefined;
  return {
    key: task.id,
    link: `${route}?task=${task.id}`,
    code: task.job_order ?? undefined,
    title: task.job_order_title || task.title || '-',
    subtitle: [task.customer_name, task.assigned_to_name].filter(Boolean).join(' · ') || undefined,
    status: {
      label: task.status_display || task.status || '-',
      color: taskStatusFamily(task.status),
    },
    meta: target
      ? formatDate(target, { day: 'numeric', month: 'short', year: '2-digit' })
      : undefined,
    alert: Boolean(target && target < today),
  };
}

/** The department's active tasks with a target date, the earliest first. */
export function taskDeadlinesQueryOptions(department: string, pageSize: number) {
  return listPageQueryOptions<DepartmentTask>(KEY, PATH, {
    department,
    main_only: true,
    status__in: ACTIVE,
    target_completion_date__isnull: false,
    ordering: 'target_completion_date',
    page_size: pageSize,
  });
}

/** A task's status as a pill colour. */
export function taskStatusFamily(status: string | null | undefined): StatusFamily {
  return STATUS_FAMILY[status ?? ''] ?? 'grey';
}

/**
 * The department's active tasks by target date, the overdue ones first (in
 * red): what to finish next.
 */
export function TaskDeadlinesPanel({ department, route }: { department: string; route: string }) {
  const today = dayjs().format('YYYY-MM-DD');
  const tasks = useQuery({
    ...taskDeadlinesQueryOptions(department, 6),
    select: (page) => page.results.map((task) => taskRecord(task, route, today)),
    enabled: hasRouteAccess(route),
  });
  return (
    <RecordsPanel
      title="Teslim Sırası"
      icon="fas fa-flag-checkered"
      more={route}
      noun="Görevler"
      empty="Hedef tarihi olan açık görev yok."
      query={tasks}
    />
  );
}

import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import { useQuery } from '@tanstack/react-query';
import { listCountQueryOptions, listPageQueryOptions } from '@/api/counts';
import type { HubRecord } from '@/pages/hub/HubPanels';
import type { StatusFamily } from '@/ui';
import { day, localIsoDate, rowDate, str } from './homeFormat';

// The user's own work: department tasks assigned to them, their İSG actions,
// and the leave and overtime requests they raised.

type Row = Record<string, unknown> & { id: number };

const ROWS = 6;

/** The department task pages, by the task's department. */
export const TASK_PAGES: Record<string, string> = {
  design: '/design/projects',
  planning: '/planning/projects',
  procurement: '/procurement/projects',
  manufacturing: '/manufacturing/projects',
  logistics: '/logistics/projects',
};

/** Open as the assistant counts it: everything not finished, cancelled or skipped. */
const OPEN_TASKS = 'pending,blocked,in_progress,on_hold';

const TASK_STATUS: Record<string, StatusFamily> = {
  pending: 'yellow',
  in_progress: 'blue',
  blocked: 'red',
  on_hold: 'orange',
};

const yesterday = (now = new Date()) => localIsoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));

/** The page that opens this task, when the user may open it. */
export function taskLink(row: Row): string | undefined {
  const page = TASK_PAGES[str(row.department)];
  return page && hasRouteAccess(page) ? `${page}?task=${row.id}` : undefined;
}

export function taskRecord(row: Row, today: string): HubRecord {
  const due = rowDate(row.target_completion_date);
  const overdue = due !== null && due < today;
  return {
    key: `task-${row.id}`,
    code: str(row.job_order) || 'Görev',
    title: str(row.title) || '-',
    subtitle: [str(row.department_display), str(row.job_order_title)].filter(Boolean).join(' · ') || undefined,
    status: { label: str(row.status_display) || str(row.status) || '-', color: TASK_STATUS[str(row.status)] ?? 'grey' },
    meta: due ? (overdue ? `Gecikti · ${day(due)}` : `Bitiş ${day(due)}`) : 'Tarih yok',
    alert: overdue,
    link: taskLink(row),
  };
}

export function useMyTasks(userId: number) {
  const params = { assigned_to: userId, status__in: OPEN_TASKS };
  const page = useQuery(
    listPageQueryOptions<Row>(['home', 'tasks'], '/projects/department-tasks/', {
      ...params,
      ordering: 'target_completion_date',
      page_size: ROWS,
    }),
  );
  const overdue = useQuery(
    listCountQueryOptions(['home', 'tasks', 'overdue'], '/projects/department-tasks/', {
      ...params,
      target_completion_date__lte: yesterday(),
    }),
  );
  const today = localIsoDate();
  return {
    count: page.data?.count,
    overdue,
    records: {
      data: page.data?.results.map((row) => taskRecord(row, today)),
      isPending: page.isPending,
      isError: page.isError,
      refetch: () => void page.refetch(),
    },
  };
}

const ISG_OPEN = 'open,in_progress,resolved';

export function isgRecord(row: Row): HubRecord {
  const due = day(row.due_date);
  return {
    key: `isg-${row.id}`,
    code: str(row.issue_number) || `#${row.id}`,
    title: str(row.title) || '-',
    subtitle: [str(row.category_display), str(row.location)].filter(Boolean).join(' · ') || undefined,
    status: row.severity === 'critical' || row.severity === 'high'
      ? { label: str(row.severity_display) || 'Yüksek', color: row.severity === 'critical' ? 'red' : 'orange' }
      : undefined,
    meta: due ? (row.is_overdue ? `Gecikti · ${due}` : `Termin ${due}`) : undefined,
    alert: row.is_overdue === true,
    link: str(row.issue_number) ? `/isg/issues?issue=${encodeURIComponent(str(row.issue_number))}` : '/isg/issues?mine=true',
  };
}

/** İSG actions assigned to the user; the İSG pages are open to everyone. */
export function useMyIsg() {
  const page = useQuery(
    listPageQueryOptions<Row>(['home', 'isg'], '/isg/issues/', {
      mine: 'true',
      status__in: ISG_OPEN,
      ordering: 'due_date',
      page_size: 5,
    }),
  );
  const overdue = useQuery(
    listCountQueryOptions(['home', 'isg', 'overdue'], '/isg/issues/', { mine: 'true', overdue: 'true' }),
  );
  return {
    count: page.data?.count,
    overdue,
    records: {
      data: page.data?.results.map(isgRecord),
      isPending: page.isPending,
      isError: page.isError,
      refetch: () => void page.refetch(),
    },
  };
}

const REQUEST_STATUS: Record<string, StatusFamily> = {
  submitted: 'yellow',
  approved: 'green',
  rejected: 'red',
  cancelled: 'grey',
  cancellation_requested: 'orange',
};

const requestStatus = (row: Row) => ({
  label: str(row.status_label) || str(row.status) || '-',
  color: REQUEST_STATUS[str(row.status)] ?? 'grey',
});

export const VACATION_PAGE = '/general/vacation/requests';
export const OVERTIME_PAGE = '/general/overtime/registry';

/**
 * The user's latest leave and overtime requests, newest first, with where
 * each stands. Each source only for users who can open its page.
 */
export function useMyRequests(userId: number) {
  const canVacation = hasRouteAccess(VACATION_PAGE);
  const canOvertime = hasRouteAccess(OVERTIME_PAGE);
  const vacation = useQuery({
    ...listPageQueryOptions<Row>(['home', 'myVacation'], '/vacation-requests/requests/', {
      mine: 'true',
      ordering: '-created_at',
      page_size: 4,
    }),
    enabled: canVacation,
  });
  const overtime = useQuery({
    ...listPageQueryOptions<Row>(['home', 'myOvertime'], '/overtime/requests/', {
      requester: userId,
      ordering: '-created_at',
      page_size: 4,
    }),
    enabled: canOvertime,
  });
  const sources = [canVacation ? vacation : null, canOvertime ? overtime : null].filter((q) => q !== null);

  const records: (HubRecord & { at: string })[] = [
    ...(vacation.data?.results ?? []).map((row) => ({
      key: `vac-${row.id}`,
      code: 'İzin',
      title: str(row.leave_type_label) || 'İzin talebi',
      subtitle: [day(row.start_date), day(row.end_date)].filter(Boolean).join(' – ') || undefined,
      status: requestStatus(row),
      link: `${VACATION_PAGE}?request_id=${row.id}`,
      at: str(row.created_at),
    })),
    ...(overtime.data?.results ?? []).map((row) => ({
      key: `ot-${row.id}`,
      code: 'Mesai',
      title: day(row.start_at) ? `${day(row.start_at)} mesaisi` : 'Mesai talebi',
      subtitle: str(row.team_label) || undefined,
      status: requestStatus(row),
      link: `${OVERTIME_PAGE}?request=${row.id}`,
      at: str(row.created_at),
    })),
  ];

  return {
    visible: sources.length > 0,
    /** Still waiting on approval. */
    waiting: records.filter((r) => r.status?.color === 'yellow' || r.status?.color === 'orange').length,
    records: {
      data: sources.every((q) => q.data !== undefined || q.isError)
        ? records.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5)
        : undefined,
      isPending: sources.some((q) => q.isPending),
      isError: sources.length > 0 && sources.every((q) => q.isError),
      refetch: () => sources.forEach((q) => void q.refetch()),
    },
  };
}

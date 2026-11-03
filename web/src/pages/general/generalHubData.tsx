import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  cranePendingCountQueryOptions,
  departmentRequestPendingCountQueryOptions,
  leavesBetweenQueryOptions,
  type LeaveOnCalendar,
  type MyLeaveSummary,
} from '@/api/general/hubs';
import { myVacationSummaryQueryOptions } from '@/api/general/vacation';
import { formatDate, formatNumber, toNumber } from '@/lib/format';
import { RecordsPanel, type AttentionItem, type HubRecord } from '../hub/HubPanels';
import { usePendingApprovalCount, useIsgSummary } from '../hubFigures';

// What the Genel hubs share: the approvals waiting on the user, the leave
// balance and who is away this week.

export const PENDING = {
  overtime: '/general/overtime/pending',
  vacation: '/general/vacation/pending',
  departmentRequests: '/general/department-requests/pending',
  craneRequests: '/general/crane-requests/pending',
} as const;

export const MY_LEAVE = '/general/vacation/requests';

/** Crane / department requests waiting on the user; nothing is fetched without the list. */
export function useCranePendingCount() {
  return useQuery({
    ...cranePendingCountQueryOptions(),
    enabled: hasRouteAccess(PENDING.craneRequests),
  });
}

export function useDepartmentRequestPendingCount() {
  return useQuery({
    ...departmentRequestPendingCountQueryOptions(),
    enabled: hasRouteAccess(PENDING.departmentRequests),
  });
}

/** Every approval queue the user can open, plus their open İSG actions. */
export function useWaitingOnMe(): AttentionItem[] {
  const overtime = usePendingApprovalCount('overtime', PENDING.overtime);
  const vacation = usePendingApprovalCount('vacation', PENDING.vacation);
  const department = useDepartmentRequestPendingCount();
  const crane = useCranePendingCount();
  const isg = useIsgSummary();
  const items: AttentionItem[] = [
    {
      id: 'wait-overtime',
      label: 'Mesai talepleri',
      hint: 'Onayınızı bekliyor',
      icon: 'fas fa-clock',
      color: 'yellow',
      link: PENDING.overtime,
      count: overtime,
    },
    {
      id: 'wait-vacation',
      label: 'İzin talepleri',
      hint: 'Onayınızı bekliyor',
      icon: 'fas fa-calendar-check',
      color: 'yellow',
      link: PENDING.vacation,
      count: vacation,
    },
    {
      id: 'wait-department',
      label: 'Departman talepleri',
      hint: 'Onayınızı bekliyor',
      icon: 'fas fa-boxes',
      color: 'yellow',
      link: PENDING.departmentRequests,
      count: department,
    },
    {
      id: 'wait-crane',
      label: 'Vinç talepleri',
      hint: 'Onayınızı bekliyor',
      icon: 'fas fa-truck-pickup',
      color: 'yellow',
      link: PENDING.craneRequests,
      count: crane,
    },
    {
      id: 'wait-isg',
      label: 'İSG aksiyonları',
      hint: 'Size atanmış, açık',
      icon: 'fas fa-helmet-safety',
      color: 'orange',
      link: '/isg/issues?mine=true',
      count: { data: isg.data && (isg.data.mine_open ?? 0), isError: isg.isError },
    },
  ];
  // The İSG row opens a filtered list; the others open the queue itself.
  return items.filter((item) => hasRouteAccess(item.link.replace(/\?.*$/, '')));
}

/** The user's own leave balance (open to everyone with the requests page). */
export function useMyLeave() {
  return useQuery({
    ...myVacationSummaryQueryOptions(),
    select: (summary) => summary as MyLeaveSummary,
    enabled: hasRouteAccess(MY_LEAVE),
  });
}

/** "12,5" for a day count; undefined while loading, '-' on failure. */
export function leaveDays(query: { data?: MyLeaveSummary; isError: boolean }) {
  if (query.isError) return '-';
  if (!query.data) return undefined;
  const days = toNumber(query.data.annual_leave?.remaining_days);
  return days === null ? '-' : formatNumber(days, Number.isInteger(days) ? 0 : 1);
}

function leaveRecord(leave: LeaveOnCalendar): HubRecord {
  const start = leave.start_date;
  const end = leave.end_date;
  const range =
    start && end && start !== end
      ? `${formatDate(start, { day: 'numeric', month: 'short' })} – ${formatDate(end, { day: 'numeric', month: 'short' })}`
      : formatDate(start, { day: 'numeric', month: 'short' });
  return {
    key: leave.id,
    title: leave.full_name || '-',
    subtitle: [leave.team_label, leave.leave_type_label].filter(Boolean).join(' · ') || undefined,
    meta: range,
  };
}

/** Who is on approved leave from today to the end of the week (Sunday). */
export function AwayThisWeek() {
  const today = dayjs();
  const from = today.format('YYYY-MM-DD');
  // dayjs weeks start on Sunday; the working week ends on the coming Sunday.
  const to = today.day() === 0 ? from : today.add(7 - today.day(), 'day').format('YYYY-MM-DD');
  const leaves = useQuery({
    ...leavesBetweenQueryOptions(from, to),
    select: (rows) =>
      [...rows]
        .sort((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? ''))
        .map(leaveRecord),
  });
  return (
    <RecordsPanel
      title="Bu Hafta İzinde"
      icon="fas fa-umbrella-beach"
      noun="İzinler"
      empty="Bu hafta onaylı izni olan kimse yok."
      query={leaves}
    />
  );
}

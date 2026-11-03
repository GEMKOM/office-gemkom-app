import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import { useQueries, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { pendingOverridesCountQueryOptions } from '@/api/human_resources/attendance';
import {
  pendingOverridesQueryOptions,
  type PendingOverrideRecord,
} from '@/api/human_resources/attendanceAdmin';
import { attendanceCountQueryOptions } from '@/api/human_resources/hubs';
import { formatDate, formatTime } from '@/lib/format';
import { BreakdownPanel, RecordsPanel, type HubRecord } from '../hub/HubPanels';

// What the HR and PDKS hubs share: the off-site check-ins waiting for HR and
// today's attendance.

export const ATTENDANCE = '/human_resources/attendance';
export const PENDING_OVERRIDES = '/human_resources/attendance/pending-overrides';
export const RECORDS = '/human_resources/attendance/records';

export function usePendingOverridesCount() {
  return useQuery({
    ...pendingOverridesCountQueryOptions(),
    enabled: hasRouteAccess(PENDING_OVERRIDES),
  });
}

function overrideRecord(record: PendingOverrideRecord): HubRecord {
  const session = record.sessions?.find((s) => s.override_reason) ?? record.sessions?.[0];
  const checkout = record.status === 'pending_checkout_override';
  const time = checkout ? session?.check_out_time : session?.check_in_time;
  return {
    key: record.id,
    link: PENDING_OVERRIDES,
    title: record.user_display || '-',
    subtitle: session?.override_reason || undefined,
    status: { label: checkout ? 'Çıkış' : 'Giriş', color: checkout ? 'purple' : 'yellow' },
    meta: [
      typeof record.date === 'string'
        ? formatDate(record.date, { day: 'numeric', month: 'short' })
        : null,
      time ? formatTime(time) : null,
    ]
      .filter(Boolean)
      .join(' '),
  };
}

/** The oldest off-site check-ins waiting for HR; the same request as the approvals page. */
export function PendingOverridesPanel() {
  const records = useQuery({
    ...pendingOverridesQueryOptions(),
    select: (rows) => rows.slice(0, 6).map(overrideRecord),
    enabled: hasRouteAccess(PENDING_OVERRIDES),
  });
  return (
    <RecordsPanel
      title="Ofis Dışı Giriş Onayları"
      icon="fas fa-user-clock"
      more={PENDING_OVERRIDES}
      noun="Onay talepleri"
      empty="Onay bekleyen ofis dışı giriş yok."
      query={records}
    />
  );
}

// Today's records by state; the records page opens on today by default.
const TODAY = [
  { key: 'active', label: 'İçeride', color: 'green' },
  { key: 'complete', label: 'Çıkış Yaptı', color: 'blue' },
  { key: 'leave', label: 'İzinli', color: 'purple' },
  { key: 'pending_override', label: 'Giriş Onayı Bekliyor', color: 'yellow' },
] as const;

export function useAttendanceToday() {
  const today = dayjs().format('YYYY-MM-DD');
  const canRecords = hasRouteAccess(RECORDS);
  const counts = useQueries({
    queries: TODAY.map((state) => ({
      ...attendanceCountQueryOptions(today, state.key),
      enabled: canRecords,
    })),
  });
  return { canRecords, counts, inside: counts[0]!, onLeave: counts[2]! };
}

export function AttendanceTodayPanel({
  counts,
}: {
  counts: ReturnType<typeof useAttendanceToday>['counts'];
}) {
  return (
    <BreakdownPanel
      title="Bugünkü Yoklama"
      icon="fas fa-id-card"
      more={RECORDS}
      failed={counts.some((q) => q.isError)}
      rows={TODAY.map((state, i) => ({
        key: state.key,
        label: state.label,
        color: state.color,
        count: counts[i]!.data,
        link: `${RECORDS}?status=${state.key}`,
      }))}
    />
  );
}

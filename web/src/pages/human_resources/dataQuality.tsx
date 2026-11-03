import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import { hasPerm, isSuperuser } from '@legacy/authService.js';
import { useQuery } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo } from 'react';
import { attendanceSummaryQueryOptions } from '@/api/human_resources/attendanceAdmin';
import {
  activeUsersAllQueryOptions,
  attendanceRangeCountQueryOptions,
  wageOverviewQueryOptions,
  type WageOverviewRow,
} from '@/api/human_resources/hubs';
import { vacationApprovalsInboxQueryOptions } from '@/api/human_resources/leave';
import type { HrUser } from '@/api/human_resources/users';
import type { StatusFamily } from '@/ui';
import { AttentionPanel, type AttentionItem } from '../hub/HubPanels';
import { RECORDS } from './hrHubData';

// The HR hub's "Veri Eksikleri": records HR still has to fill in or fix, each
// counted and linked to the list that holds them. Profile and wage checks run
// over the active employees here (no endpoint counts them); the users page
// opens on the same check with ?issue=<key>.

export const USERS = '/human_resources/users';
export const VACATION = '/human_resources/vacation';
export const SUMMARY = '/human_resources/attendance/summary';

/** A wage in force for longer than this is flagged for review. */
export const STALE_WAGE_MONTHS = 12;
/** How far back the PDKS checks look; today is left out, it is still going. */
const OPEN_RECORD_DAYS = 30;
const ABSENT_DAYS = 14;

/**
 * Wages and TC kimlik no are sent to manage_hr holders only (the wage
 * endpoints answer 403, the users list leaves tc_kimlik_no null), so those
 * checks are shown to them alone.
 */
export function canSeeWages(): boolean {
  return isSuperuser() || hasPerm('manage_hr');
}

export type UserIssueKey =
  'missing_wage' | 'stale_wage' | 'no_position' | 'no_hire_date' | 'no_personel_kodu' | 'no_tc';

export interface UserIssue {
  key: UserIssueKey;
  label: string;
  hint: string;
  icon: string;
  color: StatusFamily;
  /** The edit modal tab that fixes it. */
  tab: 'info' | 'wages';
  /** Needs manage_hr (see canSeeWages). */
  hrOnly: boolean;
  /** Reads the wage overview. */
  wages: boolean;
  test: (user: HrUser, wage: WageOverviewRow | undefined, today: Dayjs) => boolean;
}

const blank = (value: unknown) =>
  value === null || value === undefined || String(value).trim() === '';

export const USER_ISSUES: UserIssue[] = [
  {
    key: 'missing_wage',
    label: 'Ücreti girilmemiş',
    hint: 'Bugün geçerli ücret kaydı yok',
    icon: 'fas fa-money-bill-wave',
    color: 'red',
    tab: 'wages',
    hrOnly: true,
    wages: true,
    test: (_user, wage) => !wage?.has_wage,
  },
  {
    key: 'stale_wage',
    label: 'Ücreti güncellenmemiş',
    hint: `Geçerli ücret ${STALE_WAGE_MONTHS} aydan eski`,
    icon: 'fas fa-hourglass-half',
    color: 'yellow',
    tab: 'wages',
    hrOnly: true,
    wages: true,
    test: (_user, wage, today) => {
      const from = wage?.has_wage ? wage.current_wage?.effective_from : null;
      return (
        Boolean(from) && dayjs(from).isBefore(today.subtract(STALE_WAGE_MONTHS, 'month'), 'day')
      );
    },
  },
  {
    key: 'no_position',
    label: 'Pozisyonu / departmanı yok',
    hint: 'Departman pozisyondan gelir',
    icon: 'fas fa-sitemap',
    color: 'orange',
    tab: 'info',
    hrOnly: false,
    wages: false,
    test: (user) => blank(user.position_id),
  },
  {
    key: 'no_hire_date',
    label: 'İşe giriş tarihi eksik',
    hint: 'Yıllık izin hakedişi bu tarihten hesaplanır',
    icon: 'fas fa-calendar-plus',
    color: 'orange',
    tab: 'info',
    hrOnly: false,
    wages: false,
    test: (user) => blank(user.hire_date),
  },
  {
    key: 'no_personel_kodu',
    label: 'Personel kodu eksik',
    hint: 'Bordro eşleştirmesi için gerekli',
    icon: 'fas fa-id-badge',
    color: 'yellow',
    tab: 'info',
    hrOnly: false,
    wages: false,
    test: (user) => blank(user.personel_kodu),
  },
  {
    key: 'no_tc',
    label: 'TC kimlik no eksik',
    hint: 'SGK ve bordro için gerekli',
    icon: 'fas fa-address-card',
    color: 'yellow',
    tab: 'info',
    hrOnly: true,
    wages: false,
    test: (user) => blank(user.tc_kimlik_no),
  },
];

export function userIssue(key: string): UserIssue | undefined {
  return USER_ISSUES.find((issue) => issue.key === key);
}

/** The checks this user may run: the users page, and manage_hr for the sensitive ones. */
export function visibleUserIssues(): UserIssue[] {
  if (!hasRouteAccess(USERS)) return [];
  const hr = canSeeWages();
  return USER_ISSUES.filter((issue) => hr || !issue.hrOnly);
}

export const issueLink = (key: UserIssueKey) => `${USERS}?issue=${key}`;

/** The employees each check flags; `undefined` while loading. */
export function useUserIssues(issues: UserIssue[]) {
  const needsWages = issues.some((issue) => issue.wages);
  const users = useQuery({ ...activeUsersAllQueryOptions(), enabled: issues.length > 0 });
  const wages = useQuery({ ...wageOverviewQueryOptions(), enabled: needsWages });
  // Same rows until a list refetches, so a table fed with them keeps its state.
  const keys = issues.map((issue) => issue.key).join();
  const flaggedByKey = useMemo(() => {
    const today = dayjs();
    const wageById = new Map((wages.data?.results ?? []).map((row) => [row.id, row]));
    const result = new Map<UserIssueKey, HrUser[]>();
    if (!users.data) return result;
    for (const key of keys.split(',')) {
      const issue = userIssue(key);
      if (!issue || (issue.wages && !wages.data)) continue;
      result.set(
        issue.key,
        users.data.results.filter((user) => issue.test(user, wageById.get(user.id), today)),
      );
    }
    return result;
  }, [users.data, wages.data, keys]);

  return issues.map((issue) => {
    const failed = users.isError || (issue.wages && wages.isError);
    const flagged = flaggedByKey.get(issue.key);
    const ready = flagged !== undefined;
    return {
      issue,
      users: flagged,
      isPending: !failed && !ready,
      isError: failed,
      refetch: () => Promise.all([users.refetch(), ...(issue.wages ? [wages.refetch()] : [])]),
    };
  });
}

const iso = (day: Dayjs) => day.format('YYYY-MM-DD');

/** The data checks the HR hub shows; rows the user cannot open are left out. */
export function DataQualityPanel() {
  const today = dayjs();
  const yesterday = iso(today.subtract(1, 'day'));
  const openFrom = iso(today.subtract(OPEN_RECORD_DAYS, 'day'));
  const absentFrom = iso(today.subtract(ABSENT_DAYS, 'day'));
  const canRecords = hasRouteAccess(RECORDS);
  const canSummary = hasRouteAccess(SUMMARY);
  const canVacation = hasRouteAccess(VACATION);

  const userChecks = useUserIssues(visibleUserIssues());
  // A day still "active" after midnight was never checked out.
  const openRecords = useQuery({
    ...attendanceRangeCountQueryOptions(openFrom, yesterday, 'active'),
    enabled: canRecords,
  });
  // Working days with no record (or a rejected one), per person who has
  // records in the range: the summary leaves out whoever has none at all.
  const absent = useQuery({
    ...attendanceSummaryQueryOptions({ date_from: absentFrom, date_to: yesterday }),
    select: (rows) => rows.filter((row) => (row.days_absent ?? 0) > 0).length,
    enabled: canSummary,
  });
  const leaveInbox = useQuery({
    ...vacationApprovalsInboxQueryOptions(),
    select: (page) => page.count,
    enabled: canVacation,
  });

  const items: AttentionItem[] = [
    ...userChecks.map(({ issue, users, isError }) => ({
      id: issue.key,
      label: issue.label,
      hint: issue.hint,
      icon: issue.icon,
      color: issue.color,
      link: issueLink(issue.key),
      count: { data: users?.length, isError },
    })),
    ...(canRecords
      ? [
          {
            id: 'open_records',
            label: 'Çıkışı yapılmamış günler',
            hint: `Son ${OPEN_RECORD_DAYS} gün, hâlâ "içeride" görünen kayıtlar`,
            icon: 'fas fa-door-open',
            color: 'red' as const,
            link: `${RECORDS}?date=&date_from=${openFrom}&date_to=${yesterday}&status=active`,
            count: openRecords,
          },
        ]
      : []),
    ...(canSummary
      ? [
          {
            id: 'absent_days',
            label: 'Giriş kaydı eksik çalışanlar',
            hint: `Son ${ABSENT_DAYS} günde kaydı ya da izni olmayan iş günü`,
            icon: 'fas fa-user-xmark',
            color: 'orange' as const,
            link: `${SUMMARY}?date_from=${absentFrom}&date_to=${yesterday}&absent=1`,
            count: absent,
          },
        ]
      : []),
    ...(canVacation
      ? [
          {
            id: 'leave_inbox',
            label: 'Onay bekleyen izin talepleri',
            hint: 'Son onay ve iptal talepleri',
            icon: 'fas fa-calendar-check',
            color: 'yellow' as const,
            link: VACATION,
            count: leaveInbox,
          },
        ]
      : []),
  ];

  return (
    <AttentionPanel
      title="Veri Eksikleri"
      icon="fas fa-triangle-exclamation"
      clearLabel="Eksik veri yok"
      items={items}
    />
  );
}

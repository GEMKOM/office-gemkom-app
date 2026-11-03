import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import { useQueries, useQuery } from '@tanstack/react-query';
import { listPageQueryOptions } from '@/api/counts';
import { approvalsInboxQueryOptions, type InboxItem } from '@/api/general/approvalsInbox';
import type { AttentionItem, HubRecord } from '@/pages/hub/HubPanels';
import type { StatusFamily } from '@/ui';
import { day, daysWaiting, rowDate, str, waitingMeta } from './homeFormat';

// "Onayınızı Bekleyenler": every approval queue the user sits on. Queues with
// their own pending_approval list are read from it (exact counts, the first
// rows with real numbers); the rest come from the cross-domain inbox.

type Row = Record<string, unknown> & { id: number };

/** How many rows of each queue to show in the combined list. */
const ROWS = 5;

export interface ApprovalRecord extends HubRecord {
  /** Oldest first in the combined list. */
  since: string | null;
}

interface QueueSource {
  id: string;
  label: string;
  icon: string;
  color: StatusFamily;
  /** The page that lists the queue; the queue is skipped when the user cannot open it. */
  route: string;
  path: string;
  params?: Record<string, string | number>;
  /** Extra condition on top of the route grant. */
  when?: (ctx: ApprovalContext) => boolean;
  /** Counts only the rows the user may decide (drawing releases list them all). */
  mine?: (row: Row) => boolean;
  toRecord: (row: Row) => Omit<ApprovalRecord, 'key'>;
}

export interface ApprovalContext {
  departmentCode: string | null;
}

const priority = (row: Row): HubRecord['status'] => {
  if (row.priority === 'critical') return { label: 'Kritik', color: 'red' };
  if (row.priority === 'urgent') return { label: 'Acil', color: 'orange' };
  return undefined;
};

const person = (row: Row, ...keys: string[]) => keys.map((k) => str(row[k])).find(Boolean) ?? '-';

export const QUEUES: QueueSource[] = [
  {
    id: 'purchase',
    label: 'Satın alma talepleri',
    icon: 'fas fa-shopping-cart',
    color: 'yellow',
    route: '/procurement/purchase-requests/pending',
    path: '/procurement/purchase-requests/pending_approval/',
    toRecord: (row) => ({
      code: str(row.request_number) || `#${row.id}`,
      title: str(row.title) || 'Satın alma talebi',
      subtitle: person(row, 'requestor_username'),
      status: priority(row),
      link: `/procurement/purchase-requests/pending?talep=${encodeURIComponent(str(row.request_number))}`,
      since: rowDate(row.submitted_at) ?? rowDate(row.created_at),
    }),
  },
  {
    id: 'vacation',
    label: 'İzin talepleri',
    icon: 'fas fa-umbrella-beach',
    color: 'yellow',
    route: '/general/vacation/pending',
    path: '/vacation-requests/requests/pending_approval/',
    toRecord: (row) => ({
      code: `İZN-${row.id}`,
      title: `${person(row, 'requester_full_name', 'requester_username')} · ${str(row.leave_type_label) || 'İzin'}`,
      subtitle: [day(row.start_date), day(row.end_date)].filter(Boolean).join(' – ') || undefined,
      // The pending page has no deep link; it lists them all.
      link: '/general/vacation/pending',
      since: rowDate(row.created_at),
    }),
  },
  {
    id: 'overtime',
    label: 'Mesai talepleri',
    icon: 'fas fa-clock',
    color: 'yellow',
    route: '/general/overtime/pending',
    path: '/overtime/requests/pending_approval/',
    toRecord: (row) => ({
      code: `MES-${row.id}`,
      title: `${person(row, 'requester_username')}${str(row.team_label) ? ` · ${str(row.team_label)}` : ''}`,
      subtitle: day(row.start_at) ? `Mesai ${day(row.start_at)}` : undefined,
      link: `/general/overtime/pending?request=${row.id}`,
      since: rowDate(row.created_at),
    }),
  },
  {
    id: 'department',
    label: 'Departman talepleri',
    icon: 'fas fa-boxes',
    color: 'yellow',
    route: '/general/department-requests/pending',
    path: '/planning/department-requests/pending_approval/',
    toRecord: (row) => ({
      code: str(row.request_number) || `#${row.id}`,
      title: str(row.title) || 'Departman talebi',
      subtitle: person(row, 'requestor_full_name', 'requestor_username'),
      status: priority(row),
      link: `/general/department-requests/pending?request=${row.id}`,
      since: rowDate(row.submitted_at) ?? rowDate(row.created_at),
    }),
  },
  {
    id: 'crane',
    label: 'Vinç talepleri',
    icon: 'fas fa-truck-pickup',
    color: 'yellow',
    route: '/general/crane-requests/pending',
    path: '/cranes/requests/pending_approval/',
    toRecord: (row) => ({
      code: str(row.request_number) || `#${row.id}`,
      title: str(row.crane_type_name) || 'Vinç talebi',
      subtitle: [str(row.job_no), person(row, 'requestor_full_name', 'requestor_username')].filter(Boolean).join(' · '),
      status: priority(row),
      link: `/general/crane-requests/pending?request=${row.id}`,
      since: rowDate(row.created_at),
    }),
  },
  {
    // Lists every release awaiting approval; can_approve marks the ones this
    // user may review (design members, not the releaser, not yet reviewed).
    id: 'drawing',
    label: 'Çizim onayları',
    icon: 'fas fa-drafting-compass',
    color: 'blue',
    route: '/design/release-approvals',
    path: '/projects/drawing-releases/pending_approvals/',
    params: { page_size: 100 },
    when: (ctx) => ctx.departmentCode === 'design',
    mine: (row) => row.can_approve === true,
    toRecord: (row) => ({
      code: [str(row.job_order_no) || str(row.job_order), str(row.revision_code)].filter(Boolean).join(' '),
      title: str(row.job_order_title) || 'Çizim yayını',
      subtitle: person(row, 'released_by_name'),
      link: `/design/release-approvals?search=${encodeURIComponent(str(row.job_order_no) || str(row.job_order))}`,
      since: rowDate(row.released_at),
    }),
  },
  {
    id: 'attendance',
    label: 'PDKS düzeltme onayları',
    icon: 'fas fa-user-check',
    color: 'orange',
    route: '/human_resources/attendance/pending-overrides',
    path: '/attendance/hr/pending-overrides/',
    toRecord: (row) => ({
      code: day(row.date) ?? '',
      title: person(row, 'user_display'),
      subtitle: str(row.status_display) || undefined,
      link: '/human_resources/attendance/pending-overrides',
      since: rowDate(row.date),
    }),
  },
];

interface InboxKind {
  id: string;
  label: string;
  icon: string;
  color: StatusFamily;
  route: string;
  toRecord: (item: InboxItem, snap: Record<string, unknown>) => Omit<ApprovalRecord, 'key' | 'since'>;
}

// Approval types without a pending list of their own, by subject_type.
export const INBOX_KINDS: Record<string, InboxKind> = {
  'procurement.paymentlist': {
    id: 'payment-list',
    label: 'Ödeme listeleri',
    icon: 'fas fa-money-check-dollar',
    color: 'yellow',
    route: '/procurement/payment-lists',
    toRecord: (item, snap) => {
      const list = (snap.payment_list ?? {}) as Record<string, unknown>;
      return {
        code: `ÖL-${item.subject_id}`,
        title: str(list.title) || 'Ödeme listesi',
        subtitle: str(item.stage_name) || undefined,
        link: '/procurement/payment-lists?status=submitted',
      };
    },
  },
  'sales.salesoffer': {
    id: 'sales-offer',
    label: 'Satış teklifleri',
    icon: 'fas fa-file-invoice-dollar',
    color: 'yellow',
    route: '/sales/offers',
    toRecord: (item, snap) => ({
      code: str(snap.offer_no) || `#${item.subject_id}`,
      title: 'Satış teklifi',
      subtitle: str(item.stage_name) || undefined,
      link: str(snap.offer_no) ? `/sales/offers/?offer_no=${encodeURIComponent(str(snap.offer_no))}` : '/sales/offers/',
    }),
  },
  'quality_control.ncr': {
    id: 'ncr',
    label: 'Uygunsuzluk raporları',
    icon: 'fas fa-exclamation-triangle',
    color: 'orange',
    route: '/quality-control/ncrs',
    toRecord: (item, snap) => ({
      code: str(snap.ncr_number) || `#${item.subject_id}`,
      title: str(snap.title) || 'Uygunsuzluk raporu',
      subtitle: str(item.stage_name) || undefined,
      link: str(snap.ncr_number)
        ? `/quality-control/ncrs?ncr=${encodeURIComponent(str(snap.ncr_number))}`
        : '/quality-control/ncrs',
    }),
  },
  'quality_control.qcreview': {
    id: 'qc-review',
    label: 'KK incelemeleri',
    icon: 'fas fa-clipboard-check',
    color: 'blue',
    route: '/quality-control/qc-reviews',
    toRecord: (item, snap) => ({
      code: `KK-${item.subject_id}`,
      title: str(snap.task_title) || 'KK incelemesi',
      subtitle: str(snap.job_order) || undefined,
      link: `/quality-control/qc-reviews?review=${item.subject_id}`,
    }),
  },
  'subcontracting.subcontractorstatement': {
    id: 'statement',
    label: 'Taşeron hakedişleri',
    icon: 'fas fa-file-invoice',
    color: 'yellow',
    route: '/manufacturing/subcontracting/statements',
    toRecord: (item) => ({
      code: `HAK-${item.subject_id}`,
      title: 'Taşeron hakedişi',
      subtitle: str(item.stage_name) || undefined,
      link: '/manufacturing/subcontracting/statements',
    }),
  },
};

const oldestFirst = (a: ApprovalRecord, b: ApprovalRecord) =>
  (a.since ?? '9999').localeCompare(b.since ?? '9999');

export interface Approvals {
  /** Nothing to show: the user sits on no queue they can open. */
  none: boolean;
  items: AttentionItem[];
  /** Total waiting; undefined until every count is in. */
  total: number | undefined;
  /** The only queue with something waiting, for the band figure's link. */
  onlyRoute: string | null;
  records: { data: ApprovalRecord[] | undefined; isPending: boolean; isError: boolean; refetch: () => void };
}

/** Every queue at once, in parallel; nothing is fetched for a list the user cannot open. */
export function useApprovals(ctx: ApprovalContext): Approvals {
  const queues = QUEUES.filter((q) => hasRouteAccess(q.route) && (q.when?.(ctx) ?? true));
  const pages = useQueries({
    queries: queues.map((q) => ({
      ...listPageQueryOptions<Row>(['home', 'approvals', q.id], q.path, { page_size: ROWS, ...q.params }),
    })),
  });
  const inbox = useQuery(approvalsInboxQueryOptions());

  const items: AttentionItem[] = queues.map((q, i) => {
    const page = pages[i]!;
    const count = page.data === undefined ? undefined : q.mine ? page.data.results.filter(q.mine).length : page.data.count;
    return {
      id: q.id,
      label: q.label,
      icon: q.icon,
      color: q.color,
      link: q.route,
      count: { data: count, isError: page.isError },
    };
  });
  const records: ApprovalRecord[] = queues.flatMap((q, i) => {
    const rows = pages[i]!.data?.results ?? [];
    return (q.mine ? rows.filter(q.mine) : rows).map((row) => ({ key: `${q.id}-${row.id}`, ...q.toRecord(row) }));
  });

  // Inbox kinds show only when something is waiting: most users never see them.
  const byKind = new Map<string, InboxItem[]>();
  for (const item of inbox.data ?? []) {
    if (!INBOX_KINDS[item.subject_type] || !hasRouteAccess(INBOX_KINDS[item.subject_type]!.route)) continue;
    byKind.set(item.subject_type, [...(byKind.get(item.subject_type) ?? []), item]);
  }
  for (const [type, list] of byKind) {
    const kind = INBOX_KINDS[type]!;
    items.push({
      id: kind.id,
      label: kind.label,
      icon: kind.icon,
      color: kind.color,
      link: kind.route,
      count: { data: list.length, isError: false },
    });
    for (const item of list.slice(0, ROWS)) {
      records.push({
        key: `${kind.id}-${item.subject_id}`,
        ...kind.toRecord(item, item.snapshot ?? {}),
        since: rowDate(item.created_at),
      });
    }
  }

  const settled = items.every((item) => item.count.data !== undefined || item.count.isError) && !inbox.isPending;
  const waiting = items.filter((item) => item.count.data);
  return {
    none: queues.length === 0 && byKind.size === 0,
    items,
    total: settled ? items.reduce((sum, item) => sum + (item.count.data ?? 0), 0) : undefined,
    onlyRoute: settled && waiting.length === 1 ? waiting[0]!.link : null,
    records: {
      data: pages.every((p) => p.data !== undefined || p.isError)
        ? records
            .sort(oldestFirst)
            .slice(0, 6)
            .map((record) => {
              const days = daysWaiting(record.since);
              return { ...record, meta: waitingMeta(days), alert: days !== null && days > 3 };
            })
        : undefined,
      isPending: pages.some((p) => p.isPending),
      isError: pages.length > 0 && pages.every((p) => p.isError),
      refetch: () => pages.forEach((p) => void p.refetch()),
    },
  };
}

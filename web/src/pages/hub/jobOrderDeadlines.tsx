import { hasRouteAccess } from '@/auth/accessControl';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { listPageQueryOptions } from '@/api/counts';
import type { JobOrder } from '@/api/projects/jobOrders';
import { formatDate, formatNumber, toNumber } from '@/lib/format';
import { RecordsPanel, type HubRecord } from './HubPanels';

// A delivery queue read off the job orders' own termin. A department task's
// target date is only set once somebody schedules the task, so a list built
// on it (TaskDeadlinesPanel) stays nearly empty; every job order has a termin.

const TRACKING = '/projects/project-tracking';
const OPEN = 'active,on_hold';
const LIMIT = 8;

function jobRecord(job: JobOrder, today: string, canOpen: boolean): HubRecord {
  const target = job.target_completion_date ?? undefined;
  const done = toNumber(job.completion_percentage);
  return {
    key: job.job_no,
    link: canOpen ? `${TRACKING}?job_no=${encodeURIComponent(job.job_no)}` : undefined,
    code: job.job_no,
    title: job.title,
    subtitle: job.customer_short_name || job.customer_name || undefined,
    status:
      job.status === 'on_hold'
        ? { label: 'Beklemede', color: 'orange' }
        : { label: done !== null ? `%${formatNumber(done, 0)}` : 'Aktif', color: 'blue' },
    meta: target
      ? formatDate(target, { day: 'numeric', month: 'short', year: '2-digit' })
      : undefined,
    alert: Boolean(target && target < today),
  };
}

/**
 * The open job orders by termin, the overdue ones first (their date in red):
 * what has to ship next. `route` is the page "Tümü" falls back to for a user
 * who cannot open Proje Takibi.
 */
export function JobOrderDeadlinesPanel({ route }: { route: string }) {
  const today = dayjs().format('YYYY-MM-DD');
  const canOpen = hasRouteAccess(TRACKING);
  const jobs = useQuery({
    ...listPageQueryOptions<JobOrder>(['jobOrders', 'list'], '/projects/job-orders/', {
      root_only: true,
      status__in: OPEN,
      ordering: 'target_completion_date',
      page_size: LIMIT,
    }),
    select: (page) => page.results.map((job) => jobRecord(job, today, canOpen)),
  });
  return (
    <RecordsPanel
      title="Teslim Sırası"
      icon="fas fa-flag-checkered"
      more={
        canOpen ? `${TRACKING}?status=active&status=on_hold&ordering=target_completion_date` : route
      }
      noun="İş emirleri"
      empty="Teslim bekleyen açık iş emri yok."
      query={jobs}
      rows={LIMIT}
    />
  );
}

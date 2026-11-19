import { Center, Loader, Stack, Tabs, Text } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useMemo, useState, type ComponentType } from 'react';
import { useSearchParams } from 'react-router';
import { approvalsInboxQueryOptions } from '@/api/general/approvalsInbox';
import { useAuth } from '@/auth/AuthProvider';
import { daysWaiting, rowDate, waitingMeta } from '@/pages/home/homeFormat';
import { INBOX_KINDS, useApprovals, userDepartment } from '@/pages/home/approvals';
import { RecordsPanel, type HubRecord } from '@/pages/hub/HubPanels';
import { isApprovalQuery } from '@/shell/navBadges';
import { CountBadge, FaIcon, PageHeader, Panel } from '@/ui';
import type { EmbeddableProps } from './embedded';

// Onaylar: every approval queue the user can open, a tab each with what waits
// in it. The queues and their counts are the menu's own (useApprovals, shared
// with the avatar's badge), so the page asks for nothing new to draw the tabs.
// A queue with a pending page shows that page, its past decisions included;
// the cross-domain inbox kinds list their waiting records, each opening on
// its own page. The old pending URLs still open their pages on their own.

/** The tab in the URL; `tab` is taken (Çizim İncelemesi keeps its own tabs there). */
const QUEUE_PARAM = 'queue';

// A queue's pending page (pages/home/approvals.ts QUEUES ids), loaded when its tab opens.
const PAGES: Record<string, ComponentType<EmbeddableProps>> = {
  purchase: lazy(() =>
    import('@/pages/procurement/purchase-requests/pending/PendingRequestsPage').then((m) => ({
      default: m.PendingRequestsPage,
    })),
  ),
  vacation: lazy(() =>
    import('@/pages/general/vacation/pending/VacationPendingPage').then((m) => ({
      default: m.VacationPendingPage,
    })),
  ),
  overtime: lazy(() =>
    import('@/pages/general/overtime/pending/OvertimePendingPage').then((m) => ({
      default: m.OvertimePendingPage,
    })),
  ),
  department: lazy(() =>
    import('@/pages/general/department-requests/pending/PendingDepartmentRequestsPage').then(
      (m) => ({ default: m.PendingDepartmentRequestsPage }),
    ),
  ),
  crane: lazy(() =>
    import('@/pages/general/crane-requests/pending/CraneRequestsPendingPage').then((m) => ({
      default: m.CraneRequestsPendingPage,
    })),
  ),
  drawing: lazy(() =>
    import('@/pages/design/release-approvals/ReleaseApprovalsPage').then((m) => ({
      default: m.ReleaseApprovalsPage,
    })),
  ),
  attendance: lazy(() =>
    import('@/pages/human_resources/attendance/pending-overrides/PendingOverridesPage').then(
      (m) => ({ default: m.PendingOverridesPage }),
    ),
  ),
};

/** Inbox kinds by tab id ('payment-list' -> 'procurement.paymentlist'). */
const INBOX_TYPE_BY_ID: Record<string, string> = Object.fromEntries(
  Object.entries(INBOX_KINDS).map(([type, kind]) => [kind.id, type]),
);

const loading = (
  <Center py="xl">
    <Loader size="sm" />
  </Center>
);

/** The waiting records of an inbox kind: its page lists everything, not just what waits. */
function InboxQueue({ type }: { type: string }) {
  const kind = INBOX_KINDS[type]!;
  // The query useApprovals already holds: read from the cache, not asked again.
  const inbox = useQuery(approvalsInboxQueryOptions());
  const records = useMemo<HubRecord[] | undefined>(
    () =>
      inbox.data
        ?.filter((item) => item.subject_type === type)
        .map((item) => ({
          key: `${kind.id}-${item.subject_id}`,
          ...kind.toRecord(item, item.snapshot ?? {}),
          meta: waitingMeta(daysWaiting(rowDate(item.created_at))),
        })),
    [inbox.data, kind, type],
  );
  return (
    <RecordsPanel
      title={kind.label}
      icon={kind.icon}
      more={kind.route}
      moreLabel="Sayfasına git"
      noun={kind.label}
      empty="Onayınızı bekleyen kayıt kalmadı."
      query={{ data: records, isPending: inbox.isPending, isError: inbox.isError, refetch: inbox.refetch }}
    />
  );
}

function QueueContent({ id }: { id: string }) {
  const Page = PAGES[id];
  if (Page) return <Page embedded />;
  const type = INBOX_TYPE_BY_ID[id];
  return type ? <InboxQueue type={type} /> : null;
}

/**
 * A decision on a tab refreshes that page's own lists (each page invalidates
 * them); the tab counts follow, so a queue that empties loses its badge.
 */
function useCountsFollowDecisions() {
  const client = useQueryClient();
  useEffect(() => {
    let queued = false;
    return client.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'invalidate') return;
      if (isApprovalQuery(event.query.queryKey) || queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        void client.invalidateQueries({ predicate: (query) => isApprovalQuery(query.queryKey) });
      });
    });
  }, [client]);
}

export function ApprovalsPage() {
  const { user } = useAuth();
  const approvals = useApprovals({ departmentCode: userDepartment(user) });
  const [searchParams, setSearchParams] = useSearchParams();
  useCountsFollowDecisions();

  const tabs = approvals.items;
  const settled = approvals.total !== undefined;
  const requested = tabs.find((tab) => tab.id === searchParams.get(QUEUE_PARAM));
  // The first queue with something waiting, once every count is in.
  const fallback = settled ? (tabs.find((tab) => tab.count.data) ?? tabs[0]) : undefined;
  // The default is chosen once, so the tab stays put when its queue empties.
  const [pinned, setPinned] = useState<string | null>(null);
  if (!requested && fallback && pinned === null) setPinned(fallback.id);
  const active = requested ?? tabs.find((tab) => tab.id === pinned) ?? fallback;

  // Another tab starts clean: the page state of the last one (filters, pages, a
  // detail modal) means nothing there.
  const openTab = (id: string | null) => {
    if (id && id !== active?.id) setSearchParams({ [QUEUE_PARAM]: id }, { replace: true });
  };

  let body;
  if (approvals.none && settled) {
    body = (
      <Panel>
        <Text c="dimmed" ta="center" py="lg">
          Onay verdiğiniz bir süreç yok.
        </Text>
      </Panel>
    );
  } else if (!active) {
    body = <Panel>{loading}</Panel>;
  } else {
    body = (
      <Tabs value={active.id} onChange={openTab} keepMounted={false}>
        <Stack gap="lg">
          <Panel>
            <Tabs.List aria-label="Onay kuyrukları">
              {tabs.map((tab) => (
                <Tabs.Tab
                  key={tab.id}
                  value={tab.id}
                  leftSection={<FaIcon icon={tab.icon} />}
                  rightSection={<CountBadge count={tab.count.data} label="onay bekliyor" />}
                >
                  {tab.label}
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Panel>
          {tabs.map((tab) => (
            <Tabs.Panel key={tab.id} value={tab.id}>
              <Suspense fallback={<Panel>{loading}</Panel>}>
                <QueueContent id={tab.id} />
              </Suspense>
            </Tabs.Panel>
          ))}
        </Stack>
      </Tabs>
    );
  }

  return (
    <>
      <PageHeader
        title="Onaylar"
        subtitle="Onayınızı bekleyen her şey tek yerde; her sekmenin altında verdiğiniz kararlar"
        icon="fas fa-check-double"
        stats={[
          {
            id: 'approvals-total',
            label: 'Onayınızı Bekleyen',
            value: settled ? approvals.total!.toLocaleString('tr-TR') : '–',
          },
        ]}
      />
      {body}
    </>
  );
}

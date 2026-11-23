import { Button, Stack, Text } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_STALE_TIME } from '@/api/queryClient';
import { materialTrackingErrorMessage } from '@/api/materialTracking/errors';
import {
  jobStockQueryOptions,
  materialPullRequestsQueryOptions,
  pullRequestKeys,
} from '@/api/materialTracking/pullRequests';
import {
  planningItemKeys,
  planningItemsQueryOptions,
  useSetPlanningItemCritical,
  type PlanningItem,
} from '@/api/planning/planningItems';
import { pieceKeys, piecesQueryOptions } from '@/api/warehouse/pieces';
import { useAuth } from '@/auth/AuthProvider';
import { FaIcon, notify, PageHeader, Panel, useUrlFilters, type PageFigure } from '@/ui';
import { SuggestField } from '@/ui/FilterBar/SuggestField';
import { CreatePullRequestModal } from './CreatePullRequestModal';
import { JobPlanningPanel, JobPullsPanel, JobStockPanel } from './jobPanels';
import { canRequest, jobStockRows, type JobStockRow } from './jobStock';
import { PullRequestDetailModal } from './pullRequestShared';
import { PullRequestsList } from './pull-requests/PullRequestsPage';

// Malzeme Takibi (2026-11-23): the workshop picks a job, sees what is in its
// İş Emri stock (stock cards and bar / plate lots, less what pending requests
// hold), asks the warehouse for it on an İmalata Çıkış Talebi, and follows the
// job's earlier requests and the planning lines that have not arrived yet.
// With no job picked the page lists every request (the old İmalata Çıkış
// Talepleri page, which forwards here).

export const MATERIAL_TRACKING_ROUTE = '/manufacturing/material-tracking';
const URL_DEFAULTS = { job: '' };

const EMPTY_ROWS: JobStockRow[] = [];
const LOT_PARAMS = { warehouse: 'IS_EMRI', page_size: 1000, ordering: 'item__code' } as const;

function JobPicker({
  onPick,
  current = '',
}: {
  onPick: (jobNo: string) => void;
  current?: string;
}) {
  const [text, setText] = useState(current);
  return (
    <SuggestField
      source="jobOrders"
      value={text}
      applied={current}
      onType={setText}
      onApply={(value) => {
        const jobNo = value.trim();
        setText(jobNo);
        if (jobNo) onPick(jobNo);
      }}
      label="İş No"
      placeholder="İş no veya iş adı yazın…"
      ariaLabel="İş No"
      leftSection={<FaIcon icon="fas fa-search" />}
      w={360}
    />
  );
}

export function MaterialTrackingPage() {
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const jobNo = values.job.trim();
  const pick = (next: string) => apply({ job: next });

  if (jobNo) return <JobMaterial key={jobNo} jobNo={jobNo} onPick={pick} />;
  return (
    <>
      <PageHeader
        title="Malzeme Takibi"
        subtitle="Bir iş seçin: o işin İş Emri stoğu, imalata çıkış talepleri ve gelmeyen planlama kalemleri"
        icon="fas fa-box"
      />
      <Stack gap="md">
        <Panel title="İş Seçin" icon="fas fa-clipboard-list">
          <JobPicker onPick={pick} />
          <Text size="xs" c="dimmed" mt={6}>
            Seçtiğiniz işin İş Emri deposundaki malzemeyi kaynak ekibine veya taşerona imalata çıkış
            talebiyle istersiniz.
          </Text>
        </Panel>
        <PullRequestsList />
      </Stack>
    </>
  );
}

function JobMaterial({ jobNo, onPick }: { jobNo: string; onPick: (jobNo: string) => void }) {
  const queryClient = useQueryClient();
  const { user, isAdmin } = useAuth();

  const cards = useQuery({ ...jobStockQueryOptions(jobNo), staleTime: DEFAULT_STALE_TIME });
  const lots = useQuery({
    ...piecesQueryOptions({ ...LOT_PARAMS, job_no: jobNo }),
    staleTime: DEFAULT_STALE_TIME,
  });
  const pulls = useQuery({
    ...materialPullRequestsQueryOptions({ job: jobNo, ordering: '-requested_at', page_size: 200 }),
    staleTime: DEFAULT_STALE_TIME,
  });
  const planning = useQuery({
    ...planningItemsQueryOptions({
      job_no: jobNo,
      is_delivered: 'false',
      include_procurement: true,
      include_price: false,
      ordering: 'id',
      page_size: 500,
    }),
    staleTime: DEFAULT_STALE_TIME,
  });

  useEffect(() => {
    const failed = [cards, lots, pulls, planning].find((q) => q.isError);
    if (failed) notify.error(failed.error, { fallback: `${jobNo} malzemeleri yüklenemedi` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards.isError, lots.isError, pulls.isError, planning.isError, jobNo]);

  const stockRows = useMemo(
    () =>
      cards.data || lots.data
        ? jobStockRows(cards.data ?? [], lots.data?.results ?? [])
        : EMPTY_ROWS,
    [cards.data, lots.data],
  );
  // job_no on planning lines matches any job containing the text.
  const waiting = useMemo(
    () => (planning.data?.results ?? []).filter((row) => row.job_no === jobNo),
    [planning.data, jobNo],
  );
  const pullRows = pulls.data?.results ?? [];

  // ---- selection and the request form ----
  const [selected, setSelected] = useState<string[]>([]);
  const pickedRows = useMemo(
    () => stockRows.filter((row) => selected.includes(row.key) && canRequest(row)),
    [stockRows, selected],
  );
  const [creating, setCreating] = useState(false);
  const openCreate = () => {
    if (pickedRows.length === 0) {
      notify.warning('Lütfen İş Emri stoğundan en az bir kalem seçin');
      return;
    }
    setCreating(true);
  };
  const closeCreate = useCallback(() => setCreating(false), []);

  const [detailId, setDetailId] = useState<number | null>(null);
  const closeDetail = useCallback(() => setDetailId(null), []);

  // ---- critical toggle on the waiting planning lines ----
  const { mutateAsync: saveCritical } = useSetPlanningItemCritical();
  const [pendingCritical, setPendingCritical] = useState<ReadonlySet<number>>(() => new Set());
  const toggleCritical = useCallback(
    async (row: PlanningItem, critical: boolean) => {
      setPendingCritical((prev) => new Set(prev).add(row.id));
      try {
        await saveCritical({ id: row.id, critical });
        notify.success(
          critical
            ? 'Kalem kritik olarak işaretlendi — imalat öngörüsü bu teslimatı bekleyecek'
            : 'Kritik işareti kaldırıldı',
        );
      } catch (error) {
        notify.error(
          materialTrackingErrorMessage(
            error,
            critical
              ? 'Kalem kritik olarak işaretlenirken hata oluştu'
              : 'Kritik işareti kaldırılırken hata oluştu',
            'Kritik işareti güncellenemedi',
          ),
        );
      } finally {
        setPendingCritical((prev) => {
          const next = new Set(prev);
          next.delete(row.id);
          return next;
        });
      }
    },
    [saveCritical],
  );

  const refreshStock = () => {
    void queryClient.invalidateQueries({ queryKey: pullRequestKeys.all });
    void queryClient.invalidateQueries({ queryKey: pieceKeys.all });
    void queryClient.invalidateQueries({ queryKey: planningItemKeys.all });
  };

  const pending = pullRows.filter((p) => p.status === 'pending').length;
  const done = cards.isSuccess && lots.isSuccess;
  const stats: PageFigure[] = [
    {
      id: 'cards',
      label: 'Çıkabilecek kalem',
      value: done ? stockRows.filter(canRequest).length : '–',
    },
    { id: 'pending', label: 'Bekleyen talep', value: pulls.isSuccess ? pending : '–' },
    { id: 'waiting', label: 'Gelmeyen kalem', value: planning.isSuccess ? waiting.length : '–' },
  ];

  return (
    <>
      <PageHeader
        title={`Malzeme Takibi · ${jobNo}`}
        subtitle="Bu işin İş Emri stoğundan imalata çıkış talebi oluşturun; önceki talepler ve gelmeyen kalemler aşağıda"
        icon="fas fa-box"
        stats={stats}
        backTo={`${MATERIAL_TRACKING_ROUTE}/`}
        backLabel="İş seç"
        actions={
          <Button
            variant="default"
            leftSection={<FaIcon icon="fas fa-exchange-alt" />}
            onClick={() => onPick('')}
          >
            İş Değiştir
          </Button>
        }
      />
      <Stack gap="md">
        <JobStockPanel
          jobNo={jobNo}
          rows={stockRows}
          loading={cards.isFetching || lots.isFetching}
          selectedKeys={selected}
          onSelect={setSelected}
          onCreate={openCreate}
          onRefresh={refreshStock}
        />
        <JobPullsPanel
          jobNo={jobNo}
          rows={pullRows}
          loading={pulls.isFetching}
          onOpen={setDetailId}
        />
        <JobPlanningPanel
          jobNo={jobNo}
          rows={waiting}
          loading={planning.isFetching}
          pendingCritical={pendingCritical}
          onToggleCritical={(row, critical) => void toggleCritical(row, critical)}
        />
      </Stack>

      {creating ? (
        <CreatePullRequestModal
          jobNo={jobNo}
          rows={pickedRows}
          onClose={closeCreate}
          onCreated={(request) => {
            setSelected([]);
            setDetailId(request.id);
          }}
        />
      ) : null}

      <PullRequestDetailModal
        requestId={detailId}
        onClose={closeDetail}
        user={user}
        isAdmin={isAdmin}
      />
    </>
  );
}

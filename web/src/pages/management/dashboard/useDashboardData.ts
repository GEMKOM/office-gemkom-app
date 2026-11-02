// The dashboard's three tiers as queries (management/dashboard/dashboard.js):
// the full page, the slow tier when its cache is missing or stale (or after
// Yenile), and the live strip polled every 60 s while the tab is visible.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  dashboardKeys,
  fetchSlowTier,
  getReportsDashboard,
  type DashboardPayload,
} from '@/api/management/dashboard';
import { notify } from '@/ui';
import { applyLive, mergeSlow, needsSlow, type SlowStatus } from './model';

export const LIVE_POLL_MS = 60_000;
/** Coming back to the tab after this long reloads the whole page; sooner, only the live strip. */
export const FULL_RELOAD_AFTER_MS = 10 * 60_000;

interface FullResult {
  payload: DashboardPayload;
  /** Loaded with refresh=1: the slow tier is rebuilt too. */
  refreshed: boolean;
}

async function loadFull(refresh: boolean, signal?: AbortSignal): Promise<FullResult> {
  const payload = await getReportsDashboard({ refresh, signal });
  if (!payload || !payload.sections) throw new Error('Beklenmeyen yanıt');
  return { payload, refreshed: refresh };
}

// The full payload already carries the live strip: the first poll waits a minute.
const NO_LIVE_YET: DashboardPayload = {};

export interface DashboardData {
  /** Full + slow + live merged; undefined until the first load. */
  payload: DashboardPayload | undefined;
  slowStatus: SlowStatus;
  /** Time of the last successful full load (ms), 0 before. */
  lastFullLoad: number;
  /** The last request failed; the page shows the previous data. */
  offline: boolean;
  loading: boolean;
  error: Error | null;
  refreshing: boolean;
  refresh: () => Promise<void>;
}

export function useDashboardData(): DashboardData {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const full = useQuery({
    queryKey: dashboardKeys.full(),
    queryFn: ({ signal }) => loadFull(false, signal),
    staleTime: FULL_RELOAD_AFTER_MS,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const fullData = full.data;
  const forced = !!fullData?.refreshed;
  const wantSlow = needsSlow(fullData?.payload, forced);
  const slow = useQuery({
    queryKey: dashboardKeys.slow(full.dataUpdatedAt, forced),
    queryFn: ({ signal }) => fetchSlowTier({ refresh: forced, signal }),
    enabled: wantSlow,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });

  const live = useQuery({
    queryKey: dashboardKeys.live(),
    queryFn: ({ signal }) => getReportsDashboard({ block: 'live', signal }),
    enabled: !!fullData,
    initialData: NO_LIVE_YET,
    initialDataUpdatedAt: () => Date.now(),
    staleTime: LIVE_POLL_MS,
    refetchInterval: LIVE_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: false,
  });

  // Like the legacy loadAll(): a failed full load says so, then the page keeps what it had.
  useEffect(() => {
    if (full.errorUpdatedAt && full.error) {
      notify.error(`Yönetim paneli yüklenemedi: ${full.error.message}`);
    }
  }, [full.errorUpdatedAt, full.error]);

  let slowStatus: SlowStatus = 'done';
  if (wantSlow) {
    if (slow.isError) slowStatus = 'failed';
    else if (slow.data?.status === 'unavailable') slowStatus = 'unavailable';
    else if (slow.data?.status === 'done') slowStatus = 'done';
    else slowStatus = 'pending';
  }

  const slowData = slow.data?.status === 'done' ? slow.data.data : null;
  const liveData = live.data;
  const liveNewer = live.dataUpdatedAt >= full.dataUpdatedAt;
  const payload = useMemo(() => {
    if (!fullData) return undefined;
    let merged = fullData.payload;
    if (slowData) merged = mergeSlow(merged, slowData);
    if (liveNewer && liveData !== NO_LIVE_YET) merged = applyLive(merged, liveData);
    return merged;
  }, [fullData, slowData, liveData, liveNewer]);

  const lastOk = Math.max(
    full.dataUpdatedAt,
    live.isError || liveData === NO_LIVE_YET ? 0 : live.dataUpdatedAt,
  );
  const lastError = Math.max(full.errorUpdatedAt, live.errorUpdatedAt);
  const offline = (full.isError || live.isError) && lastError > lastOk;

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await queryClient.fetchQuery({
        queryKey: dashboardKeys.full(),
        queryFn: ({ signal }) => loadFull(true, signal),
        staleTime: 0,
        retry: false,
      });
    } catch {
      // The query's error state reports it.
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);

  return {
    payload,
    slowStatus,
    lastFullLoad: full.dataUpdatedAt,
    offline,
    loading: full.isPending,
    error: full.error,
    refreshing: refreshing || (full.isFetching && !!fullData),
    refresh,
  };
}

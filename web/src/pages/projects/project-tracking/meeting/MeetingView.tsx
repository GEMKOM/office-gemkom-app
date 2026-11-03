import { Loader } from '@mantine/core';
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  fetchProductionPlanOverview,
  jobOrderKeys,
  meetingBriefQueryOptions,
  planSheetQueryOptions,
} from '@/api/projects/jobOrders';
import { notify } from '@/ui';
import { MeetingTiles, TilesError, TilesSkeleton } from './MeetingTiles';
import s from './MeetingView.module.css';
import { SectionModal } from './SectionModal';
import { SheetShareDialog } from './SheetShareDialog';
import { isZoomUnit, SheetLegend, SheetSummaryChips, ZOOM_UNITS, ZOOMS, type ZoomUnit } from '@/features/plan-sheet';
import { HeroSlot, SheetSlot } from './slots';
import type { MeetingBrief, MeetingItem, OverviewPayload, PlanSheet, SectionKind } from './types';

// Sunum Modu: one job order per full-screen slide (legacy meetingView.js).
// The page owns the URL (?meeting=1&job_no=X) and renders this while
// `meeting` is set; the deck reports every slide change and the exit.

/** A slide fetches only after the user is still this long (wheel steps are 600 ms apart). */
export const MEETING_SETTLE_MS = 700;
/** The neighbours wait even longer. */
export const MEETING_PREFETCH_MS = 1300;
/**
 * Nothing is presented from a cache older than this: a stale entry still
 * paints (never a blank slide) and its refetch swaps in over it.
 */
export const MEETING_MAX_AGE_MS = 60_000;

const OVERVIEW_STATUS = 'active';
const meetingOverviewKey = [...jobOrderKeys.overview(OVERVIEW_STATUS), 'meeting'] as const;

const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

/**
 * The portfolio behind the deck. Its hero figures get read out loud, so the
 * deck always asks for the recompute (refresh=1), never the ~15-minute
 * server snapshot; a return within the freshness window reuses it.
 */
function meetingOverviewQueryOptions() {
  return queryOptions({
    queryKey: meetingOverviewKey,
    queryFn: async ({ signal }) => {
      try {
        return await fetchProductionPlanOverview<OverviewPayload | MeetingItem[]>(OVERVIEW_STATUS, {
          refresh: true,
          signal,
        });
      } catch (error) {
        if (!isAbort(error)) {
          console.error('Overview load failed:', error);
          notify.error('Proje portföyü yüklenemedi');
        }
        throw error;
      }
    },
    staleTime: MEETING_MAX_AGE_MS,
    retry: false,
  });
}

/**
 * The portfolio rows in slide order (active, natural job-no order). The
 * endpoint answers `{items}`, but a paginated or bare-array response must
 * land on the same slides.
 */
function sortedItems(payload: OverviewPayload | MeetingItem[] | undefined): MeetingItem[] {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.results)
        ? payload.results
        : [];
  return [...rows].sort((a, b) =>
    (a.job_no || '').localeCompare(b.job_no || '', undefined, { numeric: true }),
  );
}

/** "Veri 14:32": when the server computed the portfolio (else our fetch time). */
function stampText(payload: OverviewPayload | MeetingItem[] | undefined, fetchedAt: number): string {
  const raw = payload && !Array.isArray(payload) ? payload.generated_at : null;
  const at = raw ? new Date(raw) : fetchedAt ? new Date(fetchedAt) : null;
  if (!at || Number.isNaN(at.getTime())) return '';
  return `Veri ${at.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
}

type ModalState = { kind: SectionKind | 'sheet-share'; item: MeetingItem };

export interface MeetingViewProps {
  /** The slide's job_no from the URL; null = the first slide. */
  jobNo: string | null;
  /** Called on every slide change (the page replaces `job_no` in the URL). */
  onJobChange: (jobNo: string | null) => void;
  /** Leave the deck (Esc, Çık). */
  onExit: () => void;
}

export function MeetingView({ jobNo, onJobChange, onExit }: MeetingViewProps) {
  const queryClient = useQueryClient();
  const overview = useQuery(meetingOverviewQueryOptions());
  const items = useMemo(() => sortedItems(overview.data), [overview.data]);

  const [lastIndex, setLastIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  // After a "Yenile" a failed portfolio call keeps the slides on screen; only
  // a failure on the way in is an error screen.
  const [refreshed, setRefreshed] = useState(false);
  const [slideSeq, setSlideSeq] = useState(0);
  const [modal, setModal] = useState<ModalState | null>(null);
  // Zoom and collapsed groups persist across slides: the presenter sets the
  // sheet once and every job order reads the same way.
  const [zoom, setZoom] = useState<ZoomUnit>('week');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState('');
  const wheelAt = useRef(0);

  const found = jobNo ? items.findIndex((i) => i.job_no === jobNo) : 0;
  const index = found >= 0 ? found : Math.max(0, Math.min(lastIndex, items.length - 1));
  const item = items[index];

  const loading =
    !refreshing &&
    (overview.data === undefined ? !overview.isError || overview.isFetching : overview.isFetching && overview.isStale);
  const failed = !loading && overview.isError && (!refreshed || overview.data === undefined);

  // The URL follows the slide on screen (deep links to a job that is not in
  // the portfolio land on the first slide, as before).
  const currentJob = !loading && !failed ? (item?.job_no ?? null) : null;
  useEffect(() => {
    if (currentJob && currentJob !== jobNo) onJobChange(currentJob);
  }, [currentJob, jobNo, onJobChange]);

  // Fullscreen: nothing behind the deck scrolls.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  function go(target: number) {
    const next = items[target];
    if (!next) return;
    setLastIndex(target);
    setSearch('');
    onJobChange(next.job_no);
  }

  function step(delta: number) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    go(target);
  }

  function jumpToJob(query: string) {
    const needle = query.trim().toUpperCase();
    if (!needle) return;
    const upper = items.map((i) => i.job_no.toUpperCase());
    let target = upper.indexOf(needle);
    if (target < 0) target = upper.findIndex((no) => no.startsWith(needle));
    if (target < 0) target = upper.findIndex((no) => no.includes(needle));
    if (target < 0) {
      notify.warning(`"${needle}" portföyde bulunamadı`);
      return;
    }
    go(target);
  }

  // "Yenile" (and R): the portfolio is recomputed and this slide's brief,
  // section details, sheet and plan are dropped. The slide stays on its job
  // order: a recomputed portfolio can reorder rows or lose one.
  async function refresh() {
    if (!item || refreshing) return;
    const target = item.job_no;
    setRefreshing(true);
    setRefreshed(true);
    try {
      await queryClient.refetchQueries({ queryKey: meetingOverviewKey, exact: true });
      queryClient.removeQueries({ queryKey: jobOrderKeys.meetingBrief(target) });
      queryClient.removeQueries({ queryKey: jobOrderKeys.planSheet(target) });
      void queryClient.invalidateQueries({ queryKey: jobOrderKeys.productionPlan(target), refetchType: 'none' });
      const fresh = sortedItems(queryClient.getQueryData(meetingOverviewKey));
      const at = fresh.findIndex((i) => i.job_no === target);
      const next = at >= 0 ? at : Math.max(0, Math.min(index, fresh.length - 1));
      setLastIndex(next);
      const nextJob = fresh[next]?.job_no;
      if (nextJob && nextJob !== jobNo) onJobChange(nextJob);
      // A new slide instance: the settle timer refetches what was dropped.
      setSlideSeq((n) => n + 1);
    } finally {
      setRefreshing(false);
    }
  }

  // "Tekrar Dene" on the error screen: a new attempt, landing on the first slide.
  function retry() {
    setRefreshed(false);
    setLastIndex(0);
    onJobChange(null);
    void overview.refetch();
  }

  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    // An open modal captures Esc and mutes slide navigation.
    if (modal) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setModal(null);
      }
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      step(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      step(1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onExit();
    } else if (e.key === 'r' || e.key === 'R') {
      // Someone fixes the data while the slide is up; R brings it back.
      e.preventDefault();
      void refresh();
    }
  });

  // The page cannot scroll, so a decisive wheel gesture turns the slide. The
  // threshold keeps trackpad inertia tails from double-stepping.
  const onWheel = useEffectEvent((e: WheelEvent) => {
    if (modal) return;
    const target = e.target instanceof Element ? e.target : null;
    const scroller = target?.closest('.pp-scroll');
    if (scroller && scroller.scrollHeight > scroller.clientHeight) return;
    // The plan sheet scrolls (and Ctrl+wheel zooms) on its own when it can.
    const sheet = target?.closest('[data-sheet-scroll]');
    if (
      sheet &&
      (e.ctrlKey || sheet.scrollHeight > sheet.clientHeight || sheet.scrollWidth > sheet.clientWidth)
    )
      return;
    const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    if (Math.abs(delta) < 30) return;
    const now = Date.now();
    if (now - wheelAt.current < 600) return;
    wheelAt.current = now;
    step(delta > 0 ? 1 : -1);
  });

  useEffect(() => {
    const key = (e: KeyboardEvent) => onKeyDown(e);
    const wheel = (e: WheelEvent) => onWheel(e);
    document.addEventListener('keydown', key);
    window.addEventListener('wheel', wheel, { passive: true });
    return () => {
      document.removeEventListener('keydown', key);
      window.removeEventListener('wheel', wheel);
    };
  }, []);

  const exitButton = (
    <button type="button" className={s.btn} onClick={onExit}>
      <i className="fas fa-xmark" aria-hidden /> Çık
    </button>
  );

  let content: ReactNode;
  if (loading) {
    content = (
      <div className={s.slideEmpty}>
        <Loader color="gemkom" mb="md" />
        <p>Proje portföyü yükleniyor...</p>
        {exitButton}
      </div>
    );
  } else if (failed) {
    // A failed portfolio call is not an empty portfolio.
    const detail = overview.error instanceof Error ? overview.error.message : '';
    content = (
      <div className={s.slideEmpty}>
        <i className={`fas fa-triangle-exclamation ${s.slideEmptyIcon}`} aria-hidden />
        <p>Proje portföyü yüklenemedi.</p>
        {detail ? <p className={s.small}>{detail}</p> : null}
        <div className={s.slideEmptyActions}>
          <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={retry}>
            <i className="fas fa-rotate" aria-hidden /> Tekrar Dene
          </button>
          {exitButton}
        </div>
      </div>
    );
  } else if (!item) {
    content = (
      <div className={s.slideEmpty}>
        <i className={`fas fa-folder-open ${s.slideEmptyIcon}`} aria-hidden />
        <p>Sunulacak proje bulunamadı.</p>
        <p className={s.small}>Sunum modu yalnızca aktif iş emirlerini listeler.</p>
        {exitButton}
      </div>
    );
  } else {
    const strip = (
      <div className={s.strip}>
        <div className={s.stripNav}>
          <button
            type="button"
            className={s.btn}
            disabled={index === 0}
            aria-label="Önceki proje"
            onClick={() => step(-1)}
          >
            <i className="fas fa-chevron-left" aria-hidden />
          </button>
          <span className={s.stripCount}>
            {index + 1} / {items.length}
          </span>
          <button
            type="button"
            className={s.btn}
            disabled={index === items.length - 1}
            aria-label="Sonraki proje"
            onClick={() => step(1)}
          >
            <i className="fas fa-chevron-right" aria-hidden />
          </button>
        </div>
        <div className={s.stripTitle} />
        <div className={s.stripActions}>
          <input
            type="text"
            className={s.stripSearch}
            placeholder="İş no + Enter"
            aria-label="İş emrine git"
            autoComplete="off"
            spellCheck={false}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => {
              // Enter jumps; Esc leaves the box (the next Esc exits).
              if (e.key === 'Enter') {
                e.preventDefault();
                jumpToJob(e.currentTarget.value);
              } else if (e.key === 'Escape') {
                e.stopPropagation();
                e.currentTarget.blur();
              }
            }}
          />
          <span className={s.stripHint}>← → gezin · Esc çık</span>
          <span className={s.stripStamp} title="Portföy verisinin sunucuda hesaplandığı an">
            {stampText(overview.data, overview.dataUpdatedAt)}
          </span>
          <button
            type="button"
            className={s.btn}
            title="Bu slaydın verisini sunucudan yeniden çek (R)"
            disabled={refreshing}
            onClick={() => void refresh()}
          >
            {refreshing ? (
              <Loader size={14} color="gray" aria-label="Yenileniyor" />
            ) : (
              <>
                <i className="fas fa-rotate" aria-hidden /> Yenile
              </>
            )}
          </button>
          {exitButton}
        </div>
      </div>
    );
    content = (
      <Slide
        key={`${item.job_no}:${slideSeq}`}
        item={item}
        neighbours={[items[index - 1]?.job_no, items[index + 1]?.job_no]}
        strip={strip}
        zoom={zoom}
        onZoom={(z) => {
          if (isZoomUnit(z)) setZoom(z);
        }}
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
        onOpen={(kind) => setModal({ kind, item })}
        onRetry={() => void refresh()}
      />
    );
  }

  return createPortal(
    <>
      <div className={s.deck} role="region" aria-label="Sunum Modu">
        {content}
      </div>
      {modal?.kind === 'sheet-share' ? (
        <SheetShareDialog jobNo={modal.item.job_no} view={{ zoom, collapsed }} onClose={() => setModal(null)} />
      ) : modal ? (
        <SectionModal kind={modal.kind} item={modal.item} onClose={() => setModal(null)} />
      ) : null}
    </>,
    document.body,
  );
}

/** Becomes true once the slide has been on screen for `ms`. */
function useSettled(ms: number): boolean {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(true), ms);
    return () => window.clearTimeout(timer);
  }, [ms]);
  return settled;
}

interface SlideProps {
  item: MeetingItem;
  neighbours: (string | undefined)[];
  strip: ReactNode;
  zoom: ZoomUnit;
  onZoom: (zoom: ZoomUnit) => void;
  collapsed: ReadonlySet<string>;
  onCollapsedChange: (collapsed: Set<string>) => void;
  onOpen: (kind: SectionKind | 'sheet-share') => void;
  onRetry: () => void;
}

/**
 * One slide: strip, hero, tiles, plan sheet. Cached data paints at once (at
 * any age); the fetch waits until the presenter settles here, so flipping
 * through the portfolio sends nothing, and refetches only what is older than
 * MEETING_MAX_AGE_MS. Then the neighbours are warmed.
 */
function Slide({ item, neighbours, strip, zoom, onZoom, collapsed, onCollapsedChange, onOpen, onRetry }: SlideProps) {
  const queryClient = useQueryClient();
  const settled = useSettled(MEETING_SETTLE_MS);
  const brief = useQuery({ ...meetingBriefQueryOptions<MeetingBrief>(item.job_no), enabled: settled });
  const sheet = useQuery({ ...planSheetQueryOptions<PlanSheet>(item.job_no), enabled: settled });
  const [prev, next] = neighbours;

  useEffect(() => {
    if (!settled) return;
    const timer = window.setTimeout(() => {
      for (const jobNo of [prev, next]) {
        if (!jobNo) continue;
        void queryClient.prefetchQuery(meetingBriefQueryOptions(jobNo));
        void queryClient.prefetchQuery(planSheetQueryOptions(jobNo));
      }
    }, MEETING_PREFETCH_MS);
    return () => window.clearTimeout(timer);
  }, [settled, prev, next, queryClient]);

  // A failed revalidation keeps the last data on screen; only a slide with
  // nothing to show says so.
  let tiles: ReactNode;
  if (brief.data) tiles = <MeetingTiles brief={brief.data} onOpen={onOpen} />;
  else if (brief.isError) tiles = <TilesError />;
  else tiles = <TilesSkeleton />;

  const sheetData = sheet.data;
  const rows = sheetData?.rows ?? [];
  let sheetCard: ReactNode;
  if (sheetData) {
    sheetCard = (
      <>
        <SheetHead
          sheet={sheetData}
          zoom={zoom}
          onZoom={onZoom}
          onShare={() => {
            if (!rows.length) {
              notify.info('Plan henüz yüklenmedi.');
              return;
            }
            onOpen('sheet-share');
          }}
        />
        {rows.length ? (
          <div className={s.sheetBody}>
            <SheetSlot
              sheet={sheetData}
              loading={sheet.isFetching}
              zoom={zoom}
              onZoomChange={onZoom}
              collapsed={collapsed}
              onCollapsedChange={onCollapsedChange}
            />
          </div>
        ) : (
          <div className={s.sheetEmpty}>Bu iş emrinde departman görevi yok.</div>
        )}
      </>
    );
  } else if (sheet.isError) {
    sheetCard = (
      <div className={s.sheetError}>
        <i className="fas fa-triangle-exclamation" aria-hidden />
        Plan yüklenemedi.
        <button type="button" className={s.btn} onClick={onRetry}>
          Tekrar dene
        </button>
      </div>
    );
  } else {
    sheetCard = (
      <div className={s.sheetSkeleton} aria-hidden>
        <div className={`${s.skeleton} ${s.skeletonTitle}`} />
        <div className={s.skeleton} />
        <div className={`${s.skeleton} ${s.skeletonShort}`} />
        <div className={s.skeleton} />
        <div className={`${s.skeleton} ${s.skeletonShort}`} />
      </div>
    );
  }

  return (
    <>
      {strip}
      <HeroSlot item={item} sheet={sheetData} />
      <div className={s.tiles} data-testid="meeting-tiles">
        {tiles}
      </div>
      <div className={s.sheet}>{sheetCard}</div>
    </>
  );
}

/** Sheet header: what the summary counted, the legend, the zoom, print / share. */
function SheetHead({
  sheet,
  zoom,
  onZoom,
  onShare,
}: {
  sheet: PlanSheet;
  zoom: ZoomUnit;
  onZoom: (zoom: ZoomUnit) => void;
  onShare: () => void;
}) {
  return (
    <div className={s.sheetHead}>
      <span className={s.sheetTitle}>
        <i className="fas fa-table-list" aria-hidden />
        Plan ve sapmalar
      </span>
      <span className={s.sheetChips}>
        <SheetSummaryChips summary={sheet.summary} />
      </span>
      <SheetLegend className={s.sheetLegend} />
      <span className={s.zoomGroup} role="group" aria-label="Ölçek">
        {ZOOM_UNITS.map((z) => (
          <button
            key={z}
            type="button"
            className={s.zoomBtn}
            aria-pressed={zoom === z}
            onClick={() => onZoom(z)}
          >
            {ZOOMS[z]?.label ?? z}
          </button>
        ))}
      </span>
      <button
        type="button"
        className={s.sheetPdfBtn}
        title="Sütunları seçerek yazdırın (PDF) ya da müşteri için geçici bağlantı oluşturun"
        onClick={onShare}
      >
        <i className="fas fa-file-export" aria-hidden /> PDF / Bağlantı
      </button>
    </div>
  );
}

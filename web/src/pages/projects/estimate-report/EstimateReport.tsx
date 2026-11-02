import '@legacy/components/estimate-report/estimate-report.css';
import { ESTIMATE_STATUS, REVIEW_LABELS } from '@legacy/apis/estimator.js';
import { loadMethodHtml } from '@legacy/components/estimator-method/estimator-method.js';
import {
  fmt,
  progressModel,
  remainingLabel,
  reportModel,
} from '@legacy/components/estimate-report/report-model.js';
import {
  costTableHtml,
  DEFAULT_COLLAPSED,
  doneReportHtml,
  formatDateTime,
  gotoResolver,
  methodSectionHtml,
  printReport,
  runMinutes,
  weldSectionHtml,
  type EstimateViewState,
} from '@legacy/components/estimate-report/report-view.js';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { isApiError } from '@/api/client';
import {
  cancelEstimate,
  createEstimate,
  estimatorKeys,
  getEstimate,
  getLatestEstimate,
  getWeldSchedule,
  reviewEstimate,
  type EstimateReport as Report,
  type EstimateScope,
  type EstimateSubject,
  type WeldSchedule,
} from '@/api/projects/estimator';
import { confirm, errorMessage, notify } from '@/ui';
import { EstimateHtml } from './EstimateHtml';
import css from './EstimateReport.module.css';
import { WeldTable } from './WeldTable';

// Port of components/estimate-report/estimate-report.js (mountEstimateReport):
// the Tahmin card of a job order, an offer or one fixed report. The state,
// requests and actions are React; a finished report's sections come from the
// legacy report-view.js builders (see EstimateHtml).

const POLL_MS = 5000;
/** A run takes 6–15 minutes and the server gives up at 30: so does the card. */
const POLL_MAX_MS = 30 * 60_000;
const WELD_OPEN_KEY = 'estimateWeldListOpen';
const COLLAPSED_KEY = 'estimateSectionsCollapsed';
const CANCEL_CONFIRM = 'Çalıştırma durdurulsun mu? Harcanan kısım iade edilmez.';
const CANCELLED_PREFIX = 'Kullanıcı tarafından durduruldu';
const RUN_HINT = 'Bir çalıştırma yaklaşık 2–4 USD tutar ve 6–15 dakika sürer.';

let mountCounter = 0;

function isOpen(status: string | undefined | null): boolean {
  return status === 'queued' || status === 'running';
}

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* a per-viewer nicety */
  }
}

function readList(key: string): string[] | null {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(key) || 'null');
    return Array.isArray(v) ? (v as string[]) : null;
  } catch {
    return null;
  }
}

function writeList(key: string, list: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* a per-viewer nicety */
  }
}

function elapsed(startedAt: string | null | undefined, now: number): string {
  if (!startedAt) return '';
  const mins = Math.max(0, Math.round((now - new Date(startedAt).getTime()) / 60000));
  return mins ? ` · ${mins} dk` : '';
}

function firstLine(text: string): string {
  return text.split('\n')[0]!.slice(0, 300);
}

function StatusPill({ status }: { status: string }) {
  const s = ESTIMATE_STATUS[status] ?? { label: status, badge: 'status-grey', icon: '' };
  return (
    <span className={`status-badge ${s.badge}`}>
      {s.icon ? <i className={`fas ${s.icon}`} aria-hidden /> : null}
      {s.label}
    </span>
  );
}

export interface EstimateReportProps {
  subject: EstimateSubject;
  /** Fires after every load and after a review (legacy `onChange`). */
  onChange?: (report: Report | null) => void;
}

/** The Tahmin card. Users without access (403) get nothing. */
export function EstimateReport({ subject, onChange }: EstimateReportProps) {
  const queryClient = useQueryClient();
  const fixed = 'reportId' in subject;
  const owner = fixed ? null : subject;
  const [uid] = useState(() => `est-r${++mountCounter}`);
  // The report shown: null = the subject's newest.
  const [reportId, setReportId] = useState<number | null>(fixed ? subject.reportId : null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [scope, setScope] = useState<EstimateScope | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [weldOpen, setWeldOpen] = useState(() => readFlag(WELD_OPEN_KEY));
  const [confOpen, setConfOpen] = useState(false);
  const [similarAll, setSimilarAll] = useState(false);
  const [methodHtml, setMethodHtml] = useState<string | null>(null);
  const [pollExpired, setPollExpired] = useState(false);
  const [seenId, setSeenId] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // Toggled straight in the DOM like legacy (no re-render), read when the markup is rebuilt.
  const collapsed = useRef(new Set(readList(COLLAPSED_KEY) ?? DEFAULT_COLLAPSED));
  const costRoute = useRef<{ id: number | null; route: string | null }>({ id: null, route: null });
  const detailsOpen = useRef(new Map<string, boolean>());
  const rootRef = useRef<HTMLDivElement>(null);
  const htmlRef = useRef<HTMLDivElement>(null);
  const activeNav = useRef<string | null>(null);
  const [weldHost, setWeldHost] = useState<HTMLElement | null>(null);

  const reportQuery = useQuery({
    queryKey: reportId !== null ? estimatorKeys.report(reportId) : estimatorKeys.latest(owner ?? {}),
    queryFn: ({ signal }) => (reportId !== null ? getEstimate(reportId, signal) : getLatestEstimate(owner ?? {}, signal)),
    retry: false,
    // Switching versions keeps the shown report until the next one is in.
    placeholderData: keepPreviousData,
  });
  const report = reportQuery.data ?? null;

  const weldQuery = useQuery({
    queryKey: [...estimatorKeys.weld(owner ?? {}), 'card'],
    queryFn: ({ signal }) => getWeldSchedule(owner ?? {}, signal),
    enabled: !fixed && reportQuery.isSuccess && !report?.weld_schedule,
    retry: false,
  });
  const weldSchedule: WeldSchedule | null = report?.weld_schedule ?? weldQuery.data ?? null;

  const error = reportQuery.error;
  const hidden = isApiError(error) && error.status === 403;
  const notFound = isApiError(error) && error.status === 404;

  // A shown report that is gone: back to the subject's newest (legacy load()).
  if (notFound && reportId !== null && !fixed) setReportId(null);

  // Per-report choices reset when another report is shown.
  const shownId = report?.id ?? null;
  if (seenId !== shownId) {
    setSeenId(shownId);
    setSimilarAll(false);
    setNoteOpen(false);
    setPollExpired(false);
  }

  // One poll chain while an open run is shown: every 5 s, for at most 30 minutes.
  const openRun = report && isOpen(report.status) && !pollExpired ? report.id : null;
  const { refetch } = reportQuery;
  useEffect(() => {
    if (openRun === null) return;
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started >= POLL_MAX_MS) {
        clearInterval(timer);
        setPollExpired(true);
        return;
      }
      void refetch();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [openRun, refetch]);

  // The progress bar moves between polls.
  const ticking = openRun !== null;
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ticking]);

  useEffect(() => {
    if (reportQuery.isFetched) onChange?.(report);
    // onChange is the caller's; fire on data changes only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, reportQuery.isFetched]);

  const model = useMemo(() => (report?.status === 'done' ? reportModel(report) : null), [report]);
  if (model && costRoute.current.id !== report!.id) {
    const routes = model.routes;
    const basis = model.basis?.key;
    costRoute.current = { id: report!.id, route: basis && routes.includes(basis) ? basis : (routes[0] ?? 'in_house') };
  }

  const createTarget = useMemo<{ jobNo?: string; offerId?: number } | null>(() => {
    if (owner) return owner;
    if (!report) return null;
    if (report.job_no) return { jobNo: report.job_no };
    if (report.offer_id) return { offerId: report.offer_id };
    return null;
  }, [owner, report]);
  const currentScope: EstimateScope = scope ?? (report?.hours?.scope === 'programme' ? 'programme' : 'unit');

  const ensureMethod = useCallback(() => {
    if (methodHtml) return;
    loadMethodHtml()
      .then(setMethodHtml)
      .catch((e: unknown) =>
        setMethodHtml(`<span class="text-danger">${escapeText(errorMessage(e, 'Açıklama yüklenemedi'))}</span>`),
      );
  }, [methodHtml]);

  useEffect(() => {
    if (!collapsed.current.has('yontem')) ensureMethod();
  }, [ensureMethod]);

  // ------------------------------------------------------------ markup from report-view.js

  const view: EstimateViewState = {
    uid,
    collapsed: collapsed.current,
    costRoute: costRoute.current.route,
    similarAll,
    confOpen,
    weldOpen,
    methodHtml,
  };
  const weldHtml = weldSchedule ? weldSectionHtml(view, weldSchedule) : '';
  const bodyHtml =
    report?.status === 'done' && model
      ? `${doneReportHtml(report, model, view, weldHtml)}${methodSectionHtml(view)}`
      : `${weldHtml}${methodSectionHtml(view)}`;

  // After the markup changes: restore <details>, find the weld table's host, refresh the nav.
  useLayoutEffect(() => {
    const root = htmlRef.current;
    if (!root) return;
    detailsKeyed(root).forEach(([k, d]) => {
      const open = detailsOpen.current.get(k);
      if (open !== undefined) d.open = open;
    });
    setWeldHost(root.querySelector<HTMLElement>(`#${uid}-weld`));
    activeNav.current = null;
    updateNav();
    // updateNav reads the DOM only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodyHtml, uid]);

  // <details> toggles do not bubble: catch them on the way down.
  useEffect(() => {
    const root = htmlRef.current;
    if (!root) return;
    const onToggle = (event: Event) => {
      const d = event.target as HTMLDetailsElement;
      const key = detailsKeyed(root).find(([, el]) => el === d)?.[0];
      if (key) detailsOpen.current.set(key, d.open);
    };
    root.addEventListener('toggle', onToggle, true);
    return () => root.removeEventListener('toggle', onToggle, true);
  });

  // ------------------------------------------------------------ sections, nav, scrolling (legacy)

  const scrollRoot = (): HTMLElement => {
    let el = rootRef.current?.parentElement ?? null;
    while (el && el !== document.body && el !== document.documentElement) {
      const oy = getComputedStyle(el).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) return el;
      el = el.parentElement;
    }
    return (document.scrollingElement as HTMLElement) || document.documentElement;
  };

  /**
   * Height of sticky bars above the card in its scroll container (the modal's
   * own header): the section nav sticks below them. Legacy modals had none.
   */
  const stickyAbove = (scrollEl: HTMLElement): number => {
    let total = 0;
    let el: Element | null = rootRef.current;
    while (el && el !== scrollEl) {
      let sib = el.previousElementSibling;
      while (sib) {
        if (getComputedStyle(sib).position === 'sticky') total += (sib as HTMLElement).offsetHeight;
        sib = sib.previousElementSibling;
      }
      el = el.parentElement;
    }
    return total;
  };

  const scrollToY = (target: number) => {
    const root = scrollRoot();
    const isPage = root === document.scrollingElement || root === document.documentElement;
    const rootTop = isPage ? 0 : root.getBoundingClientRect().top;
    const top = target - rootTop + (isPage ? window.scrollY : root.scrollTop);
    (isPage ? window : root).scrollTo?.({ top: Math.max(0, top), behavior: 'smooth' });
  };

  const setActiveNav = (key: string) => {
    const root = rootRef.current;
    if (!root || activeNav.current === key) return;
    activeNav.current = key;
    const items = root.querySelector<HTMLElement>('.est-nav-items');
    root.querySelectorAll<HTMLElement>('[data-nav-key]').forEach((b) => {
      const on = b.dataset.navKey === key;
      b.classList.toggle('is-active', on);
      if (on && items && items.scrollWidth > items.clientWidth) {
        items.scrollLeft = Math.max(0, b.offsetLeft - items.clientWidth / 2 + b.offsetWidth / 2);
      }
    });
  };

  const setSectionCollapsed = (key: string, value: boolean) => {
    if (value) collapsed.current.add(key);
    else collapsed.current.delete(key);
    writeList(COLLAPSED_KEY, [...collapsed.current]);
    const sec = rootRef.current?.querySelector(`section[data-sec="${key}"]`);
    if (sec) {
      sec.classList.toggle('is-collapsed', value);
      sec.querySelector('.est-sec-toggle')?.setAttribute('aria-expanded', value ? 'false' : 'true');
    }
    if (key === 'yontem' && !value) ensureMethod();
  };

  const goto = (key: string) => {
    const root = rootRef.current;
    const sec = root?.querySelector(`section[data-sec="${key}"]`);
    if (!root || !sec) return;
    if (collapsed.current.has(key)) setSectionCollapsed(key, false);
    const nav = root.querySelector<HTMLElement>('[data-est-nav]');
    const above = stickyAbove(scrollRoot());
    const offset = above + (key === 'ozet' ? 12 : (nav ? nav.offsetHeight : 0) + 8);
    scrollToY(sec.getBoundingClientRect().top - offset);
    setActiveNav(key);
  };

  /** Scroll spy: highlight the section under the nav; mark the nav once it sticks. */
  function updateNav() {
    const root = rootRef.current;
    const nav = root?.querySelector<HTMLElement>('[data-est-nav]');
    if (!root || !nav || !nav.offsetParent) return;
    const sr = scrollRoot();
    const isPage = sr === document.scrollingElement || sr === document.documentElement;
    const pad = isPage ? 0 : parseFloat(getComputedStyle(sr).paddingTop) || 0;
    const above = isPage ? 0 : stickyAbove(sr);
    const top = String(above - pad);
    if (nav.dataset.top !== top) {
      nav.style.top = `${above - pad}px`;
      nav.dataset.top = top;
    }
    const navRect = nav.getBoundingClientRect();
    const rootTop = (isPage ? 0 : sr.getBoundingClientRect().top) + above;
    const hero = root.querySelector('section[data-sec="ozet"]');
    const past = !hero || hero.getBoundingClientRect().bottom < rootTop + navRect.height * 1.5;
    nav.classList.toggle('is-stuck', past);
    let active = 'ozet';
    if (past) {
      root.querySelectorAll<HTMLElement>('section[data-sec]').forEach((sec) => {
        if (sec.dataset.sec === 'yontem' || sec.dataset.sec === 'ozet') return;
        if (sec.getBoundingClientRect().top - 12 <= navRect.bottom) active = sec.dataset.sec!;
      });
    }
    setActiveNav(active);
  }

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        updateNav();
      }, 80);
    };
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  });

  // ------------------------------------------------------------ actions

  const showReport = (id: number) => {
    setActionError(null);
    setReportId(id);
  };

  const generate = async () => {
    if (busy || !createTarget) return;
    setBusy(true);
    setActionError(null);
    try {
      const row = await createEstimate(createTarget, currentScope);
      notify.info(`Tahmin v${row.version} sıraya alındı. 6–15 dakika sürer; bu sekme kendini günceller.`);
      queryClient.setQueryData(estimatorKeys.report(row.id), row);
      showReport(row.id);
    } catch (e) {
      const runningId = isApiError(e) && e.status === 409 ? (e.data as { id?: number } | undefined)?.id : undefined;
      if (runningId) showReport(runningId);
      else setActionError(errorMessage(e, 'Tahmin başlatılamadı'));
    } finally {
      setBusy(false);
    }
  };

  const review = async (decision: 'accept' | 'correct', text = '') => {
    if (busy || !report) return;
    setBusy(true);
    setActionError(null);
    try {
      const updated = await reviewEstimate(report.id, decision, text);
      queryClient.setQueryData(queryKeyOf(reportId, owner), updated);
      setNoteOpen(false);
      notify.success(decision === 'accept' ? 'Tahmin kabul edildi.' : 'Düzeltme notu kaydedildi.');
      onChange?.(updated);
    } catch (e) {
      setActionError(errorMessage(e, 'İnceleme kaydedilemedi'));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (busy || !report || !isOpen(report.status)) return;
    const ok = await confirm({ title: 'Çalıştırmayı durdur', message: CANCEL_CONFIRM, confirmLabel: 'Durdur', danger: true });
    if (!ok) return;
    const id = report.id;
    setBusy(true);
    setActionError(null);
    try {
      await cancelEstimate(id);
      notify.info('Çalıştırma durduruldu.');
    } catch (e) {
      // 409: it finished meanwhile; just show what it became.
      if (!(isApiError(e) && e.status === 409)) setActionError(errorMessage(e, 'Çalıştırma durdurulamadı'));
    } finally {
      setBusy(false);
      showReport(id);
      await queryClient.invalidateQueries({ queryKey: estimatorKeys.report(id) });
    }
  };

  const retry = () => {
    setPollExpired(false);
    void reportQuery.refetch();
  };

  /** Clicks inside the legacy markup (event delegation, as the legacy card did). */
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const root = rootRef.current;
    if (!root) return;
    const jump = target.closest<HTMLElement>('[data-est-goto]');
    if (jump && root.contains(jump)) {
      event.preventDefault();
      goto(jump.dataset.estGoto!);
      return;
    }
    const el = target.closest<HTMLElement>('[data-est-action]');
    if (!el || !root.contains(el)) return;
    switch (el.dataset.estAction) {
      case 'toggle': {
        const key = el.dataset.secKey!;
        setSectionCollapsed(key, !collapsed.current.has(key));
        break;
      }
      case 'expand-all':
      case 'collapse-all':
        root.querySelectorAll<HTMLElement>('section[data-sec]').forEach((sec) => {
          if (sec.dataset.sec !== 'ozet') setSectionCollapsed(sec.dataset.sec!, el.dataset.estAction === 'collapse-all');
        });
        break;
      case 'top':
        scrollToY(root.getBoundingClientRect().top - 12);
        break;
      case 'conf-help':
        setConfOpen((v) => !v);
        break;
      case 'similar-all':
        setSimilarAll((v) => !v);
        break;
      case 'weld-toggle':
        setWeldOpen((v) => {
          writeFlag(WELD_OPEN_KEY, !v);
          return !v;
        });
        break;
      case 'text-all': {
        const parts = [...root.querySelectorAll<HTMLDetailsElement>('section[data-sec="metin"] details.est-text-part')];
        const open = parts.some((d) => !d.open);
        parts.forEach((d) => {
          d.open = open;
        });
        el.textContent = open ? 'Hepsini kapat' : 'Hepsini aç';
        break;
      }
      case 'route': {
        if (!report || !model) break;
        costRoute.current = { id: report.id, route: el.dataset.route ?? null };
        const host = root.querySelector('[data-est-cost]');
        if (host) host.innerHTML = costTableHtml(report.cost_table ?? {}, costRoute.current.route, gotoResolver(model));
        el.parentElement?.querySelectorAll<HTMLElement>('[data-route]').forEach((b) => {
          const on = b.dataset.route === costRoute.current.route;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        break;
      }
      default:
        break;
    }
  };

  // ------------------------------------------------------------ render

  if (hidden) return null;

  let content: ReactNode;
  if (error && !report && !(notFound && !fixed)) {
    content = (
      <div className="est-state est-state-failed">
        <i className="fas fa-calculator est-state-icon" aria-hidden />
        <div>
          <div className="est-state-title">Tahmin yüklenemedi</div>
          <div>{notFound ? 'Rapor bulunamadı (silinmiş olabilir).' : errorMessage(error, 'Tahmin yüklenemedi')}</div>
          <button type="button" className="btn btn-sm btn-link p-0 mt-2" onClick={retry}>
            <i className="fas fa-rotate me-1" aria-hidden />
            Tekrar dene
          </button>
        </div>
      </div>
    );
  } else if (reportQuery.isPending) {
    content = (
      <div className="est-state">
        <i className="fas fa-spinner fa-spin" aria-hidden />
        <span>Tahmin yükleniyor…</span>
      </div>
    );
  } else {
    content = (
      <>
        <Head
          report={report}
          weldSchedule={weldSchedule}
          busy={busy}
          canCreate={Boolean(createTarget)}
          scope={currentScope}
          onScope={setScope}
          onVersion={showReport}
          onGenerate={() => void generate()}
          onCancel={() => void cancel()}
          onAccept={() => void review('accept')}
          onNote={() => {
            setNote(report?.review_note ?? '');
            setNoteOpen(true);
          }}
          onPrint={() =>
            printReport(report, weldSchedule, {
              onBlocked: () => notify.warning('Yazdırma penceresi açılamadı (açılır pencere engellenmiş olabilir).'),
            })
          }
          onMethod={() => {
            setSectionCollapsed('yontem', false);
            goto('yontem');
          }}
        />
        {actionError ? (
          <div className="est-alert" role="alert">
            <i className="fas fa-circle-exclamation" aria-hidden />
            <span>{actionError}</span>
          </div>
        ) : null}
        <VersionNotice report={report} onShow={showReport} />
        <div className="est-body">
          <StateBlock
            report={report}
            fixedWithoutSubject={fixed && !createTarget}
            canCreate={Boolean(createTarget)}
            busy={busy}
            pollExpired={pollExpired}
            now={now}
            onGenerate={() => void generate()}
            onShow={showReport}
            onRetry={retry}
          />
          {report?.status === 'done' ? (
            <ReviewBlock
              report={report}
              open={noteOpen}
              note={note}
              busy={busy}
              onNote={setNote}
              onSubmit={() => void review('correct', note.trim())}
              onCancel={() => setNoteOpen(false)}
            />
          ) : null}
          {fixed && !report ? null : <EstimateHtml ref={htmlRef} html={bodyHtml} />}
        </div>
        {report?.status === 'done' ? (
          <div className="est-foot">
            <i className="fas fa-robot me-1" aria-hidden />
            Yapay zekâ tahminidir; fiyatları ve saatleri referans işlerle doğrulayın.
          </div>
        ) : null}
      </>
    );
  }

  return (
    // Clicks inside the legacy markup reach their buttons through here (event delegation).
    <div
      ref={rootRef}
      className={`${css.shim} est-report${report?.status === 'done' ? ' is-done' : ''}`}
      onClick={onClick}
      data-testid="estimate-report"
    >
      {content}
      {weldHost && weldSchedule ? createPortal(<WeldTable joints={weldSchedule.joints ?? []} />, weldHost) : null}
    </div>
  );
}

function queryKeyOf(reportId: number | null, owner: { jobNo?: string; offerId?: number } | null) {
  return reportId !== null ? estimatorKeys.report(reportId) : estimatorKeys.latest(owner ?? {});
}

function escapeText(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** `<details>` keyed by section + position, so their open state survives a re-render. */
function detailsKeyed(root: HTMLElement): [string, HTMLDetailsElement][] {
  const out: [string, HTMLDetailsElement][] = [];
  root.querySelectorAll<HTMLElement>('section[data-sec]').forEach((sec) => {
    sec.querySelectorAll('details').forEach((d, i) => out.push([`${sec.dataset.sec}:${i}`, d]));
  });
  return out;
}

// ------------------------------------------------------------ head

interface HeadProps {
  report: Report | null;
  weldSchedule: WeldSchedule | null;
  busy: boolean;
  canCreate: boolean;
  scope: EstimateScope;
  onScope: (scope: EstimateScope) => void;
  onVersion: (id: number) => void;
  onGenerate: () => void;
  onCancel: () => void;
  onAccept: () => void;
  onNote: () => void;
  onPrint: () => void;
  onMethod: () => void;
}

function Head({ report: r, weldSchedule, busy, canCreate, scope, onScope, onVersion, onGenerate, onCancel, onAccept, onNote, onPrint, onMethod }: HeadProps) {
  const versions = r?.versions ?? [];
  const review = r?.status === 'done' ? (REVIEW_LABELS[r.review_decision || ''] ?? REVIEW_LABELS['']!) : null;
  return (
    <div className="est-head">
      <div className="est-head-main">
        <span className="est-icon">
          <i className="fas fa-calculator" aria-hidden />
        </span>
        <div className="est-head-text">
          <div className="est-head-title">
            <span>Tahmin raporu</span>
            {versions.length > 1 && r ? (
              <select
                className="form-select form-select-sm est-version-select"
                title="Sürüm"
                aria-label="Sürüm"
                value={r.id}
                onChange={(event) => onVersion(Number(event.currentTarget.value))}
              >
                {versions
                  .slice()
                  .reverse()
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.version} · {ESTIMATE_STATUS[v.status]?.label ?? v.status}
                      {v.review_decision ? ` · ${REVIEW_LABELS[v.review_decision]?.label ?? ''}` : ''}
                    </option>
                  ))}
              </select>
            ) : r ? (
              <span className="est-version">v{r.version}</span>
            ) : null}
            {r ? <StatusPill status={r.status} /> : null}
            {review ? <span className={`status-badge ${review.badge}`}>{review.label}</span> : null}
          </div>
          <div className="est-head-meta">
            <MetaLine report={r} weldSchedule={weldSchedule} />
          </div>
        </div>
      </div>
      <div className={`est-head-actions ${css.headActions}`}>
        {r?.status === 'done' ? (
          <>
            {r.review_decision !== 'accept' ? (
              <button type="button" className="btn btn-sm btn-outline-success" disabled={busy} title="Tahmini kabul et" onClick={onAccept}>
                <i className="fas fa-check me-1" aria-hidden />
                Kabul
              </button>
            ) : null}
            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={busy} onClick={onNote}>
              <i className="fas fa-pen me-1" aria-hidden />
              Düzeltme notu
            </button>
            <button type="button" className="btn btn-sm btn-outline-secondary" title="Yazdır / PDF" onClick={onPrint}>
              <i className="fas fa-file-pdf me-1" aria-hidden />
              PDF
            </button>
          </>
        ) : null}
        {r && isOpen(r.status) ? (
          <button type="button" className="btn btn-sm btn-outline-danger" disabled={busy} title="Çalıştırmayı durdur" onClick={onCancel}>
            <i className="fas fa-stop me-1" aria-hidden />
            Durdur
          </button>
        ) : null}
        {canCreate && (!r || !isOpen(r.status)) ? (
          <>
            <select
              className="form-select form-select-sm est-scope"
              aria-label="Kapsam"
              disabled={busy}
              value={scope}
              onChange={(event) => onScope(event.currentTarget.value === 'programme' ? 'programme' : 'unit')}
              title="Birim: ilk genel montaj çiziminin ana montajı · Program: setteki bütün varyantlar, her biri BoQ adediyle (kapsam değişirse çizimler yeniden okunur)"
            >
              <option value="unit">Tek birim</option>
              <option value="programme">Program (tüm varyantlar × adet)</option>
            </select>
            <button type="button" className="btn btn-sm est-generate" disabled={busy} title={`Yeni sürüm: ${RUN_HINT}`} onClick={onGenerate}>
              <i className={`fas ${r ? 'fa-rotate' : 'fa-wand-magic-sparkles'} me-1`} aria-hidden />
              {r ? 'Yenile' : 'Oluştur'}
            </button>
          </>
        ) : null}
        <button type="button" className="btn btn-sm btn-link est-help-link" onClick={onMethod}>
          <i className="fas fa-circle-question me-1" aria-hidden />
          Nasıl çalışır?
        </button>
      </div>
    </div>
  );
}

function MetaLine({ report: r, weldSchedule: ws }: { report: Report | null; weldSchedule: WeldSchedule | null }) {
  const sep = <span className="est-dot">·</span>;
  if (!r) {
    const totals = (ws?.totals ?? {}) as { joints_total?: number; weld_m_total?: number };
    return ws ? (
      <>
        Henüz rapor yok{sep}kaynak listesi v{ws.version} hazır ({fmt(totals.joints_total ?? 0, 0)} birleşim,{' '}
        {fmt(totals.weld_m_total, 1)} m)
      </>
    ) : (
      <>Henüz rapor yok</>
    );
  }
  const parts: ReactNode[] = [
    <span key="date">
      <i className="far fa-calendar" aria-hidden />
      {formatDateTime(r.created_at)}
      {r.created_by_name ? ` · ${r.created_by_name}` : ''}
    </span>,
  ];
  if (r.status === 'done') {
    const mins = runMinutes(r);
    if (mins != null)
      parts.push(
        <span key="mins" title="Çalışma süresi">
          <i className="far fa-clock" aria-hidden />
          {mins} dk
        </span>,
      );
    if (r.usage_usd != null)
      parts.push(
        <span key="usd" title="Model maliyeti">
          <i className="fas fa-dollar-sign" aria-hidden />
          {fmt(Number(r.usage_usd), 2)} USD
        </span>,
      );
    if (r.model)
      parts.push(
        <span key="model" title="Model">
          <i className="fas fa-microchip" aria-hidden />
          {r.model}
        </span>,
      );
    if (r.reviewed_by_name)
      parts.push(
        <span key="review">
          {REVIEW_LABELS[r.review_decision || '']?.label || 'İnceleme'}: {r.reviewed_by_name}
          {r.reviewed_at ? `, ${formatDateTime(r.reviewed_at)}` : ''}
        </span>,
      );
  }
  return (
    <>
      {parts.map((p, i) => (
        <span key={i} style={{ display: 'contents' }}>
          {i > 0 ? sep : null}
          {p}
        </span>
      ))}
    </>
  );
}

function VersionNotice({ report: r, onShow }: { report: Report | null; onShow: (id: number) => void }) {
  const latest = r?.versions?.at(-1);
  if (!r || !latest || latest.id === r.id) return null;
  return (
    <div className="est-notice">
      <i className="fas fa-clock-rotate-left" aria-hidden />
      <span>
        Eski sürüm görüntüleniyor (v{r.version}). En yeni: v{latest.version} · {ESTIMATE_STATUS[latest.status]?.label ?? latest.status}.
      </span>
      <button type="button" className="btn btn-sm btn-link p-0" onClick={() => onShow(latest.id)}>
        En yeniye geç
      </button>
    </div>
  );
}

/** The newest finished version other than the one shown. */
function previousDone(r: Report) {
  return (r.versions ?? []).filter((v) => v.status === 'done' && v.id !== r.id).at(-1) ?? null;
}

interface StateBlockProps {
  report: Report | null;
  fixedWithoutSubject: boolean;
  canCreate: boolean;
  busy: boolean;
  pollExpired: boolean;
  now: number;
  onGenerate: () => void;
  onShow: (id: number) => void;
  onRetry: () => void;
}

/** Everything above the sections when the report is not done (legacy bodyHtml). */
function StateBlock({ report: r, fixedWithoutSubject, canCreate, busy, pollExpired, now, onGenerate, onShow, onRetry }: StateBlockProps) {
  if (!r) {
    if (fixedWithoutSubject) return <div className="est-state">Rapor bulunamadı.</div>;
    return (
      <div className="est-empty">
        <div className="est-empty-icon">
          <i className="fas fa-wand-magic-sparkles" aria-hidden />
        </div>
        <div className="est-empty-title">Henüz tahmin yok</div>
        <ol className="est-empty-steps">
          <li>
            Çizimlerden <strong>kaynak listesi</strong> çıkarılır (birleşimler, metreler, ağırlık).
          </li>
          <li>
            Benzer işlerin kayıtlı saatleriyle <strong>saat kalibre</strong> edilir.
          </li>
          <li>
            <strong>İç imalat / taşeron</strong> maliyet tablosu, teklif önerisi, dikkat noktaları ve istenecekler yazılır.
          </li>
        </ol>
        <div className="est-muted small mb-2">{RUN_HINT}</div>
        {canCreate ? (
          <button type="button" className="btn est-generate" disabled={busy} onClick={onGenerate}>
            <i className="fas fa-wand-magic-sparkles me-1" aria-hidden />
            Oluştur
          </button>
        ) : null}
      </div>
    );
  }
  const prev = r.status === 'done' ? null : previousDone(r);
  const prevLink = prev ? (
    <>
      Önceki hazır sürüm:{' '}
      <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={() => onShow(prev.id)}>
        v{prev.version} raporunu aç
      </button>
    </>
  ) : null;
  if (isOpen(r.status)) {
    return (
      <div className="est-state est-state-running">
        <i className="fas fa-spinner fa-spin est-state-spinner" aria-hidden />
        <div className="est-state-main">
          <div className="est-state-title">
            {r.status === 'queued' ? 'Sırada bekliyor' : `Çalışıyor${elapsed(r.started_at, now)}`}
          </div>
          <div>
            {r.status === 'queued'
              ? 'Çalıştırma sıraya alındı, birazdan başlar.'
              : 'Çizimler okunuyor, kaynak listesi çıkarılıyor ve rapor yazılıyor.'}{' '}
            {r.inputs?.weld_schedule_version ? '' : 'İlk çalıştırmada kaynak listesi çıkarımı da yapılır.'}
          </div>
          <Progress report={r} now={now} />
          <div className="est-muted small">
            Genelde 6–15 dakika sürer. Bu sekme kendini günceller; pencereyi kapatabilirsiniz, çalıştırma sunucuda sürer.
          </div>
          {pollExpired ? (
            <div className="mt-2">
              <span className="est-muted small">Otomatik güncelleme durdu.</span>{' '}
              <button type="button" className="btn btn-link btn-sm p-0" onClick={onRetry}>
                Durumu kontrol et
              </button>
            </div>
          ) : null}
          {prevLink ? <div className="mt-2 small">{prevLink}</div> : null}
        </div>
      </div>
    );
  }
  if (r.status === 'failed') {
    const full = String(r.error || '').trim();
    const stopped = full.startsWith(CANCELLED_PREFIX);
    const first = firstLine(full);
    return (
      <div className="est-state est-state-failed">
        <i className={`fas ${stopped ? 'fa-circle-stop' : 'fa-triangle-exclamation'} est-state-icon`} aria-hidden />
        <div className="est-state-main">
          <div className="est-state-title">{stopped ? 'Çalıştırma durduruldu' : 'Çalıştırma başarısız'}</div>
          <div>{first || 'Hata metni yok.'}</div>
          {full.length > first.length ? (
            <details className="est-more">
              <summary>Hata ayrıntısı</summary>
              <pre className="est-pre">{full}</pre>
            </details>
          ) : null}
          <div className="est-muted small mt-1">
            {canCreate ? 'Yenile ile yeni bir sürüm başlatılabilir. ' : ''}
            {prevLink}
          </div>
        </div>
      </div>
    );
  }
  return null;
}

/** Step list + determinate bar of a running report with `progress`; else the indeterminate bar. */
function Progress({ report: r, now }: { report: Report; now: number }) {
  const pm = r.status === 'running' ? progressModel(r.progress, now) : null;
  if (!pm) {
    return (
      <div className="est-progress" aria-hidden>
        <span />
      </div>
    );
  }
  const icons = { done: 'fa-check', current: 'fa-circle-notch fa-spin', pending: 'fa-circle' };
  const pct = Math.round(pm.fraction * 100);
  return (
    <div className="est-prog">
      <ol className="est-steps">
        {pm.steps.map((st) => (
          <li key={st.key} className={`est-step is-${st.state}`}>
            <i className={`${st.state === 'pending' ? 'far' : 'fas'} ${icons[st.state]}`} aria-hidden />
            <span>
              {st.label}
              {st.detail ? <span className="est-step-detail">· {st.detail}</span> : null}
            </span>
          </li>
        ))}
      </ol>
      <div
        className="est-progress is-determinate"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <span style={{ width: `${(pm.fraction * 100).toFixed(1)}%` }} />
      </div>
      <div className="est-prog-meta">
        <span className="est-prog-pct">%{pct}</span>
        <span className="est-prog-left">{remainingLabel(pm)}</span>
      </div>
    </div>
  );
}

interface ReviewBlockProps {
  report: Report;
  open: boolean;
  note: string;
  busy: boolean;
  onNote: (note: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

function ReviewBlock({ report: r, open, note, busy, onNote, onSubmit, onCancel }: ReviewBlockProps) {
  if (open) {
    return (
      <form
        className={`est-review is-form ${css.reviewForm}`}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label className="est-review-title" htmlFor={`est-note-${r.id}`}>
          <i className="fas fa-pen" aria-hidden />
          Düzeltme notu
        </label>
        <textarea
          className="form-control"
          rows={3}
          id={`est-note-${r.id}`}
          placeholder="Nerede, neden düzeltme gerekiyor? (ör. bakır fiyatı güncel değil)"
          required
          value={note}
          onChange={(event) => onNote(event.currentTarget.value)}
          autoFocus
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button type="submit" className="btn btn-sm est-generate" disabled={busy}>
            <i className="fas fa-save me-1" aria-hidden />
            Kaydet
          </button>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onCancel}>
            Vazgeç
          </button>
        </div>
      </form>
    );
  }
  if (r.review_decision === 'correct' && r.review_note) {
    return (
      <div className="est-review">
        <div className="est-review-title">
          <i className="fas fa-pen" aria-hidden />
          Düzeltme notu
          {r.reviewed_by_name ? (
            <span className="est-muted fw-normal">
              {' '}
              · {r.reviewed_by_name}
              {r.reviewed_at ? `, ${formatDateTime(r.reviewed_at)}` : ''}
            </span>
          ) : null}
        </div>
        <div className="est-review-text">{r.review_note}</div>
      </div>
    );
  }
  return null;
}

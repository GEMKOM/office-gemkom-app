import { StatusBadge } from '@/ui';
import s from './MeetingView.module.css';
import { headerSummary } from './sheetBridge';
import type { MeetingItem, PlanSheet } from './types';

// Placeholders for the two parts of the slide the plan-sheet port builds:
// the hero (job no, title, customer, the date chain, İlerleme) and the plan
// sheet grid. The deck renders them through these two components only, so
// the real ones drop in here.

export interface HeroSlotProps {
  /** The portfolio row on this slide. */
  item: MeetingItem;
  /** The job's plan sheet; undefined until it has loaded (show "…" then). */
  sheet: PlanSheet | undefined;
}

/**
 * Legacy meetingHeroHtml: theme = headerSummary(sheet).theme (grey without
 * a sheet); the status chip (Revizyonda / status_display unless active); the
 * date chain from sheet.job_order.created_at ?? item.created_date, termin,
 * plan_end, projected_end and the *_wd distances (pending: item.forecast.
 * target_completion_date only); İlerleme = item.completion_percentage.
 */
export function HeroSlot({ item, sheet }: HeroSlotProps) {
  const summary = headerSummary(sheet ?? null);
  const pct = Math.round(Number(item.completion_percentage) || 0);
  const statusChip =
    item.status === 'on_hold' && item.hold_kind === 'revision' ? (
      <StatusBadge color="orange">Revizyonda</StatusBadge>
    ) : item.status && item.status !== 'active' ? (
      <StatusBadge color="grey">{item.status_display || item.status}</StatusBadge>
    ) : null;
  return (
    <div className={s.heroSlot} data-theme={sheet ? summary.theme : 'grey'} data-testid="meeting-hero">
      <div>
        <div className={s.heroJobNo}>
          {item.job_no}
          {statusChip}
        </div>
        <div className={s.heroTitle} title={item.title ?? ''}>
          {item.title ?? ''}
        </div>
        {item.customer_name ? <div className={s.heroCustomer}>{item.customer_name}</div> : null}
      </div>
      <div className={s.heroLines}>
        {sheet ? (
          <>
            <p>{summary.planLine}</p>
            <p>{summary.terminLine}</p>
          </>
        ) : (
          <p>…</p>
        )}
      </div>
      <div className={s.heroProgress}>İlerleme %{pct}</div>
    </div>
  );
}

export interface SheetSlotProps {
  jobNo: string;
  /** The plan sheet; the deck renders SheetSlot only for a sheet with rows. */
  sheet: PlanSheet;
  /** A refetch is in flight (the sheet on screen may be up to 60 s old). */
  loading: boolean;
  /** 'day' | 'week' | 'month' (SHEET_ZOOMS); the deck's zoom buttons set it. */
  zoom: string;
  /** Collapsed group keys; kept across slides and read by the share dialog. */
  collapsed: ReadonlySet<string>;
  onCollapsedChange: (collapsed: Set<string>) => void;
}

/**
 * Legacy renderPlanSheet('pp-sheet-grid', sheet, sheetState): the read-only
 * PlanningGrid. Its scroll box must keep the class `pg-scroll` (the deck's
 * wheel handler leaves the wheel to it when it can scroll, and on Ctrl+wheel).
 */
export function SheetSlot({ jobNo, sheet, loading }: SheetSlotProps) {
  return (
    <div className={s.sheetSlot} data-testid="meeting-sheet" aria-busy={loading || undefined}>
      <strong>Plan tablosu</strong>
      <span>
        {jobNo} · {sheet.rows?.length ?? 0} satır
      </span>
    </div>
  );
}

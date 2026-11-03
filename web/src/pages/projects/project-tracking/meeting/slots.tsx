import { HeroChain, headerSummary, PlanSheetHero, SheetGrid, type ZoomUnit } from '@/features/plan-sheet';
import { StatusBadge } from '@/ui';
import s from './MeetingView.module.css';
import type { MeetingItem, PlanSheet } from './types';

// The two parts of the slide that come from the plan sheet module: the hero
// (legacy meetingHeroHtml) and the sheet grid (renderPlanSheet).

export interface HeroSlotProps {
  /** The portfolio row on this slide. */
  item: MeetingItem;
  /** The job's plan sheet; undefined until it has loaded. */
  sheet: PlanSheet | undefined;
}

/**
 * Job no, title and customer beside the date chain; the theme is the plan
 * verdict. Before the sheet arrives the portfolio row already knows the
 * termin, and the rest of the chain shows "…".
 */
export function HeroSlot({ item, sheet }: HeroSlotProps) {
  const theme = sheet ? headerSummary(sheet).theme : 'grey';
  const created = sheet?.job_order?.created_at ?? (item.created_date as string | null | undefined) ?? null;
  const pct = Math.round(Number(item.completion_percentage) || 0);
  const badge =
    item.status === 'on_hold' && item.hold_kind === 'revision' ? (
      <StatusBadge color="orange">Revizyonda</StatusBadge>
    ) : item.status && item.status !== 'active' ? (
      <StatusBadge color="grey">{item.status_display || item.status}</StatusBadge>
    ) : null;
  const chain = sheet ? (
    <HeroChain
      start={created}
      termin={sheet.termin}
      planEnd={sheet.plan_end}
      projectedEnd={sheet.projected_end}
      planVsTerminWd={sheet.plan_vs_termin_wd}
      deviationWd={sheet.deviation_wd}
      terminGapWd={sheet.termin_gap_wd}
    />
  ) : (
    <HeroChain start={created} termin={item.forecast?.target_completion_date ?? null} pending />
  );
  return (
    <div data-testid="meeting-hero">
      <PlanSheetHero
        jobNo={item.job_no}
        title={item.title ?? ''}
        customer={item.customer_name}
        badge={badge}
        theme={theme}
        chain={chain}
        progress={
          <span className={s.heroProgress} data-theme={theme}>
            <span>İlerleme</span>
            <span className={s.heroProgressBar}>
              <span className={s.heroProgressFill} style={{ width: `${Math.min(pct, 100)}%` }} />
            </span>
            <span className={s.heroProgressPct}>%{pct}</span>
          </span>
        }
      />
    </div>
  );
}

export interface SheetSlotProps {
  sheet: PlanSheet;
  /** A refetch is in flight (the sheet on screen may be up to 60 s old). */
  loading: boolean;
  zoom: ZoomUnit;
  onZoomChange: (zoom: ZoomUnit) => void;
  /** Folded job rows, kept across slides and read by the share dialog. */
  collapsed: ReadonlySet<string>;
  onCollapsedChange: (collapsed: Set<string>) => void;
}

/** The read-only sheet; its scroller carries data-sheet-scroll for the deck's wheel. */
export function SheetSlot({ sheet, loading, zoom, onZoomChange, collapsed, onCollapsedChange }: SheetSlotProps) {
  return (
    <div className={s.sheetSlot} data-testid="meeting-sheet" aria-busy={loading || undefined}>
      <SheetGrid
        sheet={sheet}
        zoom={zoom}
        onZoomChange={onZoomChange}
        collapsed={collapsed}
        onCollapsedChange={onCollapsedChange}
        className={s.sheetGrid}
      />
    </div>
  );
}

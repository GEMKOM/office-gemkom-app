import type { ReactNode } from 'react';
import { formatDateLong, signedWd, type SignedWd } from './heroFigures';
import { tr } from './sheetLang';
import type { SheetTheme } from './planSheetText';
import classes from './PlanSheet.module.css';

export interface HeroChainProps {
  /** Job order opened (ISO). */
  start?: string | null;
  /** The commitment (ISO). */
  termin?: string | null;
  /** The plan's end (ISO). */
  planEnd?: string | null;
  /** The plan plus today's deviations (ISO). */
  projectedEnd?: string | null;
  /** Plan end vs termin, working days. */
  planVsTerminWd?: number | null;
  /** Projected end vs plan end, working days. */
  deviationWd?: number | null;
  /** Projected end vs termin, working days. */
  terminGapWd?: number | null;
  /** The sheet is still loading: missing values show "…" instead of "—". */
  pending?: boolean;
}

type FigureKey = 'start' | 'termin' | 'plan' | 'proj';

function Figure({
  name,
  label,
  iso,
  pending,
  state,
  title,
}: {
  name: FigureKey;
  label: string;
  iso: string | null | undefined;
  pending: boolean;
  state: SignedWd | null;
  title?: string;
}) {
  return (
    <div className={classes.cf} data-fig={name} data-state={state?.kind} title={title}>
      <label>{label}</label>
      <span className={classes.cfValue}>
        {iso ? formatDateLong(iso) : pending ? <span className={classes.figMuted}>…</span> : '—'}
      </span>
    </div>
  );
}

// The connector between two figures: a line with an arrowhead and, when
// there is something to compare, the signed distance in a pill on it.
function Connector({ index, state }: { index: 1 | 2 | 3; state: SignedWd | null }) {
  return (
    <div className={classes.ck} data-ck={index} data-state={state?.kind ?? 'none'}>
      {state && <span>{state.text}</span>}
    </div>
  );
}

/**
 * The hero's date chain: Başlangıç → Termin → Plan bitişi → Öngörülen in one
 * fixed row. Each working-day difference is written once, on the connector
 * between the two dates it compares, and the termin-to-öngörülen total sits on
 * a bracket above. The columns never reorder, so an arrow means "compared
 * with", not "later than". Missing data hides the pill (and the bracket) but
 * keeps the column, with "—" as the value.
 */
export function HeroChain({
  start = null,
  termin = null,
  planEnd = null,
  projectedEnd = null,
  planVsTerminWd = null,
  deviationWd = null,
  terminGapWd = null,
  pending = false,
}: HeroChainProps) {
  const planVs = signedWd(planVsTerminWd);
  const dev = signedWd(deviationWd);
  const gap = signedWd(terminGapWd);
  return (
    <div className={classes.chain}>
      {gap && (
        <div className={classes.brk} data-state={gap.kind}>
          <span>
            {tr('Termine göre', 'Against due date')} <b>{gap.text}</b>
          </span>
        </div>
      )}
      <Figure
        name="start"
        label={tr('Başlangıç', 'Start')}
        iso={start}
        pending={pending}
        state={null}
        // When the ORDER was opened, not when the plan starts: worth saying
        // beside a job with no plan.
        title={tr('İş emrinin açıldığı tarih', 'When the order was opened')}
      />
      <Connector index={1} state={null} />
      <Figure name="termin" label={tr('Termin', 'Due date')} iso={termin} pending={pending} state={null} />
      <Connector index={2} state={planVs} />
      <Figure name="plan" label={tr('Plan bitişi', 'Plan end')} iso={planEnd} pending={pending} state={planVs} />
      <Connector index={3} state={dev} />
      <Figure name="proj" label={tr('Öngörülen', 'Projected')} iso={projectedEnd} pending={pending} state={dev} />
      <div className={classes.chainBase} />
    </div>
  );
}

export interface PlanSheetHeroProps {
  jobNo?: string | null;
  title?: string | null;
  customer?: string | null;
  /** After the job number, e.g. the meeting slide's status chip. */
  badge?: ReactNode;
  /** The left border's colour (headerSummary(sheet).theme). */
  theme: SheetTheme;
  /** The date chain (usually <HeroChain>). */
  chain: ReactNode;
  /** A row under both (the meeting slide's progress bar); without it the id
   *  and the chain share the height. */
  progress?: ReactNode;
  className?: string;
}

/** The hero card: job number, name and customer beside the date chain. */
export function PlanSheetHero({ jobNo, title, customer, badge, theme, chain, progress, className }: PlanSheetHeroProps) {
  return (
    <div
      className={[classes.hero, className].filter(Boolean).join(' ')}
      data-tone={theme}
      data-progress={progress ? 'true' : undefined}
    >
      <div className={classes.heroId}>
        <div className={classes.heroJobno}>
          {jobNo || ''}
          {badge}
        </div>
        <div className={classes.heroTitle} title={title || ''}>
          {title || ''}
        </div>
        {customer && <div className={classes.heroCustomer}>{customer}</div>}
      </div>
      {chain}
      {progress && <div className={classes.heroProgress}>{progress}</div>}
    </div>
  );
}

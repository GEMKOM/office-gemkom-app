import { summaryChips } from './planSheetText';
import { tr } from './sheetLang';
import type { SheetSummary } from './types';
import classes from './PlanSheet.module.css';

/** What the sheet's colours and lines mean. */
export function SheetLegend({ className }: { className?: string }) {
  return (
    <span className={[classes.legend, className].filter(Boolean).join(' ')}>
      <span>
        <i data-lg="ontime" />
        plan
      </span>
      <span>
        <i data-lg="late" />
        {tr('geride', 'behind')}
      </span>
      <span>
        <i data-lg="ext" />
        {tr('öngörülen uzama', 'projected overrun')}
      </span>
      <span>
        <i data-lg="termin" />
        {tr('termin', 'due date')}
      </span>
      <span>
        <i data-lg="today" />
        {tr('bugün', 'today')}
      </span>
    </span>
  );
}

/** The summary's chips (late, own, chain, default duration, no plan). */
export function SheetSummaryChips({ summary }: { summary: SheetSummary | null | undefined }) {
  return (
    <>
      {summaryChips(summary).map((chip) => (
        <span key={chip.text} className={classes.chip} data-chip={chip.cls} title={chip.title || undefined}>
          {chip.text}
        </span>
      ))}
    </>
  );
}

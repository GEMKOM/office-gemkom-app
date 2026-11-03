import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import classes from './PaperForm.module.css';

// A record drawn as a printed GEMKOM form: logo header with a meta table,
// numbered sections of bordered cells, signature boxes. The NCR report was
// the first; Yazdır prints only the form (and saves it as a PDF).

/** The module's classes, for content laid out inside a form (mono, sub, empty, noPrint). */
export { classes as paperClasses };

export interface PaperMetaRow {
  label: string;
  value: ReactNode;
  mono?: boolean;
}

export interface PaperFormProps {
  /** The red line above the title, e.g. 'GEMKOM · Kalite Kontrol'. */
  org: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** The bordered table at the header's right. */
  meta?: PaperMetaRow[];
  /** A strip under the header, e.g. the next workflow step. */
  banner?: ReactNode;
  /** A small line at the bottom of the form. */
  footer?: ReactNode;
  children: ReactNode;
}

export function PaperForm({
  org,
  title,
  subtitle,
  meta,
  banner,
  footer,
  children,
}: PaperFormProps) {
  return (
    <div className={classes.form}>
      <header className={classes.head}>
        <div className={classes.brand}>
          <img src="/images/gemkom.png" alt="GEMKOM" className={classes.logo} />
          <div>
            <div className={classes.org}>{org}</div>
            <h2 className={classes.title}>{title}</h2>
            {subtitle ? <div className={classes.subtitle}>{subtitle}</div> : null}
          </div>
        </div>
        {meta?.length ? (
          <table className={classes.meta}>
            <tbody>
              {meta.map((row) => (
                <tr key={row.label}>
                  <th>{row.label}</th>
                  <td className={row.mono ? classes.mono : undefined}>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </header>
      {banner ? <div className={classes.banner}>{banner}</div> : null}
      {children}
      {footer ? <div className={classes.foot}>{footer}</div> : null}
    </div>
  );
}

export function PaperSectionNumber({ children }: { children: ReactNode }) {
  return <span className={classes.num}>{children}</span>;
}

export function PaperSection({
  number,
  title,
  children,
}: {
  number: ReactNode;
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={classes.section}>
      <h3 className={classes.sectionTitle}>
        <PaperSectionNumber>{number}</PaperSectionNumber>
        {title}
      </h3>
      {children}
    </section>
  );
}

const cols = (columns: number) => ({ '--paper-cols': columns }) as CSSProperties;

/** Bordered cells; a cell's `span` counts these columns. One column on phones. */
export function PaperGrid({ columns = 4, children }: { columns?: number; children: ReactNode }) {
  return (
    <div className={classes.grid} style={cols(columns)}>
      {children}
    </div>
  );
}

export function PaperCell({
  label,
  span = 1,
  empty = false,
  children,
}: {
  label: ReactNode;
  span?: number;
  /** Greys the value out, for '—' placeholders. */
  empty?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={classes.cell} style={{ gridColumn: `span ${span}` }}>
      <div className={classes.label}>{label}</div>
      <div className={`${classes.value} ${empty ? classes.empty : ''}`}>{children}</div>
    </div>
  );
}

/** A cell of plain text; blank values show `emptyText`. */
export function PaperTextCell({
  label,
  value,
  span,
  emptyText = '—',
}: {
  label: ReactNode;
  value: unknown;
  span?: number;
  emptyText?: string;
}) {
  const text = value === null || value === undefined ? '' : String(value).trim();
  return (
    <PaperCell label={label} span={span} empty={!text}>
      {text || emptyText}
    </PaperCell>
  );
}

/** A section's free text, `emptyText` in italics while blank. */
export function PaperNarrative({
  value,
  emptyText,
}: {
  value: string | null | undefined;
  emptyText: string;
}) {
  const text = (value || '').trim();
  return (
    <div className={`${classes.narrative} ${text ? '' : classes.empty}`}>{text || emptyText}</div>
  );
}

export interface PaperChoice {
  value: string;
  label: string;
}

/** A choice list drawn as form check boxes, the selected one ticked. */
export function PaperChecks({
  choices,
  selected,
}: {
  choices: readonly PaperChoice[];
  selected: string | null | undefined;
}) {
  return (
    <div className={classes.checks}>
      {choices.map((choice) => {
        const on = choice.value === selected;
        return (
          <span key={choice.value} className={classes.check} data-checked={on || undefined}>
            <span className={classes.box}>
              {on ? <i className="fas fa-check" aria-hidden /> : null}
            </span>
            {choice.label}
          </span>
        );
      })}
    </div>
  );
}

/** A row of signature boxes. */
export function PaperSignatures({
  columns = 3,
  children,
}: {
  columns?: number;
  children: ReactNode;
}) {
  return (
    <div className={classes.signs} style={cols(columns)}>
      {children}
    </div>
  );
}

export function PaperSignature({
  role,
  name,
  date,
  note,
  children,
}: {
  role: ReactNode;
  name?: string | null;
  date?: string;
  /** A muted line under the date. */
  note?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={classes.sign}>
      <div className={classes.label}>{role}</div>
      <div className={`${classes.signName} ${name ? '' : classes.empty}`}>{name || '—'}</div>
      <div className={classes.signDate}>{date || ' '}</div>
      {note ? <div className={classes.signNote}>{note}</div> : null}
      {children}
    </div>
  );
}

/** A quoted comment under a signature. */
export function PaperSignComment({ children }: { children: ReactNode }) {
  return <div className={classes.signComment}>“{children}”</div>;
}

/** A small heading inside a section, above a table. */
export function PaperSubhead({ children }: { children: ReactNode }) {
  return <div className={classes.subhead}>{children}</div>;
}

/** A ruled table; pass thead and tbody. Scrolls sideways on narrow screens. */
export function PaperTable({ children }: { children: ReactNode }) {
  return (
    <div className={classes.tableWrap}>
      <table className={classes.table}>{children}</table>
    </div>
  );
}

export interface PaperTimelineStep {
  title: ReactNode;
  /** Who, or a short note, under the title. */
  detail?: ReactNode;
  /** The step's time, already formatted. */
  at?: ReactNode;
  /** Not reached yet: a hollow dot, muted title. */
  pending?: boolean;
}

/** Steps top to bottom, each with its time at the right. */
export function PaperTimeline({ steps }: { steps: PaperTimelineStep[] }) {
  return (
    <ol className={classes.timeline}>
      {steps.map((step, index) => (
        <li key={index} className={classes.step} data-pending={step.pending || undefined}>
          <span className={classes.dot} aria-hidden />
          <div>
            <div className={classes.stepTitle}>{step.title}</div>
            {step.detail ? <div className={classes.stepDetail}>{step.detail}</div> : null}
          </div>
          <div className={classes.stepAt}>{step.at}</div>
        </li>
      ))}
    </ol>
  );
}

/** Padding for lists inside a section (attachments). */
export function PaperBlock({ children }: { children: ReactNode }) {
  return <div className={classes.files}>{children}</div>;
}

/** The page-coloured surround of a form shown in a modal. */
export function PaperBackdrop({ children }: { children: ReactNode }) {
  return <div className={classes.backdrop}>{children}</div>;
}

/**
 * Prints only the form. While `printing`, render the form inside
 * <PaperPrintCopy>; everything else on the page is hidden from the print.
 * `documentTitle` is the browser's suggested file name for "Save as PDF".
 */
export function usePaperPrint(documentTitle?: string) {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    if (!printing) return;
    const previousTitle = document.title;
    const done = () => {
      document.body.classList.remove('paper-printing');
      document.title = previousTitle;
      setPrinting(false);
    };
    document.body.classList.add('paper-printing');
    if (documentTitle) document.title = documentTitle;
    window.addEventListener('afterprint', done, { once: true });
    window.print();
    return () => {
      window.removeEventListener('afterprint', done);
      document.body.classList.remove('paper-printing');
      document.title = previousTitle;
    };
  }, [printing, documentTitle]);
  return { printing, print: () => setPrinting(true) };
}

/** The print copy: a top-level copy of the form, shown only on paper. */
export function PaperPrintCopy({ children }: { children: ReactNode }) {
  return createPortal(<div className={classes.printRoot}>{children}</div>, document.body);
}

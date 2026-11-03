/**
 * What each column of the sheet shows (the formatters of
 * projects/project-tracking/planSheet.js). Sentences come from
 * planSheetText.ts.
 */
import type { ReactNode } from 'react';
import { FaIcon } from '@/ui/FaIcon';
import { StatusBadge } from '@/ui/StatusBadge';
import {
  causeSentence,
  deviationChip,
  fmtDateTr,
  isDefaultDuration,
  planSourceLabel,
  progressText,
  type DeviationSource,
} from './planSheetText';
import { pct, tr } from './sheetLang';
import { overrideFieldOf, STATUS_META, type SheetField, type SheetGridRow } from './sheetRows';
import type { SheetTaskRow } from './types';
import classes from './SheetGrid.module.css';

const ROLE_ICONS: Record<string, string> = {
  design: 'fas fa-pen-ruler',
  procurement: 'fas fa-cart-shopping',
  cnc: 'fas fa-scissors',
  machining: 'fas fa-gears',
  welding: 'fas fa-fire',
  painting: 'fas fa-fill-drip',
  mfg: 'fas fa-industry',
  block: 'fas fa-users',
  stage: 'fas fa-list-check',
};
const DEPT_ICONS: Record<string, string> = {
  design: 'fas fa-pen-ruler',
  planning: 'fas fa-clipboard-list',
  procurement: 'fas fa-cart-shopping',
  manufacturing: 'fas fa-industry',
  painting: 'fas fa-fill-drip',
  logistics: 'fas fa-truck',
};

function iconFor(row: SheetTaskRow): string {
  if (row.kind === 'block' || row.kind === 'stage') return ROLE_ICONS[row.kind]!;
  return (row.role && ROLE_ICONS[row.role]) || (row.department && DEPT_ICONS[row.department]) || 'fas fa-circle';
}

const Dash = () => <span className={classes.muted}>—</span>;

export function StatusCell({ status }: { status: string | null | undefined }) {
  const meta = status ? STATUS_META[status] : undefined;
  const label = meta ? tr(meta.label, meta.labelEn) : status || '—';
  return <StatusBadge color={meta?.family ?? 'grey'}>{label}</StatusBadge>;
}

function TitleCell({ row, onToggle }: { row: SheetGridRow; onToggle: () => void }) {
  if (row.kind === 'group') {
    return (
      <>
        <button
          type="button"
          className={classes.toggle}
          aria-expanded={!row.collapsed}
          aria-label={row.collapsed ? tr('Aç', 'Expand') : tr('Kapat', 'Collapse')}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          <FaIcon icon={row.collapsed ? 'fas fa-chevron-right' : 'fas fa-chevron-down'} />
        </button>
        <span className={classes.title} title={row.job_title || ''}>
          <strong>{row.title}</strong>
          <span className={classes.sub}>{row.job_title || ''}</span>
          {!!row.late_count && (
            <span className={classes.blockCount}>
              {row.late_count} {tr('geride', 'behind')}
            </span>
          )}
        </span>
      </>
    );
  }
  return (
    <span className={classes.title}>
      {row.row && <FaIcon icon={iconFor(row.row)} className={classes.ico} />}
      {row.title}
      {isDefaultDuration(row.row) && (
        <span
          className={classes.defaultMark}
          title={tr(
            'Bu görev için süre girilmemiş; departman varsayılanı kullanıldı',
            'No duration entered for this task; the department default was used',
          )}
        >
          {tr('varsayılan süre', 'default duration')}
        </span>
      )}
    </span>
  );
}

function DateCell({ value, row, field }: { value: string | null | undefined; row: SheetGridRow; field: SheetField }) {
  if (!value) return <Dash />;
  const tip =
    row.kind === 'task'
      ? planSourceLabel(row.row)
      : field === 'plan_end'
        ? tr('planın son görevinin bitişi', "the plan's last task end")
        : tr('planın ilk görevinin başlangıcı', "the plan's first task start");
  const isDefault = row.kind === 'task' && isDefaultDuration(row.row);
  return (
    <span className={classes.date} data-default={isDefault || undefined} title={tip}>
      {fmtDateTr(value)}
    </span>
  );
}

function ProjectedCell({ value, row }: { value: string | null | undefined; row: SheetGridRow }) {
  if (!value) return <Dash />;
  const dev = Number(row.deviation || 0);
  return (
    <span className={classes.date} data-proj={dev > 0 ? 'late' : dev < 0 ? 'early' : undefined}>
      {fmtDateTr(value)}
    </span>
  );
}

function Chip({ source }: { source: DeviationSource }) {
  const chip = deviationChip(source);
  if (!chip.text) return <Dash />;
  return (
    <span className={classes.chip} data-chip={chip.cls}>
      {chip.text}
    </span>
  );
}

function DeviationCell({ row }: { row: SheetGridRow }) {
  const source: DeviationSource =
    row.kind === 'group' || !row.row
      ? { deviation_wd: row.deviation, own_deviation_wd: row.deviation, chain_deviation_wd: 0, dead: false }
      : row.row;
  return <Chip source={source} />;
}

const clamp = (value: unknown) => Math.max(0, Math.min(100, Math.round(Number(value || 0))));

function ProgressBar({
  value,
  expected,
  text,
  title,
}: {
  value: number;
  expected?: number | null;
  text: string;
  title?: string;
}) {
  const behind = expected != null && expected > value;
  return (
    <span className={classes.progress} data-behind={behind || undefined} title={title}>
      <span className={classes.progressTrack}>
        {expected != null && <span className={classes.progressExpected} style={{ width: `${expected}%` }} />}
        <span className={classes.progressFill} style={{ width: `${value}%` }} />
      </span>
      <span className={classes.progressText}>{text}</span>
    </span>
  );
}

function ProgressCell({ row }: { row: SheetGridRow }) {
  // A dead row's bar is empty for the same reason its text is an em-dash:
  // the work was not done (see progressText).
  const task = row.kind === 'task' ? row.row : undefined;
  const value = task?.dead ? 0 : clamp(row.progress);
  const text = task ? progressText(task) : pct(value);
  const expected = task && task.expected_pct != null ? clamp(task.expected_pct) : null;
  return (
    <ProgressBar
      value={value}
      expected={expected}
      text={text}
      title={
        task
          ? tr('gerçekleşen / plana göre bugün beklenen', 'actual / expected today by the plan')
          : tr('iş emri ilerlemesi', 'job progress')
      }
    />
  );
}

function CauseCell({ row }: { row: SheetGridRow }) {
  const text = row.kind === 'group' || !row.row ? row.cause : causeSentence(row.row);
  if (!text) return <Dash />;
  return (
    <span className={classes.cause} title={text}>
      {text}
    </span>
  );
}

function PlanWdCell({ value }: { value: number | null | undefined }) {
  if (value == null) return <Dash />;
  return <>{Number(value).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}</>;
}

/** The computed cell. */
function ComputedCell({ field, row, onToggle }: { field: SheetField; row: SheetGridRow; onToggle: () => void }) {
  switch (field) {
    case 'title':
      return <TitleCell row={row} onToggle={onToggle} />;
    case 'plan_start':
    case 'plan_end':
      return <DateCell value={row[field]} row={row} field={field} />;
    case 'plan_wd':
      return <PlanWdCell value={row.plan_wd} />;
    case 'progress':
      return <ProgressCell row={row} />;
    case 'status':
      return <StatusCell status={row.status} />;
    case 'deviation':
      return <DeviationCell row={row} />;
    case 'projected_end':
      return <ProjectedCell value={row.projected_end} row={row} />;
    case 'cause':
      return <CauseCell row={row} />;
  }
}

// The computed formatters read task rows' payload (row.row) for their
// sentences and chips; an edited value has to win over that.
function editedNode(field: SheetField, row: SheetGridRow): ReactNode | null {
  if (field === 'deviation') {
    return <Chip source={{ deviation_wd: row.deviation, own_deviation_wd: row.deviation, chain_deviation_wd: 0 }} />;
  }
  if (field === 'progress') {
    const value = clamp(row.progress);
    return <ProgressBar value={value} text={pct(value)} />;
  }
  if (field === 'cause') {
    // Cleared on purpose: blank, not the "—" of a row with no reason.
    return (
      <span className={classes.cause} title={row.cause || ''}>
        {row.cause || ''}
      </span>
    );
  }
  return null;
}

/** A cell's content, with an editable link's mark when this link changed it. */
export function SheetCellContent({
  field,
  row,
  onToggle,
}: {
  field: SheetField;
  row: SheetGridRow;
  onToggle: () => void;
}) {
  const edited = !!row.edited?.has(overrideFieldOf(row, field));
  const content = (edited && editedNode(field, row)) || <ComputedCell field={field} row={row} onToggle={onToggle} />;
  if (!edited) return content;
  return (
    <>
      {content}
      <span className={classes.editDot} title="Bu bağlantıda değiştirildi" />
    </>
  );
}

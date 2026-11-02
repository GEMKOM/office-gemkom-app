import type { ReactNode } from 'react';
import type { MonthlyReportFact } from '@/api/subcontracting/subcontractors';
import { StatusBadge } from '@/ui';
import {
  ADJUSTMENT_KALEM,
  ancestorLevels,
  ancestorValue,
  CHILD_NOUN,
  currencySymbol,
  formatNumber,
  hasRows,
  headcountScope,
  JOB_STATUS,
  kalemName,
  monthlyPerPerson,
  nodeTotal,
  num,
  periodLabel,
  singleCurrency,
  STATEMENT_STATUS,
  type Agg,
  type Backlog,
  type Level,
  type Lookup,
  type PerPerson,
  type TreeNode,
} from './overviewTree';
import classes from './Overview.module.css';

// The cells of overview.js (kgCell, moneyCell, ...), as React nodes.

const Muted = ({ title }: { title?: string }) => (
  <span className={classes.muted} title={title}>
    —
  </span>
);

export function kgCell(kg: number | null | undefined, allowEmpty = false): ReactNode {
  if (kg === null || kg === undefined) return allowEmpty ? null : <Muted />;
  if (!kg) return <Muted />;
  return (
    <>
      {formatNumber(kg, 0)} <span className={classes.unit}>kg</span>
    </>
  );
}

/** Welding kg, with painted kg on a line of its own when the node has both. */
export function workKgCell(agg: Agg): ReactNode {
  const weldKg = agg.kg - agg.paintKg;
  if (!weldKg || !agg.paintKg) return kgCell(agg.kg);
  return (
    <>
      {kgCell(weldKg)}
      <div className={classes.sub}>+ {formatNumber(agg.paintKg, 0)} kg boya</div>
    </>
  );
}

export function unitPriceCell(amount: number, kg: number, currency: string | null): ReactNode {
  if (!kg) return <Muted />;
  return (
    <>
      {formatNumber(amount / kg, 2)}{' '}
      <span className={classes.unit}>{currencySymbol(currency)}/kg</span>
    </>
  );
}

/** Average price per kg — of the welding alone when the node mixes in paint. */
export function workUnitPriceCell(agg: Agg, currency: string | null): ReactNode {
  const work = agg.billed + agg.pending;
  const weldKg = agg.kg - agg.paintKg;
  if (!weldKg || !agg.paintKg) return unitPriceCell(work, agg.kg, currency);
  return (
    <>
      {unitPriceCell(work - agg.paintAmount, weldKg, currency)}
      <div className={classes.sub}>boya hariç</div>
    </>
  );
}

export function moneyCell(
  value: number | null | undefined,
  currency: string | null,
  tone: 'pending' | null = null,
  signed = false,
): ReactNode {
  if (value === null || value === undefined) return null;
  if (!value) return <Muted />;
  const cls = [
    tone ? classes.pending : null,
    signed ? (value < 0 ? classes.neg : classes.pos) : null,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <>
      <span className={cls || undefined}>
        {signed && value > 0 ? '+' : ''}
        {formatNumber(value, 2)} {currencySymbol(currency)}
      </span>
      {currency === null ? (
        <i
          className={`fas fa-circle-exclamation ${classes.mixed}`}
          title="Farklı para birimleri toplandı"
          aria-label="Farklı para birimleri toplandı"
        />
      ) : null}
    </>
  );
}

export function backlogProgressCell(backlog: Backlog | null): ReactNode {
  if (!backlog || !backlog.allocated) return null;
  const pct = Math.max(0, Math.min(100, (backlog.done / backlog.allocated) * 100));
  const title = `Sözleşme: ${formatNumber(backlog.allocated, 0)} kg · Yapılan: ${formatNumber(backlog.done, 0)} kg`;
  return (
    <div className={classes.progressWrap} title={title}>
      <div className={classes.progress}>
        <span style={{ width: `${pct.toFixed(1)}%` }} />
      </div>
      <span className={classes.progressText}>%{formatNumber(pct, 0)}</span>
    </div>
  );
}

export function leafProgressCell(fact: MonthlyReportFact): ReactNode {
  if (
    fact.previous_progress === null ||
    fact.previous_progress === undefined ||
    fact.current_progress === null ||
    fact.current_progress === undefined
  )
    return null;
  return (
    <span
      className={classes.progressDelta}
      title={`Sözleşme: ${formatNumber(num(fact.allocated_weight_kg), 0)} kg`}
    >
      %{formatNumber(num(fact.previous_progress), 1)}
      <i className="fas fa-arrow-right" aria-hidden /> %
      {formatNumber(num(fact.current_progress), 1)}
    </span>
  );
}

/** `showMonths` is off for Genel Toplam, where months would count subcontractor-months. */
export function perPersonSummary(
  pp: PerPerson,
  currency: string | null,
  showMonths: boolean,
): ReactNode {
  const skippedText = pp.skipped ? `${pp.skipped} ay çalışan sayısı girilmediği için hariç` : '';
  if (pp.value === null) return <Muted title={skippedText || 'Çalışan sayısı girilmemiş'} />;
  const symbol = currencySymbol(currency);
  let title = `Aylık ortalama: ${formatNumber(pp.total, 2)} ${symbol} ÷ ${formatNumber(pp.personMonths, 0)} kişi-ay`;
  if (skippedText) title += ` — ${skippedText}`;
  return (
    <>
      <span title={title}>
        {formatNumber(pp.value, 2)} {symbol}
      </span>
      <div className={classes.sub}>
        aylık ort.
        {showMonths ? ` · ${pp.months} ay` : ''}
        {pp.skipped ? (
          <>
            {' · '}
            <span className={classes.pending}>{pp.skipped} ay hariç</span>
          </>
        ) : null}
      </div>
    </>
  );
}

export function employeeCell(lookup: Lookup, node: TreeNode): ReactNode {
  const scope = headcountScope(node);
  if (scope === 'sub') {
    const sub = lookup.subs.get(node.value);
    if (sub?.avg_employee_count === null || sub?.avg_employee_count === undefined) {
      return <Muted title="Dönemdeki hakedişlerde çalışan sayısı girilmemiş" />;
    }
    return (
      <span title={`${sub.employee_count_months} hakediş ortalaması`}>
        {formatNumber(sub.avg_employee_count, 1)}
      </span>
    );
  }
  if (scope === 'month') {
    const count = lookup.statements.get(`${node.parent!.value}|${node.value}`)?.employee_count;
    return count === null || count === undefined ? <Muted /> : formatNumber(count, 0);
  }
  return null;
}

export function perPersonCell(lookup: Lookup, node: TreeNode, currency: string | null): ReactNode {
  const scope = headcountScope(node);
  if (scope === 'sub') {
    return perPersonSummary(monthlyPerPerson(lookup, new Set([node.value])), currency, true);
  }
  if (scope === 'month') {
    const count = num(lookup.statements.get(`${node.parent!.value}|${node.value}`)?.employee_count);
    const total = nodeTotal(node);
    if (!(count > 0) || !total) return <Muted title="Çalışan sayısı girilmemiş" />;
    const symbol = currencySymbol(currency);
    return (
      <span title={`${formatNumber(total, 2)} ${symbol} ÷ ${formatNumber(count, 0)} çalışan`}>
        {formatNumber(total / count, 2)} {symbol}
      </span>
    );
  }
  return null;
}

function childCountChip(node: TreeNode): ReactNode {
  if (node.sorted.length) {
    return (
      <span className={classes.chip}>
        {node.sorted.length} {CHILD_NOUN[node.sorted[0]!.level as Level]}
      </span>
    );
  }
  if (node.leaves.length) {
    const jobs = new Set(node.leaves.map((f) => f.job_no)).size;
    return <span className={classes.chip}>{jobs} iş emri</span>;
  }
  return null;
}

export function groupLabel(lookup: Lookup, node: TreeNode): ReactNode {
  const count = childCountChip(node);
  // A node with nothing under it shows no toggle (see Overview.module.css).
  const leafless = hasRows(node) ? undefined : '';

  if (node.level === 'sub') {
    const sub = lookup.subs.get(node.value);
    const display = sub?.short_name || sub?.name || '-';
    return (
      <span data-leafless={leafless}>
        <span className={classes.name}>
          <i className={`fas fa-building ${classes.icon}`} aria-hidden />
          {display}
        </span>
        {sub?.is_active === false ? (
          <span className={classes.badge}>
            <StatusBadge color="grey">Pasif</StatusBadge>
          </span>
        ) : null}
        {count}
        {sub?.short_name && sub.name && sub.short_name !== sub.name ? (
          <div className={classes.sub}>{sub.name}</div>
        ) : null}
      </span>
    );
  }

  if (node.level === 'kalem') {
    const icon = node.value === ADJUSTMENT_KALEM ? 'fa-scale-balanced' : 'fa-layer-group';
    return (
      <span data-leafless={leafless}>
        <span className={classes.name}>
          <i className={`fas ${icon} ${classes.icon}`} aria-hidden />
          {kalemName(lookup, node.value)}
        </span>
        {count}
      </span>
    );
  }

  // Month: the subcontractor's hakediş for that month, when there is one.
  const subId = ancestorValue(node, 'sub');
  const statement = subId ? lookup.statements.get(`${subId}|${node.value}`) : undefined;
  let badge: ReactNode = null;
  if (statement) {
    const meta = STATEMENT_STATUS[statement.status] ?? {
      label: statement.status,
      color: 'grey' as const,
    };
    badge = (
      <a
        className={`${classes.statementLink} ${classes.badge}`}
        href={`/manufacturing/subcontracting/statements/?statement=${statement.id}`}
        target="_blank"
        rel="noopener"
        title="Hakedişi aç"
        // Statement links open on their own; the row does not toggle.
        onClick={(event) => event.stopPropagation()}
      >
        <StatusBadge color={meta.color}>{meta.label}</StatusBadge>{' '}
        <i className="fas fa-arrow-up-right-from-square" aria-hidden />
      </a>
    );
  } else if (subId && node.agg.pending > 0) {
    badge = (
      <span className={classes.badge} title="Bu ay için hakediş henüz oluşturulmadı">
        <StatusBadge color="orange">Hakediş yok</StatusBadge>
      </span>
    );
  }
  return (
    <span data-leafless={leafless}>
      <span className={classes.name}>
        <i className={`far fa-calendar ${classes.icon}`} aria-hidden />
        {periodLabel(node.value)}
      </span>
      {badge}
      {count}
    </span>
  );
}

/** The cells of a group row (legacy renderGroupRow), keyed by column. */
export function groupCells(lookup: Lookup, node: TreeNode): Record<string, ReactNode> {
  const isMonth = node.level === 'month';
  const currency = singleCurrency(node.agg.currencies);
  return {
    label: groupLabel(lookup, node),
    employees: employeeCell(lookup, node),
    progress: isMonth ? null : backlogProgressCell(node.backlog),
    kg: workKgCell(node.agg),
    unit: workUnitPriceCell(node.agg, currency),
    billed: moneyCell(node.agg.billed, currency),
    pending: moneyCell(node.agg.pending, currency, 'pending'),
    adjustment: moneyCell(node.agg.adjustment, currency, null, true),
    total: <strong>{moneyCell(nodeTotal(node), currency)}</strong>,
    perPerson: perPersonCell(lookup, node, currency),
    remainingKg: isMonth ? null : kgCell(node.backlog?.remainingKg, true),
    remainingAmount: isMonth
      ? null
      : moneyCell(node.backlog?.remainingAmount, singleCurrency(node.backlog?.currencies)),
  };
}

/** The label of a job-order row (legacy renderLeafRow). */
export function leafLabel(lookup: Lookup, fact: MonthlyReportFact, parent: TreeNode): ReactNode {
  const isAdj = fact.kind === 'adjustment';
  const showKalem = !ancestorLevels(parent).has('kalem') && !isAdj;
  let kindBadge: ReactNode = null;
  if (fact.kind === 'pending') kindBadge = <StatusBadge color="orange">Bekleyen</StatusBadge>;
  else if (isAdj)
    kindBadge =
      fact.adjustment_type === 'deduction' ? (
        <StatusBadge color="red">Kesinti</StatusBadge>
      ) : (
        <StatusBadge color="green">Ek Ödeme</StatusBadge>
      );
  const meta = [fact.customer_name, JOB_STATUS[fact.job_status ?? '']].filter(Boolean).join(' · ');
  return (
    <div>
      <span className={classes.job}>{fact.job_no}</span>
      <span>{fact.job_title || ''}</span>
      {showKalem ? (
        <span className={classes.kalemPill}>{kalemName(lookup, fact.kalem_key)}</span>
      ) : null}
      {kindBadge ? <span className={classes.badge}>{kindBadge}</span> : null}
      {meta ? <div className={classes.sub}>{meta}</div> : null}
      {isAdj && fact.reason ? <div className={classes.reason}>{fact.reason}</div> : null}
    </div>
  );
}

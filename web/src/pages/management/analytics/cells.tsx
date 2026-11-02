import { Loader, Progress, Text, Tooltip } from '@mantine/core';
import type { ReactNode } from 'react';
import type { CostTableRow } from '@/api/projects/cost';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format';
import { AppLink } from '@/shell/AppLink';
import { FaIcon } from '@/ui';
import {
  DERIVED_PRICE_META,
  describeDerivedPrice,
  marginTone,
  num,
  numOrNull,
  type MarginTone,
  type TreeRow,
} from './analyticsData';
import classes from './analytics.module.css';

export const Dash = () => (
  <Text span c="dimmed">
    -
  </Text>
);

/** "€1.234,56"; '-' for null or ''. */
export function Money({ value, bold = false }: { value: unknown; bold?: boolean }) {
  const n = numOrNull(value);
  if (n === null) return <Dash />;
  return (
    <span className={classes.money} style={bold ? { fontWeight: 700 } : undefined}>
      {formatCurrency(n, 'EUR', 2)}
    </span>
  );
}

export const euro = (value: number) => formatCurrency(value, 'EUR', 2);

/** A round icon chip; the word is a tooltip and stays in the markup for screen readers. */
function IconChip({
  icon,
  family,
  tooltip,
  label,
}: {
  icon: string;
  family: string;
  tooltip: string;
  label: string;
}) {
  return (
    <Tooltip label={tooltip} withArrow>
      <span className={classes.iconChip} data-family={family} aria-label={tooltip}>
        <FaIcon icon={icon} />
        <span className={classes.srOnly}>{label}</span>
      </span>
    </Tooltip>
  );
}

export const STATUS_META: Record<string, { icon: string; family: string; label: string }> = {
  draft: { icon: 'fas fa-pencil-alt', family: 'grey', label: 'Taslak' },
  active: { icon: 'fas fa-play', family: 'green', label: 'Aktif' },
  on_hold: { icon: 'fas fa-pause', family: 'orange', label: 'Beklemede' },
  completed: { icon: 'fas fa-check', family: 'blue', label: 'Tamamlandı' },
  cancelled: { icon: 'fas fa-times', family: 'red', label: 'İptal Edildi' },
};

export function StatusChip({ status }: { status: string | null | undefined }) {
  if (!status) return <Dash />;
  const meta = STATUS_META[status];
  if (!meta)
    return (
      <IconChip icon="fas fa-question" family="grey" tooltip={`Durum: ${status}`} label={status} />
    );
  return (
    <IconChip
      icon={meta.icon}
      family={meta.family}
      tooltip={`Durum: ${meta.label}`}
      label={meta.label}
    />
  );
}

export function ManufacturedChip({ value }: { value: boolean | null | undefined }) {
  if (value === true)
    return (
      <IconChip
        icon="fas fa-industry"
        family="green"
        tooltip="İmalat: Bizde (atölyede imal ediliyor)"
        label="Bizde"
      />
    );
  if (value === false)
    return (
      <IconChip
        icon="fas fa-external-link-alt"
        family="purple"
        tooltip="İmalat: Harici (atölyede imalat yok)"
        label="Harici"
      />
    );
  return <Dash />;
}

/** The job's catalog item(s): its own, or its children's (from_children). */
export function CatalogCell({ row }: { row: CostTableRow }) {
  const list = Array.isArray(row.catalog_nodes) ? row.catalog_nodes : [];
  if (!list.length) return <Dash />;
  const fromChildren = row.catalog_nodes_from_children === true;
  const tip = (
    <div style={{ whiteSpace: 'pre-line' }}>
      {(fromChildren ? 'Alt iş emirlerinin kalemleri:\n' : '') +
        list.map((n) => n.path || n.title).join('\n')}
    </div>
  );
  return (
    <Tooltip label={tip} multiline maw={360} withArrow>
      <span className={classes.catalog} data-children={fromChildren || undefined}>
        <span className={classes.catalogTitle}>
          {fromChildren ? <FaIcon icon="fas fa-sitemap" style={{ marginRight: 4 }} /> : null}
          {list[0]!.title}
        </span>
        {list.length > 1 ? <span className={classes.more}>+{list.length - 1}</span> : null}
      </span>
    </Tooltip>
  );
}

const MARGIN_META: Record<MarginTone, { family: string; icon: string; label: string }> = {
  green: { family: 'green', icon: 'fas fa-circle-check', label: '15% üstü' },
  amber: { family: 'yellow', icon: 'fas fa-triangle-exclamation', label: '5–15%' },
  red: { family: 'red', icon: 'fas fa-circle-exclamation', label: '5% altı' },
  none: { family: 'yellow', icon: 'fas fa-minus', label: 'Satış fiyatı yok' },
};

/** Marj % chip: the band shows by icon as well as colour (> 15 / 5–15 / < 5). */
export function MarginChip({
  marginPct,
  sellingPrice,
}: {
  marginPct: unknown;
  sellingPrice: unknown;
}) {
  const tone = marginTone(marginPct, sellingPrice);
  if (tone === null) return <Dash />;
  const meta = MARGIN_META[tone];
  return (
    <span className={classes.pill} data-family={meta.family} title={meta.label}>
      <FaIcon icon={meta.icon} />
      {tone === 'none' ? '—' : formatPercent(num(marginPct), 1)}
    </span>
  );
}

export function CompletionBar({ value }: { value: unknown }) {
  const n = numOrNull(value);
  const safe = n === null ? 0 : Math.max(0, Math.min(100, n));
  return (
    <span className={classes.completion}>
      <Progress value={safe} size="sm" radius="xl" color="gemkom" style={{ flex: 1 }} aria-hidden />
      <Text span size="xs" c="dimmed" miw={40} ta="right">
        {formatPercent(safe, 0)}
      </Text>
    </span>
  );
}

/** Satış Fiyatı: a derived EUR price reads as computed (≈, italic); else the entered price. */
export function SellingPriceCell({ row }: { row: CostTableRow }) {
  if (row.selling_price_is_derived) {
    const source = row.selling_price_display_source ?? '';
    const meta = DERIVED_PRICE_META[source];
    if (!meta) return <Dash />;
    return (
      <Tooltip
        label={describeDerivedPrice(source, row.selling_price_derived_basis)}
        multiline
        maw={320}
        withArrow
      >
        <span className={classes.derived} data-derived-price={source}>
          <FaIcon icon={meta.icon} style={{ marginRight: 4, fontSize: 11 }} />≈
          {formatCurrency(num(row.selling_price_display), 'EUR', 2)}
        </span>
      </Tooltip>
    );
  }
  const value = numOrNull(row.selling_price);
  if (value === null) return <Dash />;
  const currency = row.selling_price_currency || 'EUR';
  return (
    <span className={classes.money}>
      {formatCurrency(value, currency, 2)}
      {currency !== 'EUR' ? (
        <Text span size="xs" c="dimmed" ml={4}>
          {currency}
        </Text>
      ) : null}
    </span>
  );
}

/** The job number, linking to project tracking; children are greyed. */
export function JobNoCell({ row }: { row: TreeRow }) {
  if (!row.job_no) return <>-</>;
  return (
    <AppLink
      to={`/projects/project-tracking/?job_no=${encodeURIComponent(row.job_no)}`}
      className={classes.jobNo}
      data-child={row.hierarchy_level > 0 || undefined}
    >
      {row.job_no}
    </AppLink>
  );
}

export interface ExpandCellProps {
  row: TreeRow;
  expanded: boolean;
  loading: boolean;
  hasChildren: boolean;
  onToggle: (jobNo: string) => void;
}

/** The tree column: indentation, a guide line for children, and +/− for rows with children. */
export function ExpandCell({ row, expanded, loading, hasChildren, onToggle }: ExpandCellProps) {
  const level = row.hierarchy_level;
  return (
    <span className={classes.tree} style={{ paddingLeft: level * 20 }}>
      {level > 0 ? (
        <span className={classes.treeGuide} style={{ left: (level - 1) * 20 + 9 }} aria-hidden />
      ) : null}
      {hasChildren ? (
        <button
          type="button"
          className={classes.expand}
          aria-expanded={expanded}
          aria-label={`${row.job_no} ${expanded ? 'daralt' : 'genişlet'}`}
          title={expanded ? 'Daralt' : 'Genişlet'}
          onClick={(event) => {
            event.stopPropagation();
            onToggle(row.job_no);
          }}
        >
          {loading ? (
            <Loader size={10} color="currentColor" />
          ) : (
            <FaIcon icon={expanded ? 'fas fa-minus' : 'fas fa-plus'} />
          )}
        </button>
      ) : null}
    </span>
  );
}

/** A money cell with the small (i) that opens a drill-down. */
export function MoneyWithInfo({
  value,
  bold,
  title,
  onInfo,
}: {
  value: unknown;
  bold?: boolean;
  title: string;
  onInfo?: () => void;
}) {
  return (
    <span className={classes.money}>
      <Money value={value} bold={bold} />
      {onInfo ? (
        <button
          type="button"
          className={classes.infoButton}
          title={title}
          aria-label={title}
          onClick={(event) => {
            event.stopPropagation();
            onInfo();
          }}
        >
          <FaIcon icon="fas fa-info-circle" />
        </button>
      ) : null}
    </span>
  );
}

/** Fark (Gerçek − Tahmini): over the estimate is bad (red, up), under is good (green, down). */
export function CostDiff({ value }: { value: number }) {
  if (!Number.isFinite(value)) return <Dash />;
  const family = value > 0 ? 'red' : value < 0 ? 'green' : 'grey';
  const icon = value > 0 ? 'fas fa-arrow-up' : value < 0 ? 'fas fa-arrow-down' : 'fas fa-minus';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return (
    <span className={classes.pill} data-family={family}>
      <FaIcon icon={icon} />
      <span className={classes.srOnly}>
        {value > 0 ? 'tahminin üstünde' : value < 0 ? 'tahminin altında' : 'fark yok'}{' '}
      </span>
      {sign}
      {formatCurrency(Math.abs(value), 'EUR', 2)}
    </span>
  );
}

export const kgText = (value: unknown, decimals = 2) => {
  const n = numOrNull(value);
  return n === null ? null : formatNumber(n, decimals);
};

export function OrDash({ children }: { children: ReactNode }) {
  return children === null || children === undefined || children === '' ? (
    <Dash />
  ) : (
    <>{children}</>
  );
}

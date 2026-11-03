import { Text, Tooltip } from '@mantine/core';
import type { CostTableRow } from '@/api/projects/cost';
import { formatCurrency, formatDate, formatNumber, formatPercent } from '@/lib/format';
import {
  DERIVED_PRICE_META,
  describeDerivedPrice,
  laborWithTax,
  num,
  numOrNull,
  paintWithMaterial,
  type TreeRow,
} from '@/pages/management/analytics/analyticsData';
import {
  Dash,
  ExpandCell,
  JobNoCell,
  Money,
  MoneyWithInfo,
} from '@/pages/management/analytics/cells';
import { FaIcon, StatusBadge, type DataTableColumn } from '@/ui';
import { rateText, STATUS_FAMILY, statusLabel } from './costTableData';
import classes from './CostTable.module.css';

export type DrillKind = 'job' | 'machining' | 'welding' | 'material' | 'subcontractor';

export interface ColumnContext {
  expanded: ReadonlySet<string>;
  loadingChildren: ReadonlySet<string>;
  /** Rows whose loaded children list is non-empty (legacy also showed + for those). */
  withChildren: ReadonlySet<string>;
  onToggle: (jobNo: string) => void;
  onDrill: (kind: DrillKind, jobNo: string) => void;
}

const MONEY = '#,##0.00 "€"';
const PRICE_ERROR = 'Geçerli bir satış fiyatı girin.';

/** Satış Fiyatı when not editing: the entered price, and the derived one beside it. */
function SellingPriceCell({ row }: { row: CostTableRow }) {
  const value = numOrNull(row.selling_price);
  const currency = row.selling_price_currency || 'EUR';
  const source = row.selling_price_display_source ?? '';
  const derived = row.selling_price_is_derived ? DERIVED_PRICE_META[source] : undefined;
  return (
    <span className={classes.price}>
      {value === null ? (
        <span className={classes.placeholder}>Fiyat</span>
      ) : (
        <span className={classes.money}>
          {formatCurrency(value, 'EUR', 2)}
          {currency !== 'EUR' ? (
            <Text span size="xs" c="dimmed" ml={4}>
              {currency}
            </Text>
          ) : null}
        </span>
      )}
      {derived ? (
        // A representative price for rows without one of their own. It is
        // shown beside the value, never as it: the editor opens with the
        // entered price only, so a stray save cannot store the computed one.
        <Tooltip
          label={describeDerivedPrice(source, row.selling_price_derived_basis)}
          multiline
          maw={320}
          withArrow
        >
          <span className={classes.derived} data-derived-price={source}>
            <FaIcon icon={derived.icon} style={{ marginRight: 4, fontSize: 11 }} />≈
            {formatCurrency(num(row.selling_price_display), 'EUR', 2)}
          </span>
        </Tooltip>
      ) : null}
    </span>
  );
}

/** The legacy cost table columns, in its order. Sort keys are the backend's ordering names. */
export function costColumns(ctx: ColumnContext): DataTableColumn<TreeRow>[] {
  const money = (key: keyof CostTableRow & string, header: string): DataTableColumn<TreeRow> => ({
    key,
    header,
    align: 'right',
    render: (row) => <Money value={row[key]} />,
    exportValue: (row) => numOrNull(row[key]),
    exportFormat: MONEY,
  });

  return [
    {
      key: '_expand',
      header: '',
      width: 80,
      exportHeader: 'Seviye',
      // 0 = a row of the table, 1+ = an expanded child.
      exportValue: (row) => row.hierarchy_level,
      render: (row) => (
        <ExpandCell
          row={row}
          expanded={ctx.expanded.has(row.job_no)}
          loading={ctx.loadingChildren.has(row.job_no)}
          hasChildren={row.has_children === true || ctx.withChildren.has(row.job_no)}
          onToggle={ctx.onToggle}
        />
      ),
    },
    {
      key: 'job_no',
      header: 'İş No',
      sortable: true,
      sortKey: 'job_no',
      width: 160,
      render: (row) => <JobNoCell row={row} />,
    },
    { key: 'title', header: 'Başlık', render: (row) => row.title || '-' },
    {
      key: 'customer_name',
      header: 'Müşteri',
      width: 220,
      accessor: (row) => row.customer_short_name || row.customer_name || null,
      render: (row) => {
        const name = row.customer_short_name || row.customer_name;
        return name ? <StatusBadge color="grey">{name}</StatusBadge> : '-';
      },
    },
    {
      key: 'status',
      header: 'Durum',
      exportValue: (row) => (row.status ? statusLabel(row.status) : null),
      render: (row) => (
        <StatusBadge color={STATUS_FAMILY[row.status ?? ''] ?? 'grey'}>
          {statusLabel(row.status)}
        </StatusBadge>
      ),
    },
    {
      key: 'is_manufactured',
      header: 'İmalat',
      width: 90,
      exportValue: (row) =>
        row.is_manufactured === true ? 'Bizde' : row.is_manufactured === false ? 'Harici' : null,
      render: (row) =>
        row.is_manufactured === true ? (
          <StatusBadge color="green">Bizde</StatusBadge>
        ) : row.is_manufactured === false ? (
          <StatusBadge color="yellow">Harici</StatusBadge>
        ) : (
          '-'
        ),
    },
    {
      key: 'labor_cost',
      header: 'İşçilik + Vergi',
      align: 'right',
      exportValue: (row) => laborWithTax(row),
      exportFormat: MONEY,
      render: (row) => {
        const total = laborWithTax(row);
        return (
          <MoneyWithInfo
            value={total}
            title="İşçilik Detaylarını Görüntüle"
            onInfo={total > 0 ? () => ctx.onDrill('job', row.job_no) : undefined}
          />
        );
      },
    },
    {
      key: 'material_cost',
      header: 'Malzeme',
      align: 'right',
      exportValue: (row) => numOrNull(row.material_cost),
      exportFormat: MONEY,
      render: (row) => (
        <MoneyWithInfo
          value={row.material_cost}
          title="Malzeme Detaylarını Görüntüle"
          onInfo={
            num(row.material_cost) > 0 ? () => ctx.onDrill('material', row.job_no) : undefined
          }
        />
      ),
    },
    {
      key: 'subcontractor_cost',
      header: 'Taşeron',
      align: 'right',
      exportValue: (row) => numOrNull(row.subcontractor_cost),
      exportFormat: MONEY,
      render: (row) => (
        <MoneyWithInfo
          value={row.subcontractor_cost}
          title="Taşeron Detaylarını Görüntüle"
          onInfo={
            num(row.subcontractor_cost) > 0
              ? () => ctx.onDrill('subcontractor', row.job_no)
              : undefined
          }
        />
      ),
    },
    {
      key: 'paint_cost',
      header: 'Boya + Boya Malzemesi',
      align: 'right',
      exportValue: (row) => paintWithMaterial(row),
      exportFormat: MONEY,
      render: (row) => <Money value={paintWithMaterial(row)} />,
    },
    money('qc_cost', 'KK'),
    money('shipping_cost', 'Sevkiyat'),
    money('machine_rental_cost', 'Makine Kirası'),
    {
      key: 'general_expenses_cost',
      header: 'Genel Giderler',
      align: 'right',
      exportValue: (row) => numOrNull(row.general_expenses_cost),
      exportFormat: MONEY,
      render: (row) => {
        const rate = rateText(row.general_expenses_rate);
        return (
          <span className={classes.money}>
            <Money value={row.general_expenses_cost} />
            {rate !== null ? (
              <Text span size="xs" c="dimmed" ml={4}>
                ({rate})
              </Text>
            ) : null}
          </span>
        );
      },
    },
    {
      key: 'total_weight_kg',
      header: 'Toplam Ağırlık (kg)',
      sortable: true,
      sortKey: 'weight',
      align: 'right',
      exportValue: (row) => numOrNull(row.total_weight_kg),
      render: (row) => {
        const n = numOrNull(row.total_weight_kg);
        return n === null ? <Dash /> : formatNumber(n, 2);
      },
    },
    {
      key: 'price_per_kg',
      header: 'Kg Maliyeti',
      sortable: true,
      sortKey: 'price_per_kg',
      align: 'right',
      exportValue: (row) => numOrNull(row.price_per_kg),
      exportFormat: MONEY,
      render: (row) => <Money value={row.price_per_kg} bold />,
    },
    {
      key: 'actual_total_cost',
      header: 'Toplam Maliyet',
      sortable: true,
      sortKey: 'actual_cost',
      align: 'right',
      exportValue: (row) => numOrNull(row.actual_total_cost),
      exportFormat: MONEY,
      render: (row) => <Money value={row.actual_total_cost} bold />,
    },
    {
      key: 'selling_price',
      header: 'Satış Fiyatı',
      sortable: true,
      sortKey: 'selling_price',
      align: 'right',
      width: 170,
      // Legacy export: the derived figure, marked, else the entered price.
      exportValue: (row) =>
        row.selling_price_is_derived
          ? `${String(row.selling_price_display ?? '')} (dağıtılmış)`
          : numOrNull(row.selling_price),
      render: (row) => <SellingPriceCell row={row} />,
      editable: {
        type: 'number',
        placeholder: 'Fiyat',
        value: (row) => numOrNull(row.selling_price),
        // Emptying a price is refused (legacy left it unchanged); an empty
        // cell left empty is no change at all.
        validate: (value, row) =>
          (value === null && numOrNull(row.selling_price) !== null) ||
          (typeof value === 'number' && value < 0)
            ? PRICE_ERROR
            : undefined,
        apply: (row, value) => ({
          ...row,
          selling_price: value,
          selling_price_currency: 'EUR',
        }),
      },
    },
    {
      key: 'selling_price_per_kg',
      header: 'Kg Fiyatı',
      align: 'right',
      exportValue: (row) => numOrNull(row.selling_price_per_kg),
      exportFormat: MONEY,
      render: (row) => <Money value={row.selling_price_per_kg} bold />,
    },
    {
      key: 'margin_eur',
      header: 'Marj (€)',
      sortable: true,
      sortKey: 'margin_eur',
      align: 'right',
      exportValue: (row) => numOrNull(row.margin_eur),
      exportFormat: MONEY,
      render: (row) => <Money value={row.margin_eur} />,
    },
    {
      key: 'margin_pct',
      header: 'Marj %',
      sortable: true,
      sortKey: 'margin_pct',
      align: 'right',
      exportValue: (row) => numOrNull(row.margin_pct),
      render: (row) => {
        const n = numOrNull(row.margin_pct);
        return n === null ? <Dash /> : formatPercent(n, 2);
      },
    },
    {
      key: 'last_updated',
      header: 'Tarih',
      width: 110,
      render: (row) => (row.last_updated ? formatDate(row.last_updated as string) : <Dash />),
    },
  ];
}

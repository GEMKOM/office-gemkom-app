import { Table, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import { formatDate, formatNumber, formatPercent } from '@/lib/format';
import type { DataTableColumn, DataTableFooterContext } from '@/ui';
import {
  costTotals,
  laborWithTax,
  marginBasePrice,
  num,
  numOrNull,
  paintWithMaterial,
  type TreeRow,
} from './analyticsData';
import {
  CatalogCell,
  CompletionBar,
  Dash,
  ExpandCell,
  JobNoCell,
  ManufacturedChip,
  MarginChip,
  Money,
  MoneyWithInfo,
  SellingPriceCell,
  STATUS_META,
  StatusChip,
  euro,
} from './cells';
import classes from './analytics.module.css';

export type DrillKind =
  'job' | 'machining' | 'welding' | 'material' | 'subcontractor' | 'estimated';

export interface ColumnContext {
  /** Show the cost-detail columns (İşçilik … Genel Giderler). */
  breakdown: boolean;
  expanded: ReadonlySet<string>;
  loadingChildren: ReadonlySet<string>;
  /** Rows whose loaded children list is non-empty (legacy also showed + for those). */
  withChildren: ReadonlySet<string>;
  onToggle: (jobNo: string) => void;
  onDrill: (kind: DrillKind, row: TreeRow) => void;
}

/** The cost-detail columns hidden behind the toggle (legacy DETAIL_FIELDS). */
export const DETAIL_KEYS = new Set([
  'labor_cost',
  'material_cost',
  'subcontractor_cost',
  'paint_cost',
  'qc_cost',
  'shipping_cost',
  'machine_rental_cost',
  'general_expenses_cost',
]);

const MONEY = '#,##0.00 "€"';

function rate(value: unknown) {
  const n = numOrNull(value);
  return n === null ? null : n;
}

export function costColumns(ctx: ColumnContext): DataTableColumn<TreeRow>[] {
  const money = (key: keyof TreeRow & string, header: string): DataTableColumn<TreeRow> => ({
    key,
    header,
    align: 'right',
    hidden: DETAIL_KEYS.has(key) && !ctx.breakdown,
    render: (row) => <Money value={row[key]} />,
    exportValue: (row) => numOrNull(row[key]),
    exportFormat: MONEY,
  });

  const columns: DataTableColumn<TreeRow>[] = [
    {
      key: '_expand',
      header: '',
      width: 80,
      exportHeader: 'Seviye',
      // 0 = a row of the table, 1+ = an expanded child (already in its parent's totals).
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
    { key: 'title', header: 'Başlık', sortable: true, sortKey: 'title' },
    {
      key: 'customer_name',
      header: 'Müşteri',
      width: 220,
      accessor: (row) => row.customer_short_name || row.customer_name || null,
      render: (row) => {
        const name = row.customer_short_name || row.customer_name;
        return name ? (
          <span className={classes.customer} title={row.customer_name ?? undefined}>
            {name}
          </span>
        ) : (
          '-'
        );
      },
    },
    {
      key: 'status',
      header: 'Durum',
      width: 64,
      align: 'center',
      exportValue: (row) => (row.status ? (STATUS_META[row.status]?.label ?? row.status) : null),
      render: (row) => <StatusChip status={row.status} />,
    },
    {
      key: 'is_manufactured',
      header: 'İmalat',
      width: 64,
      align: 'center',
      exportValue: (row) =>
        row.is_manufactured === true ? 'Bizde' : row.is_manufactured === false ? 'Harici' : null,
      render: (row) => <ManufacturedChip value={row.is_manufactured} />,
    },
    {
      key: 'catalog_nodes',
      header: 'Katalog Kalemi',
      width: 190,
      exportValue: (row) => (row.catalog_nodes ?? []).map((n) => n.title).join(', ') || null,
      render: (row) => <CatalogCell row={row} />,
    },
    {
      key: 'total_weight_kg',
      header: 'Ağırlık (kg)',
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
      key: 'labor_cost',
      header: 'İşçilik + Vergi',
      align: 'right',
      hidden: !ctx.breakdown,
      exportValue: (row) => laborWithTax(row),
      exportFormat: MONEY,
      render: (row) => {
        const total = laborWithTax(row);
        return (
          <MoneyWithInfo
            value={total}
            title="İşçilik Detayları"
            onInfo={total > 0 ? () => ctx.onDrill('job', row) : undefined}
          />
        );
      },
    },
    {
      key: 'material_cost',
      header: 'Malzeme',
      align: 'right',
      hidden: !ctx.breakdown,
      exportValue: (row) => numOrNull(row.material_cost),
      exportFormat: MONEY,
      render: (row) => (
        <MoneyWithInfo
          value={row.material_cost}
          title="Malzeme Detayları"
          onInfo={num(row.material_cost) > 0 ? () => ctx.onDrill('material', row) : undefined}
        />
      ),
    },
    {
      key: 'subcontractor_cost',
      header: 'Taşeron',
      align: 'right',
      hidden: !ctx.breakdown,
      exportValue: (row) => numOrNull(row.subcontractor_cost),
      exportFormat: MONEY,
      render: (row) => (
        <MoneyWithInfo
          value={row.subcontractor_cost}
          title="Taşeron Detayları"
          onInfo={
            num(row.subcontractor_cost) > 0 ? () => ctx.onDrill('subcontractor', row) : undefined
          }
        />
      ),
    },
    {
      key: 'paint_cost',
      header: 'Boya + Malzeme',
      align: 'right',
      hidden: !ctx.breakdown,
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
      hidden: !ctx.breakdown,
      exportValue: (row) => numOrNull(row.general_expenses_cost),
      exportFormat: MONEY,
      render: (row) => {
        const r = rate(row.general_expenses_rate);
        return (
          <span className={classes.money}>
            <Money value={row.general_expenses_cost} />
            {r !== null ? (
              <Text span size="xs" c="dimmed" ml={4}>
                ({String(r)})
              </Text>
            ) : null}
          </span>
        );
      },
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
      key: 'estimated_total_cost',
      header: 'Tahmini Maliyet',
      align: 'right',
      exportValue: (row) => numOrNull(row.estimated_total_cost),
      exportFormat: MONEY,
      render: (row) => (
        <MoneyWithInfo
          value={row.estimated_total_cost}
          bold
          title="Tahmini maliyet hesabı"
          onInfo={row.job_no ? () => ctx.onDrill('estimated', row) : undefined}
        />
      ),
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
      key: 'selling_price',
      header: 'Satış Fiyatı',
      sortable: true,
      sortKey: 'selling_price',
      align: 'right',
      // The figure the cell shows: the derived EUR price, else the entered one.
      exportValue: (row) =>
        numOrNull(row.selling_price_is_derived ? row.selling_price_display : row.selling_price),
      render: (row) => <SellingPriceCell row={row} />,
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
      render: (row) => (
        <MarginChip marginPct={row.margin_pct} sellingPrice={marginBasePrice(row)} />
      ),
    },
    {
      key: 'completion_pct',
      header: 'Tamamlanma',
      sortable: true,
      sortKey: 'completion_pct',
      width: 160,
      exportValue: (row) => numOrNull(row.completion_pct),
      render: (row) => <CompletionBar value={row.completion_pct} />,
    },
    {
      key: 'target_completion_date',
      header: 'Hedef tarih',
      sortable: true,
      sortKey: 'date',
      width: 120,
      render: (row) =>
        row.target_completion_date ? formatDate(row.target_completion_date) : <Dash />,
    },
  ];
  return columns;
}

/** Legacy buildFooter: totals of the top-level rows, weighted €/kg, the margin from the totals. */
export function costFooter(columns: DataTableColumn<TreeRow>[]) {
  return function CostFooter({ rows }: DataTableFooterContext<TreeRow>) {
    const t = costTotals(rows);
    const cells: Record<string, ReactNode> = {
      job_no: (
        <>
          Toplam / Ortalama
          <span className={classes.footNote}>{t.rows} satır</span>
        </>
      ),
      labor_cost: euro(t.laborWithTax),
      material_cost: euro(t.material),
      subcontractor_cost: euro(t.subcontractor),
      paint_cost: euro(t.paintWithMaterial),
      qc_cost: euro(t.qc),
      shipping_cost: euro(t.shipping),
      machine_rental_cost: euro(t.machineRental),
      general_expenses_cost: (
        <>
          {euro(t.generalExpenses)}
          {t.generalExpensesRateAvg !== null ? (
            <Text span size="xs" c="dimmed" ml={4} fw={400}>
              ({formatNumber(t.generalExpensesRateAvg, 2)})
            </Text>
          ) : null}
        </>
      ),
      total_weight_kg: formatNumber(t.weightKg, 2),
      price_per_kg: t.pricePerKg !== null ? euro(t.pricePerKg) : <Dash />,
      actual_total_cost: euro(t.actualTotalCost),
      estimated_total_cost: euro(t.estimatedTotalCost),
      selling_price: euro(t.sellingPrice),
      selling_price_per_kg: t.sellingPricePerKg !== null ? euro(t.sellingPricePerKg) : <Dash />,
      margin_eur: euro(t.marginEur),
      margin_pct: t.marginPct !== null ? formatPercent(t.marginPct, 2) : <Dash />,
    };
    return (
      <Table.Tr className={classes.footRow}>
        {columns
          .filter((c) => !c.hidden)
          .map((column) => (
            <Table.Td key={column.key} ta={column.align === 'right' ? 'right' : undefined}>
              {column.key in cells ? cells[column.key] : column.key === '_expand' ? null : <Dash />}
            </Table.Td>
          ))}
      </Table.Tr>
    );
  };
}

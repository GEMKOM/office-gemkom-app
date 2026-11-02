import { Badge, Group, Text } from '@mantine/core';
import type { LaborPricingLine } from '@/api/subcontracting/laborPricing';
import { toNumber } from '@/lib/format';
import { StatusBadge, type CellValue, type DataTableColumn, type RowGroup } from '@/ui';
import { eur, fmt } from './laborPricingFormat';
import classes from './LaborPricing.module.css';

const num = (field: keyof LaborPricingLine) => (row: LaborPricingLine) =>
  toNumber(row[field] as string | number | null);

/** Legacy numCell: tabular digits on screen, a plain number in the export. */
function numColumn(
  key: keyof LaborPricingLine & string,
  header: string,
  digits: number,
): DataTableColumn<LaborPricingLine> {
  return {
    key,
    header,
    sortable: true,
    align: 'right',
    accessor: num(key),
    render: (row) => <span className={classes.num}>{fmt(Number(row[key]), digits)}</span>,
    exportValue: num(key),
  };
}

/** Legacy marginBadge: no yellow anywhere in this app — orange carries the middle band. */
function MarginBadge({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <>—</>;
  const pct = Number(value);
  const color = pct < 15 ? 'red' : pct < 25 ? 'orange' : 'green';
  return <StatusBadge color={color}>%{fmt(pct, 1)}</StatusBadge>;
}

export function validateDifficulty(value: CellValue): string | true {
  const parsed = Number(value);
  if (value === null || !Number.isFinite(parsed) || parsed <= 0)
    return 'Zorluk sıfırdan büyük bir sayı olmalı';
  if (parsed > 5) return 'Zorluk en fazla 5 olabilir';
  return true;
}

export const laborPricingColumns: DataTableColumn<LaborPricingLine>[] = [
  { key: 'job_no', header: 'İş No', sortable: true },
  { key: 'title', header: 'Kalem', sortable: true },
  {
    key: 'quantity',
    header: 'Adet',
    sortable: true,
    align: 'right',
    accessor: num('quantity'),
    render: (row) => <span className={classes.num}>{String(row.quantity ?? '')}</span>,
  },
  numColumn('weight_kg', 'kg / adet', 1),
  numColumn('sell_per_kg', 'Satış €/kg', 2),
  numColumn('size_factor', 'Boyut (f)', 2),
  {
    key: 'difficulty',
    header: 'Zorluk',
    sortable: false,
    align: 'right',
    accessor: num('difficulty'),
    editable: { type: 'number', min: 0.1, max: 5, step: 0.05, validate: validateDifficulty },
    render: (row) => (
      <span className={classes.difficulty} title="Değiştirmek için tıklayın">
        {fmt(Number(row.difficulty), 2)}
      </span>
    ),
    exportValue: (row) => Number(row.difficulty).toFixed(2),
  },
  {
    key: 'labor_per_kg',
    header: 'İşçilik €/kg',
    sortable: true,
    align: 'right',
    accessor: num('labor_per_kg'),
    render: (row) => <span className={classes.rate}>{fmt(Number(row.labor_per_kg), 3)}</span>,
    exportValue: (row) => Number(row.labor_per_kg),
  },
  {
    key: 'labor_per_kg_try',
    header: 'İşçilik ₺/kg',
    sortable: true,
    align: 'right',
    accessor: num('labor_per_kg_try'),
    render: (row) =>
      row.labor_per_kg_try === null || row.labor_per_kg_try === undefined ? (
        '—'
      ) : (
        <span className={classes.rate}>{fmt(Number(row.labor_per_kg_try), 2)}</span>
      ),
    exportValue: (row) =>
      row.labor_per_kg_try === null || row.labor_per_kg_try === undefined
        ? ''
        : Number(row.labor_per_kg_try),
  },
  numColumn('labor_per_piece_eur', '€ / adet', 0),
  numColumn('labor_total_eur', 'Toplam €', 0),
  {
    key: 'line_margin_pct',
    header: 'Kâr',
    sortable: true,
    align: 'right',
    accessor: num('line_margin_pct'),
    render: (row) => <MarginBadge value={row.line_margin_pct} />,
    exportValue: (row) =>
      row.line_margin_pct === null || row.line_margin_pct === undefined
        ? ''
        : Number(row.line_margin_pct),
  },
];

/** Legacy groupHeaderFormatter: root job, its title and the group's kalem / kg / labor sums. */
export function rootGroupHeader(group: RowGroup<LaborPricingLine>) {
  const rows = group.rows;
  const title = rows[0]?.root_title || '';
  const kg = rows.reduce((sum, r) => sum + Number(r.total_weight_kg), 0);
  const cost = rows.reduce((sum, r) => sum + Number(r.labor_total_eur), 0);
  return (
    <Group gap="xs" wrap="wrap" component="span">
      <strong>{String(group.value ?? '')}</strong>
      <Text span c="dimmed" size="sm">
        {title}
      </Text>
      <Badge size="sm" color="gray">
        {rows.length} kalem
      </Badge>
      <Badge size="sm" variant="light" color="gray">
        {fmt(kg, 0)} kg
      </Badge>
      <Badge size="sm" variant="light" color="gray">
        {eur(cost)} işçilik
      </Badge>
    </Group>
  );
}

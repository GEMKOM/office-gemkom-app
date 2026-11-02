import { Alert, Button, Stack, Table } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { paymentForecastQueryOptions } from '@/api/procurement/reports';
import { revenueReportQueryOptions } from '@/api/sales/reports';
import {
  DataTable,
  FaIcon,
  FilterBar,
  PageHeader,
  Panel,
  useUrlFilters,
  type FilterConfig,
} from '@/ui';
import {
  BarsChart,
  DashCell,
  DashGrid,
  GRAPHITE,
  KpiGrid,
  KpiTile,
  STATUS,
  TrendChart,
  ACCENT,
  compactCurrency,
  valueFormats,
} from '@/ui/charts';
import {
  buildMergedRows,
  cashFlowKpis,
  enrichDbsRows,
  isPreset,
  monthShort,
  PRESET_OPTIONS,
  presetRange,
  undatedInflow,
  undatedOutflow,
  type CashFlowRow,
  type CashFlowTotals,
  type UndatedSummary,
} from './cashFlowData';
import { CashFlowDrilldown, type DrillMonth } from './CashFlowDrilldown';
import { dbsColumns, monthlyColumns } from './columns';
import { eur, NetAmount, signedPercent } from './money';
import classes from './cashFlow.module.css';

// The legacy page kept nothing in the URL; these are its filter ids, with the
// API names for the dates. A preset wins over the dates; picking a date clears it.
const URL_DEFAULTS = { preset: 'month', created_gte: '', created_lte: '' };

type FilterKeys = 'preset' | 'created_gte' | 'created_lte';
type FilterState = Record<FilterKeys, string>;

const filterConfig: FilterConfig<FilterKeys>[] = [
  { type: 'select', key: 'preset', label: 'Dönem', searchable: false, options: PRESET_OPTIONS },
  { type: 'date', key: 'created_gte', label: 'Başlangıç' },
  { type: 'date', key: 'created_lte', label: 'Bitiş' },
];

const EUR_FORMAT = valueFormats.currency('EUR', 2);
const eurAxis = (v: number) => compactCurrency(v, 'EUR');

function UndatedPanel({
  title,
  summary,
  unit,
  hint,
}: {
  title: string;
  summary: UndatedSummary;
  unit: string;
  hint: string;
}) {
  const warn = summary.amount > 0;
  return (
    <Panel title={title} icon={warn ? 'fas fa-triangle-exclamation' : 'fas fa-calendar-minus'}>
      <div className={classes.undated}>
        <p className={classes.undatedAmount}>
          {eur(summary.amount)}
          <small>
            {' '}
            / {summary.count} {unit}
          </small>
        </p>
        <p className={classes.hint}>{hint}</p>
      </div>
    </Panel>
  );
}

function MonthlyFooter({ totals }: { totals: CashFlowTotals }) {
  const right = { textAlign: 'right' } as const;
  return (
    <Table.Tr className={classes.footRow}>
      <Table.Td>Toplam</Table.Td>
      <Table.Td style={right}>
        <span className={classes.in}>{eur(totals.inflow)}</span>
      </Table.Td>
      <Table.Td style={right}>
        <span className={classes.out}>{eur(totals.outflow)}</span>
      </Table.Td>
      <Table.Td style={right}>
        <NetAmount value={totals.net} />
      </Table.Td>
      <Table.Td style={right}>
        <NetAmount value={totals.cumulative} />
      </Table.Td>
      <Table.Td style={right} className={classes.muted}>
        {eur(totals.paid)}
      </Table.Td>
      <Table.Td style={right} className={classes.muted}>
        {eur(totals.awaiting)}
      </Table.Td>
      <Table.Td style={right} className={classes.muted}>
        {totals.po_count}
      </Table.Td>
      <Table.Td style={right} className={classes.muted}>
        {totals.offer_count}
      </Table.Td>
      <Table.Td />
    </Table.Tr>
  );
}

function rowStyle(row: CashFlowRow) {
  if (row.netNegative) return { background: '#fde8e8' };
  if (row.crossesZero) return { background: '#fdf3d8' };
  return undefined;
}

/** Port of management/reports/cash-flow (cash-flow.js + cash-flow-drilldown.js). */
export function CashFlowReportPage() {
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const [today] = useState(() => new Date());
  const [drill, setDrill] = useState<DrillMonth | null>(null);

  const range = isPreset(values.preset)
    ? presetRange(values.preset, today)
    : { from: values.created_gte, to: values.created_lte };
  const shown: FilterState = {
    preset: values.preset,
    created_gte: range.from,
    created_lte: range.to,
  };
  const params = { created_gte: range.from, created_lte: range.to };

  const outQ = useQuery({
    ...paymentForecastQueryOptions(params),
    placeholderData: keepPreviousData,
  });
  const inQ = useQuery({ ...revenueReportQueryOptions(params), placeholderData: keepPreviousData });

  const pending = outQ.isPending || inQ.isPending;
  const outflow = outQ.isError ? null : (outQ.data ?? null);
  const inflow = inQ.isError ? null : (inQ.data ?? null);
  const bothFailed = outQ.isError && inQ.isError;

  const merged = useMemo(() => buildMergedRows(outflow, inflow), [outflow, inflow]);
  const kpis = useMemo(() => cashFlowKpis(outflow, inflow), [outflow, inflow]);
  const dbsRows = useMemo(() => enrichDbsRows(outflow?.dbs_summary?.suppliers), [outflow]);
  const dbsCols = useMemo(() => dbsColumns(today), [today]);
  const chartRows = useMemo(
    () => merged.rows.map((r) => ({ ...r, axis: monthShort(r.month) })),
    [merged.rows],
  );

  const warnings = [
    outQ.isError && !bothFailed
      ? 'Çıkış verisi kullanılamıyor — yalnızca giriş gösteriliyor.'
      : null,
    inQ.isError && !bothFailed
      ? 'Giriş verisi kullanılamıyor — yalnızca çıkış gösteriliyor.'
      : null,
  ].filter((w): w is string => Boolean(w));

  const onApply = (next: FilterState) => {
    if (next.preset !== shown.preset && isPreset(next.preset)) {
      apply({ preset: next.preset, created_gte: '', created_lte: '' });
    } else if (next.created_gte !== shown.created_gte || next.created_lte !== shown.created_lte) {
      apply({ preset: '', created_gte: next.created_gte, created_lte: next.created_lte });
    } else {
      // The preset pill was cleared: keep its dates.
      apply({ preset: '', created_gte: shown.created_gte, created_lte: shown.created_lte });
    }
  };

  const refresh = () => {
    void outQ.refetch();
    void inQ.refetch();
  };

  const figure = (text: string) => (pending ? '–' : bothFailed ? '—' : text);
  const openMonth = (row: CashFlowRow) => setDrill({ month: row.month, label: row.monthLabel });

  return (
    <>
      <PageHeader
        title="Nakit Akış Tablosu"
        subtitle="Satış girişleri ile satınalma çıkışlarının birleşik görünümü"
        icon="fas fa-money-bill-wave"
        backTo="/management/reports"
        // Short figures on the band; the tiles below carry the exact amounts.
        stats={[
          {
            id: 'kpi-in',
            label: 'Toplam Giriş',
            value: figure(compactCurrency(kpis.totalIn, 'EUR')),
          },
          {
            id: 'kpi-out',
            label: 'Toplam Çıkış',
            value: figure(compactCurrency(kpis.totalOut, 'EUR')),
          },
          {
            id: 'kpi-net',
            label: 'Net Pozisyon',
            value: (
              <span style={{ whiteSpace: 'nowrap' }}>
                {figure(
                  `${kpis.net > 0 ? '▲ +' : kpis.net < 0 ? '▼ −' : ''}${compactCurrency(Math.abs(kpis.net), 'EUR')}`,
                )}
              </span>
            ),
          },
        ]}
        actions={
          <Button
            variant="default"
            leftSection={<FaIcon icon="fas fa-sync-alt" />}
            onClick={refresh}
            loading={outQ.isFetching || inQ.isFetching}
          >
            Yenile
          </Button>
        }
      />

      <Stack gap="md">
        <Panel>
          <Stack gap="md">
            <FilterBar
              inline
              filters={filterConfig}
              values={shown}
              onApply={onApply}
              onClear={() => apply({ preset: 'month', created_gte: '', created_lte: '' })}
            />
            {bothFailed ? (
              <Alert color="red" icon={<FaIcon icon="fas fa-triangle-exclamation" />}>
                Nakit akış verisi yüklenemedi.
              </Alert>
            ) : warnings.length ? (
              <Alert color="yellow" icon={<FaIcon icon="fas fa-triangle-exclamation" />}>
                {warnings.map((w) => (
                  <div key={w}>{w}</div>
                ))}
              </Alert>
            ) : null}
            <KpiGrid minWidth={180}>
              <KpiTile
                id="kpi-in-tile"
                label="Toplam Giriş"
                icon="fas fa-arrow-trend-down"
                value={figure(eur(kpis.totalIn))}
                hint={kpis.momIn !== null ? `Aylık: ${signedPercent(kpis.momIn)}` : undefined}
              />
              <KpiTile
                id="kpi-out-tile"
                label="Toplam Çıkış"
                icon="fas fa-arrow-trend-up"
                value={figure(eur(kpis.totalOut))}
                hint={kpis.momOut !== null ? `Aylık: ${signedPercent(kpis.momOut)}` : undefined}
              />
              <KpiTile
                id="kpi-net-tile"
                label="Net Pozisyon"
                icon="fas fa-scale-balanced"
                value={pending || bothFailed ? figure('') : <NetAmount value={kpis.net} />}
                status={
                  pending || bothFailed
                    ? undefined
                    : kpis.net > 0
                      ? { tone: 'good', label: 'Giriş fazla' }
                      : kpis.net < 0
                        ? { tone: 'bad', label: 'Çıkış fazla' }
                        : { tone: 'neutral', label: 'Denge' }
                }
              />
              <KpiTile
                id="kpi-paid"
                label="Ödenen (çıkış)"
                icon="fas fa-check-circle"
                value={figure(eur(kpis.paid))}
              />
              <KpiTile
                id="kpi-await"
                label="Bekleyen (çıkış)"
                icon="fas fa-clock"
                value={figure(eur(kpis.awaiting))}
              />
              <KpiTile
                id="kpi-dbs"
                label="DBS Kullanılan"
                icon="fas fa-university"
                value={figure(eur(kpis.dbsUsed))}
              />
            </KpiGrid>
          </Stack>
        </Panel>

        <DashGrid>
          <DashCell span={7}>
            <Panel title="Aylık giriş / çıkış" icon="fas fa-chart-column">
              <BarsChart
                label="Aylık giriş ve çıkış"
                data={chartRows}
                categoryKey="axis"
                categoryLabel="Ay"
                series={[
                  { key: 'inflow', label: 'Giriş', color: STATUS.good },
                  { key: 'outflow', label: 'Çıkış', color: STATUS.bad, pattern: 'hatch' },
                ]}
                format={EUR_FORMAT}
                axisFormat={eurAxis}
                height={280}
                empty={
                  pending
                    ? 'Yükleniyor…'
                    : merged.rows.length
                      ? undefined
                      : 'Bu dönem için nakit akış verisi yok.'
                }
                tooltipNote={(row) => `Net: ${row.net < 0 ? '−' : '+'}${eur(Math.abs(row.net))}`}
              />
            </Panel>
          </DashCell>
          <DashCell span={5}>
            <Panel title="Kümülatif net" icon="fas fa-chart-line">
              <TrendChart
                label="Kümülatif net"
                data={chartRows}
                categoryKey="axis"
                categoryLabel="Ay"
                series={[{ key: 'cumulative', label: 'Kümülatif Net', color: ACCENT }]}
                referenceLines={[{ value: 0, label: 'Sıfır', color: GRAPHITE }]}
                format={EUR_FORMAT}
                axisFormat={eurAxis}
                height={280}
                empty={
                  pending
                    ? 'Yükleniyor…'
                    : merged.rows.length
                      ? undefined
                      : 'Bu dönem için nakit akış verisi yok.'
                }
                note="Sıfırın altı: o tarihe kadar çıkış girişten fazla."
              />
            </Panel>
          </DashCell>

          <DashCell>
            <DataTable
              title="Aylık Nakit Akış Özeti"
              icon="fas fa-table"
              data={merged.rows}
              columns={monthlyColumns}
              getRowId={(row) => row.month}
              loading={outQ.isFetching || inQ.isFetching}
              sortable
              rowStyle={rowStyle}
              onRowClick={openMonth}
              rowActions={() => [
                {
                  key: 'detail',
                  label: 'Ay detayı',
                  icon: 'fas fa-magnifying-glass',
                  onClick: openMonth,
                },
              ]}
              footer={() => (merged.rows.length ? <MonthlyFooter totals={merged.totals} /> : null)}
              emptyMessage="Bu dönem için veri yok."
            />
          </DashCell>

          <DashCell span={6}>
            <UndatedPanel
              title="Tarihsiz Çıkış"
              summary={undatedOutflow(outflow)}
              unit="PO"
              hint="Vadesi atanmamış ödeme planları — aylık görünüme dahil değil."
            />
          </DashCell>
          <DashCell span={6}>
            <UndatedPanel
              title="Tarihsiz Giriş"
              summary={undatedInflow(inflow)}
              unit="teklif"
              hint="Tarihsiz gelir kalemleri — aylık görünüme dahil değil."
            />
          </DashCell>

          <DashCell>
            <DataTable
              title="DBS Limit Kullanımı"
              icon="fas fa-university"
              data={dbsRows}
              columns={dbsCols}
              getRowId={(row, index) => `${row.supplier_name ?? ''}-${index}`}
              loading={outQ.isFetching}
              sortable
              pagination={{ pageSize: 10 }}
              emptyMessage="DBS kaydı yok."
            />
          </DashCell>
        </DashGrid>
      </Stack>

      <CashFlowDrilldown target={drill} onClose={() => setDrill(null)} />
    </>
  );
}

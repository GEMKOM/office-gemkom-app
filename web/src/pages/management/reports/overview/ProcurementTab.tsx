import { Alert } from '@mantine/core';
import type { ReactNode } from 'react';
import type { OverviewData, OverviewProcurement } from '@/api/reports/overview';
import { FaIcon, Panel } from '@/ui';
import {
  ACCENT,
  BarsChart,
  DashCell,
  DashGrid,
  KpiGrid,
  KpiTile,
  SERIES,
  compactCurrency,
} from '@/ui/charts';
import {
  eur,
  num,
  numLocale,
  pf,
  pfLocale,
  procurementRequests,
  truncateLabel,
} from './overviewData';
import { barsHeight, CompareMetrics, RankTable, TrendMark, type RankColumn } from './parts';
import classes from './overview.module.css';

type ListKey =
  | 'top_items_by_quantity'
  | 'top_items_by_cost'
  | 'top_suppliers_by_cost'
  | 'top_job_orders_by_cost';

interface ListDef {
  key: ListKey;
  title: string;
  columns: RankColumn[];
  rows: (p: OverviewProcurement | undefined) => ReactNode[][];
}

const LISTS: ListDef[] = [
  {
    key: 'top_items_by_quantity',
    title: 'Top kalemler (miktar)',
    columns: [{ label: 'Kalem' }, { label: 'Miktar', numeric: true }],
    rows: (p) =>
      (Array.isArray(p?.top_items_by_quantity) ? p.top_items_by_quantity : []).map((it) => [
        it.item_name ?? '',
        <>
          {numLocale(it.total_quantity, 2)} <span className={classes.muted}>{it.unit ?? ''}</span>
        </>,
      ]),
  },
  {
    key: 'top_items_by_cost',
    title: 'Top kalemler (tutar)',
    columns: [{ label: 'Kalem' }, { label: 'Tutar (EUR)', numeric: true }],
    rows: (p) =>
      (Array.isArray(p?.top_items_by_cost) ? p.top_items_by_cost : []).map((it) => [
        it.item_name ?? '',
        eur(it.total_cost_eur),
      ]),
  },
  {
    key: 'top_suppliers_by_cost',
    title: 'Top tedarikçiler (tutar)',
    columns: [{ label: 'Tedarikçi' }, { label: 'Tutar (EUR)', numeric: true }],
    rows: (p) =>
      (Array.isArray(p?.top_suppliers_by_cost) ? p.top_suppliers_by_cost : []).map((it) => [
        it.supplier_name ?? '',
        eur(it.total_cost_eur),
      ]),
  },
  {
    key: 'top_job_orders_by_cost',
    title: 'Top iş emirleri (tutar)',
    columns: [{ label: 'İş emri' }, { label: 'Tutar (EUR)', numeric: true }],
    rows: (p) =>
      (Array.isArray(p?.top_job_orders_by_cost) ? p.top_job_orders_by_cost : []).map((it) => [
        <strong key="j">{it.job_no ?? ''}</strong>,
        eur(it.total_cost_eur),
      ]),
  },
];

/** Satınalma: headline tiles, overdue payments, top suppliers and items, all metrics, top lists. */
export function ProcurementTab({ data }: { data: OverviewData }) {
  const pr = data.procurement ?? {};
  const ppPr = data.previous_period?.procurement;
  const cmp = Boolean(data.meta?.compare && ppPr && typeof ppPr === 'object');
  const p0: OverviewProcurement = ppPr ?? {};
  const overdue = pf(pr.payments_overdue);

  const suppliers = (Array.isArray(pr.top_suppliers_by_cost) ? pr.top_suppliers_by_cost : []).map(
    (s) => ({
      label: truncateLabel(s.supplier_name, 26),
      value: pfLocale(s.total_cost_eur),
    }),
  );
  const items = (Array.isArray(pr.top_items_by_cost) ? pr.top_items_by_cost : []).map((it) => ({
    label: truncateLabel([it.item_code, it.item_name].filter(Boolean).join(' · '), 30),
    value: pfLocale(it.total_cost_eur),
  }));

  const tile = (
    id: string,
    label: string,
    cur: string,
    prev: string,
    trendCur: number,
    trendPrev: number,
  ) => (
    <KpiTile
      id={id}
      label={label}
      value={cur}
      hint={
        cmp ? (
          <>
            Önceki: <strong>{prev}</strong>
            <TrendMark current={trendCur} previous={trendPrev} />
          </>
        ) : undefined
      }
    />
  );

  return (
    <DashGrid>
      <DashCell>
        <Panel title="Satınalma performansı" icon="fas fa-cart-shopping">
          <p className={classes.sectionLead} style={{ marginBottom: 12 }}>
            Dönemdeki talepler, siparişler ve ödeme yükü — özet rakamlar; ayrıntılar ve listeler
            aşağıda.
          </p>
          <KpiGrid minWidth={190}>
            {tile(
              'ov-proc-requests',
              'Gönderilen talep',
              num(procurementRequests(pr)),
              num(procurementRequests(p0)),
              procurementRequests(pr),
              procurementRequests(p0),
            )}
            {tile(
              'ov-proc-orders',
              'Oluşturulan sipariş',
              num(pr.orders_created_in_range),
              num(p0.orders_created_in_range),
              pf(pr.orders_created_in_range),
              pf(p0.orders_created_in_range),
            )}
            {tile(
              'ov-proc-ordered',
              'Sipariş tutarı',
              eur(pr.total_ordered_value_eur),
              eur(p0.total_ordered_value_eur),
              pfLocale(pr.total_ordered_value_eur),
              pfLocale(p0.total_ordered_value_eur),
            )}
            {tile(
              'ov-proc-due',
              'Vade toplamı (EUR)',
              eur(pr.total_payments_due_eur),
              eur(p0.total_payments_due_eur),
              pfLocale(pr.total_payments_due_eur),
              pfLocale(p0.total_payments_due_eur),
            )}
          </KpiGrid>
          {overdue > 0 ? (
            <Alert
              color="red"
              variant="light"
              mt="md"
              icon={<FaIcon icon="fas fa-triangle-exclamation" />}
              role="alert"
            >
              <strong>Gecikmiş ödeme:</strong> <strong>{num(overdue)}</strong> adet (anlık bakiye —
              öncelikli takip)
            </Alert>
          ) : null}
        </Panel>
      </DashCell>
      <DashCell span={6}>
        <Panel title="En yüksek tedarikçi harcaması (EUR)" icon="fas fa-chart-bar">
          <BarsChart
            label="En yüksek tedarikçi harcaması (EUR)"
            data={suppliers}
            categoryKey="label"
            categoryLabel="Tedarikçi"
            series={[{ key: 'value', label: 'EUR', color: ACCENT }]}
            horizontal
            categoryWidth={200}
            format={eur}
            axisFormat={(v) => compactCurrency(v)}
            valueLabels={(v) => (v !== 0 ? num(v) : '')}
            height={barsHeight(suppliers.length)}
          />
        </Panel>
      </DashCell>
      <DashCell span={6}>
        <Panel title="En yüksek kalem tutarı (EUR)" icon="fas fa-chart-bar">
          <BarsChart
            label="En yüksek kalem tutarı (EUR)"
            data={items}
            categoryKey="label"
            categoryLabel="Kalem"
            series={[{ key: 'value', label: 'EUR', color: SERIES.blue }]}
            horizontal
            categoryWidth={230}
            format={eur}
            axisFormat={(v) => compactCurrency(v)}
            valueLabels={(v) => (v !== 0 ? num(v) : '')}
            height={barsHeight(items.length)}
          />
        </Panel>
      </DashCell>
      <DashCell>
        <Panel title="Tüm metrikler (dönem karşılaştırması)" icon="fas fa-sliders">
          <CompareMetrics
            compare={cmp}
            metrics={[
              {
                title: 'Gönderilen talepler (dönem)',
                current: num(procurementRequests(pr)),
                previous: num(procurementRequests(p0)),
                trendCurrent: procurementRequests(pr),
                trendPrevious: procurementRequests(p0),
              },
              {
                title: 'Oluşturulan siparişler (dönem)',
                current: num(pr.orders_created_in_range),
                previous: num(p0.orders_created_in_range),
                trendCurrent: pf(pr.orders_created_in_range),
                trendPrevious: pf(p0.orders_created_in_range),
              },
              {
                title: 'Sipariş tutarı (EUR)',
                current: eur(pr.total_ordered_value_eur),
                previous: eur(p0.total_ordered_value_eur),
                trendCurrent: pfLocale(pr.total_ordered_value_eur),
                trendPrevious: pfLocale(p0.total_ordered_value_eur),
              },
              {
                title: 'Vadesi gelen ödemeler (adet)',
                current: num(pr.payments_due_in_range),
                previous: num(p0.payments_due_in_range),
                trendCurrent: pf(pr.payments_due_in_range),
                trendPrevious: pf(p0.payments_due_in_range),
              },
              {
                title: 'Gecikmiş ödemeler (anlık)',
                current: num(pr.payments_overdue),
                previous: num(p0.payments_overdue),
                trendCurrent: pf(pr.payments_overdue),
                trendPrevious: pf(p0.payments_overdue),
                tone: 'bad',
              },
              {
                title: 'Vade toplamı (EUR)',
                current: eur(pr.total_payments_due_eur),
                previous: eur(p0.total_payments_due_eur),
                trendCurrent: pfLocale(pr.total_payments_due_eur),
                trendPrevious: pfLocale(p0.total_payments_due_eur),
              },
            ]}
          />
        </Panel>
      </DashCell>
      <DashCell>
        <h3 className={classes.sectionTitle}>
          <FaIcon icon="fas fa-table-list" style={{ marginRight: 8, color: 'var(--gk-muted)' }} />
          Liste ve sıralamalar
        </h3>
        <p className={classes.sectionLead}>
          Top kalemler, tedarikçiler ve iş emirleri — tabloda detay.
        </p>
      </DashCell>
      {LISTS.map((list) => (
        <DashCell key={list.key} span={6}>
          <Panel title={`${list.title}${cmp ? ' — karşılaştırmalı' : ''}`} icon="fas fa-list">
            {cmp ? (
              <div className={classes.split}>
                <div>
                  <div className={classes.periodLabel}>Seçilen dönem</div>
                  <RankTable columns={list.columns} rows={list.rows(pr)} />
                </div>
                <div>
                  <div className={classes.periodLabel} data-prev>
                    Önceki dönem
                  </div>
                  <RankTable columns={list.columns} rows={list.rows(ppPr)} />
                </div>
              </div>
            ) : (
              <RankTable columns={list.columns} rows={list.rows(pr)} />
            )}
          </Panel>
        </DashCell>
      ))}
    </DashGrid>
  );
}

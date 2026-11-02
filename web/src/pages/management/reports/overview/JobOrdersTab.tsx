import type { OverviewData } from '@/api/reports/overview';
import { Panel } from '@/ui';
import {
  ACCENT,
  BarsChart,
  DashCell,
  DashGrid,
  DonutBreakdown,
  KpiGrid,
  KpiTile,
  NEUTRAL,
  SERIES,
  compactCurrency,
} from '@/ui/charts';
import { eur, jobOrderCostSlices, jobOrderStatusRows, num, numLocale, pf } from './overviewData';
import { barsHeight, KeyValues } from './parts';

/** İş Emirleri: period summary, job orders by status, cost split of the completed ones. */
export function JobOrdersTab({ data }: { data: OverviewData }) {
  const jo = data.job_orders ?? {};
  const jc = data.job_orders_costs ?? {};
  // The status chart covers the job orders opened in the period; the cost
  // card the ones completed in it, whose costs are final.
  const allTime = data.meta?.preset === 'all_time';
  const scope = allTime ? 'tüm iş emirleri' : 'dönemde açılan iş emirleri';
  const costScope = allTime ? 'tüm tamamlanan iş emirleri' : 'dönemde tamamlanan iş emirleri';
  const statusRows = jobOrderStatusRows(jo.by_status);
  const cost = jobOrderCostSlices(jc);
  const overdue = pf(jo.overdue);

  return (
    <DashGrid>
      <DashCell>
        <Panel title="Dönem özeti" icon="fas fa-clipboard-list">
          <KpiGrid minWidth={170}>
            <KpiTile
              id="ov-active"
              label="Aktif iş emirleri"
              value={num(jo.total_active)}
              hint="snapshot"
            />
            <KpiTile
              label="Dönemde tamamlanan"
              value={num(jo.total_completed_in_range)}
              hint="dönem"
            />
            <KpiTile label="Dönemde başlayan" value={num(jo.total_started_in_range)} hint="dönem" />
            <KpiTile
              label="Gecikmiş"
              value={num(jo.overdue)}
              hint="snapshot"
              status={overdue > 0 ? { tone: 'bad', label: 'Gecikme var' } : undefined}
            />
            <KpiTile
              label="Ort. tamamlanma"
              value={`${numLocale(jo.avg_completion_pct, 2)}%`}
              hint="ortalama"
            />
          </KpiGrid>
        </Panel>
      </DashCell>
      <DashCell span={6}>
        <Panel title={`Duruma göre (${scope})`} icon="fas fa-chart-bar">
          <BarsChart
            label={`İş emirleri duruma göre (${scope})`}
            data={statusRows}
            categoryKey="label"
            categoryLabel="Durum"
            series={[{ key: 'value', label: 'Adet', color: ACCENT }]}
            horizontal
            categoryWidth={110}
            height={barsHeight(statusRows.length)}
            valueLabels={(v) => (v !== 0 ? num(v) : '')}
            empty={statusRows.length ? undefined : 'Bu dönemde açılan iş emri yok'}
          />
        </Panel>
      </DashCell>
      <DashCell span={6}>
        <Panel title={`Maliyet dağılımı (${costScope})`} icon="fas fa-chart-pie">
          <DonutBreakdown
            label={`Maliyet dağılımı (${costScope})`}
            format={eur}
            center={
              cost.empty
                ? undefined
                : compactCurrency(cost.labor + cost.material + cost.subcontractor + cost.other)
            }
            empty={cost.empty ? 'Bu dönemde tamamlanan iş emirlerinde maliyet yok' : undefined}
            data={[
              { name: 'İşçilik', value: cost.labor, color: SERIES.blue },
              { name: 'Malzeme', value: cost.material, color: SERIES.orange },
              { name: 'Taşeron', value: cost.subcontractor, color: SERIES.violet },
              { name: 'Diğer', value: cost.other, color: NEUTRAL },
            ]}
          />
          <div style={{ marginTop: 12 }}>
            <KeyValues
              rows={[
                { label: 'Maliyet verisi olan iş', value: num(jc.jobs_with_cost_data) },
                { label: 'Satış fiyatı olan iş', value: num(jc.jobs_with_selling_price) },
                { label: 'Satış toplam (EUR)', value: eur(jc.total_selling_price_eur) },
                { label: 'Gerçek maliyet (EUR)', value: eur(jc.total_actual_cost_eur) },
                { label: 'Ort. marj', value: `${numLocale(jc.avg_margin_pct, 2)}%` },
              ]}
            />
          </div>
        </Panel>
      </DashCell>
    </DashGrid>
  );
}

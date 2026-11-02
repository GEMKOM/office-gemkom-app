import type { OverviewData } from '@/api/reports/overview';
import { Panel } from '@/ui';
import {
  ACCENT,
  BarsChart,
  DashCell,
  DashGrid,
  DonutBreakdown,
  NEUTRAL,
  SERIES,
  STATUS,
  valueFormats,
} from '@/ui/charts';
import { formatPercent } from '@/lib/format';
import { num, qcPassRate } from './overviewData';
import { barsHeight, KeyValues } from './parts';
import classes from './overview.module.css';

/** Kalite: NCR and QC counts, open NCRs by severity, NCRs by defect type. */
export function QualityTab({ data }: { data: OverviewData }) {
  const q = data.quality ?? {};
  const sev = q.ncrs_by_severity ?? {};
  const defect = q.ncrs_by_defect_type ?? {};
  const defectRows = Object.keys(defect).map((key) => ({
    label: key,
    value: Number(defect[key] || 0),
  }));

  return (
    <DashGrid>
      <DashCell span={4}>
        <Panel title="NCR & QC Özeti" icon="fas fa-clipboard-check">
          <KeyValues
            rows={[
              { label: 'NCR açılan (dönem)', value: num(q.ncrs_opened_in_range) },
              { label: 'NCR kapanan (dönem)', value: num(q.ncrs_closed_in_range) },
              { label: 'NCR toplam açık', value: num(q.ncrs_open_total) },
              { label: 'QC incelemeleri', value: num(q.qc_reviews_in_range) },
              { label: 'QC onaylanan', value: num(q.qc_reviews_approved), tone: 'good' },
              { label: 'QC reddedilen', value: num(q.qc_reviews_rejected), tone: 'bad' },
              {
                label: 'QC Pass Rate',
                value: formatPercent(qcPassRate(q.qc_reviews_in_range, q.qc_reviews_approved), 1),
              },
            ]}
          />
          <div className={classes.hint}>* NCR toplam açık: snapshot alandır.</div>
        </Panel>
      </DashCell>
      <DashCell span={4}>
        <Panel title="NCR Şiddet (Açık)" icon="fas fa-circle-exclamation">
          <DonutBreakdown
            label="Açık NCR'ler şiddete göre"
            format={valueFormats.number(0)}
            size={140}
            data={[
              { name: 'Kritik', value: Number(sev.critical || 0), color: STATUS.bad },
              { name: 'Majör', value: Number(sev.major || 0), color: SERIES.orange },
              { name: 'Minör', value: Number(sev.minor || 0), color: NEUTRAL },
            ]}
          />
        </Panel>
      </DashCell>
      <DashCell span={4}>
        <Panel title="NCR Hata Türü (Dönem)" icon="fas fa-chart-bar">
          <BarsChart
            label="Dönemde açılan NCR'ler hata türüne göre"
            data={defectRows}
            categoryKey="label"
            categoryLabel="Hata türü"
            series={[{ key: 'value', label: 'Adet', color: ACCENT }]}
            horizontal
            categoryWidth={110}
            format={valueFormats.number(0)}
            axisFormat={(v) => (Number.isInteger(v) ? num(v) : '')}
            valueLabels={(v) => (v !== 0 ? num(v) : '')}
            height={barsHeight(defectRows.length)}
          />
        </Panel>
      </DashCell>
    </DashGrid>
  );
}

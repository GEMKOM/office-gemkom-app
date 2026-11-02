import type { OverviewData } from '@/api/reports/overview';
import { Panel } from '@/ui';
import {
  BarsChart,
  DashCell,
  DashGrid,
  GRAPHITE,
  SERIES,
  STATUS,
  compactCurrency,
  valueFormats,
} from '@/ui/charts';
import { formatPercent } from '@/lib/format';
import { consultRows, eur, num, salesSummary } from './overviewData';
import { barsHeight } from './parts';
import classes from './overview.module.css';

const COUNT_COLORS: Record<string, string> = {
  Oluşturulan: GRAPHITE,
  Kazanılan: STATUS.good,
  Kaybedilen: STATUS.bad,
};

const EUR_COLORS: Record<string, string> = {
  'Kazanılan tutar': STATUS.good,
  'Kaybedilen tutar': STATUS.bad,
  'Bekleyen anlaşma değeri': SERIES.blue,
};

/** Satış & Maliyet: offer counts, won / lost / pending amounts, consultations by department. */
export function SalesTab({ data }: { data: OverviewData }) {
  const s = salesSummary(data.sales);
  const counts = [
    { label: 'Oluşturulan', value: s.created },
    { label: 'Kazanılan', value: s.won },
    { label: 'Kaybedilen', value: s.lost },
  ];
  const amounts = [
    { label: 'Kazanılan tutar', value: s.wonEur },
    { label: 'Kaybedilen tutar', value: s.lostEur },
    { label: 'Bekleyen anlaşma değeri', value: s.pendingEur },
  ];
  const consults = consultRows(data.sales?.sales_consults_by_department);

  return (
    <DashGrid>
      <DashCell span={6}>
        <Panel title="Teklif adetleri (karşılaştırma)" icon="fas fa-chart-column">
          <BarsChart
            label="Teklif adetleri: oluşturulan, kazanılan, kaybedilen"
            data={counts}
            categoryKey="label"
            categoryLabel="Teklif"
            series={[{ key: 'value', label: 'Teklif sayısı', color: GRAPHITE }]}
            cellFill={(row) => COUNT_COLORS[row.label]}
            valueLabels={(v) => (v !== 0 ? num(v) : '')}
            axisFormat={(v) => (Number.isInteger(v) ? num(v) : '')}
            height={240}
          />
          <div className={classes.footnote}>
            <span>Oluşturulan tekliflere göre kazanma oranı</span>
            <strong>{formatPercent(s.winRate, 1)}</strong>
          </div>
        </Panel>
      </DashCell>
      <DashCell span={6}>
        <Panel title="Kazanılan, kaybedilen ve bekleyen tutarlar" icon="fas fa-chart-bar">
          <BarsChart
            label="Kazanılan, kaybedilen ve bekleyen tutarlar (EUR)"
            data={amounts}
            categoryKey="label"
            categoryLabel="Tutar"
            series={[{ key: 'value', label: 'Tutar', color: SERIES.blue }]}
            cellFill={(row) => EUR_COLORS[row.label]}
            horizontal
            categoryWidth={180}
            format={eur}
            axisFormat={(v) => compactCurrency(v)}
            valueLabels={(v) => (v !== 0 ? eur(v) : '')}
            height={200}
          />
          <div className={classes.hint}>
            Kazanılan ve kaybedilen: seçilen döneme göre (Euro). Bekleyen anlaşma değeri: güncel
            pipeline toplamı (tarih filtresinden bağımsız).
          </div>
          <div className={classes.footnote}>
            <span>Kazanılan ÷ (kazanılan + kaybedilen + bekleyen)</span>
            <strong>{formatPercent(s.eurWinSharePct, 1)}</strong>
          </div>
        </Panel>
      </DashCell>
      <DashCell>
        <Panel
          title="Satış danışmanlığı (dönem): departmanlara göre kayıtlar"
          icon="fas fa-chart-bar"
        >
          <BarsChart
            label="Departmanlara göre danışmanlık kayıtları"
            data={consults}
            categoryKey="label"
            categoryLabel="Departman"
            series={[{ key: 'value', label: 'Danışmanlık sayısı', color: GRAPHITE }]}
            horizontal
            categoryWidth={140}
            format={valueFormats.number(0)}
            axisFormat={(v) => (Number.isInteger(v) ? num(v) : '')}
            valueLabels={(v) => (v !== 0 ? num(v) : '')}
            height={barsHeight(consults.length)}
          />
          <div className={classes.hint}>Danışmanlık kayıtlarının oluşturulma tarihine göre.</div>
        </Panel>
      </DashCell>
    </DashGrid>
  );
}

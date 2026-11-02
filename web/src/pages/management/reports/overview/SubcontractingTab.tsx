import type { OverviewData, OverviewSubcontracting } from '@/api/reports/overview';
import { Panel } from '@/ui';
import { ACCENT, BarsChart, DashCell, DashGrid, NEUTRAL } from '@/ui/charts';
import {
  eur,
  hakedisAvgPricePerKg,
  num,
  numLocale,
  pf,
  pfLocale,
  subcontractorAvgPricePerKg,
  subcontractorRowWeightKg,
  subcontractorTop10,
} from './overviewData';
import { barsHeight, CompareMetrics } from './parts';
import classes from './overview.module.css';

function avgPerKgText(slice: OverviewSubcontracting | null | undefined): string {
  const v = hakedisAvgPricePerKg(slice);
  if (v === null) return '—';
  const c = slice?.currency || slice?.total_approved_currency;
  return `${numLocale(v, 2)}${c ? ` ${c}` : ''}`;
}

/** Taşeron: top 10 subcontractors by approved amount (with the previous period) and the hakediş totals. */
export function SubcontractingTab({ data }: { data: OverviewData }) {
  const sub = data.subcontracting ?? {};
  const ppSub = data.previous_period?.subcontracting;
  const cmp = Boolean(data.meta?.compare && ppSub && typeof ppSub === 'object');
  const pairs = subcontractorTop10(sub, ppSub, cmp);
  const p0 = ppSub ?? {};

  const fmtKg = (kg: number) => (kg > 0 ? numLocale(kg, 2) : '—');
  const fmtAvg = (
    row: Parameters<typeof subcontractorAvgPricePerKg>[0],
    currencyHint?: string | null,
  ) => {
    const avg = subcontractorAvgPricePerKg(row);
    if (avg === null) return '—';
    const cur = row?.currency || currencyHint || '';
    return `${numLocale(avg, 2)}${cur ? ` ${cur}` : ''}`;
  };

  return (
    <DashGrid>
      <DashCell span={7}>
        <Panel title={`Taşeron Top 10${cmp ? ' — karşılaştırmalı' : ''}`} icon="fas fa-handshake">
          <BarsChart
            label="Taşeron Top 10, onaylanan tutar"
            data={pairs ?? []}
            categoryKey="name"
            categoryLabel="Taşeron"
            series={[
              { key: 'current', label: 'Bu dönem', color: ACCENT },
              ...(cmp
                ? [
                    {
                      key: 'previous',
                      label: 'Önceki dönem',
                      color: NEUTRAL,
                      pattern: 'hatch' as const,
                    },
                  ]
                : []),
            ]}
            horizontal
            categoryWidth={160}
            height={barsHeight((pairs?.length ?? 0) * (cmp ? 1.6 : 1), 200)}
            valueLabels={(v) => (v !== 0 ? num(v) : '')}
          />
          {cmp && pairs?.length ? (
            <div
              className={classes.scroll}
              style={{ marginTop: 16, paddingTop: 8, borderTop: '1px solid var(--gk-line)' }}
            >
              <table className={classes.table}>
                <thead>
                  <tr>
                    <th scope="col" className={classes.rank}>
                      #
                    </th>
                    <th scope="col">Taşeron</th>
                    <th scope="col" className={classes.num}>
                      Bu tutar
                    </th>
                    <th scope="col" className={classes.num}>
                      Bu kg
                    </th>
                    <th scope="col" className={classes.num}>
                      Bu ort./kg
                    </th>
                    <th scope="col" className={classes.num}>
                      Önceki tutar
                    </th>
                    <th scope="col" className={classes.num}>
                      Önceki kg
                    </th>
                    <th scope="col" className={classes.num}>
                      Önceki ort./kg
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pairs.map((pair, i) => {
                    const { curRow, prevRow } = pair;
                    const cc = curRow?.currency || prevRow?.currency;
                    const pc = prevRow?.currency || curRow?.currency;
                    return (
                      <tr key={`${pair.name}-${i}`}>
                        <td className={classes.rank}>{i + 1}</td>
                        <td style={{ overflowWrap: 'anywhere', minWidth: 120 }}>{pair.name}</td>
                        <td className={classes.num}>
                          {numLocale(curRow.approved_total, 2)}
                          {cc ? ` ${cc}` : ''}
                        </td>
                        <td className={classes.num}>{fmtKg(subcontractorRowWeightKg(curRow))}</td>
                        <td className={classes.num}>{fmtAvg(curRow, prevRow?.currency)}</td>
                        <td className={`${classes.num} ${classes.muted}`}>
                          {numLocale(prevRow ? prevRow.approved_total : 0, 2)}
                          {pc ? ` ${pc}` : ''}
                        </td>
                        <td className={`${classes.num} ${classes.muted}`}>
                          {fmtKg(subcontractorRowWeightKg(prevRow))}
                        </td>
                        <td className={`${classes.num} ${classes.muted}`}>
                          {fmtAvg(prevRow, curRow?.currency)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </Panel>
      </DashCell>
      <DashCell span={5}>
        <Panel title="Taşeron Hakediş" icon="fas fa-file-invoice-dollar">
          <CompareMetrics
            compare={cmp}
            metrics={[
              {
                title: 'Onaylanan tutar',
                current: numLocale(sub.total_approved_value, 2),
                previous: numLocale(p0.total_approved_value, 2),
                trendCurrent: pfLocale(sub.total_approved_value),
                trendPrevious: pfLocale(p0.total_approved_value),
              },
              {
                title: 'Toplam verilen ağırlık',
                current: `${numLocale(sub.total_awarded_weight_kg, 2)} kg`,
                previous: `${numLocale(p0.total_awarded_weight_kg, 2)} kg`,
                trendCurrent: pfLocale(sub.total_awarded_weight_kg),
                trendPrevious: pfLocale(p0.total_awarded_weight_kg),
              },
              {
                title: 'Ortalama birim fiyat',
                current: avgPerKgText(sub),
                previous: avgPerKgText(p0),
                trendCurrent: hakedisAvgPricePerKg(sub) ?? 0,
                trendPrevious: hakedisAvgPricePerKg(ppSub) ?? 0,
              },
              {
                title: 'Faturalanmamış tahakkuk',
                current: eur(sub.total_unbilled_accrual_eur),
                previous: eur(p0.total_unbilled_accrual_eur),
                trendCurrent: pf(sub.total_unbilled_accrual_eur),
                trendPrevious: pf(p0.total_unbilled_accrual_eur),
              },
            ]}
          />
        </Panel>
      </DashCell>
    </DashGrid>
  );
}

import { Alert, Box, List, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { estimatedCostBreakdownQueryOptions, type CostTableRow } from '@/api/projects/cost';
import { formatDate, formatDateTime, formatNumber, formatPercent } from '@/lib/format';
import { DetailModal, errorMessage, FaIcon, type DetailSection } from '@/ui';
import { KpiGrid, KpiTile } from '@/ui/charts';
import {
  breakdownSellingPrice,
  breakdownWeight,
  costDiff,
  marginPctOf,
  num,
  numOrNull,
  PRICE_SOURCE_LABELS,
} from './analyticsData';
import { CostDiff, euro, Money } from './cells';
import classes from './analytics.module.css';

export interface EstimatedCostModalProps {
  jobNo: string;
  /** The table row of the job (top level or an expanded child), if on screen. */
  costRow: CostTableRow | null;
  onClose: () => void;
}

const qty = (value: unknown) => {
  const n = numOrNull(value);
  return n === null ? '–' : formatNumber(n, 2);
};

/** Port of showEstimatedCostBreakdownModal: estimate vs actual per cost item, with €/kg and marj. */
export function EstimatedCostModal({ jobNo, costRow, onClose }: EstimatedCostModalProps) {
  const breakdown = useQuery(estimatedCostBreakdownQueryOptions(jobNo));
  const title = `${jobNo} - Tahmini Maliyet Hesabı`;

  if (breakdown.isError) {
    return (
      <DetailModal
        opened
        onClose={onClose}
        title={title}
        icon="fas fa-chart-line"
        size="md"
        sections={[
          {
            content: (
              <Alert color="red" icon={<FaIcon icon="fas fa-exclamation-triangle" />}>
                {errorMessage(breakdown.error) || 'Tahmini maliyet hesabı yüklenemedi'}
              </Alert>
            ),
          },
        ]}
      />
    );
  }

  let sections: DetailSection[] = [{ content: <Box mih={220} /> }];
  const data = breakdown.data;
  if (data) {
    const components = Array.isArray(data.components) ? data.components : [];
    const assumptions = Array.isArray(data.assumptions) ? data.assumptions : [];
    const children = Array.isArray(data.children) ? data.children : [];
    const material = data.material_breakdown ?? {};
    const items = Array.isArray(material.items) ? material.items : [];
    const hasChildJobs = items.some((line) => line.job_order && line.job_order !== jobNo);
    const actualTotal = data.actual_total_cost ?? costRow?.actual_total_cost;
    const componentActual = (c: (typeof components)[number]) =>
      c.actual_amount_eur ??
      (c.key && costRow ? (costRow[c.key] as typeof c.actual_amount_eur) : null);
    const weight = breakdownWeight(data, costRow);
    const perKg = (value: unknown): ReactNode => {
      const n = numOrNull(value);
      return weight > 0 && n !== null ? euro(n / weight) : '–';
    };
    const sellingPrice = breakdownSellingPrice(data, costRow);
    const marjTile = (label: string, cost: unknown) => {
      const m = marginPctOf(sellingPrice, cost);
      return (
        <KpiTile
          icon="fas fa-percent"
          label={label}
          value={m === null ? '–' : formatPercent(m, 2)}
          status={
            m === null
              ? undefined
              : m < 0
                ? { tone: 'bad', label: 'Zarar' }
                : { tone: 'good', label: 'Kâr' }
          }
        />
      );
    };

    sections = [
      {
        title: 'Özet',
        icon: 'fas fa-chart-pie',
        content: (
          <KpiGrid minWidth={170}>
            <KpiTile
              icon="fas fa-chart-line"
              label="Tahmini Toplam"
              value={<Money value={data.total_cost} />}
            />
            <KpiTile
              icon="fas fa-receipt"
              label="Gerçek Toplam"
              value={<Money value={actualTotal} />}
            />
            <KpiTile
              icon="fas fa-balance-scale"
              label="Fark (Gerçek − Tahmini)"
              value={<CostDiff value={costDiff(data.total_cost, actualTotal)} />}
            />
            <KpiTile
              icon="fas fa-tasks"
              label="Tamamlanma"
              value={
                data.completion_pct !== null && data.completion_pct !== undefined
                  ? formatPercent(num(data.completion_pct), 1)
                  : '–'
              }
            />
            <KpiTile
              icon="fas fa-weight-hanging"
              label="Ağırlık (kg)"
              value={weight > 0 ? formatNumber(weight, 2) : '–'}
            />
            <KpiTile icon="fas fa-list" label="Maliyet Kalemi" value={String(components.length)} />
            {marjTile('Marj % (Tahmini)', data.total_cost)}
            {marjTile('Marj % (Gerçek)', actualTotal)}
          </KpiGrid>
        ),
      },
      {
        title: 'Maliyet Kalemleri',
        icon: 'fas fa-list',
        content: (
          <div className={classes.tableScroll}>
            <table className={classes.plainTable}>
              <thead>
                <tr>
                  <th>Kalem</th>
                  <th className={classes.num}>Tahmini (EUR)</th>
                  <th className={classes.num}>Tahmini €/kg</th>
                  <th className={classes.num}>Gerçek (EUR)</th>
                  <th className={classes.num}>Gerçek €/kg</th>
                  <th className={classes.num}>Fark (EUR)</th>
                  <th>Hesaplama</th>
                </tr>
              </thead>
              <tbody>
                {components.map((c, index) => {
                  const actual = componentActual(c);
                  return (
                    <tr key={c.key ?? index}>
                      <td style={{ fontWeight: 600 }}>{c.label || c.key || '–'}</td>
                      <td className={classes.num} style={{ fontWeight: 600 }}>
                        <Money value={c.amount_eur} />
                      </td>
                      <td className={classes.num}>{perKg(c.amount_eur)}</td>
                      <td className={classes.num}>
                        <Money value={actual} />
                      </td>
                      <td className={classes.num}>{perKg(actual)}</td>
                      <td className={classes.num}>
                        <CostDiff value={costDiff(c.amount_eur, actual)} />
                      </td>
                      <td style={{ color: 'var(--gk-muted)', fontSize: 12 }}>
                        {c.description || '–'}
                      </td>
                    </tr>
                  );
                })}
                <tr className={classes.totalRow}>
                  <td>Toplam</td>
                  <td className={classes.num}>
                    <Money value={data.total_cost} />
                  </td>
                  <td className={classes.num}>{perKg(data.total_cost)}</td>
                  <td className={classes.num}>
                    <Money value={actualTotal} />
                  </td>
                  <td className={classes.num}>{perKg(actualTotal)}</td>
                  <td className={classes.num}>
                    <CostDiff value={costDiff(data.total_cost, actualTotal)} />
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        ),
      },
      {
        title: 'Tahmin Varsayımları',
        icon: 'fas fa-info-circle',
        content: assumptions.length ? (
          <List size="sm" c="dimmed">
            {assumptions.map((a, i) => (
              <List.Item key={i}>{a}</List.Item>
            ))}
          </List>
        ) : (
          <Text size="sm" c="dimmed">
            Ek varsayım notu yok.
          </Text>
        ),
      },
      {
        title: 'Alt İş Emirleri',
        icon: 'fas fa-sitemap',
        hidden: !children.length,
        content: (
          <div className={classes.tableScroll}>
            <table className={classes.plainTable}>
              <thead>
                <tr>
                  <th>İş Emri</th>
                  <th className={classes.num}>Mevcut Maliyet</th>
                  <th className={classes.num}>Tahmini Maliyet</th>
                </tr>
              </thead>
              <tbody>
                {children.map((c, i) => (
                  <tr key={c.job_order ?? i}>
                    <td style={{ fontWeight: 600 }}>{c.job_order || '–'}</td>
                    <td className={classes.num}>
                      <Money value={c.actual_total_cost} />
                    </td>
                    <td className={classes.num}>
                      <Money value={c.estimated_total_cost} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      },
      {
        title: `Malzeme Satırları (${material.items_count ?? items.length})`,
        icon: 'fas fa-boxes',
        content: items.length ? (
          <>
            {material.material_cost_floored_to_actual && num(material.floor_adjustment_eur) > 0 ? (
              <Alert variant="light" color="blue" mb="sm">
                <Text size="sm">
                  Satır toplamı (<Money value={material.lines_total} />) mevcut maliyetin altında
                  kaldığı için tahmin <Money value={material.floor_adjustment_eur} /> ile{' '}
                  <Money value={material.estimated_material_cost} /> seviyesine yükseltildi.
                </Text>
              </Alert>
            ) : null}
            <div className={classes.tableScroll} data-tall>
              <table className={classes.plainTable}>
                <thead>
                  <tr>
                    {hasChildJobs ? <th>İş Emri</th> : null}
                    <th>Kod</th>
                    <th>Malzeme</th>
                    <th>Birim</th>
                    <th className={classes.num}>Miktar</th>
                    <th className={classes.num}>Birim Fiyat (€)</th>
                    <th className={classes.num}>Tutar (€)</th>
                    <th>Fiyat Kaynağı</th>
                    <th>Tarih</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((line, i) => (
                    <tr key={i}>
                      {hasChildJobs ? (
                        <td className={classes.code}>{line.job_order || '–'}</td>
                      ) : null}
                      <td className={classes.code}>{line.item_code || '–'}</td>
                      <td>{line.item_name || '–'}</td>
                      <td style={{ color: 'var(--gk-muted)' }}>{line.item_unit || '–'}</td>
                      <td className={classes.num}>{qty(line.quantity)}</td>
                      <td className={classes.num}>
                        <Money value={line.unit_price_eur} />
                      </td>
                      <td className={classes.num} style={{ fontWeight: 600 }}>
                        <Money value={line.amount_eur} />
                      </td>
                      <td style={{ color: 'var(--gk-muted)' }}>
                        {PRICE_SOURCE_LABELS[line.price_source ?? ''] || line.price_source || '–'}
                      </td>
                      <td style={{ color: 'var(--gk-muted)' }}>
                        {line.price_date ? formatDate(line.price_date) : '–'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={hasChildJobs ? 6 : 5} style={{ textAlign: 'right' }}>
                      Satır Toplamı
                    </td>
                    <td className={classes.num}>
                      <Money value={material.lines_total} />
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        ) : (
          <Text size="sm" c="dimmed" ta="center" py="sm">
            Malzeme satırı bulunamadı.
          </Text>
        ),
      },
      {
        hidden: !data.last_updated,
        content: (
          <Text size="xs" c="dimmed" ta="right">
            <FaIcon icon="fas fa-clock" style={{ marginRight: 4 }} />
            Son güncelleme: {formatDateTime(data.last_updated)}
          </Text>
        ),
      },
    ];
  }

  return (
    <DetailModal
      opened
      onClose={onClose}
      title={title}
      icon="fas fa-chart-line"
      size={1140}
      loading={breakdown.isPending}
      sections={sections}
    />
  );
}

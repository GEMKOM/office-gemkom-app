// Eğilimler (render/charts.js): six trend charts. The 'Zamanında / geç' chart
// had its % line on a second y-axis; here the counts and the % are two charts
// in one panel, each on its own axis.
import { Button } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useState, type ReactNode } from 'react';
import type { DashboardPayload, SectionKey } from '@/api/management/dashboard';
import { FaIcon, Panel } from '@/ui';
import {
  ACCENT,
  BarsChart,
  DashCell,
  DashGrid,
  GRAPHITE,
  hatchFill,
  NEUTRAL,
  NEUTRAL_LIGHT,
  SERIES,
  STATUS,
  TrendChart,
} from '@/ui/charts';
import {
  completionSeries,
  deliverySeries,
  formatTons,
  intakeSeries,
  ncrSeries,
  netSeries,
  num,
  overtimeSeries,
  pct,
  stamp,
} from './model';
import { DrillLink } from './parts';
import classes from './dashboard.module.css';

const fmtInt = (v: number) => num(v);

interface TrendDef {
  id: string;
  section: SectionKey;
  icon: string;
  title: string;
  link: { href: string; label: string };
}

const DEFS: TrendDef[] = [
  {
    id: 'ob',
    section: 'order_book',
    icon: 'right-left',
    title: 'Giren vs tamamlanan iş (6 ay)',
    link: { href: '/management/reports/overview', label: 'Genel bakış' },
  },
  {
    id: 'dl',
    section: 'delivery',
    icon: 'calendar-check',
    title: 'Zamanında / geç tamamlanan (6 ay)',
    link: { href: '/management/reports/overview', label: 'Genel bakış' },
  },
  {
    id: 'pr',
    section: 'production',
    icon: 'weight-hanging',
    title: 'Haftalık net ilerleme (13 hafta)',
    link: { href: '/management/reports/overview', label: 'Genel bakış' },
  },
  {
    id: 'qs',
    section: 'quality_safety',
    icon: 'triangle-exclamation',
    title: 'Açılan NCR (6 ay)',
    link: { href: '/quality-control/ncrs', label: 'NCR listesi' },
  },
  {
    id: 'mt',
    section: 'material',
    icon: 'truck-ramp-box',
    title: 'Haftalık teslim alınan kalem (13 hafta)',
    link: { href: '/planning/items?is_delivered=true', label: 'Teslim alınanlar' },
  },
  {
    id: 'pp',
    section: 'people',
    icon: 'user-clock',
    title: 'Fazla mesai kişi-saat (6 ay)',
    link: { href: '/general/overtime', label: 'Fazla mesai' },
  },
];

function footerFor(id: string, payload: DashboardPayload): string {
  const s = payload.sections ?? {};
  if (id === 'pr') return '* kısmi hafta';
  if (
    id === 'qs' &&
    s.quality_safety &&
    s.quality_safety.unclassified_pct !== null &&
    s.quality_safety.unclassified_pct !== undefined
  ) {
    return `sınıflandırılmamış ${pct(s.quality_safety.unclassified_pct)}`;
  }
  const mt = s.material;
  if (id === 'mt' && mt && mt.deliveries_week !== null && mt.deliveries_week !== undefined) {
    return `bu hafta ${num(mt.deliveries_week)} · 13 hafta ort. ${num(mt.deliveries_13w_avg)}`;
  }
  return '';
}

function Chart({ id, payload, phone }: { id: string; payload: DashboardPayload; phone: boolean }) {
  const s = payload.sections ?? {};
  switch (id) {
    case 'ob': {
      const data = intakeSeries(s.order_book);
      return (
        <BarsChart
          label="Giren vs tamamlanan iş (6 ay)"
          data={data}
          categoryKey="label"
          categoryLabel="Ay"
          series={[
            { key: 'intake', label: 'Açılan iş', color: ACCENT },
            { key: 'completed', label: 'Tamamlanan iş', color: NEUTRAL },
          ]}
          format={fmtInt}
          axisFormat={fmtInt}
          valueLabels={(v) => (v > 0 ? num(v) : '')}
          height={220}
          tooltipNote={(r) => {
            const a = formatTons(r.intakeKg);
            const b = formatTons(r.completedKg);
            return a || b
              ? [a && `Açılan: ${a}`, b && `Tamamlanan: ${b}`].filter(Boolean).join(' · ')
              : null;
          }}
        />
      );
    }
    case 'dl': {
      const data = completionSeries(s.delivery);
      return (
        <>
          <BarsChart
            label="Zamanında / geç tamamlanan iş adedi (6 ay)"
            data={data}
            categoryKey="label"
            categoryLabel="Ay"
            stacked
            series={[
              { key: 'onTime', label: 'Zamanında', color: STATUS.good },
              { key: 'late', label: 'Geç', color: STATUS.bad, pattern: 'hatch' },
            ]}
            cellFill={(r, ser) =>
              r.small ? (ser.key === 'onTime' ? NEUTRAL_LIGHT : hatchFill(NEUTRAL)) : undefined
            }
            legendExtra={
              data.some((r) => r.small)
                ? [{ label: 'Az veri (5 işten az)', color: NEUTRAL_LIGHT }]
                : []
            }
            format={fmtInt}
            axisFormat={fmtInt}
            height={170}
          />
          <TrendChart
            label="Zamanında tamamlanma oranı (6 ay)"
            data={data}
            categoryKey="label"
            categoryLabel="Ay"
            series={[{ key: 'pct', label: 'Zamanında %', color: GRAPHITE }]}
            referenceLines={[{ value: 85, label: 'Hedef %85', color: STATUS.good }]}
            domain={[0, 100]}
            format={(v) => pct(v, 1)}
            axisFormat={(v) => `%${v}`}
            height={120}
            tooltipNote={(r) => (r.small ? 'az veri' : null)}
          />
        </>
      );
    }
    case 'pr': {
      const data = netSeries(s.production);
      return (
        <BarsChart
          label="Haftalık net ilerleme (13 hafta)"
          data={data}
          categoryKey="label"
          categoryLabel="Hafta"
          series={[{ key: 'net', label: 'Net ilerleme (t)', color: SERIES.blue }]}
          lines={[{ key: 'avg', label: '4 haftalık ortalama', color: GRAPHITE, pattern: 'dashed' }]}
          cellFill={(r) => {
            const color = r.net < 0 ? STATUS.bad : SERIES.blue;
            return r.partial ? hatchFill(color) : color;
          }}
          legendExtra={[
            ...(data.some((r) => r.net < 0) ? [{ label: 'Geri gidiş', color: STATUS.bad }] : []),
            ...(data.some((r) => r.partial)
              ? [{ label: 'Kısmi hafta', color: SERIES.blue, shape: 'hatch' as const }]
              : []),
          ]}
          format={(v) => `${num(v, 1)} t`}
          axisFormat={(v) => `${num(v, 0)} t`}
          valueLabels={phone ? false : (v, r) => (r.partial ? `${num(v, 0)}*` : num(v, 0))}
          height={220}
          tooltipNote={(r) =>
            [
              r.partial ? 'kısmi hafta' : '',
              formatTons(r.grossKg) ? `Brüt: ${formatTons(r.grossKg)}` : '',
            ]
              .filter(Boolean)
              .join(' · ') || null
          }
        />
      );
    }
    case 'qs': {
      const data = ncrSeries(s.quality_safety);
      return (
        <BarsChart
          label="Açılan NCR (6 ay)"
          data={data}
          categoryKey="label"
          categoryLabel="Ay"
          series={[{ key: 'opened', label: 'Açılan NCR', color: ACCENT }]}
          format={fmtInt}
          axisFormat={fmtInt}
          valueLabels={(v) => (v > 0 ? num(v) : '')}
          height={220}
          tooltipNote={(r) =>
            r.per100t === null || r.per100t === undefined
              ? '100 t net başına: —'
              : `100 t net başına: ${num(r.per100t, 1)}`
          }
        />
      );
    }
    case 'mt': {
      const data = deliverySeries(s.material);
      const hasAvg = data.some((r) => r.avg !== null);
      return (
        <TrendChart
          label="Haftalık teslim alınan kalem (13 hafta)"
          data={data}
          categoryKey="label"
          categoryLabel="Hafta"
          area
          series={[
            { key: 'lines', label: 'Teslim alınan kalem', color: SERIES.teal },
            ...(hasAvg
              ? [
                  {
                    key: 'avg',
                    label: '13 haftalık ortalama',
                    color: GRAPHITE,
                    pattern: 'dashed' as const,
                  },
                ]
              : []),
          ]}
          format={fmtInt}
          axisFormat={fmtInt}
          height={220}
        />
      );
    }
    case 'pp': {
      const data = overtimeSeries(s.people);
      return (
        <BarsChart
          label="Fazla mesai kişi-saat (6 ay)"
          data={data}
          categoryKey="label"
          categoryLabel="Ay"
          series={[{ key: 'hours', label: 'Fazla mesai (kişi-saat)', color: ACCENT }]}
          cellFill={(r) => (r.partial ? hatchFill(ACCENT) : undefined)}
          legendExtra={
            data.some((r) => r.partial)
              ? [{ label: 'Kısmi ay', color: ACCENT, shape: 'hatch' }]
              : []
          }
          format={(v) => `${num(v)} sa`}
          axisFormat={(v) => `${num(v)} sa`}
          valueLabels={(v, r) => (v > 0 ? `${num(v)}${r.partial ? '*' : ''}` : '')}
          height={220}
        />
      );
    }
    default:
      return null;
  }
}

function TrendPanel({
  def,
  payload,
  phone,
}: {
  def: TrendDef;
  payload: DashboardPayload;
  phone: boolean;
}) {
  const sec = payload.sections?.[def.section];
  const errors = payload.errors ?? {};
  const at =
    sec && 'generated_at' in sec && sec.generated_at ? `Veri ${stamp(sec.generated_at)}` : '';
  const foot = footerFor(def.id, payload);
  let body: ReactNode;
  if (!sec)
    body = (
      <div className={classes.empty}>
        {errors[def.section] ? 'Bu blok yüklenemedi' : 'Veri yok'}
      </div>
    );
  else body = <Chart id={def.id} payload={payload} phone={phone} />;
  return (
    <Panel
      title={def.title}
      icon={`fas fa-${def.icon}`}
      actions={at ? <span className={classes.stamp}>{at}</span> : null}
      footer={
        <div className={classes.trendFoot}>
          <span>{foot}</span>
          <DrillLink to={def.link.href}>{def.link.label}</DrillLink>
        </div>
      }
    >
      <div data-trend={def.id}>{body}</div>
    </Panel>
  );
}

/** The six charts; on a phone the last three wait behind 'Daha fazla eğilim', as legacy. */
export function Trends({ payload }: { payload: DashboardPayload | undefined }) {
  const phone = useMediaQuery('(max-width: 47.99em)') ?? false;
  const [more, setMore] = useState(false);
  const shown = phone && !more ? DEFS.slice(0, 3) : DEFS;
  return (
    <section aria-labelledby="dash-trends-title" id="dash-trends">
      <h2 className={classes.sectionTitle} id="dash-trends-title">
        <FaIcon icon="fas fa-chart-line" /> Eğilimler{' '}
        <span className={classes.panelSub}>bu ay vs geçen ay · 6 ay / 13 hafta</span>
      </h2>
      <DashGrid>
        {shown.map((def) => (
          <DashCell key={def.id} span={4} halfOnTablet>
            {payload ? (
              <TrendPanel def={def} payload={payload} phone={phone} />
            ) : (
              <Panel title={def.title} icon={`fas fa-${def.icon}`}>
                <div className={classes.skeletonLine} style={{ height: 160 }} />
              </Panel>
            )}
          </DashCell>
        ))}
      </DashGrid>
      {phone && !more ? (
        <Button
          variant="default"
          size="xs"
          mt="sm"
          aria-expanded={false}
          onClick={() => setMore(true)}
        >
          Daha fazla eğilim
        </Button>
      ) : null}
    </section>
  );
}

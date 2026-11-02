import type { OverviewData } from '@/api/reports/overview';
import { Panel } from '@/ui';
import { ACCENT, BarsChart, DashCell, DashGrid, NEUTRAL, valueFormats } from '@/ui/charts';
import {
  activeUsersTotal,
  num,
  numLocale,
  overtimeFromOverview,
  overtimeTeamLabel,
  productionHoursRows,
} from './overviewData';
import { barsHeight, KeyValues, StatGrid } from './parts';
import classes from './overview.module.css';

/** Üretim: department hours (with the previous period), output, task state, active users, overtime. */
export function ProductionTab({ data }: { data: OverviewData }) {
  const m = data.manufacturing ?? {};
  const maint = data.maintenance ?? {};
  const maintUsers = maint.maintenance_active_users ?? m.maintenance_active_users;
  const cmp = data.meta?.compare === true;
  const hours = productionHoursRows(data, cmp);
  const ot = overtimeFromOverview(data);

  const doneOfLeft = (done: unknown, left: unknown) => (
    <>
      <span className={classes.good}>{num(done)}</span> / {num(left)}
    </>
  );

  return (
    <DashGrid>
      <DashCell span={6}>
        <Panel
          title={`Departman saatleri${cmp ? ' — karşılaştırmalı' : ''}`}
          icon="fas fa-chart-bar"
        >
          <BarsChart
            label="Departman saatleri"
            data={hours}
            categoryKey="department"
            categoryLabel="Departman"
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
            categoryWidth={80}
            height={barsHeight(hours.length * (cmp ? 1.6 : 1))}
            format={valueFormats.number(1)}
            valueLabels={(v) => (v !== 0 ? num(v, 1) : '')}
          />
        </Panel>
      </DashCell>
      <DashCell span={6}>
        <Panel title="Üretim özeti" icon="fas fa-clipboard-list">
          <KeyValues
            rows={[
              {
                label: 'Üretilen tonaj (dönem)',
                value: `${numLocale(m.manufactured_tonnage_kg ?? m.manufacturedTonnageKg, 2)} kg`,
              },
              { label: 'Üretken saat (dönem)', value: num(m.total_productive_hours, 1) },
            ]}
          />
        </Panel>
      </DashCell>
      <DashCell span={4}>
        <Panel title="Görev Durumu" icon="fas fa-list-check">
          <StatGrid
            items={[
              {
                label: 'Talaşlı',
                value: doneOfLeft(m.machining_parts_completed, m.machining_parts_remaining),
                sub: 'tamamlanan / kalan',
              },
              {
                label: 'CNC',
                value: doneOfLeft(m.cnc_tasks_completed, m.cnc_tasks_remaining),
                sub: 'tamamlanan / kalan',
              },
              {
                label: 'Bakım',
                value: doneOfLeft(maint.faults_resolved_in_range, maint.faults_open),
                sub: 'çözülen / kalan',
              },
            ]}
          />
          <div className={classes.hint}>* Kalan değerleri güncel snapshot'tır.</div>
        </Panel>
      </DashCell>
      <DashCell span={4}>
        <Panel title="Aktif Kullanıcılar" icon="fas fa-users">
          <StatGrid
            items={[
              { label: 'Kaynak', value: num(m.welding_active_users) },
              { label: 'Talaşlı', value: num(m.machining_active_users) },
              { label: 'CNC', value: num(m.cnc_active_users) },
              { label: 'Bakım', value: num(maintUsers) },
            ]}
          />
          <div style={{ marginTop: 12 }}>
            <StatGrid items={[{ label: 'Toplam', value: num(activeUsersTotal(data)) }]} />
          </div>
        </Panel>
      </DashCell>
      <DashCell span={4}>
        <Panel title="Fazla Mesai" icon="fas fa-user-clock">
          <KeyValues
            rows={[
              { label: 'Talep (dönem)', value: num(ot?.requests_in_range) },
              { label: 'Onaylanan', value: num(ot?.requests_approved_in_range) },
              { label: 'Onaylanan saat', value: numLocale(ot?.total_approved_hours, 1) },
            ]}
          />
          {ot && ot.by_team.length > 0 ? (
            <div className={classes.badges}>
              {ot.by_team.map((t, i) => (
                <span key={i} className={classes.badge}>
                  {overtimeTeamLabel(t.team)}: <strong>{numLocale(t.hours, 1)}</strong> saat
                </span>
              ))}
            </div>
          ) : null}
        </Panel>
      </DashCell>
    </DashGrid>
  );
}

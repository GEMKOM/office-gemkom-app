// Yönetim Paneli (was management/dashboard/): the factory scorecard, live
// strip, exceptions, decision queue, trends and the daily summary.
import { Button, Drawer } from '@mantine/core';
import { useMemo, useState } from 'react';
import { FaIcon, PageHeader, Panel, type PageFigure } from '@/ui';
import { DashCell, DashGrid } from '@/ui/charts';
import { DailySummaryPanel } from './DailySummaryPanel';
import { drawerFor } from './drawer';
import { PILLARS, type PillarId } from './labels';
import { LiveStrip } from './LiveStrip';
import { dots, num, ragWord, shortDate, stamp } from './model';
import { PillarError, PillarGrid, RagDots } from './PillarGrid';
import { pillarContext } from './pillarModels';
import { Chip, HiddenMoneyBadge } from './parts';
import { DecisionsPanel, ExceptionsPanel } from './Queues';
import { Trends } from './Trends';
import { useDashboardData } from './useDashboardData';
import classes from './dashboard.module.css';

function footerText(
  fx: { date?: string | null; age_days?: unknown; rates_available?: boolean } | null | undefined,
): string {
  const f = fx || {};
  const age = f.age_days;
  const kur =
    f.rates_available === false
      ? 'Kur yok'
      : f.date
        ? `Kur ${shortDate(f.date, true)}${age !== null && age !== undefined && Number(age) > 1 ? ` (${Number(age)} gün önce)` : ''}`
        : '';
  return dots(
    'İş günü = Türkiye tatil takvimi',
    kur,
    'DBS alımları sipariş tutarlarına dahil değil',
  );
}

export function ManagementDashboardPage() {
  const data = useDashboardData();
  const { payload, slowStatus, offline } = data;
  const [drawerPillar, setDrawerPillar] = useState<PillarId | null>(null);

  const meta = payload?.meta ?? {};
  const sections = payload?.sections ?? {};
  const errors = payload?.errors ?? {};
  const ctx = useMemo(
    () =>
      payload
        ? pillarContext(
            payload.meta ?? {},
            payload.sections ?? {},
            payload.errors ?? {},
            slowStatus,
          )
        : null,
    [payload, slowStatus],
  );
  const loadFailed = !payload && !!data.error;

  // Pillar verdicts in the band: the scan-first summary of the seven cards.
  const ragCounts = useMemo(() => {
    const counts = { red: 0, orange: 0, green: 0 };
    for (const p of PILLARS) {
      const w = ragWord(payload?.meta?.rag_summary?.[p.id] ?? payload?.sections?.[p.id]?.rag);
      if (w === 'red' || w === 'orange' || w === 'green') counts[w] += 1;
    }
    return counts;
  }, [payload]);

  const stats: PageFigure[] = [
    { id: 'dash-rag-red', label: 'Kritik sütun', value: payload ? num(ragCounts.red) : '—' },
    { id: 'dash-rag-orange', label: 'Dikkat', value: payload ? num(ragCounts.orange) : '—' },
    { id: 'dash-rag-green', label: 'İyi', value: payload ? num(ragCounts.green) : '—' },
    {
      id: 'dash-updated',
      label: 'Son güncelleme',
      value: data.lastFullLoad ? stamp(new Date(data.lastFullLoad)) : '—',
    },
  ];

  const drawer = drawerPillar && ctx ? drawerFor(drawerPillar, ctx) : null;
  const serveStamp = stamp(meta.generated_at);

  return (
    <>
      <PageHeader
        title="Yönetim Paneli"
        subtitle="Fabrikanın genel özeti · bu ay vs geçen ay · canlı şerit 60 sn"
        icon="tachometer-alt"
        backTo="/management"
        stats={stats}
        actions={
          <>
            {payload && meta.money_visible === false ? <HiddenMoneyBadge /> : null}
            {offline ? (
              <span title="Son istek başarısız; önceki veriler gösteriliyor">
                <Chip color="red">bağlantı yok</Chip>
              </span>
            ) : null}
            <Button
              leftSection={<FaIcon icon="fas fa-sync-alt" />}
              onClick={() => void data.refresh()}
              disabled={data.refreshing || data.loading}
              id="refresh-btn"
            >
              Yenile
            </Button>
          </>
        }
      />

      <Panel
        title={
          <>
            Fabrika Karnesi{' '}
            <span className={classes.panelSub}>
              yedi sütun · bu ay vs geçen ay · canlı şerit 60 sn
            </span>
          </>
        }
        icon="fas fa-th-large"
      >
        {payload ? <RagDots meta={meta} /> : null}
        {loadFailed ? (
          <PillarError
            message={`Veriler yüklenemedi: ${data.error?.message || 'bilinmeyen hata'}`}
          />
        ) : (
          <PillarGrid ctx={ctx} onOpen={setDrawerPillar} />
        )}
        <LiveStrip
          live={
            loadFailed
              ? null
              : payload
                ? sections.live === undefined
                  ? null
                  : sections.live
                : undefined
          }
          error={errors.live}
          offline={offline || loadFailed}
        />
      </Panel>

      <div style={{ marginTop: 16 }}>
        <DashGrid>
          <DashCell span={7}>
            <ExceptionsPanel
              exceptions={loadFailed ? null : sections.exceptions}
              loading={data.loading}
              slowStatus={loadFailed ? 'failed' : slowStatus}
              errors={loadFailed ? { exceptions: 'bağlantı yok' } : errors}
              money={ctx?.money ?? (() => '')}
            />
          </DashCell>
          <DashCell span={5}>
            <DecisionsPanel
              decisions={sections.decisions}
              loading={data.loading}
              error={loadFailed || !!errors.decisions}
              serveStamp={serveStamp}
              money={ctx?.money ?? (() => '')}
            />
          </DashCell>
        </DashGrid>
      </div>

      <div style={{ marginTop: 24 }}>
        <Trends payload={loadFailed ? { sections: {}, errors: {} } : payload} />
      </div>

      <div style={{ marginTop: 16 }}>
        <DailySummaryPanel />
      </div>

      {payload ? (
        <div className={classes.footer} id="dash-footer">
          {footerText(meta.fx)}
        </div>
      ) : null}

      <Drawer
        opened={!!drawer}
        onClose={() => setDrawerPillar(null)}
        position="right"
        size="lg"
        title={
          drawer ? (
            <span>
              <FaIcon icon="fas fa-circle-question" /> {drawer.title} — Neden?{' '}
              <span className={classes.stamp}>{drawer.stamp}</span>
            </span>
          ) : null
        }
      >
        {drawer?.body}
      </Drawer>
    </>
  );
}

import { Alert, Badge, Button, Collapse, Group, Tabs, Text } from '@mantine/core';
import { useState, type ReactNode } from 'react';
import type {
  LinearOptimizationGroup,
  LinearOptimizationResult,
  LinearOptimizedBar,
} from '@/api/manufacturing/linearCuttingSessions';
import { FaIcon } from '@/ui';
import { BarCanvas, PassTable } from '../shared/BarDiagram';
import classes from './cuts.module.css';

export function EmptyState({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <div className={classes.empty}>
      <FaIcon icon={icon} />
      <p>{children}</p>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  sub,
}: {
  icon: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className={classes.metric}>
      <div className={classes.metricKey}>
        <FaIcon icon={icon} />
        {label}
      </div>
      <div className={classes.metricValue}>{value}</div>
      <div className={classes.metricSub}>{sub}</div>
    </div>
  );
}

function Chip({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <Badge
      variant="default"
      radius="sm"
      tt="none"
      fw={500}
      leftSection={<FaIcon icon={icon} color="var(--mantine-color-dimmed)" />}
    >
      {children}
    </Badge>
  );
}

function BarCard({
  bar,
  groupStock,
  kerfMm,
  referenceStockMm,
}: {
  bar: LinearOptimizedBar;
  groupStock: number;
  kerfMm: number;
  referenceStockMm: number;
}) {
  const [passesOpen, setPassesOpen] = useState(false);
  const stock = Number(bar.stock_length_mm ?? groupStock) || 0;
  const passes = Array.isArray(bar.passes) ? bar.passes : [];
  const cutsCount = Array.isArray(bar.cuts) ? bar.cuts.length : 0;
  return (
    <div className={classes.barCard}>
      <div className={classes.barHead}>
        <div className={classes.barTitle}>
          <FaIcon icon="fas fa-grip-lines-vertical" color="var(--mantine-color-blue-6)" />
          Bar #{bar.global_bar_index ?? bar.bar_index}
        </div>
        <div className={classes.barMeta}>
          {bar.is_remnant ? (
            <Badge
              color="blue"
              variant="light"
              tt="none"
              leftSection={<FaIcon icon="fas fa-recycle" />}
            >
              Stoktan
            </Badge>
          ) : null}
          <span>
            <FaIcon icon="fas fa-cut" style={{ marginRight: 4 }} />
            {cutsCount} kesim
          </span>
          <span>
            <FaIcon icon="fas fa-ruler-horizontal" style={{ marginRight: 4 }} />
            {stock} mm
          </span>
          <span>
            <FaIcon icon="fas fa-trash-alt" style={{ marginRight: 4 }} />
            {Number(bar.waste_mm ?? 0) || 0} mm fire
          </span>
        </div>
      </div>
      <div className={classes.barBody}>
        <div className={classes.canvasWrap}>
          <BarCanvas bar={bar} kerfMm={kerfMm} referenceStockMm={referenceStockMm} />
        </div>
        {passes.length ? (
          <>
            <Button
              size="xs"
              variant={passesOpen ? 'filled' : 'outline'}
              color="gray"
              leftSection={<FaIcon icon="fas fa-list-ol" />}
              onClick={() => setPassesOpen((v) => !v)}
            >
              Kesim sırası ({passes.length})
            </Button>
            <Collapse expanded={passesOpen}>
              <div style={{ marginTop: 8 }}>
                {passesOpen ? <PassTable passes={passes} /> : null}
              </div>
            </Collapse>
          </>
        ) : null}
      </div>
    </div>
  );
}

function GroupPane({ group }: { group: LinearOptimizationGroup }) {
  const kerf = Number(group.kerf_mm ?? 0) || 0;
  const groupStock = Number(group.stock_length_mm ?? 0) || 0;
  const bars = Array.isArray(group.bars) ? group.bars : [];
  const referenceStockMm = Math.max(
    1,
    ...bars.map((b) => Number(b?.stock_length_mm ?? groupStock) || 0),
  );
  const saved = Number(group.material_saved_by_nesting_mm) || 0;
  return (
    <>
      <Group gap={8} mb={8}>
        <Chip icon="fas fa-ruler-horizontal">{groupStock || '—'} mm</Chip>
        <Chip icon="fas fa-cut">Kerf {kerf}</Chip>
        <Chip icon="fas fa-layer-group">{group.bars_needed ?? '—'} bar</Chip>
        <Chip icon="fas fa-chart-line">
          {group.efficiency_pct != null ? `${group.efficiency_pct}%` : '—'}
        </Chip>
        <Chip icon="fas fa-trash-alt">{group.total_waste_mm ?? '—'} mm fire</Chip>
        {group.total_pass_count != null ? (
          <Chip icon="fas fa-list-ol">{group.total_pass_count} kesim</Chip>
        ) : null}
        {saved > 0 ? (
          <Chip icon="fas fa-compress-arrows-alt">
            Ortak kesim kazancı: {group.material_saved_by_nesting_mm} mm
          </Chip>
        ) : null}
      </Group>
      <Text c="dimmed" size="sm" mb="md">
        {group.item_name || ''}
      </Text>
      <div className={classes.bars}>
        {bars.map((bar, i) => (
          <BarCard
            key={`${bar.global_bar_index ?? bar.bar_index ?? ''}-${i}`}
            bar={bar}
            groupStock={groupStock}
            kerfMm={kerf}
            referenceStockMm={referenceStockMm}
          />
        ))}
      </div>
    </>
  );
}

/** Port of renderOptimization: summary, the backend's warnings, a tab per material. */
export function OptimizationResult({
  result,
}: {
  result: LinearOptimizationResult | null | undefined;
}) {
  if (!result) {
    return (
      <EmptyState icon="fas fa-play-circle">
        Optimizasyon henüz çalıştırılmadı.
        <br />
        Parçaları ekledikten sonra <strong>Optimize Et</strong> butonuna basın.
      </EmptyState>
    );
  }

  const warnings = Array.isArray(result.warnings) ? result.warnings : [];
  const groups = Array.isArray(result.groups) ? result.groups : [];
  const totalBars = groups.reduce((s, g) => s + (Number(g.bars_needed ?? 0) || 0), 0);
  const totalWaste = groups.reduce((s, g) => s + (Number(g.total_waste_mm ?? 0) || 0), 0);
  const eff = groups.map((g) => Number(g.efficiency_pct)).filter((v) => Number.isFinite(v));
  const avgEff = eff.length
    ? Math.round((eff.reduce((a, b) => a + b, 0) / eff.length) * 10) / 10
    : null;

  return (
    <>
      <div className={classes.summary}>
        <Metric
          icon="fas fa-ruler-horizontal"
          label="Bar Sayısı"
          value={totalBars ? String(totalBars) : '—'}
          sub={groups.length ? `${groups.length} profil grubu` : '—'}
        />
        <Metric
          icon="fas fa-chart-line"
          label="Verim"
          value={avgEff != null ? `${avgEff}%` : '—'}
          sub="Gruplar ortalaması"
        />
        <Metric
          icon="fas fa-trash-alt"
          label="Toplam Fire"
          value={groups.length ? `${totalWaste} mm` : '—'}
          sub="Tüm profiller"
        />
      </div>
      {warnings.length ? (
        <Alert color="yellow" mb="md" p="xs">
          {warnings.map((w, i) => (
            <div key={i}>
              <FaIcon icon="fas fa-triangle-exclamation" style={{ marginRight: 4 }} />
              {w}
            </div>
          ))}
        </Alert>
      ) : null}
      {groups.length === 0 ? (
        <EmptyState icon="fas fa-inbox">Optimizasyon sonucu boş döndü.</EmptyState>
      ) : (
        // Panes mount when shown, so each bar canvas is drawn at its real width.
        <Tabs defaultValue="0" keepMounted={false}>
          <Tabs.List mb="md">
            {groups.map((g, i) => (
              <Tabs.Tab key={i} value={String(i)}>
                {String(g.item_name || g.item_code || `Grup ${i + 1}`)}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          {groups.map((g, i) => (
            <Tabs.Panel key={i} value={String(i)}>
              <GroupPane group={g} />
            </Tabs.Panel>
          ))}
        </Tabs>
      )}
    </>
  );
}

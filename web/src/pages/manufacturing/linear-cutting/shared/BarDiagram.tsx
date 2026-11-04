import {
  drawBarCanvas,
  formatPassAngle,
  passKindLabel,
} from '@/pages/manufacturing/linear-cutting/shared/lcGeometry';
import { Group, Portal, Table, Text } from '@mantine/core';
import { useEffect, useMemo, useRef } from 'react';
import type { LinearCuttingTask, LinearPass } from '@/api/manufacturing/linearCutting';
import { FaIcon, StatusBadge } from '@/ui';
import classes from './BarDiagram.module.css';

export interface CanvasBar {
  stock_length_mm?: number | null;
  waste_mm?: number | null;
  is_remnant?: boolean;
  cuts?: unknown[] | null;
  passes?: unknown[] | null;
}

/** The bar drawn by lc-geometry's drawBarCanvas, with its hover tooltip. */
export function BarCanvas({
  bar,
  kerfMm,
  referenceStockMm,
}: {
  bar: CanvasBar;
  kerfMm: number;
  referenceStockMm?: number | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof canvas.getContext !== 'function' || !canvas.getContext('2d')) return;
    let frame = 0;
    let tries = 0;
    // A modal or tab opens with a transition; wait until the canvas has a width.
    const run = () => {
      if (canvas.clientWidth < 50 && tries < 10) {
        tries += 1;
        frame = requestAnimationFrame(run);
        return;
      }
      drawBarCanvas(canvas, bar, { kerfMm, referenceStockMm, tooltipEl: tooltipRef.current });
    };
    frame = requestAnimationFrame(run);
    return () => cancelAnimationFrame(frame);
  }, [bar, kerfMm, referenceStockMm]);

  return (
    <>
      <canvas ref={canvasRef} className={classes.canvas} aria-label="Bar görseli" />
      {/* Outside any modal so position: fixed follows the mouse. */}
      <Portal>
        <div ref={tooltipRef} className={classes.tooltip} />
      </Portal>
    </>
  );
}

function TaskBarCanvas({ task }: { task: LinearCuttingTask }) {
  const bar = useMemo(
    () => ({
      stock_length_mm: task.stock_length_mm,
      waste_mm: task.waste_mm,
      is_remnant: task.is_remnant_bar,
      cuts: task.layout_json,
      passes: task.passes_json,
    }),
    [task],
  );
  return <BarCanvas bar={bar} kerfMm={Number(task.kerf_mm) || 0} />;
}

export function PassTable({ passes }: { passes: LinearPass[] }) {
  return (
    <>
      <Table withTableBorder withColumnBorders fz="sm" verticalSpacing={4}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th ta="center" w={44}>
              Kesim
            </Table.Th>
            <Table.Th>Tür</Table.Th>
            <Table.Th ta="center">Açı</Table.Th>
            <Table.Th
              ta="right"
              title="Kalan barın taze kenarından, alt (yakın) kenar boyunca ölçü"
            >
              Ayar Alt (mm)
            </Table.Th>
            <Table.Th ta="right" title="Kalan barın taze kenarından, üst (uzak) kenar boyunca ölçü">
              Ayar Üst (mm)
            </Table.Th>
            <Table.Th>Çıkan Parça</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {passes.map((pass) => (
            <Table.Tr key={pass.seq}>
              <Table.Td ta="center" fw={700}>
                {pass.seq}
              </Table.Td>
              <Table.Td>{passKindLabel(pass.kind)}</Table.Td>
              <Table.Td ta="center" title="Yön: kesim çizgisinin üst kenara doğru yattığı taraf">
                {formatPassAngle(pass)}
              </Table.Td>
              <Table.Td ta="right">{pass.stop_near_mm ?? '—'}</Table.Td>
              <Table.Td ta="right">{pass.stop_far_mm ?? '—'}</Table.Td>
              <Table.Td>
                {pass.releases ? (
                  pass.releases
                ) : (
                  <Text span c="dimmed" fz="sm">
                    fire parçası
                  </Text>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Text c="dimmed" fz="xs" mt={4}>
        Tür — <strong>Ortak kesim:</strong> tek geçiş iki parçaya hizmet eder (bıçağın iki tarafı da
        parça). <strong>Parça ayırma:</strong> parçayı bitirir; kesimin öbür tarafı parça yüzeyi
        değildir. <strong>Baş kesim:</strong> parça çıkmaz, sonraki parçanın yüzeyini hazırlar
        (çıkan küçük parça firedir).
      </Text>
    </>
  );
}

/** Port of the "Yerleşim" block of the legacy task details modal. */
export function BarLayout({ task }: { task: LinearCuttingTask }) {
  const cuts = task.layout_json ?? [];
  const passes = task.passes_json ?? [];
  if (!cuts.length) {
    return <Text c="dimmed">Bu görev için yerleşim bilgisi bulunamadı.</Text>;
  }
  return (
    <>
      <div className={classes.wrap}>
        <Group justify="space-between" mb={8}>
          <Group gap={6} className={classes.title}>
            Bar #{task.bar_index ?? '—'}
            {task.is_remnant_bar ? <StatusBadge color="yellow">Artık Bar</StatusBadge> : null}
            <Text span c="dimmed" fw={500} fz="sm">
              ({task.stock_length_mm ?? '—'} mm)
            </Text>
          </Group>
          <span className={classes.meta}>
            Fire: <strong>{task.waste_mm ?? '—'} mm</strong> · Kesim: <strong>{cuts.length}</strong>
          </span>
        </Group>
        <TaskBarCanvas task={task} />
        <Text c="dimmed" fz="sm" mt={8}>
          Parçaların üzerine gelince detayları görebilirsiniz.
        </Text>
      </div>
      {passes.length ? (
        <div className={classes.wrap} style={{ marginTop: 12 }}>
          <Group justify="space-between" mb={8}>
            <span className={classes.title}>
              <FaIcon icon="fas fa-list-ol" style={{ marginRight: 4 }} />
              Kesim Sırası
            </span>
            <span className={classes.meta}>
              Toplam: <strong>{passes.length}</strong> kesim
            </span>
          </Group>
          <PassTable passes={passes} />
          <Text c="dimmed" fz="sm" mt={8}>
            Ayar ölçüleri kalan barın taze kesim kenarından ölçülür; doğrudan boy dayamasına
            ayarlanabilir.
          </Text>
        </div>
      ) : null}
    </>
  );
}

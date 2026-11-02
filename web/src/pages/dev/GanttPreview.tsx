import { Button, Group, NumberInput, SegmentedControl, Stack, Text } from '@mantine/core';
import { Profiler, useCallback, useMemo, useState, type ProfilerOnRenderCallback } from 'react';
import { notify, PageHeader, Panel } from '@/ui';
import {
  DAY,
  Gantt,
  HOUR,
  moveRow,
  type GanttBar,
  type GanttBarChange,
  type GanttRow,
  type GanttTone,
} from '@/ui/Gantt';
import { createStore, useStore } from '@/ui/Gantt/store';

// Dev-only: the Gantt with a large synthetic plan, to check behaviour and
// timing. Two layouts: machines as rows (drag bars in time and to another
// machine) and a queue (one task per row, drag rows to reorder).

const TONES: GanttTone[] = ['brand', 'brand', 'brand', 'yellow', 'green', 'red', 'blue'];

/** Deterministic pseudo-random numbers so the data is the same on every load. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function buildPlan(machineCount: number, barsPerMachine: number) {
  const random = rng(42);
  const today = new Date();
  // From ten days ago, spread over the three months on screen.
  const origin = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 10).getTime();
  const rows: GanttRow[] = [];
  const bars: GanttBar[] = [];
  for (let m = 0; m < machineCount; m++) {
    const id = `M${String(m + 1).padStart(3, '0')}`;
    rows.push({
      id,
      label: id,
      sublabel: ['CNC Tezgah', 'Torna', 'Freze', 'Plazma', 'Testere'][m % 5]! + ` ${m + 1}`,
    });
    let t = origin + Math.floor(random() * 5) * DAY + 8 * HOUR;
    for (let b = 0; b < barsPerMachine; b++) {
      const duration = (2 + Math.floor(random() * 30)) * HOUR;
      const tone = TONES[Math.floor(random() * TONES.length)]!;
      const key = `OP-${m + 1}-${b + 1}`;
      bars.push({
        id: key,
        rowId: id,
        start: t,
        end: t + duration,
        label: key,
        title: `${key} · ${rows[m]!.sublabel}`,
        tone,
        locked: tone === 'yellow',
        progress: tone === 'green' ? 100 : tone === 'blue' ? Math.floor(random() * 90) : null,
      });
      t +=
        duration +
        Math.floor(random() * (60 / barsPerMachine)) * DAY +
        Math.floor(random() * 8) * HOUR;
    }
  }
  return { rows, bars };
}

interface Timing {
  mount: number | null;
  lastUpdate: number | null;
  updates: number;
  lastDragCommit: number | null;
  maxDragCommit: number;
}

const timingStore = createStore<Timing>({
  mount: null,
  lastUpdate: null,
  updates: 0,
  lastDragCommit: null,
  maxDragCommit: 0,
});

function TimingReadout({ bars }: { bars: number }) {
  const t = useStore(timingStore, (s) => s);
  const ms = (v: number | null) => (v == null ? '–' : `${v.toFixed(1)} ms`);
  return (
    <Group gap="xl">
      <Text size="sm">
        Çubuk: <b>{bars}</b>
      </Text>
      <Text size="sm">
        İlk render (commit): <b data-testid="gantt-mount-ms">{ms(t.mount)}</b>
      </Text>
      <Text size="sm">
        Son güncelleme: <b>{ms(t.lastUpdate)}</b> ({t.updates})
      </Text>
      <Text size="sm">
        Sürükleme commit (son / en kötü): <b>{ms(t.lastDragCommit)}</b> /{' '}
        <b>{ms(t.maxDragCommit)}</b>
      </Text>
    </Group>
  );
}

const onRender: ProfilerOnRenderCallback = (_id, phase, actualDuration) => {
  // Kept for scripted measurements (see the PR): every commit with its phase.
  const log = ((window as unknown as { __ganttCommits?: unknown[] }).__ganttCommits ??= []);
  log.push({
    phase,
    ms: Math.round(actualDuration * 10) / 10,
    dragging: document.body.dataset.ganttDragging === '1',
  });
  // A drag moves only the ghost bar; those commits are tiny. Bigger updates
  // are data changes (a drop) or navigation.
  timingStore.set((s) => {
    if (phase === 'mount') return { ...s, mount: actualDuration };
    if (document.body.dataset.ganttDragging === '1') {
      return {
        ...s,
        lastDragCommit: actualDuration,
        maxDragCommit: Math.max(s.maxDragCommit, actualDuration),
      };
    }
    return { ...s, lastUpdate: actualDuration, updates: s.updates + 1 };
  });
};

export function GanttPreview() {
  const [layout, setLayout] = useState<'machines' | 'queue'>('machines');
  const [machineCount, setMachineCount] = useState(120);
  const [perMachine, setPerMachine] = useState(6);
  const [seedKey, setSeedKey] = useState(0);

  const initial = useMemo(() => buildPlan(machineCount, perMachine), [machineCount, perMachine]);
  const [edits, setEdits] = useState<{
    key: number;
    bars: Map<string, GanttBar>;
    order: string[] | null;
  }>({
    key: -1,
    bars: new Map(),
    order: null,
  });
  const datasetKey = machineCount * 1000 + perMachine + seedKey * 1e7;
  const current =
    edits.key === datasetKey
      ? edits
      : { key: datasetKey, bars: new Map<string, GanttBar>(), order: null };

  // Edited bars replace their originals; every other bar object stays the same.
  const bars = useMemo(
    () => initial.bars.map((b) => current.bars.get(b.id) ?? b),
    [initial.bars, current.bars],
  );

  const queue = useMemo(() => {
    if (layout !== 'queue') return null;
    const sorted = [...bars].sort((a, b) => a.start - b.start).slice(0, 600);
    const rowsById = new Map(
      sorted.map((b) => [
        b.id,
        { id: b.id, label: b.label ?? b.id, sublabel: b.rowId, locked: b.locked } as GanttRow,
      ]),
    );
    const order = current.order ?? sorted.map((b) => b.id);
    const rows = order.map((id) => rowsById.get(id)).filter((r): r is GanttRow => Boolean(r));
    const queueBars = sorted.map((b) => ({ ...b, rowId: b.id }));
    return { rows, bars: queueBars };
  }, [layout, bars, current.order]);

  const onBarChange = useCallback(
    (change: GanttBarChange) => {
      setEdits((prev) => {
        const base =
          prev.key === datasetKey
            ? prev
            : { key: datasetKey, bars: new Map<string, GanttBar>(), order: null };
        const next = new Map(base.bars);
        const original = initial.bars.find((b) => b.id === change.bar.id)!;
        next.set(change.bar.id, {
          ...(base.bars.get(change.bar.id) ?? original),
          start: change.start,
          end: change.end,
          rowId: layout === 'queue' ? original.rowId : change.rowId,
        });
        return { ...base, bars: next };
      });
      notify.info(`${change.bar.label}: ${new Date(change.start).toLocaleString('tr-TR')}`, {
        autoClose: 1500,
      });
    },
    [datasetKey, initial.bars, layout],
  );

  const onRowReorder = useCallback(
    (rowId: string, targetId: string, position: 'before' | 'after') => {
      if (!queue) return;
      setEdits((prev) => {
        const base =
          prev.key === datasetKey
            ? prev
            : { key: datasetKey, bars: new Map<string, GanttBar>(), order: null };
        return { ...base, order: moveRow(queue.rows, rowId, targetId, position).map((r) => r.id) };
      });
    },
    [queue, datasetKey],
  );

  const dragFlag = {
    onPointerDownCapture: () => (document.body.dataset.ganttDragging = '1'),
    onPointerUpCapture: () =>
      window.setTimeout(() => delete document.body.dataset.ganttDragging, 0),
  };

  return (
    <>
      <PageHeader
        title="Gantt önizleme"
        subtitle="Büyük sentetik veriyle Gantt bileşeni (yalnızca geliştirme)"
        backTo="/react-preview"
      />
      <Stack gap="md">
        <Panel title="Veri" icon="fas fa-sliders">
          <Group align="end" gap="md">
            <SegmentedControl
              value={layout}
              onChange={(v) => setLayout(v as 'machines' | 'queue')}
              data={[
                { value: 'machines', label: 'Makine satırları' },
                { value: 'queue', label: 'Sıra (görev başına satır)' },
              ]}
            />
            <NumberInput
              label="Makine"
              value={machineCount}
              min={1}
              max={2000}
              onChange={(v) => setMachineCount(Number(v) || 1)}
              w={110}
            />
            <NumberInput
              label="Makine başına görev"
              value={perMachine}
              min={1}
              max={60}
              onChange={(v) => setPerMachine(Number(v) || 1)}
              w={160}
            />
            <Button variant="default" onClick={() => setSeedKey((k) => k + 1)}>
              Değişiklikleri sıfırla
            </Button>
          </Group>
          <Text size="sm" c="dimmed" mt="xs">
            Sürükle: zamanda taşı (Makine satırlarında başka makineye de). Kenarlar: süreyi
            değiştir. Sıra görünümünde satırı tutamaçtan sürükle veya Alt+↑/↓. Klavye: ok tuşları,
            Enter, Alt+←/→, Alt+Shift+←/→.
          </Text>
        </Panel>
        <Panel title="Ölçüm" icon="fas fa-stopwatch">
          <TimingReadout bars={(queue?.bars ?? bars).length} />
        </Panel>
        <div {...dragFlag}>
          <Profiler id="gantt" onRender={onRender}>
            <Gantt
              key={`${layout}-${datasetKey}`}
              title="Zaman Çizelgesi"
              rows={queue?.rows ?? initial.rows}
              bars={queue?.bars ?? bars}
              defaultScale="month"
              monthsPerView="auto"
              labelHeader={layout === 'queue' ? 'Görev' : 'Makine'}
              editable={
                layout === 'queue'
                  ? { move: true, resize: true }
                  : { move: true, resize: true, changeRow: true }
              }
              onBarChange={onBarChange}
              onRowReorder={layout === 'queue' ? onRowReorder : undefined}
              onBarOpen={(bar) => notify.info(`Aç: ${bar.label}`, { autoClose: 1200 })}
              height="calc(100vh - 380px)"
            />
          </Profiler>
        </div>
      </Stack>
    </>
  );
}

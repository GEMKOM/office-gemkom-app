import { Box, Button, Group, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { machineCalendarQueryOptions } from '@/api/manufacturing/capacityPlanning';
import {
  machineProductionPlanQueryOptions,
  machiningTaskQueryOptions,
  productionPlanOverviewQueryOptions,
  type ProductionPlanMachine,
  type ProductionPlanTask,
} from '@/api/manufacturing/machiningCapacityReports';
import { formatDate } from '@/lib/format';
import {
  DataTable,
  DetailModal,
  FaIcon,
  notify,
  PageHeader,
  StatusBadge,
  type DataTableColumn,
  type DetailSection,
  type RowAction,
} from '@/ui';
import { Gantt, machineCalendarWindows } from '@/ui/Gantt';
import { performance, productionPlanGantt, type PlanBar } from './productionPlan';

interface MachineRow {
  machine_id: number;
  machine_name: string;
  machine_type_label: string;
  total_estimated_hours: number;
  latest_planned_end: number | null;
  task_count: number;
}

const EMPTY_ROWS: MachineRow[] = [];

const columns: DataTableColumn<MachineRow>[] = [
  {
    key: 'machine_name',
    header: 'Makine Adı',
    sortable: true,
    render: (r) => (
      <Text fw={700} size="sm">
        {r.machine_name}
      </Text>
    ),
  },
  { key: 'machine_type_label', header: 'Makine Tipi', sortable: true },
  {
    key: 'total_estimated_hours',
    header: 'Toplam Tahmini Saat',
    sortable: true,
    render: (r) => (
      <Text fw={600} size="sm">
        <FaIcon icon="fas fa-clock" style={{ marginRight: 6 }} />
        {r.total_estimated_hours.toFixed(1)} saat
      </Text>
    ),
    exportValue: (r) => r.total_estimated_hours,
  },
  {
    key: 'latest_planned_end',
    header: 'En Geç Planlanan Bitiş',
    sortable: true,
    render: (r) => formatDate(r.latest_planned_end),
  },
  {
    key: 'task_count',
    header: 'Görev Sayısı',
    sortable: true,
    render: (r) => (
      <Text fw={600} size="sm" c="var(--gk-red-700)">
        <FaIcon icon="fas fa-tasks" style={{ marginRight: 6 }} />
        {r.task_count}
      </Text>
    ),
  },
];

function statusBadge(task: ProductionPlanTask) {
  if (task.completion_date) return <StatusBadge color="green">Tamamlandı</StatusBadge>;
  if ((task.total_hours_spent ?? 0) > 0) return <StatusBadge color="blue">Çalışıldı</StatusBadge>;
  return <StatusBadge color="orange">Bekliyor</StatusBadge>;
}

const trDate = (v: number | string | null | undefined) =>
  v ? new Date(v).toLocaleDateString('tr-TR') : '-';

function completionSections(task: ProductionPlanTask): DetailSection[] {
  const done = Boolean(task.completion_date);
  const perf = performance(task);
  return [
    {
      title: 'Görev Bilgileri',
      icon: 'fas fa-info-circle',
      fields: [
        { label: 'TI No', value: task.key, copyable: true },
        { label: 'Görev Adı', value: task.name || task.title },
        { label: 'İş No', value: task.job_no || '-' },
        { label: 'Resim No', value: task.image_no || '-' },
        { label: 'Pozisyon No', value: task.position_no || '-' },
        { label: 'Adet', value: task.quantity || '-' },
      ],
    },
    done
      ? {
          title: 'Tamamlanma Bilgileri',
          icon: 'fas fa-check-circle',
          fields: [
            { label: 'Tamamlayan', value: task.completed_by_username || '-' },
            { label: 'Tamamlanma Tarihi', value: trDate(task.completion_date) },
            { label: 'Bitmesi Planlanan Tarih', value: trDate(task.planned_end_ms) },
            { label: 'Makine', value: task.machine_name || '-' },
            { label: 'Tahmini Saat', value: task.estimated_hours || '-' },
            { label: 'Harcanan Saat', value: task.total_hours_spent || '0' },
          ],
        }
      : {
          title: 'Görev Durumu',
          icon: 'fas fa-clock',
          fields: [
            { label: 'Durum', render: statusBadge(task) },
            { label: 'Başlangıç', value: trDate(task.planned_start_ms) },
            { label: 'Bitmesi Planlanan Tarih', value: trDate(task.planned_end_ms) },
            { label: 'Makine', value: task.machine_name || '-' },
            { label: 'Tahmini Saat', value: task.estimated_hours || '-' },
            { label: 'Harcanan Saat', value: task.total_hours_spent || '0' },
          ],
        },
    {
      title: 'Performans Analizi',
      icon: 'fas fa-chart-bar',
      fields: [
        { label: 'Verimlilik', value: perf.efficiency, span: 4 },
        { label: 'Saat Farkı', value: perf.hourDifference, span: 4 },
        { label: 'Tarih Farkı', value: perf.dateDifference, span: 4 },
      ],
    },
  ];
}

/** Legacy showCompletionDataModal, after fetchTaskById. */
function TaskModal({ taskKey, onClose }: { taskKey: string; onClose: () => void }) {
  const task = useQuery(machiningTaskQueryOptions(taskKey));
  useEffect(() => {
    if (!task.isError) return;
    notify.error('Görev verisi yüklenemedi');
    onClose();
  }, [task.isError, onClose]);
  const done = Boolean(task.data?.completion_date);
  return (
    <DetailModal
      opened
      onClose={onClose}
      title={done ? 'Tamamlanma Verileri' : 'Görev Durumu'}
      subtitle={taskKey}
      icon="fas fa-chart-line"
      size="lg"
      loading={task.isPending}
      sections={task.data ? completionSections(task.data) : []}
    />
  );
}

/** The fullscreen "Makine Gantt Çizelgesi" of one machine. */
function MachineGanttModal({ machine, onClose }: { machine: MachineRow; onClose: () => void }) {
  const tasks = useQuery(machineProductionPlanQueryOptions(machine.machine_id));
  const calendar = useQuery(machineCalendarQueryOptions(String(machine.machine_id)));
  const gantt = useMemo(() => productionPlanGantt(tasks.data ?? []), [tasks.data]);
  const workingWindows = useMemo(() => machineCalendarWindows(calendar.data), [calendar.data]);
  const [taskKey, setTaskKey] = useState<string | null>(null);
  const failed = tasks.isError || calendar.isError;
  return (
    <>
      <DetailModal
        opened
        onClose={onClose}
        title="Makine Gantt Çizelgesi"
        subtitle={machine.machine_name}
        icon="fas fa-chart-gantt"
        size="full"
        loading={tasks.isPending || calendar.isPending}
        sections={[
          {
            content: failed ? (
              <Stack align="center" py="lg" gap={4}>
                <FaIcon
                  icon="fas fa-exclamation-triangle"
                  style={{ fontSize: 32, color: '#d99a00' }}
                />
                <Text fw={600}>Gantt Çizelgesi Yüklenemedi</Text>
                <Text c="dimmed" size="sm">
                  Makine verileri yüklenirken bir hata oluştu.
                </Text>
              </Stack>
            ) : (
              <Box>
                <Gantt
                  title={`${machine.machine_name} - Zaman Çizelgesi`}
                  rows={gantt.rows}
                  bars={gantt.bars}
                  defaultScale="month"
                  workingWindows={workingWindows}
                  onBarOpen={(bar: PlanBar) => setTaskKey(bar.task.key)}
                  height="calc(100vh - 260px)"
                />
              </Box>
            ),
          },
        ]}
      />
      {taskKey ? <TaskModal taskKey={taskKey} onClose={() => setTaskKey(null)} /> : null}
    </>
  );
}

/** Port of manufacturing/machining/reports/production-plan (production-plan.js). */
export function ProductionPlanPage() {
  const overview = useQuery(productionPlanOverviewQueryOptions());
  const [ganttFor, setGanttFor] = useState<MachineRow | null>(null);
  const machines = useMemo<ProductionPlanMachine[]>(
    () => overview.data?.machines ?? [],
    [overview.data],
  );
  const totals = overview.data?.overall_totals;

  const rows = useMemo<MachineRow[]>(
    () =>
      machines.map((m) => ({
        machine_id: m.machine_id,
        machine_name: m.machine_name || '-',
        machine_type_label: m.machine_type_label || '-',
        total_estimated_hours: m.totals?.total_estimated_hours || 0,
        latest_planned_end: m.totals?.latest_planned_end_ms || null,
        task_count: m.totals?.task_count || 0,
      })),
    [machines],
  );

  const busiest = useMemo(
    () =>
      machines.reduce<ProductionPlanMachine | undefined>(
        (max, m) =>
          !max || (m.totals?.total_estimated_hours ?? 0) > (max.totals?.total_estimated_hours ?? 0)
            ? m
            : max,
        undefined,
      ),
    [machines],
  );
  const ready = !overview.isPending && !overview.isError;
  const value = (v: string) => (ready ? v : '–');
  const latestEnd = totals?.latest_planned_end_ms
    ? new Date(totals.latest_planned_end_ms).toLocaleDateString('tr-TR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : '-';

  const rowActions = (): RowAction<MachineRow>[] => [
    {
      key: 'view-gantt',
      label: 'Gantt Görünümü',
      icon: 'fas fa-chart-gantt',
      color: 'primary',
      onClick: setGanttFor,
    },
  ];

  return (
    <>
      <PageHeader
        title="Üretim Planı"
        subtitle="Üretim planını görüntüleyin ve yönetin"
        icon="fas fa-chart-gantt"
        backTo="/manufacturing/machining/reports/"
        stats={[
          {
            id: 'busiest-machine',
            label: (
              <span
                title={`Toplam ${busiest?.totals?.total_estimated_hours?.toFixed(1) || 0} saat`}
              >
                En Yoğun Makine
              </span>
            ),
            value: value(busiest?.machine_name || '-'),
          },
          {
            id: 'total-hours',
            label: 'Toplam Tahmini Saat',
            value: value(`${totals?.total_estimated_hours?.toFixed(1) || 0} saat`),
          },
          { id: 'latest-end', label: 'En Geç Planlanan Bitiş', value: value(latestEnd) },
          {
            id: 'task-count',
            label: 'Toplam Görev Sayısı',
            value: value(String(totals?.task_count ?? 0)),
          },
          {
            id: 'machine-count',
            label: 'Toplam Makine Sayısı',
            value: value(String(machines.length)),
          },
        ]}
        actions={
          <Group>
            <Button
              variant="default"
              leftSection={<FaIcon icon="fas fa-sync-alt" />}
              loading={overview.isFetching}
              onClick={() => void overview.refetch()}
            >
              Yenile
            </Button>
          </Group>
        }
      />
      <DataTable
        title="Makine Üretim Planı"
        icon="fas fa-cogs"
        data={overview.isError ? EMPTY_ROWS : rows}
        columns={columns}
        getRowId={(r) => String(r.machine_id)}
        loading={overview.isFetching}
        sortable
        rowActions={rowActions}
        emptyMessage={
          overview.isError ? 'Veri yüklenirken hata oluştu' : 'Üretim planı verisi bulunamadı'
        }
      />
      {ganttFor ? <MachineGanttModal machine={ganttFor} onClose={() => setGanttFor(null)} /> : null}
    </>
  );
}

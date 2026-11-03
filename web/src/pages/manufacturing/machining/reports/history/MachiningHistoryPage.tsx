import { Anchor, Grid } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { machineCalendarQueryOptions } from '@/api/manufacturing/capacityPlanning';
import { timerQueryOptions, type FinishedTimer } from '@/api/manufacturing/finishedTimers';
import { machineTimelineQueryOptions } from '@/api/manufacturing/machiningCapacityReports';
import { machinesQueryOptions } from '@/api/reference/machines';
import {
  DetailModal,
  FaIcon,
  notify,
  PageHeader,
  StatusBadge,
  useUrlFilters,
  type DetailSection,
} from '@/ui';
import {
  Gantt,
  machineCalendarWindows,
  viewRange,
  type GanttScale,
  type GanttView,
} from '@/ui/Gantt';
import { MachineList, type MachineListItem } from '../../../capacity-shared/MachineList';
import { formatDuration, timelineView, type SegmentBar } from './timeline';

const ALL_MACHINES: MachineListItem = { id: 'all', name: 'Tüm Makineler' };
const SCALES: GanttScale[] = ['day', 'week'];

/** Date with seconds, as legacy formatDateTime of history.js. */
function dateTimeSeconds(value: number | string | null | undefined): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('tr-TR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function timerSections(timer: FinishedTimer): DetailSection[] {
  const start = timer.start_time;
  const finish = timer.finish_time;
  const actual =
    start && finish
      ? formatDuration(Math.floor((new Date(finish).getTime() - new Date(start).getTime()) / 1000))
      : '-';
  const estimated = timer.estimated_hours ? `${String(timer.estimated_hours)} saat` : '-';
  const stoppedBy =
    timer.stopped_by_first_name && timer.stopped_by_last_name
      ? `${String(timer.stopped_by_first_name)} ${String(timer.stopped_by_last_name)}`
      : '-';
  return [
    {
      title: 'Görev Bilgileri',
      icon: 'fas fa-tasks',
      fields: [
        { label: 'Görev Adı', value: timer.issue_name, span: 12 },
        { label: 'İş No', value: timer.job_no, span: 12 },
        { label: 'Resim No', value: timer.image_no },
        { label: 'Pozisyon No', value: timer.position_no },
        { label: 'Miktar', value: timer.quantity || '-' },
        { label: 'Makine', value: timer.machine_name },
      ],
    },
    {
      title: 'Zaman Bilgileri',
      icon: 'fas fa-clock',
      fields: [
        {
          label: 'Zamanlayıcı ID',
          span: 12,
          render: (
            <Anchor
              href={`/manufacturing/reports/finished-timers/?module=machining&edit=${timer.id}`}
              target="_blank"
              title="Zamanlayıcıyı düzenlemek için tıklayın"
            >
              <FaIcon icon="fas fa-external-link-alt" style={{ marginRight: 4 }} />
              {timer.id}
            </Anchor>
          ),
        },
        { label: 'Gerçek Süre', value: actual, span: 12 },
        { label: 'Tahmini Süre', value: estimated, span: 12 },
        { label: 'Başlangıç', value: dateTimeSeconds(start), span: 12 },
        { label: 'Bitiş', value: dateTimeSeconds(finish), span: 12 },
        {
          label: 'Durum',
          render: finish ? (
            <StatusBadge color="green">Tamamlandı</StatusBadge>
          ) : (
            <StatusBadge color="yellow">Devam Ediyor</StatusBadge>
          ),
        },
        {
          label: 'Görev Türü',
          render: timer.issue_is_hold_task ? (
            <StatusBadge color="yellow">Bekleme</StatusBadge>
          ) : (
            <StatusBadge color="blue">Üretim</StatusBadge>
          ),
        },
      ],
    },
    {
      title: 'Kullanıcı Bilgileri',
      icon: 'fas fa-user',
      fields: [
        { label: 'Kullanıcı', value: timer.username },
        { label: 'Durduran', value: stoppedBy },
      ],
    },
    {
      title: 'Yorum',
      icon: 'fas fa-comment',
      hidden: !timer.comment,
      fields: [{ label: 'Yorum', value: timer.comment, span: 12 }],
    },
    {
      title: 'Manuel Giriş',
      icon: 'fas fa-edit',
      hidden: !timer.manual_entry,
      content: (
        <span>
          <strong>Manuel Olarak Girildi</strong> - Bu zamanlayıcı manuel olarak sisteme girilmiştir.
        </span>
      ),
    },
  ];
}

function TimerDetailsModal({ timerId, onClose }: { timerId: number; onClose: () => void }) {
  const timer = useQuery(timerQueryOptions('machining', timerId));
  return (
    <DetailModal
      opened
      onClose={onClose}
      title="Zamanlayıcı Detayları"
      subtitle={timer.data ? timer.data.issue_key || 'Bilinmeyen' : '-'}
      icon="fas fa-clock"
      size="lg"
      loading={timer.isPending}
      sections={
        timer.data
          ? timerSections(timer.data)
          : timer.isError
            ? [
                {
                  title: 'Hata',
                  icon: 'fas fa-exclamation-triangle',
                  content: `Zamanlayıcı detayları yüklenirken hata oluştu: ${timer.error instanceof Error ? timer.error.message : ''}`,
                },
              ]
            : []
      }
    />
  );
}

/** Port of manufacturing/machining/reports/history (history.js). */
export function MachiningHistoryPage() {
  const { values, apply } = useUrlFilters({ machine: '' });
  const selectedId = values.machine;
  // Legacy: week view on the current week; changing the period refetches it.
  const [view, setView] = useState<{ scale: GanttScale; anchor: number }>(() => ({
    scale: 'week',
    anchor: Date.now(),
  }));
  const range = viewRange(view.scale, view.anchor);
  const [timerId, setTimerId] = useState<number | null>(null);

  const machinesQuery = useQuery(machinesQueryOptions({ used_in: 'machining' }));
  useEffect(() => {
    if (machinesQuery.isError) notify.error('Makineler yüklenirken hata oluştu');
  }, [machinesQuery.isError, machinesQuery.errorUpdatedAt]);
  const machines = useMemo<MachineListItem[]>(
    () => [
      ALL_MACHINES,
      ...(machinesQuery.data?.results ?? [])
        .map((m) => ({
          id: m.id,
          name: m.name,
          tasks_count: typeof m.tasks_count === 'number' ? m.tasks_count : 0,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    ],
    [machinesQuery.data],
  );
  const selected = machines.find((m) => String(m.id) === selectedId);

  // start_before is the last millisecond of the period, as legacy (23:59:59.999).
  const timeline = useQuery(machineTimelineQueryOptions(selectedId, range.start, range.end - 1));
  useEffect(() => {
    if (timeline.isError) notify.error('Makine geçmişi yüklenirken hata oluştu');
  }, [timeline.isError, timeline.errorUpdatedAt]);
  const data = useMemo(() => timelineView(timeline.data, selectedId), [timeline.data, selectedId]);
  useEffect(() => {
    if (timeline.data && !data) notify.error('Beklenmeyen veri formatı alındı');
  }, [timeline.data, data]);

  const calendar = useQuery(machineCalendarQueryOptions(selectedId));
  useEffect(() => {
    if (calendar.isError) notify.warning('Makine takvimi yüklenirken hata oluştu');
  }, [calendar.isError]);
  const workingWindows = useMemo(
    () => (selectedId === 'all' ? null : (machineCalendarWindows(calendar.data) ?? null)),
    [calendar.data, selectedId],
  );

  const onViewChange = useCallback(
    (next: GanttView) => {
      if (!selectedId) notify.info('Önce bir makine seçin', { autoClose: 2000 });
      setView({ scale: next.scale, anchor: next.anchor });
    },
    [selectedId],
  );

  const onBarOpen = (bar: SegmentBar) => {
    if (bar.timerId) setTimerId(bar.timerId);
    else notify.warning('Bu görev için zamanlayıcı detayları bulunamadı', { autoClose: 3000 });
  };

  const totals = data?.totals ?? { productive_seconds: 0, hold_seconds: 0, idle_seconds: 0 };
  const total = totals.productive_seconds + totals.hold_seconds + totals.idle_seconds;

  return (
    <>
      <PageHeader
        title="Kapasite Geçmişi"
        subtitle="Makine kapasite geçmişini görüntüleyin ve analiz edin"
        icon="fas fa-history"
        backTo="/manufacturing/machining/reports/"
        stats={[
          {
            id: 'productive-time',
            label: 'Üretken Zaman',
            value: formatDuration(totals.productive_seconds),
          },
          { id: 'hold-time', label: 'Bekleme Zamanı', value: formatDuration(totals.hold_seconds) },
          { id: 'idle-time', label: 'Boşta Zaman', value: formatDuration(totals.idle_seconds) },
          { id: 'total-time', label: 'Toplam Zaman', value: formatDuration(total) },
        ]}
      />
      <Grid gap="md">
        <Grid.Col span={{ base: 12, lg: 2 }}>
          <MachineList
            machines={machines}
            selectedId={selectedId}
            onSelect={(m) => String(m.id) !== selectedId && apply({ machine: String(m.id) })}
            loading={machinesQuery.isFetching}
            onRefresh={() => void machinesQuery.refetch()}
            showCount
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 10 }}>
          <Gantt
            title={selected?.name ?? 'Makine Seçin'}
            icon="fas fa-history"
            rows={data?.rows ?? []}
            bars={data?.bars ?? []}
            scales={SCALES}
            scale={view.scale}
            anchor={view.anchor}
            onViewChange={onViewChange}
            onBarOpen={onBarOpen}
            workingWindows={workingWindows}
            labelHeader={selectedId === 'all' ? 'Makine' : 'Görev'}
            loading={Boolean(selectedId) && timeline.isFetching}
            emptyMessage={selectedId ? 'Görev bulunmuyor' : 'Makine seçin'}
          />
        </Grid.Col>
      </Grid>
      {timerId !== null ? (
        <TimerDetailsModal timerId={timerId} onClose={() => setTimerId(null)} />
      ) : null}
    </>
  );
}

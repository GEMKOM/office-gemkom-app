import {
  Button,
  Grid,
  Group,
  NumberInput,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  capacityKeys,
  machineCalendarQueryOptions,
  machiningPlanQueryOptions,
  patchOperationEstimate,
  rescheduleMachiningPlan,
  saveMachiningPlan,
  setOperationLock,
  type MachiningPlanOperation,
  type MachiningPlanSaveItem,
} from '@/api/manufacturing/capacityPlanning';
import { machinesDropdownQueryOptions } from '@/api/manufacturing/finishedTimers';
import { formatDateTime } from '@/lib/format';
import {
  confirm,
  DataTable,
  FaIcon,
  FormModal,
  notify,
  PageHeader,
  Panel,
  StatusBadge,
  useUrlFilters,
  type CellEdit,
  type DataTableColumn,
  type RowMove,
} from '@/ui';
import { Gantt, machineCalendarWindows } from '@/ui/Gantt';
import {
  byPlanOrder,
  machiningGantt,
  UNPLANNED_GROUP,
} from '../../../capacity-shared/ganttAdapters';
import { MachineList, type MachineListItem } from '../../../capacity-shared/MachineList';
import {
  machiningSaveItems,
  moveMachiningTo,
  orderEditor,
  reorderMachining,
} from '../../../capacity-shared/planLogic';
import { SaveStatus, useBeforeUnload, usePlanDraft } from '../../../capacity-shared/usePlanDraft';

const EMPTY: MachiningPlanOperation[] = [];

/** "2026-09-30" -> "30.09.2026" by string split (no timezone drift), as legacy formatDueDate. */
export function formatDueDate(value: string | null | undefined): string {
  if (!value || typeof value !== 'string') return '';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day.slice(0, 2)}.${month}.${year}`;
}

const DUE_SOURCE: Record<string, { label: string; icon: string; title: string }> = {
  part: { label: 'parça', icon: 'fas fa-cube', title: 'Parçanın kendi termini' },
  job_order: { label: 'iş emri', icon: 'fas fa-file-alt', title: 'Bağlı iş emrinin hedef tarihi' },
};

function describeFlag(value: unknown, label: string): string {
  // The reschedule endpoint's flags come back as counts, lists or booleans.
  if (Array.isArray(value)) return value.length ? `${value.length} ${label}` : '';
  if (typeof value === 'number') return value > 0 ? `${value} ${label}` : '';
  return value ? label : '';
}

const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * "Tahmini Saat". Legacy edited it inline in the cell.
 * TODO(DataTable inline editing): move into the cell once DataTable gets inline
 * editing (another session is adding it); until then the cell opens this modal.
 */
function EstimateModal({
  op,
  onClose,
  onSaved,
}: {
  op: MachiningPlanOperation;
  onClose: () => void;
  onSaved: () => void;
}) {
  const original =
    op.estimated_hours == null || op.estimated_hours === '' ? null : num(op.estimated_hours);
  const [value, setValue] = useState<string | number>(original ?? '');
  const mutation = useMutation({
    mutationFn: (hours: number | null) => patchOperationEstimate(op.key, hours),
  });
  return (
    <FormModal
      opened
      size="sm"
      onClose={onClose}
      title="Tahmini Saat"
      subtitle={op.key}
      icon="fas fa-hourglass-half"
      submitting={mutation.isPending}
      onSubmit={async (event) => {
        event.preventDefault();
        const next = value === '' ? null : Number(value);
        if (next !== null && (!Number.isFinite(next) || next < 0)) {
          notify.error('Geçerli bir sayı girin');
          return;
        }
        if (
          next === original ||
          (next !== null && original !== null && Math.abs(next - original) < 0.0001)
        ) {
          onClose();
          return;
        }
        try {
          await mutation.mutateAsync(next);
          notify.success('Tahmini saat güncellendi', { autoClose: 2000 });
          onSaved();
        } catch {
          notify.error('Güncelleme sırasında hata oluştu');
        }
      }}
    >
      <NumberInput
        label="Tahmini Saat"
        min={0}
        step={0.1}
        decimalScale={2}
        value={value}
        onChange={setValue}
        data-autofocus
      />
    </FormModal>
  );
}

/** Port of manufacturing/machining/capacity/planning (planning.js). */
export function MachiningPlanningPage() {
  const queryClient = useQueryClient();
  const { values, apply } = useUrlFilters({ machine: '' });
  const selectedId = values.machine;

  // Legacy fetchMachinesDropdown('machining'), sorted by name.
  const machinesQuery = useQuery(machinesDropdownQueryOptions('machining'));
  useEffect(() => {
    if (machinesQuery.isError) notify.error('Makineler yüklenirken hata oluştu');
  }, [machinesQuery.isError, machinesQuery.errorUpdatedAt]);
  const machines = useMemo<MachineListItem[]>(
    () =>
      [...(machinesQuery.data ?? [])]
        .map((m) => ({ id: m.id, name: m.name }))
        .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [machinesQuery.data],
  );
  const selectedMachine = machines.find((m) => String(m.id) === selectedId);

  const planQuery = useQuery(machiningPlanQueryOptions(selectedId));
  useEffect(() => {
    if (planQuery.isError) notify.error('Operasyonlar yüklenirken hata oluştu');
  }, [planQuery.isError, planQuery.errorUpdatedAt]);
  const calendarQuery = useQuery(machineCalendarQueryOptions(selectedId));
  useEffect(() => {
    if (calendarQuery.isError) notify.warning('Makine takvimi yüklenirken hata oluştu');
  }, [calendarQuery.isError]);
  const workingWindows = useMemo(
    () => machineCalendarWindows(calendarQuery.data),
    [calendarQuery.data],
  );

  const base = planQuery.data ?? EMPTY;
  const queryKey = capacityKeys.machining(selectedId);
  const draft = usePlanDraft<MachiningPlanOperation, MachiningPlanSaveItem[]>({
    scope: selectedId,
    queryKey,
    base,
    save: saveMachiningPlan,
  });
  useBeforeUnload(draft.dirty);
  const ops = draft.rows;
  const tableRows = useMemo(
    () => [...ops.filter((t) => t.in_plan).sort(byPlanOrder), ...ops.filter((t) => !t.in_plan)],
    [ops],
  );
  const gantt = useMemo(() => machiningGantt(ops), [ops]);
  const refetch = useCallback(
    () => queryClient.invalidateQueries({ queryKey }),
    [queryClient, queryKey],
  );

  const selectMachine = async (machine: MachineListItem) => {
    if (String(machine.id) === selectedId) return;
    if (
      draft.dirty &&
      !(await confirm({
        title: 'Kaydedilmemiş değişiklikler',
        message: `${draft.changedCount} operasyonda kaydedilmemiş sıra değişikliği var. Devam ederseniz bu değişiklikler kaybolur.`,
        confirmLabel: 'Değişiklikleri at',
        cancelLabel: 'Vazgeç',
        danger: true,
      }))
    ) {
      return;
    }
    apply({ machine: String(machine.id) });
  };

  // ---- queue order: drag in the table (legacy) or the Gantt, or type a new "Sıra" ----
  // A moved row is locked and an unplanned one joins the queue, as legacy.
  const plannedCount = useMemo(() => ops.filter((t) => t.in_plan).length, [ops]);
  const onOrderEdit = useCallback(
    ({ row, columnKey, value }: CellEdit<MachiningPlanOperation>) => {
      if (columnKey === 'plan_order' && typeof value === 'number')
        draft.edit(moveMachiningTo(ops, row.key, value), [row.key]);
    },
    [draft, ops],
  );
  const onTableReorder = useCallback(
    // The table lists the queue first, so a drop below it is the end of the queue.
    (_ids: string[], move: RowMove) =>
      draft.edit(moveMachiningTo(ops, move.id, move.to + 1), [move.id]),
    [draft, ops],
  );
  const onRowReorder = useCallback(
    (key: string, targetKey: string, position: 'before' | 'after') => {
      let target = targetKey;
      let where = position;
      if (targetKey === UNPLANNED_GROUP) {
        // Dropped on the "Planlanmamış" band: the end of the queue.
        const planned = ops.filter((t) => t.in_plan && t.key !== key).sort(byPlanOrder);
        const last = planned.at(-1);
        if (!last) return;
        target = last.key;
        where = 'after';
      }
      draft.edit(reorderMachining(ops, key, target, where), [key]);
    },
    [draft, ops],
  );

  // ---- save / reschedule / lock ----
  const save = async () => {
    const items = machiningSaveItems(base, ops, draft.marks);
    if (items.length === 0) {
      notify.info('Kaydedilecek değişiklik bulunmuyor');
      return;
    }
    try {
      await draft.commit(items);
      notify.success('Plan kaydedildi; sıra ve tarihler yeniden hesaplandı');
    } catch (error) {
      notify.error(
        `Plan kaydedilirken hata oluştu: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const reschedule = useMutation({ mutationFn: rescheduleMachiningPlan });
  const runReschedule = async () => {
    if (reschedule.isPending) return;
    if (
      draft.dirty &&
      !(await confirm({
        message:
          'Kaydedilmemiş sıra değişiklikleri var. Yeniden planlama bunları geri alır. Devam edilsin mi?',
        danger: true,
      }))
    ) {
      return;
    }
    try {
      const result = await reschedule.mutateAsync();
      const scheduled = Number(result?.scheduled) || 0;
      const lateParts = Array.isArray(result?.late_parts) ? result.late_parts : [];
      const flags = result?.flags ?? {};
      const extras = [
        describeFlag(flags.estimate_missing, 'tahmin eksik'),
        describeFlag(flags.due_missing, 'termin yok'),
      ].filter(Boolean);
      const message = `Yeniden planlandı: ${scheduled} operasyon, ${lateParts.length} geç parça${extras.length ? ` (${extras.join(', ')})` : ''}`;
      notify.show(message, lateParts.length > 0 ? 'info' : 'success', { autoClose: 5000 });
      if (selectedId) {
        draft.discard();
        await refetch();
      }
    } catch (error) {
      notify.error(
        `Yeniden planlama sırasında hata oluştu: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const lock = useMutation({
    mutationFn: ({ key, locked }: { key: string; locked: boolean }) =>
      setOperationLock(key, locked),
  });
  const toggleLock = useCallback(
    async (op: MachiningPlanOperation) => {
      if (lock.isPending) return;
      if (draft.dirty) {
        notify.info('Kilidi değiştirmeden önce planı kaydedin');
        return;
      }
      const wasLocked = Boolean(op.plan_locked);
      try {
        await lock.mutateAsync({ key: op.key, locked: !wasLocked });
        notify.success(
          wasLocked ? 'Kilit açıldı; sıra termine göre yeniden hesaplandı' : 'Sıra kilitlendi',
          { autoClose: 2000 },
        );
        await refetch();
      } catch (error) {
        notify.error(
          `Kilit değiştirilirken hata oluştu: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    [lock, draft.dirty, refetch],
  );

  const [estimateKey, setEstimateKey] = useState<string | null>(null);
  const estimateOp = estimateKey ? ops.find((o) => o.key === estimateKey) : undefined;

  const columns = useMemo<DataTableColumn<MachiningPlanOperation>[]>(
    () => [
      {
        key: 'plan_order',
        header: 'Sıra',
        width: 50,
        sortable: true,
        render: (r) => (
          <Text span size="xs" fw={700} ff="monospace" c="var(--gk-red-700)">
            {r.plan_order || '-'}
          </Text>
        ),
        // An unplanned row can take one more place: the end of the queue.
        editable: orderEditor((r) => plannedCount + (r.in_plan ? 0 : 1)),
      },
      {
        key: 'key',
        header: 'OP No',
        sortable: true,
        render: (r) => (
          <>
            <strong>{r.key}</strong>
            {r.name ? (
              <Text span c="dimmed" size="sm">
                {' '}
                ({r.name})
              </Text>
            ) : null}
          </>
        ),
      },
      { key: 'part_name', header: 'Parça Adı', sortable: true },
      { key: 'part_job_no', header: 'İş No', sortable: true },
      {
        key: 'due_date',
        header: 'Termin',
        sortable: true,
        render: (r) => {
          const formatted = formatDueDate(r.due_date);
          if (!formatted)
            return (
              <Text span c="dimmed">
                -
              </Text>
            );
          const source = r.due_source ? DUE_SOURCE[r.due_source] : undefined;
          return (
            <Group gap={6} wrap="nowrap">
              <span>{formatted}</span>
              {source ? (
                <Text
                  span
                  size="xs"
                  c="dimmed"
                  title={source.title}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  <FaIcon icon={source.icon} style={{ marginRight: 4 }} />
                  {source.label}
                </Text>
              ) : null}
            </Group>
          );
        },
      },
      {
        key: 'slack_hours',
        header: 'Bolluk',
        sortable: true,
        accessor: (r) =>
          r.slack_hours == null || r.slack_hours === '' ? null : Number(r.slack_hours),
        render: (r) => {
          if (r.slack_hours == null || r.slack_hours === '')
            return (
              <Text span c="dimmed">
                -
              </Text>
            );
          const hours = Number(r.slack_hours);
          if (Number.isNaN(hours))
            return (
              <Text span c="dimmed">
                -
              </Text>
            );
          return (
            <Text
              span
              size="sm"
              c={hours < 0 ? 'red' : undefined}
              fw={hours < 0 ? 600 : undefined}
              title="Termin ile (şimdi + parçanın kalan süresi) arasındaki fark"
            >
              {hours.toFixed(1)}h
            </Text>
          );
        },
      },
      {
        key: 'estimated_hours',
        header: 'Tahmini Saat',
        sortable: true,
        render: (r) => (
          <Tooltip label="Düzenlemek için tıklayın">
            <UnstyledButton
              onClick={(e) => {
                e.stopPropagation();
                setEstimateKey(r.key);
              }}
              style={{ borderBottom: '1px dashed var(--gk-line-strong)', fontSize: 14 }}
              aria-label={`${r.key} tahmini saatini düzenle`}
            >
              {r.estimated_hours ? `${r.estimated_hours}h` : '-'}
            </UnstyledButton>
          </Tooltip>
        ),
      },
      {
        key: 'remaining_hours',
        header: 'Kalan Saat',
        sortable: true,
        accessor: (r) => num(r.estimated_hours) - num(r.total_hours_spent),
        render: (r) => {
          const remaining = num(r.estimated_hours) - num(r.total_hours_spent);
          return remaining > 0 ? `${remaining.toFixed(2)}h` : '0h';
        },
      },
      {
        key: 'planned_start_ms',
        header: 'Planlanan Başlangıç',
        sortable: true,
        render: (r) => formatDateTime(r.planned_start_ms),
      },
      {
        key: 'planned_end_ms',
        header: 'Planlanan Bitiş',
        sortable: true,
        render: (r) => formatDateTime(r.planned_end_ms),
      },
      {
        key: 'projected_late',
        header: 'Geç',
        width: 70,
        sortable: true,
        render: (r) =>
          r.projected_late ? (
            <span title="Parçanın tahmini bitişi termini aşıyor">
              <StatusBadge color="red">Geç</StatusBadge>
            </span>
          ) : null,
      },
      {
        key: 'is_running',
        header: 'Durum',
        render: (r) => {
          const flags = Array.isArray(r.plan_flags) ? r.plan_flags : [];
          const parts = [
            r.is_running ? (
              <span key="run" title="Bu operasyonda aktif zamanlayıcı var">
                <StatusBadge color="green">Çalışıyor</StatusBadge>
              </span>
            ) : null,
            flags.includes('estimate_missing') ? (
              <Text
                key="est"
                span
                size="xs"
                c="dimmed"
                title="Tahmini saat girilmemiş; varsayılan süre ile planlandı"
              >
                tahmin yok
              </Text>
            ) : null,
            flags.includes('due_missing') ? (
              <Text
                key="due"
                span
                size="xs"
                c="dimmed"
                title="Termin yok; sıranın sonuna planlandı"
              >
                termin yok
              </Text>
            ) : null,
          ].filter(Boolean);
          return parts.length ? (
            <Stack gap={2} align="flex-start">
              {parts}
            </Stack>
          ) : (
            <Text span c="dimmed">
              -
            </Text>
          );
        },
      },
      {
        key: 'plan_locked',
        header: 'Kilit',
        width: 60,
        sortable: true,
        render: (r) => {
          const locked = Boolean(r.plan_locked);
          return (
            <Button
              size="compact-xs"
              variant={locked ? 'filled' : 'default'}
              color={locked ? 'gray' : undefined}
              title={
                locked
                  ? 'Kilidi aç (sıra termine göre yeniden hesaplanır)'
                  : 'Sırayı kilitle (yeniden planlamada yerinde kalır)'
              }
              aria-label={locked ? `${r.key} kilidini aç` : `${r.key} sırasını kilitle`}
              onClick={(e) => {
                e.stopPropagation();
                void toggleLock(r);
              }}
            >
              <FaIcon icon={locked ? 'fas fa-lock' : 'fas fa-lock-open'} />
            </Button>
          );
        },
      },
    ],
    [toggleLock, plannedCount],
  );

  const loadingRows = Boolean(selectedId) && planQuery.isFetching;
  const figure = (n: number) =>
    selectedId && !planQuery.isPending ? n.toLocaleString('tr-TR') : '–';

  return (
    <>
      <PageHeader
        title="Kapasite Planlayıcı"
        subtitle="Makine kapasitelerini planlayın ve üretim programını oluşturun"
        backTo="/manufacturing/machining/capacity/"
        stats={[
          { id: 'planned-count', label: 'Planlanmış', value: figure(plannedCount) },
          {
            id: 'unplanned-count',
            label: 'Planlanmamış',
            value: figure(ops.length - plannedCount),
          },
          { id: 'changed-count', label: 'Kaydedilmemiş', value: figure(draft.changedCount) },
        ]}
      />
      <Grid gap="md">
        <Grid.Col span={{ base: 12, lg: 2 }}>
          <MachineList
            machines={machines}
            selectedId={selectedId}
            onSelect={(m) => void selectMachine(m)}
            loading={machinesQuery.isFetching}
            onRefresh={() => void machinesQuery.refetch()}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 10 }}>
          <Panel
            title={selectedMachine?.name ?? 'Makine Seçin'}
            icon="fas fa-tasks"
            actions={
              <Group gap="xs">
                <SaveStatus status={draft.status} changedCount={draft.changedCount} />
                <Button
                  size="xs"
                  variant="default"
                  leftSection={<FaIcon icon="fas fa-sync-alt" />}
                  title="Tüm makine kuyruklarını sunucuda termine göre yeniden planla"
                  loading={reschedule.isPending}
                  onClick={() => void runReschedule()}
                >
                  Yeniden Planla
                </Button>
                <Button
                  size="xs"
                  leftSection={<FaIcon icon="fas fa-save" />}
                  disabled={!selectedId || planQuery.isPending}
                  loading={draft.saving}
                  onClick={() => void save()}
                >
                  Planı Kaydet
                </Button>
              </Group>
            }
          >
            <Stack gap="md">
              <Text size="sm" c="dimmed">
                <FaIcon icon="fas fa-info-circle" style={{ marginRight: 6 }} />
                Tarihler termine göre otomatik hesaplanır; sırayı sabitlemek için satırı kilitleyin.
                Sırayı değiştirmek için satırı tablo ya da zaman çizelgesinde tutamağından
                sürükleyin veya Sıra hücresine yeni sırayı yazın; taşınan satır kilitlenir.
              </Text>
              <DataTable
                title="Planlanmış Operasyonlar"
                icon="fas fa-tasks"
                data={selectedId ? tableRows : EMPTY}
                columns={columns}
                getRowId={(r) => r.key}
                loading={loadingRows}
                sortable
                rowStyle={(r) => (r.in_plan ? undefined : { background: '#f1f3f5' })}
                reorder={{ onReorder: onTableReorder }}
                onCellEdit={onOrderEdit}
                onRefresh={() =>
                  selectedId ? void refetch() : notify.warning('Önce bir makine seçin')
                }
                emptyMessage={
                  selectedId ? 'Operasyon bulunamadı' : 'Planlamak için bir makine seçin'
                }
              />
              <Gantt
                title="Zaman Çizelgesi"
                rows={selectedId ? gantt.rows : []}
                bars={selectedId ? gantt.bars : []}
                defaultScale="month"
                onRowReorder={onRowReorder}
                workingWindows={workingWindows}
                loading={loadingRows}
                emptyMessage={
                  selectedId ? 'Planlanmış görev bulunmuyor' : 'Planlamak için bir makine seçin'
                }
              />
            </Stack>
          </Panel>
        </Grid.Col>
      </Grid>
      {estimateOp ? (
        <EstimateModal
          op={estimateOp}
          onClose={() => setEstimateKey(null)}
          onSaved={() => {
            setEstimateKey(null);
            // The server has already rescheduled; refetch unless that would drop an unsaved reorder.
            if (!draft.dirty) void refetch();
          }}
        />
      ) : null}
    </>
  );
}

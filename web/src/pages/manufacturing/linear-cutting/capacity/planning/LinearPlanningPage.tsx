import { Anchor, Button, Grid, Group, Stack } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  capacityKeys,
  cuttingPlanQueryOptions,
  machineCalendarQueryOptions,
  saveCuttingPlan,
  type CuttingPlanFilters,
  type CuttingPlanSaveItem,
  type CuttingPlanTask,
} from '@/api/manufacturing/capacityPlanning';
import {
  linearCuttingTaskQueryOptions,
  type LinearCut,
  type LinearCuttingTask,
} from '@/api/manufacturing/linearCutting';
import { machinesQueryOptions } from '@/api/reference/machines';
import { formatDateTime } from '@/lib/format';
import {
  confirm,
  DataTable,
  DetailModal,
  FaIcon,
  FilterBar,
  notify,
  PageHeader,
  Panel,
  useUrlFilters,
  type CellEdit,
  type DataTableColumn,
  type DetailSection,
  type FilterConfig,
  type RowMove,
} from '@/ui';
import { Gantt, machineCalendarWindows, type GanttBarChange } from '@/ui/Gantt';
import { cuttingGantt, type TaskBar } from '../../../capacity-shared/ganttAdapters';
import { MachineList, type MachineListItem } from '../../../capacity-shared/MachineList';
import {
  cuttingSaveItems,
  moveInQueue,
  orderEditor,
  reorderCutting,
} from '../../../capacity-shared/planLogic';
import { SaveStatus, useBeforeUnload, usePlanDraft } from '../../../capacity-shared/usePlanDraft';

const MODULE = 'linear_cutting';
const EMPTY: CuttingPlanTask[] = [];

const URL_DEFAULTS = { machine: '', session: '', completed: '' };
type FilterKeys = 'session' | 'completed';
type FilterState = Record<FilterKeys, string>;

const filterConfig: FilterConfig<FilterKeys>[] = [
  { type: 'text', key: 'session', label: 'Kesim Planı', placeholder: 'LC-0004' },
  {
    type: 'select',
    key: 'completed',
    label: 'Durum',
    placeholder: 'Tümü',
    searchable: false,
    options: [
      { value: 'false', label: 'Tamamlanmamış' },
      { value: 'true', label: 'Tamamlanan' },
    ],
  },
];

/** Legacy buildFiltersPayload. (Legacy read the values with a method the filter component did not have, so they were never sent.) */
export function linearApiFilters(values: FilterState): CuttingPlanFilters {
  const filters: CuttingPlanFilters = {};
  if (values.session) filters.session = values.session;
  if (values.completed !== '') filters.completed = values.completed;
  return filters;
}

const layoutColumns: DataTableColumn<LinearCut>[] = [
  { key: 'job_no', header: 'İş No', width: '18%', sortable: true },
  { key: 'label', header: 'Parça', width: '32%', sortable: true },
  { key: 'nominal_mm', header: 'Nominal (mm)', width: '16%', sortable: true },
  { key: 'effective_mm', header: 'Effective (mm)', width: '16%', sortable: true },
  { key: 'offset_mm', header: 'Offset (mm)', width: '16%', sortable: true },
];

function linearSections(task: LinearCuttingTask): DetailSection[] {
  const layout = Array.isArray(task.layout_json) ? task.layout_json : [];
  return [
    {
      title: 'Görev Bilgileri',
      icon: 'fas fa-info-circle',
      fields: [
        { label: 'Görev No', value: task.key, span: 4, copyable: true },
        { label: 'Ad', value: task.name, span: 8 },
        {
          label: 'Kesim Planı',
          value: `${task.session} — ${task.session_title || ''}`.trim(),
          span: 6,
        },
        { label: 'Bar', value: task.bar_index, type: 'number', span: 2 },
        { label: 'Malzeme', value: task.item_name || task.material || '-', span: 4 },
        { label: 'Stok (mm)', value: task.stock_length_mm, type: 'number', span: 3 },
        { label: 'Fire (mm)', value: task.waste_mm, type: 'number', span: 3 },
      ],
    },
    {
      title: 'Açıklama',
      icon: 'fas fa-align-left',
      hidden: !task.description,
      fields: [{ label: 'Açıklama', value: task.description, span: 12 }],
    },
    {
      title: 'Kesim Listesi',
      icon: 'fas fa-stream',
      hidden: layout.length === 0,
      content: (
        <DataTable
          data={layout}
          columns={layoutColumns}
          getRowId={(_, i) => String(i)}
          sortable
          striped
          verticalSpacing="xs"
          emptyMessage="Kesim bulunamadı"
        />
      ),
    },
  ];
}

function LinearTaskDetailModal({ taskKey, onClose }: { taskKey: string; onClose: () => void }) {
  const task = useQuery(linearCuttingTaskQueryOptions(taskKey));
  useEffect(() => {
    if (!task.isError) return;
    notify.error('Görev detayı yüklenemedi');
    onClose();
  }, [task.isError, onClose]);
  return (
    <DetailModal
      opened
      onClose={onClose}
      title="Kesim Görevi"
      subtitle={taskKey}
      icon="fas fa-ruler-horizontal"
      size="lg"
      loading={task.isPending}
      sections={task.data ? linearSections(task.data) : []}
    />
  );
}

/** Port of manufacturing/linear-cutting/capacity/planning (planning.js). */
export function LinearPlanningPage() {
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const filterValues = useMemo<FilterState>(
    () => ({ session: values.session, completed: values.completed }),
    [values.session, values.completed],
  );
  const selectedId = values.machine;
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [showUnplanned, setShowUnplanned] = useState(false);

  const machinesQuery = useQuery(machinesQueryOptions({ used_in: 'linear_cutting' }));
  useEffect(() => {
    if (machinesQuery.isError) notify.error('Makineler yüklenemedi');
  }, [machinesQuery.isError, machinesQuery.errorUpdatedAt]);
  const machines = useMemo<MachineListItem[]>(
    () => (machinesQuery.data?.results ?? []).map((m) => ({ id: m.id, name: m.name })),
    [machinesQuery.data],
  );
  const selectedMachine = machines.find((m) => String(m.id) === selectedId);

  const apiFilters = useMemo(() => linearApiFilters(filterValues), [filterValues]);
  const planQuery = useQuery(cuttingPlanQueryOptions(MODULE, selectedId, apiFilters));
  useEffect(() => {
    if (planQuery.isError) notify.error('Plan verisi yüklenemedi');
  }, [planQuery.isError, planQuery.errorUpdatedAt]);
  const calendarQuery = useQuery(machineCalendarQueryOptions(selectedId));
  const workingWindows = useMemo(
    () => machineCalendarWindows(calendarQuery.data),
    [calendarQuery.data],
  );

  const base = planQuery.data ?? EMPTY;
  const queryKey = capacityKeys.cutting(MODULE, selectedId, apiFilters);
  const draft = usePlanDraft<CuttingPlanTask, CuttingPlanSaveItem[]>({
    scope: JSON.stringify(queryKey),
    queryKey,
    base,
    save: (items) => saveCuttingPlan(MODULE, items),
  });
  useBeforeUnload(draft.dirty);
  const tasks = draft.rows;
  const planned = useMemo(
    () =>
      tasks.filter((t) => t.in_plan).sort((a, b) => (a.plan_order ?? 1e9) - (b.plan_order ?? 1e9)),
    [tasks],
  );
  const unplanned = useMemo(() => tasks.filter((t) => !t.in_plan), [tasks]);
  const gantt = useMemo(() => cuttingGantt(tasks), [tasks]);

  const guard = useCallback(async () => {
    if (!draft.dirty) return true;
    return confirm({
      title: 'Kaydedilmemiş değişiklikler',
      message: `${draft.changedCount} görevde kaydedilmemiş plan değişikliği var. Devam ederseniz bu değişiklikler kaybolur.`,
      confirmLabel: 'Değişiklikleri at',
      cancelLabel: 'Vazgeç',
      danger: true,
    });
  }, [draft.dirty, draft.changedCount]);

  const columns = useMemo<DataTableColumn<CuttingPlanTask>[]>(() => {
    const keyLink: DataTableColumn<CuttingPlanTask> = {
      key: 'key',
      header: 'Görev',
      sortable: true,
      render: (r) => (
        <Anchor component="button" type="button" size="sm" onClick={() => setDetailKey(r.key)}>
          {r.key}
        </Anchor>
      ),
    };
    return [
      {
        key: 'plan_order',
        header: '#',
        width: '6%',
        sortable: true,
        render: (r) => String(r.plan_order ?? '-'),
        editable: orderEditor(() => planned.length),
      },
      { ...keyLink, width: '18%' },
      { key: 'name', header: 'Ad', width: '36%', sortable: true },
      {
        key: 'item_name',
        header: 'Malzeme',
        width: '22%',
        sortable: true,
        render: (r) => r.item_name || r.material || '-',
      },
      {
        key: 'planned_start_ms',
        header: 'Başlangıç',
        width: '18%',
        sortable: true,
        render: (r) => formatDateTime(r.planned_start_ms),
      },
    ];
  }, [planned.length]);
  const unplannedColumns = useMemo(
    () => columns.filter((c) => c.key !== 'plan_order' && c.key !== 'planned_start_ms'),
    [columns],
  );

  const onBarChange = useCallback(
    (change: GanttBarChange<TaskBar<CuttingPlanTask>>) =>
      draft.edit(
        new Map([[change.bar.id, { planned_start_ms: change.start, planned_end_ms: change.end }]]),
      ),
    [draft],
  );

  // Queue order: drag in the table or the timeline, or type a new "#" (legacy
  // had neither here; the CNC planner did). Saved with "Planı Kaydet".
  const onOrderEdit = useCallback(
    ({ row, columnKey, value }: CellEdit<CuttingPlanTask>) => {
      if (columnKey === 'plan_order' && typeof value === 'number')
        draft.edit(moveInQueue(planned, row.key, value));
    },
    [draft, planned],
  );
  const onTableReorder = useCallback(
    (_ids: string[], move: RowMove) => draft.edit(moveInQueue(planned, move.id, move.to + 1)),
    [draft, planned],
  );
  const onRowReorder = useCallback(
    (key: string, target: string, position: 'before' | 'after') =>
      draft.edit(reorderCutting(tasks, key, target, position)),
    [draft, tasks],
  );

  const save = async () => {
    if (!selectedId) return;
    const items = cuttingSaveItems(base, tasks);
    if (!items.length) {
      notify.info('Kaydedilecek değişiklik yok');
      return;
    }
    try {
      await draft.commit(items);
      notify.success('Plan kaydedildi');
    } catch (error) {
      console.error(error);
      notify.error('Plan kaydedilemedi');
    }
  };

  const loadingRows = Boolean(selectedId) && planQuery.isFetching;

  return (
    <>
      <PageHeader
        title="Lineer Kesim Kapasite Planlayıcı"
        subtitle="Lineer kesim bar görevlerini planlayın"
        backTo="/planning/linear-cutting/"
      />
      <Stack gap="md">
        <Panel padded>
          <FilterBar
            filters={filterConfig}
            values={filterValues}
            onApply={(next) => void guard().then((ok) => ok && apply(next))}
            onClear={() => void guard().then((ok) => ok && apply({ session: '', completed: '' }))}
          />
        </Panel>
        <Grid gap="md">
          <Grid.Col span={{ base: 12, lg: 2 }}>
            <MachineList
              machines={machines}
              selectedId={selectedId}
              loading={machinesQuery.isFetching}
              onSelect={(m) =>
                void guard().then(
                  (ok) => ok && String(m.id) !== selectedId && apply({ machine: String(m.id) }),
                )
              }
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
                    leftSection={<FaIcon icon="fas fa-eye" />}
                    onClick={() => setShowUnplanned((v) => !v)}
                  >
                    Planlanmamış Görevler
                  </Button>
                  <Button
                    size="xs"
                    color="green"
                    leftSection={<FaIcon icon="fas fa-magic" />}
                    disabled={!selectedId}
                    onClick={() => notify.info('Otomatik planlama yakında')}
                  >
                    Otomatik Planla
                  </Button>
                  <Button
                    size="xs"
                    leftSection={<FaIcon icon="fas fa-save" />}
                    disabled={!selectedId || !draft.dirty}
                    loading={draft.saving}
                    onClick={() => void save()}
                  >
                    Planı Kaydet
                  </Button>
                </Group>
              }
            >
              <Stack gap="md">
                <DataTable
                  title="Planlanmış Görevler"
                  icon="fas fa-tasks"
                  data={selectedId ? planned : EMPTY}
                  columns={columns}
                  getRowId={(r) => r.key}
                  loading={loadingRows}
                  sortable
                  striped
                  reorder={{ onReorder: onTableReorder }}
                  onCellEdit={onOrderEdit}
                  emptyMessage="Görev bulunamadı"
                />
                {showUnplanned ? (
                  <DataTable
                    title="Planlanmamış Görevler"
                    icon="fas fa-inbox"
                    data={selectedId ? unplanned : EMPTY}
                    columns={unplannedColumns}
                    getRowId={(r) => r.key}
                    loading={loadingRows}
                    sortable
                    striped
                    emptyMessage="Görev bulunamadı"
                  />
                ) : null}
                <Gantt
                  title="Zaman Çizelgesi"
                  rows={selectedId ? gantt.rows : []}
                  bars={selectedId ? gantt.bars : []}
                  defaultScale="month"
                  editable={{ move: true, resize: true }}
                  onBarChange={onBarChange}
                  onRowReorder={onRowReorder}
                  onBarOpen={(bar) => setDetailKey(bar.task.key)}
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
      </Stack>
      {detailKey ? (
        <LinearTaskDetailModal taskKey={detailKey} onClose={() => setDetailKey(null)} />
      ) : null}
    </>
  );
}

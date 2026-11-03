import { Anchor, Button, Grid, Group, Stack, Text } from '@mantine/core';
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
import { cncTaskQueryOptions, type CncTask, type CncTaskPart } from '@/api/manufacturing/timers';
import { machinesQueryOptions } from '@/api/reference/machines';
import { formatDate, formatDateTime } from '@/lib/format';
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
  type RowAction,
  type RowMove,
} from '@/ui';
import { Gantt, machineCalendarWindows, type GanttBarChange } from '@/ui/Gantt';
import { cuttingGantt, byPlanOrder, type TaskBar } from '../../../capacity-shared/ganttAdapters';
import { MachineList, type MachineListItem } from '../../../capacity-shared/MachineList';
import { AutoscheduleModal, TaskEditModal } from '../../../capacity-shared/PlanModals';
import {
  addToPlan,
  autoschedule,
  cuttingSaveItems,
  editPlannedTask,
  moveInQueue,
  orderEditor,
  removeFromPlan,
  reorderCutting,
  type AutoscheduleOptions,
} from '../../../capacity-shared/planLogic';
import { SaveStatus, useBeforeUnload, usePlanDraft } from '../../../capacity-shared/usePlanDraft';

const MODULE = 'cnc_cutting';
const EMPTY: CuttingPlanTask[] = [];

const URL_DEFAULTS = {
  machine: '',
  nesting_id: '',
  thickness_mm: '',
  material: '',
  machine_fk: '',
  status: '',
};
type FilterKeys = 'nesting_id' | 'thickness_mm' | 'material' | 'machine_fk' | 'status';
type FilterState = Record<FilterKeys, string>;
const EMPTY_FILTERS: FilterState = {
  nesting_id: '',
  thickness_mm: '',
  material: '',
  machine_fk: '',
  status: '',
};

/** Legacy buildPlanningFilters (machine_fk is taken out and replaces the selection). */
export function cncApiFilters(values: FilterState): CuttingPlanFilters {
  const filters: CuttingPlanFilters = {};
  if (values.nesting_id.trim()) filters.nesting_id = values.nesting_id.trim();
  if (values.material.trim()) filters.material = values.material.trim();
  if (values.thickness_mm.trim()) filters.thickness_mm = values.thickness_mm.trim();
  if (values.status === 'pending') filters.completion_date__isnull = 'true';
  else if (values.status === 'completed') filters.completion_date__isnull = 'false';
  return filters;
}

const hoursText = (v: unknown) => (v ? `${Number.parseFloat(String(v)).toFixed(2)}h` : '-');
const orderBadge = (v: number | null | undefined) => (
  <Text span size="xs" fw={700} ff="monospace" c="var(--gk-red-700)">
    {v || '-'}
  </Text>
);

// TODO(DataTable inline editing): legacy edited Planlanan Başlangıç / Bitiş in
// the cell; they are still edited in "Görev Düzenle" or by dragging the bar.
// "Sıra" is edited in the cell (see the page's plannedColumns).
const baseColumns: DataTableColumn<CuttingPlanTask>[] = [
  {
    key: 'plan_order',
    header: 'Sıra',
    width: 50,
    sortable: true,
    render: (r) => orderBadge(r.plan_order),
  },
  {
    key: 'nesting_id',
    header: 'Nesting ID',
    sortable: true,
    render: (r) => <strong>{r.nesting_id || '-'}</strong>,
  },
  { key: 'key', header: 'CNC No', sortable: true },
  {
    key: 'thickness_mm',
    header: 'Kalınlık (mm)',
    sortable: true,
    render: (r) => (r.thickness_mm != null && r.thickness_mm !== '' ? String(r.thickness_mm) : '-'),
  },
  {
    key: 'quantity',
    header: 'Adet',
    sortable: true,
    render: (r) => (r.quantity ? String(r.quantity) : '-'),
  },
  { key: 'material', header: 'Malzeme', sortable: true },
  { key: 'dimensions', header: 'Ölçüler', sortable: true },
  {
    key: 'estimated_hours',
    header: 'Tahmini Saat',
    sortable: true,
    render: (r) => hoursText(r.estimated_hours),
  },
  {
    key: 'remaining_hours',
    header: 'Kalan Saat',
    sortable: true,
    render: (r) => hoursText(r.remaining_hours),
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
    key: 'finish_time',
    header: 'Bitiş Tarihi',
    sortable: true,
    render: (r) => formatDate(r.finish_time),
  },
];

const unplannedColumns: DataTableColumn<CuttingPlanTask>[] = baseColumns.filter(
  (c) => c.key !== 'planned_start_ms' && c.key !== 'planned_end_ms',
);

const partColumns: DataTableColumn<CncTaskPart>[] = [
  { key: 'job_no', header: 'İş No', width: '25%', sortable: true },
  { key: 'image_no', header: 'Resim No', width: '25%', sortable: true },
  { key: 'position_no', header: 'Pozisyon No', width: '25%', sortable: true },
  {
    key: 'weight_kg',
    header: 'Ağırlık (kg)',
    width: '25%',
    sortable: true,
    render: (p) => (p.weight_kg ? `${p.weight_kg} kg` : '-'),
  },
];

function cncSections(task: CncTask): DetailSection[] {
  const files = task.files ?? [];
  const nestingUrl = typeof task.nesting_file_url === 'string' ? task.nesting_file_url : '';
  return [
    {
      title: 'Kesim Bilgileri',
      icon: 'fas fa-info-circle',
      fields: [
        { label: 'Kesim No', value: task.key, span: 4, copyable: true },
        { label: 'Kesim Adı', value: task.name, span: 4 },
        { label: 'Nesting ID', value: task.nesting_id, span: 4 },
        { label: 'Malzeme', value: task.material, span: 4 },
        { label: 'Boyutlar', value: task.dimensions, span: 4 },
        { label: 'Kalınlık (mm)', value: task.thickness_mm, type: 'number', span: 4 },
        { label: 'Adet', value: task.quantity || '-', span: 4 },
      ],
    },
    {
      title: 'Nesting Dosyası',
      icon: 'fas fa-file',
      hidden: !nestingUrl,
      fields: [{ label: 'Dosya', value: nestingUrl, type: 'url', span: 12 }],
    },
    {
      title: 'Parça Listesi',
      icon: 'fas fa-puzzle-piece',
      content: (
        <DataTable
          data={task.parts ?? []}
          columns={partColumns}
          getRowId={(p, i) => String(p.id ?? i)}
          sortable
          striped
          verticalSpacing="xs"
          emptyMessage="Parça bulunamadı"
        />
      ),
    },
    {
      // Legacy opened these in FileViewer; there is no React viewer yet (as on the CNC dashboard).
      title: 'Ekler',
      icon: 'fas fa-paperclip',
      hidden: files.length === 0,
      content: (
        <Group gap="md">
          {files.map((file, index) => (
            <Anchor
              key={file.id ?? index}
              href={file.file_url}
              target="_blank"
              rel="noopener noreferrer"
              size="sm"
            >
              <FaIcon icon="fas fa-file" style={{ marginRight: 6 }} />
              {file.file_name?.split('/').pop() || 'Dosya'}
            </Anchor>
          ))}
        </Group>
      ),
    },
  ];
}

function CncTaskDetailModal({ taskKey, onClose }: { taskKey: string; onClose: () => void }) {
  const task = useQuery(cncTaskQueryOptions(taskKey));
  useEffect(() => {
    if (!task.isError) return;
    notify.error('Görev detayları gösterilirken hata oluştu');
    onClose();
  }, [task.isError, onClose]);
  return (
    <DetailModal
      opened
      onClose={onClose}
      title="Kesim Detayları"
      subtitle={taskKey}
      icon="fas fa-cut"
      size="lg"
      loading={task.isPending}
      sections={task.data ? cncSections(task.data) : []}
    />
  );
}

/** Port of manufacturing/cnc-cutting/capacity/planning (planning.js). */
export function CncPlanningPage() {
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const filterValues = useMemo<FilterState>(
    () => ({
      nesting_id: values.nesting_id,
      thickness_mm: values.thickness_mm,
      material: values.material,
      machine_fk: values.machine_fk,
      status: values.status,
    }),
    [values.nesting_id, values.thickness_mm, values.material, values.machine_fk, values.status],
  );
  const selectedId = values.machine;

  // ---- machines (legacy fetchMachines(1, 100, { used_in: 'cutting' }), most tasks first) ----
  const machinesQuery = useQuery(machinesQueryOptions({ used_in: 'cutting' }));
  useEffect(() => {
    if (machinesQuery.isError) notify.error('Makineler yüklenirken hata oluştu');
  }, [machinesQuery.isError, machinesQuery.errorUpdatedAt]);
  const machines = useMemo<MachineListItem[]>(
    () =>
      [...(machinesQuery.data?.results ?? [])]
        .map((m) => ({
          id: m.id,
          name: m.name,
          tasks_count: typeof m.tasks_count === 'number' ? m.tasks_count : 0,
        }))
        .sort((a, b) => (b.tasks_count ?? 0) - (a.tasks_count ?? 0)),
    [machinesQuery.data],
  );
  const selectedMachine = machines.find((m) => String(m.id) === selectedId);

  // ---- plan rows (the filter's machine replaces the selection, as legacy) ----
  const machineId = filterValues.machine_fk || selectedId;
  const apiFilters = useMemo(() => cncApiFilters(filterValues), [filterValues]);
  const planQuery = useQuery(cuttingPlanQueryOptions(MODULE, machineId, apiFilters));
  useEffect(() => {
    if (planQuery.isError) notify.error('Görevler yüklenirken hata oluştu');
  }, [planQuery.isError, planQuery.errorUpdatedAt]);
  const calendarQuery = useQuery(machineCalendarQueryOptions(selectedId));
  useEffect(() => {
    if (calendarQuery.isError) notify.warning('Makine takvimi yüklenirken hata oluştu');
  }, [calendarQuery.isError]);
  const calendar = calendarQuery.data ?? null;
  const workingWindows = useMemo(() => machineCalendarWindows(calendar), [calendar]);

  const base = planQuery.data ?? EMPTY;
  const queryKey = capacityKeys.cutting(MODULE, machineId, apiFilters);
  const draft = usePlanDraft<CuttingPlanTask, CuttingPlanSaveItem[]>({
    scope: JSON.stringify(queryKey),
    queryKey,
    base,
    save: (items) => saveCuttingPlan(MODULE, items),
  });
  useBeforeUnload(draft.dirty);
  const tasks = draft.rows;

  const planned = useMemo(() => tasks.filter((t) => t.in_plan).sort(byPlanOrder), [tasks]);
  const unplanned = useMemo(() => tasks.filter((t) => !t.in_plan), [tasks]);
  const gantt = useMemo(() => cuttingGantt(tasks), [tasks]);

  // ---- leaving unsaved edits ----
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

  const selectMachine = async (machine: MachineListItem) => {
    if (String(machine.id) === selectedId) return;
    if (!(await guard())) return;
    apply({ machine: String(machine.id) });
  };

  // ---- edits ----
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [autoOpen, setAutoOpen] = useState(false);
  const [showUnplanned, setShowUnplanned] = useState(false);
  const editingTask = editingKey ? tasks.find((t) => t.key === editingKey) : undefined;

  const onBarChange = useCallback(
    (change: GanttBarChange<TaskBar<CuttingPlanTask>>) =>
      draft.edit(
        new Map([[change.bar.id, { planned_start_ms: change.start, planned_end_ms: change.end }]]),
      ),
    [draft],
  );
  const onRowReorder = useCallback(
    (key: string, target: string, position: 'before' | 'after') =>
      draft.edit(reorderCutting(tasks, key, target, position)),
    [draft, tasks],
  );
  // The table's drag (or Space + arrows on the handle) and the "Sıra" cell
  // both move the row in the queue; the order goes out with "Planı Kaydet".
  const plannedColumns = useMemo(
    () =>
      baseColumns.map((c) =>
        c.key === 'plan_order'
          ? { ...c, editable: orderEditor<CuttingPlanTask>(() => planned.length) }
          : c,
      ),
    [planned.length],
  );
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
  const onBarOpen = useCallback((bar: TaskBar<CuttingPlanTask>) => setEditingKey(bar.task.key), []);

  const runAutoschedule = (options: AutoscheduleOptions) => {
    if (!tasks.some((t) => t.in_plan)) {
      notify.warning('Planlanacak görev bulunmuyor');
      return;
    }
    draft.edit(autoschedule(tasks, options, calendar));
    setAutoOpen(false);
    notify.success('Görevler otomatik olarak planlandı');
  };

  const save = async () => {
    const items = cuttingSaveItems(base, tasks);
    if (items.length === 0) {
      notify.info('Kaydedilecek değişiklik bulunmuyor');
      return;
    }
    try {
      await draft.commit(items);
      notify.success('Plan başarıyla kaydedildi');
    } catch (error) {
      notify.error(
        `Plan kaydedilirken hata oluştu: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const plannedActions = (row: CuttingPlanTask): RowAction<CuttingPlanTask>[] => [
    {
      key: 'details',
      label: 'Detaylar',
      icon: 'fas fa-info-circle',
      color: 'blue',
      onClick: (r) => setDetailKey(r.key),
    },
    {
      key: 'edit',
      label: 'Düzenle',
      icon: 'fas fa-edit',
      color: 'primary',
      onClick: (r) => setEditingKey(r.key),
    },
    {
      key: 'remove',
      label: 'Plandan Çıkar',
      icon: 'fas fa-times',
      color: 'danger',
      onClick: (r) => {
        draft.edit(removeFromPlan(r.key));
        notify.info('Görev plandan çıkarıldı', { autoClose: 2000 });
      },
      hidden: !row.in_plan,
    },
  ];
  const unplannedActions = (): RowAction<CuttingPlanTask>[] => [
    {
      key: 'add',
      label: 'Plana Ekle',
      icon: 'fas fa-plus',
      color: 'green',
      onClick: (r) => {
        draft.edit(addToPlan(tasks, r.key));
        notify.success('Görev plana eklendi', { autoClose: 2000 });
      },
    },
    {
      key: 'details',
      label: 'Detaylar',
      icon: 'fas fa-info-circle',
      color: 'blue',
      onClick: (r) => setDetailKey(r.key),
    },
    {
      key: 'edit-cut',
      label: 'Düzenle',
      icon: 'fas fa-edit',
      color: 'orange',
      // Legacy openEditCutInNewTab.
      onClick: (r) =>
        window.open(
          `/manufacturing/cnc-cutting/cuts/?cut=${encodeURIComponent(r.key)}&mode=edit`,
          '_blank',
        ),
    },
  ];

  const filterConfig = useMemo<FilterConfig<FilterKeys>[]>(
    () => [
      { type: 'text', key: 'nesting_id', label: 'Nesting ID', placeholder: 'Nesting ID' },
      { type: 'text', key: 'thickness_mm', label: 'Kalınlık (mm)', placeholder: 'örn. 10' },
      { type: 'text', key: 'material', label: 'Malzeme', placeholder: 'Malzeme türü' },
      {
        type: 'select',
        key: 'machine_fk',
        label: 'Makine',
        placeholder: 'Tüm Makineler',
        options: machines.map((m) => ({ value: String(m.id), label: m.name })),
      },
      {
        type: 'select',
        key: 'status',
        label: 'Durum',
        placeholder: 'Tümü',
        searchable: false,
        options: [
          { value: 'completed', label: 'Tamamlanan' },
          { value: 'pending', label: 'Bekliyor' },
        ],
      },
    ],
    [machines],
  );

  const applyFilters = async (next: FilterState) => {
    if (!(await guard())) return;
    apply(next);
  };

  const figure = (n: number) =>
    selectedId && !planQuery.isPending ? n.toLocaleString('tr-TR') : '–';
  const loadingRows = Boolean(machineId) && planQuery.isFetching;

  return (
    <>
      <PageHeader
        title="Kapasite Planlayıcı"
        subtitle="Makine kapasitelerini planlayın ve üretim programını oluşturun"
        backTo="/manufacturing/cnc-cutting/capacity/"
        stats={[
          { id: 'planned-count', label: 'Planlanmış', value: figure(planned.length) },
          { id: 'unplanned-count', label: 'Planlanmamış', value: figure(unplanned.length) },
          { id: 'changed-count', label: 'Kaydedilmemiş', value: figure(draft.changedCount) },
        ]}
      />
      <Stack gap="md">
        <Panel padded>
          <FilterBar
            title="Planlama Filtreleri"
            filters={filterConfig}
            values={filterValues}
            onApply={(next) => void applyFilters(next)}
            onClear={() => {
              void applyFilters(EMPTY_FILTERS).then(() => notify.info('Filtreler temizlendi'));
            }}
          />
        </Panel>
        <Grid gap="md">
          <Grid.Col span={{ base: 12, lg: 2 }}>
            <MachineList
              machines={machines}
              selectedId={selectedId}
              onSelect={(m) => void selectMachine(m)}
              loading={machinesQuery.isFetching}
              onRefresh={() => void machinesQuery.refetch()}
              showCount
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
                    leftSection={
                      <FaIcon icon={showUnplanned ? 'fas fa-eye-slash' : 'fas fa-eye'} />
                    }
                    onClick={() => setShowUnplanned((v) => !v)}
                  >
                    {showUnplanned ? 'Planlanmamış Görevleri Gizle' : 'Planlanmamış Görevler'}
                  </Button>
                  <Button
                    size="xs"
                    color="green"
                    leftSection={<FaIcon icon="fas fa-magic" />}
                    disabled={!selectedId || planQuery.isPending}
                    onClick={() => setAutoOpen(true)}
                  >
                    Otomatik Planla
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
                <DataTable
                  title="Planlanmış Görevler"
                  icon="fas fa-tasks"
                  data={machineId ? planned : EMPTY}
                  columns={plannedColumns}
                  getRowId={(r) => r.key}
                  loading={loadingRows}
                  sortable
                  reorder={{ onReorder: onTableReorder }}
                  onCellEdit={onOrderEdit}
                  rowActions={plannedActions}
                  onRefresh={() =>
                    machineId ? void planQuery.refetch() : notify.warning('Önce bir makine seçin')
                  }
                  emptyMessage={machineId ? 'Görev bulunamadı' : 'Planlamak için bir makine seçin'}
                />
                {showUnplanned ? (
                  <DataTable
                    title="Planlanmamış Görevler"
                    icon="fas fa-exclamation-triangle"
                    data={machineId ? unplanned : EMPTY}
                    columns={unplannedColumns}
                    getRowId={(r) => r.key}
                    loading={loadingRows}
                    sortable
                    striped
                    rowActions={unplannedActions}
                    emptyMessage="Planlanmamış görev bulunamadı"
                  />
                ) : null}
                <Gantt
                  title="Zaman Çizelgesi"
                  rows={machineId ? gantt.rows : []}
                  bars={machineId ? gantt.bars : []}
                  defaultScale="month"
                  editable={{ move: true, resize: true }}
                  onBarChange={onBarChange}
                  onRowReorder={onRowReorder}
                  onBarOpen={onBarOpen}
                  workingWindows={workingWindows}
                  loading={loadingRows}
                  emptyMessage={
                    machineId ? 'Planlanmış görev bulunmuyor' : 'Planlamak için bir makine seçin'
                  }
                />
              </Stack>
            </Panel>
          </Grid.Col>
        </Grid>
      </Stack>

      {editingTask ? (
        <TaskEditModal
          task={editingTask}
          onClose={() => setEditingKey(null)}
          onSave={(next) => {
            draft.edit(editPlannedTask(planned, editingTask.key, next));
            setEditingKey(null);
          }}
        />
      ) : null}
      {autoOpen ? (
        <AutoscheduleModal
          hasCalendar={Boolean(calendar?.week_template)}
          onClose={() => setAutoOpen(false)}
          onConfirm={runAutoschedule}
        />
      ) : null}
      {detailKey ? (
        <CncTaskDetailModal taskKey={detailKey} onClose={() => setDetailKey(null)} />
      ) : null}
    </>
  );
}

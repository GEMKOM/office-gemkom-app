// İmalat Planlama (/planning/project-planning/): Excel-style multi-project
// tracking per team / subcontractor, with the plan's Gantt in the same rows.
// Port of planning/project-planning/planning.js; the working copy and its
// rules live in model/store.ts, the sheet in grid/PlanningGrid.tsx.

import {
  Alert,
  Button,
  Checkbox,
  MultiSelect,
  Popover,
  SegmentedControl,
  Select,
  Switch,
  TextInput,
} from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { memo, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { priceTiersQueryOptions } from '@/api/subcontracting/assignments';
import {
  bulkSavePlanning,
  capacityReportQueryOptions,
  CAPACITY_MAX_AGE_MS,
  fetchPlanningBoard,
  saveResourceCapacity,
  weldingPlanningKeys,
} from '@/api/welding/planning';
import { confirm, FaIcon, notify, PageHeader, Panel } from '@/ui';
import { useBeforeUnload } from '@/pages/manufacturing/capacity-shared/usePlanDraft';
import {
  AddJobDialog,
  AssignDialog,
  CustomStageDialog,
  MoveDialog,
  TierDialog,
  WeightDialog,
  type Dialog,
  type NewBlockDraft,
  type TierOption,
} from './BlockDialogs';
import { CapacityDrawer, type LocateTarget } from './CapacityDrawer';
import {
  defaultColumnKeys,
  GRID_ACTIONS,
  GRID_COLUMNS,
  isCellEditable,
  rowBar,
  rowClassName,
  rowTarget,
} from './columns';
import { PlanningGrid, type PlanningGridHandle } from './grid/PlanningGrid';
import { normalizeZoom, type ZoomUnit } from './grid/timeline';
import { readStored, STORAGE_KEYS, writeStored } from './model/constants';
import { fmtKg, round2 } from './model/format';
import type { SheetRow } from './model/rowTypes';
import { isMoveLocked, PlanningStore, resourceKeyOf, type FilterOption } from './model/store';
import type { BlockVM, ResourceVM } from './model/types';
import { exportPlanningPdf } from './pdf';
import s from './ProjectPlanningPage.module.css';

function storedColumnKeys(): string[] {
  try {
    const stored = JSON.parse(readStored(STORAGE_KEYS.columns) || 'null');
    if (Array.isArray(stored) && stored.length) {
      const known = new Set(GRID_COLUMNS.map((c) => c.field));
      return stored.filter((f): f is string => typeof f === 'string' && known.has(f));
    }
  } catch {
    /* fall through to the default set */
  }
  return defaultColumnKeys();
}

function storedNumber(key: string, fallback: number): number {
  return Number(readStored(key)) || fallback;
}

function storedDifficulty(): boolean {
  try {
    return JSON.parse(readStored(STORAGE_KEYS.capacityDifficulty) ?? 'true') !== false;
  } catch {
    return true;
  }
}

function useStore(): PlanningStore {
  const queryClient = useQueryClient();
  const [store] = useState(() => {
    const created = new PlanningStore({
      api: {
        fetchBoard: (includeCompleted) => fetchPlanningBoard(includeCompleted),
        bulkSave: bulkSavePlanning,
      },
      notify: {
        success: (m) => notify.success(m),
        info: (m) => notify.info(m),
        error: (e, fallback) => notify.error(e, { fallback }),
      },
      // The capacity report follows every board reload, once it was opened.
      onBoardLoaded: () => {
        void queryClient.invalidateQueries({ queryKey: [...weldingPlanningKeys.all, 'capacity'] });
      },
    });
    created.sortMode = readStored(STORAGE_KEYS.sort) === 'start' ? 'start' : 'job_no';
    created.viewScope = readStored(STORAGE_KEYS.scope) === 'welding' ? 'welding' : 'full';
    return created;
  });
  useSyncExternalStore(store.subscribe, store.getVersion);
  return store;
}

function ColumnPicker({ keys, onChange }: { keys: string[]; onChange: (keys: string[]) => void }) {
  const active = new Set(keys);
  return (
    <Popover position="bottom-end" shadow="md" withinPortal>
      <Popover.Target>
        <button
          type="button"
          className="pg-action-btn pg-columns-btn"
          title="Sütunları seç"
          aria-label="Sütunları seç"
        >
          <i className="fas fa-table-columns" />
        </button>
      </Popover.Target>
      <Popover.Dropdown p={5}>
        <div className={s.pickerHead}>Sütunlar</div>
        {GRID_COLUMNS.map((c) => (
          <label key={c.field} className={s.pickerItem}>
            <Checkbox
              size="xs"
              color="#8b0000"
              checked={c.always || active.has(c.field)}
              disabled={c.always}
              onChange={(e) => {
                const next = new Set(active);
                GRID_COLUMNS.forEach((col) => col.always && next.add(col.field));
                if (e.currentTarget.checked) next.add(c.field);
                else next.delete(c.field);
                onChange(GRID_COLUMNS.filter((col) => next.has(col.field)).map((col) => col.field));
              }}
            />
            <span>{c.label}</span>
            {c.always ? (
              <i className={`fas fa-lock ${s.pickerLock}`} title="Her zaman açık" />
            ) : null}
          </label>
        ))}
      </Popover.Dropdown>
    </Popover>
  );
}

function ResourceTabs({ store }: { store: PlanningStore }) {
  const strip = store.tabStrip();
  return (
    <div className={s.tabs} role="tablist" aria-label="Kaynaklar">
      <button
        type="button"
        role="tab"
        aria-selected={strip.allActive}
        className={`${s.tab}${strip.allActive ? ` ${s.tabActive}` : ''}`}
        title="Bütün iş emirleri — atanmışlar kaynak sırasıyla, atanmamışlar sonda"
        onClick={() => store.switchResource('all')}
      >
        <i className="fas fa-table-list" />
        <span className={s.tabLabel}>Tümü</span>
        {strip.allCount ? <span className={s.resourceKg}>{strip.allCount} atama</span> : null}
      </button>
      {strip.tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={t.active}
          className={[s.tab, t.active ? s.tabActive : '', t.empty ? s.tabEmpty : '']
            .filter(Boolean)
            .join(' ')}
          title={t.title}
          onClick={() => store.switchResource(t.key)}
        >
          <i className={t.icon} />
          <span className={s.tabLabel}>{t.label}</span>
          {t.remainingKg != null ? (
            <span className={s.resourceKg}>{fmtKg(t.remainingKg)} kg</span>
          ) : null}
          {t.capacity ? (
            <span
              className={`${s.capTabChip} ${t.capacity.level === 'over' ? s.capTabOver : s.capTabTight}`}
              title={t.capacity.title}
            >
              {t.capacity.text}
            </span>
          ) : null}
          {t.dirty ? <span className={s.dirtyDot} title="Kaydedilmemiş değişiklik" /> : null}
        </button>
      ))}
      {strip.emptyToggle ? (
        <button
          type="button"
          className={`${s.tab} ${s.tabMore}`}
          title={
            strip.emptyToggle.showing
              ? 'Boş kaynakları gizle'
              : 'Atanmış işi olmayan kaynakları göster'
          }
          onClick={() => store.toggleShowEmpty()}
        >
          <i className={`fas ${strip.emptyToggle.showing ? 'fa-chevron-left' : 'fa-ellipsis'}`} />
          {strip.emptyToggle.showing ? 'Gizle' : `+${strip.emptyToggle.hidden} boş`}
        </button>
      ) : null}
    </div>
  );
}

interface FilterStripProps {
  store: PlanningStore;
  jobOptions: FilterOption[];
  assigneeOptions: FilterOption[];
  jobNos: string[];
  assignee: string;
  text: string;
  resetCount: number;
  summary: string | null;
  summaryEmpty: boolean;
}

// Memoized on what it shows: a cell edit does not redraw the job picker's
// hundreds of options (the legacy strip rebuilt only when the choices changed).
const FilterStrip = memo(function FilterStrip({
  store,
  jobOptions,
  assigneeOptions,
  jobNos,
  assignee,
  text: initialText,
  resetCount,
  summary,
  summaryEmpty,
}: FilterStripProps) {
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <div className={s.filters}>
      <span className={s.pfTitle}>
        <i className="fas fa-filter" />
        Filtre
      </span>
      <div className={s.pfField}>
        <span className={s.pfLabel}>Ara</span>
        <TextInput
          key={resetCount}
          size="xs"
          w={200}
          aria-label="Ara"
          placeholder="İş emri, başlık, müşteri…"
          autoComplete="off"
          defaultValue={initialText}
          onChange={(e) => {
            const text = e.currentTarget.value;
            // Debounced: re-rendering 700 rows per keystroke would lag.
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => store.setFilters({ text }), 200);
          }}
        />
      </div>
      <div className={s.pfField}>
        <span className={s.pfLabel}>İş Emri</span>
        <MultiSelect
          size="xs"
          w={240}
          aria-label="İş Emri"
          placeholder={jobNos.length ? undefined : 'Tüm iş emirleri'}
          data={jobOptions}
          value={jobNos}
          searchable={jobOptions.length > 7}
          clearable
          maxDropdownHeight={360}
          onChange={(jobNos) => store.setFilters({ jobNos })}
        />
      </div>
      <div className={s.pfField}>
        <span className={s.pfLabel}>Sorumlu</span>
        <Select
          size="xs"
          w={200}
          aria-label="Sorumlu"
          placeholder="Tüm sorumlular"
          data={assigneeOptions}
          value={assignee || null}
          searchable={assigneeOptions.length > 7}
          clearable
          onChange={(v) => store.setFilters({ assignee: v || '' })}
        />
      </div>
      {summary !== null ? (
        <Button
          size="compact-xs"
          variant="subtle"
          color="#8b0000"
          leftSection={<FaIcon icon="fas fa-times" />}
          title="Filtreleri temizle"
          onClick={() => store.clearFilters()}
        >
          Temizle
        </Button>
      ) : null}
      {summary ? (
        <span className={`${s.pfSummary}${summaryEmpty ? ` ${s.pfEmpty}` : ''}`}>{summary}</span>
      ) : null}
    </div>
  );
});

function Warnings({ store }: { store: PlanningStore }) {
  const lines = store.overAllocations();
  if (!lines.length) return null;
  return (
    <Alert
      color="red"
      mb="md"
      title="Aşırı tahsis"
      icon={<FaIcon icon="fas fa-exclamation-triangle" />}
    >
      <ul className={s.warnList}>
        {lines.map((l) => (
          <li key={l.welding_task_id}>
            <strong>{l.job_no}</strong>
            {l.job_order_title ? ` — ${l.job_order_title}` : ''}: atanan{' '}
            <strong>{fmtKg(l.allocated)} kg</strong> &gt; iş ağırlığı {fmtKg(l.total)} kg{' '}
            <span className={s.warnOver}>(+{fmtKg(round2(l.allocated - l.total))} kg)</span>
            <div className={s.warnHolders}>
              {l.holders.length ? (
                l.holders.map((h, i) => (
                  <span key={`${h.name}-${i}`} className={s.warnHolder}>
                    <i className={`fas ${h.type === 'team' ? 'fa-users' : 'fa-industry'}`} />
                    {h.name} <strong>{fmtKg(h.kg)} kg</strong>
                  </span>
                ))
              ) : (
                <span className={s.muted}>atama bulunamadı</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Alert>
  );
}

const Legend = ({ ref }: { ref?: React.Ref<HTMLDivElement> }) => (
  // Two channels at once: the bar is the schedule state, the blue fill inside
  // it is progress.
  <div ref={ref} className={`${s.legend} pg-legend`}>
    <span className={s.legendItem}>
      <i className={`${s.swatch} ${s.swatchOnTime}`} />
      Zamanında
    </span>
    <span className={s.legendItem}>
      <i className={`${s.swatch} ${s.swatchLate}`} />
      Gecikmiş
    </span>
    <span className={s.legendItem}>
      <i className={`${s.swatch} ${s.swatchHold}`} />
      Beklemede
    </span>
    <span className={s.legendItem}>
      <i className={`${s.swatch} ${s.swatchProgress}`} />
      Tamamlanan kısım
    </span>
  </div>
);

export function ProjectPlanningPage() {
  const store = useStore();
  const queryClient = useQueryClient();
  const gridRef = useRef<PlanningGridHandle>(null);
  const legendRef = useRef<HTMLDivElement>(null);

  const [zoom, setZoom] = useState<ZoomUnit>(() => normalizeZoom(readStored(STORAGE_KEYS.zoom)));
  const [gridWidth, setGridWidth] = useState(() => storedNumber(STORAGE_KEYS.gridWidth, 560));
  const [columnKeys, setColumnKeys] = useState(storedColumnKeys);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [pdfProgress, setPdfProgress] = useState<string | null>(null);

  // Kapasite drawer: fetched when first opened, never on board load.
  const [capacityOpen, setCapacityOpen] = useState(false);
  const [capacityWanted, setCapacityWanted] = useState(false);
  const [months, setMonths] = useState(() => storedNumber(STORAGE_KEYS.capacityMonths, 6));
  const [difficulty, setDifficulty] = useState(storedDifficulty);
  const capacity = useQuery({
    ...capacityReportQueryOptions(months, difficulty),
    enabled: capacityWanted,
  });

  useEffect(() => {
    void store.load();
  }, [store]);

  // The grid decorations read the latest report; they cover the SAVED plan.
  useEffect(() => {
    if (capacity.data) store.setCapacityReport(capacity.data);
  }, [store, capacity.data]);

  const dirty = store.hasUnsavedChanges();
  useBeforeUnload(dirty);

  const rows = store.sheetRows();
  const collapsed = store.collapsedForGrid();
  const columns = useMemo(() => {
    const keys = new Set(columnKeys);
    return GRID_COLUMNS.filter((c) => c.always || keys.has(c.field));
  }, [columnKeys]);

  const applyZoom = (next: ZoomUnit) => {
    writeStored(STORAGE_KEYS.zoom, next);
    setZoom(next);
  };

  const confirmDiscard = (message: string) =>
    !dirty
      ? Promise.resolve(true)
      : confirm({ title: 'Kaydedilmemiş değişiklikler', message, confirmLabel: 'Devam' });

  const lateBlocks = capacity.data?.summary?.late_blocks || 0;
  const filterSummary = store.filterSummary();

  // ---- actions -------------------------------------------------------------

  const fetchTiers = async (jobNo: string) => {
    const tiers = await queryClient.fetchQuery(
      priceTiersQueryOptions({ job_order: jobNo, ordering: 'name' }),
    );
    return tiers.filter((t) => t.tier_type === 'welding');
  };

  const noTiers = () =>
    notify.error(
      'Bu iş için kaynak fiyat kademesi bulunamadı. Önce planlamadan fiyat kademesi tanımlayın.',
    );

  const submitNewBlock = async (draft: NewBlockDraft) => {
    const task = store.weldingTasks.find((t) => t.welding_task_id === draft.weldingTaskId);
    if (!task) return;
    const push = (priceTier: number | null) =>
      store.pushNewBlock({
        resource: draft.resource,
        welding_task: task,
        allocated_weight_kg: draft.allocated_weight_kg,
        notes: draft.notes,
        price_tier: priceTier,
      });
    if (draft.resource.resource_type !== 'subcontractor') {
      setDialog(null);
      push(null);
      return;
    }
    // Tier is mandatory for subcontractor assignments: pick it now.
    setDialog(null);
    try {
      const tiers: TierOption[] = (await fetchTiers(task.job_no)).map((t) => ({
        value: String(t.id),
        label: `${t.name} — ${t.price_per_kg} ${t.currency}/kg (kalan ${t.remaining_weight_kg} kg)`,
      }));
      if (!tiers.length) return noTiers();
      setDialog({
        kind: 'tier',
        title: 'Fiyat Kademesi',
        help: 'Taşeron ataması hakedişe dahildir; fiyat kademesi zorunludur.',
        tiers,
        onPick: (tierId) => {
          setDialog(null);
          push(tierId);
        },
      });
    } catch (e) {
      notify.error(e);
    }
  };

  const submitMove = async (block: BlockVM, res: ResourceVM) => {
    setDialog(null);
    if (res.resource_type !== 'subcontractor') {
      store.applyMove(block, res, null);
      return;
    }
    // A subcontractor destination re-prices the work: tier first.
    try {
      const kg = Number(block.allocated_weight_kg || 0);
      const currentTierId = block.price_tier ? Number(block.price_tier.id) : null;
      // Whether the block fits is the decision here, so each tier says so.
      const tiers = (await fetchTiers(block.job_no)).map((t) => {
        // A block that already sits on this tier frees its own kg.
        const free = Number(t.remaining_weight_kg) + (Number(t.id) === currentTierId ? kg : 0);
        const short = round2(kg - free);
        const shown = Math.max(free, 0);
        return {
          value: String(t.id),
          fits: short <= 0,
          label:
            `${t.name} — ${t.price_per_kg} ${t.currency}/kg` +
            (short <= 0
              ? ` (${fmtKg(shown)} kg boş)`
              : ` (${fmtKg(shown)} kg boş — ${fmtKg(short)} kg eksik)`),
        };
      });
      if (!tiers.length) return noTiers();
      tiers.sort((a, b) => (b.fits ? 1 : 0) - (a.fits ? 1 : 0));
      setDialog({
        kind: 'tier',
        title: 'Fiyat Kademesi',
        help:
          `Taşınan iş ${fmtKg(kg)} kg. Taşeron ataması hakedişe dahildir; fiyat kademesi zorunludur.` +
          (tiers.some((t) => t.fits)
            ? ''
            : ' Hiçbir kademede bu blok kadar yer yok — iş emrinin fiyatlanmamış ağırlığı yetiyorsa kademe kaydederken' +
              ' büyütülür, yetmiyorsa taşıma reddedilir.'),
        tiers,
        onPick: (tierId) => {
          setDialog(null);
          store.applyMove(block, res, tierId);
        },
      });
    } catch (e) {
      notify.error(e);
    }
  };

  const openAddJob = () => {
    const res = store.activeResource();
    if (!res) {
      if (store.onAllTab()) {
        notify.info(
          'Tümü sekmesinde atama, "Atanmamış" bölümündeki satırların ata düğmesiyle yapılır — ya da önce bir kaynak sekmesi seçin.',
        );
      }
      return;
    }
    if (!store.weldingTaskOptions().length) {
      notify.error(
        'Atanabilir kaynak işi yok: işlerin toplam ağırlığı tanımlı ve atanmamış ağırlığı kalmış olmalı.',
      );
      return;
    }
    setDialog({ kind: 'add', resourceKey: resourceKeyOf(res) });
  };

  const onAction = (action: string, row: SheetRow) => {
    const block = store.findBlock(row.blockRef);
    if (action === 'create-stages' && row.blockRef) store.createStages(row.blockRef);
    else if (action === 'add-custom' && row.blockRef)
      setDialog({ kind: 'stage', blockRef: row.blockRef });
    else if (action === 'edit-weight' && block) {
      if (block.is_billed) notify.error('Hakediş kesilmiş atamanın ağırlığı değiştirilemez.');
      else setDialog({ kind: 'weight', blockRef: block.key });
    } else if (action === 'delete-block' && block) {
      if (block.is_billed) {
        notify.error('Hakediş kesilmiş atama silinemez.');
        return;
      }
      void confirm({
        title: 'Atama Sil',
        message: `${block.job_no} — ${fmtKg(block.allocated_weight_kg)} kg atamasını silmek istediğinize emin misiniz?`,
        description: 'Atama, kaynak alt görevi ve tüm aşamaları birlikte silinir.',
        confirmLabel: 'Sil',
        danger: true,
      }).then((ok) => ok && store.deleteBlock(block));
    } else if (action === 'delete-stage') {
      const stage = store.stageOf(row);
      if (!stage) return;
      void confirm({
        title: 'Aşama Sil',
        message:
          `"${stage.title}" aşamasını silmek istediğinize emin misiniz?` +
          (Number(stage.progress || 0) > 0
            ? ` (Üzerinde %${stage.progress} ilerleme var — silinince blok yüzdesinden düşer.)`
            : '') +
          (stage.is_default ? ' Varsayılan aşama gerekirse bloktan yeniden oluşturulabilir.' : ''),
        confirmLabel: 'Sil',
        danger: true,
      }).then((ok) => ok && store.deleteStage(row, stage));
    } else if (action === 'assign-job' && row.welding_task_id != null) {
      setDialog({ kind: 'assign', weldingTaskId: row.welding_task_id });
    } else if (action === 'move-block' && block) {
      // Say why instead of doing nothing: both refusals are also the server's.
      if (block.isNew) {
        notify.info('Bu blok henüz kaydedilmedi — önce Kaydet, sonra taşıyın.');
        return;
      }
      if (isMoveLocked(block)) {
        notify.error('Hakedişe girmiş atama taşınamaz — kalan işi yeni bir atamayla verin.');
        return;
      }
      const currentKey = `${block.resource_type}-${block.resource_id}`;
      if (!store.resources.some((r) => resourceKeyOf(r) !== currentKey)) return;
      setDialog({ kind: 'move', blockRef: block.key });
    }
  };

  // "Göster" in the drawer: clear a filter that hides the job, switch to the
  // resource's sheet, unfold the job, pulse the row.
  const onLocate = ({ blockKey, resourceKey, jobNo }: LocateTarget) => {
    if (store.hasActiveFilter()) store.clearFilters();
    if (jobNo) store.showJob(jobNo);
    if (resourceKey && resourceKey !== store.activeResourceKey) store.switchResource(resourceKey);
    window.requestAnimationFrame(() => {
      const current = store.sheetRows();
      const blockRow = blockKey
        ? current.find(
            (r) => r.key === `${blockKey}-block` || r.key.endsWith(`::${blockKey}-block`),
          )
        : undefined;
      const row = blockRow || current.find((r) => r.kind === 'group' && r.job_no === jobNo);
      if (row) gridRef.current?.scrollToRow(row.key, { pulse: true });
    });
  };

  const toggleCapacity = () => {
    if (capacityOpen) {
      setCapacityOpen(false);
      return;
    }
    setCapacityOpen(true);
    if (!capacityWanted) setCapacityWanted(true);
    else if (capacity.dataUpdatedAt && Date.now() - capacity.dataUpdatedAt > CAPACITY_MAX_AGE_MS)
      void capacity.refetch();
  };

  const refreshCapacity = () => {
    void capacity.refetch().then((r) => {
      if (r.error) notify.error(r.error);
    });
  };

  const exportPdf = async () => {
    const res = store.activeResource();
    const tab = store.onAllTab() ? 'Tümü' : res ? res.display_name || res.name : '';
    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    setPdfProgress('');
    try {
      const out = await exportPlanningPdf({
        rows,
        collapsed,
        columns,
        zoom,
        bar: rowBar,
        target: rowTarget,
        rowClassName,
        isNonWorkingDay: store.calendar.isNonWorkingDay,
        title: 'İmalat Planlama',
        subtitle: tab,
        context: store.exportContextText(),
        fileName: `İmalat Planlama - ${tab || 'Plan'} - ${stamp}`,
        legend: legendRef.current,
        // A 20-page board takes a moment per page: count them off.
        onProgress: (done, total) => setPdfProgress(`${done}/${total}`),
      });
      notify.success(`PDF indirildi — ${out.pages} sayfa, ${out.rows} satır.`);
    } catch (error) {
      console.error('PDF export failed:', error);
      notify.error(error, { fallback: 'PDF oluşturulamadı.' });
    } finally {
      setPdfProgress(null);
    }
  };

  // ---- render --------------------------------------------------------------

  const dialogNode = (() => {
    if (!dialog) return null;
    const close = () => setDialog(null);
    switch (dialog.kind) {
      case 'add': {
        const res = store.resources.find((r) => resourceKeyOf(r) === dialog.resourceKey);
        if (!res) return null;
        return (
          <AddJobDialog
            onClose={close}
            resource={res}
            options={store.weldingTaskOptions()}
            onSubmit={(draft) => void submitNewBlock(draft)}
          />
        );
      }
      case 'assign':
        return (
          <AssignDialog
            store={store}
            onClose={close}
            weldingTaskId={dialog.weldingTaskId}
            onSubmit={(draft) => void submitNewBlock(draft)}
          />
        );
      case 'move': {
        const block = store.findBlock(dialog.blockRef);
        if (!block) return null;
        return (
          <MoveDialog
            store={store}
            onClose={close}
            blockRef={dialog.blockRef}
            onSubmit={(res) => void submitMove(block, res)}
          />
        );
      }
      case 'weight':
        return <WeightDialog store={store} onClose={close} blockRef={dialog.blockRef} />;
      case 'stage':
        return <CustomStageDialog store={store} onClose={close} blockRef={dialog.blockRef} />;
      case 'tier':
        return (
          <TierDialog
            onClose={close}
            title={dialog.title}
            help={dialog.help}
            tiers={dialog.tiers}
            onPick={dialog.onPick}
          />
        );
    }
  })();

  return (
    <>
      <PageHeader
        title="İmalat Planlama"
        subtitle="İş emri bazında imalat takibi — talaşlı, kaynak, boya; süreler ve ilerleme"
        icon="fas fa-industry"
        backTo="/planning"
        actions={
          <Button
            leftSection={<FaIcon icon="fas fa-sync-alt" />}
            loading={store.loading}
            onClick={() =>
              void confirmDiscard(
                'Kaydedilmemiş değişiklikler var. Yenilemek istediğinize emin misiniz?',
              ).then((ok) => ok && void store.load())
            }
          >
            Yenile
          </Button>
        }
      />
      <Warnings store={store} />
      <Panel padded={false} footer={<Legend ref={legendRef} />}>
        <div className={s.toolbar}>
          <ResourceTabs store={store} />
          {/* Sheet-wide actions only; what acts on the grid itself lives on its header. */}
          <div className={s.actions}>
            <Switch
              size="xs"
              label="Tamamlananlar"
              title="Tamamlanan, iptal edilen ve beklemedeki iş emirlerini de göster"
              checked={store.showCompleted}
              onChange={(e) => {
                const next = e.currentTarget.checked;
                void confirmDiscard('Kaydedilmemiş değişiklikler var. Devam edilsin mi?').then(
                  (ok) => ok && store.setShowCompleted(next),
                );
              }}
            />
            <Button
              size="xs"
              variant="outline"
              leftSection={<FaIcon icon="fas fa-plus" />}
              onClick={openAddJob}
            >
              İş Ekle
            </Button>
            <Button
              size="xs"
              color="green"
              leftSection={<FaIcon icon="fas fa-save" />}
              disabled={!dirty}
              loading={store.saveInFlight}
              onClick={() => void store.save()}
            >
              Kaydet
            </Button>
            <Button
              size="xs"
              variant="default"
              leftSection={<FaIcon icon="fas fa-file-pdf" />}
              title="Görünen tabloyu ve zaman çizelgesini PDF olarak indir"
              loading={pdfProgress === ''}
              disabled={pdfProgress !== null}
              onClick={() => void exportPdf()}
            >
              {pdfProgress ? pdfProgress : 'PDF'}
            </Button>
            {/* Advisory only: the drawer explains and proposes. */}
            <Button
              size="xs"
              variant="default"
              leftSection={<FaIcon icon="fas fa-gauge-high" />}
              title="Kapasite önerileri — ekip/taşeron yükü, termin riski, önerilen başlangıçlar"
              onClick={toggleCapacity}
            >
              Kapasite
              {lateBlocks ? (
                <span className={s.capBtnBadge} title={`${lateBlocks} blok gecikme riskinde`}>
                  {lateBlocks}
                </span>
              ) : null}
            </Button>
            <SegmentedControl
              size="xs"
              aria-label="Zaman ölçeği"
              title="Zaman ölçeği — zaman çizelgesi üzerinde Ctrl + fare tekerleği ile de değiştirebilirsiniz"
              color="#8b0000"
              value={zoom}
              onChange={(v) => applyZoom(normalizeZoom(v))}
              data={[
                { value: 'day', label: 'Gün' },
                { value: 'week', label: 'Hafta' },
                { value: 'month', label: 'Ay' },
              ]}
            />
            <span
              className={s.segmentWrap}
              title="Ne görünsün — işin tamamı, ya da yalnızca Kaynaklı İmalat ve altındaki ekip/taşeron atamaları (ekip dağılımını okumak için)"
            >
              <span>Görünüm</span>
              <SegmentedControl
                size="xs"
                aria-label="Görünüm"
                color="#8b0000"
                value={store.viewScope}
                onChange={(v) => {
                  store.setViewScope(v);
                  writeStored(STORAGE_KEYS.scope, store.viewScope);
                }}
                data={[
                  { value: 'full', label: 'Tam' },
                  { value: 'welding', label: 'Kaynak' },
                ]}
              />
            </span>
            <span
              className={s.segmentWrap}
              title="İş emirlerinin sırası — numaraya göre ya da bu kaynaktaki en erken başlangıca göre (en erken üstte)"
            >
              <span>Sırala</span>
              <SegmentedControl
                size="xs"
                aria-label="Sıralama"
                color="#8b0000"
                value={store.sortMode}
                onChange={(v) => {
                  store.setSortMode(v);
                  writeStored(STORAGE_KEYS.sort, store.sortMode);
                }}
                data={[
                  { value: 'job_no', label: 'İş No' },
                  { value: 'start', label: 'Başlangıç' },
                ]}
              />
            </span>
          </div>
        </div>
        <FilterStrip
          store={store}
          jobOptions={store.jobFilterOptions()}
          assigneeOptions={store.assigneeFilterOptions()}
          jobNos={store.filterJobNos}
          assignee={store.filterAssignee}
          text={store.filterText}
          resetCount={store.filterResetCount}
          summary={filterSummary?.text ?? null}
          summaryEmpty={!!filterSummary?.empty}
        />
        <PlanningGrid<SheetRow>
          ref={gridRef}
          rows={rows}
          columns={columns}
          collapsed={collapsed}
          gridWidth={gridWidth}
          zoom={zoom}
          isCellEditable={isCellEditable}
          rowClassName={rowClassName}
          actions={GRID_ACTIONS}
          bar={rowBar}
          target={rowTarget}
          isNonWorkingDay={store.calendar.isNonWorkingDay}
          allCollapsed={store.expandedJobCount() === 0}
          emptyText={
            store.loaded ? 'Bu kaynağa atanmış iş yok. "İş Ekle" ile başlayın.' : 'Plan yükleniyor…'
          }
          headerActions={
            <ColumnPicker
              keys={columnKeys}
              onChange={(keys) => {
                writeStored(STORAGE_KEYS.columns, JSON.stringify(keys));
                setColumnKeys(keys);
              }}
            />
          }
          onEdit={(row, field, value) => store.editCell(row, field, value)}
          onEditError={(err) => notify.error(err, { fallback: 'Düzenleme başarısız' })}
          onToggleGroup={(row) => row.job_no && store.toggleJob(row.job_no)}
          onToggleAll={() => store.toggleAll()}
          onAction={onAction}
          onZoomChange={applyZoom}
          onGridWidthChange={(px) => {
            writeStored(STORAGE_KEYS.gridWidth, String(px));
            setGridWidth(px);
          }}
        />
      </Panel>
      {dialogNode}
      <CapacityDrawer
        opened={capacityOpen}
        onClose={() => setCapacityOpen(false)}
        report={capacity.data}
        loading={capacity.isFetching}
        error={capacity.error}
        months={months}
        difficulty={difficulty}
        onMonthsChange={(m) => {
          writeStored(STORAGE_KEYS.capacityMonths, JSON.stringify(m));
          setMonths(m);
        }}
        onDifficultyChange={(on) => {
          writeStored(STORAGE_KEYS.capacityDifficulty, JSON.stringify(on));
          setDifficulty(on);
        }}
        onRefresh={refreshCapacity}
        onLocate={onLocate}
        hasUnsavedChanges={dirty}
        onSaveCapacity={async (res, value) => {
          if (value !== null && Number.isNaN(value)) {
            notify.error("Kapasite 0'dan büyük bir sayı olmalı.");
            return;
          }
          if (res.id == null || !res.resource_type) return;
          try {
            await saveResourceCapacity(res.resource_type, res.id, value);
            notify.success(
              value == null
                ? 'Elle girilen kapasite kaldırıldı — rapor yenileniyor.'
                : 'Kapasite kaydedildi — rapor yenileniyor.',
            );
            refreshCapacity();
          } catch (e) {
            notify.error(e, { fallback: 'Kapasite kaydedilemedi.' });
          }
        }}
      />
    </>
  );
}

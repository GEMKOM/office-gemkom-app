/**
 * Ağırlık ve Fiyat Kademeleri: weights and subcontracting price tiers for a
 * top-level job order's whole subtree, on one screen (port of
 * projects/project-tracking/weightPlanner.js).
 *
 * The weights are a column: type one and press Enter to go down, or paste a
 * column straight from Excel. Tiers come from templates (managed in this
 * modal too) and are sized as a share of each job's weight. Nothing is
 * written until Kaydet, which sends everything in one atomic request
 * (POST /subcontracting/price-tiers/bulk_plan/).
 *
 * Plan state and its rules live in weightPlannerModel.ts; this file is the UI.
 */
import { ActionIcon, Button, Loader, Modal } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ClipboardEvent,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { isApiError } from '@/api/client';
import {
  bulkPlanPriceTiers,
  createPriceTierTemplate,
  deletePriceTierTemplate,
  listPriceTierTemplates,
  priceTierPlannerKeys,
  priceTierPlannerQueryOptions,
  priceTierTemplatesQueryOptions,
  updatePriceTierTemplate,
  type BulkPlanErrorData,
  type PlannerJob,
  type PriceTierTemplate,
  type PriceTierTemplateInput,
} from '@/api/subcontracting/priceTiers';
import {
  ModalFooter,
  ModalHeader,
  StatusBadge,
  modalClassNames,
  notify,
  type StatusFamily,
} from '@/ui';
import { DraftInput } from './DraftInput';
import classes from './WeightPlannerModal.module.css';
import {
  PAINT,
  WELDING,
  addedWeldingKg,
  allocatedKg,
  awaitsManualKg,
  buildBulkPayload,
  changedJobs,
  cloneTiers,
  effectiveShare,
  emptyChange,
  existingTiers,
  existingWeldingKg,
  finalWeight,
  formatDecimal,
  formatKg,
  hasExistingChanges,
  isWeightChanged,
  newTierKey,
  newTierRow,
  offerWeight,
  parseDecimal,
  parsePastedColumn,
  planHasTemplate,
  roundTo,
  savedWeight,
  setExistingField,
  summarize,
  templateItemsFromRows,
  tiersFromTemplate,
  validateJob,
  weightEdit,
  type ChangeMap,
  type EditableField,
  type EditMap,
  type Problem,
  type ProblemField,
  type TierChange,
  type TierMap,
  type TierRow,
} from './weightPlannerModel';

export interface WeightPlannerModalProps {
  /** Any job order of the tree; open while non-null. It is focused on open unless it is the root. */
  jobNo: string | null;
  onClose: () => void;
  /** Called after a successful save. */
  onSaved?: () => void;
}

const CURRENCIES = ['TRY', 'EUR', 'USD', 'GBP'];
const TIER_TYPES = [
  { value: WELDING, label: 'Kaynak' },
  { value: PAINT, label: 'Boya' },
];

type Filter = 'all' | 'no_weight' | 'no_tiers' | 'needs_kg' | 'changed';
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'Tüm iş emirleri' },
  { value: 'no_weight', label: 'Ağırlığı olmayanlar' },
  { value: 'no_tiers', label: 'Kademesi olmayanlar' },
  { value: 'needs_kg', label: 'Kg bekleyenler' },
  { value: 'changed', label: 'Değiştirilenler' },
];

const JOB_STATUS_COLOR: Record<string, StatusFamily> = {
  draft: 'grey',
  on_hold: 'orange',
  completed: 'green',
  cancelled: 'grey',
};

const SERVER_FIELD_LABELS: Record<string, string> = {
  total_weight_kg: 'Ağırlık',
  name: 'Ad',
  price_per_kg: 'Fiyat/kg',
  allocated_weight_kg: 'Ayrılan ağırlık',
  currency: 'Para birimi',
  tier_type: 'Tip',
};

const NO_ROWS: TierRow[] = [];

interface PendingBulk {
  templateId: string;
  targets: string[];
  withTiers: string[];
}

interface PlanError {
  jobNo: string | null;
  key: string | null;
  field: ProblemField | null;
  message: string;
}

interface DraftItem {
  key: string;
  tier_type: string;
  name: string;
  currency: string;
  price_text: string;
  share_text: string;
}

interface Draft {
  id: number | null;
  name: string;
  description: string;
  is_active: boolean;
  items: DraftItem[];
}

interface PlannerState {
  edits: EditMap;
  tiers: TierMap;
  changes: ChangeMap;
  selected: Set<string>;
  /** null until the user picks one: the default focus of the loaded tree applies. */
  focused: string | null;
  search: string;
  filter: Filter;
  bulkTemplateId: string;
  detailTemplateId: string;
  pendingBulk: PendingBulk | null;
  confirmClose: boolean;
  saving: boolean;
  error: PlanError | null;
  lastCheckedIndex: number | null;
  view: 'detail' | 'templates';
  draft: Draft | null;
  draftSaving: boolean;
  draftConfirmDelete: boolean;
}

const INITIAL_STATE: PlannerState = {
  edits: new Map(),
  tiers: new Map(),
  changes: new Map(),
  selected: new Set(),
  focused: null,
  search: '',
  filter: 'all',
  bulkTemplateId: '',
  detailTemplateId: '',
  pendingBulk: null,
  confirmClose: false,
  saving: false,
  error: null,
  lastCheckedIndex: null,
  view: 'detail',
  draft: null,
  draftSaving: false,
  draftConfirmDelete: false,
};

interface PlannerData {
  rootJobNo: string;
  jobs: PlannerJob[];
  jobByNo: Map<string, PlannerJob>;
  templates: PriceTierTemplate[];
  /** The job focused on open: the given one, else the first open job without a weight. */
  defaultFocus: string | null;
}

interface FocusRequest {
  selector: string;
  /** A job row to scroll into view first. */
  scrollJob?: string;
}

/**
 * The plan lives outside React state so a handler can run several steps
 * (commit a cell, then pick the next one) on the latest plan, the way the
 * legacy module-level state worked. Renders subscribe to it.
 */
function createPlannerStore(initial: PlannerState) {
  let state = initial;
  let alive = true;
  let focusRequest: FocusRequest | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set: (patch: Partial<PlannerState>) => {
      state = { ...state, ...patch };
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** False once the modal is gone, so late responses do nothing. */
    alive: () => alive,
    setAlive: (value: boolean) => {
      alive = value;
    },
    requestFocus: (request: FocusRequest) => {
      focusRequest = request;
    },
    takeFocusRequest: () => {
      const request = focusRequest;
      focusRequest = null;
      return request;
    },
  };
}

// ---------------------------------------------------------------------------
// Lookups (pure: state + loaded data)
// ---------------------------------------------------------------------------

function tiersOf(s: PlannerState, jobNo: string | null): TierRow[] {
  return (jobNo !== null && s.tiers.get(jobNo)) || NO_ROWS;
}

function changeOf(s: PlannerState, jobNo: string): TierChange | null {
  return s.changes.get(jobNo) ?? null;
}

function weightOf(s: PlannerState, data: PlannerData, jobNo: string): number | null {
  const job = data.jobByNo.get(jobNo);
  return job ? finalWeight(job, s.edits.get(jobNo)) : null;
}

function normalize(text: string | null | undefined): string {
  return (text || '').toLocaleLowerCase('tr');
}

function visibleJobs(s: PlannerState, data: PlannerData): PlannerJob[] {
  const term = normalize(s.search.trim());
  return data.jobs.filter((job) => {
    if (term && !normalize(job.job_no).includes(term) && !normalize(job.title).includes(term))
      return false;
    switch (s.filter) {
      case 'no_weight':
        return weightOf(s, data, job.job_no) === null;
      case 'no_tiers':
        return job.tiers.length === 0 && tiersOf(s, job.job_no).length === 0;
      case 'needs_kg': {
        const weight = weightOf(s, data, job.job_no);
        return tiersOf(s, job.job_no).some((r) => allocatedKg(r, weight) === null);
      }
      case 'changed':
        return (
          isWeightChanged(job, s.edits.get(job.job_no)) ||
          tiersOf(s, job.job_no).length > 0 ||
          hasExistingChanges(changeOf(s, job.job_no))
        );
      default:
        return true;
    }
  });
}

function selectedPlannable(s: PlannerState, data: PlannerData): string[] {
  return data.jobs.filter((j) => j.can_plan && s.selected.has(j.job_no)).map((j) => j.job_no);
}

function activeTemplates(data: PlannerData): PriceTierTemplate[] {
  return data.templates.filter((t) => t.is_active);
}

function templateName(data: PlannerData, id: string): string {
  const template = data.templates.find((t) => String(t.id) === String(id));
  return template ? template.name : '';
}

function cloneChange(change: TierChange | null): TierChange {
  return change
    ? { edits: new Map(change.edits), deletes: new Set(change.deletes) }
    : emptyChange();
}

function draftItem(
  item: {
    tier_type?: string;
    name?: string;
    currency?: string;
    price_per_kg?: string | number | null;
    weight_share_pct?: string | number | null;
  } = {},
): DraftItem {
  return {
    key: newTierKey(),
    tier_type: item.tier_type || WELDING,
    name: item.name || '',
    currency: item.currency || 'TRY',
    price_text:
      item.price_per_kg === null || item.price_per_kg === undefined
        ? ''
        : formatDecimal(Number(item.price_per_kg), 4),
    // Empty share = the tier's kg is typed per job order.
    share_text:
      item.weight_share_pct === null || item.weight_share_pct === undefined
        ? ''
        : formatDecimal(Number(item.weight_share_pct)),
  };
}

function formatServerError(data: BulkPlanErrorData | null): string {
  if (!data || typeof data !== 'object') return '';
  let message = data.message || data.detail || '';
  if (data.errors && typeof data.errors === 'object') {
    const parts = Object.entries(data.errors).map(([field, value]) => {
      const text = Array.isArray(value) ? value.join(' ') : String(value);
      return `${SERVER_FIELD_LABELS[field] || field}: ${text}`;
    });
    if (parts.length) message = `${message} ${parts.join('; ')}`.trim();
  }
  return message;
}

/** Quote a value for an attribute selector (job numbers and row keys). */
function attr(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}

function flag(on: boolean): '' | undefined {
  return on ? '' : undefined;
}

function JobBadge({
  color,
  title,
  children,
}: {
  color: StatusFamily;
  title?: string;
  children: ReactNode;
}) {
  return (
    <span className={classes.badge} title={title}>
      <StatusBadge color={color}>{children}</StatusBadge>
    </span>
  );
}

// ---------------------------------------------------------------------------
// The modal
// ---------------------------------------------------------------------------

/** Legacy `openWeightPlanner(jobNo, { onSaved })`. */
export function WeightPlannerModal({ jobNo, onClose, onSaved }: WeightPlannerModalProps) {
  if (jobNo === null) return null;
  return <Planner key={jobNo} jobNo={jobNo} onClose={onClose} onSaved={onSaved} />;
}

function Planner({
  jobNo,
  onClose,
  onSaved,
}: {
  jobNo: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const planner = useQuery(priceTierPlannerQueryOptions(jobNo));
  // A failed template list leaves the planner usable without templates.
  const templatesQuery = useQuery(priceTierTemplatesQueryOptions());
  const loading = planner.isPending || templatesQuery.isPending;
  const loadError = planner.isError ? 'İş emri ağacı yüklenemedi.' : null;

  const data = useMemo<PlannerData>(() => {
    const rootJobNo = planner.data?.root || jobNo;
    const jobs = planner.data?.job_orders ?? [];
    const jobByNo = new Map(jobs.map((j) => [j.job_no, j]));
    const firstOpen = jobs.find((j) => j.can_plan && savedWeight(j) === null);
    const defaultFocus =
      jobNo !== rootJobNo && jobByNo.has(jobNo) ? jobNo : ((firstOpen || jobs[0])?.job_no ?? null);
    return { rootJobNo, jobs, jobByNo, templates: templatesQuery.data ?? [], defaultFocus };
  }, [planner.data, templatesQuery.data, jobNo]);

  // Handlers read and write the plan through the store, so several steps in
  // one event (commit a cell, then move on) see each other's result.
  const [store] = useState(() => createPlannerStore(INITIAL_STATE));
  const state = useSyncExternalStore(store.subscribe, store.get);
  const set = store.set;
  const focusedNow = () => store.get().focused ?? data.defaultFocus;

  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    store.setAlive(true);
    return () => store.setAlive(false);
  }, [store]);

  // A cell to focus once the next render is on screen.
  useEffect(() => {
    const request = store.takeFocusRequest();
    if (!request) return;
    const root = rootRef.current;
    if (!root) return;
    if (request.scrollJob) {
      root
        .querySelector(`[data-row-job="${attr(request.scrollJob)}"]`)
        ?.scrollIntoView?.({ block: 'nearest' });
    }
    const input = root.querySelector<HTMLInputElement>(request.selector);
    if (input) {
      input.focus();
      input.select();
    }
  });

  // Bring the focused job order into view once the tree is loaded.
  const scrolled = useRef(false);
  useEffect(() => {
    if (loading || scrolled.current) return;
    scrolled.current = true;
    const no = store.get().focused ?? data.defaultFocus;
    if (no)
      listRef.current
        ?.querySelector(`[data-row-job="${attr(no)}"]`)
        ?.scrollIntoView?.({ block: 'center' });
  }, [loading, data.defaultFocus, store]);

  // ---- Actions ------------------------------------------------------------

  /** Clear the plan error when it belongs to this job. */
  const errorWithout = (jobNo: string | null, error = store.get().error) =>
    error && error.jobNo === jobNo ? null : error;

  const setWeightText = (edits: EditMap, jobNo: string, text: string) => {
    const job = data.jobByNo.get(jobNo);
    if (!job) return;
    const edit = weightEdit(text);
    if (isWeightChanged(job, edit)) edits.set(jobNo, edit);
    else edits.delete(jobNo);
  };

  const focusJob = (no: string) => {
    if (!data.jobByNo.has(no)) return;
    const s = store.get();
    if (s.view === 'templates') set({ view: 'detail', focused: no });
    else if (focusedNow() !== no) set({ focused: no });
  };

  const applyTemplate = (
    jobNos: string[],
    templateId: string,
    { skipDuplicates }: { skipDuplicates: boolean },
  ) => {
    const template = data.templates.find((t) => String(t.id) === String(templateId));
    if (!template || !(template.items || []).length) {
      notify.warning('Seçilen şablonda kademe yok');
      return;
    }
    const s = store.get();
    const tiers = new Map(s.tiers);
    let error = s.error;
    let applied = 0;
    let skipped = 0;
    jobNos.forEach((no) => {
      const rows = tiers.get(no) || [];
      if (skipDuplicates && planHasTemplate(rows, templateId)) {
        skipped += 1;
        return;
      }
      tiers.set(no, [...rows, ...tiersFromTemplate(template)]);
      error = errorWithout(no, error);
      applied += 1;
    });
    set({ tiers, error, confirmClose: false });
    if (applied) {
      const shared = template.items.some(
        (i) => i.weight_share_pct !== null && i.weight_share_pct !== undefined,
      );
      const manual = template.items.some(
        (i) => i.weight_share_pct === null || i.weight_share_pct === undefined,
      );
      const missing = shared ? jobNos.filter((no) => weightOf(s, data, no) === null).length : 0;
      notify.success(
        (jobNos.length === 1
          ? `«${template.name}» eklendi`
          : `«${template.name}» ${applied} iş emrine eklendi`) +
          (skipped ? `, ${skipped} iş emrinde zaten vardı` : '') +
          (missing ? `. ${missing} iş emrinin ağırlığı girilince kademeler boyutlanacak` : '') +
          (manual ? ". Payı boş kademelerin kg'ını girin (Enter sıradaki boş kg'ya geçer)" : ''),
      );
    } else if (skipped) {
      notify.info(`«${template.name}» seçili iş emirlerinin hepsinde zaten var`);
    }
  };

  const startBulkApply = () => {
    const s = store.get();
    const templateId = s.bulkTemplateId;
    const targets = selectedPlannable(s, data);
    if (!templateId || targets.length === 0) return;
    const withTiers = targets.filter((no) => (data.jobByNo.get(no)?.tiers.length ?? 0) > 0);
    if (withTiers.length > 0) {
      set({ pendingBulk: { templateId, targets, withTiers } });
      return;
    }
    applyTemplate(targets, templateId, { skipDuplicates: true });
  };

  const finishBulkApply = (onlyEmpty: boolean) => {
    const pending = store.get().pendingBulk;
    set({ pendingBulk: null });
    if (!pending) return;
    const targets = onlyEmpty
      ? pending.targets.filter((no) => !pending.withTiers.includes(no))
      : pending.targets;
    if (targets.length === 0) return;
    applyTemplate(targets, pending.templateId, { skipDuplicates: true });
  };

  const copyFocusedTiersToSelected = () => {
    const s = store.get();
    const focused = focusedNow();
    const source = tiersOf(s, focused);
    const targets = selectedPlannable(s, data).filter((no) => no !== focused);
    if (!focused || !source.length || !targets.length) return;
    const sourceWeight = weightOf(s, data, focused);
    const tiers = new Map(s.tiers);
    let error = s.error;
    targets.forEach((no) => {
      tiers.set(no, [...(tiers.get(no) || []), ...cloneTiers(source, sourceWeight)]);
      error = errorWithout(no, error);
    });
    set({ tiers, error, confirmClose: false });
    notify.success(
      `${source.length} kademe ${targets.length} iş emrine, kendi ağırlıklarına göre kopyalandı`,
    );
  };

  /** Replace the focused job's new rows. */
  const setFocusedTiers = (rows: TierRow[], extra: Partial<PlannerState> = {}) => {
    const focused = focusedNow();
    if (!focused) return;
    const tiers = new Map(store.get().tiers);
    tiers.set(focused, rows);
    set({ tiers, error: errorWithout(focused), confirmClose: false, ...extra });
  };

  const updateTier = (key: string, patch: Partial<TierRow>) => {
    const rows = tiersOf(store.get(), focusedNow());
    if (!rows.some((r) => r.key === key)) return;
    setFocusedTiers(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const commitTierPrice = (key: string, text: string) => {
    const price = parseDecimal(text);
    updateTier(key, {
      price_per_kg: price === null || Number.isNaN(price) ? price : roundTo(price, 4),
    });
  };

  const commitTierShare = (key: string, text: string) => {
    const share = parseDecimal(text);
    if (share === null) {
      // No share: from now on this tier's kg is typed by hand.
      updateTier(key, { share: null, baseShare: null });
    } else if (Number.isNaN(share) || share <= 0) {
      notify.warning("Pay 0'dan büyük bir yüzde olmalı ya da boş bırakılmalı");
    } else {
      updateTier(key, { share: roundTo(share, 2), baseShare: roundTo(share, 2), kg: null });
    }
  };

  const commitTierKg = (key: string, text: string) => {
    const kg = parseDecimal(text);
    const row = tiersOf(store.get(), focusedNow()).find((r) => r.key === key);
    if (!row) return;
    if (kg === null) {
      // Emptied: back to the share it started from (a hand-sized tier just
      // waits for its kg again).
      updateTier(key, { share: row.baseShare ?? null, kg: null });
    } else if (Number.isNaN(kg) || kg <= 0) {
      notify.warning("Ayrılan ağırlık 0'dan büyük olmalı");
    } else {
      updateTier(key, { kg: roundTo(kg, 2), share: null });
    }
  };

  const kgSelector = (key: string) => `[data-tp-field="tier-kg"][data-key="${attr(key)}"]`;

  /**
   * Enter in a tier's kg cell: commit it, then go to the next tier still
   * waiting for a hand-typed kg: later on this job first, then on the next
   * job order down the list. Typing kg for a whole tree stays on the keyboard.
   */
  const advanceToNextManualKg = (key: string, text: string) => {
    const no = focusedNow();
    commitTierKg(key, text);
    const s = store.get();
    const rows = tiersOf(s, no);
    const index = rows.findIndex((r) => r.key === key);
    const row = rows[index];
    if (row && awaitsManualKg(row)) return; // nothing readable was typed: stay
    const later = rows.slice(index + 1).find(awaitsManualKg);
    if (later) {
      store.requestFocus({ selector: kgSelector(later.key) });
      set({});
      return;
    }
    const jobs = visibleJobs(s, data);
    const start = jobs.findIndex((j) => j.job_no === no);
    const next = [...jobs.slice(start + 1), ...jobs.slice(0, Math.max(start, 0))].find((j) =>
      tiersOf(s, j.job_no).some(awaitsManualKg),
    );
    if (!next) {
      notify.success('Kg bekleyen kademe kalmadı');
      return;
    }
    const target = tiersOf(s, next.job_no).find(awaitsManualKg);
    store.requestFocus({ selector: kgSelector(target ? target.key : ''), scrollJob: next.job_no });
    focusJob(next.job_no);
    set({});
  };

  /** Stage one field of an existing tier of the focused job. */
  const updateExisting = (id: number, field: EditableField, value: string | number | null) => {
    const focused = focusedNow();
    const tier = focused ? data.jobByNo.get(focused)?.tiers.find((t) => t.id === id) : undefined;
    if (!focused || !tier) return;
    const s = store.get();
    const change = cloneChange(changeOf(s, focused));
    setExistingField(change, tier, field, value);
    const changes = new Map(s.changes);
    changes.set(focused, change);
    set({ changes, error: errorWithout(focused), confirmClose: false });
  };

  const commitExistingNumber = (
    id: number,
    field: 'price_per_kg' | 'allocated_weight_kg',
    text: string,
  ) => {
    const value = parseDecimal(text);
    const places = field === 'price_per_kg' ? 4 : 2;
    updateExisting(id, field, value === null || Number.isNaN(value) ? NaN : roundTo(value, places));
  };

  const toggleExistingDelete = (id: number, remove: boolean) => {
    const focused = focusedNow();
    if (!focused) return;
    const s = store.get();
    const change = cloneChange(changeOf(s, focused));
    if (remove) {
      change.edits.delete(id);
      change.deletes.add(id);
    } else {
      change.deletes.delete(id);
    }
    const changes = new Map(s.changes);
    changes.set(focused, change);
    set({ changes, error: errorWithout(focused), confirmClose: false });
  };

  /** Spread a pasted block over the weight column. */
  const pasteWeights = (startJobNo: string, entries: ReturnType<typeof parsePastedColumn>) => {
    const s = store.get();
    const visible = visibleJobs(s, data);
    const edits = new Map(s.edits);
    let error = s.error;
    let applied = 0;
    let unknown = 0;
    const put = (no: string, text: string) => {
      setWeightText(edits, no, text);
      error = errorWithout(no, error);
      applied += 1;
    };
    if (entries.every((e) => e.jobNo)) {
      entries.forEach(({ jobNo: no, text }) => {
        const job = no ? data.jobByNo.get(no) : undefined;
        if (!no || !job || !job.can_plan) {
          unknown += 1;
          return;
        }
        put(no, text);
      });
    } else {
      let index = visible.findIndex((j) => j.job_no === startJobNo);
      entries.forEach(({ text }) => {
        while (index < visible.length && !visible[index]?.can_plan) index += 1;
        const target = visible[index];
        if (!target) return;
        put(target.job_no, text);
        index += 1;
      });
    }
    set({ edits, error, confirmClose: false });
    const message = `${applied} ağırlık yapıştırıldı${
      unknown ? `, ${unknown} satır atlandı (iş emri bu ağaçta yok ya da kapalı)` : ''
    }`;
    if (unknown) notify.warning(message);
    else notify.success(message);
  };

  const moveWeightFocus = (from: HTMLInputElement, step: number) => {
    const inputs = [
      ...(from
        .closest('[role="list"]')
        ?.querySelectorAll<HTMLInputElement>('[data-tp-field="weight"]:not(:disabled)') ?? []),
    ];
    const next = inputs[inputs.indexOf(from) + step];
    if (next) {
      next.focus();
      next.select();
    }
  };

  const onWeightInput = (no: string, text: string) => {
    const s = store.get();
    const edits = new Map(s.edits);
    setWeightText(edits, no, text);
    set({ edits, error: errorWithout(no) });
  };

  /** Committed (blur / Enter): show the number as it was read ("3.250" → "3250"). */
  const onWeightCommit = (no: string) => {
    const s = store.get();
    const edit = s.edits.get(no);
    if (edit && typeof edit.value === 'number' && !Number.isNaN(edit.value)) {
      const edits = new Map(s.edits);
      edits.set(no, { ...edit, text: formatDecimal(edit.value) });
      set({ edits });
    }
  };

  const onWeightKeyDown = (event: KeyboardEvent<HTMLInputElement>, no: string) => {
    if (event.key === 'Enter' || event.key === 'ArrowDown') {
      event.preventDefault();
      moveWeightFocus(event.currentTarget, 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveWeightFocus(event.currentTarget, -1);
    } else if (event.key === 'Escape') {
      // Undo this cell instead of closing the modal.
      event.preventDefault();
      event.stopPropagation();
      const edits = new Map(store.get().edits);
      edits.delete(no);
      set({ edits });
    }
  };

  const onWeightPaste = (event: ClipboardEvent<HTMLInputElement>, no: string) => {
    const text = event.clipboardData?.getData('text') || '';
    const entries = parsePastedColumn(text);
    if (entries.length < 2 && !entries.some((e) => e.jobNo)) return; // a single value: let the input take it
    event.preventDefault();
    pasteWeights(no, entries);
  };

  const handleJobCheck = (no: string, index: number, checked: boolean, shiftKey: boolean) => {
    const s = store.get();
    const jobs = visibleJobs(s, data);
    const selected = new Set(s.selected);
    if (shiftKey && s.lastCheckedIndex !== null && s.lastCheckedIndex < jobs.length) {
      const from = Math.min(s.lastCheckedIndex, index);
      const to = Math.max(s.lastCheckedIndex, index);
      jobs.slice(from, to + 1).forEach((job) => {
        if (!job.can_plan) return;
        if (checked) selected.add(job.job_no);
        else selected.delete(job.job_no);
      });
    } else if (checked) {
      selected.add(no);
    } else {
      selected.delete(no);
    }
    set({ selected, lastCheckedIndex: index, pendingBulk: null });
  };

  const checkVisible = (checked: boolean) => {
    const s = store.get();
    const selected = new Set(s.selected);
    visibleJobs(s, data).forEach((job) => {
      if (!job.can_plan) return;
      if (checked) selected.add(job.job_no);
      else selected.delete(job.job_no);
    });
    set({ selected, pendingBulk: null });
  };

  const selectNoTiers = () => {
    const s = store.get();
    const selected = new Set(s.selected);
    visibleJobs(s, data).forEach((j) => {
      if (j.can_plan && j.tiers.length === 0) selected.add(j.job_no);
    });
    set({ selected, pendingBulk: null });
  };

  const bulkClear = () => {
    const s = store.get();
    const targets = selectedPlannable(s, data).filter((no) => tiersOf(s, no).length > 0);
    const count = targets.reduce((sum, no) => sum + tiersOf(s, no).length, 0);
    const tiers = new Map(s.tiers);
    let error = s.error;
    targets.forEach((no) => {
      tiers.set(no, []);
      error = errorWithout(no, error);
    });
    set({ tiers, error, confirmClose: false });
    if (count) notify.info(`${targets.length} iş emrinden ${count} yeni kademe kaldırıldı`);
  };

  // ---- Templates ----

  const openTemplateManager = (draft: Draft | null) => {
    set({ view: 'templates', draft, draftConfirmDelete: false });
  };

  const editTemplate = (id: number) => {
    const template = data.templates.find((t) => String(t.id) === String(id));
    if (!template) return;
    openTemplateManager({
      id: template.id,
      name: template.name,
      description: template.description || '',
      is_active: template.is_active,
      items: template.items.map(draftItem),
    });
  };

  const updateDraft = (patch: Partial<Draft>) => {
    const draft = store.get().draft;
    if (draft) set({ draft: { ...draft, ...patch } });
  };

  const updateDraftItem = (key: string, patch: Partial<DraftItem>) => {
    const draft = store.get().draft;
    if (!draft) return;
    updateDraft({
      items: draft.items.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    });
  };

  const templatesKey = priceTierTemplatesQueryOptions().queryKey;

  const saveDraft = async () => {
    const draft = store.get().draft;
    if (!draft) return;
    const items: PriceTierTemplateInput['items'] = [];
    for (const item of draft.items) {
      const price = parseDecimal(item.price_text);
      const share = parseDecimal(item.share_text);
      if (!item.name.trim() || price === null || Number.isNaN(price) || price < 0) {
        notify.error('Her kademenin adı ve fiyatı olmalı');
        return;
      }
      if (share !== null && (Number.isNaN(share) || share <= 0 || share > 100)) {
        notify.error('Pay %0–100 arası olmalı ya da boş bırakılmalı');
        return;
      }
      items.push({
        tier_type: item.tier_type,
        name: item.name.trim(),
        price_per_kg: roundTo(price, 4).toFixed(4),
        currency: item.currency,
        weight_share_pct: share === null ? null : roundTo(share, 2).toFixed(2),
      });
    }
    if (!draft.name.trim()) {
      notify.error('Şablon adı boş olamaz');
      return;
    }
    const payload: PriceTierTemplateInput = {
      name: draft.name.trim(),
      description: draft.description,
      is_active: draft.is_active,
      items,
    };
    set({ draftSaving: true });
    try {
      const saved = draft.id
        ? await updatePriceTierTemplate(draft.id, payload)
        : await createPriceTierTemplate(payload);
      if (!store.alive()) return;
      queryClient.setQueryData(templatesKey, await listPriceTierTemplates());
      if (!store.alive()) return;
      set({ draft: { ...draft, id: saved.id, items: saved.items.map(draftItem) } });
      notify.success(`«${saved.name}» kaydedildi`);
    } catch (error) {
      console.error('Error saving price tier template:', error);
      notify.error(error, { fallback: 'Şablon kaydedilemedi' });
    } finally {
      if (store.alive()) set({ draftSaving: false });
    }
  };

  const deleteDraft = async () => {
    const s = store.get();
    const draft = s.draft;
    if (!draft || !draft.id) return;
    if (!s.draftConfirmDelete) {
      set({ draftConfirmDelete: true });
      return;
    }
    const id = draft.id;
    set({ draftSaving: true });
    try {
      await deletePriceTierTemplate(id);
      if (!store.alive()) return;
      queryClient.setQueryData(templatesKey, (list: PriceTierTemplate[] | undefined) =>
        (list ?? []).filter((t) => t.id !== id),
      );
      const now = store.get();
      set({
        bulkTemplateId: String(now.bulkTemplateId) === String(id) ? '' : now.bulkTemplateId,
        detailTemplateId: String(now.detailTemplateId) === String(id) ? '' : now.detailTemplateId,
        draft: null,
      });
      notify.success(`«${draft.name}» silindi`);
    } catch (error) {
      console.error('Error deleting price tier template:', error);
      notify.error(error, { fallback: 'Şablon silinemedi' });
    } finally {
      if (store.alive()) set({ draftSaving: false, draftConfirmDelete: false });
    }
  };

  // ---- Save / close ----

  const save = async () => {
    const s = store.get();
    for (const job of changedJobs(data.jobs, s.edits, s.tiers, s.changes)) {
      const problems = validateJob(
        job,
        s.edits.get(job.job_no),
        tiersOf(s, job.job_no),
        changeOf(s, job.job_no),
      );
      const first = problems[0];
      if (first) {
        const error = {
          jobNo: job.job_no,
          key: first.key,
          field: first.field,
          message: `${job.job_no}: ${first.message}`,
        };
        set({ error, focused: job.job_no, view: 'detail', confirmClose: false });
        notify.error(error.message);
        return;
      }
    }

    const payload = buildBulkPayload(data.jobs, s.edits, s.tiers, s.changes);
    if (payload.plans.length === 0) return;
    set({ saving: true, confirmClose: false });

    try {
      const response = await bulkPlanPriceTiers(payload);
      set({ saving: false });
      void queryClient.invalidateQueries({ queryKey: ['subcontractingPriceTiers'] });
      void queryClient.invalidateQueries({ queryKey: priceTierPlannerKeys.planner(jobNo) });
      onClose();
      notify.success(response?.message || 'Kaydedildi');
      onSaved?.();
    } catch (error) {
      console.error('Error saving weight plans:', error);
      if (!store.alive()) return;
      const body: BulkPlanErrorData =
        isApiError(error) && error.data && typeof error.data === 'object'
          ? (error.data as BulkPlanErrorData)
          : {};
      const now = store.get();
      const errorJob = body.job_order && data.jobByNo.has(body.job_order) ? body.job_order : null;
      const rows = errorJob ? tiersOf(now, errorJob) : NO_ROWS;
      const indexed =
        errorJob && Number.isInteger(body.index) ? rows[body.index as number] : undefined;
      let key = indexed ? indexed.key : null;
      if (errorJob && Number.isInteger(body.tier_id)) key = `e${body.tier_id}`;
      const message = formatServerError(body) || 'Kaydedilemedi';
      set({
        error: { jobNo: errorJob, key, field: key ? null : 'weight', message },
        ...(errorJob ? { focused: errorJob, view: 'detail' as const } : {}),
        saving: false,
        confirmClose: false,
      });
      notify.error(message);
    }
  };

  const requestClose = () => {
    const s = store.get();
    if (s.saving) return;
    if (summarize(data.jobs, s.edits, s.tiers, s.changes).jobCount > 0) {
      set({ confirmClose: true });
      return;
    }
    onClose();
  };

  const onRootKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      requestClose();
    }
  };

  // ---- Render ---------------------------------------------------------------

  const focused = state.focused ?? data.defaultFocus;
  const ready = !loading && !loadError;
  const visible = ready ? visibleJobs(state, data) : [];
  const selected = ready ? selectedPlannable(state, data) : [];
  const summary = summarize(data.jobs, state.edits, state.tiers, state.changes);
  const active = activeTemplates(data);

  const templateOptions = (placeholder: string) => (
    <>
      <option value="">{placeholder}</option>
      {active.map((t) => (
        <option key={t.id} value={String(t.id)}>
          {t.name}
        </option>
      ))}
    </>
  );

  const root = data.jobByNo.get(data.rootJobNo);
  const subtitle = root
    ? `${root.title || ''}${data.jobs.length > 1 ? ` · ${data.jobs.length} iş emri` : ''}`
    : '';

  const renderBulkBar = () => {
    if (!ready) return null;
    const tiersInSelection = selected.filter((no) => tiersOf(state, no).length > 0).length;
    const pending = state.pendingBulk;
    return (
      <div className={classes.bulkbar}>
        <div className={classes.bulkRow}>
          <span className={classes.selCount}>
            {selected.length ? (
              <>
                <strong>{selected.length}</strong> iş emri seçili
              </>
            ) : (
              'Toplu kademe için iş emri seçin'
            )}
          </span>
          <span>
            <button type="button" className={classes.linkButton} onClick={selectNoTiers}>
              Kademesizleri seç
            </button>
            {selected.length ? (
              <button
                type="button"
                className={classes.linkButton}
                onClick={() =>
                  set({ selected: new Set(), pendingBulk: null, lastCheckedIndex: null })
                }
              >
                Seçimi kaldır
              </button>
            ) : null}
          </span>
        </div>
        <div className={classes.bulkRow}>
          <select
            className={classes.select}
            aria-label="Kademe şablonu"
            value={state.bulkTemplateId}
            onChange={(e) => set({ bulkTemplateId: e.target.value, pendingBulk: null })}
          >
            {templateOptions(active.length ? 'Kademe şablonu seçin…' : 'Henüz şablon yok')}
          </select>
          <Button
            size="xs"
            leftSection={<i className="fas fa-layer-group" />}
            disabled={!(selected.length && state.bulkTemplateId)}
            onClick={startBulkApply}
          >
            Seçililere uygula
          </Button>
          <ActionIcon
            size="md"
            variant="outline"
            color="red"
            title="Seçililere eklenen yeni kademeleri temizle"
            aria-label="Seçililere eklenen yeni kademeleri temizle"
            disabled={!tiersInSelection}
            onClick={bulkClear}
          >
            <i className="fas fa-eraser" />
          </ActionIcon>
          <Button
            size="xs"
            variant="default"
            leftSection={<i className="fas fa-cog" />}
            title="Kademe şablonlarını yönet"
            onClick={() => openTemplateManager(store.get().draft)}
          >
            Şablonlar
          </Button>
        </div>
        {pending ? (
          <div className={classes.inlineConfirm} role="alert">
            <div>
              Seçili {pending.targets.length} iş emrinin <strong>{pending.withTiers.length}</strong>{' '}
              tanesinde zaten kayıtlı kademe var. «{templateName(data, pending.templateId)}» nereye
              uygulansın?
            </div>
            <div className={classes.inlineConfirmActions}>
              <Button
                size="xs"
                disabled={!(pending.targets.length - pending.withTiers.length)}
                onClick={() => finishBulkApply(true)}
              >
                Yalnızca kademesizlere ({pending.targets.length - pending.withTiers.length})
              </Button>
              <Button size="xs" variant="outline" onClick={() => finishBulkApply(false)}>
                Hepsine ({pending.targets.length})
              </Button>
              <Button size="xs" variant="subtle" onClick={() => set({ pendingBulk: null })}>
                Vazgeç
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const tierBadges = (job: PlannerJob) => {
    const rows = tiersOf(state, job.job_no);
    const added = rows.length;
    const edited = hasExistingChanges(changeOf(state, job.job_no));
    // Orange while a hand-sized tier still has no kg.
    const waiting = rows.some(awaitsManualKg);
    return (
      <>
        {job.tiers.length ? (
          <JobBadge
            color={edited ? 'blue' : 'grey'}
            title={edited ? 'Kayıtlı kademelerde düzenleme var' : 'Kayıtlı kademe'}
          >
            {job.tiers.length}
            {edited ? '*' : ''}
          </JobBadge>
        ) : (
          <JobBadge color={job.can_plan && !added ? 'orange' : 'grey'} title="Kayıtlı kademe yok">
            0
          </JobBadge>
        )}
        {added ? (
          <JobBadge
            color={waiting ? 'orange' : 'blue'}
            title={waiting ? 'Kg girilmesi bekleniyor' : 'Eklenecek kademe'}
          >
            +{added}
          </JobBadge>
        ) : (
          <span className={classes.badgeEmpty}>–</span>
        )}
      </>
    );
  };

  const statusBadges = (job: PlannerJob) => (
    <>
      {job.is_phase ? <JobBadge color="purple">Faz</JobBadge> : null}
      {job.status !== 'active' ? (
        <JobBadge color={JOB_STATUS_COLOR[job.status] || 'grey'}>{job.status_display}</JobBadge>
      ) : null}
    </>
  );

  const renderJobList = () => {
    if (loading) {
      return (
        <div className={classes.empty}>
          <Loader size="xs" mr={8} />
          Yükleniyor…
        </div>
      );
    }
    if (loadError) return <div className={`${classes.empty} ${classes.danger}`}>{loadError}</div>;
    if (visible.length === 0)
      return <div className={classes.empty}>Filtreye uyan iş emri yok.</div>;
    const errorJob = state.error && state.error.jobNo;
    return visible.map((job, index) => {
      const edit = state.edits.get(job.job_no);
      const rows = tiersOf(state, job.job_no);
      const problems = validateJob(job, edit, rows, changeOf(state, job.job_no));
      const changed = isWeightChanged(job, edit);
      const invalid = problems.some((p) => p.field === 'weight');
      // Share-sized tiers are waiting for this weight.
      const missing =
        finalWeight(job, edit) === null && rows.some((r) => r.kg === null && r.share !== null);
      const offer = offerWeight(job);
      return (
        <div
          key={job.job_no}
          className={classes.jobRow}
          role="listitem"
          data-row-job={job.job_no}
          data-active={flag(job.job_no === focused)}
          data-disabled={flag(!job.can_plan)}
          data-error={flag(job.job_no === errorJob)}
          style={{ '--tp-depth': Math.min(job.depth || 0, 6) } as CSSProperties}
          onClick={(event: MouseEvent<HTMLDivElement>) => {
            if ((event.target as HTMLElement).closest('[data-tp-field="weight"]')) return; // focus already did it
            focusJob(job.job_no);
          }}
        >
          <input
            type="checkbox"
            className={classes.check}
            aria-label={`${job.job_no} seç`}
            checked={state.selected.has(job.job_no) && job.can_plan}
            disabled={!job.can_plan}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) =>
              handleJobCheck(
                job.job_no,
                index,
                event.target.checked,
                'shiftKey' in event.nativeEvent &&
                  Boolean((event.nativeEvent as globalThis.MouseEvent).shiftKey),
              )
            }
          />
          <div className={classes.jobMain}>
            <div className={classes.jobNo}>
              {job.job_no}
              {statusBadges(job)}
            </div>
            <div className={classes.jobTitle} title={job.title || ''}>
              {job.title || '–'}
            </div>
          </div>
          <DraftInput
            inputMode="decimal"
            className={`${classes.input} ${classes.weight}`}
            data-tp-field="weight"
            data-job={job.job_no}
            data-changed={flag(changed)}
            data-invalid={flag(invalid)}
            data-missing={flag(missing)}
            value={edit ? edit.text : formatDecimal(savedWeight(job))}
            placeholder="kg"
            aria-label={`${job.job_no} ağırlık (kg)`}
            title={offer !== null ? `Teklif: ${formatKg(offer)}` : ''}
            disabled={!job.can_plan}
            onFocus={() => focusJob(job.job_no)}
            onInput={(text) => onWeightInput(job.job_no, text)}
            onCommit={() => onWeightCommit(job.job_no)}
            onKeyDown={(event) => onWeightKeyDown(event, job.job_no)}
            onPaste={(event) => onWeightPaste(event, job.job_no)}
          />
          <div className={classes.tierBadges}>{tierBadges(job)}</div>
        </div>
      );
    });
  };

  const renderWeightCard = (job: PlannerJob) => {
    const edit = state.edits.get(job.job_no);
    const weight = finalWeight(job, edit);
    const changed = isWeightChanged(job, edit);
    const offer = offerWeight(job);
    const children = data.jobs.filter((j) => j.parent === job.job_no);
    const childWeights = children
      .map((c) => weightOf(state, data, c.job_no))
      .filter((w): w is number => typeof w === 'number' && !Number.isNaN(w));
    const childSum = childWeights.reduce((sum, w) => sum + w, 0);
    const existing = existingWeldingKg(job, changeOf(state, job.job_no) || emptyChange());
    const added = addedWeldingKg(tiersOf(state, job.job_no), weight);
    const welding = existing + added;
    const capacity = typeof weight === 'number' && !Number.isNaN(weight) ? weight : 0;
    const over = welding > capacity + 0.001;

    return (
      <div className={classes.weightCard}>
        <div className={classes.weightMain}>
          <span className={classes.weightLabel}>Toplam ağırlık</span>
          <span className={classes.weightValue}>
            {weight !== null && Number.isNaN(weight) ? (
              <span className={classes.danger}>okunamadı</span>
            ) : (
              formatKg(weight)
            )}
          </span>
          {changed ? (
            <>
              <JobBadge color="blue">Değişti</JobBadge>
              <span className={classes.muted}>önce {formatKg(savedWeight(job))}</span>
              <button
                type="button"
                className={classes.linkButton}
                onClick={() => {
                  const edits = new Map(store.get().edits);
                  edits.delete(job.job_no);
                  set({ edits, error: errorWithout(job.job_no), confirmClose: false });
                }}
              >
                Geri al
              </button>
            </>
          ) : null}
        </div>
        <div className={classes.weightFacts}>
          {offer !== null ? (
            <span>
              Teklif: {formatKg(Number(job.offer_weight_kg))} × {job.quantity || 1} adet ≈{' '}
              <strong>{formatKg(offer)}</strong>
            </span>
          ) : null}
          {children.length ? (
            <span>
              Alt iş emirleri: {formatKg(childSum)} ({childWeights.length}/{children.length}{' '}
              girilmiş)
            </span>
          ) : null}
          {welding > 0 ? (
            <span className={over ? classes.over : undefined}>
              Kaynak kademeleri: {formatKg(welding)} / {formatKg(capacity)}
            </span>
          ) : null}
        </div>
        {job.can_plan ? <div className={classes.hint}>Ağırlığı soldaki listeden girin.</div> : null}
      </div>
    );
  };

  const typeOptions = TIER_TYPES.map((t) => (
    <option key={t.value} value={t.value}>
      {t.label}
    </option>
  ));
  const currencyOptions = CURRENCIES.map((c) => (
    <option key={c} value={c}>
      {c}
    </option>
  ));

  const renderReadOnlyTiers = (job: PlannerJob) => (
    <div className={classes.tableWrap}>
      <table className={`${classes.table} ${classes.readOnly}`}>
        <thead>
          <tr>
            <th>Ad</th>
            <th>Tip</th>
            <th className={classes.end}>Fiyat/kg</th>
            <th className={classes.end}>Ayrılan</th>
            <th className={classes.end}>Kullanılan</th>
            <th className={classes.end}>Kalan</th>
          </tr>
        </thead>
        <tbody>
          {job.tiers.map((t) => (
            <tr key={t.id}>
              <td>{t.name}</td>
              <td>{t.tier_type_display}</td>
              <td className={classes.end}>
                {formatDecimal(Number(t.price_per_kg), 4)} {t.currency}
              </td>
              <td className={classes.end}>{formatKg(Number(t.allocated_weight_kg))}</td>
              <td className={classes.end}>{formatKg(Number(t.used_weight_kg))}</td>
              <td className={classes.end}>{formatKg(Number(t.remaining_weight_kg))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  /**
   * Existing tiers as inputs. Edits stay pending until Kaydet. A tier that
   * assignments point at cannot be deleted or change type (the backend
   * refuses both), so those controls are locked here.
   */
  const renderEditableExistingTiers = (job: PlannerJob, problems: Problem[]) => {
    const change = changeOf(state, job.job_no) || emptyChange();
    const errorKey = state.error && state.error.jobNo === job.job_no ? state.error.key : null;
    const PROBLEM_FIELD: Record<EditableField, ProblemField | null> = {
      name: 'name',
      tier_type: 'type',
      price_per_kg: 'price',
      allocated_weight_kg: 'kg',
      currency: null,
    };
    const marks = (t: { id: number; changed: Set<string> }, field: EditableField) => ({
      'data-changed': flag(t.changed.has(field)),
      'data-invalid': flag(
        problems.some((p) => p.key === `e${t.id}` && p.field === PROBLEM_FIELD[field]),
      ),
    });
    const number = (value: number | null, places: number) =>
      value === null || Number.isNaN(value) ? '' : formatDecimal(value, places);

    return (
      <>
        <div className={classes.tableWrap}>
          <table className={`${classes.table} ${classes.existingEdit}`}>
            <colgroup>
              <col />
              <col style={{ width: 110 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 84 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 96 }} />
              <col style={{ width: 96 }} />
              <col style={{ width: 48 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Ad</th>
                <th>Tip</th>
                <th>Fiyat/kg</th>
                <th>Para B.</th>
                <th>Ayrılan kg</th>
                <th className={classes.end}>Kullanılan</th>
                <th className={classes.end}>Kalan</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {existingTiers(job, change).map((t) => {
                const off = t.deleted;
                const locked = t.assignments > 0;
                const remaining =
                  (t.allocated_weight_kg !== null && Number.isFinite(t.allocated_weight_kg)
                    ? t.allocated_weight_kg
                    : 0) - t.used;
                const rowClass = [
                  t.deleted ? classes.deleted : '',
                  `e${t.id}` === errorKey ? classes.rowError : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <tr key={t.id} data-id={t.id} className={rowClass || undefined}>
                    <td>
                      <input
                        type="text"
                        className={classes.input}
                        {...marks(t, 'name')}
                        data-tp-field="ex-name"
                        value={t.name ?? ''}
                        maxLength={200}
                        aria-label="Kademe adı"
                        disabled={off}
                        onChange={(e) => updateExisting(t.id, 'name', e.target.value)}
                      />
                    </td>
                    <td>
                      <select
                        className={classes.select}
                        {...marks(t, 'tier_type')}
                        aria-label="Tip"
                        value={t.tier_type}
                        disabled={off || locked}
                        title={
                          !off && locked ? 'Ataması olan kademenin tipi değiştirilemez' : undefined
                        }
                        onChange={(e) => updateExisting(t.id, 'tier_type', e.target.value)}
                      >
                        {typeOptions}
                      </select>
                    </td>
                    <td>
                      <DraftInput
                        inputMode="decimal"
                        className={`${classes.input} ${classes.number}`}
                        {...marks(t, 'price_per_kg')}
                        data-tp-field="ex-price"
                        aria-label="Fiyat/kg"
                        disabled={off}
                        value={number(t.price_per_kg, 4)}
                        onCommit={(text) => commitExistingNumber(t.id, 'price_per_kg', text)}
                      />
                    </td>
                    <td>
                      <select
                        className={classes.select}
                        {...marks(t, 'currency')}
                        aria-label="Para birimi"
                        value={t.currency}
                        disabled={off}
                        onChange={(e) => updateExisting(t.id, 'currency', e.target.value)}
                      >
                        {currencyOptions}
                      </select>
                    </td>
                    <td>
                      <DraftInput
                        inputMode="decimal"
                        className={`${classes.input} ${classes.number}`}
                        {...marks(t, 'allocated_weight_kg')}
                        data-tp-field="ex-kg"
                        aria-label="Ayrılan ağırlık (kg)"
                        disabled={off}
                        value={number(t.allocated_weight_kg, 2)}
                        onCommit={(text) => commitExistingNumber(t.id, 'allocated_weight_kg', text)}
                      />
                    </td>
                    <td className={`${classes.end} ${classes.small}`}>{formatKg(t.used)}</td>
                    <td
                      className={`${classes.end} ${classes.small} ${remaining < 0 ? classes.over : ''}`}
                    >
                      {formatKg(remaining)}
                    </td>
                    <td className={classes.end}>
                      {t.deleted ? (
                        <ActionIcon
                          variant="default"
                          title="Silmeyi geri al"
                          aria-label="Silmeyi geri al"
                          onClick={() => toggleExistingDelete(t.id, false)}
                        >
                          <i className="fas fa-undo" />
                        </ActionIcon>
                      ) : (
                        <ActionIcon
                          variant="outline"
                          color="red"
                          title={locked ? 'Ataması olan kademe silinemez' : 'Sil'}
                          aria-label="Sil"
                          disabled={locked}
                          onClick={() => toggleExistingDelete(t.id, true)}
                        >
                          <i className="fas fa-trash" />
                        </ActionIcon>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {hasExistingChanges(change) ? (
          <div className={classes.hint}>
            Kayıtlı kademelerdeki değişiklikler Kaydet ile yazılır.
          </div>
        ) : null}
      </>
    );
  };

  const renderNewTiers = (job: PlannerJob, rows: TierRow[], problems: Problem[]) => {
    if (rows.length === 0) {
      return (
        <div className={`${classes.empty} ${classes.emptyPlan}`}>
          Bu iş emrine eklenecek kademe yok.
          <br />
          Yukarıdan bir şablon ekleyin, kademe ekleyin ya da soldan seçip toplu uygulayın.
        </div>
      );
    }
    const weight = weightOf(state, data, job.job_no);
    const error = state.error && state.error.jobNo === job.job_no ? state.error : null;
    const bad = (key: string, field: ProblemField) =>
      problems.some((p) => p.key === key && p.field === field) ||
      (!!error && error.key === key && error.field === field);
    return (
      <div className={classes.tableWrap}>
        <table className={`${classes.table} ${classes.newTiers}`}>
          <colgroup>
            <col />
            <col style={{ width: 110 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 84 }} />
            <col style={{ width: 84 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 48 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Ad</th>
              <th>Tip</th>
              <th>Fiyat/kg</th>
              <th>Para B.</th>
              <th>Pay %</th>
              <th>Ayrılan kg</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const shareDerived = r.share === null || r.share === undefined;
              const share = effectiveShare(r, weight);
              const kg = allocatedKg(r, weight);
              // A hand-sized tier with no kg yet is a to-do, not an error:
              // orange until a save attempt names it.
              const waiting = awaitsManualKg(r);
              const kgMarks = waiting
                ? {
                    'data-missing': '',
                    'data-invalid': flag(!!state.error && state.error.key === r.key),
                  }
                : { 'data-derived': flag(!shareDerived), 'data-invalid': flag(bad(r.key, 'kg')) };
              return (
                <tr
                  key={r.key}
                  data-key={r.key}
                  className={error && r.key === error.key ? classes.rowError : undefined}
                >
                  <td>
                    <input
                      type="text"
                      className={classes.input}
                      data-invalid={flag(bad(r.key, 'name'))}
                      data-tp-field="tier-name"
                      data-key={r.key}
                      value={r.name}
                      maxLength={200}
                      placeholder="ör. ÇELİK"
                      aria-label="Kademe adı"
                      onChange={(e) => updateTier(r.key, { name: e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      className={classes.select}
                      aria-label="Tip"
                      value={r.tier_type}
                      onChange={(e) => updateTier(r.key, { tier_type: e.target.value })}
                    >
                      {typeOptions}
                    </select>
                  </td>
                  <td>
                    <DraftInput
                      inputMode="decimal"
                      className={`${classes.input} ${classes.number}`}
                      data-invalid={flag(bad(r.key, 'price'))}
                      data-tp-field="tier-price"
                      data-key={r.key}
                      aria-label="Fiyat/kg"
                      value={
                        r.price_per_kg === null || Number.isNaN(r.price_per_kg)
                          ? ''
                          : formatDecimal(r.price_per_kg, 4)
                      }
                      onCommit={(text) => commitTierPrice(r.key, text)}
                    />
                  </td>
                  <td>
                    <select
                      className={classes.select}
                      aria-label="Para birimi"
                      value={r.currency}
                      onChange={(e) => updateTier(r.key, { currency: e.target.value })}
                    >
                      {currencyOptions}
                    </select>
                  </td>
                  <td>
                    <DraftInput
                      inputMode="decimal"
                      className={`${classes.input} ${classes.number}`}
                      data-derived={flag(shareDerived)}
                      data-tp-field="tier-share"
                      data-key={r.key}
                      aria-label="Ağırlık payı (%)"
                      value={share === null ? '' : formatDecimal(share)}
                      placeholder="elle"
                      title={
                        waiting
                          ? 'Pay yok: kg elle girilir'
                          : shareDerived
                            ? "Elle girilen kg'dan hesaplandı"
                            : 'İş emri ağırlığının yüzdesi'
                      }
                      onCommit={(text) => commitTierShare(r.key, text)}
                    />
                  </td>
                  <td>
                    <DraftInput
                      inputMode="decimal"
                      className={`${classes.input} ${classes.number}`}
                      {...kgMarks}
                      data-tp-field="tier-kg"
                      data-key={r.key}
                      aria-label="Ayrılan ağırlık (kg)"
                      value={kg === null ? '' : formatDecimal(kg)}
                      placeholder={waiting ? 'kg girin' : kg === null ? 'ağırlık yok' : ''}
                      title={
                        waiting
                          ? "Kg girin; Enter sıradaki boş kg'ya geçer"
                          : shareDerived
                            ? 'Sabit kg'
                            : 'Paydan hesaplandı; ağırlık değişirse güncellenir'
                      }
                      onCommit={(text) => commitTierKg(r.key, text)}
                      onKeyDown={(event, text) => {
                        if (event.key !== 'Enter') return;
                        event.preventDefault();
                        advanceToNextManualKg(r.key, text ?? event.currentTarget.value);
                      }}
                    />
                  </td>
                  <td className={classes.end}>
                    <ActionIcon
                      variant="outline"
                      color="red"
                      title="Sil"
                      aria-label="Sil"
                      onClick={() =>
                        setFocusedTiers(
                          tiersOf(store.get(), focusedNow()).filter((x) => x.key !== r.key),
                        )
                      }
                    >
                      <i className="fas fa-trash" />
                    </ActionIcon>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderJobDetail = () => {
    const job = focused ? data.jobByNo.get(focused) : undefined;
    if (!job) return <div className={classes.empty}>Soldan bir iş emri seçin.</div>;
    const rows = tiersOf(state, job.job_no);
    const edit = state.edits.get(job.job_no);
    const problems = job.can_plan ? validateJob(job, edit, rows, changeOf(state, job.job_no)) : [];
    const jobProblems = problems.filter((p) => p.key === null);
    const others = selected.filter((no) => no !== job.job_no);
    const error = state.error && state.error.jobNo === job.job_no ? state.error : null;
    const alertText = error ? error.message : (jobProblems[0]?.message ?? null);

    return (
      <>
        <div className={classes.detailHead}>
          <div className={classes.detailHeadText}>
            <div className={classes.detailNo}>
              {job.job_no}
              {statusBadges(job)}
            </div>
            <div className={classes.detailTitle}>{job.title || ''}</div>
          </div>
        </div>
        {alertText ? (
          <div className={classes.alert} role="alert">
            <i className="fas fa-exclamation-circle" />
            {alertText}
          </div>
        ) : null}

        {renderWeightCard(job)}

        <div className={classes.section}>
          <div className={classes.sectionTitle}>
            Kayıtlı fiyat kademeleri <span className={classes.muted}>({job.tiers.length})</span>
          </div>
          {job.tiers.length === 0 ? (
            <div className={classes.muted}>Bu iş emrinde kayıtlı fiyat kademesi yok.</div>
          ) : job.can_plan ? (
            renderEditableExistingTiers(job, problems)
          ) : (
            renderReadOnlyTiers(job)
          )}
        </div>

        <div className={classes.section}>
          <div className={classes.sectionHead}>
            <div className={classes.sectionTitle}>
              Eklenecek fiyat kademeleri <span className={classes.muted}>({rows.length})</span>
            </div>
            {job.can_plan ? (
              <div className={classes.sectionActions}>
                <div className={classes.templateAdd}>
                  <select
                    className={classes.select}
                    aria-label="Kademe şablonu"
                    value={state.detailTemplateId}
                    onChange={(e) => set({ detailTemplateId: e.target.value })}
                  >
                    {templateOptions('Şablon…')}
                  </select>
                  <Button
                    size="xs"
                    variant="outline"
                    leftSection={<i className="fas fa-file-import" />}
                    disabled={!state.detailTemplateId}
                    onClick={() => {
                      const s = store.get();
                      const no = focusedNow();
                      if (s.detailTemplateId && no)
                        applyTemplate([no], s.detailTemplateId, { skipDuplicates: false });
                    }}
                  >
                    Şablonu ekle
                  </Button>
                </div>
                <Button
                  size="xs"
                  variant="outline"
                  leftSection={<i className="fas fa-plus" />}
                  onClick={() => {
                    const no = focusedNow();
                    if (!no) return;
                    const current = tiersOf(store.get(), no);
                    setFocusedTiers([
                      ...current,
                      newTierRow(current, weightOf(store.get(), data, no)),
                    ]);
                  }}
                >
                  Kademe ekle
                </Button>
                <Button
                  size="xs"
                  variant="default"
                  leftSection={<i className="fas fa-copy" />}
                  disabled={!(rows.length && others.length)}
                  title={
                    others.length
                      ? 'Bu kademeleri seçili iş emirlerine, kendi ağırlıklarına göre ekle'
                      : 'Önce soldan hedef iş emirlerini seçin'
                  }
                  onClick={copyFocusedTiersToSelected}
                >
                  Seçililere kopyala{others.length ? ` (${others.length})` : ''}
                </Button>
                <Button
                  size="xs"
                  variant="default"
                  leftSection={<i className="fas fa-bookmark" />}
                  disabled={!rows.length}
                  onClick={() => {
                    const items = templateItemsFromRows(tiersOf(store.get(), focusedNow()));
                    openTemplateManager({
                      id: null,
                      name: '',
                      description: '',
                      is_active: true,
                      items: items.map(draftItem),
                    });
                    notify.info('Şablona bir ad verip kaydedin');
                  }}
                >
                  Şablon olarak kaydet
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  color="red"
                  leftSection={<i className="fas fa-eraser" />}
                  disabled={!rows.length}
                  onClick={() => setFocusedTiers([])}
                >
                  Temizle
                </Button>
              </div>
            ) : null}
          </div>
          {job.can_plan ? (
            renderNewTiers(job, rows, problems)
          ) : (
            <div className={classes.muted}>
              Bu iş emri {job.status === 'cancelled' ? 'iptal edilmiş' : 'tamamlanmış'}; ağırlık ve
              kademe girilemez.
            </div>
          )}
        </div>
      </>
    );
  };

  const draftActiveId = useId();

  const renderTemplateEditor = (draft: Draft) => (
    <>
      <div className={classes.draftFields}>
        <div>
          <label className={classes.label} htmlFor={`${draftActiveId}-name`}>
            Şablon adı
          </label>
          <input
            id={`${draftActiveId}-name`}
            type="text"
            className={classes.input}
            maxLength={200}
            value={draft.name}
            placeholder="ör. Çelik + Boya"
            onChange={(e) => updateDraft({ name: e.target.value })}
          />
        </div>
        <div>
          <label className={classes.label} htmlFor={`${draftActiveId}-description`}>
            Açıklama
          </label>
          <input
            id={`${draftActiveId}-description`}
            type="text"
            className={classes.input}
            value={draft.description}
            onChange={(e) => updateDraft({ description: e.target.value })}
          />
        </div>
      </div>
      <label className={classes.checkLabel}>
        <input
          type="checkbox"
          className={classes.check}
          checked={draft.is_active}
          onChange={(e) => updateDraft({ is_active: e.target.checked })}
        />
        Aktif (pasif şablonlar listede görünmez)
      </label>
      <div className={classes.tableWrap}>
        <table className={`${classes.table} ${classes.tplItems}`}>
          <colgroup>
            <col />
            <col style={{ width: 110 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 84 }} />
            <col style={{ width: 84 }} />
            <col style={{ width: 48 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Ad</th>
              <th>Tip</th>
              <th>Fiyat/kg</th>
              <th>Para B.</th>
              <th>Pay %</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {draft.items.map((item) => (
              <tr key={item.key}>
                <td>
                  <input
                    type="text"
                    className={classes.input}
                    aria-label="Şablon kademe adı"
                    value={item.name}
                    maxLength={200}
                    placeholder="ör. ÇELİK"
                    onChange={(e) => updateDraftItem(item.key, { name: e.target.value })}
                  />
                </td>
                <td>
                  <select
                    className={classes.select}
                    aria-label="Şablon kademe tipi"
                    value={item.tier_type}
                    onChange={(e) => updateDraftItem(item.key, { tier_type: e.target.value })}
                  >
                    {typeOptions}
                  </select>
                </td>
                <td>
                  <input
                    type="text"
                    inputMode="decimal"
                    className={`${classes.input} ${classes.number}`}
                    aria-label="Şablon fiyat/kg"
                    value={item.price_text}
                    onChange={(e) => updateDraftItem(item.key, { price_text: e.target.value })}
                  />
                </td>
                <td>
                  <select
                    className={classes.select}
                    aria-label="Şablon para birimi"
                    value={item.currency}
                    onChange={(e) => updateDraftItem(item.key, { currency: e.target.value })}
                  >
                    {currencyOptions}
                  </select>
                </td>
                <td>
                  <input
                    type="text"
                    inputMode="decimal"
                    className={`${classes.input} ${classes.number}`}
                    aria-label="Şablon pay (%)"
                    value={item.share_text}
                    placeholder="kg elle"
                    title="Boş bırakılırsa kg her iş emrinde elle girilir"
                    onChange={(e) => updateDraftItem(item.key, { share_text: e.target.value })}
                  />
                </td>
                <td className={classes.end}>
                  <ActionIcon
                    variant="outline"
                    color="red"
                    aria-label="Sil"
                    onClick={() =>
                      updateDraft({
                        items: (store.get().draft?.items ?? []).filter((x) => x.key !== item.key),
                      })
                    }
                  >
                    <i className="fas fa-trash" />
                  </ActionIcon>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button
        size="xs"
        variant="outline"
        mt={8}
        mb={16}
        leftSection={<i className="fas fa-plus" />}
        onClick={() => {
          const items = store.get().draft?.items ?? [];
          updateDraft({ items: [...items, draftItem({ currency: items.at(-1)?.currency })] });
        }}
      >
        Kademe ekle
      </Button>
      <div className={classes.draftActions}>
        {draft.id ? (
          <Button
            size="xs"
            color="red"
            variant={state.draftConfirmDelete ? 'filled' : 'outline'}
            leftSection={<i className="fas fa-trash" />}
            disabled={state.draftSaving}
            onClick={() => void deleteDraft()}
          >
            {state.draftConfirmDelete ? 'Silmeyi onayla' : 'Şablonu sil'}
          </Button>
        ) : null}
        <span className={classes.spacer} />
        <Button
          size="xs"
          leftSection={
            state.draftSaving ? <Loader size={12} color="white" /> : <i className="fas fa-save" />
          }
          disabled={state.draftSaving}
          onClick={() => void saveDraft()}
        >
          {state.draftSaving ? 'Kaydediliyor…' : 'Şablonu kaydet'}
        </Button>
      </div>
    </>
  );

  const renderTemplateManager = () => {
    const draft = state.draft;
    return (
      <>
        <div className={classes.detailHead}>
          <div className={`${classes.detailNo} ${classes.detailHeadText}`}>
            <i className="fas fa-layer-group" />
            Fiyat Kademesi Şablonları
          </div>
          <Button
            size="xs"
            variant="default"
            leftSection={<i className="fas fa-arrow-left" />}
            onClick={() => set({ view: 'detail', draftConfirmDelete: false })}
          >
            İş emrine dön
          </Button>
        </div>
        <p className={classes.muted}>
          Pay girilen kademe, iş emri ağırlığının o yüzdesini alır (%100 = iş emrinin tamamı). Pay
          boş bırakılırsa kademe uygulanınca kg&apos;ı her iş emrinde elle girilir. Kaynak
          kademelerinin payları toplamı %100&apos;ü geçemez; boya kademeleri sınırsızdır.
        </p>
        <div className={classes.tplLayout}>
          <div>
            <Button
              size="xs"
              variant="outline"
              fullWidth
              mb={8}
              leftSection={<i className="fas fa-plus" />}
              onClick={() =>
                openTemplateManager({
                  id: null,
                  name: '',
                  description: '',
                  is_active: true,
                  items: [draftItem()],
                })
              }
            >
              Yeni şablon
            </Button>
            {data.templates.length ? (
              data.templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={classes.tplItem}
                  data-active={flag(!!draft && String(draft.id) === String(t.id))}
                  onClick={() => editTemplate(t.id)}
                >
                  <span className={classes.tplName}>{t.name}</span>
                  <span className={classes.muted}>
                    {t.items.length} kademe{t.is_active ? '' : ' · pasif'}
                  </span>
                </button>
              ))
            ) : (
              <div className={classes.muted}>Henüz şablon yok.</div>
            )}
          </div>
          <div>
            {draft ? (
              renderTemplateEditor(draft)
            ) : (
              <div className={classes.empty}>
                Soldan bir şablon seçin ya da yeni bir şablon oluşturun.
              </div>
            )}
          </div>
        </div>
      </>
    );
  };

  const plannable = visible.filter((j) => j.can_plan);
  const checkedCount = plannable.filter((j) => state.selected.has(j.job_no)).length;

  const summaryParts: ReactNode[] = [];
  if (summary.weightCount)
    summaryParts.push(
      <>
        <strong>{summary.weightCount}</strong> ağırlık
      </>,
    );
  if (summary.tierCount)
    summaryParts.push(
      <>
        <strong>{summary.tierCount}</strong> yeni kademe
      </>,
    );
  if (summary.updatedCount)
    summaryParts.push(
      <>
        <strong>{summary.updatedCount}</strong> kademe düzenlemesi
      </>,
    );
  if (summary.deletedCount)
    summaryParts.push(
      <>
        <strong>{summary.deletedCount}</strong> kademe silme
      </>,
    );

  return (
    <Modal
      opened
      onClose={requestClose}
      fullScreen
      withCloseButton={false}
      closeOnEscape={false}
      classNames={modalClassNames}
      padding={0}
    >
      <div className={classes.root} ref={rootRef} onKeyDown={onRootKeyDown}>
        <ModalHeader
          title={
            <>
              Ağırlık ve Fiyat Kademeleri{' '}
              <span className={classes.titleNo}>— {data.rootJobNo}</span>
            </>
          }
          subtitle={subtitle || undefined}
          icon="fas fa-weight-hanging"
        />
        <div className={classes.layout}>
          <aside className={classes.jobs}>
            <div className={classes.toolbar}>
              <input
                type="search"
                className={`${classes.input} ${classes.search}`}
                placeholder="İş emri no veya başlık ara"
                aria-label="İş emri no veya başlık ara"
                autoComplete="off"
                value={state.search}
                onChange={(e) => set({ search: e.target.value, lastCheckedIndex: null })}
              />
              <select
                className={`${classes.select} ${classes.filter}`}
                aria-label="Filtre"
                value={state.filter}
                onChange={(e) => set({ filter: e.target.value as Filter, lastCheckedIndex: null })}
              >
                {FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            {renderBulkBar()}
            <div className={classes.listHead}>
              <input
                type="checkbox"
                className={classes.check}
                aria-label="Görünenleri seç"
                ref={(el) => {
                  if (el) el.indeterminate = checkedCount > 0 && checkedCount < plannable.length;
                }}
                disabled={!ready || plannable.length === 0}
                checked={plannable.length > 0 && checkedCount === plannable.length}
                onChange={(e) => checkVisible(e.target.checked)}
              />
              <span>İş Emri</span>
              <span className={classes.colWeight}>Ağırlık (kg)</span>
              <span className={classes.colTiers}>Kademe</span>
            </div>
            <div className={classes.jobList} role="list" ref={listRef}>
              {renderJobList()}
            </div>
            <div className={classes.listHint}>
              <i className="fas fa-keyboard" /> Enter / ↓ ile alttaki satıra geçin. Excel&apos;den
              bir sütun (ya da &quot;iş emri no + ağırlık&quot; sütunları) yapıştırabilirsiniz.
            </div>
          </aside>
          <section className={classes.detail}>
            {ready
              ? state.view === 'templates'
                ? renderTemplateManager()
                : renderJobDetail()
              : null}
          </section>
        </div>
        <ModalFooter>
          <div className={classes.summary} data-testid="weight-planner-summary">
            {summary.jobCount ? (
              <>
                <strong>{summary.jobCount}</strong> iş emrinde{' '}
                {summaryParts.map((part, i) => (
                  <span key={i}>
                    {i ? ', ' : ''}
                    {part}
                  </span>
                ))}{' '}
                kaydedilecek
              </>
            ) : (
              'Henüz değişiklik yok'
            )}
          </div>
          {state.confirmClose ? (
            <div className={classes.closeConfirm} role="alert">
              <span>Kaydedilmemiş değişiklikler silinecek.</span>
              <Button size="xs" variant="subtle" onClick={() => set({ confirmClose: false })}>
                Vazgeç
              </Button>
              <Button size="xs" color="red" onClick={onClose}>
                Kaydetmeden kapat
              </Button>
            </div>
          ) : null}
          <Button variant="default" disabled={state.saving} onClick={requestClose}>
            İptal
          </Button>
          <Button
            disabled={!summary.jobCount || state.saving}
            leftSection={
              state.saving ? <Loader size={14} color="white" /> : <i className="fas fa-save" />
            }
            onClick={() => void save()}
          >
            {state.saving ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}

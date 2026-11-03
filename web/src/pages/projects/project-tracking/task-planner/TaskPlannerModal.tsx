import {
  ActionIcon,
  Alert,
  Button,
  Checkbox,
  Loader,
  Modal,
  MultiSelect,
  NativeSelect,
  Table,
  TextInput,
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { isApiError } from '@/api/client';
import {
  getTaskTemplate,
  listTaskTemplates,
  taskTemplateKeys,
  TASK_TYPE_OPTIONS,
  type TaskTemplate,
} from '@/api/planning/taskTemplates';
import {
  bulkPlanDepartmentTasks,
  departmentChoicesQueryOptions,
} from '@/api/projects/departmentTasks';
import { taskPlannerQueryOptions } from '@/api/projects/jobOrders';
import {
  FaIcon,
  ModalFooter,
  ModalHeader,
  modalClassNames,
  notify,
  StatusBadge,
  type StatusFamily,
} from '@/ui';
import classes from './TaskPlannerModal.module.css';
import {
  buildBulkPlanPayload,
  cloneRows,
  displayOrder,
  formatServerError,
  newMainRow,
  newSubRow,
  nextSequenceBase,
  planHasTemplate,
  removeRow,
  rowKeyForTempId,
  rowsFromTemplate,
  setRowDepartment,
  summarizePlans,
  validatePlan,
  type PlanRow,
  type PlannerJob,
  type Plans,
  type TaskPlannerTree,
} from './taskPlannerModel';

// Görev Planlama: the "Görev Ekle" modal on a top-level job order (port of
// projects/project-tracking/taskPlanner.js). The whole subtree is on the
// left: tick children and apply a template to all of them, copy one child's
// plan to others, or edit rows by hand. Nothing is written until Kaydet,
// which sends every plan in one atomic request (bulk_plan).

type JobFilter = 'all' | 'unplanned' | 'no_tasks' | 'planned';

const FILTERS: { value: JobFilter; label: string }[] = [
  { value: 'all', label: 'Tüm iş emirleri' },
  { value: 'unplanned', label: 'Planlanmamış' },
  { value: 'no_tasks', label: 'Kayıtlı görevi olmayanlar' },
  { value: 'planned', label: 'Yeni görev eklenenler' },
];

const TASK_STATUS_FAMILY: Record<string, StatusFamily> = {
  completed: 'green',
  in_progress: 'blue',
  blocked: 'red',
  on_hold: 'orange',
  skipped: 'grey',
  cancelled: 'grey',
  pending: 'grey',
};

const JOB_STATUS_FAMILY: Record<string, StatusFamily> = {
  draft: 'grey',
  on_hold: 'orange',
  completed: 'green',
  cancelled: 'grey',
};

const TYPE_OPTIONS = [{ value: '', label: '—' }, ...TASK_TYPE_OPTIONS];
const NO_ROWS: readonly PlanRow[] = [];
const NO_JOBS: readonly PlannerJob[] = [];

interface PendingBulk {
  templateId: string;
  targets: string[];
  withTasks: string[];
}

interface PlanError {
  jobNo: string | null;
  rowKey: string | null;
  message: string;
}

export interface TaskPlannerModalProps {
  /** Top-level job order; the modal is open while this is set. */
  jobNo: string | null;
  onClose: () => void;
  /** After a successful save (legacy openTaskPlanner's onSaved). */
  onSaved?: () => void;
}

export function TaskPlannerModal({ jobNo, onClose, onSaved }: TaskPlannerModalProps) {
  if (!jobNo) return null;
  // Keyed: every opening starts from a clean plan, like legacy.
  return <Planner key={jobNo} jobNo={jobNo} onClose={onClose} onSaved={onSaved} />;
}

const normalize = (text: string | null | undefined) => (text || '').toLocaleLowerCase('tr');

const withRows = (plans: Plans, jobNo: string, rows: readonly PlanRow[]) => {
  const next = new Map(plans);
  next.set(jobNo, rows);
  return next;
};

function Planner({ jobNo, onClose, onSaved }: { jobNo: string; onClose: () => void; onSaved?: () => void }) {
  const tree = useQuery({
    ...taskPlannerQueryOptions<TaskPlannerTree>(jobNo),
    // Fresh tree on every opening; no refetch under an open plan.
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const departmentsQuery = useQuery(departmentChoicesQueryOptions());
  // Legacy: listTaskTemplates({ is_active: true }), first page; a failure leaves the list empty.
  const templatesQuery = useQuery({
    queryKey: taskTemplateKeys.list({ is_active: true }),
    queryFn: ({ signal }) => listTaskTemplates({ is_active: true }, signal),
    select: (page) => page.results,
    retry: false,
  });

  const loading = tree.isPending || departmentsQuery.isPending || templatesQuery.isPending;
  const loadError = tree.isError ? 'İş emri ağacı yüklenemedi.' : null;
  const jobs = tree.data?.job_orders ?? NO_JOBS;
  const departments = useMemo(() => departmentsQuery.data ?? [], [departmentsQuery.data]);
  const templates = useMemo(() => templatesQuery.data ?? [], [templatesQuery.data]);
  const jobByNo = useMemo(() => new Map(jobs.map((j) => [j.job_no, j])), [jobs]);

  const [plans, setPlans] = useState<Plans>(() => new Map());
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [focusedState, setFocused] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<JobFilter>('all');
  const [bulkTemplateId, setBulkTemplateId] = useState('');
  const [detailTemplateId, setDetailTemplateId] = useState('');
  const [pendingBulk, setPendingBulk] = useState<PendingBulk | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<PlanError | null>(null);
  const lastCheckedIndex = useRef<number | null>(null);
  const templateCache = useRef(new Map<string, TaskTemplate>());

  // Async handlers (template load, save) read the plans as they are when they resume.
  const plansRef = useRef(plans);
  useEffect(() => {
    plansRef.current = plans;
  }, [plans]);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Until the user picks one: the first plannable job without tasks, else the first.
  const focused =
    focusedState ?? (jobs.find((j) => j.can_plan && j.tasks.length === 0) ?? jobs[0])?.job_no ?? null;

  const rowsOf = (no: string | null) => (no ? (plans.get(no) ?? NO_ROWS) : NO_ROWS);
  const departmentLabel = (value: string | null | undefined) =>
    departments.find((d) => d.value === value)?.label || value || '';
  const templateName = (id: string) => templates.find((t) => String(t.id) === String(id))?.name ?? '';

  const visibleJobs = useMemo(() => {
    const term = normalize(search.trim());
    return jobs.filter((job) => {
      if (term && !normalize(job.job_no).includes(term) && !normalize(job.title).includes(term)) {
        return false;
      }
      const pending = (plans.get(job.job_no) ?? NO_ROWS).length;
      switch (filter) {
        case 'unplanned':
          return job.can_plan && job.tasks.length === 0 && pending === 0;
        case 'no_tasks':
          return job.tasks.length === 0;
        case 'planned':
          return pending > 0;
        default:
          return true;
      }
    });
  }, [jobs, search, filter, plans]);

  const selectedPlannable = jobs.filter((j) => j.can_plan && selected.has(j.job_no)).map((j) => j.job_no);
  const { jobCount, taskCount } = summarizePlans(plans);

  // ---- plan changes -------------------------------------------------------

  /** A structural change (rows added / removed): clears the job's error and the close prompt. */
  const commitPlans = (next: Plans, touched: readonly string[]) => {
    setPlans(next);
    setConfirmClose(false);
    setError((e) => (e && e.jobNo !== null && touched.includes(e.jobNo) ? null : e));
  };

  /** An edit inside the focused plan (legacy updateRow). */
  const updateRow = (key: string, patch: Partial<PlanRow>) => {
    if (!focused) return;
    setPlans((prev) => {
      const rows = prev.get(focused) ?? NO_ROWS;
      if (!rows.some((r) => r.key === key)) return prev;
      return withRows(prev, focused, rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    });
    setError((e) => (e && e.jobNo === focused ? null : e));
  };

  const loadTemplate = async (id: string) => {
    const key = String(id);
    let template = templateCache.current.get(key);
    if (!template) {
      template = await getTaskTemplate(parseInt(key, 10));
      templateCache.current.set(key, template);
    }
    return template;
  };

  const applyTemplate = async (jobNos: string[], templateId: string, skipDuplicates: boolean) => {
    let template: TaskTemplate;
    try {
      template = await loadTemplate(templateId);
    } catch (err) {
      console.error('Error loading template:', err);
      notify.error('Şablon yüklenemedi');
      return;
    }
    if (!alive.current) return;
    if (!(template.items || []).length) {
      notify.warning('Seçilen şablonda görev yok');
      return;
    }
    const next = new Map(plansRef.current);
    const applied: string[] = [];
    let skipped = 0;
    jobNos.forEach((no) => {
      const rows = next.get(no) ?? NO_ROWS;
      if (skipDuplicates && planHasTemplate(rows, templateId)) {
        skipped += 1;
        return;
      }
      const base = nextSequenceBase(rows, jobByNo.get(no)?.tasks ?? []);
      next.set(no, [...rows, ...rowsFromTemplate(template, { sequenceBase: base })]);
      applied.push(no);
    });
    commitPlans(next, applied);
    const name = template.name || templateName(templateId);
    if (applied.length) {
      notify.success(
        jobNos.length === 1
          ? `«${name}» eklendi`
          : `«${name}» ${applied.length} iş emrine eklendi${skipped ? `, ${skipped} iş emrinde zaten vardı` : ''}`,
      );
    } else if (skipped) {
      notify.info(`«${name}» seçili iş emirlerinin hepsinde zaten var`);
    }
  };

  const startBulkApply = () => {
    const templateId = bulkTemplateId;
    const targets = selectedPlannable;
    if (!templateId || targets.length === 0) return;
    const withTasks = targets.filter((no) => (jobByNo.get(no)?.tasks.length ?? 0) > 0);
    if (withTasks.length > 0) {
      setPendingBulk({ templateId, targets, withTasks });
      return;
    }
    void applyTemplate(targets, templateId, true);
  };

  const finishBulkApply = (onlyEmpty: boolean) => {
    const confirm = pendingBulk;
    setPendingBulk(null);
    if (!confirm) return;
    const targets = onlyEmpty
      ? confirm.targets.filter((no) => !confirm.withTasks.includes(no))
      : confirm.targets;
    if (targets.length === 0) return;
    void applyTemplate(targets, confirm.templateId, true);
  };

  const bulkClear = () => {
    const targets = selectedPlannable.filter((no) => rowsOf(no).length > 0);
    const count = targets.reduce((sum, no) => sum + rowsOf(no).length, 0);
    const next = new Map(plans);
    targets.forEach((no) => next.set(no, []));
    commitPlans(next, targets);
    if (count) notify.info(`${targets.length} iş emrinden ${count} yeni görev kaldırıldı`);
  };

  const copyFocusedPlanToSelected = () => {
    if (!focused) return;
    const source = rowsOf(focused);
    const targets = selectedPlannable.filter((no) => no !== focused);
    if (!source.length || !targets.length) return;
    const next = new Map(plans);
    targets.forEach((no) => {
      const rows = next.get(no) ?? NO_ROWS;
      const base = nextSequenceBase(rows, jobByNo.get(no)?.tasks ?? []);
      next.set(no, [...rows, ...cloneRows(source, { sequenceBase: base })]);
    });
    commitPlans(next, targets);
    notify.success(`${source.length} görev ${targets.length} iş emrine kopyalandı`);
  };

  const setFocusedRows = (rows: readonly PlanRow[]) => {
    if (focused) commitPlans(withRows(plans, focused, rows), [focused]);
  };

  const addRow = () => {
    const job = focused ? jobByNo.get(focused) : undefined;
    if (!job) return;
    const rows = rowsOf(job.job_no);
    const department = departments[0]?.value || '';
    setFocusedRows([...rows, newMainRow(rows, job.tasks, department, departmentLabel(department))]);
  };

  const changeDepartment = (key: string, value: string) => {
    if (!focused) return;
    const rows = rowsOf(focused);
    const row = rows.find((r) => r.key === key);
    if (!row) return;
    // A title still reading the old department's name follows the new one.
    const retitle = !row.title || row.title === departmentLabel(row.department);
    let next = setRowDepartment(rows, key, value);
    if (retitle) next = next.map((r) => (r.key === key ? { ...r, title: departmentLabel(value) } : r));
    setPlans(withRows(plans, focused, next));
    setError((e) => (e && e.jobNo === focused ? null : e));
  };

  const commitWeight = (key: string, raw: string) => {
    const weight = parseInt(raw, 10);
    if (!Number.isInteger(weight) || weight < 1) {
      // The field falls back to the row's weight.
      notify.warning('Ağırlık en az 1 olmalıdır');
      return;
    }
    updateRow(key, { weight });
  };

  const commitSequence = (key: string, raw: string) => {
    const sequence = parseInt(raw, 10);
    updateRow(key, { sequence: Number.isInteger(sequence) && sequence >= 0 ? sequence : 1 });
  };

  // ---- selection ----------------------------------------------------------

  const changeSelection = (next: ReadonlySet<string>) => {
    setSelected(next);
    setPendingBulk(null);
  };

  const checkJob = (job: PlannerJob, index: number, checked: boolean, shiftKey: boolean) => {
    const next = new Set(selected);
    const last = lastCheckedIndex.current;
    if (shiftKey && last !== null && last < visibleJobs.length) {
      const [from, to] = [last, index].sort((a, b) => a - b) as [number, number];
      visibleJobs.slice(from, to + 1).forEach((j) => {
        if (!j.can_plan) return;
        if (checked) next.add(j.job_no);
        else next.delete(j.job_no);
      });
    } else if (checked) {
      next.add(job.job_no);
    } else {
      next.delete(job.job_no);
    }
    lastCheckedIndex.current = index;
    changeSelection(next);
  };

  const checkVisible = (checked: boolean) => {
    const next = new Set(selected);
    visibleJobs.forEach((job) => {
      if (!job.can_plan) return;
      if (checked) next.add(job.job_no);
      else next.delete(job.job_no);
    });
    changeSelection(next);
  };

  const selectNoTasks = () => {
    const next = new Set(selected);
    visibleJobs.forEach((j) => {
      if (j.can_plan && j.tasks.length === 0) next.add(j.job_no);
    });
    changeSelection(next);
  };

  const clearSelection = () => {
    lastCheckedIndex.current = null;
    changeSelection(new Set());
  };

  const focusJob = (no: string) => {
    if (!jobByNo.has(no) || focused === no) return;
    setFocused(no);
  };

  // ---- save / close -------------------------------------------------------

  const save = async () => {
    for (const job of jobs) {
      const problem = validatePlan(rowsOf(job.job_no))[0];
      if (problem) {
        const message = `${job.job_no}: ${problem.message}`;
        setError({ jobNo: job.job_no, rowKey: problem.key, message });
        setFocused(job.job_no);
        setConfirmClose(false);
        notify.error(message);
        return;
      }
    }
    const payload = buildBulkPlanPayload(
      plans,
      jobs.map((j) => j.job_no),
    );
    if (payload.plans.length === 0) return;
    setSaving(true);
    setConfirmClose(false);
    try {
      const response = await bulkPlanDepartmentTasks(payload);
      notify.success(response?.message || 'Görevler oluşturuldu');
      onSaved?.();
      onClose();
    } catch (err) {
      console.error('Error saving task plans:', err);
      if (!alive.current) return;
      const data: Record<string, unknown> =
        isApiError(err) && err.data && typeof err.data === 'object'
          ? (err.data as Record<string, unknown>)
          : {};
      const errorJob =
        typeof data.job_order === 'string' && jobByNo.has(data.job_order) ? data.job_order : null;
      const rowKey =
        errorJob && data.temp_id !== undefined && data.temp_id !== null
          ? rowKeyForTempId(plansRef.current.get(errorJob) ?? NO_ROWS, Number(data.temp_id))
          : null;
      const message = formatServerError(data) || 'Görevler kaydedilemedi';
      setError({ jobNo: errorJob, rowKey, message });
      if (errorJob) setFocused(errorJob);
      notify.error(message);
    } finally {
      if (alive.current) setSaving(false);
    }
  };

  /** Esc, the close button and İptal: unsaved rows ask first (legacy hide.bs.modal guard). */
  const requestClose = () => {
    if (saving) return;
    if (taskCount > 0) {
      setConfirmClose(true);
      return;
    }
    onClose();
  };

  // ---- render -------------------------------------------------------------

  const root = jobByNo.get(jobNo);
  const templateData = (placeholder: string) => [
    { value: '', label: placeholder },
    ...templates.map((t) => ({
      value: String(t.id),
      label: `${t.name}${t.is_default ? ' (Varsayılan)' : ''}`,
    })),
  ];

  const plannableVisible = visibleJobs.filter((j) => j.can_plan);
  const checkedVisible = plannableVisible.filter((j) => selected.has(j.job_no)).length;
  const ready = !loading && !loadError;

  let jobList: ReactNode;
  if (loading) {
    jobList = (
      <div className={classes.empty}>
        <Loader size="xs" mr={8} />
        Yükleniyor…
      </div>
    );
  } else if (loadError) {
    jobList = <div className={`${classes.empty} ${classes.loadError}`}>{loadError}</div>;
  } else if (visibleJobs.length === 0) {
    jobList = <div className={classes.empty}>Filtreye uyan iş emri yok.</div>;
  } else {
    jobList = visibleJobs.map((job, index) => (
      <JobRow
        key={job.job_no}
        job={job}
        pending={rowsOf(job.job_no).length}
        active={job.job_no === focused}
        hasError={!!error && error.jobNo === job.job_no}
        checked={job.can_plan && selected.has(job.job_no)}
        onFocus={() => focusJob(job.job_no)}
        onCheck={(checked, shiftKey) => checkJob(job, index, checked, shiftKey)}
      />
    ));
  }

  return (
    <Modal
      opened
      onClose={requestClose}
      fullScreen
      withCloseButton={false}
      closeOnClickOutside={false}
      padding={0}
      classNames={{ ...modalClassNames, content: classes.content, body: `${modalClassNames.body} ${classes.body}` }}
    >
      <ModalHeader
        title={`Görev Planlama — ${jobNo}`}
        subtitle={root ? `${root.title || ''}${jobs.length > 1 ? ` · ${jobs.length} iş emri` : ''}` : undefined}
        icon="fas fa-tasks"
      />
      <div className={classes.layout}>
        <aside className={classes.jobs}>
          <div className={classes.toolbar}>
            <TextInput
              className={classes.search}
              size="xs"
              type="search"
              leftSection={<FaIcon icon="fas fa-search" />}
              placeholder="İş emri no veya başlık ara"
              aria-label="İş emri no veya başlık ara"
              autoComplete="off"
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
            />
            <NativeSelect
              className={classes.filter}
              size="xs"
              aria-label="Filtre"
              data={FILTERS}
              value={filter}
              onChange={(e) => setFilter(e.currentTarget.value as JobFilter)}
            />
          </div>
          {ready ? (
            <BulkBar
              selectedCount={selectedPlannable.length}
              pendingInSelection={selectedPlannable.filter((no) => rowsOf(no).length > 0).length}
              templateData={templateData('Şablon seçin…')}
              bulkTemplateId={bulkTemplateId}
              pendingBulk={pendingBulk}
              pendingTemplateName={pendingBulk ? templateName(pendingBulk.templateId) : ''}
              onTemplateChange={(value) => {
                setBulkTemplateId(value);
                setPendingBulk(null);
              }}
              onSelectNoTasks={selectNoTasks}
              onClearSelection={clearSelection}
              onApply={startBulkApply}
              onClear={bulkClear}
              onConfirm={finishBulkApply}
              onCancelConfirm={() => setPendingBulk(null)}
            />
          ) : null}
          <div className={classes.listHead}>
            <Checkbox
              size="xs"
              aria-label="Görünenleri seç"
              disabled={!ready || plannableVisible.length === 0}
              checked={ready && plannableVisible.length > 0 && checkedVisible === plannableVisible.length}
              indeterminate={ready && checkedVisible > 0 && checkedVisible < plannableVisible.length}
              onChange={(e) => checkVisible(e.currentTarget.checked)}
            />
            <span>İş Emri</span>
            <span className={classes.colCounts}>Kayıtlı / Yeni</span>
          </div>
          <div className={classes.jobList} role="list">
            {jobList}
          </div>
        </aside>
        <section className={classes.detail} data-tp-detail>
          {ready ? (
            <Detail
              job={focused ? jobByNo.get(focused) : undefined}
              rows={rowsOf(focused)}
              error={error && focused && error.jobNo === focused ? error : null}
              copyTargets={selectedPlannable.filter((no) => no !== focused).length}
              departments={departments}
              departmentLabel={departmentLabel}
              templateData={templateData('Şablon…')}
              detailTemplateId={detailTemplateId}
              onTemplateChange={setDetailTemplateId}
              onApplyTemplate={() => {
                if (detailTemplateId && focused) void applyTemplate([focused], detailTemplateId, false);
              }}
              onAddRow={addRow}
              onAddSubRow={(key) => setFocusedRows([...rowsOf(focused), newSubRow(rowsOf(focused), key)])}
              onRemoveRow={(key) => setFocusedRows(removeRow(rowsOf(focused), key))}
              onCopy={copyFocusedPlanToSelected}
              onClearPlan={() => setFocusedRows([])}
              onUpdateRow={updateRow}
              onDepartmentChange={changeDepartment}
              onWeightCommit={commitWeight}
              onSequenceCommit={commitSequence}
            />
          ) : null}
        </section>
      </div>
      <ModalFooter>
        <div className={classes.summary}>
          {taskCount ? (
            <>
              <strong>{jobCount}</strong> iş emrine toplam <strong>{taskCount}</strong> görev eklenecek
            </>
          ) : (
            'Henüz eklenecek görev yok'
          )}
        </div>
        {confirmClose ? (
          <div className={classes.closeConfirm} role="alert">
            <span>{`Kaydedilmemiş ${taskCount} görev silinecek.`}</span>
            <Button size="xs" variant="subtle" onClick={() => setConfirmClose(false)}>
              Vazgeç
            </Button>
            <Button size="xs" color="red" onClick={onClose}>
              Kaydetmeden kapat
            </Button>
          </div>
        ) : null}
        <Button variant="default" disabled={saving} onClick={requestClose}>
          İptal
        </Button>
        <Button
          disabled={!taskCount || saving}
          leftSection={saving ? <Loader size={14} color="currentColor" /> : <FaIcon icon="fas fa-save" />}
          onClick={() => void save()}
        >
          {saving ? 'Kaydediliyor…' : `Kaydet${taskCount ? ` (${taskCount})` : ''}`}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Left column
// ---------------------------------------------------------------------------

function TitledBadge({ title, color, children }: { title?: string; color: StatusFamily; children: ReactNode }) {
  return (
    <span className={classes.countBadge} title={title}>
      <StatusBadge color={color}>{children}</StatusBadge>
    </span>
  );
}

function JobStatusBadges({ job }: { job: PlannerJob }) {
  return (
    <>
      {job.is_phase ? <StatusBadge color="purple">Faz</StatusBadge> : null}
      {job.status !== 'active' ? (
        <StatusBadge color={JOB_STATUS_FAMILY[job.status] ?? 'grey'}>{job.status_display}</StatusBadge>
      ) : null}
    </>
  );
}

function JobRow({
  job,
  pending,
  active,
  hasError,
  checked,
  onFocus,
  onCheck,
}: {
  job: PlannerJob;
  pending: number;
  active: boolean;
  hasError: boolean;
  checked: boolean;
  onFocus: () => void;
  onCheck: (checked: boolean, shiftKey: boolean) => void;
}) {
  return (
    <div
      className={classes.jobRow}
      role="listitem"
      tabIndex={0}
      aria-current={active}
      data-job={job.job_no}
      data-active={active || undefined}
      data-disabled={!job.can_plan || undefined}
      data-error={hasError || undefined}
      style={{ '--tp-depth': Math.min(job.depth, 6) } as CSSProperties}
      onClick={onFocus}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onFocus();
        }
      }}
    >
      <span className={classes.jobCheck} onClick={(e) => e.stopPropagation()}>
        <Checkbox
          size="xs"
          aria-label={`${job.job_no} seç`}
          checked={checked}
          disabled={!job.can_plan}
          onChange={(e) => {
            const native = e.nativeEvent as Partial<MouseEvent>;
            onCheck(e.currentTarget.checked, !!native.shiftKey);
          }}
        />
      </span>
      <div className={classes.jobMain}>
        <div className={classes.jobNo}>
          {job.job_no}
          <JobStatusBadges job={job} />
        </div>
        <div className={classes.jobTitle} title={job.title ?? undefined}>
          {job.title || '–'}
        </div>
      </div>
      <div className={classes.jobBadges}>
        {job.tasks.length ? (
          <TitledBadge title="Kayıtlı görev" color="grey">
            {job.tasks.length}
          </TitledBadge>
        ) : (
          <TitledBadge title="Kayıtlı görev yok" color={job.can_plan ? 'orange' : 'grey'}>
            0
          </TitledBadge>
        )}
        {pending ? (
          <TitledBadge title="Eklenecek görev" color="blue">{`+${pending}`}</TitledBadge>
        ) : (
          <span className={classes.badgeEmpty}>–</span>
        )}
      </div>
    </div>
  );
}

function BulkBar({
  selectedCount,
  pendingInSelection,
  templateData,
  bulkTemplateId,
  pendingBulk,
  pendingTemplateName,
  onTemplateChange,
  onSelectNoTasks,
  onClearSelection,
  onApply,
  onClear,
  onConfirm,
  onCancelConfirm,
}: {
  selectedCount: number;
  pendingInSelection: number;
  templateData: { value: string; label: string }[];
  bulkTemplateId: string;
  pendingBulk: PendingBulk | null;
  pendingTemplateName: string;
  onTemplateChange: (value: string) => void;
  onSelectNoTasks: () => void;
  onClearSelection: () => void;
  onApply: () => void;
  onClear: () => void;
  onConfirm: (onlyEmpty: boolean) => void;
  onCancelConfirm: () => void;
}) {
  const emptyCount = pendingBulk ? pendingBulk.targets.length - pendingBulk.withTasks.length : 0;
  return (
    <div className={classes.bulkbar}>
      <div className={classes.bulkRow}>
        <span className={classes.selCount}>
          {selectedCount ? (
            <>
              <strong>{selectedCount}</strong> iş emri seçili
            </>
          ) : (
            'Toplu işlem için iş emri seçin'
          )}
        </span>
        <Button size="compact-xs" variant="subtle" onClick={onSelectNoTasks}>
          Görevsizleri seç
        </Button>
        {selectedCount ? (
          <Button size="compact-xs" variant="subtle" onClick={onClearSelection}>
            Seçimi kaldır
          </Button>
        ) : null}
      </div>
      <div className={classes.bulkRow}>
        <NativeSelect
          className={classes.bulkSelect}
          size="xs"
          aria-label="Şablon"
          data={templateData}
          value={bulkTemplateId}
          onChange={(e) => onTemplateChange(e.currentTarget.value)}
        />
        <Button
          size="xs"
          leftSection={<FaIcon icon="fas fa-layer-group" />}
          disabled={!selectedCount || !bulkTemplateId}
          onClick={onApply}
        >
          Seçililere uygula
        </Button>
        <ActionIcon
          size="input-xs"
          variant="outline"
          color="red"
          title="Seçililere eklenen yeni görevleri temizle"
          aria-label="Seçililere eklenen yeni görevleri temizle"
          disabled={!pendingInSelection}
          onClick={onClear}
        >
          <FaIcon icon="fas fa-eraser" />
        </ActionIcon>
      </div>
      {pendingBulk ? (
        <div className={classes.inlineConfirm} role="alert">
          <div>
            Seçili {pendingBulk.targets.length} iş emrinin <strong>{pendingBulk.withTasks.length}</strong>{' '}
            tanesinde zaten kayıtlı görev var. «{pendingTemplateName}» nereye uygulansın?
          </div>
          <div className={classes.inlineConfirmActions}>
            <Button size="compact-xs" disabled={!emptyCount} onClick={() => onConfirm(true)}>
              {`Yalnızca görevsizlere (${emptyCount})`}
            </Button>
            <Button size="compact-xs" variant="outline" onClick={() => onConfirm(false)}>
              {`Hepsine (${pendingBulk.targets.length})`}
            </Button>
            <Button size="compact-xs" variant="subtle" onClick={onCancelConfirm}>
              Vazgeç
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right column
// ---------------------------------------------------------------------------

interface DetailProps {
  job: PlannerJob | undefined;
  rows: readonly PlanRow[];
  error: PlanError | null;
  copyTargets: number;
  departments: readonly { value: string; label: string }[];
  departmentLabel: (value: string | null | undefined) => string;
  templateData: { value: string; label: string }[];
  detailTemplateId: string;
  onTemplateChange: (value: string) => void;
  onApplyTemplate: () => void;
  onAddRow: () => void;
  onAddSubRow: (key: string) => void;
  onRemoveRow: (key: string) => void;
  onCopy: () => void;
  onClearPlan: () => void;
  onUpdateRow: (key: string, patch: Partial<PlanRow>) => void;
  onDepartmentChange: (key: string, value: string) => void;
  onWeightCommit: (key: string, raw: string) => void;
  onSequenceCommit: (key: string, raw: string) => void;
}

function Detail(props: DetailProps) {
  const { job, rows, error, copyTargets } = props;
  if (!job) return <div className={classes.empty}>Soldan bir iş emri seçin.</div>;

  return (
    <>
      <div className={classes.detailHead}>
        <div className={classes.detailNo}>
          {job.job_no}
          <JobStatusBadges job={job} />
        </div>
        <div className={classes.detailTitle}>{job.title || ''}</div>
      </div>
      {error ? (
        <Alert color="red" py={8} mb={12} icon={<FaIcon icon="fas fa-exclamation-circle" />}>
          {error.message}
        </Alert>
      ) : null}

      <div className={classes.section}>
        <div className={classes.sectionTitle}>
          Kayıtlı görevler <span className={classes.muted}>({job.tasks.length})</span>
        </div>
        <ExistingTasks job={job} />
      </div>

      <div className={classes.section}>
        <div className={classes.sectionHead}>
          <div className={classes.sectionTitle}>
            Eklenecek görevler <span className={classes.muted}>({rows.length})</span>
          </div>
          {job.can_plan ? (
            <div className={classes.sectionActions}>
              <div className={classes.templateAdd}>
                <NativeSelect
                  size="xs"
                  aria-label="Şablon"
                  data={props.templateData}
                  value={props.detailTemplateId}
                  onChange={(e) => props.onTemplateChange(e.currentTarget.value)}
                />
                <Button
                  size="xs"
                  variant="outline"
                  leftSection={<FaIcon icon="fas fa-file-import" />}
                  disabled={!props.detailTemplateId}
                  onClick={props.onApplyTemplate}
                >
                  Şablonu ekle
                </Button>
              </div>
              <Button size="xs" variant="outline" leftSection={<FaIcon icon="fas fa-plus" />} onClick={props.onAddRow}>
                Görev ekle
              </Button>
              <Button
                size="xs"
                variant="default"
                leftSection={<FaIcon icon="fas fa-copy" />}
                disabled={!rows.length || !copyTargets}
                title={copyTargets ? 'Bu listeyi seçili iş emirlerine ekle' : 'Önce soldan hedef iş emirlerini seçin'}
                onClick={props.onCopy}
              >
                {`Seçililere kopyala${copyTargets ? ` (${copyTargets})` : ''}`}
              </Button>
              <Button
                size="xs"
                variant="outline"
                color="red"
                leftSection={<FaIcon icon="fas fa-eraser" />}
                disabled={!rows.length}
                onClick={props.onClearPlan}
              >
                Temizle
              </Button>
            </div>
          ) : null}
        </div>
        {job.can_plan ? (
          <RowsTable {...props} errorKey={error?.rowKey ?? null} />
        ) : (
          <div className={classes.muted}>
            {`Bu iş emri ${job.status === 'cancelled' ? 'iptal edilmiş' : 'tamamlanmış'}; görev eklenemez.`}
          </div>
        )}
      </div>
    </>
  );
}

function ExistingTasks({ job }: { job: PlannerJob }) {
  if (job.tasks.length === 0) return <div className={classes.muted}>Bu iş emrinde kayıtlı görev yok.</div>;
  return (
    <div className={classes.existing}>
      {job.tasks.map((t, index) => {
        const title = t.title || t.department_display || '';
        const meta = [
          title === t.department_display ? null : t.department_display,
          t.subtask_count ? `${t.subtask_count} alt görev` : null,
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <div key={t.id ?? index} className={classes.existingItem}>
            <span className={classes.existingSeq}>{t.sequence}</span>
            <span className={classes.existingTitle}>
              {title}
              {meta ? <span className={classes.muted}>{` · ${meta}`}</span> : null}
            </span>
            <StatusBadge color={TASK_STATUS_FAMILY[t.status ?? ''] ?? 'grey'}>{t.status_display}</StatusBadge>
          </div>
        );
      })}
    </div>
  );
}

function RowsTable({
  rows,
  errorKey,
  departments,
  departmentLabel,
  onAddSubRow,
  onRemoveRow,
  onUpdateRow,
  onDepartmentChange,
  onWeightCommit,
  onSequenceCommit,
}: DetailProps & { errorKey: string | null }) {
  if (rows.length === 0) {
    return (
      <div className={`${classes.empty} ${classes.emptyPlan}`}>
        Bu iş emrine eklenecek görev yok.
        <br />
        Yukarıdan bir şablon ekleyin, görev ekleyin ya da soldan seçip toplu uygulayın.
      </div>
    );
  }
  const mains = rows.filter((r) => !r.parentKey);
  const mainKeys = new Set(mains.map((m) => m.key));
  return (
    <div className={classes.rowsWrap}>
      <Table className={classes.rows} verticalSpacing={6} horizontalSpacing={6}>
        <colgroup>
          <col style={{ width: 72 }} />
          <col />
          <col style={{ width: 140 }} />
          <col style={{ width: 140 }} />
          <col style={{ width: 80 }} />
          <col style={{ width: 220 }} />
          <col style={{ width: 80 }} />
        </colgroup>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Sıra</Table.Th>
            <Table.Th>Başlık</Table.Th>
            <Table.Th>Departman</Table.Th>
            <Table.Th>Görev tipi</Table.Th>
            <Table.Th>Ağırlık</Table.Th>
            <Table.Th>Bağımlılıklar</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {displayOrder(rows).map(({ row, depth }) => {
            const isSub = depth > 0;
            return (
              <Table.Tr
                key={row.key}
                data-key={row.key}
                data-sub={isSub || undefined}
                data-error={row.key === errorKey || undefined}
              >
                <Table.Td>
                  <CommitNumberInput
                    size="xs"
                    min={0}
                    aria-label="Sıra"
                    value={row.sequence}
                    onCommit={(raw) => onSequenceCommit(row.key, raw)}
                  />
                </Table.Td>
                <Table.Td>
                  <div className={classes.titleCell} style={{ '--tp-depth': depth } as CSSProperties}>
                    {isSub ? (
                      <span className={classes.subMark} aria-hidden>
                        ↳
                      </span>
                    ) : null}
                    <TextInput
                      size="xs"
                      maxLength={255}
                      aria-label="Başlık"
                      placeholder={isSub ? 'Alt görev başlığı' : 'Boş bırakılırsa iş emri başlığı'}
                      value={row.title}
                      onChange={(e) => onUpdateRow(row.key, { title: e.currentTarget.value })}
                    />
                  </div>
                </Table.Td>
                <Table.Td>
                  <NativeSelect
                    size="xs"
                    aria-label="Departman"
                    data={departments.map((d) => ({ value: d.value, label: d.label }))}
                    value={row.department}
                    disabled={isSub}
                    title={isSub ? 'Alt görev üst görevin departmanındadır' : undefined}
                    onChange={(e) => onDepartmentChange(row.key, e.currentTarget.value)}
                  />
                </Table.Td>
                <Table.Td>
                  <NativeSelect
                    size="xs"
                    aria-label="Görev tipi"
                    data={TYPE_OPTIONS}
                    value={row.task_type ?? ''}
                    onChange={(e) => onUpdateRow(row.key, { task_type: e.currentTarget.value || null })}
                  />
                </Table.Td>
                <Table.Td>
                  <CommitNumberInput
                    size="xs"
                    min={1}
                    step={1}
                    aria-label="Ağırlık"
                    value={row.weight}
                    onCommit={(raw) => onWeightCommit(row.key, raw)}
                  />
                </Table.Td>
                <Table.Td>
                  {isSub ? (
                    <span className={classes.muted}>—</span>
                  ) : (
                    <MultiSelect
                      size="xs"
                      aria-label="Bağımlılıklar"
                      placeholder="Yok"
                      searchable={mains.length > 8}
                      data={mains
                        .filter((m) => m.key !== row.key)
                        .map((m) => ({
                          value: m.key,
                          label: `${m.sequence}. ${m.title || departmentLabel(m.department)}`,
                        }))}
                      value={row.dependsOn.filter((k) => mainKeys.has(k) && k !== row.key)}
                      onChange={(value) => onUpdateRow(row.key, { dependsOn: value })}
                    />
                  )}
                </Table.Td>
                <Table.Td>
                  <div className={classes.rowActions}>
                    {isSub ? null : (
                      <ActionIcon
                        size="input-xs"
                        variant="default"
                        title="Alt görev ekle"
                        aria-label="Alt görev ekle"
                        onClick={() => onAddSubRow(row.key)}
                      >
                        <FaIcon icon="fas fa-level-down-alt" />
                      </ActionIcon>
                    )}
                    <ActionIcon
                      size="input-xs"
                      variant="outline"
                      color="red"
                      title="Sil"
                      aria-label="Sil"
                      onClick={() => onRemoveRow(row.key)}
                    >
                      <FaIcon icon="fas fa-trash" />
                    </ActionIcon>
                  </div>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </div>
  );
}

/**
 * A number field that hands its text over on blur / Enter (the legacy
 * `change` event); until then it shows what is typed, after it the row's value.
 */
function CommitNumberInput({
  value,
  onCommit,
  ...props
}: Omit<ComponentPropsWithoutRef<typeof TextInput>, 'value' | 'onChange' | 'onBlur' | 'onKeyDown' | 'type'> & {
  value: number;
  onCommit: (raw: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    onCommit(draft);
  };
  return (
    <TextInput
      {...props}
      type="number"
      value={draft ?? String(value)}
      onChange={(e) => setDraft(e.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
    />
  );
}

import { createContext, useContext } from 'react';
import type { DepartmentTask, StatusChoice } from '@/api/projects/departmentTasks';
import { AppLink } from '@/shell/AppLink';
import { FaIcon, notify, StatusBadge, type DataTableColumn, type EditOption } from '@/ui';
import type { DepartmentTasksConfig } from './config';
import classes from './DepartmentTasks.module.css';
import {
  clampPercent,
  dateOnly,
  designReviewBadge,
  displayTitle,
  isDerivedDuration,
  isPartRow,
  isTitleEditable,
  progressColor,
  qcBadge,
  shortDate,
  statusFamily,
  trNumber,
} from './logic';

/**
 * Tree state the first column reads. A context, not a column dependency, so
 * the columns stay memoized and only the tree cells re-render on a toggle.
 */
export interface TreeState {
  levels: Map<number, number>;
  expanded: ReadonlySet<number>;
  loading: ReadonlySet<number>;
  toggle: (task: DepartmentTask) => void;
}

export const TreeContext = createContext<TreeState>({
  levels: new Map(),
  expanded: new Set(),
  loading: new Set(),
  toggle: () => undefined,
});

const LEVEL_WIDTH = 20;

function TreeCell({ task }: { task: DepartmentTask }) {
  const tree = useContext(TreeContext);
  const level = tree.levels.get(task.id) ?? (task.parent ? 1 : 0);
  const hasChildren = (task.subtasks_count || 0) > 0;
  const expanded = tree.expanded.has(task.id);
  const lines = [];
  for (let l = 0; l < level; l++) {
    const center = l * LEVEL_WIDTH + LEVEL_WIDTH / 2;
    lines.push(<div key={`v${l}`} className={classes.treeLineV} style={{ left: center - 1 }} />);
    if (l < level - 1) {
      lines.push(
        <div
          key={`h${l}`}
          className={classes.treeLineH}
          style={{ left: center, width: LEVEL_WIDTH }}
        />,
      );
    }
  }
  if (level > 0) {
    const last = (level - 1) * LEVEL_WIDTH + LEVEL_WIDTH / 2;
    lines.push(
      <div
        key="hl"
        className={classes.treeLineH}
        style={{ left: last, width: level * LEVEL_WIDTH - last }}
      />,
    );
  }
  return (
    <div className={classes.tree}>
      {lines}
      {hasChildren ? (
        <button
          type="button"
          className={classes.toggle}
          style={{ left: level * LEVEL_WIDTH }}
          aria-expanded={expanded}
          aria-label={expanded ? 'Daralt' : 'Genişlet'}
          title={expanded ? 'Daralt' : 'Genişlet'}
          onClick={(event) => {
            event.stopPropagation();
            tree.toggle(task);
          }}
        >
          <FaIcon
            icon={
              tree.loading.has(task.id)
                ? 'fas fa-spinner fa-spin'
                : expanded
                  ? 'fas fa-minus'
                  : 'fas fa-plus'
            }
          />
        </button>
      ) : null}
    </div>
  );
}

function SubtaskPrefix({ task }: { task: DepartmentTask }) {
  return task.parent ? (
    <FaIcon icon="fas fa-level-down-alt" className={classes.muted} style={{ marginRight: 4 }} />
  ) : null;
}

function KeyLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={classes.keyLink}>
      {children}
    </a>
  );
}

/** The İş Emri cell: request number, part key, job order, or "Bağımsız". */
export function JobOrderCell({ task }: { task: DepartmentTask }) {
  const indent = task.parent ? classes.indent : undefined;
  if (task.task_type === 'procurement_item') {
    const number = task.purchase_request_number || task.planning_request_number;
    if (number) {
      const href = task.purchase_request_number
        ? `/procurement/purchase-requests/registry/?talep=${encodeURIComponent(number)}`
        : `/planning/department-requests/?talep=${encodeURIComponent(number)}`;
      return (
        <div className={indent}>
          <SubtaskPrefix task={task} />
          <KeyLink href={href}>{number}</KeyLink>
        </div>
      );
    }
  }
  if (task.type === 'machining_part') {
    const key = task.key || task.machining_data?.key;
    if (key) {
      const md = task.machining_data ?? {};
      const others = Array.isArray(md.other_job_nos) ? md.other_job_nos.filter(Boolean) : [];
      return (
        <div className={indent}>
          <SubtaskPrefix task={task} />
          <KeyLink href={`/manufacturing/machining/tasks/list/?key=${encodeURIComponent(key)}`}>
            {key}
          </KeyLink>
          {others.length ? (
            <small
              className={classes.muted}
              style={{ display: 'block' }}
              title="Birden fazla iş emrine bölünmüş parça"
            >
              {md.allocated_quantity ?? '-'} / {md.quantity ?? '-'} adet · ortak:{' '}
              {others.join(', ')}
            </small>
          ) : null}
        </div>
      );
    }
  }
  if (task.type === 'cnc_part') {
    const key = task.cnc_data?.cnc_task_key || task.key;
    if (key) {
      return (
        <div className={indent}>
          <SubtaskPrefix task={task} />
          <KeyLink href={`/manufacturing/cnc-cutting/cuts/?cut=${encodeURIComponent(key)}`}>
            {key}
          </KeyLink>
        </div>
      );
    }
  }
  if (task.job_order) {
    return (
      <div className={indent}>
        <SubtaskPrefix task={task} />
        <AppLink to={`/projects/project-tracking/?job_no=${encodeURIComponent(task.job_order)}`}>
          <strong>{task.job_order}</strong>
        </AppLink>
      </div>
    );
  }
  if (task.is_consultation) {
    return (
      <div className={indent}>
        <SubtaskPrefix task={task} />
        <strong>{task.id != null ? String(task.id) : '-'}</strong>
      </div>
    );
  }
  return (
    <div className={indent}>
      <SubtaskPrefix task={task} />
      <span title="İş emrine bağlı olmayan görev">
        <StatusBadge color="grey">
          <FaIcon icon="fas fa-inbox" style={{ marginRight: 4 }} />
          Bağımsız
        </StatusBadge>
      </span>
    </div>
  );
}

function TitleCell({ task }: { task: DepartmentTask }) {
  const { full, short } = displayTitle(task);
  return (
    <div
      className={task.parent ? classes.indent : undefined}
      title={full}
      style={isTitleEditable(task) ? { cursor: 'pointer' } : undefined}
    >
      {short}
      {task.is_consultation ? (
        <span title="Teklif Danışma" style={{ marginLeft: 4 }}>
          <StatusBadge color="blue">
            <FaIcon icon="fas fa-handshake" />
          </StatusBadge>
        </span>
      ) : null}
      {task.is_consultation && task.offer_summary ? (
        <>
          <br />
          <small className={classes.muted}>{task.offer_summary.offer_no || ''}</small>
        </>
      ) : null}
    </div>
  );
}

function StatusCell({
  task,
  statuses,
  config,
}: {
  task: DepartmentTask;
  statuses: StatusChoice[];
  config: DepartmentTasksConfig;
}) {
  const status = statuses.find((s) => s.value === task.status) ?? {
    label: task.status ?? '',
    color: 'grey',
  };
  const isItem = task.task_type === 'procurement_item';
  const family = isItem && task.is_partially_delivered ? 'orange' : statusFamily(status.color);
  const label = isItem && task.status_display ? task.status_display : status.label;
  const review = designReviewBadge(config, task);
  const qc = qcBadge(task);
  return (
    <div className={classes.badges}>
      <StatusBadge color={family}>{label}</StatusBadge>
      {task.is_under_revision ? (
        <StatusBadge color="red">
          <FaIcon icon="fas fa-rotate" style={{ marginRight: 4 }} />
          Revizyonda
        </StatusBadge>
      ) : null}
      {review?.kind === 'pending' ? (
        <StatusBadge color="blue">
          <FaIcon icon="fas fa-search" style={{ marginRight: 4 }} />
          İncelemede{review.progress}
        </StatusBadge>
      ) : null}
      {review?.kind === 'rejected' ? (
        <StatusBadge color="red">
          <FaIcon icon="fas fa-times-circle" style={{ marginRight: 4 }} />
          İnceleme Reddedildi
        </StatusBadge>
      ) : null}
      {qc ? (
        <StatusBadge color={qc.family}>
          <FaIcon icon={qc.icon} style={{ marginRight: 4 }} />
          {qc.label}
        </StatusBadge>
      ) : null}
    </div>
  );
}

function kg(value: unknown) {
  const text = trNumber(value, 2);
  return text ? <small className={classes.muted}> ({text} kg)</small> : null;
}

function AllocationsCell({ task }: { task: DepartmentTask }) {
  // Subcontractor 9 is the fixed paint subcontractor: on every painted job, so noise here.
  const subs = (
    Array.isArray(task.assigned_subcontractors) ? task.assigned_subcontractors : []
  ).filter((item) => Number(item?.subcontractor_id) !== 9);
  const teams = Array.isArray(task.assigned_teams) ? task.assigned_teams : [];
  if (subs.length + teams.length === 0) return <>-</>;
  return (
    <div style={{ fontSize: '0.875em' }}>
      {subs.map((item, i) => (
        <div key={`s${i}`}>
          <FaIcon icon="fas fa-handshake" className={classes.muted} style={{ marginRight: 4 }} />
          {item?.subcontractor_name || '-'}
          {kg(item?.allocated_weight_kg)}
        </div>
      ))}
      {teams.map((item, i) => (
        <div key={`t${i}`}>
          <FaIcon icon="fas fa-users" className={classes.muted} style={{ marginRight: 4 }} />
          {item?.team_name || '-'}
          {kg(item?.allocated_weight_kg)}
        </div>
      ))}
    </div>
  );
}

function ProgressCell({ value }: { value: DepartmentTask['completion_percentage'] }) {
  if (!value && value !== 0) return <div style={{ textAlign: 'center' }}>-</div>;
  const pct = clampPercent(value);
  const color = progressColor(pct);
  return (
    <div className={classes.progress} title="İlerlemeyi düzenlemek için tıklayın">
      <div
        className={classes.progressBar}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{
          width: `${pct}%`,
          background: `linear-gradient(90deg, ${color} 0%, ${color}dd 100%)`,
        }}
      />
      <div className={classes.progressText}>{pct.toFixed(1)}%</div>
    </div>
  );
}

const DERIVED_HINT =
  'Bu satırın süresi üst göreve girilen süreden ağırlık payıyla türetiliyor — değiştirmek için üst görevin süresini güncelleyin.';

function DurationCell({ task }: { task: DepartmentTask }) {
  const own = task.estimated_duration_wd;
  if (own !== null && own !== undefined && own !== '') return <>{trNumber(own)} g</>;
  if (isDerivedDuration(task)) {
    return (
      <span
        className={classes.muted}
        title="Üst göreve girilen süreden ağırlık payıyla türetildi — girilmiş bir değer değil"
        onClick={(event) => {
          // A derived cell is read-only (Kural 1): say why, like legacy.
          event.stopPropagation();
          notify.info(DERIVED_HINT);
        }}
      >
        ≈{trNumber(task.derived_duration_wd)} g
      </span>
    );
  }
  return <>-</>;
}

function editableTitle(row: DepartmentTask, title: string): string | undefined {
  // Legacy only showed the hint on rows it meant to edit.
  return isPartRow(row) ? undefined : title;
}

export interface ColumnDeps {
  config: DepartmentTasksConfig;
  statuses: StatusChoice[];
  userOptions: EditOption[];
}

/** The legacy table's columns. Build once per config/statuses/users (useMemo). */
export function buildColumns({
  config,
  statuses,
  userOptions,
}: ColumnDeps): DataTableColumn<DepartmentTask>[] {
  const extra: DataTableColumn<DepartmentTask>[] = [];
  if (config.extraColumn === 'allocations') {
    extra.push({
      key: 'assigned_subcontractors',
      header: 'Taşeron / Takım',
      sortable: false,
      render: (row) => <AllocationsCell task={row} />,
      exportValue: (row) =>
        [
          ...(row.assigned_subcontractors ?? [])
            .filter((i) => Number(i?.subcontractor_id) !== 9)
            .map((i) => i?.subcontractor_name || '-'),
          ...(row.assigned_teams ?? []).map((i) => i?.team_name || '-'),
        ].join(', '),
    });
  }
  if (config.extraColumn === 'jobOrderWeight') {
    extra.push({
      key: 'job_order_total_weight_kg',
      header: 'İş Emri Ağırlığı',
      sortable: false,
      align: 'center',
      // Only on the top task: children share the job order.
      render: (row) => {
        const v = row.job_order_total_weight_kg;
        if (row.parent || v === null || v === undefined || v === '')
          return <span className={classes.muted}>-</span>;
        return <>{trNumber(v, 2)} kg</>;
      },
    });
  }

  const columns: DataTableColumn<DepartmentTask>[] = [
    {
      key: '_expand',
      header: '',
      sortable: false,
      width: 80,
      exportable: false,
      render: (row) => <TreeCell task={row} />,
    },
    {
      key: 'job_order',
      header: 'İş Emri',
      sortable: true,
      render: (row) => <JobOrderCell task={row} />,
    },
    {
      key: 'title',
      header: 'Görev Başlığı',
      sortable: true,
      accessor: (row) => displayTitle(row).full,
      render: (row) => <TitleCell task={row} />,
      editable: {
        enabled: isTitleEditable,
        value: (row) => row.title ?? '',
        validate: (value) => (String(value ?? '').trim() ? null : 'Başlık boş olamaz'),
        apply: (row, value) => ({ ...row, title: String(value ?? '').trim() }),
      },
    },
    {
      key: 'customer_name',
      header: 'Müşteri',
      sortable: true,
      render: (row) => (
        <div className={row.parent ? classes.indent : undefined}>{row.customer_name || '-'}</div>
      ),
    },
    {
      key: 'status',
      header: 'Durum',
      sortable: true,
      accessor: (row) => statuses.find((s) => s.value === row.status)?.label ?? row.status,
      render: (row) => <StatusCell task={row} statuses={statuses} config={config} />,
    },
    {
      key: 'assigned_to_name',
      header: 'Atanan',
      sortable: false,
      render: (row) => (
        <div title={editableTitle(row, 'Atanan kişiyi değiştirmek için tıklayın')}>
          {row.assigned_to_name || '-'}
        </div>
      ),
      editable: {
        type: 'select',
        options: [{ value: '', label: 'Atanmamış' }, ...userOptions],
        value: (row) => (row.assigned_to ? String(row.assigned_to) : ''),
        apply: (row, value) => ({
          ...row,
          assigned_to: value ? Number(value) : null,
          assigned_to_name: value
            ? (userOptions.find((u) => u.value === value)?.label ?? null)
            : null,
        }),
      },
    },
    ...extra,
    {
      key: 'target_start_date',
      header: 'Hedef Başlangıç',
      sortable: true,
      accessor: (row) => (row.target_start_date ? new Date(row.target_start_date) : null),
      render: (row) => (
        <div title={editableTitle(row, 'Hedef başlangıç tarihini değiştirmek için tıklayın')}>
          {shortDate(row.target_start_date)}
        </div>
      ),
      editable: {
        type: 'date',
        value: (row) => dateOnly(row.target_start_date),
        apply: (row, value) => ({ ...row, target_start_date: (value as string | null) || null }),
      },
    },
    {
      key: 'target_completion_date',
      header: 'Hedef Bitiş',
      sortable: true,
      accessor: (row) => (row.target_completion_date ? new Date(row.target_completion_date) : null),
      render: (row) => (
        <div title={editableTitle(row, 'Hedef bitiş tarihini değiştirmek için tıklayın')}>
          {shortDate(row.target_completion_date)}
        </div>
      ),
      editable: {
        type: 'date',
        value: (row) => dateOnly(row.target_completion_date),
        apply: (row, value) => ({
          ...row,
          target_completion_date: (value as string | null) || null,
        }),
      },
    },
    {
      key: 'estimated_duration_wd',
      header: 'Süre (iş g.)',
      sortable: true,
      accessor: (row) =>
        row.estimated_duration_wd === null ||
        row.estimated_duration_wd === undefined ||
        row.estimated_duration_wd === ''
          ? null
          : Number(row.estimated_duration_wd),
      render: (row) => <DurationCell task={row} />,
      editable: {
        type: 'number',
        min: 0.5,
        step: 0.5,
        enabled: (row) => !isDerivedDuration(row),
        value: (row) => row.estimated_duration_wd ?? '',
      },
    },
    {
      key: 'completion_percentage',
      header: 'Tamamlanma',
      sortable: false,
      accessor: (row) =>
        row.completion_percentage === null || row.completion_percentage === undefined
          ? null
          : clampPercent(row.completion_percentage),
      render: (row) => <ProgressCell value={row.completion_percentage} />,
      editable: {
        type: 'number',
        step: 0.1,
        // Only a bar can be clicked; an empty ("-") cell has no editor.
        enabled: (row) => !(!row.completion_percentage && row.completion_percentage !== 0),
        value: (row) => clampPercent(row.completion_percentage).toFixed(1),
        validate: (value) =>
          value === null ||
          typeof value !== 'number' ||
          Number.isNaN(value) ||
          value < 0 ||
          value > 99
            ? 'Geçerli bir değer girin (0-99)'
            : null,
      },
    },
    {
      key: 'weight',
      header: 'Ağırlık',
      sortable: true,
      align: 'center',
      accessor: (row) =>
        row.weight === null || row.weight === undefined || row.weight === ''
          ? null
          : Number(row.weight),
      render: (row) => (
        <div title={editableTitle(row, 'Ağırlığı düzenlemek için tıklayın')}>
          {row.weight !== null && row.weight !== undefined && row.weight !== ''
            ? Number.parseFloat(String(row.weight)).toFixed(2)
            : '-'}
        </div>
      ),
      editable: {
        type: 'number',
        step: 0.01,
        value: (row) =>
          row.weight !== null && row.weight !== undefined && row.weight !== ''
            ? Number.parseFloat(String(row.weight)).toFixed(2)
            : '',
        validate: (value) =>
          value !== null && typeof value === 'number' && value < 0
            ? 'Geçerli bir ağırlık değeri girin (0 veya pozitif sayı)'
            : null,
      },
    },
    {
      key: 'subtasks_count',
      header: 'Alt Görevler',
      sortable: false,
      align: 'center',
      render: (row) => <>{row.subtasks_count ? String(row.subtasks_count) : '-'}</>,
    },
  ];
  return columns;
}

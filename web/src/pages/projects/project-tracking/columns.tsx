import { ActionIcon, Button, Group, Menu, Tooltip } from '@mantine/core';
import { createContext, useContext, type CSSProperties, type ReactNode } from 'react';
import { formatDate } from '@/lib/format';
import { AppLink } from '@/shell/AppLink';
import { FaIcon, StatusBadge, type DataTableColumn } from '@/ui';
import {
  CLASSIFICATION_BADGES,
  formatWorkDays,
  verdictBadge,
  type Forecast,
  type NodeProjection,
  type TaskSchedule,
} from './forecast';
import classes from './ProjectTracking.module.css';
import { isTaskRow, type Fit, type JobRow, type TaskRow, type TrackingRow } from './rows';

// Columns of the Proje Takibi list (legacy initializeTableComponent). Cells
// read the page state through TrackingContext so the column array only
// changes with the layout.

export const DEPARTMENT_TASK_URL_MAP: Record<string, string> = {
  manufacturing: '/manufacturing/projects/',
  design: '/design/projects/',
  planning: '/planning/projects/',
  procurement: '/procurement/projects/',
  logistics: '/logistics/projects/',
  painting: '/painting/projects/',
};

/** [icon, tone, label]. Labels follow the status code, not status_display. */
export const JOB_STATUS_ICONS: Record<string, [string, string, string]> = {
  draft: ['fa-pencil-alt', 'grey', 'Taslak'],
  active: ['fa-play-circle', 'blue', 'Aktif'],
  on_hold: ['fa-pause-circle', 'orange', 'Beklemede'],
  completed: ['fa-check-circle', 'green', 'Tamamlandı'],
  cancelled: ['fa-times-circle', 'red', 'İptal Edildi'],
};

const TASK_STATUS_ICONS: Record<string, [string, string]> = {
  pending: ['fa-hourglass-half', 'grey'],
  in_progress: ['fa-play-circle', 'blue'],
  blocked: ['fa-ban', 'red'],
  on_hold: ['fa-pause-circle', 'orange'],
  completed: ['fa-check-circle', 'green'],
  cancelled: ['fa-times-circle', 'grey'],
  skipped: ['fa-forward', 'grey'],
};

/** Excel "Durum": a revision hold reads "Revizyonda". */
export function jobStatusLabel(row: JobRow | TrackingRow): string {
  if (isTaskRow(row)) return row.status_display || row.status || '-';
  if (row.status === 'on_hold' && row.hold_kind === 'revision') return 'Revizyonda';
  return JOB_STATUS_ICONS[row.status]?.[2] || row.status_display || '-';
}

export interface TrackingState {
  fit: Fit;
  hideActions: boolean;
  canEdit: boolean;
  /** "Tüm İşler": children are in the list already, so no children toggle. */
  showAll: boolean;
  expandedChildren: ReadonlySet<string>;
  expandedTasks: ReadonlySet<string>;
  expandedSubtasks: ReadonlySet<number>;
  /** Toggle keys in flight: `children:<no>`, `tasks:<no>`, `subtasks:<id>`. */
  loading: ReadonlySet<string>;
  toggleChildren: (jobNo: string) => void;
  toggleTasks: (jobNo: string) => void;
  toggleSubtasks: (taskId: number) => void;
  rootForecast: (jobNo: string) => Forecast | undefined;
  nodeProjection: (jobNo: string) => NodeProjection | undefined;
  taskSchedule: (taskId: number) => TaskSchedule | undefined;
  forecastState: 'loading' | 'ready' | 'failed';
  /** A production plan is being fetched for an expanded row. */
  plansPending: boolean;
  view: (jobNo: string) => void;
  reviseTargetDate: (jobNo: string, current: string | null | undefined) => void;
  start: (jobNo: string) => void;
  hold: (jobNo: string) => void;
  resume: (jobNo: string) => void;
  cancel: (jobNo: string) => void;
  recalculate: (jobNo: string) => void;
  createChild: (jobNo: string) => void;
  openTaskPlanner: (jobNo: string) => void;
  openWeightPlanner: (jobNo: string) => void;
  deleteTask: (task: TaskRow) => void;
}

export const TrackingContext = createContext<TrackingState | null>(null);

function useTracking(): TrackingState {
  const value = useContext(TrackingContext);
  if (!value) throw new Error('TrackingContext missing');
  return value;
}

function shortDate(value: string | null | undefined, tight: boolean): string {
  return formatDate(value, {
    year: tight ? '2-digit' : 'numeric',
    month: tight ? '2-digit' : 'short',
    day: tight ? '2-digit' : 'numeric',
  });
}

// ---- cells ------------------------------------------------------------------

function ExpandButton({
  accent,
  expanded,
  loading,
  slot,
  level,
  title,
  icon,
  onClick,
}: {
  accent: 'blue' | 'green';
  expanded: boolean;
  loading: boolean;
  slot: number;
  level: number;
  title: string;
  icon: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={classes.expandBtn}
      data-accent={accent}
      data-expanded={expanded || undefined}
      style={{ '--lvl': level, '--slot': slot } as CSSProperties}
      title={title}
      aria-label={title}
      aria-expanded={expanded}
      disabled={loading}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <FaIcon icon={loading ? 'fas fa-spinner fa-spin' : `fas ${icon}`} />
    </button>
  );
}

function TreeCell({ row }: { row: TrackingRow }) {
  const s = useTracking();
  const level = row.hierarchy_level || 0;
  const lines = [];
  for (let i = 0; i < level; i++) {
    const style = { '--i': i } as CSSProperties;
    if (i < level - 1) {
      lines.push(<div key={`t${i}`} className={classes.treeLine} data-kind="through" style={style} />);
    } else {
      lines.push(<div key={`h${i}`} className={classes.treeLine} data-kind="half" style={style} />);
      lines.push(<div key={`e${i}`} className={classes.treeLine} data-kind="elbow" style={style} />);
    }
  }
  const buttons = [];
  if (isTaskRow(row)) {
    if ((row.subtasks_count || 0) > 0) {
      const expanded = s.expandedSubtasks.has(row.id);
      buttons.push(
        <ExpandButton
          key="sub"
          accent="blue"
          expanded={expanded}
          loading={s.loading.has(`subtasks:${row.id}`)}
          slot={0}
          level={level}
          title={expanded ? 'Alt görevleri gizle' : 'Alt görevleri göster'}
          icon={expanded ? 'fa-minus' : 'fa-plus'}
          onClick={() => s.toggleSubtasks(row.id)}
        />,
      );
    }
  } else {
    let slot = 0;
    if (!s.showAll && (row.children_count || 0) > 0) {
      const expanded = s.expandedChildren.has(row.job_no);
      buttons.push(
        <ExpandButton
          key="children"
          accent="blue"
          expanded={expanded}
          loading={s.loading.has(`children:${row.job_no}`)}
          slot={slot++}
          level={level}
          title={expanded ? 'Alt işleri gizle' : 'Alt işleri göster'}
          icon={expanded ? 'fa-minus' : 'fa-plus'}
          onClick={() => s.toggleChildren(row.job_no)}
        />,
      );
    }
    if ((row.department_task_count || 0) > 0) {
      const expanded = s.expandedTasks.has(row.job_no);
      buttons.push(
        <ExpandButton
          key="tasks"
          accent="green"
          expanded={expanded}
          loading={s.loading.has(`tasks:${row.job_no}`)}
          slot={slot}
          level={level}
          title={expanded ? 'Departman görevlerini gizle' : 'Departman görevlerini göster'}
          icon={expanded ? 'fa-minus' : 'fa-tasks'}
          onClick={() => s.toggleTasks(row.job_no)}
        />,
      );
    }
  }
  return (
    <div className={classes.expandCell}>
      {lines}
      {buttons}
    </div>
  );
}

function StatusIcon({ row }: { row: TrackingRow }) {
  let glyph: string;
  let tone: string;
  let label: string;
  if (isTaskRow(row)) {
    const icon = TASK_STATUS_ICONS[row.status ?? ''];
    if (!icon) return null;
    [glyph, tone] = icon;
    label = row.status_display || row.status || '';
  } else {
    const icon = JOB_STATUS_ICONS[row.status];
    if (!icon) return null;
    [glyph, tone, label] = icon;
    if (row.status === 'on_hold' && row.hold_kind === 'revision') {
      // A revision hold is live work waiting on the drawing, not a job parked by hand.
      glyph = 'fa-drafting-compass';
      label = 'Revizyonda';
    }
  }
  return (
    <i className={`fas ${glyph} ${classes.statusIcon}`} data-tone={tone} title={label} aria-label={label} role="img" />
  );
}

function JobNoCell({ row }: { row: TrackingRow }) {
  const s = useTracking();
  if (isTaskRow(row)) {
    return (
      <span className={classes.jobNoCell}>
        <StatusIcon row={row} />
        {row.parent ? (
          <span className={classes.deptLabel} data-tone="muted">
            <FaIcon icon="fas fa-level-down-alt" /> Alt Görev
          </span>
        ) : (
          <span className={classes.deptLabel} data-tone="done">
            <FaIcon icon="fas fa-tasks" /> Görev
          </span>
        )}
      </span>
    );
  }
  if (!row.job_no) return <>-</>;
  const isChild = (row.hierarchy_level || (row.parent ? 1 : 0)) > 0;
  return (
    <span className={classes.jobNoCell}>
      <StatusIcon row={row} />
      <button
        type="button"
        className={classes.jobNo}
        data-muted={isChild || undefined}
        title={`${row.job_no}: detayları aç`}
        onClick={(event) => {
          event.stopPropagation();
          s.view(row.job_no);
        }}
      >
        {row.job_no}
      </button>
    </span>
  );
}

function DepartmentLink({ task }: { task: TaskRow }) {
  const value = task.department_display || task.department || '-';
  if (value === '-') return <>-</>;
  const base = DEPARTMENT_TASK_URL_MAP[task.department ?? ''];
  if (base && task.id) {
    return (
      <AppLink
        to={`${base}?task=${encodeURIComponent(task.id)}`}
        className={classes.deptLink}
        onClick={(event) => event.stopPropagation()}
      >
        {value}
      </AppLink>
    );
  }
  return <span className={classes.deptName}>{value}</span>;
}

function TitleCell({ row }: { row: TrackingRow }) {
  if (isTaskRow(row)) {
    const title = row.title || row.description || '';
    if (row.parent) return <div className={classes.titleTask}>{title || '-'}</div>;
    return (
      <div className={classes.titleWrap}>
        <DepartmentLink task={row} />
        {title ? <div className={classes.titleSub}>{title}</div> : null}
      </div>
    );
  }
  if (!row.title) return <>-</>;
  return (
    <div className={row.hierarchy_level > 0 ? classes.titleChild : classes.titleRoot} title={row.title}>
      {row.title}
    </div>
  );
}

function CustomerCell({ row }: { row: TrackingRow }) {
  if (isTaskRow(row)) return <>-</>;
  const name = row.customer_short_name || row.customer_name;
  if (!name) return <>-</>;
  return (
    <div className={classes.customer} title={name}>
      {name}
    </div>
  );
}

function previousTargetDate(row: JobRow): string | null {
  const previous = row.previous_target_date_revision;
  if (!previous) return null;
  if (typeof previous === 'string') return previous;
  return (
    previous.previous_date ||
    (previous.date as string | null | undefined) ||
    (previous.target_completion_date as string | null | undefined) ||
    null
  );
}

function TargetDateCell({ row }: { row: TrackingRow }) {
  const s = useTracking();
  const tight = s.fit.tight;
  const value = row.target_completion_date;
  const revise =
    !s.hideActions && !isTaskRow(row) ? (
      <Tooltip label="Hedef tarihi revize et" withArrow openDelay={300}>
        <ActionIcon
          variant="subtle"
          size="xs"
          aria-label="Hedef tarihi revize et"
          className={classes.reviseBtn}
          onClick={(event) => {
            event.stopPropagation();
            s.reviseTargetDate(row.job_no, value);
          }}
        >
          <FaIcon icon="fas fa-pen-to-square" />
        </ActionIcon>
      </Tooltip>
    ) : null;
  if (!value) {
    return revise ? (
      <div className={classes.stackRow}>
        <span className={classes.muted}>-</span>
        {revise}
      </div>
    ) : (
      <>-</>
    );
  }
  const text = shortDate(value, tight);
  if (isTaskRow(row)) return <span className={classes.date}>{text}</span>;

  const previous = !tight ? previousTargetDate(row) : null;
  const previousText = previous ? formatDate(previous, { year: 'numeric', month: 'short', day: 'numeric' }) : null;
  const days = Math.ceil(
    (new Date(new Date(value).setHours(0, 0, 0, 0)).getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000,
  );
  const tone = row.status === 'completed' ? 'normal' : days < 0 ? 'late' : days <= 7 ? 'soon' : 'normal';
  return (
    <div className={classes.stack}>
      <div className={classes.stackRow}>
        <span className={classes.stackDate} data-tone={tone}>
          {text}
        </span>
        {revise}
      </div>
      {previousText ? (
        <div className={classes.projNote}>
          <span className={classes.prevTarget} title={`Önceki hedef ${previousText}`}>
            Önceki hedef {previousText}
          </span>
        </div>
      ) : null}
    </div>
  );
}

export function progressTone(percentage: number): string {
  if (percentage === 0) return 'zero';
  if (percentage < 25) return 'low';
  if (percentage < 50) return 'mid';
  if (percentage < 75) return 'high';
  if (percentage < 100) return 'near';
  return 'full';
}

function ProgressCell({ row }: { row: TrackingRow }) {
  const value = row.completion_percentage;
  if (!value && value !== 0) return <>-</>;
  const percentage = Math.min(100, Math.max(0, Number.parseFloat(String(value)) || 0));
  return (
    <div className={classes.progressWrap}>
      <div className={classes.progress}>
        <div
          className={classes.progressBar}
          data-tone={progressTone(percentage)}
          role="progressbar"
          style={{ '--pct': `${percentage}%` } as CSSProperties}
          aria-valuenow={percentage}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      <div className={classes.progressLabel}>{percentage.toFixed(1)}%</div>
    </div>
  );
}

const PENDING = (
  <span className={classes.muted} title="Öngörü verisi yükleniyor">
    …
  </span>
);

function ProjectionShell({ date, children }: { date: string; children?: ReactNode }) {
  return (
    <div className={classes.projection}>
      <span className={classes.projectionDate}>{date}</span>
      {children ? <span className={classes.projectionBadges}>{children}</span> : null}
    </div>
  );
}

function TaskProjection({ row }: { row: TaskRow }) {
  const s = useTracking();
  const schedule = s.taskSchedule(row.id);
  if (!schedule) return s.plansPending ? PENDING : <>-</>;
  const completed = row.status === 'completed';
  const end = schedule.projected_end_date || schedule.actual_end_date;
  if (!end) return <>-</>;
  const text = shortDate(end, s.fit.tight);
  const variance = schedule.projected_variance_wd ?? schedule.end_variance_wd ?? schedule.overdue_wd;
  const badge =
    completed && schedule.classification === 'unplanned'
      ? { label: 'Bitti', family: 'green' as const }
      : (CLASSIFICATION_BADGES[schedule.classification ?? ''] ?? CLASSIFICATION_BADGES.not_started!);
  const late = variance !== null && variance !== undefined && variance > 0;
  const prefix = completed || schedule.actual_end_date ? '' : '~';
  return (
    <ProjectionShell date={`${prefix}${text}`}>
      <StatusBadge color={badge.family}>{badge.label}</StatusBadge>
      {variance !== null && variance !== undefined && variance !== 0 ? (
        <span className={classes.variance} data-late={late || undefined}>
          {late ? '+' : ''}
          {formatWorkDays(variance)} iş günü{late ? ' geç' : ' erken'}
        </span>
      ) : null}
    </ProjectionShell>
  );
}

function JobProjection({ row }: { row: JobRow }) {
  const s = useTracking();
  const forecast = s.rootForecast(row.job_no);
  if (forecast) {
    const badge = verdictBadge(forecast);
    const date = forecast.projected_completion_date;
    if (!date) {
      return (
        <ProjectionShell date="-">
          <StatusBadge color={badge.family}>{badge.label}</StatusBadge>
        </ProjectionShell>
      );
    }
    const phased = Boolean(forecast.phases && forecast.phases.length);
    const lostWd = forecast.material_wait_wd;
    return (
      <ProjectionShell date={shortDate(date, s.fit.tight)}>
        <StatusBadge color={badge.family}>{badge.label}</StatusBadge>
        {phased && forecast.worst_phase !== null && forecast.worst_phase !== undefined ? (
          <span className={classes.phaseNote}>Faz {forecast.worst_phase}</span>
        ) : null}
        {/* Working days lost to undelivered material: a late verdict then reads as procurement's. */}
        {typeof lostWd === 'number' && lostWd > 0 ? (
          <span className={classes.materialChip} title="Malzeme beklemesinden kaynaklanan kayıp iş günü">
            ⏳ {formatWorkDays(lostWd)} g malzeme
          </span>
        ) : null}
      </ProjectionShell>
    );
  }
  const node = s.nodeProjection(row.job_no);
  if (node?.projected) {
    const late = Boolean(node.target && node.projected > node.target);
    return (
      <ProjectionShell date={shortDate(node.projected, s.fit.tight) || '-'}>
        {late ? (
          <StatusBadge color="red">Hedefi aşıyor</StatusBadge>
        ) : node.target ? (
          <StatusBadge color="green">Hedef içinde</StatusBadge>
        ) : null}
      </ProjectionShell>
    );
  }
  if (s.forecastState === 'loading' || s.plansPending) return PENDING;
  if (s.forecastState === 'failed') {
    return (
      <span className={classes.muted} title="Öngörü verisi yüklenemedi">
        -
      </span>
    );
  }
  return <>-</>;
}

function ActionsCell({ row }: { row: TrackingRow }) {
  const s = useTracking();
  if (isTaskRow(row)) {
    if ((row.subtasks_count || 0) !== 0) return null;
    return (
      <Group gap={4} justify="flex-end" wrap="nowrap">
        <Tooltip label="Sil" withArrow openDelay={300}>
          <ActionIcon
            variant="subtle"
            color="red"
            aria-label="Sil"
            onClick={(event) => {
              event.stopPropagation();
              s.deleteTask(row);
            }}
          >
            <FaIcon icon="fas fa-trash" />
          </ActionIcon>
        </Tooltip>
      </Group>
    );
  }
  if (s.hideActions) return null;
  const open = row.status !== 'completed' && row.status !== 'cancelled';
  const menu = [
    {
      key: 'add-department-task',
      label: 'Görev Ekle',
      icon: 'fas fa-tasks',
      // Plans tasks for the whole subtree, so it lives on the root only.
      show: s.canEdit && !row.parent && open,
      run: () => s.openTaskPlanner(row.job_no),
    },
    {
      key: 'weights-and-tiers',
      label: 'Ağırlık ve Kademeler',
      icon: 'fas fa-weight-hanging',
      show: s.canEdit && !row.parent && open,
      run: () => s.openWeightPlanner(row.job_no),
    },
    {
      key: 'create-child',
      label: 'Alt İş Oluştur',
      icon: 'fas fa-plus-circle',
      show: s.canEdit && open,
      run: () => s.createChild(row.job_no),
    },
    {
      key: 'resume',
      label: 'Devam Et',
      icon: 'fas fa-play-circle',
      show: row.status === 'on_hold',
      run: () => s.resume(row.job_no),
    },
    {
      key: 'recalculate-progress',
      label: 'İlerlemeyi Yeniden Hesapla',
      icon: 'fas fa-calculator',
      show: s.canEdit && row.status !== 'cancelled',
      run: () => s.recalculate(row.job_no),
    },
  ].filter((item) => item.show);
  const canCancel = s.canEdit && open;
  return (
    <Group gap={4} justify="flex-end" wrap="nowrap">
      {row.status === 'draft' ? (
        <Tooltip label="Başlat" withArrow openDelay={300}>
          <ActionIcon
            variant="subtle"
            color="green"
            aria-label="Başlat"
            onClick={(event) => {
              event.stopPropagation();
              s.start(row.job_no);
            }}
          >
            <FaIcon icon="fas fa-play" />
          </ActionIcon>
        </Tooltip>
      ) : null}
      {s.canEdit && row.status === 'active' ? (
        <Tooltip label="Beklet" withArrow openDelay={300}>
          <ActionIcon
            variant="subtle"
            color="yellow"
            aria-label="Beklet"
            onClick={(event) => {
              event.stopPropagation();
              s.hold(row.job_no);
            }}
          >
            <FaIcon icon="fas fa-pause" />
          </ActionIcon>
        </Tooltip>
      ) : null}
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label="Diğer İşlemler"
            onClick={(event) => event.stopPropagation()}
          >
            <FaIcon icon="fas fa-ellipsis-v" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown onClick={(event) => event.stopPropagation()}>
          {menu.map((item) => (
            <Menu.Item key={item.key} leftSection={<FaIcon icon={item.icon} />} onClick={item.run}>
              {item.label}
            </Menu.Item>
          ))}
          {canCancel ? (
            <>
              {menu.length ? <Menu.Divider /> : null}
              <Menu.Item
                color="red"
                leftSection={<FaIcon icon="fas fa-times-circle" />}
                onClick={() => s.cancel(row.job_no)}
              >
                İptal Et
              </Menu.Item>
            </>
          ) : null}
          {!menu.length && !canCancel ? <Menu.Label>İşlem yok</Menu.Label> : null}
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}

// ---- columns ----------------------------------------------------------------

export function buildColumns(fit: Fit): DataTableColumn<TrackingRow>[] {
  const compact = fit.tight;
  return [
    {
      key: '_expand',
      header: '',
      width: fit.widths._expand,
      exportable: false,
      render: (row) => <TreeCell row={row} />,
    },
    {
      key: 'job_no',
      header: compact ? 'İE No' : 'İş Emri No',
      exportHeader: 'İş Emri No',
      sortable: true,
      width: fit.widths.job_no,
      accessor: (row) => (isTaskRow(row) ? (row.parent ? 'Alt Görev' : 'Görev') : row.job_no),
      render: (row) => <JobNoCell row={row} />,
    },
    {
      key: 'title',
      header: 'Başlık',
      sortable: true,
      width: fit.widths.title,
      accessor: (row) =>
        isTaskRow(row) && !row.parent
          ? [row.department_display || row.department, row.title || row.description].filter(Boolean).join(' ')
          : row.title || (isTaskRow(row) ? row.description : null),
      render: (row) => <TitleCell row={row} />,
    },
    {
      key: 'customer_name',
      header: compact ? 'Müş.' : 'Müşteri',
      exportHeader: 'Müşteri',
      width: fit.widths.customer_name,
      accessor: (row) => (isTaskRow(row) ? null : row.customer_short_name || row.customer_name),
      render: (row) => <CustomerCell row={row} />,
    },
    {
      key: 'target_completion_date',
      header: fit.tight ? 'Hedef' : 'Hedef Tamamlanma',
      exportHeader: 'Hedef Tamamlanma',
      sortable: true,
      align: 'center',
      width: fit.widths.target_completion_date,
      accessor: (row) => row.target_completion_date ?? null,
      exportValue: (row) => (row.target_completion_date ? formatDate(row.target_completion_date) : '-'),
      render: (row) => <TargetDateCell row={row} />,
    },
    {
      key: 'completion_percentage',
      header: compact ? 'Tam.' : 'Tamamlanma',
      exportHeader: 'Tamamlanma',
      width: fit.widths.completion_percentage,
      accessor: (row) => row.completion_percentage ?? null,
      exportValue: (row) => {
        const v = row.completion_percentage;
        if (!v && v !== 0) return '-';
        return `${Math.min(100, Math.max(0, Number.parseFloat(String(v)) || 0)).toFixed(1)}%`;
      },
      render: (row) => <ProgressCell row={row} />,
    },
    {
      key: '_projected_completion',
      header: compact ? 'Öngörü' : 'Öngörülen Bitiş',
      align: 'center',
      width: fit.widths._projected_completion,
      // The value lives in the forecast maps, not on the row.
      exportable: false,
      render: (row) => (isTaskRow(row) ? <TaskProjection row={row} /> : <JobProjection row={row} />),
    },
    // Dropped from the list, kept in the Excel export.
    { key: 'status_display', header: 'Durum', exportOnly: true, exportValue: (row) => jobStatusLabel(row) },
    {
      key: 'quantity',
      header: 'Miktar',
      exportOnly: true,
      exportValue: (row) => (row.quantity || row.quantity === 0 ? String(row.quantity) : '-'),
    },
    {
      key: 'created_at',
      header: 'Oluşturulma',
      exportOnly: true,
      exportValue: (row) => (row.created_at ? formatDate(row.created_at as string) : '-'),
    },
    {
      key: '_actions',
      header: 'İşlemler',
      align: 'right',
      width: fit.actionsWidth,
      exportable: false,
      render: (row) => <ActionsCell row={row} />,
    },
  ];
}

/** "Aksiyonları Gizle / Göster" button for the table header. */
export function ToggleActionsButton({ hidden, onToggle }: { hidden: boolean; onToggle: () => void }) {
  return (
    <Button
      size="xs"
      variant="default"
      leftSection={<FaIcon icon={hidden ? 'fas fa-eye' : 'fas fa-eye-slash'} />}
      onClick={onToggle}
    >
      {hidden ? 'Aksiyonları Göster' : 'Aksiyonları Gizle'}
    </Button>
  );
}

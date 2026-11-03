// The sheet's columns, row rules, bars and actions (the grid definition half
// of planning.js). Everything here reads only the row: the grid memoizes rows
// by object identity.

import { StatusBadge } from '@/ui';
import type {
  GridAction,
  GridBar,
  GridBarEditing,
  GridColumn,
  GridLink,
  GridTarget,
  GridTooltip,
} from './grid/PlanningGrid';
import { EDITABLE_STATUS_OPTIONS, STATUS_META } from './model/constants';
import { fmtDate, fmtDuration, fmtKg, round2, todayStr } from './model/format';
import type { SheetRow } from './model/rowTypes';
import s from './ProjectPlanningPage.module.css';

const FINISHED = ['completed', 'skipped', 'cancelled'];

function isRowOverdue(row: SheetRow): boolean {
  return !!(row.end_date && row.end_date < todayStr() && !FINISHED.includes(row.status ?? ''));
}

const Muted = () => <span className={s.muted}>—</span>;

function StatusCell({ row }: { row: SheetRow }) {
  const meta = STATUS_META[row.status ?? ''] || STATUS_META.pending!;
  // A job order on hold for a drawing revision is on the board because its
  // welding is live work: label the hold for what it is.
  const label =
    row.status === 'on_hold' && row.hold_kind === 'revision' ? 'Revizyonda' : meta.label;
  return (
    <span className={s.badges}>
      <StatusBadge color={meta.color}>{label}</StatusBadge>
      {isRowOverdue(row) ? (
        <span title="Bitiş tarihi geçti">
          <StatusBadge color="red">Gecikmiş</StatusBadge>
        </span>
      ) : null}
    </span>
  );
}

// A date nobody typed on this task has to say where it came from.
const DATE_SOURCE_TITLES: Record<string, string> = {
  operations_plan: 'Operasyon planından hesaplandı — bu göreve girilmiş bir tarih değil',
  operations_actual: 'Operasyonlardaki gerçek çalışmadan alındı',
  engine:
    'Üretim planı öngörüsü (proje takibi ile aynı hesap) — bu göreve girilmiş bir tarih değil',
  plan_tail: 'İmalat planının bitişinden hesaplandı — bu göreve girilmiş bir tarih değil',
};

function DateCell({
  value,
  isActual,
  row,
  field,
}: {
  value: string | null;
  isActual?: boolean;
  row: SheetRow;
  field: 'start_date' | 'end_date';
}) {
  if (!value) return <Muted />;
  const source = row[`${field}_source`] ?? row.date_source;
  const derived = source ? DATE_SOURCE_TITLES[source] : undefined;
  if (derived) {
    return (
      <span className={s.dateDerived} title={derived}>
        {fmtDate(value)}
      </span>
    );
  }
  if (!isActual) return <>{fmtDate(value)}</>;
  return (
    <span className={s.dateActual} title="Gerçekleşen tarih (planlanmış tarih girilmemiş)">
      {fmtDate(value)}
    </span>
  );
}

// A job order's Bitiş carries TWO dates, stacked (user 2026-09-16): the job's
// own planned finish (the LAST row of the group) over the promised termin.
function JobEndCell({ row }: { row: SheetRow }) {
  const termin = row.end_date;
  const planned = row.job_plan_end || null;
  if (!planned && !termin) return <Muted />;
  const d = row.job_target_delta_wd;
  const gap =
    d == null || d === 0
      ? ''
      : d > 0
        ? ` — terminden ${d} iş günü sonra`
        : ` — terminden ${Math.abs(d)} iş günü önce`;
  // Names the row the date came from: it is not always the last in the list.
  const from = row.job_plan_end_source
    ? `En son biten satır: ${row.job_plan_end_source}`
    : 'İş emrinin bitişi';
  const late = !!(planned && termin && planned > termin);
  return (
    <span className={s.jobEnd}>
      <span className={`${s.jobEndPlan}${late ? ` ${s.late}` : ''}`} title={`${from}${gap}`}>
        {planned ? fmtDate(planned) : '—'}
      </span>
      <span className={s.jobEndTermin} title="Termin tarihi — iş emrine girilen teslim tarihi">
        {termin ? fmtDate(termin) : 'termin yok'}
      </span>
    </span>
  );
}

function AssignmentEndCell({ row }: { row: SheetRow }) {
  const end = row.end_date;
  const termin = row.job_target || null;
  if (!end && !termin) return <Muted />;
  const late = !!(end && termin && end > termin);
  return (
    <span className={s.jobEnd}>
      <span
        className={`${s.jobEndPlan}${late ? ` ${s.late}` : ''}`}
        title={'Bu atamanın planlanan bitişi' + (late ? ' — iş emri terminini aşıyor' : '')}
      >
        {end ? fmtDate(end) : '—'}
      </span>
      <span className={s.jobEndTermin} title="Termin tarihi — iş emrine girilen teslim tarihi">
        {termin ? fmtDate(termin) : 'termin yok'}
      </span>
    </span>
  );
}

function EndDateCell({ row }: { row: SheetRow }) {
  if (row.kind === 'group') return <JobEndCell row={row} />;
  // A flat assignment row is read against the order's promise.
  if (row.show_termin) return <AssignmentEndCell row={row} />;
  const d = row.job_target_delta_wd;
  if (row.unassignedRow && row.end_date && d != null && d !== 0) {
    const text =
      d > 0
        ? `Öngörülen bitiş hedeften ${d} gün geride`
        : `Öngörülen bitiş hedeften ${Math.abs(d)} gün ileride`;
    return <span title={text}>{fmtDate(row.end_date)}</span>;
  }
  return <DateCell value={row.end_date} isActual={row.end_is_actual} row={row} field="end_date" />;
}

// A derived duration is not a plan anyone entered, and a children's span has
// OVERRULED an entered value: the planner needs to see what it overruled.
function DurationCell({ row }: { row: SheetRow }) {
  const value = row.duration_wd;
  if (value == null) return <Muted />;
  if (!row.duration_is_derived) return <>{fmtDuration(value)}</>;
  const entered = row.entered_duration_wd;
  const source = row.duration_source;
  let title: string;
  if (source === 'children_span') {
    title = `Alt görevlerin kapladığı süreden hesaplandı${entered != null ? ` — göreve girilen süre ${fmtDuration(entered)}` : ''}`;
  } else if (source === 'operations_hours') {
    // 9-hour day: 07:30-17:00 less the lunch break.
    title = `Operasyonların girilen saatlerinden hesaplandı${row.operation_hours != null ? ` (${row.operation_hours} saat / 9 saatlik gün)` : ''}`;
  } else if (source === 'operations_plan' || source === 'operations_actual') {
    title = 'Operasyonların kapladığı süreden hesaplandı';
  } else {
    title = 'Ağırlık payından hesaplandı — girilmiş bir süre değil';
  }
  return (
    <span className={s.durationDerived} title={title}>
      ≈{fmtDuration(value)}
    </span>
  );
}

const FORECAST_KIND_TITLES: Record<string, string> = {
  rate: 'ölçülen tempoya göre',
  duration: 'girilen sürenin bütçesine göre',
  parent_duration: 'üst görevden inen süre payına göre',
  parent_window: 'plan penceresi payına göre',
  start: 'plan penceresine göre',
  subtasks: 'en geç biten alt görevine göre',
  push: 'önceki görevin bitişine göre',
  chained: 'kalan işin önceki görevden sonra sayılmasıyla',
  gate: 'başlama koşuluna göre',
  floored: 'bitiş tabanına (teslimat/koşul) göre',
  coupled: 'kesim ilerleyişine göre',
  weight: 'ağırlık payı tahminiyle',
  plan: 'kesim planı / plan başlangıcına göre',
  done: 'kapanış bekleniyor',
};

// Actual completion date for finished rows, the ENGINE's projected finish for
// open ones (user decision 2026-08-28: one forecast, not two).
function ForecastCell({ row }: { row: SheetRow }) {
  if (!row.forecast_date) return <Muted />;
  const isActual = row.forecast_kind === 'actual';
  // Lateness is measured against the JOB ORDER's promised end, falling back
  // to the row's own end where the job has no promise.
  const jobLate = !isActual && !!row.job_target && row.forecast_date > row.job_target;
  const ownLate =
    !isActual && !row.job_target && !!row.end_date && row.forecast_date > row.end_date;
  const how = row.forecast_kind ? FORECAST_KIND_TITLES[row.forecast_kind] : undefined;
  const title = isActual
    ? 'Gerçekleşen tamamlanma tarihi'
    : `Üretim planı öngörüsü${how ? ` — ${how}` : ''} (proje takibi ile aynı hesap)`;
  const lateNote = jobLate
    ? ` — iş emri hedefinden (${fmtDate(row.job_target)}) sonra`
    : ownLate
      ? ' (hedefin gerisinde)'
      : '';
  const cls = [s.forecast, isActual ? s.actual : '', jobLate || ownLate ? s.late : '']
    .filter(Boolean)
    .join(' ');
  return (
    <span className={cls} title={`${title}${lateNote}`}>
      <i className={`fas ${isActual ? 'fa-circle-check' : 'fa-clock'}`} />
      {fmtDate(row.forecast_date)}
    </span>
  );
}

function KgSplit({ part, total, title }: { part: number; total: number; title: string }) {
  return (
    <span className={s.kgSplit} title={title}>
      <span className={s.kgPart}>{fmtKg(part)}</span>
      <span className={s.kgTotal}>{fmtKg(total)} kg</span>
    </span>
  );
}

// A block row's "weight" is its kg allocation, not a rollup weight: same
// column, different unit. Shares stack over the whole they came out of.
function WeightCell({ row }: { row: SheetRow }) {
  const v = row.weight;
  if (v == null) return <Muted />;
  if (!row.weight_is_kg) {
    return ['stage', 'dept', 'machining'].includes(row.kind) ? (
      <>{String(v)}</>
    ) : (
      <span className={s.weightReadonly}>{v}</span>
    );
  }
  if (row.allocated_kg != null) {
    return (
      <KgSplit
        part={row.allocated_kg}
        total={v}
        title={`Atanan ${fmtKg(row.allocated_kg)} kg — Kalan ${fmtKg(round2(v - row.allocated_kg))} kg`}
      />
    );
  }
  if (row.resource_kg != null) {
    return (
      <KgSplit
        part={row.resource_kg}
        total={v}
        title={`Bu sayfadaki atamalar ${fmtKg(row.resource_kg)} kg — iş emri toplamı ${fmtKg(v)} kg`}
      />
    );
  }
  return <span className={s.weightReadonly}>{fmtKg(v)} kg</span>;
}

function QuantityCell({ row }: { row: SheetRow }) {
  const q = row.quantity;
  if (q == null) return <Muted />;
  if (!row.quantity_is_share) return <span className={s.qty}>{q}</span>;
  // A slice too small to make one unit says so: "0" would read as "nothing".
  const share = q === 0 ? '<1' : String(q);
  const label = row.quantity_of != null ? `${share} / ${row.quantity_of}` : `≈${share}`;
  const title =
    `${fmtKg(row.quantity_kg)} kg / ${fmtKg(row.job_total_kg)} kg × ${row.job_quantity} adet = ` +
    `${Number(row.quantity_exact).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} adet`;
  return (
    <span className={`${s.qty} ${s.qtyShare}`} title={title}>
      {label}
    </span>
  );
}

function ProgressCell({ value }: { value: number | null }) {
  const pct = Math.max(0, Math.min(100, Number(value ?? 0)));
  const tone = pct >= 100 ? s.progressDone : pct > 0 ? s.progressOn : s.progressNone;
  return (
    <div className={s.miniProgress}>
      <div className={s.progressTrack}>
        <div className={`${s.progressBar} ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={s.progressLabel}>{pct % 1 === 0 ? pct : pct.toFixed(1)}%</span>
    </div>
  );
}

// "En erken bitiş (sıra)": the capacity engine's date, deliberately NOT in
// the Öngörü column (two date models in one cell, 2026-08-28).
function CapacityCell({ row }: { row: SheetRow }) {
  if (row.cap_state === 'no_data') {
    return (
      <span
        className={s.muted}
        title="Bu kaynak için ölçülmüş hız yok — Kapasite panelinden kapasite girin"
      >
        veri yok
      </span>
    );
  }
  if (row.cap_state !== 'entry') return <Muted />;
  const chip =
    row.cap_chip === 'late'
      ? s.capLateChip
      : row.cap_chip === 'early'
        ? s.capEarlyChip
        : s.capMutedChip;
  return (
    <span title={row.cap_title}>
      {row.cap_finish}
      <span className={`${chip} ${s.capCellChip}`}>{row.cap_label}</span>
    </span>
  );
}

function CapFlag({ row }: { row: SheetRow }) {
  if (!row.cap_late) return null;
  return <i className="fas fa-triangle-exclamation cap-row-flag" title={row.cap_title} />;
}

const ROW_ICONS: Record<string, string> = {
  machining: 'fas fa-gear',
  block: 'fas fa-user-gear',
  stage: 'fas fa-pen-ruler',
  info: 'fas fa-circle-info',
  band: 'fas fa-diagram-project',
};

const DEPT_ICONS: Record<string, string> = {
  manufacturing: 'fas fa-industry',
  welding: 'fas fa-fire',
  painting: 'fas fa-fill-drip',
};

function TitleCell({ row }: { row: SheetRow }) {
  if (row.kind === 'group') {
    return (
      <>
        <i className={`fas ${row.collapsed ? 'fa-chevron-right' : 'fa-chevron-down'} pg-toggle`} />
        <span className="pg-title" title={`${row.job_order_title} — ${row.customer_name}`}>
          <strong>{row.title}</strong>
          <span className="pg-sub">{row.job_order_title}</span>
          {(row.block_count ?? 0) > 1 ? (
            <span className="block-count">{row.block_count} blok</span>
          ) : null}
        </span>
      </>
    );
  }
  // "Kaynak" view: the resource is already on the tab, so the title says which
  // JOB: iş no, then the order's name and customer underneath.
  if (row.flat_assignment) {
    const sub = [row.job_order_title, row.customer_name].filter(Boolean).join(' · ');
    return (
      <>
        <span className="pg-title" title={row.resource_name || ''}>
          <strong>{row.title}</strong>
          <span className="pg-sub">{sub}</span>
        </span>
        <CapFlag row={row} />
      </>
    );
  }
  if (row.kind === 'stage' && row.is_default) {
    return (
      <span className="pg-title">
        <i
          className="fas fa-thumbtack pg-ico"
          title="Varsayılan aşama — silinemez, süresiz/iptal edilebilir"
        />
        {row.title}
      </span>
    );
  }
  const icon =
    (row.kind === 'dept' ? DEPT_ICONS[row.slot ?? ''] : ROW_ICONS[row.kind]) || 'fas fa-circle';
  return (
    <span className="pg-title">
      <i className={`${icon} pg-ico`} />
      {row.title}
      {row.isNew ? <span className={s.newBadge}>yeni</span> : null}
      {row.kind === 'block' ? <CapFlag row={row} /> : null}
    </span>
  );
}

// The band is a divider, not a task: every column but its label stays empty
// so it cannot be read as a row at 0% progress and 'not started'.
const unlessBand = (render: (row: SheetRow) => React.ReactNode) => (row: SheetRow) =>
  row.kind === 'band' ? '' : render(row);

// Seven columns earn their width next to a timeline; the rest are a click
// away. The choice is per user.
export const GRID_COLUMNS: (GridColumn<SheetRow> & { always?: boolean })[] = [
  {
    field: 'title',
    label: 'Görev',
    width: '250px',
    always: true,
    render: (row) => <TitleCell row={row} />,
  },
  // ONE start column (user 2026-09-16): typed on the İmalat row and on each
  // assignment row; everything else derives.
  {
    field: 'start_date',
    label: 'Başlangıç',
    width: '96px',
    type: 'date',
    always: true,
    title:
      'Başlangıç — İmalat satırında işin başlangıcı, ekip/taşeron satırında o ekibin işe başladığı (ya da başlayacağı) tarih',
    headerClass: 'col-center',
    cellClass: 'col-center col-date',
    render: unlessBand((row) => (
      <DateCell
        value={row.start_date}
        isActual={row.start_is_actual}
        row={row}
        field="start_date"
      />
    )),
  },
  {
    field: 'end_date',
    label: 'Bitiş',
    width: '96px',
    type: 'date',
    always: true,
    headerClass: 'col-center',
    cellClass: 'col-center col-date',
    render: unlessBand((row) => <EndDateCell row={row} />),
  },
  {
    field: 'duration_wd',
    label: 'Süre',
    width: '76px',
    type: 'number',
    min: 0,
    step: 0.5,
    always: true,
    headerClass: 'col-center',
    cellClass: 'col-center col-num',
    render: unlessBand((row) => <DurationCell row={row} />),
  },
  {
    field: 'weight',
    label: 'Ağırlık',
    width: '96px',
    type: 'number',
    min: 1,
    step: 1,
    always: true,
    headerClass: 'col-center',
    cellClass: 'col-center col-num',
    render: unlessBand((row) => <WeightCell row={row} />),
  },
  // Off by default (user 2026-09-16: "OPTIONALLY display quantity").
  {
    field: 'quantity',
    label: 'Adet',
    width: '70px',
    title: 'Adet — iş emrinin adedi; ekip/taşeron satırlarında kg payına düşen adet',
    headerClass: 'col-center',
    cellClass: 'col-center col-num',
    render: unlessBand((row) => <QuantityCell row={row} />),
  },
  {
    field: 'progress',
    label: 'İlerleme',
    width: '116px',
    type: 'number',
    min: 0,
    max: 100,
    step: 1,
    always: true,
    headerClass: 'col-center',
    cellClass: 'col-progress',
    render: unlessBand((row) => <ProgressCell value={row.progress} />),
  },
  {
    field: 'status',
    label: 'Durum',
    width: '124px',
    type: 'select',
    options: EDITABLE_STATUS_OPTIONS,
    headerClass: 'col-center',
    cellClass: 'col-center',
    render: unlessBand((row) => <StatusCell row={row} />),
  },
  {
    field: 'forecast_date',
    label: 'Gerçek./Tahmini',
    width: '118px',
    headerClass: 'col-center',
    cellClass: 'col-center col-date',
    render: unlessBand((row) => <ForecastCell row={row} />),
  },
  // Advisory, opt-in: the capacity engine's earliest finish in the
  // resource's deadline order (saved plan only).
  {
    field: 'cap_finish',
    label: 'En erken bitiş (sıra)',
    width: '150px',
    title:
      'Kapasite simülasyonu — kaynağın ölçülen hızıyla, termin sırasına göre en erken bitiş (kaydedilmiş plana göre; ayrıntı Kapasite panelinde)',
    headerClass: 'col-center',
    cellClass: 'col-center col-date',
    render: (row) => <CapacityCell row={row} />,
    value: () => null,
  },
  {
    field: 'note',
    label: 'Not',
    width: '160px',
    type: 'text',
    render: unlessBand((row) =>
      row.note ? <span className={s.stageNote}>{row.note}</span> : <Muted />,
    ),
  },
];

export function defaultColumnKeys(): string[] {
  return GRID_COLUMNS.filter((c) => c.always).map((c) => c.field);
}

// Rows that only ever report: the job order, other departments' work, bands.
const READ_ONLY_KINDS = ['group', 'info', 'band', 'unassigned'];
const SCHEDULE_ONLY = ['start_date', 'end_date', 'duration_wd', 'status'];

// Per cell, not per row: showing a cell as editable and then refusing it is a
// worse answer than not offering it.
export function isCellEditable(row: SheetRow, field: string): boolean {
  if (field === 'cap_finish') return false;
  // Lojistik reports, but its duration is an entry; checked BEFORE the
  // read-only kinds, which would otherwise swallow it.
  if (field === 'duration_wd' && row.editable_duration) return !FINISHED.includes(row.status ?? '');
  // Kesim likewise: start and duration are entries, the end is computed.
  if ((field === 'start_date' || field === 'duration_wd') && row.editable_schedule) {
    return !FINISHED.includes(row.status ?? '');
  }
  if (READ_ONLY_KINDS.includes(row.kind)) return false;
  // Adet is never typed here.
  if (field === 'quantity') return false;
  // Skipped work is display-only. (Cancelled stays editable: scheduling a
  // cancelled stage is how it is brought back.)
  if (row.status === 'skipped') return false;
  // TWO duration entry points: İmalat sizes the job, an ASSIGNMENT sizes one
  // team's span within it (user 2026-09-17).
  if (field === 'duration_wd') {
    if (row.kind === 'block') return !row.isNew;
    return row.kind === 'dept' && row.slot === 'manufacturing';
  }
  // STARTS are typed, ends never are (2026-08-28). Two rows take a start: the
  // İmalat row and each saved ASSIGNMENT.
  if (field === 'start_date' || field === 'end_date') {
    if (field !== 'start_date') return false;
    if (row.kind === 'block') return !row.isNew;
    return row.kind === 'dept' && row.slot === 'manufacturing';
  }
  // Talaşlı İmalat's share is set here; its dates come from its operations.
  if (row.kind === 'machining') return field === 'weight';
  if (row.kind === 'dept') {
    // Progress on a parent is the rollup of its children.
    if (field === 'progress') return !row.has_subtasks;
    // İmalat's weight splits the JOB ORDER: not this sheet's decision.
    if (field === 'weight') return row.slot !== 'manufacturing';
    return SCHEDULE_ONLY.includes(field);
  }
  if (row.kind === 'block') {
    // A block WITH stages is their rollup; the kg allocation has its own
    // dialog because it touches billing.
    return !row.has_stages && [...SCHEDULE_ONLY, 'progress', 'note'].includes(field);
  }
  if (field === 'title') return row.kind === 'stage' && !row.is_default;
  if (field === 'weight') return row.kind === 'stage';
  return true;
}

export function rowClassName(row: SheetRow): string {
  const classes: string[] = [];
  if (row.kind === 'group') classes.push('pg-row-group');
  if (row.kind === 'group' && row.job_target_late) classes.push('pg-group-late');
  if (row.kind === 'band') classes.push('pg-row-band');
  if (row.kind === 'info' || row.kind === 'machining') classes.push('pg-row-info');
  if (row.kind === 'unassigned' || row.unassignedRow) classes.push('pg-row-unassigned');
  if (row.status === 'skipped') classes.push('pg-row-skipped');
  if (row.kind === 'dept') classes.push(`pg-row-dept pg-row-${row.slot}`);
  if (row.kind === 'block') classes.push('pg-row-block');
  if (row.kind === 'block' && row.cap_late) classes.push('pg-cap-late');
  if (row.status === 'cancelled') classes.push('pg-row-cancelled');
  classes.push(`pg-indent-${row.indent || 0}`);
  return classes.join(' ');
}

function barState(row: SheetRow): string {
  if (row.status === 'completed' || row.status === 'skipped') return 'done';
  if (isRowOverdue(row)) return 'late';
  if (row.status === 'on_hold') return 'hold';
  return 'on-time';
}

// Only rows with a real span get a bar. 57 of 768 job orders carry a promised
// date EARLIER than their opening: no span, no stub. The bar is the PLAN and
// nothing else (user 2026-09-17).
export function rowBar(row: SheetRow): GridBar | null {
  if (row.kind === 'band') return null;
  const start = row.start_date || row.end_date;
  const end = row.end_date || row.start_date;
  if (!start || !end || end < start) return null;
  return {
    start,
    end,
    progress: Number(row.progress || 0),
    state: barState(row),
    label: row.bar_label || row.title,
    endDate: end,
    // A group row's bar stops ON the termin line, where its tag prints it.
    hideEndLabel: row.kind === 'group',
    title: `${row.title} · ${fmtDate(row.start_date)} – ${fmtDate(row.end_date)}`,
  };
}

// A bar can be dragged exactly where its cells can be typed: the body where
// the START is an entry, the right edge where the DURATION is. The page turns
// a drop into those same edits, so the same rules refuse the same things.
export function rowBarEditing(row: SheetRow): GridBarEditing | null {
  if (!row.start_date || row.kind === 'band') return null;
  const move = isCellEditable(row, 'start_date');
  const resize = isCellEditable(row, 'duration_wd');
  return move || resize ? { move, resize } : null;
}

const OUT_OF_PLAN = ['cancelled', 'skipped'];

// The sequence the plan is built on (derive.ts): an assignment's stages run
// one after another, and Boya starts after Kaynaklı and Talaşlı İmalat.
export function rowLinks(rows: readonly SheetRow[]): GridLink[] {
  const links: GridLink[] = [];
  let lastStage: SheetRow | null = null;
  let feeders: string[] = [];
  for (const row of rows) {
    if (row.kind === 'group') {
      lastStage = null;
      feeders = [];
      continue;
    }
    const live = !OUT_OF_PLAN.includes(row.status ?? '');
    if (row.kind === 'stage') {
      if (!live) continue;
      if (lastStage && lastStage.blockRef === row.blockRef)
        links.push({ from: lastStage.key, to: row.key });
      lastStage = row;
      continue;
    }
    lastStage = null;
    if (!live) continue;
    if ((row.kind === 'dept' && row.slot === 'welding') || row.kind === 'machining') {
      feeders.push(row.key);
    } else if (row.kind === 'dept' && row.slot === 'painting') {
      feeders.forEach((from) => links.push({ from, to: row.key }));
      feeders = [];
    }
  }
  return links;
}

// The hover card: what the bar is, when, how far along, and against the termin.
export function rowTooltip(row: SheetRow): GridTooltip | null {
  const bar = rowBar(row);
  if (!bar) return null;
  const status = STATUS_META[row.status ?? '']?.label;
  const pct = Math.round(Math.max(0, Math.min(100, Number(row.progress || 0))));
  const lines: string[] = [
    `${fmtDate(bar.start)} – ${fmtDate(bar.end)}` +
      (row.duration_wd != null ? ` · ${fmtDuration(row.duration_wd)}` : ''),
    [`İlerleme %${pct}`, status].filter(Boolean).join(' · '),
  ];
  if (isRowOverdue(row)) lines.push('Bitiş tarihi geçti');
  if (row.job_target) {
    const d = row.job_target_delta_wd;
    const gap =
      row.kind === 'group' && d
        ? ` — plan ${Math.abs(d)} iş günü ${d > 0 ? 'sonra bitiyor' : 'önce bitiyor'}`
        : '';
    lines.push(`Termin ${fmtDate(row.job_target)}${gap}`);
  }
  if (row.forecast_date && row.forecast_kind !== 'actual' && row.forecast_date !== bar.end)
    lines.push(`Öngörü ${fmtDate(row.forecast_date)}`);
  const editing = rowBarEditing(row);
  if (editing?.move) lines.push('Sürükleyin: başlangıcı taşır');
  if (editing?.resize) lines.push('Sağ kenar: süreyi değiştirir');
  const title =
    row.kind === 'group' && row.job_order_title
      ? `${row.title} — ${row.job_order_title}`
      : row.title;
  return { title, lines };
}

// İş emri hedef bitişi: the same tick on every row of the job; ONE tag per job.
export function rowTarget(row: SheetRow): GridTarget | null {
  if (!row.job_target) return null;
  return {
    date: row.job_target,
    tag: row.kind === 'group' || !!row.unassignedRow,
    deltaWd: row.job_target_delta_wd ?? null,
  };
}

export const GRID_ACTIONS: GridAction<SheetRow>[] = [
  {
    key: 'create-stages',
    icon: 'fas fa-layer-group',
    title: 'Varsayılan aşamaları (Montaj, Kaynak ve Taşlama) oluştur',
    visible: (row) => row.kind === 'block' && !row.has_stages,
  },
  {
    key: 'add-custom',
    icon: 'fas fa-plus',
    title: 'Özel aşama ekle',
    visible: (row) => row.kind === 'block' && !!row.has_stages,
  },
  {
    key: 'edit-weight',
    icon: 'fas fa-weight-hanging',
    // A greyed-out button has to say why it is greyed out.
    title: (row) =>
      row.is_billed ? 'Hakediş kesilmiş atamanın ağırlığı değiştirilemez' : 'Ağırlığı düzenle',
    visible: (row) => row.kind === 'block',
    disabled: (row) => !!row.is_billed,
  },
  {
    key: 'move-block',
    icon: 'fas fa-people-arrows',
    title: (row) => {
      if (row.move_locked)
        return 'Hakedişe girmiş atama taşınamaz — kalan işi yeni bir atamayla verin';
      if (row.isNew) return 'Önce kaydedin — kaydedilmemiş blok taşınamaz';
      return 'Atamayı değiştir';
    },
    visible: (row) => row.kind === 'block',
    // A new block is not saved yet, and a billed one is immutable history.
    disabled: (row) => !!row.isNew || !!row.move_locked,
  },
  {
    key: 'delete-block',
    icon: 'fas fa-trash',
    title: 'Atamayı sil',
    visible: (row) => row.kind === 'block',
    disabled: (row) => !!row.is_billed,
  },
  {
    key: 'delete-stage',
    icon: 'fas fa-trash',
    // Delete is as available as add (user decision 2026-08-29).
    title: 'Aşamayı sil',
    visible: (row) => row.kind === 'stage',
  },
  {
    key: 'assign-job',
    icon: 'fas fa-user-plus',
    title: 'Ekibe / taşerona ata',
    // Not on a skipped İmalat: there is no manufacturing to hand out.
    visible: (row) => !!row.unassignedRow && row.status !== 'skipped',
  },
];

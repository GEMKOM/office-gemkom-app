/**
 * Plan sheet copy: pure functions from the /plan-sheet/ payload to Turkish
 * sentences, chips and bar states. (Port of
 * projects/project-tracking/planSheetText.js, with its tests.)
 *
 * House rules: never yellow, no exclamation marks, working days are "iş günü",
 * dates are dd.mm.yyyy. English (sheetLang.ts, lang=en pages only) mirrors
 * every sentence; the Turkish output is unchanged by it.
 */
import { departmentName, materialName, num, pct, taskTitle, tr, wdText } from './sheetLang';
import type {
  PlanSheet,
  SheetCause,
  SheetNode,
  SheetRootCause,
  SheetSummary,
  SheetTaskRow,
} from './types';

type Num = number | string | null | undefined;

export function fmtDateTr(iso: string | null | undefined): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(iso);
}

export function fmtWd(value: Num): string {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return wdText(value);
}

export function fmtPct(value: Num): string {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return pct(Number(value));
}

// ---- deviation --------------------------------------------------------------

export type ChipClass = 'ps-chip-late' | 'ps-chip-chain' | 'ps-chip-early' | 'ps-chip-ok' | 'ps-chip-muted';

export interface DeviationChip {
  text: string;
  cls: ChipClass;
  kind: 'own' | 'chain' | 'early' | 'ontime' | 'none';
}

/** What deviationChip reads: a task row, or a job row's deviation alone. */
export type DeviationSource = Pick<
  SheetTaskRow,
  'deviation_wd' | 'own_deviation_wd' | 'chain_deviation_wd' | 'dead'
>;

/** Chip for a row: {text, cls, kind} with kind own | chain | early | ontime | none. */
export function deviationChip(row: DeviationSource | null | undefined): DeviationChip {
  if (!row || row.dead) return { text: '', cls: 'ps-chip-muted', kind: 'none' };
  const dev = row.deviation_wd == null ? null : Number(row.deviation_wd);
  const own = Number(row.own_deviation_wd || 0);
  const chain = Number(row.chain_deviation_wd || 0);
  if (dev == null) return { text: tr('plan yok', 'no plan'), cls: 'ps-chip-muted', kind: 'none' };
  if (dev > 0) {
    if (own > 0 && chain > 0) {
      return {
        text: `+${num(dev)} (${num(own)} ${tr('kendi', 'own')})`,
        cls: 'ps-chip-late',
        kind: 'own',
      };
    }
    if (own > 0) return { text: `+${num(dev)}`, cls: 'ps-chip-late', kind: 'own' };
    return { text: `+${num(dev)} ${tr('zincir', 'chain')}`, cls: 'ps-chip-chain', kind: 'chain' };
  }
  if (dev < 0) return { text: `−${num(Math.abs(dev))}`, cls: 'ps-chip-early', kind: 'early' };
  return { text: '0', cls: 'ps-chip-ok', kind: 'ontime' };
}

export interface SummaryChip {
  text: string;
  cls: ChipClass;
  title: string;
}

/**
 * The chips over the sheet: what the summary counted, in order.
 *
 * The all-clear is last and only fires when nothing else did. A row with no
 * plan is NOT a row that is on plan: without its own chip the slide read
 * "tüm görevler planında" on 096-22, where nobody had entered a single date
 * on any of its ten rows (user 2026-09-24).
 */
export function summaryChips(summary: SheetSummary | null | undefined): SummaryChip[] {
  const s = summary || {};
  const chips: SummaryChip[] = [];
  if (s.late_rows) {
    chips.push({
      text: tr(`${s.late_rows} görev planın gerisinde`, `${s.late_rows} tasks behind plan`),
      cls: 'ps-chip-late',
      title: '',
    });
  }
  if (s.own_late_rows) {
    chips.push({
      text: tr(`${s.own_late_rows} kendi`, `${s.own_late_rows} own`),
      cls: 'ps-chip-late',
      title: tr('Kendi kaybı olan görevler', 'Tasks that lost time of their own'),
    });
  }
  if (s.chain_only_rows) {
    chips.push({
      text: tr(`${s.chain_only_rows} zincir`, `${s.chain_only_rows} chain`),
      cls: 'ps-chip-chain',
      title: tr(
        'Yalnızca önceki görev geç bitirdiği için geride',
        'Behind only because the task before it finished late',
      ),
    });
  }
  if (s.default_duration_rows) {
    chips.push({
      text: tr(
        `${s.default_duration_rows} varsayılan süre`,
        `${s.default_duration_rows} default duration`,
      ),
      cls: 'ps-chip-muted',
      title: tr(
        'Süre girilmemiş, departman varsayılanı kullanıldı',
        'No duration entered; the department default was used',
      ),
    });
  }
  if (s.unplanned_rows) {
    chips.push({
      text: tr(`${s.unplanned_rows} görevde plan yok`, `${s.unplanned_rows} tasks with no plan`),
      cls: 'ps-chip-muted',
      title: tr(
        'Bu görevlerde tarih ya da süre girilmemiş; gösterilen yalnızca öngörü',
        'No date or duration entered on these tasks; only the projection is shown',
      ),
    });
  }
  if (!chips.length && s.rows) {
    chips.push({ text: tr('tüm görevler planında', 'every task is on plan'), cls: 'ps-chip-ok', title: '' });
  }
  return chips;
}

export type BarState = 'on-time' | 'late' | 'hold' | 'done' | 'projected';

/** Sheet bar state in the welding grid's vocabulary. */
export function barState(
  row: Pick<SheetTaskRow, 'dead' | 'done' | 'deviation_wd'> | null | undefined,
  node?: Pick<SheetNode, 'status'> | null,
): BarState {
  if (!row) return 'on-time';
  if (row.dead) return 'hold';
  if (row.done) return 'done';
  if (node && node.status === 'on_hold') return 'hold';
  const dev = Number(row.deviation_wd || 0);
  return dev > 0 ? 'late' : 'on-time';
}

// ---- plan provenance --------------------------------------------------------

const PLAN_SOURCE_TEXT_EN: Record<string, string> = {
  entered: 'entered dates',
  entered_start: 'entered start + duration',
  entered_end: 'entered end + duration',
  chain: "from the previous task's end",
  imalat_split: 'from the manufacturing plan (weight share)',
  parent: "the parent task's window",
  none: 'no plan',
};

const PLAN_SOURCE_TEXT: Record<string, string> = {
  entered: 'girilen tarihler',
  entered_start: 'girilen başlangıç + süre',
  entered_end: 'girilen bitiş + süre',
  chain: 'önceki görevin bitişinden',
  imalat_split: 'İmalat planından (ağırlık payı)',
  parent: 'üst görevin penceresi',
  none: 'plan yok',
};

export function planSourceLabel(
  row: Pick<SheetTaskRow, 'plan_source' | 'duration_source'> | null | undefined,
): string {
  if (!row) return '';
  const source = row.plan_source || '';
  const base = tr(PLAN_SOURCE_TEXT, PLAN_SOURCE_TEXT_EN)[source] || source;
  if (row.duration_source === 'default') return `${base} · ${tr('varsayılan süre', 'default duration')}`;
  return base;
}

export function isDefaultDuration(row: Pick<SheetTaskRow, 'duration_source'> | null | undefined): boolean {
  return !!row && row.duration_source === 'default';
}

// ---- causes -----------------------------------------------------------------

function materialSentence(c: SheetCause, verb: 'bekleniyor' | 'bekleyen'): string {
  const what = materialName(c.what || 'malzeme');
  const items = num(c.pending || 0, 0);
  const parts = [
    tr(
      `${what} ${verb}: ${items} kalem`,
      verb === 'bekleyen' ? `pending ${what}: ${items} items` : `waiting for ${what}: ${items} items`,
    ),
  ];
  if (c.unordered) {
    parts[0] += tr(
      ` (${num(c.unordered, 0)} sipariş verilmemiş)`,
      ` (${num(c.unordered, 0)} not yet ordered)`,
    );
  }
  if (c.until) parts.push(tr(`tahmini teslim ${fmtDateTr(c.until)}`, `expected delivery ${fmtDateTr(c.until)}`));
  if (c.overdue) parts.push(tr('söz verilen tarih geçti', 'the promised date has passed'));
  return `${parts.join(', ')}.`;
}

/** What causeSentence reads off a row. */
export type CauseSource = Pick<
  SheetTaskRow,
  'cause' | 'own_deviation_wd' | 'chain_deviation_wd' | 'pushed_by_title'
>;

/** One plain sentence for the row's cause, or '' when there is nothing to say. */
export function causeSentence(row: CauseSource | null | undefined): string {
  if (!row) return '';
  const c = row.cause;
  const own = Number(row.own_deviation_wd || 0);
  const chain = Number(row.chain_deviation_wd || 0);
  let text = '';
  if (c && c.code) {
    switch (c.code) {
      case 'revision_hold':
        text = tr('İş emri çizim revizyonunda bekliyor.', 'The job is on hold for a drawing revision.');
        break;
      case 'material':
        text = materialSentence(c, 'bekleniyor');
        break;
      case 'procurement_pending':
        text = materialSentence({ ...c, what: 'teslim' }, 'bekleyen');
        break;
      case 'ncr_open':
        text = tr(
          `${num(c.count || 0, 0)} açık NCR tamamlamayı engelliyor.`,
          `${num(c.count || 0, 0)} open NCR(s) blocking completion.`,
        );
        break;
      case 'cnc_plan': {
        const unplanned = c.unplanned_cuts;
        text = tr(
          `Kesim planı ${fmtDateTr(c.plan_end)} tarihinde bitiyor${unplanned ? ` (${num(unplanned, 0)} kesim planlanmamış)` : ''}.`,
          `The cutting plan ends on ${fmtDateTr(c.plan_end)}${unplanned ? ` (${num(unplanned, 0)} cuts not yet planned)` : ''}.`,
        );
        break;
      }
      case 'machining_plan':
        text = tr(
          `Talaşlı imalat planı ${fmtDateTr(c.plan_end)} tarihinde bitiyor.`,
          `The machining plan ends on ${fmtDateTr(c.plan_end)}.`,
        );
        break;
      case 'finished_late':
        text = tr(`${fmtWd(own)} geç bitti.`, `Finished ${fmtWd(own)} late.`);
        break;
      case 'not_started':
        text = tr(
          `Plan başlangıcı ${fmtWd(c.late_start_wd)} önce geçti, başlanmadı.`,
          `Planned start passed ${fmtWd(c.late_start_wd)} ago; not started yet.`,
        );
        break;
      case 'progress':
        text = tr(
          `İlerleme ${fmtPct(c.progress)}, plana göre ${fmtPct(c.expected)} olmalıydı.`,
          `Progress ${fmtPct(c.progress)}; the plan expected ${fmtPct(c.expected)} by now.`,
        );
        break;
      default:
        text = '';
    }
    if (text && c.via) text = `${taskTitle(c.via)}: ${text}`;
  }
  if (chain > 0) {
    const pusher = row.pushed_by_title
      ? tr(`${row.pushed_by_title} geç bitiyor`, `${taskTitle(row.pushed_by_title)} finishing late`)
      : tr('önceki görev geç bitiyor', 'previous task finishing late');
    const chainText = tr(
      `${pusher} (+${num(chain)} iş günü zincir).`,
      `${pusher} (+${num(chain)} working days, chained).`,
    );
    text = text ? `${text} ${chainText}` : chainText;
  }
  return text;
}

/**
 * How to name the row a root cause points at.
 *
 * A MAIN carries the product name as its title (every main of 061-60-02 is
 * "LF ROOF"), so there its department says more. Every other row's own title
 * IS the useful name — and `department_display` is "Üretim" for Talaşlı
 * İmalat, Kaynaklı İmalat, Boya and every taşeron/ekip assignment alike, so
 * preferring it threw away the one thing the reader needed (user 2026-09-23,
 * 061-60).
 */
export function rootCauseLabel(rc: SheetRootCause | null | undefined): string {
  if (!rc) return '';
  const dept = rc.department_display ? departmentName(rc.department, rc.department_display) : '';
  return (rc.kind === 'main' ? dept || taskTitle(rc.title) : taskTitle(rc.title) || dept) || '';
}

// ---- header -----------------------------------------------------------------

function signed(value: number): string {
  const n = Number(value);
  if (n > 0) return `+${num(n)} iş günü`;
  if (n < 0) return `${num(n)} iş günü`;
  return '0 iş günü';
}

export type SheetTheme = 'grey' | 'red' | 'orange' | 'green';

export interface HeaderSummary {
  planLine: string;
  terminLine: string;
  theme: SheetTheme;
}

type HeaderSource = Pick<
  PlanSheet,
  'plan_end' | 'projected_end' | 'deviation_wd' | 'termin' | 'termin_gap_wd' | 'plan_vs_termin_wd' | 'root_cause'
>;

/** {planLine, terminLine, theme} for the hero strip. */
export function headerSummary(sheet: HeaderSource | null | undefined): HeaderSummary {
  if (!sheet) return { planLine: '', terminLine: '', theme: 'grey' };
  const dev = sheet.deviation_wd == null ? null : Number(sheet.deviation_wd);
  const gap = sheet.termin_gap_wd == null ? null : Number(sheet.termin_gap_wd);
  const planVsTermin = sheet.plan_vs_termin_wd == null ? null : Number(sheet.plan_vs_termin_wd);
  let planLine: string;
  if (!sheet.plan_end) {
    planLine = 'Plan yok: hiçbir görevde tarih ya da süre girilmemiş.';
  } else if (dev == null) {
    planLine = `Plan bitişi ${fmtDateTr(sheet.plan_end)}.`;
  } else if (dev > 0) {
    const rc = sheet.root_cause;
    const why = rc
      ? ` Nedeni: ${rootCauseLabel(rc)}${rc.job_no ? ` (${rc.job_no})` : ''} — ${causeSentence({ cause: rc.cause, own_deviation_wd: rc.own_deviation_wd })}`
      : '';
    planLine = `Plana göre ${signed(dev)} geride: plan bitişi ${fmtDateTr(sheet.plan_end)}, öngörülen ${fmtDateTr(sheet.projected_end)}.${why}`;
  } else if (dev < 0) {
    planLine = `Planın ${fmtWd(dev)} önünde: plan bitişi ${fmtDateTr(sheet.plan_end)}, öngörülen ${fmtDateTr(sheet.projected_end)}.`;
  } else {
    planLine = `Plana uygun: bitiş ${fmtDateTr(sheet.plan_end)}.`;
  }
  let terminLine: string;
  if (!sheet.termin) {
    terminLine = 'Termin girilmemiş.';
  } else if (gap == null) {
    terminLine = `Termin ${fmtDateTr(sheet.termin)}.`;
  } else if (gap > 0) {
    terminLine =
      `Termin ${fmtDateTr(sheet.termin)}: öngörülen bitiş termini ${fmtWd(gap)} aşar` +
      (planVsTermin != null && planVsTermin > 0
        ? ` (planın kendisi termini ${fmtWd(planVsTermin)} aşıyor).`
        : '.');
  } else {
    terminLine = `Termin ${fmtDateTr(sheet.termin)}: öngörülen bitiş terminden ${fmtWd(gap)} önce.`;
  }
  const theme: SheetTheme =
    dev == null ? 'grey' : dev > 0 ? 'red' : gap != null && gap > 0 ? 'orange' : 'green';
  return { planLine, terminLine, theme };
}

/** Header figure for a signed working-day number: {text, cls}. */
export function signedFigure(value: Num): { text: string; cls: string } {
  if (value == null) return { text: '—', cls: '' };
  const n = Number(value);
  if (n > 0) return { text: `+${num(n)} iş günü`, cls: 'ps-fig-late' };
  if (n < 0) return { text: `${num(n)} iş günü`, cls: 'ps-fig-early' };
  return { text: 'tam plan', cls: 'ps-fig-ok' };
}

/** "%38 / %55" for the İlerleme column. */
export function progressText(
  row: Pick<SheetTaskRow, 'dead' | 'done' | 'progress_pct' | 'expected_pct'> | null | undefined,
): string {
  if (!row) return '';
  // Skipped (and cancelled) work was NOT done. `progress_pct` is 100 for a
  // skipped row on purpose — it must not drag its parent's roll-up down — but
  // printing that %100 next to a finish date read as completed (user
  // 2026-09-22). The Durum badge already says Atlandı.
  if (row.dead) return '—';
  const p = fmtPct(row.progress_pct);
  if (row.done) return p;
  if (row.expected_pct == null) return p;
  return `${p} / ${fmtPct(row.expected_pct)}`;
}

/** Rows in sheet order grouped under their job node: [{node, rows}]. */
export function groupRows(
  sheet: Pick<PlanSheet, 'nodes' | 'rows'> | null | undefined,
): { node: SheetNode; rows: SheetTaskRow[] }[] {
  const byJob = new Map<string, SheetTaskRow[]>();
  for (const row of sheet?.rows || []) {
    const list = byJob.get(row.job_no);
    if (list) list.push(row);
    else byJob.set(row.job_no, [row]);
  }
  return (sheet?.nodes || []).map((node) => ({ node, rows: byJob.get(node.job_no) || [] }));
}

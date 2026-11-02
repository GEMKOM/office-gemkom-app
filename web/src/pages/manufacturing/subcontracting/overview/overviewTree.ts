import type {
  MonthlyReport,
  MonthlyReportBacklog,
  MonthlyReportFact,
  MonthlyReportStatement,
  MonthlyReportSubcontractor,
} from '@/api/subcontracting/subcontractors';

/*
 * Taşeron Genel Bakış — monthly work per subcontractor × fiyat kalemi × job
 * (the tree logic of overview.js).
 *
 * The backend sends flat facts (one per subcontractor/month/kalem/job/kind)
 * and a backlog (remaining work per subcontractor/kalem/job, as of today).
 * The page folds them into a tree in whichever order the grouping switch
 * asks for; the month level is always last so each month's job orders sit
 * directly under it. Backlog columns only fill on the levels above the
 * months, since remaining work belongs to no month.
 *
 * The DataTable draws the tree: each fact is a row whose group keys are the
 * ids of its tree nodes, and the group headers read their figures from here.
 */

export const MONTH_NAMES = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

export const ADJUSTMENT_KALEM = '__adjustment__';
// Painting is priced per kg of the same steel the welders already counted, so
// its kg never adds to welding kg: wherever both meet, they show apart.
export const PAINT_KALEM = 'boya';

export type Level = 'sub' | 'kalem' | 'month';

export const GROUPINGS: { id: string; label: string; levels: Level[] }[] = [
  { id: 'sub-month', label: 'Taşeron › Ay', levels: ['sub', 'month'] },
  { id: 'sub-kalem-month', label: 'Taşeron › Kalem › Ay', levels: ['sub', 'kalem', 'month'] },
  { id: 'kalem-sub-month', label: 'Kalem › Taşeron › Ay', levels: ['kalem', 'sub', 'month'] },
];
export const GROUPING_STORAGE_KEY = 'subcontracting-overview-grouping';

export const STATEMENT_STATUS: Record<
  string,
  { label: string; color: 'grey' | 'blue' | 'green' | 'purple' | 'red' }
> = {
  draft: { label: 'Taslak', color: 'grey' },
  submitted: { label: 'Onay Bekliyor', color: 'blue' },
  approved: { label: 'Onaylandı', color: 'green' },
  paid: { label: 'Ödendi', color: 'purple' },
  rejected: { label: 'Reddedildi', color: 'red' },
};

export const JOB_STATUS: Record<string, string> = {
  draft: 'Taslak',
  active: 'Aktif',
  on_hold: 'Beklemede',
  completed: 'Tamamlandı',
  cancelled: 'İptal',
};

export const KIND_LABEL: Record<string, string> = { billed: 'Faturalanan', pending: 'Bekleyen' };

const CURRENCY_SYMBOL: Record<string, string> = { TRY: '₺', EUR: '€', USD: '$', GBP: '£' };

export const CHILD_NOUN: Record<Level, string> = { sub: 'taşeron', kalem: 'kalem', month: 'ay' };

// ---- helpers --------------------------------------------------------------------

export function num(value: unknown): number {
  const n = typeof value === 'string' ? Number.parseFloat(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

export function periodLabel(period: string): string {
  const [year, month] = String(period).split('-').map(Number);
  return `${MONTH_NAMES[(month ?? 0) - 1] || month} ${year}`;
}

export function trCompare(a: unknown, b: unknown): number {
  return String(a).localeCompare(String(b), 'tr', { sensitivity: 'base' });
}

/** The one currency in the set, 'TRY' for an empty set, null when mixed. */
export function singleCurrency(currencies: Set<string> | null | undefined): string | null {
  if (!currencies || currencies.size === 0) return 'TRY';
  return currencies.size === 1 ? [...currencies][0]! : null;
}

export function currencySymbol(currency: string | null): string {
  if (currency === null) return '';
  return CURRENCY_SYMBOL[currency] || currency || '₺';
}

const numberFormats = new Map<number, Intl.NumberFormat>();
export function formatNumber(value: unknown, digits = 2): string {
  let format = numberFormats.get(digits);
  if (!format) {
    format = new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    numberFormats.set(digits, format);
  }
  return format.format(num(value));
}

export function formatMoneyText(value: unknown, currency: string | null): string {
  return `${formatNumber(value, 2)} ${currencySymbol(currency)}`.trim();
}

/** Newest first, from January of last year up to this month. */
export function buildMonthOptions(now = new Date()): { value: string; label: string }[] {
  const options = [];
  for (let back = 0; ; back += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    if (d.getFullYear() < now.getFullYear() - 1) break;
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    options.push({ value, label: periodLabel(value) });
  }
  return options;
}

// ---- lookup ---------------------------------------------------------------------

export interface Lookup {
  report: MonthlyReport;
  subs: Map<string, MonthlyReportSubcontractor>;
  kalems: Map<string, string>;
  /** `${subcontractor_id}|${period}` -> statement. */
  statements: Map<string, MonthlyReportStatement>;
  /** Dönem toplamı per subcontractor-month, whatever the grouping. */
  monthTotals: Map<string, number>;
}

export function buildLookup(report: MonthlyReport): Lookup {
  const monthTotals = new Map<string, number>();
  for (const f of report.facts) {
    const key = `${f.subcontractor_id}|${f.period}`;
    monthTotals.set(key, (monthTotals.get(key) || 0) + num(f.amount));
  }
  return {
    report,
    subs: new Map(report.subcontractors.map((s) => [String(s.id), s])),
    kalems: new Map(report.kalems.map((k) => [k.key, k.label])),
    statements: new Map(report.statements.map((s) => [`${s.subcontractor_id}|${s.period}`, s])),
    monthTotals,
  };
}

export function subName(lookup: Lookup, id: string): string {
  const sub = lookup.subs.get(id);
  return sub ? sub.short_name || sub.name || '' : `#${id}`;
}

export function kalemName(lookup: Lookup, key: string): string {
  return lookup.kalems.get(key) || key;
}

// ---- tree -----------------------------------------------------------------------

export interface Agg {
  kg: number;
  paintKg: number;
  paintAmount: number;
  billed: number;
  pending: number;
  adjustment: number;
  currencies: Set<string>;
}

export interface Backlog {
  allocated: number;
  done: number;
  remainingKg: number;
  remainingAmount: number;
  contract: number;
  currencies: Set<string>;
}

export interface TreeNode {
  /** Path id, e.g. 'root/sub:5/month:2026-03'; the DataTable group value. */
  id: string;
  level: Level | 'root';
  value: string;
  parent: TreeNode | null;
  depth: number;
  children: Map<string, TreeNode>;
  sorted: TreeNode[];
  leaves: MonthlyReportFact[];
  agg: Agg;
  backlog: Backlog | null;
}

function newNode(
  id: string,
  level: TreeNode['level'],
  value: string,
  parent: TreeNode | null,
): TreeNode {
  return {
    id,
    level,
    value,
    parent,
    depth: parent ? parent.depth + 1 : -1,
    children: new Map(),
    sorted: [],
    leaves: [],
    agg: {
      kg: 0,
      paintKg: 0,
      paintAmount: 0,
      billed: 0,
      pending: 0,
      adjustment: 0,
      currencies: new Set(),
    },
    backlog: null,
  };
}

function levelValue(level: Level, row: MonthlyReportFact | MonthlyReportBacklog): string {
  if (level === 'sub') return String(row.subcontractor_id);
  if (level === 'kalem') return row.kalem_key;
  return (row as MonthlyReportFact).period;
}

function addFact(node: TreeNode, fact: MonthlyReportFact) {
  const amount = num(fact.amount);
  const kg = num(fact.weight_kg);
  node.agg.kg += kg;
  if (fact.kalem_key === PAINT_KALEM) {
    node.agg.paintKg += kg;
    node.agg.paintAmount += amount;
  }
  if (fact.kind === 'billed') node.agg.billed += amount;
  else if (fact.kind === 'pending') node.agg.pending += amount;
  else node.agg.adjustment += amount;
  node.agg.currencies.add(fact.currency || 'TRY');
}

function addBacklog(node: TreeNode, row: MonthlyReportBacklog) {
  if (!node.backlog) {
    node.backlog = {
      allocated: 0,
      done: 0,
      remainingKg: 0,
      remainingAmount: 0,
      contract: 0,
      currencies: new Set(),
    };
  }
  const b = node.backlog;
  b.allocated += num(row.allocated_weight_kg);
  b.done += num(row.done_weight_kg);
  b.remainingKg += num(row.remaining_weight_kg);
  b.remainingAmount += num(row.remaining_amount);
  b.contract += num(row.contract_amount);
  b.currencies.add(row.currency || 'TRY');
}

export function nodeTotal(node: TreeNode): number {
  return node.agg.billed + node.agg.pending + node.agg.adjustment;
}

export function hasRows(node: TreeNode): boolean {
  return node.sorted.length > 0 || node.leaves.length > 0;
}

const KIND_ORDER: Record<string, number> = { billed: 0, pending: 1, adjustment: 2 };

export interface Tree {
  root: TreeNode;
  /** Every node by id. */
  nodes: Map<string, TreeNode>;
  levels: Level[];
}

export function buildTree(lookup: Lookup, levels: Level[]): Tree {
  const { report } = lookup;
  const root = newNode('root', 'root', '', null);
  const nodes = new Map<string, TreeNode>();

  const descend = (node: TreeNode, level: Level, row: MonthlyReportFact | MonthlyReportBacklog) => {
    const value = levelValue(level, row);
    let child = node.children.get(value);
    if (!child) {
      child = newNode(`${node.id}/${level}:${value}`, level, value, node);
      node.children.set(value, child);
      nodes.set(child.id, child);
    }
    return child;
  };

  for (const fact of report.facts) {
    let node = root;
    addFact(node, fact);
    for (const level of levels) {
      node = descend(node, level, fact);
      addFact(node, fact);
    }
    node.leaves.push(fact);
  }

  // Remaining work belongs to no month, so it stops one level short. A
  // finished contract only feeds rows that the period already opened — on its
  // own it would add an empty row for a subcontractor who did nothing in the
  // period and has nothing left.
  for (const row of report.backlog) {
    const open = num(row.remaining_weight_kg) > 0;
    let node = root;
    addBacklog(node, row);
    for (const level of levels) {
      if (level === 'month') break;
      if (!open && !node.children.has(levelValue(level, row))) break;
      node = descend(node, level, row);
      addBacklog(node, row);
    }
  }

  const tree = { root, nodes, levels };
  sortTree(lookup, root);
  return tree;
}

function nodeName(lookup: Lookup, node: TreeNode): string {
  if (node.level === 'sub') return subName(lookup, node.value);
  if (node.level === 'kalem') return kalemName(lookup, node.value);
  return node.value;
}

/** Sibling order: months by date, kalems welding › paint › adjustments, top subs A–Z, the rest by size. */
export function compareNodes(lookup: Lookup, a: TreeNode, b: TreeNode): number {
  if (a.level === 'month') return a.value.localeCompare(b.value); // 'YYYY-MM' is chronological
  const tail = (n: TreeNode) =>
    n.level !== 'kalem' ? 0 : n.value === ADJUSTMENT_KALEM ? 2 : n.value === PAINT_KALEM ? 1 : 0;
  if (tail(a) !== tail(b)) return tail(a) - tail(b);
  // Top-level subcontractors read as a directory (A-Z); anything else is a
  // ranking — who did the most ÇELİK, which kalem is biggest.
  if (a.level === 'sub' && a.depth === 0)
    return trCompare(subName(lookup, a.value), subName(lookup, b.value));
  return (
    b.agg.kg - a.agg.kg ||
    nodeTotal(b) - nodeTotal(a) ||
    (b.backlog?.remainingKg || 0) - (a.backlog?.remainingKg || 0) ||
    trCompare(nodeName(lookup, a), nodeName(lookup, b))
  );
}

export function compareLeaves(lookup: Lookup, a: MonthlyReportFact, b: MonthlyReportFact): number {
  return (
    String(a.job_no).localeCompare(String(b.job_no), 'tr', { numeric: true }) ||
    (KIND_ORDER[a.kind] ?? 2) - (KIND_ORDER[b.kind] ?? 2) ||
    trCompare(kalemName(lookup, a.kalem_key), kalemName(lookup, b.kalem_key))
  );
}

function sortTree(lookup: Lookup, node: TreeNode) {
  node.sorted = [...node.children.values()].sort((a, b) => compareNodes(lookup, a, b));
  node.sorted.forEach((child) => sortTree(lookup, child));
  node.leaves.sort((a, b) => compareLeaves(lookup, a, b));
}

export function ancestorLevels(node: TreeNode): Set<string> {
  const levels = new Set<string>();
  for (let n: TreeNode | null = node; n && n.level !== 'root'; n = n.parent) levels.add(n.level);
  return levels;
}

export function ancestorValue(node: TreeNode, level: Level): string | null {
  for (let n: TreeNode | null = node; n && n.level !== 'root'; n = n.parent) {
    if (n.level === level) return n.value;
  }
  return null;
}

// ---- table rows -----------------------------------------------------------------

/**
 * A DataTable row: a fact under its month node, or a hidden placeholder that
 * only makes a backlog-only node (remaining work, nothing in the period) exist
 * as a group. `path` holds the group value per level.
 */
export type OverviewRow =
  | { kind: 'fact'; id: string; fact: MonthlyReportFact; parentId: string; path: string[] }
  | { kind: 'placeholder'; id: string; path: string[] };

/** Group values below a backlog-only node: the page hides these groups. */
export const HIDDEN_MARK = '~hidden';

export function treeRows(tree: Tree): OverviewRow[] {
  const rows: OverviewRow[] = [];
  const pathOf = (node: TreeNode) => {
    const path: string[] = [];
    for (let n: TreeNode | null = node; n && n.level !== 'root'; n = n.parent) path.unshift(n.id);
    return path;
  };
  const walk = (node: TreeNode) => {
    for (const child of node.sorted) {
      if (child.leaves.length) {
        const path = pathOf(child);
        child.leaves.forEach((fact, i) =>
          rows.push({ kind: 'fact', id: `${child.id}#${i}`, fact, parentId: child.id, path }),
        );
      } else if (!child.sorted.length) {
        const path = pathOf(child);
        while (path.length < tree.levels.length)
          path.push(`${child.id}/${HIDDEN_MARK}${path.length}`);
        rows.push({ kind: 'placeholder', id: `${child.id}#placeholder`, path });
      }
      walk(child);
    }
  };
  walk(tree.root);
  return rows;
}

// ---- headcount ------------------------------------------------------------------

/**
 * Where a headcount applies: 'sub' for a top-level subcontractor row, 'month'
 * for its months, else null. Headcount is per subcontractor per month; under
 * a kalem it would read as "people on ÇELİK", which nobody records.
 */
export function headcountScope(node: TreeNode): 'sub' | 'month' | null {
  if (node.level === 'sub' && node.depth === 0) return 'sub';
  if (node.level === 'month' && node.parent?.level === 'sub' && node.parent.depth === 0)
    return 'month';
  return null;
}

/**
 * A subcontractor's average headcount over the selected months: the backend's
 * avg_employee_count rule (rejected statements never happened) but unrounded,
 * so the per-person division is not skewed by the 1-decimal display.
 */
export function subHeadcount(lookup: Lookup, subId: string): number | null {
  const counts = lookup.report.statements
    .filter(
      (st) =>
        String(st.subcontractor_id) === subId &&
        st.status !== 'rejected' &&
        st.employee_count !== null &&
        st.employee_count !== undefined,
    )
    .map((st) => num(st.employee_count));
  return counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : null;
}

/** Sum of the shown subcontractors' average headcounts — "Ort. Toplam Çalışan". */
export function totalHeadcount(lookup: Lookup): number {
  return lookup.report.subcontractors.reduce(
    (sum, s) => sum + (subHeadcount(lookup, String(s.id)) || 0),
    0,
  );
}

export interface PerPerson {
  total: number;
  personMonths: number;
  months: number;
  skipped: number;
  value: number | null;
}

/**
 * Monthly average paid per person over the selected months, for a set of
 * subcontractor ids: Σ month total ÷ Σ month headcount. A month paid without
 * a headcount has no one to divide by, so it is left out of both sides and
 * counted in `skipped`.
 */
export function monthlyPerPerson(lookup: Lookup, subIds: Set<string>): PerPerson {
  const pp = { total: 0, personMonths: 0, months: 0, skipped: 0 };
  lookup.monthTotals.forEach((amount, key) => {
    if (!amount || !subIds.has(key.split('|')[0]!)) return;
    const statement = lookup.statements.get(key);
    const count = statement && statement.status !== 'rejected' ? num(statement.employee_count) : 0;
    if (count > 0) {
      pp.total += amount;
      pp.personMonths += count;
      pp.months += 1;
    } else {
      pp.skipped += 1;
    }
  });
  return { ...pp, value: pp.personMonths ? pp.total / pp.personMonths : null };
}

// ---- figures --------------------------------------------------------------------

export interface OverviewFigures {
  subcontractors: number;
  /** Welding kg alone when the period mixes in paint. */
  doneKg: number;
  doneExcludesPaint: boolean;
  billed: string;
  pending: string;
  remaining: string;
  avgEmployees: number;
}

export function overviewFigures(lookup: Lookup, tree: Tree): OverviewFigures {
  const { report } = lookup;
  const root = tree.root;
  const currency = singleCurrency(root.agg.currencies);
  // Same subcontractors the table shows: work in the period, or work left.
  const shown = new Set([
    ...report.facts.map((f) => String(f.subcontractor_id)),
    ...report.backlog
      .filter((b) => num(b.remaining_weight_kg) > 0)
      .map((b) => String(b.subcontractor_id)),
  ]);
  const avgEmployees = [...shown].reduce((sum, id) => sum + (subHeadcount(lookup, id) || 0), 0);
  const weldKg = root.agg.kg - root.agg.paintKg;
  const mixed = weldKg > 0 && root.agg.paintKg > 0;
  return {
    subcontractors: shown.size,
    doneKg: mixed ? weldKg : root.agg.kg,
    doneExcludesPaint: mixed,
    billed: formatMoneyText(root.agg.billed, currency),
    pending: formatMoneyText(root.agg.pending, currency),
    remaining: formatMoneyText(
      root.backlog?.remainingAmount || 0,
      singleCurrency(root.backlog?.currencies),
    ),
    avgEmployees,
  };
}

export function periodRangeLabel(period: MonthlyReport['period']): string {
  const { start, end } = period;
  if (start && end)
    return start === end ? periodLabel(start) : `${periodLabel(start)} – ${periodLabel(end)}`;
  if (start) return `${periodLabel(start)} ve sonrası`;
  if (end) return `${periodLabel(end)} ve öncesi`;
  return 'Tüm dönemler';
}

import { compareValues } from './sorting';
import type { DataTableGrouping, GroupKey, RowGroup } from './types';

/** The parts of a table row the body needs (TanStack rows have them). */
export interface BodyRow<T> {
  id: string;
  index: number;
  original: T;
}

export interface GroupNode<T> {
  id: string;
  value: unknown;
  depth: number;
  rows: BodyRow<T>[];
  children: GroupNode<T>[] | null;
}

export type DisplayItem<T> =
  | { kind: 'row'; key: string; row: BodyRow<T>; groupId: string | null; depth: number }
  | { kind: 'group'; key: string; group: RowGroup<T> }
  | { kind: 'groupFooter'; key: string; group: RowGroup<T> };

export function groupKeys<T>(grouping: DataTableGrouping<T>): GroupKey<T>[] {
  const { by } = grouping;
  return (Array.isArray(by) ? [...by] : [by]) as GroupKey<T>[];
}

export function readGroupKey<T>(key: GroupKey<T>, row: T): unknown {
  return typeof key === 'function' ? key(row) : row[key];
}

/** Legacy getGroupValue: empties share one group. */
export function groupToken(value: unknown): string {
  if (value === null || value === undefined || value === '') return '__null__';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

const SEP = '\u001f';

function sortGroups<T>(nodes: GroupNode<T>[], sort: DataTableGrouping<T>['sort']): GroupNode<T>[] {
  if (sort === false) return nodes;
  const empty = (v: unknown) => v === null || v === undefined || v === '';
  const compare =
    typeof sort === 'function'
      ? (a: GroupNode<T>, b: GroupNode<T>) => sort(a.value, b.value)
      : sort === 'desc'
        ? // Descending, but the empty group stays last.
          (a: GroupNode<T>, b: GroupNode<T>) =>
            empty(a.value) || empty(b.value)
              ? compareValues(a.value, b.value)
              : compareValues(b.value, a.value)
        : (a: GroupNode<T>, b: GroupNode<T>) => compareValues(a.value, b.value);
  return [...nodes].sort(compare);
}

/** Rows into nested groups; rows keep their order inside each group. */
export function buildGroupTree<T>(
  rows: readonly BodyRow<T>[],
  keys: readonly GroupKey<T>[],
  sort: DataTableGrouping<T>['sort'],
  parentId = '',
  depth = 0,
): GroupNode<T>[] {
  const key = keys[depth];
  if (key === undefined) return [];
  const byToken = new Map<string, GroupNode<T>>();
  for (const row of rows) {
    const value = readGroupKey(key, row.original);
    const token = groupToken(value);
    let node = byToken.get(token);
    if (!node) {
      node = {
        id: parentId ? `${parentId}${SEP}${token}` : token,
        value,
        depth,
        rows: [],
        children: null,
      };
      byToken.set(token, node);
    }
    node.rows.push(row);
  }
  const nodes = sortGroups([...byToken.values()], sort);
  if (depth + 1 < keys.length) {
    for (const node of nodes)
      node.children = buildGroupTree(node.rows, keys, sort, node.id, depth + 1);
  }
  return nodes;
}

/**
 * The body as a flat list: group header, its rows (or subgroups) and footer,
 * so the plain and the virtualized body render the same items.
 */
export function flattenGroups<T>(
  nodes: readonly GroupNode<T>[],
  isExpanded: (node: GroupNode<T>) => boolean,
  withFooter: boolean,
): DisplayItem<T>[] {
  const out: DisplayItem<T>[] = [];
  const walk = (list: readonly GroupNode<T>[]) => {
    for (const node of list) {
      const expanded = isExpanded(node);
      // Leaf rows in display order: nested groups may reorder them.
      const leaves: BodyRow<T>[] = [];
      const collect = (n: GroupNode<T>) => {
        if (n.children) n.children.forEach(collect);
        else leaves.push(...n.rows);
      };
      collect(node);
      const group: RowGroup<T> = {
        id: node.id,
        value: node.value,
        depth: node.depth,
        rows: leaves.map((row) => row.original),
        expanded,
      };
      out.push({ kind: 'group', key: `group:${node.id}`, group });
      if (!expanded) continue;
      if (node.children) walk(node.children);
      else
        for (const row of node.rows)
          out.push({ kind: 'row', key: row.id, row, groupId: node.id, depth: node.depth + 1 });
      if (withFooter) out.push({ kind: 'groupFooter', key: `footer:${node.id}`, group });
    }
  };
  walk(nodes);
  return out;
}

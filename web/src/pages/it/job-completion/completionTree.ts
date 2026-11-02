import type { CompletionNode } from '@/api/it/jobCompletion';

// The tree logic of job-completion.js, without the DOM.

// A job order in one of these states has nothing left to force: the backend
// skips them, so the UI refuses the selection instead of pretending otherwise.
export const RESOLVED_STATUSES = new Set(['completed', 'cancelled']);

export interface TreeNode extends CompletionNode {
  children: TreeNode[];
  parentRef: TreeNode | null;
  depth: number;
}

export interface Tree {
  nodes: Map<string, TreeNode>;
  roots: TreeNode[];
}

export function buildTree(rows: CompletionNode[]): Tree {
  const nodes = new Map<string, TreeNode>();
  for (const row of rows) nodes.set(row.job_no, { ...row, children: [], parentRef: null, depth: 0 });

  const roots: TreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parent ? nodes.get(node.parent) : undefined;
    if (parent) {
      node.parentRef = parent;
      parent.children.push(node);
    } else {
      // Also covers a parent the payload does not carry (archived rows are
      // excluded server-side): the child stands as a root.
      roots.push(node);
    }
  }

  // Depth by traversal, with a seen-set so a malformed parent cycle cannot hang the page.
  const seen = new Set<string>();
  const stack: [TreeNode, number][] = roots.map((node) => [node, 0]);
  while (stack.length) {
    const [node, depth] = stack.pop()!;
    if (seen.has(node.job_no)) continue;
    seen.add(node.job_no);
    node.depth = depth;
    for (const child of node.children) stack.push([child, depth + 1]);
  }
  return { nodes, roots };
}

export function isActionable(node: CompletionNode): boolean {
  return !RESOLVED_STATUSES.has(node.status ?? '');
}

export function descendantsOf(node: TreeNode, out: TreeNode[] = [], seen = new Set<string>()): TreeNode[] {
  for (const child of node.children) {
    if (seen.has(child.job_no)) continue;
    seen.add(child.job_no);
    out.push(child);
    descendantsOf(child, out, seen);
  }
  return out;
}

export function ancestorsOf(node: TreeNode): TreeNode[] {
  const out: TreeNode[] = [];
  let current = node.parentRef;
  while (current && !out.includes(current)) {
    out.push(current);
    current = current.parentRef;
  }
  return out;
}

/** Turkish casing: 'İ'.toLowerCase() is not 'i' under the default locale. */
export function normalize(value: unknown): string {
  return String(value ?? '').toLocaleLowerCase('tr-TR');
}

/** `search` is already normalized. */
function matches(node: TreeNode, search: string, status: string): boolean {
  if (status === 'open') {
    if (RESOLVED_STATUSES.has(node.status ?? '')) return false;
  } else if (status !== 'all' && node.status !== status) {
    return false;
  }
  if (!search) return true;
  return (
    normalize(node.job_no).includes(search) ||
    normalize(node.title).includes(search) ||
    normalize(node.customer_name).includes(search)
  );
}

/**
 * Rows to show: every match, plus its ancestors (so the hierarchy stays
 * navigable) and its descendants (so a matched job shows with its subtree).
 */
export function computeVisible(tree: Tree, search: string, status: string): Set<string> {
  if (!search && status === 'all') return new Set(tree.nodes.keys());
  const visible = new Set<string>();
  for (const node of tree.nodes.values()) {
    if (!matches(node, search, status)) continue;
    visible.add(node.job_no);
    for (const ancestor of ancestorsOf(node)) visible.add(ancestor.job_no);
    for (const descendant of descendantsOf(node)) visible.add(descendant.job_no);
  }
  return visible;
}

/** Post-order pass: how many selected job orders sit under each node. */
export function computeSelectedCounts(tree: Tree, selected: ReadonlySet<string>): Map<string, number> {
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  const walk = (node: TreeNode): number => {
    if (seen.has(node.job_no)) return 0;
    seen.add(node.job_no);
    let total = 0;
    for (const child of node.children) total += walk(child);
    counts.set(node.job_no, total);
    return total + (selected.has(node.job_no) ? 1 : 0);
  };
  tree.roots.forEach(walk);
  return counts;
}

/**
 * Ticking a node takes its whole actionable subtree. Unticking drops the
 * subtree and every ancestor too: a selected parent means "this whole
 * subtree", so keeping it would re-add what was just unticked.
 */
export function withSelection(selected: ReadonlySet<string>, node: TreeNode, on: boolean): Set<string> {
  const next = new Set(selected);
  for (const item of [node, ...descendantsOf(node)]) {
    if (!isActionable(item)) continue;
    if (on) next.add(item.job_no);
    else next.delete(item.job_no);
  }
  if (!on) for (const ancestor of ancestorsOf(node)) next.delete(ancestor.job_no);
  return next;
}

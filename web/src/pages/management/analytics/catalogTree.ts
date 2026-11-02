// The scoped mode of components/catalog-tree-picker: the catalog items of the
// job orders the table holds, as a tree per template, searchable by path.
import type { CostCatalogNode } from '@/api/projects/cost';

export function nodeTitle(
  node: Pick<CostCatalogNode, 'id' | 'title' | 'title_override' | 'resolved_title'>,
): string {
  return String(node.title_override || node.title || node.resolved_title || `#${node.id}`).trim();
}

/** "Template › Parent › Title" (ancestors are in the scope). */
export function scopePath(
  node: CostCatalogNode,
  byId: ReadonlyMap<number, CostCatalogNode>,
): string {
  const titles: string[] = [];
  const seen = new Set<number>();
  let cur: CostCatalogNode | undefined = node;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    titles.unshift(nodeTitle(cur));
    cur =
      cur.parent_id !== null && cur.parent_id !== undefined ? byId.get(cur.parent_id) : undefined;
  }
  return [node.template_name, ...titles].filter(Boolean).join(' › ');
}

export interface CatalogTemplate {
  id: string;
  name: string;
}

/** The templates present in the scope, in first-seen order. */
export function scopeTemplates(nodes: CostCatalogNode[]): CatalogTemplate[] {
  const templates = new Map<string, CatalogTemplate>();
  for (const n of nodes) {
    const id = String(n.template_id);
    if (!templates.has(id)) templates.set(id, { id, name: n.template_name || `Şablon #${id}` });
  }
  return [...templates.values()];
}

export interface CatalogTreeNode {
  node: CostCatalogNode;
  path: string;
  children: CatalogTreeNode[];
}

export interface CatalogTreeGroup {
  templateId: string;
  name: string;
  roots: CatalogTreeNode[];
}

/** Nodes arrive in catalog order; children keep that order under their parent. */
export function buildCatalogTree(nodes: CostCatalogNode[]): CatalogTreeGroup[] {
  const inList = new Set(nodes.map((n) => n.id));
  const kids = new Map<number, CostCatalogNode[]>();
  const roots: CostCatalogNode[] = [];
  for (const n of nodes) {
    if (n.parent_id !== null && n.parent_id !== undefined && inList.has(n.parent_id)) {
      if (!kids.has(n.parent_id)) kids.set(n.parent_id, []);
      kids.get(n.parent_id)!.push(n);
    } else {
      roots.push(n);
    }
  }
  const build = (list: CostCatalogNode[], parentPath: string): CatalogTreeNode[] =>
    list.map((node) => {
      const title = nodeTitle(node);
      const path = parentPath
        ? `${parentPath} › ${title}`
        : `${node.template_name ?? ''} › ${title}`;
      return { node, path, children: build(kids.get(node.id) ?? [], path) };
    });
  const groups = new Map<string, CatalogTreeGroup>();
  for (const root of roots) {
    const key = String(root.template_id);
    if (!groups.has(key))
      groups.set(key, { templateId: key, name: root.template_name ?? '', roots: [] });
    groups.get(key)!.roots.push(...build([root], ''));
  }
  return [...groups.values()];
}

/** Search (2+ characters): flat hits over path and code, Turkish case-folded. */
export function searchCatalog(
  nodes: CostCatalogNode[],
  query: string,
  byId: ReadonlyMap<number, CostCatalogNode>,
): { node: CostCatalogNode; path: string }[] {
  const q = query.trim().toLocaleLowerCase('tr-TR');
  return nodes
    .map((node) => ({ node, path: scopePath(node, byId) }))
    .filter(({ node, path }) =>
      `${path} ${node.code || ''}`.toLocaleLowerCase('tr-TR').includes(q),
    );
}

/** "1,2,3" ⇄ ['1','2','3']. */
export const parseNodeIds = (value: string) =>
  value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
export const joinNodeIds = (ids: string[]) => ids.join(',');

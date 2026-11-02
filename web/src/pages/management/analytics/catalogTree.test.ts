import type { CostCatalogNode } from '@/api/projects/cost';
import {
  buildCatalogTree,
  parseNodeIds,
  scopePath,
  scopeTemplates,
  searchCatalog,
} from './catalogTree';

const node = (
  id: number,
  parent_id: number | null,
  title: string,
  template_id = 1,
  extra: Partial<CostCatalogNode> = {},
) =>
  ({
    id,
    parent_id,
    title,
    template_id,
    template_name: template_id === 1 ? 'Şablon A' : 'Şablon B',
    ...extra,
  }) as CostCatalogNode;

const NODES = [
  node(1, null, 'Fırınlar'),
  node(2, 1, 'Tav Fırını', 1, { code: 'F-01' }),
  node(3, 2, 'İç Kaplama', 1, { title_override: 'Refrakter Kaplama' }),
  node(4, null, 'Haddehane', 2),
];

describe('catalog scope', () => {
  const byId = new Map(NODES.map((n) => [n.id, n]));

  it('names a node by its template and ancestors, using title overrides', () => {
    expect(scopePath(NODES[2]!, byId)).toBe('Şablon A › Fırınlar › Tav Fırını › Refrakter Kaplama');
  });

  it('builds one tree per template in catalog order', () => {
    const groups = buildCatalogTree(NODES);
    expect(groups.map((g) => g.name)).toEqual(['Şablon A', 'Şablon B']);
    expect(groups[0]!.roots[0]!.children[0]!.children[0]!.path).toBe(
      'Şablon A › Fırınlar › Tav Fırını › Refrakter Kaplama',
    );
    expect(scopeTemplates(NODES)).toEqual([
      { id: '1', name: 'Şablon A' },
      { id: '2', name: 'Şablon B' },
    ]);
  });

  it('treats a node whose parent is outside the list as a root', () => {
    const groups = buildCatalogTree([NODES[1]!, NODES[2]!]);
    expect(groups[0]!.roots.map((r) => r.node.id)).toEqual([2]);
  });

  it('searches path and code with Turkish case folding', () => {
    expect(searchCatalog(NODES, 'FIRIN', byId).map((h) => h.node.id)).toEqual([1, 2, 3]);
    expect(searchCatalog(NODES, 'f-01', byId).map((h) => h.node.id)).toEqual([2]);
  });

  it('reads the comma-separated ids of the URL', () => {
    expect(parseNodeIds('4, 5,,6')).toEqual(['4', '5', '6']);
    expect(parseNodeIds('')).toEqual([]);
  });
});

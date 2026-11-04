import { NAVIGATION_STRUCTURE, type NavTree } from '@legacy/navigationStructure.js';
import { findParent, findTrail, flattenMenu, isPathActive, isUnbuiltGeneralPage, withoutPaths } from './navModel';

const leaf = (label: string) => ({ label, icon: 'fas fa-circle', children: {} });

const tree: NavTree = {
  '/general': {
    label: 'Genel',
    icon: 'fas fa-cogs',
    children: {
      '/general/overtime': {
        label: 'Mesailer',
        icon: 'fas fa-clock',
        children: { '/general/overtime/pending': leaf('Bekleyen') },
      },
      '/isg/issues': leaf('İSG Bildirimleri'),
    },
  },
};

describe('navModel', () => {
  it('drops removed paths, and a parent left without pages', () => {
    const pruned = withoutPaths(tree, ['/isg/issues', '/general/overtime/pending']);
    expect(pruned).toEqual({});
    const kept = withoutPaths(tree, ['/isg/issues']);
    expect(Object.keys(kept['/general']!.children)).toEqual(['/general/overtime']);
  });

  it('marks a parent active for descendants that do not share its prefix', () => {
    expect(isPathActive('/general', tree['/general']!, '/isg/issues/')).toBe(true);
    expect(isPathActive('/general', tree['/general']!, '/sales')).toBe(false);
  });

  it('flattens nested sections into labels and indented links', () => {
    expect(flattenMenu(tree['/general']!.children).map((r) => [r.kind, r.path, r.depth])).toEqual([
      ['label', '/general/overtime', 0],
      ['link', '/general/overtime/pending', 1],
      ['link', '/isg/issues', 0],
    ]);
  });

  it('finds the trail of entries leading to a page', () => {
    expect(findTrail(tree, '/general/overtime/pending/').map((s) => s.label)).toEqual([
      'Genel',
      'Mesailer',
      'Bekleyen',
    ]);
    expect(findTrail(tree, '/isg/issues').map((s) => s.label)).toEqual(['Genel', 'İSG Bildirimleri']);
    expect(findTrail(tree, '/sales')).toEqual([]);
  });

  it('finds the nearest openable entry above a page', () => {
    const any = () => true;
    expect(findParent(tree, '/general/overtime/pending/', any)?.path).toBe('/general/overtime');
    // A page the menu does not list goes to the entry its path sits under.
    expect(findParent(tree, '/general/overtime/pending/archive', any)?.path).toBe(
      '/general/overtime/pending',
    );
    // Entries without a page of their own are skipped.
    expect(
      findParent(tree, '/general/overtime/pending', (path) => path !== '/general/overtime')?.path,
    ).toBe('/general');
    expect(findParent(tree, '/isg/issues', any)?.path).toBe('/general');
    // The top of a section, or a page outside the menu, has no parent.
    expect(findParent(tree, '/general', any)).toBeUndefined();
    expect(findParent(tree, '/sales', any)).toBeUndefined();
  });

  it('knows which /general pages are built', () => {
    expect(isUnbuiltGeneralPage('/general/overtime/pending')).toBe(false);
    expect(isUnbuiltGeneralPage('/general/something-new')).toBe(true);
    expect(isUnbuiltGeneralPage('/sales')).toBe(false);
  });
});

describe('the Planlama menu', () => {
  const planning = NAVIGATION_STRUCTURE;
  const any = () => true;

  it('groups the request and stock pages and puts project planning under Projeler', () => {
    expect(Object.keys(planning['/planning']!.children)).toEqual([
      '/planning/department-requests',
      '/planning/items',
      '/planning/procurement-lines',
      '/planning/inventory',
      '/planning/projects',
      '/planning/cnc-cutting',
      '/planning/linear-cutting',
    ]);
    // A parent is a heading only, so the Projeler page is a row of its own.
    expect(
      flattenMenu(planning['/planning']!.children)
        .filter(
          (row) => row.path.startsWith('/planning/proj') || row.path === '/planning/task-templates',
        )
        .map((row) => `${row.kind} ${row.label}`),
    ).toEqual(['label Projeler', 'link Görevler', 'link Proje Planlama', 'link Görev Şablonları']);
  });

  it('sends the pages under Projeler back to it, and Projeler back to the hub', () => {
    expect(findTrail(planning, '/planning/task-templates').map((step) => step.label)).toEqual([
      'Planlama',
      'Projeler',
      'Görev Şablonları',
    ]);
    expect(findParent(planning, '/planning/task-templates/', any)?.path).toBe('/planning/projects');
    expect(findParent(planning, '/planning/project-planning', any)?.path).toBe(
      '/planning/projects',
    );
    expect(findParent(planning, '/planning/projects', any)?.path).toBe('/planning');
  });
});

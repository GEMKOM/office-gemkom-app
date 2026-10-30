import type { NavItem, NavTree } from '@legacy/navigationStructure.js';

// Pure helpers behind the rail and the drawer, mirroring components/navbar.js
// so both sides show the same menu while legacy and React pages coexist.

// /general/* paths that have a page (navbar.js BUILT_GENERAL_PAGES). Anything
// else under /general is a placeholder. Keep the two lists in sync until the
// legacy navbar is gone.
const BUILT_GENERAL_PAGES = [
  '/general/machines',
  '/general/overtime',
  '/general/vacation',
  '/general/department-requests',
  '/general/crane-requests',
  '/general/discussions',
];

// Personal pages reached from the user menu instead of the section menus.
export const USER_MENU_PATHS = ['/general/discussions', '/general/vacation/requests'];

/**
 * The tree without these paths. A parent whose pages were all removed goes
 * too, rather than turning into a link of its own.
 */
export function withoutPaths(tree: NavTree, paths: readonly string[]): NavTree {
  const out: NavTree = {};
  for (const [path, item] of Object.entries(tree)) {
    if (paths.includes(path)) continue;
    if (!hasChildren(item)) {
      out[path] = item;
      continue;
    }
    const children = withoutPaths(item.children, paths);
    if (Object.keys(children).length > 0) out[path] = { ...item, children };
  }
  return out;
}

export function isUnbuiltGeneralPage(path: string): boolean {
  return path.startsWith('/general/') && !BUILT_GENERAL_PAGES.some((page) => path.startsWith(page));
}

export function hasChildren(item: NavItem): boolean {
  return Object.keys(item.children || {}).length > 0;
}

// A parent is active when the current path is it or any descendant: some
// entries hang under a parent they don't share a path prefix with (İSG under Genel).
export function isPathActive(path: string, item: NavItem, currentPath: string): boolean {
  const current = currentPath.length > 1 ? currentPath.replace(/\/$/, '') : currentPath;
  if (current === path || current.startsWith(path + '/')) return true;
  return Object.entries(item.children || {}).some(([childPath, child]) =>
    isPathActive(childPath, child, current),
  );
}

export type MenuRow =
  | { kind: 'label'; path: string; label: string; icon: string; depth: number }
  | { kind: 'link'; path: string; label: string; icon: string; depth: number };

/**
 * Flatten a submenu for a dropdown: sections with children become a label
 * followed by their (indented) pages, at any depth.
 */
export function flattenMenu(tree: NavTree, depth = 0): MenuRow[] {
  const rows: MenuRow[] = [];
  for (const [path, item] of Object.entries(tree)) {
    if (hasChildren(item)) {
      rows.push({ kind: 'label', path, label: item.label, icon: item.icon, depth });
      rows.push(...flattenMenu(item.children, depth + 1));
    } else {
      rows.push({ kind: 'link', path, label: item.label, icon: item.icon, depth });
    }
  }
  return rows;
}

export interface TrailStep {
  path: string;
  label: string;
}

/**
 * The chain of menu entries leading to the current page, outermost first
 * (Satış › Müşteriler). Follows the same rule as isPathActive, so pages that
 * hang under a parent with another prefix still get their parent.
 */
export function findTrail(tree: NavTree, currentPath: string): TrailStep[] {
  for (const [path, item] of Object.entries(tree)) {
    if (isPathActive(path, item, currentPath)) {
      return [{ path, label: item.label }, ...findTrail(item.children || {}, currentPath)];
    }
  }
  return [];
}

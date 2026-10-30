import type { NavTree } from '@legacy/navigationStructure.js';
import { NavLink, ScrollArea } from '@mantine/core';
import { useLocation } from 'react-router';
import { FaIcon } from './FaIcon';
import { hasChildren, isPathActive } from './navModel';
import { useNavigation } from './useNavigation';

function NavTreeLinks({ tree, currentPath, onOpen }: { tree: NavTree; currentPath: string; onOpen: (path: string) => void }) {
  return Object.entries(tree).map(([path, item]) => {
    const active = isPathActive(path, item, currentPath);
    if (!hasChildren(item)) {
      return (
        <NavLink key={path} label={item.label} leftSection={<FaIcon icon={item.icon} />} active={active} onClick={() => onOpen(path)} />
      );
    }
    return (
      <NavLink key={path} label={item.label} leftSection={<FaIcon icon={item.icon} />} defaultOpened={active} childrenOffset="md">
        <NavTreeLinks tree={item.children} currentPath={currentPath} onOpen={onOpen} />
      </NavLink>
    );
  });
}

/** Small screens: the whole menu as a collapsible tree in the drawer. */
export function SideNav({ onNavigate }: { onNavigate: () => void }) {
  const { tree, open } = useNavigation();
  const { pathname } = useLocation();
  return (
    <ScrollArea h="100%" type="auto">
      <NavTreeLinks
        tree={tree}
        currentPath={pathname}
        onOpen={(path) => {
          onNavigate();
          open(path);
        }}
      />
    </ScrollArea>
  );
}

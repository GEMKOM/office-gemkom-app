import type { NavItem, NavTree } from '@legacy/navigationStructure.js';
import { Menu, ScrollArea, Tooltip, UnstyledButton } from '@mantine/core';
import { useLocation } from 'react-router';
import { AppLink } from './AppLink';
import { FaIcon } from './FaIcon';
import { flattenMenu, hasChildren, isPathActive } from './navModel';
import { NotificationBell } from './NotificationBell';
import { railMenuClassNames } from './railMenu';
import classes from './shell.module.css';
import { useNavigation } from './useNavigation';
import { UserMenu } from './UserMenu';

function Flyout({ tree, onOpen, currentPath }: { tree: NavTree; onOpen: (path: string) => void; currentPath: string }) {
  return (
    <ScrollArea.Autosize mah="75vh" type="auto">
      {flattenMenu(tree).map((row) =>
        row.kind === 'label' ? (
          <Menu.Label key={row.path} pl={12 + row.depth * 12}>
            {row.label}
          </Menu.Label>
        ) : (
          <Menu.Item
            key={row.path}
            pl={12 + row.depth * 12}
            leftSection={<FaIcon icon={row.icon} />}
            onClick={() => onOpen(row.path)}
            data-active={currentPath === row.path || currentPath.startsWith(row.path + '/') || undefined}
          >
            {row.label}
          </Menu.Item>
        ),
      )}
    </ScrollArea.Autosize>
  );
}

function RailEntry({ path, item, onOpen, currentPath }: { path: string; item: NavItem; onOpen: (path: string) => void; currentPath: string }) {
  const active = isPathActive(path, item, currentPath) || undefined;
  if (!hasChildren(item)) {
    return (
      <Tooltip label={item.label} position="right" offset={12} withArrow>
        <UnstyledButton className={classes.railItem} data-active={active} aria-label={item.label} onClick={() => onOpen(path)}>
          <FaIcon icon={item.icon} />
        </UnstyledButton>
      </Tooltip>
    );
  }
  return (
    <Menu
      trigger="click-hover"
      openDelay={60}
      closeDelay={160}
      position="right-start"
      offset={14}
      width={280}
      withinPortal
      classNames={railMenuClassNames}
    >
      <Menu.Target>
        <UnstyledButton className={classes.railItem} data-active={active} aria-label={item.label}>
          <FaIcon icon={item.icon} />
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <div className={classes.flyoutTitle}>{item.label}</div>
        <Flyout tree={item.children} onOpen={onOpen} currentPath={currentPath} />
      </Menu.Dropdown>
    </Menu>
  );
}

/** Desktop navigation: one icon per section, its pages in a flyout. */
export function Rail() {
  const { tree, open } = useNavigation();
  const { pathname } = useLocation();

  return (
    <nav className={classes.rail} aria-label="Ana menü">
      <AppLink to="/" className={classes.logo} aria-label="Ana Sayfa">
        <img src="/images/gemkom.png" alt="Gemkom Logo" />
      </AppLink>
      <ScrollArea className={classes.railScroll} type="never">
        <div className={classes.railItems}>
          {Object.entries(tree).map(([path, item]) => (
            <RailEntry key={path} path={path} item={item} onOpen={open} currentPath={pathname} />
          ))}
        </div>
      </ScrollArea>
      <div className={classes.railEnd}>
        <NotificationBell tooltipPosition="right" />
        <UserMenu position="right-end" />
      </div>
    </nav>
  );
}

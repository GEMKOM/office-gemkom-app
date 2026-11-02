import type { NavItem, NavTree } from '@legacy/navigationStructure.js';
import { Menu, ScrollArea, Tooltip, UnstyledButton } from '@mantine/core';
import { useLocation } from 'react-router';
import { AppLink } from './AppLink';
import { AttendanceButton } from './AttendanceButton';
import { FaIcon } from './FaIcon';
import { flattenMenu, hasChildren, isPathActive, type MenuRow } from './navModel';
import { NotificationBell } from './NotificationBell';
import { railMenuClassNames } from './railMenu';
import logoMark from './gemkom-mark-on-dark.png';
import classes from './shell.module.css';
import { useNavigation } from './useNavigation';
import { UserMenu } from './UserMenu';

type OpenPath = (path: string) => void;

const isRowActive = (row: MenuRow, currentPath: string) =>
  currentPath === row.path || currentPath.startsWith(row.path + '/');

function Flyout({ tree, onOpen, currentPath }: { tree: NavTree; onOpen: OpenPath; currentPath: string }) {
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
            data-active={isRowActive(row, currentPath) || undefined}
          >
            {row.label}
          </Menu.Item>
        ),
      )}
    </ScrollArea.Autosize>
  );
}

/**
 * Collapsed: one icon per section. A click opens the section's hub; hovering
 * a section with pages shows them in a flyout as a shortcut.
 */
function RailEntry({ path, item, onOpen, currentPath }: { path: string; item: NavItem; onOpen: OpenPath; currentPath: string }) {
  const active = isPathActive(path, item, currentPath) || undefined;
  const button = (
    <UnstyledButton
      className={classes.railItem}
      data-active={active}
      aria-current={currentPath === path ? 'page' : undefined}
      aria-label={item.label}
      onClick={() => onOpen(path)}
    >
      <FaIcon icon={item.icon} />
    </UnstyledButton>
  );
  if (!hasChildren(item)) {
    return (
      <Tooltip label={item.label} position="right" offset={12} withArrow>
        {button}
      </Tooltip>
    );
  }
  return (
    <Menu
      trigger="hover"
      openDelay={60}
      closeDelay={160}
      position="right-start"
      offset={14}
      width={280}
      withinPortal
      classNames={railMenuClassNames}
    >
      <Menu.Target>{button}</Menu.Target>
      <Menu.Dropdown>
        <div className={classes.flyoutTitle}>{item.label}</div>
        <Flyout tree={item.children} onOpen={onOpen} currentPath={currentPath} />
      </Menu.Dropdown>
    </Menu>
  );
}

/** Expanded: one row per section, each opening its hub. */
function RailRows({ tree, onOpen, currentPath }: { tree: NavTree; onOpen: OpenPath; currentPath: string }) {
  return (
    <ul className={classes.tree}>
      {Object.entries(tree).map(([path, item]) => (
        <li key={path}>
          <UnstyledButton
            className={classes.railRow}
            data-active={isPathActive(path, item, currentPath) || undefined}
            aria-current={currentPath === path ? 'page' : undefined}
            onClick={() => onOpen(path)}
          >
            <FaIcon icon={item.icon} />
            <span className={classes.railRowLabel}>{item.label}</span>
          </UnstyledButton>
        </li>
      ))}
    </ul>
  );
}

function ToggleButton({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  if (expanded) {
    return (
      <UnstyledButton className={classes.railRow} data-toggle onClick={onToggle}>
        <FaIcon icon="fas fa-angles-left" />
        <span className={classes.railRowLabel}>Menüyü Daralt</span>
      </UnstyledButton>
    );
  }
  return (
    <Tooltip label="Menüyü Genişlet" position="right" offset={12} withArrow>
      <UnstyledButton className={classes.railItem} data-toggle aria-label="Menüyü Genişlet" onClick={onToggle}>
        <FaIcon icon="fas fa-angles-right" />
      </UnstyledButton>
    </Tooltip>
  );
}

/**
 * Desktop navigation: the top level of the menu, as a 72px icon rail or,
 * expanded, with labels. Sections open their hub pages.
 */
export function Rail({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  const { tree, open } = useNavigation();
  const { pathname } = useLocation();
  const currentPath = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;

  return (
    <nav className={classes.rail} data-expanded={expanded || undefined} aria-label="Ana menü">
      <AppLink to="/" className={classes.brand} aria-label="Ana Sayfa">
        <span className={classes.logo}>
          <img src={logoMark} alt="" />
        </span>
        {expanded && <span className={classes.wordmark}>GEMKOM</span>}
      </AppLink>
      <ScrollArea className={classes.railScroll} type={expanded ? 'hover' : 'never'} scrollbarSize={6}>
        {expanded ? (
          <RailRows tree={tree} onOpen={open} currentPath={currentPath} />
        ) : (
          <div className={classes.railItems}>
            {Object.entries(tree).map(([path, item]) => (
              <RailEntry key={path} path={path} item={item} onOpen={open} currentPath={currentPath} />
            ))}
          </div>
        )}
      </ScrollArea>
      <div className={classes.railEnd}>
        <ToggleButton expanded={expanded} onToggle={onToggle} />
        <AttendanceButton variant={expanded ? 'row' : 'icon'} position="right-end" />
        <NotificationBell variant={expanded ? 'row' : 'icon'} position="right-end" />
        <UserMenu variant={expanded ? 'row' : 'icon'} position="right-end" />
      </div>
    </nav>
  );
}

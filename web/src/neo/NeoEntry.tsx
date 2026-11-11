import { Popover, Tooltip, UnstyledButton, type FloatingPosition } from '@mantine/core';
import { useMediaQuery, useOs } from '@mantine/hooks';
import { useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import shell from '@/shell/shell.module.css';
import { FaIcon } from '@/ui/FaIcon';
import classes from './neo.module.css';
import { clickNeoEntry, hintKey, useNeo } from './neoStore';
import { NEO_PANEL_ID } from './NeoPanel';

export const UNREAD_TITLE = 'Bugünün özeti okunmadı';
export const NEO_HINT = "Neo'ya her sayfadan soru sorabilirsiniz";
/** Shown once to users who already saw NEO_HINT; bump NEWS_VERSION for the next one. */
export const NEO_NEWS =
  "Neo yenilendi: tablolar ve Excel'e aktarma, kayıtlara bağlantılar, önerilen sorular. Kayıt ekranlarındaki “Neo'ya sor” ile o kayıt hakkında sorabilirsiniz.";
const NEWS_VERSION = '2026-11';
export const newsKey = (userId: number) => `gk.neoNews.${NEWS_VERSION}.${userId}`;

function hintSeen(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    // Without storage the hint would come back on every page; skip it.
    return true;
  }
}

function rememberHint(key: string) {
  try {
    localStorage.setItem(key, '1');
  } catch {
    // Not remembered.
  }
}

/**
 * Neo's entry: in the rail under the logo (`icon` collapsed, `row` expanded)
 * and in the phone top bar (`bar`). It toggles the docked panel; the first
 * time a user sees it, a hint says what it is.
 */
export function NeoEntry({ variant }: { variant: 'icon' | 'row' | 'bar' }) {
  const open = useNeo((s) => s.open);
  const unread = useNeo((s) => s.unreadSummary !== null);
  const { user } = useAuth();
  const key = hintKey(user.id);
  const news = newsKey(user.id);
  const [seen, setSeen] = useState(() => hintSeen(key));
  const [newsSeen, setNewsSeen] = useState(() => hintSeen(news));
  // Rail and top bar are both mounted; only the one on screen shows the hint.
  const desktop = useMediaQuery('(min-width: 48em)', undefined, { getInitialValueInEffect: true });
  const onScreen = variant === 'bar' ? desktop === false : desktop === true;
  // First visit: what Neo is. Later: what is new, once.
  const message = !seen ? NEO_HINT : !newsSeen ? NEO_NEWS : null;
  const showHint = message !== null && onScreen && !open;
  const mac = useOs() === 'macos';
  const shortcut = mac ? '⌘K' : 'Ctrl+K';

  // A new user's first hint also covers the news: one popup, not two.
  const dismiss = () => {
    rememberHint(key);
    rememberHint(news);
    setSeen(true);
    setNewsSeen(true);
  };

  const onClick = () => {
    if (message) dismiss();
    clickNeoEntry();
  };

  const common = {
    'aria-label': `Neo, yapay zekâ asistanı (${shortcut})`,
    'aria-expanded': open,
    'aria-controls': NEO_PANEL_ID,
    'data-neo-entry': variant,
    onClick,
  } as const;

  let button;
  if (variant === 'row') {
    button = (
      <UnstyledButton className={`${shell.railRow} ${classes.entryRow}`} {...common}>
        <span className={classes.entryIcon} data-unread={unread || undefined}>
          <FaIcon icon="fas fa-robot" />
          <span className={classes.entryDot} />
        </span>
        <span className={shell.railRowLabel}>Neo</span>
        <kbd className={classes.kbd}>{shortcut}</kbd>
      </UnstyledButton>
    );
  } else {
    button = (
      <UnstyledButton
        className={`${shell.railItem} ${variant === 'icon' ? classes.entry : classes.entryBar}`}
        {...common}
      >
        <span className={classes.entryIcon} data-unread={unread || undefined}>
          <FaIcon icon="fas fa-robot" />
          <span className={classes.entryDot} />
        </span>
      </UnstyledButton>
    );
  }

  const position: FloatingPosition = variant === 'bar' ? 'bottom-end' : 'right';

  return (
    <Popover
      opened={showHint}
      onChange={(opened) => !opened && dismiss()}
      position={position}
      offset={variant === 'bar' ? 8 : 14}
      withArrow
      withinPortal
      trapFocus={false}
      returnFocus={false}
      classNames={{ dropdown: classes.hint, arrow: classes.hintArrow }}
    >
      <Popover.Target>
        <Tooltip
          label={unread ? `Neo · ${UNREAD_TITLE}` : `Neo · ${shortcut}`}
          position={variant === 'bar' ? 'bottom' : 'right'}
          offset={12}
          withArrow
          disabled={variant === 'row' || showHint}
        >
          {button}
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown role="status">
        <div>{message}</div>
        <UnstyledButton className={classes.hintAction} onClick={dismiss}>
          Tamam
        </UnstyledButton>
      </Popover.Dropdown>
    </Popover>
  );
}

/** The hairline between Neo and the sections. */
export function NeoRule({ expanded }: { expanded: boolean }) {
  return <div className={classes.entryRule} data-expanded={expanded || undefined} aria-hidden />;
}

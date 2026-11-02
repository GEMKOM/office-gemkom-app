import { AppShell, Tooltip, UnstyledButton } from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { useLocation } from 'react-router';
import { getConversation } from '@/api/assistant';
import { FaIcon } from '@/ui/FaIcon';
import classes from './neo.module.css';
import { NeoChat } from './NeoChat';
import { NeoHistory } from './NeoHistory';
import { neoLinkTarget } from './neoLinks';
import { NeoReports } from './NeoReports';
import {
  closeNeo,
  getNeoState,
  markRestored,
  openNeo,
  showConversation,
  startNewChat,
  toggleNeo,
  toggleNeoView,
  useNeo,
  type NeoView,
} from './neoStore';
import { NeoSummaries } from './NeoSummaries';
import { useNeoAccess } from './queries';

export const NEO_PANEL_ID = 'neo-panel';
const TITLE_ID = 'neo-panel-title';

/** Where focus goes back to when the panel closes: the entry the user can see. */
function visibleEntry(): HTMLElement | null {
  const entries = document.querySelectorAll<HTMLElement>('[data-neo-entry]');
  return [...entries].find((entry) => entry.offsetParent !== null) ?? null;
}

function HeadButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip label={label} position="bottom" withArrow openDelay={300}>
      <UnstyledButton
        className={classes.headBtn}
        aria-label={label}
        aria-pressed={active === undefined ? undefined : active}
        data-active={active || undefined}
        onClick={onClick}
      >
        <FaIcon icon={icon} />
      </UnstyledButton>
    </Tooltip>
  );
}

/** The legacy daily-summary modal opens the widget with this event. */
interface LegacyOpenDetail {
  view?: NeoView;
  summaryId?: number | string;
  prefill?: string;
}

/**
 * Wires Neo to the page: Ctrl+K / ⌘K, the ?bildirim= and ?ozet= deep links
 * and the legacy `assistant:open` event.
 */
function useNeoTriggers() {
  useHotkeys([['mod+K', () => toggleNeo()]], [], true);

  const location = useLocation();
  useEffect(() => {
    const target = neoLinkTarget(location.search);
    if (target) openNeo(target);
  }, [location.search, location.key]);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = ((event as CustomEvent<LegacyOpenDetail>).detail ?? {}) as LegacyOpenDetail;
      if (detail.view === 'summaries')
        openNeo({ view: 'summaries', summaryId: Number(detail.summaryId) || undefined });
      else openNeo({ view: 'chat', prompt: detail.prefill ? String(detail.prefill) : undefined });
    };
    document.addEventListener('assistant:open', onOpen);
    return () => document.removeEventListener('assistant:open', onOpen);
  }, []);
}

/**
 * The docked panel: the right-hand AppShell aside, so it narrows the page
 * instead of covering it (a sheet over everything on phones). It stays
 * mounted while closed (inert) so a half-typed question survives.
 */
export function NeoAside() {
  const open = useNeo((s) => s.open);
  const view = useNeo((s) => s.view);
  const restored = useNeo((s) => s.restored);
  // Asked on first open; closing keeps what the cache holds.
  const { quota, locked, ready } = useNeoAccess(open);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(open);

  useNeoTriggers();

  // Load the conversation the user left (here or on a legacy page) once the
  // quota says Neo is open to them.
  useEffect(() => {
    if (!open || !ready || locked || restored) return;
    const id = getNeoState().conversationId;
    if (!id) {
      markRestored(false);
      return;
    }
    let cancelled = false;
    getConversation(id)
      .then((detail) => {
        if (!cancelled && getNeoState().conversationId === id)
          showConversation(detail, { keepView: true });
      })
      .catch(() => {
        if (!cancelled) markRestored(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, ready, locked, restored]);

  // Opening moves focus in (not on page load, when it was already open);
  // closing gives it back to whatever opened the panel.
  useEffect(() => {
    if (open === wasOpen.current) return;
    wasOpen.current = open;
    if (open) {
      const active = document.activeElement;
      returnTo.current = active instanceof HTMLElement && active !== document.body ? active : null;
      requestAnimationFrame(() => {
        if (getNeoState().view === 'chat' && inputRef.current) inputRef.current.focus();
        else panelRef.current?.focus();
      });
      return;
    }
    const active = document.activeElement;
    if (active && active !== document.body && !panelRef.current?.contains(active)) return;
    const back = returnTo.current;
    (back && back.isConnected && back.offsetParent !== null ? back : visibleEntry())?.focus();
  }, [open]);

  const onKeyDown = (event: KeyboardEvent) => {
    // Dialogs opened from the panel are portalled: their Escape is theirs.
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    if (!panelRef.current?.contains(event.target as Node)) return;
    event.preventDefault();
    closeNeo();
  };

  let body;
  if (view === 'history' && !locked) body = <NeoHistory />;
  else if (view === 'report') body = <NeoReports />;
  else if (view === 'summaries') body = <NeoSummaries locked={locked} />;
  else body = <NeoChat quota={quota} locked={locked} inputRef={inputRef} />;

  return (
    <AppShell.Aside
      id={NEO_PANEL_ID}
      className={classes.aside}
      aria-labelledby={TITLE_ID}
      inert={!open}
      data-open={open || undefined}
    >
      <div ref={panelRef} className={classes.panel} tabIndex={-1} onKeyDown={onKeyDown}>
        <header className={classes.head}>
          <span className={classes.headTile}>
            <FaIcon icon="fas fa-robot" />
          </span>
          <span className={classes.headText}>
            <h2 className={classes.headTitle} id={TITLE_ID}>
              Neo
            </h2>
            <span className={classes.headSub}>
              {locked ? 'Erişim kapalı' : 'Yapay zekâ asistanı'}
            </span>
          </span>
          <span className={classes.headActions}>
            <HeadButton
              label="Günlük Özetler"
              icon="fas fa-newspaper"
              active={view === 'summaries'}
              onClick={() => toggleNeoView('summaries')}
            />
            <HeadButton
              label="Hata / Öneri Bildir"
              icon="fas fa-bug"
              active={view === 'report'}
              onClick={() => toggleNeoView('report')}
            />
            {!locked && (
              <>
                <HeadButton
                  label="Sohbet Geçmişi"
                  icon="fas fa-clock-rotate-left"
                  active={view === 'history'}
                  onClick={() => toggleNeoView('history')}
                />
                <HeadButton
                  label="Yeni Sohbet"
                  icon="fas fa-plus"
                  onClick={() => {
                    startNewChat();
                    inputRef.current?.focus();
                  }}
                />
              </>
            )}
            <HeadButton label="Kapat" icon="fas fa-xmark" onClick={closeNeo} />
          </span>
        </header>
        {body}
      </div>
    </AppShell.Aside>
  );
}

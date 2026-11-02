import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { groupMembersQueryOptions } from '@/api/reference/users';
import { FaIcon } from '../FaIcon';
import classes from './RichText.module.css';

/** A preview cannot be scrolled (it takes no pointer events), so it is trimmed. */
const PREVIEW_LIMIT = 12;
const MARGIN = 8;

export interface GroupMembersPopoverProps {
  /** What the popover points at: a group badge, or a row of the @ list. */
  anchor: HTMLElement;
  group: { id: number | string; name: string };
  /** 'side' stands beside `avoid` (the @ list) instead of covering it. */
  placement?: 'below' | 'side';
  avoid?: HTMLElement | null;
  /** Display only: no pointer events, so it never comes between a click and a row. */
  preview?: boolean;
  onClose: () => void;
}

/**
 * Who a group @mention notifies (legacy utils/mentionGroupPopover.js). Pinned
 * to <body> with fixed positioning: threads live in modals with their own
 * overflow, and the popover follows its badge while they scroll.
 */
export function GroupMembersPopover({
  anchor,
  group,
  placement = 'below',
  avoid,
  preview = false,
  onClose,
}: GroupMembersPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const members = useQuery(groupMembersQueryOptions(group.id));

  const reposition = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (!anchor.isConnected) {
      onClose(); // the thread re-rendered under it
      return;
    }
    const rect = anchor.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      onClose(); // the badge scrolled out of sight
      return;
    }
    const { offsetWidth: width, offsetHeight: height } = el;
    let left: number;
    let top: number;
    if (placement === 'side') {
      // Beside the whole list, not below the row: below would cover the
      // suggestions the reader is still choosing between.
      const box = (avoid ?? anchor).getBoundingClientRect();
      if (box.right + 8 + width <= window.innerWidth - MARGIN) left = box.right + 8;
      else if (box.left - width - 8 >= MARGIN) left = box.left - width - 8;
      else left = Math.max(MARGIN, window.innerWidth - width - MARGIN);
      top = rect.top;
    } else {
      left = rect.left;
      top = rect.bottom + 6;
      if (top + height > window.innerHeight - MARGIN) {
        const above = rect.top - height - 6;
        top = above >= MARGIN ? above : window.innerHeight - height - MARGIN;
      }
    }
    left = Math.max(MARGIN, Math.min(left, window.innerWidth - width - MARGIN));
    top = Math.max(MARGIN, Math.min(top, window.innerHeight - height - MARGIN));
    setPosition((prev) =>
      prev && prev.left === Math.round(left) && prev.top === Math.round(top)
        ? prev
        : { left: Math.round(left), top: Math.round(top) },
    );
  }, [anchor, avoid, placement, onClose]);

  // Measure again whenever the body changes height (loading → list).
  useLayoutEffect(reposition, [reposition, members.data, members.isError]);

  useEffect(() => {
    // A scroll on an element does not bubble, so every scrollable ancestor of
    // the anchor gets its own listener.
    const scrollers: (HTMLElement | Window)[] = [window];
    for (let node = anchor.parentElement; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (/auto|scroll|overlay/.test(style.overflowY + style.overflowX)) scrollers.push(node);
    }
    scrollers.forEach((target) => target.addEventListener('scroll', reposition, { passive: true }));
    window.addEventListener('resize', reposition);
    return () => {
      scrollers.forEach((target) => target.removeEventListener('scroll', reposition));
      window.removeEventListener('resize', reposition);
    };
  }, [anchor, reposition]);

  useEffect(() => {
    if (preview) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (ref.current?.contains(target) || anchor.contains(target)) return;
      onClose();
    };
    // Capture, and stopped here: Escape closes the popover, not the modal under it.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [anchor, onClose, preview]);

  const list = members.data?.members ?? [];
  const shown = preview ? list.slice(0, PREVIEW_LIMIT) : list;
  const rest = list.length - shown.length;

  let body;
  if (members.isPending) body = <div className={classes.popoverNote}>Yükleniyor…</div>;
  else if (members.isError)
    body = <div className={classes.popoverNote}>Grup üyeleri alınamadı.</div>;
  else if (!list.length) {
    body = (
      <div className={classes.popoverNote}>
        Bu grupta aktif üye yok — bahsetme kimseye bildirim göndermez.
      </div>
    );
  } else {
    body = (
      <>
        <ul className={classes.popoverList}>
          {shown.map((member) => (
            <li key={member.username}>
              <span className={classes.popoverName}>{member.full_name || member.username}</span>
              {member.position ? (
                <span className={classes.popoverPosition}>{member.position}</span>
              ) : null}
            </li>
          ))}
        </ul>
        {rest > 0 ? <div className={classes.popoverNote}>…ve {rest} kişi daha</div> : null}
        <div className={classes.popoverFoot}>{list.length} üye bildirim alır</div>
      </>
    );
  }

  return createPortal(
    <div
      ref={ref}
      className={classes.popover}
      data-preview={preview || undefined}
      role={preview ? undefined : 'dialog'}
      aria-label={`${group.name} grubunun üyeleri`}
      style={{ left: position?.left ?? -9999, top: position?.top ?? -9999 }}
    >
      <div className={classes.popoverHead}>
        <FaIcon icon="fas fa-users" />
        <span>{members.data?.name || group.name}</span>
      </div>
      {body}
    </div>,
    document.body,
  );
}

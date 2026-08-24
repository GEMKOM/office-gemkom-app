/**
 * Member list for a group @mention badge.
 *
 * A group mention ("@Satın Alma") notifies everyone in the group, but the badge
 * alone does not say who that is — so people could not tell whether the right
 * person had been told. Clicking a badge answers that.
 *
 * One delegated listener on `document` serves every rich-text surface. That is
 * deliberate: group badges are rendered by utils/richText.js, which is used by
 * the topic-discussion component, the project-tracking copy of it, the
 * department-task consultation panel, QC reviews and offer comments. Wiring
 * each of them separately is how the mention code drifted apart in the first
 * place.
 *
 * The member list comes from the same UserGroup.get_members() the server
 * notifies, so the popover can never show an audience the notifications did
 * not use.
 */

import { escapeHtml } from './text.js';
import { fetchUserGroupMembers } from '../apis/users.js';

const POPOVER_ID = 'mention-group-popover';

/** groupId → Promise of the group payload. Memberships barely change within a
 *  page visit, and one badge is often clicked repeatedly. */
const memberCache = new Map();

let installed = false;
let openForGroupId = null;
let anchor = null;
let anchorScrollers = [];

function loadMembers(groupId) {
    if (!memberCache.has(groupId)) {
        memberCache.set(groupId, fetchUserGroupMembers(groupId).catch((error) => {
            memberCache.delete(groupId);   // a failure must not be cached
            throw error;
        }));
    }
    return memberCache.get(groupId);
}

function closePopover() {
    document.getElementById(POPOVER_ID)?.remove();
    openForGroupId = null;
    anchor = null;
    anchorScrollers.forEach((target) => target.removeEventListener('scroll', reposition));
    anchorScrollers = [];
}

/**
 * Keep the popover glued to its badge while the thread scrolls.
 *
 * A listener on window is not enough, and neither is a capture listener there:
 * a scroll on an element does not bubble, and Chrome does not route it up to
 * window/document capture handlers either. These threads scroll inside a modal
 * body, so the popover would be left stranded next to nothing. Every scrollable
 * ancestor of the badge therefore gets its own listener, dropped again on close.
 */
function reposition() {
    const el = document.getElementById(POPOVER_ID);
    if (!el || !anchor) return;
    if (!anchor.isConnected) {
        closePopover();          // the thread re-rendered under it
        return;
    }
    const rect = anchor.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
        closePopover();          // the badge scrolled out of sight
        return;
    }
    positionPopover(el, anchor);
}

function watchAnchorScrollers(badge) {
    anchorScrollers.forEach((target) => target.removeEventListener('scroll', reposition));
    anchorScrollers = [window];
    for (let node = badge.parentElement; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (/auto|scroll|overlay/.test(style.overflowY + style.overflowX)) {
            anchorScrollers.push(node);
        }
    }
    anchorScrollers.forEach((target) =>
        target.addEventListener('scroll', reposition, { passive: true }));
}

function ensurePopover() {
    let el = document.getElementById(POPOVER_ID);
    if (!el) {
        el = document.createElement('div');
        el.id = POPOVER_ID;
        el.className = 'mention-group-popover';
        // Appended to <body> rather than next to the badge: these threads live
        // inside modals with their own overflow and stacking contexts.
        document.body.appendChild(el);
    }
    return el;
}

function positionPopover(el, badge) {
    const rect = badge.getBoundingClientRect();
    // Its width and height come from the CSS box, not from where it sits, so
    // measuring in place is safe — no hide/measure/show flicker while following.
    const { offsetWidth: width, offsetHeight: height } = el;
    const margin = 8;

    let left = rect.left;
    if (left + width > window.innerWidth - margin) left = window.innerWidth - width - margin;
    if (left < margin) left = margin;

    let top = rect.bottom + 6;
    if (top + height > window.innerHeight - margin) {
        const above = rect.top - height - 6;
        if (above >= margin) top = above;
        else top = Math.max(margin, window.innerHeight - height - margin);
    }

    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
}

function renderBody(groupName, inner) {
    return `
        <div class="mention-group-popover-header">
            <i class="fas fa-users" aria-hidden="true"></i>
            <span>${escapeHtml(groupName)}</span>
        </div>
        ${inner}
    `;
}

function renderMembers(group) {
    const members = group.members || [];
    if (!members.length) {
        return `<div class="mention-group-popover-empty">Bu grupta aktif üye yok — bahsetme kimseye bildirim göndermez.</div>`;
    }
    const rows = members.map((member) => `
        <li>
            <span class="mention-group-member-name">${escapeHtml(member.full_name || member.username)}</span>
            ${member.position ? `<span class="mention-group-member-position">${escapeHtml(member.position)}</span>` : ''}
        </li>
    `).join('');
    return `
        <ul class="mention-group-popover-list">${rows}</ul>
        <div class="mention-group-popover-footer">${members.length} üye bildirim alır</div>
    `;
}

async function openPopover(badge) {
    const groupId = badge.dataset.groupId;
    const groupName = badge.dataset.groupName || '';
    if (!groupId) return;

    const el = ensurePopover();
    el.innerHTML = renderBody(groupName, '<div class="mention-group-popover-empty">Yükleniyor…</div>');
    openForGroupId = groupId;
    anchor = badge;
    positionPopover(el, badge);
    watchAnchorScrollers(badge);

    try {
        const group = await loadMembers(groupId);
        if (openForGroupId !== groupId) return;   // a different badge won the race
        el.innerHTML = renderBody(group.name || groupName, renderMembers(group));
    } catch (error) {
        console.error('Grup üyeleri alınamadı:', error);
        if (openForGroupId !== groupId) return;
        el.innerHTML = renderBody(groupName, '<div class="mention-group-popover-empty">Grup üyeleri alınamadı.</div>');
    }
    positionPopover(el, badge);   // the body just changed height
}

function handleActivate(badge) {
    // Compare the badge, not the group id: the same group can be mentioned
    // twice in one thread, and clicking the second badge should move the
    // popover there rather than close it.
    if (anchor === badge) {
        closePopover();
        return;
    }
    openPopover(badge);
}

/** Idempotent — richText.js calls this every time it renders a group badge. */
export function installGroupMentionPopover() {
    if (installed) return;
    installed = true;

    document.addEventListener('click', (event) => {
        const badge = event.target.closest?.('.mention-badge-group');
        if (badge) {
            event.preventDefault();
            event.stopPropagation();
            handleActivate(badge);
            return;
        }
        if (!event.target.closest?.(`#${POPOVER_ID}`)) closePopover();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closePopover();
            return;
        }
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const badge = event.target.closest?.('.mention-badge-group');
        if (badge) {
            event.preventDefault();
            handleActivate(badge);
        }
    });

    // A resize can change where the popover fits without moving the badge.
    window.addEventListener('resize', reposition);

    // A discussion usually sits in a modal, and a popover pinned to <body>
    // would outlive it.
    document.addEventListener('hide.bs.modal', closePopover, true);
}

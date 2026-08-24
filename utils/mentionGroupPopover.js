/**
 * Member list for a group @mention.
 *
 * A group mention ("@Satın Alma") notifies everyone in the group, but the name
 * alone does not say who that is. This answers it in both directions:
 *
 *   - reading a thread, clicking a group badge shows who was told;
 *   - writing one, highlighting a group in the @mention dropdown shows who you
 *     are about to tell, *before* you pick it.
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
let placement = 'below';
let avoidElement = null;

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
    avoidElement = null;
    placement = 'below';
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
    positionPopover(el);
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

function positionPopover(el) {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    // Its width and height come from the CSS box, not from where it sits, so
    // measuring in place is safe — no hide/measure/show flicker while following.
    const { offsetWidth: width, offsetHeight: height } = el;
    const margin = 8;
    let left;
    let top;

    if (placement === 'side') {
        // Beside the whole dropdown, not below the row: below would cover the
        // suggestions the reader is still choosing between.
        const avoid = (avoidElement || anchor).getBoundingClientRect();
        if (avoid.right + 8 + width <= window.innerWidth - margin) left = avoid.right + 8;
        else if (avoid.left - width - 8 >= margin) left = avoid.left - width - 8;
        else left = Math.max(margin, window.innerWidth - width - margin);
        top = rect.top;
    } else {
        left = rect.left;
        top = rect.bottom + 6;
        if (top + height > window.innerHeight - margin) {
            const above = rect.top - height - 6;
            top = above >= margin ? above : window.innerHeight - height - margin;
        }
    }

    if (left + width > window.innerWidth - margin) left = window.innerWidth - width - margin;
    if (left < margin) left = margin;
    if (top + height > window.innerHeight - margin) top = window.innerHeight - height - margin;
    if (top < margin) top = margin;

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

/** A preview cannot be scrolled (it takes no pointer events), so it is trimmed
 *  rather than left to overflow out of reach. */
const PREVIEW_LIMIT = 12;

function renderMembers(group, { preview = false } = {}) {
    const members = group.members || [];
    if (!members.length) {
        return `<div class="mention-group-popover-empty">Bu grupta aktif üye yok — bahsetme kimseye bildirim göndermez.</div>`;
    }
    const shown = preview ? members.slice(0, PREVIEW_LIMIT) : members;
    const rows = shown.map((member) => `
        <li>
            <span class="mention-group-member-name">${escapeHtml(member.full_name || member.username)}</span>
            ${member.position ? `<span class="mention-group-member-position">${escapeHtml(member.position)}</span>` : ''}
        </li>
    `).join('');
    const rest = members.length - shown.length;
    return `
        <ul class="mention-group-popover-list">${rows}</ul>
        ${rest > 0 ? `<div class="mention-group-popover-empty">…ve ${rest} kişi daha</div>` : ''}
        <div class="mention-group-popover-footer">${members.length} üye bildirim alır</div>
    `;
}

/**
 * Show a group's members next to `anchorElement`.
 *
 * @param {HTMLElement} anchorElement  what the popover points at
 * @param {{id: (number|string), name: string}} group
 * @param {object} [options]
 * @param {'below'|'side'} [options.placement='below'] 'side' clears a dropdown
 *        instead of covering it
 * @param {HTMLElement} [options.avoid]  the box a 'side' placement steps around
 * @param {boolean} [options.preview=false] display only — no pointer events, so
 *        it can never come between a click and the row being clicked
 */
export async function showGroupMembers(anchorElement, group, options = {}) {
    const groupId = group?.id;
    const groupName = group?.name || '';
    if (!anchorElement || groupId === undefined || groupId === null || groupId === '') return;

    const el = ensurePopover();
    el.classList.toggle('mention-group-popover-preview', !!options.preview);
    el.innerHTML = renderBody(groupName, '<div class="mention-group-popover-empty">Yükleniyor…</div>');
    openForGroupId = String(groupId);
    anchor = anchorElement;
    placement = options.placement || 'below';
    avoidElement = options.avoid || null;
    positionPopover(el);
    watchAnchorScrollers(anchorElement);

    try {
        const loaded = await loadMembers(groupId);
        if (openForGroupId !== String(groupId)) return;   // another one won the race
        el.innerHTML = renderBody(loaded.name || groupName, renderMembers(loaded, { preview: options.preview }));
    } catch (error) {
        console.error('Grup üyeleri alınamadı:', error);
        if (openForGroupId !== String(groupId)) return;
        el.innerHTML = renderBody(groupName, '<div class="mention-group-popover-empty">Grup üyeleri alınamadı.</div>');
    }
    positionPopover(el);   // the body just changed height
}

/** Close whatever is open. Safe to call when nothing is. */
export function hideGroupMembers() {
    closePopover();
}

function handleActivate(badge) {
    // Compare the badge, not the group id: the same group can be mentioned
    // twice in one thread, and clicking the second badge should move the
    // popover there rather than close it.
    if (anchor === badge) {
        closePopover();
        return;
    }
    showGroupMembers(badge, { id: badge.dataset.groupId, name: badge.dataset.groupName });
}

/** Idempotent — richText.js calls this every time it renders a group badge. */
export function installGroupMentionPopover() {
    if (installed) return;
    installed = true;

    document.addEventListener('click', (event) => {
        const badge = event.target.closest?.('.mention-badge-group');
        // Inside an editor the badge is something being written, not read:
        // clicking it has to place the caret, not open a member list.
        if (badge && !badge.closest('.rte-surface')) {
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
        if (badge && !badge.closest('.rte-surface')) {
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

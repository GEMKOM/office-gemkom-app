/**
 * WYSIWYG editor for the comment/discussion text boxes.
 *
 * What you type is what the comment will look like: bold reads as bold while
 * you write it, not as `**kalın**`. Word's model, in other words.
 *
 * The storage format does not change, and that is the whole design.
 * utils/richText.js explains why the stored text has to stay markdown-lite:
 * e-mail (`send_plain_email`), Telegram and any CSV/API consumer read the
 * stored text, and `!!acil!!` still reads as urgency to a human where a pile of
 * HTML tags would not. So this module is a *view*:
 *
 *   markdown-lite ──renderRichText()──▶ contenteditable surface  (what you see)
 *   markdown-lite ◀──serializeToMarkdown()── contenteditable surface
 *
 * The original <textarea> is never removed — it is hidden behind the surface
 * and re-filled with the serialized markdown on every keystroke. Every caller
 * still reads `textarea.value`, EditModal still validates it, and nothing
 * downstream knows an editor is there. That is deliberate: it means a bug in
 * here can make the surface look wrong, but it cannot invent a value that the
 * rest of the app would not have accepted.
 *
 * The markers still work if you type them — "**kalın**" turns bold as you close
 * it — because years of comments were written that way, and the "?" button
 * still lists them. The `</>` button shows the raw markdown for anyone who
 * wants it.
 *
 * The @mention autocomplete lives here too, so one call sets a box up:
 *
 *     import { attachRichTextEditor } from '../../utils/richTextEditor.js';
 *     attachRichTextEditor(document.getElementById('new-comment-text'));
 *
 * Styles live in the global style.css, next to .mention-badge, so no page has
 * to add a stylesheet link to get one.
 */

import { fetchAllUsers, fetchTeams } from '../apis/users.js';
import { renderRichText, RICH_TEXT_HINT } from './richText.js';
import { getUserInitials, getAvatarColor } from './avatar.js';
import { escapeHtml } from './text.js';
import { showGroupMembers, hideGroupMembers } from './mentionGroupPopover.js';

/**
 * One toolbar button. `command` runs through execCommand (native undo, native
 * "toggle the typing state" behaviour); `wrap` is one of our own inline marks,
 * which execCommand has no concept of.
 */
const TOOLBAR = [
    { id: 'bold', icon: 'fa-bold', label: 'Kalın', command: 'bold', key: 'b' },
    { id: 'italic', icon: 'fa-italic', label: 'İtalik', command: 'italic', key: 'i' },
    { id: 'strike', icon: 'fa-strikethrough', label: 'Üstü çizili', command: 'strikeThrough' },
    { id: 'code', icon: 'fa-code', label: 'Kod', wrap: 'code' },
    { separator: true },
    { id: 'critical', icon: 'fa-triangle-exclamation', label: 'Kritik (kırmızı)', wrap: 'critical', className: 'rte-btn-critical' },
    { id: 'positive', icon: 'fa-circle-check', label: 'Olumlu (yeşil)', wrap: 'positive', className: 'rte-btn-positive' },
    { separator: true },
    { id: 'ul', icon: 'fa-list-ul', label: 'Madde listesi', command: 'insertUnorderedList' },
    { id: 'ol', icon: 'fa-list-ol', label: 'Numaralı liste', command: 'insertOrderedList' },
    { separator: true },
    { id: 'mention', icon: 'fa-at', label: 'Kişi veya grup etiketle' },
];

/** How our own marks are drawn in the surface and read back out of it. */
const WRAPS = {
    code: { tag: 'code', className: '', marker: '`' },
    critical: { tag: 'span', className: 'rt-critical', marker: '!!' },
    positive: { tag: 'span', className: 'rt-positive', marker: '++' },
};

/**
 * Typed markers that turn into formatting the moment they are closed. Each
 * pattern must match the marker run *exactly* — anything it needs for context
 * goes in a lookbehind, because match[0].length is what gets replaced.
 */
const AUTOFORMAT = [
    { re: /\*\*(?=\S)([^\n]*?\S)\*\*$/, wrap: 'bold' },
    { re: /~~(?=\S)([^\n]*?\S)~~$/, wrap: 'strike' },
    { re: /!!(?=\S)([^\n]*?\S)!!$/, wrap: 'critical' },
    { re: /\+\+(?=\S)([^\n]*?\S)\+\+$/, wrap: 'positive' },
    { re: /`([^`\n]+)`$/, wrap: 'code' },
    // Italic last, and it refuses to hug another asterisk, so "**kalın**" is
    // never mistaken for it and "*** dikkat" stays as typed.
    { re: /(?<![*\p{L}\p{N}])\*(?=[^\s*])([^*\n]*?[^\s*])\*$/u, wrap: 'italic' },
];

/** The element each auto-formatted marker becomes. */
const ELEMENT_FOR_WRAP = {
    bold: () => document.createElement('b'),
    italic: () => document.createElement('i'),
    strike: () => document.createElement('s'),
    code: () => document.createElement('code'),
    critical: () => withClass('span', 'rt-critical'),
    positive: () => withClass('span', 'rt-positive'),
};

function withClass(tag, className) {
    const element = document.createElement(tag);
    element.className = className;
    return element;
}

const INLINE_MARKERS = {
    B: '**', STRONG: '**',
    I: '*', EM: '*',
    S: '~~', STRIKE: '~~', DEL: '~~',
    CODE: '`',
};

/** Room a group preview needs beside the dropdown: its width plus a margin. */
const PREVIEW_CLEARANCE = 240;

const BLOCK_TAGS = new Set(['DIV', 'P', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

// ---------------------------------------------------------------------------
// Surface → markdown-lite
// ---------------------------------------------------------------------------

/** A badge is one thing, so it reads back as the token it was built from. */
function mentionToken(el) {
    return el.dataset.mention
        || el.dataset.groupName
        || el.textContent.replace(/^\s*@/, '').trim();
}

function inlineText(node) {
    if (node.nodeType === Node.TEXT_NODE) {
        // ZWSP is the caret holder an empty mark leaves behind; NBSP comes from
        // the browser's own editing and from the space after a mention badge.
        // Neither belongs in the stored text.
        return node.nodeValue
            .replace(/\u200B/g, '')
            .replace(/\u00A0/g, ' ');
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const el = node;
    if (el.tagName === 'BR') return '\n';
    if (el.classList.contains('mention-badge')) return `@${mentionToken(el)}`;
    if (el.tagName === 'A') return el.getAttribute('href') || el.textContent;

    const inner = [...el.childNodes].map(inlineText).join('');
    if (!inner.trim()) return inner;

    let marker = INLINE_MARKERS[el.tagName] || null;
    if (el.classList.contains('rt-critical')) marker = '!!';
    else if (el.classList.contains('rt-positive')) marker = '++';
    // The browser writes styles rather than tags in some paths.
    else if (!marker) {
        const style = el.style || {};
        const weight = style.fontWeight;
        if (weight === 'bold' || Number(weight) >= 600) marker = '**';
        else if (style.fontStyle === 'italic') marker = '*';
        else if ((style.textDecoration || '').includes('line-through')) marker = '~~';
    }
    if (!marker) return inner;

    // A marker has to hug non-space or renderRichText leaves it literal, so any
    // whitespace the selection swept up is pushed back outside.
    const lead = inner.match(/^\s*/)[0];
    const tail = inner.match(/\s*$/)[0];
    const core = inner.slice(lead.length, inner.length - tail.length);
    return `${lead}${marker}${core}${marker}${tail}`;
}

function blockText(node) {
    let out = '';
    for (const child of node.childNodes) {
        if (child.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(child.tagName)) {
            if (out && !out.endsWith('\n')) out += '\n';
            if (child.tagName === 'UL' || child.tagName === 'OL') {
                let index = 0;
                for (const item of child.children) {
                    if (item.tagName !== 'LI') continue;
                    index += 1;
                    const bullet = child.tagName === 'OL' ? `${index}. ` : '- ';
                    out += bullet + blockText(item).trim() + '\n';
                }
                continue;
            }
            // An empty line is <div><br></div> in Chrome: its inner text is a
            // lone newline, and the block boundary below supplies that already.
            out += `${blockText(child).replace(/\n$/, '')}\n`;
            continue;
        }
        out += inlineText(child);
    }
    return out;
}

/**
 * Read a contenteditable surface back as the markdown-lite that gets stored.
 * Exported for the round-trip tests — it is the half that can lose data.
 */
export function serializeToMarkdown(root) {
    return blockText(root)
        .replace(/[ \t]+$/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/^\n+|\n+$/g, '');
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

function currentRange(surface) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    return surface.contains(range.commonAncestorContainer) ? range : null;
}

/** With nothing selected, act on the word under the caret — as Word does. */
function expandToWord(range) {
    if (!range.collapsed) return range;
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return range;
    const value = node.nodeValue;
    const word = /[\p{L}\p{N}_]/u;
    let from = range.startOffset;
    let to = range.startOffset;
    while (from > 0 && word.test(value[from - 1])) from -= 1;
    while (to < value.length && word.test(value[to])) to += 1;
    if (from === to) return range;
    const expanded = document.createRange();
    expanded.setStart(node, from);
    expanded.setEnd(node, to);
    return expanded;
}

/** Is the caret/selection already inside one of our own marks? */
function enclosingWrap(range, kind) {
    const { tag, className } = WRAPS[kind];
    let node = range.commonAncestorContainer;
    while (node && node !== document) {
        if (node.nodeType === Node.ELEMENT_NODE) {
            const matches = className
                ? node.classList?.contains(className)
                : node.tagName === tag.toUpperCase();
            if (matches) return node;
        }
        node = node.parentNode;
    }
    return null;
}

/**
 * Replace an inline mark with its own text.
 *
 * Not through execCommand: `insertHTML` over a selected <span class="rt-…">
 * deletes the contents and puts the new text straight back *inside* the same
 * span, so the mark survives and the button does nothing. Plain DOM surgery is
 * the only thing that actually removes it. The cost is that this one operation
 * is not on the browser's undo stack.
 */
function unwrapElement(element) {
    const text = document.createTextNode(element.textContent);
    element.replaceWith(text);
    const range = document.createRange();
    range.setStart(text, text.nodeValue.length);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}

/** Is the caret sitting at the very start of a text node? */
function caretAtLineStart() {
    const selection = window.getSelection();
    return !!selection?.isCollapsed
        && selection.anchorNode?.nodeType === Node.TEXT_NODE
        && selection.anchorOffset === 0;
}

/**
 * Undo the caret jump the list commands make.
 *
 * insertUnorderedList re-parents the line into a fresh <li> and leaves the
 * caret at offset 0 of it, so the next thing typed lands in front of the line
 * instead of after it. Only the exact symptom is corrected — the caret ending
 * up at the start of a list item it was not at the start of — so a deliberate
 * caret-at-line-start, or a command run on an empty new line, is left alone.
 */
function fixListCaret(wasAtLineStart) {
    if (wasAtLineStart || !caretAtLineStart()) return;
    const selection = window.getSelection();
    const node = selection.anchorNode;
    if (!node.parentElement?.closest('li')) return;
    const range = document.createRange();
    range.setStart(node, node.nodeValue.length);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
}

/**
 * Toggle one of our own marks. execCommand knows bold and italic; it has never
 * heard of "kritik", so these are built by hand — see applyAutoFormat for why
 * insertHTML cannot be trusted with them.
 */
function toggleWrap(surface, kind) {
    surface.focus();
    const range = currentRange(surface);
    if (!range) return;

    const existing = enclosingWrap(range, kind);
    if (existing) {
        unwrapElement(existing);
        return;
    }

    const target = expandToWord(range);
    const text = target.toString();
    const element = ELEMENT_FOR_WRAP[kind]();

    if (!text.trim()) {
        // Nothing to wrap: leave an empty mark with the caret inside it, so the
        // next keystrokes land in the formatting — the way a Word toggle does.
        element.textContent = '\u200B';
        target.insertNode(element);
        caretInside(element);
        return;
    }

    element.textContent = text;
    target.deleteContents();
    target.insertNode(element);
    // The caret stays *inside* the new mark, matching what the native bold
    // command does — and it is what lets the same button switch the mark off.
    caretInside(element);
}

function caretInside(element) {
    if (!element.firstChild) return;
    const range = document.createRange();
    range.setStart(element.firstChild, element.firstChild.nodeValue.length);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}

/**
 * Turn a marker the user just finished typing into real formatting.
 * Returns true if something was converted.
 */
function applyAutoFormat(surface) {
    const selection = window.getSelection();
    if (!selection || !selection.isCollapsed || selection.rangeCount === 0) return false;
    const node = selection.anchorNode;
    if (!node || node.nodeType !== Node.TEXT_NODE || !surface.contains(node)) return false;
    // Inside a code span the markers are content, not syntax.
    if (node.parentElement?.closest('code')) return false;

    const caret = selection.anchorOffset;
    const before = node.nodeValue.slice(0, caret);
    for (const { re, wrap } of AUTOFORMAT) {
        const match = before.match(re);
        if (!match || !match[1]) continue;

        // Built by hand rather than with execCommand('insertHTML'): inserting
        // into a block Chrome has just created makes it "normalise" the markup
        // and replace <span class="rt-critical"> with a <span style="font-size">
        // of its own, silently dropping the formatting.
        const start = caret - match[0].length;
        node.deleteData(start, match[0].length);
        const element = ELEMENT_FOR_WRAP[wrap]();
        element.textContent = match[1];
        node.after(element);
        if (start < node.nodeValue.length) {
            // The marker sat mid-text; keep what followed it after the element.
            const tail = node.splitText(start);
            element.after(tail);
        }
        caretAfter(element);
        return true;
    }
    return false;
}

/**
 * Park the caret outside an element that was just inserted.
 *
 * Chrome keeps typing inside the new element otherwise — the rest of the
 * sentence would come out bold — and a Range positioned after it is not enough,
 * because the caret still resolves to the inner context. A zero-width space is
 * the only thing it will step out onto. It never reaches the stored value: the
 * serializer strips it, and Backspace treats it as part of the character before
 * it (see the keydown handler).
 */
function caretAfter(element) {
    const spacer = document.createTextNode('\u200B');
    element.after(spacer);
    const range = document.createRange();
    range.setStart(spacer, 1);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

function buildToolbar() {
    const bar = document.createElement('div');
    bar.className = 'rte-toolbar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Metin biçimlendirme');

    const makeButton = (item) => {
        const button = document.createElement('button');
        button.type = 'button';          // inside a <form> a bare button submits it
        button.className = `rte-btn ${item.className || ''}`.trim();
        button.dataset.action = item.id;
        button.title = item.key ? `${item.label} (Ctrl+${item.key.toUpperCase()})` : item.label;
        button.setAttribute('aria-label', item.label);
        button.tabIndex = -1;            // the toolbar itself is the tab stop
        button.innerHTML = `<i class="fas ${item.icon}" aria-hidden="true"></i>`;
        return button;
    };

    TOOLBAR.forEach((item) => {
        if (item.separator) {
            const sep = document.createElement('span');
            sep.className = 'rte-sep';
            sep.setAttribute('aria-hidden', 'true');
            bar.appendChild(sep);
            return;
        }
        bar.appendChild(makeButton(item));
    });

    bar.appendChild(Object.assign(document.createElement('span'), { className: 'rte-spacer' }));

    const source = makeButton({ id: 'source', icon: 'fa-file-code', label: 'Ham metni göster' });
    source.setAttribute('aria-pressed', 'false');
    bar.appendChild(source);

    const help = makeButton({ id: 'help', icon: 'fa-question', label: 'Yazım kısayolları' });
    help.title = `Yazarken de biçimlendirebilirsiniz:\n${RICH_TEXT_HINT}`;
    bar.appendChild(help);

    // One tab stop for the whole toolbar, arrows move within it (ARIA toolbar
    // pattern) — a dozen extra tab stops in front of every comment box would be
    // worse for keyboard users than no toolbar at all.
    const buttons = () => [...bar.querySelectorAll('.rte-btn')];
    buttons()[0].tabIndex = 0;
    bar.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
        const all = buttons();
        const index = all.indexOf(document.activeElement);
        if (index === -1) return;
        event.preventDefault();
        const step = event.key === 'ArrowRight' ? 1 : -1;
        const target = all[(index + step + all.length) % all.length];
        all.forEach((button) => { button.tabIndex = -1; });
        target.tabIndex = 0;
        target.focus();
    });

    // Keep the selection: a click would otherwise blur the surface first and
    // there would be nothing left to format.
    bar.addEventListener('mousedown', (event) => {
        if (event.target.closest('.rte-btn')) event.preventDefault();
    });

    return bar;
}

// ---------------------------------------------------------------------------
// @mention autocomplete
// ---------------------------------------------------------------------------

/**
 * A mention is built as a node, not as HTML.
 *
 * `contenteditable="false"` makes it one object: it is selected, dragged and
 * deleted whole, so a badge can never end up half-edited into a token the
 * server will not recognise.
 */
function buildUserBadge(username, fullName) {
    const badge = withClass('span', 'mention-badge');
    badge.contentEditable = 'false';
    badge.dataset.mention = username;
    badge.textContent = `@${fullName || username}`;
    return badge;
}

function buildGroupBadge(name) {
    const badge = withClass('span', 'mention-badge mention-badge-group');
    badge.contentEditable = 'false';
    badge.dataset.groupName = name;
    const icon = withClass('i', 'fas fa-users');
    icon.setAttribute('aria-hidden', 'true');
    badge.append(icon, ` @${name}`);
    return badge;
}

function setupMentions(surface, container) {
    let allUsers = [];
    let allGroups = [];
    let selectedIndex = -1;
    let anchor = null;
    let visible = [];
    let previewTimer = null;

    (async () => {
        try {
            const [users, groups] = await Promise.all([fetchAllUsers(), fetchTeams()]);
            allUsers = users || [];
            allGroups = groups || [];
        } catch (error) {
            console.error('Error loading mention data:', error);
        }
    })();

    /**
     * Show the members of the highlighted group before it is picked.
     *
     * Tagging a group notifies everyone in it, and the row only says how many
     * that is — this says who. Debounced, because the dropdown is rebuilt on
     * every keystroke and a popover that reopened per character would strobe.
     */
    const previewGroup = () => {
        clearTimeout(previewTimer);
        const mention = visible[selectedIndex];
        if (!mention || mention.type !== 'group' || mention.id === undefined || !previewFits()) {
            hideGroupMembers();
            return;
        }
        previewTimer = setTimeout(() => {
            const row = container.querySelector(`.mention-suggestion-item[data-index="${selectedIndex}"]`);
            if (!row) return;
            showGroupMembers(row, { id: mention.id, name: mention.token }, {
                placement: 'side',
                avoid: container,
                preview: true,
            });
        }, 140);
    };

    /**
     * Only preview where the popover can stand clear of the dropdown.
     *
     * On a phone neither side has the room, and a preview laid over the list
     * would hide the very choices it is meant to inform. The row still carries
     * the member count there, and the badge can be opened once it is inserted.
     */
    const previewFits = () => {
        const box = container.getBoundingClientRect();
        return (window.innerWidth - box.right) >= PREVIEW_CLEARANCE
            || box.left >= PREVIEW_CLEARANCE;
    };

    const hide = () => {
        clearTimeout(previewTimer);
        hideGroupMembers();
        container.style.display = 'none';
        selectedIndex = -1;
        anchor = null;
        visible = [];
    };

    /** The "@query" immediately before the caret, if there is one. */
    const queryAtCaret = () => {
        const selection = window.getSelection();
        if (!selection || !selection.isCollapsed || selection.rangeCount === 0) return null;
        const node = selection.anchorNode;
        if (!node || node.nodeType !== Node.TEXT_NODE || !surface.contains(node)) return null;
        const before = node.nodeValue.slice(0, selection.anchorOffset);
        // \p{L} rather than \w: JS's \w is ASCII, so "@Satın" used to kill the
        // dropdown one letter into the name.
        const match = before.match(/@([\p{L}\p{N}_-]*)$/u);
        if (!match) return null;
        return {
            node,
            start: selection.anchorOffset - match[0].length,
            end: selection.anchorOffset,
            query: match[1].toLowerCase(),
        };
    };

    const insert = (mention) => {
        if (!anchor) return;
        const range = document.createRange();
        range.setStart(anchor.node, anchor.start);
        range.setEnd(anchor.node, Math.min(anchor.end, anchor.node.nodeValue.length));
        range.deleteContents();
        const badge = mention.type === 'group'
            ? buildGroupBadge(mention.token)
            : buildUserBadge(mention.token, mention.fullName);
        range.insertNode(badge);
        // A non-breaking space, or the browser collapses it away and there is
        // nowhere outside the badge for the caret to land.
        const spacer = document.createTextNode('\u00A0');
        badge.after(spacer);
        const after = document.createRange();
        after.setStart(spacer, 1);
        after.collapse(true);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(after);
        hide();
        surface.dispatchEvent(new Event('input', { bubbles: true }));
    };

    const render = (mentions) => {
        container.innerHTML = mentions.map((mention, index) => {
            const fullName = mention.fullName || mention.token;
            const badge = mention.type === 'group'
                ? '<span class="status-badge status-blue ms-2" style="font-size: 10px;">Grup</span>'
                : '';
            // The count comes free with the group list; the names behind it
            // arrive in the preview popover when the row is highlighted.
            const size = mention.type === 'group' && Number.isFinite(mention.memberCount)
                ? ` · ${mention.memberCount} kişi`
                : '';
            return `
                <div class="mention-suggestion-item ${index === 0 ? 'selected' : ''}" data-index="${index}"
                     style="cursor: pointer; padding: 8px 12px; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid #e1e5e9;">
                    <div style="width: 24px; height: 24px; border-radius: 50%; background: ${getAvatarColor(fullName)}; color: white; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 600;">
                        ${escapeHtml(getUserInitials(fullName))}
                    </div>
                    <div>
                        <div style="font-weight: 500; color: #172b4d; font-size: 14px;">${escapeHtml(fullName)}${badge}</div>
                        <div style="font-size: 12px; color: #6c757d;">@${escapeHtml(mention.token)}${size}</div>
                    </div>
                </div>
            `;
        }).join('');
        container.style.display = 'block';
        selectedIndex = 0;
        visible = mentions;
        previewGroup();

        container.querySelectorAll('.mention-suggestion-item').forEach((item, index) => {
            item.addEventListener('mousedown', (event) => {
                event.preventDefault();      // do not blur the surface
                insert(mentions[index]);
            });
            item.addEventListener('mouseenter', () => {
                selectedIndex = index;
                container.querySelectorAll('.mention-suggestion-item')
                    .forEach((el, i) => el.classList.toggle('selected', i === index));
                previewGroup();
            });
        });
    };

    const refresh = () => {
        anchor = queryAtCaret();
        if (!anchor) {
            hide();
            return;
        }
        const { query } = anchor;
        const users = allUsers
            .filter((user) => {
                const username = (user.username || '').toLowerCase();
                const fullName = (user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || '').toLowerCase();
                return username.includes(query) || fullName.includes(query);
            })
            .map((user) => ({ type: 'user', token: user.username || '', fullName: user.full_name || user.username || '' }))
            .filter((item) => item.token);
        const groups = allGroups
            .filter((group) => {
                const name = (group.name || group.value || '').toLowerCase();
                const label = (group.display_name || group.label || name || '').toLowerCase();
                return name.includes(query) || label.includes(query);
            })
            .map((group) => ({
                type: 'group',
                id: group.id,
                token: group.name || group.value || '',
                fullName: group.display_name || group.label || group.name || '',
                memberCount: group.member_count,
            }))
            .filter((item) => item.token);

        const filtered = [...users, ...groups].slice(0, 10);
        if (filtered.length) render(filtered);
        else hide();
    };

    surface.addEventListener('input', refresh);
    surface.addEventListener('keyup', (event) => {
        if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) refresh();
    });

    surface.addEventListener('keydown', (event) => {
        if (container.style.display === 'none') return;
        const items = container.querySelectorAll('.mention-suggestion-item');
        if (!items.length) return;
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, 0);
        } else if ((event.key === 'Enter' || event.key === 'Tab') && selectedIndex >= 0) {
            event.preventDefault();
            insert(visible[selectedIndex]);
            return;
        } else if (event.key === 'Escape') {
            hide();
            return;
        }
        items.forEach((item, index) => item.classList.toggle('selected', index === selectedIndex));
        previewGroup();
    });

    document.addEventListener('click', (event) => {
        if (surface.contains(event.target) || container.contains(event.target)) return;
        // The toolbar's @ button is what opens this list; counting its own
        // click as an outside click would close it again in the same tick.
        if (event.target.closest?.('.rte-toolbar')) return;
        hide();
    });

    return { refresh, hide };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Turn a textarea into a WYSIWYG editor.
 *
 * The textarea stays in the DOM, hidden, holding the markdown-lite value —
 * callers keep reading `.value` and never see the difference. Idempotent, so it
 * is safe to call on a re-rendered form.
 *
 * @param {HTMLTextAreaElement} textarea
 * @param {object} [options]
 * @param {boolean} [options.mentions=true] wire @mention suggestions
 * @param {Array} [options.mentionedUsers] resolves @username to a full name in
 *        content that already exists (an edit form)
 * @param {Array} [options.mentionedGroups] same, for group badges
 * @returns {HTMLElement|null} the wrapper element, or null if it was a no-op
 */
export function attachRichTextEditor(textarea, options = {}) {
    if (!textarea || textarea.dataset.rteAttached === '1') return null;
    const { mentions = true, mentionedUsers, mentionedGroups } = options;
    textarea.dataset.rteAttached = '1';

    // Tags, not inline styles, so the serializer reads <b> rather than a
    // style="font-weight:700" it has to sniff.
    try { document.execCommand('styleWithCSS', false, false); } catch { /* older engines */ }

    const parent = textarea.parentNode;
    const host = document.createElement('div');
    host.className = 'rte';
    parent.insertBefore(host, textarea);

    host.appendChild(buildToolbar());

    const surface = document.createElement('div');
    surface.className = 'rte-surface form-control';
    surface.contentEditable = 'true';
    surface.setAttribute('role', 'textbox');
    surface.setAttribute('aria-multiline', 'true');
    if (textarea.getAttribute('placeholder')) {
        surface.dataset.placeholder = textarea.getAttribute('placeholder');
    }
    if (textarea.rows) surface.style.minHeight = `${Math.max(3, textarea.rows) * 1.5}em`;
    surface.innerHTML = renderRichText(textarea.value, { mentionedUsers, mentionedGroups });
    surface.querySelectorAll('.mention-badge').forEach((badge) => {
        badge.setAttribute('contenteditable', 'false');
    });
    host.appendChild(surface);

    textarea.hidden = true;
    textarea.setAttribute('aria-hidden', 'true');
    host.appendChild(textarea);

    const syncValue = () => {
        const markdown = serializeToMarkdown(surface);
        if (textarea.value !== markdown) {
            textarea.value = markdown;
            // EditModal validates on the textarea's own input event.
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
        host.classList.toggle('rte-empty', markdown.trim() === '');
    };
    syncValue();

    let mentionApi = null;
    if (mentions) {
        // The suggestion list is absolutely positioned against .rte, so an
        // existing one has to come inside the wrapper.
        let container = parent.querySelector(':scope > .mention-suggestions');
        if (!container) {
            container = document.createElement('div');
            container.className = 'mention-suggestions';
        }
        container.style.display = 'none';
        host.appendChild(container);
        mentionApi = setupMentions(surface, container);
    }

    // Auto-formatting has to happen *after* the input event it reacts to.
    // Chrome ignores an execCommand issued from inside an input handler — the
    // range gets deleted and nothing is inserted in its place, which silently
    // ate the text the marker was wrapping. A task boundary fixes it; the guard
    // stops the edit it makes from scheduling another pass on itself.
    let formatting = false;
    surface.addEventListener('input', () => {
        syncValue();
        if (formatting) return;
        setTimeout(() => {
            formatting = true;
            try {
                if (applyAutoFormat(surface)) syncValue();
            } finally {
                formatting = false;
            }
        }, 0);
    });

    // The zero-width spacer that lets the caret leave a formatted run must not
    // cost a keystroke: without this, one Backspace appears to do nothing.
    surface.addEventListener('keydown', (event) => {
        if (event.key !== 'Backspace') return;
        const selection = window.getSelection();
        if (!selection?.isCollapsed) return;
        const node = selection.anchorNode;
        if (node?.nodeType !== Node.TEXT_NODE) return;
        const offset = selection.anchorOffset;
        if (offset === 0 || node.nodeValue[offset - 1] !== '\u200B') return;
        node.deleteData(offset - 1, 1);   // then let Backspace hit the real character
    });

    // Paste goes out through our own serializer and back in through the
    // renderer, so nothing from Word or another page survives as markup — the
    // round trip is the sanitiser.
    surface.addEventListener('paste', (event) => {
        event.preventDefault();
        const data = event.clipboardData;
        if (!data) return;
        const html = data.getData('text/html');
        let markdown;
        if (html) {
            const scratch = document.createElement('div');
            scratch.innerHTML = html;
            markdown = serializeToMarkdown(scratch);
        } else {
            markdown = data.getData('text/plain');
        }
        if (!markdown) return;
        const range = currentRange(surface);
        if (!range) return;
        range.deleteContents();
        // The HTML is our renderer's own output, so it carries only the tags
        // this editor understands — that is what makes the round trip a
        // sanitiser rather than a hole.
        const fragment = range.createContextualFragment(renderRichText(markdown));
        const last = fragment.lastChild;
        range.insertNode(fragment);
        if (last) caretAfter(last);
        syncValue();
    });

    host.addEventListener('click', (event) => {
        const button = event.target.closest('.rte-btn');
        if (!button) return;
        event.preventDefault();
        const action = button.dataset.action;
        if (action === 'help') return;                  // the tooltip is the help
        if (action === 'source') {
            toggleSource(host, surface, textarea, button, { mentionedUsers, mentionedGroups });
            return;
        }
        const item = TOOLBAR.find((entry) => entry.id === action);
        surface.focus();
        if (item?.command) {
            const wasAtLineStart = caretAtLineStart();
            document.execCommand(item.command, false, null);
            fixListCaret(wasAtLineStart);
        } else if (item?.wrap) {
            toggleWrap(surface, item.wrap);
        } else if (action === 'mention') {
            document.execCommand('insertText', false, '@');
            mentionApi?.refresh();
        }
        syncValue();
        updateButtonStates(host, surface);
    });

    installSelectionWatcher();

    return host;
}

/**
 * Keep the toolbar in step with wherever the caret is.
 *
 * One listener for the whole document, not one per editor: comment boxes are
 * re-attached on every list re-render, and a per-instance selectionchange
 * handler would pile up against surfaces that no longer exist.
 */
let selectionWatcherInstalled = false;

function installSelectionWatcher() {
    if (selectionWatcherInstalled) return;
    selectionWatcherInstalled = true;
    document.addEventListener('selectionchange', () => {
        const node = document.getSelection()?.anchorNode;
        const surface = (node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement)
            ?.closest?.('.rte-surface');
        if (surface) updateButtonStates(surface.closest('.rte'), surface);
    });
}

/** Light up the buttons that apply where the caret is, the way Word does. */
function updateButtonStates(host, surface) {
    if (!surface.isConnected) return;
    const range = currentRange(surface);
    host.querySelectorAll('.rte-btn').forEach((button) => {
        const item = TOOLBAR.find((entry) => entry.id === button.dataset.action);
        if (!item) return;
        let active = false;
        if (item.command && range) {
            try { active = document.queryCommandState(item.command); } catch { active = false; }
        } else if (item.wrap && range) {
            active = !!enclosingWrap(range, item.wrap);
        }
        button.classList.toggle('active', active);
    });
}

/** Show the markdown that will actually be stored — the escape hatch. */
function toggleSource(host, surface, textarea, button, renderOptions) {
    const showingSource = surface.hidden;
    if (showingSource) {
        surface.innerHTML = renderRichText(textarea.value, renderOptions);
        surface.querySelectorAll('.mention-badge').forEach((badge) => {
            badge.setAttribute('contenteditable', 'false');
        });
    }
    surface.hidden = !showingSource;
    textarea.hidden = showingSource;
    // Whichever one is on screen is the real control for a screen reader.
    textarea.setAttribute('aria-hidden', String(showingSource));
    surface.setAttribute('aria-hidden', String(!showingSource));
    button.setAttribute('aria-pressed', String(!showingSource));
    button.classList.toggle('active', !showingSource);
    button.title = showingSource ? 'Ham metni göster' : 'Biçimlendirilmiş görünüme dön';
    (showingSource ? surface : textarea).focus();
}

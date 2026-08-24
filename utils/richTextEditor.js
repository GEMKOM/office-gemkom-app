/**
 * Toolbar for the comment/discussion text boxes.
 *
 * The stored text stays markdown-lite — see utils/richText.js for why that
 * matters (e-mail, Telegram and CSV consumers read the stored text, not HTML).
 * So every button here does one thing: put the same markers a user could have
 * typed into the textarea. Nothing about the storage format changes; only
 * discovering it does. The syntax line these buttons replace
 * ("**kalın** *italik* ~~çizili~~ …") is still true, just no longer the only
 * way in — it survives behind the "?" button.
 *
 * The @mention autocomplete lives here too. It is an editor concern, and
 * keeping it next to the toolbar means one `attachRichTextEditor(textarea)`
 * sets up a comment box completely. It had drifted into two near-identical
 * copies (the topic-discussion component and the project-tracking page), which
 * is how the Turkish-letter bug in the suggestion filter survived in one of
 * them after being fixed in the other.
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

/**
 * One toolbar button. `marker` wraps the selection; `list` prefixes whole
 * lines. Titles carry the keyboard shortcut where there is one — this is the
 * only place a user finds out about it.
 */
const TOOLBAR = [
    { id: 'bold', icon: 'fa-bold', label: 'Kalın', marker: '**', key: 'b' },
    { id: 'italic', icon: 'fa-italic', label: 'İtalik', marker: '*', key: 'i' },
    { id: 'strike', icon: 'fa-strikethrough', label: 'Üstü çizili', marker: '~~' },
    { id: 'code', icon: 'fa-code', label: 'Kod', marker: '`' },
    { separator: true },
    { id: 'critical', icon: 'fa-triangle-exclamation', label: 'Kritik (kırmızı)', marker: '!!', className: 'rte-btn-critical' },
    { id: 'positive', icon: 'fa-circle-check', label: 'Olumlu (yeşil)', marker: '++', className: 'rte-btn-positive' },
    { separator: true },
    { id: 'ul', icon: 'fa-list-ul', label: 'Madde listesi', list: 'bullet' },
    { id: 'ol', icon: 'fa-list-ol', label: 'Numaralı liste', list: 'ordered' },
    { separator: true },
    { id: 'mention', icon: 'fa-at', label: 'Kişi veya grup etiketle' },
];

const WORD_CHAR = /[\p{L}\p{N}_]/u;
const BULLET_RE = /^\s*[-*]\s+/;
const NUMBER_RE = /^\s*\d+[.)]\s+/;

// ---------------------------------------------------------------------------
// Text manipulation
// ---------------------------------------------------------------------------

/**
 * Replace [start, end) and leave the caret where `selectStart`/`selectEnd` say.
 *
 * Goes through execCommand because that is what keeps the browser's own undo
 * stack intact — assigning to `textarea.value` wipes it, and people do reach
 * for Ctrl+Z straight after hitting a formatting button. It is deprecated but
 * still the only way to edit a textarea undoably, so there is a plain fallback.
 */
function replaceRange(textarea, start, end, text, selectStart, selectEnd) {
    textarea.focus();
    textarea.setSelectionRange(start, end);

    let handled = false;
    if (text !== '') {
        try {
            handled = document.execCommand('insertText', false, text);
        } catch {
            handled = false;
        }
    }
    if (!handled) {
        const value = textarea.value;
        textarea.value = value.slice(0, start) + text + value.slice(end);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    textarea.setSelectionRange(selectStart, selectEnd);
}

/** With nothing selected, act on the word under the caret — as Word does. */
function expandToWord(value, start, end) {
    if (start !== end) return [start, end];
    let from = start;
    let to = end;
    while (from > 0 && WORD_CHAR.test(value[from - 1])) from -= 1;
    while (to < value.length && WORD_CHAR.test(value[to])) to += 1;
    return [from, to];
}

/** Markers have to hug non-space or the renderer leaves them literal, so a
 *  selection that swept up a trailing space is pulled back in. */
function trimRange(value, start, end) {
    let from = start;
    let to = end;
    while (from < to && /\s/.test(value[from])) from += 1;
    while (to > from && /\s/.test(value[to - 1])) to -= 1;
    return [from, to];
}

function toggleInline(textarea, marker) {
    const value = textarea.value;
    const [wordStart, wordEnd] = expandToWord(value, textarea.selectionStart, textarea.selectionEnd);
    const [start, end] = trimRange(value, wordStart, wordEnd);
    const len = marker.length;

    if (start === end) {
        // Nothing to wrap: drop the pair in and park the caret between them so
        // whatever is typed next lands inside the emphasis.
        const at = textarea.selectionStart;
        replaceRange(textarea, at, at, marker + marker, at + len, at + len);
        return;
    }

    const inside = value.slice(start, end);

    // Already formatted → unformat, whether the markers are inside the
    // selection or just outside it.
    if (inside.length > 2 * len && inside.startsWith(marker) && inside.endsWith(marker)) {
        const bare = inside.slice(len, -len);
        replaceRange(textarea, start, end, bare, start, start + bare.length);
        return;
    }
    if (value.slice(start - len, start) === marker && value.slice(end, end + len) === marker) {
        replaceRange(textarea, start - len, end + len, inside, start - len, start - len + inside.length);
        return;
    }

    replaceRange(textarea, start, end, marker + inside + marker, start + len, start + len + inside.length);
}

function toggleList(textarea, kind) {
    const ordered = kind === 'ordered';
    const value = textarea.value;
    const start = value.lastIndexOf('\n', textarea.selectionStart - 1) + 1;
    let end = value.indexOf('\n', textarea.selectionEnd);
    if (end === -1) end = value.length;

    const lines = value.slice(start, end).split('\n');
    const marked = ordered ? NUMBER_RE : BULLET_RE;
    const filled = lines.filter((line) => line.trim());
    const allMarked = filled.length > 0 && filled.every((line) => marked.test(line));

    let counter = 0;
    const next = lines.map((line) => {
        if (!line.trim()) return line;
        const bare = line.replace(BULLET_RE, '').replace(NUMBER_RE, '');
        if (allMarked) return bare;
        counter += 1;
        return ordered ? `${counter}. ${bare}` : `- ${bare}`;
    }).join('\n');

    replaceRange(textarea, start, end, next, start, start + next.length);
}

/** Type the `@` for the user and let the suggestion list open itself. */
function insertMentionTrigger(textarea) {
    const at = textarea.selectionStart;
    const needsSpace = at > 0 && !/\s/.test(textarea.value[at - 1]);
    const text = needsSpace ? ' @' : '@';
    replaceRange(textarea, at, textarea.selectionEnd, text, at + text.length, at + text.length);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

function buildToolbar({ preview }) {
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

    const right = document.createElement('span');
    right.className = 'rte-spacer';
    bar.appendChild(right);

    if (preview) {
        const previewButton = makeButton({
            id: 'preview', icon: 'fa-eye', label: 'Önizleme',
        });
        previewButton.setAttribute('aria-pressed', 'false');
        bar.appendChild(previewButton);
    }

    const help = makeButton({ id: 'help', icon: 'fa-question', label: 'Yazım kısayolları' });
    help.title = `Doğrudan da yazabilirsiniz:\n${RICH_TEXT_HINT}`;
    bar.appendChild(help);

    // One tab stop for the whole toolbar, arrows move within it (ARIA toolbar
    // pattern) — ten extra tab stops in front of every comment box would be
    // worse than no toolbar at all for keyboard users.
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

    // Keep the selection: a click would otherwise blur the textarea first and
    // there would be nothing left to format.
    bar.addEventListener('mousedown', (event) => {
        if (event.target.closest('.rte-btn')) event.preventDefault();
    });

    return bar;
}

function applyAction(action, textarea, host) {
    const item = TOOLBAR.find((entry) => entry.id === action);
    if (item?.marker) {
        toggleInline(textarea, item.marker);
        return;
    }
    if (item?.list) {
        toggleList(textarea, item.list);
        return;
    }
    if (action === 'mention') {
        insertMentionTrigger(textarea);
        return;
    }
    if (action === 'preview') {
        togglePreview(host, textarea);
    }
}

function togglePreview(host, textarea) {
    const previewEl = host.querySelector('.rte-preview');
    const button = host.querySelector('[data-action="preview"]');
    const showing = previewEl.hidden;

    if (showing) {
        // Group badges need server data to resolve, which a draft has not been
        // through yet; a draft preview shows the person/group tags as typed.
        previewEl.innerHTML = renderRichText(textarea.value)
            || '<span class="text-muted">Önizlenecek bir şey yok.</span>';
        previewEl.style.minHeight = `${textarea.offsetHeight}px`;
    }

    previewEl.hidden = !showing;
    textarea.hidden = showing;
    button.setAttribute('aria-pressed', String(showing));
    button.classList.toggle('active', showing);
    button.title = showing ? 'Düzenlemeye dön' : 'Önizleme';
    button.querySelector('i').className = `fas ${showing ? 'fa-pen' : 'fa-eye'}`;
    if (!showing) textarea.focus();
}

// ---------------------------------------------------------------------------
// @mention autocomplete
// ---------------------------------------------------------------------------

/**
 * Wire @mention suggestions onto a textarea.
 *
 * Exported because it predates the toolbar and is still the whole feature for
 * a caller that only wants mentions; `attachRichTextEditor` calls it for you.
 */
export function initializeMentionFunctionality(textarea, mentionSuggestionsContainer) {
    let allUsers = [];
    let allGroups = [];
    let mentionStartPos = -1;
    let selectedSuggestionIndex = -1;

    (async () => {
        try {
            const [users, groups] = await Promise.all([fetchAllUsers(), fetchTeams()]);
            allUsers = users || [];
            allGroups = groups || [];
        } catch (error) {
            console.error('Error loading mention data:', error);
        }
    })();

    const hideMentionSuggestions = () => {
        mentionSuggestionsContainer.style.display = 'none';
        selectedSuggestionIndex = -1;
    };

    const insertMention = (mentionToken) => {
        const text = textarea.value;
        const beforeMention = text.substring(0, mentionStartPos);
        const afterMention = text.substring(textarea.selectionStart);
        textarea.value = `${beforeMention}@${mentionToken} ${afterMention}`;
        const newCursorPos = mentionStartPos + mentionToken.length + 2;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
        textarea.focus();
    };

    const renderMentionSuggestions = (mentions) => {
        mentionSuggestionsContainer.innerHTML = mentions.map((mention, index) => {
            const token = mention.token || '';
            const fullName = mention.fullName || token;
            const initials = getUserInitials(fullName);
            const avatarColor = getAvatarColor(fullName);
            const badge = mention.type === 'group'
                ? '<span class="status-badge status-blue ms-2" style="font-size: 10px;">Grup</span>'
                : '';
            return `
                <div class="mention-suggestion-item ${index === 0 ? 'selected' : ''}"
                     data-token="${escapeHtml(token)}"
                     style="cursor: pointer; padding: 8px 12px; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid #e1e5e9;">
                    <div style="width: 24px; height: 24px; border-radius: 50%; background: ${avatarColor}; color: white; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 600;">
                        ${escapeHtml(initials)}
                    </div>
                    <div>
                        <div style="font-weight: 500; color: #172b4d; font-size: 14px;">${escapeHtml(fullName)}${badge}</div>
                        <div style="font-size: 12px; color: #6c757d;">@${escapeHtml(token)}</div>
                    </div>
                </div>
            `;
        }).join('');
        mentionSuggestionsContainer.style.display = 'block';

        mentionSuggestionsContainer.querySelectorAll('.mention-suggestion-item').forEach((item, index) => {
            item.addEventListener('click', () => {
                insertMention(item.dataset.token);
                hideMentionSuggestions();
            });
            item.addEventListener('mouseenter', () => {
                selectedSuggestionIndex = index;
                mentionSuggestionsContainer.querySelectorAll('.mention-suggestion-item').forEach((el, i) => {
                    el.classList.toggle('selected', i === index);
                });
            });
        });
    };

    textarea.addEventListener('input', (e) => {
        const text = e.target.value;
        const cursorPos = e.target.selectionStart;
        // \p{L} rather than \w: JS's \w is ASCII, so "@Satın" used to kill the
        // dropdown one letter into the name.
        const mentionMatch = text.substring(0, cursorPos).match(/@([\p{L}\p{N}_-]*)$/u);
        if (!mentionMatch) {
            hideMentionSuggestions();
            return;
        }
        const query = mentionMatch[1].toLowerCase();
        mentionStartPos = cursorPos - query.length - 1;
        const filteredUsers = allUsers
            .filter((user) => {
                const username = (user.username || '').toLowerCase();
                const fullName = (user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || '').toLowerCase();
                return username.includes(query) || fullName.includes(query);
            })
            .map((user) => ({
                type: 'user',
                token: user.username || '',
                fullName: user.full_name || user.username || ''
            }))
            .filter((item) => item.token);
        const filteredGroups = allGroups
            .filter((group) => {
                const groupName = (group.name || group.value || '').toLowerCase();
                const displayName = (group.display_name || group.label || groupName || '').toLowerCase();
                return groupName.includes(query) || displayName.includes(query);
            })
            .map((group) => ({
                type: 'group',
                token: group.name || group.value || '',
                fullName: group.display_name || group.label || group.name || ''
            }))
            .filter((item) => item.token);
        const filtered = [...filteredUsers, ...filteredGroups].slice(0, 10);
        if (filtered.length) {
            renderMentionSuggestions(filtered);
        } else {
            hideMentionSuggestions();
        }
    });

    textarea.addEventListener('keydown', (e) => {
        if (mentionSuggestionsContainer.style.display === 'none') return;
        const items = mentionSuggestionsContainer.querySelectorAll('.mention-suggestion-item');
        if (!items.length) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedSuggestionIndex = Math.min(selectedSuggestionIndex + 1, items.length - 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, 0);
        } else if ((e.key === 'Enter' || e.key === 'Tab') && selectedSuggestionIndex >= 0) {
            e.preventDefault();
            insertMention(items[selectedSuggestionIndex].dataset.token);
            hideMentionSuggestions();
        } else if (e.key === 'Escape') {
            hideMentionSuggestions();
        }
        items.forEach((item, index) => item.classList.toggle('selected', index === selectedSuggestionIndex));
    });

    document.addEventListener('click', (e) => {
        if (textarea.contains(e.target) || mentionSuggestionsContainer.contains(e.target)) return;
        // The toolbar's @ button is what opens this list; counting its own
        // click as an outside click would close it again in the same tick.
        if (e.target.closest?.('.rte-toolbar')) return;
        hideMentionSuggestions();
    });
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Give a textarea a formatting toolbar, a preview, and @mention suggestions.
 *
 * Idempotent, so it is safe to call on a re-rendered form. Any
 * `.mention-suggestions` element already sitting next to the textarea is
 * adopted rather than duplicated.
 *
 * @param {HTMLTextAreaElement} textarea
 * @param {object} [options]
 * @param {boolean} [options.mentions=true] wire @mention suggestions
 * @param {boolean} [options.preview=true]  offer a preview toggle
 * @returns {HTMLElement|null} the wrapper element, or null if it was a no-op
 */
export function attachRichTextEditor(textarea, options = {}) {
    if (!textarea || textarea.dataset.rteAttached === '1') return null;
    const { mentions = true, preview = true } = options;
    textarea.dataset.rteAttached = '1';

    const parent = textarea.parentNode;
    const host = document.createElement('div');
    host.className = 'rte';
    parent.insertBefore(host, textarea);

    host.appendChild(buildToolbar({ preview }));
    host.appendChild(textarea);

    if (preview) {
        const previewEl = document.createElement('div');
        previewEl.className = 'rte-preview rich-text';
        previewEl.hidden = true;
        host.appendChild(previewEl);
    }

    if (mentions) {
        // The suggestion list is absolutely positioned against .rte, so an
        // existing one has to come inside the wrapper with the textarea.
        let suggestions = parent.querySelector(':scope > .mention-suggestions');
        if (!suggestions) {
            suggestions = document.createElement('div');
            suggestions.className = 'mention-suggestions';
        }
        suggestions.style.display = 'none';
        host.appendChild(suggestions);
        initializeMentionFunctionality(textarea, suggestions);
    }

    host.addEventListener('click', (event) => {
        const button = event.target.closest('.rte-btn');
        if (!button) return;
        event.preventDefault();
        if (button.dataset.action === 'help') return;   // the tooltip is the help
        applyAction(button.dataset.action, textarea, host);
    });

    textarea.addEventListener('keydown', (event) => {
        if (!event.ctrlKey && !event.metaKey) return;
        const item = TOOLBAR.find((entry) => entry.key && entry.key === event.key.toLowerCase());
        if (!item) return;
        event.preventDefault();
        toggleInline(textarea, item.marker);
    });

    return host;
}

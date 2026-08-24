/**
 * Markdown-lite rendering for comment and discussion text.
 *
 * Design constraints, in priority order:
 *
 * 1. **Safety.** User content is escaped FIRST, always. Everything after that
 *    works on already-escaped text and only ever adds tags this module wrote
 *    itself, so no markup a user types can survive as markup. Nothing here
 *    accepts raw HTML — there is deliberately no "trusted" path.
 *
 * 2. **The stored text stays the source of truth.** We store exactly what the
 *    user typed; formatting is applied at render time only. That is what lets
 *    formatting survive outside the browser: e-mail (`send_plain_email`),
 *    Telegram and any CSV/API consumer read the stored text and see
 *    `!!acil!!` or `**kalın**`, which reads as emphasis to a human. Storing
 *    HTML instead would leave those consumers with tag soup.
 *
 * 3. **Predictability over completeness.** Every inline marker is
 *    single-line, so a stray `**` can never swallow the rest of a thread.
 *
 * Supported markers:
 *
 *   **kalın**            bold
 *   *italik* / _italik_  italic
 *   ~~üstü çizili~~      strikethrough
 *   `kod`                inline code
 *   !!kritik!!           red   — problems, blockers, urgency
 *   ++olumlu++           green — resolved, approved, confirmed
 *   - madde / 1. madde   lists
 *   http://…             autolinked
 *   @kullanıcı           mention badge
 *   @Grup Adı            group mention badge (click → member list)
 *
 * The two colours are deliberate: red and green are the only ones that carry
 * meaning on their own, and their markers stay legible when the text is read
 * as plain text somewhere else. Adding a colour picker would break that.
 */

import { escapeHtml } from './text.js';

// The group-badge click handler is a DOM concern, so it is not loaded until a
// group badge is actually rendered. One delegated listener serves every
// rich-text surface, which is what keeps the two mention call sites (the
// topic-discussion component and the project-tracking copy) from each needing
// their own wiring.
let groupBadgeInteractionRequested = false;

function installGroupBadgeInteraction() {
    if (groupBadgeInteractionRequested) return;
    groupBadgeInteractionRequested = true;
    import('./mentionGroupPopover.js')
        .then((module) => module.installGroupMentionPopover())
        .catch((error) => {
            groupBadgeInteractionRequested = false;
            console.error('Grup bahsetme açılır listesi yüklenemedi:', error);
        });
}

/** Shown under comment inputs so the syntax is discoverable. Pre-escaped. */
export const RICH_TEXT_HINT_HTML = escapeHtml(
    '**kalın**  *italik*  ~~çizili~~  `kod`  !!kritik!!  ++olumlu++  - liste'
);

// Finished fragments are parked behind these private-use markers so later
// passes cannot reach inside them (a `**` in a URL must stay a `**`).
const PARK_OPEN = '\uE000';
const PARK_CLOSE = '\uE001';
const PARK_PATTERN = new RegExp(`${PARK_OPEN}(\\d+)${PARK_CLOSE}`, 'g');

/** Escape for use as a literal inside a RegExp. `-` is left alone: escaping it
 *  outside a character class is a syntax error in unicode (`u`) mode. */
function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildUserMap(mentionedUsers) {
    const map = {};
    (mentionedUsers || []).forEach((user) => {
        if (user && user.username) map[user.username] = user;
    });
    return map;
}

/** Group consecutive `- ` / `1. ` lines into real lists; join the rest with <br>. */
function renderBlocks(text) {
    const parts = [];
    let list = null;
    let paragraph = [];

    const flushParagraph = () => {
        if (paragraph.length) {
            parts.push(paragraph.join('<br>'));
            paragraph = [];
        }
    };
    const flushList = () => {
        if (list) {
            const items = list.items.map((item) => `<li>${item}</li>`).join('');
            parts.push(`<${list.type}>${items}</${list.type}>`);
            list = null;
        }
    };

    for (const line of text.split('\n')) {
        const bullet = line.match(/^\s*[-*]\s+(.*)$/);
        const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
        const match = bullet || numbered;
        if (match) {
            const type = bullet ? 'ul' : 'ol';
            if (!list || list.type !== type) {
                flushParagraph();
                flushList();
                list = { type, items: [] };
            }
            list.items.push(match[1]);
            continue;
        }
        flushList();
        // A blank line between paragraphs, not inside one, is just spacing.
        if (!line.trim() && !paragraph.length) continue;
        paragraph.push(line);
    }
    flushParagraph();
    flushList();
    return parts.join('');
}

/**
 * Render user-authored text as safe formatted HTML.
 *
 * @param {string} content            what the user typed (never HTML)
 * @param {object} [options]
 * @param {Array}  [options.mentionedUsers] resolves @username to a full name
 * @param {Array}  [options.mentionedGroups] the groups the server found in this
 *        text ([{id, name, slug}]); each becomes one clickable group badge
 * @returns {string} HTML safe to assign to innerHTML
 */
export function renderRichText(content, options = {}) {
    const raw = String(content ?? '');
    if (!raw.trim()) return '';

    const userMap = buildUserMap(options.mentionedUsers);
    const parked = [];
    const park = (html) => `${PARK_OPEN}${parked.push(html) - 1}${PARK_CLOSE}`;

    // Strip any park markers the user typed so none can be forged, then escape.
    let out = escapeHtml(raw.replace(/[\uE000\uE001]/g, ''));

    // Code first: its contents must not be touched by any other marker.
    out = out.replace(/`([^`\n]+)`/g, (_, code) => park(`<code>${code}</code>`));

    // Links next, so `**` or `_` inside a query string stays literal. The URL
    // is already escaped, so it cannot break out of the href; requiring an
    // http(s) scheme keeps `javascript:` out.
    out = out.replace(/\bhttps?:\/\/[^\s<]+/g, (url) => {
        const href = url.replace(/[.,;:!?)\]]+$/, '');     // trailing punctuation
        const tail = url.slice(href.length);
        return park(`<a href="${href}" target="_blank" rel="noopener noreferrer">${href}</a>`) + tail;
    });

    // Inline emphasis. Single-line by construction, and each marker must hug
    // non-space on both sides so "dikkat!! sonra" is left alone.
    out = out
        .replace(/\*\*(?=\S)([^\n]*?\S)\*\*/g, '<strong>$1</strong>')
        .replace(/~~(?=\S)([^\n]*?\S)~~/g, '<s>$1</s>')
        .replace(/!!(?=\S)([^\n]*?\S)!!/g, '<span class="rt-critical">$1</span>')
        .replace(/\+\+(?=\S)([^\n]*?\S)\+\+/g, '<span class="rt-positive">$1</span>')
        // The italic marker also refuses to hug its own character, so a
        // decorative run like "*** dikkat" stays exactly as typed.
        .replace(/(^|[\s(])\*(?=[^\s*])([^*\n]*?[^\s*])\*/g, '$1<em>$2</em>')
        .replace(/(^|[\s(])_(?=[^\s_])([^_\n]*?[^\s_])_/g, '$1<em>$2</em>');

    // Group mentions, before the username scan. A group name carries spaces and
    // Turkish letters ("Satın Alma"), so no token scan can find one — `\w` is
    // ASCII here and would badge "@Sat" and leave "ın Alma" as loose text, which
    // is exactly the bug this pass fixes. The names come from the server, which
    // resolved the same text into the notification audience, so the badge and
    // who actually got notified cannot drift apart. Longest name first, so a
    // group whose name prefixes another cannot cut the longer one short.
    const groups = (options.mentionedGroups || []).filter((group) => group && group.name);
    if (groups.length) {
        installGroupBadgeInteraction();
    }
    for (const group of [...groups].sort((a, b) => b.name.length - a.name.length)) {
        // `out` is already escaped, so the needle has to be escaped the same way.
        const name = escapeRegExp(escapeHtml(group.name));
        const slug = group.slug ? escapeRegExp(escapeHtml(group.slug)) : '';
        const forms = [`\\[group:\\s*(?:${name}${slug ? `|${slug}` : ''})\\s*\\]`, name];
        if (slug) forms.push(slug);
        const pattern = new RegExp(`@(?:${forms.join('|')})(?![\\p{L}\\p{N}_])`, 'giu');
        out = out.replace(pattern, () => park(
            `<span class="mention-badge mention-badge-group" role="button" tabindex="0"`
            + ` data-group-id="${escapeHtml(group.id)}"`
            + ` data-group-name="${escapeHtml(group.name)}"`
            + ` title="Grup — üyeleri görmek için tıklayın">`
            + `<i class="fas fa-users" aria-hidden="true"></i> @${escapeHtml(group.name)}</span>`
        ));
    }

    // Mentions. The display name comes from API data, not from the comment, so
    // it needs escaping of its own.
    out = out.replace(/@(\w+)/g, (match, username) => {
        const user = userMap[username];
        const displayName = user ? (user.full_name || user.username) : username;
        return park(`<span class="mention-badge">@${escapeHtml(displayName)}</span>`);
    });

    out = renderBlocks(out);
    return out.replace(PARK_PATTERN, (_, index) => parked[Number(index)]);
}

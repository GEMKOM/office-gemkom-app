/**
 * Markdown-lite rendering for comment and discussion text. A TypeScript port of
 * the legacy utils/richText.js; the output is byte-for-byte the same, so text
 * written on either side reads the same on the other.
 *
 * Design constraints, in priority order:
 *
 * 1. **Safety.** User content is escaped FIRST, always. Everything after that
 *    works on already-escaped text and only ever adds tags this module wrote
 *    itself, so no markup a user types can survive as markup. Nothing here
 *    accepts raw HTML: there is deliberately no "trusted" path.
 *
 * 2. **The stored text stays the source of truth.** We store exactly what the
 *    user typed; formatting is applied at render time only. E-mail, Telegram
 *    and any CSV/API consumer read the stored text and see `!!acil!!` or
 *    `**kalın**`, which reads as emphasis to a human.
 *
 * 3. **Predictability over completeness.** Every inline marker is single-line,
 *    so a stray `**` can never swallow the rest of a thread.
 *
 * Supported markers:
 *
 *   **kalın**            bold
 *   *italik* / _italik_  italic
 *   ~~üstü çizili~~      strikethrough
 *   `kod`                inline code
 *   !!kritik!!           red: problems, blockers, urgency
 *   ++olumlu++           green: resolved, approved, confirmed
 *   - madde / 1. madde   lists
 *   http://…             autolinked
 *   @kullanıcı           mention badge
 *   @Grup Adı            group mention badge (click: member list)
 */

/** A user the server resolved from an @username in the text. */
export interface MentionedUser {
  username: string;
  full_name?: string;
}

/** A group the server resolved from the text; each becomes one group badge. */
export interface MentionedGroup {
  id: number | string;
  name: string;
  slug?: string;
}

export interface RichTextOptions {
  /** Resolves @username to a full name. */
  mentionedUsers?: readonly (MentionedUser | null | undefined)[] | null;
  /** The groups the server found in this text. */
  mentionedGroups?: readonly (MentionedGroup | null | undefined)[] | null;
}

/**
 * The syntax in one line, for the editor's "?" button. Plain text: escape it
 * at the point of use if it goes into markup.
 */
export const RICH_TEXT_HINT =
  '**kalın**  *italik*  ~~çizili~~  `kod`  !!kritik!!  ++olumlu++  - liste';

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape a value for HTML text or an attribute (all five entities). */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (char) => HTML_ENTITIES[char] ?? char);
}

// Finished fragments are parked behind these private-use markers so later
// passes cannot reach inside them (a `**` in a URL must stay a `**`).
const PARK_OPEN = String.fromCharCode(0xe000);
const PARK_CLOSE = String.fromCharCode(0xe001);
const PARK_MARKERS = new RegExp(`[${PARK_OPEN}${PARK_CLOSE}]`, 'g');
const PARK_PATTERN = new RegExp(`${PARK_OPEN}(\\d+)${PARK_CLOSE}`, 'g');

/** Escape for use as a literal inside a RegExp. `-` is left alone: escaping it
 *  outside a character class is a syntax error in unicode (`u`) mode. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildUserMap(users: RichTextOptions['mentionedUsers']): Map<string, MentionedUser> {
  const map = new Map<string, MentionedUser>();
  for (const user of users ?? []) {
    if (user?.username) map.set(user.username, user);
  }
  return map;
}

/** Group consecutive `- ` / `1. ` lines into real lists; join the rest with <br>. */
function renderBlocks(text: string): string {
  const parts: string[] = [];
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null;
  let paragraph: string[] = [];

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
    const match = bullet ?? numbered;
    if (match) {
      const type = bullet ? 'ul' : 'ol';
      if (!list || list.type !== type) {
        flushParagraph();
        flushList();
        list = { type, items: [] };
      }
      list.items.push(match[1] ?? '');
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
 * @param content what the user typed (never HTML)
 * @returns HTML safe for dangerouslySetInnerHTML
 */
export function renderRichText(content: unknown, options: RichTextOptions = {}): string {
  const raw = String(content ?? '');
  if (!raw.trim()) return '';

  const userMap = buildUserMap(options.mentionedUsers);
  const parked: string[] = [];
  const park = (html: string) => `${PARK_OPEN}${parked.push(html) - 1}${PARK_CLOSE}`;

  // Strip any park markers the user typed so none can be forged, then escape.
  let out = escapeHtml(raw.replace(PARK_MARKERS, ''));

  // Code first: its contents must not be touched by any other marker.
  out = out.replace(/`([^`\n]+)`/g, (_, code: string) => park(`<code>${code}</code>`));

  // Links next, so `**` or `_` inside a query string stays literal. The URL is
  // already escaped, so it cannot break out of the href; requiring an http(s)
  // scheme keeps `javascript:` out.
  out = out.replace(/\bhttps?:\/\/[^\s<]+/g, (url) => {
    const href = url.replace(/[.,;:!?)\]]+$/, ''); // trailing punctuation
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
    // The italic marker also refuses to hug its own character, so a decorative
    // run like "*** dikkat" stays exactly as typed.
    .replace(/(^|[\s(])\*(?=[^\s*])([^*\n]*?[^\s*])\*/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_(?=[^\s_])([^_\n]*?[^\s_])_/g, '$1<em>$2</em>');

  // Group mentions, before the username scan. A group name carries spaces and
  // Turkish letters ("Satın Alma"), so no token scan can find one. The names
  // come from the server, which resolved the same text into the notification
  // audience, so the badge and who got notified cannot drift apart. Longest
  // name first, so a group whose name prefixes another cannot cut it short.
  const groups = (options.mentionedGroups ?? []).filter((group): group is MentionedGroup =>
    Boolean(group?.name),
  );
  for (const group of [...groups].sort((a, b) => b.name.length - a.name.length)) {
    // `out` is already escaped, so the needle has to be escaped the same way.
    const name = escapeRegExp(escapeHtml(group.name));
    const slug = group.slug ? escapeRegExp(escapeHtml(group.slug)) : '';
    const forms = [`\\[group:\\s*(?:${name}${slug ? `|${slug}` : ''})\\s*\\]`, name];
    if (slug) forms.push(slug);
    const pattern = new RegExp(`@(?:${forms.join('|')})(?![\\p{L}\\p{N}_])`, 'giu');
    out = out.replace(pattern, () =>
      park(
        `<span class="mention-badge mention-badge-group" role="button" tabindex="0"` +
          ` data-group-id="${escapeHtml(group.id)}"` +
          ` data-group-name="${escapeHtml(group.name)}"` +
          ` title="Grup — üyeleri görmek için tıklayın">` +
          `<i class="fas fa-users" aria-hidden="true"></i> @${escapeHtml(group.name)}</span>`,
      ),
    );
  }

  // Mentions. The display name comes from API data, not from the comment, so it
  // needs escaping of its own. `data-mention` keeps the username the badge was
  // made from: the editor reads it back to rebuild "@username".
  out = out.replace(/@(\w+)/g, (_, username: string) => {
    const user = userMap.get(username);
    const displayName = user ? user.full_name || user.username : username;
    return park(
      `<span class="mention-badge" data-mention="${escapeHtml(username)}">@${escapeHtml(displayName)}</span>`,
    );
  });

  out = renderBlocks(out);
  return out.replace(PARK_PATTERN, (_, index: string) => parked[Number(index)] ?? '');
}

/**
 * One flowing line for a clamped excerpt (legacy discussions.js plainText).
 * Markers read as noise at that size and line breaks waste the lines a clamp
 * allows. Mentions stay as typed ("@kullanıcı"). Plain text: never HTML.
 */
export function richTextToPlain(text: unknown): string {
  return String(text ?? '')
    .replace(/\*\*(\S[^\n]*?\S|\S)\*\*/g, '$1')
    .replace(/~~(\S[^\n]*?\S|\S)~~/g, '$1')
    .replace(/!!(\S[^\n]*?\S|\S)!!/g, '$1')
    .replace(/\+\+(\S[^\n]*?\S|\S)\+\+/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/@\[group:\s*([^\]]+?)\s*\]/g, '@$1')
    .replace(/^\s*(?:[-*]|\d+[.)])\s+/gm, '• ')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}

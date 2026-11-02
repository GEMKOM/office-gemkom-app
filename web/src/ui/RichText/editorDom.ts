/**
 * The DOM half of RichTextEditor, ported from the legacy utils/richTextEditor.js.
 *
 * The editor is a *view* over markdown-lite: renderRichText() draws the stored
 * text into a contenteditable surface, serializeToMarkdown() reads it back.
 * The stored format never changes (renderRichText.ts explains why), so a bug
 * here can make the surface look wrong but cannot store anything the renderer
 * would not have produced.
 *
 * Everything here works on plain DOM nodes and the window selection: React
 * owns the toolbar and the suggestion list, not the text being edited.
 */

/** Our own inline marks, which execCommand has no concept of. */
export type WrapKind = 'code' | 'critical' | 'positive';
type AutoFormatKind = WrapKind | 'bold' | 'italic' | 'strike';

/** Zero-width space: the caret holder an empty mark or a finished mark leaves behind. */
const ZWSP = String.fromCharCode(0x200b);
/** No-break space: after a mention badge, and from the browser's own editing. */
const NBSP = String.fromCharCode(0xa0);

const WRAPS: Record<WrapKind, { tag: string; className: string }> = {
  code: { tag: 'code', className: '' },
  critical: { tag: 'span', className: 'rt-critical' },
  positive: { tag: 'span', className: 'rt-positive' },
};

/**
 * Typed markers that turn into formatting the moment they are closed. Each
 * pattern must match the marker run *exactly*: anything it needs for context
 * goes in a lookbehind, because match[0].length is what gets replaced.
 */
const AUTOFORMAT: { re: RegExp; wrap: AutoFormatKind }[] = [
  { re: /\*\*(?=\S)([^\n]*?\S)\*\*$/, wrap: 'bold' },
  { re: /~~(?=\S)([^\n]*?\S)~~$/, wrap: 'strike' },
  { re: /!!(?=\S)([^\n]*?\S)!!$/, wrap: 'critical' },
  { re: /\+\+(?=\S)([^\n]*?\S)\+\+$/, wrap: 'positive' },
  { re: /`([^`\n]+)`$/, wrap: 'code' },
  // Italic last, and it refuses to hug another asterisk, so "**kalın**" is
  // never mistaken for it and "*** dikkat" stays as typed.
  { re: /(?<![*\p{L}\p{N}])\*(?=[^\s*])([^*\n]*?[^\s*])\*$/u, wrap: 'italic' },
];

function withClass(tag: string, className: string): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  return element;
}

const ELEMENT_FOR_WRAP: Record<AutoFormatKind, () => HTMLElement> = {
  bold: () => document.createElement('b'),
  italic: () => document.createElement('i'),
  strike: () => document.createElement('s'),
  code: () => document.createElement('code'),
  critical: () => withClass('span', 'rt-critical'),
  positive: () => withClass('span', 'rt-positive'),
};

const INLINE_MARKERS: Record<string, string> = {
  B: '**',
  STRONG: '**',
  I: '*',
  EM: '*',
  S: '~~',
  STRIKE: '~~',
  DEL: '~~',
  CODE: '`',
};

const BLOCK_TAGS = new Set([
  'DIV',
  'P',
  'UL',
  'OL',
  'LI',
  'BLOCKQUOTE',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
]);

// ---------------------------------------------------------------------------
// Surface → markdown-lite
// ---------------------------------------------------------------------------

/** A badge is one thing, so it reads back as the token it was built from. */
function mentionToken(el: HTMLElement): string {
  return (
    el.dataset.mention || el.dataset.groupName || (el.textContent ?? '').replace(/^\s*@/, '').trim()
  );
}

function inlineText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    // ZWSP is the caret holder an empty mark leaves behind; NBSP comes from the
    // browser's own editing and from the space after a mention badge. Neither
    // belongs in the stored text.
    return (node.nodeValue ?? '').replaceAll(ZWSP, '').replaceAll(NBSP, ' ');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as HTMLElement;
  if (el.tagName === 'BR') return '\n';
  if (el.classList.contains('mention-badge')) return `@${mentionToken(el)}`;
  if (el.tagName === 'A') return el.getAttribute('href') || el.textContent || '';

  const inner = [...el.childNodes].map(inlineText).join('');
  if (!inner.trim()) return inner;

  let marker = INLINE_MARKERS[el.tagName] ?? null;
  if (el.classList.contains('rt-critical')) marker = '!!';
  else if (el.classList.contains('rt-positive')) marker = '++';
  // The browser writes styles rather than tags in some paths.
  else if (!marker) {
    const weight = el.style.fontWeight;
    if (weight === 'bold' || Number(weight) >= 600) marker = '**';
    else if (el.style.fontStyle === 'italic') marker = '*';
    else if ((el.style.textDecoration || '').includes('line-through')) marker = '~~';
  }
  if (!marker) return inner;

  // A marker has to hug non-space or the renderer leaves it literal, so any
  // whitespace the selection swept up is pushed back outside.
  const lead = inner.match(/^\s*/)?.[0] ?? '';
  const tail = inner.match(/\s*$/)?.[0] ?? '';
  const core = inner.slice(lead.length, inner.length - tail.length);
  return `${lead}${marker}${core}${marker}${tail}`;
}

function blockText(node: Node): string {
  let out = '';
  for (const child of node.childNodes) {
    if (child.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has((child as Element).tagName)) {
      const el = child as Element;
      if (out && !out.endsWith('\n')) out += '\n';
      if (el.tagName === 'UL' || el.tagName === 'OL') {
        let index = 0;
        for (const item of el.children) {
          if (item.tagName !== 'LI') continue;
          index += 1;
          const bullet = el.tagName === 'OL' ? `${index}. ` : '- ';
          out += `${bullet}${blockText(item).trim()}\n`;
        }
        continue;
      }
      // An empty line is <div><br></div> in Chrome: its inner text is a lone
      // newline, and the block boundary below supplies that already.
      out += `${blockText(el).replace(/\n$/, '')}\n`;
      continue;
    }
    out += inlineText(child);
  }
  return out;
}

/** Read a contenteditable surface back as the markdown-lite that gets stored. */
export function serializeToMarkdown(root: Node): string {
  return blockText(root)
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '');
}

// ---------------------------------------------------------------------------
// Selection helpers
// ---------------------------------------------------------------------------

/** Focus the surface; a no-op when it has focus, so the selection survives. */
export function focusKeepingSelection(surface: HTMLElement) {
  if (document.activeElement !== surface) surface.focus();
}

export function currentRange(surface: HTMLElement): Range | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  return surface.contains(range.commonAncestorContainer) ? range : null;
}

function placeCaret(node: Node, offset: number) {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/** With nothing selected, act on the word under the caret, as Word does. */
function expandToWord(range: Range): Range {
  if (!range.collapsed) return range;
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return range;
  const value = node.nodeValue ?? '';
  const word = /[\p{L}\p{N}_]/u;
  let from = range.startOffset;
  let to = range.startOffset;
  while (from > 0 && word.test(value[from - 1] ?? '')) from -= 1;
  while (to < value.length && word.test(value[to] ?? '')) to += 1;
  if (from === to) return range;
  const expanded = document.createRange();
  expanded.setStart(node, from);
  expanded.setEnd(node, to);
  return expanded;
}

/** Is the caret/selection already inside one of our own marks? */
export function enclosingWrap(range: Range, kind: WrapKind): HTMLElement | null {
  const { tag, className } = WRAPS[kind];
  let node: Node | null = range.commonAncestorContainer;
  while (node && node !== document) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const matches = className
        ? el.classList.contains(className)
        : el.tagName === tag.toUpperCase();
      if (matches) return el;
    }
    node = node.parentNode;
  }
  return null;
}

/**
 * Replace an inline mark with its own text. Not through execCommand:
 * `insertHTML` over a selected <span class="rt-…"> puts the new text straight
 * back inside the same span, so the mark would survive.
 */
function unwrapElement(element: HTMLElement) {
  const text = document.createTextNode(element.textContent ?? '');
  element.replaceWith(text);
  placeCaret(text, text.nodeValue?.length ?? 0);
}

function caretInside(element: HTMLElement) {
  const first = element.firstChild;
  if (first) placeCaret(first, first.nodeValue?.length ?? 0);
}

/**
 * Park the caret outside an element that was just inserted. Chrome keeps
 * typing inside the new element otherwise, and a zero-width space is the only
 * thing it will step out onto. It never reaches the stored value: the
 * serializer strips it, and Backspace treats it as part of the character
 * before it (removeSpacerBeforeCaret).
 */
export function caretAfter(element: Node) {
  const spacer = document.createTextNode(ZWSP);
  (element as ChildNode).after(spacer);
  placeCaret(spacer, 1);
}

/** Is the caret sitting at the very start of a text node? */
export function caretAtLineStart(): boolean {
  const selection = window.getSelection();
  return (
    Boolean(selection?.isCollapsed) &&
    selection?.anchorNode?.nodeType === Node.TEXT_NODE &&
    selection.anchorOffset === 0
  );
}

/**
 * Undo the caret jump the list commands make: insertUnorderedList leaves the
 * caret at offset 0 of the new <li>, so the next keystroke lands in front of
 * the line. Only that exact symptom is corrected.
 */
export function fixListCaret(wasAtLineStart: boolean) {
  if (wasAtLineStart || !caretAtLineStart()) return;
  const node = window.getSelection()?.anchorNode;
  if (!node?.parentElement?.closest('li')) return;
  placeCaret(node, node.nodeValue?.length ?? 0);
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

/**
 * Toggle one of our own marks. execCommand knows bold and italic; it has never
 * heard of "kritik", so these are built by hand.
 */
export function toggleWrap(surface: HTMLElement, kind: WrapKind) {
  focusKeepingSelection(surface);
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
    // next keystrokes land in the formatting, the way a Word toggle does.
    element.textContent = ZWSP;
    target.insertNode(element);
    caretInside(element);
    return;
  }

  element.textContent = text;
  target.deleteContents();
  target.insertNode(element);
  // The caret stays inside the new mark, matching the native bold command,
  // which is what lets the same button switch the mark off again.
  caretInside(element);
}

/**
 * Turn a marker the user just finished typing into real formatting.
 * Returns true if something was converted.
 */
export function applyAutoFormat(surface: HTMLElement): boolean {
  const selection = window.getSelection();
  if (!selection || !selection.isCollapsed || selection.rangeCount === 0) return false;
  const node = selection.anchorNode;
  if (!node || node.nodeType !== Node.TEXT_NODE || !surface.contains(node)) return false;
  // Inside a code span the markers are content, not syntax.
  if (node.parentElement?.closest('code')) return false;

  const text = node as Text;
  const caret = selection.anchorOffset;
  const before = text.data.slice(0, caret);
  for (const { re, wrap } of AUTOFORMAT) {
    const match = before.match(re);
    if (!match?.[1]) continue;

    // Built by hand rather than with execCommand('insertHTML'): Chrome
    // "normalises" inserted markup in a block it has just created and drops
    // the rt-* classes.
    const start = caret - match[0].length;
    text.deleteData(start, match[0].length);
    const element = ELEMENT_FOR_WRAP[wrap]();
    element.textContent = match[1];
    text.after(element);
    if (start < text.data.length) {
      // The marker sat mid-text; keep what followed it after the element.
      element.after(text.splitText(start));
    }
    caretAfter(element);
    return true;
  }
  return false;
}

/**
 * The zero-width spacer that lets the caret leave a formatted run must not
 * cost a keystroke. Call on Backspace; returns true when it removed one, and
 * Backspace then deletes the real character.
 */
export function removeSpacerBeforeCaret(): boolean {
  const selection = window.getSelection();
  if (!selection?.isCollapsed) return false;
  const node = selection.anchorNode;
  if (node?.nodeType !== Node.TEXT_NODE) return false;
  const offset = selection.anchorOffset;
  if (offset === 0 || (node as Text).data[offset - 1] !== ZWSP) return false;
  (node as Text).deleteData(offset - 1, 1);
  return true;
}

/** Run a native editing command; engines without it (jsdom) just do nothing. */
export function runCommand(command: string, value?: string): boolean {
  try {
    return document.execCommand(command, false, value);
  } catch {
    return false;
  }
}

export function commandState(command: string): boolean {
  try {
    return document.queryCommandState(command);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Mentions
// ---------------------------------------------------------------------------

/** Where an "@query" being typed sits, so a pick can replace it. */
export interface MentionAnchor {
  node: Text;
  start: number;
  end: number;
  query: string;
}

/** The "@query" immediately before the caret, if there is one. */
export function mentionQueryAtCaret(surface: HTMLElement): MentionAnchor | null {
  const selection = window.getSelection();
  if (!selection || !selection.isCollapsed || selection.rangeCount === 0) return null;
  const node = selection.anchorNode;
  if (!node || node.nodeType !== Node.TEXT_NODE || !surface.contains(node)) return null;
  const before = (node as Text).data.slice(0, selection.anchorOffset);
  // \p{L} rather than \w: JS's \w is ASCII, so "@Satın" would kill the list
  // one letter into the name.
  const match = before.match(/@([\p{L}\p{N}_-]*)$/u);
  if (!match) return null;
  return {
    node: node as Text,
    start: selection.anchorOffset - match[0].length,
    end: selection.anchorOffset,
    query: (match[1] ?? '').toLocaleLowerCase('tr'),
  };
}

/**
 * A mention is built as a node, not as HTML. `contenteditable="false"` makes it
 * one object: selected, dragged and deleted whole, never half-edited into a
 * token the server will not recognise.
 */
function buildUserBadge(username: string, fullName?: string): HTMLElement {
  const badge = withClass('span', 'mention-badge');
  badge.setAttribute('contenteditable', 'false');
  badge.dataset.mention = username;
  badge.textContent = `@${fullName || username}`;
  return badge;
}

function buildGroupBadge(name: string): HTMLElement {
  const badge = withClass('span', 'mention-badge mention-badge-group');
  badge.setAttribute('contenteditable', 'false');
  badge.dataset.groupName = name;
  const icon = withClass('i', 'fas fa-users');
  icon.setAttribute('aria-hidden', 'true');
  badge.append(icon, ` @${name}`);
  return badge;
}

/** Replace the "@query" at `anchor` with a badge and park the caret after it. */
export function insertMention(
  anchor: MentionAnchor,
  mention: { type: 'user' | 'group'; token: string; fullName?: string },
) {
  const range = document.createRange();
  range.setStart(anchor.node, anchor.start);
  range.setEnd(anchor.node, Math.min(anchor.end, anchor.node.data.length));
  range.deleteContents();
  const badge =
    mention.type === 'group'
      ? buildGroupBadge(mention.token)
      : buildUserBadge(mention.token, mention.fullName);
  range.insertNode(badge);
  // A non-breaking space, or the browser collapses it away and there is
  // nowhere outside the badge for the caret to land.
  const spacer = document.createTextNode(NBSP);
  badge.after(spacer);
  placeCaret(spacer, 1);
}

/** Badges drawn by the renderer become single objects in the surface. */
export function lockBadges(surface: HTMLElement) {
  surface
    .querySelectorAll('.mention-badge')
    .forEach((badge) => badge.setAttribute('contenteditable', 'false'));
}

/** Type `text` at the caret: insertText where the engine has it, by hand where not. */
export function insertTextAtCaret(surface: HTMLElement, text: string) {
  if (runCommand('insertText', text)) return;
  const range = currentRange(surface);
  if (!range) return;
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  placeCaret(node, text.length);
}

/** Insert renderer HTML at the caret (paste), leaving the caret after it. */
export function insertHtmlAtCaret(surface: HTMLElement, html: string): boolean {
  const range = currentRange(surface);
  if (!range) return false;
  range.deleteContents();
  // The HTML is our renderer's own output, so it carries only the tags this
  // editor understands: the round trip is the sanitiser.
  const fragment = range.createContextualFragment(html);
  const last = fragment.lastChild;
  range.insertNode(fragment);
  if (last) caretAfter(last);
  return true;
}

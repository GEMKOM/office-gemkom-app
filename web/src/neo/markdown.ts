// Neo's answers are Markdown written by the model: headings, lists, GFM
// tables, links. The comment renderer (ui/RichText) has none of that, so the
// panel showed tables as raw `| a | b |` text. This parses the subset Neo
// writes into a small tree; NeoMarkdown.tsx turns the tree into React
// elements, so nothing here is ever HTML and nothing needs escaping.
//
// Kept forgiving on purpose: the text arrives in streamed pieces, and a half
// table or an unclosed `**` must read as plain text until the rest comes.

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'br' }
  | { type: 'strong' | 'em' | 'del' | 'critical' | 'positive'; children: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; external: boolean; children: Inline[] }
  | { type: 'job'; jobNo: string };

export type Align = 'left' | 'right' | 'center' | null;

export interface ListItem {
  content: Inline[];
  children: Block[];
}

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3 | 4; content: Inline[] }
  | { type: 'paragraph'; content: Inline[] }
  | { type: 'list'; ordered: boolean; start: number; items: ListItem[] }
  | { type: 'table'; header: Inline[][]; align: Align[]; rows: Inline[][][]; raw: TableText }
  | { type: 'code'; text: string }
  | { type: 'quote'; blocks: Block[] }
  | { type: 'hr' };

/** A table's cells as plain text, for the Excel export. */
export interface TableText {
  header: string[];
  rows: string[][];
}

// ------------------------------------------------------------------ links

/** The app's own origins: a full link to one of them becomes an in-app path. */
const APP_ORIGINS = ['https://ofis.gemcore.com.tr'];

export const JOB_ORDER_PATH = '/projects/project-tracking/';

/** Job-order page for a job number (the daily summary links the same way). */
export function jobOrderHref(jobNo: string): string {
  return `${JOB_ORDER_PATH}?job_no=${encodeURIComponent(jobNo)}`;
}

/**
 * A path that stays on this site. Browsers read "\" as "/", so "/\evil.com"
 * would be protocol-relative and leave the site: no backslash at all, and no
 * control characters (which browsers strip before parsing).
 */
function isAppPath(value: string): boolean {
  return (
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    // eslint-disable-next-line no-control-regex -- control characters are what this rejects
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

/**
 * The href a link may have, or null to show only its text. In-app paths and
 * http(s) URLs pass; javascript:, data:, protocol-relative (also written with
 * backslashes) and anything else do not.
 */
export function safeHref(href: string): { href: string; external: boolean } | null {
  const value = href.trim();
  if (value.startsWith('/')) return isAppPath(value) ? { href: value, external: false } : null;
  if (!/^https?:\/\//i.test(value)) return null;
  for (const origin of APP_ORIGINS) {
    if (value.toLowerCase().startsWith(origin)) {
      const path = value.slice(origin.length) || '/';
      if (path.startsWith('/')) return isAppPath(path) ? { href: path, external: false } : null;
    }
  }
  return { href: value, external: true };
}

// ------------------------------------------------------------------ inline

// Job numbers as GEMKOM writes them: 293-10, 293-14-01, RM269-02, 048-138.
// The look-behind keeps "1.200-150" (amounts) and dates like 2026-11-10 out.
const JOB_SOURCE = String.raw`(?<![\w.,/-])(?:RM)?\d{3}-\d{2,3}(?:-\d{2}){0,2}(?![\w]|-\d)`;

interface Rule {
  re: RegExp;
  build: (m: RegExpExecArray, allowLinks: boolean) => Inline | null;
}

const RULES: Rule[] = [
  { re: /`([^`\n]+)`/y, build: (m) => ({ type: 'code', text: m[1] ?? '' }) },
  {
    re: /\[([^\]\n]+)\]\(([^)\s]+)\)/y,
    build: (m, allowLinks) => {
      const children = parseInline(m[1] ?? '', false);
      const target = allowLinks ? safeHref(m[2] ?? '') : null;
      return target ? { type: 'link', ...target, children } : { type: 'em', children };
    },
  },
  {
    re: /\*\*(?=\S)([^\n]*?\S)\*\*/y,
    build: (m, allowLinks) => ({ type: 'strong', children: parseInline(m[1] ?? '', allowLinks) }),
  },
  {
    re: /__(?=\S)([^\n]*?\S)__(?!\w)/y,
    build: (m, allowLinks) => ({ type: 'strong', children: parseInline(m[1] ?? '', allowLinks) }),
  },
  {
    re: /~~(?=\S)([^\n]*?\S)~~/y,
    build: (m, allowLinks) => ({ type: 'del', children: parseInline(m[1] ?? '', allowLinks) }),
  },
  {
    re: /!!(?=\S)([^\n]*?\S)!!/y,
    build: (m, allowLinks) => ({ type: 'critical', children: parseInline(m[1] ?? '', allowLinks) }),
  },
  {
    re: /\+\+(?=\S)([^\n]*?\S)\+\+/y,
    build: (m, allowLinks) => ({ type: 'positive', children: parseInline(m[1] ?? '', allowLinks) }),
  },
  {
    // "2 * 3 * 4" is arithmetic, not emphasis: the marker hugs the text.
    re: /\*(?=[^\s*])([^*\n]*?[^\s*])\*(?!\*)/y,
    build: (m, allowLinks) => ({ type: 'em', children: parseInline(m[1] ?? '', allowLinks) }),
  },
  {
    re: /(?<!\w)_(?=[^\s_])([^_\n]*?[^\s_])_(?!\w)/y,
    build: (m, allowLinks) => ({ type: 'em', children: parseInline(m[1] ?? '', allowLinks) }),
  },
  {
    re: /https?:\/\/[^\s<>()[\]]+/y,
    build: (m, allowLinks) => {
      // A sentence's full stop or comma is not part of the URL.
      const url = m[0].replace(/[.,;:!?'"]+$/, '');
      m[0] = url;
      const target = allowLinks ? safeHref(url) : null;
      return target
        ? { type: 'link', ...target, children: [{ type: 'text', text: url }] }
        : { type: 'text', text: url };
    },
  },
  {
    re: new RegExp(JOB_SOURCE, 'y'),
    build: (m, allowLinks) => (allowLinks ? { type: 'job', jobNo: m[0] } : null),
  },
];

// Characters that can start a rule; text up to the next one is plain.
const TRIGGER = new RegExp(String.raw`[\x60\[*_~!+h]|${JOB_SOURCE}`, 'g');

function pushText(out: Inline[], text: string) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.type === 'text') last.text += text;
  else out.push({ type: 'text', text });
}

/**
 * Inline Markdown to nodes. `allowLinks` is false inside a link's own text,
 * so links never nest.
 */
export function parseInline(text: string, allowLinks = true): Inline[] {
  const out: Inline[] = [];
  let pos = 0;
  let plainFrom = 0;
  TRIGGER.lastIndex = 0;
  while (pos < text.length) {
    TRIGGER.lastIndex = pos;
    const next = TRIGGER.exec(text);
    if (!next) break;
    pos = next.index;
    let matched = false;
    for (const rule of RULES) {
      rule.re.lastIndex = pos;
      const m = rule.re.exec(text);
      if (!m) continue;
      const node = rule.build(m, allowLinks);
      if (!node) continue;
      pushText(out, text.slice(plainFrom, pos));
      if (node.type === 'text') pushText(out, node.text);
      else out.push(node);
      pos += m[0].length;
      plainFrom = pos;
      matched = true;
      break;
    }
    if (!matched) pos += 1;
  }
  pushText(out, text.slice(plainFrom));
  return out;
}

/** Lines joined with line breaks (a single newline is kept in chat). */
function parseLines(lines: string[]): Inline[] {
  const out: Inline[] = [];
  lines.forEach((line, index) => {
    if (index > 0) out.push({ type: 'br' });
    out.push(...parseInline(line.trim()));
  });
  return out;
}

/** Plain text of nodes (table export, copy). */
export function inlineText(nodes: Inline[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
        case 'code':
          return node.text;
        case 'br':
          return '\n';
        case 'job':
          return node.jobNo;
        default:
          return inlineText(node.children);
      }
    })
    .join('');
}

// ------------------------------------------------------------------ blocks

const FENCE = /^\s*```/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR = /^\s*([-*_])(\s*\1){2,}\s*$/;
const LIST_ITEM = /^(\s*)([-*+•]|\d{1,3}[.)])\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function indentOf(line: string): number {
  const spaces = /^\s*/.exec(line)?.[0] ?? '';
  return spaces.replace(/\t/g, '    ').length;
}

/** "| a | b \| c |" → ["a", "b | c"]. */
export function splitRow(line: string): string[] {
  let body = line.trim();
  if (body.startsWith('|')) body = body.slice(1);
  if (body.endsWith('|') && !body.endsWith('\\|')) body = body.slice(0, -1);
  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === '\\' && body[i + 1] === '|') {
      current += '|';
      i += 1;
    } else if (ch === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function isTableStart(lines: string[], i: number): boolean {
  const line = lines[i];
  const next = lines[i + 1];
  return (
    line !== undefined &&
    next !== undefined &&
    line.includes('|') &&
    // A separator needs a pipe: a bare "---" under text is a rule.
    next.includes('|') &&
    TABLE_SEPARATOR.test(next) &&
    splitRow(line).length >= 2
  );
}

function alignOf(cell: string): Align {
  const c = cell.trim();
  const left = c.startsWith(':');
  const right = c.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  if (left) return 'left';
  return null;
}

function startsBlock(lines: string[], i: number): boolean {
  const line = lines[i] ?? '';
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    HR.test(line) ||
    LIST_ITEM.test(line) ||
    QUOTE.test(line) ||
    isTableStart(lines, i)
  );
}

function parseList(lines: string[], start: number): { block: Block; next: number } {
  const first = LIST_ITEM.exec(lines[start] ?? '')!;
  const baseIndent = indentOf(lines[start] ?? '');
  const ordered = /\d/.test(first[2] ?? '');
  const items: ListItem[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (!line.trim()) {
      // A blank line ends the list unless another item of it follows.
      const after = lines[i + 1];
      const m = after !== undefined ? LIST_ITEM.exec(after) : null;
      if (
        m &&
        after !== undefined &&
        indentOf(after) >= baseIndent &&
        /\d/.test(m[2] ?? '') === ordered
      ) {
        i += 1;
        continue;
      }
      break;
    }
    const m = LIST_ITEM.exec(line);
    const indent = indentOf(line);
    if (m && indent <= baseIndent + 1) {
      if (indent < baseIndent || /\d/.test(m[2] ?? '') !== ordered) break;
      items.push({ content: parseInline((m[3] ?? '').trim()), children: [] });
      i += 1;
      continue;
    }
    const current = items[items.length - 1];
    if (!current) break;
    if (m && indent > baseIndent) {
      // A deeper item: a nested list under the current one.
      const nested = parseList(lines, i);
      current.children.push(nested.block);
      i = nested.next;
      continue;
    }
    if (indent > baseIndent && !startsBlock(lines, i)) {
      // A wrapped line of the current item.
      current.content.push({ type: 'br' }, ...parseInline(line.trim()));
      i += 1;
      continue;
    }
    break;
  }
  const start1 = ordered ? Number.parseInt(first[2] ?? '', 10) || 1 : 1;
  return { block: { type: 'list', ordered, start: start1, items }, next: i };
}

function parseTable(lines: string[], start: number): { block: Block; next: number } {
  const headerText = splitRow(lines[start] ?? '');
  const width = headerText.length;
  const align = splitRow(lines[start + 1] ?? '')
    .slice(0, width)
    .map(alignOf);
  while (align.length < width) align.push(null);
  const rowsText: string[][] = [];
  let i = start + 2;
  while (i < lines.length && (lines[i] ?? '').trim() && (lines[i] ?? '').includes('|')) {
    const cells = splitRow(lines[i] ?? '').slice(0, width);
    while (cells.length < width) cells.push('');
    rowsText.push(cells);
    i += 1;
  }
  const header = headerText.map((cell) => parseInline(cell));
  const rows = rowsText.map((row) => row.map((cell) => parseInline(cell)));
  return {
    block: {
      type: 'table',
      header,
      align,
      rows,
      raw: {
        header: header.map(inlineText),
        rows: rows.map((row) => row.map(inlineText)),
      },
    },
    next: i,
  };
}

/** Markdown text to blocks. */
export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (FENCE.test(line)) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE.test(lines[i] ?? '')) {
        body.push(lines[i] ?? '');
        i += 1;
      }
      i += 1; // the closing fence (or past the end while it streams)
      blocks.push({ type: 'code', text: body.join('\n') });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      const level = Math.min((heading[1] ?? '#').length, 4) as 1 | 2 | 3 | 4;
      blocks.push({ type: 'heading', level, content: parseInline(heading[2] ?? '') });
      i += 1;
      continue;
    }
    if (HR.test(line)) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }
    if (isTableStart(lines, i)) {
      const { block, next } = parseTable(lines, i);
      blocks.push(block);
      i = next;
      continue;
    }
    if (LIST_ITEM.test(line)) {
      const { block, next } = parseList(lines, i);
      blocks.push(block);
      i = next;
      continue;
    }
    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i] ?? '')) {
        body.push(QUOTE.exec(lines[i] ?? '')?.[1] ?? '');
        i += 1;
      }
      blocks.push({ type: 'quote', blocks: parseMarkdown(body.join('\n')) });
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? '').trim() &&
      (para.length === 0 || !startsBlock(lines, i))
    ) {
      para.push(lines[i] ?? '');
      i += 1;
    }
    blocks.push({ type: 'paragraph', content: parseLines(para) });
  }
  return blocks;
}

/** Whether the text holds a table (the answer then offers wide mode). */
export function hasTable(blocks: Block[]): boolean {
  return blocks.some((block) => block.type === 'table');
}

/**
 * A table cell as a number when it reads as one ("1.234,56", "12,5", "1200",
 * "€1.200", "%20" stays text), so the exported column sums in Excel.
 */
export function cellNumber(text: string): number | null {
  const t = text.replace(/[\s€$₺]|EUR|TL|USD/g, '');
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) || /^-?\d+,\d+$/.test(t)) {
    return Number(t.replace(/\./g, '').replace(',', '.'));
  }
  if (/^-?\d+(\.\d+)?$/.test(t)) {
    // "293.10" is not a thing GEMKOM writes; a lone integer or decimal is.
    return Number(t);
  }
  return null;
}

import { Fragment, useMemo, type ReactNode } from 'react';

/**
 * Markdown for model-written reports (the Tahmin raporu and the estimator's
 * "Nasıl çalışır?" text), rendered to React elements. Port of the legacy
 * utils/markdownLite.js: headings, pipe tables, lists (nested by
 * indentation), block quotes, rules, bold / italic / strike / code, and links
 * only in the explicit `[text](https://…)` form. Square-bracket citations
 * such as `[Çizim C1602 sh.2]` are left exactly as written (the report view
 * turns them into chips through `renderText`).
 *
 * No HTML string is built: the source only ever becomes text nodes and the
 * elements below, so nothing in it can survive as markup.
 */

type Align = 'center' | 'right' | null;

export type InlineNode =
  | string
  | { t: 'strong' | 'em' | 's'; c: InlineNode[] }
  | { t: 'code'; text: string }
  | { t: 'a'; href: string; c: InlineNode[] };

interface MdList {
  type: 'ul' | 'ol';
  indent: number;
  items: { c: InlineNode[]; sub: MdList | null }[];
}

export type MdBlockNode =
  | { t: 'p'; lines: InlineNode[][] }
  | { t: 'h'; level: number; c: InlineNode[] }
  | { t: 'hr' }
  | { t: 'quote'; blocks: MdBlockNode[] }
  | { t: 'table'; header: MdCell[] | null; rows: MdCell[][] }
  | { t: 'list'; list: MdList };

interface MdCell {
  c: InlineNode[];
  align: Align;
}

const NUMERIC_CELL = /^[-+−]?\s*[\d.,]+(\s*(%|€|kg|m|h|ad|adet))?$/;

// Private-use characters stand in for the tags while the inline patterns run
// (the legacy renderer ran the same patterns over its own HTML).
const STRONG_O = '';
const STRONG_C = '';
const EM_O = '';
const EM_C = '';
const S_O = '';
const S_C = '';
const PARK_O = '';
const PARK_C = '';
const TAGS = '-';

type Parked = { t: 'code'; text: string } | { t: 'a'; href: string; label: string };

/** One line of inline markdown → nodes. */
export function parseInline(text: string): InlineNode[] {
  const parked: Parked[] = [];
  const park = (node: Parked) => `${PARK_O}${parked.push(node) - 1}${PARK_C}`;
  let out = String(text).replace(/[-]/g, '');
  out = out.replace(/`([^`\n]+)`/g, (_, code: string) => park({ t: 'code', text: code }));
  // [text](https://…) — only http(s) is accepted.
  out = out.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label: string, href: string) => park({ t: 'a', href, label }));
  out = out
    .replace(/\*\*(?=\S)([^\n]*?\S)\*\*/g, `${STRONG_O}$1${STRONG_C}`)
    .replace(new RegExp(`(^|[\\s(${TAGS}])\\*(?=[^\\s*])([^*\\n]*?[^\\s*])\\*(?=[\\s.,;:)!?${TAGS}]|$)`, 'g'), `$1${EM_O}$2${EM_C}`)
    .replace(/~~(?=\S)([^\n]*?\S)~~/g, `${S_O}$1${S_C}`);
  return toTree(out, parked);
}

function toTree(marked: string, parked: Parked[]): InlineNode[] {
  const root: InlineNode[] = [];
  const stack: { t: 'strong' | 'em' | 's'; c: InlineNode[] }[] = [];
  const top = () => (stack.length ? stack[stack.length - 1]!.c : root);
  const push = (node: InlineNode) => {
    const list = top();
    const last = list[list.length - 1];
    if (typeof node === 'string' && typeof last === 'string') list[list.length - 1] = last + node;
    else list.push(node);
  };
  const OPEN: Record<string, 'strong' | 'em' | 's'> = { [STRONG_O]: 'strong', [EM_O]: 'em', [S_O]: 's' };
  const CLOSE: Record<string, 'strong' | 'em' | 's'> = { [STRONG_C]: 'strong', [EM_C]: 'em', [S_C]: 's' };
  const re = /(\d+)|[-]|[^-]+/g;
  for (const m of marked.matchAll(re)) {
    const tok = m[0];
    if (m[1] !== undefined) {
      const p = parked[Number(m[1])];
      if (!p) continue;
      if (p.t === 'code') push(p);
      else push({ t: 'a', href: p.href, c: toTree(p.label, parked) });
    } else if (OPEN[tok]) {
      const el = { t: OPEN[tok], c: [] as InlineNode[] };
      push(el);
      stack.push(el);
    } else if (CLOSE[tok]) {
      // Close the element (and anything opened inside it); a stray closer is dropped.
      const at = stack.map((s) => s.t).lastIndexOf(CLOSE[tok]);
      if (at >= 0) stack.length = at;
    } else {
      push(tok);
    }
  }
  return root;
}

function isTableLine(line: string): boolean {
  const s = line.trim();
  return s.startsWith('|') && s.lastIndexOf('|') > 0;
}

function isSeparatorRow(cells: string[]): boolean {
  return (
    cells.length > 0 &&
    cells.every((c) => /^:?-{2,}:?$/.test(c.trim()) || c.trim() === '') &&
    cells.some((c) => c.includes('-'))
  );
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

function parseTable(lines: string[]): MdBlockNode {
  const rows = lines.map(splitRow);
  let header: string[] | null = null;
  let aligns: Align[] = [];
  let body = rows;
  if (rows.length >= 2 && isSeparatorRow(rows[1]!)) {
    header = rows[0]!;
    aligns = rows[1]!.map((c) => {
      const s = c.trim();
      if (s.startsWith(':') && s.endsWith(':')) return 'center';
      if (s.endsWith(':')) return 'right';
      return null;
    });
    body = rows.slice(2);
  }
  // A cell's alignment: the separator's, else right for a number (not in the first column).
  const cells = (r: string[]): MdCell[] =>
    r.map((text, i) => ({
      c: parseInline(text),
      align: aligns[i] || (i > 0 && NUMERIC_CELL.test(text.replace(/\*/g, '')) ? 'right' : null),
    }));
  return { t: 'table', header: header ? cells(header) : null, rows: body.map(cells) };
}

/** Markdown source → blocks (port of markdownLite's renderMarkdown, without the HTML). */
export function parseMarkdown(source: unknown): MdBlockNode[] {
  const lines = String(source ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const out: MdBlockNode[] = [];
  let paragraph: string[] = [];
  // Open lists, outermost first. An item indented deeper than its list starts a nested list inside the previous item.
  let lists: MdList[] = [];
  let quote: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      out.push({ t: 'p', lines: paragraph.map(parseInline) });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (lists.length) {
      out.push({ t: 'list', list: lists[0]! });
      lists = [];
    }
  };
  const addItem = (type: MdList['type'], indent: number, c: InlineNode[]) => {
    let top = lists[lists.length - 1];
    while (top && indent < top.indent && lists.length > 1) {
      lists.pop();
      top = lists[lists.length - 1];
    }
    if (top && indent > top.indent + 1 && top.items.length) {
      const parent = top.items[top.items.length - 1]!;
      parent.sub = { type, indent, items: [] };
      lists.push(parent.sub);
      top = parent.sub;
    } else if (!top || (lists.length === 1 && top.type !== type)) {
      flushList();
      top = { type, indent, items: [] };
      lists.push(top);
    }
    top.items.push({ c, sub: null });
  };
  const flushQuote = () => {
    if (quote.length) {
      out.push({ t: 'quote', blocks: parseMarkdown(quote.join('\n')) });
      quote = [];
    }
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const trimmed = line.trim();

    if (!trimmed) {
      flushAll();
      continue;
    }

    if (isTableLine(line)) {
      flushAll();
      const block: string[] = [];
      while (i < lines.length && isTableLine(lines[i]!)) {
        block.push(lines[i]!);
        i += 1;
      }
      i -= 1;
      out.push(parseTable(block));
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.*?)\s*#*$/);
    if (heading) {
      flushAll();
      out.push({ t: 'h', level: heading[1]!.length, c: parseInline(heading[2]!) });
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushAll();
      out.push({ t: 'hr' });
      continue;
    }

    if (trimmed.startsWith('>')) {
      flushParagraph();
      flushList();
      quote.push(trimmed.replace(/^>\s?/, ''));
      continue;
    }
    flushQuote();

    const bullet = line.match(/^(\s*)[-*•]\s+(.*)$/);
    const numbered = line.match(/^(\s*)\d+[.)]\s+(.*)$/);
    const item = bullet || numbered;
    if (item) {
      flushParagraph();
      addItem(bullet ? 'ul' : 'ol', item[1]!.replace(/\t/g, '    ').length, parseInline(item[2]!));
      continue;
    }
    // a wrapped list item continues the previous one
    if (lists.length && /^\s{2,}\S/.test(line)) {
      const items = lists[lists.length - 1]!.items;
      items[items.length - 1]!.c.push(' ', ...parseInline(trimmed));
      continue;
    }
    flushList();
    paragraph.push(trimmed);
  }
  flushAll();
  return out;
}

// ---------------------------------------------------------------- render

type TextRenderer = (text: string) => ReactNode;

function renderInline(nodes: InlineNode[], renderText: TextRenderer): ReactNode[] {
  return nodes.map((n, i) => {
    if (typeof n === 'string') return <Fragment key={i}>{renderText(n)}</Fragment>;
    if (n.t === 'code') return <code key={i}>{renderText(n.text)}</code>;
    if (n.t === 'a')
      return (
        <a key={i} href={n.href} target="_blank" rel="noopener noreferrer">
          {renderInline(n.c, renderText)}
        </a>
      );
    const Tag = n.t;
    return <Tag key={i}>{renderInline(n.c, renderText)}</Tag>;
  });
}

function alignClass(a: Align): string | undefined {
  return a === 'center' ? 'text-center' : a === 'right' ? 'text-end' : undefined;
}

function renderList(l: MdList, renderText: TextRenderer, key?: number): ReactNode {
  const Tag = l.type;
  return (
    <Tag key={key}>
      {l.items.map((it, i) => (
        <li key={i}>
          {renderInline(it.c, renderText)}
          {it.sub ? renderList(it.sub, renderText) : null}
        </li>
      ))}
    </Tag>
  );
}

export function renderBlocks(blocks: MdBlockNode[], headingOffset: number, renderText: TextRenderer): ReactNode[] {
  return blocks.map((b, i) => {
    switch (b.t) {
      case 'p':
        return (
          <p key={i}>
            {b.lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 ? <br /> : null}
                {renderInline(line, renderText)}
              </Fragment>
            ))}
          </p>
        );
      case 'h': {
        const Tag = `h${Math.min(6, b.level + headingOffset)}` as 'h1';
        return <Tag key={i}>{renderInline(b.c, renderText)}</Tag>;
      }
      case 'hr':
        return <hr key={i} />;
      case 'quote':
        return <blockquote key={i}>{renderBlocks(b.blocks, headingOffset, renderText)}</blockquote>;
      case 'list':
        return renderList(b.list, renderText, i);
      case 'table':
        return (
          <div key={i} className="md-table">
            <table>
              {b.header ? (
                <thead>
                  <tr>
                    {b.header.map((c, j) => (
                      <th key={j} className={alignClass(c.align)}>
                        {renderInline(c.c, renderText)}
                      </th>
                    ))}
                  </tr>
                </thead>
              ) : null}
              <tbody>
                {b.rows.map((r, j) => (
                  <tr key={j}>
                    {r.map((c, k) => (
                      <td key={k} className={alignClass(c.align)}>
                        {renderInline(c.c, renderText)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      default:
        return null;
    }
  });
}

const plain: TextRenderer = (text) => text;

export interface MarkdownProps {
  source: string | null | undefined;
  /** Shift heading levels (1 turns `#` into `<h2>`). */
  headingOffset?: number;
  /** Turns each run of plain text into nodes (the report's citation chips and § buttons); default: the text. */
  renderText?: TextRenderer;
}

/** The blocks of `source`, without a wrapper element. */
export function Markdown({ source, headingOffset = 0, renderText = plain }: MarkdownProps) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  return <>{renderBlocks(blocks, headingOffset, renderText)}</>;
}

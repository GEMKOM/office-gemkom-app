import { describe, expect, it } from 'vitest';
import {
  cellNumber,
  inlineText,
  parseInline,
  parseMarkdown,
  safeHref,
  splitRow,
  type Block,
  type Inline,
} from './markdown';

function block<T extends Block['type']>(
  b: Block | undefined,
  type: T,
): Extract<Block, { type: T }> {
  if (!b || b.type !== type) throw new Error(`${type} expected, got ${b?.type}`);
  return b as Extract<Block, { type: T }>;
}

function inline<T extends Inline['type']>(
  n: Inline | undefined,
  type: T,
): Extract<Inline, { type: T }> {
  if (!n || n.type !== type) throw new Error(`${type} expected, got ${n?.type}`);
  return n as Extract<Inline, { type: T }>;
}

describe('parseMarkdown', () => {
  it('reads a GFM table with alignment, escaped pipes and short rows', () => {
    const blocks = parseMarkdown(
      [
        'Toplam **68** iş emri:',
        '',
        '| İş No | Başlık | Tutar |',
        '|---|:---|---:|',
        '| 293-10 | A \\| B | 1.200,50 |',
        '| 114-14 |',
      ].join('\n'),
    );
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'table']);
    const table = block(blocks[1], 'table');
    expect(table.align).toEqual([null, 'left', 'right']);
    expect(table.raw.header).toEqual(['İş No', 'Başlık', 'Tutar']);
    expect(table.raw.rows).toEqual([
      ['293-10', 'A | B', '1.200,50'],
      ['114-14', '', ''],
    ]);
    // The job number in a cell is a link.
    expect(table.rows[0]?.[0]?.[0]).toEqual({ type: 'job', jobNo: '293-10' });
  });

  it('keeps a half-streamed table as text until its separator arrives', () => {
    const blocks = parseMarkdown('| İş No | Başlık |');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.type).toBe('paragraph');
  });

  it('does not take "---" under a line for a table', () => {
    expect(parseMarkdown('a | b\n---').map((b) => b.type)).toEqual(['paragraph', 'hr']);
  });

  it('reads headings, nested lists and numbered lists', () => {
    const blocks = parseMarkdown(
      ['## Özet', '- bir', '  - iki', '- üç', '', '3. dört', '4. beş'].join('\n'),
    );
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'list', 'list']);
    const bullets = block(blocks[1], 'list');
    expect(bullets.items).toHaveLength(2);
    expect(bullets.items[0]?.children[0]?.type).toBe('list');
    const numbered = block(blocks[2], 'list');
    expect(numbered.ordered).toBe(true);
    expect(numbered.start).toBe(3);
  });

  it('keeps single line breaks inside a paragraph', () => {
    const para = block(parseMarkdown('satır bir\nsatır iki')[0], 'paragraph');
    expect(para.content.some((n) => n.type === 'br')).toBe(true);
  });

  it('reads an unclosed code fence while it streams', () => {
    const [code] = parseMarkdown('```\nSELECT 1');
    expect(code).toEqual({ type: 'code', text: 'SELECT 1' });
  });
});

describe('parseInline', () => {
  it('reads bold, italic, code and the comment colour markers', () => {
    const nodes = parseInline('**kalın** *eğik* `kod` !!acil!! ++tamam++');
    expect(nodes.filter((n) => n.type !== 'text').map((n) => n.type)).toEqual([
      'strong',
      'em',
      'code',
      'critical',
      'positive',
    ]);
  });

  it('leaves arithmetic and unclosed markers alone', () => {
    expect(inlineText(parseInline('2 * 3 * 4'))).toBe('2 * 3 * 4');
    expect(parseInline('**yarım')).toEqual([{ type: 'text', text: '**yarım' }]);
  });

  it('links job numbers but not dates, amounts or NCR numbers', () => {
    const jobs = (text: string) =>
      parseInline(text)
        .filter((n) => n.type === 'job')
        .map((n) => (n.type === 'job' ? n.jobNo : ''));
    expect(jobs('293-10, RM269-02 ve 293-14-01 işleri')).toEqual([
      '293-10',
      'RM269-02',
      '293-14-01',
    ]);
    expect(jobs('2026-11-10 tarihinde 1.200-150 € ve NCR 2026-0157')).toEqual([]);
  });

  it('turns app links into in-app paths and drops unsafe ones', () => {
    const [app] = parseInline('[talep](https://ofis.gemcore.com.tr/procurement/x/?talep=5)');
    expect(app).toMatchObject({ type: 'link', href: '/procurement/x/?talep=5', external: false });
    const [bad] = parseInline('[tıkla](javascript:alert(1))');
    expect(bad?.type).not.toBe('link');
    const nodes = parseInline('Bkz. https://example.com/a.');
    expect(nodes[1]).toMatchObject({ type: 'link', href: 'https://example.com/a', external: true });
    expect(nodes[2]).toEqual({ type: 'text', text: '.' });
  });

  it('never nests a link inside a link', () => {
    const link = inline(
      parseInline('[293-10 işi](/projects/project-tracking/?job_no=293-10)')[0],
      'link',
    );
    expect(link.children.every((n) => n.type !== 'job' && n.type !== 'link')).toBe(true);
  });

  it('keeps markup as text: nothing becomes HTML', () => {
    expect(inlineText(parseInline('<script>alert(1)</script>'))).toBe('<script>alert(1)</script>');
  });
});

describe('helpers', () => {
  it('safeHref', () => {
    expect(safeHref('/a')).toEqual({ href: '/a', external: false });
    expect(safeHref('//evil.com')).toBeNull();
    expect(safeHref('data:text/html,x')).toBeNull();
    // Browsers read "\" as "/": these would leave the site.
    expect(safeHref('/\\evil.com')).toBeNull();
    expect(safeHref('/\\/evil.com')).toBeNull();
    expect(safeHref('/a\\b')).toBeNull();
    expect(safeHref('https://ofis.gemcore.com.tr/\\evil.com')).toBeNull();
    expect(safeHref('/\tjavascript:x')).toBeNull();
  });

  it('splitRow', () => {
    expect(splitRow('| a | b |')).toEqual(['a', 'b']);
    expect(splitRow('a|b')).toEqual(['a', 'b']);
  });

  it('cellNumber reads Turkish and plain numbers only', () => {
    expect(cellNumber('1.234,56')).toBe(1234.56);
    expect(cellNumber('12,5')).toBe(12.5);
    expect(cellNumber('€ 1.200')).toBe(1200);
    expect(cellNumber('1200')).toBe(1200);
    expect(cellNumber('%20')).toBeNull();
    expect(cellNumber('293-10')).toBeNull();
    expect(cellNumber('2026-12-31')).toBeNull();
  });
});

import { render } from '@testing-library/react';
import { Markdown } from './Markdown';

function html(source: string, headingOffset = 0) {
  const { container } = render(
    <div>
      <Markdown source={source} headingOffset={headingOffset} />
    </div>,
  );
  return container.firstElementChild!;
}

it('renders headings (shifted), paragraphs with line breaks and rules', () => {
  const el = html('# Başlık\n\nbir\niki\n\n---', 2);
  expect(el.querySelector('h3')?.textContent).toBe('Başlık');
  expect(el.querySelector('p')?.innerHTML).toBe('bir<br>iki');
  expect(el.querySelector('hr')).not.toBeNull();
});

it('renders bold, italic, strike, code and only http(s) links', () => {
  const el = html('**kalın** ve *italik* ~~çizili~~ `kod` [site](https://x.test/a?b=1) [js](javascript:alert(1))');
  expect(el.querySelector('strong')?.textContent).toBe('kalın');
  expect(el.querySelector('em')?.textContent).toBe('italik');
  expect(el.querySelector('s')?.textContent).toBe('çizili');
  expect(el.querySelector('code')?.textContent).toBe('kod');
  const links = el.querySelectorAll('a');
  expect(links).toHaveLength(1);
  expect(links[0]!.getAttribute('href')).toBe('https://x.test/a?b=1');
  expect(links[0]!.getAttribute('rel')).toBe('noopener noreferrer');
  expect(el.textContent).toContain('[js](javascript:alert(1))');
});

it('keeps markup in the source as text', () => {
  const el = html('<script>alert(1)</script> <b>x</b> **<i>y</i>**');
  expect(el.querySelector('script, b, i')).toBeNull();
  expect(el.textContent).toContain('<script>alert(1)</script>');
  expect(el.querySelector('strong')?.textContent).toBe('<i>y</i>');
});

it('renders pipe tables with header alignment and right-aligned numbers', () => {
  const el = html('| Kalem | Tutar | Not |\n|---|---|:---:|\n| Sac | 1.200 € | a |\n| **Toplam** | 1.200 € | b |');
  const ths = el.querySelectorAll('.md-table thead th');
  expect([...ths].map((t) => t.textContent)).toEqual(['Kalem', 'Tutar', 'Not']);
  const cells = el.querySelectorAll('.md-table tbody tr:first-child td');
  expect(cells[0]!.className).toBe('');
  expect(cells[1]!.className).toBe('text-end');
  expect(cells[2]!.className).toBe('text-center');
  expect(el.querySelector('tbody tr:last-child td strong')?.textContent).toBe('Toplam');
});

it('nests lists by indentation, continues wrapped items and switches list type', () => {
  const el = html('- bir\n  devamı\n    - alt\n- iki\n\n1. sıra');
  const ul = el.querySelector('ul')!;
  expect(ul.children).toHaveLength(2);
  expect(ul.children[0]!.textContent).toBe('bir devamıalt');
  expect(ul.querySelector('li ul li')?.textContent).toBe('alt');
  expect(el.querySelector('ol li')?.textContent).toBe('sıra');
});

it('renders block quotes recursively and leaves [citations] as written', () => {
  const el = html('> **not** [Çizim C1602 sh.2]');
  expect(el.querySelector('blockquote strong')?.textContent).toBe('not');
  expect(el.querySelector('blockquote')?.textContent).toBe('not [Çizim C1602 sh.2]');
});

it('passes plain text runs through renderText', () => {
  const { container } = render(
    <Markdown source="a **b**" renderText={(t) => <mark>{t}</mark>} />,
  );
  expect([...container.querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['a ', 'b']);
});

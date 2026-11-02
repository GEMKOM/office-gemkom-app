import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/api/client';
import { renderWithProviders } from '@/test/render';
import { applyAutoFormat, serializeToMarkdown } from './editorDom';
import { renderRichText } from './renderRichText';
import { RichText } from './RichText';
import { RichTextEditor } from './RichTextEditor';

vi.mock('@/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/client')>()),
  apiFetch: vi.fn(),
}));

const USERS = [
  { id: 1, username: 'onatcalik', full_name: 'Onat Çalık' },
  { id: 2, username: 'caner', full_name: 'Caner Şahin' },
];
const GROUPS = [{ id: 9, name: 'Satın Alma', display_name: 'Satın Alma', member_count: 2 }];
const MEMBERS = {
  id: 9,
  name: 'Satın Alma',
  members: [
    { username: 'ayse', full_name: 'Ayşe Yılmaz', position: 'Satın Alma Uzmanı' },
    { username: 'mehmet', full_name: 'Mehmet Kaya' },
  ],
};

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation(async (path: string) => {
    if (path === '/users/dropdown/') return USERS;
    if (path === '/organization/groups/') return GROUPS;
    if (path === '/organization/groups/9/members/') return MEMBERS;
    throw new Error(`unexpected ${path}`);
  });
});

/** Put the caret at the end of the surface's last text node. */
function caretAtEnd(surface: HTMLElement) {
  const walker = document.createTreeWalker(surface, NodeFilter.SHOW_TEXT);
  let last: Node | null = null;
  while (walker.nextNode()) last = walker.currentNode;
  const range = document.createRange();
  if (last) range.setStart(last, last.nodeValue?.length ?? 0);
  else range.setStart(surface, surface.childNodes.length);
  range.collapse(true);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

function select(node: Node, from: number, to: number) {
  const range = document.createRange();
  range.setStart(node, from);
  range.setEnd(node, to);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

function Controlled({
  initial = '',
  onValue,
}: {
  initial?: string;
  onValue?: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <RichTextEditor
        aria-label="Yorum"
        placeholder="Yorum yazın..."
        value={value}
        onChange={(next) => {
          setValue(next);
          onValue?.(next);
        }}
      />
      <button type="button" onClick={() => setValue('')}>
        Sıfırla
      </button>
      <output data-testid="value">{value}</output>
    </>
  );
}

describe('serializeToMarkdown', () => {
  const roundTrip = (markdown: string, options = {}) => {
    const surface = document.createElement('div');
    surface.innerHTML = renderRichText(markdown, options);
    return serializeToMarkdown(surface);
  };

  it.each([
    'bu **önemli** konu',
    'bir *italik* söz',
    '~~eski~~ fiyat',
    'şunu çalıştır: `npm run check`',
    '!!ACİL!! ve ++tamam++',
    '- birinci\n- ikinci',
    '1. birinci\n2. ikinci',
    'satır bir\nsatır iki',
    'bkz https://gemkom.com/r?a=1&b=2',
    '@onatcalik bakar mısın',
    'a < b & c > d "tırnak"',
  ])('reads %j back unchanged', (markdown) => {
    expect(roundTrip(markdown, { mentionedUsers: USERS })).toBe(markdown);
  });

  it('reads a group badge back as its name', () => {
    const groups = [{ id: 9, name: 'Satın Alma', slug: 'satn-alma' }];
    expect(roundTrip('@[group:Satın Alma] lütfen', { mentionedGroups: groups })).toBe(
      '@Satın Alma lütfen',
    );
  });

  it('normalises the underscore italic to the asterisk one', () => {
    expect(roundTrip('_vurgu_')).toBe('*vurgu*');
  });

  it('reads the browser’s own block markup as lines', () => {
    const surface = document.createElement('div');
    surface.innerHTML = 'bir<div>iki</div><div><br></div><div>üç <b>dört</b></div>';
    expect(serializeToMarkdown(surface)).toBe('bir\niki\n\nüç **dört**');
  });
});

describe('applyAutoFormat', () => {
  it('turns a closed marker into formatting', () => {
    const surface = document.createElement('div');
    document.body.appendChild(surface);
    surface.textContent = 'çok **önemli**';
    caretAtEnd(surface);
    expect(applyAutoFormat(surface)).toBe(true);
    expect(surface.querySelector('b')?.textContent).toBe('önemli');
    expect(serializeToMarkdown(surface)).toBe('çok **önemli**');
    surface.remove();
  });

  it('leaves markers inside code alone', () => {
    const surface = document.createElement('div');
    document.body.appendChild(surface);
    surface.innerHTML = '<code>a **b**</code>';
    caretAtEnd(surface);
    expect(applyAutoFormat(surface)).toBe(false);
    surface.remove();
  });
});

describe('RichTextEditor', () => {
  it('shows the stored value formatted and redraws when the value is reset', () => {
    renderWithProviders(<Controlled initial="**kalın** ve !!acil!!" />);
    const surface = screen.getByRole('textbox', { name: 'Yorum' });
    expect(surface.querySelector('strong')?.textContent).toBe('kalın');
    expect(surface.querySelector('.rt-critical')?.textContent).toBe('acil');

    fireEvent.click(screen.getByRole('button', { name: 'Sıfırla' }));
    expect(surface.textContent).toBe('');
  });

  it('reports what was typed as markdown-lite', () => {
    const onValue = vi.fn();
    renderWithProviders(<Controlled onValue={onValue} />);
    const surface = screen.getByRole('textbox', { name: 'Yorum' });
    surface.innerHTML = 'merhaba <b>dünya</b>';
    fireEvent.input(surface);
    expect(onValue).toHaveBeenLastCalledWith('merhaba **dünya**');
  });

  it('suggests people and groups after @ and inserts the picked one', async () => {
    renderWithProviders(<Controlled />);
    const surface = screen.getByRole('textbox', { name: 'Yorum' });
    surface.textContent = 'Bakar mısın @ona';
    caretAtEnd(surface);

    // The user list arrives asynchronously; typing again re-reads it.
    await waitFor(() => {
      fireEvent.input(surface);
      expect(screen.getByRole('option', { name: /Onat Çalık/ })).toBeInTheDocument();
    });
    fireEvent.keyDown(surface, { key: 'Enter' });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByTestId('value')).toHaveTextContent('Bakar mısın @onatcalik');
    const badge = surface.querySelector<HTMLElement>('.mention-badge');
    expect(badge?.dataset.mention).toBe('onatcalik');
    expect(badge?.getAttribute('contenteditable')).toBe('false');
  });

  it('inserts a group as one badge, by its name', async () => {
    renderWithProviders(<Controlled />);
    const surface = screen.getByRole('textbox', { name: 'Yorum' });
    surface.textContent = '@satın';
    caretAtEnd(surface);
    await waitFor(() => {
      fireEvent.input(surface);
      expect(screen.getByRole('option', { name: /Satın Alma.*Grup/ })).toBeInTheDocument();
    });
    expect(screen.getByText('@Satın Alma · 2 kişi')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('option', { name: /Satın Alma/ }));
    expect(screen.getByTestId('value')).toHaveTextContent('@Satın Alma');
    expect(surface.querySelector('.mention-badge-group')).not.toBeNull();
  });

  it('Escape closes the suggestions without touching the text', async () => {
    renderWithProviders(<Controlled />);
    const surface = screen.getByRole('textbox', { name: 'Yorum' });
    surface.textContent = '@can';
    caretAtEnd(surface);
    await waitFor(() => {
      fireEvent.input(surface);
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });
    fireEvent.keyDown(surface, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByTestId('value')).toHaveTextContent('@can');
  });

  it('wraps the word under the caret in a colour mark from the toolbar', () => {
    renderWithProviders(<Controlled />);
    const surface = screen.getByRole('textbox', { name: 'Yorum' });
    surface.textContent = 'durum acil';
    surface.focus();
    const text = surface.firstChild!;
    select(text, 7, 7); // inside "acil"
    fireEvent.click(screen.getByRole('button', { name: 'Kritik (kırmızı)' }));
    expect(screen.getByTestId('value')).toHaveTextContent('durum !!acil!!');
  });

  it('the raw-text view edits the stored text directly', () => {
    renderWithProviders(<Controlled initial="**a**" />);
    fireEvent.click(screen.getByRole('button', { name: 'Ham metni göster' }));
    const source = screen.getByRole('textbox', { name: 'Yorum' });
    expect(source).toHaveValue('**a**');
    fireEvent.change(source, { target: { value: '++b++' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ham metni göster' }));
    const surface = screen.getByRole('textbox', { name: 'Yorum' });
    expect(surface.querySelector('.rt-positive')?.textContent).toBe('b');
  });

  it('pastes HTML as formatting only: nothing executable survives', () => {
    const onValue = vi.fn();
    renderWithProviders(<Controlled onValue={onValue} />);
    const surface = screen.getByRole('textbox', { name: 'Yorum' });
    caretAtEnd(surface);
    const html =
      '<b>kalın</b><img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>';
    fireEvent.paste(surface, {
      clipboardData: { getData: (type: string) => (type === 'text/html' ? html : '') },
    });
    expect(surface.querySelector('img, script')).toBeNull();
    expect(surface.querySelector('strong')?.textContent).toBe('kalın');
    expect(onValue).toHaveBeenLastCalledWith(expect.stringContaining('**kalın**'));
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });
});

describe('RichText', () => {
  it('renders the formatted text and nothing for an empty body', () => {
    const { container, rerender } = renderWithProviders(
      <RichText content="**kalın** @onatcalik" mentionedUsers={USERS} />,
    );
    expect(container.querySelector('strong')?.textContent).toBe('kalın');
    expect(screen.getByText('@Onat Çalık')).toBeInTheDocument();
    rerender(<RichText content="   " />);
    expect(container.querySelector('strong')).toBeNull();
  });

  it('a group badge lists the members it notified', async () => {
    renderWithProviders(
      <RichText
        content="@Satın Alma bakabilir mi?"
        mentionedGroups={[{ id: 9, name: 'Satın Alma' }]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Satın Alma/ }));
    const popover = await screen.findByRole('dialog', { name: 'Satın Alma grubunun üyeleri' });
    expect(await screen.findByText('Ayşe Yılmaz')).toBeInTheDocument();
    expect(popover).toHaveTextContent('2 üye bildirim alır');
    expect(apiFetch).toHaveBeenCalledWith('/organization/groups/9/members/', expect.anything());

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

import { describe, expect, it } from 'vitest';
import { escapeHtml, renderRichText, richTextToPlain } from './renderRichText';

// The cases of the legacy utils/richText.test.mjs, one for one, plus the
// excerpt helper. The output must stay identical to the legacy renderer's.

const MENTIONS = [
  { username: 'onatcalik', full_name: 'Onat Çalık' },
  { username: 'evil', full_name: '<img src=x onerror=alert(1)>' },
];

const render = (text: unknown) => renderRichText(text, { mentionedUsers: MENTIONS });

describe('escaping', () => {
  it('escapeHtml covers all five entities', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
  it('escapeHtml tolerates null/undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('safety: nothing a user types may become markup', () => {
  it('script tags are inert', () => {
    expect(render('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
  it('event handlers are inert', () => {
    expect(render('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });
  it('quotes cannot break out of an attribute', () => {
    expect(render('" onmouseover="alert(1)')).not.toContain('onmouseover="alert');
  });
  it('javascript: is never linked', () => {
    expect(render('[x](javascript:alert(1))')).not.toContain('href');
  });
  it('markup inside code stays escaped', () => {
    expect(render('`<script>x</script>`')).toBe('<code>&lt;script&gt;x&lt;/script&gt;</code>');
  });
  it('a hostile mention display name is escaped', () => {
    // The name comes from API data, not the comment body: it needs its own pass.
    const html = render('@evil');
    expect(html).toContain('&lt;img src=x');
    expect(html).not.toContain('<img');
  });
  it('park tokens cannot be forged from user text', () => {
    expect(render(`a${String.fromCharCode(0xe000)}0${String.fromCharCode(0xe001)}b`)).not.toContain(
      '<',
    );
  });
});

describe('formatting', () => {
  it('bold', () => expect(render('bu **önemli** konu')).toBe('bu <strong>önemli</strong> konu'));
  it('italic, both markers', () => expect(render('*a* ve _b_')).toBe('<em>a</em> ve <em>b</em>'));
  it('strikethrough', () => expect(render('~~eski~~')).toBe('<s>eski</s>'));
  it('inline code', () => expect(render('`kod`')).toBe('<code>kod</code>'));
  it('red marker', () => expect(render('!!ACİL!!')).toBe('<span class="rt-critical">ACİL</span>'));
  it('green marker', () =>
    expect(render('++uygun++')).toBe('<span class="rt-positive">uygun</span>'));
  it('bulleted list', () => expect(render('- a\n- b')).toBe('<ul><li>a</li><li>b</li></ul>'));
  it('numbered list', () => expect(render('1. a\n2. b')).toBe('<ol><li>a</li><li>b</li></ol>'));
  it('line breaks inside a paragraph', () => expect(render('a\nb')).toBe('a<br>b'));
  it('urls autolink and keep their query string escaped', () => {
    const html = render('https://gemkom.com/r?a=1&b=2');
    expect(html).toContain('href="https://gemkom.com/r?a=1&amp;b=2"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
  it('trailing punctuation stays outside the link', () => {
    expect(render('bkz https://gemkom.com.').endsWith('</a>.')).toBe(true);
  });
  it('mentions resolve to full names', () => {
    expect(render('@onatcalik')).toBe(
      '<span class="mention-badge" data-mention="onatcalik">@Onat Çalık</span>',
    );
  });
  it('an unknown mention falls back to the username', () => {
    expect(render('@ghost')).toBe('<span class="mention-badge" data-mention="ghost">@ghost</span>');
  });
  it('the badge carries the username it was built from', () => {
    // The editor reads data-mention back to rebuild "@onatcalik" from a badge
    // whose visible text is "@Onat Çalık".
    expect(render('@onatcalik')).toContain('data-mention="onatcalik"');
  });
});

describe('group mentions: a group name is not a word token', () => {
  const GROUPS = [
    { id: 7, name: 'Planlama', slug: 'planlama' },
    { id: 9, name: 'Satın Alma', slug: 'satn-alma' },
  ];
  const renderGroups = (text: string) =>
    renderRichText(text, { mentionedUsers: MENTIONS, mentionedGroups: GROUPS });
  const groupBadges = (html: string) => html.match(/mention-badge-group/g)?.length ?? 0;

  it('a group name with a space and a Turkish letter is one badge', () => {
    // \w is ASCII in JS, so this used to badge "@Sat" and leave "ın Alma" behind.
    const html = renderGroups('@Satın Alma');
    expect(groupBadges(html)).toBe(1);
    expect(html).toContain('@Satın Alma</span>');
    expect(html).not.toContain('>ın Alma');
  });
  it('groups and people badge side by side', () => {
    const html = renderGroups('@Planlama @Satın Alma @onatcalik');
    expect(groupBadges(html)).toBe(2);
    expect(html).toContain('@Onat Çalık</span>');
  });
  it('the explicit @[group:...] form badges too', () => {
    const html = renderGroups('@[group:Satın Alma] ve @[group:planlama]');
    expect(groupBadges(html)).toBe(2);
    expect(html).not.toContain('[group:');
  });
  it('the slug form badges too', () => {
    expect(renderGroups('@satn-alma')).toContain('data-group-name="Satın Alma"');
  });
  it('a longer word starting with a group name is not a group', () => {
    expect(renderGroups('@Planlamaci')).not.toContain('mention-badge-group');
  });
  it('without group data nothing is badged as a group', () => {
    // The server resolves the text into groups; the renderer never guesses.
    expect(render('@Planlama')).not.toContain('mention-badge-group');
  });
  it('an injected group name cannot break out of the badge', () => {
    const html = renderRichText('@Planlama', {
      mentionedGroups: [
        { id: '"><img src=x onerror=alert(1)>', name: '<b>Planlama</b>' },
        { id: 7, name: 'Planlama', slug: 'planlama' },
      ],
    });
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>');
  });
});

describe('predictability: markers must not fire by accident', () => {
  it('a stray !! is left alone', () => expect(render('harika!! sonra')).toBe('harika!! sonra'));
  it('arithmetic asterisks are left alone', () => expect(render('3 * 4 * 5')).toBe('3 * 4 * 5'));
  it('a decorative *** run is left alone', () => {
    // Seen in real threads: "*** Ø177,8 x 28 ---- ..." must not become <em>*</em>
    expect(render('*** Ø177,8 x 28')).toBe('*** Ø177,8 x 28');
  });
  it('single-character italic still works', () => expect(render('*a*')).toBe('<em>a</em>'));
  it('an unclosed marker is left alone', () => expect(render('**yarım')).toBe('**yarım'));
  it('markers do not cross lines', () => expect(render('**a\nb**')).toBe('**a<br>b**'));
  it('markers inside a url stay literal', () => {
    expect(render('https://x.com/a_b_c')).toContain('a_b_c</a>');
  });
  it('empty input renders nothing', () => {
    expect(render('   ')).toBe('');
    expect(render(null)).toBe('');
  });
});

describe('richTextToPlain', () => {
  it('drops the markers and keeps the words', () => {
    expect(richTextToPlain('**kalın** ve !!acil!! ++tamam++ `kod` ~~eski~~')).toBe(
      'kalın ve acil tamam kod eski',
    );
  });
  it('flattens lists and line breaks into one line', () => {
    expect(richTextToPlain('başlık\n- a\n- b')).toBe('başlık • a • b');
  });
  it('keeps mentions as typed and unwraps the group form', () => {
    expect(richTextToPlain('@onatcalik @[group: Satın Alma]')).toBe('@onatcalik @Satın Alma');
  });
});

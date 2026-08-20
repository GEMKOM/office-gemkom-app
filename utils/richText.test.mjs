/**
 * Tests for the comment/discussion text renderer.
 *
 * No test runner in this repo, and this module is the one place user text
 * becomes HTML — so these run on bare node with no dependencies:
 *
 *     node utils/richText.test.mjs
 */

import assert from 'node:assert/strict';
import { renderRichText } from './richText.js';
import { escapeHtml, escapeHtmlWithBreaks } from './text.js';

const MENTIONS = [
    { username: 'onatcalik', full_name: 'Onat Çalık' },
    { username: 'evil', full_name: '<img src=x onerror=alert(1)>' }
];

const render = (text) => renderRichText(text, { mentionedUsers: MENTIONS });

let failures = 0;
function check(name, fn) {
    try {
        fn();
        console.log(`  ok   ${name}`);
    } catch (error) {
        failures += 1;
        console.log(`  FAIL ${name}\n       ${error.message.split('\n')[0]}`);
    }
}

console.log('escaping');
check('escapeHtml covers all five entities', () => {
    assert.equal(escapeHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
});
check('escapeHtml tolerates null/undefined', () => {
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
});
check('escapeHtmlWithBreaks keeps line structure', () => {
    assert.equal(escapeHtmlWithBreaks('a\nb'), 'a<br>b');
});

console.log('\nsafety — nothing a user types may become markup');
check('script tags are inert', () => {
    assert.equal(render('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
});
check('event handlers are inert', () => {
    assert.equal(render('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
});
check('quotes cannot break out of an attribute', () => {
    assert.ok(!render('" onmouseover="alert(1)').includes('onmouseover="alert'));
});
check('javascript: is never linked', () => {
    const html = render('[x](javascript:alert(1))');
    assert.ok(!html.includes('href'), html);
});
check('markup inside code stays escaped', () => {
    assert.equal(render('`<script>x</script>`'), '<code>&lt;script&gt;x&lt;/script&gt;</code>');
});
check('a hostile mention display name is escaped', () => {
    // The name comes from API data, not the comment body — it needs its own pass.
    const html = render('@evil');
    assert.ok(html.includes('&lt;img src=x'), html);
    assert.ok(!html.includes('<img'), html);
});
check('park tokens cannot be forged from user text', () => {
    const html = render('a0b');
    assert.ok(!html.includes('<'), html);
});

console.log('\nformatting');
check('bold', () => assert.equal(render('bu **önemli** konu'), 'bu <strong>önemli</strong> konu'));
check('italic, both markers', () => assert.equal(render('*a* ve _b_'), '<em>a</em> ve <em>b</em>'));
check('strikethrough', () => assert.equal(render('~~eski~~'), '<s>eski</s>'));
check('inline code', () => assert.equal(render('`kod`'), '<code>kod</code>'));
check('red marker', () => assert.equal(render('!!ACİL!!'), '<span class="rt-critical">ACİL</span>'));
check('green marker', () => assert.equal(render('++uygun++'), '<span class="rt-positive">uygun</span>'));
check('bulleted list', () => {
    assert.equal(render('- a\n- b'), '<ul><li>a</li><li>b</li></ul>');
});
check('numbered list', () => {
    assert.equal(render('1. a\n2. b'), '<ol><li>a</li><li>b</li></ol>');
});
check('line breaks inside a paragraph', () => {
    assert.equal(render('a\nb'), 'a<br>b');
});
check('urls autolink and keep their query string escaped', () => {
    const html = render('https://gemkom.com/r?a=1&b=2');
    assert.ok(html.includes('href="https://gemkom.com/r?a=1&amp;b=2"'), html);
    assert.ok(html.includes('rel="noopener noreferrer"'), html);
});
check('trailing punctuation stays outside the link', () => {
    assert.ok(render('bkz https://gemkom.com.').endsWith('</a>.'), render('bkz https://gemkom.com.'));
});
check('mentions resolve to full names', () => {
    assert.equal(render('@onatcalik'), '<span class="mention-badge">@Onat Çalık</span>');
});
check('an unknown mention falls back to the username', () => {
    assert.equal(render('@ghost'), '<span class="mention-badge">@ghost</span>');
});

console.log('\npredictability — markers must not fire by accident');
check('a stray !! is left alone', () => assert.equal(render('harika!! sonra'), 'harika!! sonra'));
check('arithmetic asterisks are left alone', () => assert.equal(render('3 * 4 * 5'), '3 * 4 * 5'));
check('a decorative *** run is left alone', () => {
    // Seen in real threads: "*** Ø177,8 x 28 ---- ..." must not become <em>*</em>
    assert.equal(render('*** Ø177,8 x 28'), '*** Ø177,8 x 28');
});
check('single-character italic still works', () => assert.equal(render('*a*'), '<em>a</em>'));
check('an unclosed marker is left alone', () => assert.equal(render('**yarım'), '**yarım'));
check('markers do not cross lines', () => {
    assert.equal(render('**a\nb**'), '**a<br>b**');
});
check('markers inside a url stay literal', () => {
    const html = render('https://x.com/a_b_c');
    assert.ok(html.includes('a_b_c</a>'), html);
});
check('empty input renders nothing', () => {
    assert.equal(render('   '), '');
    assert.equal(render(null), '');
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);

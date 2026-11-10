import { describe, expect, it } from 'vitest';
import { answerHtml } from './NeoChat';

describe('answerHtml', () => {
  it('copies the answer without the table footer, leaving the page as it was', () => {
    const node = document.createElement('div');
    node.innerHTML =
      '<table><tr><td>293-10</td></tr></table>' +
      '<div data-copy-skip><span>1 satır</span><button>Excel</button></div><p>Son.</p>';
    const html = answerHtml(node);
    expect(html).toContain('<table>');
    expect(html).toContain('<p>Son.</p>');
    expect(html).not.toContain('satır');
    expect(html).not.toContain('Excel');
    expect(node.querySelector('[data-copy-skip]')).not.toBeNull();
  });
});

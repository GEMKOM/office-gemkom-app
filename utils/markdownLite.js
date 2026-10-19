/**
 * Markdown rendering for model-written reports (the Tahmin raporu).
 *
 * Same contract as utils/richText.js: the text is escaped FIRST and every
 * tag in the output was written by this module, so nothing in the source can
 * survive as markup. Unlike richText, which renders what people type in
 * comments, this handles the document structure a report needs: headings,
 * pipe tables, lists, block quotes, rules, bold / italic / code, and links
 * only in the explicit `[text](https://…)` form. Square-bracket citations
 * such as `[Çizim C1602 sh.2]` are left exactly as written.
 */
import { escapeHtml } from './text.js';

const NUMERIC_CELL = /^[-+−]?\s*[\d.,]+(\s*(%|€|kg|m|h|ad|adet))?$/;

function inline(text) {
    let out = escapeHtml(text);
    const parked = [];
    const park = (html) => `${parked.push(html) - 1}`;

    out = out.replace(/`([^`\n]+)`/g, (_, code) => park(`<code>${code}</code>`));
    // [text](https://…) — the href is already escaped; only http(s) is accepted.
    out = out.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, href) =>
        park(`<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`));
    out = out
        .replace(/\*\*(?=\S)([^\n]*?\S)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[\s(>])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?=[\s.,;:)!?<]|$)/g, '$1<em>$2</em>')
        .replace(/~~(?=\S)([^\n]*?\S)~~/g, '<s>$1</s>');
    return out.replace(/(\d+)/g, (_, i) => parked[Number(i)]);
}

function isTableLine(line) {
    const s = line.trim();
    return s.startsWith('|') && s.lastIndexOf('|') > 0;
}

function isSeparatorRow(cells) {
    return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c.trim()) || c.trim() === '')
        && cells.some((c) => c.includes('-'));
}

function splitRow(line) {
    return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

function renderTable(lines) {
    const rows = lines.map(splitRow);
    let header = null;
    let aligns = [];
    let body = rows;
    if (rows.length >= 2 && isSeparatorRow(rows[1])) {
        header = rows[0];
        aligns = rows[1].map((c) => {
            const s = c.trim();
            if (s.startsWith(':') && s.endsWith(':')) return 'center';
            if (s.endsWith(':')) return 'right';
            return null;
        });
        body = rows.slice(2);
    }
    const cell = (tag, text, i) => {
        const align = aligns[i] || (i > 0 && NUMERIC_CELL.test(text.replace(/\*/g, '')) ? 'right' : null);
        return `<${tag}${align ? ` class="text-${align === 'center' ? 'center' : align === 'right' ? 'end' : 'start'}"` : ''}>${inline(text)}</${tag}>`;
    };
    const thead = header ? `<thead><tr>${header.map((c, i) => cell('th', c, i)).join('')}</tr></thead>` : '';
    const tbody = `<tbody>${body.map((r) => `<tr>${r.map((c, i) => cell('td', c, i)).join('')}</tr>`).join('')}</tbody>`;
    return `<div class="table-responsive md-table"><table class="table table-sm">${thead}${tbody}</table></div>`;
}

/**
 * Render markdown as safe HTML.
 * @param {string} source
 * @param {object} [options]
 * @param {number} [options.headingOffset=0] shift heading levels (1 turns `#` into `<h2>`)
 * @returns {string}
 */
export function renderMarkdown(source, { headingOffset = 0 } = {}) {
    const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let paragraph = [];
    let list = null;      // { type, items }
    let quote = [];

    const flushParagraph = () => {
        if (paragraph.length) {
            out.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
            paragraph = [];
        }
    };
    const flushList = () => {
        if (list) {
            out.push(`<${list.type}>${list.items.map((it) => `<li>${it}</li>`).join('')}</${list.type}>`);
            list = null;
        }
    };
    const flushQuote = () => {
        if (quote.length) {
            out.push(`<blockquote>${renderMarkdown(quote.join('\n'), { headingOffset })}</blockquote>`);
            quote = [];
        }
    };
    const flushAll = () => { flushParagraph(); flushList(); flushQuote(); };

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!trimmed) { flushAll(); continue; }

        if (isTableLine(line)) {
            flushAll();
            const block = [];
            while (i < lines.length && isTableLine(lines[i])) { block.push(lines[i]); i += 1; }
            i -= 1;
            out.push(renderTable(block));
            continue;
        }

        const heading = trimmed.match(/^(#{1,6})\s+(.*?)\s*#*$/);
        if (heading) {
            flushAll();
            const level = Math.min(6, heading[1].length + headingOffset);
            out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
            continue;
        }

        if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) { flushAll(); out.push('<hr>'); continue; }

        if (trimmed.startsWith('>')) {
            flushParagraph(); flushList();
            quote.push(trimmed.replace(/^>\s?/, ''));
            continue;
        }
        flushQuote();

        const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
        const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
        const item = bullet || numbered;
        if (item) {
            flushParagraph();
            const type = bullet ? 'ul' : 'ol';
            if (!list || list.type !== type) { flushList(); list = { type, items: [] }; }
            list.items.push(inline(item[1]));
            continue;
        }
        // a wrapped list item continues the previous one
        if (list && /^\s{2,}\S/.test(line)) {
            list.items[list.items.length - 1] += ` ${inline(trimmed)}`;
            continue;
        }
        flushList();
        paragraph.push(trimmed);
    }
    flushAll();
    return out.join('\n');
}

/**
 * RAG helpers: the server sends the word ('green'|'orange'|'red'|'grey'), the
 * client only maps it to classes. Trend badges are chosen by business meaning
 * (goodWhen), never by direction alone.
 */
import { escapeHtml, pf } from './util.js';

const RAG_WORDS = new Set(['green', 'orange', 'red', 'grey', 'blue', 'purple']);

export function ragWord(word) {
    return RAG_WORDS.has(word) ? word : 'grey';
}

/** .pp-tile stripe class. */
export function ragClass(word) {
    return `pp-tile-${ragWord(word)}`;
}

/** Number colour class inside a tile ('' for neutral). */
export function numClass(word) {
    const w = ragWord(word);
    return w === 'red' || w === 'orange' || w === 'green' ? `pp-num-${w}` : '';
}

const RAG_TEXT = { green: 'İyi', orange: 'Dikkat', red: 'Kritik', grey: 'Veri yok', blue: 'Bilgi', purple: 'Bakım' };

/** Status badge for a RAG word (text defaults to the Turkish verdict). */
export function ragBadge(word, text = null, title = '') {
    const w = ragWord(word);
    const t = title ? ` title="${escapeHtml(title)}"` : '';
    return `<span class="status-badge status-${w} dash-badge"${t}>${escapeHtml(text || RAG_TEXT[w])}</span>`;
}

export function ragText(word) {
    return RAG_TEXT[ragWord(word)];
}

/** {diff, pct, dir} like overview.js trendDir (null-safe). */
export function trendDir(cur, prev) {
    const c = pf(cur), p = pf(prev);
    if (c === null || p === null) return null;
    const diff = c - p;
    const pctv = p !== 0 ? (diff / Math.abs(p)) * 100 : null;
    return { diff, pct: pctv, dir: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat' };
}

/** '↑ 12%' / '↓ 8%' / '→'; '' when a side is missing. */
export function trendArrow(cur, prev) {
    const t = trendDir(cur, prev);
    if (!t) return '';
    if (t.dir === 'flat') return '→';
    const pctStr = t.pct !== null ? ` ${Math.abs(t.pct).toFixed(0)}%` : '';
    return t.dir === 'up' ? `↑${pctStr}` : `↓${pctStr}`;
}

/**
 * Trend badge, class by meaning: goodWhen='up' (throughput) or 'down' (overtime, lateness).
 * flat → trend-flat; small-n: pass minPrev to render flat/grey when the baseline is too small.
 */
export function trendBadge(cur, prev, { goodWhen = 'up', minPrev = 0, title = '' } = {}) {
    const t = trendDir(cur, prev);
    if (!t) return '';
    const p = pf(prev);
    const arrow = trendArrow(cur, prev);
    let cls = 'trend-flat';
    if (t.dir !== 'flat' && Math.abs(p) >= minPrev) {
        const good = (t.dir === goodWhen);
        cls = good ? 'trend-up-good' : 'trend-down-bad';
    }
    const tt = title ? ` title="${escapeHtml(title)}"` : '';
    return `<span class="trend-badge ${cls}"${tt}>${escapeHtml(arrow)}</span>`;
}

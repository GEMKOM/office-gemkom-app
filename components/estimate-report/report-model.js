/**
 * Tahmin raporu — what the report view shows, derived from one report
 * payload (GET /estimator/estimates/{id}/). Pure functions, no DOM, so the
 * parsing can be checked in Node against real payloads.
 *
 * The markdown follows the backend prompt's fixed outline (estimator
 * services/report.py): `## 1. Özet`, `## 2. Maliyet tablosu` with
 * `### 2.1 Malzeme`, `### 2.2 İşçilik`, `### 2.3 …`, `## 3. Teklif önerisi`
 * ("Önerilen fiyat:" / "Taban fiyat:" lines), `## 4. Dikkat noktaları` with
 * one `###` per department, `## 5. Teklif öncesi istenecekler`. Sections are
 * found by number first and by title second, and anything else (an extra
 * `## 6.` or a preamble) is kept, never dropped.
 */

/** Number in Turkish format ("1.161.600", "2,20"); "—" when empty. */
export function fmt(value, digits = 0) {
    if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
    return Number(value).toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Turkish or plain number in a text → Number ("1.161.600" → 1161600, "2,20" → 2.2). */
export function parseTrNumber(text) {
    if (text === null || text === undefined) return null;
    if (typeof text === 'number') return Number.isFinite(text) ? text : null;
    const m = String(text).replace(/ /g, ' ').match(/([-−]?)\s*%?\s*(\d[\d.,]*)/);
    if (!m) return null;
    let s = `${m[1] ? '-' : ''}${m[2].replace(/[.,]$/, '')}`;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;

/**
 * Split the report markdown at its headings.
 * @returns {{title: string, preamble: string, sections: Array<{num: string|null, title: string, body: string,
 *   subs: Array<{num: string|null, title: string, body: string}>}>}}
 */
export function splitMarkdown(markdown) {
    const out = { title: '', preamble: '', sections: [] };
    const pre = [];
    let section = null;
    let body = pre;
    String(markdown || '').replace(/\r\n?/g, '\n').split('\n').forEach((line) => {
        const h = line.match(HEADING);
        if (!h) { body.push(line); return; }
        const level = h[1].length;
        const text = h[2].replace(/\*\*/g, '').trim();
        if (level === 1) {
            if (!out.title && !section) { out.title = text; return; }
            body.push(line);
            return;
        }
        if (level === 2) {
            const m = text.match(/^(\d+)[.)]?\s+(.*)$/);
            section = { num: m ? m[1] : null, title: m ? m[2] : text, body: '', subs: [], _lines: [] };
            out.sections.push(section);
            body = section._lines;
            return;
        }
        if (!section) { body.push(line); return; }
        if (level > 3) {   // deeper headings stay inside their parent block
            body.push(line);
            return;
        }
        const m = text.match(/^(\d+(?:\.\d+)+)\.?\s+(.*)$/);
        const sub = { num: m ? m[1] : null, title: m ? m[2] : text, body: '', _lines: [] };
        section.subs.push(sub);
        body = sub._lines;
    });
    out.preamble = pre.join('\n').trim();
    out.sections.forEach((s) => {
        s.body = s._lines.join('\n').trim();
        delete s._lines;
        s.subs.forEach((x) => { x.body = x._lines.join('\n').trim(); delete x._lines; });
    });
    return out;
}

/** A section body as table / text blocks, in order. */
export function mdBlocks(body) {
    const blocks = [];
    let cur = null;
    String(body || '').split('\n').forEach((line) => {
        const type = /^\s*\|.*\|\s*$/.test(line) ? 'table' : 'text';
        if (!cur || cur.type !== type) { cur = { type, lines: [] }; blocks.push(cur); }
        cur.lines.push(line);
    });
    return blocks.map((b) => ({ type: b.type, text: b.lines.join('\n') })).filter((b) => b.text.trim());
}

/** Rows of a pipe-table block (header first, separator dropped, ** removed). */
export function tableRows(text) {
    return String(text || '').split('\n')
        .map((l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.replace(/\*\*/g, '').trim()))
        .filter((cells) => !cells.every((c) => /^:?-{2,}:?$/.test(c) || c === ''));
}

/** The body without its first table (when that table is shown from structured data). */
export function withoutFirstTable(body) {
    let dropped = false;
    return mdBlocks(body).filter((b) => {
        if (!dropped && b.type === 'table') { dropped = true; return false; }
        return true;
    }).map((b) => b.text).join('\n\n').trim();
}

/** Text after "Label:" on the first line matching `labelRe` (bold markers removed). */
export function labeledLine(body, labelRe) {
    const line = String(body || '').split('\n').find((l) => labelRe.test(l.replace(/\*/g, '')));
    if (!line) return null;
    const clean = line.replace(/\*\*/g, '').replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim();
    const idx = clean.search(labelRe);
    const after = clean.slice(idx).replace(labelRe, '');
    return after.replace(/^\s*[:：]\s*/, '').trim();
}

const NUM = '(\\d[\\d.,]*\\d|\\d)';

/** "Önerilen fiyat: 193.600 €/adet (toplam 1.161.600 €; 3,21 €/kg)" → total / per unit / per kg. */
export function parsePrice(body, labelRe, quantity) {
    const rest = labeledLine(body, labelRe);
    if (rest === null) return null;
    const perUnitM = rest.match(new RegExp(`${NUM}\\s*€?\\s*\\/\\s*adet`, 'i'));
    const totalM = rest.match(new RegExp(`toplam[^0-9\\n]{0,12}${NUM}`, 'i'));
    const perKgM = rest.match(new RegExp(`${NUM}\\s*€\\s*\\/\\s*kg`, 'i'));
    const firstM = rest.match(new RegExp(NUM));
    let perUnit = perUnitM ? parseTrNumber(perUnitM[1]) : null;
    let total = totalM ? parseTrNumber(totalM[1]) : null;
    if (total === null && firstM && !(perUnitM && perUnitM.index === firstM.index)) total = parseTrNumber(firstM[1]);
    let computed = null;
    const q = Number(quantity) || null;
    if (total === null && perUnit !== null && q) { total = perUnit * q; computed = 'total'; }
    if (perUnit === null && total !== null && q) { perUnit = total / q; computed = 'perUnit'; }
    if (total === null && perUnit === null) return null;
    return { total, perUnit, perKg: perKgM ? parseTrNumber(perKgM[1]) : null, computed, text: rest };
}

/** "Taşeron (karma). Benzer…" → {key: 'subcontract', label: 'Taşeron (karma)'}. */
export function routeOf(text) {
    if (!text) return null;
    const first = text.split(/(?<=[.;])\s/)[0].replace(/[.;]\s*$/, '').trim();
    const sub = first.search(/taşeron/i);
    const inh = first.search(/iç imalat|şirket içi/i);
    let key = null;
    if (sub >= 0 && (inh < 0 || sub < inh)) key = 'subcontract';
    else if (inh >= 0) key = 'in_house';
    return { key, label: first.length > 60 ? `${first.slice(0, 57)}…` : first };
}

/** §1: the risk list under "En önemli 3 risk" and whatever else is not the summary table. */
function splitSummary(body) {
    const lines = String(body || '').split('\n');
    const start = lines.findIndex((l) => /önemli.*risk|risk(ler)?\s*[:：]?\s*$/i.test(l.replace(/\*/g, '')) && !/^\s*\|/.test(l));
    let risks = '';
    let rest = body || '';
    if (start >= 0) {
        let end = start + 1;
        while (end < lines.length && (lines[end].trim() === '' || /^\s*(?:[-*•]|\d+[.)])\s+/.test(lines[end]) || /^\s{2,}\S/.test(lines[end]))) {
            if (lines[end].trim() === '' && end + 1 < lines.length && !/^\s*(?:[-*•]|\d+[.)])\s+/.test(lines[end + 1]) && !/^\s{2,}\S/.test(lines[end + 1])) break;
            end += 1;
        }
        risks = lines.slice(start + 1, end).join('\n').trim();
        rest = [...lines.slice(0, start), ...lines.slice(end)].join('\n');
    }
    return { risks, rest: withoutFirstTable(rest) };
}

function findSection(sections, num, titleRe) {
    return sections.find((s) => s.num === num) || sections.find((s) => titleRe.test(s.title)) || null;
}

function findSub(section, num, titleRe) {
    if (!section) return null;
    return section.subs.find((s) => s.num === num) || section.subs.find((s) => titleRe.test(s.title)) || null;
}

function pickRow(row, re) {
    const key = Object.keys(row || {}).find((k) => re.test(k));
    return key ? row[key] : null;
}

/** "361.769 (BOM P13012 sh.1)" → "BOM P13012 sh.1" */
function basisOf(text) {
    const m = String(text || '').match(/[([](.+)[)\]]\s*$/);
    return m ? m[1].trim() : '';
}

/**
 * Everything the done-report view needs, in one object.
 */
export function reportModel(report) {
    const r = report || {};
    const md = splitMarkdown(r.markdown || '');
    const s1 = findSection(md.sections, '1', /özet/i);
    const s2 = findSection(md.sections, '2', /maliyet/i);
    const s3 = findSection(md.sections, '3', /teklif önerisi/i);
    const s4 = findSection(md.sections, '4', /dikkat/i);
    const s5 = findSection(md.sections, '5', /istenecek|soru/i);
    const known = new Set([s1, s2, s3, s4, s5].filter(Boolean));
    const extra = md.sections.filter((s) => !known.has(s));

    const row = r.hours?.summary?.summary_row || {};
    const quantity = parseTrNumber(r.hours?.quantity) ?? parseTrNumber(pickRow(row, /^adet/i));
    const unitKg = parseTrNumber(pickRow(row, /^birim kg/i)) ?? parseTrNumber(r.weld_schedule?.unit_mass_kg);
    const totalKgText = pickRow(row, /^toplam kg/i);
    const totalKg = parseTrNumber(totalKgText) ?? (unitKg && quantity ? unitKg * quantity : null);

    const s3body = s3?.body || '';
    let price = parsePrice(s3body, /önerilen fiyat/i, quantity);
    let floor = parsePrice(s3body, /taban fiyat/i, quantity);
    if (!price) {
        const fromRow = pickRow(row, /önerilen fiyat/i);
        price = fromRow ? parsePrice(`Önerilen fiyat: ${fromRow}`, /önerilen fiyat/i, quantity) : null;
    }
    if (!price && r.hours?.summary?.suggested_price_eur != null) {
        price = { total: null, perUnit: null, perKg: null, computed: null, raw: Number(r.hours.summary.suggested_price_eur) };
    }
    if (!floor && r.hours?.summary?.floor_price_eur != null) {
        floor = { total: null, perUnit: null, perKg: null, computed: null, raw: Number(r.hours.summary.floor_price_eur) };
    }
    if (price && price.perKg == null && price.total != null && totalKg) price.perKg = price.total / totalKg;

    const ct = r.cost_table || {};
    const routes = (ct.routes && ct.routes.length) ? ct.routes : (ct.found ? ['in_house'] : []);
    let basis = routeOf(labeledLine(s3body, /dayandığı rota/i));
    if (!basis?.key && routes.length === 1) basis = { key: routes[0], label: basis?.label || '' };
    const marginText = labeledLine(s3body, /hedef marj/i);
    const targetMargin = marginText !== null ? (marginText.match(/%\s?\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s?%/) || [null])[0] : null;

    const expected = ct.expected_total || {};
    const basisCost = basis?.key ? expected[basis.key] : null;
    const margin = price?.total && basisCost ? (price.total - basisCost) / price.total : null;

    const summary = splitSummary(s1?.body || '');
    const s21 = findSub(s2, '2.1', /malzeme/i);
    const s22 = findSub(s2, '2.2', /işçilik/i);
    const s23 = findSub(s2, '2.3', /taşeron|genel gider/i);
    const s2rest = s2 ? s2.subs.filter((x) => ![s21, s22, s23].includes(x)) : [];

    // "Benzer işler" table of §2 (the model's picks) → the job numbers it cites.
    const s2Blocks = mdBlocks(s2?.body || '');
    const similarBlock = s2Blocks.filter((b) => b.type === 'table')[1] || null;
    const citedJobs = new Set();
    if (similarBlock) {
        tableRows(similarBlock.text).slice(1).forEach((cells) => {
            const m = (cells[0] || '').match(/\d{3}-\d{2,3}(?:-\d{2,3})?/);
            if (m) citedJobs.add(m[0]);
        });
    }
    // §2 intro without the cost table and the similar-jobs table (and its "Benzer işler" caption).
    const s2Intro = s2Blocks.filter((b, i) => {
        if (b.type === 'table') return false;
        const next = s2Blocks[i + 1];
        return !(next && next === similarBlock && /^\s*\**\s*benzer işler\s*\**\s*$/i.test(b.text.trim()));
    }).map((b) => b.text).join('\n\n').trim();

    return {
        title: md.title,
        preamble: md.preamble,
        md,
        quantity,
        unitKg,
        totalKg,
        totalKgBasis: basisOf(totalKgText),
        part: pickRow(row, /^parça/i),
        termin: pickRow(row, /^termin/i),
        price,
        floor,
        basis,
        targetMargin,
        margin,
        routes,
        risks: summary.risks,
        summaryRest: summary.rest,
        sections: { ozet: s1, maliyet: s2, teklif: s3, dikkat: s4, sorular: s5, malzeme: s21, iscilik: s22, dayanak: s23 },
        maliyetIntro: s2Intro,
        maliyetSimilarTable: similarBlock ? similarBlock.text : '',
        maliyetOtherSubs: s2rest,
        citedJobs,
        extra,
    };
}

// ---------------------------------------------------------------- hours

export const NON_WELDING_LABELS = {
    cutting: 'Parça kesimi', bending: 'Büküm / hadde', bevel_and_pt: 'Talaşlı ağız açma + PT',
    fitup_hydrotest_cleaning: 'Çatma, fikstür, test, temizlik',
};
export const UNIT_LABELS = {
    'h/m': 'h/m', 'h/joint': 'h/birleşim', 'h/piece': 'h/parça', 'h/bend': 'h/büküm',
    'h/pressure joint': 'h/basınçlı birleşim', 'h/kg': 'h/kg',
};
export const EXCLUSION_LABELS = {
    'excluded by review': 'İnceleme ile hariç',
    'no recorded hours': 'Kayıtlı saat yok',
    'built by a subcontractor': 'Taşeronda yapılmış',
    'subcontracted': 'Taşeronda yapılmış',
    'not subcontracted': 'Taşerona verilmemiş',
};

export function exclusionLabel(reason) {
    if (!reason) return '';
    if (EXCLUSION_LABELS[reason]) return EXCLUSION_LABELS[reason];
    if (String(reason).startsWith('unreliable')) return 'Güvenilmez saat kaydı (≤ 10 h)';
    return reason;
}

/** Bottom-up hours of one unit grouped for reading: welding by joint type × material, then the other steps. */
export function hoursBreakdown(bottomUp) {
    const bu = bottomUp || {};
    const groups = new Map();
    (bu.lines || []).forEach((l) => {
        const key = `${l.joint_type || 'other'}|${l.material || 'other'}`;
        const g = groups.get(key) || { joint_type: l.joint_type, material: l.material, qty: 0, hours: 0, unit: l.unit, unit_h: new Set(), count: 0 };
        g.qty += Number(l.qty) || 0;
        g.hours += Number(l.hours) || 0;
        g.unit_h.add(l.unit_h);
        g.count += 1;
        groups.set(key, g);
    });
    const welding = [...groups.values()].sort((a, b) => b.hours - a.hours).map((g) => ({
        ...g, unit_h: g.unit_h.size === 1 ? [...g.unit_h][0] : null,
    }));
    const other = (bu.non_welding_lines || []).map((l) => ({ ...l, label: NON_WELDING_LABELS[l.step] || l.step }));
    return { welding, other, total: Number(bu.total_h) || 0, weldingTotal: Number(bu.welding_h) || 0, otherTotal: Number(bu.non_welding_h) || 0 };
}

/** Similar job as a table row: €/kg figures and the realised margin. */
export function similarRow(job) {
    const w = Number(job.weight_kg) || 0;
    const sell = job.selling_price_eur != null ? Number(job.selling_price_eur) : null;
    const cost = job.actual_total_cost_eur != null ? Number(job.actual_total_cost_eur) : null;
    return {
        ...job,
        sell_per_kg: sell != null && w ? sell / w : null,
        margin: sell && cost != null ? (sell - cost) / sell : null,
    };
}

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
//
// Two payload shapes are in the wild. Up to v3 the hours came from standard
// unit times (`hours.unit_times_h_per_m`, `non_welding`, step
// `fitup_hydrotest_cleaning`). From `hours.method === 'geometry_v4'` each
// joint is priced from its own geometry (thickness, prep, throat, factors on
// every bottom-up line), the non-welding steps are cutting / bending /
// bevel_and_pt / handling / hydrotest (hydrotest `applies: false` when the
// unit is not pressure-bearing), and the in-house calibration may have no
// usable reference (`no_in_house_reference`: factor 1,0, no low/high band).

export const NON_WELDING_LABELS = {
    cutting: 'Kesim', bending: 'Büküm', bevel_and_pt: 'Ağız açma + PT', handling: 'Çatma/çevirme/temizlik',
    hydrotest: 'Hidrotest', fitup_hydrotest_cleaning: 'Çatma, hidrotest, temizlik',
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
export const GEOMETRY_SOURCE_LABELS = { fields: 'çıkarım alanlarından', text: 'ölçü metninden', default: 'varsayılan (okunamadı)' };

/** Why a reference was left out, in Turkish. `row` supplies `subcontracted_kg_share` when the text has no number. */
export function exclusionLabel(reason, row = null) {
    if (!reason) return '';
    if (EXCLUSION_LABELS[reason]) return EXCLUSION_LABELS[reason];
    const r = String(reason);
    if (r.startsWith('unreliable')) return 'Güvenilmez saat kaydı (≤ 10 h)';
    if (r.startsWith('mostly subcontracted')) {
        const m = r.match(/(\d+(?:[.,]\d+)?)\s*%/);
        const share = m ? parseTrNumber(m[1]) : (row?.subcontracted_kg_share != null ? Number(row.subcontracted_kg_share) * 100 : null);
        return share != null ? `Kilosunun %${fmt(share, 0)}'i taşeronda kaynaklanmış` : 'Kilosunun çoğu taşeronda kaynaklanmış';
    }
    return reason;
}

/** True for the manufacturing-plan method (v5): the bottom-up carries work centres. */
export function isPlanBottomUp(bottomUp) {
    const bu = bottomUp || {};
    return bu.method === 'plan_v5' || Array.isArray(bu.work_centres);
}

/** Which hours method the payload carries, and whether the in-house factor had a reference. */
export function hoursInfo(hours) {
    const h = hours || {};
    const cal = h.calibration?.in_house || {};
    return {
        plan: h.method === 'plan_v5' || isPlanBottomUp(h.bottom_up),
        geometry: h.method === 'geometry_v4' || h.method === 'plan_v5' || (h.bottom_up?.lines || []).some((l) => l.geometry_source != null),
        noInHouseRef: Boolean(h.no_in_house_reference || cal.no_reference),
        noMachRef: Boolean(h.no_machining_reference || h.calibration?.machining?.no_reference),
    };
}

/**
 * Bottom-up hours of one unit grouped for reading: welding by joint type ×
 * material (plan payloads also split by prep and source, so every row has
 * one "Kaynak" badge), then the other steps. Plan lines keep the server's
 * Turkish `label`, `driver` and `work_centre`; older payloads get the label
 * from NON_WELDING_LABELS, as before.
 */
export function hoursBreakdown(bottomUp) {
    const bu = bottomUp || {};
    const plan = isPlanBottomUp(bu);
    const groups = new Map();
    (bu.lines || []).forEach((l) => {
        const source = l.source || 'drawn';
        const key = plan ? `${l.joint_type || 'other'}|${l.material || 'other'}|${l.prep || ''}|${source}` : `${l.joint_type || 'other'}|${l.material || 'other'}`;
        const g = groups.get(key) || {
            joint_type: l.joint_type, material: l.material, prep: l.prep || null, source: plan ? source : null,
            qty: 0, hours: 0, unit: l.unit, unit_h: new Set(), count: 0, joints: 0, sub_ids: new Set(), thickness: new Set(),
        };
        g.qty += Number(l.qty) || 0;
        g.hours += Number(l.hours) || 0;
        g.unit_h.add(l.unit_h);
        g.count += 1;
        g.joints += Number(l.count) || 0;
        if (l.sub_id) g.sub_ids.add(l.sub_id);
        if (l.thickness_mm != null) g.thickness.add(Number(l.thickness_mm));
        groups.set(key, g);
    });
    // Geometry-priced lines each have their own time per metre: show the group's average then.
    const welding = [...groups.values()].sort((a, b) => b.hours - a.hours).map((g) => {
        const single = g.unit_h.size === 1;
        return {
            ...g,
            unit_h: single ? [...g.unit_h][0] : (g.qty ? g.hours / g.qty : null),
            averaged: !single,
            sub_ids: [...g.sub_ids],
            thickness: [...g.thickness].sort((a, b) => a - b),
        };
    });
    const other = (bu.non_welding_lines || []).map((l) => ({
        ...l, label: l.label || NON_WELDING_LABELS[l.step] || l.step, applies: l.applies !== false,
    }));
    return {
        plan,
        welding,
        other,
        total: Number(bu.total_h) || 0,
        weldingTotal: Number(bu.welding_h) || 0,
        otherTotal: Number(bu.non_welding_h) || 0,
        weldMetalKg: bu.weld_metal_kg != null ? Number(bu.weld_metal_kg) : null,
        setupH: bu.setup_h != null ? Number(bu.setup_h) : null,
        geometrySources: bu.geometry_sources || null,
    };
}

// ---------------------------------------------------------------- manufacturing plan (v5)
//
// From `hours.method === 'plan_v5'` the extraction is a manufacturing plan
// (schema 2: sub-assemblies, parts, machining features) and the bottom-up
// prices every work centre: shop (fit-up, welding, grinding, straightening,
// handling, assembly, hydrotest, rework, PWHT handling), mach (machining,
// rework, waiting), cnc (cutting, bevel), bend, qc (NDT). `hours.distribution`
// applies one factor per centre (shop: in-house references, mach: machining
// references, the rest 1,0) and sums the expected hours; `hours.bands` checks
// the hours per tonne against the class band; `hours.anchors` carries the
// subcontract-price anchor. Old lists (schema 1) go through an adapter
// (`bottom_up.proxy === true`).

const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

/** Everything the summary header and the İşçilik section say about a plan payload; `{plan: false}` for older shapes. */
export function planInfo(hours) {
    const h = hours || {};
    const bu = h.bottom_up || {};
    if (!(h.method === 'plan_v5' || isPlanBottomUp(bu))) return { plan: false };
    const dist = h.distribution || {};
    const rows = dist.work_centres || [];
    const share = (key) => num(rows.find((r) => r.key === key)?.share);
    const d = bu.deduced || {};
    const pwht = bu.pwht || {};
    return {
        plan: true,
        schemaVersion: Number(h.schema_version ?? bu.schema_version ?? 1) || 1,
        proxy: Boolean(h.proxy_plan ?? bu.proxy),
        structureClass: bu.structure_class || null,
        structureClassLabel: bu.structure_class_label || '',
        planConfidence: num(bu.plan_confidence),
        computedH: num(bu.total_h),
        expectedH: num(dist.expected_h_per_unit),
        lowH: num(dist.low_h_per_unit),
        highH: num(dist.high_h_per_unit),
        computedTotal: num(dist.computed_h_total),
        expectedTotal: num(dist.expected_h_total) ?? num(h.expected_h_total),
        lowTotal: num(dist.low_h_total),
        highTotal: num(dist.high_h_total),
        shares: { shop: share('shop'), mach: share('mach'), cnc: share('cnc'), bend: share('bend'), qc: share('qc') },
        weldM: { total: num(bu.weld_m), drawn: num(bu.weld_m_drawn), deduced: num(bu.weld_m_deduced), rule: num(bu.weld_m_rule), perT: num(bu.weld_m_per_t) },
        deduced: {
            weldM: num(d.weld_m), weldShare: num(d.weld_share), machH: num(d.mach_h), machShare: num(d.mach_share),
            machDefaultH: num(d.mach_default_h), thinDrawingSet: Boolean(d.thin_drawing_set),
        },
        pwht: pwht.required ? { kg: num(pwht.kg), eur: num(pwht.eur), basis: pwht.basis || '' } : null,
        hPerT: { shop: num(bu.h_per_t?.shop), mach: num(bu.h_per_t?.mach), total: num(bu.h_per_t?.total) },
        hPerTBasis: bu.h_per_t_basis ? { kg: num(bu.h_per_t_basis.kg), source: bu.h_per_t_basis.source === 'plan' ? 'plan' : 'unit' } : null,
        massCoverage: massCoverageInfo(bu.mass_coverage),
        scope: h.scope === 'programme' ? 'programme' : 'unit',
        programme: programmeInfo(bu.programme),
        classGate: h.class_gate || null,
        noInHouseRef: Boolean(h.no_in_house_reference || h.calibration?.in_house?.no_reference),
        noMachRef: Boolean(h.no_machining_reference || h.calibration?.machining?.no_reference),
        subAssemblies: bu.sub_assemblies || [],
        partsCount: num(bu.parts_count),
        wage: num(h.labor_eur_per_h),
        machWage: num(h.machining_labor_eur_per_h),
    };
}

/** Does the plan's content weigh what one unit weighs? null when the backend did not say or could not tell
 *  (no unit mass); status 'ok' | 'over' (several variants of a drawing set planned together) | 'under'. */
/** Programme scope: one row per variant (one set and × its BoQ quantity); unplanned variants have no hours. */
export function programmeInfo(p) {
    if (!p || typeof p !== 'object' || !Array.isArray(p.variants) || !p.variants.length) return null;
    return {
        sets: num(p.sets) ?? 0,
        plannedSets: num(p.planned_sets) ?? 0,
        unplanned: Array.isArray(p.unplanned_variants) ? p.unplanned_variants : [],
        unplannedKg: num(p.unplanned_kg) ?? 0,
        variants: p.variants.map((v) => ({
            id: v.variant_id || '',
            name: v.name || v.variant_id || '',
            qty: num(v.qty) ?? 1,
            massKg: num(v.mass_kg_each),
            planned: Boolean(v.planned),
            hPerSet: num(v.h_per_set),
            shopPerSet: num(v.shop_h_per_set),
            machPerSet: num(v.mach_h_per_set),
            totalH: num(v.total_h),
            hPerT: num(v.h_per_t),
            basis: v.basis || '',
        })),
    };
}

export function massCoverageInfo(c) {
    if (!c || typeof c !== 'object' || !['ok', 'over', 'under'].includes(c.status)) return null;
    return { planKg: num(c.plan_kg), unitKg: num(c.unit_kg), ratio: num(c.ratio), status: c.status };
}

/** The work-centre distribution table: one row per centre plus the totals (per unit and for every unit). */
export function distributionRows(hours) {
    const dist = hours?.distribution;
    if (!dist || !Array.isArray(dist.work_centres)) return { rows: [], totals: null };
    const computedTotal = num(dist.computed_h_per_unit) ?? dist.work_centres.reduce((s, r) => s + (num(r.computed_h) || 0), 0);
    const rows = dist.work_centres.map((r) => ({
        key: r.key,
        label: r.label || r.key,
        computedH: num(r.computed_h) ?? 0,
        factor: num(r.factor) ?? 1,
        factorMin: num(r.factor_min),
        factorMax: num(r.factor_max),
        factorBasis: r.factor_basis === 'references' ? 'references' : 'none',
        referencesUsed: Array.isArray(r.references_used) ? r.references_used : [],
        expectedH: num(r.expected_h) ?? 0,
        lowH: num(r.low_h),
        highH: num(r.high_h),
        share: num(r.share) ?? 0,
        computedShare: computedTotal ? (num(r.computed_h) || 0) / computedTotal : 0,
    }));
    return {
        rows,
        totals: {
            computedH: computedTotal,
            expectedH: num(dist.expected_h_per_unit) ?? rows.reduce((s, r) => s + r.expectedH, 0),
            lowH: num(dist.low_h_per_unit),
            highH: num(dist.high_h_per_unit),
            computedTotal: num(dist.computed_h_total),
            expectedTotal: num(dist.expected_h_total),
            lowTotal: num(dist.low_h_total),
            highTotal: num(dist.high_h_total),
            quantity: num(hours?.quantity),
        },
    };
}

/** The machining block of a plan bottom-up: parts with their features and the block totals; null without machining. */
export function machiningRows(bottomUp) {
    const m = bottomUp?.machining;
    if (!m || typeof m !== 'object') return null;
    const parts = (m.parts || []).map((p) => {
        const features = (p.features || []).map((f) => ({
            ...f,
            qty: num(f.qty) ?? 1,
            hEach: num(f.h_each),
            hoursPiece: num(f.hours_piece),
            source: f.source || 'drawn',
            isDefault: f.geometry === 'default' || f.kind === 'op_default',
            afterWelding: Boolean(f.after_welding),
            // The dimension text: `spec` from a real extraction ("Ø100×60 H7 (pafta 4 detay G)"), else the old `basis`.
            text: String(f.spec || f.basis || ''),
        }));
        return {
            partId: p.part_id || '',
            subId: p.sub_id || '',
            part: p.part || p.part_id || '',
            qty: num(p.qty) ?? 1,
            massKgEach: num(p.mass_kg_each),
            perPieceH: num(p.per_piece_h),
            featuresH: num(p.features_h),
            setupH: num(p.setup_h),
            programmingH: num(p.programming_h),
            hours: num(p.hours) ?? 0,
            deducedH: num(p.deduced_h) ?? 0,
            defaultH: num(p.default_h) ?? 0,
            setups: Array.isArray(p.setups) ? p.setups : [],
            features,
            featureCount: features.length,
            defaultCount: features.filter((f) => f.isDefault).length,
            deducedCount: features.filter((f) => f.source !== 'drawn').length,
        };
    }).sort((a, b) => b.hours - a.hours);
    return {
        machiningH: num(m.machining_h) ?? parts.reduce((s, p) => s + p.hours, 0),
        deducedH: num(m.deduced_h) ?? 0,
        defaultH: num(m.default_h) ?? 0,
        parts,
        partsCount: parts.length,
        featuresCount: parts.reduce((s, p) => s + p.featureCount, 0),
        defaultsCount: parts.reduce((s, p) => s + p.defaultCount, 0),
    };
}

/** The tonne-rate gauges (shop, mach) and the subcontract-price anchor of a plan payload. */
export function bandInfo(hours) {
    const b = hours?.bands || {};
    const one = (c) => {
        if (!c || typeof c !== 'object' || (c.h_per_t == null && c.low == null)) return null;
        const status = ['below', 'inside', 'above'].includes(c.status) ? c.status : 'unknown';
        return {
            centre: c.centre,
            structureClass: c.structure_class || null,
            hPerT: num(c.h_per_t),
            low: num(c.low),
            high: num(c.high),
            source: c.source === 'references' ? 'references' : (c.source === 'parameter' ? 'parameter' : null),
            referencesN: num(c.references_n) ?? 0,
            status,
            impliedLow: num(c.implied_h_per_unit?.low),
            impliedHigh: num(c.implied_h_per_unit?.high),
        };
    };
    const a = hours?.anchors || {};
    const unit = a.subcontract_implied_h_per_unit;
    const anchor = unit && (unit.low != null || unit.median != null) ? {
        low: num(unit.low),
        median: num(unit.median),
        high: num(unit.high),
        hPerT: { low: num(a.subcontract_implied_h_per_t?.low), median: num(a.subcontract_implied_h_per_t?.median), high: num(a.subcontract_implied_h_per_t?.high) },
        loadedRate: num(a.subcontract_implied_h_per_t?.loaded_eur_per_h),
        eurPerKg: num(a.subcontract_eur_per_kg?.eur_per_kg),
        eurLow: num(a.subcontract_eur_per_kg?.low),
        eurHigh: num(a.subcontract_eur_per_kg?.high),
        jobs: a.subcontract_eur_per_kg?.jobs || [],
        n: num(a.subcontract_eur_per_kg?.n) ?? 0,
    } : null;
    return { shop: one(b.shop), mach: one(b.mach), anchor };
}

/** The plan table of a v5 bottom-up: one group per work centre with its welding rows, other lines and (mach) the machining block. */
export function planGroups(bottomUp) {
    const bu = bottomUp || {};
    if (!isPlanBottomUp(bu)) return [];
    const b = hoursBreakdown(bu);
    const centres = (bu.work_centres || []).map((wc) => ({ key: wc.key, label: wc.label || wc.key, hours: num(wc.hours) ?? 0, share: num(wc.share) ?? 0 }));
    const machining = machiningRows(bu);
    return centres.map((c) => {
        const lines = b.other.filter((l) => (l.work_centre || 'shop') === c.key && !(c.key === 'mach' && machining && l.step === 'machining'));
        return {
            ...c,
            welding: c.key === 'shop' ? b.welding : [],
            lines,
            machining: c.key === 'mach' ? machining : null,
            machiningLine: c.key === 'mach' ? b.other.find((l) => l.step === 'machining') || null : null,
        };
    });
}

/** "Ø100 × 60 mm · 244 dm²": the dimensions of a machining feature from its numeric fields (older plans); '' when none. */
export function featureDims(f) {
    if (!f) return '';
    const parts = [];
    if (Number(f.dia_mm)) parts.push(`Ø${fmt(f.dia_mm, 0)}${Number(f.dia2_mm) ? `/${fmt(f.dia2_mm, 0)}` : ''}${Number(f.depth_mm) ? ` × ${fmt(f.depth_mm, 0)} mm` : ''}`);
    else if (Number(f.depth_mm)) parts.push(`${fmt(f.depth_mm, 0)} mm derinlik`);
    if (Number(f.length_mm)) parts.push(`${fmt(f.length_mm, 0)}${Number(f.width_mm) ? ` × ${fmt(f.width_mm, 0)}` : ''} mm`);
    if (Number(f.area_dm2)) parts.push(`${fmt(f.area_dm2, 0)} dm²`);
    if (Number(f.removed_cm3)) parts.push(`${fmt(f.removed_cm3, 0)} cm³ talaş`);
    if (Number(f.ra_um)) parts.push(`Ra ${fmt(f.ra_um, 1)}`);
    return parts.join(' · ');
}

/**
 * Parts and sub-assemblies of a plan (weld schedule or report), joined for
 * the "Parçalar ve alt montajlar" table. Every descriptive field is optional:
 * a real extraction has no `basis` on parts / sub-assemblies, no `material`
 * on sub-assemblies, no `length_m` on parts, and its machining features carry
 * a `spec` text instead of numeric dimensions.
 */
export function planParts(schedule) {
    const ws = schedule || {};
    const subs = (ws.sub_assemblies || []).map((s) => ({
        subId: s.sub_id || '',
        name: s.name || s.sub_id || '',
        kind: s.kind || 'other',
        qty: num(s.qty_per_unit) ?? 1,
        massKgEach: num(s.mass_kg_each),
        mainDims: s.main_dims_mm || '',
        governingT: num(s.governing_t_mm),
        material: s.material || '',
        welded: s.welded !== false,
        confidence: num(s.confidence),
        basis: s.basis || '',
        source: s.source || 'drawn',
    }));
    const parts = (ws.parts || []).map((p) => ({
        partId: p.part_id || '',
        subId: p.sub_id || '',
        name: p.name || p.part_id || '',
        kind: p.kind || '',
        qty: num(p.qty_per_unit) ?? 1,
        massKgEach: num(p.mass_kg_each),
        thicknessMm: num(p.thickness_mm),
        lengthM: num(p.length_m),
        material: p.material || '',
        source: p.source || 'drawn',
        basis: p.basis || '',
        machining: (Array.isArray(p.machining) ? p.machining : []).map((f) => ({ ...f, text: String(f.spec || featureDims(f) || ''), note: f.spec ? '' : String(f.basis || '') })),
        machiningCount: Array.isArray(p.machining) ? p.machining.length : 0,
    }));
    return {
        subs,
        parts,
        hasPlan: subs.length > 0 || parts.length > 0,
        partsBySub: parts.reduce((acc, p) => { (acc[p.subId] = acc[p.subId] || []).push(p); return acc; }, {}),
        totalMassKg: subs.reduce((s, x) => s + (x.massKgEach || 0) * x.qty, 0),
        machinedParts: parts.filter((p) => p.machiningCount).length,
    };
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

/** Share of the bar a running report may fill before the server says done. */
export const PROGRESS_CAP = 0.95;

/**
 * The running-state progress of one report payload (`report.progress`, see
 * the backend `EstimateReport.set_progress`) at time `now` (ms): the step
 * list, the bar fill (0..PROGRESS_CAP) and the seconds left. Null when the
 * report carries no progress (queued, or an older run) so the caller keeps
 * the indeterminate bar.
 *
 * Fill = expected seconds of the finished stages + the elapsed seconds of
 * the current stage (never more than that stage's expected seconds, so a
 * slow stage waits at its boundary instead of eating the next one's share),
 * over the expected total. Seconds left = what the current stage still
 * expects + every later stage; 0 means the run is past its expected time.
 */
export function progressModel(progress, now = Date.now()) {
    const stages = progress && Array.isArray(progress.stages) ? progress.stages : null;
    if (!stages || !stages.length) return null;
    const index = Math.min(Math.max(Number(progress.stage_index) || 0, 0), stages.length - 1);
    const expected = (s) => Math.max(0, Number(s.expected_s) || 0);
    const total = stages.reduce((sum, s) => sum + expected(s), 0) || 1;
    const cur = stages[index];
    const startedMs = cur.started_at ? new Date(cur.started_at).getTime() : NaN;
    const stageElapsed = Number.isFinite(startedMs) ? Math.max(0, (now - startedMs) / 1000) : 0;
    const finished = stages.slice(0, index).reduce((sum, s) => sum + expected(s), 0);
    const inStage = Math.min(stageElapsed, expected(cur));
    const later = stages.slice(index + 1).reduce((sum, s) => sum + expected(s), 0);
    const remaining = Math.max(0, expected(cur) - stageElapsed) + later;
    return {
        fraction: Math.min(PROGRESS_CAP, (finished + inStage) / total),
        remainingS: remaining,
        overdue: remaining <= 0,
        steps: stages.map((s, i) => ({
            key: s.key,
            label: s.label,
            state: i < index ? 'done' : i === index ? 'current' : 'pending',
            detail: i === index ? String(progress.detail || '') : '',
        })),
    };
}

/** "~N dk kaldı" (whole minutes, at least 1) or "biraz daha sürüyor" past the expected time. */
export function remainingLabel(model) {
    if (!model) return '';
    if (model.overdue) return 'biraz daha sürüyor';
    return `~${Math.max(1, Math.ceil(model.remainingS / 60))} dk kaldı`;
}

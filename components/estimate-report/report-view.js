/**
 * Tahmin raporu — HTML of a finished report (status done): the summary
 * header, the sticky section nav and one collapsible section per topic.
 * estimate-report.js owns the state, the requests and the events; this file
 * only turns a payload (+ reportModel) and the view state into markup.
 *
 * Every value from the payload is escaped; markdown goes through
 * utils/markdownLite (escape first) and is then only decorated: `[…]`
 * citations become muted chips and `§2.2` references become jump buttons.
 */
import { renderMarkdown } from '../../utils/markdownLite.js';
import { escapeHtml } from '../../utils/text.js';
import { REFERENCE_ROUTE } from '../../apis/estimator.js';
import {
    UNIT_LABELS, exclusionLabel, fmt, hoursBreakdown, similarRow, withoutFirstTable,
} from './report-model.js';

export const COST_ROW_LABELS = {
    material: 'Malzeme', labor: 'İşçilik', subcontractor: 'Taşeron', paint: 'Boya', paint_material: 'Boya Malzemesi',
    general_expenses: 'Genel Giderler', employee_overhead: 'Personel Genel Giderleri', qc: 'Kalite Kontrol',
    shipping: 'Sevkiyat', machine_rental: 'Makine Kirası', other: 'Diğer', total: 'TOPLAM', eur_per_kg: '€/kg',
};

export const JOINT_TYPE_LABELS = {
    pipe_butt: 'Boru alın', pipe_to_cap: 'Boru–kep', pipe_to_elbow: 'Boru–dirsek', pipe_to_plate: 'Boru–sac',
    plate_fillet: 'Sac köşe', plate_butt: 'Sac alın', stitch_fillet: 'Aralıklı köşe', pin_to_plate: 'Pim–sac',
    nozzle_coupling: 'Nozul/manşon', other: 'Diğer',
};
export const MATERIAL_LABELS = { copper: 'Bakır', carbon_steel: 'Çelik', stainless: 'Paslanmaz', copper_to_steel: 'Cu–çelik', other: 'Diğer' };

export const ROUTE_LABELS = { in_house: 'İç imalat', subcontract: 'Taşeron' };

/** The sections of a done report, in page order (nav order). */
export const SECTION_DEFS = [
    { key: 'ozet', label: 'Özet', icon: 'fa-gauge-high' },
    { key: 'maliyet', label: 'Maliyet', icon: 'fa-table-list' },
    { key: 'malzeme', label: 'Malzeme', icon: 'fa-cubes' },
    { key: 'iscilik', label: 'İşçilik', icon: 'fa-user-gear' },
    { key: 'benzer', label: 'Benzer işler', icon: 'fa-clone' },
    { key: 'teklif', label: 'Teklif', icon: 'fa-handshake' },
    { key: 'dikkat', label: 'Dikkat', icon: 'fa-circle-exclamation' },
    { key: 'sorular', label: 'Sorular', icon: 'fa-list-check' },
    { key: 'kaynak', label: 'Kaynak listesi', icon: 'fa-fire-flame-curved' },
    { key: 'metin', label: 'Rapor metni', icon: 'fa-file-lines' },
    { key: 'girdiler', label: 'Girdiler', icon: 'fa-circle-info' },
];

/** Sections closed until the viewer opens them (per-viewer choice is remembered). */
export const DEFAULT_COLLAPSED = ['metin', 'girdiler', 'yontem'];

const SIMILAR_PREVIEW = 8;
const DEPARTMENT_ICONS = [
    [/tasarım|çizim/i, 'fa-pen-ruler'], [/imalat/i, 'fa-industry'], [/kalite/i, 'fa-clipboard-check'],
    [/satın/i, 'fa-cart-shopping'], [/lojistik|sevk/i, 'fa-truck'], [/ticari/i, 'fa-scale-balanced'],
];
const PARAMETER_LABELS = {
    scrap_plate: ['Sac firesi', (v) => `%${fmt(v * 100, 0)}`],
    scrap_tube: ['Boru / uzun ürün firesi', (v) => `%${fmt(v * 100, 0)}`],
    labor_eur_per_h: ['İşçilik ücreti', (v) => `${fmt(v, 2)} €/h`],
    employee_overhead_share: ['Personel genel gider payı', (v) => `%${fmt(v * 100, 0)}`],
    general_expenses_rate_eur_per_kg: ['Genel gider oranı', (v) => `${fmt(v, 2)} €/kg`],
};
const SKIP_REASONS = { too_many_pages: 'sayfa sınırı aşıldı', unreadable: 'okunamadı', unsupported: 'desteklenmeyen biçim' };

// ---------------------------------------------------------------- small helpers

export function money(value, digits = 0) {
    return value == null || Number.isNaN(Number(value)) ? '—' : `${fmt(value, digits)} €`;
}

function pct(value, digits = 0) {
    return value == null || Number.isNaN(Number(value)) ? '—' : `%${fmt(value * 100, digits)}`;
}

function badge(label, cls, title = '') {
    return `<span class="status-badge ${cls}"${title ? ` title="${escapeHtml(title)}"` : ''}>${label}</span>`;
}

/** Weld-list confidence (0–1) as a percentage badge: < 0,4 orange, 0,4–0,5 grey, ≥ 0,5 green (as on Referanslar). */
export function confidenceBadge(value) {
    if (value == null || value === '') return '<span class="text-muted">—</span>';
    const v = Number(value);
    const cls = v < 0.4 ? 'status-orange' : v < 0.5 ? 'status-grey' : 'status-green';
    return badge(`%${fmt(v * 100, 0)}`, cls);
}

function factorBadge(f) {
    if (f == null) return '<span class="text-muted">—</span>';
    const ok = f >= 0.6 && f <= 1.6;
    return badge(fmt(f, 2), ok ? 'status-green' : 'status-orange', ok ? 'Olağan aralıkta (0,6–1,6)' : 'Olağan aralığın (0,6–1,6) dışında');
}

function routeBadge(route) {
    const r = REFERENCE_ROUTE[route];
    return r ? badge(r.label, r.badge) : '<span class="text-muted">—</span>';
}

function similarityCell(s) {
    if (s == null) return '<span class="text-muted">—</span>';
    const w = Math.max(4, Math.min(100, s * 100));
    return `<span class="est-sim"><span class="est-sim-bar"><span style="width:${w.toFixed(0)}%"></span></span>${fmt(s * 100, 0)}</span>`;
}

function shareBar(part, total) {
    if (!total || part == null || !Number(part)) return '<span class="est-share is-empty"></span>';
    const p = Math.max(0, Math.min(1, part / total));
    return `<span class="est-share" title="${fmt(p * 100, 1)}%"><span style="width:${(p * 100).toFixed(1)}%"></span></span><span class="est-share-num">${fmt(p * 100, 0)}%</span>`;
}

function jobLink(no) {
    if (!no) return '';
    return `<a href="/projects/project-tracking/?job_no=${encodeURIComponent(no)}" target="_blank" rel="noopener" class="est-job">${escapeHtml(no)}</a>`;
}

// ---------------------------------------------------------------- markdown

/**
 * Markdown → safe HTML, decorated. `goto(num)` maps a "§2.2" reference to a
 * section key (or null to leave it as text).
 */
export function mdHtml(text, goto, { className = '' } = {}) {
    if (!text || !String(text).trim()) return '';
    return `<div class="est-md ${className}">${decorate(renderMarkdown(text, { headingOffset: 2 }), goto)}</div>`;
}

export function decorate(html, goto) {
    return String(html)
        .replace(/\[([^\]<>\n]{2,160})\]/g, '<span class="est-cite">$1</span>')
        .replace(/§\s?(\d+(?:\.\d+)?)/g, (m, num) => {
            const key = goto ? goto(num) : null;
            return key ? `<button type="button" class="est-sref" data-est-goto="${key}" title="Bölüme git">§${num}</button>` : m;
        });
}

/** Turns a split section back into markdown (its body + its sub-sections). */
function sectionMarkdown(sec, depth = 3) {
    if (!sec) return '';
    const parts = [sec.body || ''];
    (sec.subs || []).forEach((s) => parts.push(`${'#'.repeat(depth)} ${s.num ? `${s.num} ` : ''}${s.title}\n\n${s.body}`));
    return parts.join('\n\n').trim();
}

function bulletCount(text) {
    return String(text || '').split('\n').filter((l) => /^\s{0,1}[-*•]\s+|^\s{0,1}\d+[.)]\s+/.test(l)).length;
}

// ---------------------------------------------------------------- page

/**
 * @param {object} r report payload
 * @param {object} m reportModel(r)
 * @param {object} v view state: { uid, collapsed:Set, costRoute, similarAll, confOpen, weldOpen, methodOpen, methodHtml, noteOpen, busy }
 * @param {object} weld { schedule, summaryHtml } the weld list part (owned by the card)
 */
export function doneReportHtml(r, m, v, weld) {
    const goto = gotoResolver(m);
    const present = [];
    const parts = [];
    const add = (key, html, navExtra = {}) => {
        if (!html) return;
        present.push({ key, ...navExtra });
        parts.push(html);
    };
    add('ozet', heroHtml(r, m, v, goto));
    add('maliyet', costSection(r, m, v, goto));
    add('malzeme', materialSection(r, m, v, goto), { count: (r.material_lines || []).filter((x) => !x.is_total).length || null });
    add('iscilik', laborSection(r, m, v, goto));
    add('benzer', similarSection(r, m, v, goto), { count: (r.similar_jobs || []).length || null });
    add('teklif', offerSection(r, m, v, goto));
    add('dikkat', attentionSection(r, m, v, goto), { count: bulletCount(sectionMarkdown(m.sections.dikkat)) || null });
    const qCount = questionCount(r);
    add('sorular', questionsSection(r, m, v, goto), { count: qCount || null });
    m.extra.forEach((sec, i) => {
        const key = `ek${i + 1}`;
        add(key, section(v, key, `${sec.num ? `${sec.num}. ` : ''}${escapeHtml(sec.title)}`, mdHtml(sectionMarkdown(sec), goto)),
            { label: sec.title.length > 22 ? `${sec.title.slice(0, 20)}…` : sec.title, icon: 'fa-bookmark' });
    });
    if (weld) add('kaynak', weld, { count: null });
    add('metin', textSection(r, m, v, goto));
    add('girdiler', inputsSection(r, m, v));
    // The summary first; the nav sticks once it is scrolled past.
    return `${parts[0]}${navHtml(present)}${parts.slice(1).join('')}`;
}

/** "§2.2" → the section key that shows it (extra sections such as "§6" included). */
export function gotoResolver(m) {
    const map = { 1: 'ozet', 2: 'maliyet', '2.1': 'malzeme', '2.2': 'iscilik', '2.3': 'maliyet', 3: 'teklif', 4: 'dikkat', 5: 'sorular' };
    m.extra.forEach((sec, i) => { if (sec.num) map[sec.num] = `ek${i + 1}`; });
    return (num) => map[num] || map[String(num).split('.')[0]] || null;
}

function navHtml(present) {
    const defs = Object.fromEntries(SECTION_DEFS.map((d) => [d.key, d]));
    const items = present.map((p) => {
        const d = defs[p.key] || { label: p.label, icon: p.icon };
        return `<button type="button" class="est-nav-item" data-est-goto="${p.key}" data-nav-key="${p.key}">
            <span>${escapeHtml(p.label || d.label)}</span>${p.count ? `<span class="est-nav-count">${p.count}</span>` : ''}
        </button>`;
    }).join('');
    return `<nav class="est-nav" data-est-nav aria-label="Rapor bölümleri">
        <div class="est-nav-items">${items}</div>
        <div class="est-nav-tools">
            <button type="button" class="est-nav-tool" data-est-action="expand-all" title="Tüm bölümleri aç"><i class="fas fa-angles-down"></i></button>
            <button type="button" class="est-nav-tool" data-est-action="collapse-all" title="Tüm bölümleri kapat"><i class="fas fa-angles-up"></i></button>
            <button type="button" class="est-nav-tool est-nav-top" data-est-action="top" title="Başa dön"><i class="fas fa-arrow-up"></i><span>Başa dön</span></button>
        </div>
    </nav>`;
}

/** A collapsible section. */
export function section(v, key, title, body, { count = null, sub = '', tools = '', icon = null } = {}) {
    if (!body) return '';
    const collapsed = v.collapsed.has(key);
    const def = SECTION_DEFS.find((d) => d.key === key);
    const ic = icon || def?.icon;
    return `<section class="est-sec${collapsed ? ' is-collapsed' : ''}" data-sec="${key}" id="${v.uid}-sec-${key}">
        <header class="est-sec-head">
            <button type="button" class="est-sec-toggle" data-est-action="toggle" data-sec-key="${key}" aria-expanded="${collapsed ? 'false' : 'true'}">
                <i class="fas fa-chevron-down est-chevron"></i>
                ${ic ? `<i class="fas ${ic} est-sec-icon"></i>` : ''}
                <span class="est-sec-title">${title}</span>
                ${count != null ? `<span class="est-sec-count">${count}</span>` : ''}
                ${sub ? `<span class="est-sec-sub">${sub}</span>` : ''}
            </button>
            ${tools ? `<div class="est-sec-tools">${tools}</div>` : ''}
        </header>
        <div class="est-sec-body">${body}</div>
    </section>`;
}

// ---------------------------------------------------------------- Özet (hero)

function heroHtml(r, m, v, goto) {
    const ct = r.cost_table || {};
    const exp = ct.expected_total || {};
    const kg = ct.eur_per_kg || {};
    const totals = (ct.rows || []).find((x) => x.key === 'total') || {};
    const routes = m.routes.length ? m.routes : Object.keys(exp);
    const basisKey = m.basis?.key || null;

    const p = m.price;
    let priceBlock;
    if (p && (p.total != null || p.perUnit != null)) {
        const subParts = [];
        if (p.perUnit != null) subParts.push(`<strong>${money(p.perUnit)}</strong>/adet${p.computed === 'perUnit' ? ' <span class="est-calc" title="Toplam ÷ adet">hesaplandı</span>' : ''}`);
        if (p.perKg != null) subParts.push(`<strong>${fmt(p.perKg, 2)}</strong> €/kg`);
        priceBlock = `<div class="est-price-value">${money(p.total)}</div>
            <div class="est-price-sub">${subParts.join('<span class="est-dot">·</span>')}</div>`;
    } else if (p?.raw != null) {
        priceBlock = `<div class="est-price-value">${money(p.raw)}</div><div class="est-price-sub">Raporda birim (toplam / adet) belirtilmemiş</div>`;
    } else {
        priceBlock = '<div class="est-price-value est-muted">—</div><div class="est-price-sub">Raporda önerilen fiyat bulunamadı</div>';
    }
    const f = m.floor;
    const floorText = f && (f.total != null || f.perUnit != null)
        ? `Taban fiyat <strong>${money(f.total)}</strong>${f.perUnit != null ? `<span class="est-dot">·</span>${money(f.perUnit)}/adet` : ''}`
        : (f?.raw != null ? `Taban fiyat <strong>${money(f.raw)}</strong>` : '');
    const chips = [];
    if (m.basis?.label || basisKey) {
        chips.push(`<span class="est-chip est-chip-route" title="Teklifin dayandığı rota (§3)"><i class="fas fa-route"></i>${escapeHtml(m.basis?.label || ROUTE_LABELS[basisKey])}</span>`);
    }
    if (m.targetMargin) chips.push(`<span class="est-chip" title="Raporun hedef marjı (§3)">Hedef marj ${escapeHtml(m.targetMargin)}</span>`);
    if (m.margin != null && basisKey) {
        chips.push(`<span class="est-chip est-chip-soft" title="(Önerilen fiyat − ${ROUTE_LABELS[basisKey]} beklenen maliyeti) ÷ önerilen fiyat">Fiyata göre marj ${pct(m.margin, 1)}</span>`);
    }

    const routeCards = routes.filter((k) => exp[k] != null).map((k, i, arr) => {
        const isBasis = k === basisKey && arr.length > 1;
        const range = totals[k] ? rangeBar(totals[k].low, exp[k], totals[k].high) : '';
        let delta = '';
        if (i > 0 && exp[arr[0]] != null) {
            const d = exp[k] - exp[arr[0]];
            delta = `<div class="est-route-delta ${d > 0 ? 'is-up' : d < 0 ? 'is-down' : ''}">${ROUTE_LABELS[arr[0]]} rotasına göre ${d > 0 ? '+' : d < 0 ? '−' : ''}${fmt(Math.abs(d), 0)} €${exp[arr[0]] ? ` (${d >= 0 ? '+' : '−'}%${fmt(Math.abs(d) / exp[arr[0]] * 100, 1)})` : ''}</div>`;
        }
        return `<div class="est-route-card${isBasis ? ' is-basis' : ''}">
            <div class="est-kicker">Beklenen maliyet · ${ROUTE_LABELS[k] || escapeHtml(k)}${isBasis ? '<span class="est-basis-tag">fiyat dayanağı</span>' : ''}</div>
            <div class="est-route-value">${money(exp[k])}</div>
            <div class="est-route-sub">${kg[k] != null ? `<strong>${fmt(kg[k], 2)}</strong> €/kg` : ''}</div>
            ${range}
            ${delta}
        </div>`;
    }).join('');

    const ws = r.weld_schedule;
    const hours = r.hours || {};
    const facts = [];
    if (m.quantity != null) facts.push(fact('Adet', fmt(m.quantity, 0)));
    if (m.unitKg != null) facts.push(fact('Birim ağırlık', `${fmt(m.unitKg, 0)} kg`));
    if (m.totalKg != null) facts.push(fact('Toplam ağırlık', `${fmt(m.totalKg, 0)} kg`, m.totalKgBasis ? decorate(escapeHtml(m.totalKgBasis), goto) : ''));
    if (hours.expected_h_total != null) {
        facts.push(fact('Kaynak saati · iç imalat', `${fmt(hours.expected_h_total, 0)} h`,
            hours.low_h_total != null ? `${fmt(hours.low_h_total, 0)} – ${fmt(hours.high_h_total, 0)} h` : ''));
    }
    if (m.termin) facts.push(fact('Termin', escapeHtml(m.termin), '', 'is-wide'));
    if (ws) {
        facts.push(`<div class="est-fact">
            <span class="est-fact-label">Kaynak listesi güveni</span>
            <span class="est-fact-value">${confidenceBadge(ws.confidence)}
                <button type="button" class="est-help" data-est-action="conf-help" aria-expanded="${v.confOpen ? 'true' : 'false'}" title="Güven nedir?"><i class="fas fa-circle-question"></i></button></span>
            <span class="est-fact-sub">kaynak listesi v${escapeHtml(ws.version ?? '')}</span>
        </div>`);
    }

    const risks = m.risks ? `<div class="est-risks">
            <div class="est-risks-title"><i class="fas fa-triangle-exclamation"></i>En önemli riskler</div>
            ${mdHtml(m.risks, goto)}
        </div>` : '';
    const partLine = m.part ? `<div class="est-hero-part">${escapeHtml(m.part)}</div>` : '';

    return `<section class="est-sec est-hero" data-sec="ozet" id="${v.uid}-sec-ozet">
        ${partLine}
        <div class="est-hero-grid${routeCards ? '' : ' is-single'}">
            <div class="est-price">
                <div class="est-kicker">Önerilen fiyat${m.quantity ? ` · ${fmt(m.quantity, 0)} adet toplamı` : ''}</div>
                ${priceBlock}
                ${chips.length ? `<div class="est-chips">${chips.join('')}</div>` : ''}
                ${floorText ? `<div class="est-floor">${floorText}</div>` : ''}
            </div>
            ${routeCards ? `<div class="est-routes">${routeCards}</div>` : ''}
        </div>
        ${facts.length ? `<div class="est-facts">${facts.join('')}</div>` : ''}
        ${v.confOpen ? confidenceExplainer(ws) : ''}
        ${risks}
        ${m.summaryRest ? mdHtml(m.summaryRest, goto, { className: 'mt-2' }) : ''}
        ${m.preamble ? `<details class="est-more"><summary>Rapor notu</summary>${mdHtml(m.preamble, goto)}</details>` : ''}
    </section>`;
}

/** Düşük ——●—— Yüksek, the dot at Beklenen. */
function rangeBar(low, expected, high) {
    if (low == null || high == null) return '';
    const span = high - low;
    const pos = span > 0 && expected != null ? Math.max(0, Math.min(100, ((expected - low) / span) * 100)) : 50;
    return `<div class="est-range" title="Düşük ${fmt(low, 0)} € · Beklenen ${fmt(expected, 0)} € · Yüksek ${fmt(high, 0)} €">
        <div class="est-range-track"><span class="est-range-mark" style="left:${pos.toFixed(1)}%"></span></div>
        <div class="est-range-labels"><span>Düşük ${fmt(low, 0)}</span><span>Yüksek ${fmt(high, 0)}</span></div>
    </div>`;
}

function fact(label, value, sub = '', cls = '') {
    return `<div class="est-fact ${cls}">
        <span class="est-fact-label">${label}</span>
        <span class="est-fact-value">${value}</span>
        ${sub ? `<span class="est-fact-sub">${sub}</span>` : ''}
    </div>`;
}

/** "Güven nedir?" — inline, because the card already lives inside a modal. */
export function confidenceExplainer(ws) {
    const v = ws?.confidence != null ? Number(ws.confidence) : null;
    const level = v == null ? '' : v < 0.4
        ? 'Bu liste <strong>düşük güvenli</strong>: kaynak metresi ve saatler eksik ya da tahmini olabilir. Kaynak listesi bölümündeki açık soruları ve birleşimleri kontrol edin.'
        : v < 0.5
            ? 'Bu liste <strong>orta güvenli</strong>: genel tablo doğru, bazı ölçü veya adetler tahmin. Kaynak listesine bir göz atın.'
            : 'Bu liste <strong>yeterli güvenli</strong>: çizimle büyük ölçüde örtüşüyor.';
    return `<div class="est-explainer" role="note">
        <div class="est-explainer-head">
            <strong><i class="fas fa-circle-question me-1"></i>Kaynak listesi güveni nedir?</strong>
            <button type="button" class="btn-close btn-close-sm" data-est-action="conf-help" aria-label="Kapat"></button>
        </div>
        <p>Çizimlerden kaynak listesini (birleşimler, metreler, parça ve büküm sayıları, birim ağırlık) çıkaran modelin <strong>kendi verdiği puandır</strong> (0–100). Çizim eksik ya da okunaksızsa, ölçüler okunamayıp tahmin edildiyse veya kaynak detayı tanımlı değilse düşer.</p>
        <div class="est-explainer-scale">
            <span>${badge('%40 altı', 'status-orange')} düşük — saatler ve kg'a bağlı kalemler güvenilmez</span>
            <span>${badge('%40–50', 'status-grey')} orta — gözden geçirin</span>
            <span>${badge('%50 ve üstü', 'status-green')} yeterli</span>
        </div>
        ${level ? `<p class="mb-1">${level}</p>` : ''}
        <p class="est-muted mb-0">Yalnız kaynak listesinin güvenini gösterir; malzeme birim fiyatlarının ve saat kalibrasyonunun güvenini göstermez (onlar için Malzeme bölümündeki kaynak atıflarına ve İşçilik bölümündeki faktör aralığına bakın). İş emirlerinde liste, Referanslar sayfasındaki Düzenle ile elle düzeltilebilir.</p>
    </div>`;
}

// ---------------------------------------------------------------- Maliyet

function costSection(r, m, v, goto) {
    const ct = r.cost_table || {};
    if (!ct.found || !(ct.rows || []).length) {
        const body = m.sections.maliyet ? mdHtml(sectionMarkdown({ body: m.sections.maliyet.body }), goto) : '';
        return section(v, 'maliyet', 'Maliyet tablosu', body || '<div class="est-empty-line">Maliyet tablosu ayrıştırılamadı; rapor metnine bakın.</div>');
    }
    const routes = m.routes;
    const route = v.costRoute;
    const seg = routes.length > 1 ? `<div class="est-seg" role="group" aria-label="Rota">
        ${routes.map((k) => `<button type="button" class="${route === k ? 'is-active' : ''}" data-est-action="route" data-route="${escapeHtml(k)}" aria-pressed="${route === k}">${ROUTE_LABELS[k] || escapeHtml(k)}${k === m.basis?.key ? '<i class="fas fa-star est-seg-star" title="Fiyat dayanağı"></i>' : ''}</button>`).join('')}
        <button type="button" class="${route === 'compare' ? 'is-active' : ''}" data-est-action="route" data-route="compare" aria-pressed="${route === 'compare'}"><i class="fas fa-code-compare me-1"></i>Karşılaştır</button>
    </div>` : '';
    const dayanak = m.sections.dayanak;
    const others = m.maliyetOtherSubs || [];
    const body = `
        <div data-est-cost>${costTableHtml(ct, route, goto)}</div>
        ${m.maliyetIntro ? mdHtml(m.maliyetIntro, goto, { className: 'mt-2' }) : ''}
        ${dayanak ? `<details class="est-more"><summary>${escapeHtml(dayanak.num ? `${dayanak.num} ` : '')}Kalem dayanakları <span class="est-muted">(${escapeHtml(dayanak.title)})</span></summary>${mdHtml(dayanak.body, goto)}</details>` : ''}
        ${others.map((s) => `<details class="est-more"><summary>${escapeHtml(s.num ? `${s.num} ` : '')}${escapeHtml(s.title)}</summary>${mdHtml(s.body, goto)}</details>`).join('')}`;
    return section(v, 'maliyet', 'Maliyet tablosu', body, { sub: `€ · ${m.quantity ? `${fmt(m.quantity, 0)} adet toplamı` : 'toplam adet'}`, tools: seg });
}

/** The cost table for one route (Düşük / Beklenen / Yüksek) or both routes' Beklenen side by side. */
export function costTableHtml(ct, route, goto) {
    const rows = (ct.rows || []).map((x) => ({ ...x, label: COST_ROW_LABELS[x.key] || x.label || x.key }));
    const body = rows.filter((x) => x.key !== 'total' && x.key !== 'eur_per_kg');
    const total = rows.find((x) => x.key === 'total');
    const perKg = rows.find((x) => x.key === 'eur_per_kg');
    const basisCell = (x) => `<td class="est-basis">${x.basis ? decorate(escapeHtml(x.basis), goto) : ''}</td>`;
    const n = (val, digits = 0) => (val == null ? '<span class="est-muted">—</span>' : fmt(val, digits));

    if (route === 'compare') {
        const a = 'in_house';
        const b = 'subcontract';
        const delta = (x, digits = 0) => {
            const va = x[a]?.expected;
            const vb = x[b]?.expected;
            if (va == null || vb == null) return '<td class="num est-muted">—</td>';
            const d = vb - va;
            const cls = Math.abs(d) < 0.5 / 10 ** digits ? 'is-zero' : d > 0 ? 'is-up' : 'is-down';
            return `<td class="num est-delta ${cls}">${cls === 'is-zero' ? '0' : `${d > 0 ? '+' : '−'}${fmt(Math.abs(d), digits)}`}</td>`;
        };
        const tr = (x, cls = '', digits = 0) => `<tr class="${cls}">
            <td class="est-item">${escapeHtml(x.label)}</td>
            <td class="num">${n(x[a]?.expected, digits)}</td>
            <td class="num">${n(x[b]?.expected, digits)}</td>
            ${delta(x, digits)}
            ${basisCell(x)}
        </tr>`;
        return `<div class="est-table-wrap"><table class="est-table est-cost is-compare">
            <thead><tr><th>Kalem</th><th class="num">İç imalat<small>beklenen</small></th><th class="num">Taşeron<small>beklenen</small></th><th class="num">Fark<small>taşeron − iç imalat</small></th><th>Dayanak</th></tr></thead>
            <tbody>${body.map((x) => tr(x, isZeroRow(x, [a, b]) ? 'is-zero' : '')).join('')}</tbody>
            <tfoot>${total ? tr(total, 'est-total') : ''}${perKg ? tr(perKg, 'est-perkg', 2) : ''}</tfoot>
        </table></div>`;
    }

    const k = route;
    const totalExp = total?.[k]?.expected || body.reduce((s, x) => s + (Number(x[k]?.expected) || 0), 0);
    const tr = (x, cls = '', digits = 0, share = true) => `<tr class="${cls}">
        <td class="est-item">${escapeHtml(x.label)}</td>
        <td class="num est-lohi">${n(x[k]?.low, digits)}</td>
        <td class="num is-exp">${n(x[k]?.expected, digits)}</td>
        <td class="num est-lohi">${n(x[k]?.high, digits)}</td>
        <td class="est-share-cell">${share ? shareBar(x[k]?.expected, totalExp) : ''}</td>
        ${basisCell(x)}
    </tr>`;
    return `<div class="est-table-wrap"><table class="est-table est-cost">
        <thead><tr><th>Kalem</th><th class="num">Düşük</th><th class="num is-exp">Beklenen</th><th class="num">Yüksek</th><th class="est-share-cell">Pay</th><th>Dayanak</th></tr></thead>
        <tbody>${body.map((x) => tr(x, isZeroRow(x, [k]) ? 'is-zero' : '')).join('')}</tbody>
        <tfoot>${total ? tr(total, 'est-total', 0, false) : ''}${perKg ? tr(perKg, 'est-perkg', 2, false) : ''}</tfoot>
    </table></div>`;
}

function isZeroRow(x, keys) {
    return keys.every((k) => ['low', 'expected', 'high'].every((lvl) => !Number(x[k]?.[lvl])));
}

// ---------------------------------------------------------------- Malzeme

function materialSection(r, m, v, goto) {
    const lines = r.material_lines || [];
    const sec = m.sections.malzeme;
    if (!lines.length) {
        return sec ? section(v, 'malzeme', 'Malzeme', mdHtml(sec.body, goto)) : '';
    }
    const items = lines.filter((x) => !x.is_total);
    const totalLine = lines.find((x) => x.is_total);
    const keys = Object.keys(items[0] || {}).filter((k) => k !== 'amount_eur' && k !== 'is_total');
    const amountKey = keys.find((k) => /^tutar/i.test(k));
    const textKeys = keys.filter((k) => k !== amountKey);
    const total = totalLine?.amount_eur ?? items.reduce((s, x) => s + (Number(x.amount_eur) || 0), 0);
    const priceKey = textKeys.find((k) => /birim fiyat/i.test(k));
    const cell = (x, k) => {
        const raw = String(x[k] ?? '').replace(/\*\*/g, '');
        if (k === priceKey && /^bilinmiyor/i.test(raw.trim())) return `<td>${badge('Fiyat yok', 'status-orange')}</td>`;
        const cls = k === priceKey ? 'est-basis' : /miktar/i.test(k) ? 'num est-nowrap' : '';
        return `<td class="${cls}">${raw ? decorate(escapeHtml(raw), goto) : '<span class="est-muted">—</span>'}</td>`;
    };
    const missing = items.filter((x) => x.amount_eur == null).length;
    const table = `<div class="est-table-wrap"><table class="est-table est-material">
        <thead><tr>${textKeys.map((k) => `<th class="${/miktar/i.test(k) ? 'num' : ''}">${escapeHtml(k)}</th>`).join('')}<th class="num">Tutar €</th><th class="est-share-cell">Pay</th></tr></thead>
        <tbody>${items.map((x) => `<tr class="${x.amount_eur == null ? 'is-missing' : ''}">${textKeys.map((k) => cell(x, k)).join('')}
            <td class="num is-exp">${x.amount_eur == null ? '<span class="est-muted">—</span>' : fmt(x.amount_eur, 0)}</td>
            <td class="est-share-cell">${shareBar(x.amount_eur, total)}</td></tr>`).join('')}</tbody>
        <tfoot><tr class="est-total"><td colspan="${textKeys.length}">Toplam${missing ? ` <span class="est-muted fw-normal">(${missing} kalem fiyatsız, dahil değil)</span>` : ''}</td><td class="num">${fmt(total, 0)}</td><td></td></tr></tfoot>
    </table></div>`;
    const notes = sec ? withoutFirstTable(sec.body) : '';
    return section(v, 'malzeme', 'Malzeme', `${table}${notes ? `<div class="est-notes">${mdHtml(notes, goto)}</div>` : ''}`,
        { count: items.length, sub: `toplam ${money(total)}` });
}

// ---------------------------------------------------------------- İşçilik

function laborSection(r, m, v, goto) {
    const h = r.hours || {};
    const sec = m.sections.iscilik;
    const cal = h.calibration?.in_house;
    const bu = h.bottom_up || r.weld_schedule?.bottom_up;
    if (!cal && !bu && !sec) return '';
    const kpis = [];
    if (bu?.total_h != null) {
        kpis.push(kpi('Hesaplanan (birim sürelerle)', `${fmt(bu.total_h, 1)} h/adet`, `kaynak ${fmt(bu.welding_h, 1)} + diğer ${fmt(bu.non_welding_h, 1)}`));
    }
    if (cal) {
        const flag = cal.factor_mean != null && (cal.factor_mean < 0.6 || cal.factor_mean > 1.6);
        kpis.push(kpi('Kalibrasyon faktörü', `${fmt(cal.factor_mean, 2)}${flag ? ` ${badge('aralık dışı', 'status-orange', 'Olağan aralık 0,6–1,6; nedeni raporun 2.2 bölümünde')}` : ''}`,
            `${fmt(cal.factor_min, 2)} – ${fmt(cal.factor_max, 2)} · ${(cal.references_used || []).length} referans`));
        kpis.push(kpi('Beklenen saat', `${fmt(cal.expected_h_per_unit, 1)} h/adet`, `${fmt(cal.low_h_per_unit, 1)} – ${fmt(cal.high_h_per_unit, 1)} h/adet`));
    }
    if (h.expected_h_total != null) {
        kpis.push(kpi(`Toplam${m.quantity ? ` (${fmt(m.quantity, 0)} adet)` : ''}`, `${fmt(h.expected_h_total, 0)} h`, `${fmt(h.low_h_total, 0)} – ${fmt(h.high_h_total, 0)} h`));
    }
    const wage = h.labor_eur_per_h ?? r.inputs?.parameters?.labor_eur_per_h;
    if (wage != null) kpis.push(kpi('İşçilik ücreti', `${fmt(wage, 2)} €/h`, 'referansların ortalaması'));
    if (Number(h.machining_h_per_unit_references)) kpis.push(kpi('Talaşlı (referans ort.)', `${fmt(h.machining_h_per_unit_references, 1)} h/adet`, 'çizimden hesaplanmaz'));

    const refsUsed = cal?.references_used || [];
    const refPool = [...(h.references?.in_house || []), ...(h.references?.subcontract || [])];
    const refRows = refsUsed.map((no) => refPool.find((x) => x.job_no === no) || { job_no: no });
    const calTable = refRows.length ? `<div class="est-sub-title">Kalibrasyon referansları <span class="est-muted">— faktör = kayıtlı saat ÷ birim sürelerle hesaplanan saat</span></div>
        <div class="est-table-wrap"><table class="est-table">
            <thead><tr><th>İş</th><th>Rota</th><th class="num">Benzerlik</th><th class="num">Kaynak m/adet</th><th class="num">Kayıtlı h/adet</th><th class="num">Hesaplanan h/adet</th><th class="num">Faktör</th></tr></thead>
            <tbody>${refRows.map((x) => `<tr>
                <td>${jobLink(x.job_no)} <span class="est-job-title">${escapeHtml(x.title || '')}</span></td>
                <td>${routeBadge(x.route)}</td>
                <td class="num">${similarityCell(x.similarity_to_target)}</td>
                <td class="num">${fmt(x.weld_m_total, 1)}</td>
                <td class="num">${fmt(x.recorded_welding_h_per_unit, 1)}</td>
                <td class="num">${fmt(x.bottom_up_h_per_unit, 1)}</td>
                <td class="num">${factorBadge(x.factor)}</td>
            </tr>`).join('')}</tbody>
        </table></div>` : '';

    const subCal = h.calibration?.subcontract;
    const sameSub = subCal && cal && JSON.stringify(subCal.references_used) === JSON.stringify(cal.references_used) && subCal.factor_mean === cal.factor_mean;
    const subNote = subCal ? (sameSub
        ? '<div class="est-note-line"><i class="fas fa-circle-info"></i>Taşeron rotası aynı referansları ve faktörü kullanır.</div>'
        : `<div class="est-note-line"><i class="fas fa-circle-info"></i>Taşeron rotası: faktör ${fmt(subCal.factor_mean, 2)} (${fmt(subCal.factor_min, 2)} – ${fmt(subCal.factor_max, 2)}), referanslar ${(subCal.references_used || []).map(jobLink).join(', ') || '—'}.</div>`) : '';

    const exIn = h.excluded?.in_house || [];
    const exSub = h.excluded?.subcontract || [];
    const subGroups = {};
    exSub.forEach((x) => { const k = exclusionLabel(x.reason); subGroups[k] = (subGroups[k] || 0) + 1; });
    const excluded = (exIn.length || exSub.length) ? `<div class="est-excluded">
        ${exIn.length ? `<div class="est-sub-title">Dışlanan referanslar</div>
            <ul class="est-plain-list">${exIn.map((x) => `<li>${jobLink(x.job_no)} <span class="est-job-title">${escapeHtml(x.title || '')}</span> — ${escapeHtml(exclusionLabel(x.reason))}</li>`).join('')}</ul>` : ''}
        ${exSub.length ? `<details class="est-more"><summary>Taşeron rotası için dışlanan ${exSub.length} referans: ${Object.entries(subGroups).map(([k, c]) => `${escapeHtml(k)} (${c})`).join(', ')}</summary>
            <ul class="est-plain-list est-cols">${exSub.map((x) => `<li>${jobLink(x.job_no)} <span class="est-job-title">${escapeHtml(x.title || '')}</span></li>`).join('')}</ul></details>` : ''}
    </div>` : '';

    const breakdown = bu ? hoursTable(hoursBreakdown(bu)) : '';
    const body = `
        ${kpis.length ? `<div class="est-kpis">${kpis.join('')}</div>` : ''}
        <div class="est-two">
            <div class="est-two-main">${calTable}${subNote}${excluded}</div>
            ${breakdown ? `<div class="est-two-side">${breakdown}</div>` : ''}
        </div>
        ${sec ? `<details class="est-more" open><summary>Raporun işçilik hesabı ve gerekçeleri <span class="est-muted">(${escapeHtml(sec.num || '2.2')})</span></summary>${mdHtml(sec.body, goto)}</details>` : ''}`;
    return section(v, 'iscilik', 'İşçilik ve saat', body, { sub: 'standart birim süre × referans faktörü' });
}

function kpi(label, value, sub = '') {
    return `<div class="est-kpi"><span class="est-kpi-label">${label}</span><span class="est-kpi-value">${value}</span>${sub ? `<span class="est-kpi-sub">${sub}</span>` : ''}</div>`;
}

function hoursTable(b) {
    const total = b.total || b.welding.reduce((s, x) => s + x.hours, 0) + b.other.reduce((s, x) => s + (Number(x.hours) || 0), 0);
    const row = (label, qty, unitH, unit, hours) => `<tr>
        <td>${label}</td>
        <td class="num est-nowrap">${qty}</td>
        <td class="num est-nowrap est-muted">${unitH != null ? `${fmt(unitH, unitH < 0.1 ? 4 : 2)} ${escapeHtml(UNIT_LABELS[unit] || unit || '')}` : 'karışık'}</td>
        <td class="num">${fmt(hours, 1)}</td>
        <td class="est-share-cell">${shareBar(hours, total)}</td>
    </tr>`;
    const qtyText = (q, unit) => (unit === 'h/m' ? `${fmt(q, 1)} m` : unit === 'h/kg' ? `${fmt(q, 0)} kg` : fmt(q, 0));
    return `<div class="est-sub-title">Saat dağılımı · 1 adet</div>
        <div class="est-table-wrap"><table class="est-table est-hours">
            <thead><tr><th>İş adımı</th><th class="num">Miktar</th><th class="num">Birim süre</th><th class="num">Saat</th><th class="est-share-cell">Pay</th></tr></thead>
            <tbody>
                ${b.welding.map((g) => row(`Kaynak · ${escapeHtml(JOINT_TYPE_LABELS[g.joint_type] || g.joint_type || '')} <span class="est-muted">${escapeHtml(MATERIAL_LABELS[g.material] || g.material || '')}</span>`, qtyText(g.qty, g.unit), g.unit_h, g.unit, g.hours)).join('')}
                ${b.other.map((x) => row(escapeHtml(x.label), qtyText(x.qty, x.unit), x.unit_h, x.unit, x.hours)).join('')}
            </tbody>
            <tfoot><tr class="est-total"><td colspan="3">Toplam</td><td class="num">${fmt(total, 1)}</td><td></td></tr></tfoot>
        </table></div>`;
}

// ---------------------------------------------------------------- Benzer işler

function similarSection(r, m, v, goto) {
    const jobs = (r.similar_jobs || []).map(similarRow);
    if (!jobs.length) {
        return m.maliyetSimilarTable ? section(v, 'benzer', 'Benzer işler', mdHtml(m.maliyetSimilarTable, goto)) : '';
    }
    jobs.sort((a, b) => (b.similarity ?? -1) - (a.similarity ?? -1));
    const calRefs = new Set(r.hours?.calibration?.in_house?.references_used || r.inputs?.references_used || []);
    const shown = v.similarAll ? jobs : jobs.slice(0, SIMILAR_PREVIEW);
    const marginCell = (x) => (x.margin == null ? '<span class="est-muted">—</span>'
        : `<span class="${x.margin < 0 ? 'est-neg' : 'est-pos'}">${x.margin < 0 ? '−' : ''}%${fmt(Math.abs(x.margin) * 100, 1)}</span>`);
    const table = `<div class="est-table-wrap"><table class="est-table est-similar">
        <thead>
            <tr><th rowspan="2">İş</th><th rowspan="2">Rota</th><th rowspan="2" class="num">Benzerlik</th><th rowspan="2" class="num">Faktör</th><th rowspan="2" class="num">kg</th>
                <th colspan="3" class="est-th-group">€/kg</th><th rowspan="2" class="num">Marj</th><th rowspan="2" class="num">Kaynak<small>h/adet</small></th><th rowspan="2" class="num">NCR</th></tr>
            <tr><th class="num">Gerçekleşen</th><th class="num">Malzeme</th><th class="num">Satış</th></tr>
        </thead>
        <tbody>${shown.map((x) => `<tr>
            <td class="est-job-cell"><span class="est-job-line">${jobLink(x.job_no)}${calRefs.has(x.job_no) ? '<span class="est-tag est-tag-cal" title="Saat kalibrasyonunda kullanıldı">kalibrasyon</span>' : ''}${m.citedJobs.has(x.job_no) ? '<span class="est-tag" title="Raporun benzer iş tablosunda">raporda</span>' : ''}</span>
                <div class="est-job-title">${escapeHtml(x.title || '')}${x.customer ? ` · <span class="est-muted">${escapeHtml(x.customer)}</span>` : ''}</div></td>
            <td>${routeBadge(x.route)}</td>
            <td class="num">${similarityCell(x.similarity)}</td>
            <td class="num">${factorBadge(x.factor)}</td>
            <td class="num">${x.weight_kg ? fmt(x.weight_kg, 0) : '<span class="est-muted">—</span>'}</td>
            <td class="num">${x.eur_per_kg != null ? fmt(x.eur_per_kg, 2) : '<span class="est-muted">—</span>'}</td>
            <td class="num">${x.material_eur_per_kg != null ? fmt(x.material_eur_per_kg, 2) : '<span class="est-muted">—</span>'}</td>
            <td class="num">${x.sell_per_kg != null ? fmt(x.sell_per_kg, 2) : '<span class="est-muted">—</span>'}</td>
            <td class="num">${marginCell(x)}</td>
            <td class="num">${x.recorded_welding_h_per_unit != null ? fmt(x.recorded_welding_h_per_unit, 1) : (x.welding_hours ? fmt(x.welding_hours, 1) : '<span class="est-muted">—</span>')}</td>
            <td class="num">${x.ncr_count ? badge(escapeHtml(String(x.ncr_count)), 'status-orange', 'Uygunsuzluk raporu (NCR) sayısı') : '<span class="est-muted">0</span>'}</td>
        </tr>`).join('')}</tbody>
    </table></div>
    ${jobs.length > SIMILAR_PREVIEW ? `<button type="button" class="btn btn-link btn-sm est-more-btn" data-est-action="similar-all">${v.similarAll ? 'İlk ' + SIMILAR_PREVIEW + ' işi göster' : `Tümünü göster (${jobs.length})`}</button>` : ''}`;
    const modelTable = m.maliyetSimilarTable
        ? `<details class="est-more"><summary>Raporun benzer iş tablosu <span class="est-muted">(marj notlarıyla)</span></summary>${mdHtml(m.maliyetSimilarTable, goto)}</details>` : '';
    return section(v, 'benzer', 'Benzer işler', `${table}${modelTable}`, { count: jobs.length, sub: 'benzerliğe göre; marj = (satış − gerçekleşen maliyet) ÷ satış' });
}

// ---------------------------------------------------------------- Teklif önerisi

function offerSection(r, m, v, goto) {
    const sec = m.sections.teklif;
    if (!sec) return '';
    const text = sectionMarkdown(sec)
        .split('\n')
        .filter((l) => !/önerilen fiyat|taban fiyat/i.test(l.replace(/\*/g, '')) || /^\s*\|/.test(l))
        .join('\n');
    const tiles = [];
    if (m.price && (m.price.total != null || m.price.raw != null)) {
        tiles.push(`<div class="est-offer-tile is-main"><span>Önerilen fiyat</span><strong>${money(m.price.total ?? m.price.raw)}</strong>${m.price.perUnit != null ? `<small>${money(m.price.perUnit)}/adet${m.price.perKg != null ? ` · ${fmt(m.price.perKg, 2)} €/kg` : ''}</small>` : ''}</div>`);
    }
    if (m.floor && (m.floor.total != null || m.floor.raw != null)) {
        tiles.push(`<div class="est-offer-tile"><span>Taban fiyat</span><strong>${money(m.floor.total ?? m.floor.raw)}</strong>${m.floor.perUnit != null ? `<small>${money(m.floor.perUnit)}/adet</small>` : ''}</div>`);
    }
    const priceText = labeledPriceText(sec.body);
    return section(v, 'teklif', 'Teklif önerisi', `
        ${tiles.length ? `<div class="est-offer-tiles">${tiles.join('')}</div>` : ''}
        ${priceText ? `<div class="est-offer-calc">${priceText}</div>` : ''}
        ${mdHtml(text, goto, { className: 'est-offer-md' })}`);
}

/** What follows the numbers on the price lines ("Hesap: …", "güncel bakırla maliyet …"): kept, not lost. */
function labeledPriceText(body) {
    const lines = String(body || '').split('\n').filter((l) => /önerilen fiyat|taban fiyat/i.test(l.replace(/\*/g, '')) && !/^\s*\|/.test(l));
    const notes = lines.map((l) => {
        const clean = l.replace(/\*\*/g, '').replace(/^\s*[-*•]\s+/, '');
        const m = clean.match(/\)\.?\s+(.+)$/);
        return m ? escapeHtml(m[1]) : '';
    }).filter(Boolean);
    return notes.length ? notes.map((n) => `<div><i class="fas fa-calculator"></i>${n}</div>`).join('') : '';
}

// ---------------------------------------------------------------- Dikkat noktaları

function attentionSection(r, m, v, goto) {
    const sec = m.sections.dikkat;
    if (!sec) return '';
    const cards = sec.subs.map((s) => {
        const icon = (DEPARTMENT_ICONS.find(([re]) => re.test(s.title)) || [null, 'fa-circle-exclamation'])[1];
        const n = bulletCount(s.body);
        return `<div class="est-card">
            <div class="est-card-head"><i class="fas ${icon}"></i><span>${escapeHtml(s.title)}</span>${n ? `<span class="est-sec-count">${n}</span>` : ''}</div>
            ${mdHtml(s.body, goto)}
        </div>`;
    }).join('');
    const body = `${sec.body ? mdHtml(sec.body, goto) : ''}${cards ? `<div class="est-cards is-wide">${cards}</div>` : ''}`;
    return section(v, 'dikkat', 'Dikkat noktaları', body, { count: bulletCount(sectionMarkdown(sec)) || null, sub: 'departman bazında' });
}

// ---------------------------------------------------------------- Sorular

const QUESTION_GROUPS = [
    ['design', 'Tasarımdan', 'fa-pen-ruler'],
    ['customer', 'Müşteriden', 'fa-user-tie'],
    ['procurement', 'Satın almadan', 'fa-cart-shopping'],
];

function questionCount(r) {
    const q = r.questions || {};
    return QUESTION_GROUPS.reduce((s, [k]) => s + (q[k]?.length || 0), 0) + (r.weld_schedule?.open_questions?.length || 0);
}

function questionsSection(r, m, v, goto) {
    const q = r.questions || {};
    const groups = QUESTION_GROUPS.filter(([k]) => q[k]?.length).map(([k, label, icon]) => [label, icon, q[k]]);
    const open = r.weld_schedule?.open_questions || [];
    if (open.length) groups.push(['Çizimin söylemediği', 'fa-fire-flame-curved', open, 'kaynak listesi']);
    if (!groups.length) {
        return m.sections.sorular ? section(v, 'sorular', 'Teklif öncesi istenecekler', mdHtml(sectionMarkdown(m.sections.sorular), goto)) : '';
    }
    const cards = groups.map(([label, icon, items, note]) => `<div class="est-card">
        <div class="est-card-head"><i class="fas ${icon}"></i><span>${label}</span>${note ? `<span class="est-muted fw-normal">(${note})</span>` : ''}<span class="est-sec-count">${items.length}</span></div>
        <ul class="est-checklist">${items.map((x) => `<li><i class="far fa-square" aria-hidden="true"></i><span>${decorate(escapeHtml(x), goto)}</span></li>`).join('')}</ul>
    </div>`).join('');
    return section(v, 'sorular', 'Teklif öncesi istenecekler', `<div class="est-cards">${cards}</div>`, { count: questionCount(r), sub: 'teklif vermeden önce netleşmeli' });
}

// ---------------------------------------------------------------- Rapor metni

function textSection(r, m, v, goto) {
    if (!r.markdown) return '';
    const secs = m.md.sections;
    if (!secs.length) {
        // No numbered headings to split at: the text is all there is, so it is not tucked away.
        const open = { ...v, collapsed: new Set([...v.collapsed].filter((k) => k !== 'metin')) };
        return section(open, 'metin', 'Rapor metni', mdHtml(r.markdown, goto));
    }
    const blocks = secs.map((s) => `<details class="est-more est-text-part">
        <summary>${escapeHtml(s.num ? `${s.num}. ` : '')}${escapeHtml(s.title)}</summary>
        ${mdHtml(sectionMarkdown(s), goto)}
    </details>`).join('');
    return section(v, 'metin', 'Rapor metni', `
        <div class="est-text-tools"><span class="est-muted">Modelin yazdığı metin, bölüm bölüm.</span>
            <button type="button" class="btn btn-link btn-sm p-0" data-est-action="text-all">Hepsini aç</button></div>
        ${m.preamble ? `<details class="est-more est-text-part"><summary>Not</summary>${mdHtml(m.preamble, goto)}</details>` : ''}
        ${blocks}`, { count: secs.length, sub: m.title ? escapeHtml(m.title) : '' });
}

// ---------------------------------------------------------------- Girdiler

function inputsSection(r, m, v) {
    const inp = r.inputs || {};
    const u = r.usage || {};
    const rows = [];
    const add = (label, value) => { if (value !== '' && value != null) rows.push(`<div class="est-kv"><span>${label}</span><span>${value}</span></div>`); };
    const mins = runMinutes(r);
    add('Çalıştırma', `v${escapeHtml(r.version)} · ${escapeHtml(formatDateTime(r.created_at))}${r.created_by_name ? ` · ${escapeHtml(r.created_by_name)}` : ''}${mins != null ? ` · ${mins} dk` : ''}`);
    const models = inp.models || {};
    add('Model', [models.report ? `rapor ${escapeHtml(models.report)}` : (r.model ? escapeHtml(r.model) : ''), models.extraction ? `çıkarım ${escapeHtml(models.extraction)}` : ''].filter(Boolean).join(' · '));
    const usd = r.usage_usd != null ? Number(r.usage_usd) : null;
    const split = [u.report?.usd != null ? `rapor ${fmt(u.report.usd, 2)}` : '', u.extraction?.usd != null ? `çıkarım ${fmt(u.extraction.usd, 2)}` : ''].filter(Boolean).join(' + ');
    add('Maliyet', usd != null ? `${fmt(usd, 2)} USD${split ? ` <span class="est-muted">(${split})</span>` : ''}` : '');
    if (u.report?.input_tokens) {
        add('Token', `rapor ${fmt(u.report.input_tokens, 0)} giriş / ${fmt(u.report.output_tokens, 0)} çıkış${u.extraction?.input_tokens ? ` · çıkarım ${fmt(u.extraction.input_tokens, 0)} / ${fmt(u.extraction.output_tokens, 0)}` : ''}`);
    }
    const docs = u.report?.documents;
    add('Belgeler', [docs != null ? `${fmt(docs, 0)} belge` : '', inp.pages != null ? `${fmt(inp.pages, 0)} sayfa` : ''].filter(Boolean).join(' · '));
    if (inp.weld_schedule_version) add('Kaynak listesi', `v${escapeHtml(inp.weld_schedule_version)}${inp.weld_schedule_created ? ' · bu çalıştırmada çıkarıldı' : ' · önceki çıkarım kullanıldı'}`);
    if ((inp.references_used || []).length) add('Kalibrasyon referansları', inp.references_used.map(jobLink).join(', '));
    if ((inp.similar_job_nos || []).length) add('Benzer iş adayları', `${inp.similar_job_nos.length} iş`);
    if (inp.similar_drawings_job) add('Çizimi eklenen benzer iş', jobLink(inp.similar_drawings_job));
    const params = Object.entries(inp.parameters || {}).map(([k, val]) => {
        const [label, f] = PARAMETER_LABELS[k] || [k, (x) => fmt(x, 2)];
        return `<span class="est-param"><span>${escapeHtml(label)}</span><strong>${f(Number(val))}</strong></span>`;
    }).join('');
    const skipped = inp.skipped || u.extraction?.skipped || [];
    const files = u.extraction?.files || [];
    const body = `<div class="est-kvs">${rows.join('')}</div>
        ${params ? `<div class="est-sub-title">Parametreler</div><div class="est-params">${params}</div>` : ''}
        ${skipped.length ? `<div class="est-sub-title">Atlanan belgeler</div><ul class="est-plain-list">${skipped.map((s) => `<li>${escapeHtml(Array.isArray(s) ? s[0] : s)}${Array.isArray(s) && s[1] ? ` — <span class="est-muted">${escapeHtml(SKIP_REASONS[s[1]] || s[1])}</span>` : ''}</li>`).join('')}</ul>` : ''}
        ${files.length ? `<details class="est-more"><summary>Kaynak listesi çıkarımında okunan dosyalar (${files.length})</summary><ul class="est-plain-list est-cols">${files.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul></details>` : ''}`;
    return section(v, 'girdiler', 'Girdiler ve çalıştırma', body);
}

export function runMinutes(r) {
    if (r.started_at && r.finished_at) {
        const ms = new Date(r.finished_at) - new Date(r.started_at);
        if (ms > 0) return Math.max(1, Math.round(ms / 60000));
    }
    const s = (Number(r.usage?.report?.seconds) || 0) + (Number(r.usage?.extraction?.seconds) || 0);
    return s ? Math.max(1, Math.round(s / 60)) : null;
}

export function formatDateTime(value) {
    if (!value) return '';
    return new Date(value).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

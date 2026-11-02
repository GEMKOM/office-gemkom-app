/**
 * Eğilimler row: exactly six Chart.js charts (helpers copied from
 * management/reports/overview/overview.js: killCharts, chartCard, chartEmpty,
 * chartDefaults, DL_FONT, DL_BAR_PILL, scaleOpts) plus the SVG sparkline used
 * inside the Finans drawer. Charts are built inside a rAF shim after innerHTML
 * and destroyed before every re-render. Palette: no yellow anywhere.
 */
import { escapeHtml, pf, n0, num, pct, formatTons, stamp, monthLabel, weekLabel, raf, isPhone, prefersReducedMotion } from './util.js';

const C = {
    blue: '#0d6efd', grey: '#adb5bd', green: '#198754', red: '#dc3545', purple: '#6f42c1', teal: '#20c997',
    orange: '#fd7e14', line: '#6c757d', lightPurple: 'rgba(111, 66, 193, 0.4)', lightGrey: '#cdd3db',
};

let charts = [];
let registered = false;

export function killCharts() {
    charts.forEach((c) => { try { c.destroy(); } catch (_) { /* noop */ } });
    charts = [];
}

function ensureRegistered() {
    if (registered || !window.Chart) return;
    if (window.ChartDataLabels) window.Chart.register(window.ChartDataLabels);
    registered = true;
}

export function chartDefaults() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        animation: prefersReducedMotion() ? false : undefined,
        layout: { padding: { top: 4, bottom: 4 } },
        plugins: {
            legend: {
                display: !isPhone(),
                labels: {
                    color: '#495057',
                    font: { family: "'Segoe UI', system-ui, sans-serif", size: 12 },
                    padding: 14,
                    usePointStyle: true,
                    pointStyleWidth: 10,
                },
            },
            tooltip: {
                backgroundColor: '#343a40',
                titleFont: { family: "'Segoe UI', system-ui, sans-serif", weight: '600' },
                bodyFont: { family: "'Segoe UI', system-ui, sans-serif" },
                cornerRadius: 8,
                padding: 10,
            },
            datalabels: { display: false },
        },
    };
}

export const DL_FONT = { weight: '700', size: 12, family: "'Segoe UI', system-ui, sans-serif" };

export const DL_BAR_PILL = {
    color: '#1a1a1a',
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderColor: 'rgba(0, 0, 0, 0.1)',
    borderWidth: 1,
    borderRadius: 5,
    padding: 4,
};

export function scaleOpts(opts = {}) {
    return {
        beginAtZero: true,
        grid: { color: 'rgba(0,0,0,0.06)' },
        ticks: { color: '#6c757d', font: { size: 11 } },
        ...opts,
    };
}

export function chartCard({ id, icon, iconCls, title, canvasId, stampText = '', link = null, footer = '', lazy = false }) {
    return `<div class="col-12 col-md-6 col-lg-4 dash-trend-col${lazy ? ' dash-trend-lazy' : ''}" data-trend="${id}">
        <div class="ov-card dash-trend-card">
            <div class="ov-card-header"><i class="fas fa-${icon} ${iconCls}"></i><h6>${escapeHtml(title)}</h6>
                <span class="dash-card-stamp ms-auto" data-stamp>${escapeHtml(stampText)}</span></div>
            <div class="ov-card-body">
                <div class="chart-wrap chart-wrap--sm"><canvas id="${canvasId}"></canvas></div>
                <div class="dash-trend-foot">${footer ? `<span class="dash-trend-note">${footer}</span>` : ''}${link ? `<a class="dash-drill" href="${escapeHtml(link.href)}">${escapeHtml(link.label)} <i class="fas fa-arrow-right"></i></a>` : ''}</div>
            </div>
        </div>
    </div>`;
}

export function chartEmpty(canvasEl, message = 'Veri yok') {
    const wrap = canvasEl && canvasEl.parentElement;
    if (wrap) wrap.innerHTML = `<div class="h-100 d-flex align-items-center justify-content-center text-muted small">${escapeHtml(message)}</div>`;
}

/** Diagonal hatch pattern for the partial (current) week. */
function hatchPattern(color) {
    try {
        const c = document.createElement('canvas');
        c.width = 8; c.height = 8;
        const g = c.getContext('2d');
        g.fillStyle = 'rgba(255,255,255,0)';
        g.fillRect(0, 0, 8, 8);
        g.strokeStyle = color;
        g.lineWidth = 2;
        g.beginPath(); g.moveTo(0, 8); g.lineTo(8, 0); g.stroke();
        return g.createPattern(c, 'repeat') || color;
    } catch (_) { return color; }
}

/** Inline SVG sparkline (finance drawer): values[] → <svg>. */
export function svgSparkline(values, { width = 260, height = 56, color = C.blue, highlightLast = true } = {}) {
    const vals = (values || []).map((v) => n0(v));
    if (vals.length < 2) return '';
    const max = Math.max(...vals), min = Math.min(0, ...vals);
    const span = max - min || 1;
    const padX = 6, padY = 6;
    const stepX = (width - padX * 2) / (vals.length - 1);
    const pts = vals.map((v, i) => [padX + i * stepX, height - padY - ((v - min) / span) * (height - padY * 2)]);
    const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const area = `${d} L${pts[pts.length - 1][0].toFixed(1)},${(height - padY).toFixed(1)} L${padX},${(height - padY).toFixed(1)} Z`;
    const last = pts[pts.length - 1];
    return `<svg class="dash-sparkline" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Aylık sipariş tutarı">
        <path d="${area}" fill="${color}" fill-opacity="0.12"></path>
        <path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></path>
        ${highlightLast ? `<circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.5" fill="${color}"></circle>` : ''}
    </svg>`;
}

/* ---------------------------------------------------------------- chart builders */

function build(canvasId, config) {
    const el = document.getElementById(canvasId);
    if (!el || !window.Chart) return null;
    try {
        const c = new window.Chart(el, config);
        charts.push(c);
        return c;
    } catch (err) {
        console.error('chart build failed', canvasId, err);
        chartEmpty(el, 'Grafik oluşturulamadı');
        return null;
    }
}

function barLabels(formatter, extra = {}) {
    return { display: true, anchor: 'end', align: 'end', offset: -2, font: DL_FONT, ...DL_BAR_PILL, formatter, clip: false, ...extra };
}

function intakeVsCompleted(ob) {
    const series = Array.isArray(ob && ob.series_6m) ? ob.series_6m : [];
    const el = document.getElementById('dash-chart-ob');
    if (!series.length) return chartEmpty(el);
    const d = chartDefaults();
    build('dash-chart-ob', {
        type: 'bar',
        data: {
            labels: series.map((r) => monthLabel(r.month)),
            datasets: [
                { label: 'Açılan iş', data: series.map((r) => n0(r.intake)), backgroundColor: C.blue, borderRadius: 4, kg: series.map((r) => r.intake_kg) },
                { label: 'Tamamlanan iş', data: series.map((r) => n0(r.completed)), backgroundColor: C.grey, borderRadius: 4, kg: series.map((r) => r.completed_kg) },
            ],
        },
        options: {
            ...d,
            scales: { x: scaleOpts({ grid: { display: false } }), y: scaleOpts({ ticks: { precision: 0, color: '#6c757d', font: { size: 11 } } }) },
            plugins: {
                ...d.plugins,
                datalabels: barLabels((v) => (v > 0 ? num(v) : '')),
                tooltip: { ...d.plugins.tooltip, callbacks: { afterLabel: (ctx) => { const kg = ctx.dataset.kg && ctx.dataset.kg[ctx.dataIndex]; return formatTons(kg) ? `  ${formatTons(kg)}` : ''; } } },
            },
        },
    });
}

function completions(dl) {
    const series = Array.isArray(dl && dl.series_6m) ? dl.series_6m : [];
    const el = document.getElementById('dash-chart-dl');
    if (!series.length) return chartEmpty(el);
    const d = chartDefaults();
    const small = series.map((r) => n0(r.on_time) + n0(r.late) < 5);
    build('dash-chart-dl', {
        type: 'bar',
        data: {
            labels: series.map((r) => monthLabel(r.month)),
            datasets: [
                { label: 'Zamanında', data: series.map((r) => n0(r.on_time)), backgroundColor: small.map((s) => (s ? C.lightGrey : C.green)), stack: 'c', borderRadius: 3, order: 2 },
                { label: 'Geç', data: series.map((r) => n0(r.late)), backgroundColor: small.map((s) => (s ? C.grey : C.red)), stack: 'c', borderRadius: 3, order: 2 },
                { type: 'line', label: 'Zamanında %', data: series.map((r) => pf(r.pct)), yAxisID: 'y1', borderColor: '#343a40', backgroundColor: '#343a40', borderWidth: 2, pointRadius: 3, tension: 0.2, order: 1,
                  datalabels: { display: true, align: 'top', anchor: 'end', offset: 4, font: DL_FONT, ...DL_BAR_PILL, formatter: (v, ctx) => (v === null || v === undefined ? '' : (small[ctx.dataIndex] ? `${pct(v)} (az veri)` : pct(v))) } },
                { type: 'line', label: 'Hedef %85', data: series.map(() => 85), yAxisID: 'y1', borderColor: C.green, borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0, fill: false, order: 0, datalabels: { display: false } },
            ],
        },
        options: {
            ...d,
            scales: {
                x: scaleOpts({ stacked: true, grid: { display: false } }),
                y: scaleOpts({ stacked: true, ticks: { precision: 0, color: '#6c757d', font: { size: 11 } } }),
                y1: scaleOpts({ position: 'right', min: 0, max: 100, grid: { display: false }, ticks: { callback: (v) => `%${v}`, color: '#6c757d', font: { size: 10 } } }),
            },
            plugins: { ...d.plugins, tooltip: { ...d.plugins.tooltip, callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.dataset.yAxisID === 'y1' ? pct(ctx.parsed.y, 1) : num(ctx.parsed.y)}` } } },
        },
    });
}

function netKg(pr) {
    const series = Array.isArray(pr && pr.series_13w) ? pr.series_13w : [];
    const el = document.getElementById('dash-chart-pr');
    if (!series.length) return chartEmpty(el);
    const d = chartDefaults();
    const vals = series.map((r) => n0(r.net_kg) / 1000);
    const avg = vals.map((_, i) => {
        if (i < 3) return null;
        const win = vals.slice(i - 3, i + 1);
        return win.reduce((a, b) => a + b, 0) / win.length;
    });
    const hatchBlue = hatchPattern(C.blue), hatchRed = hatchPattern(C.red);
    build('dash-chart-pr', {
        type: 'bar',
        data: {
            labels: series.map((r) => weekLabel(r.week_start)),
            datasets: [
                { label: 'Net ilerleme (t)', data: vals, borderRadius: 3, order: 2,
                  backgroundColor: series.map((r, i) => (r.partial ? (vals[i] < 0 ? hatchRed : hatchBlue) : (vals[i] < 0 ? C.red : C.blue))),
                  borderColor: series.map((r, i) => (vals[i] < 0 ? C.red : C.blue)), borderWidth: series.map((r) => (r.partial ? 1 : 0)),
                  gross: series.map((r) => r.gross_kg), partial: series.map((r) => !!r.partial) },
                { type: 'line', label: '4 haftalık ortalama', data: avg, borderColor: C.line, borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, tension: 0.3, order: 1, spanGaps: true, datalabels: { display: false } },
            ],
        },
        options: {
            ...d,
            scales: { x: scaleOpts({ grid: { display: false }, ticks: { color: '#6c757d', font: { size: 10 }, maxRotation: 0, autoSkip: true } }), y: scaleOpts({ beginAtZero: false, ticks: { callback: (v) => `${num(v, 0)} t`, color: '#6c757d', font: { size: 11 } } }) },
            plugins: {
                ...d.plugins,
                datalabels: barLabels((v, ctx) => (isPhone() ? '' : (ctx.dataset.partial && ctx.dataset.partial[ctx.dataIndex] ? `${num(v, 0)}*` : num(v, 0))), { anchor: (ctx) => (ctx.dataset.data[ctx.dataIndex] < 0 ? 'start' : 'end'), align: (ctx) => (ctx.dataset.data[ctx.dataIndex] < 0 ? 'start' : 'end') }),
                tooltip: { ...d.plugins.tooltip, callbacks: {
                    label: (ctx) => (ctx.dataset.type === 'line' ? `${ctx.dataset.label}: ${num(ctx.parsed.y, 1)} t` : `Net: ${num(ctx.parsed.y, 1)} t${ctx.dataset.partial && ctx.dataset.partial[ctx.dataIndex] ? ' (kısmi hafta)' : ''}`),
                    afterLabel: (ctx) => (ctx.dataset.gross && formatTons(ctx.dataset.gross[ctx.dataIndex]) ? `Brüt: ${formatTons(ctx.dataset.gross[ctx.dataIndex])}` : ''),
                } },
            },
        },
    });
}

function ncr(qs) {
    const series = Array.isArray(qs && qs.series_6m) ? qs.series_6m : [];
    const el = document.getElementById('dash-chart-qs');
    if (!series.length) return chartEmpty(el);
    const d = chartDefaults();
    build('dash-chart-qs', {
        type: 'bar',
        data: {
            labels: series.map((r) => monthLabel(r.month)),
            datasets: [{ label: 'Açılan NCR', data: series.map((r) => n0(r.opened)), backgroundColor: C.purple, borderRadius: 4, per100t: series.map((r) => r.per_100t), netKg: series.map((r) => r.net_kg) }],
        },
        options: {
            ...d,
            scales: { x: scaleOpts({ grid: { display: false } }), y: scaleOpts({ ticks: { precision: 0, color: '#6c757d', font: { size: 11 } } }) },
            plugins: {
                ...d.plugins,
                legend: { display: false },
                datalabels: barLabels((v) => (v > 0 ? num(v) : '')),
                tooltip: { ...d.plugins.tooltip, callbacks: { afterLabel: (ctx) => { const p = ctx.dataset.per100t[ctx.dataIndex]; return p === null || p === undefined ? '100 t net başına: —' : `100 t net başına: ${num(p, 1)}`; } } },
            },
        },
    });
}

function deliveries(mt) {
    const series = Array.isArray(mt && mt.deliveries_13w) ? mt.deliveries_13w : [];
    const el = document.getElementById('dash-chart-mt');
    if (!series.length) return chartEmpty(el);
    const d = chartDefaults();
    const avgV = pf(mt.deliveries_13w_avg);
    build('dash-chart-mt', {
        type: 'line',
        data: {
            labels: series.map((r) => weekLabel(r.week_start)),
            datasets: [
                { label: 'Teslim alınan kalem', data: series.map((r) => n0(r.lines)), borderColor: C.teal, backgroundColor: 'rgba(32, 201, 151, 0.15)', fill: true, tension: 0.3, pointRadius: 3, borderWidth: 2,
                  datalabels: isPhone() ? { display: true, align: 'top', font: { ...DL_FONT, size: 10 }, color: '#1a1a1a', formatter: (v) => num(v) } : { display: false } },
                ...(avgV !== null ? [{ label: '13 haftalık ortalama', data: series.map(() => avgV), borderColor: C.line, borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, fill: false, datalabels: { display: false } }] : []),
            ],
        },
        options: {
            ...d,
            scales: { x: scaleOpts({ grid: { display: false }, ticks: { color: '#6c757d', font: { size: 10 }, maxRotation: 0, autoSkip: true } }), y: scaleOpts({ ticks: { precision: 0, color: '#6c757d', font: { size: 11 } } }) },
            plugins: { ...d.plugins, tooltip: { ...d.plugins.tooltip, callbacks: { label: (ctx) => `${ctx.dataset.label}: ${num(ctx.parsed.y)}` } } },
        },
    });
}

function overtime(pp) {
    const series = Array.isArray(pp && pp.overtime_6m) ? pp.overtime_6m : [];
    const el = document.getElementById('dash-chart-pp');
    if (!series.length) return chartEmpty(el);
    const d = chartDefaults();
    build('dash-chart-pp', {
        type: 'bar',
        data: {
            labels: series.map((r) => monthLabel(r.month)),
            datasets: [{ label: 'Fazla mesai (kişi-saat)', data: series.map((r) => n0(r.hours)), backgroundColor: series.map((r) => (r.partial ? C.lightPurple : C.purple)), borderRadius: 4, partial: series.map((r) => !!r.partial) }],
        },
        options: {
            ...d,
            scales: { x: scaleOpts({ grid: { display: false } }), y: scaleOpts({ ticks: { callback: (v) => `${num(v)} sa`, color: '#6c757d', font: { size: 11 } } }) },
            plugins: {
                ...d.plugins,
                legend: { display: false },
                datalabels: barLabels((v, ctx) => (v > 0 ? `${num(v)}${ctx.dataset.partial[ctx.dataIndex] ? '*' : ''}` : '')),
                tooltip: { ...d.plugins.tooltip, callbacks: { label: (ctx) => `${num(ctx.parsed.y)} sa${ctx.dataset.partial[ctx.dataIndex] ? ' (kısmi ay)' : ''}` } },
            },
        },
    });
}

/* ---------------------------------------------------------------- public API */

const CHART_DEFS = [
    { id: 'ob', section: 'order_book', icon: 'right-left', iconCls: 'text-primary', title: 'Giren vs tamamlanan iş (6 ay)', link: { href: '/management/reports/overview', label: 'Genel bakış' }, build: intakeVsCompleted },
    { id: 'dl', section: 'delivery', icon: 'calendar-check', iconCls: 'text-success', title: 'Zamanında / geç tamamlanan (6 ay)', link: { href: '/management/reports/overview', label: 'Genel bakış' }, build: completions },
    { id: 'pr', section: 'production', icon: 'weight-hanging', iconCls: 'text-primary', title: 'Haftalık net ilerleme (13 hafta)', link: { href: '/management/reports/overview', label: 'Genel bakış' }, build: netKg, footer: '* kısmi hafta' },
    { id: 'qs', section: 'quality_safety', icon: 'triangle-exclamation', iconCls: 'text-danger', title: 'Açılan NCR (6 ay)', link: { href: '/quality-control/ncrs', label: 'NCR listesi' }, build: ncr },
    { id: 'mt', section: 'material', icon: 'truck-ramp-box', iconCls: 'text-success', title: 'Haftalık teslim alınan kalem (13 hafta)', link: { href: '/planning/items?is_delivered=true', label: 'Teslim alınanlar' }, build: deliveries },
    { id: 'pp', section: 'people', icon: 'user-clock', iconCls: 'text-primary', title: 'Fazla mesai kişi-saat (6 ay)', link: { href: '/general/overtime', label: 'Fazla mesai' }, build: overtime },
];

function footerFor(def, sec) {
    if (def.id === 'qs' && sec && sec.unclassified_pct !== null && sec.unclassified_pct !== undefined) return `sınıflandırılmamış ${pct(sec.unclassified_pct)}`;
    if (def.id === 'mt' && sec && sec.deliveries_week !== null && sec.deliveries_week !== undefined) return `bu hafta ${num(sec.deliveries_week)} · 13 hafta ort. ${num(sec.deliveries_13w_avg)}`;
    return def.footer || '';
}

/**
 * Render the Eğilimler row and build the charts (4-6 lazily on phones).
 */
export function renderTrends(host, payload) {
    if (!host) return;
    killCharts();
    if (!payload) {
        host.dataset.state = 'loading';
        host.innerHTML = `<div class="row g-3">${CHART_DEFS.map(() => '<div class="col-12 col-md-6 col-lg-4"><div class="ov-card dash-trend-card"><div class="ov-card-body"><div class="pp-skeleton pp-skeleton-title"></div><div class="pp-skeleton" style="height:140px"></div></div></div></div>').join('')}</div>`;
        return;
    }
    const sections = payload.sections || {};
    const errors = payload.errors || {};
    const phone = isPhone();
    host.dataset.state = 'ready';
    const cards = CHART_DEFS.map((def, i) => {
        const sec = sections[def.section];
        const stampText = sec && sec.generated_at ? `Veri ${stamp(sec.generated_at)}` : '';
        return chartCard({ id: def.id, icon: def.icon, iconCls: def.iconCls, title: def.title, canvasId: `dash-chart-${def.id}`, stampText, link: def.link, footer: footerFor(def, sec), lazy: phone && i >= 3 });
    });
    const first = cards.slice(0, 3).join('');
    const rest = cards.slice(3).join('');
    host.innerHTML = `
        <div class="dash-section-title"><i class="fas fa-chart-line"></i> Eğilimler <span class="dash-section-sub">bu ay vs geçen ay · 6 ay / 13 hafta</span></div>
        <div class="row g-3">${first}</div>
        ${phone ? `<button type="button" class="btn btn-outline-secondary btn-sm dash-more-trends" data-more-trends aria-expanded="false">Daha fazla eğilim</button>` : ''}
        <div class="row g-3 dash-trends-more" ${phone ? 'hidden' : ''}>${rest}</div>`;

    const buildOne = (def) => {
        const sec = sections[def.section];
        const el = document.getElementById(`dash-chart-${def.id}`);
        if (!sec) { chartEmpty(el, errors[def.section] ? 'Bu blok yüklenemedi' : 'Veri yok'); return; }
        try { def.build(sec); } catch (err) { console.error('trend failed', def.id, err); chartEmpty(el, 'Grafik oluşturulamadı'); }
    };
    raf(() => {
        ensureRegistered();
        CHART_DEFS.slice(0, phone ? 3 : 6).forEach(buildOne);
    });
    const moreBtn = host.querySelector('[data-more-trends]');
    if (moreBtn) {
        moreBtn.addEventListener('click', () => {
            const more = host.querySelector('.dash-trends-more');
            if (!more) return;
            more.removeAttribute('hidden');
            moreBtn.setAttribute('aria-expanded', 'true');
            moreBtn.remove();
            raf(() => { ensureRegistered(); CHART_DEFS.slice(3).forEach(buildOne); });
        }, { once: true });
    }
}

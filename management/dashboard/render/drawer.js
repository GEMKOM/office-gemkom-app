/**
 * 'Neden?' drawer content per pillar: the raw numbers + the payload's list
 * arrays as simple tables (escapeHtml + job links). No second endpoint.
 */
import {
    escapeHtml, pf, n0, num, pct, formatTons, formatWd, stamp, stampLabel, shortDate, monthLabel,
    dots, jobLink, sbadge, chip, slowState, SLOW_TEXT, moneyFmt, hiddenMoneyBadge,
} from './util.js';
import { ragBadge } from './rag.js';
import { PILLARS, teamLabel, jobStatusLabel, CAPACITY_VERDICT, MARGIN_VERDICT, NCR_SEVERITY } from './labels.js';
import { svgSparkline } from './charts.js';

function kv(rows) {
    const body = rows.filter((r) => r && r[1] !== '' && r[1] !== null && r[1] !== undefined)
        .map(([k, v]) => `<div class="dash-kv-row"><span class="dash-kv-k">${escapeHtml(k)}</span><span class="dash-kv-v">${v}</span></div>`).join('');
    return body ? `<div class="dash-kv">${body}</div>` : '';
}

function section(title, html, extra = '') {
    if (!html) return '';
    return `<section class="dash-drawer-section"><h6 class="dash-drawer-h">${escapeHtml(title)}${extra ? ` <span class="dash-drawer-h-extra">${extra}</span>` : ''}</h6>${html}</section>`;
}

function table(columns, rows, emptyText = 'Kayıt yok') {
    if (!Array.isArray(rows) || rows.length === 0) return `<div class="dash-empty small">${escapeHtml(emptyText)}</div>`;
    const head = columns.map((c) => `<th${c.num ? ' class="text-end"' : ''}>${escapeHtml(c.label)}</th>`).join('');
    const body = rows.map((r) => `<tr>${columns.map((c) => `<td${c.num ? ' class="text-end"' : ''}>${c.cell(r)}</td>`).join('')}</tr>`).join('');
    return `<div class="table-responsive"><table class="table table-sm dash-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function slowNote(state) {
    return `<div class="dash-empty small" data-slow-state="${state}">${escapeHtml(SLOW_TEXT[state] || SLOW_TEXT.unavailable)}</div>`;
}

function link(href, text) {
    return `<a class="dash-drill" href="${escapeHtml(href)}"><i class="fas fa-arrow-up-right-from-square me-1"></i>${escapeHtml(text)}</a>`;
}

/* ---------------------------------------------------------------- per pillar */

function orderBook(ob, ctx) {
    const b2b = ob.book_to_bill || {};
    const intake = ob.intake || null;
    const value = ob.value;
    const vstate = slowState(value, { slowStatus: ctx.slowStatus, errors: ctx.errors, section: 'order_book', sub: 'value' });
    const parts = [];
    parts.push(section('Defter', kv([
        ['Canlı iş emri', `${num(ob.live_roots)} (aktif ${num(ob.active)} · revizyonda ${num(ob.revision_hold)})`],
        ['Park edilmiş (elle beklemede)', num(ob.manual_hold_roots)],
        ['Müşteri', num(ob.customers)],
        ['Toplam ağırlık', formatTons(ob.total_kg)],
        ['Kalan ağırlık', formatTons(ob.remaining_kg)],
        ['Ağırlıksız iş', num(ob.unweighted_roots)],
        ['Bu ay açılan / geçen ay', `${num(ob.opened_month)} / ${num(ob.opened_prev_month)}`],
    ])));
    parts.push(section('Giren / çıkan (son 3 ay)', kv([
        ['Oran', `${b2b.ratio_kg !== null && b2b.ratio_kg !== undefined ? num(b2b.ratio_kg, 2) : '—'}${b2b.basis === 'count' ? ' ' + chip('grey', 'adet bazlı') : ''}`],
        ['Önceki 3 ay', b2b.prev_ratio_kg !== null && b2b.prev_ratio_kg !== undefined ? num(b2b.prev_ratio_kg, 2) : '—'],
        ['Giren', dots(formatTons(b2b.intake_kg), `${num(b2b.intake_n)} iş`)],
        ['Çıkan', dots(formatTons(b2b.completed_kg), `${num(b2b.completed_n)} iş`)],
        ['Not', b2b.burst_flag ? 'Dönemde toplu tamamlama var' : ''],
    ])));
    if (intake) {
        const series = Array.isArray(intake.series_6m) ? intake.series_6m : [];
        const money = ctx.money;
        parts.push(section('Kazanılan teklifler', kv([
            ['Bu ay', dots(`${num(intake.won_month)} teklif`, money(intake.won_month_eur))],
            ['Geçen ay', dots(`${num(intake.won_prev_month)} teklif`, money(intake.won_prev_month_eur))],
            ['İş emrine dönüşmemiş', n0(intake.won_not_converted) > 0 ? `<span class="pp-num-orange">${num(intake.won_not_converted)} teklif kazanıldı, iş emrine dönüşmedi</span>` : '0'],
        ]) + table([
            { label: 'Ay', cell: (r) => monthLabel(r.month) },
            { label: 'Kazanılan', num: true, cell: (r) => num(r.won) },
            ...(ctx.moneyVisible ? [{ label: 'Tutar', num: true, cell: (r) => money(r.won_eur) || '—' }] : []),
        ], series, 'Seri yok'), ctx.moneyVisible ? '' : hiddenMoneyBadge()));
    }
    let valueHtml;
    if (vstate !== 'ready') valueHtml = slowNote(vstate);
    else valueHtml = kv([
        ['Defter değeri', ctx.moneyVisible ? (ctx.money(value.value_eur) || 'Fiyatlı iş yok') : hiddenMoneyBadge()],
        ['Kendi fiyatı olan', ctx.moneyVisible ? ctx.money(value.own_value_eur) : ''],
        ['Fiyatsız iş', num(value.unpriced_roots)],
        ['En büyük müşterinin payı', value.top_customer_share_pct !== null && value.top_customer_share_pct !== undefined ? pct(value.top_customer_share_pct) : ''],
    ]);
    parts.push(section('Defter değeri', valueHtml, vstate === 'ready' ? escapeHtml(stampLabel(value.generated_at)) : ''));
    parts.push(`<div class="dash-drawer-links">${link('/projects/project-tracking', 'Proje takibi')} ${link('/projects/cost-table', 'Maliyet tablosu')} ${link('/management/reports/overview', 'Genel bakış raporu')}</div>`);
    return parts.join('');
}

function delivery(dl, ctx) {
    const od = dl.overdue || {};
    const otd = dl.otd_13w || {};
    const due = dl.due || {};
    const gate = dl.design_gate || {};
    const slips = dl.slips_30d || null;
    const fc = dl.forecast;
    const fstate = slowState(fc, { slowStatus: ctx.slowStatus, errors: ctx.errors, section: 'delivery', sub: 'forecast' });
    const parts = [];
    parts.push(section('Termini geçen işler', kv([
        ['Sayı', `${num(od.count)} / ${num(od.live_total)} canlı iş`],
        ['Kalan tonajın payı', od.share_kg_pct !== null && od.share_kg_pct !== undefined ? pct(od.share_kg_pct, 1) : ''],
        ['Kalan ağırlık', formatTons(od.remaining_kg)],
        ['Medyan gecikme', od.median_late_wd !== null && od.median_late_wd !== undefined ? formatWd(od.median_late_wd) : ''],
        ['Ağırlıksız', num(od.unweighted)],
    ]) + table([
        { label: 'İş Emri', cell: (r) => jobLink(r.job_no) },
        { label: 'Müşteri', cell: (r) => escapeHtml(r.customer || '—') },
        { label: 'İş Adı', cell: (r) => escapeHtml(r.title || '—') },
        { label: 'Termin', cell: (r) => shortDate(r.target) || '—' },
        { label: 'Gecikme', num: true, cell: (r) => formatWd(r.late_wd) || '—' },
        { label: 'Kalan', num: true, cell: (r) => formatTons(r.remaining_kg) || '—' },
        { label: 'Durum', cell: (r) => (r.hold_kind ? sbadge(r.hold_kind === 'revision' ? 'purple' : 'grey', jobStatusLabel('on_hold', r.hold_kind)) : '') },
    ], od.jobs, 'Termini geçen iş yok')));
    parts.push(section('Zamanında tamamlama (13 hafta)', kv([
        ['Güncel termine göre', `${pct(otd.pct)} (${num(otd.on_time)}/${num(otd.total)})`],
        ['Önceki 13 hafta', otd.prev_pct !== null && otd.prev_pct !== undefined ? `${pct(otd.prev_pct)} (${num(otd.prev_total)} iş)` : ''],
        ['İlk termine göre', otd.vs_original_pct !== null && otd.vs_original_pct !== undefined ? pct(otd.vs_original_pct) : ''],
        ['Not', otd.burst_flag ? 'Dönemde toplu tamamlama var' : ''],
    ])));
    parts.push(section('Yaklaşan termin', kv([
        ['7 gün', num(due.d7)], ['14 gün', dots(num(due.d14), formatTons(due.d14_kg))], ['30 gün', num(due.d30)],
        ['Çizimsiz (30 gün)', num(gate.no_release_due30)],
        ['Tasarım gecikmiş / hedefsiz', `${num(gate.design_late)} / ${num(gate.design_no_target)}`],
    ])));
    if (slips) {
        parts.push(section('Termin değişiklikleri (30 gün)', kv([
            ['Öteleme', num(slips.pushes)], ['Öne çekme', num(slips.pull_ins)], ['İş', num(slips.jobs)],
            ['Ortalama öteleme', slips.avg_push_days !== null && slips.avg_push_days !== undefined ? `${num(slips.avg_push_days, 1)} gün` : ''],
        ])));
    }
    parts.push(section('Öngörü (üretim planı)', fstate !== 'ready' ? slowNote(fstate) : kv([
        ['Geç kalma riski', num(fc.late_risk)], ['Planda', num(fc.on_track)], ['Veri yok', num(fc.no_data)],
        ['Medyan sapma', fc.median_slip_wd !== null && fc.median_slip_wd !== undefined ? formatWd(fc.median_slip_wd) : ''],
        ['14 gün içinde riskli / veri yok', `${num(fc.due14_late_risk)} / ${num(fc.due14_no_data)}`],
    ]), fstate === 'ready' ? escapeHtml(stampLabel(fc.generated_at, 'Öngörü')) : ''));
    parts.push(`<div class="dash-drawer-links">${link('/projects/project-tracking?meeting=1', 'Sunum modu')} ${link('/management/reports/overview', 'Genel bakış raporu')} ${link('/design/release-approvals', 'Çizim onayları')}</div>`);
    return parts.join('');
}

function production(pr, ctx) {
    const nk = pr.net_kg || {};
    const cap = pr.capacity;
    const cnc = pr.cnc_week || {};
    const cstate = slowState(cap, { slowStatus: ctx.slowStatus, errors: ctx.errors, section: 'production', sub: 'capacity' });
    const parts = [];
    parts.push(section('Net ilerleme', kv([
        ['Son 4 tam hafta (net)', formatTons(nk.last4w)], ['Önceki 4 hafta (net)', formatTons(nk.prev4w)],
        ['Son 4 hafta (brüt)', formatTons(nk.gross_last4w)], ['Bu hafta (kısmi)', formatTons(nk.current_week_partial)],
    ])));
    let capHtml;
    if (cstate !== 'ready') capHtml = slowNote(cstate);
    else {
        capHtml = kv([
            ['Açık kaynak işi', formatTons(cap.remaining_kg)], ['Atanmamış', dots(formatTons(cap.unassigned_kg), `${num(cap.unassigned_jobs)} iş`)],
            ['En uzun kuyruk', cap.max_backlog_weeks !== null && cap.max_backlog_weeks !== undefined ? `${num(cap.max_backlog_weeks, 1)} hafta${cap.max_backlog_resource ? ` (${escapeHtml(cap.max_backlog_resource)})` : ''}` : ''],
            ['Aşırı yüklü / sıkışık / hızsız', `${num(cap.overloaded)} / ${num(cap.tight)} / ${num(cap.no_rate)}`],
        ]) + table([
            { label: 'Kaynak', cell: (r) => escapeHtml(r.name || '—') },
            { label: 'Tür', cell: (r) => escapeHtml(r.type === 'unassigned' ? 'atanmamış' : r.type === 'subcontractor' ? 'taşeron' : r.type === 'team' ? 'ekip' : (r.type || '')) },
            { label: 'Kalan', num: true, cell: (r) => formatTons(r.remaining_kg) || '—' },
            { label: 'Hafta', num: true, cell: (r) => (r.weeks === null || r.weeks === undefined ? '—' : num(r.weeks, 1)) },
            { label: 'Durum', cell: (r) => { const v = CAPACITY_VERDICT[r.verdict]; return v ? sbadge(v.color, v.label) : escapeHtml(r.verdict || ''); } },
        ], cap.resources, 'Kaynak yok');
    }
    parts.push(section('Kaynak kapasitesi', capHtml, cstate === 'ready' ? escapeHtml(stampLabel(cap.generated_at, 'Kapasite')) : ''));
    parts.push(section('CNC kesim (bu hafta)', kv([
        ['Kesilen', formatTons(cnc.kg)], ['Geçen hafta', formatTons(cnc.prev_week_kg)], ['Nest / parça', `${num(cnc.nests)} / ${num(cnc.parts)}`],
        ['Plaka bekleyen kesim', num(cnc.waiting_plate)],
    ])));
    parts.push(`<div class="dash-drawer-links">${link('/planning/project-planning', 'Proje planlama (Kapasite)')} ${link('/manufacturing/cnc-cutting/dashboard', 'CNC kesim')} ${link('/management/reports/overview', 'Genel bakış raporu')}</div>`);
    return parts.join('');
}

function qualitySafety(qs) {
    const ncr = qs.ncr_open || {};
    const qc = qs.qc || {};
    const isg = qs.isg || {};
    const parts = [];
    parts.push(section('Bloke eden açık NCR', kv([
        ['Toplam', num(ncr.total)], ['Kritik / Majör / Minör', `${num(ncr.critical)} / ${num(ncr.major)} / ${num(ncr.minor)}`],
        ['30 günden eski', num(ncr.gt30d)], ['Departmanda / KK\'de bekleyen', `${num(ncr.awaiting_dept)} / ${num(ncr.awaiting_qc)}`],
        ['Bu ay açılan / geçen ay', `${num(ncr.opened_month)} / ${num(ncr.opened_prev_month)}`],
        ['Sınıflandırılmamış', qs.unclassified_pct !== null && qs.unclassified_pct !== undefined ? pct(qs.unclassified_pct) : ''],
    ]) + table([
        { label: 'İş Emri', cell: (r) => jobLink(r.job_no) },
        { label: 'Ana iş', cell: (r) => (r.root_job_no && r.root_job_no !== r.job_no ? jobLink(r.root_job_no) : '') },
        { label: 'Müşteri', cell: (r) => escapeHtml(r.customer || '—') },
        { label: 'NCR', num: true, cell: (r) => num(r.n) },
        { label: 'En ağır', cell: (r) => { const s = NCR_SEVERITY[r.worst]; return s ? sbadge(s.color, s.label) : escapeHtml(r.worst || ''); } },
        { label: 'Termin', cell: (r) => shortDate(r.target) || '—' },
    ], ncr.jobs, 'Açık NCR olan canlı iş yok')));
    parts.push(section('KK kapısı', kv([
        ['Bekleyen görev / inceleme', `${num(qc.pending_tasks)} / ${num(qc.pending_reviews)}`],
        ['En eski bekleyen', qc.oldest_pending_days !== null && qc.oldest_pending_days !== undefined ? `${num(qc.oldest_pending_days)} gün` : ''],
        ['Bu ay red oranı', qc.reviewed ? `${pct(qc.rejection_pct)} (${num(qc.rejected)}/${num(qc.reviewed)})` : ''],
        ['Ortalama süre', qc.turnaround_days !== null && qc.turnaround_days !== undefined ? `${num(qc.turnaround_days, 1)} gün` : ''],
    ])));
    parts.push(section('İSG', !isg.has_rows
        ? `<div class="dash-empty small">İSG kaydı yok — modül 18 Eyl 2026'dan beri açık${isg.days_since_go_live !== null && isg.days_since_go_live !== undefined ? ` (${num(isg.days_since_go_live)} gün)` : ''}</div>`
        : kv([
            ['Durum', ragBadge(isg.rag)], ['Açık / devam eden / onay bekleyen', `${num(isg.open)} / ${num(isg.in_progress)} / ${num(isg.resolved)}`],
            ['Gecikmiş', num(isg.overdue)], ['Yüksek + kritik', num(isg.high_critical)],
            ['Bu ay kaza / ramak kala', `${num(isg.accidents_month)} / ${num(isg.near_miss_month)}`],
        ])));
    parts.push(`<div class="dash-drawer-links">${link('/quality-control/ncrs?status__in=draft,submitted,rejected', 'Açık NCR listesi')} ${link('/quality-control/qc-reviews', 'KK incelemeleri')} ${link('/isg/issues?status__in=open,in_progress,resolved', 'İSG kayıtları')}</div>`);
    return parts.join('');
}

function material(mt, ctx) {
    const cr = mt.critical || {};
    const bl = mt.blocked;
    const rq = mt.requests || {};
    const bstate = slowState(bl, { slowStatus: ctx.slowStatus, errors: ctx.errors, section: 'material', sub: 'blocked' });
    const parts = [];
    parts.push(section('Bekleyen kritik kalemler', kv([
        ['Kalem / iş', `${num(cr.count)} / ${num(cr.jobs)}`],
        ['Medyan yaş', cr.median_age_days !== null && cr.median_age_days !== undefined ? `${num(cr.median_age_days)} gün` : ''],
        ['Siparişsiz', num(cr.unordered)], ['Vaadi geçmiş', num(cr.overdue_promise)],
    ]) + table([
        { label: 'İş Emri', cell: (r) => jobLink(r.job_no) },
        { label: 'Müşteri', cell: (r) => escapeHtml(r.customer || '—') },
        { label: 'Kalem', cell: (r) => `${escapeHtml(r.item_code || '')}${r.item_name ? ` <span class="text-muted">${escapeHtml(r.item_name)}</span>` : ''}` },
        { label: 'Miktar', num: true, cell: (r) => dots(num(r.quantity, 0) || escapeHtml(r.quantity || ''), escapeHtml(r.unit || '')).replace(' · ', ' ') },
        { label: 'Talep', cell: (r) => escapeHtml(r.request_number || '—') },
        { label: 'Yaş', num: true, cell: (r) => `${num(r.age_days)} g` },
        { label: 'Vaat', cell: (r) => (r.promise_date ? (r.promise_overdue ? `<span class="pp-num-red">${shortDate(r.promise_date)}</span>` : shortDate(r.promise_date)) : chip('grey', 'siparişsiz')) },
    ], cr.rows, 'Bekleyen kritik kalem yok')));
    let blHtml;
    if (bstate !== 'ready') blHtml = slowNote(bstate);
    else blHtml = kv([
        ['İş', `${num(bl.count)} / ${num(bl.live_total)} (${pct(bl.share_pct, 1)})`],
        ['En uzun bekleme (en az)', bl.max_wait_wd !== null && bl.max_wait_wd !== undefined ? formatWd(bl.max_wait_wd) : ''],
    ]) + table([
        { label: 'İş Emri', cell: (r) => jobLink(r.job_no) },
        { label: 'Müşteri', cell: (r) => escapeHtml(r.customer || '—') },
        { label: 'Bekleme', num: true, cell: (r) => formatWd(r.wait_wd) || '—' },
    ], bl.jobs, 'Öngörü malzeme bekleyen iş göstermiyor');
    parts.push(section('Malzeme bekleyen iş (öngörü)', blHtml, bstate === 'ready' ? escapeHtml(stampLabel(bl.generated_at, 'Öngörü')) : ''));
    parts.push(section('Planlama talep kuyruğu', kv([
        ['Depo kontrolü', num(rq.pending_inventory)], ['ERP girişi', num(rq.pending_erp_entry)], ['Satın alma bekleyen', num(rq.ready)],
        ['90 günden eski açık talep', num(rq.open_gt90d)], ['Departman talebi (gönderilmiş)', num(rq.dept_submitted)],
        ['Bu hafta teslim alınan kalem', mt.deliveries_week !== null && mt.deliveries_week !== undefined ? `${num(mt.deliveries_week)} (13 hafta ort. ${num(mt.deliveries_13w_avg)})` : ''],
    ])));
    parts.push(`<div class="dash-drawer-links">${link('/planning/items?is_critical=true&is_delivered=false', 'Kritik kalemler')} ${link('/manufacturing/material-tracking', 'Malzeme takibi')} ${link('/planning/department-requests', 'Departman talepleri')}</div>`);
    return parts.join('');
}

function finance(fn, ctx) {
    const cm = fn.committed || {};
    const pay = fn.payables || {};
    const mg = fn.margin;
    const money = ctx.money;
    const mstate = slowState(mg, { slowStatus: ctx.slowStatus, errors: ctx.errors, section: 'finance', sub: 'margin' });
    const parts = [];
    if (!ctx.moneyVisible) {
        parts.push(`<div class="dash-money-note">${hiddenMoneyBadge()} Tutarlar için maliyet görüntüleme yetkisi gerekir; sayılar herkese açıktır.</div>`);
    }
    parts.push(section('Verilen sipariş', kv([
        ['Durum', ragBadge(fn.rag)],
        ['Bu ay', dots(money(cm.mtd_eur), `${num(cm.po_count_mtd)} sipariş`)],
        ['Geçen ay aynı gün', money(cm.prev_same_day_eur)], ['Geçen ay toplam', money(cm.prev_month_eur)],
        ['Kur', ctx.meta && ctx.meta.fx ? dots(shortDate(ctx.meta.fx.date, true), ctx.meta.fx.age_days !== null && ctx.meta.fx.age_days !== undefined ? `${num(ctx.meta.fx.age_days)} gün önce` : '', ctx.meta.fx.rates_available === false ? 'kur yok' : '') : ''],
        ['Not', 'DBS alımları sipariş tutarlarına dahil değil'],
    ])));
    const series = Array.isArray(fn.committed_6m) ? fn.committed_6m : [];
    if (ctx.moneyVisible && series.length) {
        const vals = series.map((r) => pf(r.eur));
        const spark = vals.some((v) => v !== null) ? svgSparkline(vals.map((v) => (v === null ? 0 : v)), { highlightLast: true }) : '';
        parts.push(section('Aylık sipariş tutarı (6 ay)', `${spark ? `<div class="dash-spark">${spark}</div>` : ''}${table([
            { label: 'Ay', cell: (r) => monthLabel(r.month) },
            { label: 'Tutar', num: true, cell: (r) => money(r.eur) || '—' },
            { label: 'Sipariş', num: true, cell: (r) => num(r.po_count) },
        ], series, 'Veri yok')}`));
    } else if (series.length) {
        parts.push(section('Aylık sipariş sayısı (6 ay)', table([
            { label: 'Ay', cell: (r) => monthLabel(r.month) },
            { label: 'Sipariş', num: true, cell: (r) => num(r.po_count) },
        ], series, 'Veri yok')));
    }
    parts.push(section('Ödemeler', kv([
        ['Vadesi geçmiş', dots(money(pay.overdue_eur), `${num(pay.overdue_n)} ödeme`)],
        ['7 gün içinde', dots(money(pay.due7_eur), `${num(pay.due7_n)} ödeme`)],
        ['30 gün içinde', dots(money(pay.due30_eur), `${num(pay.due30_n)} ödeme`)],
        ['Tarihsiz', num(pay.undated_n)],
        ['Onay bekleyen hakediş', dots(`${num(pay.statements_submitted_n)}`, money(pay.statements_submitted_eur))],
    ])));
    let mgHtml;
    if (mstate !== 'ready') mgHtml = slowNote(mstate);
    else mgHtml = kv([
        ['Kritik / riskli / sağlıklı', `${num(mg.critical)} / ${num(mg.risky)} / ${num(mg.healthy)}`],
        ['Fiyatsız / veri yok', `${num(mg.no_price)} / ${num(mg.no_data)}`],
        ['Maruziyet', money(mg.exposure_eur)],
        ['Yer tutucu fiyat', num(mg.placeholder_prices)],
        ['Maliyet verisi en eski', mg.cost_data_max_age_days !== null && mg.cost_data_max_age_days !== undefined ? `${num(mg.cost_data_max_age_days)} gün` : ''],
    ]) + table([
        { label: 'İş Emri', cell: (r) => jobLink(r.job_no) },
        { label: 'Müşteri', cell: (r) => escapeHtml(r.customer || '—') },
        { label: 'Durum', cell: (r) => { const v = MARGIN_VERDICT[r.verdict]; return v ? sbadge(v.color, v.label) : escapeHtml(r.verdict || ''); } },
        ...(ctx.moneyVisible ? [
            { label: 'Fiyat', num: true, cell: (r) => money(r.price_eur) || '—' },
            { label: 'Öngörülen maliyet', num: true, cell: (r) => money(r.projected_cost_eur) || '—' },
        ] : []),
    ], mg.jobs, 'Marj riski olan iş yok');
    parts.push(section('Marj riski', mgHtml, mstate === 'ready' ? escapeHtml(stampLabel(mg.generated_at)) : ''));
    parts.push(`<div class="dash-drawer-links">${link('/management/reports/cash-flow', 'Nakit akışı')} ${link('/projects/cost-table', 'Maliyet tablosu')}</div>`);
    return parts.join('');
}

function people(pp, ctx) {
    const ot = pp.overtime || {};
    const cost = pp.overtime_cost;
    const q = pp.queues || {};
    const hc = pp.headcount || {};
    const cstate = slowState(cost, { slowStatus: ctx.slowStatus, errors: ctx.errors, section: 'people', sub: 'overtime_cost' });
    const parts = [];
    parts.push(section('Fazla mesai (kişi-saat)', kv([
        ['Son 30 gün', ot.last30_hours !== null && ot.last30_hours !== undefined ? `${num(ot.last30_hours)} sa` : ''],
        ['Önceki 30 gün', ot.prev30_hours !== null && ot.prev30_hours !== undefined ? `${num(ot.prev30_hours)} sa` : ''],
        ['Bu ay', ot.mtd_hours !== null && ot.mtd_hours !== undefined ? `${num(ot.mtd_hours)} sa` : ''],
    ]) + table([
        { label: 'Ekip', cell: (r) => escapeHtml(r.label || teamLabel(r.team)) },
        { label: 'Saat', num: true, cell: (r) => num(r.hours) },
    ], Array.isArray(ot.by_team) ? ot.by_team : [], 'Ekip verisi yok')));
    let costHtml;
    if (cstate !== 'ready') costHtml = slowNote(cstate);
    else costHtml = kv([
        ['Bu ay', ctx.moneyVisible ? (ctx.money(cost.mtd_eur) || 'Bu ay onaylı mesai yok') : hiddenMoneyBadge()],
        ['Geçen ay', ctx.moneyVisible ? ctx.money(cost.prev_month_eur) : ''],
        ['Tahmini ücretli giriş', num(cost.estimated_entries)],
        ['Not', 'Öğle payı düşülmedi'],
    ]);
    parts.push(section('Fazla mesai maliyeti', costHtml, cstate === 'ready' ? escapeHtml(stampLabel(cost.generated_at)) : ''));
    parts.push(section('İK kuyruğu', kv([
        ['İzin — acil (7 gün içinde)', num(q.vacation_urgent)], ['İzin — tarihi geçmiş', num(q.vacation_past_dated)], ['İzin — diğer', num(q.vacation_other)],
        ['İptal talebi', num(q.cancellation_requested)],
        ['Mesai talebi', dots(num(q.overtime_pending), q.overtime_oldest_days !== null && q.overtime_oldest_days !== undefined ? `en eski ${num(q.overtime_oldest_days)} gün` : '', n0(q.overtime_starts_2d) > 0 ? `${num(q.overtime_starts_2d)} tanesi 2 gün içinde` : '')],
        ['Çalışan', dots(num(hc.active), n0(hc.no_position) > 0 ? `${num(hc.no_position)} pozisyonsuz` : '')],
    ])));
    parts.push(`<div class="dash-drawer-links">${link('/general/overtime/cost-report', 'Mesai maliyet raporu')} ${link('/general/vacation/pending', 'Bekleyen izinler')} ${link('/general/overtime/pending', 'Bekleyen mesailer')}</div>`);
    return parts.join('');
}

const BUILDERS = { order_book: orderBook, delivery, production, quality_safety: qualitySafety, material, finance, people };

/**
 * @returns {{title:string, stamp:string, html:string}}
 */
export function drawerFor(pillarId, state) {
    const p = PILLARS.find((x) => x.id === pillarId);
    const payload = (state && state.payload) || {};
    const meta = payload.meta || {};
    const sections = payload.sections || {};
    const errors = payload.errors || {};
    const sec = sections[pillarId];
    const title = p ? p.title : pillarId;
    if (!p) return { title, stamp: '', html: '<div class="dash-empty">Bilinmeyen bölüm</div>' };
    if (!sec) {
        const why = errors[pillarId] ? `Bu blok yüklenemedi: ${escapeHtml(errors[pillarId])}` : 'Bu bölüm için veri yok';
        return { title, stamp: stampLabel(meta.generated_at), html: `<div class="dash-empty">${why}</div>` };
    }
    const ctx = {
        meta, errors, slowStatus: (state && state.slowStatus) || 'idle',
        money: moneyFmt(meta), moneyVisible: !!meta.money_visible,
    };
    let html;
    try { html = BUILDERS[pillarId](sec, ctx); } catch (err) {
        console.error(`drawer ${pillarId} failed`, err);
        html = '<div class="dash-empty">Ayrıntı oluşturulamadı</div>';
    }
    const ragHtml = sec.rag ? `<div class="dash-drawer-rag">${ragBadge(sec.rag)} <span class="text-muted small">eşik kuralına göre durum (hedefi tutuyor · hedefi tutmuyor ama önceki dönemden iyi · her ikisinden kötü)</span></div>` : '';
    return { title, stamp: stampLabel(sec.generated_at), html: ragHtml + html };
}

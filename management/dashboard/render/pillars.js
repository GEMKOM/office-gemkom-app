/**
 * Seven pillar cards (.pp-tile idiom from projects/project-tracking/meetingTiles.js)
 * plus the mobile RAG dot row. Every value is read from the API CONTRACT path
 * and every section / sub-block may be null (errors map) without throwing.
 */
import {
    escapeHtml, pf, n0, num, pct, formatTons, formatWd, stamp, stampLabel, shortDate,
    chip, dots, skeleton, slowState, SLOW_TEXT, moneyFmt, hiddenMoneyBadge,
} from './util.js';
import { ragClass, ragWord, ragBadge, numClass, trendBadge } from './rag.js';
import { PILLARS, teamLabel } from './labels.js';

const HERO_EMPTY = '—';

/* ---------------------------------------------------------------- card markup */

function subLine(key, html, extraClass = '') {
    if (!html) return '';
    const plain = String(html).replace(/<[^>]*>/g, '');
    return `<div class="pp-tile-sub dash-sub ${extraClass}" data-sub="${key}" title="${escapeHtml(plain)}">${html}</div>`;
}

function slowSub(key, label, state) {
    const text = SLOW_TEXT[state] || SLOW_TEXT.unavailable;
    const cls = state === 'pending' ? 'dash-sub-pending' : 'dash-sub-muted';
    return subLine(key, `<span class="${cls}" data-slow-state="${state}">${escapeHtml(label)} ${escapeHtml(text)}</span>`);
}

export function pillarCard({ id, title, icon, rag, hero, heroClass = '', label = '', context = '', subs = [], stamp: st = '', state = 'ready', message = '', order = null }) {
    const ragW = ragWord(rag);
    const heroHtml = hero ? `<span class="${heroClass}">${hero}</span>` : `<span class="pp-tile-big-dim">${HERO_EMPTY}</span>`;
    const labelPlain = String(label).replace(/<[^>]*>/g, '');
    const ctxPlain = String(context).replace(/<[^>]*>/g, '');
    const body = state === 'error'
        ? `<div class="pp-tile-big"><span class="pp-tile-big-dim">${HERO_EMPTY}</span></div>
           <div class="pp-tile-label dash-sub-muted">${escapeHtml(message)}</div>`
        : `<div class="pp-tile-big">${heroHtml}</div>
           <div class="pp-tile-label" title="${escapeHtml(labelPlain)}">${label}</div>
           ${context ? `<div class="pp-tile-sub dash-ctx" data-sub="context" title="${escapeHtml(ctxPlain)}">${context}</div>` : ''}
           ${subs.join('')}`;
    return `
        <div class="pp-tile ${ragClass(ragW)} pp-tile-click dash-pillar" id="pillar-${id}" data-pillar="${id}" data-rag="${ragW}" data-state="${state}"
             ${order !== null ? `style="--mob-order:${Number(order)}"` : ''} role="button" tabindex="0" aria-label="${escapeHtml(title)} — Neden?" title="Neden? Ayrıntı için tıklayın">
            <div class="pp-tile-head"><i class="fas fa-${icon}"></i><span class="dash-pillar-title">${escapeHtml(title)}</span><span class="pp-tile-hint">Neden?</span></div>
            ${body}
            <div class="pp-tile-stamp" data-stamp>${escapeHtml(st)}</div>
        </div>`;
}

/* ---------------------------------------------------------------- per-pillar builders */

function orderBook(ctx) {
    const { sections, errors, slowStatus, money, moneyVisible } = ctx;
    const ob = sections.order_book;
    if (!ob) return null;
    const live = n0(ob.live_roots);
    const b2b = ob.book_to_bill || null;
    const intake = ob.intake || null;
    const value = ob.value;

    const hero = live > 0 ? formatTons(ob.remaining_kg) || HERO_EMPTY : '';
    const label = live > 0
        ? dots('Kalan iş (ton)', formatTons(ob.total_kg) ? `${formatTons(ob.total_kg)} toplam` : '', `${num(live)} iş / ${num(ob.customers)} müşteri`,
            n0(ob.unweighted_roots) > 0 ? `${num(ob.unweighted_roots)} iş ağırlıksız` : '')
        : 'Canlı iş emri yok';

    const ctxParts = [];
    if (ob.opened_month !== null && ob.opened_month !== undefined) {
        ctxParts.push(`bu ay ${num(ob.opened_month)} yeni iş (geçen ay ${num(ob.opened_prev_month)})`);
    }
    if (intake) {
        const won = `bu ay kazanılan teklif ${num(intake.won_month)}`;
        const wonEur = moneyVisible ? money(intake.won_month_eur) : '';
        ctxParts.push(wonEur ? `${won} (${wonEur})` : won);
    }
    if (n0(ob.manual_hold_roots) > 0) ctxParts.push(`park edilmiş ${num(ob.manual_hold_roots)}`);

    const subs = [];
    if (b2b) {
        const ratio = pf(b2b.ratio_kg);
        const basis = b2b.basis === 'count' ? 'count' : 'kg';
        const completedN = n0(b2b.completed_n);
        if (completedN === 0 && n0(b2b.intake_n) === 0) {
            subs.push(subLine('book_to_bill', '<span class="dash-sub-muted">Son 3 ayda tamamlanan iş yok</span>'));
        } else {
            const ratioTxt = ratio === null ? '—' : num(ratio, 1);
            const parts = [`<span class="${numClass(ob.rag)}">Giren / çıkan ${ratioTxt}</span>`];
            if (basis === 'count') parts.push(chip('grey', 'adet bazlı', 'Ağırlık verisi yetersiz; adet oranı'));
            if (basis === 'kg') parts.push(`${formatTons(b2b.intake_kg)} giren / ${formatTons(b2b.completed_kg)} çıkan`);
            parts.push(`${num(b2b.intake_n)} / ${num(completedN)} iş`);
            if (b2b.burst_flag) parts.push(chip('grey', 'toplu tamamlama', 'Bu dönemde toplu tamamlama var; çıkan iş sayısı şişkin olabilir'));
            subs.push(subLine('book_to_bill', dots(...parts)));
        }
    }
    const vstate = slowState(value, { slowStatus, errors, section: 'order_book', sub: 'value' });
    if (vstate !== 'ready') {
        subs.push(slowSub('value', 'Defter değeri', vstate));
    } else if (!moneyVisible) {
        subs.push(subLine('value', dots(`Defter değeri ${hiddenMoneyBadge()}`,
            n0(value.unpriced_roots) > 0 ? `<span class="pp-num-orange">${num(value.unpriced_roots)} iş fiyatsız</span>` : '')));
    } else {
        const v = money(value.value_eur);
        const parts = [v ? `${v} defter` : '<span class="dash-sub-muted">Fiyatlı iş yok</span>'];
        if (n0(value.unpriced_roots) > 0) parts.push(`<span class="pp-num-orange">${num(value.unpriced_roots)} iş fiyatsız</span>`);
        const share = pf(value.top_customer_share_pct);
        if (share !== null) parts.push(`${share >= 40 ? '<span class="pp-num-orange">' : ''}en büyük müşteri ${pct(share)}${share >= 40 ? '</span>' : ''}`);
        subs.push(subLine('value', dots(...parts)));
    }

    return {
        rag: ob.rag, hero, heroClass: '', label, context: dots(...ctxParts), subs,
        stamp: stampLabel(ob.generated_at),
    };
}

function delivery(ctx) {
    const { sections, errors, slowStatus } = ctx;
    const dl = sections.delivery;
    if (!dl) return null;
    const od = dl.overdue || {};
    const otd = dl.otd_13w || null;
    const due = dl.due || null;
    const gate = dl.design_gate || null;
    const fc = dl.forecast;
    const liveTotal = n0(od.live_total);

    const share = pf(od.share_kg_pct);
    const hero = n0(od.count) === 0 ? '' : (share === null ? num(od.count) : pct(share));
    const label = n0(od.count) === 0
        ? 'Termini geçen iş yok'
        : dots('Termini geçen iş (kalan tonajın %)', `${num(od.count)}/${num(liveTotal)} iş`);
    const context = n0(od.count) === 0 ? '' : dots(
        formatTons(od.remaining_kg),
        od.median_late_wd !== null && od.median_late_wd !== undefined ? `medyan ${formatWd(od.median_late_wd)}` : '',
        n0(od.unweighted) > 0 ? `${num(od.unweighted)} iş ağırlıksız` : '',
    );

    const subs = [];
    if (otd) {
        const total = n0(otd.total);
        if (total === 0) {
            subs.push(subLine('otd', '<span class="dash-sub-muted">Son 13 haftada tamamlanan iş yok</span>'));
        } else {
            const small = total < 5;
            const p = pct(otd.pct);
            const parts = [
                small ? `Zamanında ${p} <span class="dash-sub-muted">(az veri)</span>` : `Zamanında <span class="${numClass(dl.rag)}">${p}</span>`,
                `${num(otd.on_time)}/${num(total)} iş`,
                otd.prev_pct !== null && otd.prev_pct !== undefined ? `önceki 13 hafta ${pct(otd.prev_pct)}` : '',
            ];
            if (otd.burst_flag) parts.push(chip('grey', 'toplu tamamlama', 'Dönemde toplu tamamlama var'));
            subs.push(subLine('otd', dots(...parts)));
        }
    }
    if (due) {
        if (n0(due.d30) === 0) {
            subs.push(subLine('due', '<span class="dash-sub-muted">30 gün içinde termini olan iş yok</span>'));
        } else {
            const kg = formatTons(due.d14_kg);
            subs.push(subLine('due', dots(`7 gün ${num(due.d7)}`, `14 gün ${num(due.d14)}${kg ? ` (${kg})` : ''}`, `30 gün ${num(due.d30)}`)));
        }
    }
    const fstate = slowState(fc, { slowStatus, errors, section: 'delivery', sub: 'forecast' });
    const gateParts = [];
    if (fstate === 'ready') {
        const d14 = n0(due && due.d14);
        const risk = n0(fc.due14_late_risk);
        const riskHot = d14 >= 4 && risk >= d14 * 0.5;
        gateParts.push(riskHot ? chip('red', `risk ${num(risk)}`, 'Öngörü: 14 gün içindeki işlerin yarısından fazlası geç kalma riskinde') : `risk ${num(risk)}`);
        gateParts.push(`veri yok ${num(fc.due14_no_data)}`);
        gateParts.push(`<span class="dash-sub-muted">(Öngörü ${stamp(fc.generated_at)})</span>`);
    } else if (fstate === 'pending') {
        gateParts.push(`<span class="dash-sub-pending" data-slow-state="pending">öngörü ${SLOW_TEXT.pending}</span>`);
    } else {
        gateParts.push(chip('grey', 'öngörü yok', fstate === 'failed' ? 'Öngörü bloğu yüklenemedi' : 'Üretim planı öngörüsü henüz hesaplanmadı'));
    }
    if (gate) {
        if (n0(gate.no_release_due30) >= 1) gateParts.push(chip('purple', `çizimsiz ${num(gate.no_release_due30)} iş`, '30 gün içinde termini olan, çizimi yayınlanmamış işler'));
        if (n0(gate.design_late) > 0) gateParts.push(`tasarım gecikmiş ${num(gate.design_late)}`);
    }
    subs.push(subLine('forecast', dots(...gateParts)));

    return {
        rag: dl.rag, hero, heroClass: numClass(dl.rag), label, context, subs,
        stamp: stampLabel(dl.generated_at),
    };
}

function production(ctx) {
    const { sections, errors, slowStatus } = ctx;
    const pr = sections.production;
    if (!pr) return null;
    const nk = pr.net_kg || null;
    const cap = pr.capacity;
    const cnc = pr.cnc_week || null;

    const last4 = nk ? pf(nk.last4w) : null;
    const hero = last4 === null ? '' : `${num(last4)} kg`;
    const label = last4 === null ? 'Son 4 haftada ilerleme kaydı yok' : 'Net ilerleme (kg) · son 4 hafta';
    const context = nk ? dots(
        nk.prev4w !== null && nk.prev4w !== undefined ? `önceki 4 hafta ${formatTons(nk.prev4w)}` : '',
        trendBadge(nk.last4w, nk.prev4w, { goodWhen: 'up', title: `brüt ${formatTons(nk.gross_last4w) || '—'}` }),
        nk.current_week_partial !== null && nk.current_week_partial !== undefined ? `bu hafta (kısmi) ${formatTons(nk.current_week_partial)}` : '',
    ) : '';

    const subs = [];
    const cstate = slowState(cap, { slowStatus, errors, section: 'production', sub: 'capacity' });
    if (cstate !== 'ready') {
        subs.push(slowSub('capacity', 'Kaynak kapasitesi', cstate === 'unavailable' ? 'unavailable' : cstate));
    } else {
        const parts = [];
        const rem = formatTons(cap.remaining_kg);
        parts.push(rem ? `${rem} açık` : 'Kapasite raporu henüz hesaplanmadı');
        const weeks = pf(cap.max_backlog_weeks);
        if (weeks !== null) {
            parts.push(`en uzun kuyruk <span class="${numClass(pr.rag)}">${num(weeks, 1)} hafta</span>${cap.max_backlog_resource ? ` (${escapeHtml(cap.max_backlog_resource)})` : ''}`);
        }
        if (n0(cap.unassigned_jobs) > 0) parts.push(`atanmamış ${num(cap.unassigned_jobs)} iş`);
        if (n0(cap.overloaded) > 0) parts.push(chip('red', `aşırı yüklü ${num(cap.overloaded)}`));
        else if (n0(cap.tight) > 0) parts.push(chip('orange', `sıkışık ${num(cap.tight)}`));
        parts.push(`<span class="dash-sub-muted">(Kapasite ${stamp(cap.generated_at)})</span>`);
        subs.push(subLine('capacity', dots(...parts)));
    }
    if (cnc) {
        const kg = pf(cnc.kg);
        if (kg === null || (kg === 0 && n0(cnc.nests) === 0)) {
            subs.push(subLine('cnc', dots('<span class="dash-sub-muted">Bu hafta kesim yok</span>',
                n0(cnc.waiting_plate) > 0 ? chip(n0(cnc.waiting_plate) >= 5 ? 'orange' : 'grey', `${num(cnc.waiting_plate)} kesim plaka bekliyor`) : '')));
        } else {
            const parts = [`CNC ${formatTons(kg)}`, `${num(cnc.nests)} nest`];
            if (cnc.prev_week_kg !== null && cnc.prev_week_kg !== undefined) parts.push(`geçen hafta ${formatTons(cnc.prev_week_kg)}`);
            if (n0(cnc.waiting_plate) > 0) parts.push(chip(n0(cnc.waiting_plate) >= 5 ? 'orange' : 'grey', `${num(cnc.waiting_plate)} kesim plaka bekliyor`));
            subs.push(subLine('cnc', dots(...parts)));
        }
    }
    return { rag: pr.rag, hero, heroClass: '', label, context, subs, stamp: stampLabel(pr.generated_at) };
}

function qualitySafety(ctx) {
    const { sections } = ctx;
    const qs = sections.quality_safety;
    if (!qs) return null;
    const ncr = qs.ncr_open || null;
    const qc = qs.qc || null;
    const isg = qs.isg || null;

    const total = ncr ? n0(ncr.total) : 0;
    const hero = ncr ? num(total) : '';
    const label = !ncr ? 'NCR verisi yok' : total === 0
        ? 'Bloke eden açık NCR yok'
        : dots('Bloke eden açık NCR',
            `<span class="${n0(ncr.critical) > 0 ? 'pp-num-red' : ''}">Kritik ${num(ncr.critical)}</span>`,
            `<span class="${n0(ncr.major) >= 3 ? 'pp-num-orange' : ''}">Majör ${num(ncr.major)}</span>`,
            `Minör ${num(ncr.minor)}`);
    const context = ncr ? dots(
        total > 0 ? `<span class="${n0(ncr.gt30d) > 0 ? 'pp-num-orange' : ''}">${num(ncr.gt30d)} tanesi 30 günden eski</span>` : '',
        ncr.opened_month !== null && ncr.opened_month !== undefined ? `bu ay açılan ${num(ncr.opened_month)} (geçen ay ${num(ncr.opened_prev_month)})` : '',
    ) : '';

    const subs = [];
    if (qc) {
        const pending = n0(qc.pending_tasks);
        const parts = [];
        if (pending === 0) parts.push('<span class="dash-sub-muted">KK bekleyen görev yok</span>');
        else {
            parts.push(`KK ${num(pending)} görev bekliyor`);
            const oldest = n0(qc.oldest_pending_days);
            parts.push(oldest > 14 ? chip('orange', `en eski ${num(oldest)} gün`) : `en eski ${num(oldest)} gün`);
        }
        const reviewed = n0(qc.reviewed);
        if (reviewed > 0) {
            const rate = reviewed < 5 ? `red ${pct(qc.rejection_pct)}` : `red <span class="${n0(qc.rejection_pct) > 0 ? '' : 'pp-num-green'}">${pct(qc.rejection_pct)}</span>`;
            parts.push(`bu ay ${rate} (${num(qc.rejected)}/${num(reviewed)})`);
            if (qc.turnaround_days !== null && qc.turnaround_days !== undefined) parts.push(`${num(qc.turnaround_days, 1)} gün`);
        }
        subs.push(subLine('qc', dots(...parts)));
    }
    if (isg) {
        if (!isg.has_rows) {
            const days = isg.days_since_go_live;
            subs.push(subLine('isg', dots(chip('grey', 'İSG kayıt yok'),
                days !== null && days !== undefined ? `modül ${num(days)} gündür açık` : 'modül 18 Eyl 2026\'dan beri açık')));
        } else {
            const parts = [ragBadge(isg.rag, 'İSG')];
            parts.push(`Açık ${num(isg.open)}`);
            parts.push(`Onay bekleyen ${num(isg.resolved)}`);
            parts.push(`<span class="${n0(isg.overdue) > 0 ? 'pp-num-red' : ''}">Gecikmiş ${num(isg.overdue)}</span>`);
            if (n0(isg.high_critical) > 0) parts.push(`<span class="pp-num-red">yüksek/kritik ${num(isg.high_critical)}</span>`);
            parts.push(`Ramak kala (ay) ${num(isg.near_miss_month)}`);
            if (n0(isg.accidents_month) > 0) parts.push(`<span class="pp-num-red">kaza (ay) ${num(isg.accidents_month)}</span>`);
            subs.push(subLine('isg', dots(...parts)));
        }
    }
    return { rag: qs.rag, hero, heroClass: total > 0 ? numClass(qs.rag) : '', label, context, subs, stamp: stampLabel(qs.generated_at) };
}

function material(ctx) {
    const { sections, errors, slowStatus } = ctx;
    const mt = sections.material;
    if (!mt) return null;
    const cr = mt.critical || null;
    const bl = mt.blocked;
    const rq = mt.requests || null;

    const count = cr ? n0(cr.count) : 0;
    const hero = cr ? num(count) : '';
    const label = !cr ? 'Kritik kalem verisi yok' : count === 0 ? 'Bekleyen kritik kalem yok'
        : dots('Bekleyen kritik kalem', `${num(cr.jobs)} iş`, cr.median_age_days !== null && cr.median_age_days !== undefined ? `medyan ${num(cr.median_age_days)} gün` : '');
    const context = cr && count > 0 ? dots(
        `<span class="${n0(cr.unordered) > 0 ? 'pp-num-orange' : ''}">${num(cr.unordered)} siparişsiz</span>`,
        `<span class="${n0(cr.overdue_promise) > 0 ? 'pp-num-red' : ''}">${num(cr.overdue_promise)} vaadi geçmiş</span>`,
    ) : '';

    const subs = [];
    const bstate = slowState(bl, { slowStatus, errors, section: 'material', sub: 'blocked' });
    if (bstate !== 'ready') {
        subs.push(bstate === 'pending'
            ? slowSub('blocked', 'Malzeme bekleyen iş (öngörü)', 'pending')
            : subLine('blocked', dots('Malzeme bekleyen iş', chip('grey', 'öngörü yok', bstate === 'failed' ? 'Öngörü bloğu yüklenemedi' : 'Öngörü henüz hesaplanmadı'))));
    } else if (n0(bl.count) === 0) {
        subs.push(subLine('blocked', '<span class="dash-sub-muted">Öngörü malzeme bekleyen iş göstermiyor</span>'));
    } else {
        subs.push(subLine('blocked', dots(
            `Malzeme bekleyen <span class="${n0(bl.share_pct) > 15 ? 'pp-num-orange' : ''}">${num(bl.count)}/${num(bl.live_total)} iş</span>`,
            bl.max_wait_wd !== null && bl.max_wait_wd !== undefined ? `en az ${formatWd(bl.max_wait_wd)}` : '',
            `<span class="dash-sub-muted">(Öngörü ${stamp(bl.generated_at)})</span>`,
        )));
    }
    if (rq) {
        const open = n0(rq.pending_inventory) + n0(rq.pending_erp_entry) + n0(rq.ready);
        if (open === 0 && n0(rq.dept_submitted) === 0) {
            subs.push(subLine('requests', '<span class="dash-sub-muted">Bekleyen planlama talebi yok</span>'));
        } else {
            const gt90 = n0(rq.open_gt90d);
            subs.push(subLine('requests', dots(
                `Depo ${num(rq.pending_inventory)}`, `ERP ${num(rq.pending_erp_entry)}`, `Satın alma ${num(rq.ready)}`,
                gt90 > 0 ? (gt90 > 100 ? chip('orange', `${num(gt90)} talep 90 günden eski`) : `${num(gt90)} talep 90 günden eski`) : '',
                n0(rq.dept_submitted) > 0 ? `DT ${num(rq.dept_submitted)}` : '',
            )));
        }
    }
    return { rag: mt.rag, hero, heroClass: count > 0 ? numClass(mt.rag) : '', label, context, subs, stamp: stampLabel(mt.generated_at) };
}

function finance(ctx) {
    const { sections, errors, slowStatus, money, moneyVisible, decisions } = ctx;
    const fn = sections.finance;
    if (!fn) return null;
    const cm = fn.committed || null;
    const pay = fn.payables || null;
    const mg = fn.margin;
    const mstate = slowState(mg, { slowStatus, errors, section: 'finance', sub: 'margin' });

    if (!moneyVisible) {
        // fn_hidden_stub: verdict + counts, never amounts.
        const prCount = decisions && decisions.by_type && decisions.by_type.purchase_request ? n0(decisions.by_type.purchase_request.count) : null;
        const subs = [];
        if (pay) subs.push(subLine('payables', dots(`vadesi geçmiş <span class="${n0(pay.overdue_n) > 0 ? 'pp-num-red' : ''}">${num(pay.overdue_n)} ödeme</span>`,
            `7 gün ${num(pay.due7_n)}`, `30 gün ${num(pay.due30_n)}`, n0(pay.undated_n) > 0 ? `${num(pay.undated_n)} tarihsiz` : '')));
        if (mstate !== 'ready') subs.push(slowSub('margin', 'Marj riski', mstate));
        else subs.push(subLine('margin', dots(`kritik marj <span class="${n0(mg.critical) > 0 ? 'pp-num-red' : ''}">${num(mg.critical)} iş</span>`, `riskli ${num(mg.risky)}`, `sağlıklı ${num(mg.healthy)}`)));
        if (prCount !== null) subs.push(subLine('purchase', `onay bekleyen ${num(prCount)} satın alma talebi`));
        return {
            rag: fn.rag, hero: ragBadge(fn.rag), heroClass: 'dash-hero-badge', label: dots(hiddenMoneyBadge(), 'Tutarlar için maliyet görüntüleme yetkisi gerekir'),
            context: cm ? `bu ay ${num(cm.po_count_mtd)} sipariş` : '', subs, stamp: stampLabel(fn.generated_at),
        };
    }

    const mtd = cm ? money(cm.mtd_eur) : '';
    const hero = cm ? (mtd || '') : '';
    const label = !cm ? 'Sipariş verisi yok' : (!mtd && n0(cm.po_count_mtd) === 0) ? 'Bu ay sipariş verilmedi' : dots('Bu ay verilen sipariş (€)', `${num(cm.po_count_mtd)} sipariş`);
    const context = cm ? dots(
        money(cm.prev_same_day_eur) ? `geçen ay aynı gün ${money(cm.prev_same_day_eur)} ${trendBadge(cm.mtd_eur, cm.prev_same_day_eur, { goodWhen: 'down', title: 'Taahhüt edilen harcama; düşüş iyi okunur' })}` : '',
        money(cm.prev_month_eur) ? `geçen ay toplam ${money(cm.prev_month_eur)}` : '',
        ctx.meta && ctx.meta.fx && ctx.meta.fx.date ? `Kur ${shortDate(ctx.meta.fx.date)}` : '',
    ) : '';

    const subs = [];
    if (pay) {
        const anyOpen = n0(pay.overdue_n) + n0(pay.due7_n) + n0(pay.due30_n) + n0(pay.undated_n) > 0;
        if (!anyOpen) subs.push(subLine('payables', '<span class="dash-sub-muted">Açık ödeme yok</span>'));
        else {
            const ov = money(pay.overdue_eur);
            subs.push(subLine('payables', dots(
                `Vadesi geçmiş <span class="${n0(pay.overdue_n) > 0 ? 'pp-num-red' : ''}">${ov || num(pay.overdue_n)}${ov ? ` (${num(pay.overdue_n)})` : ' ödeme'}</span>`,
                `7 gün ${[money(pay.due7_eur), `(${num(pay.due7_n)})`].filter(Boolean).join(' ')}`,
                `30 gün ${[money(pay.due30_eur), `(${num(pay.due30_n)})`].filter(Boolean).join(' ')}`,
                n0(pay.undated_n) > 0 ? `${num(pay.undated_n)} tarihsiz` : '',
                n0(pay.statements_submitted_n) > 0 ? `hakediş ${num(pay.statements_submitted_n)}${money(pay.statements_submitted_eur) ? ` (${money(pay.statements_submitted_eur)})` : ''}` : '',
            )));
        }
    }
    if (mstate !== 'ready') subs.push(slowSub('margin', 'Marj riski', mstate));
    else {
        const cov = n0(mg.critical) + n0(mg.risky) + n0(mg.healthy);
        if (cov === 0 && n0(mg.no_price) === 0) subs.push(subLine('margin', '<span class="dash-sub-muted">Maliyet özeti olan canlı iş yok</span>'));
        else {
            const parts = [
                `Marj: <span class="${n0(mg.critical) > 0 ? 'pp-num-red' : ''}">Kritik ${num(mg.critical)}</span>`,
                `<span class="${n0(mg.risky) > 0 ? 'pp-num-orange' : ''}">Riskli ${num(mg.risky)}</span>`,
                `Sağlıklı ${num(mg.healthy)}`,
                n0(mg.no_price) > 0 ? `fiyatsız ${num(mg.no_price)}` : '',
                money(mg.exposure_eur) ? `${money(mg.exposure_eur)} maruziyet` : '',
                n0(mg.placeholder_prices) > 0 ? chip('purple', `${num(mg.placeholder_prices)} yer tutucu fiyat`) : '',
            ];
            subs.push(subLine('margin', dots(...parts)));
        }
    }
    return { rag: fn.rag, hero, heroClass: '', label, context, subs, stamp: stampLabel(fn.generated_at) };
}

function people(ctx) {
    const { sections, errors, slowStatus, money, moneyVisible } = ctx;
    const pp = sections.people;
    if (!pp) return null;
    const ot = pp.overtime || null;
    const cost = pp.overtime_cost;
    const q = pp.queues || null;
    const hc = pp.headcount || null;

    const last30 = ot ? pf(ot.last30_hours) : null;
    const hero = last30 === null ? '' : (last30 === 0 ? '' : `${num(last30)} sa`);
    const label = last30 === null ? 'Fazla mesai verisi yok' : last30 === 0 ? 'Son 30 günde onaylı fazla mesai yok' : 'Fazla mesai (kişi-saat, son 30 gün)';
    const teams = ot && Array.isArray(ot.by_team) ? ot.by_team.slice(0, 3) : [];
    const context = ot ? dots(
        ot.prev30_hours !== null && ot.prev30_hours !== undefined ? `önceki 30 gün ${num(ot.prev30_hours)} sa` : '',
        trendBadge(ot.last30_hours, ot.prev30_hours, { goodWhen: 'down', minPrev: 50, title: 'Fazla mesai artışı olumsuz okunur' }),
        teams.map((t) => `${escapeHtml(t.label || teamLabel(t.team))} ${num(t.hours)}`).join(' · '),
        ot.mtd_hours !== null && ot.mtd_hours !== undefined ? `bu ay ${num(ot.mtd_hours)} sa` : '',
    ) : '';

    const subs = [];
    const cstate = slowState(cost, { slowStatus, errors, section: 'people', sub: 'overtime_cost' });
    if (cstate !== 'ready') subs.push(slowSub('overtime_cost', 'Mesai maliyeti', cstate));
    else if (!moneyVisible) {
        subs.push(subLine('overtime_cost', dots(`Mesai maliyeti ${hiddenMoneyBadge()}`,
            n0(cost.estimated_entries) > 0 ? chip('orange', `${num(cost.estimated_entries)} giriş tahmini ücret`) : '')));
    } else {
        const mtd = money(cost.mtd_eur);
        subs.push(subLine('overtime_cost', dots(
            mtd ? `Mesai maliyeti ${mtd} bu ay` : '<span class="dash-sub-muted">Bu ay onaylı mesai yok</span>',
            money(cost.prev_month_eur) ? `geçen ay ${money(cost.prev_month_eur)}` : '',
            n0(cost.estimated_entries) > 0 ? chip('orange', `${num(cost.estimated_entries)} giriş tahmini`, 'Ücreti tahmini olan girişler · öğle payı düşülmedi') : '',
        )));
    }
    if (q) {
        const anyQ = n0(q.vacation_urgent) + n0(q.vacation_past_dated) + n0(q.vacation_other) + n0(q.overtime_pending) + n0(q.cancellation_requested) > 0;
        const parts = [];
        if (!anyQ) parts.push('<span class="dash-sub-muted">Bekleyen İK talebi yok</span>');
        else {
            const vac = n0(q.vacation_urgent) + n0(q.vacation_past_dated) + n0(q.vacation_other);
            parts.push(`İzin ${num(vac)}`);
            if (n0(q.vacation_urgent) > 0) parts.push(chip('red', `${num(q.vacation_urgent)} acil`, 'Başlangıcı 7 gün içinde'));
            if (n0(q.vacation_past_dated) > 0) parts.push(chip('grey', `${num(q.vacation_past_dated)} tarihi geçmiş`));
            if (n0(q.cancellation_requested) > 0) parts.push(`${num(q.cancellation_requested)} iptal talebi`);
            parts.push(`Mesai ${num(q.overtime_pending)}${q.overtime_oldest_days !== null && q.overtime_oldest_days !== undefined ? ` (en eski ${num(q.overtime_oldest_days)} g)` : ''}`);
            if (n0(q.overtime_starts_2d) > 0) parts.push(chip('red', `${num(q.overtime_starts_2d)} mesai 2 gün içinde`));
        }
        if (hc) parts.push(`${num(hc.active)} çalışan${n0(hc.no_position) > 0 ? `, ${num(hc.no_position)} pozisyonsuz` : ''}`);
        subs.push(subLine('queues', dots(...parts)));
    }
    return { rag: pp.rag, hero, heroClass: numClass(pp.rag), label, context, subs, stamp: stampLabel(pp.generated_at) };
}

const BUILDERS = { order_book: orderBook, delivery, production, quality_safety: qualitySafety, material, finance, people };

/* ---------------------------------------------------------------- public API */

/**
 * Render the seven cards into `host`.
 * @param {HTMLElement} host
 * @param {object} state {payload:{meta,sections,errors}, slowStatus:'pending'|'done'|'failed'|'idle'}
 */
export function renderPillars(host, state) {
    if (!host) return;
    const payload = state && state.payload;
    if (!payload) {
        host.dataset.state = 'loading';
        host.innerHTML = PILLARS.map((p) => `
            <div class="pp-tile pp-tile-grey dash-pillar" data-pillar="${p.id}" data-state="loading" style="--mob-order:${p.mobileOrder}">
                <div class="pp-tile-head"><i class="fas fa-${p.icon}"></i>${escapeHtml(p.title)}</div>${skeleton(4)}
            </div>`).join('');
        return;
    }
    const meta = payload.meta || {};
    const sections = payload.sections || {};
    const errors = payload.errors || {};
    const ctx = {
        meta, sections, errors,
        slowStatus: state.slowStatus || 'idle',
        money: moneyFmt(meta),
        moneyVisible: !!meta.money_visible,
        decisions: sections.decisions || null,
    };
    const serveStamp = stamp(meta.generated_at);
    host.dataset.state = 'ready';
    host.innerHTML = PILLARS.map((p) => {
        let model = null;
        try { model = BUILDERS[p.id](ctx); } catch (err) { console.error(`pillar ${p.id} render failed`, err); model = null; }
        if (!model) {
            const msg = errors[p.id] ? `Bu blok yüklenemedi${serveStamp ? ` (${serveStamp})` : ''}` : 'Veri yok';
            return pillarCard({ id: p.id, title: p.title, icon: p.icon, rag: 'grey', state: 'error', message: msg, stamp: serveStamp ? `Veri ${serveStamp}` : '', order: p.mobileOrder });
        }
        return pillarCard({ id: p.id, title: p.title, icon: p.icon, ...model, order: p.mobileOrder });
    }).join('');
}

/** Mobile dot row: 7 coloured dots with pillar initials; tap scrolls to the card. */
export function renderRagDots(host, meta) {
    if (!host) return;
    const rs = (meta && meta.rag_summary) || {};
    host.innerHTML = PILLARS.map((p) => {
        const w = ragWord(rs[p.id]);
        return `<button type="button" class="dash-rag-dot" data-pillar="${p.id}" data-rag="${w}" title="${escapeHtml(p.title)} · ${escapeHtml(w === 'grey' ? 'veri yok' : w)}" aria-label="${escapeHtml(p.title)}">
            <span class="dash-rag-dot-mark dash-rag-${w}"></span><span class="dash-rag-dot-txt">${escapeHtml(p.initials)}</span></button>`;
    }).join('');
}

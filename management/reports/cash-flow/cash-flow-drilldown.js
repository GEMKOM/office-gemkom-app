import { getInflowDetail } from '../../../apis/sales/reports.js';
import { getOutflowDetail } from '../../../apis/procurement/reports.js';
import { showNotification } from '../../../components/notification/notification.js';

const EUR = 'EUR';
let offcanvasInstance = null;

export function initCashFlowDrilldown() {
    const el = document.getElementById('cf-drilldown-offcanvas');
    if (!el) return;
    offcanvasInstance = bootstrap.Offcanvas.getOrCreateInstance(el);
}

export function openCashFlowDrilldown(month, monthLabel) {
    if (!month || !offcanvasInstance) return;
    const titleEl = document.getElementById('cf-drilldown-title');
    if (titleEl) titleEl.textContent = `${monthLabel || month} — Nakit Akış Detayı`;
    setDrawerLoading(true);
    document.getElementById('cf-drilldown-error')?.classList.add('d-none');
    document.getElementById('cf-drilldown-empty')?.classList.add('d-none');
    offcanvasInstance.show();
    loadDrilldown(month);
}

function setDrawerLoading(on) {
    document.getElementById('cf-drilldown-summary')?.classList.toggle('d-none', on);
    document.getElementById('cf-drilldown-tabs-wrap')?.classList.toggle('d-none', on);
    document.getElementById('cf-drilldown-loading')?.classList.toggle('d-none', !on);
}

function showDrawerError(msg) {
    const el = document.getElementById('cf-drilldown-error');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('d-none');
    document.getElementById('cf-drilldown-summary')?.classList.add('d-none');
    document.getElementById('cf-drilldown-tabs-wrap')?.classList.add('d-none');
    document.getElementById('cf-drilldown-loading')?.classList.add('d-none');
}

async function loadDrilldown(month) {
    const [inRes, outRes] = await Promise.allSettled([
        getInflowDetail(month),
        getOutflowDetail(month)
    ]);

    let inflow = [];
    let outflow = [];
    const warnings = [];

    if (inRes.status === 'fulfilled') inflow = Array.isArray(inRes.value) ? inRes.value : [];
    else warnings.push('Giriş detayı yüklenemedi.');

    if (outRes.status === 'fulfilled') outflow = Array.isArray(outRes.value) ? outRes.value : [];
    else warnings.push('Çıkış detayı yüklenemedi.');

    if (warnings.length === 2) {
        showDrawerError('Detay verisi yüklenemedi.');
        showNotification(warnings.join(' '), 'error');
        return;
    }
    if (warnings.length) showNotification(warnings.join(' '), 'warning');

    const inTotal = inflow.reduce((s, r) => s + num(r.installment_amount_eur), 0);
    const outTotal = outflow.reduce((s, r) => s + num(r.amount_eur), 0);
    renderSummary(inTotal, outTotal, inTotal - outTotal);
    renderTabs(inflow.length, outflow.length);
    renderInflowTab(inflow);
    renderOutflowTab(outflow);

    setDrawerLoading(false);
    if (!inflow.length && !outflow.length) {
        document.getElementById('cf-drilldown-empty')?.classList.remove('d-none');
        document.getElementById('cf-drilldown-tabs-wrap')?.classList.add('d-none');
    } else {
        document.getElementById('cf-drilldown-empty')?.classList.add('d-none');
        const showOut = !inflow.length && outflow.length;
        bootstrap.Tab.getOrCreateInstance(
            document.getElementById(showOut ? 'cf-tab-outflow-btn' : 'cf-tab-inflow-btn')
        ).show();
    }
}

function renderSummary(inTotal, outTotal, net) {
    const host = document.getElementById('cf-drilldown-summary');
    if (!host) return;
    const netCls = net >= 0 ? 'cf-in' : 'cf-out';
    const netSign = net >= 0 ? '+' : '−';
    host.innerHTML = [
        '<div class="d-flex flex-wrap gap-2 align-items-center mb-2">',
        `<span class="cf-drill-chip cf-drill-chip-in">Giriş ${fmtMoney(inTotal)}</span>`,
        `<span class="cf-drill-chip cf-drill-chip-out">Çıkış ${fmtMoney(outTotal)}</span>`,
        '</div>',
        `<div class="cf-drill-net ${netCls}">Net: ${netSign}${fmtMoney(Math.abs(net))}</div>`
    ].join('');
}

function renderTabs(inCount, outCount) {
    const inLabel = document.getElementById('cf-tab-inflow-label');
    const outLabel = document.getElementById('cf-tab-outflow-label');
    if (inLabel) inLabel.textContent = `Gelen (${inCount})`;
    if (outLabel) outLabel.textContent = `Giden (${outCount})`;
}

function renderInflowTab(rows) {
    const host = document.getElementById('cf-tab-inflow');
    if (!host) return;
    if (!rows.length) {
        host.innerHTML = emptyStateHtml('Bu ay için gelen ödeme yok.');
        return;
    }
    const groups = groupBy(rows, (r) => r.customer_name || '—');
    const total = rows.reduce((s, r) => s + num(r.installment_amount_eur), 0);
    let html = `<div class="cf-drill-groups">`;
    Object.keys(groups).sort((a, b) => a.localeCompare(b, 'tr')).forEach((name, gi) => {
        const items = groups[name];
        const sub = items.reduce((s, r) => s + num(r.installment_amount_eur), 0);
        const cid = `cf-in-g-${gi}`;
        html += `<div class="cf-drill-group">
            <button class="cf-drill-group-header" type="button" data-bs-toggle="collapse" data-bs-target="#${cid}" aria-expanded="true">
                <span>${esc(name)}</span><span class="cf-drill-group-sub">${fmtMoney(sub)}</span>
            </button>
            <div id="${cid}" class="collapse show"><div class="table-responsive">
            <table class="table table-sm cf-drill-table mb-0"><thead><tr>
                <th>Teklif</th><th>Başlık</th><th>İş Emri</th><th>Durum</th><th>İlerleme</th>
                <th>Taksit</th><th>Vade</th><th class="text-end">Tutar</th><th class="text-end">EUR</th><th>Sipariş</th>
            </tr></thead><tbody>${items.map(inflowRowHtml).join('')}</tbody></table>
            </div></div></div>`;
    });
    html += `</div><div class="cf-drill-table-footer"><span>Toplam</span><span class="fw-bold">${fmtMoney(total)}</span></div>`;
    host.innerHTML = html;
}

function renderOutflowTab(rows) {
    const host = document.getElementById('cf-tab-outflow');
    if (!host) return;
    if (!rows.length) {
        host.innerHTML = emptyStateHtml('Bu ay için giden ödeme yok.');
        return;
    }
    const sorted = [...rows].sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')));
    const groups = groupBy(sorted, (r) => r.supplier_name || '—');
    const paidTotal = rows.filter((r) => r.is_paid).reduce((s, r) => s + num(r.amount_eur), 0);
    const awaitTotal = rows.filter((r) => !r.is_paid).reduce((s, r) => s + num(r.amount_eur), 0);
    let html = `<div class="cf-drill-groups">`;
    Object.keys(groups).sort((a, b) => a.localeCompare(b, 'tr')).forEach((name, gi) => {
        const items = groups[name];
        const sub = items.reduce((s, r) => s + num(r.amount_eur), 0);
        const cid = `cf-out-g-${gi}`;
        html += `<div class="cf-drill-group">
            <button class="cf-drill-group-header" type="button" data-bs-toggle="collapse" data-bs-target="#${cid}" aria-expanded="true">
                <span>${esc(name)}</span><span class="cf-drill-group-sub">${fmtMoney(sub)}</span>
            </button>
            <div id="${cid}" class="collapse show"><div class="table-responsive">
            <table class="table table-sm cf-drill-table mb-0"><thead><tr>
                <th>PO</th><th>PR</th><th>Başlık</th><th>Taksit</th><th>Vade</th>
                <th class="text-end">Tutar</th><th class="text-end">EUR</th><th>KDV</th><th>Durum</th><th>İhtiyaç</th>
            </tr></thead><tbody>${items.map(outflowRowHtml).join('')}</tbody></table>
            </div></div></div>`;
    });
    html += `</div><div class="cf-drill-table-footer cf-drill-table-footer-split">
        <span>Ödenen <strong class="cf-in">${fmtMoney(paidTotal)}</strong></span>
        <span>Bekleyen <strong class="cf-await">${fmtMoney(awaitTotal)}</strong></span>
    </div>`;
    host.innerHTML = html;
}

function inflowRowHtml(r) {
    const overdue = isInflowOverdue(r);
    const rowCls = overdue ? 'cf-drill-row-overdue' : '';
    const job = r.job_no
        ? `<a href="/projects/project-tracking/?job_no=${encodeURIComponent(r.job_no)}" target="_blank" rel="noopener">${esc(r.job_no)}</a>`
        : '<span class="text-muted">—</span>';
    const offerLink = r.offer_no
        ? `<a href="/sales/offers?offer_no=${encodeURIComponent(r.offer_no)}" target="_blank" rel="noopener">${esc(r.offer_no)}</a>`
        : '—';
    const pct = num(r.job_completion_percentage);
    const cur = (r.original_currency || EUR).toUpperCase();
    const showEurLine = cur !== EUR;
    return `<tr class="${rowCls}">
        <td>${offerLink}</td>
        <td class="cf-col-title" title="${esc(r.offer_title)}">${esc(r.offer_title)}</td>
        <td>${job}</td>
        <td>${jobStatusBadge(r.job_status)}</td>
        <td>${progressBarHtml(pct)}</td>
        <td class="cf-col-installment">${esc(r.installment_label || '')} · ${fmtPctPlain(r.installment_percentage)}</td>
        <td class="${overdue ? 'text-danger fw-semibold' : ''}">${esc(r.installment_due_date || '—')}</td>
        <td class="text-end">${fmtAmountCur(r.installment_amount_original, cur)}${showEurLine ? `<div class="cf-eur-sub">${fmtMoney(r.installment_amount_eur)}</div>` : ''}</td>
        <td class="text-end fw-bold">${showEurLine ? fmtMoney(r.installment_amount_eur) : '—'}</td>
        <td class="small text-muted">${esc(r.order_no || '')}</td>
    </tr>`;
}

function outflowRowHtml(r) {
    const overdue = isOutflowOverdue(r);
    const rowCls = overdue ? 'cf-drill-row-overdue' : '';
    const cur = (r.currency || EUR).toUpperCase();
    const showEurLine = cur !== EUR;
    const poLabel = r.po_id != null ? `PO-${r.po_id}` : '—';
    const poLink = r.po_id != null
        ? `<a href="/finance/purchase-orders/?order=${r.po_id}" target="_blank" rel="noopener">${poLabel}</a>`
        : '—';
    const taxBadge = r.paid_with_tax
        ? `<span class="badge bg-light text-dark border" title="KDV %${esc(r.po_tax_rate ?? '0')}">KDV dahil</span>`
        : '<span class="text-muted">—</span>';
    const status = r.is_paid
        ? `<span class="badge bg-success">Ödendi</span>${r.paid_at ? `<div class="small text-muted d-block">${esc(r.paid_at)}</div>` : ''}`
        : '<span class="badge bg-warning text-dark">Bekliyor</span>';
    const title = String(r.pr_title || '');
    const titleShort = title.length > 40 ? `${esc(title.slice(0, 40))}…` : esc(title);
    return `<tr class="${rowCls}">
        <td>${poLink}</td>
        <td class="small text-muted">${esc(r.pr_number || '—')}</td>
        <td class="cf-col-title" title="${esc(title)}">${titleShort}</td>
        <td class="cf-col-installment">${esc(r.label || '')} · ${fmtPctPlain(r.percentage)}</td>
        <td class="${overdue ? 'text-danger fw-semibold' : ''}">${esc(r.due_date || '—')}</td>
        <td class="text-end">${fmtAmountCur(r.amount, cur)}${showEurLine ? `<div class="cf-eur-sub">${fmtMoney(r.amount_eur)}</div>` : ''}</td>
        <td class="text-end fw-bold">${showEurLine ? fmtMoney(r.amount_eur) : '—'}</td>
        <td>${taxBadge}</td>
        <td>${status}</td>
        <td class="small text-muted">${esc(r.pr_needed_date || '—')}</td>
    </tr>`;
}

function isInflowOverdue(r) {
    if (!r.installment_due_date) return false;
    if (r.job_status === 'completed') return false;
    return new Date(r.installment_due_date) < startOfToday();
}

function isOutflowOverdue(r) {
    if (r.is_paid) return false;
    if (!r.due_date) return false;
    return new Date(r.due_date) < startOfToday();
}

function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

function dateClass(iso, inflow) {
    const overdue = inflow
        ? (iso && new Date(iso) < startOfToday())
        : (iso && new Date(iso) < startOfToday());
    return overdue ? 'text-danger fw-semibold' : '';
}

function jobStatusBadge(status) {
    const map = {
        active: ['status-blue', 'Aktif'],
        completed: ['status-green', 'Tamamlandı'],
        on_hold: ['status-yellow', 'Beklemede'],
        draft: ['status-grey', 'Taslak'],
        cancelled: ['status-red', 'İptal']
    };
    const [cls, label] = map[status] || ['status-grey', status || '—'];
    return `<span class="status-badge ${cls}">${label}</span>`;
}

function progressBarHtml(pct) {
    const n = Math.min(100, Math.max(0, num(pct)));
    return `<div class="progress cf-drill-progress"><div class="progress-bar" style="width:${n}%"></div></div>` + `<small class="text-muted">${n.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}%</small>`;
}

function emptyStateHtml(msg) {
    return `<div class="cf-empty py-4"><i class="fas fa-inbox d-block mb-2"></i><p class="mb-0">${esc(msg)}</p></div>`;
}

function groupBy(arr, keyFn) {
    return arr.reduce((acc, item) => {
        const k = keyFn(item);
        if (!acc[k]) acc[k] = [];
        acc[k].push(item);
        return acc;
    }, {});
}

function num(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
}

function fmtMoney(v) {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: EUR, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num(v));
}

function fmtAmountCur(v, currency) {
    const c = (currency || EUR).toUpperCase();
    const n = num(v);
    try {
        return `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`;
    } catch {
        return `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${c}`;
    }
}

function fmtPctPlain(v) {
    return `${num(v).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}%`;
}

function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

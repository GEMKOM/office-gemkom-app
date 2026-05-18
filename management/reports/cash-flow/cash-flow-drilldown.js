import { getInflowDetail } from '../../../apis/sales/reports.js';
import { getOutflowDetail } from '../../../apis/procurement/reports.js';
import { showNotification } from '../../../components/notification/notification.js';

const EUR = 'EUR';
const JOB_TRACKING_BASE = '/projects/project-tracking/?job_no=';

const TAX_TYPE_LABELS = {
    vat: 'KDV',
    corporate_tax: 'Kurumlar Vergisi',
    sgk: 'SGK',
    income_tax_withholding: 'Gelir Vergisi Stopajı',
    other: 'Diğer'
};

const EXPENSE_CATEGORY_LABELS = {
    catering: 'Yemekhane / Catering',
    security: 'Güvenlik',
    transport: 'Ulaşım',
    rent: 'Kira',
    utilities: 'Kamu hizmetleri',
    insurance: 'Sigorta',
    other: 'Diğer'
};

const EXPENSE_RECURRENCE_LABELS = {
    once: 'Tek seferlik',
    monthly: 'Aylık',
    quarterly: 'Üç aylık',
    annual: 'Yıllık'
};

const ADHOC_CATEGORY_LABELS = {
    material: 'Malzeme',
    transport: 'Taşıma',
    labor: 'İşçilik',
    subcontract: 'Taşeron',
    other: 'Diğer'
};

const OUTFLOW_SECTIONS = [
    { key: 'procurement', totalKey: 'procurement_eur', title: 'Tedarik / Satın Alma' },
    { key: 'wages', totalKey: 'wages_eur', title: 'Maaşlar' },
    { key: 'expenses', totalKey: 'expenses_eur', title: 'Genel Giderler' },
    { key: 'loans', totalKey: 'loans_eur', title: 'Krediler' },
    { key: 'taxes', totalKey: 'taxes_eur', title: 'Vergiler' },
    { key: 'adhoc_costs', totalKey: 'adhoc_eur', title: 'Proje Giderleri' }
];

/** Percent widths — same on every group table so columns align and fill the drawer. */
const INFLOW_TABLE_COLGROUP = `<colgroup>
    <col style="width:7%">
    <col style="width:22%">
    <col style="width:7%">
    <col style="width:9%">
    <col style="width:10%">
    <col style="width:14%">
    <col style="width:8%">
    <col style="width:9%">
    <col style="width:8%">
    <col style="width:6%">
</colgroup>`;

const INFLOW_TABLE_HEAD = `<thead><tr>
    <th>Teklif</th>
    <th>Başlık</th>
    <th>İş Emri</th>
    <th>Durum</th>
    <th>İlerleme</th>
    <th>Taksit</th>
    <th>Vade</th>
    <th class="text-end">Tutar</th>
    <th class="text-end">EUR</th>
    <th>Sipariş</th>
</tr></thead>`;

const OUTFLOW_PROCUREMENT_COLGROUP = `<colgroup>
    <col style="width:42%"><col style="width:18%"><col style="width:13%">
    <col style="width:15%"><col style="width:12%">
</colgroup>`;
const OUTFLOW_PROCUREMENT_HEAD = `<thead><tr>
    <th>Başlık</th><th>Ödeme</th><th>Vade</th><th class="text-end">EUR</th><th>Durum</th>
</tr></thead>`;

const OUTFLOW_EXPENSES_COLGROUP = `<colgroup>
    <col style="width:18%"><col style="width:52%"><col style="width:15%"><col style="width:15%">
</colgroup>`;
const OUTFLOW_EXPENSES_HEAD = `<thead><tr>
    <th>Kategori</th><th>Açıklama</th><th>Periyot</th><th class="text-end">EUR</th>
</tr></thead>`;

const OUTFLOW_LOANS_COLGROUP = `<colgroup>
    <col style="width:42%"><col style="width:10%"><col style="width:13%">
    <col style="width:15%"><col style="width:12%">
</colgroup>`;
const OUTFLOW_LOANS_HEAD = `<thead><tr>
    <th>Kredi</th><th>Taksit</th><th>Vade</th><th class="text-end">EUR</th><th>Durum</th>
</tr></thead>`;

const OUTFLOW_TAXES_COLGROUP = `<colgroup>
    <col style="width:18%"><col style="width:38%"><col style="width:13%">
    <col style="width:15%"><col style="width:12%">
</colgroup>`;
const OUTFLOW_TAXES_HEAD = `<thead><tr>
    <th>Tür</th><th>Dönem</th><th>Vade</th><th class="text-end">EUR</th><th>Durum</th>
</tr></thead>`;

const OUTFLOW_ADHOC_COLGROUP = `<colgroup>
    <col style="width:10%"><col style="width:40%"><col style="width:15%">
    <col style="width:13%"><col style="width:15%">
</colgroup>`;
const OUTFLOW_ADHOC_HEAD = `<thead><tr>
    <th>İş Emri</th><th>Açıklama</th><th>Kategori</th><th>Tarih</th><th class="text-end">EUR</th>
</tr></thead>`;

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
    let outflow = null;
    const warnings = [];

    if (inRes.status === 'fulfilled') inflow = Array.isArray(inRes.value) ? inRes.value : [];
    else warnings.push('Giriş detayı yüklenemedi.');

    if (outRes.status === 'fulfilled' && outRes.value && typeof outRes.value === 'object' && !Array.isArray(outRes.value)) {
        outflow = outRes.value;
    } else if (outRes.status === 'rejected') {
        warnings.push('Çıkış detayı yüklenemedi.');
    }

    if (warnings.length === 2) {
        showDrawerError('Detay verisi yüklenemedi.');
        showNotification(warnings.join(' '), 'error');
        return;
    }
    if (warnings.length) showNotification(warnings.join(' '), 'warning');

    const inTotal = inflow.reduce((s, r) => s + num(r.installment_amount_eur), 0);
    const outTotal = num(outflow?.totals?.grand_total_eur);
    const hasOutflow = hasOutflowContent(outflow);
    renderSummary(inTotal, outTotal, inTotal - outTotal);
    renderTabs(inflow.length, outflowItemCount(outflow));
    renderInflowTab(inflow);
    renderOutflowTab(outflow);

    setDrawerLoading(false);
    if (!inflow.length && !hasOutflow) {
        document.getElementById('cf-drilldown-empty')?.classList.remove('d-none');
        document.getElementById('cf-drilldown-tabs-wrap')?.classList.add('d-none');
    } else {
        document.getElementById('cf-drilldown-empty')?.classList.add('d-none');
        const showOut = !inflow.length && hasOutflow;
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
            <table class="table table-sm cf-drill-table cf-drill-table-inflow mb-0">
            ${INFLOW_TABLE_COLGROUP}
            ${INFLOW_TABLE_HEAD}
            <tbody>${items.map(inflowRowHtml).join('')}</tbody></table>
            </div></div></div>`;
    });
    html += `</div><div class="cf-drill-table-footer"><span>Toplam</span><span class="fw-bold">${fmtMoney(total)}</span></div>`;
    host.innerHTML = html;
}

function hasOutflowContent(data) {
    if (!data) return false;
    if (num(data.totals?.grand_total_eur) > 0) return true;
    return outflowItemCount(data) > 0;
}

function outflowItemCount(data) {
    if (!data) return 0;
    let n = (data.procurement || []).length;
    if (num(data.wages?.total_eur) > 0) n += 1;
    n += (data.expenses || []).length;
    n += (data.loans || []).length;
    n += (data.taxes || []).length;
    n += (data.adhoc_costs || []).length;
    return n;
}

function sectionTotal(data, totalKey) {
    return num(data?.totals?.[totalKey]);
}

function sectionHasContent(data, sectionKey) {
    if (!data) return false;
    if (sectionKey === 'wages') return num(data.wages?.total_eur) > 0;
    const arr = data[sectionKey];
    return Array.isArray(arr) && arr.length > 0;
}

function renderOutflowTab(data) {
    const host = document.getElementById('cf-tab-outflow');
    if (!host) return;
    if (!hasOutflowContent(data)) {
        host.innerHTML = emptyStateHtml('Bu ay için giden ödeme yok.');
        return;
    }

    const { paidTotal, awaitTotal } = sumOutflowPaidAwaiting(data);
    let html = '<div class="cf-drill-groups">';
    let groupIndex = 0;

    OUTFLOW_SECTIONS.forEach((section) => {
        if (!sectionHasContent(data, section.key)) return;
        const sectionAmt = sectionTotal(data, section.totalKey);
        const cid = `cf-out-sec-${groupIndex}`;
        groupIndex += 1;
        const body = renderOutflowSectionBody(data, section.key);
        html += `<div class="cf-drill-group">
            <button class="cf-drill-group-header" type="button" data-bs-toggle="collapse" data-bs-target="#${cid}" aria-expanded="true">
                <span>${esc(section.title)}</span><span class="cf-drill-group-sub">${fmtMoney(sectionAmt)}</span>
            </button>
            <div id="${cid}" class="collapse show">${body}</div>
        </div>`;
    });

    html += '</div>';
    if (paidTotal > 0 || awaitTotal > 0) {
        html += `<div class="cf-drill-table-footer cf-drill-table-footer-split">
            <span>Ödenen <strong class="cf-in">${fmtMoney(paidTotal)}</strong></span>
            <span>Bekleyen <strong class="cf-await">${fmtMoney(awaitTotal)}</strong></span>
        </div>`;
    }
    host.innerHTML = html;
}

function renderOutflowSectionBody(data, sectionKey) {
    switch (sectionKey) {
        case 'procurement':
            return renderProcurementSection(data.procurement || []);
        case 'wages':
            return renderWagesSection(data.wages);
        case 'expenses':
            return renderExpensesSection(data.expenses || []);
        case 'loans':
            return renderLoansSection(data.loans || []);
        case 'taxes':
            return renderTaxesSection(data.taxes || []);
        case 'adhoc_costs':
            return renderAdhocSection(data.adhoc_costs || []);
        default:
            return '';
    }
}

function renderProcurementSection(rows) {
    const sorted = [...rows].sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')));
    const groups = groupBy(sorted, (r) => r.supplier_name || r.supplier_code || '—');
    let html = '';
    Object.keys(groups).sort((a, b) => a.localeCompare(b, 'tr')).forEach((name) => {
        const items = groups[name];
        const code = items[0]?.supplier_code;
        const header = code ? `${esc(name)} <span class="text-muted fw-normal small">(${esc(code)})</span>` : esc(name);
        html += `<div class="cf-drill-subgroup">
            <div class="cf-drill-subgroup-title">${header}</div>
            <div class="table-responsive">
            <table class="table table-sm cf-drill-table cf-drill-table-outflow cf-drill-table-outflow-procurement mb-0">
            ${OUTFLOW_PROCUREMENT_COLGROUP}
            ${OUTFLOW_PROCUREMENT_HEAD}
            <tbody>${items.map(procurementRowHtml).join('')}</tbody></table>
            </div></div>`;
    });
    return html;
}

function renderWagesSection(wages) {
    if (!wages || num(wages.total_eur) <= 0) return '';
    const count = wages.employee_count;
    const countLabel = count != null
        ? `${Number(count).toLocaleString('tr-TR')} çalışan`
        : '';
    return `<div class="cf-wages-summary p-3">
        <div class="row g-3">
            <div class="col-sm-6 col-lg-4">
                <div class="cf-wages-line-label">Bordro</div>
                <div class="cf-wages-line-value">${fmtMoney(wages.base_payroll_eur)}</div>
            </div>
            <div class="col-sm-6 col-lg-4">
                <div class="cf-wages-line-label">Mesai primi</div>
                <div class="cf-wages-line-value">${fmtMoney(wages.overtime_premium_eur)}</div>
            </div>
            <div class="col-sm-12 col-lg-4">
                <div class="cf-wages-line-label">Toplam</div>
                <div class="cf-wages-line-value cf-wages-total">${fmtMoney(wages.total_eur)}</div>
            </div>
        </div>
        ${countLabel ? `<p class="cf-wages-subtitle mb-0 mt-2">${esc(countLabel)}</p>` : ''}
    </div>`;
}

function renderExpensesSection(rows) {
    const sorted = [...rows].sort((a, b) => String(a.description || '').localeCompare(String(b.description || ''), 'tr'));
    return `<div class="table-responsive">
        <table class="table table-sm cf-drill-table cf-drill-table-outflow cf-drill-table-outflow-expenses mb-0">
        ${OUTFLOW_EXPENSES_COLGROUP}
        ${OUTFLOW_EXPENSES_HEAD}
        <tbody>${sorted.map(expenseRowHtml).join('')}</tbody></table>
    </div>`;
}

function renderLoansSection(rows) {
    const sorted = [...rows].sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')));
    return `<div class="table-responsive">
        <table class="table table-sm cf-drill-table cf-drill-table-outflow cf-drill-table-outflow-loans mb-0">
        ${OUTFLOW_LOANS_COLGROUP}
        ${OUTFLOW_LOANS_HEAD}
        <tbody>${sorted.map(loanRowHtml).join('')}</tbody></table>
    </div>`;
}

function renderTaxesSection(rows) {
    const sorted = [...rows].sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')));
    return `<div class="table-responsive">
        <table class="table table-sm cf-drill-table cf-drill-table-outflow cf-drill-table-outflow-taxes mb-0">
        ${OUTFLOW_TAXES_COLGROUP}
        ${OUTFLOW_TAXES_HEAD}
        <tbody>${sorted.map(taxRowHtml).join('')}</tbody></table>
    </div>`;
}

function renderAdhocSection(rows) {
    const sorted = [...rows].sort((a, b) => String(a.cost_date || '').localeCompare(String(b.cost_date || '')));
    return `<div class="table-responsive">
        <table class="table table-sm cf-drill-table cf-drill-table-outflow cf-drill-table-outflow-adhoc mb-0">
        ${OUTFLOW_ADHOC_COLGROUP}
        ${OUTFLOW_ADHOC_HEAD}
        <tbody>${sorted.map(adhocRowHtml).join('')}</tbody></table>
    </div>`;
}

function sumOutflowPaidAwaiting(data) {
    const trackable = [
        ...(data?.procurement || []),
        ...(data?.loans || []),
        ...(data?.taxes || [])
    ];
    return trackable.reduce(
        (acc, r) => {
            const amt = num(r.amount_eur);
            if (r.is_paid) acc.paidTotal += amt;
            else acc.awaitTotal += amt;
            return acc;
        },
        { paidTotal: 0, awaitTotal: 0 }
    );
}

function inflowRowHtml(r) {
    const overdue = isInflowOverdue(r);
    const rowCls = overdue ? 'cf-drill-row-overdue' : '';
    const job = r.job_no
        ? `<a href="${JOB_TRACKING_BASE}${encodeURIComponent(r.job_no)}" target="_blank" rel="noopener">${esc(r.job_no)}</a>`
        : '<span class="text-muted">—</span>';
    const offerLink = r.offer_no
        ? `<a href="/sales/offers?offer_no=${encodeURIComponent(r.offer_no)}" target="_blank" rel="noopener">${esc(r.offer_no)}</a>`
        : '—';
    const pct = num(r.job_completion_percentage);
    const cur = (r.original_currency || EUR).toUpperCase();
    const showEurLine = cur !== EUR;
    return `<tr class="${rowCls}">
        <td class="cf-col-truncate">${offerLink}</td>
        <td class="cf-col-title cf-col-truncate" title="${esc(r.offer_title)}">${esc(r.offer_title)}</td>
        <td class="cf-col-truncate">${job}</td>
        <td class="cf-col-nowrap">${jobStatusBadge(r.job_status)}</td>
        <td class="cf-col-progress">${progressBarHtml(pct)}</td>
        <td class="cf-col-installment cf-col-truncate">${esc(r.installment_label || '')} · ${fmtPctPlain(r.installment_percentage)}</td>
        <td class="cf-col-nowrap ${overdue ? 'text-danger fw-semibold' : ''}">${esc(r.installment_due_date || '—')}</td>
        <td class="text-end cf-col-nowrap">${fmtAmountCur(r.installment_amount_original, cur)}${showEurLine ? `<div class="cf-eur-sub">${fmtMoney(r.installment_amount_eur)}</div>` : ''}</td>
        <td class="text-end fw-bold cf-col-nowrap">${showEurLine ? fmtMoney(r.installment_amount_eur) : '—'}</td>
        <td class="small text-muted cf-col-truncate">${esc(r.order_no || '')}</td>
    </tr>`;
}

function procurementRowHtml(r) {
    const overdue = isOutflowOverdue(r);
    const rowCls = paidRowClass(r, overdue);
    const title = String(r.pr_title || '');
    return `<tr class="${rowCls}">
        <td class="cf-col-title cf-col-truncate" title="${esc(title)}">${esc(title || '—')}</td>
        <td class="cf-col-installment cf-col-truncate">${esc(r.label || '—')}</td>
        <td class="cf-col-nowrap ${overdue ? 'text-danger fw-semibold' : ''}">${esc(r.due_date || '—')}</td>
        <td class="text-end fw-bold cf-col-nowrap">${fmtMoney(r.amount_eur)}</td>
        <td class="cf-col-nowrap">${paymentStatusBadge(r.is_paid)}</td>
    </tr>`;
}

function expenseRowHtml(r) {
    return `<tr>
        <td class="cf-col-nowrap">${expenseCategoryBadge(r.category)}</td>
        <td class="cf-col-title cf-col-truncate" title="${esc(r.description)}">${esc(r.description || '—')}</td>
        <td class="cf-col-nowrap">${recurrenceBadge(r.recurrence)}</td>
        <td class="text-end fw-bold cf-col-nowrap">${fmtMoney(r.amount_eur)}</td>
    </tr>`;
}

function loanRowHtml(r) {
    const overdue = isOutflowOverdue(r);
    const rowCls = paidRowClass(r, overdue);
    const seq = r.sequence != null ? `#${r.sequence}` : '—';
    return `<tr class="${rowCls}">
        <td class="cf-col-title cf-col-truncate" title="${esc(r.loan_name)}">${esc(r.loan_name || '—')}</td>
        <td class="cf-col-nowrap">${esc(seq)}</td>
        <td class="cf-col-nowrap ${overdue ? 'text-danger fw-semibold' : ''}">${esc(r.due_date || '—')}</td>
        <td class="text-end fw-bold cf-col-nowrap">${fmtMoney(r.amount_eur)}</td>
        <td class="cf-col-nowrap">${paymentStatusBadge(r.is_paid)}</td>
    </tr>`;
}

function taxRowHtml(r) {
    const overdue = isOutflowOverdue(r);
    const rowCls = paidRowClass(r, overdue);
    return `<tr class="${rowCls}">
        <td class="cf-col-nowrap">${taxTypeBadge(r.tax_type)}</td>
        <td class="cf-col-title cf-col-truncate" title="${esc(r.period_label)}">${esc(r.period_label || '—')}</td>
        <td class="cf-col-nowrap ${overdue ? 'text-danger fw-semibold' : ''}">${esc(r.due_date || '—')}</td>
        <td class="text-end fw-bold cf-col-nowrap">${fmtMoney(r.amount_eur)}</td>
        <td class="cf-col-nowrap">${paymentStatusBadge(r.is_paid)}</td>
    </tr>`;
}

function adhocRowHtml(r) {
    const job = r.job_no
        ? `<a href="${JOB_TRACKING_BASE}${encodeURIComponent(r.job_no)}" target="_blank" rel="noopener">${esc(r.job_no)}</a>`
        : '<span class="text-muted">—</span>';
    return `<tr>
        <td class="cf-col-truncate">${job}</td>
        <td class="cf-col-title cf-col-truncate" title="${esc(r.description)}">${esc(r.description || '—')}</td>
        <td class="cf-col-nowrap">${adhocCategoryBadge(r.category)}</td>
        <td class="cf-col-nowrap">${esc(r.cost_date || '—')}</td>
        <td class="text-end fw-bold cf-col-nowrap">${fmtMoney(r.amount_eur)}</td>
    </tr>`;
}

function paidRowClass(r, overdue) {
    const parts = [];
    if (r.is_paid) parts.push('cf-drill-row-paid');
    if (overdue) parts.push('cf-drill-row-overdue');
    return parts.join(' ');
}

function paymentStatusBadge(isPaid) {
    return isPaid
        ? '<span class="badge bg-success">Ödendi</span>'
        : '<span class="badge bg-warning text-dark">Bekliyor</span>';
}

function taxTypeBadge(taxType) {
    const label = TAX_TYPE_LABELS[taxType] || taxType || '—';
    return `<span class="badge bg-light text-dark border">${esc(label)}</span>`;
}

function expenseCategoryBadge(category) {
    const label = EXPENSE_CATEGORY_LABELS[category] || category || '—';
    return `<span class="badge bg-secondary-subtle text-secondary-emphasis border">${esc(label)}</span>`;
}

function recurrenceBadge(recurrence) {
    const label = EXPENSE_RECURRENCE_LABELS[recurrence] || recurrence || '—';
    return `<span class="badge bg-light text-muted border" title="Bu ay görünme nedeni">${esc(label)}</span>`;
}

function adhocCategoryBadge(category) {
    const label = ADHOC_CATEGORY_LABELS[category] || category || '—';
    return `<span class="badge bg-light text-dark border">${esc(label)}</span>`;
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

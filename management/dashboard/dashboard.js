import { guardRoute } from '../../authService.js';
import { initNavbar } from '../../components/navbar.js';
import { initRouteProtection } from '../../apis/routeProtection.js';
import { HeaderComponent } from '../../components/header/header.js';
import { getReportsOverview } from '../../apis/reports/overview.js';

let state = {
    preset: 'current_month',
    date_from: null,
    date_to: null,
    lastRequest: { preset: 'current_month', date_from: null, date_to: null }
};

function formatInt(n) {
    const v = Number(n || 0);
    return new Intl.NumberFormat('tr-TR').format(isNaN(v) ? 0 : v);
}

function formatPct(pctString) {
    const v = Number.parseFloat(pctString || '0');
    if (Number.isNaN(v)) return '0.0%';
    return `${v.toFixed(1)}%`;
}

function formatHours(hoursString) {
    const v = Number.parseFloat(hoursString || '0');
    if (Number.isNaN(v)) return '0.0 saat';
    return `${v.toFixed(1)} saat`;
}

function formatMoneyEUR(amountString) {
    const v = Number.parseFloat(amountString || '0');
    if (Number.isNaN(v)) return '€0';

    const abs = Math.abs(v);
    if (abs >= 1_000_000) return `€${(v / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `€${(v / 1_000).toFixed(1)}K`;
    return `€${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(v)}`;
}

function setActivePresetButton(preset) {
    document.querySelectorAll('.preset-btn').forEach(btn => {
        const isActive = btn.getAttribute('data-preset') === preset;
        btn.classList.toggle('btn-primary', isActive);
        btn.classList.toggle('btn-outline-secondary', !isActive);
    });
}

function showLoading(isLoading) {
    document.getElementById('overview-loading').style.display = isLoading ? 'block' : 'none';
    document.getElementById('overview-content').style.opacity = isLoading ? '0.4' : '1';
}

function showError(message) {
    const el = document.getElementById('overview-error');
    if (!message) {
        el.style.display = 'none';
        el.innerHTML = '';
        return;
    }
    el.style.display = 'block';
    el.innerHTML = `
        <div class="alert alert-danger d-flex align-items-start gap-2" role="alert">
            <i class="fas fa-exclamation-triangle mt-1"></i>
            <div>
                <div class="fw-bold">Dashboard yüklenemedi</div>
                <div class="small">${message}</div>
            </div>
        </div>
    `;
}

function setRangeLabel(meta) {
    const label = document.getElementById('range-label');
    const preset = meta?.preset ?? null;
    const from = meta?.date_from ?? '-';
    const to = meta?.date_to ?? '-';
    const presetText = preset ? `Ön ayar: ${preset}` : 'Özel aralık';
    label.textContent = `${presetText} • ${from} → ${to}`;
}

function panelHtml({ title, icon, scopeLabel, kvPairs, subtitle = null, listItems = null }) {
    const kv = (kvPairs || [])
        .map(({ k, v }) => `<div class="k">${k}</div><div class="v">${v}</div>`)
        .join('');

    const list = Array.isArray(listItems) && listItems.length
        ? `<ul class="overview-list">${listItems.map(li => `<li>${li}</li>`).join('')}</ul>`
        : '';

    const sub = subtitle ? `<div class="overview-subtitle">${subtitle}</div>` : '';

    return `
        <div class="overview-panel">
            <div class="overview-panel__header">
                <h3 class="overview-panel__title">
                    <i class="${icon} text-primary"></i>
                    ${title}
                </h3>
                ${scopeLabel ? `<span class="badge-scope">${scopeLabel}</span>` : ''}
            </div>
            <div class="overview-panel__body">
                <div class="kv-grid">${kv}</div>
                ${sub}
                ${list}
            </div>
        </div>
    `;
}

function renderPanels(data) {
    const job = data.job_orders;
    const sales = data.sales;
    const costs = data.costs;
    const mfg = data.manufacturing;
    const qual = data.quality;
    const subc = data.subcontracting;
    const proc = data.procurement;
    const rev = data.design_revisions;
    const ot = data.overtime;

    document.getElementById('panel-job-orders').innerHTML = panelHtml({
        title: 'İş Emirleri',
        icon: 'fas fa-clipboard-list',
        scopeLabel: 'Anlık + Aralık',
        kvPairs: [
            { k: 'Aktif (anlık)', v: formatInt(job.total_active) },
            { k: 'Tamamlanan (aralık)', v: formatInt(job.total_completed_in_range) },
            { k: 'Başlayan (aralık)', v: formatInt(job.total_started_in_range) },
            { k: 'Geciken (anlık)', v: formatInt(job.overdue) },
            { k: 'Ort. tamamlama (aktif)', v: formatPct(job.avg_completion_pct) }
        ],
        subtitle: 'Durum dağılımı (anlık):',
        listItems: Object.entries(job.by_status || {}).map(([k, v]) => `${k}: <strong>${formatInt(v)}</strong>`)
    });

    const pipelineTotal = Object.values(sales.pipeline_by_stage || {}).reduce((a, b) => a + (Number(b) || 0), 0);
    document.getElementById('panel-sales').innerHTML = panelHtml({
        title: 'Satış',
        icon: 'fas fa-handshake',
        scopeLabel: 'Anlık + Aralık',
        kvPairs: [
            { k: 'Oluşturulan teklifler (aralık)', v: formatInt(sales.offers_created_in_range) },
            { k: 'Kazanılan (aralık)', v: formatInt(sales.offers_won_in_range) },
            { k: 'Kaybedilen (aralık)', v: formatInt(sales.offers_lost_in_range) },
            { k: 'Pipeline (anlık)', v: formatInt(pipelineTotal) },
            { k: 'Kazanılan toplam değer (EUR)', v: formatMoneyEUR(sales.total_won_value_eur) }
        ],
        subtitle: 'Pipeline aşamaları (anlık):',
        listItems: Object.entries(sales.pipeline_by_stage || {}).map(([k, v]) => `${k}: <strong>${formatInt(v)}</strong>`)
    });

    document.getElementById('panel-costs').innerHTML = panelHtml({
        title: 'Maliyet & Karlılık',
        icon: 'fas fa-euro-sign',
        scopeLabel: 'Portföy toplamı',
        kvPairs: [
            { k: 'Maliyet verisi olan iş', v: formatInt(costs.jobs_with_cost_data) },
            { k: 'Satış fiyatı olan iş', v: formatInt(costs.jobs_with_selling_price) },
            { k: 'Toplam satış bedeli (EUR)', v: formatMoneyEUR(costs.total_selling_price_eur) },
            { k: 'Gerçekleşen maliyet (EUR)', v: formatMoneyEUR(costs.total_actual_cost_eur) },
            { k: 'Taşeron maliyeti (EUR)', v: formatMoneyEUR(costs.total_subcontractor_cost_eur) },
            { k: 'Ort. marj', v: formatPct(costs.avg_margin_pct) }
        ]
    });

    document.getElementById('panel-manufacturing').innerHTML = panelHtml({
        title: 'İmalat',
        icon: 'fas fa-industry',
        scopeLabel: 'Anlık + Aralık',
        kvPairs: [
            { k: 'Tamamlanan görev (aralık)', v: formatInt(mfg.tasks_completed_in_range) },
            { k: 'Devam eden (anlık)', v: formatInt(mfg.tasks_in_progress) },
            { k: 'Bloke (anlık)', v: formatInt(mfg.tasks_blocked) },
            { k: 'Kaynak tamamlanan', v: formatInt(mfg.welding_tasks_completed) },
            { k: 'CNC tamamlanan', v: formatInt(mfg.cnc_tasks_completed) }
        ],
        subtitle: 'Dağılım (aralık):',
        listItems: [
            `Talaşlı imalat: <strong>${formatInt(mfg.machining_tasks_completed)}</strong>`,
            `Taşeron: <strong>${formatInt(mfg.subcontracting_tasks_completed)}</strong>`
        ]
    });

    document.getElementById('panel-quality').innerHTML = panelHtml({
        title: 'Kalite',
        icon: 'fas fa-clipboard-check',
        scopeLabel: 'Anlık + Aralık',
        kvPairs: [
            { k: 'Açılan Uygunsuzluk (aralık)', v: formatInt(qual.ncrs_opened_in_range) },
            { k: 'Kapanan Uygunsuzluk (aralık)', v: formatInt(qual.ncrs_closed_in_range) },
            { k: 'Açık Uygunsuzluk (anlık)', v: formatInt(qual.ncrs_open_total) },
            { k: 'KK incelemesi (aralık)', v: formatInt(qual.qc_reviews_in_range) },
            { k: 'KK onay / ret', v: `${formatInt(qual.qc_reviews_approved)} / ${formatInt(qual.qc_reviews_rejected)}` }
        ],
        subtitle: 'Açık uygunsuzluk şiddeti (anlık):',
        listItems: Object.entries(qual.ncrs_by_severity || {}).map(([k, v]) => `${k}: <strong>${formatInt(v)}</strong>`)
    });

    const topSubs = Array.isArray(subc.by_subcontractor) ? subc.by_subcontractor : [];
    document.getElementById('panel-subcontracting').innerHTML = panelHtml({
        title: 'Taşeron',
        icon: 'fas fa-handshake-angle',
        scopeLabel: 'Anlık + Aralık',
        kvPairs: [
            { k: 'Onaylanan hakediş (aralık)', v: formatInt(subc.statements_approved_in_range) },
            { k: 'Ödenen hakediş (aralık)', v: formatInt(subc.statements_paid_in_range) },
            { k: 'Toplam onay (yerel para)', v: String(subc.total_approved_value || '0.00') },
            { k: 'Toplam ödeme (yerel para)', v: String(subc.total_paid_value || '0.00') },
            { k: 'Faturasız tahakkuk (EUR, anlık)', v: formatMoneyEUR(subc.total_unbilled_accrual_eur) }
        ],
        subtitle: topSubs.length ? 'En yüksek taşeronlar (aralık):' : 'En yüksek taşeronlar (aralık): veri yok',
        listItems: topSubs.slice(0, 10).map(x => `${x.name}: <strong>${x.approved_total}</strong> ${x.currency}`)
    });

    document.getElementById('panel-procurement').innerHTML = panelHtml({
        title: 'Satın Alma',
        icon: 'fas fa-shopping-cart',
        scopeLabel: 'Anlık + Aralık',
        kvPairs: [
            { k: 'Gönderilen talepler (aralık)', v: formatInt(proc.requests_submitted_in_range) },
            { k: 'Oluşturulan sipariş (aralık)', v: formatInt(proc.orders_created_in_range) },
            { k: 'Toplam sipariş (EUR)', v: formatMoneyEUR(proc.total_ordered_value_eur) },
            { k: 'Vadesi gelen ödeme (aralık)', v: formatInt(proc.payments_due_in_range) },
            { k: 'Geciken ödeme (anlık)', v: formatInt(proc.payments_overdue) }
        ],
        subtitle: 'Ödenmemiş planlı ödemeler (aralık):',
        listItems: [`Toplam vade (EUR): <strong>${formatMoneyEUR(proc.total_payments_due_eur)}</strong>`]
    });

    document.getElementById('panel-design-revisions').innerHTML = panelHtml({
        title: 'Tasarım Revizyonları',
        icon: 'fas fa-drafting-compass',
        scopeLabel: 'Anlık + Aralık',
        kvPairs: [
            { k: 'Talep edilen (aralık)', v: formatInt(rev.revisions_requested_in_range) },
            { k: 'Onaylanan (aralık)', v: formatInt(rev.revisions_approved_in_range) },
            { k: 'Tamamlanan (aralık)', v: formatInt(rev.revisions_completed_in_range) },
            { k: 'Reddedilen (aralık)', v: formatInt(rev.revisions_rejected_in_range) },
            { k: 'Bekleyen (anlık)', v: formatInt(rev.revisions_pending) }
        ],
        subtitle: 'Revizyon nedeniyle bekleyen işler (anlık):',
        listItems: [`Beklemede: <strong>${formatInt(rev.jobs_currently_on_hold_for_revision)}</strong>`]
    });

    const byTeam = Array.isArray(ot.by_team) ? ot.by_team : [];
    document.getElementById('panel-overtime').innerHTML = panelHtml({
        title: 'Mesai',
        icon: 'fas fa-clock',
        scopeLabel: 'Aralık',
        kvPairs: [
            { k: 'Gönderilen talep (aralık)', v: formatInt(ot.requests_submitted_in_range) },
            { k: 'Onaylanan talep (aralık)', v: formatInt(ot.requests_approved_in_range) },
            { k: 'Toplam onaylı saat', v: formatHours(ot.total_approved_hours) }
        ],
        subtitle: byTeam.length ? 'Takıma göre (onaylı, aralık):' : 'Takıma göre (onaylı, aralık): veri yok',
        listItems: byTeam.map(x => `${x.team}: <strong>${formatHours(x.hours)}</strong>`)
    });
}

async function loadOverview(params) {
    showError(null);
    showLoading(true);
    try {
        const data = await getReportsOverview(params);
        state.lastRequest = { ...params };
        setRangeLabel(data.meta);
        renderPanels(data);
    } catch (e) {
        showError(e?.message || 'Bilinmeyen hata');
    } finally {
        showLoading(false);
    }
}

function getCustomRangeFromInputs() {
    const from = document.getElementById('date-from').value || null;
    const to = document.getElementById('date-to').value || null;
    return { date_from: from, date_to: to };
}

function clearCustomRangeInputs() {
    document.getElementById('date-from').value = '';
    document.getElementById('date-to').value = '';
}

function initHeader() {
    new HeaderComponent({
        title: 'Yönetim Dashboard',
        subtitle: 'Genel performans göstergeleri ve hızlı görünüm',
        icon: 'tachometer-alt',
        showBackButton: 'block',
        showRefreshButton: 'none',
        onBackClick: () => {
            window.location.href = '/management/';
        }
    });
}

function initEvents() {
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const preset = btn.getAttribute('data-preset');
            if (!preset) return;
            state.preset = preset;
            state.date_from = null;
            state.date_to = null;
            clearCustomRangeInputs();
            setActivePresetButton(preset);
            await loadOverview({ preset });
        });
    });

    document.getElementById('apply-custom-range').addEventListener('click', async () => {
        const { date_from, date_to } = getCustomRangeFromInputs();
        state.preset = null;
        state.date_from = date_from;
        state.date_to = date_to;
        setActivePresetButton('__custom__');
        await loadOverview({ preset: null, date_from, date_to });
    });

    document.getElementById('refresh-overview').addEventListener('click', async () => {
        await loadOverview(state.lastRequest);
    });
}

async function initPage() {
    if (!guardRoute()) return;
    if (!initRouteProtection()) return;

    await initNavbar();
    initHeader();
    initEvents();

    setActivePresetButton(state.preset);
    await loadOverview({ preset: state.preset });
}

document.addEventListener('DOMContentLoaded', initPage);


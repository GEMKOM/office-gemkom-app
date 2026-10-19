/**
 * /projects/references/ — Referanslar: the estimator's reference library.
 *
 * Every job order with a weld list (reference profile): its weld content,
 * recorded welding hours, the bottom-up hours under the CURRENT unit times
 * and the factor (recorded ÷ bottom-up). The estimating engineer:
 *  - checks a job's weld list (row click / list button),
 *  - marks it Doğrulandı, or Hariç (with a note: out of every estimate),
 *  - reads the factor distribution per family (summary cards),
 *  - edits the unit times and cost parameters (Birim süreler panel),
 *  - reads how it all works (Nasıl çalışır?, the same text as the Tahmin tab).
 *
 * Page permission: `access_projects_references` (users/0067), granted with
 * `view_estimates`; the API refuses everyone else with 403 anyway.
 */
import { guardRoute } from '../../authService.js';
import { initNavbar } from '../../components/navbar.js';
import { HeaderComponent } from '../../components/header/header.js';
import { FiltersComponent } from '../../components/filters/filters.js';
import { TableComponent } from '../../components/table/table.js';
import { DisplayModal } from '../../components/display-modal/display-modal.js';
import { initRouteProtection } from '../../apis/routeProtection.js';
import { showNotification } from '../../components/notification/notification.js';
import { escapeHtml } from '../../utils/text.js';
import {
    REFERENCE_FAMILY, REFERENCE_RELIABILITY, REFERENCE_REVIEW, REFERENCE_ROUTE,
    getEstimatorParameters, getReferenceSummary, getWeldSchedule, listReferenceProfiles,
    reviewReferenceProfile, updateEstimatorParameters,
} from '../../apis/estimator.js';
import { MATERIAL_LABELS, fmt, weldColumns } from '../../components/estimate-report/estimate-report.js';
import { openEstimatorMethod } from '../../components/estimator-method/estimator-method.js';

const JOB_STATUS = {
    draft: 'Taslak', active: 'Aktif', on_hold: 'Beklemede', completed: 'Tamamlandı', cancelled: 'İptal',
};
const EXCLUSION_LABELS = {
    'excluded by review': 'İnceleme ile hariç',
    'no recorded hours': 'Kayıtlı saat yok',
    'built by a subcontractor': 'Taşeronda yapılmış',
};
const UNIT_LABELS = { 'h/piece': 'h/parça', 'h/bend': 'h/büküm', 'h/pressure joint': 'h/basınçlı birleşim', 'h/kg': 'h/kg' };
const NON_WELDING_LABELS = {
    cutting: 'Kesim', bending: 'Büküm', bevel_and_pt: 'Ağız açma + PT', fitup_hydrotest_cleaning: 'Çatma, hidrotest, temizlik',
};

let table = null;
let filters = null;
let modal = null;
let modalTables = [];
let rows = [];
let familiesLoaded = false;
let units = null;           // GET /estimator/parameters/ payload
let unitsBusy = false;
let methodStale = false;    // a unit time changed: the method text shows the old table until refetched

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    if (!initRouteProtection()) return;
    await initNavbar();

    new HeaderComponent({
        title: 'Referanslar',
        subtitle: 'Tahminde kullanılan bitmiş işler: kaynak listesi, kayıtlı saat, faktör ve inceleme',
        icon: 'book-open',
        showBackButton: 'block',
        showRefreshButton: 'block',
        refreshButtonText: 'Yenile',
        onBackClick: () => { window.location.href = '/projects'; },
        onRefreshClick: () => loadAll(),
    });

    document.getElementById('ref-method-btn').addEventListener('click', () => {
        openEstimatorMethod({ fresh: methodStale });
        methodStale = false;
    });
    document.getElementById('ref-units-btn').addEventListener('click', toggleUnitsPanel);
    const panel = document.getElementById('ref-units-panel');
    panel.addEventListener('click', onUnitsClick);
    panel.addEventListener('input', onUnitsInput);

    initFilters();
    initTable();
    initModal();
    await loadAll();
});

// ---------------------------------------------------------------- filters + table

function initFilters() {
    filters = new FiltersComponent('filters-placeholder', {
        title: 'Filtreler',
        onApply: () => loadRows(),
        onClear: () => loadRows(),
    });
    filters.addTextFilter({ id: 'search-filter', label: 'Arama', placeholder: 'İş emri, başlık, müşteri…', colSize: 2 });
    filters.addDropdownFilter({
        id: 'family-filter', label: 'Aile', multiple: true, placeholder: 'Tümü', colSize: 2,
        options: Object.entries(REFERENCE_FAMILY).map(([value, label]) => ({ value, label })),
    });
    filters.addDropdownFilter({
        id: 'route-filter', label: 'Güzergâh', multiple: true, placeholder: 'Tümü', colSize: 2,
        options: Object.entries(REFERENCE_ROUTE).map(([value, r]) => ({ value, label: r.label })),
    });
    filters.addDropdownFilter({
        id: 'reliability-filter', label: 'Saat kaydı', multiple: true, placeholder: 'Tümü', colSize: 2,
        options: Object.entries(REFERENCE_RELIABILITY).map(([value, r]) => ({ value, label: value === 'unreliable' ? 'Güvenilmez (≤ 10 h)' : r.label })),
    });
    filters.addDropdownFilter({
        id: 'review-filter', label: 'İnceleme', multiple: true, placeholder: 'Tümü', colSize: 2,
        options: Object.entries(REFERENCE_REVIEW).map(([value, r]) => ({ value, label: r.label })),
    });
    filters.addDropdownFilter({
        id: 'status-filter', label: 'İş durumu', multiple: true, placeholder: 'Tümü', colSize: 2,
        options: Object.entries(JOB_STATUS).map(([value, label]) => ({ value, label })),
    });
}

function badge(map, value) {
    const b = map[value] || { label: value || '—', badge: 'status-grey' };
    return `<span class="status-badge ${b.badge}">${escapeHtml(b.label)}</span>`;
}

const num = (digits) => (v) => (v == null ? '—' : fmt(v, digits));

function initTable() {
    table = new TableComponent('references-table-container', {
        columns: [
            { field: 'job_no', label: 'İş', sortable: true, width: '95px',
              formatter: (v, row) => `<strong>${escapeHtml(v)}</strong><span class="ref-job-status">${escapeHtml(JOB_STATUS[row.job_status] || row.job_status || '')}</span>` },
            { field: 'title', label: 'Başlık', sortable: true,
              formatter: (v) => `<span class="ref-title" title="${escapeHtml(v || '')}">${escapeHtml(v || '')}</span>` },
            { field: 'customer', label: 'Müşteri', sortable: true, formatter: (v) => escapeHtml(v || '') },
            { field: 'family', label: 'Aile', sortable: true, formatter: (v) => escapeHtml(REFERENCE_FAMILY[v] || v || '') },
            { field: 'route', label: 'Güzergâh', sortable: true, formatter: (v) => badge(REFERENCE_ROUTE, v) },
            { field: 'quantity', label: 'Adet', sortable: true, type: 'number', cellClass: 'ref-num', headerClass: 'ref-num', exportType: 'number' },
            { field: 'unit_mass_kg', label: 'Birim kg', sortable: true, type: 'number', cellClass: 'ref-num', headerClass: 'ref-num',
              exportType: 'number', formatter: num(0) },
            { field: 'weld_m_total', label: 'Kaynak m', sortable: true, type: 'number', cellClass: 'ref-num', headerClass: 'ref-num',
              exportType: 'number', formatter: num(1) },
            { field: 'joints_total', label: 'Birleşim', sortable: true, type: 'number', cellClass: 'ref-num', headerClass: 'ref-num', exportType: 'number' },
            { field: 'recorded_welding_h_per_unit', label: 'Kayıtlı h/adet', sortable: true, type: 'number', cellClass: 'ref-num', headerClass: 'ref-num',
              exportType: 'number', formatter: num(1) },
            { field: 'bottom_up_h_per_unit', label: 'Hesap h/adet', sortable: true, type: 'number', cellClass: 'ref-num', headerClass: 'ref-num',
              exportType: 'number', formatter: num(1) },
            { field: 'factor', label: 'Faktör', sortable: true, type: 'number', cellClass: 'ref-num', headerClass: 'ref-num', exportType: 'number',
              formatter: (v, row) => {
                  const text = v == null ? '—' : fmt(v, 2);
                  if (!row.in_house_exclusion) return `<span class="ref-factor">${text}</span>`;
                  const why = exclusionLabel(row.in_house_exclusion);
                  return `<span class="ref-out" title="İç imalat kalibrasyonunda kullanılmaz: ${escapeHtml(why)}">${text}<i class="fas fa-ban ref-out-icon"></i></span>`;
              } },
            { field: 'hours_reliability', label: 'Saat kaydı', sortable: true, formatter: (v) => badge(REFERENCE_RELIABILITY, v) },
            { field: 'review_status', label: 'İnceleme', sortable: true, formatter: (v, row) => {
                const b = REFERENCE_REVIEW[v] || REFERENCE_REVIEW.unreviewed;
                const tip = [row.review_note, row.reviewed_by_name && `${row.reviewed_by_name} · ${formatDateTime(row.reviewed_at)}`].filter(Boolean).join('\n');
                return `<span class="status-badge ${b.badge}" title="${escapeHtml(tip)}">${b.label}</span>`;
            } },
        ],
        actions: [
            { key: 'weld', label: 'Kaynak listesi', icon: 'fas fa-list-ol', class: 'btn-outline-primary', onClick: (row) => openWeldList(row) },
            { key: 'verify', label: 'Doğrula', icon: 'fas fa-check', class: 'btn-outline-success',
              visible: (row) => row.review_status !== 'verified', onClick: (row) => openReview(row, 'verified') },
            { key: 'exclude', label: 'Hariç tut', icon: 'fas fa-ban', class: 'btn-outline-danger',
              visible: (row) => row.review_status !== 'excluded', onClick: (row) => openReview(row, 'excluded') },
            { key: 'reset', label: 'İncelemeyi geri al', icon: 'fas fa-rotate-left', class: 'btn-outline-secondary',
              visible: (row) => row.review_status !== 'unreviewed', onClick: (row) => openReview(row, 'unreviewed') },
        ],
        data: [],
        sortable: true,
        pagination: false,   // a few dozen to a few hundred profiles; one sortable list
        exportable: true,
        exportFilename: 'tahmin-referanslari',
        emptyMessage: 'Filtreye uyan referans yok',
        onRowClick: (row) => openWeldList(row),
    });
}

function exclusionLabel(reason) {
    if (!reason) return '';
    if (EXCLUSION_LABELS[reason]) return EXCLUSION_LABELS[reason];
    if (reason.startsWith('unreliable')) return 'Güvenilmez saat kaydı (≤ 10 h)';
    return reason;
}

function joinValue(v) {
    return Array.isArray(v) ? v.join(',') : (v || '');
}

async function loadAll() {
    await Promise.all([loadRows(), loadSummary(), units ? loadUnits() : Promise.resolve()]);
}

async function loadRows() {
    const f = filters.getFilterValues();
    table.setLoading(true);
    try {
        const data = await listReferenceProfiles({
            search: (f['search-filter'] || '').trim(),
            family: joinValue(f['family-filter']),
            route: joinValue(f['route-filter']),
            reliability: joinValue(f['reliability-filter']),
            review_status: joinValue(f['review-filter']),
            status: joinValue(f['status-filter']),
        });
        rows = data.results || [];
        table.updateData(rows, rows.length);
        if (!familiesLoaded && Array.isArray(data.families)) {
            // Only the families that have profiles, in the label order.
            const known = Object.keys(REFERENCE_FAMILY).filter((k) => data.families.includes(k));
            const extra = data.families.filter((k) => !REFERENCE_FAMILY[k]);
            filters.updateFilterOptions('family-filter', [...known, ...extra].map((value) => ({ value, label: REFERENCE_FAMILY[value] || value })));
            familiesLoaded = true;
        }
    } catch (error) {
        console.error('Referanslar yüklenemedi:', error);
        showNotification(error.message || 'Referanslar yüklenemedi', 'error');
        table.updateData([], 0);
    } finally {
        table.setLoading(false);
    }
}

// ---------------------------------------------------------------- summary cards

async function loadSummary() {
    const host = document.getElementById('ref-summary');
    try {
        renderSummary(await getReferenceSummary());
    } catch (error) {
        host.innerHTML = `<div class="ref-summary-empty text-danger">${escapeHtml(error.message || 'Özet yüklenemedi')}</div>`;
    }
}

function distCard(title, dist, extraClass = '') {
    if (!dist || !dist.n) return '';
    const range = dist.n > 1
        ? `medyan ${fmt(dist.median, 2)} · çeyrekler ${fmt(dist.p25, 2)}–${fmt(dist.p75, 2)}<br>en düşük ${fmt(dist.min, 2)} · en yüksek ${fmt(dist.max, 2)}`
        : 'tek iş: aralık yok';
    return `<div class="ref-card ${extraClass}">
        <div class="ref-card-title"><span>${escapeHtml(title)}</span><span>n = ${dist.n}</span></div>
        <div class="ref-card-value">${fmt(dist.mean, 2)} <small>ortalama faktör</small></div>
        <div class="ref-card-sub">${range}</div>
    </div>`;
}

function renderSummary(s) {
    const host = document.getElementById('ref-summary');
    const c = s.counts || {};
    const rs = c.review_status || {};
    const counts = `<div class="ref-card ref-card-counts">
        <div class="ref-card-title"><span>Profiller</span><span>${c.total ?? 0}</span></div>
        <div class="ref-count-line"><span>Kalibrasyonda kullanılan</span><strong>${(s.jobs_used || []).length}</strong></div>
        <div class="ref-count-line"><span>Doğrulandı</span><strong>${rs.verified || 0}</strong></div>
        <div class="ref-count-line"><span>İncelenmedi</span><strong>${rs.unreviewed || 0}</strong></div>
        <div class="ref-count-line"><span>Hariç</span><strong>${rs.excluded || 0}</strong></div>
    </div>`;
    const families = Object.entries(s.families || {})
        .sort((a, b) => (b[1].n || 0) - (a[1].n || 0))
        .map(([fam, dist]) => distCard(REFERENCE_FAMILY[fam] || fam, dist))
        .join('');
    const all = distCard('Tüm aileler', s.all, 'ref-card-all');
    const empty = !all
        ? '<div class="ref-summary-empty">Faktör dağılımı için iç imalat, güvenilir saatli (> 10 h) ve hariç tutulmamış bir referans gerekiyor.</div>'
        : '';
    host.innerHTML = counts + all + families + empty;
    host.title = s.population || '';
}

// ---------------------------------------------------------------- modal (weld list / review)

function initModal() {
    modal = new DisplayModal('reference-modal-container', {
        title: 'Referans',
        icon: 'fas fa-book-open',
        size: 'xl',
        showEditButton: false,
        backdropStatic: false,
    });
    document.getElementById('reference-modal-container').addEventListener('click', onModalClick);
}

function resetModal(title, icon) {
    modalTables.forEach((t) => { try { t.destroy?.(); } catch { /* gone */ } });
    modalTables = [];
    modal.clearData();
    modal.setTitle(title);
    modal.setIcon(icon);
    modal.setFooterContent('<button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal"><i class="fas fa-times me-1"></i>Kapat</button>');
}

function factsHtml(row) {
    const fact = (label, value) => `<div><span>${label}</span> <strong>${value}</strong></div>`;
    const mats = Object.entries(row.weld_m_by_material || {}).map(([m, v]) => `${MATERIAL_LABELS[m] || m} ${fmt(v, 1)} m`).join(', ');
    return `<div class="ref-modal-facts">
        ${fact('Aile', escapeHtml(REFERENCE_FAMILY[row.family] || row.family || '—'))}
        ${fact('Güzergâh', escapeHtml(REFERENCE_ROUTE[row.route]?.label || row.route || '—'))}
        ${fact('Adet', fmt(row.quantity, 0))}
        ${fact('Birim kütle', `${fmt(row.unit_mass_kg, 0)} kg`)}
        ${fact('Kaynak', `${fmt(row.weld_m_total, 1)} m${mats ? ` (${escapeHtml(mats)})` : ''}`)}
        ${fact('Birleşim', fmt(row.joints_total, 0))}
        ${fact('Kayıtlı', `${fmt(row.recorded_welding_h_per_unit, 1)} h/adet (toplam ${fmt(row.recorded_welding_h_total, 0)} h)`)}
        ${fact('Hesap', `${fmt(row.bottom_up_h_per_unit, 1)} h/adet`)}
        ${fact('Faktör', row.factor == null ? '—' : fmt(row.factor, 2))}
        ${row.in_house_exclusion ? fact('Kalibrasyon', escapeHtml(exclusionLabel(row.in_house_exclusion))) : ''}
    </div>`;
}

async function openWeldList(row) {
    resetModal(`${row.job_no} — ${row.title || ''}`, 'fas fa-list-ol');
    modal.addCustomSection({ customContent: `${factsHtml(row)}<div id="ref-weld-body" class="ref-weld-wrap"><div class="text-muted small"><i class="fas fa-spinner fa-spin me-1"></i>Kaynak listesi yükleniyor…</div></div>` });
    modal.render();
    modal.show();
    let ws;
    try {
        ws = await getWeldSchedule({ jobNo: row.job_no });
    } catch (error) {
        const body = document.getElementById('ref-weld-body');
        if (body) body.innerHTML = `<div class="text-danger small">${escapeHtml(error.message || 'Kaynak listesi yüklenemedi')}</div>`;
        return;
    }
    const body = document.getElementById('ref-weld-body');
    if (!body) return;
    const bu = ws.bottom_up || {};
    const lines = bu.lines || [];
    const joints = (ws.joints || []).map((j, i) => ({ ...j, unit_h: lines[i]?.unit_h, unit_label: lines[i]?.unit, hours: lines[i]?.hours }));
    const nonWelding = (bu.non_welding_lines || []).map((l) => `<tr><td>${escapeHtml(NON_WELDING_LABELS[l.step] || l.step)}</td><td class="text-end">${fmt(l.qty, l.step === 'fitup_hydrotest_cleaning' ? 1 : 0)}</td><td>${escapeHtml(UNIT_LABELS[l.unit] || l.unit)}</td><td class="text-end">${fmt(l.unit_h, 4)}</td><td class="text-end">${fmt(l.hours, 2)}</td></tr>`).join('');
    body.innerHTML = `
        <div class="small mb-2">
            Kaynak listesi v${ws.version}${ws.versions?.length > 1 ? ` (sürümler: ${ws.versions.join(', ')})` : ''} ·
            güven ${fmt((ws.confidence || 0) * 100, 0)}% · ${ws.pieces_to_cut_per_unit ?? ws.pieces_per_unit ?? 0} parça · ${ws.bends_per_unit ?? 0} büküm ·
            birim kütle ${fmt(ws.unit_mass_kg, 0)} kg${ws.mass_basis ? ` [${escapeHtml(ws.mass_basis)}]` : ''}
        </div>
        <div id="ref-weld-table"></div>
        <h6 class="mt-3 mb-1" style="font-size:.82rem;font-weight:700">Kaynak dışı (1 adet)</h6>
        <table class="table table-sm ref-bu-table"><thead><tr><th>Adım</th><th class="text-end">Miktar</th><th>Birim</th><th class="text-end">Birim süre</th><th class="text-end">Saat</th></tr></thead>
            <tbody>${nonWelding}</tbody>
            <tfoot><tr><th colspan="4">Kaynak ${fmt(bu.welding_h, 1)} h + kaynak dışı ${fmt(bu.non_welding_h, 1)} h = bottom-up</th><th class="text-end">${fmt(bu.total_h, 1)} h</th></tr></tfoot>
        </table>
        ${(ws.open_questions || []).length ? `<div class="small text-muted"><strong>Çizimin söylemediği:</strong> ${ws.open_questions.map(escapeHtml).join(' · ')}</div>` : ''}
        ${(ws.design_features || []).length ? `<div class="small text-muted mt-1"><strong>Tasarım özellikleri:</strong> ${ws.design_features.map(escapeHtml).join(' · ')}</div>` : ''}`;
    modalTables.push(new TableComponent('ref-weld-table', {
        columns: [
            ...weldColumns(),
            { field: 'unit_h', label: 'Birim süre', type: 'number', sortable: true, headerClass: 'est-num', cellClass: 'est-num',
              formatter: (v, r) => (v == null ? '—' : `${fmt(v, 3)} ${escapeHtml(String(r.unit_label || '').replace('joint', 'birleşim'))}`) },
            { field: 'hours', label: 'Saat', type: 'number', sortable: true, headerClass: 'est-num', cellClass: 'est-num', formatter: num(2) },
        ],
        data: joints,
        sortable: true,
        pagination: false,
        showHeader: false,
        small: true,
        skeleton: false,
        emptyMessage: 'Birleşim yok',
    }));
}

const REVIEW_TEXT = {
    verified: {
        title: 'Doğrula', icon: 'fas fa-check', button: 'btn-success', label: 'Doğrula',
        hint: 'Kaynak listesi ve kayıtlı saatler kontrol edildi. Hesabı değiştirmez; doğrulanmış ve incelenmemiş referanslar aynı şekilde kullanılır.',
        placeholder: 'İsteğe bağlı not (ör. kaynak listesi pafta 3 ile karşılaştırıldı)',
    },
    excluded: {
        title: 'Hariç tut', icon: 'fas fa-ban', button: 'btn-danger', label: 'Hariç tut',
        hint: 'Bu iş hiçbir tahminde (iç imalat ve taşeron), aile faktör dağılımında ve hold-out kontrolünde kullanılmaz. Geri alınabilir.',
        placeholder: 'Neden? (zorunlu — ör. saatler üst iş emrine yazılmış, kaynak listesi eksik okunmuş)',
    },
    unreviewed: {
        title: 'İncelemeyi geri al', icon: 'fas fa-rotate-left', button: 'btn-secondary', label: 'Geri al',
        hint: 'Referans yeniden “İncelenmedi” olur ve (hariç tutulmuşsa) tahminlerde tekrar kullanılır.',
        placeholder: 'İsteğe bağlı not',
    },
};

function openReview(row, reviewStatus) {
    const t = REVIEW_TEXT[reviewStatus];
    resetModal(`${t.title}: ${row.job_no} — ${row.title || ''}`, t.icon);
    const current = REFERENCE_REVIEW[row.review_status] || REFERENCE_REVIEW.unreviewed;
    modal.addCustomSection({ customContent: `
        ${factsHtml(row)}
        <div class="ref-review-hint">${t.hint}</div>
        <div class="small mb-2">Şu anki durum: <span class="status-badge ${current.badge}">${current.label}</span>
            ${row.review_note ? ` — ${escapeHtml(row.review_note)}` : ''}${row.reviewed_by_name ? ` <span class="text-muted">(${escapeHtml(row.reviewed_by_name)})</span>` : ''}</div>
        <textarea class="form-control form-control-sm" id="ref-review-note" rows="3" placeholder="${escapeHtml(t.placeholder)}"></textarea>
        <div class="text-danger small mt-1" id="ref-review-error"></div>` });
    modal.render();
    modal.setFooterContent(`
        <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">Vazgeç</button>
        <button type="button" class="btn btn-sm ${t.button}" data-ref-action="review-save" data-job-no="${escapeHtml(row.job_no)}" data-status="${reviewStatus}">
            <i class="${t.icon} me-1"></i>${t.label}
        </button>`);
    modal.show();
    setTimeout(() => document.getElementById('ref-review-note')?.focus(), 300);
}

async function onModalClick(event) {
    const btn = event.target.closest('[data-ref-action="review-save"]');
    if (!btn) return;
    const reviewStatus = btn.dataset.status;
    const note = (document.getElementById('ref-review-note')?.value || '').trim();
    const errorEl = document.getElementById('ref-review-error');
    if (reviewStatus === 'excluded' && !note) {
        if (errorEl) errorEl.textContent = 'Hariç tutmak için not gerekli.';
        return;
    }
    btn.disabled = true;
    try {
        const updated = await reviewReferenceProfile(btn.dataset.jobNo, reviewStatus, note);
        const i = rows.findIndex((r) => r.job_no === updated.job_no);
        if (i >= 0) rows[i] = updated;
        table.updateData(rows, rows.length);
        modal.hide();
        showNotification(`${updated.job_no}: ${REFERENCE_REVIEW[updated.review_status]?.label || updated.review_status}`, 'success');
        loadSummary();
    } catch (error) {
        if (errorEl) errorEl.textContent = error.data?.note?.[0] || error.message || 'Kaydedilemedi';
        btn.disabled = false;
    }
}

// ---------------------------------------------------------------- Birim süreler panel

async function toggleUnitsPanel() {
    const panel = document.getElementById('ref-units-panel');
    if (!panel.hidden) { panel.hidden = true; return; }
    panel.hidden = false;
    if (!units) {
        panel.innerHTML = '<div class="text-muted small"><i class="fas fa-spinner fa-spin me-1"></i>Parametreler yükleniyor…</div>';
        await loadUnits();
    }
}

async function loadUnits() {
    const panel = document.getElementById('ref-units-panel');
    try {
        units = await getEstimatorParameters();
        renderUnits();
    } catch (error) {
        panel.innerHTML = `<div class="text-danger small">${escapeHtml(error.message || 'Parametreler yüklenemedi')}</div>`;
    }
}

function inputValue(v) {
    return v == null ? '' : String(v).replace('.', ',');
}

function parseInput(text) {
    const t = String(text ?? '').trim().replace(',', '.');
    if (t === '' || !/^-?\d*\.?\d+$/.test(t)) return NaN;
    return Number(t);
}

function renderUnits(errors = {}) {
    const panel = document.getElementById('ref-units-panel');
    const groups = units.groups || {};
    const byGroup = {};
    (units.parameters || []).forEach((p) => { (byGroup[p.group] = byGroup[p.group] || []).push(p); });
    const groupHtml = Object.keys(groups).filter((g) => byGroup[g]).map((g) => `
        <div class="ref-units-group">
            <h6>${escapeHtml(groups[g])}</h6>
            <table class="ref-units-table"><tbody>
                ${byGroup[g].map((p) => `
                    <tr class="${p.is_default ? '' : 'is-custom'}" title="${escapeHtml([p.description, p.changed_by_name && `Son değişiklik: ${p.changed_by_name} · ${formatDateTime(p.changed_at)}`].filter(Boolean).join('\n'))}">
                        <td class="ref-units-label">${escapeHtml(p.label)}</td>
                        <td class="ref-units-unit">${escapeHtml(p.unit)}</td>
                        <td class="ref-units-default">varsayılan ${trimNum(p.default)}</td>
                        <td class="ref-units-input">
                            <input type="text" inputmode="decimal" class="form-control form-control-sm ${errors[p.key] ? 'is-invalid' : ''}"
                                   data-key="${p.key}" value="${escapeHtml(inputValue(p.value))}" aria-label="${escapeHtml(p.label)}">
                            ${errors[p.key] ? `<div class="invalid-feedback">${escapeHtml(errors[p.key])}</div>` : ''}
                        </td>
                        <td>${p.is_default ? '' : `<button type="button" class="btn btn-link btn-sm" data-units-action="default" data-key="${p.key}" title="Varsayılana dön">varsayılan</button>`}</td>
                    </tr>`).join('')}
            </tbody></table>
        </div>`).join('');
    const changes = units.changes || [];
    const log = changes.length ? `
        <details class="ref-units-log">
            <summary>Değişiklik geçmişi (${changes.length})</summary>
            <table><tbody>${changes.map((c) => `<tr><td>${formatDateTime(c.changed_at)}</td><td>${escapeHtml(c.changed_by_name || '')}</td>
                <td>${escapeHtml(c.label)}</td><td>${escapeHtml(inputValue(c.old_value) || 'varsayılan')} → <strong>${escapeHtml(inputValue(c.new_value))}</strong></td>
                <td class="text-muted">${escapeHtml(c.note || '')}</td></tr>`).join('')}</tbody></table>
        </details>` : '';
    panel.innerHTML = `
        <div class="ref-units-head">
            <h6><i class="fas fa-sliders me-1"></i>Birim süreler ve maliyet parametreleri</h6>
            <span class="small">Bir adedin bottom-up saati bu sürelerle hesaplanır; değişiklik bütün faktörleri ve yeni tahminleri hemen etkiler. Hepsi aynı oranda değişirse tahmin değişmez.</span>
        </div>
        <div class="ref-units-groups">${groupHtml}</div>
        <div class="ref-units-foot">
            <input type="text" class="form-control form-control-sm" name="note" placeholder="Değişiklik notu (isteğe bağlı)">
            <button type="button" class="btn btn-sm btn-primary" data-units-action="save" ${unitsBusy ? 'disabled' : ''}><i class="fas fa-save me-1"></i>Kaydet</button>
            <button type="button" class="btn btn-sm btn-outline-secondary" data-units-action="reset">Değişiklikleri geri al</button>
            <span class="small text-muted" data-units-dirty></span>
        </div>
        ${log}`;
    updateDirty();
}

function changedValues() {
    const out = {};
    const invalid = {};
    document.querySelectorAll('#ref-units-panel input[data-key]').forEach((input) => {
        const p = (units.parameters || []).find((x) => x.key === input.dataset.key);
        if (!p) return;
        const v = parseInput(input.value);
        if (Number.isNaN(v)) { invalid[p.key] = 'Sayı olmalı.'; return; }
        if (Math.abs(v - Number(p.value)) > 1e-9) out[p.key] = v;
    });
    return { out, invalid };
}

function updateDirty() {
    const { out, invalid } = changedValues();
    document.querySelectorAll('#ref-units-panel input[data-key]').forEach((input) => {
        input.classList.toggle('is-changed', input.dataset.key in out);
    });
    const el = document.querySelector('#ref-units-panel [data-units-dirty]');
    const n = Object.keys(out).length;
    const bad = Object.keys(invalid).length;
    if (el) el.textContent = bad ? `${bad} geçersiz değer` : (n ? `${n} değişiklik kaydedilmedi` : '');
}

function onUnitsInput(event) {
    if (event.target.matches('input[data-key]')) updateDirty();
}

async function onUnitsClick(event) {
    const btn = event.target.closest('[data-units-action]');
    if (!btn) return;
    const action = btn.dataset.unitsAction;
    if (action === 'default') {
        const p = units.parameters.find((x) => x.key === btn.dataset.key);
        const input = document.querySelector(`#ref-units-panel input[data-key="${btn.dataset.key}"]`);
        if (p && input) { input.value = inputValue(p.default); updateDirty(); }
    } else if (action === 'reset') {
        renderUnits();
    } else if (action === 'save') {
        const { out, invalid } = changedValues();
        if (Object.keys(invalid).length) { renderUnitsKeepingInputs(invalid); return; }
        if (!Object.keys(out).length) { showNotification('Değişiklik yok', 'info'); return; }
        const note = document.querySelector('#ref-units-panel input[name="note"]')?.value || '';
        unitsBusy = true;
        btn.disabled = true;
        try {
            const result = await updateEstimatorParameters(out, note);
            units = result;
            renderUnits();
            methodStale = true;
            showNotification(`${(result.changed || []).length} parametre kaydedildi; faktörler yeniden hesaplandı.`, 'success');
            await Promise.all([loadRows(), loadSummary()]);
        } catch (error) {
            if (error.data?.errors) renderUnitsKeepingInputs(error.data.errors);
            showNotification(error.message || 'Parametreler kaydedilemedi', 'error');
        } finally {
            unitsBusy = false;
            const save = document.querySelector('#ref-units-panel [data-units-action="save"]');
            if (save) save.disabled = false;
        }
    }
}

function renderUnitsKeepingInputs(errors) {
    const typed = {};
    document.querySelectorAll('#ref-units-panel input[data-key]').forEach((i) => { typed[i.dataset.key] = i.value; });
    const note = document.querySelector('#ref-units-panel input[name="note"]')?.value || '';
    renderUnits(errors);
    document.querySelectorAll('#ref-units-panel input[data-key]').forEach((i) => { if (i.dataset.key in typed) i.value = typed[i.dataset.key]; });
    const noteEl = document.querySelector('#ref-units-panel input[name="note"]');
    if (noteEl) noteEl.value = note;
    updateDirty();
}

// ---------------------------------------------------------------- helpers

function trimNum(value) {
    return value == null ? '—' : Number(value).toLocaleString('tr-TR', { maximumFractionDigits: 4 });
}

function formatDateTime(value) {
    if (!value) return '';
    return new Date(value).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

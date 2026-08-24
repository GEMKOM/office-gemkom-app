/**
 * Geri Bildirimler — the manager view of the feedback pipeline.
 *
 * Answers "what came in, what is the AI doing with it, what waits on me":
 * summary cards, a filterable report list, and a detail modal showing the AI
 * triage, GitHub issue/PR state, a status timeline, and the manager actions
 * (analyze / queue / dismiss / sync). Data comes from /feedback/reports/*,
 * gated by the manage_feedback permission.
 */
import { guardRoute } from '../../authService.js';
import { initNavbar } from '../../components/navbar.js';
import { HeaderComponent } from '../../components/header/header.js';
import { FiltersComponent } from '../../components/filters/filters.js';
import { StatisticsCards } from '../../components/statistics-cards/statistics-cards.js';
import { TableComponent } from '../../components/table/table.js';
import { DisplayModal } from '../../components/display-modal/display-modal.js';
import { showNotification } from '../../components/notification/notification.js';
import { renderRichText } from '../../utils/richText.js';
import { escapeHtml } from '../../utils/text.js';
import {
    analyzeFeedbackReport,
    dismissFeedbackReport,
    getFeedbackReport,
    getFeedbackStats,
    listAllFeedbackReports,
    queueFeedbackReport,
    syncFeedbackReport,
} from '../../apis/feedback.js';

const STATUS_META = {
    new: { label: 'Yeni', cls: 'status-grey' },
    analyzed: { label: 'İncelendi', cls: 'status-purple' },
    needs_info: { label: 'Bilgi Bekleniyor', cls: 'status-orange' },
    duplicate: { label: 'Yinelenen', cls: 'status-grey' },
    queued: { label: 'Kuyruğa Alındı', cls: 'status-blue' },
    in_review: { label: 'PR İncelemede', cls: 'status-orange' },
    done: { label: 'Tamamlandı', cls: 'status-green' },
    dismissed: { label: 'Reddedildi', cls: 'status-grey' },
    failed: { label: 'Başarısız', cls: 'status-red' },
};

const KIND_META = {
    bug: { label: 'Hata', icon: 'fa-bug' },
    feature: { label: 'Özellik', icon: 'fa-lightbulb' },
    improvement: { label: 'İyileştirme', icon: 'fa-arrow-trend-up' },
    other: { label: 'Diğer', icon: 'fa-comment-dots' },
};

const RECOMMENDATION_LABELS = {
    implement: 'Uygulanabilir',
    needs_human: 'İnsan kararı',
    needs_info: 'Bilgi gerekli',
    duplicate: 'Yinelenen',
    reject: 'Reddedilmeli',
};

const PRIORITY_LABELS = { low: 'Düşük', medium: 'Orta', high: 'Yüksek', critical: 'Kritik' };

const REPO_LABELS = {
    backend: 'Backend', frontend: 'Frontend', both: 'Backend + Frontend', unknown: 'Belirsiz',
};

const state = { status: '', kind: '', q: '' };

let statsCards = null;
let reportsTable = null;

function usd(value) {
    const n = Number.parseFloat(value);
    return `$${(Number.isFinite(n) ? n : 0).toLocaleString('tr-TR', {
        minimumFractionDigits: 2, maximumFractionDigits: 2,
    })}`;
}

function statusBadge(status) {
    const meta = STATUS_META[status] || { label: status, cls: 'status-grey' };
    return `<span class="status-badge ${meta.cls}">${escapeHtml(meta.label)}</span>`;
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    await initNavbar();

    new HeaderComponent({
        title: 'Geri Bildirimler',
        subtitle: 'Hata ve öneri bildirimleri — AI triyajı, geliştirme kuyruğu ve PR durumları',
        icon: 'bug',
        showBackButton: 'block',
        backUrl: '/it/',
        showCreateButton: 'none',
        showExportButton: 'none',
        showRefreshButton: 'block',
        refreshButtonText: 'Yenile',
        onRefreshClick: () => loadAll(),
    });

    setupFilters();
    setupComponents();
    await loadAll();
});

// ---------------------------------------------------------------- set up

function setupFilters() {
    const filters = new FiltersComponent('filters-placeholder', {
        title: 'Filtrele',
        applyButtonText: 'Uygula',
        clearButtonText: 'Temizle',
        onApply: (values) => {
            state.status = values['fb-status'] || '';
            state.kind = values['fb-kind'] || '';
            state.q = (values['fb-q'] || '').trim();
            loadReports();
        },
        onClear: () => {
            state.status = '';
            state.kind = '';
            state.q = '';
            loadReports();
        },
    });

    filters.addDropdownFilter({
        id: 'fb-status',
        label: 'Durum',
        options: Object.entries(STATUS_META).map(([value, meta]) => ({
            value, label: meta.label,
        })),
        placeholder: 'Tümü',
        colSize: 3,
    });

    filters.addDropdownFilter({
        id: 'fb-kind',
        label: 'Tür',
        options: Object.entries(KIND_META).map(([value, meta]) => ({
            value, label: meta.label,
        })),
        placeholder: 'Tümü',
        colSize: 2,
    });

    filters.addTextFilter({
        id: 'fb-q',
        label: 'Ara',
        placeholder: 'Başlık veya açıklamada ara...',
        colSize: 4,
    });
}

function setupComponents() {
    statsCards = new StatisticsCards('fb-stats', { cards: [], itemsPerRow: 5 });
    statsCards.showSkeletonLoading(5);

    reportsTable = new TableComponent('fb-reports-table', {
        columns: [
            { field: 'id', label: '#', sortable: false, width: '55px' },
            {
                field: 'created_at', label: 'Tarih', sortable: false, width: '135px',
                formatter: (v) => new Date(v).toLocaleString('tr-TR', {
                    day: '2-digit', month: '2-digit', year: '2-digit',
                    hour: '2-digit', minute: '2-digit',
                }),
            },
            {
                field: 'reporter_name', label: 'Bildiren', sortable: false, width: '150px',
                formatter: (v, row) => escapeHtml(v || row.reporter_username || '?'),
            },
            {
                field: 'kind', label: 'Tür', sortable: false, width: '110px',
                formatter: (v) => {
                    const meta = KIND_META[v] || KIND_META.other;
                    return `<i class="fas ${meta.icon} me-1 text-muted"></i>${escapeHtml(meta.label)}`;
                },
            },
            {
                field: 'title', label: 'Başlık', sortable: false,
                formatter: (v, row) => {
                    const text = v || '';
                    const short = text.length > 90 ? `${text.slice(0, 90)}…` : text;
                    const summary = row.ai_summary
                        ? `<div class="text-muted" style="font-size:0.78rem">${escapeHtml(
                            row.ai_summary.length > 110 ? `${row.ai_summary.slice(0, 110)}…` : row.ai_summary,
                        )}</div>`
                        : '';
                    return `<strong>${escapeHtml(short)}</strong>${summary}`;
                },
            },
            {
                field: 'priority', label: 'Öncelik', sortable: false, width: '85px',
                formatter: (v) => (v ? escapeHtml(PRIORITY_LABELS[v] || v) : '—'),
            },
            {
                field: 'status', label: 'Durum', sortable: false, width: '135px',
                formatter: (v) => statusBadge(v),
            },
            {
                field: 'github_issues', label: 'GitHub', sortable: false, width: '75px',
                formatter: (entries) => {
                    if (!entries || !entries.length) return '—';
                    const hasPr = entries.some((e) => e.pr_number);
                    const merged = entries.some((e) => e.pr_merged_at);
                    if (merged) return '<i class="fas fa-code-merge text-success" title="PR merge edildi"></i>';
                    if (hasPr) return '<i class="fas fa-code-pull-request text-primary" title="PR açık"></i>';
                    return '<i class="fas fa-circle-dot text-muted" title="Issue açık"></i>';
                },
            },
        ],
        data: [],
        small: true,
        emptyMessage: 'Bildirim yok',
        onRowClick: (row) => openReportModal(row.id),
    });
}

// ------------------------------------------------------------------ load

async function loadAll() {
    try {
        const stats = await getFeedbackStats();
        document.getElementById('fb-content').classList.remove('d-none');
        renderStats(stats);
        await loadReports();
    } catch (error) {
        if (error.status === 403) {
            document.getElementById('fb-denied').classList.remove('d-none');
            document.getElementById('fb-content').classList.add('d-none');
            return;
        }
        console.error('Error loading feedback stats:', error);
        showNotification(error.message || 'İstatistikler yüklenemedi.', 'error');
    }
}

function renderStats(stats) {
    statsCards.setCards([
        {
            title: 'Açık Bildirim',
            value: String(stats.open_total),
            icon: 'fas fa-inbox',
            color: 'primary',
        },
        {
            title: 'Kararın Bekleniyor',
            value: String(stats.awaiting_decision),
            icon: 'fas fa-user-check',
            color: 'danger',
        },
        {
            title: 'AI Hattında (Issue/PR)',
            value: String(stats.in_pipeline),
            icon: 'fas fa-robot',
            color: 'info',
        },
        {
            title: 'Tamamlanan (30 gün)',
            value: String(stats.done_30d),
            icon: 'fas fa-check-circle',
            color: 'success',
        },
        {
            title: 'AI Maliyeti (30 gün)',
            value: usd(stats.ai_cost_30d),
            icon: 'fas fa-coins',
            color: 'secondary',
        },
    ]);
}

async function loadReports() {
    try {
        const rows = await listAllFeedbackReports(state);
        reportsTable.updateData(rows, rows.length, 1);
    } catch (error) {
        console.error('Error loading feedback reports:', error);
        showNotification(error.message || 'Bildirimler yüklenemedi.', 'error');
    }
}

// ----------------------------------------------------------------- modal

function chip(label, value) {
    if (!value) return '';
    return `<span class="fb-chip">${escapeHtml(label)}: <strong>${escapeHtml(value)}</strong></span>`;
}

function timelineItem(done, label, when) {
    const icon = done
        ? '<i class="fas fa-check-circle t-done"></i>'
        : '<i class="far fa-circle t-pending"></i>';
    const whenText = when
        ? new Date(when).toLocaleString('tr-TR', {
            day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
        })
        : '';
    return `<li>${icon}<span class="t-when">${whenText}</span><span>${escapeHtml(label)}</span></li>`;
}

async function openReportModal(reportId) {
    let report;
    try {
        report = await getFeedbackReport(reportId);
    } catch (error) {
        showNotification(error.message || 'Bildirim yüklenemedi.', 'error');
        return;
    }

    const analysis = report.ai_analysis || {};
    const kindMeta = KIND_META[report.kind] || KIND_META.other;

    const modal = new DisplayModal('fb-modal-container', {
        title: `#${report.id} — ${report.title}`,
        icon: `fas ${kindMeta.icon}`,
        size: 'lg',
    });

    // --- report ------------------------------------------------------------
    const context = report.context || {};
    modal.addCustomSection({
        title: 'Bildirim',
        icon: 'fas fa-file-lines',
        customContent: `
            <div class="fb-chips">
                ${statusBadge(report.status)}
                ${chip('Tür', kindMeta.label)}
                ${chip('Bildiren', report.reporter_name || report.reporter_username)}
                ${chip('Tarih', new Date(report.created_at).toLocaleString('tr-TR'))}
            </div>
            <div class="fb-desc">${escapeHtml(report.description)}</div>
            ${report.page_url ? `<div class="fb-meta-line"><i class="fas fa-link me-1"></i>${escapeHtml(report.page_url)}</div>` : ''}
            ${context.user_agent ? `<div class="fb-meta-line"><i class="fas fa-display me-1"></i>${escapeHtml(`${context.screen || ''} · ${context.user_agent}`)}</div>` : ''}
            ${report.admin_note ? `<div class="fb-meta-line"><i class="fas fa-note-sticky me-1"></i>Not: ${escapeHtml(report.admin_note)}</div>` : ''}`,
    });

    // --- AI triage ---------------------------------------------------------
    if (report.analyzed_at) {
        const criteria = (analysis.acceptance_criteria || [])
            .map((c) => `<li>${escapeHtml(c)}</li>`).join('');
        const questions = (analysis.clarifying_questions || [])
            .map((c) => `<li>${escapeHtml(c)}</li>`).join('');
        modal.addCustomSection({
            title: 'AI Triyajı',
            icon: 'fas fa-robot',
            customContent: `
                <div>${escapeHtml(report.ai_summary || analysis.summary || '')}</div>
                <div class="fb-chips">
                    ${chip('Öneri', RECOMMENDATION_LABELS[report.ai_recommendation] || report.ai_recommendation)}
                    ${chip('Önem', analysis.severity)}
                    ${chip('Öncelik', PRIORITY_LABELS[report.priority] || report.priority)}
                    ${chip('Risk', analysis.risk)}
                    ${chip('Kapsam', analysis.estimated_scope)}
                    ${chip('Hedef', REPO_LABELS[report.target_repo] || report.target_repo)}
                    ${chip('Alan', analysis.affected_area)}
                    ${chip('Maliyet', usd(report.ai_cost_usd))}
                </div>
                ${analysis.reasoning ? `<div class="text-muted" style="font-size:0.85rem">${escapeHtml(analysis.reasoning)}</div>` : ''}
                ${analysis.implementation_brief ? `<div class="fb-brief mt-2">${renderRichText(analysis.implementation_brief)}</div>` : ''}
                ${criteria ? `<div class="mt-2 fw-semibold" style="font-size:0.85rem">Kabul kriterleri</div><ul class="fb-criteria">${criteria}</ul>` : ''}
                ${questions ? `<div class="mt-2 fw-semibold" style="font-size:0.85rem">Kullanıcıya sorulacaklar</div><ul class="fb-criteria">${questions}</ul>` : ''}`,
        });
    }

    // --- reporter's answers to the AI's questions ---------------------------
    if ((report.user_responses || []).length) {
        modal.addCustomSection({
            title: 'Kullanıcı Yanıtları',
            icon: 'fas fa-reply',
            customContent: report.user_responses.map((response) => `
                <div class="fb-gh-entry" style="flex-direction:column;align-items:flex-start">
                    ${(response.questions || []).map((q) => `<div class="text-muted" style="font-size:0.8rem">▸ ${escapeHtml(q)}</div>`).join('')}
                    <div style="white-space:pre-wrap">${escapeHtml(response.text || '')}</div>
                    <div class="text-muted" style="font-size:0.75rem">${response.at ? new Date(response.at).toLocaleString('tr-TR') : ''}</div>
                </div>`).join(''),
        });
    }

    // --- GitHub ------------------------------------------------------------
    if ((report.github_issues || []).length) {
        modal.addCustomSection({
            title: 'GitHub',
            icon: 'fab fa-github',
            customContent: report.github_issues.map((entry) => `
                <div class="fb-gh-entry">
                    <span class="text-muted">${escapeHtml(entry.repo)}</span>
                    <a href="${escapeHtml(entry.issue_url || '#')}" target="_blank" rel="noopener">
                        <i class="fas fa-circle-dot me-1"></i>Issue #${entry.issue_number}
                    </a>
                    <span class="fb-chip">${escapeHtml(entry.issue_state || '?')}</span>
                    ${entry.pr_url ? `
                        <a href="${escapeHtml(entry.pr_url)}" target="_blank" rel="noopener">
                            <i class="fas fa-code-pull-request me-1"></i>PR #${entry.pr_number}
                        </a>
                        <span class="fb-chip">${entry.pr_merged_at ? 'merge edildi' : escapeHtml(entry.pr_state || '?')}</span>`
                    : '<span class="text-muted" style="font-size:0.8rem">PR henüz açılmadı</span>'}
                </div>`).join(''),
        });
    }

    // --- timeline ----------------------------------------------------------
    const anyPr = (report.github_issues || []).find((e) => e.pr_number);
    const merged = (report.github_issues || []).some((e) => e.pr_merged_at);
    const closed = ['done', 'dismissed', 'duplicate'].includes(report.status);
    modal.addCustomSection({
        title: 'Süreç',
        icon: 'fas fa-timeline',
        customContent: `<ul class="fb-timeline">
            ${timelineItem(true, 'Bildirim alındı', report.created_at)}
            ${timelineItem(!!report.analyzed_at, 'AI analizi', report.analyzed_at)}
            ${timelineItem((report.github_issues || []).length > 0, 'Geliştirme kuyruğu (GitHub issue)', report.reviewed_at)}
            ${timelineItem(!!anyPr, anyPr ? `PR açıldı (#${anyPr.pr_number})` : 'PR açılması', null)}
            ${timelineItem(merged || closed, merged ? 'Merge edildi — yayında' : 'Kapanış', report.resolved_at)}
        </ul>`,
    });

    modal.render();

    // --- actions -----------------------------------------------------------
    const actions = [];
    if (['new', 'needs_info', 'analyzed', 'duplicate'].includes(report.status)) {
        actions.push({ id: 'fb-act-analyze', label: report.analyzed_at ? 'Yeniden Analiz Et' : 'AI Analizi Çalıştır', icon: 'fa-robot', cls: 'btn-outline-primary' });
    }
    if (report.status === 'analyzed') {
        actions.push({ id: 'fb-act-queue', label: 'Kuyruğa Al (Issue Aç)', icon: 'fa-rocket', cls: 'btn-primary' });
    }
    if (['queued', 'in_review', 'failed'].includes(report.status)) {
        actions.push({ id: 'fb-act-sync', label: 'GitHub Senkronize', icon: 'fa-rotate', cls: 'btn-outline-secondary' });
    }
    if (!['done', 'dismissed'].includes(report.status)) {
        actions.push({ id: 'fb-act-dismiss', label: 'Reddet', icon: 'fa-ban', cls: 'btn-outline-danger' });
    }
    modal.setFooterContent(`
        <div class="fb-footer-actions">
            ${actions.map((a) => `
                <button type="button" id="${a.id}" class="btn btn-sm ${a.cls}">
                    <i class="fas ${a.icon} me-1"></i>${a.label}
                </button>`).join('')}
        </div>`);

    const bind = (id, handler) => {
        const button = document.getElementById(id);
        if (button) {
            button.addEventListener('click', () => runAction(button, handler, modal));
        }
    };
    bind('fb-act-analyze', () => analyzeFeedbackReport(report.id));
    bind('fb-act-queue', () => queueFeedbackReport(report.id));
    bind('fb-act-sync', () => syncFeedbackReport(report.id));
    bind('fb-act-dismiss', () => {
        const note = prompt('Reddetme nedeni (opsiyonel):') || '';
        return dismissFeedbackReport(report.id, note);
    });

    modal.show();
}

async function runAction(button, handler, modal) {
    const original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm me-1" style="width:0.8rem;height:0.8rem"></span>Çalışıyor...';
    try {
        const result = await handler();
        if (result === undefined) {
            // dismiss prompt cancelled with empty handler result — still fine
        }
        showNotification('İşlem tamamlandı.', 'success');
        modal.hide();
        await loadAll();
    } catch (error) {
        showNotification(error.message || 'İşlem başarısız.', 'error');
        button.disabled = false;
        button.innerHTML = original;
    }
}

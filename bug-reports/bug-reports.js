import { guardRoute, getGrantedPageRoutes, isAdmin } from '../authService.js';
import { initNavbar } from '../components/navbar.js';
import { NAVIGATION_STRUCTURE } from '../navigationStructure.js';
import {
    listBugReports,
    getBugReport,
    createBugReport,
    replyToBugReport,
    uploadBugReportAttachment,
    STATUS_LABELS,
    STATUS_BADGE,
} from '../apis/bugReports.js';

let reports = [];
let currentReportId = null;
let pollInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    await initNavbar();
    populatePageDropdown();
    bindUI();
    await loadList();
});

function populatePageDropdown() {
    const select = document.getElementById('report-page');
    if (!select) return;

    const grantedRoutes = isAdmin() ? null : getGrantedPageRoutes();

    function flattenNav(node, prefix = '') {
        const options = [];
        for (const [route, info] of Object.entries(node)) {
            if (route === '/') continue;
            const allowed = grantedRoutes === null || grantedRoutes.has(route);
            if (allowed) {
                const label = prefix ? `${prefix} › ${info.label}` : info.label;
                options.push({ route, label });
            }
            if (info.children && Object.keys(info.children).length) {
                const parentLabel = prefix ? `${prefix} › ${info.label}` : info.label;
                options.push(...flattenNav(info.children, parentLabel));
            }
        }
        return options;
    }

    const pages = flattenNav(NAVIGATION_STRUCTURE);
    pages.forEach(({ route, label }) => {
        const opt = document.createElement('option');
        opt.value = route;
        opt.textContent = label;
        select.appendChild(opt);
    });
}

// ---------------------------------------------------------------------------
// UI Bindings
// ---------------------------------------------------------------------------

function bindUI() {
    document.getElementById('btn-new-report').addEventListener('click', () => {
        document.getElementById('new-report-form').classList.toggle('d-none');
    });

    document.getElementById('btn-cancel-report').addEventListener('click', () => {
        document.getElementById('new-report-form').classList.add('d-none');
        clearForm();
    });

    document.getElementById('btn-submit-report').addEventListener('click', submitNewReport);

    document.getElementById('btn-back').addEventListener('click', () => {
        showList();
        stopPolling();
    });

    document.getElementById('btn-send-reply').addEventListener('click', sendReply);

    document.getElementById('reply-content').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendReply();
        }
    });
}

// ---------------------------------------------------------------------------
// List view
// ---------------------------------------------------------------------------

async function loadList() {
    try {
        const data = await listBugReports();
        reports = Array.isArray(data) ? data : (data.results || []);
        renderList();
    } catch (err) {
        document.getElementById('bug-list-container').innerHTML =
            `<div class="alert alert-danger">Hata raporları yüklenemedi: ${err.message}</div>`;
    }
}

function renderList() {
    const container = document.getElementById('bug-list-container');
    if (!reports.length) {
        container.innerHTML = `
            <div class="text-center py-5 text-muted">
                <i class="fas fa-check-circle fa-3x mb-3 text-success"></i>
                <p>Henüz hata raporu yok. Bir sorun yaşıyorsanız "Yeni Rapor" butonunu kullanın.</p>
            </div>`;
        return;
    }

    container.innerHTML = reports.map(r => `
        <div class="card bug-card mb-2 shadow-sm" data-id="${r.id}">
            <div class="card-body py-3">
                <div class="d-flex align-items-center justify-content-between">
                    <div>
                        <span class="fw-semibold">#${r.id} ${escapeHtml(r.title)}</span>
                        <span class="badge ${STATUS_BADGE[r.status] || 'bg-secondary'} ms-2">
                            ${STATUS_LABELS[r.status] || r.status}
                        </span>
                    </div>
                    <small class="text-muted">${formatDate(r.created_at)}</small>
                </div>
                <div class="text-muted small mt-1">${escapeHtml(r.reported_by_name)}</div>
            </div>
        </div>
    `).join('');

    container.querySelectorAll('.bug-card').forEach(card => {
        card.addEventListener('click', () => openDetail(parseInt(card.dataset.id)));
    });
}

// ---------------------------------------------------------------------------
// Detail view
// ---------------------------------------------------------------------------

async function openDetail(id) {
    currentReportId = id;
    showDetail();

    try {
        const report = await getBugReport(id);
        renderDetail(report);
        startPolling(id);
    } catch (err) {
        document.getElementById('chat-box').innerHTML =
            `<div class="alert alert-danger">Yüklenemedi: ${err.message}</div>`;
    }
}

function renderDetail(report) {
    document.getElementById('detail-title').textContent = `#${report.id} ${report.title}`;
    const badge = document.getElementById('detail-badge');
    badge.textContent = STATUS_LABELS[report.status] || report.status;
    badge.className = `badge ms-2 ${STATUS_BADGE[report.status] || 'bg-secondary'}`;
    document.getElementById('detail-date').textContent = formatDate(report.created_at);

    // PR links
    const prLinks = document.getElementById('pr-links');
    const prBody = document.getElementById('pr-links-body');
    const links = [];
    if (report.pr_backend_url) links.push(`<a href="${report.pr_backend_url}" target="_blank">Backend PR</a>`);
    if (report.pr_frontend_url) links.push(`<a href="${report.pr_frontend_url}" target="_blank">Frontend PR</a>`);
    if (links.length) {
        prBody.innerHTML = links.join(' &nbsp;|&nbsp; ');
        prLinks.classList.remove('d-none');
    } else {
        prLinks.classList.add('d-none');
    }

    // Messages
    const chatBox = document.getElementById('chat-box');
    chatBox.innerHTML = (report.messages || []).map(m => {
        const isAgent = m.sender_type === 'agent';
        return `
            <div class="${isAgent ? '' : 'd-flex flex-column align-items-end'}">
                <div class="msg-label">${isAgent ? '<i class="fas fa-robot me-1"></i>Ajan' : escapeHtml(m.sender_name || 'Sen')}</div>
                <div class="${isAgent ? 'msg-agent' : 'msg-user'}">
                    <pre>${escapeHtml(m.content)}</pre>
                </div>
                <div class="text-muted" style="font-size:.7rem;margin-bottom:8px">${formatDate(m.created_at)}</div>
            </div>`;
    }).join('');
    chatBox.scrollTop = chatBox.scrollHeight;

    // Disable reply if closed
    const replyForm = document.getElementById('reply-form');
    if (report.status === 'closed') {
        replyForm.innerHTML = '<p class="text-muted small">Bu rapor kapatılmıştır.</p>';
    }
}

async function sendReply() {
    const textarea = document.getElementById('reply-content');
    const content = textarea.value.trim();
    if (!content || !currentReportId) return;

    const btn = document.getElementById('btn-send-reply');
    btn.disabled = true;
    try {
        const report = await replyToBugReport(currentReportId, content);
        textarea.value = '';
        renderDetail(report);
    } catch (err) {
        alert('Yanıt gönderilemedi: ' + err.message);
    } finally {
        btn.disabled = false;
    }
}

// ---------------------------------------------------------------------------
// New report form
// ---------------------------------------------------------------------------

async function submitNewReport() {
    const title = document.getElementById('report-title').value.trim();
    const description = document.getElementById('report-description').value.trim();
    const steps = document.getElementById('report-steps').value.trim();
    const pageSelect = document.getElementById('report-page');
    const page_url = pageSelect?.value || '';
    const page_label = pageSelect?.options[pageSelect.selectedIndex]?.text || '';

    if (!title || !description) {
        alert('Başlık ve açıklama zorunludur.');
        return;
    }

    const btn = document.getElementById('btn-submit-report');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Gönderiliyor...';

    try {
        const report = await createBugReport({ title, description, steps, page_url, page_label });

        // Upload attachment if provided
        const fileInput = document.getElementById('report-attachment');
        if (fileInput.files.length) {
            await uploadBugReportAttachment(report.id, fileInput.files[0]);
        }

        document.getElementById('new-report-form').classList.add('d-none');
        clearForm();
        await loadList();
        openDetail(report.id);
    } catch (err) {
        alert('Rapor gönderilemedi: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane me-1"></i> Gönder';
    }
}

function clearForm() {
    document.getElementById('report-title').value = '';
    document.getElementById('report-description').value = '';
    document.getElementById('report-steps').value = '';
    document.getElementById('report-attachment').value = '';
    const pageSelect = document.getElementById('report-page');
    if (pageSelect) pageSelect.selectedIndex = 0;
}

// ---------------------------------------------------------------------------
// Polling — refresh detail every 10s while agent is processing
// ---------------------------------------------------------------------------

function startPolling(id) {
    stopPolling();
    pollInterval = setInterval(async () => {
        if (currentReportId !== id) { stopPolling(); return; }
        try {
            const report = await getBugReport(id);
            renderDetail(report);
            if (report.status === 'pr_created' || report.status === 'closed' || report.status === 'waiting_info') {
                stopPolling();
            }
        } catch (_) {}
    }, 10_000);
}

function stopPolling() {
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

function showDetail() {
    document.getElementById('bug-list-container').classList.add('d-none');
    document.getElementById('btn-new-report').classList.add('d-none');
    document.getElementById('new-report-form').classList.add('d-none');
    document.getElementById('bug-detail-container').classList.remove('d-none');
}

function showList() {
    currentReportId = null;
    document.getElementById('bug-list-container').classList.remove('d-none');
    document.getElementById('btn-new-report').classList.remove('d-none');
    document.getElementById('bug-detail-container').classList.add('d-none');
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
}

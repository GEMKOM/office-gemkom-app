/**
 * NCR details rendered as a paper-style Non-Conformance Report form.
 *
 * Pure markup: the caller (ncrs.js → showNCRDetails) owns the modal, the file list
 * and every button handler. Element ids the caller binds to:
 *   #ncr-files-list, #ncr-files-upload-btn, #ncr-files-download-all-btn
 */
import { escapeHtml, escapeHtmlWithBreaks } from '../../../utils/text.js';
import {
    DEFECT_TYPE_CHOICES,
    SEVERITY_CHOICES,
    DISPOSITION_CHOICES
} from '../../../apis/qualityControl.js';

const STATUS_CLASS = {
    draft: 'status-grey',
    submitted: 'status-blue',
    approved: 'status-green',
    rejected: 'status-red',
    closed: 'status-purple'
};

const OUTCOME = {
    pending: { label: 'Karar Bekleniyor', cls: 'status-blue' },
    approved: { label: 'Onaylandı', cls: 'status-green' },
    rejected: { label: 'Reddedildi', cls: 'status-red' },
    cancelled: { label: 'İptal Edildi', cls: 'status-grey' }
};

function formatDate(value, withTime = false) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const opts = withTime
        ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
        : { day: '2-digit', month: '2-digit', year: 'numeric' };
    return date.toLocaleString('tr-TR', opts);
}

/** A labelled cell of the form grid. `html` is trusted markup; pass escaped text. */
function cell(label, html, { span = 1, empty = false } = {}) {
    return `
        <div class="ncr-form-cell" style="grid-column: span ${span};">
            <div class="ncr-form-label">${label}</div>
            <div class="ncr-form-value${empty ? ' is-empty' : ''}">${html}</div>
        </div>`;
}

function textOrEmpty(value, emptyText = '—') {
    const text = value === null || value === undefined ? '' : String(value).trim();
    return text ? { html: escapeHtml(text), empty: false } : { html: emptyText, empty: true };
}

/** Choice list drawn as form check boxes, the selected one ticked. */
function checkboxGroup(choices, selected) {
    return `
        <div class="ncr-form-checks">
            ${choices.map(choice => {
                const on = choice.value === selected;
                return `
                    <span class="ncr-form-check${on ? ' is-checked' : ''}">
                        <span class="ncr-form-box">${on ? '<i class="fas fa-check"></i>' : ''}</span>
                        ${escapeHtml(choice.label)}
                    </span>`;
            }).join('')}
        </div>`;
}

function section(number, title, body, extraClass = '') {
    return `
        <section class="ncr-form-section ${extraClass}">
            <h3 class="ncr-form-section-title"><span class="ncr-form-num">${number}</span>${title}</h3>
            ${body}
        </section>`;
}

function narrative(value, emptyText) {
    const text = (value || '').trim();
    return text
        ? `<div class="ncr-form-narrative">${escapeHtmlWithBreaks(text)}</div>`
        : `<div class="ncr-form-narrative is-empty">${emptyText}</div>`;
}

function signatureBlock(role, name, date, extra = '') {
    return `
        <div class="ncr-form-sign">
            <div class="ncr-form-sign-role">${role}</div>
            <div class="ncr-form-sign-name${name ? '' : ' is-empty'}">${name ? escapeHtml(name) : '—'}</div>
            <div class="ncr-form-sign-date">${date || '&nbsp;'}</div>
            ${extra}
        </div>`;
}

function qcSignature(ncr, history) {
    const last = history[history.length - 1];
    if (!last) {
        // No history array at all = an older backend; only claim "not sent" when we know.
        const neverSent = Array.isArray(ncr.approval_history) && (ncr.submission_count ?? 0) === 0;
        const pendingText = neverSent ? 'Henüz onaya gönderilmedi' : '—';
        return signatureBlock('Kalite Kontrol Onayı', '', '', `<div class="ncr-form-sign-note">${pendingText}</div>`);
    }
    const decision = last.decisions[last.decisions.length - 1];
    const outcome = OUTCOME[last.outcome] || OUTCOME.pending;
    const badge = `<span class="status-badge ${outcome.cls}">${outcome.label}</span>`;
    if (!decision) {
        return signatureBlock('Kalite Kontrol Onayı', '', `Gönderim: ${formatDate(last.submitted_at, true)}`,
            `<div class="ncr-form-sign-note">${badge}</div>`);
    }
    const comment = decision.comment
        ? `<div class="ncr-form-sign-comment">“${escapeHtml(decision.comment)}”</div>`
        : '';
    return signatureBlock('Kalite Kontrol Onayı', decision.approver_name, formatDate(decision.decided_at, true),
        `<div class="ncr-form-sign-note">${badge}</div>${comment}`);
}

function historyTable(history) {
    if (history.length === 0) return '';
    const rows = history.map((entry, index) => {
        const outcome = OUTCOME[entry.outcome] || OUTCOME.pending;
        const decision = entry.decisions[entry.decisions.length - 1];
        return `
            <tr>
                <td class="text-center">${index + 1}</td>
                <td>${formatDate(entry.submitted_at, true)}</td>
                <td><span class="status-badge ${outcome.cls}">${outcome.label}</span></td>
                <td>${decision ? escapeHtml(decision.approver_name) : '—'}</td>
                <td>${decision ? formatDate(decision.decided_at, true) : '—'}</td>
                <td>${decision?.comment ? escapeHtmlWithBreaks(decision.comment) : '<span class="text-muted">—</span>'}</td>
            </tr>`;
    }).join('');
    return `
        <div class="ncr-form-subhead">Gönderim Geçmişi</div>
        <div class="table-responsive">
            <table class="ncr-form-table">
                <thead>
                    <tr><th style="width: 40px;">#</th><th>Gönderim</th><th>Sonuç</th><th>Karar Veren</th><th>Karar Tarihi</th><th>Yorum</th></tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
}

/**
 * @param {Object} ncr  NCR detail payload
 * @param {Object} ctx
 * @param {string} ctx.statusLabel      label the list table uses for this status
 * @param {string} ctx.assignedTeamName resolved assigned group name
 * @param {string} ctx.qcReviewHtml     trusted link markup for the QC review, or ''
 * @param {Object|null} ctx.nextAction  { actor, task } — who has to move the NCR next
 */
export function renderNcrForm(ncr, ctx = {}) {
    const history = Array.isArray(ncr.approval_history) ? ncr.approval_history : [];
    const statusCls = STATUS_CLASS[ncr.status] || 'status-grey';
    const statusLabel = ctx.statusLabel || ncr.status_display || ncr.status || '-';

    const jobOrderHtml = ncr.job_order
        ? `<a href="/projects/project-tracking/?job_no=${encodeURIComponent(ncr.job_order)}" target="_blank" class="ncr-form-mono">${escapeHtml(ncr.job_order)}</a>
           ${ncr.job_order_title ? `<div class="ncr-form-sub">${escapeHtml(ncr.job_order_title)}</div>` : ''}`
        : '—';
    const customer = textOrEmpty(ncr.job_order_customer_name);
    const task = textOrEmpty(ncr.department_task_title);
    const detectedBy = textOrEmpty(ncr.detected_by_name);
    const team = textOrEmpty(ctx.assignedTeamName, 'Atanmamış');
    const members = (ncr.assigned_members_data || []).map(m => m.name).filter(Boolean);
    const membersCell = members.length
        ? { html: members.map(escapeHtml).join(', '), empty: false }
        : { html: '—', empty: true };

    const next = ctx.nextAction;
    const nextStrip = next && next.actor
        ? `<div class="ncr-form-next">
               <i class="fas fa-arrow-right"></i>
               <span>Sıradaki adım: <strong>${escapeHtml(next.actor)}</strong> — ${escapeHtml(next.task || '')}</span>
           </div>`
        : '';

    const header = `
        <header class="ncr-form-head">
            <div class="ncr-form-brand">
                <img src="/images/gemkom.png" alt="GEMKOM" class="ncr-form-logo">
                <div>
                    <div class="ncr-form-org">GEMKOM · Kalite Kontrol</div>
                    <h2 class="ncr-form-title">Uygunsuzluk Raporu</h2>
                    <div class="ncr-form-subtitle">Non-Conformance Report (NCR)</div>
                </div>
            </div>
            <table class="ncr-form-meta">
                <tr><th>Rapor No</th><td class="ncr-form-mono">${escapeHtml(ncr.ncr_number || `#${ncr.id}`)}</td></tr>
                <tr><th>Açılış Tarihi</th><td>${formatDate(ncr.created_at) || '—'}</td></tr>
                <tr><th>Durum</th><td><span class="status-badge ${statusCls}">${escapeHtml(statusLabel)}</span></td></tr>
                <tr><th>Gönderim Sayısı</th><td>${ncr.submission_count ?? 0}</td></tr>
            </table>
        </header>`;

    const identification = section(1, 'Tanımlama', `
        <div class="ncr-form-grid">
            ${cell('İş Emri', jobOrderHtml, { span: 2 })}
            ${cell('Müşteri', customer.html, { empty: customer.empty })}
            ${cell('Etkilenen Miktar', `${escapeHtml(ncr.affected_quantity ?? '—')} <span class="ncr-form-sub d-inline">adet</span>`)}
            ${cell('İlgili Görev', task.html, { span: 2, empty: task.empty })}
            ${cell('KK İnceleme', ctx.qcReviewHtml || '—', { empty: !ctx.qcReviewHtml })}
            ${cell('Tespit Eden', detectedBy.html, { empty: detectedBy.empty })}
            ${cell('Sorumlu Grup', team.html, { span: 2, empty: team.empty })}
            ${cell('Sorumlu Kişiler', membersCell.html, { span: 2, empty: membersCell.empty })}
        </div>`);

    const description = section(2, 'Uygunsuzluk Tanımı', `
        <div class="ncr-form-grid">
            ${cell('Başlık', `<strong>${escapeHtml(ncr.title || '—')}</strong>`, { span: 4 })}
            ${cell('Açıklama', ncr.description ? escapeHtmlWithBreaks(ncr.description) : '—', { span: 4, empty: !ncr.description })}
            ${cell('Kusur Tipi', checkboxGroup(DEFECT_TYPE_CHOICES, ncr.defect_type), { span: 3 })}
            ${cell('Önem Derecesi', checkboxGroup(SEVERITY_CHOICES, ncr.severity), { span: 1 })}
        </div>`);

    const rootCause = section(3, 'Kök Neden Analizi',
        narrative(ncr.root_cause, 'Kök neden henüz girilmedi.'));

    const corrective = section(4, 'Düzeltici Faaliyet',
        narrative(ncr.corrective_action, 'Düzeltici faaliyet henüz girilmedi.'));

    const disposition = section(5, 'Karar (Uygunsuz Ürün)',
        `<div class="ncr-form-grid">${cell('Ürün için verilen karar', checkboxGroup(DISPOSITION_CHOICES, ncr.disposition), { span: 4 })}</div>`);

    const signoff = section(6, 'Onay ve Kayıt', `
        <div class="ncr-form-signs">
            ${signatureBlock('Hazırlayan', ncr.created_by_name, formatDate(ncr.created_at, true))}
            ${signatureBlock('Tespit Eden', ncr.detected_by_name, '')}
            ${qcSignature(ncr, history)}
        </div>
        ${historyTable(history)}`);

    const attachments = section(7, 'Ekler', `
        <div class="ncr-form-files-bar ncr-form-noprint">
            <button type="button" class="btn btn-sm btn-outline-success" id="ncr-files-download-all-btn">
                <i class="fas fa-download me-1"></i>Tümünü İndir (ZIP)
            </button>
            <button type="button" class="btn btn-sm btn-outline-primary" id="ncr-files-upload-btn">
                <i class="fas fa-upload me-1"></i>Dosya Yükle
            </button>
        </div>
        <div id="ncr-files-list"></div>`, 'ncr-form-files');

    return `
        <div class="ncr-form">
            ${header}
            ${nextStrip}
            ${identification}
            ${description}
            ${rootCause}
            ${corrective}
            ${disposition}
            ${signoff}
            ${attachments}
        </div>`;
}

/** Print only the NCR form: hide the rest of the page for the duration of the print dialog. */
export function printNcrForm() {
    document.body.classList.add('ncr-printing');
    const cleanup = () => {
        document.body.classList.remove('ncr-printing');
        window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
}

const SEVERITY_CLASS = {
    minor: 'status-blue',
    major: 'status-orange',
    critical: 'status-red'
};

/** EditModal section title in the form's numbered style. EditModal injects it as HTML. */
export function numberedSectionTitle(number, title) {
    return `<span class="ncr-form-num">${number}</span>${title}`;
}

/** The QC decision that sent this NCR back, if its latest submission was rejected. */
function latestRejection(ncr) {
    const history = Array.isArray(ncr.approval_history) ? ncr.approval_history : [];
    const last = history[history.length - 1];
    if (!last || last.outcome !== 'rejected') return null;
    return last.decisions.filter(d => d.decision === 'reject').pop() || null;
}

/**
 * Read-only summary of the NCR shown at the top of the edit / submit modals, so the
 * person filling them in can see what they are answering without the form behind it.
 */
export function renderNcrContext(ncr, { statusLabel = '', showDescription = true } = {}) {
    const statusCls = STATUS_CLASS[ncr.status] || 'status-grey';
    const severityCls = SEVERITY_CLASS[ncr.severity] || 'status-grey';
    const jobOrder = ncr.job_order
        ? `<span class="ncr-modal-context-job">İş Emri <span class="ncr-form-mono">${escapeHtml(ncr.job_order)}</span>${ncr.job_order_title ? ` · ${escapeHtml(ncr.job_order_title)}` : ''}</span>`
        : '';
    const description = showDescription && ncr.description
        ? `<div class="ncr-modal-context-desc">${escapeHtmlWithBreaks(ncr.description)}</div>`
        : '';

    const rejection = latestRejection(ncr);
    const callout = rejection
        ? `<div class="ncr-modal-callout">
               <i class="fas fa-rotate-left"></i>
               <div>
                   <div><strong>Kalite Kontrol reddetti</strong> · ${escapeHtml(rejection.approver_name)}, ${formatDate(rejection.decided_at, true)}</div>
                   ${rejection.comment ? `<div class="ncr-modal-callout-text">${escapeHtmlWithBreaks(rejection.comment)}</div>` : ''}
               </div>
           </div>`
        : '';

    return `
        <div class="ncr-modal-context">
            <div class="ncr-modal-context-top">
                <span class="ncr-form-mono">${escapeHtml(ncr.ncr_number || `#${ncr.id}`)}</span>
                <span class="status-badge ${statusCls}">${escapeHtml(statusLabel || ncr.status_display || ncr.status || '')}</span>
                <span class="status-badge ${severityCls}">${escapeHtml(ncr.severity_display || ncr.severity || '')}</span>
                ${jobOrder}
            </div>
            <div class="ncr-modal-context-title">${escapeHtml(ncr.title || '')}</div>
            ${description}
        </div>
        ${callout}`;
}

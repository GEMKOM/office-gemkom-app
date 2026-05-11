import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { TableComponent } from '../../../components/table/table.js';
import { AttendanceCalendar } from '../../../components/attendance-calendar/attendance-calendar.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
import { DisplayModal } from '../../../components/display-modal/display-modal.js';
import { ConfirmationModal } from '../../../components/confirmation-modal/confirmation-modal.js';
import { showNotification } from '../../../components/notification/notification.js';
import { fetchAttendanceMonthlySummary } from '../../../apis/attendance.js';
import {
    LEAVE_TYPES,
    previewVacationDuration,
    createVacationRequest,
    fetchVacationRequests,
    fetchVacationRequest,
    cancelVacationRequest,
    fetchMyVacationSummary,
    fetchUpcomingLeaves
} from '../../../apis/vacationRequests.js';

let requestsTable = null;
let createModal = null;
let detailModal = null;
let cancelModal = null;
let calendarModal = null;
let currentRequest = null;
let previewTimer = null;
let currentPage = 1;
let currentRequests = [];
let totalCount = 0;
let isLoading = false;
let attendanceCalendar = null;
let attendanceCalendarInitialized = false;

const leaveTypeLabelMap = new Map(LEAVE_TYPES.map(item => [item.value, item.label]));

function parseListResponse(response) {
    if (Array.isArray(response)) {
        return { results: response, count: response.length };
    }
    const results = Array.isArray(response?.results) ? response.results : [];
    const count = Number(response?.count ?? results.length);
    return { results, count };
}

function formatDate(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('tr-TR');
}

function formatDateWithWeekday(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('tr-TR', {
        weekday: 'long',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

function formatTime(value) {
    if (!value) return '-';
    const text = String(value);
    const match = text.match(/^(\d{2}:\d{2})/);
    return match ? match[1] : text;
}

function isCompensatoryLeave(leaveType) {
    return leaveType === 'compensatory_leave';
}

function previewReasonLabel(reason) {
    const map = {
        weekend: 'Hafta Sonu',
        public_holiday: 'Resmi Tatil',
        half_day_holiday: '1/2 Gün Tatil (Arife)'
    };
    return map[reason] || reason || 'Hariç gün';
}

function getStatusBadge(status, statusLabel) {
    const text = statusLabel || status || '-';
    const cls = status === 'approved'
        ? 'status-green'
        : status === 'submitted'
            ? 'status-yellow'
            : status === 'rejected' || status === 'cancelled'
                ? 'status-red'
                : 'status-grey';
    return `<span class="status-badge ${cls}">${text}</span>`;
}

function renderSummaryCard(title, value, subtitle = '') {
    return `
        <div class="col-12 col-md-6 col-xl-3">
            <div class="border rounded-3 p-3 h-100 bg-white">
                <div class="small text-muted mb-1">${title}</div>
                <div class="fw-bold fs-5">${value}</div>
                ${subtitle ? `<div class="small text-muted mt-1">${subtitle}</div>` : ''}
            </div>
        </div>
    `;
}

function parseUpcomingLeavesResponse(response) {
    if (Array.isArray(response)) return response;
    if (Array.isArray(response?.results)) return response.results;
    return [];
}

async function loadMyVacationSummary() {
    const container = document.getElementById('my-vacation-summary-container');
    if (!container) return;

    container.innerHTML = `
        <div class="card">
            <div class="card-body py-3">
                <div class="small text-muted"><i class="fas fa-spinner fa-spin me-2"></i>Özet yükleniyor...</div>
            </div>
        </div>
    `;

    try {
        const summary = await fetchMyVacationSummary();
        const annual = summary?.annual_leave || {};
        const upcomingResp = await fetchUpcomingLeaves();
        const upcomingRows = parseUpcomingLeavesResponse(upcomingResp);
        const fromDate = upcomingResp?.from_date || null;
        const toDate = upcomingResp?.to_date || null;

        const upcomingTableHtml = upcomingRows.length
            ? `
                <div class="table-responsive">
                    <table class="table table-sm align-middle mb-0">
                        <thead>
                            <tr>
                                <th>Ad Soyad</th>
                                <th>Başlangıç</th>
                                <th>Bitiş</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${upcomingRows.map(item => `
                                <tr>
                                    <td class="fw-semibold">${item.full_name || '-'}</td>
                                    <td>${formatDate(item.start_date)}</td>
                                    <td>${formatDate(item.end_date)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `
            : '<div class="small text-muted">Yaklaşan izin kaydı bulunamadı.</div>';

        container.innerHTML = `
            <div class="card border-0 shadow-sm">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h6 class="mb-0"><i class="fas fa-chart-line me-2 text-primary"></i>İzin Özetim</h6>
                        <button id="refresh-my-summary-btn" type="button" class="btn btn-sm btn-outline-secondary">
                            <i class="fas fa-sync-alt me-1"></i>Yenile
                        </button>
                    </div>
                    <div class="row g-3">
                        <div class="col-12 col-lg-7">
                            <div class="border rounded-3 p-3 h-100">
                                <div class="row g-2">
                                    ${renderSummaryCard('Kalan Yıllık İzin', `${annual.remaining_days ?? '0.0'} gün`)}
                                    ${renderSummaryCard('Kullanılan Yıllık İzin', `${annual.used_days ?? '0.0'} gün`, annual.last_credited ? `Son kredi: ${formatDate(annual.last_credited)}` : '')}
                                    ${renderSummaryCard('Kıdem Süresi', `${summary?.years_of_service ?? 0} yıl`, summary?.hire_date ? `İşe giriş: ${formatDate(summary.hire_date)}` : '')}
                                </div>
                            </div>
                        </div>
                        <div class="col-12 col-lg-5">
                            <div class="border rounded-3 p-3 h-100">
                                <div class="fw-semibold mb-1">Yaklaşan İzinler</div>
                                <div class="small text-muted mb-2">
                                    ${fromDate && toDate ? `${formatDate(fromDate)} - ${formatDate(toDate)}` : 'Önümüzdeki dönem'}
                                </div>
                                ${upcomingTableHtml}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('refresh-my-summary-btn')?.addEventListener('click', () => {
            loadMyVacationSummary();
        });
    } catch (error) {
        container.innerHTML = `
            <div class="card">
                <div class="card-body py-3">
                    <div class="small text-danger">
                        <i class="fas fa-triangle-exclamation me-2"></i>${error?.message || 'İzin özeti yüklenemedi.'}
                    </div>
                </div>
            </div>
        `;
    }
}

function renderApprovalSummary(request) {
    const approval = request?.approval;
    if (!approval || request?.status !== 'submitted') return '<span class="text-muted">-</span>';
    const stages = Array.isArray(approval.stage_instances) ? approval.stage_instances : [];
    const currentStage = stages.find(stage => !stage?.is_complete && !stage?.is_rejected);
    if (!currentStage) return '<span class="text-success"><i class="fas fa-check-circle me-1"></i>Tamamlandı</span>';
    const remaining = Math.max(0, Number(currentStage.required_approvals || 0) - Number(currentStage.approved_count || 0));
    return `
        <div style="line-height:1.2;">
            <div class="fw-semibold text-primary">${currentStage.name || 'Onay'}</div>
            <div class="small text-muted">${remaining} onay bekleniyor</div>
        </div>
    `;
}

async function loadRequests() {
    if (isLoading || !requestsTable) return;
    isLoading = true;
    requestsTable.setLoading(true);
    try {
        const filters = {
            page: currentPage,
            page_size: requestsTable.options.itemsPerPage,
            ordering: '-created_at',
            mine: 'true',
        };

        const response = await fetchVacationRequests(filters);
        const parsed = parseListResponse(response);
        currentRequests = parsed.results;
        totalCount = parsed.count;
        requestsTable.updateData(currentRequests, totalCount, currentPage);
    } catch (error) {
        showNotification(error?.message || 'İzin talepleri yüklenemedi', 'error');
        currentRequests = [];
        totalCount = 0;
        requestsTable.updateData([], 0, 1);
    } finally {
        requestsTable.setLoading(false);
        isLoading = false;
    }
}

function initializeAttendanceCalendar() {
    attendanceCalendar = new AttendanceCalendar('vacation-attendance-calendar-modal', {
        showUserFilter: false,
        userIdPlaceholder: '',
        vacationRequestBaseUrl: '/general/vacation/requests',
        fetchMonthlySummary: ({ year, month }) => fetchAttendanceMonthlySummary({ year, month })
    });
    attendanceCalendarInitialized = true;
    return attendanceCalendar.refresh();
}

function initializeCalendarModal() {
    calendarModal = new DisplayModal('vacation-calendar-modal-container', {
        title: 'PDKS Takvimi',
        icon: 'fas fa-calendar-alt',
        size: 'xl',
        showEditButton: false
    });
    calendarModal.clearData();
    calendarModal.addCustomSection({
        title: null,
        customContent: '<div id="vacation-attendance-calendar-modal"></div>'
    });
    calendarModal.render();
}

function setupCalendarModalButton() {
    const controls = document.querySelector('.dashboard-controls');
    const createBtn = document.getElementById('create-btn');
    if (!controls || !createBtn || document.getElementById('open-calendar-btn')) return;

    const calendarBtn = document.createElement('button');
    calendarBtn.id = 'open-calendar-btn';
    calendarBtn.type = 'button';
    calendarBtn.className = 'btn btn-sm btn-outline-primary me-2';
    calendarBtn.innerHTML = '<i class="fas fa-calendar-alt me-1"></i>Takvim';
    controls.insertBefore(calendarBtn, createBtn);

    calendarBtn.addEventListener('click', async () => {
        if (!calendarModal) return;

        if (!attendanceCalendarInitialized) {
            await initializeAttendanceCalendar();
        } else {
            await attendanceCalendar?.refresh?.();
        }

        calendarModal.show();
    });
}

function initializeCreateModal() {
    createModal = new EditModal('vacation-request-create-modal-container', {
        title: 'Yeni İzin Talebi',
        icon: 'fas fa-calendar-plus',
        size: 'lg',
        showEditButton: false,
        saveButtonText: 'Talep Oluştur'
    });
    createModal.clearAll();
    createModal.addSection({ title: 'Talep Bilgileri', icon: 'fas fa-file-signature', iconColor: 'text-primary' });
    createModal.addField({
        id: 'leave_type',
        name: 'leave_type',
        label: 'İzin Türü',
        type: 'dropdown',
        options: LEAVE_TYPES,
        placeholder: 'İzin türü seçin...',
        searchable: true,
        value: LEAVE_TYPES[0]?.value || 'annual_leave',
        required: true,
        colSize: 6
    });
    createModal.addField({ id: 'start_date', name: 'start_date', label: 'Başlangıç Tarihi', type: 'date', required: true, colSize: 12 });
    createModal.addField({ id: 'end_date', name: 'end_date', label: 'Bitiş Tarihi', type: 'date', required: true, colSize: 12 });
    createModal.addField({ id: 'start_time', name: 'start_time', label: 'Başlangıç Saati', type: 'time', step: 900, colSize: 6 });
    createModal.addField({ id: 'end_time', name: 'end_time', label: 'Bitiş Saati', type: 'time', step: 900, colSize: 6 });
    createModal.addField({ id: 'reason', name: 'reason', label: 'Gerekçe (opsiyonel)', type: 'textarea', rows: 3, colSize: 12 });
    createModal.render();
    const previewSection = document.createElement('div');
    previewSection.className = 'form-section compact mb-3';
    previewSection.innerHTML = `
        <h6 class="section-subtitle compact text-primary">
            <i class="fas fa-calendar-day me-2"></i>Önizleme
        </h6>
        <div id="vacation-preview-box" class="small text-muted">Tarih seçildiğinde iş günü önizlemesi gösterilecek.</div>
    `;
    createModal.form?.appendChild(previewSection);

    const bindPreview = () => {
        const startInput = createModal.container.querySelector('#start_date');
        const endInput = createModal.container.querySelector('#end_date');
        const leaveTypeInput = createModal.container.querySelector('#dropdown-leave_type');
        const endFieldGroup = createModal.container.querySelector('[data-field-id="end_date"]');
        const startTimeFieldGroup = createModal.container.querySelector('[data-field-id="start_time"]');
        const endTimeFieldGroup = createModal.container.querySelector('[data-field-id="end_time"]');
        const startTimeInput = createModal.container.querySelector('#start_time');
        const endTimeInput = createModal.container.querySelector('#end_time');
        const startDateFieldGroup = createModal.container.querySelector('[data-field-id="start_date"]');

        const setFieldColumnSize = (fieldGroup, size) => {
            const col = fieldGroup?.closest?.('[class*="col-"]');
            if (!col) return;
            col.className = `col-md-${size}`;
        };

        const syncCompensatoryMode = () => {
            const leaveType = createModal.getFieldValue('leave_type');
            const isCompensatory = isCompensatoryLeave(leaveType);
            if (endInput) {
                endInput.disabled = isCompensatory;
                endInput.style.opacity = isCompensatory ? '0.75' : '';
            }
            if (endFieldGroup) {
                endFieldGroup.style.opacity = isCompensatory ? '0.75' : '';
                endFieldGroup.style.display = isCompensatory ? 'none' : '';
            }
            if (startTimeFieldGroup) {
                startTimeFieldGroup.style.display = isCompensatory ? '' : 'none';
            }
            if (endTimeFieldGroup) {
                endTimeFieldGroup.style.display = isCompensatory ? '' : 'none';
            }

            // Layout: compensatory -> start_date + start_time + end_time side by side.
            // Other types -> start/end dates stacked, time fields hidden.
            setFieldColumnSize(startDateFieldGroup, isCompensatory ? 3 : 12);
            setFieldColumnSize(endFieldGroup, isCompensatory ? 12 : 12);
            setFieldColumnSize(startTimeFieldGroup, isCompensatory ? 4 : 6);
            setFieldColumnSize(endTimeFieldGroup, isCompensatory ? 4 : 6);

            if (isCompensatory) {
                const startDate = startInput?.value || createModal.getFieldValue('start_date');
                if (startDate) createModal.setFieldValue('end_date', startDate);
                if (startTimeInput) startTimeInput.required = true;
                if (endTimeInput) endTimeInput.required = true;
            } else {
                createModal.setFieldValue('start_time', '');
                createModal.setFieldValue('end_time', '');
                if (startTimeInput) startTimeInput.required = false;
                if (endTimeInput) endTimeInput.required = false;
            }
        };

        const trigger = () => schedulePreviewLoad();
        startInput?.addEventListener('input', trigger);
        endInput?.addEventListener('input', trigger);
        startInput?.addEventListener('change', trigger);
        endInput?.addEventListener('change', trigger);
        leaveTypeInput?.addEventListener('dropdown:select', () => {
            syncCompensatoryMode();
            schedulePreviewLoad();
        });
        startInput?.addEventListener('change', () => {
            const leaveType = createModal.getFieldValue('leave_type');
            if (isCompensatoryLeave(leaveType) && startInput?.value) {
                createModal.setFieldValue('end_date', startInput.value);
            }
        });
        syncCompensatoryMode();
    };
    bindPreview();

    createModal.onSaveCallback(async (formData) => {
        try {
            if (!formData?.leave_type || !formData?.start_date || !formData?.end_date) {
                showNotification('İzin türü ve tarih aralığı zorunludur.', 'warning');
                return;
            }

            if (formData.end_date < formData.start_date) {
                showNotification('Bitiş tarihi başlangıç tarihinden önce olamaz.', 'warning');
                return;
            }

            const payload = {
                leave_type: formData.leave_type,
                start_date: formData.start_date,
                end_date: formData.end_date,
                reason: formData.reason || ''
            };
            if (isCompensatoryLeave(payload.leave_type)) {
                payload.end_date = payload.start_date;
                payload.start_time = formData.start_time || '';
                payload.end_time = formData.end_time || '';
                if (!payload.start_time || !payload.end_time) {
                    showNotification('Mazeret izni için başlangıç ve bitiş saati zorunludur.', 'warning');
                    return;
                }
                if (payload.end_time <= payload.start_time) {
                    showNotification('Bitiş saati başlangıç saatinden sonra olmalıdır.', 'warning');
                    return;
                }
            }

            await createVacationRequest(payload);
            createModal.hide();
            showNotification('İzin talebi oluşturuldu.', 'success');
            currentPage = 1;
            await Promise.all([loadRequests(), attendanceCalendarInitialized ? attendanceCalendar?.refresh?.() : Promise.resolve(), loadMyVacationSummary()]);
        } catch (error) {
            showNotification(error?.message || 'Talep oluşturulamadı.', 'error');
        }
    });
}

function updatePreviewBox(payload, errorMessage = '') {
    const box = document.getElementById('vacation-preview-box');
    if (!box) return;
    if (errorMessage) {
        box.innerHTML = `
            <div class="alert alert-danger py-2 px-3 mb-0 small">
                <i class="fas fa-triangle-exclamation me-2"></i>${errorMessage}
            </div>
        `;
        return;
    }
    if (!payload) {
        box.innerHTML = `
            <div class="alert alert-light border py-2 px-3 mb-0 small text-muted">
                <i class="fas fa-calendar-day me-2"></i>Tarih aralığı seçtiğinizde iş günü önizlemesi burada gösterilir.
            </div>
        `;
        return;
    }
    const excluded = Array.isArray(payload.excluded) ? payload.excluded : [];
    const startDateText = formatDateWithWeekday(payload.start_date);
    const endDateText = formatDateWithWeekday(payload.end_date);
    const isCompensatory = Boolean(payload.is_compensatory);

    box.innerHTML = `
        <div class="border rounded-3 p-3 bg-light-subtle">
            <div class="mb-3">
                <div class="d-inline-flex align-items-center gap-2 px-3 py-2 rounded-3 border" style="background:#eef4ff;color:#0d3b8a;border-color:#cfe0ff;">
                    <span style="font-size:1.05rem; font-weight:800; line-height:1;">${payload.duration_days ?? 0}</span>
                    <span style="font-size:0.86rem; font-weight:600;">iş günü</span>
                </div>
            </div>
            <div class="small mb-2">
                <i class="fas fa-calendar-alt me-1 text-secondary"></i>
                <strong>Tarih Aralığı:</strong> ${startDateText} - ${endDateText}
            </div>
            ${isCompensatory
                ? `<div class="small text-muted">Mazeret izni bakiye düşümüne dahil değildir, önizleme hesaplaması yapılmaz.</div>`
                : `
                    <div class="small mb-1"><strong>Hariç Tutulan Günler:</strong></div>
                    ${excluded.length
                        ? `<ul class="mb-0 ps-3 small text-muted">
                            ${excluded.map(item => {
                                const reasonText = item.name || previewReasonLabel(item.reason);
                                const extra = item.reason === 'half_day_holiday' ? ' (0.5 gün sayılır)' : '';
                                return `<li>${formatDate(item.date)} - ${reasonText}${extra}</li>`;
                            }).join('')}
                        </ul>`
                        : '<div class="small text-muted">Hariç tutulan gün yok.</div>'}
                `}
        </div>
    `;
}

function schedulePreviewLoad() {
    if (previewTimer) window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(async () => {
        const startDate = createModal?.container?.querySelector('#start_date')?.value || '';
        const endDate = createModal?.container?.querySelector('#end_date')?.value || '';
        const leaveType = createModal?.getFieldValue('leave_type');
        if (!startDate || !endDate) {
            updatePreviewBox(null);
            return;
        }
        if (isCompensatoryLeave(leaveType)) {
            createModal.setFieldValue('end_date', startDate);
            updatePreviewBox({
                start_date: startDate,
                end_date: startDate,
                duration_days: 0,
                excluded: [],
                is_compensatory: true
            });
            return;
        }
        try {
            updatePreviewBox({ duration_days: '...', start_date: startDate, end_date: endDate, excluded: [] });
            const preview = await previewVacationDuration({ start_date: startDate, end_date: endDate });
            updatePreviewBox(preview);
        } catch (error) {
            updatePreviewBox(null, error?.message || 'Önizleme alınamadı.');
        }
    }, 300);
}

function initializeDetailAndCancelModals() {
    detailModal = new DisplayModal('vacation-request-detail-modal-container', {
        title: 'İzin Talebi Detayı',
        icon: 'fas fa-calendar-alt',
        size: 'xl',
        showEditButton: false
    });
    cancelModal = new ConfirmationModal('vacation-request-cancel-modal-container', {
        title: 'İzin Talebi İptali',
        icon: 'fas fa-ban',
        confirmText: 'Evet, İptal Et',
        cancelText: 'Vazgeç',
        confirmButtonClass: 'btn-danger'
    });
}

async function showRequestDetail(requestId) {
    try {
        const request = await fetchVacationRequest(requestId);
        currentRequest = request;
        detailModal.clearData();
        detailModal.addSection({ title: 'Genel', icon: 'fas fa-info-circle', iconColor: 'text-primary' });
        detailModal.addField({ id: 'req-id', name: 'req-id', label: 'Talep No', type: 'text', value: String(request.id || '-'), colSize: 4 });
        detailModal.addField({
            id: 'req-type',
            name: 'req-type',
            label: 'İzin Türü',
            type: 'text',
            value: request.leave_type_label || leaveTypeLabelMap.get(request.leave_type) || request.leave_type || '-',
            colSize: 4
        });
        detailModal.addField({ id: 'req-status', name: 'req-status', label: 'Durum', type: 'text', value: request.status_label || request.status || '-', colSize: 4 });
        detailModal.addField({ id: 'req-start', name: 'req-start', label: 'Başlangıç', type: 'text', value: formatDate(request.start_date), colSize: 4 });
        detailModal.addField({ id: 'req-end', name: 'req-end', label: 'Bitiş', type: 'text', value: formatDate(request.end_date), colSize: 4 });
        detailModal.addField({ id: 'req-duration', name: 'req-duration', label: 'Süre', type: 'text', value: `${request.duration_days || '0'} gün`, colSize: 4 });
        detailModal.addField({
            id: 'req-time-range',
            name: 'req-time-range',
            label: 'Saat Aralığı',
            type: 'text',
            value: request.start_time && request.end_time ? `${formatTime(request.start_time)} - ${formatTime(request.end_time)}` : '-',
            colSize: 4
        });
        detailModal.addField({ id: 'req-reason', name: 'req-reason', label: 'Gerekçe', type: 'text', value: request.reason || '-', colSize: 12 });

        detailModal.addCustomSection({
            title: 'Onay Akışı',
            customContent: `
                <div class="mb-2">${renderApprovalSummary(request)}</div>
                ${Array.isArray(request?.approval?.stage_instances) && request.approval.stage_instances.length
                    ? request.approval.stage_instances.map(stage => `
                        <div class="border rounded p-2 mb-2">
                            <div class="fw-semibold">${stage.name || `Aşama ${stage.order || ''}`}</div>
                            <div class="small text-muted mb-1">Durum: ${stage.is_rejected ? 'Reddedildi' : (stage.is_complete ? 'Tamamlandı' : 'Bekliyor')}</div>
                            ${(Array.isArray(stage.decisions) && stage.decisions.length)
                                ? stage.decisions.map(decision => `
                                    <div class="small">
                                        - ${(decision.approver_detail?.full_name || decision.approver_detail?.username || 'Onaylayan')}
                                        : ${decision.decision === 'reject' ? 'Reddetti' : 'Onayladı'}
                                        ${decision.decided_at ? ` (${formatDate(decision.decided_at)})` : ''}
                                        ${decision.comment ? `<br><span class="text-muted">"${decision.comment}"</span>` : ''}
                                    </div>
                                `).join('')
                                : '<div class="small text-muted">Henüz karar yok.</div>'}
                        </div>
                    `).join('')
                    : '<div class="small text-muted">Onay kaydı bulunamadı.</div>'}
            `
        });

        detailModal.render();
        detailModal.show();
    } catch (error) {
        showNotification(error?.message || 'Talep detayı yüklenemedi.', 'error');
    }
}

function showCancelModal(requestId) {
    const request = currentRequests.find(item => Number(item.id) === Number(requestId));
    if (!request) return;
    cancelModal.show({
        message: `#${request.id} numaralı izin talebi iptal edilsin mi?`,
        details: `
            <div class="small text-muted">
                <div>Tür: ${request.leave_type_label || leaveTypeLabelMap.get(request.leave_type) || '-'}</div>
                <div>Tarih: ${formatDate(request.start_date)} - ${formatDate(request.end_date)}</div>
            </div>
        `,
        onConfirm: async () => {
            try {
                await cancelVacationRequest(request.id);
                showNotification('İzin talebi iptal edildi.', 'success');
                await Promise.all([loadRequests(), attendanceCalendarInitialized ? attendanceCalendar?.refresh?.() : Promise.resolve(), loadMyVacationSummary()]);
            } catch (error) {
                showNotification(error?.message || 'İptal işlemi başarısız.', 'error');
                throw error;
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    await initNavbar();

    new HeaderComponent({
        title: 'İzin Taleplerim',
        subtitle: 'İzin talebi oluşturun, iş günü önizlemesini görün ve taleplerinizi takip edin',
        icon: 'calendar-alt',
        showBackButton: 'block',
        showCreateButton: 'block',
        createButtonText: 'Yeni İzin Talebi',
        onBackClick: () => { window.location.href = '/general/vacation'; },
        onCreateClick: () => {
            const now = new Date();
            const isoDate = now.toISOString().split('T')[0];
            createModal.setFormData({
                leave_type: 'annual_leave',
                start_date: isoDate,
                end_date: isoDate,
                start_time: '',
                end_time: '',
                reason: ''
            });
            updatePreviewBox(null);
            createModal.show();
            const endInput = createModal.container.querySelector('#end_date');
            const endFieldGroup = createModal.container.querySelector('[data-field-id="end_date"]');
            const startTimeFieldGroup = createModal.container.querySelector('[data-field-id="start_time"]');
            const endTimeFieldGroup = createModal.container.querySelector('[data-field-id="end_time"]');
            if (endInput) {
                endInput.disabled = false;
                endInput.style.opacity = '';
            }
            if (endFieldGroup) {
                endFieldGroup.style.opacity = '';
            }
            if (startTimeFieldGroup) {
                startTimeFieldGroup.style.display = 'none';
            }
            if (endTimeFieldGroup) {
                endTimeFieldGroup.style.display = 'none';
            }
            schedulePreviewLoad();
        }
    });

    initializeCreateModal();
    initializeDetailAndCancelModals();
    initializeCalendarModal();
    setupCalendarModalButton();
    await loadMyVacationSummary();

    requestsTable = new TableComponent('requests-table-container', {
        title: 'İzin Talepleri',
        icon: 'fas fa-list',
        iconColor: 'text-primary',
        columns: [
            {
                field: 'leave_type',
                label: 'İzin Türü',
                sortable: true,
                formatter: (v, row) => row.leave_type_label || leaveTypeLabelMap.get(v) || v || '-'
            },
            {
                field: 'date_range',
                label: 'Tarih',
                sortable: true,
                formatter: (v, row) => {
                    if (isCompensatoryLeave(row.leave_type)) {
                        return `${formatDate(row.start_date)}, ${formatTime(row.start_time)} - ${formatTime(row.end_time)}`;
                    }
                    return `${formatDate(row.start_date)} - ${formatDate(row.end_date)}`;
                }
            },
            {
                field: 'duration_days',
                label: 'Süre',
                sortable: true,
                formatter: (v, row) => {
                    if (isCompensatoryLeave(row.leave_type)) {
                        return `${formatTime(row.start_time)} - ${formatTime(row.end_time)}`;
                    }
                    return `${v || 0} gün`;
                }
            },
            {
                field: 'status',
                label: 'Durum',
                sortable: true,
                formatter: (v, row) => getStatusBadge(v, row.status_label)
            },
            {
                field: 'created_at',
                label: 'Oluşturulma',
                sortable: true,
                type: 'date'
            }
        ],
        actions: [
            {
                key: 'detail',
                label: 'Detay',
                icon: 'fas fa-eye',
                class: 'btn-outline-primary',
                onClick: row => showRequestDetail(row.id)
            },
            {
                key: 'cancel',
                label: 'İptal',
                icon: 'fas fa-ban',
                class: 'btn-outline-danger',
                onClick: row => showCancelModal(row.id),
                visible: row => row.status === 'submitted'
            }
        ],
        pagination: true,
        itemsPerPage: 20,
        refreshable: true,
        onRefresh: () => loadRequests(),
        onPageChange: page => {
            currentPage = page;
            loadRequests();
        },
        emptyMessage: 'İzin talebi bulunamadı.',
        emptyIcon: 'fas fa-calendar-times'
    });

    await loadRequests();
});

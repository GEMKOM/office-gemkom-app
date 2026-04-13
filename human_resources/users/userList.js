// HR Users page (mirrors /general/users/)
// Note: kept intentionally similar to general/users/userList.js for consistent UX.

import { initNavbar } from '../../components/navbar.js';
import { ModernDropdown } from '../../components/dropdown/dropdown.js';
import {
    authFetchUsers,
    deleteUser as deleteUserAPI,
    createUser as createUserAPI,
    updateUser as updateUserAPI,
    fetchOccupations,
    fetchUserGroups,
    fetchUserPermissionsDetail,
    addUserToGroup,
    removeUserFromGroup,
    saveUserPermissionOverride,
    deleteUserPermissionOverride
} from '../../apis/users.js';
import { fetchUsersSummary } from '../../apis/summaries.js';
import { HeaderComponent } from '../../components/header/header.js';
import { FiltersComponent } from '../../components/filters/filters.js';
import { TableComponent } from '../../components/table/table.js';
import { DisplayModal } from '../../components/display-modal/display-modal.js';
import { EditModal } from '../../components/edit-modal/edit-modal.js';
import { ConfirmationModal } from '../../components/confirmation-modal/confirmation-modal.js';
import { initRouteProtection } from '../../apis/routeProtection.js';
import { showNotification } from '../../components/notification/notification.js';
import { fetchShiftRules, assignShiftRuleToUser } from '../../apis/human_resources/attendance.js';
import { fetchWageRatesForUser, createWageRate, deleteWageRate, formatCurrency } from '../../apis/hr.js';
import { fetchAttendanceMonthlySummary, createAttendanceHrRecord, patchAttendanceHrRecord } from '../../apis/human_resources/attendance.js';

let attendanceRecordEditModal = null;
let attendanceRecordEditModalBound = false;
let attendanceRecordEditContext = null; // { userId, dateStr, recordId, loadAttendance, parentModalBody }

let wageRateEditModal = null;
let wageRateEditModalBound = false;
let wageRateEditContext = null; // { userId, userDisplay, refreshWages }
let wageDeleteConfirmModal = null;

let permissionOverrideModal = null;
let permissionOverrideModalBound = false;
let permissionOverrideContext = null; // { userId, reload }

const LEAVE_TYPE_OPTIONS = [
    { value: 'annual_leave', label: 'Yıllık İzin' },
    { value: 'sick_leave', label: 'Hastalık İzni' },
    { value: 'maternity_leave', label: 'Doğum İzni' },
    { value: 'paternity_leave', label: 'Babalık İzni' },
    { value: 'bereavement_leave', label: 'Ölüm İzni' },
    { value: 'marriage_leave', label: 'Evlilik İzni' },
    { value: 'public_duty', label: 'Resmi Görev' },
    { value: 'compensatory_leave', label: 'Mazeret İzni' },
    { value: 'business_trip', label: 'Görev Seyahati' },
    { value: 'half_day', label: 'Yarım Gün' },
    { value: 'unpaid_leave', label: 'Ücretsiz İzin' },
    { value: 'unauthorized_absence', label: 'İzinsiz Devamsızlık' }
];

const LEAVE_TYPE_PAID = new Set([
    'annual_leave',
    'sick_leave',
    'maternity_leave',
    'paternity_leave',
    'bereavement_leave',
    'marriage_leave',
    'public_duty',
    'compensatory_leave',
    'business_trip',
    'half_day'
]);

function ensureUserEditTabs(editModal, user) {
    const modalEl = editModal?.modal;
    const container = editModal?.container;
    if (!modalEl || !container) return;

    const form = container.querySelector('#edit-modal-form');
    if (!form) return;

    const existingTabs = container.querySelector('[data-user-edit-tabs="true"]');
    const existingForUser = existingTabs?.getAttribute('data-user-id');
    if (existingTabs) {
        // If the modal is being reused for a different user, teardown and rebuild tabs.
        if (existingForUser && String(existingForUser) !== String(user.id)) {
            const existingForm = existingTabs.querySelector('#edit-modal-form') || container.querySelector('#edit-modal-form');
            if (existingForm) {
                container.insertBefore(existingForm, existingTabs);
            }
            existingTabs.remove();
        } else {
            return;
        }
    }

    const tabsId = `user-edit-tabs-${user.id}`;
    const contentId = `user-edit-tab-content-${user.id}`;

    const tabsWrapper = document.createElement('div');
    tabsWrapper.setAttribute('data-user-edit-tabs', 'true');
    tabsWrapper.setAttribute('data-user-id', String(user.id));
    tabsWrapper.innerHTML = `
        <ul class="nav nav-tabs mb-3" id="${tabsId}" role="tablist">
            <li class="nav-item" role="presentation">
                <button class="nav-link active" data-bs-toggle="tab" data-bs-target="#pane-bilgiler-${user.id}" type="button" role="tab">
                    <i class="fas fa-user me-1"></i>Bilgiler
                </button>
            </li>
            <li class="nav-item" role="presentation">
                <button class="nav-link" data-bs-toggle="tab" data-bs-target="#pane-maaslar-${user.id}" type="button" role="tab">
                    <i class="fas fa-money-bill-wave me-1"></i>Maaşlar
                </button>
            </li>
            <li class="nav-item" role="presentation">
                <button class="nav-link" data-bs-toggle="tab" data-bs-target="#pane-yoklama-${user.id}" type="button" role="tab">
                    <i class="fas fa-calendar-alt me-1"></i>Yoklama Özeti
                </button>
            </li>
            <li class="nav-item" role="presentation">
                <button class="nav-link" data-bs-toggle="tab" data-bs-target="#pane-yetkiler-${user.id}" type="button" role="tab">
                    <i class="fas fa-user-shield me-1"></i>Yetkiler & Gruplar
                </button>
            </li>
        </ul>
        <div class="tab-content" id="${contentId}">
            <div class="tab-pane fade show active" id="pane-bilgiler-${user.id}" role="tabpanel"></div>
            <div class="tab-pane fade" id="pane-maaslar-${user.id}" role="tabpanel">
                <div class="py-2">
                    <div class="d-flex align-items-center justify-content-between mb-2">
                        <div class="fw-semibold">Ücret Geçmişi</div>
                        <button class="btn btn-sm btn-outline-secondary" type="button" data-wages-refresh>
                            <i class="fas fa-sync-alt me-1"></i>Yenile
                        </button>
                    </div>
                    <div class="text-muted small mb-2">Bu sekme sadece görüntüleme amaçlıdır.</div>
                    <div id="wages-box-${user.id}"></div>
                </div>
            </div>
            <div class="tab-pane fade" id="pane-yoklama-${user.id}" role="tabpanel">
                <div class="py-2">
                    <div class="fw-semibold mb-2">Aylık Yoklama Özeti</div>
                    <div class="row g-2 align-items-end mb-3">
                        <div class="col-6 col-md-3">
                            <label class="form-label small mb-1">Yıl</label>
                            <input class="form-control form-control-sm" type="number" id="att-year-${user.id}" min="2000" max="2100" />
                        </div>
                        <div class="col-6 col-md-3">
                            <label class="form-label small mb-1">Ay</label>
                            <select class="form-select form-select-sm" id="att-month-${user.id}">
                                <option value="1">Ocak</option>
                                <option value="2">Şubat</option>
                                <option value="3">Mart</option>
                                <option value="4">Nisan</option>
                                <option value="5">Mayıs</option>
                                <option value="6">Haziran</option>
                                <option value="7">Temmuz</option>
                                <option value="8">Ağustos</option>
                                <option value="9">Eylül</option>
                                <option value="10">Ekim</option>
                                <option value="11">Kasım</option>
                                <option value="12">Aralık</option>
                            </select>
                        </div>
                        <div class="col-12 col-md-3">
                            <button class="btn btn-sm btn-primary w-100" type="button" id="att-fetch-${user.id}">
                                <i class="fas fa-search me-1"></i>Sorgula
                            </button>
                        </div>
                    </div>
                    <div id="att-summary-${user.id}"></div>
                    <div id="att-days-${user.id}" class="mt-3"></div>
                </div>
            </div>
            <div class="tab-pane fade" id="pane-yetkiler-${user.id}" role="tabpanel">
                <div class="py-2">
                    <div class="fw-semibold mb-2">Yetkiler & Gruplar</div>
                    <div id="perm-box-${user.id}"></div>
                </div>
            </div>
        </div>
    `;

    form.parentElement.insertBefore(tabsWrapper, form);
    const paneBilgiler = container.querySelector(`#pane-bilgiler-${user.id}`);
    if (paneBilgiler) paneBilgiler.appendChild(form);

    const today = new Date();
    const yEl = container.querySelector(`#att-year-${user.id}`);
    const mEl = container.querySelector(`#att-month-${user.id}`);
    if (yEl) yEl.value = String(today.getFullYear());
    if (mEl) mEl.value = String(today.getMonth() + 1);

    let wagesLoaded = false;
    let attendanceLoaded = false;
    let permsLoaded = false;
    let lastAttendancePayload = null;

    const toIsoOrNull = (datetimeLocalVal) => {
        const s = (datetimeLocalVal || '').toString().trim();
        if (!s) return null;
        const d = new Date(s);
        if (Number.isNaN(d.getTime())) return null;
        return d.toISOString();
    };

    const timeToIsoForDateOrNull = (dateStr, timeStr) => {
        const d = (dateStr || '').toString().trim();
        const t0 = (timeStr || '').toString().trim();
        if (!d || !t0) return null;
        // Normalize "HH:MM" -> "HH:MM:SS"
        const t = /^\d{2}:\d{2}$/.test(t0) ? `${t0}:00` : t0;
        if (!/^\d{2}:\d{2}:\d{2}$/.test(t)) return null;
        const dt = new Date(`${d}T${t}`);
        if (Number.isNaN(dt.getTime())) return null;
        return dt.toISOString();
    };

    function ensureAttendanceEditModalComponent() {
        if (attendanceRecordEditModal) return attendanceRecordEditModal;

        const containerId = 'attendance-record-edit-modal-container';
        let mount = document.getElementById(containerId);
        if (!mount) {
            mount = document.createElement('div');
            mount.id = containerId;
            document.body.appendChild(mount);
        }

        attendanceRecordEditModal = new EditModal(containerId, {
            title: 'Yoklama Kaydı',
            icon: 'fas fa-calendar-check',
            size: 'lg',
            saveButtonText: 'Kaydet',
            showEditButton: false
        });

        attendanceRecordEditModal.clearAll();
        attendanceRecordEditModal.addSection({ title: 'Kayıt', icon: 'fas fa-edit', iconColor: 'text-primary' });
        attendanceRecordEditModal.addField({
            id: 'att_date',
            name: 'att_date',
            label: 'Tarih',
            type: 'date',
            readonly: true,
            colSize: 4
        });
        attendanceRecordEditModal.addField({
            id: 'day_type',
            name: 'day_type',
            label: 'Gün Türü',
            type: 'dropdown',
            value: 'working',
            options: [
                { value: 'working', label: 'Çalışma Günü' },
                { value: 'weekend', label: 'Hafta Sonu' },
                { value: 'public_holiday', label: 'Resmi Tatil' },
                { value: 'leave', label: 'İzin' }
            ],
            colSize: 4
        });
        attendanceRecordEditModal.addField({
            id: 'leave_type',
            name: 'leave_type',
            label: 'İzin Türü',
            type: 'dropdown',
            value: '',
            options: [{ value: '', label: 'Seçiniz...' }, ...LEAVE_TYPE_OPTIONS],
            colSize: 4
        });
        attendanceRecordEditModal.addField({
            id: 'check_in_time',
            name: 'check_in_time',
            label: 'Giriş',
            type: 'time',
            step: 1,
            colSize: 4
        });
        attendanceRecordEditModal.addField({
            id: 'check_out_time',
            name: 'check_out_time',
            label: 'Çıkış',
            type: 'time',
            step: 1,
            colSize: 4
        });
        attendanceRecordEditModal.render();

        if (!attendanceRecordEditModalBound) {
            attendanceRecordEditModalBound = true;

            const modalEl = attendanceRecordEditModal.modal;
            const toTimeValue = (t) => {
                const s = (t || '').toString().trim();
                if (!s) return '';
                // Accept "HH:MM" or "HH:MM:SS"
                if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
                if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
                return '';
            };

            const inInput = attendanceRecordEditModal.container.querySelector('#check_in_time');
            const outInput = attendanceRecordEditModal.container.querySelector('#check_out_time');
            const dayTypeDropdownEl = attendanceRecordEditModal.container.querySelector('#dropdown-day_type');
            const leaveTypeGroup = attendanceRecordEditModal.container.querySelector('[data-field-id="leave_type"]');
            const inGroup = attendanceRecordEditModal.container.querySelector('[data-field-id="check_in_time"]');
            const outGroup = attendanceRecordEditModal.container.querySelector('[data-field-id="check_out_time"]');

            const setWorkingMode = (isWorking) => {
                if (inInput) inInput.disabled = !isWorking;
                if (outInput) outInput.disabled = !isWorking;
                if (inGroup) inGroup.style.opacity = isWorking ? '' : '0.6';
                if (outGroup) outGroup.style.opacity = isWorking ? '' : '0.6';
            };

            const setLeaveMode = (isLeave) => {
                if (leaveTypeGroup) leaveTypeGroup.style.display = isLeave ? '' : 'none';
            };

            const syncTypeUi = () => {
                const typeVal = attendanceRecordEditModal.getFieldValue('day_type') || 'working';
                const isLeave = String(typeVal) === 'leave';
                const isWorking = String(typeVal) === 'working';
                setLeaveMode(isLeave);
                setWorkingMode(isWorking);
                if (!isLeave) {
                    attendanceRecordEditModal.setFieldValue('leave_type', '');
                }
                if (!isWorking) {
                    attendanceRecordEditModal.setFieldValue('check_in_time', '');
                    attendanceRecordEditModal.setFieldValue('check_out_time', '');
                }
            };

            // Initial state
            syncTypeUi();

            // React when day type changes
            dayTypeDropdownEl?.addEventListener('dropdown:select', () => {
                syncTypeUi();
            });

            const bindDefaultOnFocus = (input) => {
                if (!input) return;
                if (input.getAttribute('data-default-focus-bound') === 'true') return;
                input.setAttribute('data-default-focus-bound', 'true');
                input.addEventListener('focus', () => {
                    if (input.value) return;
                    const def = input.getAttribute('data-default-time') || '';
                    const val = toTimeValue(def);
                    if (val) input.value = val;
                });
            };
            bindDefaultOnFocus(inInput);
            bindDefaultOnFocus(outInput);

            modalEl?.addEventListener('shown.bs.modal', () => {
                // Prevent parent user modal from jumping to top
                const body = attendanceRecordEditContext?.parentModalBody || null;
                const st = attendanceRecordEditContext?.parentModalScrollTop;
                if (body && typeof st === 'number') {
                    setTimeout(() => {
                        body.scrollTop = st;
                    }, 0);
                }
            });

            modalEl?.addEventListener('hidden.bs.modal', () => {
                const body = attendanceRecordEditContext?.parentModalBody || null;
                const st = attendanceRecordEditContext?.parentModalScrollTop;
                if (body && typeof st === 'number') {
                    setTimeout(() => {
                        body.scrollTop = st;
                    }, 0);
                }
            });

            attendanceRecordEditModal.onSaveCallback(async (formData) => {
                const ctx = attendanceRecordEditContext;
                if (!ctx) return;

                const dayType = (attendanceRecordEditModal.getFieldValue('day_type') || 'working').toString();
                const leaveType = (attendanceRecordEditModal.getFieldValue('leave_type') || '').toString();

                const isLeave = dayType === 'leave';
                const isWorking = dayType === 'working';

                const checkInIso = isWorking ? timeToIsoForDateOrNull(ctx.dateStr, formData?.check_in_time) : null;
                const checkOutIso = isWorking ? timeToIsoForDateOrNull(ctx.dateStr, formData?.check_out_time) : null;

                if (isWorking) {
                    if (!checkInIso && !checkOutIso) {
                        showNotification('En az bir alan giriniz (Giriş veya Çıkış).', 'warning');
                        return;
                    }
                }

                if (isLeave) {
                    if (!leaveType) {
                        showNotification('Lütfen izin türü seçiniz.', 'warning');
                        return;
                    }
                }

                try {
                    if (ctx.recordId) {
                        const patch = {};
                        if (isWorking) {
                            if (checkInIso) patch.check_in_time = checkInIso;
                            if (checkOutIso) patch.check_out_time = checkOutIso;
                        }
                        if (isLeave) {
                            patch.leave_type = leaveType;
                            // times should be empty for leave
                            patch.check_in_time = null;
                            patch.check_out_time = null;
                        }
                        await patchAttendanceHrRecord(ctx.recordId, patch);
                        showNotification('Yoklama kaydı güncellendi', 'success');
                    } else {
                        const payload = { user: ctx.userId, date: ctx.dateStr };
                        if (isWorking) {
                            if (checkInIso) payload.check_in_time = checkInIso;
                            if (checkOutIso) payload.check_out_time = checkOutIso;
                        }
                        if (isLeave) {
                            payload.leave_type = leaveType;
                        }
                        await createAttendanceHrRecord(payload);
                        showNotification('Yoklama kaydı oluşturuldu', 'success');
                    }

                    await ctx.loadAttendance();
                    attendanceRecordEditModal.hide();
                } catch (err) {
                    showNotification(`Kaydedilemedi: ${err?.message || err}`, 'error');
                }
            });
        }

        return attendanceRecordEditModal;
    }

    async function renderWages() {
        const box = container.querySelector(`#wages-box-${user.id}`);
        if (!box) return;

        const userDisplay = `${user.first_name || ''} ${user.last_name || ''}`.trim() || (user.username || `#${user.id}`);

        const ensureWageModal = () => {
            if (wageRateEditModal) return wageRateEditModal;

            const containerId = 'wage-rate-edit-modal-container';
            let mount = document.getElementById(containerId);
            if (!mount) {
                mount = document.createElement('div');
                mount.id = containerId;
                document.body.appendChild(mount);
            }

            wageRateEditModal = new EditModal(containerId, {
                title: 'Yeni Ücret Ekle',
                icon: 'fas fa-money-bill-wave',
                size: 'lg',
                saveButtonText: 'Ücret Ekle',
                showEditButton: false
            });

            wageRateEditModal.clearAll();
            wageRateEditModal.addSection({ title: 'Yeni Ücret', icon: 'fas fa-plus-circle', iconColor: 'text-primary' });
            wageRateEditModal.addField({
                id: 'user_display',
                name: 'user_display',
                label: 'Kullanıcı',
                type: 'text',
                readonly: true,
                colSize: 12
            });
            wageRateEditModal.addField({
                id: 'effective_from',
                name: 'effective_from',
                label: 'Geçerlilik Tarihi',
                type: 'date',
                required: true,
                colSize: 6
            });
            wageRateEditModal.addField({
                id: 'base_monthly',
                name: 'base_monthly',
                label: 'Aylık Ücret',
                type: 'number',
                required: true,
                step: 0.01,
                min: 0,
                colSize: 6
            });
            wageRateEditModal.render();

            if (!wageRateEditModalBound) {
                wageRateEditModalBound = true;
                wageRateEditModal.onSaveCallback(async (data) => {
                    const ctx = wageRateEditContext;
                    if (!ctx) return;

                    if (!data?.effective_from) {
                        showNotification('Geçerlilik tarihi gereklidir', 'warning');
                        return;
                    }
                    const amount = Number(data?.base_monthly);
                    if (!Number.isFinite(amount) || amount <= 0) {
                        showNotification('Aylık ücret 0\'dan büyük olmalıdır', 'warning');
                        return;
                    }

                    try {
                        await createWageRate({
                            user: ctx.userId,
                            effective_from: data.effective_from,
                            base_monthly: amount.toFixed(4)
                        });
                        showNotification('Ücret oranı başarıyla kaydedildi', 'success');
                        wageRateEditModal.hide();
                        await ctx.refreshWages();
                    } catch (e) {
                        showNotification(e?.message || 'Ücret kaydedilemedi', 'error');
                    }
                });
            }

            return wageRateEditModal;
        };

        const ensureDeleteConfirm = () => {
            if (wageDeleteConfirmModal) return wageDeleteConfirmModal;
            const containerId = 'wage-delete-confirm-modal-container';
            let mount = document.getElementById(containerId);
            if (!mount) {
                mount = document.createElement('div');
                mount.id = containerId;
                document.body.appendChild(mount);
            }
            wageDeleteConfirmModal = new ConfirmationModal(containerId, {
                title: 'Onay',
                icon: 'fas fa-exclamation-triangle',
                message: 'Bu ücret kaydını silmek istediğinize emin misiniz?',
                confirmText: 'Evet',
                cancelText: 'İptal',
                confirmButtonClass: 'btn-danger'
            });
            return wageDeleteConfirmModal;
        };

        const refreshWages = async () => {
            await renderWages();
        };

        box.innerHTML = '<div class="text-muted"><i class="fas fa-spinner fa-spin me-2"></i>Yükleniyor...</div>';
        try {
            const resp = await fetchWageRatesForUser(user.id);
            const rows = resp?.results || resp || [];

            const sorted = rows
                .slice()
                .sort((a, b) => new Date(b.created_at || b.effective_from || 0) - new Date(a.created_at || a.effective_from || 0));

            const items = sorted.map(r => {
                const date = r.effective_from ? new Date(r.effective_from).toLocaleDateString('tr-TR') : '-';
                const cur = r.currency || 'TRY';
                const amount = r.base_monthly ?? r.base_hourly ?? null;
                const formatted = amount !== null && amount !== undefined && amount !== ''
                    ? formatCurrency(Number(amount), cur)
                    : '-';
                return `
                    <tr>
                        <td>${date}</td>
                        <td>${formatted}</td>
                        <td class="text-end">
                            <button type="button" class="btn btn-sm btn-outline-danger wage-delete-btn" data-wage-id="${r.id}">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');

            box.innerHTML = `
                <div class="d-flex align-items-center justify-content-between mb-2">
                    <div class="fw-semibold">Ücret Geçmişi</div>
                    <button class="btn btn-sm btn-outline-primary wage-add-btn" type="button">
                        <i class="fas fa-plus me-1"></i>Yeni Ücret
                    </button>
                </div>
                ${sorted.length ? `
                    <div class="table-responsive">
                        <table class="table table-sm table-hover mb-0">
                            <thead><tr><th>Tarih</th><th>Ücret</th><th class="text-end">Sil</th></tr></thead>
                            <tbody>${items}</tbody>
                        </table>
                    </div>
                ` : `<div class="text-muted">Ücret kaydı bulunamadı.</div>`}
            `;

            // Bind actions (delegated within box)
            box.onclick = async (ev) => {
                const addBtn = ev.target?.closest?.('.wage-add-btn');
                if (addBtn) {
                    const m = ensureWageModal();
                    wageRateEditContext = { userId: user.id, userDisplay, refreshWages };
                    const today = new Date().toISOString().split('T')[0];
                    m.setFormData({
                        user_display: userDisplay,
                        effective_from: today,
                        base_monthly: ''
                    });
                    m.show();
                    return;
                }

                const delBtn = ev.target?.closest?.('.wage-delete-btn');
                if (delBtn) {
                    const wageId = Number(delBtn.getAttribute('data-wage-id'));
                    if (!wageId) return;
                    const confirm = ensureDeleteConfirm();
                    confirm.show({
                        message: 'Bu ücret kaydını silmek istediğinize emin misiniz?',
                        onConfirm: async () => {
                            try {
                                await deleteWageRate(wageId);
                                showNotification('Ücret kaydı silindi', 'success');
                                await refreshWages();
                            } catch (e) {
                                showNotification(e?.message || 'Ücret kaydı silinemedi', 'error');
                            }
                        }
                    });
                }
            };
        } catch (e) {
            box.innerHTML = `<div class="text-danger">Ücretler yüklenemedi: ${e.message || e}</div>`;
        }
    }

    function renderAttendance(summary) {
        const summaryEl = container.querySelector(`#att-summary-${user.id}`);
        const daysEl = container.querySelector(`#att-days-${user.id}`);
        if (!summaryEl || !daysEl) return;

        lastAttendancePayload = summary || null;

        const shift = summary?.shift_rule || null;
        const thresholdMin = Number(shift?.overtime_threshold_minutes ?? 0) || 0;

        const weekdayTr = (w) => {
            const s = (w || '').toString().toLowerCase();
            const map = {
                monday: 'Pazartesi',
                tuesday: 'Salı',
                wednesday: 'Çarşamba',
                thursday: 'Perşembe',
                friday: 'Cuma',
                saturday: 'Cumartesi',
                sunday: 'Pazar'
            };
            return map[s] || (w || '-');
        };

        const dayTypeTr = (t) => {
            const s = (t || '').toString();
            const map = {
                working: 'Çalışma Günü',
                weekend: 'Hafta Sonu',
                public_holiday: 'Resmi Tatil',
                company_holiday: 'Şirket Tatili',
                leave: 'İzin'
            };
            return map[s] || s || '-';
        };

        const parseNum = (v) => {
            if (v === undefined || v === null || v === '') return 0;
            const n = Number(v);
            return Number.isFinite(n) ? n : 0;
        };

        const timeHM = (v) => {
            if (!v) return '-';
            const d = new Date(v);
            if (Number.isNaN(d.getTime())) {
                const s = String(v);
                const m = s.match(/\b(\d{2}:\d{2}:\d{2})\b/) || s.match(/\b(\d{2}:\d{2})\b/);
                return m ? m[1] : s;
            }
            return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        };

        const flagTr = (f) => {
            const s = (f || '').toString();
            const map = {
                absent: 'Gelmedi',
                late: 'Geç Geldi',
                missing_checkout: 'Çıkış Eksik'
            };
            return map[s] || s || '-';
        };

        const s = summary?.summary || {};
        summaryEl.innerHTML = `
            <div class="row g-2">
                <div class="col-6 col-md-3"><div class="p-2 border rounded small"><div class="text-muted">Çalışma Günü</div><div class="fw-semibold">${s.total_working_days ?? '-'}</div></div></div>
                <div class="col-6 col-md-3"><div class="p-2 border rounded small"><div class="text-muted">Geldi</div><div class="fw-semibold">${s.total_present ?? '-'}</div></div></div>
                <div class="col-6 col-md-3"><div class="p-2 border rounded small"><div class="text-muted">Gelmedi</div><div class="fw-semibold">${s.total_absent ?? '-'}</div></div></div>
                <div class="col-6 col-md-3"><div class="p-2 border rounded small"><div class="text-muted">Fazla Mesai (s)</div><div class="fw-semibold">${s.total_overtime_hours ?? '-'}</div></div></div>
            </div>
        `;

        const days = Array.isArray(summary?.days) ? summary.days : [];
        if (!days.length) {
            daysEl.innerHTML = '<div class="text-muted">Gün bulunamadı.</div>';
            return;
        }
        const rows = days.map(d => {
            const rec = d.record || null;
            const leaveType = rec?.leave_type || d.leave_type || '';
            const leaveDisplay = rec?.leave_type_display || d.leave_type_display || '';
            const isPaidLeave = rec?.is_paid_leave ?? (leaveType ? LEAVE_TYPE_PAID.has(String(leaveType)) : null);

            let flag = '-';
            if (String(d.day_type) === 'leave') {
                const label = leaveDisplay || (LEAVE_TYPE_OPTIONS.find(o => o.value === leaveType)?.label) || 'İzin';
                const badgeClass = isPaidLeave === false ? 'status-grey' : 'status-green';
                flag = `<span class="status-badge ${badgeClass}">${label}</span>`;
            } else if (d.flag) {
                flag = `<span class="status-badge status-red">${flagTr(d.flag)}</span>`;
            }
            const inTime = rec ? timeHM(rec.check_in_time || rec.check_in_at || rec.check_in) : '-';
            const outTime = rec ? timeHM(rec.check_out_time || rec.check_out_at || rec.check_out) : '-';

            let rowClass = '';
            if (rec && thresholdMin > 0) {
                const overtimeHours = parseNum(rec.overtime_hours);
                const overtimeMin = overtimeHours * 60;
                const lateMin = parseNum(rec.late_minutes);
                const earlyLeaveMin = parseNum(rec.early_leave_minutes);

                const isOvertime = overtimeMin >= thresholdMin && overtimeMin > 0;
                const isUndertime = (lateMin >= thresholdMin && lateMin > 0) || (earlyLeaveMin >= thresholdMin && earlyLeaveMin > 0);

                if (isOvertime) rowClass = 'attendance-overtime-row';
                else if (isUndertime) rowClass = 'attendance-undertime-row';
            }

            const btnLabel = rec ? 'Düzenle' : 'Ekle';
            const btnClass = rec ? 'btn-outline-primary' : 'btn-outline-success';
            const recId = rec?.id ?? '';

            return `<tr class="${rowClass}">
                <td>${d.date || '-'}</td>
                <td>${weekdayTr(d.weekday)}</td>
                <td>${dayTypeTr(d.day_type)}</td>
                <td>${d.holiday_name || '-'}</td>
                <td>${flag}</td>
                <td>${inTime}</td>
                <td>${outTime}</td>
                <td class="text-end">
                    <button
                        type="button"
                        class="btn btn-sm ${btnClass} att-row-edit-btn"
                        data-att-date="${d.date || ''}"
                        data-att-record-id="${recId}"
                    >
                        <i class="fas fa-edit me-1"></i>${btnLabel}
                    </button>
                </td>
                </tr>`;
        }).join('');

        daysEl.innerHTML = `
            <div class="table-responsive">
                <table class="table table-sm table-hover">
                    <thead>
                        <tr>
                            <th>Tarih</th><th>Gün</th><th>Gün Türü</th><th>Tatil</th><th>Durum Notu</th><th>Giriş</th><th>Çıkış</th><th class="text-end">İşlem</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    }

    async function loadAttendance() {
        const y = Number(container.querySelector(`#att-year-${user.id}`)?.value);
        const m = Number(container.querySelector(`#att-month-${user.id}`)?.value);
        const daysEl = container.querySelector(`#att-days-${user.id}`);
        if (daysEl) daysEl.innerHTML = '<div class="text-muted"><i class="fas fa-spinner fa-spin me-2"></i>Yükleniyor...</div>';
        try {
            const resp = await fetchAttendanceMonthlySummary({ user_id: user.id, year: y, month: m });
            renderAttendance(resp);
        } catch (e) {
            if (daysEl) daysEl.innerHTML = `<div class="text-danger">Yoklama özeti yüklenemedi: ${e.message || e}</div>`;
        }
    }

    function ensurePermissionOverrideModal() {
        if (permissionOverrideModal) return permissionOverrideModal;

        const containerId = 'permission-override-modal-inline-container';
        let mount = document.getElementById(containerId);
        if (!mount) {
            mount = document.createElement('div');
            mount.id = containerId;
            document.body.appendChild(mount);
        }

        permissionOverrideModal = new EditModal(containerId, {
            title: 'Yetki Geçersiz Kılma',
            icon: 'fas fa-user-shield',
            size: 'lg',
            showEditButton: false,
            saveButtonText: 'Kaydet'
        });

        permissionOverrideModal.clearAll();
        permissionOverrideModal.addSection({ title: 'Geçersiz Kılma', icon: 'fas fa-user-shield', iconColor: 'text-primary' });
        permissionOverrideModal.addField({
            id: 'codename',
            name: 'codename',
            label: 'Yetki Kodu',
            type: 'text',
            readonly: true,
            colSize: 12
        });
        permissionOverrideModal.addField({
            id: 'granted',
            name: 'granted',
            label: 'Durum',
            type: 'dropdown',
            value: 'true',
            options: [
                { value: 'true', label: 'Erişim Ver (grant)' },
                { value: 'false', label: 'Erişimi Engelle (deny)' }
            ],
            colSize: 12
        });
        permissionOverrideModal.addField({
            id: 'reason',
            name: 'reason',
            label: 'Sebep (opsiyonel)',
            type: 'textarea',
            value: '',
            rows: 3,
            colSize: 12
        });
        permissionOverrideModal.render();

        if (!permissionOverrideModalBound) {
            permissionOverrideModalBound = true;
            permissionOverrideModal.onSaveCallback(async (data) => {
                const ctx = permissionOverrideContext;
                if (!ctx) return;
                const codename = (data?.codename || '').toString();
                if (!codename) return;
                try {
                    await saveUserPermissionOverride(ctx.userId, {
                        codename,
                        granted: String(data?.granted) === 'true',
                        reason: data?.reason || ''
                    });
                    showNotification('Geçersiz kılma kaydedildi', 'success');
                    permissionOverrideModal.hide();
                    await ctx.reload();
                } catch (e) {
                    showNotification(e?.message || 'Geçersiz kılma kaydedilemedi', 'error');
                }
            });
        }

        return permissionOverrideModal;
    }

    function boolIcon(val) {
        if (val) return '<span class="status-badge status-green"><i class="fas fa-check"></i></span>';
        return '<span class="status-badge status-red"><i class="fas fa-times"></i></span>';
    }

    function formatPermSourceBadge(source, detail) {
        const d = detail ? `<span class="text-muted ms-1">${detail}</span>` : '';
        switch (source) {
            case 'superuser':
                return `<span class="badge bg-danger">Süper kullanıcı</span>${d}`;
            case 'override':
                return `<span class="badge bg-warning text-dark">Bireysel</span>${d}`;
            case 'group':
                return `<span class="badge bg-primary">Grup</span>${d}`;
            case 'legacy':
                return `<span class="badge bg-secondary">Eski</span>${d}`;
            case 'none':
            default:
                return `<span class="badge bg-secondary">Yok</span>`;
        }
    }

    async function loadPermissionsAndGroups() {
        const box = container.querySelector(`#perm-box-${user.id}`);
        if (!box) return;
        box.innerHTML = '<div class="text-muted"><i class="fas fa-spinner fa-spin me-2"></i>Yükleniyor...</div>';

        let groupsAll = [];
        try {
            const g = await fetchUserGroups();
            groupsAll = Array.isArray(g) ? g : (g?.results || g?.data || []);
        } catch {
            groupsAll = [];
        }

        const reload = async () => {
            await loadPermissionsAndGroups();
        };

        try {
            const detail = await fetchUserPermissionsDetail(user.id);
            const u = detail?.user || {};
            const groups = Array.isArray(detail?.groups) ? detail.groups : [];
            const eff = detail?.effective_permissions || {};
            const overrides = Array.isArray(detail?.overrides) ? detail.overrides : [];

            const officePerm = eff?.office_access || { value: false, source: 'none', source_detail: '' };
            const workshopPerm = eff?.workshop_access || { value: false, source: 'none', source_detail: '' };
            const hasOfficeAccess = officePerm.value === true;
            const hasWorkshopAccess = workshopPerm.value === true;

            const groupChips = (groups || []).map(g => `
                <span class="badge bg-secondary me-1 mb-1">
                    ${g.display_name || g.name}
                    <button type="button"
                            class="btn btn-sm btn-link text-light p-0 ms-1 perm-remove-group-btn"
                            data-group-name="${g.name}">
                        <i class="fas fa-times"></i>
                    </button>
                </span>
            `).join('') || '<span class="text-muted">Bu kullanıcı hiçbir grupta değil.</span>';

            const groupOptions = (groupsAll || [])
                .map(g => `<option value="${g.name}">${g.display_name || g.name}</option>`)
                .join('');

            const codes = Object.keys(eff || {}).sort((a, b) => a.localeCompare(b, 'tr'));
            const permsRows = codes.map(code => {
                const p = eff?.[code] || { value: false, source: 'none', source_detail: '' };
                const value = p.value === true;
                const sourceBadge = u.is_superuser
                    ? formatPermSourceBadge('superuser', '')
                    : formatPermSourceBadge(p.source, p.source_detail);
                return `
                    <tr>
                        <td><code>${code}</code></td>
                        <td>${boolIcon(value)}</td>
                        <td>${sourceBadge}</td>
                        <td class="text-end">
                            ${!u.is_superuser ? `
                            <button type="button" class="btn btn-sm btn-outline-secondary perm-override-btn" data-codename="${code}">
                                Geçersiz Kıl
                            </button>` : ''}
                        </td>
                    </tr>
                `;
            }).join('');

            const overridesRows = (overrides || []).map(o => `
                <tr>
                    <td><code>${o.codename}</code></td>
                    <td>${o.granted ? 'İzin' : 'Yasak'}</td>
                    <td>${o.reason || '-'}</td>
                    <td class="text-end">
                        <button type="button" class="btn btn-sm btn-outline-danger perm-remove-override-btn" data-codename="${o.codename}">
                            Sil
                        </button>
                    </td>
                </tr>
            `).join('') || `
                <tr><td colspan="4" class="text-muted">Bireysel geçersiz kılma yok.</td></tr>
            `;

            box.innerHTML = `
                <h6 class="mb-2">Gruplar</h6>
                <div class="mb-2">${groupChips}</div>
                <div class="d-flex mb-3 gap-2">
                    <select class="form-select form-select-sm" id="perm-add-group-select-${user.id}">
                        <option value="">Grup seçin...</option>
                        ${groupOptions}
                    </select>
                    <button type="button" class="btn btn-sm btn-outline-primary" id="perm-add-group-btn-${user.id}">
                        Ekle
                    </button>
                </div>

                <h6 class="mt-3">Portal Erişimi</h6>
                <div class="d-flex flex-wrap gap-2 mb-3">
                    <button type="button"
                            class="btn btn-sm ${hasOfficeAccess ? 'btn-success' : 'btn-outline-secondary'} perm-portal-toggle-btn"
                            data-codename="office_access"
                            data-current="${hasOfficeAccess ? 'true' : 'false'}">
                        <i class="fas fa-building me-1"></i>Ofis: ${hasOfficeAccess ? 'Açık' : 'Kapalı'}
                    </button>
                    <button type="button"
                            class="btn btn-sm ${hasWorkshopAccess ? 'btn-success' : 'btn-outline-secondary'} perm-portal-toggle-btn"
                            data-codename="workshop_access"
                            data-current="${hasWorkshopAccess ? 'true' : 'false'}">
                        <i class="fas fa-industry me-1"></i>Atölye: ${hasWorkshopAccess ? 'Açık' : 'Kapalı'}
                    </button>
                </div>

                <h6 class="mt-3">Yetkiler</h6>
                <div class="table-responsive" style="max-height: 280px; overflow-y: auto;">
                    <table class="table table-sm align-middle mb-0">
                        <thead><tr><th>Kod</th><th>Durum</th><th>Kaynak</th><th></th></tr></thead>
                        <tbody>${permsRows}</tbody>
                    </table>
                </div>

                <h6 class="mt-3">Bireysel Geçersiz Kılmalar</h6>
                <div class="table-responsive" style="max-height: 180px; overflow-y: auto;">
                    <table class="table table-sm align-middle mb-0">
                        <thead><tr><th>Kod</th><th>Durum</th><th>Sebep</th><th></th></tr></thead>
                        <tbody>${overridesRows}</tbody>
                    </table>
                </div>
            `;

            // Handlers
            box.querySelector(`#perm-add-group-btn-${user.id}`)?.addEventListener('click', async () => {
                const sel = box.querySelector(`#perm-add-group-select-${user.id}`);
                const groupName = sel?.value || '';
                if (!groupName) return;
                try {
                    await addUserToGroup(user.id, groupName);
                    showNotification('Kullanıcı gruba eklendi', 'success');
                    await reload();
                } catch (e) {
                    showNotification(e?.message || 'Grup eklenemedi', 'error');
                }
            });

            box.querySelectorAll('.perm-remove-group-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const groupName = btn.getAttribute('data-group-name');
                    if (!groupName) return;
                    try {
                        await removeUserFromGroup(user.id, groupName);
                        showNotification('Kullanıcı gruptan çıkarıldı', 'success');
                        await reload();
                    } catch (e) {
                        showNotification(e?.message || 'Grup kaldırılamadı', 'error');
                    }
                });
            });

            box.querySelectorAll('.perm-portal-toggle-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const codename = btn.getAttribute('data-codename');
                    if (!codename) return;
                    const current = btn.getAttribute('data-current') === 'true';
                    const nextGranted = !current;
                    try {
                        await saveUserPermissionOverride(user.id, {
                            codename,
                            granted: nextGranted,
                            reason: ''
                        });
                        showNotification('Portal erişimi güncellendi', 'success');
                        await reload();
                    } catch (e) {
                        showNotification(e?.message || 'Portal erişimi güncellenemedi', 'error');
                    }
                });
            });

            box.querySelectorAll('.perm-override-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const codename = btn.getAttribute('data-codename');
                    if (!codename) return;
                    const modal = ensurePermissionOverrideModal();
                    permissionOverrideContext = { userId: user.id, reload };
                    modal.setFormData({ codename, granted: 'true', reason: '' });
                    modal.show();
                });
            });

            box.querySelectorAll('.perm-remove-override-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const codename = btn.getAttribute('data-codename');
                    if (!codename) return;
                    try {
                        await deleteUserPermissionOverride(user.id, codename);
                        showNotification('Geçersiz kılma kaldırıldı', 'success');
                        await reload();
                    } catch (e) {
                        showNotification(e?.message || 'Geçersiz kılma silinemedi', 'error');
                    }
                });
            });
        } catch (e) {
            box.innerHTML = `<div class="text-danger">Yüklenemedi: ${e?.message || e}</div>`;
        }
    }

    // Row edit/create actions (HR)
    container.querySelector(`#att-days-${user.id}`)?.addEventListener('click', async (e) => {
        const btn = e.target?.closest?.('.att-row-edit-btn');
        if (!btn) return;

        const dateStr = btn.getAttribute('data-att-date') || '';
        if (!dateStr) return;

        const recordIdStr = btn.getAttribute('data-att-record-id') || '';
        const recordId = recordIdStr ? Number(recordIdStr) : null;

        const day = (lastAttendancePayload?.days || []).find(x => String(x?.date) === String(dateStr));
        const rec = day?.record || null;

        const toLocalInput = (v) => {
            if (!v) return '';
            const d = new Date(v);
            if (Number.isNaN(d.getTime())) return '';
            const pad = (n) => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        };

        const toLocalTimeOnly = (v) => {
            if (!v) return '';
            const d = new Date(v);
            if (Number.isNaN(d.getTime())) return '';
            const pad = (n) => String(n).padStart(2, '0');
            return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        };

        const parentModalBody = modalEl.querySelector('.modal-body');
        const parentScrollTop = parentModalBody ? parentModalBody.scrollTop : 0;

        const modalComp = ensureAttendanceEditModalComponent();
        if (!modalComp) return;

        attendanceRecordEditContext = {
            userId: user.id,
            dateStr,
            recordId: recordId || (rec?.id ?? null),
            loadAttendance,
            parentModalBody,
            parentModalScrollTop: parentScrollTop
        };

        modalComp.setFieldValue('att_date', dateStr);

        const shiftStart = lastAttendancePayload?.shift_rule?.expected_start || '';
        const shiftEnd = lastAttendancePayload?.shift_rule?.expected_end || '';
        const inInput = modalComp.container?.querySelector?.('#check_in_time');
        const outInput = modalComp.container?.querySelector?.('#check_out_time');
        if (inInput) inInput.setAttribute('data-default-time', shiftStart);
        if (outInput) outInput.setAttribute('data-default-time', shiftEnd);

        // For "Ekle" keep empty, but auto-fill on first focus using shift rule defaults
        modalComp.setFieldValue('check_in_time', rec ? toLocalTimeOnly(rec.check_in_time || rec.check_in_at || rec.check_in) : '');
        modalComp.setFieldValue('check_out_time', rec ? toLocalTimeOnly(rec.check_out_time || rec.check_out_at || rec.check_out) : '');
        modalComp.show();

        // Restore parent scroll after nested modal triggers focus changes
        if (parentModalBody) {
            setTimeout(() => {
                parentModalBody.scrollTop = parentScrollTop;
            }, 0);
        }
    });

    const tabButtons = container.querySelectorAll(`#${tabsId} [data-bs-toggle="tab"]`);
    tabButtons.forEach(btn => {
        btn.addEventListener('shown.bs.tab', async (e) => {
            const target = e.target?.getAttribute('data-bs-target') || '';
            if (target.includes(`pane-maaslar-${user.id}`) && !wagesLoaded) {
                wagesLoaded = true;
                await renderWages();
            }
            if (target.includes(`pane-yoklama-${user.id}`) && !attendanceLoaded) {
                attendanceLoaded = true;
                await loadAttendance();
            }
            if (target.includes(`pane-yetkiler-${user.id}`) && !permsLoaded) {
                permsLoaded = true;
                await loadPermissionsAndGroups();
            }
        });
    });

    container.querySelector(`[data-wages-refresh]`)?.addEventListener('click', () => renderWages());
    container.querySelector(`#att-fetch-${user.id}`)?.addEventListener('click', () => loadAttendance());
}

let currentPage = 1;
let currentSortField = 'username';
let currentSortDirection = 'asc';
let users = [];
let totalUsers = 0;
let isLoading = false;
let userFilters = null;
let occupations = [];
let groups = [];
let usersTable = null;
let shiftRules = [];

let createUserModal = null;
let editUserModal = null;
let deleteUserModal = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!initRouteProtection()) return;

    await initNavbar();

    // Load shift rules for assignment dropdown
    try {
        const data = await fetchShiftRules();
        shiftRules = (Array.isArray(data) ? data : (data?.results || [])).filter(r => r && r.is_active !== false);
    } catch (e) {
        console.warn('Failed to load shift rules:', e);
        shiftRules = [];
    }

    new HeaderComponent({
        title: 'Çalışanlar',
        subtitle: 'Çalışan listesi ve yönetimi',
        icon: 'users',
        showBackButton: 'block',
        showCreateButton: 'block',
        showBulkCreateButton: 'none',
        createButtonText: 'Yeni Çalışan',
        onBackClick: () => window.location.href = '/human_resources/',
        onCreateClick: () => showCreateUserModal()
    });

    await initializeUsers();
    setupEventListeners();
});

async function initializeUsers() {
    try {
        initializeFiltersComponent();
        initializeTableComponent();
        initializeModalComponents();

        await loadGroups();
        await loadOccupations();
        updateOccupationFilterOptions();
        updateGroupFilterOptions();

        await loadUsers();
        updateUserCounts();
    } catch (error) {
        console.error('Error initializing users:', error);
        showNotification('Çalışanlar yüklenirken hata oluştu', 'error');
    }
}

function initializeFiltersComponent() {
    userFilters = new FiltersComponent('filters-placeholder', {
        title: 'Filtreler',
        onApply: () => {
            currentPage = 1;
            loadUsers();
        },
        onClear: () => {
            currentPage = 1;
            loadUsers();
        }
    });

    userFilters.addTextFilter({
        id: 'username-filter',
        label: 'Kullanıcı Adı',
        placeholder: 'Ara...',
        colSize: 3
    });

    userFilters.addDropdownFilter({
        id: 'group-filter',
        label: 'Grup',
        options: [{ value: '', label: 'Tüm Gruplar' }],
        multiple: true,
        colSize: 3
    });

    userFilters.addDropdownFilter({
        id: 'access-filter',
        label: 'Erişim',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'office', label: 'Ofis' },
            { value: 'workshop', label: 'Atölye' }
        ],
        placeholder: 'Tümü',
        colSize: 3
    });

    userFilters.addDropdownFilter({
        id: 'occupation-filter',
        label: 'Görev',
        options: [{ value: '', label: 'Tüm Görevler' }],
        placeholder: 'Tüm Görevler',
        colSize: 3
    });

    userFilters.addDropdownFilter({
        id: 'is-active-filter',
        label: 'Durum',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'true', label: 'Aktif' },
            { value: 'false', label: 'Pasif' }
        ],
        placeholder: 'Tümü',
        colSize: 3
    });
}

function initializeTableComponent() {
    usersTable = new TableComponent('users-table-container', {
        title: 'Çalışan Listesi',
        columns: [
            { field: 'id', label: 'ID', sortable: true, formatter: (v) => v || '-' },
            { field: 'username', label: 'Kullanıcı Adı', sortable: true, formatter: (v) => `<strong>${v || '-'}</strong>` },
            { field: 'first_name', label: 'Ad', sortable: true, formatter: (v) => v || '-' },
            { field: 'last_name', label: 'Soyad', sortable: true, formatter: (v) => v || '-' },
            { field: 'email', label: 'E-posta', sortable: true, formatter: (v) => v || '-' },
            { field: 'occupation_label', label: 'Görev', sortable: true, formatter: (v) => v || '-' },
            {
                field: 'groups',
                label: 'Gruplar',
                sortable: false,
                formatter: (v, row) => {
                    const arr = Array.isArray(row.groups) ? row.groups : (Array.isArray(v) ? v : []);
                    if (!arr.length) return '-';
                    const labels = arr.map(code => {
                        const g = (groups || []).find(x => x?.name === code || x?.value === code);
                        return g?.display_name || g?.label || g?.name || code;
                    });
                    return labels.join(', ');
                }
            },
            {
                field: 'is_active',
                label: 'Durum',
                sortable: true,
                formatter: (v) => v ? '<span class="status-badge status-green">Aktif</span>' : '<span class="status-badge status-red">Pasif</span>'
            }
        ],
        actions: [
            { key: 'edit', label: 'Düzenle', icon: 'fas fa-edit', class: 'btn-outline-primary', onClick: (row) => window.editUser(row.id) },
            { key: 'delete', label: 'Sil', icon: 'fas fa-trash', class: 'btn-outline-danger', onClick: (row) => window.deleteUser(row.id, row.username) }
        ],
        pagination: true,
        itemsPerPage: 20,
        currentPage,
        totalItems: totalUsers,
        serverSidePagination: true,
        skeleton: true,
        onPageChange: (page) => {
            currentPage = page;
            loadUsers();
        },
        onSort: (field, direction) => {
            currentSortField = field;
            currentSortDirection = direction;
            currentPage = 1;
            loadUsers();
        },
        refreshable: true,
        onRefresh: () => loadUsers(),
        exportable: true,
        onExport: () => exportUsers('excel')
    });
}

function initializeModalComponents() {
    createUserModal = new EditModal('create-user-modal-container', {
        title: 'Yeni Çalışan Oluştur',
        icon: 'fas fa-plus-circle',
        size: 'lg',
        showEditButton: false
    });

    editUserModal = new EditModal('edit-user-modal-container', {
        title: 'Çalışan Düzenle',
        icon: 'fas fa-edit',
        size: 'xl',
        showEditButton: false
    });

    deleteUserModal = new DisplayModal('delete-user-modal-container', {
        title: 'Çalışan Silme Onayı',
        icon: 'fas fa-exclamation-triangle',
        size: 'md',
        showEditButton: false
    });

    createUserModal.onSaveCallback(async (formData) => {
        await createUser(formData);
    });

    editUserModal.onSaveCallback(async (formData) => {
        await updateUser(formData);
    });

    deleteUserModal.onCloseCallback(() => {
        window.pendingDeleteUserId = null;
    });
}

async function loadGroups() {
    try {
        const data = await fetchUserGroups();
        groups = Array.isArray(data) ? data : (data?.results || data?.data || []);
    } catch (e) {
        console.warn('Failed to load groups:', e);
        groups = [];
    }
}

async function loadOccupations() {
    try {
        const data = await fetchOccupations();
        occupations = Array.isArray(data) ? data : (data?.results || []);
    } catch (e) {
        console.warn('Failed to load occupations:', e);
        occupations = [];
    }
}

function updateOccupationFilterOptions() {
    if (!userFilters) return;
    userFilters.updateFilterOptions('occupation-filter', [
        { value: '', label: 'Tüm Görevler' },
        ...occupations.map(o => ({
            value: o.value || o.code || o.id || o.name,
            label: o.label || o.display_name || o.name
        }))
    ]);
}

function updateGroupFilterOptions() {
    if (!userFilters) return;
    userFilters.updateFilterOptions('group-filter', [
        { value: '', label: 'Tüm Gruplar' },
        ...groups.map(g => ({
            value: g.value ?? g.name ?? String(g.id ?? g.pk ?? ''),
            label: g.label ?? g.display_name ?? g.name ?? String(g.id ?? g.pk ?? '')
        })).filter(o => o.value)
    ]);
}

async function loadUsers() {
    try {
        if (isLoading) return;
        isLoading = true;
        if (usersTable) usersTable.setLoading(true);

        const filterValues = userFilters ? userFilters.getFilterValues() : {};
        const params = new URLSearchParams();
        params.append('page', currentPage.toString());
        const pageSize = usersTable ? usersTable.options.itemsPerPage : 20;
        params.append('page_size', String(pageSize));

        if (filterValues['username-filter']) params.append('username', filterValues['username-filter']);

        const groupVal = filterValues['group-filter'] || [];
        const group = Array.isArray(groupVal) ? groupVal.filter(Boolean).join(',') : (groupVal || '');
        if (group) params.append('group', group);

        const access = filterValues['access-filter'] || '';
        if (access === 'office') params.append('office_access', 'true');
        if (access === 'workshop') params.append('workshop_access', 'true');

        if (filterValues['occupation-filter']) params.append('occupation', filterValues['occupation-filter']);
        if (filterValues['is-active-filter']) params.append('is_active', filterValues['is-active-filter']);

        const orderingParam = currentSortDirection === 'asc' ? currentSortField : `-${currentSortField}`;
        params.append('ordering', orderingParam);

        const usersResponse = await authFetchUsers(currentPage, pageSize, {
            username: filterValues['username-filter'] || '',
            group,
            office_access: access === 'office' ? 'true' : '',
            workshop_access: access === 'workshop' ? 'true' : '',
            occupation: filterValues['occupation-filter'] || '',
            is_active: filterValues['is-active-filter'] || '',
            ordering: orderingParam
        });

        users = usersResponse.results || [];
        totalUsers = usersResponse.count || 0;

        if (usersTable) {
            usersTable.setLoading(false);
            usersTable.updateData(users, totalUsers, currentPage);
        }

    } catch (e) {
        console.error('Error loading users:', e);
        showNotification('Çalışanlar yüklenemedi', 'error');
        if (usersTable) {
            usersTable.setLoading(false);
            usersTable.updateData([], 0, 1);
        }
    } finally {
        isLoading = false;
    }
}

async function updateUserCounts() {
    // Statistics cards removed on this page.
}

function setupEventListeners() {
    // Table handles most; keep placeholder for parity.
}

function showCreateUserModal() {
    createUserModal.clearAll();
    createUserModal.addSection({ title: 'Temel Bilgiler', icon: 'fas fa-info-circle', iconColor: 'text-primary' });
    createUserModal.addField({ id: 'username', name: 'username', label: 'Kullanıcı Adı', type: 'text', required: true, colSize: 6 });
    createUserModal.addField({ id: 'email', name: 'email', label: 'E-posta', type: 'email', colSize: 6 });
    createUserModal.addField({ id: 'first_name', name: 'first_name', label: 'Ad', type: 'text', required: true, colSize: 6 });
    createUserModal.addField({ id: 'last_name', name: 'last_name', label: 'Soyad', type: 'text', required: true, colSize: 6 });

    createUserModal.addSection({ title: 'Yetkiler & Gruplar', icon: 'fas fa-users-cog', iconColor: 'text-info' });
    const groupOptions = (groups || []).map(g => ({
        value: g.value ?? g.name ?? String(g.id ?? ''),
        label: g.display_name || g.label || g.name || String(g.id ?? '')
    })).filter(o => o.value);
    createUserModal.addField({
        id: 'create_groups',
        name: 'create_groups',
        label: 'Gruplar',
        type: 'dropdown',
        multiple: true,
        searchable: true,
        options: groupOptions,
        value: [],
        colSize: 12
    });

    createUserModal.addSection({ title: 'Maaş', icon: 'fas fa-money-bill-wave', iconColor: 'text-success' });
    const today = new Date().toISOString().split('T')[0];
    createUserModal.addField({ id: 'wage_effective_from', name: 'wage_effective_from', label: 'Geçerlilik Tarihi', type: 'date', value: today, colSize: 6 });
    createUserModal.addField({ id: 'wage_base_monthly', name: 'wage_base_monthly', label: 'Aylık Ücret', type: 'number', step: 0.01, min: 0, colSize: 6 });

    createUserModal.addSection({ title: 'İş Bilgileri', icon: 'fas fa-briefcase', iconColor: 'text-success' });
    createUserModal.addField({ id: 'is_active', name: 'is_active', label: 'Aktif', type: 'checkbox', value: true, colSize: 12 });
    createUserModal.render();
    createUserModal.show();
}

async function createUser(formData) {
    try {
        const {
            create_groups,
            wage_effective_from,
            wage_base_monthly,
            ...userPayload
        } = formData || {};

        const response = await createUserAPI(userPayload);
        if (response.ok) {
            const created = await response.json().catch(() => null);
            const userId = created?.id ?? created?.user?.id ?? null;

            // Group assignments (best effort)
            const groupsToAddRaw = create_groups ?? [];
            const groupsToAdd = Array.isArray(groupsToAddRaw)
                ? groupsToAddRaw.filter(Boolean)
                : (String(groupsToAddRaw).trim() ? [String(groupsToAddRaw).trim()] : []);

            if (userId && groupsToAdd.length) {
                for (const g of groupsToAdd) {
                    try {
                        await addUserToGroup(userId, g);
                    } catch (e) {
                        showNotification(`Grup eklenemedi (${g}): ${e?.message || e}`, 'warning');
                    }
                }
            }

            // Wage create (best effort)
            const amount = wage_base_monthly !== undefined && wage_base_monthly !== null && String(wage_base_monthly).trim() !== ''
                ? Number(wage_base_monthly)
                : null;
            if (userId && wage_effective_from && Number.isFinite(amount) && amount > 0) {
                try {
                    await createWageRate({
                        user: userId,
                        effective_from: wage_effective_from,
                        base_monthly: amount.toFixed(4)
                    });
                } catch (e) {
                    showNotification(`Ücret eklenemedi: ${e?.message || e}`, 'warning');
                }
            }

            showNotification('Çalışan başarıyla oluşturuldu', 'success');
            createUserModal.hide();
            currentPage = 1;
            await loadUsers();
        } else {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Çalışan oluşturulamadı');
        }
    } catch (e) {
        console.error('Error creating user:', e);
        showNotification(e.message || 'Çalışan oluşturulurken hata oluştu', 'error');
    }
}

window.editUser = function(userId) {
    if (!userId) {
        showNotification('Geçersiz çalışan ID', 'error');
        return;
    }
    const user = users.find(u => String(u.id) === String(userId));
    if (!user) {
        showNotification('Çalışan bulunamadı', 'error');
        return;
    }
    window.editingUserId = userId;
    editUserModal.clearAll();

    editUserModal.addSection({ title: 'Temel Bilgiler', icon: 'fas fa-info-circle', iconColor: 'text-primary' });
    editUserModal.addField({ id: 'username', name: 'username', label: 'Kullanıcı Adı', type: 'text', value: user.username || '', required: true, colSize: 6, icon: 'fas fa-user' });
    editUserModal.addField({ id: 'email', name: 'email', label: 'E-posta', type: 'email', value: user.email || '', colSize: 6, icon: 'fas fa-envelope' });
    editUserModal.addField({ id: 'first_name', name: 'first_name', label: 'Ad', type: 'text', value: user.first_name || '', required: true, colSize: 6, icon: 'fas fa-id-card' });
    editUserModal.addField({ id: 'last_name', name: 'last_name', label: 'Soyad', type: 'text', value: user.last_name || '', required: true, colSize: 6, icon: 'fas fa-id-card' });

    editUserModal.addSection({ title: 'İş Bilgileri', icon: 'fas fa-briefcase', iconColor: 'text-success' });

    const currentShiftId = user.shift_rule_id ?? user.shift_rule?.id ?? user.shift_rule ?? '';
    const shiftRuleOptions = [
        { value: '', label: 'Varsayılan (otomatik)' },
        ...shiftRules.map(r => ({
            value: String(r.id),
            label: `${r.name} (${String(r.expected_start || '').slice(0, 5)}-${String(r.expected_end || '').slice(0, 5)})`
        }))
    ];
    editUserModal.addField({
        id: 'shift_rule_id',
        name: 'shift_rule_id',
        label: 'Vardiya Kuralı',
        type: 'dropdown',
        value: currentShiftId ? String(currentShiftId) : '',
        options: shiftRuleOptions,
        placeholder: 'Varsayılan (otomatik)',
        searchable: true,
        icon: 'fas fa-clock',
        colSize: 12
    });

    editUserModal.addField({ id: 'is_active', name: 'is_active', label: 'Aktif', type: 'checkbox', value: user.is_active !== false, colSize: 12, icon: 'fas fa-check-circle' });
    editUserModal.render();
    ensureUserEditTabs(editUserModal, user);
    editUserModal.show();
};

window.deleteUser = function(userId, username) {
    window.pendingDeleteUserId = userId;
    deleteUserModal.clearData();
    deleteUserModal.addSection({
        title: 'Dikkat',
        content: `<div class="alert alert-warning mb-0">"${username}" kullanıcısını silmek istediğinize emin misiniz?</div>`
    });
    deleteUserModal.setFooterButtons([
        { text: 'İptal', class: 'btn-secondary', onClick: () => deleteUserModal.hide() },
        {
            text: 'Sil',
            class: 'btn-danger',
            onClick: async () => {
                try {
                    const resp = await deleteUserAPI(userId);
                    if (resp.ok) {
                        showNotification('Çalışan silindi', 'success');
                        deleteUserModal.hide();
                        window.pendingDeleteUserId = null;
                        await loadUsers();
                    } else {
                        throw new Error('Silme başarısız');
                    }
                } catch (e) {
                    showNotification('Çalışan silinirken hata oluştu', 'error');
                }
            }
        }
    ]);
    deleteUserModal.show();
};

async function updateUser(formData) {
    const userId = window.editingUserId;
    if (!userId) {
        showNotification('Düzenlenecek çalışan bulunamadı', 'error');
        return;
    }
    try {
        const { shift_rule_id, ...userPatch } = formData || {};
        const resp = await updateUserAPI(userId, userPatch);
        if (resp.ok) {
            if (shift_rule_id !== undefined) {
                const idStr = (shift_rule_id ?? '').toString().trim();
                const shiftRuleId = idStr ? Number(idStr) : null;
                try {
                    await assignShiftRuleToUser(Number(userId), shiftRuleId);
                } catch (e) {
                    showNotification(`Vardiya kuralı atanamadı: ${e.message || e}`, 'warning');
                }
            }
            editUserModal.hide();
            window.editingUserId = null;
            await loadUsers();
        } else {
            const errorData = await resp.json();
            throw new Error(errorData.message || 'Çalışan güncellenemedi');
        }
    } catch (e) {
        console.error('Error updating user:', e);
        showNotification(e.message || 'Çalışan güncellenirken hata oluştu', 'error');
    }
}

async function exportUsers() {
    // Simplified: use table export (same UX as general/users)
    if (usersTable) {
        usersTable.exportData('excel');
    }
}


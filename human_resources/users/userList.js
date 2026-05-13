// HR Users page
// Note: kept intentionally similar to general/users/userList.js for consistent UX.

import { initNavbar } from '../../components/navbar.js';
import { ModernDropdown } from '../../components/dropdown/dropdown.js';
import {
    authFetchUsers,
    deleteUser as deleteUserAPI,
    createUser as createUserAPI,
    updateUser as updateUserAPI,
    fetchUserPermissionsDetail,
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
import {
    fetchAttendanceMonthlySummary,
    createAttendanceHrRecord,
    patchAttendanceHrRecord,
    fetchAttendanceHrRecordIntervals,
    createAttendanceHrRecordInterval,
    patchAttendanceHrInterval,
    deleteAttendanceHrInterval
} from '../../apis/human_resources/attendance.js';
import { fetchVacationRequests, fetchUserLeaveSetup, patchUserLeaveSetup } from '../../apis/vacationRequests.js';
import { fetchPositions as fetchOrganizationPositions, assignUserToPosition } from '../../apis/human_resources/organization.js';

/** Çalışan oluşturma / düzenleme formları: kullanıcı adı ve ad-soyad kuralları (Türkçe). */
const HR_USER_FIELD_HELP_TR = {
    username:
        'Türkçe karakter kullanılmaz (ı, ğ, ü, ş, ö, ç, İ vb.). Ad ve soyadın arada boşluk olmadan, tamamı küçük harf birleşik yazımı kullanılır (örnek: Mehmet Ali → mehmetali).',
    first_name: 'Çalışanın gerçek adı: yalnızca ilk harf büyük, diğer harfler küçük (örnek: Mehmet).',
    last_name: 'Çalışanın gerçek soyadı: yalnızca ilk harf büyük, diğer harfler küçük (örnek: Ali).'
};

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

let leaveIntervalsModal = null;
let leaveIntervalEditModal = null;
let leaveIntervalDeleteConfirmModal = null;
let leaveIntervalsContext = null; // { recordId, dateStr, refreshAttendance }

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
    { value: 'paid_leave', label: 'Ücretli İzin' },
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
    'half_day',
    'paid_leave'
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
                const parent = existingTabs.parentNode;
                if (parent) {
                    parent.insertBefore(existingForm, existingTabs);
                }
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
                <button class="nav-link" data-bs-toggle="tab" data-bs-target="#pane-izinler-${user.id}" type="button" role="tab">
                    <i class="fas fa-calendar-check me-1"></i>İzinler
                </button>
            </li>
            <li class="nav-item" role="presentation">
                <button class="nav-link" data-bs-toggle="tab" data-bs-target="#pane-yoklama-${user.id}" type="button" role="tab">
                    <i class="fas fa-calendar-alt me-1"></i>PDKS Özeti
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
            <div class="tab-pane fade" id="pane-izinler-${user.id}" role="tabpanel">
                <div class="py-2">
                    <div class="fw-semibold mb-2">İzin Tanımı</div>
                    <div class="row g-2 align-items-end mb-3">
                        <div class="col-12 col-md-3">
                            <label class="form-label small mb-1">İşe Giriş Tarihi</label>
                            <input type="date" class="form-control form-control-sm" id="leave-hire-date-${user.id}" />
                        </div>
                        <div class="col-12 col-md-3">
                            <label class="form-label small mb-1">Toplam Gün</label>
                            <input type="number" step="0.1" min="0" class="form-control form-control-sm" id="leave-total-days-${user.id}" />
                        </div>
                        <div class="col-12 col-md-2">
                            <button class="btn btn-sm btn-primary w-100" type="button" id="leave-setup-save-${user.id}">
                                <i class="fas fa-save me-1"></i>Kaydet
                            </button>
                        </div>
                        <div class="col-12 col-md-4">
                            <div class="small text-muted mb-1">Özet</div>
                            <div class="d-flex flex-wrap gap-2">
                                <span class="badge bg-light text-dark border">Kullanılan: <strong id="leave-used-days-${user.id}">-</strong></span>
                                <span class="badge bg-light text-dark border">Kalan: <strong id="leave-remaining-days-${user.id}">-</strong></span>
                            </div>
                        </div>
                    </div>
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <div class="fw-semibold">İzin Talep Geçmişi</div>
                        <button class="btn btn-sm btn-outline-secondary" type="button" id="leave-requests-refresh-${user.id}">
                            <i class="fas fa-sync-alt me-1"></i>Yenile
                        </button>
                    </div>
                    <div id="leave-requests-table-${user.id}"></div>
                </div>
            </div>
            <div class="tab-pane fade" id="pane-yoklama-${user.id}" role="tabpanel">
                <div class="py-2">
                    <div class="fw-semibold mb-2">Aylık PDKS Özeti</div>
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
                        <div class="col-12 col-md-3">
                            <button class="btn btn-sm btn-outline-secondary w-100" type="button" id="att-export-${user.id}">
                                <i class="fas fa-download me-1"></i>Excel’e Aktar
                            </button>
                        </div>
                    </div>
                    <div id="att-summary-${user.id}"></div>
                    <div id="att-days-${user.id}" class="mt-3"></div>
                    <div id="att-export-mount-${user.id}" style="display:none;"></div>
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
    let leaveLoaded = false;
    let attendanceLoaded = false;
    let permsLoaded = false;
    let positionDropdown = null;
    let lastAttendancePayload = null;
    let attendanceExportTable = null;

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

    const isoToLocalTimeOnly = (v) => {
        if (!v) return '';
        const d = new Date(v);
        if (Number.isNaN(d.getTime())) return '';
        const pad = (n) => String(n).padStart(2, '0');
        return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };

    const intervalTimeToIsoOrNull = (dateStr, timeStr) => timeToIsoForDateOrNull(dateStr, timeStr);

    function ensureLeaveIntervalsUi() {
        const ensureConfirm = () => {
            if (leaveIntervalDeleteConfirmModal) return leaveIntervalDeleteConfirmModal;
            const id = 'leave-interval-delete-confirm-modal-container';
            let mount = document.getElementById(id);
            if (!mount) {
                mount = document.createElement('div');
                mount.id = id;
                document.body.appendChild(mount);
            }
            leaveIntervalDeleteConfirmModal = new ConfirmationModal(id, {
                title: 'Onay',
                icon: 'fas fa-exclamation-triangle',
                message: 'Bu izin aralığını silmek istediğinize emin misiniz?',
                confirmText: 'Evet',
                cancelText: 'İptal',
                confirmButtonClass: 'btn-danger'
            });
            return leaveIntervalDeleteConfirmModal;
        };

        const ensureListModal = () => {
            if (leaveIntervalsModal) return leaveIntervalsModal;
            const id = 'leave-intervals-modal-container';
            let mount = document.getElementById(id);
            if (!mount) {
                mount = document.createElement('div');
                mount.id = id;
                document.body.appendChild(mount);
            }
            leaveIntervalsModal = new DisplayModal(id, {
                title: 'İzin Aralıkları',
                icon: 'fas fa-person-walking-arrow-right',
                size: 'lg',
                showEditButton: false
            });
            return leaveIntervalsModal;
        };

        const ensureEditModal = () => {
            if (leaveIntervalEditModal) return leaveIntervalEditModal;
            const id = 'leave-interval-edit-modal-container';
            let mount = document.getElementById(id);
            if (!mount) {
                mount = document.createElement('div');
                mount.id = id;
                document.body.appendChild(mount);
            }
            leaveIntervalEditModal = new EditModal(id, {
                title: 'İzin Aralığı',
                icon: 'fas fa-person-walking-arrow-right',
                size: 'lg',
                saveButtonText: 'Kaydet',
                showEditButton: false
            });
            leaveIntervalEditModal.clearAll();
            leaveIntervalEditModal.addSection({ title: 'Aralık', icon: 'fas fa-clock', iconColor: 'text-primary' });
            leaveIntervalEditModal.addField({ id: 'start_time', name: 'start_time', label: 'Başlangıç', type: 'time', step: 1, required: true, colSize: 4 });
            leaveIntervalEditModal.addField({ id: 'end_time', name: 'end_time', label: 'Bitiş', type: 'time', step: 1, required: true, colSize: 4 });
            leaveIntervalEditModal.addField({
                id: 'leave_type',
                name: 'leave_type',
                label: 'İzin Türü',
                type: 'dropdown',
                required: true,
                options: LEAVE_TYPE_OPTIONS,
                colSize: 4
            });
            leaveIntervalEditModal.addField({ id: 'notes', name: 'notes', label: 'Not (opsiyonel)', type: 'textarea', rows: 3, colSize: 12 });
            leaveIntervalEditModal.render();
            return leaveIntervalEditModal;
        };

        const renderList = async () => {
            const ctx = leaveIntervalsContext;
            if (!ctx?.recordId) return;
            const listModal = ensureListModal();
            if (!listModal) return;

            listModal.clearData();
            listModal.addCustomSection({
                title: null,
                customContent: `<div class="text-muted"><i class="fas fa-spinner fa-spin me-2"></i>Yükleniyor...</div>`
            });
            listModal.render();
            listModal.show();

            let intervals = [];
            try {
                const resp = await fetchAttendanceHrRecordIntervals(ctx.recordId);
                intervals = Array.isArray(resp) ? resp : (resp?.results || resp?.data || []);
            } catch (e) {
                listModal.clearData();
                listModal.addCustomSection({ title: null, customContent: `<div class="text-danger">Yüklenemedi: ${e?.message || e}</div>` });
                listModal.render();
                return;
            }

            const rows = (intervals || []).map(it => {
                const s = isoToLocalTimeOnly(it.start_time);
                const e = isoToLocalTimeOnly(it.end_time);
                const label = it.leave_type_display || (LEAVE_TYPE_OPTIONS.find(o => o.value === it.leave_type)?.label) || it.leave_type || '-';
                return `
                    <tr>
                        <td>${s || '-'}</td>
                        <td>${e || '-'}</td>
                        <td>${label}</td>
                        <td>${it.notes || '-'}</td>
                        <td class="text-end">
                            <button type="button" class="btn btn-sm btn-outline-primary li-edit" data-id="${it.id}"><i class="fas fa-edit"></i></button>
                            <button type="button" class="btn btn-sm btn-outline-danger li-del" data-id="${it.id}"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `;
            }).join('');

            const content = `
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <div class="fw-semibold">${ctx.dateStr || ''}</div>
                    <button type="button" class="btn btn-sm btn-outline-success li-add">
                        <i class="fas fa-plus me-1"></i>Yeni Aralık
                    </button>
                </div>
                <div class="table-responsive">
                    <table class="table table-sm table-hover mb-0">
                        <thead><tr><th>Başlangıç</th><th>Bitiş</th><th>Tür</th><th>Not</th><th class="text-end">İşlem</th></tr></thead>
                        <tbody>${rows || `<tr><td colspan="5" class="text-muted">Kayıt yok.</td></tr>`}</tbody>
                    </table>
                </div>
                <div class="text-muted small mt-2">Not: Aralık değişiklikleri geç/erken çıkış hesaplarını otomatik günceller.</div>
            `;

            listModal.clearData();
            listModal.addCustomSection({ title: null, customContent: content });
            listModal.render();

            const root = listModal.container;
            root.onclick = async (ev) => {
                const addBtn = ev.target?.closest?.('.li-add');
                const editBtn = ev.target?.closest?.('.li-edit');
                const delBtn = ev.target?.closest?.('.li-del');

                if (addBtn) {
                    const em = ensureEditModal();
                    em.setFormData({ start_time: '', end_time: '', leave_type: 'paid_leave', notes: '' });
                    em.onSaveCallback(async (data) => {
                        const ctx2 = leaveIntervalsContext;
                        const startIso = intervalTimeToIsoOrNull(ctx2.dateStr, data.start_time);
                        const endIso = intervalTimeToIsoOrNull(ctx2.dateStr, data.end_time);
                        if (!startIso || !endIso) {
                            showNotification('Başlangıç ve bitiş saatleri gereklidir.', 'warning');
                            return;
                        }
                        try {
                            await createAttendanceHrRecordInterval(ctx2.recordId, {
                                start_time: startIso,
                                end_time: endIso,
                                leave_type: data.leave_type,
                                notes: data.notes || ''
                            });
                            em.hide();
                            await renderList();
                            await ctx2.refreshAttendance();
                        } catch (e) {
                            showNotification(e?.message || 'Kaydedilemedi', 'error');
                        }
                    });
                    em.show();
                    return;
                }

                if (editBtn) {
                    const id = Number(editBtn.getAttribute('data-id'));
                    const it = (intervals || []).find(x => Number(x.id) === id);
                    if (!it) return;
                    const em = ensureEditModal();
                    em.setFormData({
                        start_time: isoToLocalTimeOnly(it.start_time),
                        end_time: isoToLocalTimeOnly(it.end_time),
                        leave_type: it.leave_type || 'paid_leave',
                        notes: it.notes || ''
                    });
                    em.onSaveCallback(async (data) => {
                        const ctx2 = leaveIntervalsContext;
                        const startIso = intervalTimeToIsoOrNull(ctx2.dateStr, data.start_time);
                        const endIso = intervalTimeToIsoOrNull(ctx2.dateStr, data.end_time);
                        if (!startIso || !endIso) {
                            showNotification('Başlangıç ve bitiş saatleri gereklidir.', 'warning');
                            return;
                        }
                        try {
                            await patchAttendanceHrInterval(id, {
                                start_time: startIso,
                                end_time: endIso,
                                leave_type: data.leave_type,
                                notes: data.notes || ''
                            });
                            em.hide();
                            await renderList();
                            await ctx2.refreshAttendance();
                        } catch (e) {
                            showNotification(e?.message || 'Güncellenemedi', 'error');
                        }
                    });
                    em.show();
                    return;
                }

                if (delBtn) {
                    const id = Number(delBtn.getAttribute('data-id'));
                    if (!id) return;
                    const conf = ensureConfirm();
                    conf.show({
                        message: 'Bu izin aralığını silmek istediğinize emin misiniz?',
                        onConfirm: async () => {
                            try {
                                await deleteAttendanceHrInterval(id);
                                showNotification('Silindi', 'success');
                                await renderList();
                                const ctx2 = leaveIntervalsContext;
                                await ctx2.refreshAttendance();
                            } catch (e) {
                                showNotification(e?.message || 'Silinemedi', 'error');
                            }
                        }
                    });
                }
            };
        };

        return { open: renderList };
    }

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
            title: 'PDKS Kaydı',
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
        attendanceRecordEditModal.addField({
            id: 'notes',
            name: 'notes',
            label: 'Not (opsiyonel)',
            type: 'textarea',
            value: '',
            rows: 3,
            colSize: 12
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
                const notes = (attendanceRecordEditModal.getFieldValue('notes') || '').toString();

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
                        if (notes) patch.notes = notes;
                        await patchAttendanceHrRecord(ctx.recordId, patch);
                        showNotification('PDKS kaydı güncellendi', 'success');
                    } else {
                        const payload = { user: ctx.userId, date: ctx.dateStr };
                        if (isWorking) {
                            if (checkInIso) payload.check_in_time = checkInIso;
                            if (checkOutIso) payload.check_out_time = checkOutIso;
                        }
                        if (isLeave) {
                            payload.leave_type = leaveType;
                        }
                        if (notes) payload.notes = notes;
                        await createAttendanceHrRecord(payload);
                        showNotification('PDKS kaydı oluşturuldu', 'success');
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

    let leaveRequestsTable = null;

    const parseVacationList = (resp) => {
        if (Array.isArray(resp)) return resp;
        if (Array.isArray(resp?.results)) return resp.results;
        if (Array.isArray(resp?.data)) return resp.data;
        return [];
    };

    const leaveStatusBadge = (status, statusLabel) => {
        const label = statusLabel || status || '-';
        let cls = 'status-grey';
        if (status === 'approved') cls = 'status-green';
        else if (status === 'submitted') cls = 'status-yellow';
        else if (status === 'rejected' || status === 'cancelled') cls = 'status-red';
        return `<span class="status-badge ${cls}">${label}</span>`;
    };

    const leaveApprovalInfo = (request) => {
        const approval = request?.approval;
        if (!approval || request?.status !== 'submitted') return '<span class="text-muted">-</span>';
        const stageInstances = Array.isArray(approval.stage_instances) ? approval.stage_instances : [];
        const currentStage = stageInstances.find(stage => !stage?.is_complete && !stage?.is_rejected);
        if (!currentStage) return '<span class="text-success"><i class="fas fa-check-circle me-1"></i>Tamamlandı</span>';
        const required = Number(currentStage.required_approvals || 0);
        const approved = Number(currentStage.approved_count || 0);
        const remaining = Math.max(0, required - approved);
        return `
            <div style="line-height: 1.2;">
                <div class="fw-semibold text-primary">${currentStage.name || 'Onay'}</div>
                <div class="small text-muted">${remaining} onay bekleniyor</div>
            </div>
        `;
    };

    async function loadLeaveSetup() {
        const hireInput = container.querySelector(`#leave-hire-date-${user.id}`);
        const totalInput = container.querySelector(`#leave-total-days-${user.id}`);
        const usedEl = container.querySelector(`#leave-used-days-${user.id}`);
        const remainingEl = container.querySelector(`#leave-remaining-days-${user.id}`);
        if (!hireInput || !totalInput || !usedEl || !remainingEl) return;

        usedEl.textContent = '-';
        remainingEl.textContent = '-';

        try {
            const setup = await fetchUserLeaveSetup(user.id);
            hireInput.value = setup?.hire_date || '';
            totalInput.value = setup?.total_days ?? '';
            usedEl.textContent = setup?.used_days ?? '0.0';
            remainingEl.textContent = setup?.remaining_days ?? '0.0';
        } catch (e) {
            showNotification(e?.message || 'İzin tanımı yüklenemedi', 'error');
        }
    }

    async function saveLeaveSetup() {
        const hireDate = container.querySelector(`#leave-hire-date-${user.id}`)?.value || '';
        const totalRaw = container.querySelector(`#leave-total-days-${user.id}`)?.value || '';
        const total = Number(totalRaw);
        if (!hireDate) {
            showNotification('İşe giriş tarihi gereklidir', 'warning');
            return;
        }
        if (!Number.isFinite(total) || total < 0) {
            showNotification('Toplam gün 0 veya daha büyük olmalıdır', 'warning');
            return;
        }
        try {
            await patchUserLeaveSetup(user.id, {
                hire_date: hireDate,
                total_days: total.toFixed(1)
            });
            showNotification('İzin tanımı güncellendi', 'success');
            await loadLeaveSetup();
        } catch (e) {
            showNotification(e?.message || 'İzin tanımı güncellenemedi', 'error');
        }
    }

    function ensureLeaveRequestsTable() {
        if (leaveRequestsTable) return leaveRequestsTable;
        leaveRequestsTable = new TableComponent(`leave-requests-table-${user.id}`, {
            title: 'İzin Talepleri',
            icon: 'fas fa-calendar-check',
            iconColor: 'text-primary',
            columns: [
                {
                    field: 'id',
                    label: 'Talep No',
                    sortable: true,
                    formatter: (value) => `<span style="font-weight:700;color:#0d6efd;">#${value || '-'}</span>`
                },
                {
                    field: 'leave_type_label',
                    label: 'Tür',
                    sortable: true,
                    formatter: (value, row) => value || row.leave_type || '-'
                },
                { field: 'start_date', label: 'Başlangıç', sortable: true, type: 'date' },
                { field: 'end_date', label: 'Bitiş', sortable: true, type: 'date' },
                {
                    field: 'duration_days',
                    label: 'Süre (gün)',
                    sortable: true,
                    formatter: (value) => value || '0.0'
                },
                {
                    field: 'approval',
                    label: 'Onay',
                    sortable: false,
                    formatter: (value, row) => leaveApprovalInfo(row)
                },
                {
                    field: 'status',
                    label: 'Durum',
                    sortable: true,
                    formatter: (value, row) => leaveStatusBadge(value, row.status_label)
                },
                { field: 'created_at', label: 'Oluşturulma', sortable: true, type: 'date' }
            ],
            pagination: false,
            refreshable: false,
            emptyMessage: 'İzin talebi bulunamadı.',
            emptyIcon: 'fas fa-calendar-times'
        });
        return leaveRequestsTable;
    }

    async function loadLeaveRequests() {
        const table = ensureLeaveRequestsTable();
        table.setLoading(true);
        try {
            const resp = await fetchVacationRequests({
                requester: user.id,
                ordering: '-created_at',
                page_size: 200
            });
            const rows = parseVacationList(resp).filter(item => Number(item?.requester) === Number(user.id));
            table.updateData(rows, rows.length, 1);
        } catch (e) {
            showNotification(e?.message || 'İzin talepleri yüklenemedi', 'error');
            table.updateData([], 0, 1);
        } finally {
            table.setLoading(false);
        }
    }

    async function loadLeaveTab() {
        await Promise.all([loadLeaveSetup(), loadLeaveRequests()]);
    }

    const setMainModalSaveVisibility = (isLeaveTab) => {
        const footerSaveBtn = container.querySelector('#save-edit-btn');
        if (!footerSaveBtn) return;
        footerSaveBtn.style.display = isLeaveTab ? 'none' : '';
    };

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

        const methodIcon = (rec) => {
            const method = (rec?.method || '').toString();
            const label =
                rec?.method_display ||
                (method === 'ip'
                    ? 'IP (Ofis Ağı)'
                    : (method === 'gps'
                        ? 'GPS'
                        : (method === 'manual_override'
                            ? 'Manuel Değişim Talebi'
                            : (method === 'hr_manual'
                                ? 'Manuel'
                                : (method || '-')))));

            if (!method) return '-';

            const iconClass =
                method === 'ip'
                    ? 'fas fa-network-wired'
                    : (method === 'gps'
                        ? 'fas fa-location-dot'
                        : (method === 'manual_override'
                            ? 'fas fa-hand-paper'
                            : (method === 'hr_manual'
                                ? 'fas fa-user-gear'
                                : 'fas fa-question-circle')));

            const safeTitle = String(label || method).replace(/"/g, '&quot;');
            return `<span class="text-muted" title="${safeTitle}" style="display:inline-flex; align-items:center; gap:6px;">
                        <i class="${iconClass}"></i>
                    </span>`;
        };

        const s = summary?.summary || {};
        summaryEl.innerHTML = `
            <div class="row g-2">
                <div class="col-6 col-md-3"><div class="p-2 border rounded small"><div class="text-muted">Çalışma Günü</div><div class="fw-semibold">${s.total_working_days ?? '-'}</div></div></div>
                <div class="col-6 col-md-3"><div class="p-2 border rounded small"><div class="text-muted">Geldi</div><div class="fw-semibold">${s.total_present ?? '-'}</div></div></div>
                <div class="col-6 col-md-3"><div class="p-2 border rounded small"><div class="text-muted">Gelmedi</div><div class="fw-semibold">${s.total_absent ?? '-'}</div></div></div>
                <div class="col-6 col-md-3"><div class="p-2 border rounded small"><div class="text-muted">Fazla Mesai (dk)</div><div class="fw-semibold">${s.total_overtime_minutes ?? '-'}</div></div></div>
                <div class="col-6 col-md-3"><div class="p-2 border rounded small"><div class="text-muted">Toplam Geç Kalma (dk)</div><div class="fw-semibold">${s.total_late_minutes ?? '-'}</div></div></div>
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
            const method = rec ? methodIcon(rec) : '-';

            let rowClass = '';
            const lateMin = rec ? parseNum(rec.late_minutes) : 0;
            const earlyLeaveMin = rec ? parseNum(rec.early_leave_minutes) : 0;
            const totalLateMin = lateMin + earlyLeaveMin;
            const overtimeMin = rec ? parseNum(rec.overtime_minutes ?? rec.overtime_min ?? rec.overtime) : 0;

            if (rec && thresholdMin > 0) {
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
                <td class="text-center">${method}</td>
                <td>${inTime}</td>
                <td>${outTime}</td>
                <td class="text-end">${overtimeMin || 0}</td>
                <td class="text-end">${totalLateMin || 0}</td>
                <td class="text-end">
                    <button
                        type="button"
                        class="btn btn-sm ${btnClass} att-row-edit-btn"
                        data-att-date="${d.date || ''}"
                        data-att-record-id="${recId}"
                    >
                        <i class="fas fa-edit me-1"></i>${btnLabel}
                    </button>
                    <button type="button"
                            class="btn btn-sm btn-outline-secondary ms-1 att-row-intervals-btn"
                            data-att-date="${d.date || ''}"
                            data-att-record-id="${recId}"
                            title="İzin Aralıkları">
                        <i class="fas fa-person-walking-arrow-right"></i>
                    </button>
                </td>
                </tr>`;
        }).join('');

        daysEl.innerHTML = `
            <div class="table-responsive">
                <table class="table table-sm table-hover">
                    <thead>
                        <tr>
                            <th>Tarih</th><th>Gün</th><th>Gün Türü</th><th>Tatil</th><th>Durum Notu</th><th class="text-center">Yöntem</th><th>Giriş</th><th>Çıkış</th><th class="text-end">FM (dk)</th><th class="text-end">Geç/EÇ (dk)</th><th class="text-end">İşlem</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;

        // Sync export table data (TableComponent -> proper .xlsx)
        try {
            const exportMountId = `att-export-mount-${user.id}`;

            const safeFilePart = (s) => String(s || '')
                .replace(/[\\/:*?"<>|]/g, '_')
                .replace(/\s+/g, ' ')
                .trim();

            const exportRowsBase = days.map(d => {
                const rec = d.record || null;
                const lateMin = rec ? parseNum(rec.late_minutes) : 0;
                const earlyLeaveMin = rec ? parseNum(rec.early_leave_minutes) : 0;
                const totalLateMin = lateMin + earlyLeaveMin;
                const overtimeMin = rec ? parseNum(rec.overtime_minutes ?? rec.overtime_min ?? rec.overtime) : 0;
                const methodLabel =
                    rec?.method_display ||
                    (rec?.method === 'ip'
                        ? 'IP (Ofis Ağı)'
                        : (rec?.method === 'gps'
                            ? 'GPS'
                            : (rec?.method === 'manual_override'
                                ? 'Manuel Değişim Talebi'
                                : (rec?.method === 'hr_manual'
                                    ? 'Manuel'
                                    : (rec?.method || '-')))));

                const leaveLabel = (String(d.day_type) === 'leave')
                    ? (rec?.leave_type_display || d.leave_type_display || (LEAVE_TYPE_OPTIONS.find(o => o.value === (rec?.leave_type || d.leave_type))?.label) || 'İzin')
                    : '';

                const intervals = Array.isArray(rec?.leave_intervals) ? rec.leave_intervals : [];

                return {
                    date: d.date || '',
                    weekday: weekdayTr(d.weekday),
                    day_type: dayTypeTr(d.day_type),
                    holiday_name: d.holiday_name || '',
                    note: leaveLabel || (d.flag ? flagTr(d.flag) : ''),
                    method: rec ? methodLabel : '',
                    check_in: rec ? timeHM(rec.check_in_time || rec.check_in_at || rec.check_in) : '',
                    check_out: rec ? timeHM(rec.check_out_time || rec.check_out_at || rec.check_out) : '',
                    overtime_minutes: overtimeMin,
                    total_late_minutes: totalLateMin,
                    record_notes: rec?.notes || '',
                    __intervals: intervals
                };
            });

            const maxIntervals = exportRowsBase.reduce((mx, r) => {
                const n = Array.isArray(r.__intervals) ? r.__intervals.length : 0;
                return Math.max(mx, n);
            }, 0);

            const dynamicIntervalColumns = [];
            for (let i = 1; i <= maxIntervals; i++) {
                dynamicIntervalColumns.push(
                    { field: `interval_${i}_start`, label: `İzin ${i} Başlangıç`, sortable: false },
                    { field: `interval_${i}_end`, label: `İzin ${i} Bitiş`, sortable: false },
                    { field: `interval_${i}_type`, label: `İzin ${i} Tür`, sortable: false },
                    { field: `interval_${i}_notes`, label: `İzin ${i} Not`, sortable: false },
                );
            }

            const exportRows = exportRowsBase.map(r => {
                const intervals = Array.isArray(r.__intervals) ? r.__intervals : [];
                const out = { ...r };
                delete out.__intervals;
                for (let i = 1; i <= maxIntervals; i++) {
                    const it = intervals[i - 1] || null;
                    out[`interval_${i}_start`] = it ? isoToLocalTimeOnly(it.start_time) : '';
                    out[`interval_${i}_end`] = it ? isoToLocalTimeOnly(it.end_time) : '';
                    out[`interval_${i}_type`] = it ? (it.leave_type_display || (LEAVE_TYPE_OPTIONS.find(o => o.value === it.leave_type)?.label) || it.leave_type || '') : '';
                    out[`interval_${i}_notes`] = it ? (it.notes || '') : '';
                }
                return out;
            });

            // Totals row
            const totalOvertime = exportRows.reduce((acc, r) => acc + (Number(r.overtime_minutes) || 0), 0);
            const totalLate = exportRows.reduce((acc, r) => acc + (Number(r.total_late_minutes) || 0), 0);
            exportRows.push({
                date: 'TOPLAM',
                weekday: '',
                day_type: '',
                holiday_name: '',
                note: '',
                method: '',
                check_in: '',
                check_out: '',
                overtime_minutes: totalOvertime,
                total_late_minutes: totalLate,
                record_notes: '',
                ...Object.fromEntries(dynamicIntervalColumns.map(c => [c.field, '']))
            });

            const baseColumns = [
                { field: 'date', label: 'Tarih', sortable: false },
                { field: 'weekday', label: 'Gün', sortable: false },
                { field: 'day_type', label: 'Gün Türü', sortable: false },
                { field: 'holiday_name', label: 'Tatil', sortable: false },
                { field: 'note', label: 'Durum Notu', sortable: false },
                { field: 'method', label: 'Yöntem', sortable: false },
                { field: 'check_in', label: 'Giriş', sortable: false },
                { field: 'check_out', label: 'Çıkış', sortable: false },
                { field: 'overtime_minutes', label: 'FM (dk)', type: 'number', sortable: false },
                { field: 'total_late_minutes', label: 'Geç/EÇ (dk)', type: 'number', sortable: false },
                { field: 'record_notes', label: 'Not', sortable: false }
            ];

            const columns = [...baseColumns, ...dynamicIntervalColumns];

            // (Re)create export table if columns changed
            const colSig = columns.map(c => c.field).join('|');
            const prevSig = attendanceExportTable?.options?.__colSig;
            if ((!attendanceExportTable && document.getElementById(exportMountId)) || (attendanceExportTable && prevSig !== colSig)) {
                if (attendanceExportTable) attendanceExportTable.destroy();
                attendanceExportTable = new TableComponent(exportMountId, {
                    title: 'PDKS Özeti',
                    columns,
                    data: [],
                    exportable: true,
                    pagination: false,
                    responsive: false
                });
                attendanceExportTable.options.__colSig = colSig;
            }

            // Filename: PDKSOzeti_<user>_<YYYY-MM>.xlsx
            const yVal = container.querySelector(`#att-year-${user.id}`)?.value;
            const mVal = container.querySelector(`#att-month-${user.id}`)?.value;
            const mm = String(mVal || '').padStart(2, '0');
            const userDisplay = safeFilePart(`${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || `user_${user.id}`);
            const ym = (yVal && mm) ? `${yVal}-${mm}` : new Date().toISOString().slice(0, 7);
            if (attendanceExportTable) {
                attendanceExportTable.options.exportFilename = `PDKSOzeti_${userDisplay}_${ym}.xlsx`;
            }

            if (attendanceExportTable) {
                attendanceExportTable.updateData(exportRows, exportRows.length, 1);
            }
        } catch {
            // best-effort
        }
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
            if (daysEl) daysEl.innerHTML = `<div class="text-danger">PDKS özeti yüklenemedi: ${e.message || e}</div>`;
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

        const reload = async () => {
            await loadPermissionsAndGroups();
        };

        try {
            const detail = await fetchUserPermissionsDetail(user.id);
            const u = detail?.user || {};
            const eff = detail?.effective_permissions || {};
            const overrides = Array.isArray(detail?.overrides) ? detail.overrides : [];

            const officePerm = eff?.office_access || { value: false, source: 'none', source_detail: '' };
            const workshopPerm = eff?.workshop_access || { value: false, source: 'none', source_detail: '' };
            const hasOfficeAccess = officePerm.value === true;
            const hasWorkshopAccess = workshopPerm.value === true;

            const currentPositionId = Number(
                detail?.position?.id ??
                detail?.position ??
                u?.position_id ??
                u?.profile?.position_id ??
                u?.profile?.position?.id ??
                u?.profile?.position ??
                u?.position?.id ??
                u?.position ??
                ''
            ) || 0;
            const selectedPos = currentPositionId ? String(currentPositionId) : '';

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
                <h6 class="mb-2">Pozisyon</h6>
                <div class="d-flex mb-3 gap-2">
                    <div class="flex-grow-1" id="perm-position-dropdown-${user.id}"></div>
                    <button type="button" class="btn btn-sm btn-outline-primary" id="perm-position-save-btn-${user.id}">
                        Kaydet
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
            if (positionDropdown) {
                positionDropdown.destroy();
                positionDropdown = null;
            }
            const ddMount = box.querySelector(`#perm-position-dropdown-${user.id}`);
            positionDropdown = ddMount
                ? new ModernDropdown(ddMount, { placeholder: 'Pozisyon seçin...', multiple: false, searchable: true })
                : null;
            if (positionDropdown) {
                positionDropdown.setItems(
                    (organizationPositions || []).map(p => ({
                        value: String(p.id),
                        text: `${p.title || '-'} (L${p.level || '-'})${p.department_name ? ` - ${p.department_name}` : ''}`
                    }))
                );
                if (selectedPos) positionDropdown.setValue(selectedPos);
            }
            box.querySelector(`#perm-position-save-btn-${user.id}`)?.addEventListener('click', async () => {
                const next = positionDropdown?.getValue?.() ?? '';
                try {
                    await assignUserToPosition(user.id, next ? Number(next) : null);
                    showNotification('Pozisyon güncellendi', 'success');
                    await reload();
                } catch (e) {
                    showNotification(e?.message || 'Pozisyon güncellenemedi', 'error');
                }
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
        const intervalsBtn = e.target?.closest?.('.att-row-intervals-btn');

        if (intervalsBtn) {
            const dateStr = intervalsBtn.getAttribute('data-att-date') || '';
            const recordIdStr = intervalsBtn.getAttribute('data-att-record-id') || '';
            const recordId = recordIdStr ? Number(recordIdStr) : null;
            if (!dateStr) return;

            let effectiveRecordId = recordId;
            if (!effectiveRecordId) {
                try {
                    const created = await createAttendanceHrRecord({ user: user.id, date: dateStr });
                    effectiveRecordId = created?.id ?? null;
                } catch (e2) {
                    showNotification(`Kayıt oluşturulamadı: ${e2?.message || e2}`, 'error');
                    return;
                }
                if (!effectiveRecordId) {
                    showNotification('Kayıt oluşturulamadı', 'error');
                    return;
                }
                await loadAttendance(); // refresh so row has record id
            }

            const ui = ensureLeaveIntervalsUi();
            leaveIntervalsContext = {
                recordId: effectiveRecordId,
                dateStr,
                refreshAttendance: loadAttendance
            };
            await ui.open();
            return;
        }
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
        modalComp.setFieldValue('notes', rec?.notes || '');
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
            setMainModalSaveVisibility(target.includes(`pane-izinler-${user.id}`));
            if (target.includes(`pane-maaslar-${user.id}`) && !wagesLoaded) {
                wagesLoaded = true;
                await renderWages();
            }
            if (target.includes(`pane-izinler-${user.id}`) && !leaveLoaded) {
                leaveLoaded = true;
                await loadLeaveTab();
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

    // Default active tab is "Bilgiler", keep modal footer save visible initially.
    setMainModalSaveVisibility(false);

    container.querySelector(`[data-wages-refresh]`)?.addEventListener('click', () => renderWages());
    container.querySelector(`#leave-setup-save-${user.id}`)?.addEventListener('click', () => saveLeaveSetup());
    container.querySelector(`#leave-requests-refresh-${user.id}`)?.addEventListener('click', () => loadLeaveRequests());
    container.querySelector(`#att-fetch-${user.id}`)?.addEventListener('click', () => loadAttendance());
    container.querySelector(`#att-export-${user.id}`)?.addEventListener('click', () => {
        try {
            if (!attendanceExportTable) {
                showNotification('Önce yoklama özetini sorgulayın.', 'warning');
                return;
            }
            attendanceExportTable.exportData('excel');
        } catch (e) {
            showNotification(`Dışa aktarılamadı: ${e?.message || e}`, 'error');
        }
    });
}

let currentPage = 1;
let currentSortField = 'username';
let currentSortDirection = 'asc';
let users = [];
let totalUsers = 0;
let isLoading = false;
let userFilters = null;
let organizationPositions = [];
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

        await loadOrganizationPositions();
        updatePositionFilterOptions();
        updateDepartmentFilterOptions();

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
        id: 'position-filter',
        label: 'Pozisyon',
        options: [{ value: '', label: 'Tüm Pozisyonlar' }],
        placeholder: 'Tüm Pozisyonlar',
        colSize: 3
    });

    userFilters.addDropdownFilter({
        id: 'position-level-filter',
        label: 'Seviye',
        options: [
            { value: '', label: 'Tümü' },
            { value: '1', label: 'Seviye 1' },
            { value: '2', label: 'Seviye 2' },
            { value: '3', label: 'Seviye 3' },
            { value: '4', label: 'Seviye 4' },
            { value: '5', label: 'Seviye 5' },
            { value: '6', label: 'Seviye 6' }
        ],
        placeholder: 'Tümü',
        colSize: 3
    });

    userFilters.addDropdownFilter({
        id: 'department-code-filter',
        label: 'Departman',
        options: [{ value: '', label: 'Tüm Departmanlar' }],
        placeholder: 'Tüm Departmanlar',
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
            { field: 'birth_date', label: 'Doğum Tarihi', sortable: true, formatter: (v) => v || '-' },
            { field: 'email', label: 'E-posta', sortable: true, formatter: (v) => v || '-' },
            { field: 'position_title', label: 'Pozisyon', sortable: true, formatter: (v) => v || '-' },
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

async function loadOrganizationPositions() {
    try {
        const data = await fetchOrganizationPositions();
        organizationPositions = Array.isArray(data) ? data : (data?.results || []);
    } catch (e) {
        console.warn('Failed to load organization positions:', e);
        organizationPositions = [];
    }
}

// Note: groups/occupations are not used on this page anymore.

function getPositionOptions() {
    return (organizationPositions || []).map(p => ({
        value: String(p.id),
        label: `${p.title || '-'} (L${p.level || '-'})${p.department_name ? ` - ${p.department_name}` : ''}`
    }));
}

function getDepartmentOptions() {
    const map = new Map();
    (organizationPositions || []).forEach(p => {
        const code = p?.department_code;
        if (!code) return;
        const label = p?.department_name ? String(p.department_name) : String(code);
        if (!map.has(code)) map.set(code, label);
    });
    return Array.from(map.entries())
        .sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'tr'))
        .map(([value, label]) => ({ value: String(value), label: String(label) }));
}

function updatePositionFilterOptions() {
    if (!userFilters) return;
    userFilters.updateFilterOptions('position-filter', [
        { value: '', label: 'Tüm Pozisyonlar' },
        ...getPositionOptions()
    ]);
}

function updateDepartmentFilterOptions() {
    if (!userFilters) return;
    userFilters.updateFilterOptions('department-code-filter', [
        { value: '', label: 'Tüm Departmanlar' },
        ...getDepartmentOptions()
    ]);
}

function mapSortFieldToOrdering(field) {
    // Backend expects nested ordering keys for position fields.
    if (field === 'position_title') return 'profile__position__title';
    if (field === 'position_level') return 'profile__position__level';
    if (field === 'department_code') return 'profile__position__department_code';
    return field;
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

        if (filterValues['position-filter']) params.append('position', filterValues['position-filter']);
        if (filterValues['position-level-filter']) params.append('position_level', filterValues['position-level-filter']);
        if (filterValues['department-code-filter']) params.append('department_code', filterValues['department-code-filter']);
        if (filterValues['is-active-filter']) params.append('is_active', filterValues['is-active-filter']);

        const orderingField = mapSortFieldToOrdering(currentSortField);
        const orderingParam = currentSortDirection === 'asc' ? orderingField : `-${orderingField}`;
        params.append('ordering', orderingParam);

        const usersResponse = await authFetchUsers(currentPage, pageSize, {
            username: filterValues['username-filter'] || '',
            position: filterValues['position-filter'] || '',
            position_level: filterValues['position-level-filter'] || '',
            department_code: filterValues['department-code-filter'] || '',
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
    createUserModal.addField({
        id: 'username',
        name: 'username',
        label: 'Kullanıcı Adı',
        type: 'text',
        required: true,
        colSize: 6,
        help: HR_USER_FIELD_HELP_TR.username
    });
    createUserModal.addField({ id: 'email', name: 'email', label: 'E-posta', type: 'email', colSize: 6 });
    createUserModal.addField({
        id: 'first_name',
        name: 'first_name',
        label: 'Ad',
        type: 'text',
        required: true,
        colSize: 6,
        help: HR_USER_FIELD_HELP_TR.first_name
    });
    createUserModal.addField({
        id: 'last_name',
        name: 'last_name',
        label: 'Soyad',
        type: 'text',
        required: true,
        colSize: 6,
        help: HR_USER_FIELD_HELP_TR.last_name
    });
    createUserModal.addField({ id: 'birth_date', name: 'birth_date', label: 'Doğum Tarihi', type: 'date', colSize: 6 });

    createUserModal.addSection({ title: 'Maaş', icon: 'fas fa-money-bill-wave', iconColor: 'text-success' });
    const today = new Date().toISOString().split('T')[0];
    createUserModal.addField({ id: 'wage_effective_from', name: 'wage_effective_from', label: 'Geçerlilik Tarihi', type: 'date', value: today, colSize: 6 });
    createUserModal.addField({ id: 'wage_base_monthly', name: 'wage_base_monthly', label: 'Aylık Ücret', type: 'number', step: 0.01, min: 0, colSize: 6 });

    createUserModal.addSection({ title: 'İş Bilgileri', icon: 'fas fa-briefcase', iconColor: 'text-success' });
    createUserModal.addField({
        id: 'position',
        name: 'position',
        label: 'Pozisyon',
        type: 'dropdown',
        options: [{ value: '', label: 'Pozisyon yok' }, ...getPositionOptions()],
        value: '',
        searchable: true,
        colSize: 12
    });
    createUserModal.addField({ id: 'is_active', name: 'is_active', label: 'Aktif', type: 'checkbox', value: true, colSize: 12 });
    createUserModal.render();
    createUserModal.show();
}

async function createUser(formData) {
    try {
        const {
            wage_effective_from,
            wage_base_monthly,
            ...rawUserPayload
        } = formData || {};

        // Normalize payload to match backend expectations:
        // - trim text inputs
        // - avoid sending empty optional strings (e.g. email: "")
        // - force boolean shape for checkbox values
        const userPayload = {
            ...rawUserPayload,
            username: String(rawUserPayload?.username ?? '').trim(),
            first_name: String(rawUserPayload?.first_name ?? '').trim(),
            last_name: String(rawUserPayload?.last_name ?? '').trim(),
            is_active: rawUserPayload?.is_active !== false
        };
        const positionRaw = String(rawUserPayload?.position ?? '').trim();
        delete userPayload.position;
        userPayload.position_id = positionRaw ? Number(positionRaw) : null;
        const email = String(rawUserPayload?.email ?? '').trim();
        if (email) {
            userPayload.email = email;
        } else {
            delete userPayload.email;
        }
        const birthDate = String(rawUserPayload?.birth_date ?? '').trim();
        if (birthDate) {
            userPayload.birth_date = birthDate;
        } else {
            delete userPayload.birth_date;
        }

        const response = await createUserAPI(userPayload);
        if (response.ok) {
            const created = await response.json().catch(() => null);
            const userId = created?.id ?? created?.user?.id ?? null;

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
            const errorData = await response.json().catch(() => null);
            const errorMessage =
                errorData?.message ||
                errorData?.detail ||
                (typeof errorData === 'string' ? errorData : null) ||
                (errorData && typeof errorData === 'object'
                    ? Object.entries(errorData)
                        .map(([field, value]) => {
                            const text = Array.isArray(value) ? value.join(', ') : String(value);
                            return field === 'non_field_errors' ? text : `${field}: ${text}`;
                        })
                        .join(' | ')
                    : null) ||
                'Çalışan oluşturulamadı';
            throw new Error(errorMessage);
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
    editUserModal.addField({
        id: 'username',
        name: 'username',
        label: 'Kullanıcı Adı',
        type: 'text',
        value: user.username || '',
        required: true,
        colSize: 6,
        icon: 'fas fa-user',
        help: HR_USER_FIELD_HELP_TR.username
    });
    editUserModal.addField({ id: 'email', name: 'email', label: 'E-posta', type: 'email', value: user.email || '', colSize: 6, icon: 'fas fa-envelope' });
    editUserModal.addField({
        id: 'first_name',
        name: 'first_name',
        label: 'Ad',
        type: 'text',
        value: user.first_name || '',
        required: true,
        colSize: 6,
        icon: 'fas fa-id-card',
        help: HR_USER_FIELD_HELP_TR.first_name
    });
    editUserModal.addField({
        id: 'last_name',
        name: 'last_name',
        label: 'Soyad',
        type: 'text',
        value: user.last_name || '',
        required: true,
        colSize: 6,
        icon: 'fas fa-id-card',
        help: HR_USER_FIELD_HELP_TR.last_name
    });
    editUserModal.addField({ id: 'birth_date', name: 'birth_date', label: 'Doğum Tarihi', type: 'date', value: user.birth_date || '', colSize: 6, icon: 'fas fa-birthday-cake' });

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
        delete userPatch.position;
        delete userPatch.position_id;
        const birthDate = String(userPatch?.birth_date ?? '').trim();
        userPatch.birth_date = birthDate || null;
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


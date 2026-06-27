import { EditModal } from '../../components/edit-modal/edit-modal.js';
import { getCustomerById, patchCustomer, CURRENCY_OPTIONS } from '../../apis/projects/customers.js';
import { showNotification } from '../../components/notification/notification.js';

let editCustomerModal = null;
let editingCustomerId = null;
let onSuccessCallback = null;
let urlSyncBound = false;
let customerEditRequestSeq = 0;

function isCustomersPage() {
    return window.location.pathname.replace(/\/+$/, '').endsWith('/sales/customers');
}

export function buildCustomerEditUrl(customerId) {
    const url = new URL(window.location.origin + '/sales/customers/');
    url.searchParams.set('customer_id', String(customerId));
    return url.toString();
}

function setCustomerEditUrl(customerId) {
    if (!isCustomersPage()) return;
    try {
        const url = new URL(window.location.href);
        url.searchParams.set('customer_id', String(customerId));
        window.history.replaceState({}, '', url);
    } catch (e) {
        console.error('Failed to set customer edit URL:', e);
    }
}

function clearCustomerEditUrl() {
    if (!isCustomersPage()) return;
    try {
        const url = new URL(window.location.href);
        url.searchParams.delete('customer_id');
        window.history.replaceState({}, '', url);
    } catch (e) {
        console.error('Failed to clear customer edit URL:', e);
    }
}

function bindCustomerEditUrlSync(modal) {
    if (!modal?.modal || urlSyncBound) return;
    urlSyncBound = true;
    modal.modal.addEventListener('hidden.bs.modal', () => {
        clearCustomerEditUrl();
        editingCustomerId = null;
    });
}

function parseCustomerApiError(error, fallback) {
    let errorMessage = fallback;
    try {
        if (error.message) {
            const errorData = JSON.parse(error.message);
            if (typeof errorData === 'object') {
                const errors = Object.values(errorData).flat();
                errorMessage = errors.join(', ') || errorMessage;
            } else {
                errorMessage = error.message;
            }
        }
    } catch (_) {
        // use fallback
    }
    return errorMessage;
}

function populateCustomerEditFields(modal, customer) {
    modal.clearAll();

    modal.addSection({
        title: 'Temel Bilgiler',
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary'
    });

    modal.addField({
        id: 'code',
        name: 'code',
        label: 'Müşteri Kodu',
        type: 'text',
        value: customer.code || '',
        required: true,
        icon: 'fas fa-barcode',
        colSize: 6,
        helpText: 'Benzersiz müşteri kodu'
    });

    modal.addField({
        id: 'name',
        name: 'name',
        label: 'Firma Adı',
        type: 'text',
        value: customer.name || '',
        required: true,
        icon: 'fas fa-building',
        colSize: 6,
        helpText: 'Tam firma adı'
    });

    modal.addField({
        id: 'short_name',
        name: 'short_name',
        label: 'Kısa Ad',
        type: 'text',
        value: customer.short_name || '',
        icon: 'fas fa-tag',
        colSize: 6,
        helpText: 'Kısa gösterim adı'
    });

    modal.addField({
        id: 'default_currency',
        name: 'default_currency',
        label: 'Para Birimi',
        type: 'dropdown',
        value: customer.default_currency || 'TRY',
        icon: 'fas fa-coins',
        colSize: 6,
        helpText: 'Varsayılan para birimi',
        options: CURRENCY_OPTIONS.map(c => ({
            value: c.value,
            label: c.label
        }))
    });

    modal.addSection({
        title: 'İletişim Bilgileri',
        icon: 'fas fa-address-book',
        iconColor: 'text-success'
    });

    modal.addField({
        id: 'contact_person',
        name: 'contact_person',
        label: 'İletişim Kişisi',
        type: 'text',
        value: customer.contact_person || '',
        icon: 'fas fa-user',
        colSize: 6,
        helpText: 'Ana iletişim kişisi'
    });

    modal.addField({
        id: 'phone',
        name: 'phone',
        label: 'Telefon',
        type: 'text',
        value: customer.phone || '',
        icon: 'fas fa-phone',
        colSize: 6,
        helpText: 'Telefon numarası'
    });

    modal.addField({
        id: 'email',
        name: 'email',
        label: 'E-posta',
        type: 'email',
        value: customer.email || '',
        icon: 'fas fa-envelope',
        colSize: 6,
        helpText: 'E-posta adresi'
    });

    modal.addField({
        id: 'address',
        name: 'address',
        label: 'Adres',
        type: 'textarea',
        value: customer.address || '',
        icon: 'fas fa-map-marker-alt',
        colSize: 6,
        helpText: 'Tam adres'
    });

    modal.addSection({
        title: 'Vergi Bilgileri',
        icon: 'fas fa-file-invoice',
        iconColor: 'text-info'
    });

    modal.addField({
        id: 'tax_id',
        name: 'tax_id',
        label: 'Vergi Numarası',
        type: 'text',
        value: customer.tax_id || '',
        icon: 'fas fa-id-card',
        colSize: 6,
        helpText: 'Vergi kimlik numarası'
    });

    modal.addField({
        id: 'tax_office',
        name: 'tax_office',
        label: 'Vergi Dairesi',
        type: 'text',
        value: customer.tax_office || '',
        icon: 'fas fa-landmark',
        colSize: 6,
        helpText: 'Bağlı olduğu vergi dairesi'
    });

    modal.addSection({
        title: 'Durum',
        icon: 'fas fa-toggle-on',
        iconColor: 'text-warning'
    });

    modal.addField({
        id: 'is_active',
        name: 'is_active',
        label: 'Aktif',
        type: 'checkbox',
        value: customer.is_active !== false,
        icon: 'fas fa-check-circle',
        colSize: 12,
        helpText: 'Müşterinin aktif durumu'
    });

    modal.addField({
        id: 'notes',
        name: 'notes',
        label: 'Notlar',
        type: 'textarea',
        value: customer.notes || '',
        icon: 'fas fa-sticky-note',
        colSize: 12,
        helpText: 'İç notlar'
    });
}

async function saveCustomerEdit(formData) {
    const customerId = editingCustomerId;
    if (!customerId) {
        showNotification('Düzenlenecek müşteri bulunamadı', 'error');
        return;
    }

    try {
        const response = await patchCustomer(customerId, formData);
        if (!response?.id) {
            throw new Error('Müşteri güncellenemedi');
        }

        editCustomerModal.hide();
        clearCustomerEditUrl();
        editingCustomerId = null;
        showNotification('Müşteri başarıyla güncellendi', 'success');

        if (typeof onSuccessCallback === 'function') {
            await onSuccessCallback(response);
        }
    } catch (error) {
        console.error('Error updating customer:', error);
        showNotification(parseCustomerApiError(error, 'Müşteri güncellenirken hata oluştu'), 'error');
    }
}

export function initCustomerEditModal(containerId, options = {}) {
    onSuccessCallback = options.onSuccess || null;
    editCustomerModal = new EditModal(containerId, {
        title: 'Müşteri Düzenle',
        icon: 'fas fa-edit',
        size: 'lg',
        showEditButton: false
    });
    editCustomerModal.onSaveCallback(async (formData) => {
        await saveCustomerEdit(formData);
    });
    bindCustomerEditUrlSync(editCustomerModal);
    return editCustomerModal;
}

export async function openCustomerEditModal(customerId) {
    if (!customerId || customerId === '') {
        showNotification('Geçersiz müşteri ID', 'error');
        return;
    }
    if (!editCustomerModal) {
        showNotification('Müşteri düzenleme modülü başlatılmadı', 'error');
        return;
    }

    const requestSeq = ++customerEditRequestSeq;

    try {
        const customer = await getCustomerById(customerId);
        if (requestSeq !== customerEditRequestSeq) {
            return;
        }
        if (!customer) {
            showNotification('Müşteri bulunamadı', 'error');
            return;
        }

        editingCustomerId = customerId;
        populateCustomerEditFields(editCustomerModal, customer);
        editCustomerModal.render();
        setCustomerEditUrl(customerId);
        editCustomerModal.show();
    } catch (error) {
        if (requestSeq !== customerEditRequestSeq) {
            return;
        }
        console.error('Error loading customer for edit:', error);
        showNotification('Müşteri bilgileri yüklenirken hata oluştu', 'error');
    }
}

export function getMissingCustomerFieldsForConversion(customerDetail) {
    const fields = [
        { key: 'phone', label: 'Telefon' },
        { key: 'address', label: 'Adres' },
        { key: 'tax_id', label: 'Vergi Numarası' },
        { key: 'tax_office', label: 'Vergi Dairesi' },
    ];
    if (!customerDetail) {
        return fields.map(f => f.label);
    }
    return fields
        .filter(f => !customerDetail[f.key] || String(customerDetail[f.key]).trim() === '')
        .map(f => f.label);
}

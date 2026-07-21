import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { TableComponent } from '../../../components/table/table.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
import { DisplayModal } from '../../../components/display-modal/display-modal.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';
import { showNotification } from '../../../components/notification/notification.js';
import { formatDate } from '../../../apis/formatters.js';
import {
    getCraneTypes,
    getCraneRates,
    createCraneRate,
    getCraneMyPermissions,
    CRANE_CATEGORY_LABELS
} from '../../../apis/craneRequests.js';

// State
let craneTypes = [];
let pricesTable = null;
let newRateModal = null;
let historyModal = null;
let canManagePrices = false;
let currentType = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }
    if (!initRouteProtection()) {
        return;
    }

    await initNavbar();

    const header = new HeaderComponent({
        title: 'Vinç / Platform Fiyat Listesi',
        subtitle: 'Kiralık vinç ve platformların güncel fiyatları (KDV hariç)',
        icon: 'tags',
        showBackButton: 'block',
        showCreateButton: 'none',
        showExportButton: 'none',
        showRefreshButton: 'block',
        refreshButtonText: 'Yenile',
        onBackClick: () => window.location.href = '/general/crane-requests',
        onRefreshClick: loadPrices
    });

    try {
        const perms = await getCraneMyPermissions();
        canManagePrices = !!perms.can_manage_prices;
    } catch (error) {
        console.error('Error loading permissions:', error);
    }

    initializeModals();
    initializeTable();
    await loadPrices();
});

function formatMoney(value, currency = 'TRY') {
    if (value === null || value === undefined || value === '') return '<span style="color:#adb5bd;">—</span>';
    const num = parseFloat(value);
    if (Number.isNaN(num)) return '<span style="color:#adb5bd;">—</span>';
    return `${num.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currency}`;
}

function initializeModals() {
    newRateModal = new EditModal('new-rate-modal-container', {
        title: 'Yeni Fiyat Kaydı',
        icon: 'fas fa-tags',
        size: 'md',
        saveButtonText: 'Kaydet'
    });

    historyModal = new DisplayModal('rate-history-modal-container', {
        title: 'Fiyat Geçmişi',
        icon: 'fas fa-history',
        size: 'lg',
        showEditButton: false
    });
}

function initializeTable() {
    const actions = [
        {
            key: 'history',
            label: 'Fiyat Geçmişi',
            icon: 'fas fa-history',
            class: 'btn-outline-secondary',
            onClick: (row) => showHistoryModal(row)
        }
    ];
    if (canManagePrices) {
        actions.unshift({
            key: 'new-rate',
            label: 'Yeni Fiyat Gir',
            icon: 'fas fa-plus',
            class: 'btn-outline-success',
            onClick: (row) => showNewRateModal(row)
        });
    }

    pricesTable = new TableComponent('crane-prices-table-container', {
        title: 'Fiyat Listesi',
        icon: 'fas fa-tags',
        iconColor: 'text-success',
        columns: [
            {
                field: 'category_label',
                label: 'Kategori',
                sortable: false,
                formatter: (value) => `<span class="status-badge status-blue">${value || '-'}</span>`
            },
            {
                field: 'name',
                label: 'Ekipman',
                sortable: false,
                formatter: (value, row) => `<div style="font-weight: 600; color: #212529;">${value}${row.is_active ? '' : ' <span class="status-badge status-grey">Pasif</span>'}</div>`
            },
            {
                field: 'price_up_to_3h',
                label: '3 Saate Kadar',
                sortable: false,
                formatter: (value, row) => formatMoney(row.current_rate?.price_up_to_3h, row.current_rate?.currency)
            },
            {
                field: 'price_up_to_8h',
                label: '8 Saate Kadar',
                sortable: false,
                formatter: (value, row) => formatMoney(row.current_rate?.price_up_to_8h, row.current_rate?.currency)
            },
            {
                field: 'price_per_day',
                label: 'Günlük',
                sortable: false,
                formatter: (value, row) => formatMoney(row.current_rate?.price_per_day, row.current_rate?.currency)
            },
            {
                field: 'transport_fee',
                label: 'Nakliye (G-D)',
                sortable: false,
                formatter: (value, row) => formatMoney(row.current_rate?.transport_fee, row.current_rate?.currency)
            },
            {
                field: 'rigger_fee',
                label: 'İlave Sapancı',
                sortable: false,
                formatter: (value, row) => formatMoney(row.current_rate?.rigger_fee, row.current_rate?.currency)
            },
            {
                field: 'effective_from',
                label: 'Geçerlilik Başlangıcı',
                sortable: false,
                formatter: (value, row) => row.current_rate?.effective_from
                    ? `<div style="color: #6c757d;">${formatDate(row.current_rate.effective_from)}</div>`
                    : '<span style="color:#adb5bd;">—</span>'
            },
            {
                field: 'note',
                label: 'Not',
                sortable: false,
                formatter: (value, row) => `<div style="color: #6c757d; font-size: 0.85rem;">${row.current_rate?.note || ''}</div>`
            }
        ],
        actions,
        pagination: false,
        refreshable: true,
        onRefresh: loadPrices,
        emptyMessage: 'Fiyat listesi boş.',
        emptyIcon: 'fas fa-tags'
    });
}

async function loadPrices() {
    try {
        pricesTable.setLoading(true);
        const response = await getCraneTypes({ include_inactive: canManagePrices ? 'true' : '' });
        craneTypes = response.results || response || [];
        pricesTable.updateData(craneTypes, craneTypes.length, 1);
    } catch (error) {
        console.error('Error loading prices:', error);
        pricesTable.updateData([], 0, 1);
        showNotification('Fiyat listesi yüklenirken hata oluştu: ' + error.message, 'error');
    } finally {
        pricesTable.setLoading(false);
    }
}

function showNewRateModal(typeRow) {
    currentType = typeRow;
    const rate = typeRow.current_rate || {};

    newRateModal.clearAll();
    newRateModal.setTitle(`Yeni Fiyat — ${typeRow.name}`);
    newRateModal.setSaveButtonText('Kaydet');

    newRateModal.addSection({
        id: 'rate-section',
        title: 'Fiyat Bilgileri',
        icon: 'fas fa-tags',
        iconColor: 'text-success',
        fields: [
            {
                id: 'effective_from',
                name: 'effective_from',
                label: 'Geçerlilik Başlangıcı',
                type: 'date',
                value: new Date().toISOString().split('T')[0],
                required: true,
                colSize: 6,
                helpText: 'Bu tarihten itibaren geçerli olur; eski kayıtlar tarihçede kalır'
            },
            {
                id: 'currency',
                name: 'currency',
                label: 'Para Birimi',
                type: 'select',
                value: rate.currency || 'TRY',
                colSize: 6,
                options: [
                    { value: 'TRY', label: 'TRY' },
                    { value: 'EUR', label: 'EUR' },
                    { value: 'USD', label: 'USD' }
                ]
            },
            {
                id: 'price_up_to_3h',
                name: 'price_up_to_3h',
                label: '3 Saate Kadar',
                type: 'number',
                value: rate.price_up_to_3h ?? '',
                min: 0,
                step: 0.01,
                colSize: 6,
                helpText: 'Boş bırakılırsa bu seçenek sunulmaz'
            },
            {
                id: 'price_up_to_8h',
                name: 'price_up_to_8h',
                label: '8 Saate Kadar',
                type: 'number',
                value: rate.price_up_to_8h ?? '',
                min: 0,
                step: 0.01,
                colSize: 6
            },
            {
                id: 'price_per_day',
                name: 'price_per_day',
                label: 'Günlük Fiyat',
                type: 'number',
                value: rate.price_per_day ?? '',
                min: 0,
                step: 0.01,
                colSize: 6,
                helpText: 'Platformlar için'
            },
            {
                id: 'transport_fee',
                name: 'transport_fee',
                label: 'Nakliye (gidiş-dönüş)',
                type: 'number',
                value: rate.transport_fee ?? '',
                min: 0,
                step: 0.01,
                colSize: 6
            },
            {
                id: 'rigger_fee',
                name: 'rigger_fee',
                label: 'İlave Sapancı Ücreti',
                type: 'number',
                value: rate.rigger_fee ?? '',
                min: 0,
                step: 0.01,
                colSize: 6,
                helpText: 'Vinçler için'
            },
            {
                id: 'note',
                name: 'note',
                label: 'Not',
                type: 'text',
                value: '',
                colSize: 12,
                helpText: 'Örn: 2026 teklif yenilemesi'
            }
        ]
    });

    newRateModal.onSaveCallback(async (formData) => {
        try {
            const toNumberOrNull = (v) => (v === '' || v === null || v === undefined) ? null : v;
            const payload = {
                crane_type: currentType.id,
                effective_from: formData.effective_from,
                currency: formData.currency || 'TRY',
                price_up_to_3h: toNumberOrNull(formData.price_up_to_3h),
                price_up_to_8h: toNumberOrNull(formData.price_up_to_8h),
                price_per_day: toNumberOrNull(formData.price_per_day),
                transport_fee: toNumberOrNull(formData.transport_fee),
                rigger_fee: toNumberOrNull(formData.rigger_fee),
                note: formData.note || ''
            };
            if (!payload.effective_from) {
                showNotification('Geçerlilik tarihi zorunludur', 'error');
                throw new Error('validation');
            }
            if (payload.price_up_to_3h === null && payload.price_up_to_8h === null && payload.price_per_day === null) {
                showNotification('En az bir fiyat girmelisiniz', 'error');
                throw new Error('validation');
            }

            await createCraneRate(payload);
            showNotification('Yeni fiyat kaydedildi', 'success');
            newRateModal.hide();
            await loadPrices();
        } catch (error) {
            if (error.message !== 'validation') {
                showNotification('Fiyat kaydedilirken hata oluştu: ' + error.message, 'error');
            }
            throw error;
        }
    });

    newRateModal.render();
    newRateModal.show();
}

async function showHistoryModal(typeRow) {
    try {
        const response = await getCraneRates({ crane_type: typeRow.id });
        const rates = response.results || response || [];

        historyModal.clearData();
        historyModal.addSection({
            title: `${typeRow.name} — Fiyat Geçmişi`,
            icon: 'fas fa-history',
            iconColor: 'text-secondary'
        });

        const rowsHtml = rates.length === 0
            ? '<tr><td colspan="7" style="color:#6c757d;">Kayıt yok</td></tr>'
            : rates.map(rate => `
                <tr>
                    <td>${formatDate(rate.effective_from)}</td>
                    <td>${rate.price_up_to_3h ?? '—'}</td>
                    <td>${rate.price_up_to_8h ?? '—'}</td>
                    <td>${rate.price_per_day ?? '—'}</td>
                    <td>${rate.transport_fee ?? '—'}</td>
                    <td>${rate.rigger_fee ?? '—'}</td>
                    <td>${rate.currency} ${rate.note ? '· ' + rate.note : ''}</td>
                </tr>
            `).join('');

        historyModal.addCustomContent(`
            <div class="table-responsive mt-3">
                <table class="table table-sm table-striped">
                    <thead class="table-light">
                        <tr>
                            <th>Geçerlilik</th>
                            <th>3 Saat</th>
                            <th>8 Saat</th>
                            <th>Günlük</th>
                            <th>Nakliye</th>
                            <th>Sapancı</th>
                            <th>Birim / Not</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
        `);

        historyModal.render();
        historyModal.show();
    } catch (error) {
        showNotification('Fiyat geçmişi yüklenirken hata oluştu: ' + error.message, 'error');
    }
}

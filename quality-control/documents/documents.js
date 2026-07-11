import { initNavbar } from '../../components/navbar.js';
import { HeaderComponent } from '../../components/header/header.js';
import { FiltersComponent } from '../../components/filters/filters.js';
import { TableComponent } from '../../components/table/table.js';
import { EditModal } from '../../components/edit-modal/edit-modal.js';
import { showNotification } from '../../components/notification/notification.js';
import { initRouteProtection } from '../../apis/routeProtection.js';
import {
    listQualityDocuments,
    createQualityDocument,
    updateQualityDocument,
    deleteQualityDocument,
    QUALITY_DOCUMENT_TYPE_CHOICES
} from '../../apis/qualityControl.js';

let table = null;
let filtersComponent = null;
let currentPage = 1;
let currentPageSize = 20;
let currentOrdering = '-created_at';
let currentFilters = { document_type: '', search: '' };
let editModal = null;
let editingDocument = null;

const TYPE_LABELS = Object.fromEntries(
    QUALITY_DOCUMENT_TYPE_CHOICES.map(c => [c.value, c.label])
);

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!initRouteProtection()) return;
    await initNavbar();

    new HeaderComponent({
        title: 'Kalite Evrakları',
        subtitle: 'Kalite evraklarını görüntüleyin, yükleyin ve yönetin',
        icon: 'file-alt',
        showBackButton: 'block',
        showCreateButton: 'block',
        createButtonText: 'Yeni Evrak',
        showRefreshButton: 'block',
        onCreateClick: openCreateModal,
        onRefreshClick: () => { currentPage = 1; loadDocuments(); },
        backUrl: '/quality-control/'
    });

    initFilters();
    initTable();
    initModal();
    await loadDocuments();
});

function initFilters() {
    filtersComponent = new FiltersComponent('filters-placeholder', {
        title: 'Filtreler',
        onApply: (values) => {
            currentPage = 1;
            currentFilters = {
                document_type: values['type-filter'] ?? '',
                search: values['search-filter'] ?? ''
            };
            loadDocuments();
        },
        onClear: () => {
            currentPage = 1;
            currentFilters = { document_type: '', search: '' };
            loadDocuments();
        }
    });
    filtersComponent.addTextFilter({
        id: 'search-filter',
        label: 'Arama',
        placeholder: 'Başlık, evrak no, iş emri no...',
        colSize: 4
    });
    filtersComponent.addDropdownFilter({
        id: 'type-filter',
        label: 'Evrak Tipi',
        options: [{ value: '', label: 'Tümü' }, ...QUALITY_DOCUMENT_TYPE_CHOICES],
        placeholder: 'Tümü',
        colSize: 3
    });
}

function initTable() {
    table = new TableComponent('documents-table-container', {
        title: 'Kalite Evrakları',
        icon: 'fas fa-file-alt',
        columns: [
            { field: 'title', label: 'Başlık', sortable: true },
            { field: 'document_type', label: 'Tip', sortable: true, formatter: (v) => escapeHtml(TYPE_LABELS[v] || v || '-') },
            { field: 'document_number', label: 'Evrak No', sortable: false, formatter: (v) => escapeHtml(v || '-') },
            { field: 'revision', label: 'Rev.', sortable: false, formatter: (v) => escapeHtml(v || '-') },
            { field: 'job_order_no', label: 'İş Emri', sortable: false, formatter: (v) => escapeHtml(v || '-') },
            { field: 'valid_until', label: 'Geçerlilik', sortable: true, formatter: formatDate },
            { field: 'uploaded_by_name', label: 'Yükleyen', sortable: false, formatter: (v) => escapeHtml(v || '-') },
            { field: 'created_at', label: 'Yüklenme', sortable: true, formatter: formatDate }
        ],
        data: [],
        sortable: true,
        currentSortField: 'created_at',
        currentSortDirection: 'desc',
        pagination: true,
        serverSidePagination: true,
        itemsPerPage: currentPageSize,
        currentPage: 1,
        totalItems: 0,
        onPageChange: (page) => { currentPage = page; loadDocuments(); },
        onSort: (field, direction) => {
            currentOrdering = direction === 'desc' ? `-${field}` : field;
            currentPage = 1;
            loadDocuments();
        },
        actions: [
            { key: 'download', label: 'İndir', icon: 'fas fa-download', class: 'btn-outline-primary', onClick: (row) => downloadDocument(row) },
            { key: 'edit', label: 'Düzenle', icon: 'fas fa-edit', class: 'btn-outline-secondary', onClick: (row) => openEditModal(row) },
            { key: 'delete', label: 'Sil', icon: 'fas fa-trash', class: 'btn-outline-danger', onClick: (row) => removeDocument(row) }
        ],
        emptyMessage: 'Kayıtlı kalite evrağı bulunamadı.',
        emptyIcon: 'fas fa-inbox',
        refreshable: true,
        onRefresh: () => { currentPage = 1; loadDocuments(); }
    });
}

async function loadDocuments() {
    try {
        const filters = {};
        if (currentFilters.document_type) filters.document_type = currentFilters.document_type;
        const { results, count } = await listQualityDocuments(
            filters, currentFilters.search, currentOrdering, currentPage, currentPageSize
        );
        table.updateData(results, count, currentPage);
    } catch (err) {
        console.error(err);
        showNotification('Kalite evrakları yüklenemedi: ' + err.message, 'error');
    }
}

function downloadDocument(row) {
    if (row.url) {
        window.open(row.url, '_blank');
    } else {
        showNotification('Bu evrağa ait dosya bulunamadı.', 'warning');
    }
}

async function removeDocument(row) {
    if (!confirm(`"${row.title}" evrağını silmek istediğinize emin misiniz?`)) return;
    try {
        await deleteQualityDocument(row.id);
        showNotification('Evrak silindi.', 'success');
        loadDocuments();
    } catch (err) {
        console.error(err);
        showNotification('Evrak silinemedi: ' + err.message, 'error');
    }
}

function initModal() {
    editModal = new EditModal('document-edit-modal-container', {
        title: 'Yeni Kalite Evrağı',
        icon: 'fas fa-file-alt',
        saveButtonText: 'Kaydet',
        size: 'lg'
    });
    editModal.onSaveCallback(handleSave);
    editModal.onCancelCallback(() => { editingDocument = null; });
}

function buildForm(doc = null) {
    const isEdit = !!doc;
    editModal.clearAll();
    editModal.setTitle(isEdit ? 'Kalite Evrağını Düzenle' : 'Yeni Kalite Evrağı');
    editModal.setSaveButtonText(isEdit ? 'Kaydet' : 'Yükle');

    editModal.addSection({
        id: 'document-info',
        title: 'Evrak Bilgileri',
        icon: 'fas fa-file-alt',
        iconColor: 'text-primary',
        fields: [
            {
                id: 'title', name: 'title', label: 'Başlık', type: 'text',
                value: doc?.title || '', required: true, icon: 'fas fa-heading', colSize: 12
            },
            {
                id: 'document_type', name: 'document_type', label: 'Evrak Tipi', type: 'select',
                value: doc?.document_type || 'other', icon: 'fas fa-tag', colSize: 6,
                options: QUALITY_DOCUMENT_TYPE_CHOICES
            },
            {
                id: 'document_number', name: 'document_number', label: 'Evrak No', type: 'text',
                value: doc?.document_number || '', icon: 'fas fa-hashtag', colSize: 6
            },
            {
                id: 'revision', name: 'revision', label: 'Revizyon', type: 'text',
                value: doc?.revision || '', icon: 'fas fa-code-branch', colSize: 6
            },
            {
                id: 'valid_until', name: 'valid_until', label: 'Geçerlilik Tarihi', type: 'date',
                value: doc?.valid_until || '', icon: 'fas fa-calendar-alt', colSize: 6
            },
            {
                id: 'job_order', name: 'job_order', label: 'İş Emri No', type: 'text',
                value: doc?.job_order_no || doc?.job_order || '', icon: 'fas fa-briefcase', colSize: 12,
                help: 'Bir iş emrine bağlamak için iş emri numarasını girin (isteğe bağlı).'
            },
            {
                id: 'description', name: 'description', label: 'Açıklama', type: 'textarea',
                value: doc?.description || '', icon: 'fas fa-align-left', colSize: 12, rows: 3
            }
        ]
    });

    editModal.addSection({
        id: 'document-file',
        title: 'Dosya',
        icon: 'fas fa-paperclip',
        iconColor: 'text-info',
        fields: [
            {
                id: 'file', name: 'file', label: isEdit ? 'Yeni Dosya' : 'Dosya', type: 'file',
                required: !isEdit, accept: '*/*', icon: 'fas fa-file-upload', colSize: 12,
                help: isEdit
                    ? 'Yeni dosya seçmezseniz mevcut dosya korunur.'
                    : 'Yüklenecek evrak dosyasını seçin.'
            }
        ]
    });

    editModal.render();
}

function openCreateModal() {
    editingDocument = null;
    buildForm(null);
    editModal.show();
}

function openEditModal(row) {
    editingDocument = row;
    buildForm(row);
    editModal.show();
}

async function handleSave(formData) {
    const fileInput = editModal.container.querySelector('input[type="file"]');
    const file = fileInput && fileInput.files.length ? fileInput.files[0] : null;

    const meta = {
        title: (formData.title || '').trim(),
        document_type: formData.document_type || 'other',
        document_number: (formData.document_number || '').trim(),
        revision: (formData.revision || '').trim(),
        description: (formData.description || '').trim(),
        // Nullable fields: send null (not '') when empty so DRF can clear them
        // and the DateField/FK don't reject an empty string.
        valid_until: formData.valid_until ? formData.valid_until : null,
        // job_order is keyed by job number (the JobOrder PK is job_no).
        job_order: (formData.job_order || '').trim() || null
    };

    try {
        if (editingDocument) {
            await updateQualityDocument(editingDocument.id, meta, file);
            showNotification('Evrak güncellendi.', 'success');
        } else {
            if (!file) {
                showNotification('Lütfen bir dosya seçin.', 'warning');
                throw new Error('Dosya gerekli');
            }
            await createQualityDocument(file, meta);
            showNotification('Evrak yüklendi.', 'success');
            currentPage = 1;
        }
        editModal.hide();
        editingDocument = null;
        loadDocuments();
    } catch (err) {
        console.error(err);
        showNotification('İşlem başarısız: ' + err.message, 'error');
        throw err; // keep the modal open on failure
    }
}

function formatDate(value) {
    if (!value) return '-';
    try {
        const d = new Date(value);
        if (isNaN(d.getTime())) return value;
        return d.toLocaleDateString('tr-TR');
    } catch {
        return value;
    }
}

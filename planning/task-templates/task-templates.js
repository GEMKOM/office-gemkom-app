import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { TableComponent } from '../../../components/table/table.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
import { DisplayModal } from '../../../components/display-modal/display-modal.js';
import { ConfirmationModal } from '../../../components/confirmation-modal/confirmation-modal.js';
import {
    listTaskTemplates,
    getTaskTemplateById,
    createTaskTemplate,
    updateTaskTemplate,
    deleteTaskTemplate,
    getTemplateItems,
    addTemplateItem,
    removeTemplateItem,
    getDepartmentChoices,
    DEPARTMENT_OPTIONS
} from '../../../apis/projects/taskTemplates.js';
import { formatDate, formatDateTime } from '../../../apis/formatters.js';
import { showNotification } from '../../../components/notification/notification.js';

// State management
let currentPage = 1;
let templates = [];
let totalTemplates = 0;
let isLoading = false;
let templatesTable = null;
let filtersComponent = null;
let departmentOptions = DEPARTMENT_OPTIONS;

// Modal instances
let createTemplateModal = null;
let editTemplateModal = null;
let deleteTemplateModal = null;
let manageItemsModal = null;
let addItemModal = null;

// Current template being managed
let currentTemplate = null;
let currentTemplateItems = [];

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    await initNavbar();
    
    // Initialize header
    initHeaderComponent();
    
    // Initialize filters
    initFiltersComponent();
    
    // Initialize modals
    initializeModalComponents();
    
    // Load department choices
    await loadDepartmentChoices();
    
    // Load templates
    await loadTemplates();
});

// Initialize header component
function initHeaderComponent() {
    const header = new HeaderComponent({
        title: 'Görev Şablonları',
        subtitle: 'Departman görev şablonlarını yönetin ve oluşturun',
        icon: 'tasks',
        showBackButton: 'block',
        showCreateButton: 'block',
        createButtonText: 'Yeni Şablon',
        onBackClick: () => window.location.href = '/planning/',
        onCreateClick: () => openCreateTemplateModal()
    });
}

// Initialize filters component
function initFiltersComponent() {
    filtersComponent = new FiltersComponent('filters-placeholder', {
        title: 'Filtreler',
        onApply: (values) => {
            currentPage = 1;
            loadTemplates();
        },
        onClear: () => {
            currentPage = 1;
            loadTemplates();
        }
    });

    filtersComponent.addTextFilter({
        id: 'search-filter',
        label: 'Ara',
        placeholder: 'Şablon adı veya açıklama...',
        colSize: 3
    });

    filtersComponent.addDropdownFilter({
        id: 'is_active-filter',
        label: 'Durum',
        options: [
            { value: 'true', label: 'Aktif' },
            { value: 'false', label: 'Pasif' }
        ],
        placeholder: 'Tümü',
        colSize: 2
    });

    filtersComponent.addDropdownFilter({
        id: 'is_default-filter',
        label: 'Varsayılan',
        options: [
            { value: 'true', label: 'Varsayılan' },
            { value: 'false', label: 'Varsayılan Değil' }
        ],
        placeholder: 'Tümü',
        colSize: 2
    });
}

// Load department choices from API
async function loadDepartmentChoices() {
    try {
        const choices = await getDepartmentChoices();
        if (choices && choices.length > 0) {
            departmentOptions = choices;
        }
    } catch (error) {
        console.error('Error loading department choices:', error);
        // Use static fallback
    }
}

// Load templates
async function loadTemplates() {
    try {
        isLoading = true;
        if (templatesTable) {
            templatesTable.setLoading(true);
        }

        const filterValues = filtersComponent ? filtersComponent.getFilterValues() : {};
        const options = {
            page: currentPage,
            ordering: '-created_at'
        };

        if (filterValues['search-filter']) {
            options.search = filterValues['search-filter'];
        }
        if (filterValues['is_active-filter']) {
            options.is_active = filterValues['is_active-filter'] === 'true';
        }
        if (filterValues['is_default-filter']) {
            options.is_default = filterValues['is_default-filter'] === 'true';
        }

        const response = await listTaskTemplates(options);
        templates = response.results || [];
        totalTemplates = response.count || 0;

        renderTemplatesTable();
    } catch (error) {
        console.error('Error loading templates:', error);
        showNotification('Şablonlar yüklenirken bir hata oluştu', 'error');
    } finally {
        isLoading = false;
        if (templatesTable) {
            templatesTable.setLoading(false);
        }
    }
}

// Render templates table
function renderTemplatesTable() {
    const columns = [
        {
            field: 'name',
            label: 'Şablon Adı',
            sortable: true,
            formatter: (value, row) => {
                const defaultBadge = row.is_default 
                    ? '<span class="badge bg-primary ms-2">Varsayılan</span>' 
                    : '';
                return `<strong>${escapeHtml(value)}</strong>${defaultBadge}`;
            }
        },
        {
            field: 'description',
            label: 'Açıklama',
            sortable: false,
            formatter: (value) => value ? escapeHtml(value) : '-'
        },
        {
            field: 'items_count',
            label: 'Görev Sayısı',
            sortable: false,
            formatter: (value, row) => {
                const count = row.items ? row.items.length : 0;
                return `<span class="badge bg-secondary">${count}</span>`;
            }
        },
        {
            field: 'is_active',
            label: 'Durum',
            sortable: true,
            formatter: (value) => {
                if (value) {
                    return '<span class="status-badge completed">Aktif</span>';
                } else {
                    return '<span class="status-badge pending">Pasif</span>';
                }
            }
        },
        {
            field: 'created_at',
            label: 'Oluşturulma',
            sortable: true,
            formatter: (value) => formatDateTime(value)
        },
        {
            field: 'created_by_name',
            label: 'Oluşturan',
            sortable: false,
            formatter: (value) => value || '-'
        }
    ];

    const actions = [
        {
            key: 'items',
            label: 'Görevleri Yönet',
            icon: 'fas fa-tasks',
            class: 'btn-outline-primary',
            onClick: (row) => openManageItemsModal(row.id)
        },
        {
            key: 'edit',
            label: 'Düzenle',
            icon: 'fas fa-edit',
            class: 'btn-outline-warning',
            onClick: (row) => openEditTemplateModal(row.id)
        },
        {
            key: 'delete',
            label: 'Sil',
            icon: 'fas fa-trash',
            class: 'btn-outline-danger',
            onClick: (row) => openDeleteTemplateModal(row.id)
        }
    ];

    if (!templatesTable) {
        templatesTable = new TableComponent('templates-table-container', {
            title: 'Görev Şablonları',
            columns: columns,
            data: templates,
            actions: actions,
            pagination: true,
            itemsPerPage: 20,
            totalItems: totalTemplates,
            currentPage: currentPage,
            onPageChange: (page) => {
                currentPage = page;
                loadTemplates();
            },
            refreshable: true,
            onRefresh: () => {
                loadTemplates();
            }
        });
    } else {
        templatesTable.updateData(templates, totalTemplates);
    }
}

// Initialize modal components
function initializeModalComponents() {
    // Create template modal
    createTemplateModal = new EditModal('create-template-modal-container', {
        title: 'Yeni Görev Şablonu Oluştur',
        icon: 'fas fa-plus-circle',
        saveButtonText: 'Şablon Oluştur',
        size: 'lg'
    });

    // Edit template modal
    editTemplateModal = new EditModal('edit-template-modal-container', {
        title: 'Görev Şablonu Düzenle',
        icon: 'fas fa-edit',
        saveButtonText: 'Değişiklikleri Kaydet',
        size: 'lg'
    });

    // Delete template modal
    deleteTemplateModal = new ConfirmationModal('delete-template-modal-container', {
        title: 'Şablon Silme Onayı',
        message: 'Bu şablonu silmek istediğinizden emin misiniz?',
        icon: 'fas fa-exclamation-triangle',
        confirmText: 'Sil',
        cancelText: 'İptal',
        confirmButtonClass: 'btn-danger'
    });

    // Add item modal
    addItemModal = new EditModal('add-item-modal-container', {
        title: 'Görev Ekle',
        icon: 'fas fa-plus-circle',
        saveButtonText: 'Görev Ekle',
        size: 'lg'
    });

    // Manage items modal
    try {
        manageItemsModal = new DisplayModal('manage-items-modal-container', {
            title: 'Görev Yönetimi',
            icon: 'fas fa-tasks',
            showEditButton: false,
            size: 'xl'
        });
    } catch (error) {
        console.error('Error initializing manage items modal:', error);
        // Create a fallback - the modal will be re-initialized if needed
    }

    setupModalCallbacks();
}

// Setup modal callbacks
function setupModalCallbacks() {
    // Create template callback
    createTemplateModal.onSaveCallback(async (formData) => {
        try {
            createTemplateModal.setLoading(true);
            const templateData = {
                name: formData.name,
                description: formData.description || '',
                is_active: formData.is_active !== undefined ? formData.is_active : true,
                is_default: formData.is_default !== undefined ? formData.is_default : false
            };
            await createTaskTemplate(templateData);
            createTemplateModal.hide();
            showNotification('Şablon başarıyla oluşturuldu', 'success');
            await loadTemplates();
        } catch (error) {
            console.error('Error creating template:', error);
            showNotification('Şablon oluşturulurken bir hata oluştu', 'error');
        } finally {
            createTemplateModal.setLoading(false);
        }
    });

    // Edit template callback
    editTemplateModal.onSaveCallback(async (formData) => {
        try {
            editTemplateModal.setLoading(true);
            const templateData = {
                name: formData.name,
                description: formData.description || '',
                is_active: formData.is_active !== undefined ? formData.is_active : true,
                is_default: formData.is_default !== undefined ? formData.is_default : false
            };
            await updateTaskTemplate(currentTemplate.id, templateData);
            editTemplateModal.hide();
            showNotification('Şablon başarıyla güncellendi', 'success');
            await loadTemplates();
        } catch (error) {
            console.error('Error updating template:', error);
            showNotification('Şablon güncellenirken bir hata oluştu', 'error');
        } finally {
            editTemplateModal.setLoading(false);
        }
    });

    // Delete template callback
    deleteTemplateModal.onConfirmCallback = async () => {
        try {
            deleteTemplateModal.setLoading(true);
            await deleteTaskTemplate(currentTemplate.id);
            deleteTemplateModal.hide();
            showNotification('Şablon başarıyla silindi', 'success');
            await loadTemplates();
        } catch (error) {
            console.error('Error deleting template:', error);
            showNotification('Şablon silinirken bir hata oluştu', 'error');
        } finally {
            deleteTemplateModal.setLoading(false);
        }
    };

    // Add item callback will be set dynamically in openAddItemModal with the correct templateId
}

// Open create template modal
function openCreateTemplateModal() {
    createTemplateModal
        .clearForm()
        .addSection({
            title: 'Şablon Bilgileri',
            icon: 'fas fa-info-circle',
            iconColor: 'text-primary',
            fields: [
                {
                    id: 'name',
                    name: 'name',
                    label: 'Şablon Adı',
                    type: 'text',
                    placeholder: 'Örn: Standart Üretim Akışı',
                    required: true,
                    icon: 'fas fa-tag',
                    colSize: 12
                },
                {
                    id: 'description',
                    name: 'description',
                    label: 'Açıklama',
                    type: 'textarea',
                    placeholder: 'Şablon açıklaması...',
                    rows: 3,
                    colSize: 12
                },
                {
                    id: 'is_active',
                    name: 'is_active',
                    label: 'Aktif',
                    type: 'checkbox',
                    value: true,
                    colSize: 6
                },
                {
                    id: 'is_default',
                    name: 'is_default',
                    label: 'Varsayılan Şablon',
                    type: 'checkbox',
                    value: false,
                    colSize: 6
                }
            ]
        })
        .render()
        .show();
}

// Open edit template modal
async function openEditTemplateModal(templateId) {
    try {
        editTemplateModal.setLoading(true);
        const template = await getTaskTemplateById(templateId);
        currentTemplate = template;

        editTemplateModal
            .clearForm()
            .addSection({
                title: 'Şablon Bilgileri',
                icon: 'fas fa-info-circle',
                iconColor: 'text-primary',
                fields: [
                    {
                        id: 'name',
                        name: 'name',
                        label: 'Şablon Adı',
                        type: 'text',
                        placeholder: 'Örn: Standart Üretim Akışı',
                        required: true,
                        icon: 'fas fa-tag',
                        value: template.name,
                        colSize: 12
                    },
                    {
                        id: 'description',
                        name: 'description',
                        label: 'Açıklama',
                        type: 'textarea',
                        placeholder: 'Şablon açıklaması...',
                        rows: 3,
                        value: template.description || '',
                        colSize: 12
                    },
                    {
                        id: 'is_active',
                        name: 'is_active',
                        label: 'Aktif',
                        type: 'checkbox',
                        value: template.is_active,
                        colSize: 6
                    },
                    {
                        id: 'is_default',
                        name: 'is_default',
                        label: 'Varsayılan Şablon',
                        type: 'checkbox',
                        value: template.is_default,
                        colSize: 6
                    }
                ]
            })
            .render()
            .show();
    } catch (error) {
        console.error('Error loading template:', error);
        showNotification('Şablon yüklenirken bir hata oluştu', 'error');
    } finally {
        editTemplateModal.setLoading(false);
    }
}

// Open delete template modal
async function openDeleteTemplateModal(templateId) {
    try {
        const template = await getTaskTemplateById(templateId);
        currentTemplate = template;
        
        deleteTemplateModal.updateMessage(
            `"${escapeHtml(template.name)}" şablonunu silmek istediğinizden emin misiniz?`,
            'Bu işlem geri alınamaz.'
        );
        deleteTemplateModal.show();
    } catch (error) {
        console.error('Error loading template:', error);
        showNotification('Şablon yüklenirken bir hata oluştu', 'error');
    }
}

// Open manage items modal
async function openManageItemsModal(templateId) {
    try {
        const template = await getTaskTemplateById(templateId);
        currentTemplate = template;
        
        // Load template items
        const items = await getTemplateItems(templateId);
        currentTemplateItems = items;
        
        // Create a custom modal for managing items
        showManageItemsModal(template, items);
    } catch (error) {
        console.error('Error loading template items:', error);
        showNotification('Şablon görevleri yüklenirken bir hata oluştu', 'error');
    }
}

// Refresh manage items modal after adding/removing items
async function refreshManageItemsModal() {
    if (!currentTemplate || !manageItemsModal) return;
    
    try {
        const items = await getTemplateItems(currentTemplate.id);
        currentTemplateItems = items;
        
        // Update table data if table exists
        if (manageItemsModal.itemsTable) {
            const sortedItems = [...items].sort((a, b) => a.sequence - b.sequence);
            const tableData = sortedItems.map((item, index) => {
                const deptLabel = departmentOptions.find(d => d.value === item.department)?.label || item.department;
                const dependsOn = item.depends_on && item.depends_on.length > 0 
                    ? item.depends_on.map(id => {
                        const depItem = items.find(i => i.id === id);
                        return depItem ? depItem.title : id;
                    }).join(', ')
                    : '-';
                
                return {
                    id: item.id,
                    index: index + 1,
                    department: item.department,
                    department_display: deptLabel,
                    title: item.title,
                    sequence: item.sequence,
                    depends_on: dependsOn
                };
            });
            
            manageItemsModal.itemsTable.updateData(tableData, tableData.length);
        } else {
            // If table doesn't exist, re-render the modal
            showManageItemsModal(currentTemplate, items);
        }
    } catch (error) {
        console.error('Error refreshing items:', error);
    }
}

// Show manage items modal using DisplayModal and TableComponent
function showManageItemsModal(template, items) {
    // Ensure modal is initialized - reinitialize if needed
    if (!manageItemsModal) {
        try {
            manageItemsModal = new DisplayModal('manage-items-modal-container', {
                title: 'Görev Yönetimi',
                icon: 'fas fa-tasks',
                showEditButton: false,
                size: 'xl'
            });
        } catch (error) {
            console.error('Error initializing manage items modal:', error);
            showNotification('Modal başlatılamadı', 'error');
            return;
        }
    }
    
    // Update modal title with template name
    manageItemsModal.setTitle(`${escapeHtml(template.name)} - Görev Yönetimi`);
    
    // Prepare table data
    const sortedItems = [...items].sort((a, b) => a.sequence - b.sequence);
    const tableData = sortedItems.map((item, index) => {
        const deptLabel = departmentOptions.find(d => d.value === item.department)?.label || item.department;
        const dependsOn = item.depends_on && item.depends_on.length > 0 
            ? item.depends_on.map(id => {
                const depItem = items.find(i => i.id === id);
                return depItem ? depItem.title : id;
            }).join(', ')
            : '-';
        
        return {
            id: item.id,
            index: index + 1,
            department: item.department,
            department_display: deptLabel,
            title: item.title,
            sequence: item.sequence,
            depends_on: dependsOn
        };
    });

    // Define table columns
    const tableColumns = [
        {
            field: 'index',
            label: '#',
            sortable: false,
            formatter: (value) => `<span class="badge bg-secondary">${value}</span>`
        },
        {
            field: 'department_display',
            label: 'Departman',
            sortable: true,
            formatter: (value, row) => `<span class="badge bg-secondary">${escapeHtml(value)}</span>`
        },
        {
            field: 'title',
            label: 'Başlık',
            sortable: true,
            formatter: (value) => `<strong>${escapeHtml(value)}</strong>`
        },
        {
            field: 'sequence',
            label: 'Sıra',
            sortable: true,
            formatter: (value) => `<small class="text-muted">${value}</small>`
        },
        {
            field: 'depends_on',
            label: 'Bağımlılıklar',
            sortable: false,
            formatter: (value) => value === '-' ? '<span class="text-muted">-</span>' : `<small class="text-muted">${escapeHtml(value)}</small>`
        }
    ];

    // Define table actions
    const tableActions = [
        {
            key: 'delete',
            label: 'Sil',
            icon: 'fas fa-trash',
            class: 'btn-outline-danger',
            onClick: async (row) => {
                await removeItem(row.id);
            }
        }
    ];

    const statusBadge = template.is_active
        ? '<span class="status-badge completed">Aktif</span>'
        : '<span class="status-badge pending">Pasif</span>';

    const defaultBadge = template.is_default
        ? '<span class="badge bg-primary">Varsayılan</span>'
        : '<span class="badge bg-secondary">Varsayılan Değil</span>';

    // General info section for the template
    const templateInfoContent = `
        <div class="table-responsive">
            <table class="table table-sm table-bordered mb-0">
                <tbody>
                    <tr>
                        <th style="width: 220px;">Şablon Adı</th>
                        <td><strong>${escapeHtml(template.name)}</strong></td>
                    </tr>
                    <tr>
                        <th>Açıklama</th>
                        <td>${template.description ? escapeHtml(template.description) : '<span class="text-muted">-</span>'}</td>
                    </tr>
                    <tr>
                        <th>Durum</th>
                        <td>${statusBadge}</td>
                    </tr>
                    <tr>
                        <th>Varsayılan</th>
                        <td>${defaultBadge}</td>
                    </tr>
                    <tr>
                        <th>Görev Sayısı</th>
                        <td><span class="badge bg-secondary">${items.length}</span></td>
                    </tr>
                    <tr>
                        <th>Oluşturulma Tarihi</th>
                        <td>${template.created_at ? escapeHtml(formatDateTime(template.created_at)) : '<span class="text-muted">-</span>'}</td>
                    </tr>
                    <tr>
                        <th>Oluşturan</th>
                        <td>${template.created_by_name ? escapeHtml(template.created_by_name) : '<span class="text-muted">-</span>'}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;

    // Create custom content with table and add button
    const customContent = `
        <div class="d-flex justify-content-end mb-3">
            <button type="button" class="btn btn-sm btn-primary" id="add-item-btn-header">
                <i class="fas fa-plus me-1"></i>Görev Ekle
            </button>
        </div>
        <div id="items-table-container"></div>
    `;

    // Clear and setup modal
    manageItemsModal.clearData();
    manageItemsModal
        .addCustomSection({
            title: 'Şablon Bilgileri',
            icon: 'fas fa-info-circle',
            iconColor: 'text-primary',
            customContent: templateInfoContent
        })
        .addCustomSection({
            title: null,
            customContent: customContent
        })
        .render()
        .show();

    // Initialize table after modal is shown
    setTimeout(() => {
        // Destroy existing table if it exists
        if (manageItemsModal.itemsTable) {
            try {
                manageItemsModal.itemsTable.destroy();
            } catch (e) {
                console.warn('Error destroying existing table:', e);
            }
        }

        const tableContainer = document.getElementById('items-table-container');
        if (tableContainer) {
            // Clear container first
            tableContainer.innerHTML = '';
            
            const itemsTable = new TableComponent('items-table-container', {
                title: 'Şablon Görevleri',
                columns: tableColumns,
                data: tableData,
                actions: tableActions,
                sortable: true,
                pagination: false,
                striped: true,
                bordered: true,
                small: true,
                emptyMessage: 'Henüz görev eklenmemiş.',
                emptyIcon: 'fas fa-tasks'
            });

            // Store table reference for refresh
            manageItemsModal.itemsTable = itemsTable;
            
            // Setup add item button (already in the HTML, just need to attach event)
            const addBtnHeader = document.getElementById('add-item-btn-header');
            if (addBtnHeader) {
                // Remove existing listeners by cloning
                const newAddBtn = addBtnHeader.cloneNode(true);
                addBtnHeader.parentNode.replaceChild(newAddBtn, addBtnHeader);
                
                newAddBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openAddItemModal(template.id, items);
                });
            }
        }
    }, 150);
}


// Open add item modal
function openAddItemModal(templateId, existingItems) {
    // Prepare dependency options for dropdown
    const dependencyOptions = existingItems.map(item => ({
        value: item.id,
        label: item.title
    }));

    // Clear all sections and fields first
    addItemModal.clearAll();
    
    // Clear any existing callback first to prevent conflicts
    addItemModal.onSave = null;
    
    // Store templateId and existingItems for use in callback
    const currentTemplateId = templateId;
    const currentExistingItems = existingItems;
    
    addItemModal
        .addSection({
            title: 'Görev Bilgileri',
            icon: 'fas fa-info-circle',
            iconColor: 'text-primary',
            fields: [
                {
                    id: 'department',
                    name: 'department',
                    label: 'Departman',
                    type: 'dropdown',
                    placeholder: 'Departman seçin...',
                    required: true,
                    icon: 'fas fa-building',
                    options: departmentOptions,
                    colSize: 12
                },
                {
                    id: 'title',
                    name: 'title',
                    label: 'Başlık',
                    type: 'text',
                    placeholder: 'Görev başlığı...',
                    required: true,
                    icon: 'fas fa-heading',
                    colSize: 12
                },
                {
                    id: 'sequence',
                    name: 'sequence',
                    label: 'Sıra',
                    type: 'number',
                    placeholder: 'Sıra numarası',
                    value: existingItems.length + 1,
                    min: 1,
                    icon: 'fas fa-sort-numeric-up',
                    colSize: 6
                },
                {
                    id: 'depends_on',
                    name: 'depends_on',
                    label: 'Bağımlılıklar',
                    type: 'dropdown',
                    placeholder: 'Bağımlılık seçin...',
                    multiple: true,
                    searchable: true,
                    options: dependencyOptions,
                    help: 'Bu görevin başlaması için tamamlanması gereken görevler',
                    colSize: 12
                }
            ]
        })
        .render();
    
    // Set save callback AFTER rendering but BEFORE showing to ensure it's ready
    addItemModal.onSaveCallback(async (formData) => {
        try {
            addItemModal.setLoading(true);
            const itemData = {
                department: formData.department,
                title: formData.title,
                sequence: parseInt(formData.sequence) || currentExistingItems.length + 1,
                depends_on: formData.depends_on ? (Array.isArray(formData.depends_on) ? formData.depends_on : [formData.depends_on]).map(id => parseInt(id)) : []
            };
            await addTemplateItem(currentTemplateId, itemData);
            addItemModal.hide();
            showNotification('Görev başarıyla eklendi', 'success');
            
            // Reload items and refresh the manage items modal
            await refreshManageItemsModal();
        } catch (error) {
            console.error('Error adding item:', error);
            showNotification('Görev eklenirken bir hata oluştu', 'error');
        } finally {
            addItemModal.setLoading(false);
        }
    });
    
    // Show modal after callback is set
    addItemModal.show();
}

// Remove item
async function removeItem(itemId) {
    if (!confirm('Bu görevi silmek istediğinizden emin misiniz?')) {
        return;
    }

    try {
        await removeTemplateItem(currentTemplate.id, itemId);
        showNotification('Görev başarıyla silindi', 'success');
        
        // Reload items and refresh the manage items modal
        await refreshManageItemsModal();
    } catch (error) {
        console.error('Error removing item:', error);
        showNotification('Görev silinirken bir hata oluştu', 'error');
    }
}

// Utility functions
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}


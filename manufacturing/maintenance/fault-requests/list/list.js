import { guardRoute } from '../../../../authService.js';
import { initNavbar } from '../../../../components/navbar.js';
import { fetchMachineFaults, resolveMaintenanceRequest } from '../../../../generic/maintenance.js';
import { HeaderComponent } from '../../../../components/header/header.js';
import { StatisticsCards } from '../../../../components/statistics-cards/statistics-cards.js';
import { FiltersComponent } from '../../../../components/filters/filters.js';
import { TableComponent } from '../../../../components/table/table.js';

let allFaults = [];
let filteredFaults = [];
let headerComponent, statisticsCards, filtersComponent, tableComponent;

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    await initNavbar();
    
    // Initialize components
    initializeComponents();
    
    // Load initial data
    await loadFaultRequests();
    
    // Set current user for resolution form
    setCurrentUser();
});

function initializeComponents() {
    // Initialize Header Component
    headerComponent = new HeaderComponent({
        title: 'Arıza Talepleri',
        subtitle: 'Tüm arıza taleplerini görüntüleyin ve yönetin',
        icon: 'exclamation-triangle',
        showBackButton: 'block',
        showCreateButton: 'block',
        createButtonText: 'Yeni Arıza Talebi',
        backUrl: '/manufacturing/maintenance',
        onCreateClick: () => {
            window.location.href = '/manufacturing/maintenance/fault-requests/create';
        }
    });

    // Initialize Statistics Cards Component
    statisticsCards = new StatisticsCards('statistics-container', {
        cards: [
            {
                title: 'Toplam Arıza',
                value: 0,
                icon: 'exclamation-triangle',
                color: 'primary',
                trend: null
            },
            {
                title: 'Bekleyen',
                value: 0,
                icon: 'clock',
                color: 'warning',
                trend: null
            },
            {
                title: 'İşlemde',
                value: 0,
                icon: 'tools',
                color: 'info',
                trend: null
            },
            {
                title: 'Çözüldü',
                value: 0,
                icon: 'check-circle',
                color: 'success',
                trend: null
            }
        ]
    });

    // Initialize Filters Component
    filtersComponent = new FiltersComponent('filters-container', {
        title: 'Filtreler',
        onApply: applyFilters,
        onClear: clearFilters
    });

    // Add filter fields
    filtersComponent.addSelectFilter({
        id: 'statusFilter',
        label: 'Durum',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'pending', label: 'Bekleyen' },
            { value: 'in_progress', label: 'İşlemde' },
            { value: 'resolved', label: 'Çözüldü' },
            { value: 'closed', label: 'Kapatıldı' }
        ],
        colSize: 3
    });

    filtersComponent.addSelectFilter({
        id: 'priorityFilter',
        label: 'Öncelik',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'low', label: 'Düşük' },
            { value: 'medium', label: 'Orta' },
            { value: 'high', label: 'Yüksek' },
            { value: 'critical', label: 'Kritik' }
        ],
        colSize: 3
    });

    filtersComponent.addSelectFilter({
        id: 'machineFilter',
        label: 'Ekipman',
        options: [{ value: '', label: 'Tümü' }],
        colSize: 3
    });

    filtersComponent.addSelectFilter({
        id: 'dateFilter',
        label: 'Tarih Aralığı',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'today', label: 'Bugün' },
            { value: 'week', label: 'Bu Hafta' },
            { value: 'month', label: 'Bu Ay' },
            { value: 'custom', label: 'Özel' }
        ],
        colSize: 3
    });

    // Initialize Table Component
    tableComponent = new TableComponent('table-container', {
        title: 'Arıza Talepleri',
        columns: [
            { 
                field: 'id', 
                label: 'ID', 
                sortable: true,
                formatter: (value) => `<span style="font-weight: 700; color: #0d6efd; font-family: 'Courier New', monospace; font-size: 1rem; background: rgba(13, 110, 253, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; border: 1px solid rgba(13, 110, 253, 0.2);">${value || '-'}</span>`
            },
            { 
                field: 'machine_name', 
                label: 'Ekipman', 
                sortable: true,
                formatter: (value) => `<span style="font-weight: 500; color: #495057;">${value || '-'}</span>`
            },
            { 
                field: 'description', 
                label: 'Açıklama', 
                sortable: false,
                formatter: (value, row) => {
                    if (!value || value.trim() === '') return '-';
                    const truncated = value.length > 100 ? value.substring(0, 100) + '...' : value;
                    return `
                        <span title="${value.replace(/"/g, '&quot;')}">${truncated}</span>
                        ${value.length > 100 ? '<button class="btn btn-link btn-sm p-0 ms-1" onclick="showFullDescription(' + row.id + ')" title="Tam açıklamayı göster"><i class="fas fa-expand-alt"></i></button>' : ''}
                    `;
                }
            },
            { 
                field: 'priority', 
                label: 'Öncelik', 
                sortable: true,
                formatter: (value, row) => getPriorityBadge(row)
            },
            { 
                field: 'status', 
                label: 'Durum', 
                sortable: true,
                formatter: (value, row) => getStatusBadge(row)
            },
            { 
                field: 'reported_by_username', 
                label: 'Bildiren', 
                sortable: true,
                formatter: (value) => `
                    <div style="font-weight: 500; color: #495057;">
                        <i class="fas fa-user-circle me-2 text-muted"></i>
                        ${value || 'Bilinmiyor'}
                    </div>
                `
            },
            { 
                field: 'reported_at', 
                label: 'Bildirilme Tarihi', 
                sortable: true,
                type: 'date'
            },
            { 
                field: 'resolved_by_username', 
                label: 'Çözen', 
                sortable: true,
                formatter: (value) => value || '-'
            },
            { 
                field: 'resolved_at', 
                label: 'Çözüm Tarihi', 
                sortable: true,
                type: 'date',
                formatter: (value) => value ? null : '-' // Let the table component handle date formatting
            },
            { 
                field: 'resolution_description', 
                label: 'Çözüm Açıklaması', 
                sortable: false,
                formatter: (value, row) => {
                    if (!value || value.trim() === '') return '-';
                    const truncated = value.length > 80 ? value.substring(0, 80) + '...' : value;
                    return `
                        <span title="${value.replace(/"/g, '&quot;')}">${truncated}</span>
                        ${value.length > 80 ? '<button class="btn btn-link btn-sm p-0 ms-1" onclick="showFullResolution(' + row.id + ')" title="Tam çözümü göster"><i class="fas fa-expand-alt"></i></button>' : ''}
                    `;
                }
            }
        ],
        pagination: true,
        itemsPerPage: 10,
        refreshable: true,
        exportable: true,
        onRefresh: loadFaultRequests,
        onExport: exportToExcel,
        onRowClick: (row) => {
            // Handle row click if needed
        }
    });
}

async function loadFaultRequests() {
    try {
        tableComponent.setLoading(true);
        
        // Fetch fault requests from API
        const faults = await fetchMachineFaults();
        
        allFaults = faults;
        filteredFaults = [...allFaults];
        
        // Update statistics
        updateStatistics();
        
        // Update table data
        updateTableData();
        
        // Load machines for filter
        loadMachinesForFilter();
        
    } catch (error) {
        console.error('Error loading fault requests:', error);
        showAlert('Arıza talepleri yüklenirken hata oluştu.', 'danger');
    } finally {
        tableComponent.setLoading(false);
    }
}

function updateStatistics() {
    const total = allFaults.length;
    const pending = allFaults.filter(fault => getStatus(fault) === 'pending').length;
    const inProgress = allFaults.filter(fault => getStatus(fault) === 'in_progress').length;
    const resolved = allFaults.filter(fault => getStatus(fault) === 'resolved' || getStatus(fault) === 'closed').length;
    
    statisticsCards.updateValues({
        0: total,
        1: pending,
        2: inProgress,
        3: resolved
    });
}

function updateTableData() {
    // The table component will now handle formatting through column formatters
    // We just need to pass the raw data
    const tableData = filteredFaults.map(fault => ({
        ...fault,
        actions: getActionButtons(fault)
    }));
    
    tableComponent.updateData(tableData);
}

function getStatus(fault) {
    if (fault.resolved_at) {
        return 'resolved';
    }
    if (fault.is_breaking) {
        return 'in_progress';
    }
    return 'pending';
}

// Removed getPriorityBadge and getStatusBadge functions - now handled by table component formatters

function getActionButtons(fault) {
    const buttons = [];
    
    // View button
    buttons.push(`<button type="button" class="btn btn-outline-primary" onclick="viewFault(${fault.id})" title="Görüntüle">
        <i class="fas fa-eye"></i>
    </button>`);
    
    // Resolve button (only for pending/in_progress)
    if (getStatus(fault) === 'pending' || getStatus(fault) === 'in_progress') {
        buttons.push(`<button type="button" class="btn btn-outline-success" onclick="resolveFault(${fault.id})" title="Çöz">
            <i class="fas fa-tools"></i>
        </button>`);
    }
    
    // Edit button
    buttons.push(`<button type="button" class="btn btn-outline-secondary" onclick="editFault(${fault.id})" title="Düzenle">
        <i class="fas fa-edit"></i>
    </button>`);
    
    return `<div class="btn-group btn-group-sm" role="group">${buttons.join('')}</div>`;
}

// Removed formatDate function - now handled by table component date formatting

function loadMachinesForFilter() {
    const machines = [...new Set(allFaults.map(fault => fault.machine_name).filter(Boolean))];
    const machineOptions = [{ value: '', label: 'Tümü' }];
    
    machines.forEach(machine => {
        machineOptions.push({ value: machine, label: machine });
    });
    
    filtersComponent.updateFilterOptions('machineFilter', machineOptions);
}

function applyFilters() {
    const filterValues = filtersComponent.getFilterValues();
    const statusFilter = filterValues.statusFilter;
    const priorityFilter = filterValues.priorityFilter;
    const machineFilter = filterValues.machineFilter;
    const dateFilter = filterValues.dateFilter;
    
    filteredFaults = allFaults.filter(fault => {
        // Status filter
        if (statusFilter && getStatus(fault) !== statusFilter) {
            return false;
        }
        
        // Priority filter
        if (priorityFilter) {
            const faultPriority = fault.is_breaking ? 'critical' : (fault.is_maintenance ? 'medium' : 'low');
            if (faultPriority !== priorityFilter) {
                return false;
            }
        }
        
        // Machine filter
        if (machineFilter && fault.machine_name !== machineFilter) {
            return false;
        }
        
        // Date filter
        if (dateFilter) {
            const faultDate = new Date(fault.reported_at);
            const today = new Date();
            
            switch (dateFilter) {
                case 'today':
                    if (faultDate.toDateString() !== today.toDateString()) {
                        return false;
                    }
                    break;
                case 'week':
                    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
                    if (faultDate < weekAgo) {
                        return false;
                    }
                    break;
                case 'month':
                    const monthAgo = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
                    if (faultDate < monthAgo) {
                        return false;
                    }
                    break;
            }
        }
        
        return true;
    });
    
    updateTableData();
}

function clearFilters() {
    filtersComponent.clearFilters();
    filteredFaults = [...allFaults];
    updateTableData();
}

function exportToExcel() {
    // Implementation for Excel export
    // You can implement the actual export logic here
}

function viewFault(faultId) {
    // Implementation for viewing fault details
    // You can implement a modal or navigation to detail page
}

function resolveFault(faultId) {
    document.getElementById('faultId').value = faultId;
    
    // Set current date and time
    const now = new Date();
    const dateTimeLocal = now.toISOString().slice(0, 16);
    document.getElementById('resolutionDate').value = dateTimeLocal;
    
    // Clear previous form data
    document.getElementById('resolutionDescription').value = '';
    
    const modal = new bootstrap.Modal(document.getElementById('resolutionModal'));
    modal.show();
}

function editFault(faultId) {
    // Implementation for editing fault
    // You can implement navigation to edit page
}

async function submitResolution() {
    const faultId = document.getElementById('faultId').value;
    const description = document.getElementById('resolutionDescription').value;
    const date = document.getElementById('resolutionDate').value;
    const resolvedBy = document.getElementById('resolvedBy').value;
    
    if (!description || !date || !resolvedBy) {
        showAlert('Lütfen tüm alanları doldurun.', 'warning');
        return;
    }
    
    try {
        await resolveMaintenanceRequest(faultId, {
            resolution_description: description,
            resolved_at: date,
            resolved_by: resolvedBy
        });
        
        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('resolutionModal'));
        modal.hide();
        
        // Reload data
        await loadFaultRequests();
        
        showAlert('Arıza çözümü başarıyla kaydedildi.', 'success');
        
    } catch (error) {
        console.error('Error submitting resolution:', error);
        showAlert('Arıza çözümü kaydedilirken hata oluştu.', 'danger');
    }
}

function setCurrentUser() {
    // Set current user for resolution form
    const currentUser = localStorage.getItem('currentUser');
    if (currentUser) {
        try {
            const user = JSON.parse(currentUser);
            document.getElementById('resolvedBy').value = user.username || '';
        } catch (error) {
            console.error('Error parsing current user:', error);
        }
    }
}

function showAlert(message, type = 'info') {
    // Create and show alert
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    alertDiv.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(alertDiv);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.remove();
        }
    }, 5000);
}

// Badge utility functions (similar to pending requests)
function getStatusBadge(fault) {
    if (fault.resolved_at) {
        return '<span class="table-status-badge completed">Çözüldü</span>';
    }
    if (fault.is_breaking) {
        return '<span class="table-status-badge pending">Makine Duruşta</span>';
    }
    return '<span class="table-status-badge worked-on">Bekleyen</span>';
}

function getPriorityBadge(fault) {
    if (fault.is_breaking) {
        return '<span class="table-status-badge pending">Kritik</span>';
    }
    if (fault.is_maintenance) {
        return '<span class="table-status-badge worked-on">Orta</span>';
    }
    return '<span class="table-status-badge completed">Düşük</span>';
}

// Functions for showing full descriptions and resolutions
function showFullDescription(faultId) {
    const fault = allFaults.find(f => f.id === faultId);
    if (fault && fault.description) {
        showAlert(fault.description, 'info');
    }
}

function showFullResolution(faultId) {
    const fault = allFaults.find(f => f.id === faultId);
    if (fault && fault.resolution_description) {
        showAlert(fault.resolution_description, 'info');
    }
}

// Make functions globally available for onclick handlers
window.resolveFault = resolveFault;
window.viewFault = viewFault;
window.editFault = editFault;
window.submitResolution = submitResolution;
window.showFullDescription = showFullDescription;
window.showFullResolution = showFullResolution;

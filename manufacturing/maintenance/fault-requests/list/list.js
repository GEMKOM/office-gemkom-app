import { guardRoute } from '../../../../authService.js';
import { initNavbar } from '../../../../components/navbar.js';
import { fetchMachineFaults, resolveMaintenanceRequest } from '../../../../generic/maintenance.js';

let currentPage = 1;
let itemsPerPage = 10;
let allFaults = [];
let filteredFaults = [];

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    await initNavbar();
    
    // Load initial data
    await loadFaultRequests();
    
    // Initialize filters
    initializeFilters();
    
    // Set current user for resolution form
    setCurrentUser();
});

async function loadFaultRequests() {
    try {
        showLoading(true);
        
        // Fetch fault requests from API
        const faults = await fetchMachineFaults();
        allFaults = faults;
        filteredFaults = [...allFaults];
        
        // Update statistics
        updateStatistics();
        
        // Render table
        renderTable();
        
        // Load machines for filter
        loadMachinesForFilter();
        
    } catch (error) {
        console.error('Error loading fault requests:', error);
        showAlert('Arıza talepleri yüklenirken hata oluştu.', 'danger');
    } finally {
        showLoading(false);
    }
}

function updateStatistics() {
    const total = allFaults.length;
    const pending = allFaults.filter(fault => fault.status === 'pending').length;
    const inProgress = allFaults.filter(fault => fault.status === 'in_progress').length;
    const resolved = allFaults.filter(fault => fault.status === 'resolved' || fault.status === 'closed').length;
    
    document.getElementById('totalFaults').textContent = total;
    document.getElementById('pendingFaults').textContent = pending;
    document.getElementById('inProgressFaults').textContent = inProgress;
    document.getElementById('resolvedFaults').textContent = resolved;
}

function renderTable() {
    const tableBody = document.getElementById('faultRequestsTableBody');
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageData = filteredFaults.slice(startIndex, endIndex);
    
    tableBody.innerHTML = '';
    
    if (pageData.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center text-muted py-4">
                    <i class="fas fa-inbox fa-3x mb-3"></i>
                    <p>Arıza talebi bulunamadı</p>
                </td>
            </tr>
        `;
        return;
    }
    
    pageData.forEach(fault => {
        const row = document.createElement('tr');
        row.className = `priority-${fault.priority}`;
        
        row.innerHTML = `
            <td><strong>#${fault.id}</strong></td>
            <td>
                <div class="d-flex align-items-center">
                    <i class="fas fa-cog me-2 text-muted"></i>
                    <span>${fault.machine_name || 'Bilinmeyen Ekipman'}</span>
                </div>
            </td>
            <td>
                <div class="fault-title">
                    <strong>${fault.title}</strong>
                    <br>
                    <small class="text-muted">${fault.description.substring(0, 50)}${fault.description.length > 50 ? '...' : ''}</small>
                </div>
            </td>
            <td>
                <span class="badge ${getPriorityBadgeClass(fault.priority)}">
                    ${getPriorityText(fault.priority)}
                </span>
            </td>
            <td>
                <span class="badge ${getStatusBadgeClass(fault.status)}">
                    ${getStatusText(fault.status)}
                </span>
            </td>
            <td>
                <div class="d-flex align-items-center">
                    <i class="fas fa-user me-2 text-muted"></i>
                    <span>${fault.reported_by}</span>
                </div>
            </td>
            <td>
                <div class="d-flex align-items-center">
                    <i class="fas fa-calendar me-2 text-muted"></i>
                    <span>${formatDate(fault.fault_date)}</span>
                </div>
            </td>
            <td>
                <div class="btn-group" role="group">
                    <button type="button" class="btn btn-sm btn-outline-primary" 
                            onclick="viewFaultDetails(${fault.id})" title="Detayları Görüntüle">
                        <i class="fas fa-eye"></i>
                    </button>
                    ${fault.status === 'pending' || fault.status === 'in_progress' ? `
                        <button type="button" class="btn btn-sm btn-outline-success" 
                                onclick="openResolutionModal(${fault.id})" title="Çözüm Ekle">
                            <i class="fas fa-tools"></i>
                        </button>
                    ` : ''}
                    <button type="button" class="btn btn-sm btn-outline-info" 
                            onclick="editFault(${fault.id})" title="Düzenle">
                        <i class="fas fa-edit"></i>
                    </button>
                </div>
            </td>
        `;
        
        tableBody.appendChild(row);
    });
    
    // Update pagination
    renderPagination();
    
    // Update total records
    document.getElementById('totalRecords').textContent = filteredFaults.length;
}

function renderPagination() {
    const totalPages = Math.ceil(filteredFaults.length / itemsPerPage);
    const pagination = document.getElementById('pagination');
    
    pagination.innerHTML = '';
    
    if (totalPages <= 1) return;
    
    // Previous button
    const prevLi = document.createElement('li');
    prevLi.className = `page-item ${currentPage === 1 ? 'disabled' : ''}`;
    prevLi.innerHTML = `
        <button class="page-link" onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>
            <i class="fas fa-chevron-left"></i>
        </button>
    `;
    pagination.appendChild(prevLi);
    
    // Page numbers
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);
    
    for (let i = startPage; i <= endPage; i++) {
        const pageLi = document.createElement('li');
        pageLi.className = `page-item ${i === currentPage ? 'active' : ''}`;
        pageLi.innerHTML = `
            <button class="page-link" onclick="changePage(${i})">${i}</button>
        `;
        pagination.appendChild(pageLi);
    }
    
    // Next button
    const nextLi = document.createElement('li');
    nextLi.className = `page-item ${currentPage === totalPages ? 'disabled' : ''}`;
    nextLi.innerHTML = `
        <button class="page-link" onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>
            <i class="fas fa-chevron-right"></i>
        </button>
    `;
    pagination.appendChild(nextLi);
}

function changePage(page) {
    const totalPages = Math.ceil(filteredFaults.length / itemsPerPage);
    if (page < 1 || page > totalPages) return;
    
    currentPage = page;
    renderTable();
}

function initializeFilters() {
    // Add event listeners for filter changes
    document.getElementById('statusFilter').addEventListener('change', applyFilters);
    document.getElementById('priorityFilter').addEventListener('change', applyFilters);
    document.getElementById('machineFilter').addEventListener('change', applyFilters);
    document.getElementById('dateFilter').addEventListener('change', applyFilters);
}

function applyFilters() {
    const statusFilter = document.getElementById('statusFilter').value;
    const priorityFilter = document.getElementById('priorityFilter').value;
    const machineFilter = document.getElementById('machineFilter').value;
    const dateFilter = document.getElementById('dateFilter').value;
    
    filteredFaults = allFaults.filter(fault => {
        // Status filter
        if (statusFilter && fault.status !== statusFilter) return false;
        
        // Priority filter
        if (priorityFilter && fault.priority !== priorityFilter) return false;
        
        // Machine filter
        if (machineFilter && fault.machine_id !== parseInt(machineFilter)) return false;
        
        // Date filter
        if (dateFilter) {
            const faultDate = new Date(fault.fault_date);
            const today = new Date();
            
            switch (dateFilter) {
                case 'today':
                    if (!isSameDay(faultDate, today)) return false;
                    break;
                case 'week':
                    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
                    if (faultDate < weekAgo) return false;
                    break;
                case 'month':
                    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
                    if (faultDate < monthAgo) return false;
                    break;
            }
        }
        
        return true;
    });
    
    currentPage = 1;
    updateStatistics();
    renderTable();
}

function clearFilters() {
    document.getElementById('statusFilter').value = '';
    document.getElementById('priorityFilter').value = '';
    document.getElementById('machineFilter').value = '';
    document.getElementById('dateFilter').value = '';
    
    filteredFaults = [...allFaults];
    currentPage = 1;
    updateStatistics();
    renderTable();
}

function loadMachinesForFilter() {
    const machineFilter = document.getElementById('machineFilter');
    const machines = [...new Set(allFaults.map(fault => ({ id: fault.machine_id, name: fault.machine_name })))];
    
    machines.forEach(machine => {
        const option = document.createElement('option');
        option.value = machine.id;
        option.textContent = machine.name;
        machineFilter.appendChild(option);
    });
}

function setCurrentUser() {
    const currentUser = localStorage.getItem('currentUser') || 'Kullanıcı';
    document.getElementById('resolvedBy').value = currentUser;
}

function openResolutionModal(faultId) {
    document.getElementById('faultId').value = faultId;
    
    // Set current date and time
    const now = new Date();
    const dateTimeLocal = now.toISOString().slice(0, 16);
    document.getElementById('resolutionDate').value = dateTimeLocal;
    
    // Clear previous form data
    document.getElementById('resolutionDescription').value = '';
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('resolutionModal'));
    modal.show();
}

async function submitResolution() {
    const faultId = document.getElementById('faultId').value;
    const resolutionDescription = document.getElementById('resolutionDescription').value;
    const resolutionDate = document.getElementById('resolutionDate').value;
    const resolvedBy = document.getElementById('resolvedBy').value;
    
    if (!resolutionDescription.trim()) {
        showAlert('Çözüm açıklaması zorunludur.', 'warning');
        return;
    }
    
    try {
        await resolveMaintenanceRequest(faultId, resolutionDescription);
        
        showAlert('Arıza çözümü başarıyla kaydedildi!', 'success');
        
        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('resolutionModal'));
        modal.hide();
        
        // Refresh data
        await loadFaultRequests();
        
    } catch (error) {
        console.error('Error resolving fault:', error);
        showAlert('Arıza çözümü kaydedilirken hata oluştu: ' + error.message, 'danger');
    }
}

function viewFaultDetails(faultId) {
    // This would typically open a detailed view modal or navigate to a detail page
    showAlert('Detay görüntüleme özelliği yakında eklenecek.', 'info');
}

function editFault(faultId) {
    // This would typically navigate to an edit page or open an edit modal
    showAlert('Düzenleme özelliği yakında eklenecek.', 'info');
}

function exportToExcel() {
    // This would typically export the filtered data to Excel
    showAlert('Excel export özelliği yakında eklenecek.', 'info');
}

function refreshTable() {
    loadFaultRequests();
}

// Utility functions
function getPriorityBadgeClass(priority) {
    switch (priority) {
        case 'critical': return 'bg-danger';
        case 'high': return 'bg-warning';
        case 'medium': return 'bg-info';
        case 'low': return 'bg-success';
        default: return 'bg-secondary';
    }
}

function getPriorityText(priority) {
    switch (priority) {
        case 'critical': return 'Kritik';
        case 'high': return 'Yüksek';
        case 'medium': return 'Orta';
        case 'low': return 'Düşük';
        default: return 'Bilinmiyor';
    }
}

function getStatusBadgeClass(status) {
    switch (status) {
        case 'pending': return 'bg-warning';
        case 'in_progress': return 'bg-info';
        case 'resolved': return 'bg-success';
        case 'closed': return 'bg-secondary';
        default: return 'bg-secondary';
    }
}

function getStatusText(status) {
    switch (status) {
        case 'pending': return 'Bekleyen';
        case 'in_progress': return 'İşlemde';
        case 'resolved': return 'Çözüldü';
        case 'closed': return 'Kapatıldı';
        default: return 'Bilinmiyor';
    }
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('tr-TR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function isSameDay(date1, date2) {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
}

function showLoading(show) {
    const tableBody = document.getElementById('faultRequestsTableBody');
    if (show) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-4">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Yükleniyor...</span>
                    </div>
                    <p class="mt-2 text-muted">Arıza talepleri yükleniyor...</p>
                </td>
            </tr>
        `;
    }
}

function showAlert(message, type) {
    // Remove existing alerts
    const existingAlert = document.querySelector('.alert');
    if (existingAlert) {
        existingAlert.remove();
    }
    
    // Create new alert
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    alertDiv.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(alertDiv);
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.remove();
        }
    }, 5000);
}

// Make functions available globally
window.applyFilters = applyFilters;
window.clearFilters = clearFilters;
window.changePage = changePage;
window.openResolutionModal = openResolutionModal;
window.submitResolution = submitResolution;
window.viewFaultDetails = viewFaultDetails;
window.editFault = editFault;
window.exportToExcel = exportToExcel;
window.refreshTable = refreshTable;

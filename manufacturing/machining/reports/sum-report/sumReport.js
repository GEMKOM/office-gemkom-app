import { initNavbar } from '../../../../components/navbar.js';
import { ModernDropdown } from '../../../../components/dropdown.js';
import { fetchMachines } from '../../../../generic/machines.js';
import { fetchUsers } from '../../../../generic/users.js';
import { backendBase } from '../../../../base.js';
import { authedFetch } from '../../../../authService.js';

// Sum Report JavaScript
let reportData = [];
let currentSortField = 'group';
let currentSortDirection = 'asc';
let groupByFilterDropdown = null;

// Initialize the report
document.addEventListener('DOMContentLoaded', async () => {
    await initNavbar();
    await initializeSumReport();
});

async function initializeSumReport() {
    try {
        // Initialize group by dropdown
        initializeGroupByDropdown();
        
        // Set default date filters
        setDefaultDateFilters();
        
        // Setup event listeners
        setupEventListeners();
        
        // Initialize sortable headers
        initializeSortableHeaders();
        
        // Load initial report
        await loadReport();
        
    } catch (error) {
        console.error('Error initializing sum report:', error);
        showNotification('Rapor başlatılırken hata oluştu', 'error');
    }
}

function initializeGroupByDropdown() {
    const groupByFilterContainer = document.getElementById('group-by-filter-container');
    
    if (groupByFilterContainer) {
        const groupByItems = [
            { value: 'user', text: 'Kullanıcı' },
            { value: 'machine', text: 'Makine' },
            { value: 'job_no', text: 'İş No' },
            { value: 'issue_key', text: 'TI Numarası' }
        ];
        
        groupByFilterDropdown = new ModernDropdown(groupByFilterContainer, {
            placeholder: 'Gruplama Seçin',
            searchable: false
        });
        groupByFilterDropdown.setItems(groupByItems);
        
        // Set default value
        groupByFilterDropdown.setValue('user');
    }
}

function setDefaultDateFilters() {
    const today = new Date();
    
    // Set default start datetime (today at 07:00)
    const startDate = new Date(today);
    startDate.setHours(7, 0, 0, 0);
    const startDatetimeFilter = document.getElementById('start-datetime-filter');
    if (startDatetimeFilter) {
        const startYear = startDate.getFullYear();
        const startMonth = String(startDate.getMonth() + 1).padStart(2, '0');
        const startDay = String(startDate.getDate()).padStart(2, '0');
        const startHour = String(startDate.getHours()).padStart(2, '0');
        const startMinute = String(startDate.getMinutes()).padStart(2, '0');
        startDatetimeFilter.value = `${startYear}-${startMonth}-${startDay}T${startHour}:${startMinute}`;
    }
    
    // Set default finish datetime (today at 17:15)
    const finishDate = new Date(today);
    finishDate.setHours(17, 15, 0, 0);
    const finishDatetimeFilter = document.getElementById('finish-datetime-filter');
    if (finishDatetimeFilter) {
        const finishYear = finishDate.getFullYear();
        const finishMonth = String(finishDate.getMonth() + 1).padStart(2, '0');
        const finishDay = String(finishDate.getDate()).padStart(2, '0');
        const finishHour = String(finishDate.getHours()).padStart(2, '0');
        const finishMinute = String(finishDate.getMinutes()).padStart(2, '0');
        finishDatetimeFilter.value = `${finishYear}-${finishMonth}-${finishDay}T${finishHour}:${finishMinute}`;
    }
}

function setupEventListeners() {
    // Filter buttons
    document.getElementById('apply-filters').addEventListener('click', () => {
        loadReport();
    });
    
    document.getElementById('clear-filters').addEventListener('click', clearFilters);
    
    // Refresh and export buttons
    document.getElementById('refresh-report').addEventListener('click', () => {
        loadReport();
    });
    
    document.getElementById('export-report').addEventListener('click', exportReport);
    
    // Back button
    document.getElementById('back-to-main').addEventListener('click', () => {
        window.location.href = '../';
    });
    
    // Enter key functionality for filters
    const filterInputs = [
        'start-datetime-filter',
        'finish-datetime-filter'
    ];
    
    filterInputs.forEach(inputId => {
        const input = document.getElementById(inputId);
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    loadReport();
                }
            });
        }
    });
}

function initializeSortableHeaders() {
    document.querySelectorAll('.sortable').forEach(header => {
        header.addEventListener('click', () => {
            const field = header.getAttribute('data-field');
            handleColumnSort(field);
        });
    });
    
    // Set initial sort state
    updateSortIcons();
}

function updateSortIcons() {
    document.querySelectorAll('.sortable').forEach(header => {
        const icon = header.querySelector('.sort-icon');
        const headerField = header.getAttribute('data-field');
        
        if (headerField === currentSortField) {
            icon.className = `fas fa-sort-${currentSortDirection === 'asc' ? 'up' : 'down'} sort-icon`;
        } else {
            icon.className = 'fas fa-sort sort-icon';
        }
    });
}

function handleColumnSort(field) {
    if (currentSortField === field) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortField = field;
        currentSortDirection = 'desc';
    }
    
    updateSortIcons();
    
    // Re-sort the existing data
    sortReportData();
    renderReportTable();
}

async function loadReport() {
    try {
        showLoadingState();
        
        const query = buildReportQuery();
        const response = await authedFetch(`${backendBase}/machining/timer-report/?${query}`);
        
        if (!response.ok) {
            throw new Error('Rapor yüklenemedi');
        }
        
        const data = await response.json();
        reportData = await processReportData(data);
        
        // Apply initial sorting
        sortReportData();
        
        renderReportTable();
        updateStatistics();
        
    } catch (error) {
        console.error('Error loading report:', error);
        showNotification('Rapor yüklenirken hata oluştu', 'error');
    } finally {
        hideLoadingState();
    }
}

function buildReportQuery() {
    const params = new URLSearchParams();
    
    // Group by
    const groupBy = groupByFilterDropdown?.getValue() || 'user';
    params.append('group_by', groupBy);
    
    // Datetime filters
    const startDatetime = document.getElementById('start-datetime-filter').value;
    const finishDatetime = document.getElementById('finish-datetime-filter').value;
    
    if (startDatetime) {
        const startTimestamp = new Date(startDatetime).getTime();
        params.append('start_after', Math.floor(startTimestamp));
    }
    
    if (finishDatetime) {
        const finishTimestamp = new Date(finishDatetime).getTime();
        params.append('start_before', Math.floor(finishTimestamp));
    }
    
    // Additional filters
    const manualOnly = document.getElementById('manual-only-filter').checked;
    
    if (manualOnly) {
        params.append('manual_only', 'true');
    }
    
    return params.toString();
}

function toTimestamp(datetime) {
    if (!datetime) return null;
    const dt = new Date(datetime);
    return dt.getTime();
}

async function processReportData(data) {
    const groupBy = groupByFilterDropdown?.getValue() || 'user';
    let processedData = [];
    
    if (groupBy === 'user') {
        const users = await fetchUsers('machining');
        processedData = users.map(user => {
            const found = data.find(row => row.group === user.username);
            return {
                group: user.display_name || user.username || user.id,
                total_hours: found ? found.total_hours : 0,
                timer_count: found ? found.timer_count : 0,
                avg_hours: found ? (found.total_hours / found.timer_count) : 0
            };
        });
    } else if (groupBy === 'machine') {
        const machines = await fetchMachines('machining');
        processedData = machines.map(machine => {
            const found = data.find(row => row.group === machine.id);
            return {
                group: machine.name || machine.id,
                total_hours: found ? found.total_hours : 0,
                timer_count: found ? found.timer_count : 0,
                avg_hours: found ? (found.total_hours / found.timer_count) : 0
            };
        });
    } else {
        // Default: use data as is, preserving server order
        processedData = data.map(row => ({
            group: Object.values(row)[0],
            total_hours: row.total_hours || 0,
            timer_count: row.timer_count || 0,
            avg_hours: row.timer_count ? (row.total_hours / row.timer_count) : 0
        }));
    }
    
    return processedData;
}

function sortReportData() {
    if (!reportData || reportData.length === 0) return;
    
    reportData.sort((a, b) => {
        let aValue, bValue;
        
        if (currentSortField === 'group') {
            aValue = a.group || '';
            bValue = b.group || '';
            
            if (currentSortDirection === 'asc') {
                return aValue.localeCompare(bValue);
            } else {
                return bValue.localeCompare(aValue);
            }
        } else {
            aValue = a[currentSortField] || 0;
            bValue = b[currentSortField] || 0;
            
            if (currentSortDirection === 'asc') {
                return aValue - bValue;
            } else {
                return bValue - aValue;
            }
        }
    });
}

function renderReportTable() {
    const tbody = document.getElementById('report-table-body');
    
    if (reportData.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center text-muted py-4">
                    <i class="fas fa-inbox fa-2x mb-2"></i><br>
                    Rapor verisi bulunamadı
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = reportData.map(row => `
        <tr>
            <td>
                <span class="group-name">${row.group}</span>
            </td>
            <td>
                <span class="hours-badge">
                    ${(row.total_hours || 0).toFixed(2)}
                </span>
            </td>
            <td>
                <span class="count-badge">
                    ${row.timer_count || 0}
                </span>
            </td>
            <td>
                <span class="avg-badge">
                    ${(row.avg_hours || 0).toFixed(2)}
                </span>
            </td>
        </tr>
    `).join('');
}

function updateStatistics() {
    const totalHours = reportData.reduce((sum, row) => sum + (row.total_hours || 0), 0);
    const totalTimers = reportData.reduce((sum, row) => sum + (row.timer_count || 0), 0);
    const uniqueGroups = new Set(reportData.map(row => row.group)).size;
    
    // Update statistics cards
    animateNumber('total-hours', totalHours.toFixed(2));
    animateNumber('total-jobs', uniqueGroups);
    
    // Update group-specific counts based on current grouping
    const groupBy = groupByFilterDropdown?.getValue() || 'user';
    if (groupBy === 'user') {
        animateNumber('total-users-count', uniqueGroups);
        animateNumber('total-machines-count', 0);
    } else if (groupBy === 'machine') {
        animateNumber('total-machines-count', uniqueGroups);
        animateNumber('total-users-count', 0);
    } else {
        animateNumber('total-users-count', 0);
        animateNumber('total-machines-count', 0);
    }
}

function animateNumber(elementId, targetValue) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const currentValue = parseFloat(element.textContent) || 0;
    const target = parseFloat(targetValue) || 0;
    const duration = 1000;
    const startTime = Date.now();
    
    function updateNumber() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        const current = currentValue + (target - currentValue) * progress;
        element.textContent = current.toFixed(2);
        
        if (progress < 1) {
            requestAnimationFrame(updateNumber);
        } else {
            element.textContent = target.toFixed(2);
        }
    }
    
    updateNumber();
}

function clearFilters() {
    document.getElementById('start-datetime-filter').value = '';
    document.getElementById('finish-datetime-filter').value = '';
    document.getElementById('manual-only-filter').checked = false;
    
    // Reset dropdown to default
    if (groupByFilterDropdown) {
        groupByFilterDropdown.setValue('user');
    }
    
    setDefaultDateFilters();
    loadReport();
}

async function exportReport() {
    try {
        const query = buildReportQuery();
        const exportUrl = `${backendBase}/machining/timer-report/export/?${query}`;
        
        // Create a temporary link to trigger download
        const link = document.createElement('a');
        link.href = exportUrl;
        link.download = `toplam-raporu-${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification('Rapor başarıyla indiriliyor', 'success');
    } catch (error) {
        console.error('Error exporting report:', error);
        showNotification('Rapor indirilirken hata oluştu', 'error');
    }
}

function showLoadingState() {
    const tbody = document.getElementById('report-table-body');
    tbody.innerHTML = `
        <tr>
            <td colspan="4" class="text-center py-4">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Yükleniyor...</span>
                </div>
                <div class="mt-2">Rapor yükleniyor...</div>
            </td>
        </tr>
    `;
}

function hideLoadingState() {
    // Loading state is handled in renderReportTable
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show position-fixed`;
    notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
    notification.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);
} 
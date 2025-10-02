import { initNavbar } from '../../../../components/navbar.js';
import { ModernDropdown } from '../../../../components/dropdown.js';
import { fetchMachines } from '../../../../apis/machines.js';
import { fetchUsers } from '../../../../apis/users.js';
import { backendBase } from '../../../../base.js';
import { authedFetch } from '../../../../authService.js';
import { HeaderComponent } from '../../../../components/header/header.js';
import { FiltersComponent } from '../../../../components/filters/filters.js';
import { StatisticsCards } from '../../../../components/statistics-cards/statistics-cards.js';

// Sum Report JavaScript
let reportData = [];
let currentSortField = 'group';
let currentSortDirection = 'asc';
let reportFilters = null; // Filters component instance

// Header component instance
let headerComponent;

// Statistics Cards component instance
let sumReportStats = null;

// Initialize the report
document.addEventListener('DOMContentLoaded', async () => {
    await initNavbar();
    
    // Initialize header component
    initHeaderComponent();
    
    // Initialize Statistics Cards component
    sumReportStats = new StatisticsCards('sum-report-statistics', {
        cards: [
            { title: 'Toplam Kullanıcı', value: '0', icon: 'fas fa-users', color: 'primary', id: 'total-users-count' },
            { title: 'Toplam Makine', value: '0', icon: 'fas fa-cogs', color: 'success', id: 'total-machines-count' },
            { title: 'Toplam Saat', value: '0', icon: 'fas fa-clock', color: 'info', id: 'total-hours' },
            { title: 'Toplam İş', value: '0', icon: 'fas fa-tasks', color: 'warning', id: 'total-jobs' }
        ],
        compact: true,
        animation: true
    });
    
    await initializeSumReport();
});

// Initialize header component
function initHeaderComponent() {
    headerComponent = new HeaderComponent({
        title: 'Toplam Raporu',
        subtitle: 'Talaşlı imalat süreçlerinin gruplandırılmış analizi',
        icon: 'chart-pie',
        showBackButton: 'block',
        showRefreshButton: 'block',
        showExportButton: 'block',
        refreshButtonText: 'Yenile',
        exportButtonText: 'Dışa Aktar',
        onBackClick: () => {
            window.location.href = '../';
        },
        onRefreshClick: () => {
            loadReport();
        },
        onExportClick: () => {
            exportReport();
        }
    });
}

async function initializeSumReport() {
    try {
        // Initialize filters component
        initializeFiltersComponent();
        
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

function initializeFiltersComponent() {
    // Initialize filters component
    reportFilters = new FiltersComponent('filters-placeholder', {
        title: 'Rapor Filtreleri',
        onApply: (values) => {
            // Apply filters and reload report
            loadReport();
        },
        onClear: () => {
            // Clear filters and reload report
            loadReport();
            showNotification('Filtreler temizlendi', 'info');
        },
        onFilterChange: (filterId, value) => {
            // Optional: Handle individual filter changes
            console.log(`Filter ${filterId} changed to:`, value);
        }
    });

    // Add group by dropdown filter
    reportFilters.addDropdownFilter({
        id: 'group-by-filter',
        label: 'Gruplama',
        options: [
            { value: 'user', label: 'Kullanıcı' },
            { value: 'machine', label: 'Makine' },
            { value: 'job_no', label: 'İş No' },
            { value: 'issue_key', label: 'TI Numarası' }
        ],
        placeholder: 'Kullanıcı',
        value: 'user',
        colSize: 3
    });

    // Add datetime filters
    reportFilters.addDatetimeFilter({
        id: 'start-datetime-filter',
        label: 'Başlangıç',
        colSize: 3
    });

    reportFilters.addDatetimeFilter({
        id: 'finish-datetime-filter',
        label: 'Bitiş',
        colSize: 3
    });

    // Add checkbox filter
    reportFilters.addCheckboxFilter({
        id: 'manual-only-filter',
        label: 'Sadece Manuel Girişler',
        checked: false,
        colSize: 3
    });
}



function setDefaultDateFilters() {
    const today = new Date();
    
    // Set default start datetime (today at 07:00)
    const startDate = new Date(today);
    startDate.setHours(7, 0, 0, 0);
    const startYear = startDate.getFullYear();
    const startMonth = String(startDate.getMonth() + 1).padStart(2, '0');
    const startDay = String(startDate.getDate()).padStart(2, '0');
    const startHour = String(startDate.getHours()).padStart(2, '0');
    const startMinute = String(startDate.getMinutes()).padStart(2, '0');
    const startDatetime = `${startYear}-${startMonth}-${startDay}T${startHour}:${startMinute}`;
    
    // Set default finish datetime (today at 17:15)
    const finishDate = new Date(today);
    finishDate.setHours(17, 15, 0, 0);
    const finishYear = finishDate.getFullYear();
    const finishMonth = String(finishDate.getMonth() + 1).padStart(2, '0');
    const finishDay = String(finishDate.getDate()).padStart(2, '0');
    const finishHour = String(finishDate.getHours()).padStart(2, '0');
    const finishMinute = String(finishDate.getMinutes()).padStart(2, '0');
    const finishDatetime = `${finishYear}-${finishMonth}-${finishDay}T${finishHour}:${finishMinute}`;
    
    if (reportFilters) {
        reportFilters.setFilterValues({
            'start-datetime-filter': startDatetime,
            'finish-datetime-filter': finishDatetime
        });
    }
}

function setupEventListeners() {
    // Event listeners for other functionality can be added here
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
    
    // Get filter values from the filters component
    const filterValues = reportFilters ? reportFilters.getFilterValues() : {};
    
    // Group by
    const groupBy = filterValues['group-by-filter'] || 'user';
    params.append('group_by', groupBy);
    
    // Datetime filters
    const startDatetime = filterValues['start-datetime-filter'];
    const finishDatetime = filterValues['finish-datetime-filter'];
    
    if (startDatetime) {
        const startTimestamp = new Date(startDatetime).getTime();
        params.append('start_after', Math.floor(startTimestamp));
    }
    
    if (finishDatetime) {
        const finishTimestamp = new Date(finishDatetime).getTime();
        params.append('start_before', Math.floor(finishTimestamp));
    }
    
    // Additional filters
    const manualOnly = filterValues['manual-only-filter'];
    
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
    const groupBy = reportFilters ? reportFilters.getFilterValues()['group-by-filter'] || 'user' : 'user';
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
        const machinesResponse = await fetchMachines(1, 100, { used_in: 'machining' });
        const machines = machinesResponse.results || machinesResponse || [];
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
    
    // Update group-specific counts based on current grouping
    const groupBy = reportFilters ? reportFilters.getFilterValues()['group-by-filter'] || 'user' : 'user';
    let usersCount = 0;
    let machinesCount = 0;
    
    if (groupBy === 'user') {
        usersCount = uniqueGroups;
        machinesCount = 0;
    } else if (groupBy === 'machine') {
        machinesCount = uniqueGroups;
        usersCount = 0;
    } else {
        usersCount = 0;
        machinesCount = 0;
    }
    
    // Update statistics cards using the component
    if (sumReportStats) {
        sumReportStats.updateValues({
            0: usersCount.toString(),
            1: machinesCount.toString(),
            2: totalHours.toFixed(2),
            3: uniqueGroups.toString()
        });
    }
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
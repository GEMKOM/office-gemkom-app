import { guardRoute } from '../../../../../authService.js';
import { initNavbar } from '../../../../../components/navbar.js';
import { HeaderComponent } from '../../../../../components/header/header.js';
import { FiltersComponent } from '../../../../../components/filters/filters.js';
import { TableComponent } from '../../../../../components/table/table.js';
import { getUserWorkHoursReport } from '../../../../../apis/welding/reports.js';
import { initRouteProtection } from '../../../../../apis/routeProtection.js';

// State management
let reportData = null;
let reportTable = null;
let reportFilters = null;
let expectedHours = 0; // Expected hours based on weekdays

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    // Initialize route protection
    if (!initRouteProtection()) {
        return;
    }

    await initNavbar();
    
    // Initialize header component
    const headerComponent = new HeaderComponent({
        containerId: 'header-placeholder',
        title: 'Çalışan Çalışma Saatleri Raporu',
        subtitle: 'Çalışanların belirli bir tarih aralığındaki çalışma saatleri analizi',
        icon: 'user-clock',
        showBackButton: 'block',
        showExportButton: 'block',
        showRefreshButton: 'block',
        exportButtonText: 'Excel\'e Aktar',
        refreshButtonText: 'Yenile',
        backUrl: '/manufacturing/welding/reports',
        onExportClick: handleExport,
        onRefreshClick: loadReport
    });
    
    // Initialize filters component
    reportFilters = new FiltersComponent('filters-placeholder', {
        title: 'Rapor Filtreleri',
        onApply: loadReport,
        onClear: () => {
            // Clear filters and reload
            loadReport();
        }
    });

    // Add date filters
    reportFilters.addDateFilter({
        id: 'date-after',
        label: 'Başlangıç Tarihi',
        colSize: 3,
        required: true
    });

    reportFilters.addDateFilter({
        id: 'date-before',
        label: 'Bitiş Tarihi',
        colSize: 3,
        required: true
    });

    // Initialize table component
    initializeTableComponent();
    
    // Set default dates (current month)
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    
    // Set default filter values
    const dateAfterInput = document.querySelector('#date-after');
    const dateBeforeInput = document.querySelector('#date-before');
    if (dateAfterInput) {
        dateAfterInput.value = firstDay.toISOString().split('T')[0];
    }
    if (dateBeforeInput) {
        dateBeforeInput.value = lastDay.toISOString().split('T')[0];
    }
    
    // Load initial report
    await loadReport();
    
    // Initialize Bootstrap popovers after table is rendered
    setTimeout(() => {
        initializePopovers();
    }, 500);
});

// Calculate weekdays between two dates
function calculateWeekdays(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    let weekdays = 0;
    
    // Set time to midnight to avoid timezone issues
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    
    const current = new Date(start);
    
    while (current <= end) {
        const dayOfWeek = current.getDay();
        // 0 = Sunday, 6 = Saturday, so weekdays are 1-5 (Monday-Friday)
        if (dayOfWeek >= 1 && dayOfWeek <= 5) {
            weekdays++;
        }
        current.setDate(current.getDate() + 1);
    }
    
    return weekdays;
}

// Format regular hours cell with expected vs actual comparison
function formatRegularHoursCell(overtime, rowIndex) {
    if (!overtime || !overtime.hours) {
        // Show expected hours even if no actual hours
        if (expectedHours > 0) {
            return `
                <div class="d-flex align-items-center gap-2" style="min-height: 40px;">
                    <span class="fw-bold text-danger" style="font-size: 1rem;">0/${expectedHours}</span>
                    <small class="text-muted">saat</small>
                </div>
            `;
        }
        return '<span class="text-muted">-</span>';
    }
    
    const actualHours = parseFloat(overtime.hours);
    const jobNos = overtime.job_nos || [];
    const jobCount = jobNos.length;
    const popoverId = `job-nos-regular-${rowIndex}`;
    const jobNosJson = JSON.stringify(jobNos);
    
    // Compare actual vs expected (with small tolerance for floating point comparison)
    let colorClass = '';
    let statusText = '';
    
    if (expectedHours > 0) {
        const difference = Math.abs(actualHours - expectedHours);
        // Use tolerance of 0.01 hours for comparison
        if (difference > 0.01) {
            colorClass = 'text-danger';
            if (actualHours < expectedHours) {
                statusText = 'Eksik';
            } else {
                statusText = 'Fazla';
            }
        } else {
            // Exact match (within tolerance)
            colorClass = '';
            statusText = '';
        }
    }
    
    const displayText = expectedHours > 0 
        ? `${actualHours.toFixed(2)}/${expectedHours}`
        : `${actualHours.toFixed(2)} saat`;
    
    return `
        <div class="d-flex align-items-center gap-2" style="min-height: 40px;">
            <div>
                <span class="fw-bold ${colorClass}" style="font-size: 1rem;">${displayText}</span>
                ${statusText ? `<br><small class="text-muted">${statusText}</small>` : ''}
            </div>
            ${jobCount > 0 ? `
                <button 
                    type="button" 
                    class="btn btn-sm btn-outline-secondary job-nos-badge" 
                    data-bs-toggle="popover" 
                    data-bs-placement="top"
                    data-bs-html="true"
                    data-job-nos='${jobNosJson}'
                    data-job-count="${jobCount}"
                    data-bs-trigger="hover focus"
                    id="${popoverId}"
                    style="min-width: 50px; font-size: 0.75rem; flex-shrink: 0;">
                    <i class="fas fa-list me-1"></i>${jobCount}
                </button>
            ` : ''}
        </div>
    `;
}

// Format overtime cell with hours and job numbers badge
function formatOvertimeCell(overtime, type, rowIndex, colorClass) {
    if (!overtime || !overtime.hours) return '<span class="text-muted">-</span>';
    
    const hours = parseFloat(overtime.hours).toFixed(2);
    const jobNos = overtime.job_nos || [];
    const jobCount = jobNos.length;
    
    // Create unique ID for popover
    const popoverId = `job-nos-${type}-${rowIndex}`;
    
    // Store job numbers as JSON in data attribute
    const jobNosJson = JSON.stringify(jobNos);
    
    // Color mapping for hours display
    const colorMap = {
        'regular': '',
        'warning': 'text-warning',
        'danger': 'text-danger'
    };
    const hoursColor = colorMap[colorClass] || '';
    
    return `
        <div class="d-flex align-items-center gap-2" style="min-height: 40px;">
            <span class="fw-bold ${hoursColor}" style="font-size: 1rem;">${hours} saat</span>
            ${jobCount > 0 ? `
                <button 
                    type="button" 
                    class="btn btn-sm btn-outline-secondary job-nos-badge" 
                    data-bs-toggle="popover" 
                    data-bs-placement="top"
                    data-bs-html="true"
                    data-job-nos='${jobNosJson}'
                    data-job-count="${jobCount}"
                    data-bs-trigger="hover focus"
                    id="${popoverId}"
                    style="min-width: 50px; font-size: 0.75rem; flex-shrink: 0;">
                    <i class="fas fa-list me-1"></i>${jobCount}
                </button>
            ` : ''}
        </div>
    `;
}

// Initialize Bootstrap popovers for job numbers
function initializePopovers() {
    const popoverTriggerList = document.querySelectorAll('[data-bs-toggle="popover"]');
    popoverTriggerList.forEach(popoverTriggerEl => {
        // Destroy existing popover if any
        const existingPopover = bootstrap.Popover.getInstance(popoverTriggerEl);
        if (existingPopover) {
            existingPopover.dispose();
        }
        
        // Get job numbers from data attribute
        const jobNosJson = popoverTriggerEl.getAttribute('data-job-nos');
        const jobCount = parseInt(popoverTriggerEl.getAttribute('data-job-count') || '0');
        
        if (!jobNosJson || jobCount === 0) {
            return;
        }
        
        try {
            const jobNos = JSON.parse(jobNosJson);
            
            // Format job numbers for popover content
            const jobNosHtml = jobNos.map(jobNo => {
                const escapedJobNo = String(jobNo).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                return `<div class="mb-1"><code class="bg-light px-2 py-1 rounded">${escapedJobNo}</code></div>`;
            }).join('');
            
            const popoverContent = `
                <div class="job-nos-popover" style="max-width: 300px;">
                    <strong>İş Numaraları (${jobCount}):</strong>
                    <div class="mt-2" style="max-height: 200px; overflow-y: auto;">
                        ${jobNosHtml}
                    </div>
                </div>
            `;
            
            // Create new popover
            new bootstrap.Popover(popoverTriggerEl, {
                html: true,
                placement: 'top',
                trigger: 'hover focus',
                container: 'body',
                content: popoverContent
            });
        } catch (error) {
            console.error('Error parsing job numbers:', error);
        }
    });
}

function initializeTableComponent() {
    reportTable = new TableComponent('report-table-container', {
        title: 'Çalışan Çalışma Saatleri',
        icon: 'fas fa-user-clock',
        iconColor: 'text-primary',
        columns: [
            {
                field: 'employee_full_name',
                label: 'Çalışan',
                sortable: true,
                width: '20%',
                formatter: (value, row) => {
                    const name = value || row.employee_username || '-';
                    const username = row.employee_username ? `<br><small class="text-muted">${row.employee_username}</small>` : '';
                    return `<span class="fw-bold">${name}</span>${username}`;
                }
            },
            {
                field: 'total_hours',
                label: 'Toplam Saat',
                sortable: true,
                width: '12%',
                formatter: (value) => {
                    if (value === null || value === undefined) return '-';
                    return `<span class="fw-bold text-primary" style="font-size: 1.1rem;">${parseFloat(value).toFixed(2)}</span>`;
                }
            },
            {
                field: 'regular_hours',
                label: 'Normal (1x)',
                sortable: false,
                width: '22%',
                formatter: (value, row, rowIndex) => {
                    return formatRegularHoursCell(row.by_overtime_type?.regular, rowIndex);
                }
            },
            {
                field: 'after_hours',
                label: 'Fazla Mesai (1.5x)',
                sortable: false,
                width: '22%',
                formatter: (value, row, rowIndex) => {
                    return formatOvertimeCell(row.by_overtime_type?.after_hours, 'after_hours', rowIndex, 'warning');
                }
            },
            {
                field: 'holiday_hours',
                label: 'Tatil (2x)',
                sortable: false,
                width: '22%',
                formatter: (value, row, rowIndex) => {
                    return formatOvertimeCell(row.by_overtime_type?.holiday, 'holiday', rowIndex, 'danger');
                }
            }
        ],
        data: [],
        sortable: true,
        pagination: false,
        exportable: false,
        refreshable: false,
        emptyMessage: 'Rapor verisi bulunamadı. Lütfen tarih aralığını kontrol edin.',
        emptyIcon: 'fas fa-chart-bar'
    });
}

async function loadReport() {
    try {
        // Get filter values
        const filterValues = reportFilters ? reportFilters.getFilterValues() : {};
        
        const dateAfter = filterValues['date-after'];
        const dateBefore = filterValues['date-before'];
        
        // Validate required dates
        if (!dateAfter || !dateBefore) {
            if (reportTable) {
                reportTable.setLoading(false);
                reportTable.updateData([], 0, 1);
            }
            showNotification('Lütfen başlangıç ve bitiş tarihlerini seçin', 'warning');
            return;
        }
        
        // Validate date range
        if (new Date(dateAfter) > new Date(dateBefore)) {
            showNotification('Başlangıç tarihi bitiş tarihinden sonra olamaz', 'error');
            return;
        }
        
        if (reportTable) {
            reportTable.setLoading(true);
        }
        
        // Fetch report data
        reportData = await getUserWorkHoursReport({
            date_after: dateAfter,
            date_before: dateBefore
        });
        
        // Calculate expected hours based on weekdays
        const weekdays = calculateWeekdays(dateAfter, dateBefore);
        expectedHours = weekdays * 9; // 9 hours per weekday
        
        // Update table with report data
        if (reportTable && reportData && reportData.users) {
            reportTable.setLoading(false);
            reportTable.updateData(reportData.users, reportData.users.length, 1);
            
            // Reinitialize popovers after table update
            setTimeout(() => {
                initializePopovers();
            }, 100);
        } else {
            if (reportTable) {
                reportTable.setLoading(false);
                reportTable.updateData([], 0, 1);
            }
        }
        
    } catch (error) {
        console.error('Error loading report:', error);
        showNotification(error.message || 'Rapor yüklenirken hata oluştu', 'error');
        if (reportTable) {
            reportTable.setLoading(false);
            reportTable.updateData([], 0, 1);
        }
    }
}

function handleExport() {
    if (!reportData || !reportData.users || reportData.users.length === 0) {
        showNotification('Dışa aktarılacak veri bulunamadı', 'warning');
        return;
    }
    
    try {
        // Prepare data for export
        const exportData = [];
        
        // Add header row
        exportData.push([
            'Çalışan',
            'Kullanıcı Adı',
            'Toplam Saat',
            'Normal Saat (1x)',
            'Normal İş No',
            'Fazla Mesai Saat (1.5x)',
            'Fazla Mesai İş No',
            'Tatil Saat (2x)',
            'Tatil İş No'
        ]);
        
        // Add data rows
        reportData.users.forEach(user => {
            const regular = user.by_overtime_type?.regular || { hours: 0, job_nos: [] };
            const afterHours = user.by_overtime_type?.after_hours || { hours: 0, job_nos: [] };
            const holiday = user.by_overtime_type?.holiday || { hours: 0, job_nos: [] };
            
            exportData.push([
                user.employee_full_name || '-',
                user.employee_username || '-',
                parseFloat(user.total_hours || 0).toFixed(2),
                parseFloat(regular.hours || 0).toFixed(2),
                (regular.job_nos || []).join(', ') || '-',
                parseFloat(afterHours.hours || 0).toFixed(2),
                (afterHours.job_nos || []).join(', ') || '-',
                parseFloat(holiday.hours || 0).toFixed(2),
                (holiday.job_nos || []).join(', ') || '-'
            ]);
        });
        
        // Create workbook
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(exportData);
        
        // Set column widths
        ws['!cols'] = [
            { wch: 20 }, // Çalışan
            { wch: 15 }, // Kullanıcı Adı
            { wch: 12 }, // Toplam Saat
            { wch: 15 }, // Normal Saat
            { wch: 30 }, // Normal İş No
            { wch: 18 }, // Fazla Mesai Saat
            { wch: 30 }, // Fazla Mesai İş No
            { wch: 12 }, // Tatil Saat
            { wch: 30 }  // Tatil İş No
        ];
        
        XLSX.utils.book_append_sheet(wb, ws, 'Çalışan Çalışma Saatleri');
        
        // Generate filename with date range
        const dateRange = reportData.date_range;
        const filename = `calisan_calisma_saatleri_${dateRange.start}_${dateRange.end}.xlsx`;
        
        // Download
        XLSX.writeFile(wb, filename);
        
        showNotification('Rapor başarıyla dışa aktarıldı', 'success');
    } catch (error) {
        console.error('Export error:', error);
        showNotification('Dışa aktarma sırasında hata oluştu', 'error');
    }
}

function showNotification(message, type = 'info') {
    // Remove existing notifications
    document.querySelectorAll('.notification').forEach(n => n.remove());
    
    const notification = document.createElement('div');
    notification.className = `notification alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show`;
    notification.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
    notification.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideOutRight 0.3s ease-out';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }
    }, 5000);
    
    return notification;
}


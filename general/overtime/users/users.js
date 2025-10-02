import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { MenuComponent } from '../../../components/menu/menu.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { TableComponent } from '../../../components/table/table.js';
import { getOvertimeUsersForDate } from '../../../apis/overtime.js';
import { 
    formatTeam, 
    formatJobNumber, 
    formatDescription 
} from '../../../apis/formatters.js';

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    await initNavbar();

    // Initialize header component
    const headerComponent = new HeaderComponent({
        containerId: 'header-placeholder',
        title: 'Mesai Kullanıcıları',
        subtitle: 'Belirli bir tarihte mesai yapacak kullanıcıların listesi',
        icon: 'users',
        showBackButton: 'block',
        showRefreshButton: 'block',
        backUrl: '/general/overtime',
        onRefreshClick: () => {
            loadOvertimeUsers();
        }
    });

    // Initialize filters component
    const filtersComponent = new FiltersComponent('filters-placeholder', {
        title: 'Tarih Filtresi',
        showClearButton: true,
        showApplyButton: true,
        applyButtonText: 'Listele',
        clearButtonText: 'Temizle',
        onApply: (filters) => {
            loadOvertimeUsers(filters.date);
        },
        onClear: () => {
            loadOvertimeUsers();
        }
    });

    // Add date filter
    const today = new Date().toISOString().split('T')[0];
    filtersComponent.addDateFilter({
        id: 'date',
        label: 'Tarih',
        value: today,
        colSize: 3
    });

    // Initialize table component
    const tableComponent = new TableComponent('table-placeholder', {
        title: 'Mesai Kullanıcıları',
        icon: 'fas fa-users',
        iconColor: 'text-primary',
        columns: [
            {
                field: 'full_name',
                label: 'Kullanıcı Adı',
                sortable: true,
                formatter: (value) => `
                    <div style="font-weight: 500; color: #495057;">
                        <i class="fas fa-user-circle me-2 text-muted"></i>
                        ${value || '-'}
                    </div>
                `
            },
            {
                field: 'team_label',
                label: 'Takım',
                sortable: true,
                formatter: (value) => `
                    <span class="badge bg-light text-dark border" style="font-weight: 500;">
                        <i class="fas fa-users me-1"></i>
                        ${value || '-'}
                    </span>
                `
            },
            {
                field: 'job_no',
                label: 'İş Numarası',
                sortable: true,
                formatter: (value) => formatJobNumber(value)
            },
            {
                field: 'description',
                label: 'Açıklama',
                sortable: false,
                formatter: (value) => formatDescription(value, 60)
            },
            {
                field: 'start_time',
                label: 'Başlangıç',
                sortable: true,
                formatter: (value) => {
                    if (!value) return '-';
                    const date = new Date(value);
                    return date.toLocaleString('tr-TR', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                }
            },
            {
                field: 'end_time',
                label: 'Bitiş',
                sortable: true,
                formatter: (value) => {
                    if (!value) return '-';
                    const date = new Date(value);
                    return date.toLocaleString('tr-TR', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                }
            },
            {
                field: 'duration',
                label: 'Süre',
                sortable: true,
                formatter: (value, row) => {
                    if (!row.start_time || !row.end_time) {
                        return '-';
                    }
                    
                    const start = new Date(row.start_time);
                    const end = new Date(row.end_time);
                    const diffMs = end - start;
                    
                    if (diffMs <= 0) {
                        return '-';
                    }
                    
                    const hours = Math.floor(diffMs / (1000 * 60 * 60));
                    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                    
                    let durationText = '';
                    if (hours > 0) {
                        durationText += `${hours} saat`;
                    }
                    if (minutes > 0) {
                        durationText += (hours > 0 ? ' ' : '') + `${minutes} dakika`;
                    }
                    
                    return durationText;
                }
            }
        ],
        data: [],
        loading: false,
        emptyMessage: 'Seçilen tarihte mesai yapacak kullanıcı bulunamadı',
        emptyIcon: 'fas fa-user-times',
        refreshable: true,
        exportable: true,
        onRefresh: () => {
            loadOvertimeUsers();
        },
        onExport: (format) => {
            exportOvertimeUsers(format);
        }
    });

    // Load initial data
    await loadOvertimeUsers(today);

    async function loadOvertimeUsers(date = null) {
        try {
            tableComponent.setLoading(true);
            
            // Use today's date if no date is provided
            const targetDate = date || new Date().toISOString().split('T')[0];
            
            const response = await getOvertimeUsersForDate(targetDate);
            
            // Handle different response structures
            let data = [];
            if (Array.isArray(response)) {
                data = response;
            } else if (response && Array.isArray(response.results)) {
                data = response.results;
            } else if (response && Array.isArray(response.data)) {
                data = response.data;
            } else {
                console.warn('Unexpected response structure:', response);
                data = [];
            }
            
            // Transform the data to match our table structure
            // Each user can have multiple entries, so we need to flatten the structure
            const transformedData = [];
            
            data.forEach(user => {
                // If user has entries, create a row for each entry
                if (user.entries && user.entries.length > 0) {
                    user.entries.forEach(entry => {
                        transformedData.push({
                            full_name: user.full_name || '-',
                            team_label: user.team_label || '-',
                            job_no: entry.job_no || '-',
                            description: entry.description || '-',
                            start_time: entry.request_start_at,
                            end_time: entry.request_end_at
                        });
                    });
                } else {
                    // If user has no entries, still show the user with empty entry data
                    transformedData.push({
                        full_name: user.full_name || '-',
                        team_label: user.team_label || '-',
                        job_no: '-',
                        description: '-',
                        start_time: null,
                        end_time: null
                    });
                }
            });
            
            tableComponent.updateData(transformedData);
            
        } catch (error) {
            console.error('Error loading overtime users:', error);
            tableComponent.updateData([]);
            
            // Show error notification
            const errorMessage = error.message || 'Bilinmeyen hata';
            showNotification('Mesai kullanıcıları yüklenirken hata oluştu: ' + errorMessage, 'error');
        } finally {
            tableComponent.setLoading(false);
        }
    }

    // Export overtime users data
    function exportOvertimeUsers(format = 'csv') {
        try {
            const currentData = tableComponent.options.data;
            if (!currentData || currentData.length === 0) {
                showNotification('Dışa aktarılacak veri bulunamadı', 'warning');
                return;
            }

            // Get the current date for filename
            const today = new Date().toISOString().split('T')[0];
            const filename = `mesai-kullanicilari-${today}`;

            if (format === 'csv') {
                exportToCSV(currentData, filename);
            } else if (format === 'excel') {
                exportToExcel(currentData, filename);
            } else {
                showNotification('Desteklenmeyen format: ' + format, 'error');
            }
        } catch (error) {
            console.error('Export error:', error);
            showNotification('Dışa aktarma sırasında hata oluştu: ' + error.message, 'error');
        }
    }

    // Export to CSV
    function exportToCSV(data, filename) {
        const headers = [
            'Kullanıcı Adı',
            'Takım',
            'İş Numarası',
            'Açıklama',
            'Başlangıç',
            'Bitiş',
            'Süre'
        ];

        const csvContent = [
            headers.join(','),
            ...data.map(row => [
                `"${(row.full_name || '').replace(/"/g, '""')}"`,
                `"${(row.team_label || '').replace(/"/g, '""')}"`,
                `"${(row.job_no || '').replace(/"/g, '""')}"`,
                `"${(row.description || '').replace(/"/g, '""')}"`,
                `"${formatDateTimeForExport(row.start_time)}"`,
                `"${formatDateTimeForExport(row.end_time)}"`,
                `"${formatDurationForExport(row)}"`
            ].join(','))
        ].join('\n');

        downloadFile(csvContent, filename + '.csv', 'text/csv;charset=utf-8;');
        showNotification('CSV dosyası başarıyla dışa aktarıldı', 'success');
    }

    // Export to Excel
    function exportToExcel(data, filename) {
        try {
            // Check if XLSX library is available
            if (typeof XLSX === 'undefined') {
                showNotification('Excel export için gerekli kütüphane yüklenemedi', 'error');
                return;
            }

            // Prepare data for Excel
            const excelData = data.map(row => ({
                'Kullanıcı Adı': row.full_name || '',
                'Takım': row.team_label || '',
                'İş Numarası': row.job_no || '',
                'Açıklama': row.description || '',
                'Başlangıç': formatDateTimeForExport(row.start_time),
                'Bitiş': formatDateTimeForExport(row.end_time),
                'Süre': formatDurationForExport(row)
            }));

            // Create workbook and worksheet
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(excelData);

            // Set column widths
            const colWidths = [
                { wch: 20 }, // Kullanıcı Adı
                { wch: 15 }, // Takım
                { wch: 12 }, // İş Numarası
                { wch: 30 }, // Açıklama
                { wch: 18 }, // Başlangıç
                { wch: 18 }, // Bitiş
                { wch: 15 }  // Süre
            ];
            ws['!cols'] = colWidths;

            // Add worksheet to workbook
            XLSX.utils.book_append_sheet(wb, ws, 'Mesai Kullanıcıları');

            // Generate Excel file
            const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            
            // Create blob and download
            const blob = new Blob([excelBuffer], { 
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
            });
            
            downloadFile(blob, filename + '.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            showNotification('Excel dosyası başarıyla dışa aktarıldı', 'success');
            
        } catch (error) {
            console.error('Excel export error:', error);
            showNotification('Excel dışa aktarma sırasında hata oluştu: ' + error.message, 'error');
        }
    }


    // Format date/time for export
    function formatDateTimeForExport(dateTime) {
        if (!dateTime) return '';
        try {
            const date = new Date(dateTime);
            return date.toLocaleString('tr-TR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            return '';
        }
    }

    // Format duration for export
    function formatDurationForExport(row) {
        if (!row.start_time || !row.end_time) {
            return '';
        }
        
        try {
            const start = new Date(row.start_time);
            const end = new Date(row.end_time);
            const diffMs = end - start;
            
            if (diffMs <= 0) {
                return '';
            }
            
            const hours = Math.floor(diffMs / (1000 * 60 * 60));
            const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            
            let durationText = '';
            if (hours > 0) {
                durationText += `${hours} saat`;
            }
            if (minutes > 0) {
                durationText += (hours > 0 ? ' ' : '') + `${minutes} dakika`;
            }
            
            return durationText;
        } catch (error) {
            return '';
        }
    }

    // Download file helper
    function downloadFile(content, filename, mimeType) {
        let blob;
        if (content instanceof Blob) {
            blob = content;
        } else {
            blob = new Blob([content], { type: mimeType });
        }
        
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    }

    // Helper function for notifications
    function showNotification(message, type = 'info') {
        // Create a simple notification system
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
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
    }
});

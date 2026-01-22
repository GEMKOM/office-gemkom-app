import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { TableComponent } from '../../../components/table/table.js';
import { getOvertimeUsersForDate } from '../../../apis/overtime.js';
import { showNotification } from '../../../components/notification/notification.js';
import {
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
                formatter: (value) => {
                    // For export, return clean text; for display, return HTML
                    if (window.isExporting) {
                        return value || '-';
                    }
                    return `
                        <div style="font-weight: 500; color: #495057;">
                            <i class="fas fa-user-circle me-2 text-muted"></i>
                            ${value || '-'}
                        </div>
                    `;
                }
            },
            {
                field: 'team_label',
                label: 'Takım',
                sortable: true,
                formatter: (value) => {
                    // For export, return clean text; for display, return HTML
                    if (window.isExporting) {
                        return value || '-';
                    }
                    return `
                        <span class="badge bg-light text-dark border" style="font-weight: 500;">
                            <i class="fas fa-users me-1"></i>
                            ${value || '-'}
                        </span>
                    `;
                }
            },
            {
                field: 'job_no',
                label: 'İş Numarası',
                sortable: true,
                formatter: (value) => {
                    // For export, return clean text; for display, return HTML
                    if (window.isExporting) {
                        return value || '-';
                    }
                    return formatJobNumber(value);
                }
            },
            {
                field: 'description',
                label: 'Açıklama',
                sortable: false,
                formatter: (value) => {
                    // For export, return clean text; for display, return HTML
                    if (window.isExporting) {
                        return value || '-';
                    }
                    return formatDescription(value, 60);
                }
            },
            {
                field: 'start_time',
                label: 'Başlangıç',
                sortable: true,
                formatter: (value) => {
                    if (!value) return '-';
                    const date = new Date(value);
                    const formattedDate = date.toLocaleString('tr-TR', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                    // For export, return clean text; for display, return HTML
                    if (window.isExporting) {
                        return formattedDate;
                    }
                    return formattedDate;
                }
            },
            {
                field: 'end_time',
                label: 'Bitiş',
                sortable: true,
                formatter: (value) => {
                    if (!value) return '-';
                    const date = new Date(value);
                    const formattedDate = date.toLocaleString('tr-TR', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                    // For export, return clean text; for display, return HTML
                    if (window.isExporting) {
                        return formattedDate;
                    }
                    return formattedDate;
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
                    
                    // For export, return clean text; for display, return HTML
                    if (window.isExporting) {
                        return durationText;
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
            tableComponent.updateData([]);
            
            // Show error notification
            const errorMessage = error.message || 'Bilinmeyen hata';
            showNotification('Mesai kullanıcıları yüklenirken hata oluştu: ' + errorMessage, 'error');
        } finally {
            tableComponent.setLoading(false);
        }
    }


});

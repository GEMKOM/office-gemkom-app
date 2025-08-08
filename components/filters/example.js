// Example implementation for using FiltersComponent in tasks page
// This shows how to replace the existing static filters with the reusable component

import { FiltersComponent } from './filters.js';

/**
 * Example: Tasks Page Filters Implementation
 * This demonstrates how to replace the existing static filters with the reusable component
 */

// Initialize filters component for tasks page
function initializeTaskFilters() {
    const taskFilters = new FiltersComponent('filters-placeholder', {
        title: 'Görev Filtreleri',
        onApply: (values) => {
            // Apply filters and reload tasks
            console.log('Applying filters:', values);
            loadTasks(1);
        },
        onClear: () => {
            // Clear filters and reload tasks
            console.log('Clearing filters');
            loadTasks(1);
            showNotification('Filtreler temizlendi', 'info');
        },
        onFilterChange: (filterId, value) => {
            // Optional: Handle individual filter changes
            console.log(`Filter ${filterId} changed to:`, value);
        }
    });

    // Add text filters
    taskFilters.addTextFilter({
        id: 'key-filter',
        label: 'TI No',
        placeholder: 'TI-001',
        colSize: 2
    });

    taskFilters.addTextFilter({
        id: 'name-filter',
        label: 'Görev Adı',
        placeholder: 'Görev adı',
        colSize: 2
    });

    taskFilters.addTextFilter({
        id: 'job-no-filter',
        label: 'İş No',
        placeholder: 'İş numarası',
        colSize: 2
    });

    // Add dropdown filters (these would be populated with actual data)
    taskFilters.addDropdownFilter({
        id: 'machine-filter',
        label: 'Makine',
        options: [
            { value: 'machine1', label: 'Makine 1' },
            { value: 'machine2', label: 'Makine 2' },
            { value: 'machine3', label: 'Makine 3' }
        ],
        placeholder: 'Makine seçin',
        colSize: 2
    });

    taskFilters.addDropdownFilter({
        id: 'status-filter',
        label: 'Durum',
        options: [
            { value: 'active', label: 'Aktif' },
            { value: 'completed', label: 'Tamamlanan' },
            { value: 'pending', label: 'Bekleyen' },
            { value: 'hold', label: 'Bekletilen' }
        ],
        placeholder: 'Durum seçin',
        colSize: 2
    });

    return taskFilters;
}

/**
 * Example: Users Page Filters Implementation
 * Shows how to use the component with different filter configurations
 */
function initializeUserFilters() {
    const userFilters = new FiltersComponent('user-filters', {
        title: 'Kullanıcı Filtreleri',
        applyButtonText: 'Ara',
        clearButtonText: 'Sıfırla',
        onApply: (values) => {
            console.log('Applying user filters:', values);
            // Apply user filtering logic
        },
        onClear: () => {
            console.log('Clearing user filters');
            // Clear user filtering logic
        }
    });

    // Add different types of filters
    userFilters.addTextFilter({
        id: 'username-filter',
        label: 'Kullanıcı Adı',
        placeholder: 'Kullanıcı adı girin',
        colSize: 3
    });

    userFilters.addTextFilter({
        id: 'email-filter',
        label: 'E-posta',
        placeholder: 'E-posta adresi',
        type: 'email',
        colSize: 3
    });

    userFilters.addDropdownFilter({
        id: 'role-filter',
        label: 'Rol',
        options: [
            { value: 'admin', label: 'Yönetici' },
            { value: 'user', label: 'Kullanıcı' },
            { value: 'guest', label: 'Misafir' }
        ],
        placeholder: 'Rol seçin',
        colSize: 2
    });

    userFilters.addDateFilter({
        id: 'created-date-filter',
        label: 'Oluşturma Tarihi',
        colSize: 2
    });

    userFilters.addSelectFilter({
        id: 'status-filter',
        label: 'Durum',
        options: [
            { value: 'active', label: 'Aktif' },
            { value: 'inactive', label: 'Pasif' },
            { value: 'suspended', label: 'Askıya Alınmış' }
        ],
        placeholder: 'Durum seçin',
        colSize: 2
    });

    return userFilters;
}

/**
 * Example: Reports Page Filters Implementation
 * Shows advanced usage with dynamic options and loading states
 */
function initializeReportFilters() {
    const reportFilters = new FiltersComponent('report-filters', {
        title: 'Rapor Filtreleri',
        showApplyButton: true,
        showClearButton: true,
        onApply: (values) => {
            console.log('Generating report with filters:', values);
            // Generate report logic
        },
        onClear: () => {
            console.log('Clearing report filters');
            // Clear report filters
        }
    });

    // Add date range filters
    reportFilters.addDateFilter({
        id: 'start-date-filter',
        label: 'Başlangıç Tarihi',
        colSize: 2
    });

    reportFilters.addDateFilter({
        id: 'end-date-filter',
        label: 'Bitiş Tarihi',
        colSize: 2
    });

    // Add dropdown with dynamic options
    reportFilters.addDropdownFilter({
        id: 'report-type-filter',
        label: 'Rapor Türü',
        options: [
            { value: 'daily', label: 'Günlük Rapor' },
            { value: 'weekly', label: 'Haftalık Rapor' },
            { value: 'monthly', label: 'Aylık Rapor' },
            { value: 'custom', label: 'Özel Rapor' }
        ],
        placeholder: 'Rapor türü seçin',
        colSize: 2
    });

    // Add text filter for search
    reportFilters.addTextFilter({
        id: 'search-filter',
        label: 'Arama',
        placeholder: 'Rapor adı veya açıklama...',
        colSize: 4
    });

    return reportFilters;
}

/**
 * Example: Dynamic Filter Updates
 * Shows how to update filter options dynamically
 */
function updateFiltersDynamically(filtersComponent) {
    // Simulate loading new machine data
    filtersComponent.showLoading();
    
    setTimeout(() => {
        // Update machine filter options
        const newMachineOptions = [
            { value: 'machine1', label: 'CNC Makine 1' },
            { value: 'machine2', label: 'CNC Makine 2' },
            { value: 'machine3', label: 'CNC Makine 3' },
            { value: 'machine4', label: 'CNC Makine 4' }
        ];
        
        filtersComponent.updateFilterOptions('machine-filter', newMachineOptions);
        filtersComponent.hideLoading();
    }, 1000);
}

/**
 * Example: Filter Value Management
 * Shows how to get and set filter values
 */
function manageFilterValues(filtersComponent) {
    // Get current filter values
    const currentValues = filtersComponent.getFilterValues();
    console.log('Current filter values:', currentValues);

    // Set filter values programmatically
    filtersComponent.setFilterValues({
        'key-filter': 'TI-123',
        'status-filter': 'active',
        'machine-filter': 'machine1'
    });

    // Clear all filters
    filtersComponent.clearFilters();
}

// Export examples for use in other files
export {
    initializeTaskFilters,
    initializeUserFilters,
    initializeReportFilters,
    updateFiltersDynamically,
    manageFilterValues
};

/**
 * Wages Management Module
 * Displays users and their current wage rates
 */

import { guardRoute } from '../../authService.js';
import { initNavbar } from '../../components/navbar.js';
import { HeaderComponent } from '../../components/header/header.js';
import { FiltersComponent } from '../../components/filters/filters.js';
import { StatisticsCards} from '../../components/statistics-cards/statistics-cards.js';
import { TableComponent } from '../../components/table/table.js';
import { EditModal } from '../../components/edit-modal/edit-modal.js';
import { 
    fetchCurrentWageRates,
    fetchWageRates,
    fetchWageRatesForUser,
    createWageRate,
    deleteWageRate,
    formatCurrency,
    getCurrencyInfo
} from '../../generic/hr.js';
import { authFetchUsers, fetchTeams } from '../../generic/users.js';

class WagesManager {
    constructor() {
        this.currentFilters = {};
        this.currentPage = 1;
        this.pageSize = 20;
        this.totalItems = 0;
        this.users = [];
        this.teams = [];
        this.wageRates = [];
        this.statistics = {};
        this.currentUserId = null; // Store current user ID for editing
        
        this.init();
    }

    async init() {
        if (!guardRoute()) {
            return;
        }

        await this.loadUsers();
        await this.loadTeams();
        await this.initializeComponents();
        await this.loadWageRates();
        await this.calculateStatistics();
        
    }

    async loadUsers() {
        try {
            const response = await authFetchUsers(1, 1000); // Get all users
            this.users = response.results || [];
        } catch (error) {
            console.error('Error loading users:', error);
            this.users = [];
        }
    }

    async loadTeams() {
        try {
            const teamsData = await fetchTeams();
            this.teams = teamsData || [];
        } catch (error) {
            console.error('Error loading teams:', error);
            this.teams = [];
        }
    }

    async initializeComponents() {
        // Initialize navbar
        await initNavbar();

        // Initialize header
        const headerComponent = new HeaderComponent('header-container', {
            title: 'Maaş Yönetimi',
            subtitle: 'Çalışan ücret oranlarını görüntüleyin',
            icon: 'money-bill-wave',
            showBackButton: 'block',
            showRefreshButton: 'block',
            refreshButtonText: 'Yenile'
        });
        headerComponent.render();

        // Initialize statistics cards
        this.initializeStatisticsCards();

        // Initialize filters
        this.initializeFilters();

        // Initialize table
        this.initializeTable();

        // Initialize edit modal
        this.initializeEditModal();

        // Setup event listeners
        this.setupEventListeners();
    }

    initializeStatisticsCards() {
        this.statisticsComponent = new StatisticsCards('statistics-container', {
            title: 'Maaş İstatistikleri',
            cards: [
                {
                    title: 'Toplam Çalışan',
                    value: '0',
                    icon: 'fas fa-users',
                    color: 'primary',
                    loading: true
                },
                {
                    title: 'Ortalama Saatlik Ücret',
                    value: '0 ₺',
                    icon: 'fas fa-clock',
                    color: 'success',
                    loading: true
                },
                {
                    title: 'En Yüksek Ücret',
                    value: '0 ₺',
                    icon: 'fas fa-arrow-up',
                    color: 'warning',
                    loading: true
                },
                {
                    title: 'En Düşük Ücret',
                    value: '0 ₺',
                    icon: 'fas fa-arrow-down',
                    color: 'info',
                    loading: true
                }
            ]
        });
    }

    initializeFilters() {
        this.filtersComponent = new FiltersComponent('filters-container', {
            title: 'Filtreler',
            onApply: (values) => {
                this.currentPage = 1;
                this.handleFilter(values);
            },
            onClear: () => {
                this.currentPage = 1;
                this.handleClearFilters();
            },
            onFilterChange: (filterId, value) => {
                console.log(`Filter ${filterId} changed to:`, value);
            }
        });

        // Add text filter for search
        this.filtersComponent.addTextFilter({
            id: 'search-filter',
            label: 'Arama',
            placeholder: 'Kullanıcı adı, ad veya soyad',
            colSize: 3
        });

        // Add team filter
        this.filtersComponent.addDropdownFilter({
            id: 'team-filter',
            label: 'Takım',
            options: [
                { value: '', label: 'Tüm Takımlar' },
                ...this.teams.map(team => ({
                    value: team.value || team.id,
                    label: team.label || team.name
                }))
            ],
            placeholder: 'Tüm Takımlar',
            colSize: 3
        });

        // Add work_location filter
        this.filtersComponent.addDropdownFilter({
            id: 'work-location-filter',
            label: 'Çalışma Yeri',
            options: [
                { value: '', label: 'Tümü' },
                { value: 'office', label: 'Ofis' },
                { value: 'workshop', label: 'Atölye' }
            ],
            placeholder: 'Tümü',
            colSize: 3
        });
    }

    initializeTable() {
        this.tableComponent = new TableComponent('table-container', {
            title: 'Çalışan Ücret Oranları',
            icon: 'money-bill-wave',
            iconColor: 'success',
            columns: [
                {
                    field: 'id',
                    label: 'ID',
                    sortable: true,
                    sortField: 'id',
                    formatter: (value) => value || '-'
                },
                {
                    field: 'user_info.username',
                    label: 'Kullanıcı Adı',
                    sortable: true,
                    sortField: 'username',
                    formatter: (value, row) => {
                        if (!row.user_info) return '-';
                        return `<strong>${row.user_info.username || '-'}</strong>`;
                    }
                },
                {
                    field: 'user_info.first_name',
                    label: 'Ad',
                    sortable: true,
                    sortField: 'first_name',
                    formatter: (value, row) => {
                        if (!row.user_info) return '-';
                        return row.user_info.first_name || '-';
                    }
                },
                {
                    field: 'user_info.last_name',
                    label: 'Soyad',
                    sortable: true,
                    sortField: 'last_name',
                    formatter: (value, row) => {
                        if (!row.user_info) return '-';
                        return row.user_info.last_name || '-';
                    }
                },
                {
                    field: 'user_info.team_label',
                    label: 'Takım',
                    sortable: false,
                    formatter: (value, row) => {
                        if (!row.user_info) return '-';
                        return row.user_info.team_label || '-';
                    }
                },
                {
                    field: 'user_info.occupation_label',
                    label: 'Görev',
                    sortable: false,
                    formatter: (value, row) => {
                        if (!row.user_info) return '-';
                        return row.user_info.occupation_label || '-';
                    }
                },
                {
                    field: 'user_info.work_location',
                    label: 'Çalışma Yeri',
                    sortable: false,
                    formatter: (value, row) => {
                        if (!row.user_info) return '-';
                        const locationMap = {
                            'office': 'Ofis',
                            'workshop': 'Atölye'
                        };
                        return locationMap[row.user_info.work_location] || row.user_info.work_location || '-';
                    }
                },
                {
                    field: 'current_wage.base_monthly',
                    label: 'Aylık Ücret',
                    sortable: true,
                    sortField: 'current_base_monthly',
                    formatter: (value, row) => {
                        if (!row.current_wage || !row.current_wage.base_monthly) return '-';
                        return formatCurrency(parseFloat(row.current_wage.base_monthly), row.current_wage.currency);
                    }
                },
                {
                    field: 'current_wage.effective_from',
                    label: 'Geçerlilik Tarihi',
                    sortable: true,
                    sortField: 'current_effective_from',
                    formatter: (value, row) => {
                        if (!row.current_wage || !row.current_wage.effective_from) return '-';
                        const date = new Date(row.current_wage.effective_from);
                        return date.toLocaleDateString('tr-TR');
                    }
                },
            ],
            actions: [
                {
                    key: 'edit',
                    label: 'Düzenle',
                    icon: 'fas fa-edit',
                    class: 'btn-outline-primary',
                    onClick: (row) => this.editWageRate(row)
                }
            ],
            pagination: true,
            itemsPerPage: this.pageSize,
            currentPage: this.currentPage,
            totalItems: this.totalItems,
            serverSidePagination: true,
            loading: false,
            skeleton: true,
            onPageChange: (page) => this.handlePageChange(page),
            onPageSizeChange: (pageSize) => this.handlePageSizeChange(pageSize),
            onSort: (field, direction) => this.handleSort(field, direction),
            emptyMessage: 'Ücret oranı bulunamadı',
            emptyIcon: 'fas fa-money-bill-wave'
        });
    }

    initializeEditModal() {
        this.editModalComponent = new EditModal('edit-modal-container', {
            title: 'Yeni Ücret Ekle',
            saveButtonText: 'Ücret Ekle'
        });

        // Add section for wage information
        this.editModalComponent.addSection({
            id: 'wage-info',
            title: 'Yeni Ücret Ekle',
            icon: 'fas fa-plus-circle',
            iconColor: 'text-primary',
            fields: [
                {
                    id: 'user_display',
                    name: 'user_display',
                    label: 'Kullanıcı',
                    type: 'text',
                    readonly: true,
                    colSize: 12
                },
                {
                    id: 'effective_from',
                    name: 'effective_from',
                    label: 'Geçerlilik Tarihi',
                    type: 'date',
                    required: true,
                    colSize: 6
                },
                {
                    id: 'base_monthly',
                    name: 'base_monthly',
                    label: 'Aylık Ücret',
                    type: 'number',
                    required: true,
                    step: 0.01,
                    min: 0,
                    colSize: 6
                }
            ]
        });

        // Set up callbacks
        this.editModalComponent.onSaveCallback((data) => this.saveWageRate(data));
        this.editModalComponent.onCancelCallback(() => this.cancelEdit());

        // Render the modal
        this.editModalComponent.render();
    }


    addWageHistoryFields(wageHistory) {
        // Add wage history section if there are wages
        if (wageHistory && wageHistory.length > 0) {
            // Add a section for wage history
            this.editModalComponent.addSection({
                id: 'wage-history',
                title: 'Geçmiş Ücretler',
                icon: 'fas fa-history',
                iconColor: 'text-info',
                fields: []
            });

            // Add fields for each wage entry (latest first)
            wageHistory.forEach((wage, index) => {
                const currency = wage.currency || 'TRY';
                const amount = parseFloat(wage.base_monthly) || 0;
                const date = wage.effective_from ? 
                    new Date(wage.effective_from).toLocaleDateString('tr-TR') : '-';
                
                // Add amount field
                this.editModalComponent.addField({
                    id: `wage_${index}_amount`,
                    name: `wage_${index}_amount`,
                    label: '',
                    type: 'text',
                    readonly: true,
                    value: formatCurrency(amount, currency),
                    colSize: 4
                });

                // Add date field
                this.editModalComponent.addField({
                    id: `wage_${index}_date`,
                    name: `wage_${index}_date`,
                    label: '',
                    type: 'text',
                    readonly: true,
                    value: date,
                    colSize: 4
                });

                // Add delete button field (will be implemented after rendering)
                this.editModalComponent.addField({
                    id: `wage_${index}_delete`,
                    name: `wage_${index}_delete`,
                    label: '',
                    type: 'text',
                    readonly: true,
                    value: 'Sil',
                    colSize: 4
                });
            });

            // Re-render the modal with new fields
            this.editModalComponent.render();
            
            // Replace text fields with actual buttons
            this.addDeleteButtons(wageHistory);
        }
    }

    addDeleteButtons(wageHistory) {
        wageHistory.forEach((wage, index) => {
            const deleteField = this.editModalComponent.container.querySelector(`[data-field-id="wage_${index}_delete"]`);
            if (deleteField) {
                const input = deleteField.querySelector('.field-input');
                if (input) {
                    // Replace the input with a button
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'btn btn-sm btn-outline-danger';
                    button.innerHTML = '<i class="fas fa-trash"></i> Sil';
                    button.onclick = () => this.deleteWageEntry(wage.id, index);
                    
                    // Replace the input with the button
                    input.parentNode.replaceChild(button, input);
                }
            }
        });
    }

    setupEventListeners() {
        // Header button events
        document.addEventListener('click', (e) => {
            if (e.target.id === 'refresh-btn' || e.target.closest('#refresh-btn')) {
                this.refreshData();
            } else if (e.target.id === 'back-to-main' || e.target.closest('#back-to-main')) {
                window.location.href = '/human_resources/';
            }
        });
    }

    async loadWageRates() {
        try {
            this.tableComponent.setLoading(true);
            
            const filters = {
                ...this.currentFilters,
                page: this.currentPage,
                page_size: this.pageSize
            };
            
            const response = await fetchWageRates(filters);
            
            this.wageRates = response.results || [];
            this.totalItems = response.count || 0;
            
            // Update table with data (empty or not)
            this.tableComponent.setLoading(false);
            this.tableComponent.updateData(this.wageRates, this.totalItems, this.currentPage);
            
        } catch (error) {
            console.error('Error loading wage rates:', error);
            
            // Handle 404 error (API not implemented yet)
            if (error.message && error.message.includes('404')) {
                this.showNotification('Ücret oranları API\'si henüz hazır değil. Demo veriler gösteriliyor.', 'warning');
                // Show demo data
                this.wageRates = this.getDemoWageRates();
                this.totalItems = this.wageRates.length;
                this.tableComponent.setLoading(false);
                this.tableComponent.updateData(this.wageRates, this.totalItems, this.currentPage);
            } else {
                this.showNotification('Ücret oranları yüklenirken hata oluştu', 'error');
                this.tableComponent.setLoading(false);
                this.tableComponent.updateData([], 0, this.currentPage);
            }
        }
    }

    async calculateStatistics() {
        try {
            // Get current wage rates for statistics
            const response = await fetchCurrentWageRates();
            const currentWages = response.results || response || [];

            if (currentWages.length === 0) {
                this.statistics = {
                    totalEmployees: 0,
                    averageHourlyWage: 0,
                    highestWage: 0,
                    lowestWage: 0
                };
            } else {
                // Calculate statistics from the new data structure
                const employeesWithWages = currentWages.filter(emp => emp.has_wage && emp.current_wage);
                const monthlyWages = employeesWithWages.map(emp => parseFloat(emp.current_wage.base_monthly) || 0);
                const validWages = monthlyWages.filter(wage => wage > 0);

                this.statistics = {
                    totalEmployees: currentWages.length,
                    averageHourlyWage: validWages.length > 0 ? validWages.reduce((sum, wage) => sum + wage, 0) / validWages.length : 0,
                    highestWage: validWages.length > 0 ? Math.max(...validWages) : 0,
                    lowestWage: validWages.length > 0 ? Math.min(...validWages) : 0
                };
            }

            // Update statistics cards
            this.updateStatisticsCards();

        } catch (error) {
            console.error('Error calculating statistics:', error);
            
            // Handle 404 error (API not implemented yet)
            if (error.message && error.message.includes('404')) {
                // Use demo data for statistics
                const demoWages = this.getDemoWageRates();
                const employeesWithWages = demoWages.filter(emp => emp.has_wage && emp.current_wage);
                const monthlyWages = employeesWithWages.map(emp => parseFloat(emp.current_wage.base_monthly) || 0);
                const validWages = monthlyWages.filter(wage => wage > 0);

                this.statistics = {
                    totalEmployees: demoWages.length,
                    averageHourlyWage: validWages.length > 0 ? validWages.reduce((sum, wage) => sum + wage, 0) / validWages.length : 0,
                    highestWage: validWages.length > 0 ? Math.max(...validWages) : 0,
                    lowestWage: validWages.length > 0 ? Math.min(...validWages) : 0
                };
            } else {
                this.statistics = {
                    totalEmployees: 0,
                    averageHourlyWage: 0,
                    highestWage: 0,
                    lowestWage: 0
                };
            }
            this.updateStatisticsCards();
        }
    }

    updateStatisticsCards() {
        const cards = [
            {
                title: 'Toplam Çalışan',
                value: this.statistics.totalEmployees.toString(),
                icon: 'fas fa-users',
                color: 'primary',
                loading: false
            },
            {
                title: 'Ortalama Saatlik Ücret',
                value: formatCurrency(this.statistics.averageHourlyWage, 'TRY'),
                icon: 'fas fa-clock',
                color: 'success',
                loading: false
            },
            {
                title: 'En Yüksek Ücret',
                value: formatCurrency(this.statistics.highestWage, 'TRY'),
                icon: 'fas fa-arrow-up',
                color: 'warning',
                loading: false
            },
            {
                title: 'En Düşük Ücret',
                value: formatCurrency(this.statistics.lowestWage, 'TRY'),
                icon: 'fas fa-arrow-down',
                color: 'info',
                loading: false
            }
        ];

        this.statisticsComponent.setCards(cards);
    }

    async handleFilter(filterValues) {
        // Convert filter values to API parameters
        this.currentFilters = {};
        
        if (filterValues['search-filter']) {
            this.currentFilters.search = filterValues['search-filter'];
        }
        if (filterValues['team-filter']) {
            this.currentFilters.team = filterValues['team-filter'];
        }
        if (filterValues['work-location-filter']) {
            this.currentFilters.work_location = filterValues['work-location-filter'];
        }
        
        this.currentPage = 1;
        await this.loadWageRates();
    }

    async handleClearFilters() {
        this.currentFilters = {};
        this.currentPage = 1;
        await this.loadWageRates();
    }

    async handlePageChange(page) {
        this.currentPage = page;
        await this.loadWageRates();
    }

    async handlePageSizeChange(pageSize) {
        this.pageSize = pageSize;
        this.currentPage = 1;
        await this.loadWageRates();
    }

    async handleSort(field, direction) {
        // Use the sortField from column configuration
        const column = this.tableComponent.options.columns.find(col => col.field === field);
        const sortField = column?.sortField || field;
        this.currentFilters.ordering = direction === 'asc' ? sortField : `-${sortField}`;
        this.currentPage = 1;
        await this.loadWageRates();
    }

    async refreshData() {
        await this.loadWageRates();
        await this.calculateStatistics();
        this.showNotification('Veriler yenilendi', 'info');
    }

    async editWageRate(row) {
        try {
            console.log('Edit wage rate clicked for user:', row.id, row.user_info);
            
            // Store current user ID
            this.currentUserId = row.user_info.id;
            console.log('Stored current user ID:', this.currentUserId);
            
            // Show loading state
            this.editModalComponent.setLoading(true);
            
            // Prepare user display
            const userDisplay = `${row.user_info.first_name} ${row.user_info.last_name} (${row.user_info.username})`;
            
            // Fetch user's wage history
            let effectiveFrom = new Date().toISOString().split('T')[0];
            let baseMonthly = '';
            let wageHistoryData = {};
            
            try {
                console.log('Fetching wage history for user ID:', row.user_info.id);
                const wageHistoryResponse = await fetchWageRatesForUser(row.user_info.id);
                console.log('Wage history response:', wageHistoryResponse);
                
                if (wageHistoryResponse && wageHistoryResponse.results && wageHistoryResponse.results.length > 0) {
                    const wageHistory = wageHistoryResponse.results;
                    
                    // Add wage history fields to modal
                    this.addWageHistoryFields(wageHistory);
                    
                    // Pre-fill form with most recent values (first in the list)
                    const mostRecentWage = wageHistory[0];
                    if (mostRecentWage) {
                        effectiveFrom = mostRecentWage.effective_from || effectiveFrom;
                        baseMonthly = mostRecentWage.base_monthly || '';
                    }
                }
            } catch (error) {
                console.warn('Could not fetch wage history:', error);
                // Continue with default values
            }

            // Prepare form data
            const modalData = {
                user_display: userDisplay,
                effective_from: effectiveFrom,
                base_monthly: baseMonthly,
                user_id: row.user_info.id  // Use user ID from user_info
            };

            console.log('Modal data being set:', modalData);
            console.log('User ID being set:', row.user_info.id);

            // Set form data and show modal
            this.editModalComponent.setFormData(modalData);
            this.editModalComponent.show();
            
        } catch (error) {
            console.error('Error loading wage data:', error);
            this.showNotification('Ücret bilgileri yüklenirken hata oluştu', 'error');
        } finally {
            // Clear loading state
            this.editModalComponent.setLoading(false);
        }
    }

    async saveWageRate(data) {
        try {
            console.log('Save wage rate data:', data);
            
            // Validate data
            if (!data.effective_from) {
                this.showNotification('Geçerlilik tarihi gereklidir', 'error');
                return;
            }
            if (!data.base_monthly || data.base_monthly <= 0) {
                this.showNotification('Aylık ücret 0\'dan büyük olmalıdır', 'error');
                return;
            }

            // Debug: Check if user_id exists
            console.log('User ID from form data:', data.user_id);
            console.log('Stored current user ID:', this.currentUserId);
            console.log('All form data keys:', Object.keys(data));
            
            // Use stored user ID if form data doesn't have it
            const userId = data.user_id || this.currentUserId;
            
            // Validate user_id exists
            if (!userId) {
                this.showNotification('Kullanıcı ID bulunamadı', 'error');
                return;
            }

            // Prepare wage data for API
            const wageData = {
                user: userId,
                effective_from: data.effective_from,
                base_monthly: parseFloat(data.base_monthly).toFixed(4) // Format as string with 4 decimal places
            };
            
            console.log('Sending wage data to API:', wageData);

            // Set loading state
            this.editModalComponent.setLoading(true);

            // Send API request
            await createWageRate(wageData);

            // Show success message
            this.showNotification('Ücret oranı başarıyla kaydedildi', 'success');
            
            // Hide modal and destroy/recreate for next use
            this.editModalComponent.hide();
            this.destroyAndRecreateModal();
            
            // Refresh data
            await this.loadWageRates();
            await this.calculateStatistics();

        } catch (error) {
            console.error('Error saving wage rate:', error);
            
            // Extract error message from API response
            let errorMessage = 'Ücret oranı kaydedilirken hata oluştu';
            if (error.response && error.response.detail) {
                errorMessage = Array.isArray(error.response.detail) 
                    ? error.response.detail.join(', ') 
                    : error.response.detail;
            } else if (error.message) {
                errorMessage = error.message;
            }
            
            this.showNotification(errorMessage, 'error');
        } finally {
            // Clear loading state
            this.editModalComponent.setLoading(false);
        }
    }

    cancelEdit() {
        // Hide the modal first
        this.editModalComponent.hide();
        
        // Destroy and recreate the modal for next use
        this.destroyAndRecreateModal();
    }

    destroyAndRecreateModal() {
        // Destroy the current modal
        if (this.editModalComponent) {
            this.editModalComponent.destroy();
        }
        
        // Recreate the modal with fresh state
        this.initializeEditModal();
    }

    async deleteWageEntry(wageRateId, index) {
        try {
            // Confirm deletion
            if (!confirm('Bu ücret kaydını silmek istediğinizden emin misiniz?')) {
                return;
            }

            // Show loading state
            this.editModalComponent.setLoading(true);

            // Delete the wage rate
            await deleteWageRate(wageRateId);

            // Show success message
            this.showNotification('Ücret kaydı başarıyla silindi', 'success');

            // Refresh the wage history
            const currentUserId = this.currentUserId;
            if (currentUserId) {
                const wageHistoryResponse = await fetchWageRatesForUser(currentUserId);
                if (wageHistoryResponse && wageHistoryResponse.results) {
                    // Clear existing wage history section first
                    const existingSection = this.editModalComponent.container.querySelector('[data-section-id="wage-history"]');
                    if (existingSection) {
                        existingSection.remove();
                    }
                    
                    // Add the updated wage history
                    this.addWageHistoryFields(wageHistoryResponse.results);
                } else {
                    // If no wage history, remove the section
                    const existingSection = this.editModalComponent.container.querySelector('[data-section-id="wage-history"]');
                    if (existingSection) {
                        existingSection.remove();
                    }
                }
            }

            // Refresh main data
            await this.loadWageRates();
            await this.calculateStatistics();

        } catch (error) {
            console.error('Error deleting wage rate:', error);
            
            // Extract error message from API response
            let errorMessage = 'Ücret kaydı silinirken hata oluştu';
            if (error.response && error.response.detail) {
                errorMessage = Array.isArray(error.response.detail) 
                    ? error.response.detail.join(', ') 
                    : error.response.detail;
            } else if (error.message) {
                errorMessage = error.message;
            }
            
            this.showNotification(errorMessage, 'error');
        } finally {
            // Clear loading state
            this.editModalComponent.setLoading(false);
        }
    }

    getDemoWageRates() {
        return [
            {
                id: 1,
                user_info: {
                    id: 1,
                    username: 'alice',
                    first_name: 'Alice',
                    last_name: 'Yılmaz',
                    team: 'human_resources',
                    team_label: 'İnsan Kaynakları',
                    occupation: 'manager',
                    occupation_label: 'Müdür',
                    work_location: 'office'
                },
                has_wage: true,
                current_wage: {
                    id: 12,
                    effective_from: '2025-09-01',
                    currency: 'TRY',
                    base_monthly: '350.0000',
                    after_hours_multiplier: '1.500',
                    sunday_multiplier: '2.000'
                }
            },
            {
                id: 2,
                user_info: {
                    id: 2,
                    username: 'bob',
                    first_name: 'Bob',
                    last_name: 'Demir',
                    team: 'machining',
                    team_label: 'Talaşlı İmalat',
                    occupation: 'operator',
                    occupation_label: 'Operatör',
                    work_location: 'workshop'
                },
                has_wage: false,
                current_wage: null
            },
            {
                id: 3,
                user_info: {
                    id: 3,
                    username: 'carol',
                    first_name: 'Carol',
                    last_name: 'Kaya',
                    team: 'design',
                    team_label: 'Dizayn',
                    occupation: 'office',
                    occupation_label: 'Ofis çalışanı',
                    work_location: 'office'
                },
                has_wage: true,
                current_wage: {
                    id: 15,
                    effective_from: '2025-08-15',
                    currency: 'USD',
                    base_monthly: '20.0000',
                    after_hours_multiplier: '1.250',
                    sunday_multiplier: '1.750'
                }
            }
        ];
    }

    showNotification(message, type = 'info') {
        // Simple notification implementation
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
}

// Initialize the wages manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const wagesManager = new WagesManager();
    // Make wagesManager globally accessible for delete buttons
    window.wagesManager = wagesManager;
});

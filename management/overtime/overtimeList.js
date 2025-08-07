import { guardRoute } from '../../authService.js';
import { initNavbar } from '../../components/navbar.js';
import { authedFetch } from '../../authService.js';
import { backendBase, proxyBase } from '../../base.js';
import { fetchUsers } from '../../generic/users.js';
import { getAllowedTeams } from '../../generic/teams.js';
import { HeaderComponent } from '../../components/header/header.js';
import { StatisticsCards } from '../../components/statistics-cards/statistics-cards.js';
import { FiltersComponent } from '../../components/filters/filters.js';


// Jira base URL
const JIRA_BASE = 'https://gemkom-1.atlassian.net';

// Convert datetime-local to Jira format
function toJiraDateTimeLocal(dateStr) {
    return `${dateStr}:00.000+0300`; // Assuming "2024-06-01T17:00"
}

// Global variables
let overtimeData = [];
let departments = [];
let currentUser = null;
let headerComponent;

// Statistics Cards component instance
let overtimeStats = null;

// Filters component instance
let overtimeFilters = null;

// Initialize the page
document.addEventListener('DOMContentLoaded', async function() {
    await guardRoute();
    initNavbar();
    
    currentUser = JSON.parse(localStorage.getItem('user'));
    
    // Initialize header component
    initHeaderComponent();
    
    // Initialize filters component
    initializeFiltersComponent();
    
    // Load initial data
    await loadOvertimeData();
    
    // Setup event listeners
    setupEventListeners();
    
    // Show loading initially
    showLoading();
    
    // Initialize Statistics Cards component
    overtimeStats = new StatisticsCards('overtime-statistics', {
        cards: [
            { title: 'Toplam Mesai', value: '0', icon: 'fas fa-clock', color: 'primary', id: 'total-overtime' },
            { title: 'Onaylanan', value: '0', icon: 'fas fa-check-circle', color: 'success', id: 'approved-overtime' },
            { title: 'Bekleyen', value: '0', icon: 'fas fa-hourglass-half', color: 'warning', id: 'pending-overtime' },
            { title: 'Reddedilen', value: '0', icon: 'fas fa-times-circle', color: 'danger', id: 'rejected-overtime' }
        ],
        compact: true,
        animation: true
    });
    
    // Load data after a short delay to ensure DOM is ready
    setTimeout(() => {
        loadOvertimeData();
    }, 100);
});

// Initialize header component
function initHeaderComponent() {
    headerComponent = new HeaderComponent({
        title: 'Mesai Listesi',
        subtitle: 'Mesai taleplerini görüntüleyin ve yönetin',
        icon: 'clock',
        showCreateButton: 'block',
        showRefreshButton: 'block',
        createButtonText: 'Yeni Mesai',
        refreshButtonText: 'Yenile',
        onCreateClick: async () => {
            const modal = new bootstrap.Modal(document.getElementById('create-overtime-modal'));
            modal.show();
            
            // Load users for the single create modal
            try {
                const users = await loadUsersForTeam();
                populateUserSelectionTable(users, 'user-selection-table-body', 'select-all-users');
            } catch (error) {
                console.error('Error loading users for single create:', error);
                showNotification('Kullanıcı listesi yüklenirken hata oluştu.', 'error');
            }
        },
        onRefreshClick: () => {
            showLoading();
            loadOvertimeData();
        }
    });
}

function initializeFiltersComponent() {
    // Initialize filters component
    overtimeFilters = new FiltersComponent('filters-placeholder', {
        title: 'Mesai Filtreleri',
        onApply: (values) => {
            // Apply filters and filter overtime
            filterOvertime();
        },
        onClear: () => {
            // Clear filters and show all overtime
            clearFilters();
            showNotification('Filtreler temizlendi', 'info');
        },
        onFilterChange: (filterId, value) => {
            // Optional: Handle individual filter changes
            console.log(`Filter ${filterId} changed to:`, value);
        }
    });

    // Add text filter for overtime name
    overtimeFilters.addTextFilter({
        id: 'search-overtime',
        label: 'Mesai Adı',
        placeholder: 'Mesai ara...',
        colSize: 2
    });

    // Add dropdown filter for status
    overtimeFilters.addDropdownFilter({
        id: 'filter-status',
        label: 'Durum',
        options: [
            { value: '', label: 'Tüm Durumlar' },
            { value: 'pending', label: 'Bekleyen' },
            { value: 'approved', label: 'Onaylanan' },
            { value: 'rejected', label: 'Reddedilen' }
        ],
        placeholder: 'Tüm Durumlar',
        colSize: 2
    });

    // Add dropdown filter for department
    overtimeFilters.addDropdownFilter({
        id: 'filter-department',
        label: 'Departman',
        options: [
            { value: '', label: 'Tüm Departmanlar' }
        ],
        placeholder: 'Tüm Departmanlar',
        colSize: 2
    });

    // Add date filter for start date
    overtimeFilters.addDateFilter({
        id: 'filter-start-date',
        label: 'Başlangıç Tarihi',
        colSize: 2
    });

    // Add date filter for end date
    overtimeFilters.addDateFilter({
        id: 'filter-end-date',
        label: 'Bitiş Tarihi',
        colSize: 2
    });
}

// Load overtime data
async function loadOvertimeData() {
    try {
        const user = JSON.parse(localStorage.getItem('user'));
        
        // Build JQL query based on user permissions
        let jql = `project=MES AND (parent is not EMPTY) ORDER BY created DESC`;
        if (!user.is_superuser) {
            jql = `project=MES AND Departman~"${user.team_label}" AND (parent is not EMPTY) ORDER BY created DESC`;
        }
        
        // Fetch fields we need
        const fields = 'summary,description,key,issuetype,parent,customfield_11172,customfield_11173,customfield_11167,customfield_10117,customfield_11170,status';
        const jiraUrl = `${JIRA_BASE}/rest/api/3/search?jql=${encodeURIComponent(jql)}&fields=${encodeURIComponent(fields)}&maxResults=5000`;
        const url = proxyBase + encodeURIComponent(jiraUrl);
        
        const res = await authedFetch(url);
        if (!res.ok) throw new Error('Jira API error');
        const data = await res.json();
        const issues = data.issues || [];
        
        // Process issues into overtime data
        overtimeData = [];
        const uniqueDepartments = new Set();
        
        issues.forEach(issue => {
            if (issue.fields.parent) {
                const epic = issue.fields.parent;
                const department = issue.fields.customfield_11167 || 'Belirsiz';
                uniqueDepartments.add(department);
                
                // Extract description text from ADF format
                const descriptionText = extractTextFromADF(issue.fields.description);
                
                                 // Map Jira status to our status
                 const jiraStatus = issue.fields.status?.name || 'Unknown';
                 let status = 'pending';
                 if (jiraStatus === 'Tamamlandı') status = 'approved';
                 else if (jiraStatus === 'Onay Almadı') status = 'rejected';
                 else if (jiraStatus === 'İşleniyor') status = 'pending';
                
                                 overtimeData.push({
                     id: issue.key,
                     name: issue.fields.summary,
                     department: department,
                     start_date: issue.fields.customfield_11172,
                     end_date: issue.fields.customfield_11173,
                     status: status,
                     jira_status: jiraStatus,
                     job_no: issue.fields.customfield_10117 || '-',
                     description: descriptionText,
                     created_by: user.username,
                     created_at: issue.fields.created,
                     jira_key: issue.key,
                     epic_key: epic.key,
                     epic_summary: epic.fields.summary
                 });
            }
        });
        
        departments = Array.from(uniqueDepartments).sort();
        
        // Update statistics
        updateStatistics();
        
        // Update filters
        updateFilters();
        
        // Render table
        renderOvertimeTable();
        
        // Hide loading
        hideLoading();
        
    } catch (error) {
        console.error('Error loading overtime data:', error);
        showError('Mesai verileri yüklenirken hata oluştu: ' + error.message);
    }
}

// Helper function to extract text from Atlassian Document Format
function extractTextFromADF(adfContent) {
    if (!adfContent || !adfContent.content) return '';
    
    let text = '';
    
    function processContent(content) {
        if (Array.isArray(content)) {
            content.forEach(item => processContent(item));
        } else if (typeof content === 'object') {
            if (content.type === 'text' && content.text) {
                text += content.text;
            } else if (content.content) {
                processContent(content.content);
            }
        }
    }
    
    processContent(adfContent.content);
    return text.trim();
}

       // Update statistics
       function updateStatistics() {
           const total = overtimeData.length;
           const approved = overtimeData.filter(o => o.status === 'approved').length;
           const pending = overtimeData.filter(o => o.status === 'pending').length;
           const rejected = overtimeData.filter(o => o.status === 'rejected').length;
           
           // Update statistics cards using the component
           if (overtimeStats) {
               overtimeStats.updateValues({
                   0: total.toString(),
                   1: approved.toString(),
                   2: pending.toString(),
                   3: rejected.toString()
               });
           }
       }

// Update filters
function updateFilters() {
    const uniqueDepartments = [...new Set(overtimeData.map(o => o.department).filter(Boolean))].sort();
    
    // Update department filter options
    const departmentOptions = [
        { value: '', label: 'Tüm Departmanlar' },
        ...uniqueDepartments.map(department => ({ value: department, label: department }))
    ];
    overtimeFilters.updateFilterOptions('filter-department', departmentOptions);
}

// Render overtime table
function renderOvertimeTable() {
    const container = document.getElementById('overtime-table-container');
    
    if (overtimeData.length === 0) {
        showEmptyState();
        return;
    }
    
    // Group overtime by epic (parent)
    const overtimeByEpic = {};
    overtimeData.forEach(overtime => {
        const epicKey = overtime.epic_key || 'Belirsiz';
        if (!overtimeByEpic[epicKey]) {
            overtimeByEpic[epicKey] = {
                epic: {
                    key: epicKey,
                    summary: overtime.epic_summary || 'Belirsiz Epic',
                    startDate: overtime.start_date,
                    endDate: overtime.end_date,
                    status: overtime.status
                },
                stories: []
            };
        }
        overtimeByEpic[epicKey].stories.push(overtime);
    });
    
    // Sort epics by start date (latest first)
    const sortedEpics = Object.values(overtimeByEpic).sort((a, b) => {
        const aDate = a.epic.startDate ? new Date(a.epic.startDate) : 0;
        const bDate = b.epic.startDate ? new Date(b.epic.startDate) : 0;
        return bDate - aDate;
    });
    
    const tableHtml = `
        <div class="table-responsive">
            <table class="table table-bordered table-hover">
                                 <thead class="table-dark">
                     <tr>
                         <th style="width: 30px;"></th>
                         <th>Key/Özet</th>
                         <th>Departman</th>
                         <th>İş Emri No</th>
                         <th>Başlangıç</th>
                         <th>Bitiş</th>
                         <th style="text-align:center;">Durum</th>
                         <th>Açıklama</th>
                         <th style="text-align:center;">İşlemler</th>
                     </tr>
                 </thead>
                <tbody>
                    ${sortedEpics.map((epicGroup, idx) => {
                        const epic = epicGroup.epic;
                        const stories = epicGroup.stories;
                        const start = stories[0]?.start_date ? formatDateTime(stories[0].start_date) : '-';
                        const end = stories[0]?.end_date ? formatDateTime(stories[0].end_date) : '-';
                        
                        return `
                            <tr class="team-header-row" data-epic="${epic.key}">
                                <td style="text-align: center;">
                                    <button class="team-toggle-btn" data-epic="${epic.key}" aria-label="Aç/Kapat">
                                        <span class="team-toggle-icon" data-epic="${epic.key}">&#8250;</span>
                                    </button>
                                </td>
                                                                 <td colspan="8" style="text-align: left;">
                                    <i class="fas fa-project-diagram me-2"></i>
                                    <span class="team-name">
                                        <a href="https://gemkom-1.atlassian.net/browse/${epic.key}" target="_blank" class="text-decoration-none text-dark">
                                            ${epic.summary}
                                        </a>
                                    </span>
                                    <span class="text-secondary">
                                        (<a href="https://gemkom-1.atlassian.net/browse/${epic.key}" target="_blank" class="text-decoration-none">
                                            ${epic.key}
                                        </a>)
                                    </span>
                                    <span class="badge py-1 ms-2 bg-${
                                        epic.status === 'approved' ? 'success' :
                                        epic.status === 'rejected' ? 'danger' :
                                        'warning'
                                    }">
                                        ${getStatusText(epic.status)}
                                    </span>
                                    <span class="team-count">(${stories.length} mesai)</span>
                                </td>
                            </tr>
                                                         ${stories.map(story => {
                                 const startDate = formatDateTime(story.start_date);
                                 const endDate = formatDateTime(story.end_date);
                                 const statusClass = getStatusClassForJiraStatus(story.jira_status);
                                 
                                 return `
                                     <tr class="team-member-row" data-epic="${epic.key}" style="display: none;">
                                         <td></td>
                                         <td>
                                             <a href="https://gemkom-1.atlassian.net/browse/${story.jira_key}" target="_blank" class="text-decoration-none">
                                                 <strong>${story.jira_key}</strong>
                                             </a>
                                             <br><small>${story.name || ''}</small>
                                         </td>
                                         <td class="editable-cell overtime-department" data-overtime-id="${story.id}" data-field="department" data-type="department_select" data-value="${story.department || ''}" style="cursor:pointer;">
                                             ${story.department || 'Departman belirtilmemiş'}
                                         </td>
                                         <td>
                                             <span class="job-no">${story.job_no}</span>
                                         </td>
                                         <td class="editable-cell" data-overtime-id="${story.id}" data-field="start_date" data-type="datetime-local" data-value="${story.start_date || ''}" style="cursor:pointer;">
                                             ${startDate}
                                         </td>
                                         <td class="editable-cell" data-overtime-id="${story.id}" data-field="end_date" data-type="datetime-local" data-value="${story.end_date || ''}" style="cursor:pointer;">
                                             ${endDate}
                                         </td>
                                         <td style="text-align:center;">
                                             <span class="status-badge ${statusClass}" title="${story.jira_status}">${story.jira_status}</span>
                                         </td>
                                         <td class="editable-cell overtime-description" data-overtime-id="${story.id}" data-field="description" data-type="text" data-value="${story.description || ''}" style="cursor:pointer;">
                                             ${story.description || 'Açıklama yok'}
                                         </td>
                                         <td style="text-align:center;">
                                             <a href="https://gemkom-1.atlassian.net/browse/${story.jira_key}" target="_blank" class="btn btn-sm btn-outline-primary me-1" title="Jira'da Aç">
                                                 <i class="fas fa-external-link-alt"></i>
                                             </a>
                                             <button class="btn btn-sm btn-outline-danger" onclick="deleteOvertime('${story.id}', '${story.name}')" title="Sil">
                                                 <i class="fas fa-trash"></i>
                                             </button>
                                         </td>
                                     </tr>
                                 `;
                             }).join('')}
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
    
    container.innerHTML = tableHtml;
    
    // Setup collapsible functionality
    setupCollapsibleEpics();
    
    // Setup editable cells
    setupEditableCells();
    
    // Show table
    container.style.display = 'block';
}

// Setup collapsible epics
function setupCollapsibleEpics() {
    // Make entire team header row clickable
    document.querySelectorAll('.team-header-row').forEach(headerRow => {
        headerRow.addEventListener('click', function() {
            const epic = this.getAttribute('data-epic');
            const memberRows = document.querySelectorAll(`.team-member-row[data-epic="${epic}"]`);
            const icon = this.querySelector('.team-toggle-icon');
            
            if (memberRows.length === 0) return;
            
            const isCollapsed = memberRows[0].style.display === 'none';
            
            if (isCollapsed) {
                // Expand
                icon.innerHTML = '&#8250;';
                icon.style.transform = 'rotate(90deg)';
                memberRows.forEach(row => row.style.display = 'table-row');
                setTimeout(() => { 
                    memberRows.forEach(row => row.style.background = '#f6faff'); 
                }, 80);
            } else {
                // Collapse
                icon.innerHTML = '&#8250;';
                icon.style.transform = '';
                memberRows.forEach(row => {
                    row.style.display = 'none';
                    row.style.background = '';
                });
            }
        });
    });
    
    // Prevent button clicks from triggering row click
    document.querySelectorAll('.team-toggle-btn').forEach(button => {
        button.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    });
}

// Setup editable cells
function setupEditableCells() {
    const editableCells = document.querySelectorAll('.editable-cell');
    
    editableCells.forEach(cell => {
        cell.addEventListener('click', function() {
            const field = this.getAttribute('data-field');
            const type = this.getAttribute('data-type');
            const value = this.getAttribute('data-value');
            const overtimeId = this.getAttribute('data-overtime-id');
            
            // Don't allow editing for certain fields
            if (field === 'id' || field === 'actions') {
                return;
            }
            
            if (this.classList.contains('editing')) {
                return;
            }
            
            this.classList.add('editing');
            
            let inputHTML = '';
            switch (type) {
                case 'text':
                    inputHTML = `<textarea class="form-control form-control-sm">${value}</textarea>`;
                    break;
                case 'datetime-local':
                    inputHTML = `<input type="datetime-local" class="form-control form-control-sm" value="${value}">`;
                    break;
                case 'department_select':
                    inputHTML = `<select class="form-select form-select-sm">${departments.map(dept => 
                        `<option value="${dept}" ${value === dept ? 'selected' : ''}>${dept}</option>`
                    ).join('')}</select>`;
                    break;
                default:
                    inputHTML = `<input type="text" class="form-control form-control-sm" value="${value}">`;
            }
            
            this.innerHTML = inputHTML;
            
            const input = this.querySelector('input, select, textarea');
            input.focus();
            
            // Handle save on blur or enter
            const saveChanges = () => {
                const newValue = input.value;
                updateOvertimeField(overtimeId, field, newValue);
                this.classList.remove('editing');
                this.innerHTML = formatCellValue(field, newValue);
            };
            
            input.addEventListener('blur', saveChanges);
            input.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    saveChanges();
                }
            });
        });
    });
}

// Update overtime field
async function updateOvertimeField(overtimeId, field, value) {
    try {
        // Find the overtime in our data
        const overtime = overtimeData.find(o => o.id == overtimeId);
        if (!overtime) return;
        
        // Update the field locally for display
        overtime[field] = value;
        
        // Since we're reading from Jira, we should update in Jira
        // For now, we'll just show a notification that this feature needs to be implemented
        showNotification('Mesai bilgisi güncelleme özelliği Jira entegrasyonu ile birlikte geliştirilecek.', 'info');
        
        // Update statistics and filters
        updateStatistics();
        updateFilters();
        
    } catch (error) {
        console.error('Error updating overtime field:', error);
        showNotification('Güncelleme sırasında hata oluştu.', 'error');
    }
}

// Format cell value for display
function formatCellValue(field, value) {
    switch (field) {
        case 'start_date':
        case 'end_date':
            return formatDateTime(value);
        case 'department':
            return value || 'Departman belirtilmemiş';
        case 'description':
            return value || 'Açıklama yok';
        default:
            return value || '';
    }
}

// Get status class
function getStatusClass(status) {
    switch (status) {
        case 'pending': return 'pending';
        case 'approved': return 'approved';
        case 'rejected': return 'rejected';
        default: return 'pending';
    }
}

// Get status class for Jira status names
function getStatusClassForJiraStatus(jiraStatus) {
    switch (jiraStatus) {
        case 'Onaylandı': return 'approved';
        case 'Onay Almadı': return 'rejected';
        case 'İşleniyor': return 'pending';
        default: return 'pending';
    }
}

// Get status text
function getStatusText(status) {
    switch (status) {
        case 'pending': return 'Bekleyen';
        case 'approved': return 'Onaylanan';
        case 'rejected': return 'Reddedilen';
        default: return 'Bekleyen';
    }
}

// Format date time
function formatDateTime(dateTimeStr) {
    if (!dateTimeStr) return '-';
    const date = new Date(dateTimeStr);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleString('tr-TR', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Setup event listeners
function setupEventListeners() {
    // Note: Header button event listeners are now handled by HeaderComponent
    
    // Save overtime button
    document.getElementById('save-overtime-btn').addEventListener('click', saveOvertime);
    
    // Event listeners for filters are now handled by the filters component
    // No additional event listeners needed for filters
}

// Filter overtime
function filterOvertime() {
    const filterValues = overtimeFilters.getFilterValues();
    const searchTerm = filterValues['search-overtime'].toLowerCase();
    const selectedStatus = filterValues['filter-status'];
    const selectedDepartment = filterValues['filter-department'];
    const startDate = filterValues['filter-start-date'];
    const endDate = filterValues['filter-end-date'];
    
    const rows = document.querySelectorAll('.team-member-row');
    
         rows.forEach(row => {
         const overtimeName = row.querySelector('td:nth-child(2)').textContent.toLowerCase();
         const department = row.querySelector('td:nth-child(3)').textContent;
         const status = row.querySelector('td:nth-child(7) .status-badge').textContent;
         const startDateCell = row.querySelector('td:nth-child(5)').textContent;
         const endDateCell = row.querySelector('td:nth-child(6)').textContent;
        
        const matchesSearch = overtimeName.includes(searchTerm);
        const matchesStatus = !selectedStatus || status === selectedStatus;
        const matchesDepartment = !selectedDepartment || department === selectedDepartment;
        const matchesStartDate = !startDate || startDateCell.includes(startDate);
        const matchesEndDate = !endDate || endDateCell.includes(endDate);
        
        if (matchesSearch && matchesStatus && matchesDepartment && matchesStartDate && matchesEndDate) {
            row.style.display = 'table-row';
        } else {
            row.style.display = 'none';
        }
    });
    
    // Update epic headers visibility based on visible stories
    updateEpicHeadersVisibility();
}

// Update epic headers visibility
function updateEpicHeadersVisibility() {
    const epicHeaders = document.querySelectorAll('.team-header-row');
    epicHeaders.forEach(header => {
        const epic = header.getAttribute('data-epic');
        const visibleStories = document.querySelectorAll(`.team-member-row[data-epic="${epic}"]:not([style*="display: none"])`);
        
        if (visibleStories.length === 0) {
            header.style.display = 'none';
        } else {
            header.style.display = 'table-row';
        }
    });
}

// Clear filters
function clearFilters() {
    // Clear all filters using the component
    overtimeFilters.clearFilters();
    
    // Show all rows
    const rows = document.querySelectorAll('.team-member-row');
    rows.forEach(row => {
        row.style.display = 'table-row';
    });
    
    // Show all epic headers
    const epicHeaders = document.querySelectorAll('.team-header-row');
    epicHeaders.forEach(header => {
        header.style.display = 'table-row';
    });
}

// Save overtime
async function saveOvertime() {
    const startDate = document.getElementById('overtime-start').value;
    const endDate = document.getElementById('overtime-end').value;
    
    if (!startDate || !endDate) {
        showNotification('Lütfen başlangıç ve bitiş tarihlerini belirtin.', 'error');
        return;
    }
    
    // Collect data from form inputs for selected users only
    const rows = [];
    
    // Get all checkboxes that are checked
    const checkedCheckboxes = document.querySelectorAll('#user-selection-table-body .user-select-checkbox:checked');
    
    checkedCheckboxes.forEach(checkbox => {
        const username = checkbox.getAttribute('data-username');
        const jobOrderInput = document.querySelector(`input.job-order-input[data-username="${username}"]`);
        const descriptionInput = document.querySelector(`textarea.description-input[data-username="${username}"]`);
        
        const jobOrderNumber = jobOrderInput ? jobOrderInput.value.trim() : '';
        const description = descriptionInput ? descriptionInput.value.trim() : '';
        
        // Only include users who have job order numbers
        if (jobOrderNumber) {
            // Get user name and occupation from the table
            const userRow = checkbox.closest('tr');
            const nameCell = userRow.querySelector('td:nth-child(2) strong');
            const occupationCell = userRow.querySelector('td:nth-child(3) span');
            
            const displayName = nameCell ? nameCell.textContent : username;
            const occupation = occupationCell ? occupationCell.textContent : 'Görev belirtilmemiş';
            
            rows.push({
                'Username': username,
                'İsim': displayName,
                'Görev': occupation,
                'İş Emri Numarası': jobOrderNumber,
                'Açıklama (Opsiyonel)': description
            });
        }
    });
    
    if (!rows.length) {
        showNotification('En az bir kullanıcı seçin ve iş emri numarası giriniz.', 'error');
        return;
    }
    
    try {
        const user = JSON.parse(localStorage.getItem('user'));
        const departman = user.team_label;
        
        // Prepare Epic (parent issue)
        const projectKey = 'MES';
        const epicSummary = `${departman} - ${new Date(startDate).toLocaleDateString('tr-TR', { weekday: 'long' })} - ${rows.length} Kişi`;
        const epicFields = {
            project: { key: projectKey },
            summary: epicSummary,
            issuetype: { name: 'Mesai Talebi' },
            "customfield_11172": toJiraDateTimeLocal(startDate),
            "customfield_11173": toJiraDateTimeLocal(endDate)
        };
        
        const epicRes = await authedFetch(proxyBase + encodeURIComponent(`${JIRA_BASE}/rest/api/3/issue`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: epicFields })
        });
        
        if (!epicRes.ok) {
            showNotification('Epic oluşturulamadı!', 'error');
            return;
        }
        
        const epicData = await epicRes.json();
        const epicKey = epicData.key;

        // Create sub-tasks for each row
        for (const row of rows) {
            if (!row['Username'] || !row['İsim'] || !row['Görev'] || !row['İş Emri Numarası']) continue;
            
            const subTaskFields = {
                project: { key: projectKey },
                summary: `${row['İsim']}`,
                issuetype: { name: 'Çalışan' },
                parent: { key: epicKey },
                "customfield_10117": String(row['İş Emri Numarası']),
                "customfield_11167": departman,
                "customfield_11170": row['Görev'],
                "customfield_11172": toJiraDateTimeLocal(startDate),
                "customfield_11173": toJiraDateTimeLocal(endDate),
                "description": {
                    "content": [
                        {
                            "content": [
                                {
                                    "text": row["Açıklama (Opsiyonel)"],
                                    "type": "text"
                                }
                            ],
                            "type": "paragraph"
                        }
                    ],
                    "type": "doc",
                    "version": 1
                }
            };
            
            await authedFetch(proxyBase + encodeURIComponent(`${JIRA_BASE}/rest/api/3/issue`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fields: subTaskFields })
            });
        }
        
        showNotification(`${rows.length} mesai talebi başarıyla oluşturuldu!`, 'success');
        
        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('create-overtime-modal'));
        modal.hide();
        
        // Reset form and clear all input fields
        document.getElementById('create-overtime-form').reset();
        document.querySelectorAll('.job-order-input, .description-input').forEach(input => {
            input.value = '';
        });
        document.querySelectorAll('.user-select-checkbox, #select-all-users').forEach(checkbox => {
            checkbox.checked = false;
        });
        
        // Reload data to show the new overtime request
        await loadOvertimeData();
        
    } catch (error) {
        console.error('Error saving overtime:', error);
        showNotification('Mesai talebi oluşturulurken hata oluştu.', 'error');
    }
}







// Delete overtime
function deleteOvertime(overtimeId, overtimeName) {
    document.getElementById('delete-overtime-name').textContent = overtimeName;
    document.getElementById('confirm-delete-overtime-btn').onclick = () => confirmDeleteOvertime(overtimeId);
    
    const modal = new bootstrap.Modal(document.getElementById('delete-overtime-modal'));
    modal.show();
}

// Confirm delete overtime
async function confirmDeleteOvertime(overtimeId) {
    try {
        // Since we're reading from Jira, we should delete from Jira
        // For now, we'll just show a notification that this feature needs to be implemented
        showNotification('Mesai talebi silme özelliği Jira entegrasyonu ile birlikte geliştirilecek.', 'info');
        
        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('delete-overtime-modal'));
        modal.hide();
        
    } catch (error) {
        console.error('Error deleting overtime:', error);
        showNotification('Mesai talebi silinirken hata oluştu.', 'error');
    }
}

// Show loading
function showLoading() {
    document.getElementById('loading-container').style.display = 'block';
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('overtime-table-container').style.display = 'none';
}

// Hide loading
function hideLoading() {
    document.getElementById('loading-container').style.display = 'none';
}

// Show empty state
function showEmptyState() {
    document.getElementById('empty-state').style.display = 'block';
    document.getElementById('overtime-table-container').style.display = 'none';
}

// Show error
function showError(message) {
    hideLoading();
    showEmptyState();
    document.getElementById('empty-state').innerHTML = `
        <i class="fas fa-exclamation-triangle text-danger mb-3"></i>
        <h5>Hata</h5>
        <p class="text-muted">${message}</p>
    `;
}

// Show notification
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `alert alert-${type === 'error' ? 'danger' : type === 'success' ? 'success' : 'info'} alert-dismissible fade show position-fixed`;
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

// Load users for the current team
async function loadUsersForTeam() {
    try {
        const user = JSON.parse(localStorage.getItem('user'));
        const allowedTeams = getAllowedTeams(user.team);
        const users = await fetchUsers(allowedTeams);
        return users;
    } catch (error) {
        console.error('Error loading users:', error);
        return [];
    }
}

// Populate user selection table
function populateUserSelectionTable(users, tableBodyId, selectAllId) {
    const tableBody = document.getElementById(tableBodyId);
    const selectAllCheckbox = document.getElementById(selectAllId);
    
    if (!tableBody) return;
    
    let tableHTML = '';
    users.forEach(user => {
        const displayName = user.first_name ? `${user.first_name} ${user.last_name}` : user.username;
        tableHTML += `
            <tr>
                <td>
                    <input type="checkbox" class="form-check-input user-select-checkbox" data-username="${user.username}">
                </td>
                <td>
                    <strong>${displayName}</strong>
                </td>
                <td>
                    <span class="text-muted">${user.occupation_label || 'Görev belirtilmemiş'}</span>
                </td>
                <td>
                    <input type="text" class="form-control form-control-sm job-order-input" data-username="${user.username}" placeholder="İş emri numarası">
                </td>
                <td>
                    <textarea class="form-control form-control-sm description-input" data-username="${user.username}" rows="2" placeholder="Açıklama giriniz..."></textarea>
                </td>
            </tr>
        `;
    });
    
    tableBody.innerHTML = tableHTML;
    
    // Setup checkbox functionality
    setupUserSelectionCheckboxes(tableBodyId, selectAllId);
}

// Setup user selection checkboxes
function setupUserSelectionCheckboxes(tableBodyId, selectAllId) {
    const selectAllCheckbox = document.getElementById(selectAllId);
    const userCheckboxes = document.querySelectorAll(`#${tableBodyId} .user-select-checkbox`);
    
    if (!selectAllCheckbox || userCheckboxes.length === 0) return;
    
    // Select all functionality
    selectAllCheckbox.addEventListener('change', function() {
        userCheckboxes.forEach(checkbox => {
            checkbox.checked = this.checked;
        });
    });
    
    // Update select all when individual checkboxes change
    userCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const allChecked = Array.from(userCheckboxes).every(cb => cb.checked);
            const anyChecked = Array.from(userCheckboxes).some(cb => cb.checked);
            selectAllCheckbox.checked = allChecked;
            selectAllCheckbox.indeterminate = anyChecked && !allChecked;
        });
    });
} 
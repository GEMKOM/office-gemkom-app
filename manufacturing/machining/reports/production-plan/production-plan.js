/**
 * Production Plan Module JavaScript
 * Implements production planning functionality
 */

// Import required modules
import { initNavbar } from '../../../../components/navbar.js';
import { HeaderComponent } from '../../../../components/header/header.js';
import { StatisticsCards } from '../../../../components/statistics-cards/statistics-cards.js';
import { TableComponent } from '../../../../components/table/table.js';
import { DisplayModal } from '../../../../components/display-modal/display-modal.js';
import { GanttChart } from '../../../../components/gantt/gantt.js';
import { getProductionPlanOverview } from '../../../../apis/machining/capacityPlanning.js';
import { getMachineProductionPlan } from '../../../../apis/machining/capacityPlanning.js';
import { getMachineCalendar } from '../../../../apis/machines.js';
import { fetchTaskById } from '../../../../apis/tasks.js';

// Global state
let currentProductionData = null;
let isLoadingData = false;
let statisticsCards = null;
let productionPlanTable = null;
let ganttModal = null;
let ganttChart = null;
let displayModalContainer = null;

// Initialize production plan module
function initProductionPlan() {
    console.log('Production plan module initialized');
    
    // Initialize navbar
    initNavbar();
    
    // Initialize header component
    initHeader();
    
    // Initialize components with a small delay to ensure DOM is ready
    setTimeout(() => {
        initStatisticsCards();
        initProductionPlanTable();
        initGanttModal(); // Initialize modal container early
        initDisplayModalContainer(); // Initialize display modal container
        
        // Load production plan data for all machines
        loadProductionPlanData();
    }, 100);
    
    // Setup event listeners
    setupEventListeners();
}

// Initialize header component
function initHeader() {
    const header = new HeaderComponent({
        title: 'Üretim Planı',
        subtitle: 'Üretim planını görüntüleyin ve yönetin',
        icon: 'chart-gantt',
        containerId: 'header-placeholder',
        showBackButton: 'block',
        showRefreshButton: 'block',
        backUrl: '/manufacturing/machining/reports/',
        onRefreshClick: () => {
            console.log('Refresh clicked');
            refreshProductionData();
        }
    });
}

// Initialize statistics cards
function initStatisticsCards() {
    statisticsCards = new StatisticsCards('statistics-cards-container', {
        cards: [],
        layout: 'grid',
        responsive: true,
        compact: true,
        animation: true,
        itemsPerRow: 5
    });
}

// Initialize production plan table
function initProductionPlanTable() {
    console.log('Initializing production plan table...');
    productionPlanTable = new TableComponent('production-plan-table-container', {
        title: 'Makine Üretim Planı',
        icon: 'fas fa-cogs',
        iconColor: 'text-primary',
        columns: [
            {
                field: 'machine_name',
                label: 'Makine Adı',
                sortable: true,
                formatter: (value) => {
                    if (!value) return '<span class="text-muted">-</span>';
                    return `<div class="fw-bold text-dark">${value}</div>`;
                }
            },
            {
                field: 'machine_type_label',
                label: 'Makine Tipi',
                sortable: true
            },
            {
                field: 'total_estimated_hours',
                label: 'Toplam Tahmini Saat',
                sortable: true,
                type: 'number',
                formatter: (value) => {
                    if (value === null || value === undefined) return '<span class="text-muted">-</span>';
                    const hours = value.toFixed(1);
                    return `<div class="fw-semibold">
                        <i class="fas fa-clock me-1"></i>${hours} saat
                    </div>`;
                }
            },
            {
                field: 'latest_planned_end',
                label: 'En Geç Planlanan Bitiş',
                sortable: true,
                type: 'date'
            },
            {
                field: 'task_count',
                label: 'Görev Sayısı',
                sortable: true,
                type: 'number',
                formatter: (value) => {
                    if (value === null || value === undefined) return '<span class="text-muted">-</span>';
                    return `<div class="fw-semibold text-primary">
                        <i class="fas fa-tasks me-1"></i>${value}
                    </div>`;
                }
            }
        ],
        data: [],
        sortable: true,
        responsive: true,
        loading: false,
        skeleton: true,
        emptyMessage: 'Üretim planı verisi bulunamadı',
        emptyIcon: 'fas fa-chart-gantt',
        actions: [
            {
                key: 'view-gantt',
                label: 'Gantt Görünümü',
                icon: 'fas fa-chart-gantt',
                class: 'btn-outline-primary',
                title: 'Makine Gantt Çizelgesini Görüntüle',
                onClick: (row, index) => {
                    showMachineGantt(row);
                }
            }
        ]
    });
    console.log('Production plan table initialized:', !!productionPlanTable);
}

// Load production plan data for all machines
async function loadProductionPlanData() {
    console.log('Loading production plan data for all machines...');
    
    if (isLoadingData) {
        console.log('Data is already loading, skipping...');
        return;
    }
    
    isLoadingData = true;
    
    try {
        // Show loading state
        if (productionPlanTable) {
            console.log('Setting table loading state to true');
            productionPlanTable.setLoading(true);
        } else {
            console.error('Production plan table is not initialized!');
        }
        
        // Fetch production plan data
        const data = await getProductionPlanOverview();
        currentProductionData = data;
        
        console.log('Received production plan data:', data);
        
        // Process and display the data
        updateStatisticsCards(data);
        updateProductionPlanTable(data);
        
        console.log('Production plan data loaded successfully');
    } catch (error) {
        console.error('Error loading production plan data:', error);
        
        // Show empty state on error
        if (statisticsCards) {
            statisticsCards.showEmpty('Veri yüklenirken hata oluştu');
        }
        if (productionPlanTable) {
            productionPlanTable.setLoading(false);
        }
    } finally {
        isLoadingData = false;
    }
}

// Update statistics cards with production data
function updateStatisticsCards(data) {
    if (!statisticsCards || !data) return;
    
    const { machines, overall_totals } = data;
    
    // Find the busiest machine (max total_estimated_hours)
    const busiestMachine = machines.reduce((max, machine) => 
        machine.totals.total_estimated_hours > max.totals.total_estimated_hours ? machine : max, 
        machines[0] || { machine_name: '-', totals: { total_estimated_hours: 0 } }
    );
    
    // Format latest planned end date
    const formatDate = (timestamp) => {
        if (!timestamp) return '-';
        const date = new Date(timestamp);
        return date.toLocaleDateString('tr-TR', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };
    
    const cards = [
        {
            title: 'En Yoğun Makine',
            value: busiestMachine.machine_name || '-',
            icon: 'fas fa-cogs',
            color: 'primary',
            tooltip: `Toplam ${busiestMachine.totals?.total_estimated_hours?.toFixed(1) || 0} saat`
        },
        {
            title: 'Toplam Tahmini Saat',
            value: `${overall_totals?.total_estimated_hours?.toFixed(1) || 0} saat`,
            icon: 'fas fa-clock',
            color: 'info'
        },
        {
            title: 'En Geç Planlanan Bitiş',
            value: formatDate(overall_totals?.latest_planned_end_ms),
            icon: 'fas fa-calendar-alt',
            color: 'warning'
        },
        {
            title: 'Toplam Görev Sayısı',
            value: overall_totals?.task_count?.toString() || '0',
            icon: 'fas fa-tasks',
            color: 'success'
        },
        {
            title: 'Toplam Makine Sayısı',
            value: machines?.length?.toString() || '0',
            icon: 'fas fa-industry',
            color: 'secondary'
        }
    ];
    
    statisticsCards.setCards(cards);
}

// Update production plan table with machine data
function updateProductionPlanTable(data) {
    if (!productionPlanTable || !data) {
        console.log('Table update skipped - productionPlanTable:', !!productionPlanTable, 'data:', !!data);
        return;
    }
    
    const { machines } = data;
    console.log('Machines data:', machines);
    
    if (!machines || !Array.isArray(machines)) {
        console.error('Invalid machines data:', machines);
        productionPlanTable.setLoading(false);
        return;
    }
    
    // Transform machine data for table display
    const tableData = machines.map(machine => ({
        machine_id: machine.machine_id,
        machine_name: machine.machine_name || '-',
        machine_type_label: machine.machine_type_label || '-',
        total_estimated_hours: machine.totals?.total_estimated_hours || 0,
        latest_planned_end: machine.totals?.latest_planned_end_ms || null,
        task_count: machine.totals?.task_count || 0
    }));
    
    console.log('Transformed table data:', tableData);
    
    // Update table data and set loading to false
    productionPlanTable.updateData(tableData);
    productionPlanTable.setLoading(false);
    
    console.log('Table updated successfully');
}

// Refresh production data
function refreshProductionData() {
    console.log('Refreshing production data...');
    
    // Reload production plan for all machines
    loadProductionPlanData();
}

// Show machine Gantt chart in modal
async function showMachineGantt(machineRow) {
    console.log('Showing Gantt chart for machine:', machineRow);
    
    try {
        // Check if modal is initialized
        if (!ganttModal) {
            console.error('Gantt modal not initialized');
            return;
        }
        
        // Show loading state
        ganttModal.setLoading(true);
        ganttModal.show();
        
        // Fetch machine-specific data
        const [tasks, calendar] = await Promise.all([
            getMachineProductionPlan(machineRow.machine_id),
            getMachineCalendar(machineRow.machine_id)
        ]);
        
        console.log('Fetched Gantt data:', { tasks, calendar });
        
        // Initialize Gantt chart in modal with both tasks and calendar
        initGanttInModal(tasks, calendar, machineRow.machine_name);
        
        // Update modal content
        if (ganttModal) {
            ganttModal.clearData();
            ganttModal.addCustomSection({
                customContent: `<div id="modal-gantt-container" style="height: 70vh; width: 100%;"></div>`
            });
            ganttModal.render();
            ganttModal.setLoading(false);
        }
        
    } catch (error) {
        console.error('Error loading Gantt chart:', error);
        if (ganttModal) {
            ganttModal.clearData();
            ganttModal.addCustomSection({
                customContent: `
                    <div class="text-center py-4">
                        <i class="fas fa-exclamation-triangle text-warning mb-3" style="font-size: 2rem;"></i>
                        <h6>Gantt Çizelgesi Yüklenemedi</h6>
                        <p class="text-muted">Makine verileri yüklenirken bir hata oluştu.</p>
                    </div>
                `
            });
            ganttModal.render();
            ganttModal.setLoading(false);
        }
    }
}

// Initialize Gantt modal
function initGanttModal() {
    // Add modal container to page if it doesn't exist
    if (!document.getElementById('gantt-modal-container')) {
        const modalContainer = document.createElement('div');
        modalContainer.id = 'gantt-modal-container';
        document.body.appendChild(modalContainer);
    }
    
    // Initialize modal after container is created
    ganttModal = new DisplayModal('gantt-modal-container', {
        title: 'Makine Gantt Çizelgesi',
        icon: 'fas fa-chart-gantt',
        size: 'xl',
        showEditButton: false,
        fullscreen: true
    });
}

// Initialize display modal container for completion data
function initDisplayModalContainer() {
    // Add display modal container to page if it doesn't exist
    if (!document.getElementById('display-modal-container')) {
        const modalContainer = document.createElement('div');
        modalContainer.id = 'display-modal-container';
        document.body.appendChild(modalContainer);
    }
    displayModalContainer = document.getElementById('display-modal-container');
}

// Get status badge for task (copied from tasks.js)
function getStatusBadge(task) {
    if (task.completion_date) {
        return '<span class="status-badge completed">Tamamlandı</span>';
    } else if (task.total_hours_spent > 0) {
        return '<span class="status-badge worked-on">Çalışıldı</span>';
    } else {
        return '<span class="status-badge pending">Bekliyor</span>';
    }
}

// Show completion data modal (adapted from tasks.js)
function showCompletionDataModal(task) {
    console.log('showCompletionDataModal called with task:', task);
    
    // Check if task object is valid
    if (!task) {
        console.error('Task object is null or undefined');
        return;
    }
    
    // Determine if task is completed
    const isCompleted = task.completion_date;
    
    // Calculate progress for unfinished tasks
    let progressPercentage = 0;
    let progressColor = 'secondary';
    let timeRemaining = '';
    let remaining_text = '';
    let efficiency = 'N/A';
    let hourDifference = 'N/A';
    let dateDifference = 'N/A';
    
    if (!isCompleted) {
        const now = new Date();
        const finishTime = task.finish_time ? new Date(task.finish_time) : null;
        const totalDuration = task.estimated_hours ? parseFloat(task.estimated_hours) : 0;
        const elapsed = task.total_hours_spent || 0;
        
        // Calculate progress percentage
        if (totalDuration > 0) {
            progressPercentage = Math.min(Math.max((elapsed / totalDuration) * 100, 0), 100);
        }
        
        // Calculate efficiency for unfinished tasks
        if (elapsed > 0 && totalDuration > 0 && progressPercentage > 0) {
            // Project total time based on current pace
            const projectedTotalTime = (elapsed / progressPercentage) * 100;
            const efficiencyValue = (totalDuration / projectedTotalTime) * 100;
            efficiency = `${efficiencyValue.toFixed(1)}%`;
        } else if (elapsed > 0 && totalDuration > 0) {
            // Fallback: simple ratio if no progress data
            efficiency = `${((totalDuration / elapsed) * 100).toFixed(1)}%`;
        }
        
        // Calculate hour difference
        if (totalDuration > 0) {
            const diff = (elapsed - totalDuration).toFixed(2);
            if (elapsed > totalDuration) {
                hourDifference = `${diff} saat fazla`;
            } else if (elapsed < totalDuration) {
                hourDifference = `${Math.abs(diff)} saat kaldı`;
            } else {
                hourDifference = 'Tam zamanında';
            }
        }
        
        // Calculate date difference
        if (task.planned_end_ms) {
            // Set both dates to midnight to get only day difference
            const nowOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const plannedEndOnly = new Date(task.planned_end_ms);
            const plannedEndDateOnly = new Date(plannedEndOnly.getFullYear(), plannedEndOnly.getMonth(), plannedEndOnly.getDate());
            
            const diffTime = plannedEndDateOnly.getTime() - nowOnly.getTime();
            const diffDays = diffTime / (1000 * 60 * 60 * 24);
            
            if (diffDays > 0) {
                dateDifference = `${diffDays} gün kaldı`;
            } else if (diffDays < 0) {
                dateDifference = `${Math.abs(diffDays)} gün gecikme`;
            } else {
                dateDifference = 'Bugün bitmesi gerekiyor';
            }
        }
        
        // Calculate remaining hours
        const remaining = totalDuration > 0 ? Math.abs(totalDuration - elapsed).toFixed(2) : 'N/A';
        
        // Determine progress color and remaining text
        if (progressPercentage >= 100) {
            progressColor = 'danger'; // Overdue
            remaining_text = totalDuration > 0 ? `${remaining} saat gecikme` : 'Süre belirtilmemiş';
        } else if (progressPercentage >= 75) {
            progressColor = 'warning'; // Almost due
            remaining_text = totalDuration > 0 ? `${remaining} saat kaldı` : 'Süre belirtilmemiş';
        } else {
            progressColor = 'info'; // On track
            remaining_text = totalDuration > 0 ? `${remaining} saat kaldı` : 'Süre belirtilmemiş';
        }
        
        // Calculate time remaining
        if (task.planned_end_ms) {
            const plannedEnd = new Date(task.planned_end_ms);
            const timeDiff = plannedEnd.getTime() - now.getTime();
            const daysRemaining = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
            
            if (daysRemaining > 0) {
                timeRemaining = `${daysRemaining} gün kaldı`;
            } else if (daysRemaining < 0) {
                timeRemaining = `${Math.abs(daysRemaining)} gün gecikme`;
            } else {
                timeRemaining = 'Bugün bitmesi gerekiyor';
            }
        } else {
            timeRemaining = 'Bitiş tarihi belirtilmemiş';
        }
    }
    
    // Create display modal instance
    const displayModal = new DisplayModal('display-modal-container', {
        title: `${isCompleted ? 'Tamamlanma Verileri' : 'Görev Durumu'} - ${task.key || task.id}`,
        icon: `fas fa-chart-line ${isCompleted ? 'text-success' : 'text-primary'}`,
        size: 'lg',
        showEditButton: false
    });
    
    // Add task information section
    displayModal.addSection({
        title: 'Görev Bilgileri',
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary',
        fields: [
            {
                id: 'task-key',
                label: 'TI No',
                value: task.key || task.id,
                type: 'text',
                colSize: 6,
                copyable: true
            },
            {
                id: 'task-name',
                label: 'Görev Adı',
                value: task.name || task.title,
                type: 'text',
                colSize: 6
            },
            {
                id: 'job-no',
                label: 'İş No',
                value: task.job_no || '-',
                type: 'text',
                colSize: 6
            },
            {
                id: 'image-no',
                label: 'Resim No',
                value: task.image_no || '-',
                type: 'text',
                colSize: 6
            },
            {
                id: 'position-no',
                label: 'Pozisyon No',
                value: task.position_no || '-',
                type: 'text',
                colSize: 6
            },
            {
                id: 'quantity',
                label: 'Adet',
                value: task.quantity || '-',
                type: 'number',
                colSize: 6
            }
        ]
    });
    
    // Add status/completion information section
    if (isCompleted) {
        displayModal.addSection({
            title: 'Tamamlanma Bilgileri',
            icon: 'fas fa-check-circle',
            iconColor: 'text-success',
            fields: [
                {
                    id: 'completed-by',
                    label: 'Tamamlayan',
                    value: task.completed_by_username || '-',
                    type: 'text',
                    colSize: 6
                },
                {
                    id: 'completion-date',
                    label: 'Tamamlanma Tarihi',
                    value: task.completion_date ? new Date(task.completion_date).toLocaleDateString('tr-TR') : '-',
                    type: 'date',
                    colSize: 6
                },
                {
                    id: 'finish-time',
                    label: 'Bitmesi Planlanan Tarih',
                    value: task.planned_end_ms ? new Date(task.planned_end_ms).toLocaleDateString('tr-TR') : '-',
                    type: 'date',
                    colSize: 6
                },
                {
                    id: 'machine',
                    label: 'Makine',
                    value: task.machine_name || '-',
                    type: 'text',
                    colSize: 6
                },
                {
                    id: 'estimated-hours',
                    label: 'Tahmini Saat',
                    value: task.estimated_hours || '-',
                    type: 'number',
                    colSize: 6
                },
                {
                    id: 'hours-spent',
                    label: 'Harcanan Saat',
                    value: task.total_hours_spent || '0',
                    type: 'number',
                    colSize: 6
                }
            ]
        });
    } else {
        // Add status section with custom HTML for ongoing tasks
        const statusHtml = `
            <div class="row g-3">
                <div class="col-md-6">
                    <div class="field-display mb-2">
                        <label class="field-label">Durum</label>
                        <div class="field-value">
                            ${getStatusBadge(task)}
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="field-display mb-2">
                        <label class="field-label">Başlangıç</label>
                        <div class="field-value">
                            ${task.planned_start_ms ? new Date(task.planned_start_ms).toLocaleDateString('tr-TR') : '-'}
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="field-display mb-2">
                        <label class="field-label">Bitmesi Planlanan Tarih</label>
                        <div class="field-value">
                            ${task.planned_end_ms ? new Date(task.planned_end_ms).toLocaleDateString('tr-TR') : '-'}
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="field-display mb-2">
                        <label class="field-label">Makine</label>
                        <div class="field-value">
                            ${task.machine_name || '-'}
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="field-display mb-2">
                        <label class="field-label">Tahmini Saat</label>
                        <div class="field-value">
                            ${task.estimated_hours || '-'}
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="field-display mb-2">
                        <label class="field-label">Harcanan Saat</label>
                        <div class="field-value">
                            ${task.total_hours_spent || '0'}
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        displayModal.addCustomSection({
            title: 'Görev Durumu',
            icon: 'fas fa-clock',
            iconColor: 'text-primary',
            customContent: statusHtml
        });
    }
    
    // Add performance analysis section with custom HTML
    if (isCompleted) {
        // Calculate completed task performance metrics
        const efficiency = task.estimated_hours ? 
            `${((task.estimated_hours / task.total_hours_spent) * 100).toFixed(1)}%` : 
            'N/A';
        const hourDiff = task.estimated_hours ? 
            `${(task.estimated_hours - task.total_hours_spent).toFixed(2)} saat` : 
            'N/A';
        
        // Calculate date difference for completed tasks
        let dateDiff = 'N/A';
        if (task.completion_date && task.planned_end_ms) {
            const completionDate = new Date(task.completion_date);
            const plannedEnd = new Date(task.planned_end_ms);
            
            // Set both dates to midnight to get only day difference
            const completionDateOnly = new Date(completionDate.getFullYear(), completionDate.getMonth(), completionDate.getDate());
            const plannedEndOnly = new Date(plannedEnd.getFullYear(), plannedEnd.getMonth(), plannedEnd.getDate());
            
            const diffTime = completionDateOnly.getTime() - plannedEndOnly.getTime();
            const diffDays = diffTime / (1000 * 60 * 60 * 24);
            
            if (diffDays > 0) {
                dateDiff = `+${diffDays} gün gecikme`;
            } else if (diffDays < 0) {
                dateDiff = `${Math.abs(diffDays)} gün erken`;
            } else {
                dateDiff = 'Tam zamanında';
            }
        }
        
        // Create simple performance analysis HTML
        const performanceHtml = `
            <div class="simple-performance">
                <div class="performance-row">
                    <div class="metric-item">
                        <span class="metric-label">Verimlilik:</span>
                        <span class="metric-value">${efficiency}</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">Saat Farkı:</span>
                        <span class="metric-value">${hourDiff}</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">Tarih Farkı:</span>
                        <span class="metric-value">${dateDiff}</span>
                    </div>
                </div>
            </div>
        `;
        
        displayModal.addCustomSection({
            title: 'Performans Analizi',
            icon: 'fas fa-chart-bar',
            iconColor: 'text-primary',
            customContent: performanceHtml
        });
    } else {
        // Create simple performance analysis HTML for ongoing tasks
        const performanceHtml = `
            <div class="simple-performance">
                <div class="performance-row">
                    <div class="metric-item">
                        <span class="metric-label">Verimlilik:</span>
                        <span class="metric-value">${efficiency}</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">Saat Farkı:</span>
                        <span class="metric-value">${hourDifference}</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">Tarih Farkı:</span>
                        <span class="metric-value">${dateDifference}</span>
                    </div>
                </div>
            </div>
        `;
        
        displayModal.addCustomSection({
            title: 'Performans Analizi',
            icon: 'fas fa-chart-bar',
            iconColor: 'text-primary',
            customContent: performanceHtml
        });
    }
    
    // Add export button to footer if task is completed
    if (isCompleted) {
        // Create custom footer with export button
        const modalFooter = displayModal.container.querySelector('.modal-footer');
        if (modalFooter) {
            modalFooter.innerHTML = `
                <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">
                    <i class="fas fa-times me-1"></i>Kapat
                </button>
                <button type="button" class="btn btn-sm btn-primary" onclick="exportCompletionData('${task.key || task.id}')">
                    <i class="fas fa-download me-1"></i>Dışa Aktar
                </button>
            `;
        }
    }
    
    // Render and show modal
    displayModal.render().show();
}

// Initialize Gantt chart in modal
function initGanttInModal(tasks, calendar, machineName) {
    // Destroy existing Gantt chart if any
    if (ganttChart) {
        ganttChart.destroy();
        ganttChart = null;
    }
    
    // Wait for modal content to be rendered
    setTimeout(() => {
        const ganttContainer = document.getElementById('modal-gantt-container');
        if (ganttContainer) {
            ganttChart = new GanttChart('modal-gantt-container', {
                title: `${machineName} - Zaman Çizelgesi`,
                defaultPeriod: 'month',
                showDateOverlay: true,
                showCurrentTime: true,
                showIssueKeysInBars: false, // Hide issue keys from task bars
                // Configure progress colors - red bars with green progress
                progressColors: {
                    completed: 'linear-gradient(135deg, #28a745 0%, #1e7e34 100%)',    // Green for completed
                    readyForCompletion: 'linear-gradient(135deg, #17a2b8 0%, #138496 100%)', // Blue for ready-for-completion
                    inProgress: 'linear-gradient(135deg, #28a745 0%, #1e7e34 100%)',    // Green for in-progress
                    delayed: 'linear-gradient(135deg, #dc3545 0%, #bd2130 100%)',       // Red for delayed
                    onHold: 'linear-gradient(135deg, #ffc107 0%, #e0a800 100%)'         // Yellow for on-hold
                },
                useCustomProgressColors: true,
                onPeriodChange: (period, date) => {
                    console.log('Gantt period changed:', period, date);
                    // Re-render with current tasks and calendar
                    if (calendar) {
                        ganttChart.setMachineCalendar(calendar);
                    }
                    ganttChart.setTasks(processTasksForProgress(tasks));
                },
                onTaskClick: async (task, event) => {
                    console.log('Task clicked in modal:', task);
                    
                    // Always get the task key from the clicked bar
                    const taskKey = event.target.closest('.gantt-task-bar')?.dataset.taskId;
                    if (!taskKey) {
                        console.error('Could not find task key');
                        return;
                    }
                    
                    // Always fetch fresh task data from API
                    console.log('Fetching task data from API with key:', taskKey);
                    try {
                        const fetchedTask = await fetchTaskById(taskKey);
                        if (fetchedTask) {
                            console.log('Fetched task from API:', fetchedTask);
                            showCompletionDataModal(fetchedTask);
                        } else {
                            console.error('Could not fetch task data from API');
                        }
                    } catch (error) {
                        console.error('Error fetching task data:', error);
                    }
                }
            });
            
            // Set the machine calendar first for proper working hours display
            if (calendar) {
                ganttChart.setMachineCalendar(calendar);
            }
            
            // Process tasks to include progress information and set them
            const processedTasks = processTasksForProgress(tasks);
            ganttChart.setTasks(processedTasks);
        }
    }, 100);
}

// Process tasks to include progress information for Gantt chart
function processTasksForProgress(tasks) {
    if (!tasks || !Array.isArray(tasks)) {
        console.log('No tasks to process for progress');
        return [];
    }
    
    console.log('Processing tasks for progress visualization:', tasks);
    
    return tasks.map(task => {
        // Create a copy of the task to avoid modifying the original
        const processedTask = { ...task };
        
        // Add id field for Gantt chart compatibility (use key as id)
        if (processedTask.key) {
            processedTask.id = processedTask.key;
        }
        
        // Add fallback dates for Gantt chart positioning
        // Use planned dates if available, otherwise use actual dates
        if (!processedTask.planned_start_ms && task.actual_start_ms) {
            processedTask.planned_start_ms = task.actual_start_ms;
        }
        
        if (!processedTask.planned_end_ms && task.completion_date) {
            processedTask.planned_end_ms = task.completion_date;
        }
        
        // Calculate progress percentage based on total_hours_spent and estimated_hours
        if (task.total_hours_spent !== undefined && task.estimated_hours !== undefined) {
            const progressPercentage = Math.min(100, Math.round((task.total_hours_spent / task.estimated_hours) * 100));
            processedTask.progress_percentage = progressPercentage;
            processedTask.completed_hours = task.total_hours_spent;
            processedTask.total_hours = task.estimated_hours;
            
            // Determine status based on completion and progress
            if (task.completion_date) {
                // Task is officially completed
                processedTask.status = 'completed';
                processedTask.progress_percentage = 100; // Force 100% for completed tasks
            } else if (progressPercentage >= 100) {
                // Task has reached 100% progress but isn't officially completed
                processedTask.status = 'ready-for-completion';
            } else if (task.is_hold || task.category === 'hold') {
                processedTask.status = 'on-hold';
            } else if (task.planned_end_ms && new Date() > new Date(task.planned_end_ms)) {
                processedTask.status = 'delayed';
            } else {
                processedTask.status = 'in-progress';
            }
        } else if (task.total_hours_spent !== undefined) {
            // If we have spent hours but no estimated hours, show as in-progress
            processedTask.completed_hours = task.total_hours_spent;
            processedTask.progress_percentage = 50; // Default to 50% if we can't calculate
            processedTask.status = 'in-progress';
        } else {
            // No progress information available
            processedTask.progress_percentage = 0;
            processedTask.status = 'in-progress';
        }
        
        console.log(`Processed task ${task.id || task.title}:`, {
            original: task,
            processed: processedTask,
            progress: processedTask.progress_percentage,
            status: processedTask.status
        });
        
        return processedTask;
    });
}

// Setup event listeners
function setupEventListeners() {
    // No additional event listeners needed for production plan page
    console.log('Event listeners setup completed');
}

// Export functions for global access
window.initProductionPlan = initProductionPlan;
window.refreshProductionData = refreshProductionData;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initProductionPlan();
});
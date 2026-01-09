/**
 * Gantt Chart Component
 * A reusable Gantt chart component for displaying timeline-based data
 */

class GanttChart {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            throw new Error(`Container with id '${containerId}' not found`);
        }

        // Default options
        this.options = {
            title: 'Zaman Çizelgesi',
            defaultPeriod: 'month',
            availableViews: ['day', 'week', 'month', 'year'], // All views available by default
            showDateOverlay: true,
            showCurrentTime: true,
            onPeriodChange: null,
            onTaskClick: null,
            onTaskDrag: null,
            showIssueKeysInBars: true, // Show issue keys in task bars
            // Progress customization options
            progressColors: {
                completed: null,    // Will use CSS custom properties
                inProgress: null,   // Will use CSS custom properties
                delayed: null,      // Will use CSS custom properties
                onHold: null        // Will use CSS custom properties
            },
            useCustomProgressColors: false,
            ...options
        };

        // Validate that defaultPeriod is in availableViews
        if (!this.options.availableViews.includes(this.options.defaultPeriod)) {
            this.options.defaultPeriod = this.options.availableViews[0];
        }

        // State
        this.currentPeriod = this.options.defaultPeriod;
        this.currentDate = new Date();
        this.tasks = [];
        this.allTasks = []; // Store all tasks separately
        this.viewStart = new Date();
        this.viewEnd = new Date();
        this.machineCalendar = null; // Store machine calendar for working hours

        // Initialize
        this.init();
    }

    init() {
        this.render();
        this.bindEvents();
        this.updateCurrentPeriodIndicator();
    }

    generatePeriodButtons() {
        const periodConfig = {
            day: { icon: 'fas fa-calendar-day', label: 'Gün' },
            week: { icon: 'fas fa-calendar-week', label: 'Hafta' },
            month: { icon: 'fas fa-calendar-alt', label: 'Ay' },
            year: { icon: 'fas fa-calendar', label: 'Yıl' }
        };

        return this.options.availableViews.map(period => {
            const config = periodConfig[period];
            const isActive = period === this.currentPeriod ? 'active' : '';
            return `
                <button type="button" class="btn btn-outline-primary ${isActive}" data-period="${period}">
                    <i class="${config.icon} me-1"></i>${config.label}
                </button>
            `;
        }).join('');
    }

    render() {
        this.container.innerHTML = `
            <div class="gantt-header">
                <div class="gantt-header-content">
                    <h6 class="gantt-title">
                        <i class="fas fa-chart-gantt me-2"></i>
                        <span class="gantt-title-text">${this.options.title}</span>
                    </h6>
                    <div class="gantt-controls">
                        <div class="gantt-period-controls">
                            <div class="btn-group btn-group-sm me-3" role="group">
                                ${this.generatePeriodButtons()}
                            </div>
                            <div class="btn-group btn-group-sm me-3" role="group">
                                <button type="button" class="btn btn-outline-info" id="gantt-current-period" disabled>
                                    <i class="fas fa-info-circle me-1"></i>
                                    <span class="period-label">Aralık 2024</span>
                                </button>
                            </div>
                            <div class="btn-group btn-group-sm" role="group">
                                <button type="button" class="btn btn-outline-secondary" id="gantt-prev" title="Önceki Dönem">
                                    <i class="fas fa-chevron-left"></i>
                                </button>
                                <button type="button" class="btn btn-outline-secondary" id="gantt-today" title="Bugün">
                                    <i class="fas fa-home"></i>
                                </button>
                                <button type="button" class="btn btn-outline-secondary" id="gantt-next" title="Sonraki Dönem">
                                    <i class="fas fa-chevron-right"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="gantt-chart" id="gantt-chart">
                <div class="gantt-empty-state">
                    <div class="text-center text-muted py-5">
                        <i class="fas fa-chart-gantt fa-3x mb-3"></i>
                        <p class="gantt-empty-message">Gantt çizelgesi için veri yükleniyor...</p>
                    </div>
                </div>
            </div>
        `;

        // Set initial active period button
        this.setActivePeriodButton(this.currentPeriod);
    }

    bindEvents() {
        // Period buttons
        this.container.addEventListener('click', (e) => {
            if (e.target.closest('[data-period]')) {
                const period = e.target.closest('[data-period]').dataset.period;
                this.setPeriod(period);
            }
        });

        // Navigation buttons
        const prevBtn = this.container.querySelector('#gantt-prev');
        const todayBtn = this.container.querySelector('#gantt-today');
        const nextBtn = this.container.querySelector('#gantt-next');

        if (prevBtn) prevBtn.addEventListener('click', () => this.navigate(-1));
        if (todayBtn) todayBtn.addEventListener('click', () => this.goToToday());
        if (nextBtn) nextBtn.addEventListener('click', () => this.navigate(1));
    }

    setPeriod(period) {
        // Validate that the period is available
        if (!this.options.availableViews.includes(period)) {
            return;
        }

        this.currentPeriod = period;
        this.setActivePeriodButton(period);
        this.filterTasksForCurrentView();
        this.updateCurrentPeriodIndicator();
        this.renderChart();
        
        // Note: Scroll position for day view is now handled in setTasks() when data is loaded
        
        if (this.options.onPeriodChange) {
            this.options.onPeriodChange(period, this.currentDate);
        }
    }

    setActivePeriodButton(period) {
        const buttons = this.container.querySelectorAll('[data-period]');
        buttons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.period === period) {
                btn.classList.add('active');
            }
        });
    }

    navigate(direction) {
        const date = new Date(this.currentDate);
        
        switch (this.currentPeriod) {
            case 'day':
                date.setDate(date.getDate() + direction);
                break;
            case 'week':
                date.setDate(date.getDate() + (direction * 7));
                break;
            case 'month':
                date.setMonth(date.getMonth() + direction);
                break;
            case 'year':
                date.setFullYear(date.getFullYear() + direction);
                break;
        }
        
        this.currentDate = date;
        this.updateCurrentPeriodIndicator();
        
        // Show skeleton loading immediately
        this.showSkeletonLoading();
        
        // Filter tasks and render chart after a brief delay to show skeleton
        setTimeout(() => {
            this.filterTasksForCurrentView();
            this.renderChart();
        }, 100);
        
        if (this.options.onPeriodChange) {
            this.options.onPeriodChange(this.currentPeriod, this.currentDate);
        }
    }

    goToToday() {
        this.currentDate = new Date();
        this.updateCurrentPeriodIndicator();
        
        // Show skeleton loading immediately
        this.showSkeletonLoading();
        
        // Filter tasks and render chart after a brief delay to show skeleton
        setTimeout(() => {
            this.filterTasksForCurrentView();
            this.renderChart();
        }, 100);
        
        if (this.options.onPeriodChange) {
            this.options.onPeriodChange(this.currentPeriod, this.currentDate);
        }
    }

    updateCurrentPeriodIndicator() {
        const periodElement = this.container.querySelector('#gantt-current-period');
        if (!periodElement) {
            return;
        }
        
        const date = new Date(this.currentDate);
        let periodLabel = '';
        
        switch (this.currentPeriod) {
            case 'day':
                periodLabel = date.toLocaleDateString('tr-TR', { 
                    weekday: 'short', 
                    day: 'numeric', 
                    month: 'short'
                });
                break;
                
            case 'week':
                const startOfWeek = new Date(date);
                const dayOfWeek = date.getDay();
                const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
                startOfWeek.setDate(date.getDate() + mondayOffset);
                const endOfWeek = new Date(startOfWeek);
                endOfWeek.setDate(startOfWeek.getDate() + 6);
                
                periodLabel = `${startOfWeek.getDate()}-${endOfWeek.getDate()} ${date.toLocaleDateString('tr-TR', { month: 'short' })}`;
                break;
                
            case 'month':
                periodLabel = date.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
                break;
                
            case 'year':
                periodLabel = date.getFullYear().toString();
                break;
        }
        
        const periodLabelSpan = periodElement.querySelector('.period-label');
        if (periodLabelSpan) {
            periodLabelSpan.textContent = periodLabel;
        }
    }

    setTasks(tasks) {
        this.allTasks = tasks || [];
        this.filterTasksForCurrentView();
        
        this.renderChart();
        
        // For day view, scroll to show working hours (7-17) when data is loaded
        if (this.currentPeriod === 'day') {
            // Use requestAnimationFrame to ensure DOM is fully rendered before scrolling
            requestAnimationFrame(() => {
                const scrollingColumn = this.container.querySelector('.gantt-scrolling-column');
                if (scrollingColumn) {
                    const cellWidth = this.calculateCellWidth();
                    const initialScrollLeft = 7 * cellWidth; // Scroll to show hour 7
                    scrollingColumn.scrollLeft = initialScrollLeft;
                }
            });
        }
    }
    
    setMachineCalendar(calendar) {
        this.machineCalendar = calendar;
        this.renderChart(); // Re-render to show working hours
    }
    
    getAllTasks() {
        return this.allTasks;
    }
    
    getCurrentTasks() {
        return this.tasks;
    }
    
    filterTasksForCurrentView() {
        // Calculate view range based on current navigation date
        this.calculateViewRange();
        
        // Filter tasks that are visible in the current view period
        this.tasks = this.allTasks.filter(task => {
            // If task has no dates, show it anyway (it might be newly added or reordered)
            if (!task.planned_start_ms || !task.planned_end_ms) {
                return true;
            }
            
            const taskStart = new Date(task.planned_start_ms);
            const taskEnd = new Date(task.planned_end_ms);
            
            // Check if task overlaps with current view period
            const overlapsView = taskStart <= this.viewEnd && taskEnd >= this.viewStart;
            
            if (!overlapsView) {
                return false;
            }
            
            // If machine calendar is available, check if task has any working days
            if (this.machineCalendar) {
                return this.hasWorkingDaysInRange(taskStart, taskEnd);
            }
            
            // If no machine calendar, use basic weekend filtering
            return this.hasWorkingDaysBasic(taskStart, taskEnd);
        });
    }

    showSkeletonLoading() {
        const chartContainer = this.container.querySelector('#gantt-chart');
        if (!chartContainer) {
            return;
        }

        // Generate skeleton loading based on current period
        const skeletonHTML = this.generateSkeletonLoading();
        
        chartContainer.innerHTML = `
            <div class="gantt-chart-container ${this.currentPeriod}-view">
                <div class="gantt-fixed-column">
                    <div class="gantt-header-label-cell">Görev</div>
                    ${skeletonHTML.taskLabels}
                </div>
                <div class="gantt-scrolling-column">
                    <div class="gantt-timeline-content">
                        <div id="gantt-timeline-header" class="gantt-timeline-header">
                            ${skeletonHTML.timelineHeader}
                        </div>
                        ${skeletonHTML.taskBars}
                    </div>
                </div>
            </div>
        `;
    }

    generateSkeletonLoading() {
        const cellWidth = this.calculateCellWidth();
        const cellHeight = this.calculateCellHeight();
        
        // Generate skeleton timeline header
        let timelineHeader = '';
        let totalWidth = 0;
        
        switch (this.currentPeriod) {
            case 'day':
                totalWidth = 24 * cellWidth;
                for (let i = 0; i < 24; i++) {
                    timelineHeader += `
                        <div class="gantt-header-cell skeleton-header-cell" style="min-width: ${cellWidth}px;">
                            <div class="gantt-date skeleton-text"></div>
                            <div class="gantt-month skeleton-text"></div>
                        </div>
                    `;
                }
                break;
            case 'week':
                totalWidth = 7 * cellWidth;
                for (let i = 0; i < 7; i++) {
                    timelineHeader += `
                        <div class="gantt-header-cell skeleton-header-cell" style="min-width: ${cellWidth}px;">
                            <div class="gantt-date skeleton-text"></div>
                            <div class="gantt-month skeleton-text"></div>
                        </div>
                    `;
                }
                break;
            case 'month':
                const totalDaysInMonth = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 0).getDate();
                totalWidth = totalDaysInMonth * cellWidth;
                for (let i = 0; i < totalDaysInMonth; i++) {
                    timelineHeader += `
                        <div class="gantt-header-cell skeleton-header-cell" style="min-width: ${cellWidth}px;">
                            <div class="gantt-date skeleton-text"></div>
                            <div class="gantt-month skeleton-text"></div>
                        </div>
                    `;
                }
                break;
            case 'year':
                totalWidth = 12 * cellWidth;
                for (let i = 0; i < 12; i++) {
                    timelineHeader += `
                        <div class="gantt-header-cell skeleton-header-cell" style="min-width: ${cellWidth}px;">
                            <div class="gantt-date skeleton-text"></div>
                            <div class="gantt-month skeleton-text"></div>
                        </div>
                    `;
                }
                break;
        }

        // Generate skeleton task labels (show 3-5 skeleton tasks)
        const skeletonTaskCount = Math.min(5, Math.max(3, this.tasks.length || 3));
        let taskLabels = '';
        let taskBars = '';
        
        for (let i = 0; i < skeletonTaskCount; i++) {
            taskLabels += `
                <div class="gantt-task-label">
                    <div class="gantt-task-ti-number skeleton-text"></div>
                    <div class="gantt-task-name skeleton-text"></div>
                </div>
            `;
            
            // Generate skeleton task bars with random widths and positions
            const randomLeft = Math.random() * (totalWidth * 0.6);
            const randomWidth = Math.random() * (totalWidth * 0.3) + 50;
            
            taskBars += `
                <div class="gantt-task-bar-container">
                    <div class="gantt-task-bar skeleton-task-bar" 
                         style="left: ${randomLeft}px; width: ${randomWidth}px;">
                        <div class="gantt-task-content skeleton-text"></div>
                    </div>
                </div>
            `;
        }

        return {
            timelineHeader,
            taskLabels,
            taskBars
        };
    }

    renderChart() {
        const chartContainer = this.container.querySelector('#gantt-chart');
        const dateOverlay = this.container.querySelector('#gantt-date-overlay');
        
        if (!chartContainer) {
            return;
        }

        // The date overlay will be created in the HTML below

        // Always calculate view range and create timeline structure
        this.calculateViewRange();

        // Handle tasks (if any)
        let sortedTasks = [];
        let visibleTasks = [];
        
        if (this.tasks.length > 0) {
            // Sort tasks by plan_order
            sortedTasks = [...this.tasks].sort((a, b) => (a.plan_order || 0) - (b.plan_order || 0));
            visibleTasks = sortedTasks;
        }

        // Generate timeline header
        const timelineHeader = this.generateTimelineHeader();
        
        // Generate task labels and task bars separately
        let taskLabels = '';
        let taskBars = '';
        
        if (visibleTasks.length > 0) {
            taskLabels = visibleTasks.map(task => {
                const taskTitle = task.title || task.name || `Görev ${task.id}`;
                const tiNumber = task.ti_number || task.key || task.id;
                return `<div class="gantt-task-label">
                    <div class="gantt-task-ti-number">${tiNumber}</div>
                    <div class="gantt-task-name">${taskTitle}</div>
                </div>`;
            }).join('');

            taskBars = visibleTasks.map(task => this.generateTaskBar(task)).join('');
        } else {
            // Show empty state message in the task area
            taskLabels = '<div class="gantt-task-label text-muted">Görev bulunmuyor</div>';
            taskBars = '<div class="gantt-task-bar-container"><div class="text-center text-muted py-3">Planlanmış görev bulunmuyor</div></div>';
        }

        chartContainer.innerHTML = `
            <div class="gantt-chart-container ${this.currentPeriod}-view">
                <div class="gantt-fixed-column">
                    <div class="gantt-header-label-cell">Görev</div>
                    ${taskLabels}
                </div>
                <div class="gantt-scrolling-column">
                    <div class="gantt-timeline-content">
                        <div id="gantt-timeline-header" class="gantt-timeline-header">
                            ${timelineHeader}
                        </div>
                        <div class="gantt-working-hours-background">
                            <!-- Working hours background will be generated after DOM is created -->
                        </div>
                        ${taskBars}
                    </div>
                </div>
            </div>
        `;
        
        // Generate working hours background after DOM is created
        const workingHoursContainer = chartContainer.querySelector('.gantt-working-hours-background');
        if (workingHoursContainer) {
            workingHoursContainer.innerHTML = this.generateWorkingHoursBackground();
        }
        
        // Apply grid background to timeline content
        const timelineContent = chartContainer.querySelector('.gantt-timeline-content');
        if (timelineContent) {
            const cellWidth = this.calculateCellWidth();
            const cellHeight = this.calculateCellHeight(); // Height of each task row
            
            // Calculate the exact width needed for the current view
            let totalWidth;
            switch (this.currentPeriod) {
                case 'day':
                    totalWidth = 24 * cellWidth; // 24 hours (full day)
                    break;
                case 'week':
                    totalWidth = 7 * cellWidth; // 7 days
                    break;
                case 'month':
                    const totalDaysInMonth = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 0).getDate();
                    totalWidth = totalDaysInMonth * cellWidth; // Exact number of days
                    break;
                case 'year':
                    totalWidth = 12 * cellWidth; // 12 months
                    break;
                default:
                    totalWidth = 1000;
            }
            
            const verticalLines = `linear-gradient(to right, #e5e7eb 1px, transparent 1px)`;
            const horizontalLines = `linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)`;
            const gridBackground = `${verticalLines}, ${horizontalLines}`;
            const backgroundSize = `${cellWidth}px ${cellHeight}px`;
            timelineContent.style.backgroundImage = gridBackground;
            timelineContent.style.backgroundSize = backgroundSize;
            timelineContent.style.backgroundRepeat = 'repeat';
            timelineContent.style.width = `${totalWidth}px`;
            
            // Note: Day view scroll position is set later in the method
        }

        // Update the period indicator in the header
        this.updateCurrentPeriodIndicator();

        // Add current time indicator
        if (this.options.showCurrentTime) {
            this.addCurrentTimeIndicator();
        }

        // Bind task events
        this.bindTaskEvents();
        
        // Note: Scroll position for day view is now handled in setTasks() when data is loaded
    }

    // Centralized width calculation method
    calculateCellWidth() {
        const containerWidth = this.container.querySelector('.gantt-scrolling-column')?.offsetWidth || 800;
        
        switch (this.currentPeriod) {
            case 'day':
                const visibleHours = 11; // Initially show 7-17 (11 hours)
                return Math.max(20, containerWidth / visibleHours);
                
            case 'week':
                const totalDaysInWeek = 7; // Show only current week
                return Math.max(60, containerWidth / totalDaysInWeek);
                
            case 'month':
                // Use a reasonable minimum width for month days, enable scrolling if needed
                return 50; // Fixed width for month days
                
            case 'year':
                const totalMonthsInYear = 12; // Show only current year
                return Math.max(80, containerWidth / totalMonthsInYear);
                
            default:
                return 100;
        }
    }

    calculateCellHeight() {
        // Use fixed height to ensure consistent alignment
        return 60;
    }


    calculateViewRange() {
        // Always calculate view range based on current navigation date
        const date = new Date(this.currentDate);
        this.calculateViewRangeForDate(date);
    }
    
    calculateViewRangeForDate(date) {
        switch (this.currentPeriod) {
            case 'day':
                // Show full day range (00:00 to 23:59) but initially display only 7-17
                this.viewStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
                this.viewEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
                break;
                
            case 'week':
                // Show only current week (Monday to Sunday)
                const dayOfWeek = date.getDay();
                const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
                const currentWeekStart = new Date(date);
                currentWeekStart.setDate(date.getDate() + mondayOffset);
                currentWeekStart.setHours(0, 0, 0, 0);
                
                this.viewStart = new Date(currentWeekStart);
                this.viewEnd = new Date(currentWeekStart);
                this.viewEnd.setDate(currentWeekStart.getDate() + 6); // Sunday
                this.viewEnd.setHours(23, 59, 59, 999);
                break;
                
            case 'month':
                // Show only current month (1st to last day)
                this.viewStart = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
                this.viewEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
                break;
                
            case 'year':
                // Show only current year (January to December)
                this.viewStart = new Date(date.getFullYear(), 0, 1, 0, 0, 0, 0);
                this.viewEnd = new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);
                break;
        }
    }

    generateTimelineHeader() {
        let headerCells = '';
        
        switch (this.currentPeriod) {
            case 'day':
                // Hourly view for current day (24 hours) - initially show 7-17, scrollable to show all
                const totalHours = 24; // Full day hours
                const hourWidth = this.calculateCellWidth();
                
                for (let i = 0; i < totalHours; i++) {
                    const currentHour = new Date(this.viewStart);
                    currentHour.setHours(i, 0, 0, 0);
                    const hour = currentHour.getHours();
                    const day = currentHour.getDate();
                    const month = currentHour.getMonth() + 1;
                    
                    const label = `${hour.toString().padStart(2, '0')}`;
                    const sublabel = i === 0 ? `${day}/${month}` : (hour < 12 ? 'ÖÖ' : 'ÖS');
                    
                    // Add class to identify initial visible hours (7-17)
                    const isInitialVisible = hour >= 7 && hour <= 17;
                    const cellClass = isInitialVisible ? 'gantt-header-cell initial-visible' : 'gantt-header-cell';
                    
                    headerCells += `
                        <div class="${cellClass}" style="min-width: ${hourWidth}px;">
                            <div class="gantt-date">${label}</div>
                            <div class="gantt-month">${sublabel}</div>
                        </div>
                    `;
                }
                break;
                
            case 'week':
                // Daily view for current week (7 days) - fit in visible area
                const weekDays = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
                const totalDaysInWeek = 7; // Show only current week
                const dayWidth = this.calculateCellWidth();
                
                for (let i = 0; i < totalDaysInWeek; i++) {
                    const currentDate = new Date(this.viewStart);
                    currentDate.setDate(this.viewStart.getDate() + i);
                    
                    const day = currentDate.getDate();
                    const dayName = weekDays[currentDate.getDay() === 0 ? 6 : currentDate.getDay() - 1]; // Adjust for Monday start
                    const month = currentDate.getMonth() + 1;
                    
                    headerCells += `
                        <div class="gantt-header-cell" style="min-width: ${dayWidth}px;">
                            <div class="gantt-date">${day}</div>
                            <div class="gantt-month">${dayName} ${month}</div>
                        </div>
                    `;
                }
                break;
                
            case 'month':
                // Daily view for current month - fit in visible area
                const totalDaysInMonth = new Date(this.viewStart.getFullYear(), this.viewStart.getMonth() + 1, 0).getDate();
                const monthDayWidth = this.calculateCellWidth();
                for (let i = 0; i < totalDaysInMonth; i++) {
                    const currentDate = new Date(this.viewStart.getFullYear(), this.viewStart.getMonth(), i + 1);
                    
                    const day = currentDate.getDate();
                    const month = currentDate.toLocaleDateString('tr-TR', { month: 'short' });
                    
                    headerCells += `
                        <div class="gantt-header-cell" style="min-width: ${monthDayWidth}px;">
                            <div class="gantt-date">${day}</div>
                            <div class="gantt-month">${month}</div>
                        </div>
                    `;
                }
                break;
                
            case 'year':
                // Monthly view for current year (12 months) - fit in visible area
                const monthNames = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
                const totalMonthsInYear = 12; // Show only current year
                const yearMonthWidth = this.calculateCellWidth();
                
                for (let i = 0; i < totalMonthsInYear; i++) {
                    const currentMonth = new Date(this.viewStart.getFullYear(), i, 1);
                    
                    const monthName = monthNames[currentMonth.getMonth()];
                    const year = currentMonth.getFullYear();
                    
                    headerCells += `
                        <div class="gantt-header-cell" style="min-width: ${yearMonthWidth}px;">
                            <div class="gantt-date">${monthName}</div>
                            <div class="gantt-month">${year}</div>
                        </div>
                    `;
                }
                break;
        }
        
        return headerCells;
    }

    generateTaskTooltip(task, startTime, endTime) {
        if (!startTime || !endTime) {
            return `Tarih atanmamış`;
        }
        
        // Use remaining_hours from task data instead of calculating from duration
        const hours = task.remaining_hours || task.estimated_hours || 0;
        
        const startDateStr = startTime.toLocaleDateString('tr-TR');
        const startTimeStr = startTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        const endDateStr = endTime.toLocaleDateString('tr-TR');
        const endTimeStr = endTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        
        // Add progress information to tooltip
        let progressInfo = '';
        if (task.progress_percentage !== undefined) {
            progressInfo = `\nİlerleme: %${task.progress_percentage}`;
        }
        if (task.completed_hours !== undefined && task.total_hours !== undefined) {
            progressInfo += `\nTamamlanan: ${task.completed_hours}/${task.total_hours} saat`;
        }
        
        return `${hours} saat\n${startDateStr} ${startTimeStr} - ${endDateStr} ${endTimeStr}${progressInfo}`;
    }

    generateProgressBar(task, segmentInfo = null) {
        // Check if task has progress information
        if (task.progress_percentage === undefined && task.completed_hours === undefined) {
            return '';
        }
        
        const progressPercentage = task.progress_percentage || 
            (task.completed_hours && task.total_hours ? 
                Math.round((task.completed_hours / task.total_hours) * 100) : 0);
        
        // For segment-based progress, we need to determine if this segment should show progress
        let segmentProgressPercentage = progressPercentage;
        if (segmentInfo && segmentInfo.totalDuration && segmentInfo.segmentDuration) {
            // Calculate the ratio of this segment's duration to total task duration
            const segmentRatio = segmentInfo.segmentDuration / segmentInfo.totalDuration;
            
            // Calculate cumulative progress up to this segment
            const cumulativeProgress = segmentInfo.cumulativeProgress || 0;
            
            // Calculate the progress range for this segment
            const segmentStartProgress = cumulativeProgress;
            const segmentEndProgress = cumulativeProgress + (segmentRatio * 100);
            
            // Determine how much progress to show in this segment
            if (progressPercentage >= segmentEndProgress) {
                // Task is fully complete up to this segment - show 100%
                segmentProgressPercentage = 100;
            } else if (progressPercentage <= segmentStartProgress) {
                // Task hasn't reached this segment yet - show 0%
                segmentProgressPercentage = 0;
            } else {
                // Task is partially complete in this segment
                // Calculate what percentage of this segment should be filled
                const segmentProgress = ((progressPercentage - segmentStartProgress) / (segmentEndProgress - segmentStartProgress)) * 100;
                segmentProgressPercentage = Math.min(100, Math.max(0, segmentProgress));
            }
        }
        
        // Determine progress status class
        let progressClass = 'in-progress';
        if (task.status === 'completed') {
            progressClass = 'completed';
        } else if (task.status === 'ready-for-completion') {
            progressClass = 'readyForCompletion';
        } else if (task.status === 'delayed' || task.status === 'overdue') {
            progressClass = 'delayed';
        } else if (task.status === 'on-hold' || task.status === 'paused') {
            progressClass = 'on-hold';
        } else if (progressPercentage >= 100) {
            progressClass = 'completed';
        }
        
        // Add custom prefix if using custom colors
        if (this.options.useCustomProgressColors) {
            progressClass = `custom-${progressClass}`;
        }
        
        // Get custom color if available
        let customStyle = '';
        if (this.options.useCustomProgressColors && this.options.progressColors) {
            const colorKey = progressClass.replace('custom-', '');
            const customColor = this.options.progressColors[colorKey];
            if (customColor) {
                customStyle = `background: ${customColor};`;
            }
        }
        
        return `
            <div class="gantt-task-progress ${progressClass}" style="width: ${Math.min(segmentProgressPercentage, 100)}%; ${customStyle}">
                ${segmentProgressPercentage > 20 ? `<div class="gantt-task-progress-label">%${Math.round(segmentProgressPercentage)}</div>` : ''}
            </div>
        `;
    }

    calculateSegmentInfo(task, segmentStart, segmentEnd, allSegments) {
        if (!allSegments || allSegments.length === 0) {
            return null;
        }
        
        // Calculate total duration of all segments
        const totalDuration = allSegments.reduce((total, seg) => {
            return total + (seg.end - seg.start);
        }, 0);
        
        // Calculate duration of current segment
        const segmentDuration = segmentEnd - segmentStart;
        
        // Calculate cumulative progress up to this segment
        let cumulativeProgress = 0;
        for (let i = 0; i < allSegments.length; i++) {
            if (allSegments[i].start === segmentStart && allSegments[i].end === segmentEnd) {
                break;
            }
            cumulativeProgress += (allSegments[i].end - allSegments[i].start);
        }
        
        return {
            totalDuration,
            segmentDuration,
            cumulativeProgress: (cumulativeProgress / totalDuration) * 100
        };
    }


    hasWorkingDaysInRange(taskStart, taskEnd) {
        // Check if there are any working days in the task range
        const currentDate = new Date(taskStart);
        const endDate = new Date(taskEnd);
        
        while (currentDate <= endDate) {
            const workingHours = this.getWorkingHoursForDate(currentDate);
            if (workingHours.length > 0) {
                return true; // Found at least one working day
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }
        
        return false; // No working days found
    }

    hasWorkingDaysBasic(taskStart, taskEnd) {
        // Basic weekend filtering when no machine calendar is available
        const startDate = new Date(taskStart);
        const endDate = new Date(taskEnd);
        
        // Check if task starts or ends on a weekend
        const startDay = startDate.getDay(); // 0 = Sunday, 6 = Saturday
        const endDay = endDate.getDay();
        
        // If task starts or ends on weekend, hide it
        if (startDay === 0 || startDay === 6 || endDay === 0 || endDay === 6) {
            return false;
        }
        
        // Check if task spans across weekends
        const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
        if (daysDiff >= 7) {
            // Task spans more than a week, likely includes weekend
            return false;
        }
        
        return true;
    }

    generateTaskBar(task) {
        // Handle tasks with multiple segments (for "All Machines" view)
        if (task.segments && Array.isArray(task.segments) && task.segments.length > 0) {
            return this.generateMultiSegmentTaskBar(task);
        }
        
        // Handle tasks without dates
        if (!task.planned_start_ms || !task.planned_end_ms) {
            const taskTitle = task.title || task.name || `Görev ${task.id}`;
            const tiNumber = task.ti_number || task.key || task.id;
            const isLocked = task.plan_locked || false;
            const category = task.category || 'work';
            const taskClass = isLocked ? 'locked' : 'unlocked';
            const categoryClass = `category-${category}`;
            
            return `
                <div class="gantt-task-bar-container">
                    <div class="gantt-task-bar ${taskClass} ${categoryClass} no-dates" 
                         style="left: 0px; width: 100px; opacity: 0.6;"
                         data-task-id="${task.id}"
                         data-category="${category}"
                         title="${this.generateTaskTooltip(task, null, null)}">
                        ${this.generateProgressBar(task)}
                        <div class="gantt-task-content">${this.options.showIssueKeysInBars ? tiNumber : ''}</div>
                    </div>
                </div>
            `;
        }
        
        const taskStart = new Date(task.planned_start_ms);
        const taskEnd = new Date(task.planned_end_ms);
        const isLocked = task.plan_locked || false;
        const category = task.category || 'work';
        const taskClass = isLocked ? 'locked' : 'unlocked';
        const categoryClass = `category-${category}`;
        const taskTitle = task.title || task.name || `Görev ${task.id}`;
        const tiNumber = task.ti_number || task.key || task.id;
        
        // If no machine calendar is set, use the old continuous bar approach
        if (!this.machineCalendar) {
            return this.generateContinuousTaskBar(task, taskStart, taskEnd, taskClass, categoryClass, taskTitle, tiNumber);
        }
        
        // Generate working hours segments for the task
        const workingSegments = this.calculateWorkingHoursSegments(taskStart, taskEnd);
        
        if (workingSegments.length === 0) {
            // Task has no working hours overlap - don't display on non-working days
            return `
                <div class="gantt-task-bar-container">
                    <!-- Task hidden - no working hours for this day -->
                </div>
            `;
        }
        
        // Generate multiple segments for working hours
        const segments = workingSegments.map((segment, index) => {
            const left = this.calculateSegmentPosition(segment.start);
            const width = this.calculateSegmentWidth(segment.start, segment.end);
            
            if (left < -500) {
                return ''; // Segment is outside current view
            }
            
            // Calculate segment info for proportional progress
            const segmentInfo = this.calculateSegmentInfo(task, segment.start, segment.end, workingSegments);
            
            return `
                <div class="gantt-task-bar ${taskClass} ${categoryClass}" 
                     style="left: ${left}px; width: ${width}px;"
                     data-task-id="${task.id}"
                     data-category="${category}"
                     title="${this.generateTaskTooltip(task, segment.start, segment.end)}">
                    ${this.generateProgressBar(task, segmentInfo)}
                    <div class="gantt-task-content">${this.options.showIssueKeysInBars ? tiNumber : ''}</div>
                </div>
            `;
        }).filter(segment => segment !== '').join('');
        
        return `
            <div class="gantt-task-bar-container">
                ${segments}
            </div>
        `;
    }
    
    generateMultiSegmentTaskBar(task) {
        const taskTitle = task.title || task.name || `Görev ${task.id}`;
        const tiNumber = task.ti_number || task.key || task.id;
        
        // Generate segments for each timer segment
        const segments = task.segments.map((segment, index) => {
            const segmentStart = new Date(segment.planned_start_ms);
            const segmentEnd = new Date(segment.planned_end_ms);
            
            const left = this.calculateSegmentPosition(segmentStart);
            const width = this.calculateSegmentWidth(segmentStart, segmentEnd);
            
            if (left < -500) {
                return ''; // Segment is outside current view
            }
            
            const category = segment.category || 'work';
            const categoryClass = `category-${category}`;
            const segmentTitle = segment.title || segment.name || 'Bilinmeyen';
            const segmentTiNumber = segment.ti_number || segment.key || segment.id;
            
            // Calculate segment info for proportional progress
            const allSegments = task.segments.map(s => ({
                start: new Date(s.planned_start_ms),
                end: new Date(s.planned_end_ms)
            }));
            const segmentInfo = this.calculateSegmentInfo(segment, segmentStart, segmentEnd, allSegments);
            
            return `
                <div class="gantt-task-bar unlocked ${categoryClass}" 
                     style="left: ${left}px; width: ${width}px;"
                     data-task-id="${segment.id}"
                     data-category="${category}"
                     data-timer-id="${segment.timer_id || ''}"
                     title="${this.generateTaskTooltip(segment, segmentStart, segmentEnd)}">
                    ${this.generateProgressBar(segment, segmentInfo)}
                    <div class="gantt-task-content">${segmentTiNumber}</div>
                </div>
            `;
        }).filter(segment => segment !== '').join('');
        
        return `
            <div class="gantt-task-bar-container">
                ${segments}
            </div>
        `;
    }

    generateContinuousTaskBar(task, taskStart, taskEnd, taskClass, categoryClass, taskTitle, tiNumber) {
        const duration = taskEnd - taskStart;
        
        // Calculate position and width based on current period
        let left, width;
        
        switch (this.currentPeriod) {
            case 'day':
                // Position based on hours in current day (24 hours)
                // Clip task to only show the portion within the current day view
                const dayStart = new Date(this.viewStart);
                const dayEnd = new Date(this.viewStart);
                dayEnd.setHours(23, 59, 59, 999); // End of current day
                
                // Calculate the actual start and end times within the current day
                const actualStart = new Date(Math.max(taskStart.getTime(), dayStart.getTime()));
                const actualEnd = new Date(Math.min(taskEnd.getTime(), dayEnd.getTime()));
                
                // Only show task if it has any portion within the current day
                if (actualStart < actualEnd) {
                    const startOffsetHours = (actualStart - this.viewStart) / (1000 * 60 * 60);
                    const durationHours = (actualEnd - actualStart) / (1000 * 60 * 60);
                    const hourWidth = this.calculateCellWidth();
                    
                    left = startOffsetHours * hourWidth; // Allow negative positions for scrolling
                    width = Math.max(20, durationHours * hourWidth);
                } else {
                    // Task is completely outside current day, hide it
                    left = -1000;
                    width = 0;
                }
                break;
                
            case 'week':
                // Position based on days (Monday to Sunday) - fit in visible area
                const startOffsetDays = (taskStart - this.viewStart) / (1000 * 60 * 60 * 24);
                const durationDays = duration / (1000 * 60 * 60 * 24);
                const weekDayWidth = this.calculateCellWidth();
                
                left = Math.max(0, startOffsetDays * weekDayWidth);
                width = Math.max(20, durationDays * weekDayWidth);
                break;
                
            case 'month':
                // Position based on days (1st to last day of month) - fit in visible area
                const monthStartOffsetDays = (taskStart - this.viewStart) / (1000 * 60 * 60 * 24);
                const monthDurationDays = duration / (1000 * 60 * 60 * 24);
                const monthDayWidth = this.calculateCellWidth();
                
                left = Math.max(0, monthStartOffsetDays * monthDayWidth);
                width = Math.max(20, monthDurationDays * monthDayWidth);
                
                break;
                
            case 'year':
                // Position based on months (January to December) - fit in visible area
                const startMonth = taskStart.getMonth();
                const endMonth = taskEnd.getMonth();
                const yearMonthWidth = this.calculateCellWidth();
                
                left = Math.max(0, startMonth * yearMonthWidth);
                width = Math.max(20, (endMonth - startMonth + 1) * yearMonthWidth);
                break;
        }
        
        // Don't render task if it's hidden (completely outside current view)
        if (left < -500) {
            return `
                <div class="gantt-task-bar-container">
                    <!-- Task hidden - outside current view -->
                </div>
            `;
        }
        
        return `
            <div class="gantt-task-bar-container">
                <div class="gantt-task-bar ${taskClass} ${categoryClass}" 
                     style="left: ${left}px; width: ${width}px;"
                     data-task-id="${task.id}"
                     data-category="${task.category || 'work'}"
                     title="${this.generateTaskTooltip(task, taskStart, taskEnd)}">
                    ${this.generateProgressBar(task)}
                    <div class="gantt-task-content">${this.options.showIssueKeysInBars ? tiNumber : ''}</div>
                </div>
            </div>
        `;
    }
    
    calculateWorkingHoursSegments(taskStart, taskEnd) {
        const segments = [];
        
        // For day view, only calculate segments for the current day
        if (this.currentPeriod === 'day') {
            const currentDay = new Date(this.viewStart);
            currentDay.setHours(0, 0, 0, 0);
            
            // Check if task overlaps with current day
            const dayStart = new Date(currentDay);
            const dayEnd = new Date(currentDay);
            dayEnd.setHours(23, 59, 59, 999);
            
            // Only process if task overlaps with current day
            if (taskStart <= dayEnd && taskEnd >= dayStart) {
                const workingHours = this.getWorkingHoursForDate(currentDay);
                
                // If there are no working hours for this day, return empty segments
                // This will prevent the task from being displayed on non-working days
                if (workingHours.length === 0) {
                    return [];
                }
                
                // For each working hour window on this day
                workingHours.forEach(window => {
                    const windowStart = new Date(currentDay);
                    const windowEnd = new Date(currentDay);
                    
                    // Parse time strings (e.g., "07:30" -> 7:30 AM)
                    const [startHour, startMinute] = window.start.split(':').map(Number);
                    const [endHour, endMinute] = window.end.split(':').map(Number);
                    
                    windowStart.setHours(startHour, startMinute, 0, 0);
                    windowEnd.setHours(endHour, endMinute, 0, 0);
                    
                    // Find intersection with task duration
                    const segmentStart = new Date(Math.max(taskStart.getTime(), windowStart.getTime()));
                    const segmentEnd = new Date(Math.min(taskEnd.getTime(), windowEnd.getTime()));
                    
                    // Only add segment if there's an actual intersection
                    if (segmentStart < segmentEnd) {
                        segments.push({
                            start: segmentStart,
                            end: segmentEnd
                        });
                    }
                });
            }
        } else if (this.currentPeriod === 'week') {
            // For week view, merge consecutive working days into single bars
            const currentDate = new Date(this.viewStart);
            let currentSegmentStart = null;
            let currentSegmentEnd = null;
            
            // Iterate through each day in the current week (Monday to Sunday)
            for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
                const dayInWeek = new Date(currentDate);
                dayInWeek.setDate(currentDate.getDate() + dayOffset);
                dayInWeek.setHours(0, 0, 0, 0);
                
                // Check if task overlaps with this day in the week
                const dayStart = new Date(dayInWeek);
                const dayEnd = new Date(dayInWeek);
                dayEnd.setHours(23, 59, 59, 999);
                
                // Only process if task overlaps with this day
                if (taskStart <= dayEnd && taskEnd >= dayStart) {
                    const workingHours = this.getWorkingHoursForDate(dayInWeek);
                    
                    if (workingHours.length > 0) {
                        // Calculate the working time for this day
                        const dayWorkingStart = new Date(dayInWeek);
                        const dayWorkingEnd = new Date(dayInWeek);
                        
                        // Use the first working window start and last working window end
                        const firstWindow = workingHours[0];
                        const lastWindow = workingHours[workingHours.length - 1];
                        
                        const [startHour, startMinute] = firstWindow.start.split(':').map(Number);
                        const [endHour, endMinute] = lastWindow.end.split(':').map(Number);
                        
                        dayWorkingStart.setHours(startHour, startMinute, 0, 0);
                        dayWorkingEnd.setHours(endHour, endMinute, 0, 0);
                        
                        // Find intersection with task duration
                        const segmentStart = new Date(Math.max(taskStart.getTime(), dayWorkingStart.getTime()));
                        const segmentEnd = new Date(Math.min(taskEnd.getTime(), dayWorkingEnd.getTime()));
                        
                        // Only process if there's an actual intersection
                        if (segmentStart < segmentEnd) {
                            if (currentSegmentStart === null) {
                                // Start a new segment
                                currentSegmentStart = segmentStart;
                                currentSegmentEnd = segmentEnd;
                            } else {
                                // Check if this day is consecutive (next day)
                                const prevDay = new Date(currentSegmentEnd);
                                prevDay.setHours(0, 0, 0, 0);
                                const currentDay = new Date(segmentStart);
                                currentDay.setHours(0, 0, 0, 0);
                                
                                const daysDiff = (currentDay - prevDay) / (1000 * 60 * 60 * 24);
                                
                                if (daysDiff === 1) {
                                    // Consecutive day - extend the current segment
                                    currentSegmentEnd = segmentEnd;
                                } else {
                                    // Non-consecutive day - finish current segment and start new one
                                    segments.push({
                                        start: currentSegmentStart,
                                        end: currentSegmentEnd
                                    });
                                    currentSegmentStart = segmentStart;
                                    currentSegmentEnd = segmentEnd;
                                }
                            }
                        }
                    } else {
                        // Non-working day - finish current segment if exists
                        if (currentSegmentStart !== null) {
                            segments.push({
                                start: currentSegmentStart,
                                end: currentSegmentEnd
                            });
                            currentSegmentStart = null;
                            currentSegmentEnd = null;
                        }
                    }
                } else {
                    // Task doesn't overlap with this day - finish current segment if exists
                    if (currentSegmentStart !== null) {
                        segments.push({
                            start: currentSegmentStart,
                            end: currentSegmentEnd
                        });
                        currentSegmentStart = null;
                        currentSegmentEnd = null;
                    }
                }
            }
            
            // Finish the last segment if exists
            if (currentSegmentStart !== null) {
                segments.push({
                    start: currentSegmentStart,
                    end: currentSegmentEnd
                });
            }
        } else if (this.currentPeriod === 'month') {
            // For month view, merge consecutive working days into single bars
            const currentDate = new Date(this.viewStart);
            let currentSegmentStart = null;
            let currentSegmentEnd = null;
            
            // Iterate through each day in the current month
            const totalDaysInMonth = new Date(this.viewStart.getFullYear(), this.viewStart.getMonth() + 1, 0).getDate();
            
            for (let dayOffset = 0; dayOffset < totalDaysInMonth; dayOffset++) {
                const dayInMonth = new Date(currentDate);
                dayInMonth.setDate(currentDate.getDate() + dayOffset);
                dayInMonth.setHours(0, 0, 0, 0);
                
                // Check if task overlaps with this day in the month
                const dayStart = new Date(dayInMonth);
                const dayEnd = new Date(dayInMonth);
                dayEnd.setHours(23, 59, 59, 999);
                
                // Only process if task overlaps with this day
                if (taskStart <= dayEnd && taskEnd >= dayStart) {
                    const workingHours = this.getWorkingHoursForDate(dayInMonth);
                    
                    if (workingHours.length > 0) {
                        // Calculate the working time for this day
                        const dayWorkingStart = new Date(dayInMonth);
                        const dayWorkingEnd = new Date(dayInMonth);
                        
                        // Use the first working window start and last working window end
                        const firstWindow = workingHours[0];
                        const lastWindow = workingHours[workingHours.length - 1];
                        
                        const [startHour, startMinute] = firstWindow.start.split(':').map(Number);
                        const [endHour, endMinute] = lastWindow.end.split(':').map(Number);
                        
                        dayWorkingStart.setHours(startHour, startMinute, 0, 0);
                        dayWorkingEnd.setHours(endHour, endMinute, 0, 0);
                        
                        // Find intersection with task duration
                        const segmentStart = new Date(Math.max(taskStart.getTime(), dayWorkingStart.getTime()));
                        const segmentEnd = new Date(Math.min(taskEnd.getTime(), dayWorkingEnd.getTime()));
                        
                        // Only process if there's an actual intersection
                        if (segmentStart < segmentEnd) {
                            if (currentSegmentStart === null) {
                                // Start a new segment
                                currentSegmentStart = segmentStart;
                                currentSegmentEnd = segmentEnd;
                            } else {
                                // Check if this day is consecutive (next day)
                                const prevDay = new Date(currentSegmentEnd);
                                prevDay.setHours(0, 0, 0, 0);
                                const currentDay = new Date(segmentStart);
                                currentDay.setHours(0, 0, 0, 0);
                                
                                const daysDiff = (currentDay - prevDay) / (1000 * 60 * 60 * 24);
                                
                                if (daysDiff === 1) {
                                    // Consecutive day - extend the current segment
                                    currentSegmentEnd = segmentEnd;
                                } else {
                                    // Non-consecutive day - finish current segment and start new one
                                    segments.push({
                                        start: currentSegmentStart,
                                        end: currentSegmentEnd
                                    });
                                    currentSegmentStart = segmentStart;
                                    currentSegmentEnd = segmentEnd;
                                }
                            }
                        }
                    } else {
                        // Non-working day - finish current segment if exists
                        if (currentSegmentStart !== null) {
                            segments.push({
                                start: currentSegmentStart,
                                end: currentSegmentEnd
                            });
                            currentSegmentStart = null;
                            currentSegmentEnd = null;
                        }
                    }
                } else {
                    // Task doesn't overlap with this day - finish current segment if exists
                    if (currentSegmentStart !== null) {
                        segments.push({
                            start: currentSegmentStart,
                            end: currentSegmentEnd
                        });
                        currentSegmentStart = null;
                        currentSegmentEnd = null;
                    }
                }
            }
            
            // Finish the last segment if exists
            if (currentSegmentStart !== null) {
                segments.push({
                    start: currentSegmentStart,
                    end: currentSegmentEnd
                });
            }
        } else if (this.currentPeriod === 'year') {
            // For year view, we only display months, so we only need segments when task spans across months
            const startOfYear = new Date(this.viewStart.getFullYear(), 0, 1);
            const endOfYear = new Date(this.viewStart.getFullYear(), 11, 31);
            
            // Start from the beginning of the year or task start, whichever is later
            const startDate = new Date(Math.max(startOfYear.getTime(), taskStart.getTime()));
            // End at the end of the year or task end, whichever is earlier
            const endDate = new Date(Math.min(endOfYear.getTime(), taskEnd.getTime()));
            
            // Check if task spans across multiple months
            const taskStartMonth = taskStart.getMonth();
            const taskEndMonth = taskEnd.getMonth();
            const taskStartYear = taskStart.getFullYear();
            const taskEndYear = taskEnd.getFullYear();
            
            if (taskStartYear === taskEndYear && taskStartMonth === taskEndMonth) {
                // Task is within the same month - create one segment
                segments.push({
                    start: taskStart,
                    end: taskEnd
                });
            } else {
                // Task spans across multiple months - create segments for each month
                const currentMonth = new Date(Math.max(startDate.getTime(), taskStart.getTime()));
                currentMonth.setDate(1); // Start of month
                currentMonth.setHours(0, 0, 0, 0);
                
                while (currentMonth <= endDate) {
                    const monthStart = new Date(currentMonth);
                    const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59, 999);
                    
                    // Find intersection with task duration
                    const segmentStart = new Date(Math.max(taskStart.getTime(), monthStart.getTime()));
                    const segmentEnd = new Date(Math.min(taskEnd.getTime(), monthEnd.getTime()));
                    
                    // Only add segment if there's an actual intersection
                    if (segmentStart < segmentEnd) {
                        segments.push({
                            start: segmentStart,
                            end: segmentEnd
                        });
                    }
                    
                    // Move to next month
                    currentMonth.setMonth(currentMonth.getMonth() + 1);
                }
            }
        } else {
            // Fallback for any other period types
            const currentDate = new Date(taskStart);
            
            // Iterate through each day from task start to end
            while (currentDate <= taskEnd) {
                const dayStart = new Date(currentDate);
                dayStart.setHours(0, 0, 0, 0);
                
                const dayEnd = new Date(currentDate);
                dayEnd.setHours(23, 59, 59, 999);
                
                // Get working hours for this day
                const workingHours = this.getWorkingHoursForDate(currentDate);
                
                if (workingHours.length > 0) {
                    // For each working hour window on this day
                    workingHours.forEach(window => {
                        const windowStart = new Date(currentDate);
                        const windowEnd = new Date(currentDate);
                        
                        // Parse time strings (e.g., "07:30" -> 7:30 AM)
                        const [startHour, startMinute] = window.start.split(':').map(Number);
                        const [endHour, endMinute] = window.end.split(':').map(Number);
                        
                        windowStart.setHours(startHour, startMinute, 0, 0);
                        windowEnd.setHours(endHour, endMinute, 0, 0);
                        
                        // Find intersection with task duration
                        const segmentStart = new Date(Math.max(taskStart.getTime(), windowStart.getTime()));
                        const segmentEnd = new Date(Math.min(taskEnd.getTime(), windowEnd.getTime()));
                        
                        // Only add segment if there's an actual intersection
                        if (segmentStart < segmentEnd) {
                            segments.push({
                                start: segmentStart,
                                end: segmentEnd
                            });
                        }
                    });
                }
                
                // Move to next day
                currentDate.setDate(currentDate.getDate() + 1);
                currentDate.setHours(0, 0, 0, 0);
            }
        }
        
        return segments;
    }
    
    getWorkingHoursForDate(date) {
        if (!this.machineCalendar || !this.machineCalendar.week_template) {
            return [];
        }
        
        const jsDayOfWeek = date.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
        // Convert JavaScript day to calendar format: 0=Monday, 1=Tuesday, ..., 6=Sunday
        const calendarDayOfWeek = jsDayOfWeek === 0 ? 6 : jsDayOfWeek - 1;
        const workingDay = this.machineCalendar.week_template[calendarDayOfWeek.toString()];
        
        return workingDay || [];
    }
    
    calculateSegmentPosition(segmentStart) {
        switch (this.currentPeriod) {
            case 'day':
                const startOffsetHours = (segmentStart - this.viewStart) / (1000 * 60 * 60);
                const hourWidth = this.calculateCellWidth();
                return Math.max(0, startOffsetHours * hourWidth);
                
            case 'week':
                const startOffsetDays = (segmentStart - this.viewStart) / (1000 * 60 * 60 * 24);
                const weekDayWidth = this.calculateCellWidth();
                return Math.max(0, startOffsetDays * weekDayWidth);
                
            case 'month':
                const monthStartOffsetDays = (segmentStart - this.viewStart) / (1000 * 60 * 60 * 24);
                const monthDayWidth = this.calculateCellWidth();
                return Math.max(0, monthStartOffsetDays * monthDayWidth);
                
            case 'year':
                const startMonth = segmentStart.getMonth();
                const yearMonthWidth = this.calculateCellWidth();
                return Math.max(0, startMonth * yearMonthWidth);
                
            default:
                return 0;
        }
    }
    
    calculateSegmentWidth(segmentStart, segmentEnd) {
        const duration = segmentEnd - segmentStart;
        
        switch (this.currentPeriod) {
            case 'day':
                const durationHours = duration / (1000 * 60 * 60);
                const hourWidth = this.calculateCellWidth();
                return Math.max(20, durationHours * hourWidth);
                
            case 'week':
                const durationDays = duration / (1000 * 60 * 60 * 24);
                const weekDayWidth = this.calculateCellWidth();
                return Math.max(20, durationDays * weekDayWidth);
                
            case 'month':
                const monthDurationDays = duration / (1000 * 60 * 60 * 24);
                const monthDayWidth = this.calculateCellWidth();
                return Math.max(20, monthDurationDays * monthDayWidth);
                
            case 'year':
                const startMonth = segmentStart.getMonth();
                const endMonth = segmentEnd.getMonth();
                const yearMonthWidth = this.calculateCellWidth();
                return Math.max(20, (endMonth - startMonth + 1) * yearMonthWidth);
                
            default:
                return 100;
        }
    }

    addCurrentTimeIndicator() {
        const now = new Date();
        
        // Only show for day and week views
        if (this.currentPeriod !== 'day' && this.currentPeriod !== 'week') return;
        
        // Check if current time is within view range
        if (now < this.viewStart || now > this.viewEnd) return;
        
        const scrollingColumn = this.container.querySelector('.gantt-scrolling-column');
        if (!scrollingColumn) return;
        
        let left;
        
        switch (this.currentPeriod) {
            case 'day':
                const hoursFromStart = (now - this.viewStart) / (1000 * 60 * 60);
                const hourWidth = this.calculateCellWidth();
                left = hoursFromStart * hourWidth;
                break;
                
            case 'week':
                const daysFromStart = (now - this.viewStart) / (1000 * 60 * 60 * 24);
                const weekDayWidth = this.calculateCellWidth();
                left = daysFromStart * weekDayWidth;
                break;
        }
        
        const timeLabel = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        
        const indicator = document.createElement('div');
        indicator.className = 'gantt-current-time';
        indicator.style.left = `${left}px`;
        indicator.innerHTML = `<div class="gantt-current-time-label">${timeLabel}</div>`;
        
        scrollingColumn.appendChild(indicator);
    }

    bindTaskEvents() {
        const taskBars = this.container.querySelectorAll('.gantt-task-bar');
        
        taskBars.forEach(bar => {
            bar.addEventListener('click', (e) => {
                const taskId = e.currentTarget.dataset.taskId;
                const timerId = e.currentTarget.dataset.timerId;
                
                // First try to find the task by ID
                let task = this.tasks.find(t => t.id == taskId);
                
                // If not found and we have a timer_id, look for a segment within tasks
                if (!task && timerId) {
                    for (const t of this.tasks) {
                        if (t.segments && Array.isArray(t.segments)) {
                            const segment = t.segments.find(s => s.timer_id == timerId);
                            if (segment) {
                                task = segment; // Pass the segment as the task
                                break;
                            }
                        }
                    }
                }
                
                if (this.options.onTaskClick) {
                    this.options.onTaskClick(task, e);
                }
            });
        });
    }

    // Public API methods
    updateTitle(title) {
        this.options.title = title;
        const titleElement = this.container.querySelector('.gantt-title-text');
        if (titleElement) {
            titleElement.textContent = title;
        }
    }

    getCurrentPeriod() {
        return this.currentPeriod;
    }

    getCurrentDate() {
        return new Date(this.currentDate);
    }

    getTasks() {
        return [...this.tasks];
    }

    getAvailableViews() {
        return [...this.options.availableViews];
    }

    // Progress color customization methods
    setProgressColors(colors) {
        this.options.progressColors = { ...this.options.progressColors, ...colors };
        this.options.useCustomProgressColors = true;
        this.renderChart(); // Re-render to apply new colors
    }

    setProgressColor(status, color) {
        if (!this.options.progressColors) {
            this.options.progressColors = {};
        }
        this.options.progressColors[status] = color;
        this.options.useCustomProgressColors = true;
        this.renderChart(); // Re-render to apply new color
    }

    resetProgressColors() {
        this.options.useCustomProgressColors = false;
        this.renderChart(); // Re-render to use default colors
    }

    getProgressColors() {
        return { ...this.options.progressColors };
    }

    generateWorkingHoursBackground() {
        if (!this.machineCalendar) {
            return '';
        }

        // For year view, we don't show working hours background since we only display months
        if (this.currentPeriod === 'year') {
            return '';
        }

        const workingHoursHTML = [];
        const cellWidth = this.calculateCellWidth();
        const headerHeight = this.calculateCellHeight(); // Height of the timeline header
        const taskRowHeight = 60; // Height of each task row
        const totalDays = Math.ceil((this.viewEnd - this.viewStart) / (1000 * 60 * 60 * 24));
        
        // Calculate total height to match the timeline content area
        // Header height + all task rows (tasks.length * taskRowHeight)
        const totalTasks = this.tasks.length;
        const totalHeight = headerHeight + (totalTasks * taskRowHeight);
        
        // Generate working hours background for each day in the view
        for (let dayOffset = 0; dayOffset < totalDays; dayOffset++) {
            const currentDate = new Date(this.viewStart);
            currentDate.setDate(currentDate.getDate() + dayOffset);
            
            const jsDayOfWeek = currentDate.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
            const calendarDayOfWeek = jsDayOfWeek === 0 ? 6 : jsDayOfWeek - 1; // Convert to 0=Monday, 1=Tuesday, ..., 6=Sunday
            const workingDay = this.machineCalendar.week_template[calendarDayOfWeek.toString()];
            
            if (workingDay && workingDay.length > 0) {
                // Day has working hours
                if (this.currentPeriod === 'day') {
                    // For day view, show working time blocks and non-working time blocks
                    const allWorkingMinutes = [];
                    
                    // Collect all working minutes
                    workingDay.forEach(window => {
                        const startTime = this.parseTimeToMinutes(window.start);
                        const endTime = this.parseTimeToMinutes(window.end);
                        
                        const startTimeInHours = startTime / 60;
                        const endTimeInHours = endTime / 60;
                        
                        const left = startTimeInHours * cellWidth;
                        const width = (endTimeInHours - startTimeInHours) * cellWidth;
                        
                        workingHoursHTML.push(`
                            <div class="gantt-working-hour-block" 
                                 style="left: ${left}px; width: ${width}px; height: ${totalHeight}px;"
                                 title="Working hours: ${window.start}-${window.end}">
                            </div>
                        `);
                        
                        allWorkingMinutes.push({ start: startTime, end: endTime });
                    });
                    
                    // Add non-working hour blocks (gaps between working hours and before/after)
                    const dayStartMinutes = 0; // 00:00
                    const dayEndMinutes = 24 * 60; // 24:00
                    
                    // Sort working periods by start time
                    allWorkingMinutes.sort((a, b) => a.start - b.start);
                    
                    // Add non-working block before first working period
                    if (allWorkingMinutes.length > 0 && allWorkingMinutes[0].start > dayStartMinutes) {
                        const left = dayStartMinutes / 60 * cellWidth;
                        const width = (allWorkingMinutes[0].start - dayStartMinutes) / 60 * cellWidth;
                        
                        workingHoursHTML.push(`
                            <div class="gantt-non-working-hour-block" 
                                 style="left: ${left}px; width: ${width}px; height: ${totalHeight}px;"
                                 title="Non-working hours: 00:00-${this.formatMinutesToTime(allWorkingMinutes[0].start)}">
                            </div>
                        `);
                    }
                    
                    // Add non-working blocks between working periods
                    for (let i = 0; i < allWorkingMinutes.length - 1; i++) {
                        const currentEnd = allWorkingMinutes[i].end;
                        const nextStart = allWorkingMinutes[i + 1].start;
                        
                        if (nextStart > currentEnd) {
                            const left = currentEnd / 60 * cellWidth;
                            const width = (nextStart - currentEnd) / 60 * cellWidth;
                            
                            workingHoursHTML.push(`
                                <div class="gantt-non-working-hour-block" 
                                     style="left: ${left}px; width: ${width}px; height: ${totalHeight}px;"
                                     title="Non-working hours: ${this.formatMinutesToTime(currentEnd)}-${this.formatMinutesToTime(nextStart)}">
                                </div>
                            `);
                        }
                    }
                    
                    // Add non-working block after last working period
                    if (allWorkingMinutes.length > 0) {
                        const lastEnd = allWorkingMinutes[allWorkingMinutes.length - 1].end;
                        if (lastEnd < dayEndMinutes) {
                            const left = lastEnd / 60 * cellWidth;
                            const width = (dayEndMinutes - lastEnd) / 60 * cellWidth;
                            
                            workingHoursHTML.push(`
                                <div class="gantt-non-working-hour-block" 
                                     style="left: ${left}px; width: ${width}px; height: ${totalHeight}px;"
                                     title="Non-working hours: ${this.formatMinutesToTime(lastEnd)}-24:00">
                                </div>
                            `);
                        }
                    }
                } else {
                    // For week/month view, show full day working blocks
                    workingDay.forEach(window => {
                        const left = dayOffset * cellWidth;
                        const width = cellWidth;
                        
                        workingHoursHTML.push(`
                            <div class="gantt-working-day-block" 
                                 style="left: ${left}px; width: ${width}px; height: ${totalHeight}px;"
                                 title="Working day: ${workingDay.map(w => w.start + '-' + w.end).join(', ')}">
                            </div>
                        `);
                    });
                }
            } else {
                // Day has no working hours - add non-working day block
                if (this.currentPeriod === 'day') {
                    // For day view, show full day as non-working
                    const left = 0;
                    const width = 24 * cellWidth; // Full day width
                    
                    workingHoursHTML.push(`
                        <div class="gantt-non-working-day-block" 
                             style="left: ${left}px; width: ${width}px; height: ${totalHeight}px;"
                             title="Non-working day">
                        </div>
                    `);
                } else {
                    // For week/month view, show full day as non-working
                    const left = dayOffset * cellWidth;
                    const width = cellWidth;
                    
                    workingHoursHTML.push(`
                        <div class="gantt-non-working-day-block" 
                             style="left: ${left}px; width: ${width}px; height: ${totalHeight}px;"
                             title="Non-working day">
                        </div>
                    `);
                }
            }
        }
        
        return workingHoursHTML.join('');
    }

    parseTimeToMinutes(timeString) {
        const [hours, minutes] = timeString.split(':').map(Number);
        return hours * 60 + minutes;
    }
    
    formatMinutesToTime(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    }


    destroy() {
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}

// Export for use in other modules
export { GanttChart };

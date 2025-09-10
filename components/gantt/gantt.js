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
            showDateOverlay: true,
            showCurrentTime: true,
            onPeriodChange: null,
            onTaskClick: null,
            onTaskDrag: null,
            ...options
        };

        // State
        this.currentPeriod = this.options.defaultPeriod;
        this.currentDate = new Date();
        this.tasks = [];
        this.viewStart = new Date();
        this.viewEnd = new Date();

        // Initialize
        this.init();
    }

    init() {
        this.render();
        this.bindEvents();
        this.updateCurrentPeriodIndicator();
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
                                <button type="button" class="btn btn-outline-primary" data-period="day">
                                    <i class="fas fa-calendar-day me-1"></i>Gün
                                </button>
                                <button type="button" class="btn btn-outline-primary" data-period="week">
                                    <i class="fas fa-calendar-week me-1"></i>Hafta
                                </button>
                                <button type="button" class="btn btn-outline-primary active" data-period="month">
                                    <i class="fas fa-calendar-alt me-1"></i>Ay
                                </button>
                                <button type="button" class="btn btn-outline-primary" data-period="year">
                                    <i class="fas fa-calendar me-1"></i>Yıl
                                </button>
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
        this.currentPeriod = period;
        this.setActivePeriodButton(period);
        this.updateCurrentPeriodIndicator();
        this.renderChart();
        
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
        this.renderChart();
        
        if (this.options.onPeriodChange) {
            this.options.onPeriodChange(this.currentPeriod, this.currentDate);
        }
    }

    goToToday() {
        this.currentDate = new Date();
        this.updateCurrentPeriodIndicator();
        this.renderChart();
        
        if (this.options.onPeriodChange) {
            this.options.onPeriodChange(this.currentPeriod, this.currentDate);
        }
    }

    updateCurrentPeriodIndicator() {
        const periodElement = this.container.querySelector('#gantt-current-period');
        console.log('Looking for period element:', periodElement);
        if (!periodElement) {
            console.log('Period element not found in container:', this.container);
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
            console.log('Period indicator updated to:', periodLabel);
        } else {
            console.log('Period label span not found');
        }
    }

    setTasks(tasks) {
        this.tasks = tasks || [];
        this.renderChart();
    }

    renderChart() {
        const chartContainer = this.container.querySelector('#gantt-chart');
        const dateOverlay = this.container.querySelector('#gantt-date-overlay');
        
        console.log('GanttChart.renderChart() called');
        console.log('Tasks:', this.tasks);
        console.log('Current period:', this.currentPeriod);
        console.log('Current date:', this.currentDate);
        
        if (!chartContainer) {
            console.error('Chart container not found');
            return;
        }

        // The date overlay will be created in the HTML below

        // Always calculate view range and create timeline structure
        this.calculateViewRange();
        console.log('View range:', this.viewStart, 'to', this.viewEnd);

        // Handle tasks (if any)
        let sortedTasks = [];
        let visibleTasks = [];
        
        if (this.tasks.length > 0) {
            // Sort tasks by plan_order
            sortedTasks = [...this.tasks].sort((a, b) => (a.plan_order || 0) - (b.plan_order || 0));
            console.log('Sorted tasks:', sortedTasks);
            
            // Filter tasks that are visible in current view
            visibleTasks = sortedTasks.filter(task => {
                if (!task.planned_start_ms || !task.planned_end_ms) {
                    console.log('Task missing time data:', task);
                    return false;
                }
                
                const taskStart = new Date(task.planned_start_ms);
                const taskEnd = new Date(task.planned_end_ms);
                
                const isVisible = taskStart <= this.viewEnd && taskEnd >= this.viewStart;
                console.log(`Task ${task.title}: ${taskStart} to ${taskEnd}, visible: ${isVisible}`);
                
                return isVisible;
            });

            console.log('Visible tasks:', visibleTasks);
        } else {
            console.log('No tasks available');
        }

        // Generate timeline header
        const timelineHeader = this.generateTimelineHeader();
        
        // Generate task labels and task bars separately
        let taskLabels = '';
        let taskBars = '';
        
        if (visibleTasks.length > 0) {
            taskLabels = visibleTasks.map(task => {
                const taskTitle = task.title || task.name || `Görev ${task.id}`;
                return `<div class="gantt-task-label">${taskTitle}</div>`;
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
                        <div class="gantt-timeline-header">
                            ${timelineHeader}
                        </div>
                        ${taskBars}
                    </div>
                </div>
            </div>
        `;
        
        // Apply grid background to timeline content
        const timelineContent = chartContainer.querySelector('.gantt-timeline-content');
        if (timelineContent) {
            const cellWidth = this.calculateCellWidth();
            const cellHeight = 60; // Height of each task row
            
            // Calculate the exact width needed for the current view
            let totalWidth;
            switch (this.currentPeriod) {
                case 'day':
                    totalWidth = 25 * cellWidth; // 25 hours
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
        }
        
        // Debug: Log the generated HTML structure
        console.log('Generated HTML structure:', chartContainer.innerHTML);
        console.log('Timeline header length:', timelineHeader.length);
        console.log('Task bars count:', visibleTasks.length);

        // Update the period indicator in the header
        this.updateCurrentPeriodIndicator();

        // Add current time indicator
        if (this.options.showCurrentTime) {
            this.addCurrentTimeIndicator();
        }

        // Bind task events
        this.bindTaskEvents();
        
        console.log('Chart rendered successfully');
    }

    // Centralized width calculation method
    calculateCellWidth() {
        const containerWidth = this.container.querySelector('.gantt-scrolling-column')?.offsetWidth || 800;
        
        switch (this.currentPeriod) {
            case 'day':
                const totalHours = 25; // Show only current day hours
                return Math.max(20, containerWidth / totalHours);
                
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


    calculateViewRange() {
        const date = new Date(this.currentDate);
        
        switch (this.currentPeriod) {
            case 'day':
                // Show only current day (00:00 to 23:59)
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
        
        console.log(`Extended view range for ${this.currentPeriod}:`, this.viewStart, 'to', this.viewEnd);
    }

    generateTimelineHeader() {
        let headerCells = '';
        
        switch (this.currentPeriod) {
            case 'day':
                // Hourly view for current day (25 hours) - fit in visible area
                const totalHours = 25; // Show only current day hours
                const hourWidth = this.calculateCellWidth();
                
                for (let i = 0; i < totalHours; i++) {
                    const currentHour = new Date(this.currentDate);
                    currentHour.setHours(i, 0, 0, 0);
                    const hour = currentHour.getHours();
                    const day = currentHour.getDate();
                    const month = currentHour.getMonth() + 1;
                    
                    const label = `${hour.toString().padStart(2, '0')}`;
                    const sublabel = i === 0 ? `${day}/${month}` : (hour < 12 ? 'ÖÖ' : 'ÖS');
                    
                    headerCells += `
                        <div class="gantt-header-cell" style="min-width: ${hourWidth}px;">
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
                const totalDaysInMonth = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 0).getDate();
                const monthDayWidth = this.calculateCellWidth();
                console.log('totalDaysInMonth', totalDaysInMonth);
                for (let i = 0; i < totalDaysInMonth; i++) {
                    const currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), i + 1);
                    
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
                    const currentMonth = new Date(this.currentDate.getFullYear(), i, 1);
                    
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

    generateTaskBar(task) {
        const taskStart = new Date(task.planned_start_ms);
        const taskEnd = new Date(task.planned_end_ms);
        const duration = taskEnd - taskStart;
        
        // Calculate position and width based on current period
        let left, width;
        
        switch (this.currentPeriod) {
            case 'day':
                // Position based on hours in current day (25 hours)
                const startOffsetHours = (taskStart - this.viewStart) / (1000 * 60 * 60);
                const durationHours = duration / (1000 * 60 * 60);
                const hourWidth = this.calculateCellWidth();
                
                left = Math.max(0, startOffsetHours * hourWidth);
                width = Math.max(20, durationHours * hourWidth);
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
        
        const isLocked = task.plan_locked || false;
        const taskClass = isLocked ? 'locked' : 'unlocked';
        const taskTitle = task.title || task.name || `Görev ${task.id}`;
        
        return `
            <div class="gantt-task-bar-container">
                <div class="gantt-task-bar ${taskClass}" 
                     style="left: ${left}px; width: ${width}px;"
                     data-task-id="${task.id}"
                     title="${taskTitle}">
                    <div class="gantt-task-content">${taskTitle}</div>
                </div>
            </div>
        `;
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
                const task = this.tasks.find(t => t.id == taskId);
                
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

    destroy() {
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}

// Export for use in other modules
export { GanttChart };

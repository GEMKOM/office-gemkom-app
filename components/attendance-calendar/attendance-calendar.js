/**
 * AttendanceCalendar
 * Reusable monthly attendance calendar component.
 */
export class AttendanceCalendar {
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        if (!this.container) {
            throw new Error(`AttendanceCalendar: Container '${containerId}' not found`);
        }

        const now = new Date();
        this.options = {
            locale: 'tr-TR',
            showUserFilter: true,
            showToolbar: true,
            userIdPlaceholder: 'Kullanıcı ID',
            initialYear: now.getFullYear(),
            initialMonth: now.getMonth() + 1,
            initialUserId: null,
            fetchMonthlySummary: null,
            vacationRequestBaseUrl: '/general/vacation/requests',
            onMonthChange: null,
            ...options
        };

        this.state = {
            year: this.options.initialYear,
            month: this.options.initialMonth,
            userId: this.options.initialUserId,
            data: null,
            loading: false,
            error: null
        };

        this.weekdayLabels = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
        this.monthNames = [
            'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
            'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
        ];

        this.renderShell();
        this.bindEvents();
    }

    renderShell() {
        this.container.innerHTML = `
            <div class="attendance-calendar">
                ${this.options.showToolbar ? this.toolbarTemplate() : ''}
                <div class="ac-panel" id="ac-summary-panel"></div>
                <div class="ac-panel">
                    <div id="ac-calendar-content" class="ac-state"></div>
                </div>
            </div>
        `;
        this.syncToolbarControls();
    }

    toolbarTemplate() {
        return `
            <div class="ac-panel">
                <div class="ac-toolbar">
                    <div class="ac-nav">
                        <button class="btn btn-sm btn-outline-secondary" data-action="prev-month" title="Önceki Ay">
                            <i class="fas fa-chevron-left"></i>
                        </button>
                        <h5 class="ac-month-title" id="ac-month-title"></h5>
                        <button class="btn btn-sm btn-outline-secondary" data-action="next-month" title="Sonraki Ay">
                            <i class="fas fa-chevron-right"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-primary" data-action="current-month">Bugün</button>
                    </div>
                    <div class="ac-controls">
                        <input type="month" id="ac-month-picker" class="form-control form-control-sm">
                        ${this.options.showUserFilter ? `
                            <input type="number" id="ac-user-id" min="1" step="1" class="form-control form-control-sm" placeholder="${this.escapeHtml(this.options.userIdPlaceholder)}">
                        ` : ''}
                        <button class="btn btn-sm btn-primary" data-action="apply">
                            <i class="fas fa-filter me-1"></i>Uygula
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    bindEvents() {
        this.container.addEventListener('click', (event) => {
            const trigger = event.target.closest('[data-action]');
            if (!trigger) return;

            const action = trigger.getAttribute('data-action');
            if (action === 'prev-month') this.navigateMonth(-1);
            if (action === 'next-month') this.navigateMonth(1);
            if (action === 'current-month') this.goToCurrentMonth();
            if (action === 'apply') this.applyFilters();
        });

        this.container.addEventListener('change', (event) => {
            if (event.target.id !== 'ac-month-picker') return;
            const [yearText, monthText] = String(event.target.value || '').split('-');
            const year = this.safeInt(yearText);
            const month = this.safeInt(monthText);
            if (!year || !month) return;
            this.state.year = year;
            this.state.month = month;
            this.syncToolbarControls();
            this.refresh();
        });
    }

    setData(summaryData) {
        this.state.data = summaryData || null;
        this.state.error = null;
        this.renderSummary();
        this.renderCalendar();
    }

    setLoading(loading) {
        this.state.loading = Boolean(loading);
        if (this.state.loading) {
            const calendar = this.container.querySelector('#ac-calendar-content');
            if (calendar) {
                calendar.className = 'ac-state';
                calendar.innerHTML = `
                    <div>
                        <div class="spinner-border text-primary mb-2" role="status"></div>
                        <div>Takvim yükleniyor...</div>
                    </div>
                `;
            }
        }
        this.setApplyDisabled(this.state.loading);
    }

    setError(message) {
        this.state.error = message || 'Bilinmeyen hata';
        const summaryPanel = this.container.querySelector('#ac-summary-panel');
        if (summaryPanel) summaryPanel.innerHTML = '';
        const calendar = this.container.querySelector('#ac-calendar-content');
        if (calendar) {
            calendar.className = 'ac-state';
            calendar.innerHTML = `
                <div>
                    <i class="fas fa-triangle-exclamation text-danger fs-4 mb-2"></i>
                    <div>${this.escapeHtml(this.state.error)}</div>
                </div>
            `;
        }
    }

    setMonth(year, month) {
        if (!year || !month || month < 1 || month > 12) return;
        this.state.year = year;
        this.state.month = month;
        this.syncToolbarControls();
    }

    setUserId(userId) {
        this.state.userId = userId ? Number(userId) : null;
        const userInput = this.container.querySelector('#ac-user-id');
        if (userInput) userInput.value = this.state.userId || '';
    }

    async refresh() {
        if (typeof this.options.onMonthChange === 'function') {
            this.options.onMonthChange({
                year: this.state.year,
                month: this.state.month,
                userId: this.state.userId
            });
        }

        if (typeof this.options.fetchMonthlySummary !== 'function') {
            this.renderSummary();
            this.renderCalendar();
            return;
        }

        try {
            this.setLoading(true);
            const response = await this.options.fetchMonthlySummary({
                year: this.state.year,
                month: this.state.month,
                user_id: this.state.userId ?? undefined
            });
            this.setData(response);
        } catch (error) {
            this.setError(error?.message || String(error));
        } finally {
            this.setLoading(false);
        }
    }

    navigateMonth(step) {
        const date = new Date(this.state.year, this.state.month - 1, 1);
        date.setMonth(date.getMonth() + step);
        this.state.year = date.getFullYear();
        this.state.month = date.getMonth() + 1;
        this.syncToolbarControls();
        this.refresh();
    }

    goToCurrentMonth() {
        const now = new Date();
        this.state.year = now.getFullYear();
        this.state.month = now.getMonth() + 1;
        this.syncToolbarControls();
        this.refresh();
    }

    applyFilters() {
        const userInput = this.container.querySelector('#ac-user-id');
        if (userInput) this.state.userId = this.safeInt(userInput.value);
        this.refresh();
    }

    syncToolbarControls() {
        const monthTitle = this.container.querySelector('#ac-month-title');
        if (monthTitle) monthTitle.textContent = `${this.monthNames[this.state.month - 1]} ${this.state.year}`;

        const picker = this.container.querySelector('#ac-month-picker');
        if (picker) picker.value = `${this.state.year}-${String(this.state.month).padStart(2, '0')}`;

        const userInput = this.container.querySelector('#ac-user-id');
        if (userInput) userInput.value = this.state.userId || '';
    }

    renderSummary() {
        const summaryPanel = this.container.querySelector('#ac-summary-panel');
        if (!summaryPanel) return;

        const data = this.state.data;
        if (!data) {
            summaryPanel.innerHTML = '';
            return;
        }

        const summary = data.summary || {};

        summaryPanel.innerHTML = `
            <div class="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
                <div>
                    <h6 class="mb-1">${this.escapeHtml(data.user_display || `Kullanıcı #${data.user_id || '-'}`)}</h6>
                </div>
            </div>
            <div class="ac-summary-grid mb-3">
                ${this.summaryCard('Çalışma Günü', summary.total_working_days)}
                ${this.summaryCard('Gelen Gün', summary.total_present)}
                ${this.summaryCard('Devamsızlık', summary.total_absent)}
                ${this.summaryCard('Fazla Mesai', `${summary.total_overtime_minutes || 0} dk`)}
                ${this.summaryCard('Geç Kalma', `${summary.total_late_minutes || 0} dk`)}
                ${this.summaryCard('Erken Çıkış', `${summary.total_early_leave_minutes || 0} dk`)}
            </div>
        `;
    }

    summaryCard(label, value) {
        return `
            <div class="ac-summary-card">
                <div class="ac-summary-label">${this.escapeHtml(label)}</div>
                <div class="ac-summary-value">${this.escapeHtml(value ?? 0)}</div>
            </div>
        `;
    }

    renderCalendar() {
        const calendar = this.container.querySelector('#ac-calendar-content');
        if (!calendar) return;

        const data = this.state.data;
        if (!data) {
            calendar.className = 'ac-state';
            calendar.innerHTML = '<div>Gösterilecek veri yok.</div>';
            return;
        }

        const days = Array.isArray(data.days) ? data.days : [];
        const map = new Map();
        for (const day of days) {
            if (day?.date) map.set(day.date, day);
        }

        const first = new Date(this.state.year, this.state.month - 1, 1);
        const daysInMonth = new Date(this.state.year, this.state.month, 0).getDate();
        const offset = (first.getDay() + 6) % 7;

        let html = '<div class="ac-calendar-grid">';
        for (const weekday of this.weekdayLabels) {
            html += `<div class="ac-weekday">${this.escapeHtml(weekday)}</div>`;
        }
        for (let i = 0; i < offset; i += 1) {
            html += '<div class="ac-day ac-day-empty"></div>';
        }

        for (let d = 1; d <= daysInMonth; d += 1) {
            const date = `${this.state.year}-${String(this.state.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dayData = map.get(date) || {
                date,
                day_type: 'working',
                holiday_name: null,
                record: null,
                flag: null
            };
            html += this.dayCard(dayData);
        }
        html += '</div>';

        calendar.className = '';
        calendar.innerHTML = html;
    }

    dayCard(day) {
        const dayType = day.day_type || 'working';
        const isHalfDayHoliday = Boolean(day?.is_half_day_holiday);
        const typeLabel = this.dayTypeLabel(dayType);
        const flagLabel = this.flagLabel(day.flag);
        const dayNumber = String(day.date || '').split('-')[2] || '-';
        const weekday = this.weekdayFromDate(day.date);
        const holidayTooltip = isHalfDayHoliday && day?.holiday_name
            ? ` title="${this.escapeHtml(day.holiday_name)}"`
            : '';

        const chips = [`<span class="ac-chip ac-chip-${this.escapeHtml(dayType)}">${this.escapeHtml(typeLabel)}</span>`];
        if (isHalfDayHoliday) {
            chips.push('<span class="ac-chip ac-chip-half-day-holiday">Yarım Gün Tatil</span>');
        }
        if (flagLabel) {
            chips.push(`<span class="ac-chip ac-chip-flag-${this.escapeHtml(day.flag)}">${this.escapeHtml(flagLabel)}</span>`);
        }

        return `
            <div class="ac-day ac-day-${this.escapeHtml(dayType)}${isHalfDayHoliday ? ' ac-day-half-day-holiday' : ''}"${holidayTooltip}>
                <div class="ac-day-head">
                    <span class="ac-day-number">${this.escapeHtml(dayNumber)}</span>
                    <span class="ac-day-weekday">${this.escapeHtml(weekday)}</span>
                </div>
                <div class="ac-chip-row">${chips.join('')}</div>
                <div class="ac-day-content">${this.dayContent(day)}</div>
            </div>
        `;
    }

    dayContent(day) {
        const out = [];
        const record = day.record;
        const isHalfDayHoliday = Boolean(day?.is_half_day_holiday);

        if (day.holiday_name) {
            const holidayText = isHalfDayHoliday
                ? `${day.holiday_name} (Yarım Gün Tatil)`
                : day.holiday_name;
            out.push(`<div class="ac-holiday"><i class="fas fa-star me-1"></i>${this.escapeHtml(holidayText)}</div>`);
        } else if (isHalfDayHoliday) {
            out.push('<div class="ac-holiday"><i class="fas fa-star-half-stroke me-1"></i>Yarım Gün Tatil</div>');
        }

        if (day.day_type === 'leave') {
            const leaveType = this.leaveTypeLabel(record?.leave_type);
            out.push(`<div class="ac-strong"><i class="fas fa-umbrella-beach me-1"></i>${this.escapeHtml(leaveType)}</div>`);

            if (record?.notes) {
                const requestId = this.vacationRequestId(record.notes);
                if (requestId) {
                    const href = `${this.options.vacationRequestBaseUrl}?request_id=${encodeURIComponent(requestId)}`;
                    out.push(`<div><a class="link-primary" href="${this.escapeHtml(href)}">İzin Talebi #${this.escapeHtml(requestId)}</a></div>`);
                } else {
                    out.push(`<div class="text-muted">${this.escapeHtml(record.notes)}</div>`);
                }
            }
            return out.join('');
        }

        if (record) {
            if (record.status) out.push(`<div class="ac-strong">${this.escapeHtml(this.recordStatusLabel(record.status))}</div>`);
            if (record.first_check_in || record.last_check_out) {
                out.push(`
                    <div>
                        <i class="fas fa-right-to-bracket me-1 text-success"></i>${this.escapeHtml(this.formatTime(record.first_check_in))}
                        <span class="mx-1">-</span>
                        <i class="fas fa-right-from-bracket me-1 text-danger"></i>${this.escapeHtml(this.formatTime(record.last_check_out))}
                    </div>
                `);
            }
            if ((record.total_present_minutes || 0) > 0) out.push(`<div class="text-primary">${this.escapeHtml(record.total_present_minutes)} dk ofiste</div>`);
            if ((record.overtime_minutes || 0) > 0) out.push(`<div class="text-success">+${this.escapeHtml(record.overtime_minutes)} dk mesai</div>`);
            if ((record.late_minutes || 0) > 0) out.push(`<div class="text-warning">${this.escapeHtml(record.late_minutes)} dk gecikme</div>`);
            if ((record.early_leave_minutes || 0) > 0) out.push(`<div class="text-danger">${this.escapeHtml(record.early_leave_minutes)} dk erken çıkış</div>`);
        } else if (day.flag === 'absent') {
            out.push('<div class="text-danger"><i class="fas fa-user-xmark me-1"></i>Kayıt yok (devamsız)</div>');
        } else if (day.day_type === 'working') {
            out.push('<div class="text-muted">Kayıt bulunmuyor</div>');
        }

        return out.join('') || '<div class="text-muted">-</div>';
    }

    dayTypeLabel(dayType) {
        const map = {
            working: 'Çalışma',
            weekend: 'Hafta Sonu',
            public_holiday: 'Resmi Tatil',
            leave: 'İzin'
        };
        return map[dayType] || dayType;
    }

    flagLabel(flag) {
        if (!flag) return null;
        const map = {
            absent: 'Devamsızlık',
            pending_approval: 'Giriş Onayı Bekliyor',
            pending_checkout_approval: 'Çıkış Onayı Bekliyor'
        };
        return map[flag] || flag;
    }

    leaveTypeLabel(type) {
        if (!type) return '-';
        const map = {
            annual_leave: 'Yıllık İzin',
            sick_leave: 'Hastalık İzni',
            unpaid_leave: 'Ücretsiz İzin',
            maternity_leave: 'Doğum İzni',
            paternity_leave: 'Babalık İzni',
            bereavement_leave: 'Mazeret Izni'
        };
        return map[type] || String(type).replaceAll('_', ' ');
    }

    recordStatusLabel(status) {
        const map = {
            complete: 'Tamamlandı',
            active: 'Aktif',
            leave: 'İzinli',
            pending_override: 'Giriş Onayı Bekliyor',
            pending_checkout_override: 'Çıkış Onayı Bekliyor',
            override_rejected: 'Reddedildi',
            rejected: 'Reddedildi'
        };
        return map[status] || status;
    }

    vacationRequestId(notes) {
        const match = String(notes || '').trim().match(/^vr:(\d+)$/i);
        return match ? match[1] : null;
    }

    weekdayFromDate(dateText) {
        const d = new Date(dateText);
        if (Number.isNaN(d.getTime())) return '-';
        return d.toLocaleDateString(this.options.locale, { weekday: 'short' });
    }

    formatTime(value) {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleTimeString(this.options.locale, { hour: '2-digit', minute: '2-digit' });
    }

    safeInt(value) {
        const n = Number.parseInt(String(value ?? '').trim(), 10);
        return Number.isFinite(n) ? n : null;
    }

    escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    setApplyDisabled(disabled) {
        const applyBtn = this.container.querySelector('[data-action="apply"]');
        if (applyBtn) applyBtn.disabled = disabled;
    }

    destroy() {
        this.container.innerHTML = '';
    }
}

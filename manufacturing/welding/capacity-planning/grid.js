// Planning grid — an Excel-style sheet whose rows ARE its Gantt rows.
//
// The left columns and the timeline live in the same <div class="pg-row">, so
// a row and its bar cannot drift apart: alignment is structural, not something
// two components have to agree on. One scroll container holds everything, with
// the header stuck to the top and the grid columns stuck to the left, which is
// what makes it read like a frozen-pane spreadsheet.
//
//   pg-scroll                     ← the only scroller (both axes)
//     pg-canvas                   ← gridWidth + timelineWidth
//       pg-header                 ← sticky top
//         pg-header-grid          ← sticky left, above everything
//         pg-header-time          ← two tiers: month/year over week/day
//       pg-row *                  ← fixed height, hence perfect alignment
//         pg-row-grid             ← sticky left, opaque
//         pg-row-time             ← the bar, positioned by date
//
// Bars are read-only here: dates are typed into the grid cells, and the
// timeline reflects them. That keeps one source of truth for the workday
// arithmetic and the parent/child clamps, which all live in the page.

const DAY_MS = 24 * 60 * 60 * 1000;

export const ZOOMS = {
    day: { label: 'Gün', colWidth: 30 },
    week: { label: 'Hafta', colWidth: 46 },
    month: { label: 'Ay', colWidth: 86 },
};

const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const MONTHS_TR_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
    'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    const [y, m, d] = String(value).split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
}

function toKey(date) {
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${m}-${d}`;
}

function addDays(date, n) {
    const out = new Date(date.getTime());
    out.setDate(out.getDate() + n);
    return out;
}

// Monday-start weeks: the shop's week, and what makes the week columns line up
// with the working-day arithmetic everywhere else on the page.
function startOfWeek(date) {
    const out = new Date(date.getTime());
    const shift = (out.getDay() + 6) % 7;
    out.setDate(out.getDate() - shift);
    out.setHours(0, 0, 0, 0);
    return out;
}

function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function daysInMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

// Keep the current value in a <select> even when it is not in the editable
// list (blocked/skipped on a department row). Otherwise the browser picks the
// first option and a blur looks like a real edit.
export function optionsWithCurrentValue(options, currentValue) {
    const opts = Array.isArray(options) ? options.slice() : [];
    if (currentValue != null && String(currentValue) !== ''
        && !opts.some(o => String(o.value) === String(currentValue))) {
        opts.unshift({ value: currentValue, label: String(currentValue) });
    }
    return opts;
}

// ---------------------------------------------------------------------------
// Timeline model
// ---------------------------------------------------------------------------

// Maps dates to pixels. Positions are FRACTIONAL: a bar that ends mid-week
// stops mid-column instead of snapping out to the week boundary, which is what
// keeps a 3-day job from looking like a 5-day one under the week zoom.
function buildTimeline(rows, zoom, today, barOf, minWidth = 0) {
    const unit = ZOOMS[zoom] ? zoom : 'week';
    const colWidth = ZOOMS[unit].colWidth;

    // The domain has to come from the same accessor that draws the bars —
    // reading a `bar` property off the row instead left only "today" in range
    // and squeezed a June-to-November plan into six weeks.
    const dates = [];
    rows.forEach(row => {
        const bar = barOf(row);
        if (!bar) return;
        const s = toDate(bar.start);
        const e = toDate(bar.end);
        if (s) dates.push(s);
        if (e) dates.push(e);
    });
    dates.push(today);

    let min = new Date(Math.min(...dates.map(d => d.getTime())));
    let max = new Date(Math.max(...dates.map(d => d.getTime())));
    // Breathing room on both sides so bars never touch the edge and "today"
    // stays visible on an all-past or all-future plan.
    min = addDays(min, -10);
    max = addDays(max, 21);

    let domainStart;
    if (unit === 'day') domainStart = new Date(min.getFullYear(), min.getMonth(), min.getDate());
    else if (unit === 'week') domainStart = startOfWeek(min);
    else domainStart = startOfMonth(min);

    // Enough columns to reach `max`, then enough more to fill the pane. A
    // month view of a plan that ends in November stopped at November and left
    // the rest of the page blank; the timeline should always span its width.
    const needed = minWidth > 0 ? Math.ceil(minWidth / colWidth) : 0;

    const columns = [];
    if (unit === 'month') {
        let cursor = startOfMonth(domainStart);
        while (cursor <= max || columns.length < needed) {
            columns.push({
                start: new Date(cursor.getTime()),
                top: String(cursor.getFullYear()),
                label: MONTHS_TR_SHORT[cursor.getMonth()],
                nonWorking: false,
            });
            cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
        }
    } else {
        const step = unit === 'day' ? 1 : 7;
        let cursor = new Date(domainStart.getTime());
        while (cursor <= max || columns.length < needed) {
            columns.push({
                start: new Date(cursor.getTime()),
                top: `${MONTHS_TR[cursor.getMonth()]} ${cursor.getFullYear()}`,
                label: unit === 'day' ? String(cursor.getDate()) : String(cursor.getDate()),
                nonWorking: false,
            });
            cursor = addDays(cursor, step);
        }
    }

    // Fractional position of a date, in columns.
    const posOf = (value) => {
        const date = toDate(value);
        if (!date) return null;
        if (unit === 'day') return (date - domainStart) / DAY_MS;
        if (unit === 'week') return (date - domainStart) / (7 * DAY_MS);
        const months = (date.getFullYear() - domainStart.getFullYear()) * 12
            + (date.getMonth() - domainStart.getMonth());
        return months + (date.getDate() - 1) / daysInMonth(date);
    };

    return {
        unit,
        colWidth,
        columns,
        width: columns.length * colWidth,
        domainStart,
        posOf,
        xOf: (value) => {
            const pos = posOf(value);
            return pos === null ? null : pos * colWidth;
        },
    };
}

// Weekend and holiday shading as ONE gradient rather than a div per column:
// with ~70 rows, a stripe element per column per row is thousands of nodes for
// something the browser can paint from a background image.
function nonWorkingBackground(timeline, isNonWorkingDay) {
    if (timeline.unit !== 'day' || typeof isNonWorkingDay !== 'function') return 'none';
    const stops = [];
    timeline.columns.forEach((col, idx) => {
        if (!isNonWorkingDay(toKey(col.start))) return;
        const from = idx * timeline.colWidth;
        stops.push(`transparent ${from}px`, `var(--pg-nonwork) ${from}px`,
            `var(--pg-nonwork) ${from + timeline.colWidth}px`,
            `transparent ${from + timeline.colWidth}px`);
    });
    if (!stops.length) return 'none';
    return `linear-gradient(90deg, ${stops.join(', ')})`;
}

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------

export class PlanningGrid {
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        this.options = {
            columns: [],
            rows: [],
            rowHeight: 30,
            gridWidth: 560,
            zoom: 'week',
            collapsed: new Set(),
            editableColumns: [],
            // Editability is per CELL, not per row: a job-order row takes its
            // dates but not its number, and only a custom stage can be renamed.
            isCellEditable: () => false,
            rowAttributes: () => ({}),
            actions: [],
            bar: () => null,
            isNonWorkingDay: null,
            today: new Date(),
            onEdit: null,
            onEditError: null,
            onToggleGroup: null,
            onToggleAll: null,
            allCollapsed: false,
            onZoomChange: null,
            onGridWidthChange: null,
            onAction: null,
            ...options,
        };
        this.editing = null;
        this._bindOnce();
    }

    get container() {
        return document.getElementById(this.containerId);
    }

    setRows(rows) {
        this.options.rows = rows;
        this.render();
    }

    setZoom(zoom) {
        this.options.zoom = ZOOMS[zoom] ? zoom : 'week';
        this.render();
    }

    setColumns(columns) {
        this.options.columns = columns;
        this.render();
    }

    setGridWidth(px) {
        this.options.gridWidth = Math.max(260, Math.min(1100, px));
        const el = this.container;
        if (el) el.style.setProperty('--pg-grid-w', `${this.options.gridWidth}px`);
    }

    // Rows hidden inside a collapsed group are dropped before render — the
    // canvas height and the today line both depend on the real row count.
    visibleRows() {
        const { rows, collapsed } = this.options;
        return rows.filter(r => !(r.groupKey && collapsed.has(r.groupKey)));
    }

    render() {
        const el = this.container;
        if (!el) return;

        const rows = this.visibleRows();
        const { rowHeight, gridWidth } = this.options;
        // The lane's own width decides how far the timeline has to run, so it
        // is measured before the columns are built.
        const lane = Math.max(0, el.clientWidth - gridWidth - 2);
        const timeline = buildTimeline(
            rows, this.options.zoom, this.options.today, this.options.bar, lane);
        this.timeline = timeline;

        el.style.setProperty('--pg-grid-w', `${gridWidth}px`);
        el.style.setProperty('--pg-row-h', `${rowHeight}px`);
        el.style.setProperty('--pg-col-w', `${timeline.colWidth}px`);
        el.style.setProperty('--pg-time-w', `${timeline.width}px`);
        el.style.setProperty('--pg-nonwork-bg',
            nonWorkingBackground(timeline, this.options.isNonWorkingDay));

        if (!rows.length) {
            el.innerHTML = `<div class="pg-empty">
                <i class="fas fa-inbox fa-2x mb-2 d-block"></i>
                Bu kaynağa atanmış iş yok. "İş Ekle" ile başlayın.
            </div>`;
            return;
        }

        // Every edit re-renders the whole grid, which destroys the scroller —
        // and with it the planner's place in a 60-row sheet. Restore both axes
        // so an edit leaves the view exactly where it was.
        const previous = el.querySelector('.pg-scroll');
        const keep = previous
            ? { top: previous.scrollTop, left: previous.scrollLeft }
            : null;

        const todayX = timeline.xOf(toKey(this.options.today));
        el.innerHTML = `
            <div class="pg-scroll">
                <div class="pg-canvas">
                    ${this._headerHtml(timeline)}
                    <div class="pg-rows">
                        ${todayX === null ? '' : `<div class="pg-today" style="left:calc(var(--pg-grid-w) + ${todayX}px)"></div>`}
                        ${rows.map(row => this._rowHtml(row, timeline)).join('')}
                    </div>
                </div>
            </div>`;

        if (keep) {
            const scroller = el.querySelector('.pg-scroll');
            if (scroller) {
                scroller.scrollTop = keep.top;
                scroller.scrollLeft = keep.left;
            }
        }
    }

    _headerHtml(timeline) {
        const cols = this.options.columns;
        const tiers = [];
        let run = null;
        timeline.columns.forEach(col => {
            if (run && run.label === col.top) run.span += 1;
            else {
                if (run) tiers.push(run);
                run = { label: col.top, span: 1 };
            }
        });
        if (run) tiers.push(run);

        return `
            <div class="pg-header">
                <div class="pg-header-grid">
                    ${cols.map((c, i) => `
                        <div class="pg-hcell ${c.headerClass || ''}" style="width:${c.width}">
                            ${i === 0 ? `
                                <i class="fas ${this.options.allCollapsed ? 'fa-angles-down' : 'fa-angles-up'} pg-toggle-all"
                                   title="${this.options.allCollapsed ? 'Tümünü aç' : 'Tümünü kapat'}"></i>` : ''}
                            ${esc(c.label)}
                        </div>`).join('')}
                    <div class="pg-hcell pg-hcell-actions">
                        <!-- The menu itself is NOT here: this cell clips its
                             contents (so columns cannot spill over the
                             timeline) and sits inside a stacking context, so a
                             menu rendered in place is both cut off and painted
                             under the rest of the page. It is portalled to
                             <body> on open instead. -->
                        <button class="pg-action-btn pg-columns-btn" type="button"
                                title="Sütunları seç">
                            <i class="fas fa-table-columns"></i>
                        </button>
                    </div>
                    <div class="pg-grip" title="Sürükleyerek sütun alanını genişletin"></div>
                </div>
                <div class="pg-header-time" style="width:${timeline.width}px">
                    <div class="pg-tier pg-tier-top">
                        ${tiers.map(t => `
                            <div class="pg-tier-cell" style="width:${t.span * timeline.colWidth}px">
                                <span>${esc(t.label)}</span>
                            </div>`).join('')}
                    </div>
                    <div class="pg-tier pg-tier-bottom">
                        ${timeline.columns.map(c => `
                            <div class="pg-tier-cell" style="width:${timeline.colWidth}px">
                                ${esc(c.label)}
                            </div>`).join('')}
                    </div>
                </div>
            </div>`;
    }

    _rowHtml(row, timeline) {
        const attrs = this.options.rowAttributes(row) || {};
        const cls = ['pg-row', attrs.class || ''].filter(Boolean).join(' ');
        const dataAttrs = Object.entries(attrs)
            .filter(([k]) => k !== 'class')
            .map(([k, v]) => `${k}="${esc(v)}"`).join(' ');

        const cells = this.options.columns.map(col => {
            const value = row[col.field];
            const canEdit = this.options.isCellEditable(row, col.field);
            const html = col.formatter ? col.formatter(value, row) : esc(value ?? '');
            return `
                <div class="pg-cell ${col.cellClass || ''} ${canEdit ? 'pg-editable' : ''}"
                     style="width:${col.width}"
                     data-field="${esc(col.field)}" data-row="${esc(row.key)}">
                    ${html}
                </div>`;
        }).join('');

        const actions = (this.options.actions || [])
            .filter(a => !a.visible || a.visible(row))
            .map(a => `
                <button class="pg-action-btn ${a.class || ''}" data-pg-action="${esc(a.key)}"
                        data-row="${esc(row.key)}" title="${esc(a.title || '')}"
                        ${a.disabled && a.disabled(row) ? 'disabled' : ''}>
                    <i class="${esc(a.icon)}"></i>
                </button>`).join('');

        return `
            <div class="${cls}" data-row="${esc(row.key)}" ${dataAttrs}>
                <div class="pg-row-grid">
                    ${cells}
                    <div class="pg-cell pg-cell-actions">${actions}</div>
                </div>
                <div class="pg-row-time">${this._barHtml(row, timeline)}</div>
            </div>`;
    }

    _barHtml(row, timeline) {
        const bar = this.options.bar(row);
        if (!bar) return '';
        const startX = timeline.xOf(bar.start || bar.end);
        const endX = timeline.xOf(bar.end || bar.start);
        if (startX === null || endX === null) return '';
        // The end date is inclusive — a task that starts and ends the same day
        // is one day long, not zero — so the bar runs to the END of that unit.
        const oneUnit = timeline.unit === 'day' ? timeline.colWidth
            : timeline.colWidth / (timeline.unit === 'week' ? 7 : 30);
        const width = Math.max(6, endX - startX + oneUnit);
        const pct = Math.max(0, Math.min(100, Number(bar.progress || 0)));

        return `
            <div class="pg-bar pg-bar-${esc(bar.state || 'on-time')}"
                 style="left:${startX}px;width:${width}px"
                 title="${esc(bar.title || '')}">
                <div class="pg-bar-fill" style="width:${pct}%"></div>
                ${width > 54 ? `<span class="pg-bar-label">${esc(bar.label || '')}</span>` : ''}
            </div>`;
    }

    // ---- interaction ----------------------------------------------------

    _bindOnce() {
        const host = document.getElementById(this.containerId);
        if (!host || host.dataset.pgBound) return;
        host.dataset.pgBound = '1';

        host.addEventListener('click', (e) => {
            const actionBtn = e.target.closest('[data-pg-action]');
            if (actionBtn) {
                e.preventDefault();
                e.stopPropagation();
                const row = this._rowByKey(actionBtn.dataset.row);
                if (row) this.options.onAction?.(actionBtn.dataset.pgAction, row);
                return;
            }
            const all = e.target.closest('.pg-toggle-all');
            if (all) {
                e.preventDefault();
                e.stopPropagation();
                this.options.onToggleAll?.();
                return;
            }
            const toggle = e.target.closest('.pg-toggle');
            if (toggle) {
                e.preventDefault();
                e.stopPropagation();
                const row = this._rowByKey(toggle.closest('.pg-row')?.dataset.row);
                if (row) this.options.onToggleGroup?.(row);
                return;
            }
            // Clicking a row's name scrolls the timeline to its bar. On a
            // 31-week sheet the bar is usually off-screen, and hunting for it
            // by dragging is the slowest thing on this page.
            const title = e.target.closest('.pg-cell[data-field="title"]');
            if (title) this.scrollToBar(title.closest('.pg-row'));

            const cell = e.target.closest('.pg-cell.pg-editable');
            if (cell && !cell.querySelector('.pg-editor')) this._startEdit(cell);
        });

        // Dragging the grip re-sizes the frozen column block. Live, because a
        // planner sizing columns is comparing widths as they go.
        host.addEventListener('pointerdown', (e) => {
            const grip = e.target.closest('.pg-grip');
            if (!grip) return;
            e.preventDefault();
            const scroll = host.querySelector('.pg-scroll');
            const startX = e.clientX;
            const startW = this.options.gridWidth;
            document.body.classList.add('pg-resizing');

            const move = (ev) => {
                this.setGridWidth(startW + (ev.clientX - startX));
            };
            const up = () => {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
                document.body.classList.remove('pg-resizing');
                this.options.onGridWidthChange?.(this.options.gridWidth);
                // A narrower grid means a wider lane, which may need more
                // columns to fill it.
                this.render();
            };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
            if (scroll) scroll.focus?.();
        });

        // Ctrl/⌘ + wheel over the timeline zooms, the way every other timeline
        // does. The buttons stay — this is the shortcut, not the only way in.
        host.addEventListener('wheel', (e) => {
            if (!e.ctrlKey && !e.metaKey) return;
            if (!e.target.closest('.pg-row-time, .pg-header-time')) return;
            e.preventDefault();
            const order = ['month', 'week', 'day'];
            const at = order.indexOf(this.options.zoom);
            const next = order[Math.min(order.length - 1, Math.max(0, at + (e.deltaY < 0 ? 1 : -1)))];
            if (next && next !== this.options.zoom) this.options.onZoomChange?.(next);
        }, { passive: false });

        let resizeTimer = null;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => this.render(), 150);
        });
    }

    // Bring a row's bar into view, left-ish rather than centred so what comes
    // after it is visible too. Vertical position is left alone — the row the
    // planner just clicked is already where they are looking.
    scrollToBar(rowEl) {
        if (!rowEl) return;
        const row = this._rowByKey(rowEl.dataset.row);
        const bar = this.options.bar(row);
        if (!bar || !this.timeline) return;
        const x = this.timeline.xOf(bar.start || bar.end);
        if (x === null) return;
        const scroller = this.container?.querySelector('.pg-scroll');
        if (!scroller) return;
        const lane = scroller.clientWidth - this.options.gridWidth;
        const target = Math.max(0, x - Math.max(40, lane * 0.15));
        // Assigned, not animated: a smooth scroll needs the compositor and
        // silently does nothing where frames are not being produced. A jump is
        // also the more useful answer to "take me there".
        scroller.scrollLeft = target;
    }

    _rowByKey(key) {
        return this.options.rows.find(r => String(r.key) === String(key)) || null;
    }

    _startEdit(cell) {
        const row = this._rowByKey(cell.dataset.row);
        const col = this.options.columns.find(c => c.field === cell.dataset.field);
        if (!row || !col) return;

        const original = cell.innerHTML;
        const value = row[col.field];
        let editor;

        if (col.type === 'select') {
            editor = document.createElement('select');
            editor.className = 'pg-editor';
            const opts = optionsWithCurrentValue(col.options, value);
            opts.forEach(opt => {
                const o = document.createElement('option');
                o.value = opt.value;
                o.textContent = opt.label;
                if (String(opt.value) === String(value)) o.selected = true;
                editor.appendChild(o);
            });
        } else {
            editor = document.createElement('input');
            editor.className = 'pg-editor';
            editor.type = col.type === 'date' ? 'date' : (col.type === 'number' ? 'number' : 'text');
            if (col.min !== undefined) editor.min = col.min;
            if (col.max !== undefined) editor.max = col.max;
            if (col.step !== undefined) editor.step = col.step;
            editor.value = value ?? '';
        }

        cell.innerHTML = '';
        cell.appendChild(editor);
        editor.focus();
        if (editor.select) editor.select();

        let done = false;
        const finish = async (commit) => {
            if (done) return;
            done = true;
            const next = editor.value;
            cell.innerHTML = original;
            if (!commit || String(next) === String(value ?? '')) return;
            try {
                await this.options.onEdit?.(row, col.field, next);
            } catch (err) {
                // The page owns the rules; the grid puts the old value back and
                // hands the reason straight back so the planner is told WHY the
                // edit was refused instead of watching it silently revert.
                cell.innerHTML = original;
                this.options.onEditError?.(err, row, col.field);
            }
        };

        // Selects commit on change. Blur without a change must not commit:
        // an unmatched current value used to look like "pending" and a click
        // away would write that.
        editor.addEventListener('blur', () => finish(col.type !== 'select'));
        editor.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); finish(true); }
            else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        });
        if (col.type === 'select') editor.addEventListener('change', () => finish(true));
    }
}

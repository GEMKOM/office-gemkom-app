/**
 * <tfoot> row for machining / CNC user report tables: sums for hour & count columns, average for efficiency.
 * Markup and alignment mirror body cells so columns line up with thead/tbody.
 * @param {{ allData: object[], columns: object[], hasActions: boolean }} params
 * @returns {string} Single <tr>...</tr> HTML or empty string
 */
export function buildUserReportSummaryFooterRow({ allData, columns, hasActions }) {
    const rows = Array.isArray(allData) ? allData : [];
    if (!rows.length || !Array.isArray(columns)) return '';

    const sum = (field) => rows.reduce((s, r) => {
        const v = r[field];
        if (v === undefined || v === null || v === '') return s;
        const n = Number(v);
        return s + (Number.isNaN(n) ? 0 : n);
    }, 0);

    const avgEfficiency = () => {
        const vals = rows
            .map(r => r._efficiency)
            .filter(v => v != null && !Number.isNaN(Number(v)));
        if (!vals.length) return 0;
        return vals.reduce((a, b) => a + Number(b), 0) / vals.length;
    };

    const footTd = (col, innerHtml) => {
        const cls = [col.cellClass].filter(Boolean).join(' ').trim();
        const classAttr = cls ? ` class="${cls}"` : '';
        const widthAttr = col.width
            ? ` style="width: ${col.width}; min-width: ${col.width};"`
            : '';
        return `<td${classAttr}${widthAttr}>${innerHtml}</td>`;
    };

    const eff = avgEfficiency();
    let effColorClass = '';
    let effStyleAttr = '';
    if (eff >= 100) {
        effStyleAttr = ' style="color: #6f42c1;"';
    } else if (eff >= 80) {
        effColorClass = 'text-success';
    } else if (eff >= 60) {
        effColorClass = 'text-warning';
    } else {
        effColorClass = 'text-danger';
    }
    const effSpanClass = effColorClass ? `${effColorClass} fw-bold` : 'fw-bold';

    const cells = columns.map((col) => {
        const f = col.field;
        if (f === '_displayName') {
            return footTd(col, '<span class="text-muted fw-bold small">Özet</span>');
        }
        if (f === 'total_work_hours') {
            return footTd(col, `<span class="text-success fw-bold">${sum('total_work_hours').toFixed(2)}</span>`);
        }
        if (f === 'total_idle_hours') {
            return footTd(col, `<span class="text-danger fw-bold">${sum('total_idle_hours').toFixed(2)}</span>`);
        }
        if (f === 'total_hold_hours') {
            return footTd(col, `<span class="text-secondary fw-bold">${sum('total_hold_hours').toFixed(2)}</span>`);
        }
        if (f === '_efficiency') {
            return footTd(col, `<span class="${effSpanClass}"${effStyleAttr}>${eff.toFixed(1)}%</span>`);
        }
        if (f === 'total_tasks_completed') {
            const v = sum('total_tasks_completed');
            return footTd(col, `<span class="status-badge status-green" style="min-width: auto;">${v}</span>`);
        }
        if (f === 'total_tasks_worked_on') {
            const v = sum('total_tasks_worked_on');
            return footTd(col, `<span class="status-badge status-blue" style="min-width: auto;">${v}</span>`);
        }
        if (f === 'total_parts_completed') {
            const v = sum('total_parts_completed');
            return footTd(col, `<span class="status-badge status-yellow" style="min-width: auto;">${v}</span>`);
        }
        if (f === 'total_parts_worked_on') {
            const v = sum('total_parts_worked_on');
            return footTd(col, `<span class="status-badge status-blue" style="min-width: auto;">${v}</span>`);
        }
        return footTd(col, '<span class="text-muted">—</span>');
    });

    if (hasActions) {
        cells.push('<td class="action-column"></td>');
    }

    return `<tr class="user-report-summary-footer table-secondary">${cells.join('')}</tr>`;
}

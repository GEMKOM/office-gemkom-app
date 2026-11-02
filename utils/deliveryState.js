// Delivery state of a planning item line, shared by every office table that
// shows "Teslim": fully received, partially received (some shipments landed,
// the rest is still awaited) or not received. The backend derives
// is_delivered / delivered_quantity from the receipt log (partial deliveries,
// 2026-10-12); the UI only renders them.

export function fmtQty(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '-';
    return n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function isPartiallyDelivered(row) {
    return !!row && row.is_delivered !== true && Number(row.delivered_quantity || 0) > 0;
}

/** Icon / badge cell for a planning item row (or any object carrying the same fields). */
export function renderDeliveryState(row) {
    if (!row) return '-';
    if (row.is_delivered === true) {
        return '<i class="fas fa-check text-success" title="Teslim edildi"></i>';
    }
    if (isPartiallyDelivered(row)) {
        const unit = row.item_unit || '';
        const text = `${fmtQty(row.delivered_quantity)} / ${fmtQty(row.quantity)} ${unit}`.trim();
        return `<span class="status-badge status-orange" style="min-width: auto; white-space: nowrap;"
            title="Kısmi teslim: ${text} alındı, kalanı bekleniyor">Kısmi ${text}</span>`;
    }
    if (row.is_delivered === false) {
        return '<i class="fas fa-times text-danger" title="Teslim edilmedi"></i>';
    }
    return '-';
}

/** Plain text for exports and tooltips. */
export function deliveryStateText(row) {
    if (!row) return '';
    if (row.is_delivered === true) return 'Teslim edildi';
    if (isPartiallyDelivered(row)) {
        return `Kısmi teslim (${fmtQty(row.delivered_quantity)} / ${fmtQty(row.quantity)} ${row.item_unit || ''})`.trim();
    }
    return 'Teslim edilmedi';
}

export const DELIVERY_FILTER_OPTIONS = [
    { value: '', label: 'Tümü' },
    { value: 'true', label: 'Teslim Edildi' },
    { value: 'partial', label: 'Kısmi Teslim' },
    { value: 'false', label: 'Teslim Edilmedi' }
];

/** Query params for the "Teslim" dropdown value ('' | 'true' | 'partial' | 'false'). */
export function deliveryFilterParams(value) {
    if (value === 'partial') return { is_delivered: 'false', partially_delivered: 'true' };
    return { is_delivered: value || undefined };
}

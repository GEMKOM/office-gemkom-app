/**
 * Icon + colour per notification category.
 *
 * Shared by the navbar bell and the Bildirimlerim archive so a "Satınalma"
 * notification looks the same wherever the user meets it. Values match
 * Notification.CATEGORY_CHOICES on the backend.
 */

export const CATEGORY_META = {
    design:          { icon: 'fa-compass-drafting', color: '#6366f1', bg: '#eef0fe', label: 'Tasarım' },
    procurement:     { icon: 'fa-cart-shopping',    color: '#2563eb', bg: '#e8f0fe', label: 'Satınalma' },
    quality_control: { icon: 'fa-clipboard-check',  color: '#059669', bg: '#e6f6f0', label: 'Kalite Kontrol' },
    sales:           { icon: 'fa-handshake',        color: '#7c3aed', bg: '#f1eafe', label: 'Satış' },
    planning:        { icon: 'fa-calendar-days',    color: '#ea580c', bg: '#fdeee4', label: 'Planlama' },
    topics:          { icon: 'fa-comments',         color: '#0891b2', bg: '#e3f4f8', label: 'Konular' },
    general:         { icon: 'fa-bell',             color: '#64748b', bg: '#eef1f5', label: 'Genel' },
};

const FALLBACK = { icon: 'fa-bell', color: '#64748b', bg: '#eef1f5', label: 'Bildirim' };

export function categoryMeta(category) {
    return CATEGORY_META[category] || FALLBACK;
}

/** The coloured square that leads every notification row. */
export function categoryIconHtml(category) {
    const meta = categoryMeta(category);
    return `<div class="notification-icon" style="background:${meta.bg};color:${meta.color}">
                <i class="fas ${meta.icon}"></i>
            </div>`;
}

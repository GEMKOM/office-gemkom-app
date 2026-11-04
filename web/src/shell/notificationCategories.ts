/**
 * Icon + colour per notification category, shared by the bell, the home page
 * and the Bildirimlerim archive so a "Satınalma" notification looks the same
 * wherever the user meets it. Keys match Notification.CATEGORY_CHOICES on the
 * backend. Ported from the legacy components/notificationBell/notificationCategories.js.
 */

export interface CategoryMeta {
  /** Font Awesome name without the style class, e.g. "fa-handshake". */
  icon: string;
  color: string;
  bg: string;
  label: string;
}

export const CATEGORY_META: Record<string, CategoryMeta> = {
  design: { icon: 'fa-compass-drafting', color: '#6366f1', bg: '#eef0fe', label: 'Tasarım' },
  procurement: { icon: 'fa-cart-shopping', color: '#2563eb', bg: '#e8f0fe', label: 'Satınalma' },
  quality_control: {
    icon: 'fa-clipboard-check',
    color: '#059669',
    bg: '#e6f6f0',
    label: 'Kalite Kontrol',
  },
  sales: { icon: 'fa-handshake', color: '#7c3aed', bg: '#f1eafe', label: 'Satış' },
  planning: { icon: 'fa-calendar-days', color: '#ea580c', bg: '#fdeee4', label: 'Planlama' },
  topics: { icon: 'fa-comments', color: '#0891b2', bg: '#e3f4f8', label: 'Konular' },
  isg: { icon: 'fa-helmet-safety', color: '#b45309', bg: '#fdf0e3', label: 'İSG' },
  general: { icon: 'fa-bell', color: '#64748b', bg: '#eef1f5', label: 'Genel' },
};

const FALLBACK: CategoryMeta = {
  icon: 'fa-bell',
  color: '#64748b',
  bg: '#eef1f5',
  label: 'Bildirim',
};

export function categoryMeta(category: string | null | undefined): CategoryMeta {
  return (
    (category && Object.hasOwn(CATEGORY_META, category) && CATEGORY_META[category]) || FALLBACK
  );
}

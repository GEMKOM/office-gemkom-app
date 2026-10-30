// The bell's category colours are shared with the legacy bell and the
// Bildirimlerim archive (components/notificationBell/notificationCategories.js).
declare module '@legacy/components/notificationBell/notificationCategories.js' {
  export interface CategoryMeta {
    /** Font Awesome name without the style class, e.g. "fa-handshake". */
    icon: string;
    color: string;
    bg: string;
    label: string;
  }
  export function categoryMeta(category: string | null | undefined): CategoryMeta;
}

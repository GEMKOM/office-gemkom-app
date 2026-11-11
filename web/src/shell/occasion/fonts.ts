/**
 * Title fonts HR can pick for a day. IBM Plex Sans ships with the app; the
 * others load from Google Fonts the first time a welcome or the editor needs
 * them.
 */

export const TITLE_FONTS = [
  'IBM Plex Sans',
  'Bebas Neue',
  'Oswald',
  'Playfair Display',
  'Fraunces',
  'Cormorant Garamond',
  'Amiri',
  'Dancing Script',
  'Baloo 2',
] as const;

export type TitleFont = (typeof TITLE_FONTS)[number];

export function isTitleFont(value: unknown): value is TitleFont {
  return typeof value === 'string' && (TITLE_FONTS as readonly string[]).includes(value);
}

/** Google Fonts families with the weights the welcome uses. */
const GOOGLE_FAMILY: Partial<Record<TitleFont, string>> = {
  'Bebas Neue': 'Bebas+Neue',
  Oswald: 'Oswald:wght@500;600',
  'Playfair Display': 'Playfair+Display:wght@600;700',
  Fraunces: 'Fraunces:opsz,wght@9..144,600;9..144,700',
  'Cormorant Garamond': 'Cormorant+Garamond:wght@500;600;700',
  Amiri: 'Amiri:wght@400;700',
  'Dancing Script': 'Dancing+Script:wght@600;700',
  'Baloo 2': 'Baloo+2:wght@600;700',
};

const requested = new Set<string>();

/** Adds the font's stylesheet once; safe to call on every render. */
export function ensureFont(font: string): void {
  if (typeof document === 'undefined' || !isTitleFont(font)) return;
  const family = GOOGLE_FAMILY[font];
  if (!family || requested.has(font)) return;
  requested.add(font);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${family}&display=swap`;
  link.dataset.gkFont = font;
  document.head.appendChild(link);
}

export function ensureFonts(fonts: readonly string[]): void {
  fonts.forEach(ensureFont);
}

export function fontStack(font: string): string {
  const name = isTitleFont(font) ? font : 'IBM Plex Sans';
  return `'${name}', 'IBM Plex Sans', 'Segoe UI', sans-serif`;
}

/** Title size (px at the 1280-wide stage) and weight per font, as in the design. */
export function titleMetrics(font: string): { size: number; weight: number } {
  switch (font) {
    case 'Bebas Neue':
      return { size: 84, weight: 400 };
    case 'Oswald':
      return { size: 60, weight: 600 };
    case 'Dancing Script':
      return { size: 72, weight: 700 };
    case 'Amiri':
      return { size: 58, weight: 700 };
    case 'Cormorant Garamond':
      return { size: 60, weight: 700 };
    default:
      return { size: 56, weight: 700 };
  }
}

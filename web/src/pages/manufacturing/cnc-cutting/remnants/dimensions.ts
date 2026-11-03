// The one dimensions format for remnant plates: "<genişlik>x<yükseklik>" in mm,
// a lower-case x, no spaces, dot decimals ("1200x800", "1500.5x660"). It is what
// bulk add has always written and what the forms have always suggested.
//
// No app imports here: scripts/fix-remnant-dimensions.mjs loads this file with
// `node --experimental-strip-types`.

export const DIMENSIONS_EXAMPLE = '1200x800';
export const DIMENSIONS_ERROR =
  'Boyutlar Genişlik x Yükseklik (mm) biçiminde olmalıdır, örn. 1200x800';

/** g/cm³; every plate is estimated as steel. */
export const STEEL_DENSITY = 7.85;

// At most two decimals: "1.200" or "1,200" may be a Turkish thousands
// separator (1200 mm) as well as 1.2 mm, so it is left for a person to fix.
const NUMBER = String.raw`(\d+(?:[.,]\d{1,2})?)`;
const LOOSE = new RegExp(String.raw`^${NUMBER}\s*(?:mm)?\s*[x×*]\s*${NUMBER}\s*(?:mm)?$`, 'i');

function millimetres(text: string): string | null {
  const n = Number(text.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? String(n) : null;
}

/**
 * The value in the one format, or null when it cannot be read as two
 * dimensions. Spacing, case, "×"/"*", "mm" and a decimal comma are fixed:
 * " 1200 X 800mm" -> "1200x800".
 */
export function normalizeDimensions(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = LOOSE.exec(value.trim());
  if (!match) return null;
  const width = millimetres(match[1] ?? '');
  const height = millimetres(match[2] ?? '');
  return width && height ? `${width}x${height}` : null;
}

/** Already stored in the one format. */
export function isCanonicalDimensions(value: unknown): boolean {
  return typeof value === 'string' && normalizeDimensions(value) === value;
}

export function parseDimensions(value: unknown): { width: number; height: number } | null {
  const normalized = normalizeDimensions(value);
  if (!normalized) return null;
  const [width, height] = normalized.split('x').map(Number);
  return { width: width!, height: height! };
}

/**
 * Estimated weight of one plate in kg: mm × mm × mm / 1000 = cm³, times the
 * steel density in g/cm³, / 1000 = kg. Null when a dimension or the
 * thickness cannot be read.
 */
export function plateWeightKg(dimensions: unknown, thicknessMm: unknown): number | null {
  const size = parseDimensions(dimensions);
  const thickness = Number.parseFloat(String(thicknessMm ?? ''));
  if (!size || !(thickness > 0)) return null;
  return (((size.width * size.height * thickness) / 1000) * STEEL_DENSITY) / 1000;
}

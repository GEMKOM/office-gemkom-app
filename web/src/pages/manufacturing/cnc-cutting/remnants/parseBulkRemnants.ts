import type { RemnantPlateInput } from '@/api/manufacturing/remnants';

export interface BulkRemnantRow extends RemnantPlateInput {
  lineNumber: number;
}

export interface BulkRemnantError {
  lineNumber: number;
  line: string;
  error: string;
}

const NOT_ENOUGH =
  'Yeterli veri yok (5 veya 6 alan gerekli: Kalınlık, [Kalınlık2], Genişlik, Yükseklik, Adet, Malzeme)';

/** "2,5" -> 2.5; "-" or blank -> null; anything not a positive number -> null. */
function optionalThickness(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '' || trimmed === '-') return null;
  const n = parseFloat(trimmed.replace(',', '.'));
  return !Number.isNaN(n) && n > 0 ? n : null;
}

/** "1200x800" -> ['1200', '800']; null when the field is not in that form. */
function splitDimensions(field: string): [string, string] | null {
  if (!/[xX]/.test(field)) return null;
  const parts = field.split(/[xX]/).map((p) => p.trim());
  return parts.length === 2 ? [parts[0]!, parts[1]!] : null;
}

interface Fields {
  thickness2: number | null;
  width: string;
  height: string;
  quantity: string;
  material: string;
}

/** The fields after Kalınlık, for a 5- or 6-field line. */
function readFields(parts: string[]): Fields {
  const at = (i: number) => parts[i] ?? '';
  const dims = splitDimensions(at(2));
  if (dims) {
    return {
      thickness2: optionalThickness(at(1)),
      width: dims[0],
      height: dims[1],
      quantity: at(3),
      material: at(4),
    };
  }
  if (parts.length === 5) {
    // Five fields without "AxB": Kalınlık2 left out, as the help text says.
    // (Legacy read them as Kalınlık2 + Genişlik and then failed on the Adet.)
    return { thickness2: null, width: at(1), height: at(2), quantity: at(3), material: at(4) };
  }
  return {
    thickness2: optionalThickness(at(1)),
    width: at(2),
    height: at(3),
    quantity: at(4),
    material: at(5),
  };
}

/**
 * Port of parseBulkData in remnants.js. One plate per line, tab separated
 * (comma as a fallback):
 *   6 fields  Kalınlık, Kalınlık2, Genişlik, Yükseklik, Adet, Malzeme
 *   5 fields  Kalınlık, Kalınlık2, GenişlikxYükseklik, Adet, Malzeme
 *             or Kalınlık, Genişlik, Yükseklik, Adet, Malzeme
 *   4 fields  Kalınlık, Boyutlar, Adet, Malzeme (old format)
 */
export function parseBulkRemnants(text: string): {
  valid: BulkRemnantRow[];
  invalid: BulkRemnantError[];
} {
  const valid: BulkRemnantRow[] = [];
  const invalid: BulkRemnantError[] = [];
  if (!text.trim()) return { valid, invalid };

  const lines = text.split('\n').filter((line) => line.trim() !== '');
  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = rawLine.trim();
    let parts = line.split('\t').map((p) => p.trim());
    if (parts.length < 5) parts = line.split(',').map((p) => p.trim());

    if (parts.length === 4) {
      const [thicknessText = '', dimensions = '', quantityText = '', material = ''] = parts;
      const thickness = parseFloat(thicknessText.replace(',', '.'));
      const quantity = parseInt(quantityText, 10);
      let error: string | null = null;
      if (Number.isNaN(thickness) || thickness <= 0) error = 'Geçersiz kalınlık değeri';
      else if (!dimensions) error = 'Boyutlar gereklidir';
      else if (Number.isNaN(quantity) || quantity < 0) error = 'Geçersiz adet değeri';
      else if (!material) error = 'Malzeme gereklidir';
      if (error) invalid.push({ lineNumber, line, error });
      else
        valid.push({
          lineNumber,
          thickness_mm: thickness.toFixed(2),
          dimensions,
          quantity,
          material,
        });
      return;
    }
    if (parts.length < 5) {
      invalid.push({ lineNumber, line, error: NOT_ENOUGH });
      return;
    }

    const thicknessText = (parts[0] ?? '').replace(',', '.');
    const thickness = parseFloat(thicknessText);
    const fields = readFields(parts);
    const quantity = parseInt(fields.quantity, 10);

    let error: string | null = null;
    if (thicknessText.includes('+')) error = 'Bileşik kalınlık formatı desteklenmiyor (örn: 20+8)';
    else if (Number.isNaN(thickness) || thickness <= 0) error = 'Geçersiz kalınlık değeri';
    else if (!fields.width || Number.isNaN(parseFloat(fields.width)))
      error = 'Geçersiz genişlik değeri';
    else if (!fields.height || Number.isNaN(parseFloat(fields.height)))
      error = 'Geçersiz yükseklik değeri';
    else if (!fields.quantity || Number.isNaN(quantity) || quantity < 0)
      error = 'Geçersiz adet değeri';
    else if (!fields.material) error = 'Malzeme gereklidir';

    if (error) {
      invalid.push({ lineNumber, line, error });
      return;
    }
    const row: BulkRemnantRow = {
      lineNumber,
      thickness_mm: thickness.toFixed(2),
      dimensions: `${fields.width}x${fields.height}`,
      quantity,
      material: fields.material,
    };
    if (fields.thickness2 !== null) row.thickness_mm_2 = fields.thickness2.toFixed(2);
    valid.push(row);
  });
  return { valid, invalid };
}

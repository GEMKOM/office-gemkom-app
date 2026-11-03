import type { CncPart, CncPartInput } from '@/api/manufacturing/cncTasks';

// Port of manufacturing/cnc-cutting/cuts/partsPasteParser.js: parts copied
// from the nesting report in Excel. The header row names the columns; "Part"
// holds "<job_no> <image_no> <position_no>", "Weight" the weight and "Nested"
// the quantity.

/** Split a row by tab (Excel), else by runs of 2+ spaces. Empty cells are kept. */
function splitRow(line: string): string[] {
  if (!line) return [];
  if (line.includes('\t')) return line.split('\t').map((cell) => cell.trim());
  return line
    .trim()
    .split(/\s{2,}/)
    .map((cell) => cell.trim());
}

/** Exact header match first, then a header containing the name. */
function findColumnIndex(headers: string[], name: string): number {
  const exact = headers.findIndex((h) => h.toLowerCase().trim() === name);
  if (exact !== -1) return exact;
  return headers.findIndex((h) => h.toLowerCase().trim().includes(name));
}

/** "114-09 0124 P8-B" -> job_no, image_no, position_no (first three words). */
function splitPartColumn(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return { job_no: words[0] ?? '', image_no: words[1] ?? '', position_no: words[2] ?? '' };
}

/** "38.33kg", "38,33 kg", "38.33" -> 38.33. */
function parseWeight(text: string): number | null {
  const cleaned = text.replace(/\s+/g, '');
  if (!cleaned) return null;
  const value = parseFloat(cleaned.replace(/kg$/i, '').replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

export function parsePartsFromText(rawText: string): CncPartInput[] {
  if (!rawText) return [];

  // Tab-separated lines keep their leading tabs (empty first cells).
  const lines: string[] = [];
  for (const line of rawText.split(/\r?\n/g)) {
    if (!line.trim()) continue;
    lines.push(line.includes('\t') ? line : line.trim());
  }
  if (lines.length < 2) return [];

  const headers = splitRow(lines[0]!);
  const partCol = findColumnIndex(headers, 'part');
  const weightCol = findColumnIndex(headers, 'weight');
  const nestedCol = findColumnIndex(headers, 'nested');
  if (partCol === -1) return [];

  const parts: CncPartInput[] = [];
  for (const rowLine of lines.slice(1)) {
    const lower = rowLine.toLowerCase();
    // A repeated header row.
    if (lower.includes('geometry') && lower.includes('part') && lower.includes('weight')) continue;

    const row = splitRow(rowLine);
    if (!row.length) continue;

    let partValue = (row[partCol] ?? '').trim();
    // Misaligned columns (empty leading cells): take the first cell with 2+ words.
    if (!partValue || partValue.toLowerCase() === 'part') {
      for (let j = 0; j < row.length; j++) {
        const cell = (row[j] ?? '').trim();
        if (
          cell &&
          cell.toLowerCase() !== 'part' &&
          cell.split(/\s+/).filter(Boolean).length >= 2
        ) {
          partValue = cell;
          row[partCol] = cell;
          break;
        }
      }
    }
    if (!partValue || partValue.toLowerCase() === 'part') continue;
    if (row.length <= partCol) continue;

    const { job_no, image_no, position_no } = splitPartColumn(partValue);

    let weight_kg: number | null = null;
    if (weightCol >= 0 && row.length > weightCol) {
      const cell = row[weightCol] ?? '';
      if (cell && cell.toLowerCase() !== 'weight') weight_kg = parseWeight(cell);
    }

    let quantity: number | null = null;
    if (nestedCol >= 0 && row.length > nestedCol) {
      const cell = row[nestedCol] ?? '';
      if (cell && cell.toLowerCase() !== 'nested') {
        const n = parseInt(cell, 10);
        quantity = Number.isFinite(n) ? n : null;
      }
    }

    if (job_no || image_no || position_no) {
      parts.push({ job_no, image_no, position_no, weight_kg, quantity });
    }
  }
  return parts;
}

const partKey = (p: {
  job_no?: string | null;
  image_no?: string | null;
  position_no?: string | null;
}) => `${p.job_no || ''}_${p.image_no || ''}_${p.position_no || ''}`;

export interface PastePlan {
  updates: { id: number; data: CncPartInput }[];
  creates: CncPartInput[];
}

/**
 * The edit modal's "Onayla ve Değiştir": a pasted part matching an existing one
 * on job, drawing and position numbers updates it, the rest are created.
 * Existing parts not in the paste stay as they are.
 */
export function planPastedParts(
  existing: readonly CncPart[],
  pasted: readonly CncPartInput[],
): PastePlan {
  const byKey = new Map<string, CncPart>();
  for (const part of existing) byKey.set(partKey(part), part);
  const plan: PastePlan = { updates: [], creates: [] };
  for (const p of pasted) {
    // Legacy sent `|| null`, so a 0 weight or quantity goes out as null.
    const data: CncPartInput = {
      job_no: p.job_no || '',
      image_no: p.image_no || '',
      position_no: p.position_no || '',
      weight_kg: p.weight_kg || null,
      quantity: p.quantity || null,
    };
    const match = byKey.get(partKey(data));
    if (match) plan.updates.push({ id: match.id, data });
    else plan.creates.push(data);
  }
  return plan;
}

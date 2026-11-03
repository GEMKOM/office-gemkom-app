import type { RemnantPlate } from '@/api/manufacturing/remnants';
import { isCanonicalDimensions, plateWeightKg } from './dimensions';

export interface RemnantSummary {
  /** Plate records in the list. */
  plates: number;
  /** Pieces still on hand: Σ available_quantity. */
  available: number;
  /** Records a cut has used from (available below quantity). */
  assigned: number;
  /** Records no cut has used from. assigned + unassigned = plates. */
  unassigned: number;
  /** Estimated kg of the pieces on hand, steel density. */
  weightKg: number;
  /** Records with pieces on hand left out of weightKg: dimensions or thickness unreadable. */
  uncounted: number;
  /** Records whose dimensions are not in the one format. */
  malformed: number;
}

const count = (value: unknown) => Number.parseInt(String(value ?? ''), 10) || 0;

/** Pieces left: the API's available_quantity (quantity minus what cuts used). */
export function availableOf(plate: RemnantPlate): number {
  return plate.available_quantity === null || plate.available_quantity === undefined
    ? count(plate.quantity)
    : count(plate.available_quantity);
}

/**
 * The header figures over every plate the list filters match (all pages).
 * The plates come from the API in full, so the figures agree with each other
 * and with the table's total.
 */
export function summarizeRemnants(plates: readonly RemnantPlate[]): RemnantSummary {
  const summary: RemnantSummary = {
    plates: plates.length,
    available: 0,
    assigned: 0,
    unassigned: 0,
    weightKg: 0,
    uncounted: 0,
    malformed: 0,
  };
  for (const plate of plates) {
    const available = availableOf(plate);
    summary.available += available;
    if (available < count(plate.quantity)) summary.assigned += 1;
    else summary.unassigned += 1;
    if (!isCanonicalDimensions(plate.dimensions)) summary.malformed += 1;
    if (available > 0) {
      const weight = plateWeightKg(plate.dimensions, plate.thickness_mm);
      if (weight === null) summary.uncounted += 1;
      else summary.weightKg += weight * available;
    }
  }
  return summary;
}

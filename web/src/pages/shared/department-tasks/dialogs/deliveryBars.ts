import type { DeliveredBar } from '@/api/planning/planningItems';

/** One row of the Teslim Al bar editor, as typed. */
export interface BarDraft {
  length_mm: number | string;
  quantity: number | string;
}

/** The typed rows as bars; rows left empty are dropped. */
export function draftBars(rows: readonly BarDraft[]): DeliveredBar[] {
  return rows
    .filter((r) => r.length_mm !== '' && r.quantity !== '')
    .map((r) => ({ length_mm: Number(r.length_mm), quantity: Number(r.quantity) }));
}

/** Metres of the bars. */
export function barsMetres(bars: readonly DeliveredBar[]): number {
  return bars.reduce((sum, b) => sum + (b.length_mm * b.quantity) / 1000, 0);
}

/**
 * Why the bars don't fit the delivered quantity (the backend's rule: the
 * metres on a metre card within 1 %, the count on an adet card), or null.
 */
export function barsProblem(
  bars: readonly DeliveredBar[],
  unit: string,
  quantity: number,
): string | null {
  if (bars.length === 0) return 'Gelen boyların uzunluğunu ve adedini girin';
  if (bars.some((b) => !(b.length_mm > 0) || !Number.isInteger(b.quantity) || b.quantity < 1))
    return 'Her boyun uzunluğu 0’dan büyük, adedi tam sayı ve en az 1 olmalı';
  const u = unit.toLowerCase();
  if (u === 'metre') {
    const metres = barsMetres(bars);
    if (Math.abs(metres - quantity) > Math.max(quantity * 0.01, 0.01))
      return `Girilen boylar ${fmt(metres)} m ediyor; teslim alınan ${fmt(quantity)} m`;
  } else if (u === 'adet') {
    const count = bars.reduce((sum, b) => sum + b.quantity, 0);
    if (count !== quantity) return `${count} boy girildi; teslim alınan ${fmt(quantity)} adet`;
  }
  return null;
}

/** How many bars of a line ordered in sizes a quantity is, or null when not whole. */
export function sizedBarCount(lengthMm: number, unit: string, quantity: number): number | null {
  const u = unit.toLowerCase();
  const count = u === 'metre' ? (quantity * 1000) / lengthMm : u === 'adet' ? quantity : null;
  if (count === null || !(count >= 1)) return null;
  const whole = Math.round(count);
  return Math.abs(whole - count) <= 0.01 * whole ? whole : null;
}

const fmt = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 2 });

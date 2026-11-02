/**
 * Job-order selection for Taşeron İşçilik Fiyatı (port of
 * laborPricingSelection.js).
 *
 * The Hesaplama card holds both the job dropdown and the rate knobs. Save must
 * persist onto the jobs currently in that dropdown — not the last Hesapla
 * result — because the knobs are already read live and the two would otherwise
 * diverge after the selection changes without a recompute.
 */

export function asJobNos(
  value: readonly (string | null | undefined)[] | string | null | undefined,
): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => Boolean(v));
  return typeof value === 'string' && value ? [value] : [];
}

/**
 * Jobs Parametreleri Kaydet should POST to.
 *
 * An empty dropdown is a hard stop (caller shows "Önce iş emri seçin"), even
 * when a previous Hesapla still has jobs in memory — those are no longer what
 * the card shows.
 */
export function resolveSaveJobNos({
  filterJobNos,
}: {
  filterJobNos: readonly string[] | string | null | undefined;
  /**
   * The last Hesapla selection. Accepted so callers pass both sides of the
   * fork, then not used: the knobs are already read live from the same card.
   */
  computedJobNos?: readonly string[];
}): string[] {
  return asJobNos(filterJobNos);
}

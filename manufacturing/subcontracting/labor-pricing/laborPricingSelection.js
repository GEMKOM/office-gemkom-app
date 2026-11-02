/**
 * Job-order selection for Taşeron İşçilik Fiyatı.
 *
 * The filter bar holds both the job dropdown and the rate knobs. Save must
 * persist onto the jobs currently in that dropdown — not the last Hesapla
 * result — because the knobs are already read live and the two would otherwise
 * diverge after the selection changes without a recompute.
 */

export function asJobNos(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    return value ? [value] : [];
}

/**
 * Jobs Parametreleri Kaydet should POST to.
 *
 * An empty dropdown is a hard stop (caller shows "Önce iş emri seçin"), even
 * when a previous Hesapla still has jobs in memory — those are no longer what
 * the filter bar shows.
 */
export function resolveSaveJobNos({ filterJobNos, computedJobNos }) {
    // computedJobNos is the last Hesapla selection. It is accepted so callers
    // pass both sides of the fork, then must not be used: the knobs are
    // already read live from the same filter bar.
    void computedJobNos;
    return asJobNos(filterJobNos);
}

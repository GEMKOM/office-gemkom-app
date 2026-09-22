/**
 * What the board may say about Gerçek./Tahmini while the planner is typing.
 *
 * The column normally shows the forecast engine's number. The moment any cell
 * on a job is touched the board takes over and re-derives it locally, so these
 * two rules decide what it is allowed to re-derive, and how.
 */

/**
 * Whether this row's forecast is the board's to redo, or the engine's to keep.
 *
 * Only a TEMPO-driven row (`rate`) is arithmetic the board can repeat. Every
 * other kind is decided by something the board cannot see: a material wait
 * (`duration`/`start` on a blocked row), a başlama gate, a delivery floor, a
 * predecessor's finish (`push`), an ancestor's duration share. Re-deriving
 * those from progress alone produces nonsense — 061-60-02's ERK assignment is
 * blocked on boru/profil until 07.10, so the engine resumes it there and says
 * 23.11; extrapolating %10 across the waiting days said 23.02.2027, and
 * nudging the progress up to %15 "improved" it to 28.12 (user 2026-09-22,
 * "that doesn't make sense"). The engine even records the figure it rejected:
 * rate_wd 144,0.
 *
 * A row the engine has no opinion on — a block that is not saved yet — is the
 * board's own to lay out.
 */
export function canRederiveForecast(forecastKind) {
    return !forecastKind || forecastKind === 'rate';
}

/**
 * How much work a started row has LEFT, in working days.
 *
 * The mirror of the engine's `rate` path: what the row has achieved over its
 * measured window decides what the rest will cost.
 *
 *     kalan = geçen × (100 − ilerleme) / ilerleme
 *
 * `elapsedWd` should be the engine's own `forecast_elapsed_wd` when it sent
 * one — that window carries the right anchor and has any closed material wait
 * already discounted off it, neither of which the board can work out.
 *
 * This replaced a rule that took the EARLIER of the entered duration's budget
 * (measured from the row's own start) and the remaining share counted from
 * today. That ceiling was removed from the server on 2026-07-30 — "with real
 * tempo the measurement IS the projection" — and keeping it here made any row
 * whose budget had already run out collapse onto TODAY: 009-37's 825 kg team,
 * entered at 10 g from 30.08, read "finishes today" the moment its progress
 * was touched, while the server said 15.10 (user 2026-09-22, "I only changed
 * 10% from 50% to 40%. That can't be right.").
 *
 * With no window to measure — the row starts today or later — there is no
 * tempo yet, so the entered duration's remaining share stands in for one.
 */
export function forecastRemainingWd(progressPct, elapsedWd, durationWd) {
    const p = Number(progressPct || 0);
    const elapsed = Number(elapsedWd || 0);
    const duration = Number(durationWd || 0);
    const left = Math.max(100 - p, 0);
    // A row with no progress is not measurable; callers handle that branch
    // (it spans its whole duration from its anchor).
    const remaining = p > 0 && elapsed > 0
        ? elapsed * left / p
        : duration * left / 100;
    // A window is never zero-length, mirroring the engine's MIN_SPAN_WD.
    return Math.max(remaining, 0.1);
}

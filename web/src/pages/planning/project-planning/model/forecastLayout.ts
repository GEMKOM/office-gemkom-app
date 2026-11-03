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
 * those from progress alone produces nonsense: 061-60-02's ERK assignment is
 * blocked on boru/profil until 07.10, so the engine resumes it there and says
 * 23.11; extrapolating %10 across the waiting days said 23.02.2027 (user
 * 2026-09-22, "that doesn't make sense").
 *
 * A row the engine has no opinion on (a block that is not saved yet) is the
 * board's own to lay out.
 */
export function canRederiveForecast(forecastKind: string | null | undefined): boolean {
  return !forecastKind || forecastKind === 'rate';
}

/**
 * How much work a started row has LEFT, in working days: the mirror of the
 * engine's `rate` path.
 *
 *     kalan = geçen × (100 − ilerleme) / ilerleme
 *
 * `elapsedWd` should be the engine's own `forecast_elapsed_wd` when it sent one;
 * that window carries the right anchor and has any closed material wait
 * already discounted off it. With no window to measure (the row starts today or
 * later) the entered duration's remaining share stands in for a tempo.
 *
 * `headStartPct` is the engine's `forecast_head_start_pct`: the % already done
 * when the window opened at full speed is a head start, and the tempo divides
 * only what was gained since.
 */
export function forecastRemainingWd(
  progressPct: number | null | undefined,
  elapsedWd: number | null | undefined,
  durationWd: number | null | undefined,
  headStartPct: number | null | undefined = 0,
): number {
  const p = Number(progressPct || 0);
  const elapsed = Number(elapsedWd || 0);
  const duration = Number(durationWd || 0);
  const gained = p - Number(headStartPct || 0);
  const left = Math.max(100 - p, 0);
  // A row with no progress is not measurable; callers handle that branch.
  const remaining = gained > 0 && elapsed > 0 ? (elapsed * left) / gained : (duration * left) / 100;
  // A window is never zero-length, mirroring the engine's MIN_SPAN_WD.
  return Math.max(remaining, 0.1);
}

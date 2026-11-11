import type { LeaderboardRow } from '@/api/quiz';
import { formatNumber } from '@/lib/format';
import css from './quiz.module.css';

/** Ranked names with scores; the signed-in user's row is tinted. */
export function RankList({
  rows,
  me,
  showDays = false,
  label,
}: {
  rows: LeaderboardRow[];
  /** Shown under a gap when the user is not among `rows`. */
  me?: LeaderboardRow | null;
  showDays?: boolean;
  label: string;
}) {
  const meBelow = me && !rows.some((row) => row.is_me);
  return (
    <ol className={css.rankList} aria-label={label}>
      {rows.map((row) => (
        <Row key={row.user_id} row={row} showDays={showDays} />
      ))}
      {meBelow ? (
        <>
          <li className={css.rankGap} aria-hidden>
            ⋯
          </li>
          <Row row={me} showDays={showDays} />
        </>
      ) : null}
    </ol>
  );
}

function Row({ row, showDays }: { row: LeaderboardRow; showDays: boolean }) {
  return (
    <li className={css.rankRow} data-me={row.is_me || undefined}>
      <span
        className={css.rankBadge}
        data-medal={row.rank <= 3 ? row.rank : undefined}
        aria-label={`${row.rank}. sıra`}
      >
        {row.rank}
      </span>
      <span className={css.rankName}>{row.is_me ? `${row.name} (siz)` : row.name}</span>
      {showDays ? <span className={css.footNote}>{row.days} gün</span> : null}
      <span className={css.rankScore}>{formatNumber(row.score)}</span>
    </li>
  );
}

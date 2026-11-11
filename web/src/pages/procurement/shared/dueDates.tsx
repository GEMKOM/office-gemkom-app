import { Text } from '@mantine/core';
import { formatDate } from '@/lib/format';

// Due dates on procurement lists: İhtiyaç tarihi (needed-by) and Beklenen
// teslim (expected delivery), counted in calendar days.

/** A YYYY-MM-DD or ISO date-time as a local calendar day. */
function localDay(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: Date = new Date()): number {
  const a = localDay(from).getTime();
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Days past a due date; 0 or less when it isn't past. */
export function daysLate(due: string | null | undefined, now: Date = new Date()): number {
  return due ? daysBetween(due, now) : 0;
}

/**
 * A due date, in red with "N gün gecikti" once it has passed and "Bugün" on
 * the day. `done` (e.g. already delivered) shows the plain date.
 */
export function DueDate({
  value,
  done = false,
  lateTitle,
}: {
  value: string | null | undefined;
  done?: boolean;
  lateTitle: string;
}) {
  if (!value) return <>-</>;
  const late = done ? -1 : daysBetween(value);
  return (
    <span title={late > 0 ? lateTitle : undefined}>
      <Text span size="sm" fw={late >= 0 ? 700 : undefined} c={late > 0 ? 'red' : undefined}>
        {formatDate(value)}
      </Text>
      {late > 0 ? (
        <Text size="xs" c="red">{`${late} gün gecikti`}</Text>
      ) : late === 0 ? (
        <Text size="xs" c="orange">
          Bugün
        </Text>
      ) : null}
    </span>
  );
}

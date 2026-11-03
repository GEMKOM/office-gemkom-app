import { Text } from '@mantine/core';
import { StatusBadge, type StatusFamily } from '@/ui';
import { fmt } from './reportModel';

const FAMILIES: readonly StatusFamily[] = ['green', 'blue', 'yellow', 'orange', 'red', 'purple', 'grey'];

/** "status-green" (the legacy badges.css class in the api/projects/estimator.ts labels) → "green". */
export function badgeFamily(badge: string | null | undefined): StatusFamily {
  const f = String(badge || '').replace('status-', '');
  return FAMILIES.find((x) => x === f) ?? 'grey';
}

/** One entry of a legacy label map ({label, badge, title?}) as a StatusBadge. */
export function LegacyBadge({
  entry,
  fallback,
  title,
}: {
  entry: { label: string; badge: string; title?: string } | undefined;
  fallback?: string;
  title?: string;
}) {
  const badge = (
    <StatusBadge color={badgeFamily(entry?.badge)}>{entry?.label ?? fallback ?? '—'}</StatusBadge>
  );
  const tip = title ?? entry?.title;
  return tip ? <span title={tip}>{badge}</span> : badge;
}

/** Weld-list confidence (0–1): < 0,4 orange, 0,4–0,5 grey, ≥ 0,5 green (legacy confidenceBadge). */
export function ConfidenceBadge({ value, title }: { value: number | string | null | undefined; title?: string }) {
  if (value == null || value === '') {
    return (
      <Text span c="dimmed" size="sm">
        —
      </Text>
    );
  }
  const v = Number(value);
  const color: StatusFamily = v < 0.4 ? 'orange' : v < 0.5 ? 'grey' : 'green';
  const badge = <StatusBadge color={color}>%{fmt(v * 100, 0)}</StatusBadge>;
  return title ? <span title={title}>{badge}</span> : badge;
}

// Cell renderers the planning item tables share (items.js / criticalItems.js).

import { toNumber } from '@/lib/format';
import { FaIcon, StatusBadge, type StatusFamily } from '@/ui';

/** renderBoolIcon: green check, red cross, '-' when unset. */
export function BoolIcon({ value, title }: { value: boolean | null | undefined; title?: string }) {
  if (value === true) {
    const label = title ?? 'Evet';
    return (
      <span role="img" aria-label={label} title={label}>
        <FaIcon icon="fas fa-check" color="var(--mantine-color-green-7)" />
      </span>
    );
  }
  if (value === false) {
    const label = title ?? 'Hayır';
    return (
      <span role="img" aria-label={label} title={label}>
        <FaIcon icon="fas fa-times" color="var(--mantine-color-red-7)" />
      </span>
    );
  }
  return <>-</>;
}

/** A value in a soft pill, '-' when empty (the request / job / PR number badges). */
export function ValueBadge({
  value,
  color,
  title,
}: {
  value: string | number | null | undefined;
  color: StatusFamily;
  title?: string;
}) {
  if (!value) return <>-</>;
  return (
    <span title={title}>
      <StatusBadge color={color}>{value}</StatusBadge>
    </span>
  );
}

/** `v ?? '-'`: the raw value as the API sent it. */
export function raw(value: string | number | null | undefined): string | number {
  return value ?? '-';
}

/** `v || '-'` */
export function textOrDash(value: string | null | undefined): string {
  return value || '-';
}

const EUR = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'EUR' });

/** renderEuro: "€1.234,56", '-' when empty or not a number. */
export function formatEuro(value: string | number | null | undefined): string {
  const n = toNumber(value);
  return n === null ? '-' : EUR.format(n);
}

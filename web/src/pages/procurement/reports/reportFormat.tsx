import { Group, Text } from '@mantine/core';
import { formatDate, formatNumber, toDate, toNumber } from '@/lib/format';
import { StatusBadge } from '@/ui';

// Formatting shared by the procurement list reports (Ürün, Tedarikçi, Personel).

/** Legacy toLocaleString('tr-TR', { minimumFractionDigits: 2 }). */
const MIN_TWO: Intl.NumberFormatOptions = { minimumFractionDigits: 2 };

export function amount(value: unknown): string {
  return formatNumber(value as number | string | null, MIN_TWO);
}

export function euro(value: unknown): string {
  const text = amount(value);
  return text === '-' ? text : `${text} €`;
}

/** Number for the Excel sheet (legacy CSV wrote the raw value, 0 when empty). */
export function exportNumber(value: unknown): number {
  return toNumber(value as number | string | null) ?? 0;
}

export const REPORT_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
};

export function reportDate(value: unknown) {
  if (!value) {
    return (
      <Text size="sm" c="dimmed">
        -
      </Text>
    );
  }
  return (
    <Text size="xs" c="dimmed">
      {formatDate(value as string, REPORT_DATE_FORMAT)}
    </Text>
  );
}

export function exportDate(value: unknown): Date | null {
  return value ? toDate(value as string) : null;
}

/** The light count/unit badges legacy rendered with `badge bg-light text-dark border`. */
export function chips(values: string[]) {
  if (values.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        -
      </Text>
    );
  }
  return (
    <Group gap={4}>
      {values.map((value, i) => (
        <StatusBadge key={`${value}-${i}`} color="grey">
          {value}
        </StatusBadge>
      ))}
    </Group>
  );
}

/** Today as YYYY-MM-DD, the legacy export file suffix. */
export function today(): string {
  return new Date().toISOString().split('T')[0]!;
}

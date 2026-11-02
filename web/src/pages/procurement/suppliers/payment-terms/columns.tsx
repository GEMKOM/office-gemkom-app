import { Stack, Text } from '@mantine/core';
import { isApiError } from '@/api/client';
import type { BasisChoice, PaymentTerm, PaymentTermLine } from '@/api/procurement/paymentTerms';
import { formatDate } from '@/lib/format';
import { StatusBadge, type DataTableColumn } from '@/ui';
import uiClasses from '@/ui/ui.module.css';

/**
 * The message the legacy apis/procurement.js functions threw: the body's
 * `error`, else their fixed fallback (network errors keep their own message).
 */
export function legacyApiMessage(error: unknown, fallback: string): string {
  if (isApiError(error)) {
    const body = error.data as { error?: unknown } | undefined;
    return body && typeof body === 'object' && typeof body.error === 'string' && body.error
      ? body.error
      : fallback;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Legacy getBasisText: the choice label, else the raw value. */
export function basisLabel(choices: readonly BasisChoice[], basis: string): string {
  return choices.find((choice) => choice.value === basis)?.label ?? basis;
}

function PaymentDetails({
  lines,
  choices,
}: {
  lines: PaymentTermLine[] | null | undefined;
  choices: readonly BasisChoice[];
}) {
  if (!lines || lines.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Özel
      </Text>
    );
  }
  return (
    <Stack gap={2}>
      {lines.map((line, index) => (
        <Text key={index} size="xs">
          <Text span size="xs" fw={600}>
            {line.label}
          </Text>{' '}
          {line.percentage}%{' '}
          <Text span size="xs" c="dimmed">
            ({basisLabel(choices, line.basis)})
          </Text>
        </Text>
      ))}
    </Stack>
  );
}

// Legacy formatDate: short month with the time.
const CREATED_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

/** Sortable set = legacy table headers. Rebuild only when the basis choices change. */
export function paymentTermColumns(
  choices: readonly BasisChoice[],
): DataTableColumn<PaymentTerm>[] {
  return [
    {
      key: 'id',
      header: 'ID',
      sortable: true,
      render: (row) => <span className={uiClasses.code}>{row.id}</span>,
    },
    {
      key: 'name',
      header: 'Ödeme Koşulu Adı',
      sortable: true,
      render: (row) => (
        <Text size="sm" fw={600}>
          {row.name || 'İsimsiz'}
        </Text>
      ),
    },
    {
      key: 'is_custom',
      header: 'Tür',
      sortable: true,
      align: 'center',
      render: (row) =>
        row.is_custom ? (
          <StatusBadge color="yellow">Özel</StatusBadge>
        ) : (
          <StatusBadge color="blue">Standart</StatusBadge>
        ),
    },
    {
      key: 'default_lines',
      header: 'Ödeme Detayları',
      sortable: false,
      render: (row) => <PaymentDetails lines={row.default_lines} choices={choices} />,
    },
    {
      key: 'active',
      header: 'Durum',
      sortable: true,
      align: 'center',
      render: (row) =>
        row.active ? (
          <StatusBadge color="green">Aktif</StatusBadge>
        ) : (
          <StatusBadge color="grey">Pasif</StatusBadge>
        ),
    },
    {
      key: 'created_at',
      header: 'Oluşturulma',
      sortable: true,
      render: (row) => formatDate(row.created_at, CREATED_FORMAT),
    },
  ];
}

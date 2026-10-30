import { Alert, Stack, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import type { ReactNode } from 'react';

export interface ConfirmOptions {
  /** Default 'Onay'. */
  title?: ReactNode;
  /** Default 'Bu işlemi yapmak istediğinize emin misiniz?'. */
  message?: ReactNode;
  /** Smaller grey text under the message. */
  description?: ReactNode;
  /** Highlighted box under the message (legacy `details`). */
  details?: ReactNode;
  /** Default 'Evet'. */
  confirmLabel?: ReactNode;
  /** Default 'İptal'. */
  cancelLabel?: ReactNode;
  /** Red confirm button, for deletes and other destructive actions. */
  danger?: boolean;
}

/**
 * Replaces ConfirmationModal. Resolves true on confirm, false on cancel or
 * close. Needs the ModalsProvider from app/Providers.
 *
 *   if (!(await confirm({ message: 'Kayıt silinsin mi?', danger: true }))) return;
 */
export function confirm(options: ConfirmOptions | string = {}): Promise<boolean> {
  const opts = typeof options === 'string' ? { message: options } : options;
  const {
    title = 'Onay',
    message = 'Bu işlemi yapmak istediğinize emin misiniz?',
    description,
    details,
    confirmLabel = 'Evet',
    cancelLabel = 'İptal',
    danger = false,
  } = opts;

  return new Promise<boolean>((resolve) => {
    // onConfirm is followed by onClose; only the first answer counts.
    let settled = false;
    const settle = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    modals.openConfirmModal({
      title: (
        <Text fw={600}>
          <i
            className={danger ? 'fas fa-exclamation-triangle' : 'fas fa-question-circle'}
            style={{ marginRight: 8, color: danger ? 'var(--mantine-color-red-6)' : undefined }}
            aria-hidden
          />
          {title}
        </Text>
      ),
      centered: true,
      children: (
        <Stack gap="xs">
          {typeof message === 'string' ? <Text>{message}</Text> : message}
          {description ? (
            <Text size="sm" c="dimmed">
              {description}
            </Text>
          ) : null}
          {details ? (
            <Alert color={danger ? 'red' : 'blue'} variant="light">
              {details}
            </Alert>
          ) : null}
        </Stack>
      ),
      labels: { confirm: confirmLabel, cancel: cancelLabel },
      confirmProps: danger ? { color: 'red' } : {},
      onConfirm: () => settle(true),
      onCancel: () => settle(false),
      onClose: () => settle(false),
    });
  });
}

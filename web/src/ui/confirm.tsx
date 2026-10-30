import { Button, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import type { ReactNode } from 'react';
import { FaIcon } from './FaIcon';
import classes from './Modal.module.css';
import { ModalBody, ModalFooter, ModalHeader, modalClassNames } from './ModalParts';

export interface ConfirmOptions {
  /** Default 'Onay'. */
  title?: ReactNode;
  /** One line under the title, e.g. 'Bu işlem geri alınamaz'. */
  subtitle?: ReactNode;
  /**
   * Font Awesome classes for the header tile (and the confirm button when
   * `danger`). Default a question mark, or a warning when `danger`.
   */
  icon?: string;
  /** Default 'Bu işlemi yapmak istediğinize emin misiniz?'. */
  message?: ReactNode;
  /** Smaller grey text under the message. */
  description?: ReactNode;
  /** Boxed under the message, e.g. the record a delete affects (legacy `details`). */
  details?: ReactNode;
  /** Default 'Evet'. */
  confirmLabel?: ReactNode;
  /** Default 'İptal'. */
  cancelLabel?: ReactNode;
  /** Danger tile and a red confirm button, for deletes and other destructive actions. */
  danger?: boolean;
}

let lastId = 0;

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
    subtitle,
    message = 'Bu işlemi yapmak istediğinize emin misiniz?',
    description,
    details,
    confirmLabel = 'Evet',
    cancelLabel = 'İptal',
    danger = false,
  } = opts;
  const icon = opts.icon ?? (danger ? 'fas fa-exclamation-triangle' : 'fas fa-question-circle');

  return new Promise<boolean>((resolve) => {
    // Answering closes the modal, which calls onClose; only the first answer counts.
    let settled = false;
    const settle = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const modalId = `gk-confirm-${++lastId}`;
    const answer = (value: boolean) => {
      settle(value);
      modals.close(modalId);
    };

    modals.open({
      modalId,
      centered: true,
      size: 460,
      withCloseButton: false,
      classNames: modalClassNames,
      onClose: () => settle(false),
      children: (
        <>
          <ModalHeader
            tone={danger ? 'danger' : 'neutral'}
            icon={icon}
            title={title}
            subtitle={subtitle}
          />
          <ModalBody>
            {typeof message === 'string' ? <p className={classes.message}>{message}</p> : message}
            {description ? <Text className={classes.description}>{description}</Text> : null}
            {details ? <div className={classes.record}>{details}</div> : null}
          </ModalBody>
          <ModalFooter>
            <Button variant="default" onClick={() => answer(false)}>
              {cancelLabel}
            </Button>
            <Button
              color={danger ? 'red.9' : undefined}
              leftSection={danger && opts.icon ? <FaIcon icon={opts.icon} /> : undefined}
              onClick={() => answer(true)}
            >
              {confirmLabel}
            </Button>
          </ModalFooter>
        </>
      ),
    });
  });
}

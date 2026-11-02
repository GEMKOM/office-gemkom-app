import { Modal } from '@mantine/core';
import type { ReactNode } from 'react';
import { FaIcon } from './FaIcon';
import classes from './Modal.module.css';

/**
 * Pass to a Modal that lays itself out with ModalHeader / ModalBody /
 * ModalFooter (and withCloseButton={false}): the parts pad themselves.
 */
export const modalClassNames = { body: classes.body };

/** 'brand': the red strip (forms, details). 'neutral' / 'danger': white, for confirms. */
export type ModalTone = 'brand' | 'neutral' | 'danger';

export interface ModalHeaderProps {
  title: ReactNode;
  /** One line under the title: what the dialog is for, or which record. */
  subtitle?: ReactNode;
  /** Font Awesome classes, shown in a tile before the title. */
  icon?: string;
  /** Default 'brand'. */
  tone?: ModalTone;
  /** Default true. Closes through the Modal's onClose. */
  withCloseButton?: boolean;
}

/**
 * The header every modal shares: icon tile, title, subtitle, close button.
 * Render it first inside a Modal; the title names the dialog for screen readers.
 */
export function ModalHeader({ title, subtitle, icon, tone = 'brand', withCloseButton = true }: ModalHeaderProps) {
  return (
    <div className={classes.header} data-tone={tone}>
      {icon ? (
        <span className={classes.tile}>
          <FaIcon icon={icon} />
        </span>
      ) : null}
      <div className={classes.heading}>
        <Modal.Title className={classes.title}>{title}</Modal.Title>
        {subtitle ? <p className={classes.subtitle}>{subtitle}</p> : null}
      </div>
      {withCloseButton ? <Modal.CloseButton className={classes.close} aria-label="Kapat" /> : null}
    </div>
  );
}

/** The padded area between header and footer. */
export function ModalBody({ children }: { children: ReactNode }) {
  return <div className={classes.main}>{children}</div>;
}

export interface ModalSectionProps {
  title?: ReactNode;
  /** Font Awesome classes, muted, before the title. */
  icon?: string;
  description?: ReactNode;
  children?: ReactNode;
}

/** A titled group of fields: the title runs into a hairline. */
export function ModalSection({ title, icon, description, children }: ModalSectionProps) {
  return (
    <section className={classes.section}>
      {title ? (
        <h3 className={classes.sectionTitle}>
          {icon ? <FaIcon icon={icon} className={classes.sectionIcon} /> : null}
          {title}
        </h3>
      ) : null}
      {description ? <p className={classes.sectionDescription}>{description}</p> : null}
      {children}
    </section>
  );
}

/** Sticky action bar; put the primary button last so it sits on the right. */
export function ModalFooter({ children }: { children: ReactNode }) {
  return <div className={classes.footer}>{children}</div>;
}

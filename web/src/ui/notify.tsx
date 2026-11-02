import { notifications } from '@mantine/notifications';
import type { ReactNode } from 'react';

export type NotifyType = 'success' | 'error' | 'info' | 'warning';

export interface NotifyOptions {
  title?: ReactNode;
  /** Milliseconds, or false to keep it until closed. Legacy default: 5000. */
  autoClose?: number | false;
  id?: string;
}

const STYLE: Record<NotifyType, { color: string; icon: string }> = {
  success: { color: 'green', icon: 'fas fa-check' },
  error: { color: 'red', icon: 'fas fa-times' },
  info: { color: 'blue', icon: 'fas fa-info' },
  warning: { color: 'yellow', icon: 'fas fa-exclamation' },
};

/** The text to show for a caught error: its `.message`, or the fallback. */
export function errorMessage(error: unknown, fallback = 'Bir hata oluştu'): string {
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const { message } = error as { message: unknown };
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

function show(type: NotifyType, message: ReactNode, options: NotifyOptions = {}): string {
  const { color, icon } = STYLE[type];
  return notifications.show({
    id: options.id,
    title: options.title,
    message,
    color,
    icon: <i className={icon} aria-hidden />,
    autoClose: options.autoClose ?? 5000,
  });
}

/**
 * Replaces the legacy `showNotification(message, type)`.
 *
 *   notify.success('Kaydedildi');
 *   catch (e) { notify.error(e); }            // uses e.message
 *   notify.error(e, { fallback: 'Silinemedi' })
 */
export const notify = {
  show: (message: ReactNode, type: NotifyType = 'info', options?: NotifyOptions) =>
    show(type, message, options),
  success: (message: ReactNode, options?: NotifyOptions) => show('success', message, options),
  info: (message: ReactNode, options?: NotifyOptions) => show('info', message, options),
  warning: (message: ReactNode, options?: NotifyOptions) => show('warning', message, options),
  /** Accepts a message or anything caught; non-strings show their `.message`. */
  error: (error: unknown, options: NotifyOptions & { fallback?: string } = {}) => {
    const message =
      typeof error === 'string' || isReactElementLike(error)
        ? (error as ReactNode)
        : errorMessage(error, options.fallback);
    return show('error', message, options);
  },
  hide: (id: string) => notifications.hide(id),
  clean: () => notifications.clean(),
};

function isReactElementLike(value: unknown): boolean {
  return typeof value === 'object' && value !== null && '$$typeof' in value;
}

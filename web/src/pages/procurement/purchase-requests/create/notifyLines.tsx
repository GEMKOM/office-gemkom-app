import { notify, type NotifyOptions } from '@/ui';

/** Legacy messages with \n line breaks (validation lists, merge summaries). */
export function lines(text: string) {
  return <span style={{ whiteSpace: 'pre-line' }}>{text}</span>;
}

export const notifyLines = {
  error: (text: string, options?: NotifyOptions) => notify.error(lines(text), options),
  warning: (text: string, options?: NotifyOptions) => notify.warning(lines(text), options),
  success: (text: string, options?: NotifyOptions) => notify.success(lines(text), options),
};

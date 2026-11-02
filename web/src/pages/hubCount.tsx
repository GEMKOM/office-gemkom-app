import { formatNumber } from '@/lib/format';
import { PendingValue, type PageFigure } from '@/ui';

/** A live count on a hub, as a query hands it over. */
export interface CountQuery {
  data: number | undefined;
  isError: boolean;
}

/**
 * The count as a card shows it: '-' when the request failed, undefined while
 * it loads (the card draws its placeholder bar).
 */
export function countValue(query: CountQuery): string | undefined {
  if (query.isError) return '-';
  return query.data === undefined ? undefined : formatNumber(query.data);
}

/** A band tile for a count; a placeholder bar while it loads. */
export function countFigure(figure: Omit<PageFigure, 'value'>, query: CountQuery): PageFigure {
  return { ...figure, value: countValue(query) ?? <PendingValue /> };
}

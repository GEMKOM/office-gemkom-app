import { isApiError } from '../client';

/**
 * Port of readErrorMessage in apis/warehouse/pullRequests.js: `detail` /
 * `error` first, else every field message joined with ', ' (row errors under
 * `items` become "Kalem N: …"), else the fallback. The planning item
 * endpoints read detail / error only, which this covers too.
 *
 * `fallback` is the API function's own message for an HTTP error;
 * `otherFallback` is what the page showed for anything else (network errors).
 */
export function materialTrackingErrorMessage(
  error: unknown,
  fallback: string,
  otherFallback = fallback,
): string {
  if (!isApiError(error)) return otherFallback;
  const payload = error.data;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return fallback;
  const body = payload as Record<string, unknown>;
  const detail = body.detail || body.error;
  if (detail) return Array.isArray(detail) ? detail.join(', ') : String(detail);

  const messages: string[] = [];
  for (const [key, value] of Object.entries(body)) {
    if (key === 'items' && Array.isArray(value)) {
      value.forEach((rowErrors: unknown, index) => {
        if (!rowErrors || typeof rowErrors !== 'object') return;
        Object.values(rowErrors as Record<string, unknown>)
          .flat()
          .forEach((msg) => {
            if (typeof msg === 'string') messages.push(`Kalem ${index + 1}: ${msg}`);
          });
      });
    } else {
      ([] as unknown[]).concat(value).forEach((msg) => {
        if (typeof msg === 'string') messages.push(msg);
      });
    }
  }
  return messages.length > 0 ? messages.join(', ') : fallback;
}

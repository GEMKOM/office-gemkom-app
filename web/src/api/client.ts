import { authedFetch } from '@legacy/authService.js';
import { backendBase } from '@legacy/base.js';

export type QueryParamValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryParamValue | readonly QueryParamValue[]>;

export interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  params?: QueryParams;
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

/** A non-OK response. `data` is the parsed body (JSON, text, or undefined). */
export class ApiError extends Error {
  readonly status: number;
  readonly data: unknown;

  constructor(status: number, data: unknown, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** Drops null, undefined and '' so callers can pass filter state as-is. */
export function cleanParams(params: QueryParams = {}): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      const kept = value.filter(isPresent).map(String);
      if (kept.length) out[key] = kept;
    } else if (isPresent(value as QueryParamValue)) {
      out[key] = String(value);
    }
  }
  return out;
}

function isPresent(value: QueryParamValue): value is string | number | boolean {
  return value !== null && value !== undefined && value !== '';
}

export function buildUrl(path: string, params?: QueryParams): string {
  const base = /^https?:\/\//i.test(path) ? path : `${backendBase}${path}`;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(cleanParams(params))) {
    for (const v of Array.isArray(value) ? value : [value]) search.append(key, v);
  }
  const qs = search.toString();
  if (!qs) return base;
  return `${base}${base.includes('?') ? '&' : '?'}${qs}`;
}

/** First string inside a DRF error value: 'msg', ['msg'], [{qty: ['msg']}]. */
function firstString(value: unknown): string | null {
  if (typeof value === 'string') return value || null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstString(item);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) {
      const found = firstString(item);
      if (found) return found;
    }
  }
  return null;
}

/** detail → error → message → non_field_errors / first field error → HTTP <status>. */
export function errorMessage(status: number, data: unknown): string {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const body = data as Record<string, unknown>;
    for (const key of ['detail', 'error', 'message']) {
      const found = firstString(body[key]);
      if (found) return found;
    }
    const nonField = firstString(body.non_field_errors);
    if (nonField) return nonField;
    for (const [field, value] of Object.entries(body)) {
      const found = firstString(value);
      if (found) return `${field}: ${found}`;
    }
  } else if (Array.isArray(data)) {
    // DRF ValidationError raised with a list: ['msg']
    const found = firstString(data);
    if (found) return found;
  }
  return `HTTP ${status}`;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/**
 * Fetch from the backend through the legacy session (Bearer token, X-Subdomain,
 * one refresh on 401). Throws ApiError on non-OK; AbortError and network
 * errors propagate untouched.
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { method = 'GET', params, body, signal, headers = {} } = options;
  const init: RequestInit = { method, signal, headers: { ...headers } };

  if (body !== undefined) {
    if (body instanceof FormData) {
      // The browser must set the multipart boundary itself.
      init.body = body;
    } else {
      init.body = JSON.stringify(body);
      init.headers = { 'Content-Type': 'application/json', ...headers };
    }
  }

  const response = await authedFetch(buildUrl(path, params), init);
  const data = response.status === 204 ? undefined : await readBody(response);

  if (!response.ok) {
    throw new ApiError(response.status, data, errorMessage(response.status, data));
  }
  return data as T;
}

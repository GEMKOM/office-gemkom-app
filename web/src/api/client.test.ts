import { authedFetch } from '@legacy/authService.js';
import { apiFetch, ApiError, apiUpload, isApiError } from './client';
import { shouldRetry } from './queryClient';
import { extractResults, toPaginated } from './types';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function lastCall() {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) throw new Error('authedFetch was not called');
  const [url, init = {}] = call;
  return { url, init, headers: (init.headers ?? {}) as Record<string, string> };
}

async function errorOf(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (isApiError(error)) return error;
    throw error;
  }
  throw new Error('expected apiFetch to throw');
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('apiFetch URL and params', () => {
  it('prefixes backendBase and passes absolute URLs through', async () => {
    // A Response body can be read once, so build a fresh one per call.
    fetchMock.mockImplementation(() => Promise.resolve(json(200, {})));
    await apiFetch('/users/');
    expect(lastCall().url).toBe('https://api.test/users/');

    await apiFetch('https://other.test/x/');
    expect(lastCall().url).toBe('https://other.test/x/');
  });

  it('skips empty params and repeats array keys', async () => {
    fetchMock.mockResolvedValue(json(200, []));
    await apiFetch('/users/', {
      params: {
        a: 'x',
        empty: '',
        nil: null,
        undef: undefined,
        zero: 0,
        no: false,
        ids: [1, 2, null, ''],
        none: [],
      },
    });
    const url = new URL(lastCall().url);
    expect(url.searchParams.get('a')).toBe('x');
    expect(url.searchParams.get('zero')).toBe('0');
    expect(url.searchParams.get('no')).toBe('false');
    expect(url.searchParams.getAll('ids')).toEqual(['1', '2']);
    for (const key of ['empty', 'nil', 'undef', 'none'])
      expect(url.searchParams.has(key)).toBe(false);
  });

  it('appends to a URL that already has a query string', async () => {
    fetchMock.mockResolvedValue(json(200, {}));
    await apiFetch('/x/?a=1', { params: { b: 2 } });
    expect(lastCall().url).toBe('https://api.test/x/?a=1&b=2');
  });
});

describe('apiFetch body', () => {
  it('JSON-stringifies plain bodies', async () => {
    fetchMock.mockResolvedValue(json(201, { id: 1 }));
    const result = await apiFetch<{ id: number }>('/x/', { method: 'POST', body: { name: 'a' } });
    const { init, headers } = lastCall();
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"name":"a"}');
    expect(headers['Content-Type']).toBe('application/json');
    expect(result).toEqual({ id: 1 });
  });

  it('sends FormData untouched without a Content-Type', async () => {
    fetchMock.mockResolvedValue(json(200, {}));
    const form = new FormData();
    form.append('file', 'abc');
    await apiFetch('/upload/', { method: 'POST', body: form, headers: { 'X-Extra': '1' } });
    const { init, headers } = lastCall();
    expect(init.body).toBe(form);
    expect(headers['Content-Type']).toBeUndefined();
    expect(headers['X-Extra']).toBe('1');
  });

  it('passes the abort signal to authedFetch', async () => {
    fetchMock.mockResolvedValue(json(200, {}));
    const controller = new AbortController();
    await apiFetch('/x/', { signal: controller.signal });
    expect(lastCall().init.signal).toBe(controller.signal);
  });
});

describe('apiFetch empty responses', () => {
  it('returns undefined for 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(apiFetch('/x/', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('returns undefined for an empty 200 body', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 200 }));
    await expect(apiFetch('/x/')).resolves.toBeUndefined();
  });
});

describe('apiFetch errors', () => {
  it.each([
    ['detail', 403, { detail: 'Yetkiniz yok.' }, 'Yetkiniz yok.'],
    ['error', 400, { error: 'Geçersiz istek' }, 'Geçersiz istek'],
    ['message', 400, { message: 'Bir hata oluştu' }, 'Bir hata oluştu'],
    ['detail before error and message', 400, { message: 'm', error: 'e', detail: 'd' }, 'd'],
    ['error before message', 400, { message: 'm', error: 'e' }, 'e'],
    ['non_field_errors', 400, { non_field_errors: ['Zaten var.'] }, 'Zaten var.'],
    ['non_field_errors before fields', 400, { name: ['x'], non_field_errors: ['nf'] }, 'nf'],
    [
      'first field error',
      400,
      { name: ['Bu alan zorunludur.'], code: ['y'] },
      'name: Bu alan zorunludur.',
    ],
    ['nested field error', 400, { items: [{ qty: ['Pozitif olmalı'] }] }, 'items: Pozitif olmalı'],
    ['bare list', 400, ['Liste hatası'], 'Liste hatası'],
    ['empty JSON', 500, {}, 'HTTP 500'],
  ])('uses %s', async (_case, status, body, message) => {
    fetchMock.mockResolvedValue(json(status, body));
    const error = await errorOf(apiFetch('/x/'));
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(status);
    expect(error.data).toEqual(body);
    expect(error.message).toBe(message);
  });

  it('falls back to HTTP <status> for a non-JSON body', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad Gateway</html>', { status: 502 }));
    const error = await errorOf(apiFetch('/x/'));
    expect(error.message).toBe('HTTP 502');
    expect(error.data).toBe('<html>Bad Gateway</html>');
  });

  it('falls back to HTTP <status> for an empty error body', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
    const error = await errorOf(apiFetch('/x/'));
    expect(error.message).toBe('HTTP 404');
    expect(error.data).toBeUndefined();
  });

  it('lets AbortError propagate untouched', async () => {
    const abort = new DOMException('The operation was aborted.', 'AbortError');
    fetchMock.mockRejectedValue(abort);
    const caught = await apiFetch('/x/').catch((error: unknown) => error);
    expect(caught).toBe(abort);
    expect(isApiError(caught)).toBe(false);
  });

  it('isApiError rejects other values', () => {
    expect(isApiError(new Error('x'))).toBe(false);
    expect(isApiError({ status: 400, message: 'x' })).toBe(false);
    expect(isApiError(new ApiError(400, null, 'x'))).toBe(true);
  });
});

describe('shouldRetry', () => {
  it('retries once, never for 4xx', () => {
    expect(shouldRetry(0, new ApiError(500, null, 'x'))).toBe(true);
    expect(shouldRetry(0, new TypeError('Failed to fetch'))).toBe(true);
    expect(shouldRetry(1, new ApiError(500, null, 'x'))).toBe(false);
    expect(shouldRetry(0, new ApiError(404, null, 'x'))).toBe(false);
    expect(shouldRetry(0, new ApiError(400, null, 'x'))).toBe(false);
  });
});

describe('pagination helpers', () => {
  it('extractResults handles the legacy shapes', () => {
    expect(extractResults([1, 2])).toEqual([1, 2]);
    expect(extractResults({ count: 1, results: [1] })).toEqual([1]);
    expect(extractResults({ data: [1] })).toEqual([1]);
    expect(extractResults({ items: [1] })).toEqual([1]);
    expect(extractResults({ list: [1] })).toEqual([1]);
    expect(extractResults({ total: 3, rows: [1] })).toEqual([1]);
    expect(extractResults({ a: 1 })).toEqual([]);
    expect(extractResults(null)).toEqual([]);
    expect(extractResults('x')).toEqual([]);
  });

  it('toPaginated wraps bare arrays', () => {
    expect(toPaginated([1, 2])).toEqual({ count: 2, next: null, previous: null, results: [1, 2] });
    const page = { count: 10, next: 'n', previous: null, results: [1] };
    expect(toPaginated(page)).toEqual(page);
  });
});

describe('apiUpload', () => {
  type Listener =
    ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null;
  const sent: { method: string; url: string; headers: Record<string, string>; body: unknown }[] =
    [];
  let respond: { status: number; body: string } = { status: 201, body: '{"id":5}' };

  class FakeXhr {
    status = 0;
    responseText = '';
    upload: { onprogress: Listener } = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    private request = {
      method: '',
      url: '',
      headers: {} as Record<string, string>,
      body: undefined as unknown,
    };
    open(method: string, url: string) {
      this.request.method = method;
      this.request.url = url;
    }
    setRequestHeader(name: string, value: string) {
      this.request.headers[name] = value;
    }
    send(body: unknown) {
      this.request.body = body;
      sent.push(this.request);
      this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
      this.status = respond.status;
      this.responseText = respond.body;
      this.onload?.();
    }
    abort() {
      this.onabort?.();
    }
  }

  beforeEach(() => {
    sent.length = 0;
    respond = { status: 201, body: '{"id":5}' };
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    localStorage.setItem('accessToken', 'token-1');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.removeItem('accessToken');
  });

  it('posts the form with the session headers and reports progress', async () => {
    const progress: number[] = [];
    const form = new FormData();
    form.append('file', new Blob(['x']), 'a.txt');
    const data = await apiUpload<{ id: number }>('/isg/issues/1/files/upload/', form, {
      onProgress: (fraction) => progress.push(fraction),
    });
    expect(data).toEqual({ id: 5 });
    expect(sent[0]).toMatchObject({
      method: 'POST',
      url: 'https://api.test/isg/issues/1/files/upload/',
      headers: { Authorization: 'Bearer token-1', 'X-Subdomain': 'ofis.gemcore.com.tr' },
    });
    expect(sent[0]!.body).toBe(form);
    expect(progress).toEqual([0.5, 1]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws an ApiError with the server message', async () => {
    respond = { status: 400, body: '{"detail":"Dosya çok büyük"}' };
    const error = await errorOf(apiUpload('/x/', new FormData()));
    expect(error.status).toBe(400);
    expect(error.message).toBe('Dosya çok büyük');
  });

  it('goes through apiFetch (token refresh) on a 401', async () => {
    respond = { status: 401, body: '' };
    fetchMock.mockResolvedValueOnce(json(201, { id: 6 }));
    const form = new FormData();
    await expect(apiUpload('/x/', form)).resolves.toEqual({ id: 6 });
    expect(lastCall().init.body).toBe(form);
    expect(lastCall().init.method).toBe('POST');
  });

  it('without a token it uses apiFetch straight away', async () => {
    localStorage.removeItem('accessToken');
    fetchMock.mockResolvedValueOnce(json(201, { id: 7 }));
    await expect(apiUpload('/x/', new FormData())).resolves.toEqual({ id: 7 });
    expect(sent).toHaveLength(0);
  });
});

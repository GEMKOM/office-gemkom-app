import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function createLocalStorage(initial = {}) {
    const store = new Map(Object.entries(initial));
    return {
        getItem(key) {
            return store.has(key) ? store.get(key) : null;
        },
        setItem(key, value) {
            store.set(key, String(value));
        },
        removeItem(key) {
            store.delete(key);
        },
        clear() {
            store.clear();
        }
    };
}

function jsonResponse(body, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        async json() {
            return body;
        }
    };
}

async function importAuthService(localStorage) {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'auth-service-test-'));
    await writeFile(path.join(tempDir, 'package.json'), '{"type":"module"}\n');
    await writeFile(path.join(tempDir, 'base.js'), await readFile(new URL('../base.js', import.meta.url), 'utf8'));
    await writeFile(path.join(tempDir, 'authService.js'), await readFile(new URL('../authService.js', import.meta.url), 'utf8'));

    globalThis.localStorage = localStorage;
    globalThis.window = {
        location: {
            hostname: 'localhost',
            pathname: '/',
            href: ''
        }
    };
    globalThis.document = {
        body: {
            classList: {
                remove() {}
            }
        }
    };
    globalThis.FormData = class FormData {};

    return import(pathToFileURL(path.join(tempDir, 'authService.js')).href);
}

async function testLogoutClearsImpersonatorContext() {
    const storage = createLocalStorage({
        accessToken: 'impersonated-access',
        refreshToken: 'impersonated-refresh',
        user: '{"username":"impersonated"}',
        impersonatorAccessToken: 'admin-access',
        impersonatorRefreshToken: 'admin-refresh',
        impersonatorUser: '{"username":"admin"}'
    });
    const auth = await importAuthService(storage);

    assert.equal(auth.isImpersonating(), true);
    auth.logout();

    assert.equal(storage.getItem('accessToken'), null);
    assert.equal(storage.getItem('refreshToken'), null);
    assert.equal(storage.getItem('impersonatorAccessToken'), null);
    assert.equal(storage.getItem('impersonatorRefreshToken'), null);
    assert.equal(storage.getItem('impersonatorUser'), null);
}

async function testFreshLoginClearsStaleImpersonatorContext() {
    const storage = createLocalStorage({
        impersonatorAccessToken: 'stale-admin-access',
        impersonatorRefreshToken: 'stale-admin-refresh',
        impersonatorUser: '{"username":"old-admin"}'
    });
    const auth = await importAuthService(storage);

    globalThis.fetch = async (url) => {
        const endpoint = String(url);
        if (endpoint.endsWith('/token/')) {
            return jsonResponse({ access: 'new-access', refresh: 'new-refresh' });
        }
        if (endpoint.endsWith('/users/me/')) {
            return jsonResponse({ username: 'new-user' });
        }
        if (endpoint.endsWith('/users/me/permissions/')) {
            return jsonResponse({ office_access: true });
        }
        throw new Error(`Unexpected fetch URL: ${endpoint}`);
    };

    await auth.login('new-user', 'secret');

    assert.equal(storage.getItem('accessToken'), 'new-access');
    assert.equal(storage.getItem('refreshToken'), 'new-refresh');
    assert.equal(storage.getItem('impersonatorAccessToken'), null);
    assert.equal(storage.getItem('impersonatorRefreshToken'), null);
    assert.equal(storage.getItem('impersonatorUser'), null);
    assert.equal(auth.isImpersonating(), false);
}

await testLogoutClearsImpersonatorContext();
await testFreshLoginClearsStaleImpersonatorContext();

console.log('authService impersonation context regression tests passed');

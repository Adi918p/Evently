const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let api, token, unauthorizedCount;
const originalWindow = globalThis.window;
const originalFetch = globalThis.fetch;
before(async () => {
    globalThis.window = { localStorage: {
        getItem: () => token,
        setItem: (_key, value) => { token = value; },
        removeItem: () => { token = null; },
    } };
    api = await import(pathToFileURL(path.resolve(__dirname, '../client/src/lib/api.js')));
});
beforeEach(() => {
    globalThis.window.localStorage = {
        getItem: () => token,
        setItem: (_key, value) => { token = value; },
        removeItem: () => { token = null; },
    };
    api.setToken('initial-session');
    unauthorizedCount = 0;
    api.setUnauthorizedHandler(() => { unauthorizedCount++; });
});
after(() => {
    globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
    api.setUnauthorizedHandler(null);
});
function delayedResponse() {
    let resolve;
    const calls = [];
    globalThis.fetch = (url, options) => {
        calls.push({ url, options });
        return new Promise(done => { resolve = done; });
    };
    return {
        calls,
        rejectSession: () => resolve(new Response(JSON.stringify({ message: 'Expired fixture session' }), { status: 401 })),
    };
}
const isUnauthorized = error => error instanceof api.ApiError && error.status === 401;

test('a delayed old-session 401 rejects its caller without clearing the newer login', async () => {
    const response = delayedResponse();
    const pending = api.auth.me();
    assert.equal(response.calls[0].options.headers.Authorization, 'Bearer initial-session');
    api.setToken('new-session');
    response.rejectSession();
    await assert.rejects(pending, isUnauthorized);
    assert.equal(api.getToken(), 'new-session');
    assert.equal(unauthorizedCount, 0);
});

test('a 401 for the current session still clears authentication and rejects its caller', async () => {
    const response = delayedResponse();
    const pending = api.auth.me();
    response.rejectSession();
    await assert.rejects(pending, isUnauthorized);
    assert.equal(api.getToken(), null);
    assert.equal(unauthorizedCount, 1);
});

test('a rejected unauthenticated request cannot invalidate a signed-in session', async () => {
    const response = delayedResponse();
    const pending = api.request('/api/auth/login', { method: 'POST', body: {} });
    assert.equal(response.calls[0].options.headers.Authorization, undefined);
    response.rejectSession();
    await assert.rejects(pending, isUnauthorized);
    assert.equal(api.getToken(), 'initial-session');
    assert.equal(unauthorizedCount, 0);
});

test('a delayed PDF-download 401 also preserves a newer login', async () => {
    const response = delayedResponse();
    const pending = api.bookings.downloadTicket('fixture-id', 'fixture-ticket');
    api.setToken('new-session');
    response.rejectSession();
    await assert.rejects(pending, isUnauthorized);
    assert.equal(api.getToken(), 'new-session');
    assert.equal(unauthorizedCount, 0);
});

test('a PDF-download 401 for the current session still signs out', async () => {
    const response = delayedResponse();
    const pending = api.bookings.downloadTicket('fixture-id', 'fixture-ticket');
    response.rejectSession();
    await assert.rejects(pending, isUnauthorized);
    assert.equal(api.getToken(), null);
    assert.equal(unauthorizedCount, 1);
});

test('a storage write failure keeps the new session available to protected requests', async () => {
    window.localStorage.setItem = () => { throw new DOMException('Storage full', 'QuotaExceededError'); };
    api.setToken('memory-session');
    const response = delayedResponse();
    const pending = api.auth.me();
    assert.equal(response.calls[0]?.options.headers.Authorization, 'Bearer memory-session');
    response.rejectSession();
    await assert.rejects(pending, isUnauthorized);
    assert.equal(api.getToken(), null, 'an actual server rejection must also clear the memory fallback');
});

test('a transient storage read failure does not discard the last known session', async () => {
    window.localStorage.getItem = () => { throw new DOMException('Storage unavailable', 'SecurityError'); };
    assert.equal(api.getToken(), 'initial-session');
});

test('a blocked token replacement removes the older persisted login when removal is available', () => {
    window.localStorage.setItem = () => { throw new DOMException('Storage full', 'QuotaExceededError'); };
    api.setToken('replacement-session');
    assert.equal(token, null, 'a reload must not resurrect the previous account');
    assert.equal(api.getToken(), 'replacement-session', 'the current tab keeps the new login');
});

test('fully blocked token storage still permits a tab-local login and logout', () => {
    const unavailable = () => { throw new DOMException('Storage blocked', 'SecurityError'); };
    window.localStorage.getItem = unavailable;
    window.localStorage.setItem = unavailable;
    window.localStorage.removeItem = unavailable;
    assert.doesNotThrow(() => api.setToken('memory-session'));
    assert.equal(api.getToken(), 'memory-session');
    assert.doesNotThrow(() => api.clearToken());
    assert.equal(api.getToken(), null);
});

test('decoding an expired or malformed supplied token cannot clear a different active login', () => {
    const expired = 'header.' + Buffer.from(JSON.stringify({ id: 'old', exp: 1 })).toString('base64url') + '.signature';
    assert.equal(api.decodeToken(expired), null);
    assert.equal(api.getToken(), 'initial-session');
    assert.equal(api.decodeToken('header.not-json.signature'), null);
    assert.equal(api.getToken(), 'initial-session');
});

test('conditional token invalidation ignores a replaced session but clears the matching session', () => {
    api.setToken('new-session');
    const cleared = api.clearToken('initial-session');
    assert.equal(api.getToken(), 'new-session');
    assert.equal(cleared, false);
    assert.equal(api.clearToken('new-session'), true);
    assert.equal(api.getToken(), null);
});

test('temporary server and network failures never invalidate the session', async () => {
    for (const status of [403, 429, 500, 503]) {
        globalThis.fetch = async () => new Response(JSON.stringify({ message: 'Temporary fixture error' }), { status });
        await assert.rejects(api.auth.me(), error => error.status === status);
        assert.equal(api.getToken(), 'initial-session');
    }
    globalThis.fetch = async () => { throw new TypeError('Network failed'); };
    await assert.rejects(api.auth.me(), error => error.status === 0);
    assert.equal(api.getToken(), 'initial-session');
    assert.equal(unauthorizedCount, 0);
});

test('a failed storage removal cannot restore a signed-out token', () => {
    window.localStorage.removeItem = () => { throw new DOMException('Storage unavailable', 'SecurityError'); };
    api.clearToken();
    assert.equal(token, 'initial-session', 'the inaccessible persisted value still exists');
    assert.equal(api.getToken(), null, 'the current tab must remain signed out');
});

test('a cross-tab sign-out also clears a memory-only login', () => {
    window.localStorage.setItem = () => { throw new DOMException('Storage full', 'QuotaExceededError'); };
    api.setToken('memory-session');
    token = null; // The other tab removed the persisted token.
    assert.equal(api.syncTokenFromStorage(null), null);
    assert.equal(api.getToken(), null);
});

test('a current expired token is still removed', () => {
    const expired = 'header.' + Buffer.from(JSON.stringify({ id: 'old', exp: 1 })).toString('base64url') + '.signature';
    api.setToken(expired);
    assert.equal(api.decodeToken(), null);
    assert.equal(api.getToken(), null);
});

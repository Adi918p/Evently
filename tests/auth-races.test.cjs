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
    token = 'initial-session';
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

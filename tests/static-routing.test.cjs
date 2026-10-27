const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');

// HTTP-only regression: no MongoDB connection, provider, or real account.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'static-routing-fixture-only';
let server, base, index;
before(async () => {
    index = fs.readFileSync(path.join(__dirname, '../client/dist/index.html'), 'utf8');
    server = require('../server').app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
});

test('missing static resources return uncached 404 responses instead of the SPA shell', async () => {
    for (const url of ['/assets/missing.js', '/assets/missing-ABC12345.js', '/Media/missing.png', '/uploads/missing.webp', '/tickets/private.pdf', '/missing-icon.svg', '/missing-icon.SVG', '/missing.wasm', '/missing.JSON']) {
        for (const method of ['GET', 'HEAD']) {
            const response = await fetch(base + url, { method });
            assert.equal(response.status, 404, `${method} ${url}`);
            assert.match(response.headers.get('cache-control') || '', /no-store/, url);
            assert.doesNotMatch(response.headers.get('content-type') || '', /text\/html/, url);
            assert.doesNotMatch(await response.text(), /id="root"/, url);
        }
    }
});

test('existing hashed assets keep immutable caching and media keeps its content type', async () => {
    const assets = [...index.matchAll(/(?:src|href)="(\/assets\/[^\"]+\.(?:js|css))"/g)].map(match => match[1]);
    assert.ok(assets.length >= 2, 'build must contain script and stylesheet assets');
    for (const url of assets) {
        const response = await fetch(base + url);
        assert.equal(response.status, 200, url);
        assert.match(response.headers.get('cache-control'), /max-age=31536000.*immutable/);
        assert.match(response.headers.get('content-type'), url.endsWith('.js') ? /javascript/ : /text\/css/);
        await response.arrayBuffer();
    }
    const media = await fetch(base + '/Media/Png/logo.jpg');
    assert.equal(media.status, 200);
    assert.match(media.headers.get('content-type'), /^image\//);
    await media.arrayBuffer();
});

test('SPA deep links and legacy HTML routes still load the application', async () => {
    for (const url of ['/', '/events/000000000000000000000000', '/my-bookings', '/login.html']) {
        const response = await fetch(base + url);
        assert.equal(response.status, 200, url);
        assert.match(response.headers.get('content-type'), /text\/html/);
        assert.doesNotMatch(response.headers.get('cache-control') || '', /immutable/);
        assert.match(await response.text(), /id="root"/);
    }
});

test('Vercel asset-miss function overrides immutable headers for GET and HEAD', async () => {
    const { default: missingAsset } = await import(pathToFileURL(path.join(__dirname, '../client/api/static-not-found.js')));
    const edge = http.createServer((req, res) => {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        missingAsset(req, res);
    }).listen(0, '127.0.0.1');
    await new Promise(resolve => edge.once('listening', resolve));
    try {
        for (const method of ['GET', 'HEAD']) {
            const response = await fetch(`http://127.0.0.1:${edge.address().port}/assets/missing-HASH1234.js`, { method });
            assert.equal(response.status, 404);
            assert.equal(response.headers.get('cache-control'), 'no-store');
            assert.equal(response.headers.get('vercel-cdn-cache-control'), 'no-store');
            assert.match(response.headers.get('content-type'), /text\/plain/);
            assert.equal(await response.text(), method === 'HEAD' ? '' : 'Not found');
        }
    } finally {
        await new Promise(resolve => edge.close(resolve));
    }
});

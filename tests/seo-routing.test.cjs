const { test, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');

process.env.NODE_ENV = 'test';
process.env.SITE_URL = 'https://event-ly.in';
const database = require('../config/db');
const Event = require('../models/Events');
let ready = true, event = null, databaseError = false, lookups = [];
mock.method(database, 'isDatabaseReady', () => ready);
mock.method(Event, 'findOne', query => {
    lookups.push(query);
    return { lean: async () => {
        if (databaseError) throw new Error('isolated database failure');
        return event;
    } };
});
const seo = require('../routes/seo');
const eventId = '000000000000000000000001';
let server, base;
before(async () => {
    const app = express();
    app.get('/robots.txt', seo.robots, (_req, res) => res.type('text/plain').send(
        fs.readFileSync(path.join(__dirname, '../client/public/robots.txt'), 'utf8')));
    app.use('/seo/render', seo.render);
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    mock.restoreAll();
});
beforeEach(() => { ready = true; event = null; databaseError = false; lookups = []; });
async function render(route) {
    const response = await fetch(base + '/seo/render' + route, {
        headers: { 'User-Agent': 'Googlebot' }, redirect: 'manual',
    });
    return { response, html: await response.text() };
}
const assertNoIndex = html => assert.match(html, /<meta name="robots" content="noindex/);

test('crawler unknown nested and prefix-lookalike routes are genuine noindex 404s', async () => {
    for (const route of [
        `/events/${eventId}/not-a-real-route`, `/events/${eventId}/not-a-real-route/?q=test`,
        '/clubs/1/not-a-real-route', '/events/nonsense', '/clubs/999',
        `/events/${eventId}/cash/extra`, '/events/nonsense/cash',
        '/profile-other', '/admin/not-a-real-route', '/not-a-real-page',
    ]) {
        const { response, html } = await render(route);
        assert.equal(response.status, 404, route);
        assertNoIndex(html);
    }
    assert.equal(lookups.length, 0, 'unknown paths must not load event records');
});

test('all account/operator routes including the cash desk are noindex without event data', async () => {
    for (const route of [
        '/login', '/profile', '/my-bookings', '/booking/success', '/create-event',
        '/dashboard', '/scanner', '/admin', '/admin/events', '/admin/users',
        '/admin/inbox', '/admin/analytics', '/admin/experience', `/events/${eventId}/edit`,
        `/events/${eventId}/bookings`, `/events/${eventId}/cash`,
        `/events/${eventId}/cash/?q=test`,
    ]) {
        const { response, html } = await render(route);
        assert.equal(response.status, 200, route);
        assertNoIndex(html);
    }
    assert.equal(lookups.length, 0, 'operator pages must not query public event metadata');
});

test('fixed public pages and curated club metadata remain indexable', async () => {
    for (const route of ['/', '/events', '/clubs', '/experience', '/faq', '/contact', '/support', '/privacy', '/terms']) {
        const { response, html } = await render(route);
        assert.equal(response.status, 200, route);
        assert.match(html, /<meta name="robots" content="index, follow/);
    }
    const venue = await render('/clubs/1/');
    assert.equal(venue.response.status, 200);
    assert.match(venue.html, /Luna Club/);
    assert.match(venue.html, /<link rel="canonical" href="https:\/\/event-ly.in\/clubs\/1"/);
});

test('public event metadata and missing-event status remain distinct', async () => {
    event = { _id: eventId, title: 'SEO fixture', description: 'Fixture description',
        date: new Date('2099-01-01'), venue: 'Fixture venue', location: 'Ludhiana',
        price: 123, seats: 10, ticketsSold: 2, status: 'approved', gallery: [], lineup: [] };
    const found = await render(`/events/${eventId}`);
    assert.equal(found.response.status, 200);
    assert.match(found.html, /SEO fixture — Fixture venue, Ludhiana/);
    assert.match(found.html, /"@type":"Event"/);
    assert.match(found.html, /"price":123/);
    assert.match(found.html, /<meta name="robots" content="index, follow/);
    assert.deepEqual(lookups[0], { _id: eventId, archivedAt: null, status: { $in: ['approved', 'pending'] } });
    event = null;
    const missing = await render(`/events/${eventId}`);
    assert.equal(missing.response.status, 404);
    assertNoIndex(missing.html);
});

test('database outages remain retryable uncached 503s rather than missing pages', async () => {
    for (const scenario of ['not-ready', 'query-failure']) {
        ready = scenario !== 'not-ready';
        databaseError = scenario === 'query-failure';
        const { response, html } = await render(`/events/${eventId}`);
        assert.equal(response.status, 503, scenario);
        assert.equal(response.headers.get('Retry-After'), '300');
        assert.equal(response.headers.get('Cache-Control'), 'no-store');
        assertNoIndex(html);
    }
});

test('robots excludes the cash desk without blocking public events; legacy links still redirect', async () => {
    const publicRobots = await fetch(base + '/robots.txt', { headers: { 'X-Forwarded-Host': 'event-ly.in' } });
    const text = await publicRobots.text();
    assert.match(text, /^Disallow: \/events\/\*\/cash\s*$/m);
    assert.doesNotMatch(text, /^Disallow: \/events\/?\s*$/m);
    assert.match(text, /Sitemap: https:\/\/event-ly.in\/sitemap.xml/);
    const apiRobots = await fetch(base + '/robots.txt', { headers: { 'X-Forwarded-Host': 'api.event-ly.in' } });
    assert.match(await apiRobots.text(), /^Disallow: \/\s*$/m);
    const legacy = await render(`/event.html?id=${eventId}`);
    assert.equal(legacy.response.status, 301);
    assert.equal(legacy.response.headers.get('Location'), `https://event-ly.in/events/${eventId}`);
});

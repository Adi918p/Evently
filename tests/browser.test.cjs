const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const { chromium, expect } = require('@playwright/test');
process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'browser-tests-only';
process.env.RAZORPAY_KEY_ID = 'rzp_test_browser'; process.env.RAZORPAY_KEY_SECRET = 'browser-payment-secret';
process.env.MONGOMS_DOWNLOAD_DIR = path.resolve(__dirname, '../.cache/mongodb');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose'); const jwt = require('jsonwebtoken');
const User = require('../models/User'); const Event = require('../models/Events');
const Booking = require('../models/Booking'); const Purchase = require('../models/Purchase');
const purchases = require('../services/purchases');
let repl, server, browser, base, buyer, organizer, freeEvent, paidEvent;
const orders = new Map(); const payments = new Map(); const browserErrors = [];
before(async () => {
  repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } }); await mongoose.connect(repl.getUri());
  await Promise.all([User, Event, Booking, Purchase].map(model => model.init()));
  [buyer, organizer] = await User.create(['user', 'organizer'].map(role => ({ name: `Browser ${role}`, email: `${role}@example.invalid`, password: 'fixture', role, status: 'active', isEmailVerified: true })));
  const fixture = { title: 'Browser checkout', description: 'A fixture used for browser checkout testing.', venue: 'Test hall', location: 'Ludhiana', organizer: organizer._id, date: '2099-01-01', time: '18:00', seats: 20, status: 'approved', registrationFields: [{ key: 'phone', label: 'Contact number', type: 'text', required: true, helper: 'Used for this event only.' }] };
  [freeEvent, paidEvent] = await Event.create([{ ...fixture, price: 0, title: 'Free browser event' }, { ...fixture, price: 100, title: 'Paid browser event' }]);
  const service = purchases.createPurchaseService(() => ({ orders: {
    create: async data => { const order = { ...data, id: 'order_' + crypto.randomUUID() }; orders.set(order.id, order); return order; },
    fetchPayments: async id => ({ items: [...payments.values()].filter(p => p.order_id === id) }),
  }, payments: { fetch: async id => payments.get(id) } }));
  for (const key of ['createOrder', 'verify', 'reconcile']) purchases[key] = service[key];
  server = require('../server').app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
});
after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect(); if (repl) await repl.stop();
});
async function pageFor(user, viewport = { width: 1365, height: 1000 }) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  // Do not contact production APIs, Google, mail, or a real Checkout in browser regression tests.
  await context.route('**/*', route => route.request().url().startsWith(base) || /^(data|blob):/.test(route.request().url()) ? route.continue() : route.abort());
  const page = await context.newPage();
  page.on('pageerror', error => browserErrors.push(error.message));
  const token = user ? jwt.sign({ id: String(user._id), role: user.role, name: user.name, email: user.email }, process.env.JWT_SECRET, { expiresIn: '1h' }) : null;
  await page.addInitScript(({ token }) => { if (token) localStorage.setItem('token', token); }, { token });
  await page.exposeFunction('__completeTestPayment', orderId => {
    const order = orders.get(orderId);
    const payment = { id: 'pay_' + crypto.randomUUID(), order_id: orderId, amount: order.amount, currency: order.currency, status: 'captured', amount_refunded: 0 };
    payments.set(payment.id, payment);
    return { razorpay_order_id: orderId, razorpay_payment_id: payment.id, razorpay_signature: purchases.digest(`${orderId}|${payment.id}`, process.env.RAZORPAY_KEY_SECRET) };
  });
  await page.addInitScript(() => {
    window.__checkoutCount = 0;
    window.Razorpay = class { constructor(options) { this.options = options; } on() {} async open() { window.__checkoutCount++; await this.options.handler(await window.__completeTestPayment(this.options.order_id)); } };
  });
  return { page, context };
}

test('free checkout validates required questions, confirms, survives refresh and downloads PDF', async () => {
  const { page, context } = await pageFor(buyer);
  try {
    await page.goto(base + '/events/' + freeEvent._id);
    await page.getByRole('button', { name: 'Book now', exact: true }).click();
    await expect(page.getByText('"Contact number" is required.', { exact: true })).toBeVisible();
    await page.getByLabel(/Contact number/).fill('9000000000');
    const describedBy = await page.getByLabel(/Contact number/).getAttribute('aria-describedby');
    assert.ok(describedBy); await expect(page.locator(`[id="${describedBy}"]`)).toBeVisible();
    await page.getByRole('button', { name: 'Book now', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your booking is confirmed.' })).toBeVisible({ timeout: 15000 });
    assert.equal(await page.evaluate(() => window.__checkoutCount), 0);
    await page.reload(); await expect(page.getByRole('heading', { name: 'Your booking is confirmed.' })).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PDF pass' }).click()]);
    const file = await download.path(); assert.equal(fs.readFileSync(file).subarray(0, 4).toString(), '%PDF');
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
    await page.screenshot({ path: 'audit/checkout-desktop.png', animations: 'disabled' });
  } finally { await context.close(); }
});
test('paid browser checkout completes through bound order verification', async () => {
  const { page, context } = await pageFor(buyer);
  try {
    await page.goto(base + '/events/' + paidEvent._id);
    await page.getByLabel(/Contact number/).fill('9000000000');
    await page.getByRole('button', { name: 'Book now', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your booking is confirmed.' })).toBeVisible({ timeout: 15000 });
    assert.equal(await page.evaluate(() => window.__checkoutCount), 1);
    const booking = await Booking.findOne({ event: paidEvent._id }); assert.ok(booking.paymentId); assert.equal(booking.totalPrice, 100);
  } finally { await context.close(); }
});
test('mobile menu traps focus, restores the trigger and does not overflow', async () => {
  const { page, context } = await pageFor(null, { width: 390, height: 844 });
  try {
    await page.goto(base + '/events');
    const trigger = page.getByRole('button', { name: /open menu/i }); await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Menu', exact: true }); await expect(dialog).toBeVisible();
    for (let i = 0; i < 18; i++) { await page.keyboard.press('Tab'); assert.equal(await dialog.evaluate(node => node.contains(document.activeElement)), true); }
    await page.screenshot({ path: 'audit/menu-mobile.png', animations: 'disabled' });
    await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible(); await expect(trigger).toBeFocused();
    await trigger.click(); await expect(dialog).toBeVisible();
    await page.locator('[data-dialog-backdrop]').click({ position: { x: 10, y: 100 } });
    await expect(dialog).not.toBeVisible(); await expect(trigger).toBeFocused();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  } finally { await context.close(); }
});

test('city search waits for submission instead of fetching on every keystroke', async () => {
  const { page, context } = await pageFor(null);
  const requests = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname === '/api/events') requests.push(url);
  });
  try {
    await page.goto(base + '/events');
    await expect(page.getByRole('link', { name: /Free browser event/ }).first()).toBeVisible();
    assert.equal(requests.length, 1);
    await page.getByLabel('City', { exact: true }).pressSequentially('Ludhiana', { delay: 30 });
    await page.waitForTimeout(250);
    assert.equal(requests.length, 1);
    const response = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === '/api/events' && url.searchParams.get('city') === 'Ludhiana';
    });
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    assert.equal((await response).status(), 200);
    assert.equal(requests.length, 2);
    assert.equal(requests[1].searchParams.get('summary'), '1');
    await expect(page.getByRole('link', { name: /Free browser event/ }).first()).toBeVisible();
  } finally { await context.close(); }
});

test('cash desk recovers an interrupted guest booking and provides ticket and receipt on mobile', async () => {
  const event = await Event.create({ title: 'Cash desk browser event', description: 'Isolated cash sales fixture.', venue: 'Cash test hall', location: 'Ludhiana', organizer: organizer._id, date: '2099-01-01', time: '18:00', seats: 12, price: 125.5, status: 'approved' });
  const { page, context } = await pageFor(organizer, { width: 390, height: 844 });
  try {
    await page.goto(base + '/dashboard');
    await page.locator(`a[href="/events/${event._id}/cash"]`).click();
    await expect(page.getByRole('heading', { name: 'Cash desk', exact: true })).toBeVisible();
    await expect(page.getByLabel('Number of tickets').locator('option')).toHaveCount(10);
    await page.getByLabel(/^Guest name/).fill('Cash Browser Guest');
    await page.getByLabel(/^Phone number/).fill('+91 98765 43210');
    await page.getByLabel(/^Email address/).fill('cash-browser@example.invalid');
    await page.getByLabel('Number of tickets').selectOption('2');
    await expect(page.getByRole('button', { name: 'Confirm cash booking' })).toBeDisabled();
    await page.getByRole('checkbox', { name: /I have collected/ }).check();
    await page.getByLabel('Number of tickets').selectOption('3');
    await expect(page.getByRole('checkbox', { name: /I have collected/ })).not.toBeChecked();
    await expect(page.getByRole('button', { name: 'Confirm cash booking' })).toBeDisabled();
    await page.getByLabel('Number of tickets').selectOption('2');
    await page.getByRole('checkbox', { name: /I have collected/ }).check();
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
    await page.screenshot({ path: 'audit/cash-desk-mobile.png', animations: 'disabled', fullPage: true });
    let requestKey;
    await page.route('**/api/bookings/cash', async route => {
      requestKey = route.request().postDataJSON().requestKey;
      const response = await route.fetch();
      assert.equal(response.status(), 201);
      await route.abort('failed'); // Response lost after the server committed the sale.
    }, { times: 1 });
    await page.getByRole('button', { name: 'Confirm cash booking' }).click();
    await expect(page.getByRole('alert')).toContainText('Cannot reach Evently');
    await expect(page.getByLabel(/^Guest name/)).toBeDisabled();
    assert.equal(await Booking.countDocuments({ event: event._id }), 1);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Recover this booking' })).toBeVisible();
    await page.route('**/api/bookings/cash', route => route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Temporary limit. Please retry.' }) }), { times: 1 });
    await page.getByRole('button', { name: 'Recover this booking' }).click();
    await expect(page.getByRole('alert')).toContainText('Temporary limit');
    await page.reload();
    await expect(page.getByRole('button', { name: 'Recover this booking' })).toBeVisible();
    const retry = page.waitForRequest(request => request.url().endsWith('/api/bookings/cash'));
    await page.getByRole('button', { name: 'Recover this booking' }).click();
    assert.equal((await retry).postDataJSON().requestKey, requestKey);
    await expect(page.getByRole('heading', { name: 'Cash booking confirmed' })).toBeVisible();
    assert.equal(await Booking.countDocuments({ event: event._id }), 1);
    assert.equal((await Event.findById(event._id)).ticketsSold, 2);
    const saved = await Booking.findOne({ event: event._id });
    assert.equal(saved.paymentMethod, 'cash'); assert.equal(saved.totalPrice, 251);
    assert.equal(saved.attendeeSnapshot.name, 'Cash Browser Guest'); assert.equal(saved.user, undefined);
    for (const label of ['Download PDF pass', 'Download receipt']) {
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: label, exact: true }).click()]);
      assert.equal(fs.readFileSync(await download.path()).subarray(0, 4).toString(), '%PDF');
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
    await page.screenshot({ path: 'audit/cash-confirmed-mobile.png', animations: 'disabled', fullPage: true });
    await page.getByRole('button', { name: 'Register next guest' }).click();
    await page.getByLabel(/^Guest name/).fill('Next cash guest');
    await page.getByLabel(/^Phone number/).fill('9876543210');
    await page.getByLabel(/^Email address/).fill('next-cash@example.invalid');
    await page.getByRole('checkbox', { name: /I have collected/ }).check();
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith('evently-cash:')) throw new DOMException('Storage unavailable', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    });
    let blockedRequests = 0;
    page.on('request', request => { if (request.url().endsWith('/api/bookings/cash')) blockedRequests++; });
    await page.getByRole('button', { name: 'Confirm cash booking' }).click();
    await expect(page.getByRole('alert')).toContainText('cannot save booking recovery details');
    assert.equal(blockedRequests, 0);
    assert.equal(await Booking.countDocuments({ event: event._id }), 1);
    await page.getByRole('link', { name: 'Back to event bookings' }).click();
    await expect(page.getByText('Cash Browser Guest', { exact: true })).toBeVisible();
    await expect(page.getByText('+919876543210', { exact: true })).toBeVisible();
    await expect(page.getByText('Cash', { exact: true })).toBeVisible();
  } finally { await context.close(); }
});
test('organizer registration and ticket settings persist through the actual form', async () => {
  const { page, context } = await pageFor(organizer);
  try {
    await page.goto(base + '/events/' + freeEvent._id + '/edit');
    await expect(page.getByRole('heading', { name: 'Registration questions' })).toBeVisible({ timeout: 10000 });
    await page.getByRole('textbox', { name: /^Question/ }).fill('Contact number');
    await page.getByLabel('Ticket notes').fill('Bring a photo ID.');
    await page.getByRole('button', { name: /Save changes/i }).click();
    await expect(page).toHaveURL(new RegExp('/events/' + freeEvent._id + '$'));
    assert.equal((await Event.findById(freeEvent._id)).ticketConfig.notes, 'Bring a photo ID.');
  } finally { await context.close(); }
});
async function scannerTicket(event = freeEvent) {
  const purchase = await purchases.prepare(buyer._id, { eventId: String(event._id), tickets: 1, requestKey: crypto.randomUUID(), answers: { phone: '9000000000' } }, true);
  const fulfilled = await purchases.fulfill(purchase._id);
  return Booking.findById(fulfilled.booking);
}

const soundHash = name => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '../client/src/assets/sounds/' + name + '.mp3'))).digest('hex');

async function observeScannerAudio(page) {
  await page.addInitScript(() => {
    window.__sounds = []; window.__soundBuffers = [];
    const buffers = new WeakMap();
    const decode = AudioContext.prototype.decodeAudioData;
    AudioContext.prototype.decodeAudioData = async function (bytes) {
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
      const buffer = await decode.call(this, bytes);
      buffers.set(buffer, hash); window.__soundBuffers.push(hash);
      return buffer;
    };
    const create = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      const source = create.call(this); const start = source.start.bind(source); const stop = source.stop.bind(source); const context = this;
      let record;
      source.start = (...args) => {
        record = { hash: buffers.get(source.buffer), duration: source.buffer?.duration, state: context.state, stopped: false };
        window.__sounds.push(record); return start(...args);
      };
      source.stop = (...args) => { if (record) record.stopped = true; return stop(...args); };
      return source;
    };
  });
}

async function controllableCamera(page) {
  // Exercise the real video/decode loop with deterministic frames, no physical camera.
  await page.addInitScript(() => {
    const state = window.__camera = { value: '', calls: 0, active: 0, maxActive: 0, opens: 0, hold: false, release: null };
    navigator.mediaDevices.getUserMedia = async () => {
      state.opens++;
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
      canvas.getContext('2d').fillRect(0, 0, 640, 480);
      const stream = canvas.captureStream(10); state.track = stream.getVideoTracks()[0];
      return stream;
    };
    window.BarcodeDetector = class {
      async detect() {
        state.calls++; state.active++; state.maxActive = Math.max(state.maxActive, state.active);
        const value = state.value;
        if (state.hold) await new Promise(resolve => { state.release = resolve; });
        state.active--;
        return value ? [{ rawValue: value }] : [];
      }
    };
    window.__verifyTimings = []; let acknowledgedAt = null;
    document.addEventListener('click', event => {
      if (event.target.closest('button')?.textContent.trim() === 'OK') acknowledgedAt = performance.now();
    }, true);
    const fetch = window.fetch;
    window.fetch = (...args) => {
      if (String(args[0]).endsWith('/api/bookings/verify-ticket')) window.__verifyTimings.push(acknowledgedAt === null ? null : performance.now() - acknowledgedAt);
      return fetch(...args);
    };
  });
}

test('scanner shows an OK-only result, plays supplied audio, persists admission and rejects reuse', async () => {
  const { page, context } = await pageFor(organizer);
  try {
    await observeScannerAudio(page);
    await page.goto(base + '/scanner');
    await page.getByLabel('Which door').selectOption(String(freeEvent._id));
    await expect(page.getByLabel('Or enter a ticket ID')).toBeVisible();
    const booking = await scannerTicket();
    await page.getByLabel('Or enter a ticket ID').fill(booking.ticketId);
    await page.getByRole('button', { name: 'Check in', exact: true }).first().click();
    await expect(page.getByText('Let 1 guest in', { exact: true })).toBeVisible();
    assert.equal((await Booking.findById(booking._id)).checkedIn, true);
    const dialog = page.getByRole('dialog', { name: 'Let 1 guest in' });
    const ok = dialog.getByRole('button', { name: 'OK', exact: true });
    await expect(ok).toBeFocused();
    await page.keyboard.press('Tab'); await expect(ok).toBeFocused();
    await page.keyboard.press('Shift+Tab'); await expect(ok).toBeFocused();
    await page.keyboard.press('Escape'); await expect(dialog).toBeVisible();
    await page.mouse.click(5, 5); await expect(dialog).toBeVisible();
    await expect(page.getByLabel('Which door')).toBeDisabled();
    await expect(page.getByLabel('Or enter a ticket ID')).toBeDisabled();
    await expect.poll(() => page.evaluate(() => window.__sounds.length)).toBe(1);
    assert.deepEqual(await page.evaluate(() => window.__sounds.map(s => [s.hash, s.state])), [[soundHash('success'), 'running']]);
    await page.screenshot({ path: 'audit/scanner-success-desktop.png', animations: 'disabled' });
    await ok.click(); await expect(dialog).not.toBeVisible();
    await expect(page.getByLabel('Or enter a ticket ID')).toBeEnabled();
    await page.reload();
    await page.getByLabel('Which door').selectOption(String(freeEvent._id));
    await page.getByLabel('Or enter a ticket ID').fill(booking.ticketId);
    await page.getByRole('button', { name: 'Check in', exact: true }).first().click();
    await expect(page.getByText('Already used', { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__sounds.length)).toBe(1);
    assert.equal(await page.evaluate(() => window.__sounds[0].hash), soundHash('error'));
  } finally { await context.close(); }
});

test('camera pauses through verification and result, resumes promptly on OK and never overlaps decodes', async () => {
  const { page, context } = await pageFor(organizer);
  let releaseRequest;
  try {
    const first = await scannerTicket(); const next = await scannerTicket();
    await observeScannerAudio(page); await controllableCamera(page);
    let requests = 0;
    const heldRequest = new Promise(resolve => { releaseRequest = resolve; });
    await page.route('**/api/bookings/verify-ticket', async route => {
      requests++; if (requests === 1) await heldRequest; await route.continue();
    });
    await page.goto(base + '/scanner');
    await page.getByLabel('Which door').selectOption(String(freeEvent._id));
    await page.getByRole('button', { name: 'Start camera', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop camera', exact: true })).toBeVisible();
    // Slow decoder: only one detect call may be active, even after many frames.
    await page.evaluate(value => { window.__camera.value = value; window.__camera.hold = true; }, first.ticketId);
    await expect.poll(() => page.evaluate(() => Boolean(window.__camera.release))).toBe(true);
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => window.__camera.maxActive), 1);
    await page.evaluate(() => { window.__camera.hold = false; window.__camera.release(); });
    await expect.poll(() => requests).toBe(1);
    await expect(page.getByText('Checking ticket…', { exact: true })).toBeVisible();
    await page.evaluate(value => { window.__camera.value = value; }, next.ticketId);
    await page.waitForTimeout(400); assert.equal(requests, 1);
    releaseRequest();
    const dialog = page.getByRole('dialog', { name: 'Let 1 guest in' });
    await expect(dialog).toBeVisible();
    const calls = await page.evaluate(() => window.__camera.calls);
    await page.waitForTimeout(2700); // Longer than the removed 2.5-second auto-rescan timer.
    assert.equal(requests, 1); assert.equal(await page.evaluate(() => window.__camera.calls), calls);
    assert.equal((await Booking.findById(next._id)).checkedIn, false);
    assert.equal(await page.evaluate(() => window.__camera.track.readyState), 'live');
    await dialog.getByRole('button', { name: 'OK', exact: true }).click();
    await expect.poll(() => requests).toBe(2);
    await expect.poll(async () => (await Booking.findById(next._id)).checkedIn).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__sounds.length)).toBe(2);
    // The same QR may be retried immediately after OK, and correctly gets an error.
    await page.getByRole('dialog').getByRole('button', { name: 'OK', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Already used' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__sounds.length)).toBe(3);
    assert.deepEqual(await page.evaluate(() => window.__sounds.map(s => s.hash)), [soundHash('success'), soundHash('success'), soundHash('error')]);
    const timings = await page.evaluate(() => window.__verifyTimings.slice(1));
    assert.ok(timings.every(ms => ms < 1000), 'No multi-second cooldown after OK: ' + JSON.stringify(timings));
    console.log('Scanner OK-to-next-request timings (ms):', timings.map(ms => Math.round(ms)).join(', '));
    assert.equal(await page.evaluate(() => window.__camera.opens), 1);
    await page.evaluate(() => { window.__camera.value = ''; });
    await page.getByRole('dialog').getByRole('button', { name: 'OK', exact: true }).click();
    await page.getByRole('button', { name: 'Stop camera', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__camera.track.readyState), 'ended');
  } finally { releaseRequest?.(); await context.close(); }
});

test('scanner recovers from network and invalid QR errors, supports mute and discards a stale camera frame', async () => {
  const { page, context } = await pageFor(organizer, { width: 390, height: 844 });
  try {
    const booking = await scannerTicket();
    await observeScannerAudio(page); await controllableCamera(page);
    let requests = 0;
    await page.route('**/api/bookings/verify-ticket', route => {
      requests++; return requests === 1 ? route.abort('internetdisconnected') : route.continue();
    });
    await page.goto(base + '/scanner');
    await page.getByLabel('Which door').selectOption(String(freeEvent._id));
    await page.getByLabel('Or enter a ticket ID').fill(booking.ticketId);
    await page.getByRole('button', { name: 'Check in', exact: true }).first().click();
    await expect(page.getByRole('dialog', { name: 'Check-in failed' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__sounds.length)).toBe(1);
    assert.equal(await page.evaluate(() => window.__sounds[0].hash), soundHash('error'));
    assert.equal((await Booking.findById(booking._id)).checkedIn, false);
    await page.screenshot({ path: 'audit/scanner-error-mobile.png', animations: 'disabled' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await page.getByRole('button', { name: 'Sound on', exact: true }).click();
    await page.getByRole('button', { name: 'Start camera', exact: true }).click();
    await page.evaluate(value => { window.__camera.value = value; window.__camera.hold = true; }, booking.ticketId);
    await expect.poll(() => page.evaluate(() => Boolean(window.__camera.release))).toBe(true);
    // While a frame is decoding, manual entry must own the single scan slot.
    await page.getByLabel('Or enter a ticket ID').fill('{}');
    await page.getByRole('button', { name: 'Check in', exact: true }).first().click();
    await expect(page.getByRole('dialog', { name: 'Invalid ticket' })).toBeVisible();
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await page.evaluate(() => { window.__camera.value = ''; window.__camera.hold = false; window.__camera.release(); });
    await page.waitForTimeout(400);
    assert.equal(requests, 1, 'A frame decoded before the acknowledgement cannot submit afterwards');
    assert.equal(await page.evaluate(() => window.__sounds.length), 1, 'Muted invalid QR must stay silent');
    await page.getByRole('button', { name: 'Sound off', exact: true }).click();
    await page.evaluate(value => { window.__camera.value = value; }, booking.ticketId);
    await expect(page.getByRole('dialog', { name: 'Let 1 guest in' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__sounds.length)).toBe(2);
    assert.equal(await page.evaluate(() => window.__sounds[1].hash), soundHash('success'));
    await page.evaluate(() => { window.__camera.value = ''; });
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await page.getByRole('button', { name: 'Stop camera', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__camera.track.readyState), 'ended');
  } finally { await context.close(); }
});
test('browser pages produced no uncaught JavaScript errors', () => assert.deepEqual(browserErrors, []));

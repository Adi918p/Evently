const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium, expect } = require('@playwright/test');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'experience-browser-tests-only';
process.env.RAZORPAY_KEY_ID = 'rzp_test_experience';
process.env.RAZORPAY_KEY_SECRET = 'experience-browser-payment-secret';
process.env.MONGOMS_DOWNLOAD_DIR = path.resolve(__dirname, '../.cache/mongodb');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Event = require('../models/Events');
const EventImage = require('../models/EventImage');
const ExperienceSection = require('../models/ExperienceSection');
let repl, server, browser, base, admin, organizer, secondOrganizer, ownEvent, otherEvent;
const errors = [];
const snapshots = path.resolve(__dirname, '../.cache/experience-browser');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOO8AAAAASUVORK5CYII=', 'base64');
const file = name => ({ name, mimeType: 'image/png', buffer: png });

before(async () => {
  repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(repl.getUri());
  await Promise.all([User, Event, EventImage, ExperienceSection].map(model => model.init()));
  [admin, organizer, secondOrganizer] = await User.create(['admin', 'organizer', 'organizer'].map((role, index) => ({ name: `Experience fixture ${index}`, email: `experience-${index}@example.invalid`, password: 'fixture', role, status: 'active', isEmailVerified: true })));
  const fixture = { description: 'Isolated event access browser fixture.', venue: 'Test hall', location: 'Ludhiana', date: '2099-01-01', time: '18:00', seats: 10, price: 0, status: 'approved' };
  [ownEvent, otherEvent] = await Event.create([
    { ...fixture, title: 'First organizer event', organizer: organizer._id },
    { ...fixture, title: 'Second organizer event', organizer: secondOrganizer._id },
  ]);
  server = require('../server').app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  fs.mkdirSync(snapshots, { recursive: true });
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect();
  if (repl) await repl.stop();
});

async function pageFor(user, viewport = { width: 1365, height: 1000 }) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  await context.route('**/*', route => route.request().url().startsWith(base) || /^(data|blob):/.test(route.request().url()) ? route.continue() : route.abort());
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  if (user) {
    const token = jwt.sign({ id: String(user._id), role: user.role, name: user.name, email: user.email }, process.env.JWT_SECRET, { expiresIn: '1h' });
    await page.addInitScript(token => localStorage.setItem('token', token), token);
  }
  return { page, context };
}

test('Experience has an honest empty state, retryable failure and admin-only editor', async () => {
  const visitor = await pageFor(null);
  const owner = await pageFor(organizer);
  try {
    await visitor.page.goto(base + '/experience');
    await expect(visitor.page.getByRole('heading', { name: 'New memories are on the way' })).toBeVisible();
    await expect(visitor.page.getByText('DJ Night 2026', { exact: true })).toHaveCount(0);
    await expect(visitor.page.getByRole('heading', { name: 'Recently wrapped' })).toHaveCount(0);
    let fail = true;
    await visitor.page.route('**/api/experience', route => fail ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Temporary experience outage' }) }) : route.continue());
    await visitor.page.reload();
    await expect(visitor.page.getByRole('heading', { name: "Couldn't load experiences" })).toBeVisible();
    fail = false;
    await visitor.page.getByRole('button', { name: /try again/i }).click();
    await expect(visitor.page.getByRole('heading', { name: 'New memories are on the way' })).toBeVisible();
    await visitor.page.goto(base + '/admin/experience');
    await expect(visitor.page).toHaveURL(/\/login/);
    await owner.page.goto(base + '/admin/experience');
    await expect(owner.page.getByRole('heading', { name: "You don't have access to this page" })).toBeVisible();
    await expect(owner.page.getByRole('button', { name: 'Add section', exact: true })).toHaveCount(0);
  } finally { await visitor.context.close(); await owner.context.close(); }
});

test('admin drafts, uploads, publishes, edits, unpublishes and deletes a section with public photo viewing', async () => {
  const editor = await pageFor(admin);
  const visitor = await pageFor(null);
  const page = editor.page;
  try {
    await page.goto(base + '/admin/experience');
    await page.getByRole('button', { name: 'Add section', exact: true }).click();
    await page.getByLabel('Section title').fill('Browser photo story');
    await page.getByLabel('Description', { exact: false }).first().fill('A real gallery from our fixture event.');
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Browser photo story', exact: true })).toBeVisible();
    let record = await ExperienceSection.findOne({ title: 'Browser photo story' });
    assert.equal(record.published, false);
    await visitor.page.goto(base + '/experience');
    await expect(visitor.page.getByRole('heading', { name: 'New memories are on the way' })).toBeVisible();
    await page.getByRole('button', { name: 'Edit Browser photo story', exact: true }).click();
    await page.getByRole('checkbox', { name: /Published on Experience/ }).check();
    await page.getByRole('button', { name: 'Save and publish' }).click();
    await expect(page.getByRole('alert')).toContainText('Add at least one image');
    await page.getByLabel('Add images', { exact: true }).setInputFiles([file('first.png'), file('second.png')]);
    await expect(page.getByText('2 images added. Save the section to keep your changes.', { exact: true })).toBeVisible();
    await page.getByLabel('Photo 1 description').fill('First gallery photo');
    await page.getByLabel('Photo 2 description').fill('Second gallery photo');
    await page.getByRole('button', { name: 'Move photo 2 earlier' }).click();
    await expect(page.getByLabel('Photo 1 description')).toHaveValue('Second gallery photo');
    await page.getByRole('button', { name: 'Remove photo 2', exact: true }).click();
    await page.getByLabel('Display order').fill('2');
    await page.getByText('Preview section', { exact: true }).click();
    await page.screenshot({ path: path.join(snapshots, 'admin-desktop.png'), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Save and publish' }).click();
    await expect(page.getByRole('form', { name: 'Experience section' })).toHaveCount(0);
    record = await ExperienceSection.findById(record._id);
    assert.equal(record.published, true);
    assert.equal(record.images.length, 1);
    assert.equal(record.images[0].alt, 'Second gallery photo');
    assert.equal(record.order, 2);
    assert.equal((await EventImage.findOne({ key: record.images[0].url.split('/').pop() })).expiresAt, null);
    await visitor.page.reload();
    await expect(visitor.page.getByRole('heading', { name: 'Browser photo story', exact: true })).toBeVisible();
    await expect(visitor.page.getByAltText('Second gallery photo', { exact: true })).toBeVisible();
    assert.ok(await visitor.page.getByAltText('Second gallery photo', { exact: true }).evaluate(image => image.complete && image.naturalWidth > 0));
    const photoButton = visitor.page.getByRole('button', { name: 'View photo 1 from Browser photo story' });
    await photoButton.click();
    await expect(visitor.page.getByRole('dialog')).toBeVisible();
    await visitor.page.keyboard.press('Escape');
    await expect(visitor.page.getByRole('dialog')).toHaveCount(0);
    await expect(photoButton).toBeFocused();
    await page.getByRole('button', { name: 'Edit Browser photo story' }).click();
    await page.getByLabel('Section title').fill('Updated photo story');
    await page.getByRole('checkbox', { name: /Published on Experience/ }).uncheck();
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Updated photo story', exact: true })).toBeVisible();
    await visitor.page.reload();
    await expect(visitor.page.getByRole('heading', { name: 'New memories are on the way' })).toBeVisible();
    await page.getByRole('button', { name: 'Delete Updated photo story' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal(await ExperienceSection.countDocuments(), 1);
    await page.getByRole('button', { name: 'Delete Updated photo story' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete section', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'No Experience sections yet' })).toBeVisible();
    assert.equal(await ExperienceSection.countDocuments(), 0);
    assert.ok((await EventImage.findOne({ key: record.images[0].url.split('/').pop() })).expiresAt);
  } finally { await editor.context.close(); await visitor.context.close(); }
});

test('mobile gallery editing preserves input on save failure and fits the screen', async () => {
  const editor = await pageFor(admin, { width: 390, height: 844 });
  const visitor = await pageFor(null, { width: 390, height: 844 });
  const page = editor.page;
  try {
    await page.goto(base + '/admin/experience');
    await page.getByRole('button', { name: 'Add section', exact: true }).click();
    await page.getByLabel('Section title').fill('Mobile gallery');
    await page.getByLabel('Add images', { exact: true }).setInputFiles(file('mobile.png'));
    await expect(page.getByText('1 image added. Save the section to keep your changes.', { exact: true })).toBeVisible();
    await page.getByLabel('Photo 1 description').fill('Mobile fixture photo');
    await page.getByRole('checkbox', { name: /Published on Experience/ }).check();
    await page.route('**/api/admin/experience', route => route.request().method() === 'POST' ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Please retry this save.' }) }) : route.continue());
    await page.getByRole('button', { name: 'Save and publish' }).click();
    await expect(page.getByRole('alert')).toHaveText('Please retry this save.');
    await expect(page.getByLabel('Section title')).toHaveValue('Mobile gallery');
    await expect(page.getByLabel('Photo 1 description')).toHaveValue('Mobile fixture photo');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(snapshots, 'admin-mobile.png'), fullPage: true, animations: 'disabled' });
    await page.unroute('**/api/admin/experience');
    await page.getByRole('button', { name: 'Save and publish' }).click();
    await expect(page.getByRole('heading', { name: 'Mobile gallery', exact: true })).toBeVisible();
    await visitor.page.goto(base + '/experience');
    await expect(visitor.page.getByRole('heading', { name: 'Mobile gallery', exact: true })).toBeVisible();
    await expect(visitor.page.getByAltText('Mobile fixture photo')).toBeVisible();
    assert.ok(await visitor.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await visitor.page.screenshot({ path: path.join(snapshots, 'public-mobile.png'), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Delete Mobile gallery', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete section', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'No Experience sections yet' })).toBeVisible();
  } finally { await editor.context.close(); await visitor.context.close(); }
});

test('admin event links open another organizer roster, cash desk and selected scanner; organizer sees only owned doors', async () => {
  const manager = await pageFor(admin);
  const owner = await pageFor(organizer);
  const page = manager.page;
  try {
    async function eventsRow() {
      await page.goto(base + '/admin/events');
      await page.getByRole('button', { name: /^All\s/ }).click();
      return page.locator('li').filter({ has: page.getByRole('heading', { name: otherEvent.title, exact: true }) });
    }
    let row = await eventsRow();
    await row.getByRole('link', { name: 'Bookings', exact: true }).click();
    await expect(page).toHaveURL(base + `/events/${otherEvent._id}/bookings`);
    await expect(page.getByRole('heading', { name: otherEvent.title, exact: true })).toBeVisible();
    row = await eventsRow();
    await row.getByRole('link', { name: 'Cash desk', exact: true }).click();
    await expect(page).toHaveURL(base + `/events/${otherEvent._id}/cash`);
    await expect(page.getByLabel('Guest name')).toBeVisible();
    row = await eventsRow();
    await row.getByRole('link', { name: 'Scanner', exact: true }).click();
    await expect(page.getByLabel('Which door')).toHaveValue(String(otherEvent._id));
    await expect(page.getByLabel('Which door').locator('option')).toHaveCount(2);
    await owner.page.goto(base + `/scanner?event=${otherEvent._id}`);
    await expect(owner.page.getByLabel('Which door')).toHaveValue(String(ownEvent._id));
    await expect(owner.page.getByLabel('Which door').locator('option')).toHaveCount(1);
    assert.deepEqual(errors, []);
  } finally { await manager.context.close(); await owner.context.close(); }
});

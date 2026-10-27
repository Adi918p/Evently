// Controlled browser comparison of a built frontend; never loads .env or a database.
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { chromium } = require('@playwright/test');
const root = path.resolve(__dirname, '..');
const output = path.resolve(root, process.argv[2] || 'audit/performance-latest.json');
const app = express();
const fixture = { _id: '111111111111111111111111', title: 'Performance fixture', description: 'Isolated benchmark event.', date: '2099-01-01', time: '18:00', venue: 'Test venue', location: 'Ludhiana', price: 100, seats: 100, ticketsSold: 0, status: 'approved' };
app.get('/api/events', (req, res) => res.json([fixture]));
app.get('/api/auth/me', (req, res) => res.status(401).json({ success: false }));
app.use('/Media', express.static(path.join(root, 'Public/Media')));
app.use(express.static(path.join(root, 'client/dist')));
app.use((req, res) => res.sendFile(path.join(root, 'client/dist/index.html')));
const metricMap = response => Object.fromEntries(response.metrics.map(row => [row.name, row.value]));
async function main() {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const result = { checkedAt: new Date().toISOString(), scope: 'Built app, local static server, fixed event API, cold contexts, headless Chrome. Relative comparison, not a real-phone/network benchmark.', samples: [] };
    for (const device of ['desktop', 'mobile']) {
      for (const route of ['/', '/events', '/login']) {
        const context = await browser.newContext({ viewport: device === 'mobile' ? { width: 390, height: 844 } : { width: 1365, height: 900 }, isMobile: device === 'mobile', hasTouch: device === 'mobile', reducedMotion: 'no-preference' });
        try {
          await context.route('**/*', request => request.request().url().startsWith(origin) || /^(data|blob):/.test(request.request().url()) ? request.continue() : request.abort());
          await context.addInitScript(() => {
            Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
            Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
            window.__longTasks = [];
            new PerformanceObserver(list => window.__longTasks.push(...list.getEntries().map(x => x.duration))).observe({ type: 'longtask', buffered: true });
          });
          const page = await context.newPage();
          const errors = []; page.on('pageerror', error => errors.push(error.message));
          const cdp = await context.newCDPSession(page);
          await cdp.send('Performance.enable');
          await page.goto(origin + route, { waitUntil: 'domcontentloaded' });
          await page.locator(route === '/login' ? 'form' : 'h1').first().waitFor({ state: 'visible', timeout: 20000 });
          await page.waitForTimeout(4000);
          const before = metricMap(await cdp.send('Performance.getMetrics'));
          await page.waitForTimeout(1500);
          const after = metricMap(await cdp.send('Performance.getMetrics'));
          const stats = await page.evaluate(() => {
            const scripts = performance.getEntriesByType('resource').filter(x => /\.js(?:\?|$)/.test(x.name));
            return { canvasCount: document.querySelectorAll('canvas').length, scriptRequests: scripts.length,
              scriptBytes: scripts.reduce((total, x) => total + x.decodedBodySize, 0),
              threeRequested: scripts.some(x => /\/(?:three|Canvas3D)-[^/]+\.js/.test(x.name)),
              longTasks: window.__longTasks.length, longTaskMs: Math.round(window.__longTasks.reduce((a, b) => a + b, 0)),
              fcpMs: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0),
            };
          });
          let navigationMs = null;
          if (route === '/') {
            const previous = await page.locator('h1').first().textContent();
            await page.evaluate(() => { window.__clickedAt = 0; document.addEventListener('click', () => { window.__clickedAt = performance.now(); }, { once: true, capture: true }); });
            await page.getByRole('link', { name: 'Explore events', exact: true }).click();
            await page.waitForFunction(previous => location.pathname === '/events' && document.querySelector('h1')?.textContent !== previous, previous);
            navigationMs = await page.evaluate(() => Math.round(performance.now() - window.__clickedAt));
          }
          const sample = { device, route, ...stats, idleMainThreadMs: Math.round((after.TaskDuration - before.TaskDuration) * 1000), navigationMs, errors };
          result.samples.push(sample); console.log(JSON.stringify(sample));
          fs.mkdirSync(path.dirname(output), { recursive: true });
          fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
        } finally { await context.close(); }
      }
    }
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

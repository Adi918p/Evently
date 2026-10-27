// Read-only repository coverage checks. Never opens ignored environment files.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const parser = require('../client/node_modules/@babel/parser');
const postcss = require('../client/node_modules/postcss');
const root = path.resolve(__dirname, '..');
const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean))];
const failures = [];
const missingMedia = [];
const counts = { javascript: 0, inlineScripts: 0, json: 0, css: 0, binary: 0 };
const inventory = files.map(file => {
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute)) return { path: file, status: 'deleted' };
  const ext = path.extname(file).toLowerCase();
  const binary = /\.(png|jpe?g|avif|webp|mp4)$/i.test(file);
  const entry = { path: file, bytes: fs.statSync(absolute).size, category: binary ? 'media' : file.startsWith('Public/') ? 'archived-frontend' : file.startsWith('client/') ? 'active-frontend-or-config' : 'backend-tooling-or-config' };
  if (binary) { counts.binary++; return entry; }
  const source = fs.readFileSync(absolute, 'utf8');
  try {
    if (/\.(js|jsx|mjs|cjs)$/.test(file)) {
      parser.parse(source, { sourceType: 'unambiguous', plugins: ['jsx'] });
      counts.javascript++; entry.parse = 'pass';
    } else if (ext === '.json') {
      JSON.parse(source); counts.json++; entry.parse = 'pass';
    } else if (ext === '.css') {
      postcss.parse(source, { from: absolute }); counts.css++; entry.parse = 'pass';
    } else if (ext === '.html') {
      for (const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
        if (/\bsrc\s*=/.test(match[1]) || /type\s*=\s*["']application\//.test(match[1]) || !match[2].trim()) continue;
        parser.parse(match[2], { sourceType: /type\s*=\s*["']module/.test(match[1]) ? 'module' : 'script' });
        counts.inlineScripts++;
      }
      entry.inlineScriptParse = 'pass';
    }
  } catch (error) { entry.parse = 'failed'; failures.push({ file, error: error.message }); }
  if (file.startsWith('client/src/')) {
    for (const match of source.matchAll(/["'`](\/Media\/[^"'`\s${}]+)["'`]/g)) {
      const mediaPath = match[1];
      if (!fs.existsSync(path.join(root, 'Public', mediaPath))) missingMedia.push({ file, line: source.slice(0, match.index).split('\n').length, path: mediaPath });
    }
  }
  return entry;
});
const result = { date: '2026-10-26', scope: 'All tracked and non-ignored new files inventoried; first-party script/JSON/CSS syntax and literal active media paths checked. Binary media listed, not visually inspected. Excludes ignored secrets, dependencies and generated output.', trackedFiles: files.length, counts, failures, missingMedia, files: inventory };
fs.writeFileSync(path.join(__dirname, 'validation-inventory.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ trackedFiles: files.length, counts, failures, missingMedia }, null, 2));
if (failures.length || missingMedia.length) process.exitCode = 1;

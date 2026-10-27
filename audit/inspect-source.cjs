// Read-only review aid: remove comments and visual styling from JSX output.
// Original source remains the authority for line references and visual review.
const fs = require('node:fs');
const path = require('node:path');
const parser = require('../client/node_modules/@babel/parser');
const generate = require('../client/node_modules/@babel/generator').default;
function walk(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'JSXOpeningElement') {
    node.attributes = node.attributes.filter(a => !(a.type === 'JSXAttribute' && ['className', 'style'].includes(a.name.name)));
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') walk(value);
  }
}
for (const file of process.argv.slice(2)) {
  const source = fs.readFileSync(path.resolve(file), 'utf8');
  const ast = parser.parse(source, { sourceType: 'unambiguous', plugins: ['jsx'] });
  walk(ast);
  process.stdout.write(`\n--- ${file} ---\n${generate(ast, { comments: false, concise: true }).code}\n`);
}

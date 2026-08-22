/**
 * Cross-checks Tailwind's compiled output against the theme namespace each
 * arbitrary value came from.
 *
 * `text-[var(--text-4xl)]` is ambiguous: Tailwind's `text-` utility covers both
 * font-size and color, and with a bare var() it cannot tell which was meant, so
 * it guesses colour. Same story for `font-` (family vs weight). The result
 * compiles silently and does nothing, which is exactly the kind of bug a build
 * will never report.
 *
 * Run against the CSS the dev server actually serves:
 *   node scripts/audit-tw.mjs /tmp/gcss.txt
 */
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/audit-tw.mjs <compiled.css>");
  process.exit(2);
}

const css = readFileSync(file, "utf8");

/** Which CSS properties a given theme namespace is legitimately allowed to feed. */
const ALLOWED = {
  color: [
    "color",
    "background-color",
    "background",
    "border-color",
    "border-top-color",
    "border-right-color",
    "border-bottom-color",
    "border-left-color",
    "outline-color",
    "fill",
    "stroke",
    "box-shadow",
    "text-decoration-color",
    "caret-color",
    "accent-color",
    "background-image",
  ],
  text: ["font-size", "line-height"],
  font: ["font-family"],
  radius: [
    "border-radius",
    "border-top-left-radius",
    "border-top-right-radius",
    "border-bottom-left-radius",
    "border-bottom-right-radius",
  ],
  shadow: ["box-shadow"],
  grad: ["background-image", "background"],
  glass: ["background", "background-color", "border-color", "box-shadow", "backdrop-filter", "border"],
  ease: ["transition-timing-function", "animation-timing-function"],
  nav: ["height", "min-height", "padding-top", "padding-bottom", "top", "margin-top", "scroll-padding-top"],
};

const selector = new RegExp(
  "\\.([a-z-]+)\\\\\\[([^\\]]*?)\\\\\\]\\s*\\{([^}]*)\\}",
  "g"
);

const broken = new Map();
let match;

while ((match = selector.exec(css))) {
  const [, prefix, rawValue, body] = match;
  const value = rawValue.replace(/\\/g, "");

  const namespace = value.match(/var\(--([a-z0-9]+)-/)?.[1];
  if (!namespace) continue;

  const allowed = ALLOWED[namespace];
  if (!allowed) continue;

  const properties = [...body.matchAll(/(^|;)\s*([a-z-]+)\s*:/g)]
    .map((entry) => entry[2])
    .filter((property) => !property.startsWith("--tw"));

  const mismatched = properties.filter((property) => !allowed.includes(property));
  if (!mismatched.length) continue;

  const className = `${prefix}-[${value}]`;
  if (!broken.has(className)) {
    broken.set(className, properties.join(", "));
  }
}

if (!broken.size) {
  console.log("No namespace/property mismatches found.");
  process.exit(0);
}

for (const [className, emits] of broken) {
  console.log(`${className.padEnd(40)} -> ${emits}`);
}
console.log(`\n${broken.size} distinct utilities compile to the wrong property.`);
process.exit(1);

/**
 * In-page contrast auditor.
 *
 * Paste-able into a devtools console or run through the preview tools; it
 * defines window.__contrastAudit() and window.__auditRoutes().
 *
 * Why this exists rather than a static check on the source: the answer depends
 * on ancestry. `text-[var(--color-fg-subtle)]` is fine on a glass card and fails
 * on the open WebGL scene, and only the live DOM knows which one a given node
 * ended up inside. It reports two things:
 *
 *   contrast   composited foreground vs composited backdrop, against the 4.5:1
 *              / 3:1 WCAG thresholds for the node's own size and weight
 *   onScene    nodes with no painted ancestor background, i.e. sitting straight
 *              on the scene, where the measured worst case is rgb(70 50 108)
 *              rather than the page base
 *
 * Nodes inside aria-hidden are skipped. A watermark numeral at 9% white is
 * decoration, exempt under WCAG 1.4.3, and flagging it every run trains you to
 * ignore the output.
 */

const SCENE_WORST = { r: 70, g: 50, b: 108 };
const PAGE_BASE = { r: 5, g: 5, b: 16 };

function relativeLuminance({ r, g, b }) {
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function parseColor(input) {
  const match = String(input).match(/rgba?\(([^)]+)\)/);
  if (!match) return null;
  const parts = match[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  if (parts.length < 3 || parts.some(Number.isNaN)) return null;
  return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
}

function composite(top, bottom) {
  return {
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  };
}

function ratio(a, b) {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

/** Walks ancestors collecting painted backgrounds, innermost first. */
function backdropStack(el) {
  const stack = [];
  for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
    const styles = getComputedStyle(node);
    const color = parseColor(styles.backgroundColor);
    if (color && color.a > 0) stack.push(color);
    // A glass surface's own gradient overlay counts as cover even when its
    // background-color is transparent.
    else if (styles.backgroundImage !== "none" && node.classList.contains("glass")) {
      stack.push({ r: 27, g: 27, b: 48, a: 0.5 });
    }
  }
  return stack;
}

export function contrastAudit() {
  const failures = [];
  const seen = new Set();

  for (const el of document.querySelectorAll("body *")) {
    if (el.closest('[aria-hidden="true"]')) continue;

    const ownText = [...el.childNodes]
      .filter((n) => n.nodeType === 3 && n.textContent.trim())
      .map((n) => n.textContent.trim())
      .join(" ");
    if (!ownText) continue;

    const styles = getComputedStyle(el);
    if (styles.visibility === "hidden" || styles.display === "none") continue;
    if (Number(styles.opacity) === 0) continue;
    // Gradient-clipped display type paints via background-image, not color.
    if (styles.webkitTextFillColor === "rgba(0, 0, 0, 0)") continue;

    const fg = parseColor(styles.color);
    if (!fg || fg.a === 0) continue;

    const stack = backdropStack(el);
    const onScene = stack.length === 0;
    let backdrop = onScene ? SCENE_WORST : PAGE_BASE;
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      backdrop = composite(stack[i], backdrop);
    }

    const effective = fg.a < 1 ? composite(fg, backdrop) : fg;
    const cr = ratio(relativeLuminance(effective), relativeLuminance(backdrop));

    const size = parseFloat(styles.fontSize);
    const bold = parseInt(styles.fontWeight, 10) >= 700;
    const large = size >= 24 || (bold && size >= 18.66);
    const required = large ? 3 : 4.5;
    if (cr >= required) continue;

    // One report per distinct treatment, not per instance.
    const key = `${styles.color}|${Math.round(size)}|${styles.fontWeight}|${onScene}`;
    if (seen.has(key)) continue;
    seen.add(key);

    failures.push({
      text: ownText.slice(0, 44),
      selector: `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? `.${el.className.trim().split(/\s+/).slice(0, 3).join(".")}` : ""}`,
      color: styles.color,
      size: Math.round(size * 10) / 10,
      weight: styles.fontWeight,
      ratio: Math.round(cr * 100) / 100,
      required,
      onScene,
    });
  }

  return failures;
}

export const ROUTES = [
  "/",
  "/events",
  "/clubs",
  "/experience",
  "/login",
  "/contact",
  "/faq",
  "/support",
  "/privacy",
  "/terms",
  "/profile",
  "/my-bookings",
  "/booking/success",
  "/dashboard",
  "/create-event",
  "/scanner",
  "/admin",
  "/admin/events",
  "/admin/users",
  "/admin/inbox",
  "/admin/analytics",
  "/no-such-page",
];

/**
 * Drives the client-side router through every route in one pass.
 *
 * Uses history.pushState + a popstate event so react-router transitions without
 * a reload - a full navigation per route would re-download the scene chunk 22
 * times and take minutes.
 */
export async function auditRoutes(routes = ROUTES, settleMs = 900) {
  const results = [];
  for (const route of routes) {
    window.history.pushState({}, "", route);
    window.dispatchEvent(new PopStateEvent("popstate"));
    await new Promise((resolve) => setTimeout(resolve, settleMs));
    results.push({
      route,
      landedOn: location.pathname,
      heading: document.querySelector("h1")?.textContent?.slice(0, 50) ?? null,
      failures: contrastAudit(),
    });
  }
  return results;
}

if (typeof window !== "undefined") {
  window.__contrastAudit = contrastAudit;
  window.__auditRoutes = auditRoutes;
}

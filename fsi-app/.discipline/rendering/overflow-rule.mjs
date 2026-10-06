// overflow-rule.mjs (lane GATES-2, 2026-10-05): the ONE definition of the phone-width overflow rule, imported by
// the rendering guard (smoke/harness.mjs measureGuard + guard-assert.mjs, run-rendering-guard.mjs) AND by the
// live smoke gate (live/live-assertions.mjs, live/live-smoke.mjs). Npm-free: the pure rule is node-only and the
// browser collector takes a Playwright `page` from its caller.
//
// WHY. The guard measured `document`/`body` scrollWidth and the elements a spec marked
// `data-guard-container`. A theme strip 1108px wide inside a 375px screen sat in a `<main>` with
// `overflow-x: auto`, so the page never scrolled, the document check passed, and a customer panned sideways
// inside the page. The rule now covers EVERY scroll container the browser reports, not the ones a spec
// remembered to mark.
//
// THE RULE. At a phone width, for `document`, every `<main>` and every element whose computed overflow-x is
// `auto` or `scroll`:
//   - scrollWidth must be <= clientWidth + 1 (nothing is hidden behind a sideways pan), EXCEPT
//   - an element that declares an allowance attribute (OVERFLOW_ALLOW_ATTRS) may scroll inside its OWN box,
//     but that box must itself fit the viewport: a declared strip 1108px wide on a 375px screen is not "its
//     own scroll stays inside its box", it is the defect. Ancestors of a declared strip are still held to the
//     first clause, so a strip that pushes `<main>` wider than the screen still fails on `<main>`.

/** The allowance a scroller may declare. `data-overflow-allowed` is this rule's own name; `data-guard-strip`
 *  is the house vocabulary the guard already uses for "a strip that scrolls on purpose" (ux-assert.mjs). */
export const OVERFLOW_ALLOW_ATTRS = Object.freeze(["data-overflow-allowed", "data-guard-strip"]);

/** The rule applies at and below this viewport width (a phone). Wider tiers keep their own guards. */
export const NARROW_VIEWPORT_MAX_PX = 480;

export const OVERFLOW_TOLERANCE = 1;

/** True when the viewport is a phone width the rule applies to. */
export function isNarrowViewport(width) {
  return Number(width) > 0 && Number(width) <= NARROW_VIEWPORT_MAX_PX;
}

/**
 * Apply the rule to collected containers. PURE.
 * @param {{name:string, kind:'document'|'main'|'scroller', scrollWidth:number, clientWidth:number,
 *   boxRight?:number, boxWidth?:number, allowed?:boolean, className?:string}[]} containers
 * @param {{viewportWidth:number, tolerance?:number}} opts
 * @returns {{name:string, kind:string, reason:string, overflowBy:number}[]}
 */
export function detectContainerOverflows(containers, { viewportWidth, tolerance = OVERFLOW_TOLERANCE }) {
  if (!Array.isArray(containers)) return [];
  const out = [];
  for (const c of containers) {
    if (!c || /leaflet-container/.test(String(c.className ?? ""))) continue; // pans internally by design
    const over = Number(c.scrollWidth) - Number(c.clientWidth);
    if (c.allowed) {
      const right = Number(c.boxRight);
      if (Number.isFinite(right) && right > Number(viewportWidth) + tolerance) {
        out.push({
          name: c.name,
          kind: c.kind,
          overflowBy: Math.round(right - Number(viewportWidth)),
          reason: `declared scroller's own box runs ${Math.round(right - Number(viewportWidth))}px past the ${viewportWidth}px viewport (a declared strip must fit the screen; only its content may scroll)`,
        });
      }
      continue;
    }
    if (over > tolerance) {
      out.push({
        name: c.name,
        kind: c.kind,
        overflowBy: Math.round(over),
        reason: `${c.kind} scrollWidth ${c.scrollWidth}px vs clientWidth ${c.clientWidth}px (+${Math.round(over)}px hidden behind a sideways pan)`,
      });
    }
  }
  return out;
}

/** Failure lines for a caller's summary. `label` prefixes each line. PURE. */
export function formatContainerOverflows(label, hits) {
  if (hits.length === 0) return [];
  const detail = hits.slice(0, 6).map((h) => `${h.name}: ${h.reason}`).join("; ");
  return [`${label}: ${hits.length} scroll container(s) overflow at phone width, ${detail}${hits.length > 6 ? "; ..." : ""}`];
}

/**
 * Runs INSIDE the browser (serialised by page.evaluate): self-contained, no closure references.
 * @param {string[]} allowAttrs
 * @returns {{viewportWidth:number, containers:object[]}}
 */
export function collectContainersInPage(allowAttrs) {
  const describe = (el) => {
    const id = el.id ? `#${el.id}` : "";
    const part = el.getAttribute("data-part") || el.getAttribute("data-guard-container") || "";
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/)[0] : "";
    return `${el.tagName.toLowerCase()}${id}${part ? `[${part}]` : cls ? `.${cls}` : ""}`;
  };
  const allowedOf = (el) => allowAttrs.some((a) => el.hasAttribute(a));
  const vw = window.innerWidth;
  const containers = [];
  const de = document.documentElement;
  containers.push({
    name: "document",
    kind: "document",
    scrollWidth: de.scrollWidth,
    clientWidth: de.clientWidth,
    boxRight: de.getBoundingClientRect().right,
    allowed: false,
    className: "",
  });
  const seen = new Set();
  const consider = (el, kind) => {
    if (seen.has(el)) return;
    seen.add(el);
    const r = el.getBoundingClientRect();
    if (r.width <= 0 && r.height <= 0) return;
    containers.push({
      name: describe(el),
      kind,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      boxRight: r.right,
      allowed: allowedOf(el),
      className: typeof el.className === "string" ? el.className : "",
    });
  };
  for (const el of document.querySelectorAll("main")) consider(el, "main");
  for (const el of document.body.querySelectorAll("*")) {
    const ox = getComputedStyle(el).overflowX;
    if (ox === "auto" || ox === "scroll") consider(el, "scroller");
    if (containers.length >= 400) break;
  }
  return { viewportWidth: vw, containers };
}

/** Collect from a Playwright page. Returns `{viewportWidth, containers}`. */
export async function collectContainers(page) {
  return page.evaluate(collectContainersInPage, [...OVERFLOW_ALLOW_ATTRS]);
}

// rendering-guard fixtures — the EXTREME-DATA render fixtures (RENDER-1, 2026-07-11).
//
// Each fixture is a self-contained HTML document (or a markdown string) that reproduces an audited
// component's LAYOUT-DETERMINING DOM + CSS for a data extreme, in a GREEN (post-fix) and a RED
// (reconstructed pre-fix) variant. The RED variants are the red-then-green proof: the guard's
// detectors MUST fire on them; the GREEN variants MUST pass. Fidelity boundary (recorded honestly):
// the timeline strip is pure inline styles and is reproduced verbatim; the Tailwind-class fixes
// (L-4/L-5 break-all + min-w-0 + overflow-x-auto) are reproduced by their equivalent raw CSS with
// the class→CSS mapping commented. So these fixtures test the fix's LAYOUT CONTRACT, not the literal
// .tsx file. The F-1 and V-07 legs reuse the REAL app modules directly (no reproduction).

import { stripSourcesSection } from "../../src/lib/agent/brief-section-strip.mjs";

// ── The app's real breakpoint tiers (confirmed against src/app/globals.css 2026-07-11) plus the
//    device-emulated common widths. THIS is the first mobile/tablet verification — the source audit
//    ran at a 1297px browser floor, so < 1200px was never checked. ──────────────────────────────
export const VIEWPORTS = [380, 420, 480, 560, 640, 767, 768, 900, 960, 1100, 1200, 1440];

// CSS variables the components read (from globals.css / theme.css) — inlined so inline-style
// `var(--font-sans)` etc. resolve identically to production.
const ROOT_CSS = `
  :root{--font-sans:'Plus Jakarta Sans',system-ui,sans-serif;--color-text-muted:#6b6b6b;--color-surface:#fff;--color-ink:#1a1a1a;}
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;font-family:var(--font-sans);}
`;

/** Wrap fixture body in a self-contained document. `bodyPad` mimics the surface's page gutter. */
function doc(inner, { bodyPad = 16 } = {}) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${ROOT_CSS}
    body{padding:${bodyPad}px;}</style></head><body>${inner}</body></html>`;
}

const shortYear = (d) => new Date(d).getUTCFullYear();

// ── Timeline strip (L-1). Reproduces InteractiveTimeline's label row VERBATIM: a
//    `display:flex; justify-content:space-between` row of year-label buttons with RESPONSIVE side
//    margin `clamp(16px, 8vw, 40px)` (40px on desktop, ~30px at 380px) so the strip clears the card at
//    the narrowest breakpoint. Fixed 40px margins overflowed timeline-labels +11px @380px (RENDER-1 fix).
function timelineStrip(dates, { cap }) {
  // GREEN caps to the KEY set (component uses MAX_STRIP_NODES=8) with label-dedup: blank a label
  // equal to the previously RENDERED one, so a capped strip never shows a "202520252025" run.
  let shown = dates;
  if (cap) {
    const N = 8, total = dates.length;
    if (total > N) {
      const idx = [];
      for (let k = 0; k < N; k++) idx.push(Math.round((k * (total - 1)) / (N - 1)));
      shown = [...new Set(idx)].map((i) => dates[i]);
    }
  }
  const buttons = shown
    .map((d, i) => {
      const yr = String(shortYear(d));
      const label = cap && i > 0 && String(shortYear(shown[i - 1])) === yr ? "" : yr;
      return `<button data-guard-node style="font-family:var(--font-sans);background:none;border:none;cursor:pointer;padding:0;font-size:11px;font-weight:600;color:var(--color-text-muted)">${label}</button>`;
    })
    .join("");
  return `
    <div data-guard-container="timeline-card" style="max-width:640px;margin:0 auto;background:var(--color-surface);border:1px solid rgba(0,0,0,.1);border-radius:8px;padding:16px">
      <h3 style="font-size:13px;margin:0 0 8px">Confirmed Regulatory Timeline</h3>
      <div style="position:relative;height:4px;background:rgba(0,0,0,.08);border-radius:2px;margin:12px clamp(16px, 8vw, 40px) 0"></div>
      <div data-guard-container="timeline-labels" style="display:flex;justify-content:space-between;margin:10px clamp(16px, 8vw, 40px) 0">${buttons}</div>
    </div>`;
}

/** 40-milestone (g2/PPWR shape) date list. */
function manyMilestones(n = 40) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(`20${String(15 + Math.floor(i / 3)).padStart(2, "0")}-0${(i % 9) + 1}-01`);
  return out;
}

// ── Sources long-URL row (L-4/L-5). The EcoVadis / EU-climate long URLs. ──────────────────────
const LONG_URL =
  "https://climate.ec.europa.eu/eu-action/european-green-deal/delivering-european-green-deal/" +
  "carbon-border-adjustment-mechanism/implementing-and-delegated-acts-and-guidance-documents_en?" +
  "utm_source=caros-ledge&utm_medium=source-registry&utm_campaign=very-long-tracking-query-string-2026";

function sourcesUrlPanel({ wrap }) {
  // L-5: panel overflow-x:auto is the safety hatch. L-4: block flex anchor + break-all so ANY long
  // URL wraps.  GREEN → break-word + min-width:0 (Tailwind `break-all min-w-0`); RED → nowrap.
  const cellCss = wrap
    ? "word-break:break-all;overflow-wrap:anywhere;min-width:0"
    : "white-space:nowrap"; // pre-L-4: inline anchor never wrapped
  const panelCss = wrap ? "overflow-x:auto" : ""; // pre-L-5: no safety hatch
  return `
    <div data-guard-container="sources-panel" style="max-width:900px;margin:0 auto;border:1px solid rgba(0,0,0,.1);border-radius:8px;${panelCss}">
      <table style="width:100%;border-collapse:collapse;table-layout:fixed">
        <tbody>
          <tr>
            <td style="padding:8px;border-bottom:1px solid rgba(0,0,0,.06);${cellCss}">
              <a href="#" style="font-size:11px;color:#0645ad;${cellCss}">${LONG_URL}</a>
            </td>
          </tr>
        </tbody>
      </table>
    </div>`;
}

// ── Brief body with a "New Sources Identified" table (F-1). Rendered like the raw-markdown
//    accordion (react-markdown+remark-gfm turn a GFM table into <thead>/<tbody>). We render the
//    REAL post-strip markdown (GREEN) vs the reconstructed pre-fix strip output (RED). ───────────
const BRIEF_WITH_SOURCES_ARTIFACT = `# EU Packaging and Packaging Waste Regulation (PPWR)

## Summary
The regulation sets binding recyclability and recycled-content targets.

## 15. Sources
- Official Journal of the EU, Regulation (EU) 2025/40

## New Sources Identified
| Source Name | URL | Tier estimate | Why this source matters |
| --- | --- | --- | --- |
| Official Journal | https://eur-lex.europa.eu/x | 1 | Enacted text |
`;

/** The PRE-FIX stripSourcesSection (from git history, IntelligenceBrief.tsx @ 2c51d7d) — matched
 *  only /^sources\b/, so "## New Sources Identified" survived and rendered its header row verbatim.
 *  Reconstructed here as the RED proof; the GREEN path calls the REAL current stripSourcesSection. */
export function stripSourcesSectionPreFix(md) {
  const lines = String(md).split(/\r?\n/);
  const out = [];
  let skipping = false;
  let skipLevel = 0;
  for (const line of lines) {
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const title = h[2].replace(/^\s*\d+[.)]\s*/, "").replace(/\*\*/g, "").trim().toLowerCase();
      if (!skipping && level <= 2 && /^sources\b/.test(title)) { skipping = true; skipLevel = level; continue; }
      if (skipping && level <= skipLevel) skipping = false;
    }
    if (!skipping) out.push(line);
  }
  return out.join("\n").trimEnd();
}

/** Minimal GFM-table + heading → HTML (thead first row, tbody rest) — mirrors react-markdown's
 *  table output closely enough for a visible-text scan. Non-table lines become <p>/<h*>. */
export function markdownToHtml(md) {
  const lines = String(md).split(/\r?\n/);
  const html = [];
  let i = 0;
  const cells = (line) => line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  while (i < lines.length) {
    const line = lines[i];
    const isRow = /^\s*\|.*\|\s*$/.test(line);
    const isSep = i + 1 < lines.length && /^\s*\|?[\s:-]+\|[\s:|-]*$/.test(lines[i + 1]);
    if (isRow && isSep) {
      const head = cells(line);
      i += 2;
      const body = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { body.push(cells(lines[i])); i++; }
      html.push(
        `<table style="border-collapse:collapse"><thead><tr>${head.map((c) => `<th style="padding:6px;border:1px solid #ddd;font-size:12px">${c}</th>`).join("")}</tr></thead><tbody>${body
          .map((r) => `<tr>${r.map((c) => `<td style="padding:6px;border:1px solid #ddd;font-size:12px">${c}</td>`).join("")}</tr>`)
          .join("")}</tbody></table>`,
      );
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) html.push(`<h${h[1].length} style="font-size:14px">${h[2]}</h${h[1].length}>`);
    else if (line.trim()) html.push(`<p style="font-size:12px">${line}</p>`);
    i++;
  }
  return html.join("\n");
}

function briefDoc(md) {
  return `<div data-guard-container="brief-body" data-guard-scan-text style="max-width:760px;margin:0 auto">${markdownToHtml(md)}</div>`;
}

// ── The fixture set. Each: { id, cls, html, containers, expectOverflow, expectPlaceholder }. ────
export function buildFixtures() {
  return [
    // L-1 timeline overflow
    {
      id: "timeline-capped", cls: "L-1", expectOverflow: false, expectPlaceholder: false,
      html: doc(timelineStrip(manyMilestones(40), { cap: true })),
    },
    {
      id: "timeline-uncapped-PREFIX", cls: "L-1", expectOverflow: true, expectPlaceholder: false, red: true,
      html: doc(timelineStrip(manyMilestones(40), { cap: false })),
    },
    // L-4/L-5 long URL wrap
    {
      id: "sources-url-wrapped", cls: "L-4", expectOverflow: false, expectPlaceholder: false,
      html: doc(sourcesUrlPanel({ wrap: true })),
    },
    {
      id: "sources-url-nowrap-PREFIX", cls: "L-4", expectOverflow: true, expectPlaceholder: false, red: true,
      html: doc(sourcesUrlPanel({ wrap: false })),
    },
    // F-1 placeholder-literal in the raw-markdown brief accordion
    {
      id: "brief-stripped", cls: "F-1", expectOverflow: false, expectPlaceholder: false,
      html: doc(briefDoc(stripSourcesSection(BRIEF_WITH_SOURCES_ARTIFACT))),
    },
    {
      id: "brief-unstripped-PREFIX", cls: "F-1", expectOverflow: false, expectPlaceholder: true, red: true,
      html: doc(briefDoc(stripSourcesSectionPreFix(BRIEF_WITH_SOURCES_ARTIFACT))),
    },
    // Zero-data honest empty
    {
      id: "zero-data", cls: "L-1", expectOverflow: false, expectPlaceholder: false,
      html: doc(`<div data-guard-container="empty" style="max-width:640px;margin:0 auto;padding:24px;text-align:center;color:var(--color-text-muted)">No milestones recorded yet</div>`),
    },
  ];
}

export { BRIEF_WITH_SOURCES_ARTIFACT };

// fixtures-dash/fixtures.mjs — rendering-guard EXTREME-DATA fixtures for Lane DASH's dashboard
// five-surface rebalance + research credibility chips (2026-09-02). Same contract as the sibling
// fixtures.mjs one directory up (see that file's own header and .discipline/rendering/README.md):
// a self-contained HTML document per fixture, GREEN (current component's layout contract) + RED
// (the same markup with the specific overflow-safety CSS removed, proving the in-browser detector
// would catch a regression) variants, `{id, cls, expectOverflow, expectPlaceholder, html, red}`
// shape so `buildDashFixtures()` concatenates directly into the sibling file's `buildFixtures()`
// return array.
//
// REGISTRATION (fixtures.mjs and run-rendering-guard.mjs are coordinator-only per the wave2 plan;
// this lane reports the exact line rather than editing them):
//   1. fixtures.mjs: add `import { buildDashFixtures } from "./fixtures-dash/fixtures.mjs";` near the
//      top, and change `return [` in buildFixtures() to `return [...buildDashFixtures(),` (or append
//      `...buildDashFixtures()` before the closing `];`).
//   2. run-rendering-guard.mjs: no change needed — it only calls buildFixtures(), so fixture data
//      flows through unchanged once (1) is done.
//
// WHY THESE TWO COMPONENTS: both are NEW in this lane and both put unbounded, DB-sourced text
// (an item title / a bias-tag detail string) inside a CSS flex row — the exact shape of layout bug
// this guard exists to catch (see the sibling file's L-1/L-4 fixtures for the established pattern).
// Both already carry the fix in the live .tsx (SurfacePulseCard's title/meta column already had
// `minWidth: 0` + `overflowWrap: "anywhere"`; CredibilityChipShared's GradeModifierLedger detail
// span did NOT and was given the same fix as part of this lane's work — see its file header). The RED
// variant here is what CredibilityChipShared would have overflowed at without that fix.

const ROOT_CSS = `
  :root{--color-text-primary:#1a1a1a;--color-text-secondary:#3a3a3a;--color-text-muted:#6b6b6b;--color-border:#ddd;--color-border-subtle:#eee;--reg-band-action:#b45309;}
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;font-family:system-ui,sans-serif;}
`;

function doc(inner, { bodyPad = 16 } = {}) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${ROOT_CSS}
    body{padding:${bodyPad}px;}</style></head><body>${inner}</body></html>`;
}

// A single unbroken 96-char token — the extreme-data case: a title/detail string with no natural
// break point (unlike normal prose, which wraps at spaces regardless of overflow-wrap). This is what
// actually forces overflow absent `overflow-wrap:anywhere` + a flex child's `min-width:0`.
const LONG_UNBROKEN =
  "regulationinstrumentcitationidentifierwithnowhitespaceatallandnomeaningfulbreakpointforawrappingengine12345";

// ── SurfacePulseCard list item (src/components/dashboard/SurfacePulseCard.tsx). Reproduces the
//    `<li><Link style="display:flex">` row VERBATIM: fixed-width priority bar (flex-shrink:0) +
//    title/meta column. GREEN carries the live component's `minWidth:0` (on the column) and
//    `overflowWrap:"anywhere"` (on the title paragraph); RED omits both, reproducing the overflow a
//    flex child with unconstrained min-width would exhibit for an unbroken long title. ──────────
function pulseCardRow({ safe }) {
  const colCss = safe ? "min-width:0" : "";
  const titleCss = safe
    ? "font-size:12.5px;font-weight:700;margin:0;line-height:1.35;overflow-wrap:anywhere"
    : "font-size:12.5px;font-weight:700;margin:0;line-height:1.35";
  return `
    <div data-guard-container="pulse-card" style="background:#fff;border:1px solid var(--color-border);border-radius:8px;padding:14px 16px">
      <p style="font-size:10px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--color-text-muted);margin:0 0 8px">Market Intel</p>
      <ul style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px">
        <li>
          <a href="#" style="display:flex;gap:9px;text-decoration:none;color:inherit">
            <span aria-hidden="true" style="width:3px;border-radius:2px;align-self:stretch;flex-shrink:0;background:var(--reg-band-action)"></span>
            <div style="${colCss}">
              <p style="${titleCss}">${LONG_UNBROKEN} corridor rate signal, Shanghai to Rotterdam</p>
              <p style="font-size:11px;color:var(--color-text-muted);margin:2px 0 0">Xeneta · €3,650 · 12 Aug</p>
            </div>
          </a>
        </li>
      </ul>
    </div>`;
}

// ── CredibilityChipShared GradeModifierLedger row (src/components/research/CredibilityChipShared.tsx).
//    Reproduces the modifier row VERBATIM: fixed-width status label (flex-shrink:0) + detail span.
//    GREEN carries the fix this lane added (`minWidth:0` + `overflowWrap:"anywhere"` on the detail
//    span); RED omits both — a source_bias_tags detail string with no natural break point would
//    overflow the panel without it. ──────────────────────────────────────────────────────────────
function gradeModifierRow({ safe }) {
  const detailCss = safe
    ? "font-size:11px;color:var(--color-text-secondary);line-height:1.45;min-width:0;overflow-wrap:anywhere"
    : "font-size:11px;color:var(--color-text-secondary);line-height:1.45";
  return `
    <div data-guard-container="grade-modifier-panel" style="display:block;width:100%;padding:8px 10px;border:1px solid var(--color-border);border-radius:6px;background:#fff">
      <p style="font-size:9px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--color-text-muted);margin:0 0 6px">GRADE modifier ledger</p>
      <div style="display:flex;gap:8px;align-items:baseline">
        <span style="font-size:9px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;min-width:62px;flex-shrink:0;color:var(--reg-band-action)">Flagged</span>
        <span style="${detailCss}">
          <span style="font-weight:700;color:var(--color-text-primary)">Risk of bias</span>
          &nbsp;&mdash;&nbsp;funding: ${LONG_UNBROKEN} (confidence 87%)
        </span>
      </div>
    </div>`;
}

export function buildDashFixtures() {
  return [
    {
      id: "dash-pulse-card-long-title",
      cls: "L-1",
      expectOverflow: false,
      expectPlaceholder: false,
      html: doc(pulseCardRow({ safe: true })),
    },
    {
      id: "dash-pulse-card-long-title-PREFIX",
      cls: "L-1",
      expectOverflow: true,
      expectPlaceholder: false,
      red: true,
      html: doc(pulseCardRow({ safe: false })),
    },
    {
      id: "dash-grade-modifier-detail-long",
      cls: "L-1",
      expectOverflow: false,
      expectPlaceholder: false,
      html: doc(gradeModifierRow({ safe: true })),
    },
    {
      id: "dash-grade-modifier-detail-long-PREFIX",
      cls: "L-1",
      expectOverflow: true,
      expectPlaceholder: false,
      red: true,
      html: doc(gradeModifierRow({ safe: false })),
    },
  ];
}

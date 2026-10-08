// live-content.mjs (lane SMOKE-2, 2026-10-08): the Live smoke gate checks CONTENT, not only status. Until now the gate
// proved a page loaded without overflow, a leaked marker or an admin link; it never proved that the elements the
// design places on a page are there and say something. A grade chip, a tier square, the bias chips, the Connected
// intelligence section, the Inferences section and the dashboard rail could all vanish and the gate stayed green
// (remaining-build register 2026-10-06, item S8-6 and section 7, "surface proof").
//
// One requirement per element and page kind. Each names the page kind, the selector, the scope and the minimum
// content (text length, a text pattern, a child count). The browser side only MEASURES (live-snapshot.mjs
// collectContentInPage returns plain numbers); every judgement here is pure, so each requirement has a present
// fixture that passes and an absent fixture that fails (live-content.test.mjs) and the browser run cannot disagree
// with the unit proof. No imports: node builtins are not even needed.
//
// SCOPE. `each`: every page of the kind, at each viewport, must carry the element (the home page; every list row
// set). `any`: at least one page of the kind at that viewport must carry it. Conditional elements (a Catalogue
// record chip exists only on a record-grade item, a bias chip only on an item whose source has bias tags, the
// Inferences section only on an item with a visible inference) are `any`, because the smoke account visits a small
// fixed set of items and one item legitimately lacks any one of them; the corpus as a whole does not, and an element
// absent from EVERY visited page of its kind is the defect this gate exists to catch.
//
// VISIBLE ONLY. The row renders a desktop and a phone copy of its meta line and CSS hides one; a hidden copy is not
// content a customer receives. The collector counts visible elements only, so 375 and 1440 are each judged on what
// that width shows.

/** Invariant ids, one per element. live-assertions.mjs spreads these into INVARIANTS. */
export const CONTENT_INVARIANT_IDS = Object.freeze({
  GRADE_CHIP: "content-grade-chip",
  BIAS_CHIPS: "content-bias-chips",
  TIER_SQUARE: "content-tier-square",
  CONNECTED_SECTION: "content-connected-intelligence",
  INFERENCES_SECTION: "content-inferences-section",
  ACROSS_PAGES_RAIL: "content-across-pages-rail",
});

/** @typedef {{key:string, invariant:string, element:string, kind:'home'|'list'|'detail', scope:'each'|'any', selector:string, minCount:number, textMin:number, textPattern?:string, childSelector?:string, childMin?:number}} ContentRequirement */

/** @type {readonly ContentRequirement[]} */
export const CONTENT_REQUIREMENTS = Object.freeze(
  [
    // Grade chip: GradeChip renders "Catalogue record" for a record-grade item only, on list rows (P2, PR 947).
    { key: "grade-chip@list", invariant: CONTENT_INVARIANT_IDS.GRADE_CHIP, element: "grade chip", kind: "list", scope: "any", selector: '[data-part="chip-grade"]', minCount: 1, textMin: 8 },
    // Bias chips: BiasChips draws one [data-bias-tag] chip per source bias tag, on list rows and detail mastheads.
    { key: "bias-chips@list", invariant: CONTENT_INVARIANT_IDS.BIAS_CHIPS, element: "bias chips", kind: "list", scope: "any", selector: '[data-part="bias-chips"]', minCount: 1, textMin: 3, childSelector: "[data-bias-tag]", childMin: 1 },
    { key: "bias-chips@detail", invariant: CONTENT_INVARIANT_IDS.BIAS_CHIPS, element: "bias chips", kind: "detail", scope: "any", selector: '[data-part="bias-chips"]', minCount: 1, textMin: 3, childSelector: "[data-bias-tag]", childMin: 1 },
    // Tier square: TierChip, a bordered "T<n>" square. Every list carries rated rows; a detail masthead carries it
    // when the item's source is rated.
    { key: "tier-square@list", invariant: CONTENT_INVARIANT_IDS.TIER_SQUARE, element: "tier square", kind: "list", scope: "each", selector: '[data-part="chip-tier"]', minCount: 1, textMin: 2, textPattern: "^T\\d+$" },
    { key: "tier-square@detail", invariant: CONTENT_INVARIANT_IDS.TIER_SQUARE, element: "tier square", kind: "detail", scope: "any", selector: '[data-part="chip-tier"]', minCount: 1, textMin: 2, textPattern: "^T\\d+$" },
    // Connected intelligence: the one cross-page section (DOM id across-pages, header "Connected intelligence").
    { key: "connected-intelligence@detail", invariant: CONTENT_INVARIANT_IDS.CONNECTED_SECTION, element: "Connected intelligence section", kind: "detail", scope: "any", selector: "#across-pages", minCount: 1, textMin: 60, textPattern: "Connected intelligence", childSelector: '[data-guard-container="cross-page"]', childMin: 1 },
    // Inferences: the one inference section (DOM id inferences); it holds at least one inference card.
    { key: "inferences-section@detail", invariant: CONTENT_INVARIANT_IDS.INFERENCES_SECTION, element: "Inferences section", kind: "detail", scope: "any", selector: "#inferences", minCount: 1, textMin: 60, textPattern: "Inferences", childSelector: '[data-figure-kind="inference"]', childMin: 1 },
    // Across pages rail: the dashboard's "Across the platform" rail card, whose "Connected across pages" list holds the
    // four surface stat links plus at least one cross-page theme link.
    { key: "across-pages-rail@home", invariant: CONTENT_INVARIANT_IDS.ACROSS_PAGES_RAIL, element: "Across pages rail", kind: "home", scope: "each", selector: '[data-audit="across-platform-card"]', minCount: 1, textMin: 100, textPattern: "Connected across pages", childSelector: "a[href]", childMin: 5 },
  ].map((r) => Object.freeze(r)),
);

/** The requirements that apply to one page kind. */
export const requirementsForKind = (kind) => CONTENT_REQUIREMENTS.filter((r) => r.kind === kind);

const squash = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const trunc = (s, n = 420) => {
  const t = squash(s);
  return t.length > n ? `${t.slice(0, n)}...` : t;
};
const pathOf = (u) => {
  try { return new URL(u).pathname; } catch { return String(u ?? ""); }
};

/**
 * Judge one requirement against the measurements the browser took on one page. PURE.
 * @param {ContentRequirement} req
 * @param {{textLength:number, children:number, matches:boolean, text?:string}[]|undefined} measured visible matches
 * @returns {{ok:boolean, reason:string|null}}
 */
export function judgeRequirement(req, measured) {
  const list = Array.isArray(measured) ? measured : [];
  const qualifying = list.filter(
    (m) => Number(m.textLength) >= req.textMin && (req.childSelector ? Number(m.children) >= (req.childMin ?? 1) : true) && (req.textPattern ? m.matches === true : true),
  );
  if (qualifying.length >= req.minCount) return { ok: true, reason: null };
  const need = [`text length >= ${req.textMin}`];
  if (req.textPattern) need.push(`text matching /${req.textPattern}/i`);
  if (req.childSelector) need.push(`>= ${req.childMin ?? 1} of ${req.childSelector}`);
  const best = list.reduce((b, m) => (Number(m.textLength) > Number(b?.textLength ?? -1) ? m : b), null);
  const seen = list.length === 0 ? "no visible match" : `${list.length} visible, none qualifying (longest text ${best.textLength}, ${best.children} child match(es), pattern ${best.matches ? "met" : "not met"})`;
  return { ok: false, reason: `missing ${req.element}: expected ${req.minCount}+ visible ${req.selector} with ${need.join(", ")}; found ${seen}` };
}

const finding = (req, snap, text) => ({
  invariant: req.invariant,
  url: snap.url,
  viewport: snap.viewport?.width ?? 0,
  method: "GET",
  status: snap.status ?? null,
  path: pathOf(snap.url),
  text: trunc(`${snap.kind} page: ${text}`),
  severity: "fail",
});

/**
 * The `each` requirements for one page snapshot. PURE. A snapshot with no `content` (a run without content checks, or a
 * page that never loaded) yields nothing; a logged-out redirect is the session invariant's, not this one's.
 * @param {{url:string, kind:string, viewport:{width:number}, status?:number|null, redirectedToLogin?:boolean, content?:Record<string,object[]>|null}} snap
 */
export function checkContentSnapshot(snap) {
  if (!snap || snap.redirectedToLogin || !snap.content) return [];
  const out = [];
  for (const req of requirementsForKind(snap.kind)) {
    if (req.scope !== "each") continue;
    const j = judgeRequirement(req, snap.content[req.key]);
    if (!j.ok) out.push(finding(req, snap, j.reason));
  }
  return out;
}

/**
 * The `any` requirements over a whole run. PURE. For each viewport and requirement, at least one usable page of the
 * kind must satisfy it. No page of the kind at all is itself a failure (a gate that cannot find the page it must judge
 * has not passed it); when every page of the kind was a logged-out redirect only the session invariant speaks.
 * @param {object[]} snaps the page snapshots a run collected (same shape as checkContentSnapshot)
 */
export function checkContentRun(snaps) {
  const withContent = (snaps ?? []).filter((s) => s && s.content);
  if (withContent.length === 0) return [];
  const widths = [...new Set(withContent.map((s) => s.viewport?.width ?? 0))];
  const out = [];
  for (const req of CONTENT_REQUIREMENTS) {
    if (req.scope !== "any") continue;
    for (const width of widths) {
      const ofKind = withContent.filter((s) => s.kind === req.kind && (s.viewport?.width ?? 0) === width);
      if (ofKind.length === 0) {
        const anchor = withContent.find((s) => (s.viewport?.width ?? 0) === width);
        out.push(finding(req, { ...anchor, kind: req.kind }, `no ${req.kind} page was visited at ${width}px, so ${req.element} could not be checked`));
        continue;
      }
      const usable = ofKind.filter((s) => !s.redirectedToLogin);
      if (usable.length === 0) continue;
      if (usable.some((s) => judgeRequirement(req, s.content[req.key]).ok)) continue;
      const bestReason = judgeRequirement(req, usable[0].content[req.key]).reason;
      out.push(finding(req, usable[0], `${bestReason} (none of ${usable.length} ${req.kind} page${usable.length === 1 ? "" : "s"} at ${width}px carried it: ${usable.map((s) => pathOf(s.url)).join(", ")})`));
    }
  }
  return out;
}

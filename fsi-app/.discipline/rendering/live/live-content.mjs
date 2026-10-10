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
// CONDITIONAL INVARIANTS FROM LIVE DATA (lane SMOKE-3, 2026-10-10). SMOKE-2 judged the conditional elements over a fixed
// handful of items, so the gate was red on every production deployment while the corpus held no candidate at all (or
// held one the fixed items did not include). A conditional requirement now names its `candidate` class
// (live-candidates.mjs: inference, record, bias). The runner is handed what the LIVE DATA says about that class and
// the outcome is one of three, never a silent pass:
//   PASS  the element is on a visited candidate page (a detail requirement is judged ONLY on the candidate pages the
//         runner visited because the data says they must carry it);
//   FAIL  candidates exist and the element is missing from every candidate page (the defect this gate exists to catch);
//   HOLD  the corpus holds zero candidates (or the candidates were not resolved): absent data is expected during the
//         population hold (CLAUDE.md rule 16), so there is nothing to judge. A HOLD names the invariant and the count,
//         is reported and recorded in the run's report, and turns into a FAIL the moment one candidate exists.
//
// THE LIST SIDE (lane SMOKE-4, 2026-10-10). A LIST requirement of a conditional class (the record-grade chip, the bias chips
// on rows) was still judged over whichever list pages the runner visited: the first page of each list. A corpus whose
// record-grade items sit past that first page failed the grade chip invariant though every candidate was fine. The
// chooser now also names, per class, `listVisit`: list URLs filtered (`?q=<title>`) to a candidate's row, so the row is on the
// page by construction. A list requirement is then judged ONLY on those candidate list pages (an unfiltered list can neither
// rescue nor fail it), exactly as a detail requirement is judged only on the candidate detail pages. Three outcomes:
//   PASS / FAIL  as above, per viewport, FAIL when a candidate list page was never checked;
//   HOLD         candidates exist but no list page could be chosen (no candidate has a title to search for): named, carrying the count;
//   legacy       a candidate file with no `listVisit` key (written before this lane) is judged over every list page as before.
// A candidate list page is flagged `candidateList` by the runner; the `each` requirements (a tier square on every list) are not
// asked of a page filtered to one row, whose source need not be rated, but every other invariant still applies to it.

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

/** @typedef {{key:string, invariant:string, element:string, kind:'home'|'list'|'detail', scope:'each'|'any', selector:string, minCount:number, textMin:number, textPattern?:string, childSelector?:string, childMin?:number, candidate?:'inference'|'record'|'bias'}} ContentRequirement
 *  `candidate` marks a CONDITIONAL requirement: the element exists only on items of that class (live-candidates.mjs). */

/** @type {readonly ContentRequirement[]} */
export const CONTENT_REQUIREMENTS = Object.freeze(
  [
    // Grade chip: GradeChip renders "Catalogue record" for a record-grade item only, on list rows (P2, PR 947).
    { key: "grade-chip@list", invariant: CONTENT_INVARIANT_IDS.GRADE_CHIP, element: "grade chip", kind: "list", scope: "any", selector: '[data-part="chip-grade"]', minCount: 1, textMin: 8, candidate: "record" },
    // Bias chips: BiasChips draws one [data-bias-tag] chip per source bias tag, on list rows and detail mastheads.
    { key: "bias-chips@list", invariant: CONTENT_INVARIANT_IDS.BIAS_CHIPS, element: "bias chips", kind: "list", scope: "any", selector: '[data-part="bias-chips"]', minCount: 1, textMin: 3, childSelector: "[data-bias-tag]", childMin: 1, candidate: "bias" },
    { key: "bias-chips@detail", invariant: CONTENT_INVARIANT_IDS.BIAS_CHIPS, element: "bias chips", kind: "detail", scope: "any", selector: '[data-part="bias-chips"]', minCount: 1, textMin: 3, childSelector: "[data-bias-tag]", childMin: 1, candidate: "bias" },
    // Tier square: TierChip, a bordered "T<n>" square. Every list carries rated rows; a detail masthead carries it
    // when the item's source is rated.
    { key: "tier-square@list", invariant: CONTENT_INVARIANT_IDS.TIER_SQUARE, element: "tier square", kind: "list", scope: "each", selector: '[data-part="chip-tier"]', minCount: 1, textMin: 2, textPattern: "^T\\d+$" },
    { key: "tier-square@detail", invariant: CONTENT_INVARIANT_IDS.TIER_SQUARE, element: "tier square", kind: "detail", scope: "any", selector: '[data-part="chip-tier"]', minCount: 1, textMin: 2, textPattern: "^T\\d+$" },
    // Connected intelligence: the one cross-page section (DOM id across-pages, header "Connected intelligence").
    { key: "connected-intelligence@detail", invariant: CONTENT_INVARIANT_IDS.CONNECTED_SECTION, element: "Connected intelligence section", kind: "detail", scope: "any", selector: "#across-pages", minCount: 1, textMin: 60, textPattern: "Connected intelligence", childSelector: '[data-guard-container="cross-page"]', childMin: 1 },
    // Inferences: the one inference section (DOM id inferences); it holds at least one inference card.
    { key: "inferences-section@detail", invariant: CONTENT_INVARIANT_IDS.INFERENCES_SECTION, element: "Inferences section", kind: "detail", scope: "any", selector: "#inferences", minCount: 1, textMin: 60, textPattern: "Inferences", childSelector: '[data-figure-kind="inference"]', childMin: 1, candidate: "inference" },
    // Across pages rail: the dashboard's "Across the platform" rail card, whose "Connected across pages" list holds the
    // four surface stat links plus at least one cross-page theme link.
    { key: "across-pages-rail@home", invariant: CONTENT_INVARIANT_IDS.ACROSS_PAGES_RAIL, element: "Across pages rail", kind: "home", scope: "each", selector: '[data-audit="across-platform-card"]', minCount: 1, textMin: 100, textPattern: "Connected across pages", childSelector: "a[href]", childMin: 5 },
  ].map((r) => Object.freeze(r)),
);

/** The candidate classes a LIST requirement is conditional on: the runner visits their `listVisit` pages (lane SMOKE-4). */
export const LIST_CANDIDATE_CLASSES = Object.freeze([...new Set(CONTENT_REQUIREMENTS.filter((r) => r.candidate && r.kind === "list").map((r) => r.candidate))]);

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
  if (!snap || snap.redirectedToLogin || !snap.content || snap.candidateList) return [];
  const out = [];
  for (const req of requirementsForKind(snap.kind)) {
    if (req.scope !== "each") continue;
    const j = judgeRequirement(req, snap.content[req.key]);
    if (!j.ok) out.push(finding(req, snap, j.reason));
  }
  return out;
}

/** Compare two paths ignoring percent-encoding, so a candidate path and a page URL agree. */
const samePath = (a, b) => {
  const dec = (x) => { try { return decodeURIComponent(x); } catch { return String(x); } };
  return dec(a) === dec(b);
};
/** The path AND query of a page URL (a candidate list page is identified by its `?q=`). */
const pathAndSearchOf = (u) => {
  try { const p = new URL(u); return `${p.pathname}${p.search}`; } catch { return String(u ?? ""); }
};

/**
 * The candidate record of one class, or null when candidates were never resolved. PURE.
 * @param {{resolved?:boolean, classes?:Record<string,{count:number, visit?:string[], sample?:string[]}>}|null|undefined} candidates
 */
const classOf = (candidates, name) => (candidates && candidates.resolved === true ? candidates.classes?.[name] ?? { count: 0, visit: [], sample: [] } : null);

/**
 * The HOLD result of a conditional requirement: not a pass and not a failure, a named state carrying the invariant and
 * the candidate count. `count` is null when the candidates were not resolved at all. PURE.
 */
const holdOf = (req, count) => ({
  state: "hold",
  invariant: req.invariant,
  key: req.key,
  element: req.element,
  kind: req.kind,
  candidate: req.candidate,
  candidates: count,
  reason:
    count === null
      ? `candidates for ${req.element} were not resolved (no database credentials in this run), so it could not be judged`
      : `${count} ${req.candidate} candidate item(s) in the corpus, so ${req.element} has nothing to appear on (expected during the population hold)`,
});

/**
 * The `any` requirements over a whole run, as { findings, holds }. PURE.
 *
 * An UNCONDITIONAL requirement (no `candidate`): for each viewport at least one usable page of the kind must satisfy it;
 * no page of the kind at all is itself a failure (a gate that cannot find the page it must judge has not passed it);
 * when every page of the kind was a logged-out redirect only the session invariant speaks.
 *
 * A CONDITIONAL requirement (`candidate`, lane SMOKE-3): `candidates` is what the live data says (live-candidates.mjs).
 * Zero candidates, or candidates never resolved, is a HOLD (one per requirement, not per viewport). With candidates, a
 * list requirement is judged over the list pages as before; a detail requirement is judged over the CANDIDATE pages
 * the runner visited (the data says they must carry the element), and missing from all of them is a FAIL.
 *
 * @param {object[]} snaps the page snapshots a run collected (same shape as checkContentSnapshot)
 * @param {object|null} [candidates] the resolved candidates, or null/undefined when not resolved
 */
export function judgeContentRun(snaps, candidates) {
  const withContent = (snaps ?? []).filter((s) => s && s.content);
  if (withContent.length === 0) return { findings: [], holds: [] };
  const widths = [...new Set(withContent.map((s) => s.viewport?.width ?? 0))];
  const findings = [];
  const holds = [];
  for (const req of CONTENT_REQUIREMENTS) {
    if (req.scope !== "any") continue;
    const cls = req.candidate ? classOf(candidates, req.candidate) : null;
    if (req.candidate) {
      if (cls === null) { holds.push(holdOf(req, null)); continue; }
      if (cls.count === 0) { holds.push(holdOf(req, 0)); continue; }
      if (req.kind === "list" && Array.isArray(cls.listVisit) && cls.listVisit.length === 0) {
        holds.push({ ...holdOf(req, cls.count), reason: `${cls.count} ${req.candidate} candidate item(s) exist but no list page could be chosen to show one (none has a title to search for), so ${req.element} could not be judged` });
        continue;
      }
    }
    const candidatePaths = req.candidate && req.kind === "detail" ? cls.visit ?? [] : null;
    const candidateLists = req.candidate && req.kind === "list" && Array.isArray(cls.listVisit) ? cls.listVisit : null;
    for (const width of widths) {
      let ofKind = withContent.filter((s) => s.kind === req.kind && (s.viewport?.width ?? 0) === width);
      if (candidatePaths) ofKind = ofKind.filter((s) => candidatePaths.some((p) => samePath(p, pathOf(s.url))));
      if (candidateLists) ofKind = ofKind.filter((s) => candidateLists.some((p) => samePath(p, pathAndSearchOf(s.url))));
      if (ofKind.length === 0) {
        const anchor = withContent.find((s) => (s.viewport?.width ?? 0) === width);
        const chosen = candidatePaths ?? candidateLists;
        const why = chosen
          ? `${cls.count} ${req.candidate} candidate item(s) exist (${chosen.join(", ") || "none chosen"}) but no candidate page was checked at ${width}px, so ${req.element} could not be judged`
          : `no ${req.kind} page was visited at ${width}px, so ${req.element} could not be checked`;
        findings.push(finding(req, { ...anchor, kind: req.kind }, why));
        continue;
      }
      const usable = ofKind.filter((s) => !s.redirectedToLogin);
      if (usable.length === 0) continue;
      if (usable.some((s) => judgeRequirement(req, s.content[req.key]).ok)) continue;
      const bestReason = judgeRequirement(req, usable[0].content[req.key]).reason;
      const scope = candidatePaths || candidateLists ? `${cls.count} ${req.candidate} candidate item(s) exist, none of the ${usable.length} candidate page${usable.length === 1 ? "" : "s"}` : `none of ${usable.length} ${req.kind} page${usable.length === 1 ? "" : "s"}`;
      findings.push(finding(req, usable[0], `${bestReason} (${scope} at ${width}px carried it: ${usable.map((s) => pathOf(s.url)).join(", ")})`));
    }
  }
  return { findings, holds };
}

/** The failures of judgeContentRun, for callers that do not report holds. PURE. */
export function checkContentRun(snaps, candidates) {
  return judgeContentRun(snaps, candidates).findings;
}

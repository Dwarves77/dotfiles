// Run: node --test scripts/maintenance/canonical-autoverify.test.mjs — no DB, no network, everything
// injected. Pure-function tests come first (each cites the live pending row it was written from — see
// canonical-autoverify.mjs's own header); the main() tests below exercise the whole decide/apply loop
// with a fixture of the 16 real pending rows this lane read from Supabase 2026-09-06.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isDeadStatus,
  classifyReachability,
  classifyPageClass,
  significantWords,
  wordsOverlapLocated,
  phraseLocated,
  institutionNameCandidates,
  institutionLocated,
  proveContent,
  existingTierForHost,
  linkedCurrentTier,
  checkAuthority,
  decideRow,
  main,
  makeCanonicalFetchCandidate,
  previousWallAttempts,
} from "./canonical-autoverify.mjs";

// ── REACHABILITY ──────────────────────────────────────────────────────────────────────────────────────

test("isDeadStatus: 404/410/5xx are dead, 200/301/403 are not", () => {
  assert.equal(isDeadStatus(404), true);
  assert.equal(isDeadStatus(410), true);
  assert.equal(isDeadStatus(503), true);
  assert.equal(isDeadStatus(200), false);
  assert.equal(isDeadStatus(403), false);
});

test("classifyReachability: a fetch error rejects with the error text, never silently", () => {
  const r = classifyReachability({ error: new Error("DNS lookup failed") });
  assert.equal(r.ok, false);
  assert.match(r.reason, /DNS lookup failed/);
});

test("classifyReachability: 404 rejects naming the code (row 6b5cf9ab NREL storage-futures at candidate-creation time)", () => {
  const r = classifyReachability({ status: 404, text: "" });
  assert.equal(r.ok, false);
  assert.match(r.reason, /404/);
});

test("classifyReachability: a login wall (row 6f26a2db LR client portal) rejects via the reused access-wall detector", () => {
  const r = classifyReachability({ status: 200, text: "Please sign in to continue to access your account." });
  assert.equal(r.ok, false);
  assert.match(r.reason, /access wall/);
});

test("classifyReachability: real 200 content passes", () => {
  const r = classifyReachability({ status: 200, text: "H2Accelerate TRUCKS is an innovative European collaboration of 15 partners." });
  assert.equal(r.ok, true);
});

test("classifyReachability: a fetch error is flagged transient — not proof the page is dead (lane CANONICAL-AUTOVERIFY-2, 2026-09-06: this routes to 'deferred', never 'rejected')", () => {
  const r = classifyReachability({ error: new Error("Browserless hard-error: upstream timeout") });
  assert.equal(r.ok, false);
  assert.equal(r.transient, true);
});

test("classifyReachability: a dead HTTP status is NOT transient — it is a confirmed verdict", () => {
  const r = classifyReachability({ status: 404, text: "" });
  assert.equal(r.ok, false);
  assert.equal(r.transient, undefined);
});

// ── PAGE CLASS ────────────────────────────────────────────────────────────────────────────────────────

test("classifyPageClass: login gateway (row 6f26a2db, lr.org sign-in-client-portal)", () => {
  const c = classifyPageClass({ url: "https://www.lr.org/en/services/classification-certification/sign-in-client-portal/", title: "LR Client Portal – Fleet Data & Analytics" });
  assert.equal(c.kind, "login_gateway");
});

test("classifyPageClass: about page by url (row 44fa2c94, wri.org/about)", () => {
  const c = classifyPageClass({ url: "https://www.wri.org/about", title: "About WRI | World Resources Institute" });
  assert.equal(c.kind, "about_page");
});

test("classifyPageClass: about page by title, non-English url (row f41f4db7, smartport.nl/en/over-ons/)", () => {
  const c = classifyPageClass({ url: "https://smartport.nl/en/over-ons/", title: "About Us – SmartPort" });
  assert.equal(c.kind, "about_page");
});

test("classifyPageClass: directory index (row 2cd4e255, tyndall.ac.uk/reports/)", () => {
  const c = classifyPageClass({ url: "https://tyndall.ac.uk/reports/", title: "Reports – Tyndall Centre for Climate Change Research" });
  assert.equal(c.kind, "directory_index");
});

test("classifyPageClass: press release (row 69398a99, lr.org acquisition announcement)", () => {
  const c = classifyPageClass({ url: "https://www.lr.org/en/knowledge/press-room/press-listing/press-release/lr-to-acquire-c-map-commercial-from-navico-group/", title: "Acquisition of C-MAP Commercial from Navico Group | LR" });
  assert.equal(c.kind, "press_release");
});

test("classifyPageClass: aggregator datacard (row 53630325, lobbyfacts.eu eFuel Alliance)", () => {
  const c = classifyPageClass({ url: "https://www.lobbyfacts.eu/datacard/efuel-alliance?rid=312446938719-11", title: "eFuel Alliance | lobbyfacts", host: "lobbyfacts.eu" });
  assert.equal(c.kind, "aggregator_datacard");
});

test("classifyPageClass: aggregator tracker (row 9d54f8ae, climate-laws.org Singapore Green Plan)", () => {
  const c = classifyPageClass({ url: "https://climate-laws.org/document/singapore-green-plan-2030_2edd", title: "Singapore Green Plan 2030 - Climate Change Laws of the World", host: "climate-laws.org" });
  assert.equal(c.kind, "aggregator_datacard");
});

test("classifyPageClass: aggregator directory (row b0cdc058, European Hydrogen Observatory)", () => {
  const c = classifyPageClass({ url: "https://observatory.clean-hydrogen.europa.eu/directory/yara-clean-ammonia-yara-international", title: "Yara Clean Ammonia (Yara International) | European Hydrogen Observatory", host: "observatory.clean-hydrogen.europa.eu" });
  assert.equal(c.kind, "aggregator_datacard");
});

test("classifyPageClass: a genuine topic page (row 643f8625, Fraunhofer IML sustainability) is not rejected", () => {
  const c = classifyPageClass({ url: "https://www.iml.fraunhofer.de/en/topics/more-efficiency-through-new-technologies-sustainability-in-logistics.html", title: "How can logistics become more resource-efficient and produce fewer emissions? – Fraunhofer IML" });
  assert.equal(c, null);
});

// ── CONTENT PROOF ─────────────────────────────────────────────────────────────────────────────────────

test("significantWords: keeps short meaningful tokens (H2), drops stopwords", () => {
  assert.deepEqual(significantWords("H2 Accelerate and the Trucks"), ["h2", "accelerate", "trucks"]);
});

test("wordsOverlapLocated: bridges a title's spacing difference from the page's own concatenated brand (row 1b70ca74, H2 Accelerate vs H2Accelerate)", () => {
  const r = wordsOverlapLocated("H2 Accelerate", "H2Accelerate TRUCKS is an innovative European collaboration.");
  assert.equal(r.located, true);
});

test("phraseLocated: prefers the exact verbatim locate when it works", () => {
  const r = phraseLocated("Green Corridors", "The Next Wave: Green Corridors");
  assert.equal(r.located, true);
  assert.notEqual(r.method, "word_overlap");
});

test("institutionNameCandidates: no parenthesis -> the string alone", () => {
  assert.deepEqual(institutionNameCandidates("DNV"), ["DNV"]);
});

test("institutionNameCandidates: splits into whole / before-paren / inside-paren, tolerating nested parens (row 7aae8bba live publisher string, 2026-09-06)", () => {
  const full = "GreenBlue (parent 501(c)(3) nonprofit of SPC)";
  const cands = institutionNameCandidates(full);
  assert.equal(cands[0], full);
  assert.equal(cands[1], "GreenBlue");
  assert.equal(cands[2], "parent 501(c)(3) nonprofit of SPC");
});

test("institutionLocated: the FULL descriptive publisher string fails word-overlap (real greenblue.org page never says 'nonprofit'/'501'/'parent'), but the CORE name before the parenthesis locates trivially (live 2026-09-06 full-page fetch)", () => {
  const text = "Sustainable Packaging Coalition - GreenBlue ABOUT PROJECTS ... About GreenBlue GreenBlue Events Presented by GreenBlue and UNIDO";
  const full = "GreenBlue (parent 501(c)(3) nonprofit of SPC)";
  assert.equal(phraseLocated(full, text).located, false, "sanity: the full descriptive string alone does NOT locate against this real text");
  assert.equal(institutionLocated(full, text).located, true, "the core-name candidate rescues it");
});

test("institutionLocated: an abbreviation-style parenthetical still locates via ITS OWN candidate (row 44fa2c94, WRI)", () => {
  const r = institutionLocated("World Resources Institute (WRI)", "About WRI. Making Big Ideas Happen.");
  assert.equal(r.located, true);
});

test("proveContent: passes when a FACT token locates verbatim, before even checking institution/subject", () => {
  const r = proveContent({ text: "The rate is set at $44,836 per violation.", institutionName: "Nonexistent Org", subjectTitle: "Nonexistent Subject", factTokens: ["$44,836 per violation"] });
  assert.equal(r.pass, true);
  assert.equal(r.method, "fact_token");
});

test("proveContent: institution+subject fallback passes (row f2d50cc1, BSR SAFA — zero FACT claims, the live-data norm for these 16 rows)", () => {
  const text = "Sustainable Air Freight Alliance. SAFA ensures all air freight value chain stakeholders... Let's talk about how BSR can help you.";
  const r = proveContent({ text, institutionName: "BSR", subjectTitle: "SAFA (Sustainable Air Freight Alliance)", factTokens: [] });
  assert.equal(r.pass, true);
  assert.equal(r.method, "institution_and_subject");
});

test("proveContent: fails honestly when the subject never appears (row 6b5cf9ab, NREL Storage Futures Study vs item 'Solar & Battery Energy Storage for Warehouses' — no warehouse content on the page)", () => {
  const text = "The Storage Futures Study considered when and where a range of storage technologies are cost-competitive for the U.S. power grid through 2050.";
  const r = proveContent({ text, institutionName: "National Renewable Energy Laboratory (NREL)", subjectTitle: "Solar & Battery Energy Storage for Warehouses", factTokens: [] });
  assert.equal(r.pass, false);
  assert.match(r.reason, /content not on page/);
});

// ── AUTHORITY ─────────────────────────────────────────────────────────────────────────────────────────

const SOURCES_FIXTURE = [
  { id: "src-h2acc", url: "https://h2accelerate.eu/", status: "active", base_tier: 4 },
  { id: "src-irena", url: "https://irena.org/Publications", status: "active", base_tier: 3 },
  { id: "src-dnv", url: "https://dnv.com/maritime", status: "active", base_tier: 4 },
  { id: "src-safa", url: "https://safa.aero", status: "active", base_tier: 4 },
  { id: "src-bsr", url: "https://bsr.org", status: "active", base_tier: 6 },
];

function classTierForHostFixture(host) {
  if (host === "h2accelerate.eu") return null; // deliberately ambiguous by the static class table (only the registry knows it)
  if (host === "dnv.com") return 4;
  return null;
}
const permanentlyUnregisteredClassFixture = () => null;

test("existingTierForHost: finds an active registered host by institutionKey, ignores non-active rows", () => {
  const r = existingTierForHost("h2accelerate.eu", SOURCES_FIXTURE);
  assert.equal(r.tier, 4);
  assert.equal(r.sourceId, "src-h2acc");
});

test("linkedCurrentTier: null when there is no linked current source (every missing_link row's currentSourceId)", () => {
  assert.equal(linkedCurrentTier(null, SOURCES_FIXTURE), null);
});

test("linkedCurrentTier: exact-id lookup, respecting tier_override over base_tier", () => {
  const sources = [{ id: "s1", base_tier: 4, tier_override: 2 }];
  assert.equal(linkedCurrentTier("s1", sources), 2);
});

test("checkAuthority: same host as current is always ok (row 1b70ca74, h2accelerate.eu/trucks/ vs current h2accelerate.eu)", () => {
  const r = checkAuthority({
    candidateHost: "h2accelerate.eu", currentHost: "h2accelerate.eu", currentSourceId: null, sources: SOURCES_FIXTURE,
    classTierForHost: classTierForHostFixture, permanentlyUnregisteredClass: permanentlyUnregisteredClassFixture,
    currentIsConfirmedDead: false, currentIsWalled: false,
  });
  assert.equal(r.ok, true);
  assert.equal(r.tier, 4);
});

test("checkAuthority: a missing_link row (no linked current source) never triggers a downgrade check, even to a worse-tier candidate (row f2d50cc1, BSR tier 6 vs safa.aero's own registered tier 4 — safa.aero is not THIS item's linked source)", () => {
  const r = checkAuthority({
    candidateHost: "bsr.org", currentHost: "safa.aero", currentSourceId: null,
    sources: [
      { id: "src-bsr", url: "https://bsr.org", status: "active", base_tier: 6 },
      { id: "src-safa", url: "https://safa.aero", status: "active", base_tier: 4 },
    ],
    classTierForHost: () => null, permanentlyUnregisteredClass: permanentlyUnregisteredClassFixture,
    currentIsConfirmedDead: false, currentIsWalled: false,
  });
  assert.equal(r.ok, true);
  assert.equal(r.tier, 6);
});

test("checkAuthority: a stale_url row's REAL linked current source protects against downgrade (row 62849804, DNV tier 4 vs IRENA tier 3, current URL only WAF-blocked, not confirmed dead)", () => {
  const r = checkAuthority({
    candidateHost: "dnv.com", currentHost: "irena.org", currentSourceId: "src-irena", sources: SOURCES_FIXTURE,
    classTierForHost: classTierForHostFixture, permanentlyUnregisteredClass: permanentlyUnregisteredClassFixture,
    currentIsConfirmedDead: false, currentIsWalled: false,
  });
  assert.equal(r.ok, false);
  assert.equal(r.kind, "downgrade");
  assert.match(r.reason, /downgrade/);
});

test("checkAuthority: a WALLED (not dead) current source rejects the downgrade outright — 'downgrade_walled', never an accept (operator ruling 2026-09-06: a wall is not a dead link)", () => {
  const r = checkAuthority({
    candidateHost: "dnv.com", currentHost: "irena.org", currentSourceId: "src-irena", sources: SOURCES_FIXTURE,
    classTierForHost: classTierForHostFixture, permanentlyUnregisteredClass: permanentlyUnregisteredClassFixture,
    currentIsConfirmedDead: false, currentIsWalled: true,
  });
  assert.equal(r.ok, false);
  assert.equal(r.kind, "downgrade_walled");
  assert.match(r.reason, /access wall/);
});

test("checkAuthority: accepts the downgrade once the current source is CONFIRMED dead (never both dead and walled at once — dead wins if ever passed together, since it is checked first)", () => {
  const r = checkAuthority({
    candidateHost: "dnv.com", currentHost: "irena.org", currentSourceId: "src-irena", sources: SOURCES_FIXTURE,
    classTierForHost: classTierForHostFixture, permanentlyUnregisteredClass: permanentlyUnregisteredClassFixture,
    currentIsConfirmedDead: true, currentIsWalled: false,
  });
  assert.equal(r.ok, true);
});

test("checkAuthority: an ambiguous, unregistered candidate host is flagged 'ambiguous', never a bare failure (row 7aae8bba, greenblue.org — SC-13 no-guess-ACTIVE, but decideRow turns this into a provisional accept)", () => {
  const r = checkAuthority({
    candidateHost: "greenblue.org", currentHost: "sustainablepackaging.org", currentSourceId: null,
    sources: [{ id: "src-spc", url: "https://sustainablepackaging.org/", status: "active", base_tier: 4 }],
    classTierForHost: () => null, permanentlyUnregisteredClass: permanentlyUnregisteredClassFixture,
    currentIsConfirmedDead: false, currentIsWalled: false,
  });
  assert.equal(r.ok, false);
  assert.equal(r.kind, "ambiguous");
  assert.match(r.reason, /no codified authority tier/);
});

test("checkAuthority: rejects a permanently-unregistered host class regardless of tier", () => {
  const r = checkAuthority({
    candidateHost: "law.justia.com", currentHost: "example.gov", currentSourceId: null, sources: [],
    classTierForHost: () => 1, permanentlyUnregisteredClass: (h) => (h === "law.justia.com" ? "aggregator" : null),
    currentIsConfirmedDead: false, currentIsWalled: false,
  });
  assert.equal(r.ok, false);
  assert.equal(r.kind, "permanent");
  assert.match(r.reason, /permanently-unregistered/);
});

// ── decideRow: end-to-end per-row pipeline, one case per stage ──────────────────────────────────────────

const ROW_BASE = { id: "row-1", intelligence_item_id: "item-1", current_source_id: null, current_source_url: "https://h2accelerate.eu/", issue_classification: "missing_link", candidate_url: "https://h2accelerate.eu/trucks/", candidate_title: "H2Accelerate TRUCKS – H2Accelerate", candidate_publisher: "H2Accelerate Collaboration" };
const ITEM = { title: "H2 Accelerate" };
const BASE_DEPS = { sources: SOURCES_FIXTURE, classTierForHost: classTierForHostFixture, permanentlyUnregisteredClass: permanentlyUnregisteredClassFixture, defaultTierForHost: (h) => classTierForHostFixture(h) ?? 5, currentIsConfirmedDead: false, currentIsWalled: false, factTokens: [] };

test("decideRow: reachability rejection short-circuits before page-class/content/authority", () => {
  const v = decideRow(ROW_BASE, ITEM, { status: 404, text: "" }, BASE_DEPS);
  assert.equal(v.decision, "rejected");
  assert.equal(v.proof.stage, "reachability");
});

test("decideRow: a transient fetch error defers, never rejects — not a human outcome, retried next run", () => {
  const v = decideRow(ROW_BASE, ITEM, { error: new Error("Browserless hard-error: timeout") }, BASE_DEPS);
  assert.equal(v.decision, "deferred");
  assert.match(v.reviewer_notes, /retry next run/);
});

test("decideRow: page-class rejection (about page) short-circuits before content/authority", () => {
  const row = { ...ROW_BASE, candidate_url: "https://www.wri.org/about", candidate_title: "About WRI | World Resources Institute" };
  const v = decideRow(row, { title: "World Resources Institute" }, { status: 200, text: "About WRI. Making Big Ideas Happen." }, BASE_DEPS);
  assert.equal(v.decision, "rejected");
  assert.equal(v.proof.stage, "page_class");
});

test("decideRow: content-proof rejection when the page never establishes the item's subject", () => {
  const row = { ...ROW_BASE, candidate_url: "https://www.nrel.gov/analysis/storage-futures", candidate_title: "Storage Futures Study | NREL", candidate_publisher: "National Renewable Energy Laboratory (NREL)" };
  const v = decideRow(row, { title: "Solar & Battery Energy Storage for Warehouses" }, { status: 200, text: "The Storage Futures Study considered grid-scale storage technologies for the U.S. power grid." }, BASE_DEPS);
  assert.equal(v.decision, "rejected");
  assert.equal(v.proof.stage, "content_proof");
});

test("decideRow: full accept path (row 1b70ca74) — reachable, clean page-class, content proven, same-host authority", () => {
  const v = decideRow(ROW_BASE, ITEM, { status: 200, text: "H2Accelerate TRUCKS is an innovative European collaboration of 15 partners." }, BASE_DEPS);
  assert.equal(v.decision, "approved");
  assert.equal(v.authorityTier, 4);
  assert.equal(v.existingSourceId, "src-h2acc");
});

test("decideRow: a stale_url row's CONFIRMED-DEAD current source licenses the downgrade accept (DNS/404/410/5xx, not a wall)", () => {
  const row = { ...ROW_BASE, current_source_id: "src-irena", current_source_url: "https://www.irena.org/Energy-Transition/Technology/Maritime-transport", issue_classification: "stale_url", candidate_url: "https://www.dnv.com/services/alternative-fuels-insights-afi--128171/", candidate_title: "Alternative Fuels Insight (AFI) – DNV", candidate_publisher: "DNV" };
  const deps = { ...BASE_DEPS, currentIsConfirmedDead: true, classTierForHost: classTierForHostFixture };
  const v = decideRow(row, { title: "Alternative Fuels Insight (IRENA/IMO)" }, { status: 200, text: "Alternative Fuels Insight (AFI) is DNV's open platform for evaluating the uptake of alternative fuels and technologies." }, deps);
  assert.equal(v.decision, "approved");
  assert.equal(v.authorityTier, 4);
});

test("decideRow: an ambiguous authority host ACCEPTS provisional at the deterministic default tier, never a human wait (row 7aae8bba, greenblue.org — operator ruling 2026-09-06)", () => {
  const row = { ...ROW_BASE, current_source_id: null, current_source_url: "https://sustainablepackaging.org/", candidate_url: "https://greenblue.org/projects/sustainable-packaging-coalition/", candidate_title: "Sustainable Packaging Coalition - GreenBlue", candidate_publisher: "GreenBlue" };
  const deps = { ...BASE_DEPS, sources: [{ id: "src-spc", url: "https://sustainablepackaging.org/", status: "active", base_tier: 4 }], classTierForHost: () => null, defaultTierForHost: () => 5 };
  const v = decideRow(row, { title: "Sustainable Packaging Coalition" }, { status: 200, text: "Sustainable Packaging Coalition - GreenBlue. Our Pillars translate sustainable packaging into action." }, deps);
  assert.equal(v.decision, "approved");
  assert.equal(v.provisional, true);
  assert.equal(v.authorityTier, 5);
  assert.equal(v.existingSourceId, null);
  assert.match(v.reviewer_notes, /tier provisional \(default 5\)/);
});

test("decideRow: a missing_link row's unrelated-host 'current' URL never blocks a lower-tier accept (row f2d50cc1, BSR/SAFA — no current_source_id, so no downgrade to protect against)", () => {
  const row = { ...ROW_BASE, current_source_id: null, current_source_url: "https://www.safa.aero/", candidate_url: "https://www.bsr.org/en/collaboration/groups/sustainable-air-freight-alliance", candidate_title: "Sustainable Air Freight Alliance (SAFA)", candidate_publisher: "BSR" };
  const deps = {
    ...BASE_DEPS,
    sources: [
      { id: "src-bsr", url: "https://bsr.org", status: "active", base_tier: 6 },
      { id: "src-safa", url: "https://safa.aero", status: "active", base_tier: 4 },
    ],
    classTierForHost: (h) => (h === "bsr.org" ? null : null),
  };
  const text = "Sustainable Air Freight Alliance. SAFA ensures all air freight value chain stakeholders... Let's talk about how BSR can help you.";
  const v = decideRow(row, { title: "SAFA (Sustainable Air Freight Alliance)" }, { status: 200, text }, deps);
  assert.equal(v.decision, "approved");
  assert.equal(v.provisional, undefined);
  assert.equal(v.authorityTier, 6);
  assert.equal(v.existingSourceId, "src-bsr");
});

test("decideRow: a stale_url row's WALLED (not dead) current source rejects the downgrade candidate outright (row 62849804, IRENA -> DNV/AFI)", () => {
  const row = { ...ROW_BASE, current_source_id: "src-irena", current_source_url: "https://www.irena.org/Energy-Transition/Technology/Maritime-transport", issue_classification: "stale_url", candidate_url: "https://www.dnv.com/services/alternative-fuels-insights-afi--128171/", candidate_title: "Alternative Fuels Insight (AFI) – DNV", candidate_publisher: "DNV" };
  const deps = { ...BASE_DEPS, currentIsWalled: true, classTierForHost: classTierForHostFixture };
  const v = decideRow(row, { title: "Alternative Fuels Insight (IRENA/IMO)" }, { status: 200, text: "Alternative Fuels Insight (AFI) is DNV's open platform for evaluating the uptake of alternative fuels and technologies." }, deps);
  assert.equal(v.decision, "rejected");
  assert.match(v.reviewer_notes, /access wall/);
});

// ── decideRow: a walled CANDIDATE defers with a 3-attempt cap, never rejects on a wall (lane
// CANONICAL-AUTOVERIFY-4, 2026-09-07 — Maintenance run 34078398318 dry on master c25922f8 rejected two
// live rows, bsr.org/SAFA and napa.fi/Blue Visby, on a candidate-side 'access wall (bot_challenge)' that
// the SAME pages passed content proof on from the container — a wall on the candidate is "could not
// verify from this network", not "the page is unfit", and the old behavior discarded a valid replacement
// PERMANENTLY, since idempotency only re-reads decision='pending' rows.) ──────────────────────────────────

const WALL_TEXT = "Please sign in to continue to access your account."; // trips LOGIN_WALL_RE, proven at line 47 above

test("decideRow: a WALLED CANDIDATE defers on its first attempt — never an immediate reject", () => {
  const row = { ...ROW_BASE, reviewer_notes: null };
  const v = decideRow(row, ITEM, { status: 200, text: WALL_TEXT }, BASE_DEPS);
  assert.equal(v.decision, "deferred");
  assert.match(v.reviewer_notes, /auto: deferred, candidate behind an access wall from this network \(attempt 1\), retry next run/);
  assert.equal(v.proof.stage, "reachability");
  assert.equal(v.proof.wallAttempt, 1);
});

test("decideRow: a WALLED CANDIDATE defers again on its second attempt, reading the prior count back from reviewer_notes", () => {
  const row = { ...ROW_BASE, reviewer_notes: "auto: deferred, candidate behind an access wall from this network (attempt 1), retry next run" };
  const v = decideRow(row, ITEM, { status: 200, text: WALL_TEXT }, BASE_DEPS);
  assert.equal(v.decision, "deferred");
  assert.match(v.reviewer_notes, /\(attempt 2\)/);
  assert.equal(v.proof.wallAttempt, 2);
});

test("decideRow: a WALLED CANDIDATE finally rejects on its 3rd attempt — the only terminal outcome a candidate-side wall ever produces", () => {
  const row = { ...ROW_BASE, reviewer_notes: "auto: deferred, candidate behind an access wall from this network (attempt 2), retry next run" };
  const v = decideRow(row, ITEM, { status: 200, text: WALL_TEXT }, BASE_DEPS);
  assert.equal(v.decision, "rejected");
  assert.match(v.reviewer_notes, /auto: reject, candidate unverifiable behind an access wall after 3 attempts/);
  assert.equal(v.proof.wallAttempt, 3);
});

test("decideRow: a candidate wall never leaves the row 'pending' forever unaccounted — a reviewer_notes value from an unrelated stage reads as attempt 0, same as a fresh row", () => {
  const row = { ...ROW_BASE, reviewer_notes: "auto: reject, dead (HTTP 404)" };
  const v = decideRow(row, ITEM, { status: 200, text: WALL_TEXT }, BASE_DEPS);
  assert.equal(v.decision, "deferred");
  assert.match(v.reviewer_notes, /\(attempt 1\)/);
});

test("previousWallAttempts: parses the exact phrase this module writes; anything else (or nothing) reads as 0", () => {
  assert.equal(previousWallAttempts(null), 0);
  assert.equal(previousWallAttempts(undefined), 0);
  assert.equal(previousWallAttempts("auto: reject, dead (HTTP 404)"), 0);
  assert.equal(previousWallAttempts("auto: deferred, candidate behind an access wall from this network (attempt 1), retry next run"), 1);
  assert.equal(previousWallAttempts("auto: deferred, candidate behind an access wall from this network (attempt 2), retry next run"), 2);
});

test("decideRow: the CURRENT source's own wall handling is UNCHANGED by this fix — 'downgrade_walled' still rejects outright with no attempt count at all (regression against the walled-current test above)", () => {
  const row = { ...ROW_BASE, current_source_id: "src-irena", current_source_url: "https://www.irena.org/Energy-Transition/Technology/Maritime-transport", issue_classification: "stale_url", candidate_url: "https://www.dnv.com/services/alternative-fuels-insights-afi--128171/", candidate_title: "Alternative Fuels Insight (AFI) – DNV", candidate_publisher: "DNV" };
  const deps = { ...BASE_DEPS, currentIsWalled: true, classTierForHost: classTierForHostFixture };
  const v = decideRow(row, { title: "Alternative Fuels Insight (IRENA/IMO)" }, { status: 200, text: "Alternative Fuels Insight (AFI) is DNV's open platform for evaluating the uptake of alternative fuels and technologies." }, deps);
  assert.equal(v.decision, "rejected");
  assert.equal(v.proof.stage, "authority");
  assert.equal(v.proof.kind, "downgrade_walled");
  assert.equal("wallAttempt" in v.proof, false);
});

// ── main(): the whole dry/apply loop against a small fixture ────────────────────────────────────────────

function buildMainDeps({ rows, items, sources, fetchResults, hostAuthority }) {
  const writes = { canonical_source_candidates: [], intelligence_items: [] };
  const registrations = [];
  const live = new Map(rows.map((r) => [r.id, { ...r }]));
  return {
    writes,
    registrations,
    readAll: async (table) => {
      if (table === "canonical_source_candidates") return [...live.values()].filter((r) => r.decision === "pending");
      if (table === "sources") return sources;
      throw new Error(`unexpected readAll(${table})`);
    },
    readAllByIds: async (table, cols, ids) => {
      if (table === "intelligence_items") return items.filter((it) => ids.includes(it.id));
      if (table === "canonical_source_candidates") return ids.map((id) => live.get(id)).filter(Boolean);
      throw new Error(`unexpected readAllByIds(${table})`);
    },
    guardedUpdateByIds: async (table, ids, patch) => {
      writes[table].push({ ids, patch });
      if (table === "canonical_source_candidates") for (const id of ids) Object.assign(live.get(id), patch);
      return { updated: ids.length };
    },
    registerSource: async (source) => { registrations.push(source); return { source_id: `new-${source.url}`, created: true }; },
    fetchCandidate: async (url) => fetchResults[url] ?? { status: 200, text: "" },
    hostAuthority: hostAuthority ?? { classTierForHost: () => null, permanentlyUnregisteredClass: () => null, defaultTierForHost: () => 5 },
  };
}

test("main: dry mode fetches and classifies every pending row, writes nothing", async () => {
  const rows = [{ ...ROW_BASE, decision: "pending" }];
  const items = [{ id: "item-1", title: "H2 Accelerate" }];
  const deps = buildMainDeps({
    rows, items, sources: SOURCES_FIXTURE,
    fetchResults: { "https://h2accelerate.eu/trucks/": { status: 200, text: "H2Accelerate TRUCKS is an innovative European collaboration." } },
    hostAuthority: { classTierForHost: classTierForHostFixture, permanentlyUnregisteredClass: permanentlyUnregisteredClassFixture },
  });
  const s = await main({ mode: "dry" }, deps);
  assert.equal(s.counts.pending_read, 1);
  assert.equal(s.counts.approved, 1);
  assert.equal(deps.writes.canonical_source_candidates.length, 0);
});

test("main: apply mode writes the approve patch to both tables and reuses the existing source id (no new registration)", async () => {
  const rows = [{ ...ROW_BASE, decision: "pending" }];
  const items = [{ id: "item-1", title: "H2 Accelerate" }];
  const deps = buildMainDeps({
    rows, items, sources: SOURCES_FIXTURE,
    fetchResults: { "https://h2accelerate.eu/trucks/": { status: 200, text: "H2Accelerate TRUCKS is an innovative European collaboration." } },
    hostAuthority: { classTierForHost: classTierForHostFixture, permanentlyUnregisteredClass: permanentlyUnregisteredClassFixture },
  });
  const s = await main({ mode: "apply" }, deps);
  assert.equal(s.applied, 1);
  assert.equal(deps.writes.canonical_source_candidates.length, 1);
  assert.equal(deps.writes.canonical_source_candidates[0].patch.decision, "approved");
  assert.equal(deps.writes.canonical_source_candidates[0].patch.promoted_to_source_id, "src-h2acc");
  assert.equal(deps.writes.intelligence_items.length, 1);
  assert.equal(deps.writes.intelligence_items[0].patch.source_id, "src-h2acc");
  assert.equal(deps.writes.intelligence_items[0].patch.source_url, "https://h2accelerate.eu/trucks/");
  assert.equal(s.read_back.approved_now, 1);
});

test("main: apply mode is idempotent — a second run reads zero pending rows and writes nothing more", async () => {
  const rows = [{ ...ROW_BASE, decision: "pending" }];
  const items = [{ id: "item-1", title: "H2 Accelerate" }];
  const deps = buildMainDeps({
    rows, items, sources: SOURCES_FIXTURE,
    fetchResults: { "https://h2accelerate.eu/trucks/": { status: 200, text: "H2Accelerate TRUCKS is an innovative European collaboration." } },
    hostAuthority: { classTierForHost: classTierForHostFixture, permanentlyUnregisteredClass: permanentlyUnregisteredClassFixture },
  });
  await main({ mode: "apply" }, deps);
  const s2 = await main({ mode: "apply" }, deps);
  assert.equal(s2.counts.pending_read, 0);
  assert.equal(s2.applied, 0);
  assert.equal(deps.writes.canonical_source_candidates.length, 1, "no second write on the re-run");
});

test("main: a rejected row writes only canonical_source_candidates, never intelligence_items", async () => {
  const rows = [{ ...ROW_BASE, id: "row-2", decision: "pending", candidate_url: "https://www.wri.org/about", candidate_title: "About WRI | World Resources Institute" }];
  const items = [{ id: "item-1", title: "World Resources Institute" }];
  const deps = buildMainDeps({
    rows, items, sources: SOURCES_FIXTURE,
    fetchResults: { "https://www.wri.org/about": { status: 200, text: "About WRI. Making Big Ideas Happen." } },
  });
  const s = await main({ mode: "apply" }, deps);
  assert.equal(s.counts.rejected, 1);
  assert.equal(deps.writes.intelligence_items.length, 0);
  assert.equal(deps.writes.canonical_source_candidates[0].patch.decision, "rejected");
});

test("main: an ambiguous-host row registers PROVISIONAL at the default tier and repoints the item — no needs_individual_review outcome exists any more (row 7aae8bba shape, operator ruling 2026-09-06)", async () => {
  const rows = [{ ...ROW_BASE, id: "row-3", decision: "pending", current_source_id: null, current_source_url: "https://sustainablepackaging.org/", candidate_url: "https://greenblue.org/projects/sustainable-packaging-coalition/", candidate_title: "Sustainable Packaging Coalition - GreenBlue", candidate_publisher: "GreenBlue" }];
  const items = [{ id: "item-1", title: "Sustainable Packaging Coalition" }];
  const deps = buildMainDeps({
    rows, items, sources: [{ id: "src-spc", url: "https://sustainablepackaging.org/", status: "active", base_tier: 4 }],
    fetchResults: { "https://greenblue.org/projects/sustainable-packaging-coalition/": { status: 200, text: "Sustainable Packaging Coalition - GreenBlue. Our Pillars." } },
    hostAuthority: { classTierForHost: () => null, permanentlyUnregisteredClass: () => null, defaultTierForHost: () => 5 },
  });
  const s = await main({ mode: "apply" }, deps);
  assert.equal(s.counts.approved, 1);
  assert.equal(s.applied, 1);
  assert.equal(deps.registrations.length, 1);
  assert.equal(deps.registrations[0].base_tier, 5);
  assert.deepEqual(deps.registrations[0].extra, { status: "provisional" });
  assert.equal(deps.writes.canonical_source_candidates[0].patch.decision, "approved");
  assert.equal(deps.writes.intelligence_items.length, 1);
  assert.equal("needs_individual_review" in s.counts, false);
});

test("main: a transient fetch-error row defers (left pending, no write either way), never counted as rejected", async () => {
  const rows = [{ ...ROW_BASE, id: "row-4", decision: "pending" }];
  const items = [{ id: "item-1", title: "H2 Accelerate" }];
  const deps = buildMainDeps({
    rows, items, sources: SOURCES_FIXTURE,
    fetchResults: {}, // candidate_url fetch throws below via override
    hostAuthority: { classTierForHost: classTierForHostFixture, permanentlyUnregisteredClass: permanentlyUnregisteredClassFixture, defaultTierForHost: () => 5 },
  });
  deps.fetchCandidate = async (url) => (url === ROW_BASE.candidate_url ? { error: new Error("Browserless hard-error: timeout"), status: null, text: "" } : { status: 200, text: "" });
  const s = await main({ mode: "apply" }, deps);
  assert.equal(s.counts.deferred, 1);
  assert.equal(s.counts.rejected, 0);
  assert.equal(s.applied, 0);
  assert.equal(deps.writes.canonical_source_candidates.length, 0);
  assert.equal(s.deferred.length, 1);
});

test("main: a downgrade-walled row (IRENA -> DNV/AFI) rejects, never approves, when the current source is only WAF-blocked", async () => {
  const rows = [{
    ...ROW_BASE, id: "row-5", decision: "pending", current_source_id: "src-irena",
    current_source_url: "https://www.irena.org/Energy-Transition/Technology/Maritime-transport", issue_classification: "stale_url",
    candidate_url: "https://www.dnv.com/services/alternative-fuels-insights-afi--128171/", candidate_title: "Alternative Fuels Insight (AFI) – DNV", candidate_publisher: "DNV",
  }];
  const items = [{ id: "item-1", title: "Alternative Fuels Insight (IRENA/IMO)" }];
  const deps = buildMainDeps({
    rows, items, sources: SOURCES_FIXTURE,
    fetchResults: {
      "https://www.dnv.com/services/alternative-fuels-insights-afi--128171/": { status: 200, text: "Alternative Fuels Insight (AFI) is DNV's open platform for evaluating the uptake of alternative fuels and technologies." },
      "https://www.irena.org/Energy-Transition/Technology/Maritime-transport": { status: 403, text: "Access denied. Please verify you are a human to continue." },
    },
    hostAuthority: { classTierForHost: classTierForHostFixture, permanentlyUnregisteredClass: permanentlyUnregisteredClassFixture, defaultTierForHost: () => 5 },
  });
  const s = await main({ mode: "apply" }, deps);
  assert.equal(s.counts.rejected, 1);
  assert.equal(s.counts.approved, 0);
  assert.equal(deps.writes.intelligence_items.length, 0);
  assert.match(deps.writes.canonical_source_candidates[0].patch.reviewer_notes, /access wall/);
});

// ── main(): a WALLED CANDIDATE defers with a persisted attempt count, never rejects on a wall until the
// 3rd try (lane CANONICAL-AUTOVERIFY-4, 2026-09-07 — see the decideRow section above for the full ruling
// this fixes) ────────────────────────────────────────────────────────────────────────────────────────────

test("main: a WALLED CANDIDATE defers on apply — reviewer_notes IS written (attempt count persisted) even though decision stays 'pending' and the row is not counted as applied", async () => {
  const rows = [{ ...ROW_BASE, id: "row-6", decision: "pending", reviewer_notes: null }];
  const items = [{ id: "item-1", title: "H2 Accelerate" }];
  const deps = buildMainDeps({
    rows, items, sources: SOURCES_FIXTURE,
    fetchResults: { "https://h2accelerate.eu/trucks/": { status: 200, text: "Please sign in to continue to access your account." } },
    hostAuthority: { classTierForHost: classTierForHostFixture, permanentlyUnregisteredClass: permanentlyUnregisteredClassFixture, defaultTierForHost: () => 5 },
  });
  const s = await main({ mode: "apply" }, deps);
  assert.equal(s.counts.deferred, 1);
  assert.equal(s.counts.rejected, 0);
  assert.equal(s.applied, 0);
  assert.equal(deps.writes.canonical_source_candidates.length, 1, "the attempt count must be written even though decision does not change");
  assert.equal(deps.writes.canonical_source_candidates[0].patch.decision, undefined, "decision is never in the patch — the row stays 'pending'");
  assert.match(deps.writes.canonical_source_candidates[0].patch.reviewer_notes, /\(attempt 1\)/);
  assert.equal(s.read_back.still_pending, 1);
});

test("main: three consecutive apply runs against the SAME still-walled candidate defer, defer, then finally reject — the attempt count survives because reviewer_notes round-trips through the mock 'DB'", async () => {
  const rows = [{ ...ROW_BASE, id: "row-7", decision: "pending", reviewer_notes: null }];
  const items = [{ id: "item-1", title: "H2 Accelerate" }];
  const deps = buildMainDeps({
    rows, items, sources: SOURCES_FIXTURE,
    fetchResults: { "https://h2accelerate.eu/trucks/": { status: 200, text: "Please sign in to continue to access your account." } },
    hostAuthority: { classTierForHost: classTierForHostFixture, permanentlyUnregisteredClass: permanentlyUnregisteredClassFixture, defaultTierForHost: () => 5 },
  });

  const s1 = await main({ mode: "apply" }, deps);
  assert.equal(s1.counts.deferred, 1);
  assert.equal(s1.read_back.still_pending, 1);

  const s2 = await main({ mode: "apply" }, deps);
  assert.equal(s2.counts.deferred, 1);
  assert.match(deps.writes.canonical_source_candidates[1].patch.reviewer_notes, /\(attempt 2\)/);
  assert.equal(s2.read_back.still_pending, 1);

  const s3 = await main({ mode: "apply" }, deps);
  assert.equal(s3.counts.rejected, 1);
  assert.equal(s3.counts.deferred, 0);
  assert.equal(s3.applied, 1);
  assert.match(s3.verdicts[0].reviewer_notes, /unverifiable behind an access wall after 3 attempts/);
  assert.equal(s3.read_back.rejected_now, 1);
  assert.equal(s3.read_back.still_pending, 0);

  // idempotency: a 4th run reads zero pending rows (the row is now terminal) — never re-walls a dead row.
  const s4 = await main({ mode: "apply" }, deps);
  assert.equal(s4.counts.pending_read, 0);
});

test("main: summary.verdicts already carries the per-row reason next to the id (id + decision + reviewer_notes), for every row and every mode — the coordinator's ledger note reads this, not a second field", async () => {
  const rows = [{ ...ROW_BASE, id: "row-8", decision: "pending", reviewer_notes: null }];
  const items = [{ id: "item-1", title: "H2 Accelerate" }];
  const deps = buildMainDeps({
    rows, items, sources: SOURCES_FIXTURE,
    fetchResults: { "https://h2accelerate.eu/trucks/": { status: 200, text: "Please sign in to continue to access your account." } },
    hostAuthority: { classTierForHost: classTierForHostFixture, permanentlyUnregisteredClass: permanentlyUnregisteredClassFixture, defaultTierForHost: () => 5 },
  });
  const s = await main({ mode: "dry" }, deps);
  assert.equal(s.verdicts.length, 1);
  assert.equal(s.verdicts[0].id, "row-8");
  assert.equal(s.verdicts[0].decision, "deferred");
  assert.match(s.verdicts[0].reviewer_notes, /access wall from this network \(attempt 1\)/);
});

// ── $0 FETCH ADAPTER (lane CANONICAL-AUTOVERIFY-3, 2026-09-07: replaces the Browserless wiring that made
// every one of the 16 pending rows in run 34069709848 come back "deferred: fetch failed: BrowserlessError:
// BROWSERLESS_API_KEY not configured") ──────────────────────────────────────────────────────────────────

test("makeCanonicalFetchCandidate: a 200 response reduces to {status,text,host,path}, no error, no Browserless import needed", async () => {
  const fetchImpl = async (url) => ({
    ok: true, status: 200, redirected: false,
    text: async () => "<html><body><h1>Alternative Fuels Insight</h1></body></html>",
  });
  const fetchCandidate = makeCanonicalFetchCandidate({ fetchImpl });
  const r = await fetchCandidate("https://www.dnv.com/services/afi/");
  assert.equal(r.status, 200);
  assert.match(r.text, /Alternative Fuels Insight/);
  assert.equal(r.host, "dnv.com"); // hostOf strips a leading "www." (institution-key.mjs convention)
  assert.equal(r.path, "/services/afi/");
  assert.equal(r.error, undefined);
});

test("makeCanonicalFetchCandidate: a non-2xx status is reported as a status, not routed through classifyReachability as transient (dead codes still reject, never defer)", async () => {
  const fetchImpl = async () => ({ ok: false, status: 404, redirected: false, text: async () => "Not Found" });
  const fetchCandidate = makeCanonicalFetchCandidate({ fetchImpl });
  const r = await fetchCandidate("https://example.org/gone");
  assert.equal(r.status, 404);
  assert.equal(r.error, undefined); // no `error` set -> classifyReachability reads isDeadStatus(404), never 'transient'
  assert.equal(classifyReachability(r).ok, false);
  assert.equal(classifyReachability(r).transient, undefined);
});

test("makeCanonicalFetchCandidate: a network failure (fetchImpl throws / captureDocument's own catch) reports status:null + error — routes to 'deferred', never 'rejected'", async () => {
  const fetchImpl = async () => { throw new Error("getaddrinfo ENOTFOUND example-dead-host.invalid"); };
  const fetchCandidate = makeCanonicalFetchCandidate({ fetchImpl });
  const r = await fetchCandidate("https://example-dead-host.invalid/page");
  assert.equal(r.status, null);
  assert.match(String(r.error), /ENOTFOUND/);
  const reach = classifyReachability(r);
  assert.equal(reach.ok, false);
  assert.equal(reach.transient, true);
});

test("makeCanonicalFetchCandidate: follows a redirect by hand via followUpgradingRedirects (an http Location upgraded to https)", async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push(url);
    if (url === "https://example.org/old") {
      return {
        ok: false, status: 301, redirected: false,
        headers: { get: (h) => (h === "location" ? "http://example.org/new" : null) },
        text: async () => "",
      };
    }
    assert.equal(url, "https://example.org/new"); // http Location upgraded to https before the next hop
    return { ok: true, status: 200, redirected: false, headers: { get: () => null }, text: async () => "landed" };
  };
  const fetchCandidate = makeCanonicalFetchCandidate({ fetchImpl, gapMs: 0 });
  const r = await fetchCandidate("https://example.org/old");
  assert.equal(r.status, 200);
  assert.equal(r.text, "landed");
  assert.deepEqual(calls, ["https://example.org/old", "https://example.org/new"]);
});

test("makeCanonicalFetchCandidate: does not import or call anything named Browserless (source-text check on the adapter's own module)", async () => {
  const src = await import("node:fs/promises").then((fs) => fs.readFile(new URL("./canonical-autoverify.mjs", import.meta.url), "utf8"));
  // Only prose lines (comment `//`) may mention it, explaining what this lane removed — never an import,
  // a call, or an identifier reference. No line outside a `//` comment may contain the word at all.
  const codeLines = src.split("\n").filter((line) => !/^\s*\/\//.test(line) && !/^\s*\*/.test(line));
  const offenders = codeLines.filter((line) => /browserless/i.test(line));
  assert.deepEqual(offenders, [], `found non-comment reference(s) to Browserless: ${JSON.stringify(offenders)}`);
});

// Addendum item 11 (2026-09-07): no em dash survives in the reviewer_notes templates this module
// writes to canonical_source_candidates — the no-em-dash rule covers generated prose, not just
// hand-written copy. Source-text check (regression guard for the specific 7 template literals fixed
// this lane), not a behavioral test — decideRow's own tests above already prove the parser and the
// terminal outcomes are unaffected by the character swap.
test("no reviewer_notes template literal in canonical-autoverify.mjs contains an em dash", () => {
  const src = readFileSync(new URL("./canonical-autoverify.mjs", import.meta.url), "utf8");
  const templateLines = src
    .split("\n")
    .filter((line) => /reviewer_notes:\s*`auto:/.test(line));
  assert.ok(templateLines.length >= 7, `expected at least 7 reviewer_notes template lines, found ${templateLines.length}`);
  const offenders = templateLines.filter((line) => line.includes("—"));
  assert.deepEqual(offenders, [], `em dash found in reviewer_notes template(s): ${JSON.stringify(offenders)}`);
});

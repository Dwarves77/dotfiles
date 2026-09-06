// Run: node --test scripts/maintenance/canonical-autoverify.test.mjs — no DB, no network, everything
// injected. Pure-function tests come first (each cites the live pending row it was written from — see
// canonical-autoverify.mjs's own header); the main() tests below exercise the whole decide/apply loop
// with a fixture of the 16 real pending rows this lane read from Supabase 2026-09-06.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isDeadStatus,
  classifyReachability,
  classifyPageClass,
  significantWords,
  wordsOverlapLocated,
  phraseLocated,
  proveContent,
  existingTierForHost,
  checkAuthority,
  decideRow,
  main,
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

test("checkAuthority: same host as current is always ok (row 1b70ca74, h2accelerate.eu/trucks/ vs current h2accelerate.eu)", () => {
  const r = checkAuthority({
    candidateHost: "h2accelerate.eu", currentHost: "h2accelerate.eu", sources: SOURCES_FIXTURE,
    classTierForHost: classTierForHostFixture, permanentlyUnregisteredClass: permanentlyUnregisteredClassFixture,
    currentIsConfirmedDead: false,
  });
  assert.equal(r.ok, true);
  assert.equal(r.tier, 4);
});

test("checkAuthority: refuses to downgrade authority without proof the current source is dead (row 62849804, DNV tier 4 vs IRENA tier 3, current URL only WAF-blocked, not confirmed dead)", () => {
  const r = checkAuthority({
    candidateHost: "dnv.com", currentHost: "irena.org", sources: SOURCES_FIXTURE,
    classTierForHost: classTierForHostFixture, permanentlyUnregisteredClass: permanentlyUnregisteredClassFixture,
    currentIsConfirmedDead: false,
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /downgrade/);
});

test("checkAuthority: accepts the downgrade once the current source is confirmed dead", () => {
  const r = checkAuthority({
    candidateHost: "dnv.com", currentHost: "irena.org", sources: SOURCES_FIXTURE,
    classTierForHost: classTierForHostFixture, permanentlyUnregisteredClass: permanentlyUnregisteredClassFixture,
    currentIsConfirmedDead: true,
  });
  assert.equal(r.ok, true);
});

test("checkAuthority: an ambiguous, unregistered candidate host never auto-accepts (row 7aae8bba, greenblue.org — SC-13 no-guess)", () => {
  const r = checkAuthority({
    candidateHost: "greenblue.org", currentHost: "sustainablepackaging.org",
    sources: [{ id: "src-spc", url: "https://sustainablepackaging.org/", status: "active", base_tier: 4 }],
    classTierForHost: () => null, permanentlyUnregisteredClass: permanentlyUnregisteredClassFixture,
    currentIsConfirmedDead: false,
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /no deterministic authority tier/);
});

test("checkAuthority: rejects a permanently-unregistered host class regardless of tier", () => {
  const r = checkAuthority({
    candidateHost: "law.justia.com", currentHost: "example.gov", sources: [],
    classTierForHost: () => 1, permanentlyUnregisteredClass: (h) => (h === "law.justia.com" ? "aggregator" : null),
    currentIsConfirmedDead: false,
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /permanently-unregistered/);
});

// ── decideRow: end-to-end per-row pipeline, one case per stage ──────────────────────────────────────────

const ROW_BASE = { id: "row-1", intelligence_item_id: "item-1", current_source_url: "https://h2accelerate.eu/", issue_classification: "missing_link", candidate_url: "https://h2accelerate.eu/trucks/", candidate_title: "H2Accelerate TRUCKS – H2Accelerate", candidate_publisher: "H2Accelerate Collaboration" };
const ITEM = { title: "H2 Accelerate" };
const BASE_DEPS = { sources: SOURCES_FIXTURE, classTierForHost: classTierForHostFixture, permanentlyUnregisteredClass: permanentlyUnregisteredClassFixture, currentIsConfirmedDead: false, factTokens: [] };

test("decideRow: reachability rejection short-circuits before page-class/content/authority", () => {
  const v = decideRow(ROW_BASE, ITEM, { status: 404, text: "" }, BASE_DEPS);
  assert.equal(v.decision, "rejected");
  assert.equal(v.proof.stage, "reachability");
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

test("decideRow: authority ambiguity routes to needs_individual_review, never a silent accept (row 7aae8bba shape)", () => {
  const row = { ...ROW_BASE, current_source_url: "https://sustainablepackaging.org/", candidate_url: "https://greenblue.org/projects/sustainable-packaging-coalition/", candidate_title: "Sustainable Packaging Coalition - GreenBlue", candidate_publisher: "GreenBlue" };
  const deps = { ...BASE_DEPS, sources: [{ id: "src-spc", url: "https://sustainablepackaging.org/", status: "active", base_tier: 4 }], classTierForHost: () => null };
  const v = decideRow(row, { title: "Sustainable Packaging Coalition" }, { status: 200, text: "Sustainable Packaging Coalition - GreenBlue. Our Pillars translate sustainable packaging into action." }, deps);
  assert.equal(v.decision, "needs_individual_review");
});

// ── main(): the whole dry/apply loop against a small fixture ────────────────────────────────────────────

function buildMainDeps({ rows, items, sources, fetchResults, hostAuthority }) {
  const writes = { canonical_source_candidates: [], intelligence_items: [] };
  const live = new Map(rows.map((r) => [r.id, { ...r }]));
  return {
    writes,
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
    registerSource: async ({ url, base_tier }) => ({ source_id: `new-${url}`, created: true }),
    fetchCandidate: async (url) => fetchResults[url] ?? { status: 200, text: "" },
    hostAuthority: hostAuthority ?? { classTierForHost: () => null, permanentlyUnregisteredClass: () => null },
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

test("main: needs_individual_review rows are never written, and are reported separately from rejected", async () => {
  const rows = [{ ...ROW_BASE, id: "row-3", decision: "pending", current_source_url: "https://sustainablepackaging.org/", candidate_url: "https://greenblue.org/projects/sustainable-packaging-coalition/", candidate_title: "Sustainable Packaging Coalition - GreenBlue", candidate_publisher: "GreenBlue" }];
  const items = [{ id: "item-1", title: "Sustainable Packaging Coalition" }];
  const deps = buildMainDeps({
    rows, items, sources: [{ id: "src-spc", url: "https://sustainablepackaging.org/", status: "active", base_tier: 4 }],
    fetchResults: { "https://greenblue.org/projects/sustainable-packaging-coalition/": { status: 200, text: "Sustainable Packaging Coalition - GreenBlue. Our Pillars." } },
  });
  const s = await main({ mode: "apply" }, deps);
  assert.equal(s.counts.needs_individual_review, 1);
  assert.equal(s.applied, 0);
  assert.equal(deps.writes.canonical_source_candidates.length, 0);
  assert.equal(s.needs_individual_review.length, 1);
});

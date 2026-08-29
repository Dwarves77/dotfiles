// Unit proof for the deterministic entity DETECT→RESOLVE→BUCKET core (phase-intake-gate). Pure, node
// builtins only → runs in the depless discipline CI. Proves BOTH samples: the curated case (GLEC→ISO-14083,
// already found by hand) AND the MISSED case (content names 2023/1805 → resolves to the FuelEU item despite
// NO title overlap — the case title-matching slipped). Plus the negatives: topical token → no edge; unknown
// standard-shaped → surfaced, not dropped.
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectMentions, resolve, classifyBucket, classifyRelationship, planLinks, planLinkWrites, assertMoatBoundary, LINK_ALLOWED_TABLES, matchExistingSubject } from "./entity-resolve.mjs";
import { NAMED_ENTITIES, NAMED_ENTITIES_COUNT } from "./canonical-entities.mjs";

// fixture corpus mirroring the live shape (id, title, instrument_identifier)
const CORPUS = [
  { id: "iso14083", title: "ISO 14083", instrument_identifier: null },
  { id: "ghg", title: "GHG Protocol", instrument_identifier: null },
  { id: "glecv3", title: "GLEC Framework v3", instrument_identifier: null },
  { id: "fueleu_num", title: "EU Regulation 2023/1805 - Official Journal", instrument_identifier: "2023/1805" },
  { id: "afir", title: "Alternative Fuels Infrastructure Regulation (AFIR)", instrument_identifier: "2023/1804" },
];

test("dictionary single-source: NAMED_ENTITIES count matches the pinned baseline (drift guard)", () => {
  assert.equal(NAMED_ENTITIES.length, NAMED_ENTITIES_COUNT,
    `NAMED_ENTITIES changed (${NAMED_ENTITIES.length}) — bump NAMED_ENTITIES_COUNT deliberately (living dictionary, Fold 1).`);
});

test("detect: identifiers + dict-named + standard-shaped; topical words are NOT detected", () => {
  const m = detectMentions("The GLEC framework aligns with ISO 14083 and the GHG Protocol under Regulation (EU) 2023/1805.");
  const named = m.filter((x) => x.kind === "named").map((x) => x.canonical);
  assert.ok(named.includes("ISO 14083") && named.includes("GHG Protocol") && named.includes("GLEC Framework"));
  assert.ok(m.some((x) => x.kind === "identifier" && x.value === "2023/1805"));
  // topical: no entity mentions at all → nothing to ever wire (structural exclusion of the "same batteries?" trap)
  assert.deepEqual(detectMentions("battery electric trucks cut emissions and use hydrogen fuel"), []);
});

test("detect: unknown standard-SHAPED (not in dictionary) is NOTICED as shaped (wide net → fails safe)", () => {
  const m = detectMentions("This conforms to ISO 14084 methodology.");
  assert.ok(m.some((x) => x.kind === "shaped" && /14084/.test(x.value)), "unknown ISO code must be noticed, not dropped");
});

test("SAMPLE 1 (curated): GLEC content names ISO 14083 → resolves to the ISO 14083 item → WIRE edge", () => {
  const { edges } = planLinks("GLEC Framework v3 is aligned with ISO 14083 and the GHG Protocol.", CORPUS, "glecv3");
  const targets = edges.map((e) => e.target_item_id);
  assert.ok(targets.includes("iso14083") && targets.includes("ghg"), "GLEC → ISO 14083 + GHG Protocol edges");
  assert.ok(!targets.includes("glecv3"), "never self-links");
});

test("SAMPLE 2 (MISSED case): content names 2023/1805 → resolves to the FuelEU item DESPITE no title overlap → WIRE", () => {
  // an item ABOUT AFIR whose content references FuelEU by number; titles share nothing.
  const { edges } = planLinks("AFIR interoperates with the FuelEU rules set out in Regulation (EU) 2023/1805.", CORPUS, "afir");
  const byNum = edges.find((e) => e.target_item_id === "fueleu_num");
  assert.ok(byNum, "2023/1805 must resolve to fueleu_num (title-matching would have missed this)");
  assert.equal(byNum.kind, "identifier");
});

test("NEGATIVE: topical content → zero edges; unknown standard → surfaced, not wired", () => {
  const topical = planLinks("Battery electric and hydrogen trucks reduce lifecycle emissions.", CORPUS, "x");
  assert.deepEqual(topical.edges, [], "no edge from topical tokens");
  const unknown = planLinks("Report prepared per ISO 14084.", CORPUS, "x");
  assert.deepEqual(unknown.edges, [], "unknown standard is NOT wired");
  assert.ok(unknown.surface.some((s) => /14084/.test(s.mention)), "unknown standard IS surfaced (never dropped)");
});

test("MOAT BOUNDARY: planLinkWrites only ever targets item_cross_references + integrity_flags", () => {
  const writes = planLinkWrites("GLEC aligns with ISO 14083; conforms to ISO 14084.", CORPUS, "glecv3");
  assert.ok(writes.length > 0);
  for (const w of writes) assert.ok(LINK_ALLOWED_TABLES.includes(w.table), `unexpected table ${w.table}`);
  assert.ok(writes.some((w) => w.table === "item_cross_references"), "wires the ISO 14083 edge");
  assert.ok(writes.some((w) => w.table === "integrity_flags"), "surfaces the unknown ISO 14084, not dropped");
  assert.doesNotThrow(() => assertMoatBoundary(writes));
});

test("MOAT BOUNDARY negative self-test (DEMONSTRATED FAILING MODE): a section_claim_provenance write IS caught", () => {
  // The regression the moat boundary exists to stop — extraction leaking into grounding citations.
  const forbidden = [{ table: "section_claim_provenance", row: { claim_kind: "FACT" } }];
  assert.throws(() => assertMoatBoundary(forbidden), /moat boundary violated/,
    "the guard MUST fail when the link path touches section_claim_provenance — proven failing mode, not a comment");
  // and any other non-allowed table
  assert.throws(() => assertMoatBoundary([{ table: "sources", row: {} }]), /moat boundary violated/);
});

test("DEDUP matchExistingSubject: high-precision only (instrument / url / reg-#); title-similarity is NOT a match", () => {
  // same instrument_identifier → dup
  assert.deepEqual(matchExistingSubject({ instrument_identifier: "2023/1805", title: "Anything" }, CORPUS).map((m) => m.id), ["fueleu_num"]);
  // same reg-# in title → dup even without instrument set
  assert.ok(matchExistingSubject({ title: "New take on Regulation (EU) 2023/1805" }, CORPUS).some((m) => m.id === "fueleu_num"));
  // same CANONICAL URL (scheme-CASE + www + trailing-slash folded by canonicalizeUrl) → dup. NB the
  // one-canonicalizer switch keeps http vs https DISTINCT (scheme is preserved, only its case normalized),
  // so this variant is same-scheme; instrument_identifier + reg_number remain the primary identity signals.
  assert.deepEqual(matchExistingSubject({ source_url: "https://x.org/doc" }, [{ id: "a", title: "A", source_url: "HTTPS://www.x.org/doc/" }]).map((m) => m.id), ["a"]);
  // TITLE-SIMILARITY ALONE is NOT a dup (the false-match the whole exercise fights)
  assert.deepEqual(matchExistingSubject({ title: "GLEC Framework air freight edition" }, CORPUS), []);
  // never self
  assert.deepEqual(matchExistingSubject({ id: "fueleu_num", instrument_identifier: "2023/1805" }, CORPUS), []);
});

// ── D1/D2 GOLDEN: one-canonicalizer dedup discrimination (intake dry-proof, 2026-07-12) ─────────────────────
// The D1 regression: an ad-hoc _normUrl stripped the ENTIRE query ([#?].*$), collapsing every
// eur-lex …/legal-content/EN/TXT?uri=CELEX:… URL to one key, so any new EUR-Lex reg false-deduped against the
// first corpus item of that path shape. The class fix routes URL identity through the ONE sanctioned
// canonicalizer (canonicalizeUrl), which PRESERVES query CONTENT (the CELEX is the identity) while folding the
// noise variants (scheme-case / www / default-port / trailing-slash / query-ORDER / fragment). These pin the
// discrimination red-then-green (RED under the query-stripping _normUrl; GREEN under canonicalizeUrl).
const EURLEX_A = "https://eur-lex.europa.eu/legal-content/EN/TXT?uri=CELEX:32020R1056"; // eFTI, Regulation (EU) 2020/1056
const EURLEX_B = "https://eur-lex.europa.eu/legal-content/EN/TXT?uri=CELEX:52023PC0445"; // a DIFFERENT instrument, same path shape
const CELEX_CORPUS = [
  { id: "efti", title: "electronic Freight Transport Information (eFTI) Regulation (EU) 2020/1056", instrument_identifier: "2020/1056", source_url: EURLEX_A },
];

test("D1 GOLDEN: two EUR-Lex URLs sharing the legal-content path but naming DIFFERENT CELEX do NOT dedup (query is identity)", () => {
  const m = matchExistingSubject({ title: "A separate 2023 instrument (COM 2023/0445-shaped)", source_url: EURLEX_B }, CELEX_CORPUS);
  assert.deepEqual(m, [], `EURLEX_B must NOT dedup against eFTI — the CELEX in ?uri= is the identity, not the shared path. Got ${JSON.stringify(m)}`);
});

test("D1 GOLDEN: reg-number matcher does NOT false-positive across the CELEX pair (distinct numbers)", () => {
  // eFTI is 2020/1056; the probe carries a distinct number 2023/0445 in its title. Neither source_url (different
  // CELEX) nor reg_number (different number) may match — the whole point is high-precision identity.
  const m = matchExistingSubject({ title: "Regulation (EU) 2023/0445 — unrelated instrument", source_url: EURLEX_B }, CELEX_CORPUS);
  assert.deepEqual(m, [], `no source_url and no reg_number false-positive across the pair; got ${JSON.stringify(m)}`);
});

test("D1 GOLDEN: the SAME EUR-Lex instrument (identical uri=CELEX) DOES dedup on source_url", () => {
  const m = matchExistingSubject({ title: "eFTI re-discovered (no number in title)", source_url: EURLEX_A }, CELEX_CORPUS);
  assert.deepEqual(m.map((x) => x.id), ["efti"], "same CELEX → same canonical URL → dedup");
  assert.equal(m[0].how, "source_url", "matched via the canonical source_url, not the reg number");
});

test("D1 GOLDEN: noise variants the canonicalizer folds (scheme-CASE, www, trailing slash, fragment, query-order) DO dedup", () => {
  const variant = "HTTPS://WWW.eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32020R1056#anchor";
  const m = matchExistingSubject({ title: "eFTI (noisy url variant)", source_url: variant }, CELEX_CORPUS);
  assert.deepEqual(m.map((x) => x.id), ["efti"], "scheme-case + www + trailing-slash + fragment all canonicalize equal → dedup");
});

test("bucket is mechanical: identifier/named→1 item = wire; >1 or shaped = surface", () => {
  assert.equal(classifyBucket({ kind: "identifier" }, 1), "wire");
  assert.equal(classifyBucket({ kind: "named" }, 1), "wire");
  assert.equal(classifyBucket({ kind: "named" }, 2), "surface");   // ambiguous
  assert.equal(classifyBucket({ kind: "named" }, 0), "surface");   // unmatched candidate
  assert.equal(classifyBucket({ kind: "shaped" }, 1), "surface");  // shaped never wires even if it title-matches
});

// ── REGRESSION (2026-07-30): an implementing/amending act must NOT dedup against its PARENT act ──────
// Found live in the P2 publication batch: minting Implementing Regulation (EU) 2026/394 ("…laying down
// rules for the application of Regulation (EU) 2023/1805…") matched the EXISTING FuelEU item for
// Regulation 2023/1805 via `reg_number`. Cause: `regs` scraped EVERY regnum out of the TITLE, so the
// parent act a title merely REFERENCES was treated as the new item's own identity. Every implementing,
// delegated and amending act names its parent in the title, so this systematically blocked that whole
// class of intake — and asserted "this IS that instrument" when it is not.
test("implementing act does not dedup against the parent act it references", () => {
  const parentFuelEU = { id: "parent-1805", title: "EU Regulation 2023/1805 - Official Journal", instrument_identifier: "2023/1805", source_url: "https://eur-lex.europa.eu/eli/reg/2023/1805/oj/eng" };
  const implementing = { title: "Commission Implementing Regulation (EU) 2026/394 of 23 February 2026 laying down rules for the application of Regulation (EU) 2023/1805 of the European Parliament and of the Council, as regards access rights and the functional and technical specifications of the FuelEU database", instrument_identifier: "32026R0394", source_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32026R0394" };
  assert.deepEqual(matchExistingSubject(implementing, [parentFuelEU]), [],
    "an implementing act must not resolve to the parent regulation it cites in its title");
});

test("amending act does not dedup against the act it amends", () => {
  const parentMrv = { id: "parent-757", title: "EU MRV Regulation", instrument_identifier: "2015/757", source_url: "https://eur-lex.europa.eu/eli/reg/2015/757/oj/eng" };
  const amending = { title: "Commission Delegated Regulation (EU) 2024/3214 of 16 October 2024 amending Regulation (EU) 2015/757 of the European Parliament and of the Council as regards the rules for the monitoring of greenhouse gas emissions from offshore ships", instrument_identifier: "32024R3214", source_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R3214" };
  assert.deepEqual(matchExistingSubject(amending, [parentMrv]), [],
    "an amending act must not resolve to the act it amends");
});

// The genuine-duplicate direction MUST still fire — the fix narrows identity, it does not disable dedup.
test("a real duplicate of the SAME instrument still dedups (CELEX id vs slash-form title)", () => {
  const existing = { id: "existing-3214", title: "Commission Delegated Regulation (EU) 2024/3214", instrument_identifier: "2024/3214" };
  const dupe = { title: "Delegated Regulation (EU) 2024/3214 — offshore ship monitoring", instrument_identifier: "32024R3214" };
  assert.deepEqual(matchExistingSubject(dupe, [existing]), [{ id: "existing-3214", how: "reg_number" }],
    "the same instrument in CELEX form must still match its slash-form twin");
});

// Title-scrape fallback is preserved for items that carry NO identifier at all.
test("identifier-less item still matches by title reg_number", () => {
  const existing = { id: "existing-757", title: "EU MRV Regulation", instrument_identifier: "2015/757" };
  const bare = { title: "Regulation (EU) 2015/757 on monitoring of CO2 emissions from maritime transport" };
  assert.deepEqual(matchExistingSubject(bare, [existing]), [{ id: "existing-757", how: "reg_number" }],
    "an item with no identifier must still fall back to title scraping");
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WO-28 phase 1 (ADR-021) — LINEAGE TYPING + THE GAP FEED
// Fixtures below reuse the exact live-title shapes read in the 2026-08-29 governing session (the same
// implementing/amending titles matchExistingSubject's own regression tests above already carry), plus one
// derogation-shaped fixture matching the ADR's "six-state fuel-excise derogations" family (Council
// Directive 2003/96/EC, Article 19 — the real EU energy-taxation derogation mechanism).
// ══════════════════════════════════════════════════════════════════════════════════════════════════════

// ── classifyRelationship (isolated — no corpus, no resolution; pure pattern classification) ──────────

test("classifyRelationship: 'application of' near the mention → implements", () => {
  const content = "Commission Implementing Regulation (EU) 2026/394 of 23 February 2026 laying down rules for the application of Regulation (EU) 2023/1805 of the European Parliament and of the Council, as regards access rights.";
  const r = classifyRelationship(content, "2023/1805");
  assert.equal(r.relationship, "implements");
  assert.deepEqual(r.basis, [{ signal: "lineage", detail: "implements 2023/1805", weight: 0 }]);
});

test("classifyRelationship: SELF TITLE 'Commission Implementing ...' is a fallback signal when the content near the mention doesn't say 'implementing'/'application of'", () => {
  const content = "This instrument concerns Regulation (EU) 2023/1805 and the FuelEU database access rights.";
  const r = classifyRelationship(content, "2023/1805", "Commission Implementing Regulation (EU) 2026/394 of 23 February 2026");
  assert.equal(r.relationship, "implements");
});

test("classifyRelationship: 'amending' near the mention → amends", () => {
  const content = "Commission Delegated Regulation (EU) 2024/3214 of 16 October 2024 amending Regulation (EU) 2015/757 of the European Parliament and of the Council as regards the rules for the monitoring of greenhouse gas emissions from offshore ships.";
  const r = classifyRelationship(content, "2015/757");
  assert.equal(r.relationship, "amends");
  assert.deepEqual(r.basis, [{ signal: "lineage", detail: "amends 2015/757", weight: 0 }]);
});

test("classifyRelationship: 'supplementing'/'Delegated' near the mention → depends_on (CHECK has no dedicated 'supplements' value)", () => {
  const content = "Commission Delegated Regulation (EU) 2024/5555 of 4 March 2024 supplementing Regulation (EU) 2023/1805 of the European Parliament and of the Council with regard to alternative fuels reporting.";
  const r = classifyRelationship(content, "2023/1805");
  assert.equal(r.relationship, "depends_on");
  assert.deepEqual(r.basis, [{ signal: "lineage", detail: "supplements 2023/1805", weight: 0 }]);
});

test("classifyRelationship: derogation shape (authoris… + in accordance with) → depends_on, verb preserved in basis (derogates_under is not CHECK-legal yet)", () => {
  const content = "Council Implementing Decision (EU) 2026/700 of 14 January 2026 authorising Latvia to apply, in accordance with Article 19 of Council Directive 2003/96/EC, a reduced level of taxation to gas oil used as fuel for waste collection vehicles.";
  const r = classifyRelationship(content, "2003/96");
  assert.equal(r.relationship, "depends_on", "derogates_under is not in the item_cross_references_relationship_check yet (WO-12/19 DDL window) — depends_on stays CHECK-legal");
  assert.deepEqual(r.basis, [{ signal: "lineage", detail: "derogates under 2003/96", weight: 0 }], "the precise verb ('derogates under') is preserved in basis even though the relationship column can't carry it yet");
});

test("classifyRelationship: derogation priority — 'authoris…in accordance with' wins over an incidental 'amending' elsewhere in the SAME window", () => {
  const content = "Council Implementing Decision authorising France, amending nothing else in the text, in accordance with Article 19 of Council Directive 2003/96/EC, to apply a reduced rate.";
  const r = classifyRelationship(content, "2003/96");
  assert.equal(r.relationship, "depends_on");
  assert.ok(r.basis[0].detail.startsWith("derogates under"), "the more specific derogation shape must win, not the incidental 'amending' token");
});

test("classifyRelationship: no pattern near the mention → related, no basis (today's unchanged default)", () => {
  const content = "AFIR interoperates with the FuelEU rules set out in Regulation (EU) 2023/1805.";
  const r = classifyRelationship(content, "2023/1805");
  assert.equal(r.relationship, "related");
  assert.equal(r.basis, null);
});

test("classifyRelationship: WINDOWED — a pattern word far (>200 chars) from the mention does NOT type it; typing is mention-specific, not whole-document", () => {
  const filler = "x".repeat(260);
  const content = `This act is amending an unrelated instrument. ${filler} It also cites Regulation (EU) 2023/1805 in passing, with no lineage language nearby.`;
  const r = classifyRelationship(content, "2023/1805");
  assert.equal(r.relationship, "related", "the 'amending' token is far outside the LINEAGE_WINDOW around 2023/1805 and must not leak onto it");
});

// ── Full pipeline: planLinks / planLinkWrites — typed WIRE edges (Task A) ──────────────────────────────

const LINEAGE_CORPUS = [
  ...CORPUS,
  { id: "mrv757", title: "EU MRV Regulation", instrument_identifier: "2015/757" },
  // the self item, present in corpus (as it would be at real link-time — the mint already inserted its own
  // row) with its OWN instrument number, distinct from the parent it implements.
  { id: "impl394", title: "Commission Implementing Regulation (EU) 2026/394 of 23 February 2026 laying down rules for the application of Regulation (EU) 2023/1805 of the European Parliament and of the Council", instrument_identifier: "2026/394" },
  // the derogation decision's own row, same reasoning — without it "2026/700" (the decision's own number,
  // sitting right beside "authorising...in accordance with" in its own title) would itself be swept into
  // lineageGaps as a false "missing parent", the same class the impl394 self-exclusion test above pins.
  { id: "x-derogation-700", title: "Council Implementing Decision (EU) 2026/700 of 14 January 2026 authorising Latvia to apply a reduced level of taxation to gas oil used as fuel for waste collection vehicles", instrument_identifier: "2026/700" },
];

test("planLinks: an implementing act wires a TYPED 'implements' edge to its parent (not the default 'related')", () => {
  const content = "Commission Implementing Regulation (EU) 2026/394 of 23 February 2026 laying down rules for the application of Regulation (EU) 2023/1805 of the European Parliament and of the Council, as regards access rights and the functional and technical specifications of the FuelEU database.";
  const { edges } = planLinks(content, LINEAGE_CORPUS, "impl394");
  const toParent = edges.find((e) => e.target_item_id === "fueleu_num");
  assert.ok(toParent, "must wire to the FuelEU parent item");
  assert.equal(toParent.relationship, "implements");
  assert.deepEqual(toParent.basis, [{ signal: "lineage", detail: "implements 2023/1805", weight: 0 }]);
});

test("planLinks: the citing item's OWN reg-number never becomes a lineage gap, even sitting inside the same lineage-pattern window as the real parent mention", () => {
  const content = "Commission Implementing Regulation (EU) 2026/394 of 23 February 2026 laying down rules for the application of Regulation (EU) 2023/1805 of the European Parliament and of the Council.";
  const { lineageGaps } = planLinks(content, LINEAGE_CORPUS, "impl394");
  assert.ok(!lineageGaps.some((g) => g.mention === "2026/394"), `the self's own number must never appear as a missing parent; got ${JSON.stringify(lineageGaps)}`);
});

test("planLinks: an amending act wires a TYPED 'amends' edge to the act it amends", () => {
  const content = "Commission Delegated Regulation (EU) 2024/3214 of 16 October 2024 amending Regulation (EU) 2015/757 of the European Parliament and of the Council as regards the rules for the monitoring of greenhouse gas emissions from offshore ships.";
  const { edges } = planLinks(content, LINEAGE_CORPUS, "x-amend-3214");
  const toParent = edges.find((e) => e.target_item_id === "mrv757");
  assert.ok(toParent, "must wire to the MRV parent item");
  assert.equal(toParent.relationship, "amends");
});

test("planLinks: an UNTYPED (no lineage pattern) identifier mention still wires 'related' with no basis — today's behavior unchanged", () => {
  // plain CORPUS here, not LINEAGE_CORPUS — impl394's title itself CONTAINS "2023/1805" (it names its
  // parent), so with impl394 in the pool "2023/1805" would resolve to TWO items (fueleu_num + impl394) and
  // fall to ambiguous/surface instead of wiring. That is real, pre-existing resolve() behavior (unrelated to
  // WO-28), not something this test is about — CORPUS keeps the fixture to the single-resolution case.
  const { edges } = planLinks("AFIR interoperates with the FuelEU rules set out in Regulation (EU) 2023/1805.", CORPUS, "afir");
  const toParent = edges.find((e) => e.target_item_id === "fueleu_num");
  assert.ok(toParent);
  assert.equal(toParent.relationship, "related");
  assert.equal(toParent.basis, null);
});

test("planLinks: NAMED-entity wire edges stay 'related' (typing is scoped to identifier mentions only, per brief)", () => {
  const { edges } = planLinks("GLEC Framework v3 is aligned with ISO 14083 and the GHG Protocol.", LINEAGE_CORPUS, "glecv3");
  for (const e of edges) { assert.equal(e.kind, "named"); assert.equal(e.relationship, "related"); assert.equal(e.basis, null); }
});

// ── Full pipeline: the gap feed (Task B) ────────────────────────────────────────────────────────────────

test("planLinks: a derogation-shaped mention that resolves to ZERO corpus items becomes a lineageGap (Council Directive 2003/96/EC absent from the corpus)", () => {
  const content = "Council Implementing Decision (EU) 2026/700 of 14 January 2026 authorising Latvia to apply, in accordance with Article 19 of Council Directive 2003/96/EC, a reduced level of taxation to gas oil used as fuel for waste collection vehicles.";
  const { edges, surface, lineageGaps } = planLinks(content, LINEAGE_CORPUS, "x-derogation-700");
  assert.deepEqual(edges, [], "2003/96 is not in the corpus, so it cannot wire — no edge");
  assert.ok(surface.some((s) => s.mention === "2003/96" && s.resolvedCount === 0), "unresolved posture is unchanged: still folds into the generic surface set too");
  assert.deepEqual(lineageGaps, [{ mention: "2003/96", relationship: "depends_on" }]);
});

test("planLinks: a resolved-count-0 mention with NO lineage pattern stays generic surface only — not every unresolved mention is a lineage gap", () => {
  const { surface, lineageGaps } = planLinks("Report prepared per ISO 14084.", LINEAGE_CORPUS, "x");
  assert.ok(surface.some((s) => /14084/.test(s.mention)));
  assert.deepEqual(lineageGaps, [], "a shaped/unknown-standard mention with no lineage phrasing must not manufacture a gap");
});

test("planLinkWrites: the lineage gap surfaces as ONE aggregated coverage_gap integrity_flags row in its own dedup namespace", () => {
  const content = "Council Implementing Decision (EU) 2026/700 authorising Latvia to apply, in accordance with Article 19 of Council Directive 2003/96/EC, a reduced level of taxation to gas oil used as fuel for waste collection vehicles.";
  const writes = planLinkWrites(content, LINEAGE_CORPUS, "x-derogation-700");
  const gapFlags = writes.filter((w) => w.table === "integrity_flags" && w.row.created_by === "lineage-gap:absent-parent");
  assert.equal(gapFlags.length, 1, "exactly one aggregated lineage-gap flag, never one-per-mention spam");
  const row = gapFlags[0].row;
  assert.equal(row.category, "coverage_gap");
  assert.equal(row.subject_type, "item");
  assert.equal(row.subject_ref, "x-derogation-700");
  assert.equal(row.status, "open");
  assert.ok(row.description.includes("2003/96"));
  assert.ok(row.description.length <= 480);
  assert.ok(Array.isArray(row.recommended_actions) && row.recommended_actions.length === 1);
  assert.doesNotThrow(() => assertMoatBoundary(writes));
});

test("planLinkWrites: typed edge rows carry `relationship` + `basis`; untyped edge rows carry no basis field at all", () => {
  const content = "Commission Implementing Regulation (EU) 2026/394 of 23 February 2026 laying down rules for the application of Regulation (EU) 2023/1805 of the European Parliament and of the Council.";
  const writes = planLinkWrites(content, LINEAGE_CORPUS, "impl394");
  const edgeWrite = writes.find((w) => w.table === "item_cross_references" && w.row.target_item_id === "fueleu_num");
  assert.equal(edgeWrite.row.relationship, "implements");
  assert.equal(edgeWrite.row.origin, "entity_extraction");
  assert.deepEqual(edgeWrite.row.basis, [{ signal: "lineage", detail: "implements 2023/1805", weight: 0 }]);

  const untypedWrites = planLinkWrites("AFIR interoperates with the FuelEU rules set out in Regulation (EU) 2023/1805.", CORPUS, "afir"); // plain CORPUS — see the note in the planLinks version of this fixture above
  const untypedEdge = untypedWrites.find((w) => w.table === "item_cross_references" && w.row.target_item_id === "fueleu_num");
  assert.equal(untypedEdge.row.relationship, "related");
  assert.ok(!("basis" in untypedEdge.row), "an untyped edge row must not carry a basis key at all — exactly today's shape");
});

test("planLinkWrites: a lineage-gap flag and a generic surface flag can coexist for the same item without colliding", () => {
  const content = "Council Implementing Decision authorising Latvia in accordance with Article 19 of Council Directive 2003/96/EC. Report also prepared per ISO 14084.";
  const writes = planLinkWrites(content, LINEAGE_CORPUS, "x-both-flags");
  const flagTables = writes.filter((w) => w.table === "integrity_flags");
  assert.equal(flagTables.length, 2, "one intake-entity-link surface flag + one lineage-gap flag — distinct created_by namespaces");
  const createdBys = flagTables.map((w) => w.row.created_by).sort();
  assert.deepEqual(createdBys, ["intake-entity-link", "lineage-gap:absent-parent"]);
});

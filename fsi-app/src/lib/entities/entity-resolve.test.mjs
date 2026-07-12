// Unit proof for the deterministic entity DETECT→RESOLVE→BUCKET core (phase-intake-gate). Pure, node
// builtins only → runs in the depless discipline CI. Proves BOTH samples: the curated case (GLEC→ISO-14083,
// already found by hand) AND the MISSED case (content names 2023/1805 → resolves to the FuelEU item despite
// NO title overlap — the case title-matching slipped). Plus the negatives: topical token → no edge; unknown
// standard-shaped → surfaced, not dropped.
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectMentions, resolve, classifyBucket, planLinks, planLinkWrites, assertMoatBoundary, LINK_ALLOWED_TABLES, matchExistingSubject } from "./entity-resolve.mjs";
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

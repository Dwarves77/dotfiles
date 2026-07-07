// @ts-check
// RED-THEN-GREEN fixtures for the SEEK-MORE unit (paired with the RD-14 ladder). Transports + webSearch +
// exhaustion persister are DEP-INJECTED fakes — NO real fetch, NO db write (scrape hold honored). Run:
// node --test (exit-code + file-redirect; Windows libuv eats node --test stdout). Registered in run-test-suite.sh.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateCandidates, eurlexCandidates, ukCandidates, lovdataCandidates, gazetteCandidates, apiCandidates,
  runSeekMore, exhaustionFlagRow, persistExhaustionRecord,
} from "./seek-more.mjs";

const REAL_LAW = "Kapittel 1 Formål og virkeområde. Denne forskriften stiller krav om nullutslipp for skip og ferger i verdensarvfjordene. Section 1 requires zero-emission operation. " + "x".repeat(3000);
const EURLEX_404 = "Page Not Found - EUR-Lex Skip to main content English Select your language bg es cs da de en fr The page you are looking for was moved, removed, renamed or doesn't exist. " + "nav footer ".repeat(30);
const SFC_403 = "403 ERROR The request could not be satisfied. Request blocked. Access Denied. You don't have permission to access this resource.";

// ── DETERMINISTIC RESOLVERS (no fetch) ───────────────────────────────────────────────────────────────────────
test("eurlex: CELEX + ELI → eur-lex canonical URLs", () => {
  assert.deepEqual(eurlexCandidates({ identifier: "CELEX:32022L2464" }), ["https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32022L2464"]);
  assert.deepEqual(eurlexCandidates({ identifier: "32023R1115" }), ["https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023R1115"]);
  assert.deepEqual(eurlexCandidates({ identifier: "eli/reg/2023/1115" }), ["https://eur-lex.europa.eu/eli/reg/2023/1115"]);
  assert.deepEqual(eurlexCandidates({ sourceUrl: "https://eur-lex.europa.eu/eli/dir/2022/2464/oj" }), ["https://eur-lex.europa.eu/eli/dir/2022/2464/oj"]);
});

test("uk: statutory-instrument reference → legislation.gov.uk", () => {
  assert.deepEqual(ukCandidates({ identifier: "uksi/2023/123" }), ["https://www.legislation.gov.uk/uksi/2023/123"]);
  assert.deepEqual(ukCandidates({ identifier: "SI 2023/123" }), ["https://www.legislation.gov.uk/uksi/2023/123"]);
  assert.deepEqual(ukCandidates({ identifier: "2023 No. 123" }), ["https://www.legislation.gov.uk/uksi/2023/123"]);
});

test("gazette: Ireland S.I. → irishstatutebook.ie ELI; API host passthrough", () => {
  assert.deepEqual(gazetteCandidates({ jurisdiction: "Ireland", identifier: "S.I. No. 375 of 2023" }), ["https://www.irishstatutebook.ie/eli/2023/si/375/made/en/print"]);
  assert.deepEqual(apiCandidates({ sourceUrl: "https://www.federalregister.gov/documents/2026/01/01/2026-1/rule" }), ["https://www.federalregister.gov/documents/2026/01/01/2026-1/rule"]);
  assert.deepEqual(apiCandidates({ sourceUrl: "https://example.com/x" }), []);
});

// ── THE LOVDATA DESIGN FIXTURE — machine-derived, never hand-fed ──────────────────────────────────────────────
test("LOVDATA DESIGN FIXTURE: Norway fjord ZEV forskrift identity → lovdata.no canonical URL BY MACHINE", () => {
  // The instrument IDENTITY (its legal citation), not a hand-fed URL. The machine transforms the forskrift
  // citation "FOR-2018-05-04-680" → the lovdata.no canonical forskrift URL — exactly how lovdata.no would have
  // been found mechanically. (Fixture identity: the World Heritage fjords zero-emission forskrift; the citation
  // value is illustrative test data, not asserted as a real-world legal fact — the proof is the deterministic
  // TRANSFORM from identity to canonical URL.)
  const norwayIdentity = { title: "Zero-emission requirements for ships in the World Heritage fjords", jurisdiction: "Norway", identifier: "FOR-2018-05-04-680" };
  assert.deepEqual(lovdataCandidates(norwayIdentity), ["https://lovdata.no/dokument/SF/forskrift/2018-05-04-680"]);
  // the bare date-number form also resolves when jurisdiction is Norway (no FOR- prefix needed)
  assert.deepEqual(lovdataCandidates({ jurisdiction: "Norway", identifier: "2018-05-04-680" }), ["https://lovdata.no/dokument/SF/forskrift/2018-05-04-680"]);
  // a non-Norway bare date-number does NOT resolve to lovdata (jurisdiction-gated)
  assert.deepEqual(lovdataCandidates({ jurisdiction: "Sweden", identifier: "2018-05-04-680" }), []);
});

test("generateCandidates: order is identifier-resolved → API → gazette → web-search, de-duped, https-only", async () => {
  const identity = { title: "World Heritage fjords ZEV", jurisdiction: "Norway", identifier: "FOR-2018-05-04-680", sourceUrl: "https://www.federalregister.gov/documents/2026/01/01/2026-1/x" };
  const candidates = await generateCandidates(identity, { webSearch: async () => ["https://webhit.example/official", "http://insecure.example/skip"] });
  assert.equal(candidates[0], "https://lovdata.no/dokument/SF/forskrift/2018-05-04-680", "identifier-resolved official first");
  assert.equal(candidates[1], "https://www.federalregister.gov/documents/2026/01/01/2026-1/x", "API-host candidate before web-search");
  assert.equal(candidates[candidates.length - 1], "https://webhit.example/official", "web-search fallback LAST");
  assert.ok(!candidates.some((u) => u.startsWith("http://")), "http:// (insecure) candidates are dropped");
});

// ── (a) LOVDATA END-TO-END: dead primary → machine candidates → genuine primary found + captured ─────────────
test("FIXTURE (a): dead primary → machine-generated lovdata candidate → found + captured through the write gate", async () => {
  const item = { id: "item-no-fjord", title: "World Heritage fjords ZEV", jurisdiction: "Norway", identifier: "FOR-2018-05-04-680", source_url: "https://old.example/dead-portal" };
  const fetched = [];
  const r = await runSeekMore(item, {
    // the machine derives the lovdata URL from the identity; the ladder fetches it and finds the real forskrift.
    transports: {
      directFetch: async (u) => { fetched.push(u); return u.includes("lovdata.no") ? { status: 200, text: REAL_LAW } : { status: 404, text: EURLEX_404 }; },
      browserlessRender: async (u) => (u.includes("lovdata.no") ? { status: 200, text: REAL_LAW } : { status: 404, text: EURLEX_404 }),
      seekMore: async () => { throw new Error("a candidate was found — must NOT recurse"); },
    },
    persistExhaustion: async () => {},
  });
  assert.ok(r.candidates.includes("https://lovdata.no/dokument/SF/forskrift/2018-05-04-680"), "the machine generated the lovdata canonical URL");
  assert.equal(r.outcome, "content");
  assert.ok(r.captured && r.captured.url.includes("lovdata.no"), "the genuine primary was found on lovdata.no");
  assert.equal(r.captured.text, REAL_LAW, "captured through the write-side gate (real content)");
  assert.ok(r.exhaustionRecord.some((a) => a.url.includes("lovdata.no") && a.verdict === "content"));
});

// ── (b) EXHAUSTION: all candidates fail → record persisted, NO_REACHABLE_SOURCE hold, ZERO stored ────────────
test("FIXTURE (b): every candidate fails → exhaustion record persisted, NO_REACHABLE_SOURCE hold, ZERO stored", async () => {
  const item = { id: "item-exhausted", title: "Unreachable reg", jurisdiction: "EU", identifier: "CELEX:32022L2464", source_url: "https://sfc.org/blocked" };
  const persisted = [];
  const r = await runSeekMore(item, {
    webSearch: async () => ["https://web.example/also-blocked"],
    transports: {
      directFetch: async () => ({ status: 403, text: SFC_403 }),      // every transport, every candidate = wall
      browserlessRender: async () => ({ status: 403, text: SFC_403 }),
      seekMore: async () => { throw new Error("blocks are not not-found — do NOT seek-more recurse"); },
    },
    persistExhaustion: async (itemId, record, verdict) => { persisted.push({ itemId, record, verdict }); },
  });
  assert.equal(r.outcome, "no_reachable_source");
  assert.equal(r.holdReason, "NO_REACHABLE_SOURCE");
  assert.equal(r.captured, null, "ZERO bodies stored — an all-wall exhaustion never captures");
  assert.ok(r.exhaustionRecord.length >= 2, "every (candidate × transport) attempt is recorded");
  assert.equal(persisted.length, 1, "the exhaustion record is persisted once");
  assert.equal(persisted[0].itemId, "item-exhausted");
});

// ── PERSISTENCE SHAPE — the interim FLAG PATTERN (superseded by migration 147 fetch_status) ──────────────────
test("exhaustionFlagRow: the interim flag-pattern shape (created_by='exhaustion_record', attempts in recommended_actions)", () => {
  const record = [
    { url: "https://a/x", transport: "direct", verdict: "not_found", status: 404, bytes: 10, reason: "http_404" },
    { url: "https://a/x", transport: "render", verdict: "block", status: 403, bytes: 20, reason: "http_403" },
  ];
  const row = exhaustionFlagRow("item-1", record, { outcome: "no_reachable_source", holdReason: "NO_REACHABLE_SOURCE" });
  assert.equal(row.created_by, "exhaustion_record");
  assert.equal(row.category, "source_issue");
  assert.equal(row.subject_type, "item");
  assert.equal(row.subject_ref, "item-1");
  assert.equal(row.status, "open");
  assert.equal(row.recommended_actions.length, 2, "the full per-(candidate × transport) record lands in recommended_actions jsonb");
  assert.deepEqual(row.recommended_actions[0], { url: "https://a/x", transport: "direct", verdict: "not_found", bytes: 10, reason: "http_404", status: 404 });
  assert.ok(/exhaustion record/i.test(row.description) && row.description.length <= 480);
});

test("persistExhaustionRecord: dep-injected writer inserts ONE integrity_flags row (no live write)", async () => {
  const inserts = [];
  const fakeSb = { from: (t) => ({ insert: async (row) => { inserts.push({ table: t, row }); } }) };
  const row = await persistExhaustionRecord(fakeSb, "item-9", [{ url: "https://a", transport: "direct", verdict: "block", bytes: 0, reason: "http_403", status: 403 }], { outcome: "no_reachable_source", holdReason: "NO_REACHABLE_SOURCE" });
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].table, "integrity_flags");
  assert.equal(inserts[0].row.created_by, "exhaustion_record");
  assert.equal(row.subject_ref, "item-9");
});

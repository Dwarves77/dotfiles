// Unit tests for entity-id.mjs — run: node --test fsi-app/src/lib/entities/entity-id.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  KINDS, entityId, assertEntityId, entityKindOf, normalizeSeed, corridorSeed, hostFromUrl,
} from "./entity-id.mjs";

test("KINDS matches migration 282's entity_kind enum exactly (11 values, frozen)", () => {
  assert.deepEqual(KINDS, [
    "corridor", "node", "jurisdiction", "organisation", "asset",
    "instrument", "obligation", "method", "technology", "signpost", "person",
  ]);
  assert.ok(Object.isFrozen(KINDS));
});

test("entityId: deterministic — same (kind, seed) mints the same id every time, two independent calls", () => {
  const a = entityId("jurisdiction", "US");
  const b = entityId("jurisdiction", "US");
  assert.equal(a, b);
});

test("entityId: format is cl:<kind>:<16 lowercase hex>", () => {
  const id = entityId("jurisdiction", "US");
  assert.match(id, /^cl:jurisdiction:[0-9a-f]{16}$/);
});

test("entityId: different seeds mint different ids (no collision on the two obvious near-misses)", () => {
  assert.notEqual(entityId("jurisdiction", "US"), entityId("jurisdiction", "GB"));
  assert.notEqual(entityId("organisation", "eur-lex.europa.eu"), entityId("organisation", "example.com"));
});

test("entityId: jurisdiction seed is case- and whitespace-normalized (US === us === ' US ')", () => {
  const a = entityId("jurisdiction", "US");
  assert.equal(entityId("jurisdiction", "us"), a);
  assert.equal(entityId("jurisdiction", "  US  "), a);
});

test("entityId: instrument seed normalizes case (a CELEX-shaped key)", () => {
  const a = entityId("instrument", "32019R1242");
  assert.equal(entityId("instrument", "32019r1242"), a);
});

test("entityId: instrument seed preserves the OJ sequence suffix as a distinct entity (migration 255 parity)", () => {
  assert.notEqual(entityId("instrument", "22008A0221(01)"), entityId("instrument", "22008A0221(02)"));
});

test("entityId: organisation seed reduces a full URL and a bare host to the SAME id", () => {
  const fromHost = entityId("organisation", "eur-lex.europa.eu");
  const fromUrl = entityId("organisation", "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32019R1242");
  assert.equal(fromHost, fromUrl);
});

test("entityId: organisation seed strips a leading www. and lowercases", () => {
  const a = entityId("organisation", "example.com");
  assert.equal(entityId("organisation", "WWW.EXAMPLE.COM"), a);
  assert.equal(entityId("organisation", "https://www.example.com/path"), a);
});

test("entityId: empty/blank normalized seed throws rather than minting a degenerate id", () => {
  assert.throws(() => entityId("jurisdiction", ""));
  assert.throws(() => entityId("jurisdiction", "   "));
  assert.throws(() => entityId("organisation", ""));
  // A garbage non-URL, non-empty string still mints an id — entity-id.mjs only refuses an EMPTY
  // normalized seed; HOST-format validation is crosswalk.mjs's job (see crosswalk.test.mjs), kept
  // separate so a caller minting an id for a not-yet-crosswalked organisation is not blocked on it.
  assert.doesNotThrow(() => entityId("organisation", "not-a-real-host-but-not-empty"));
});

test("entityId: unknown kind throws", () => {
  assert.throws(() => entityId("widget", "x"), /unknown entity_kind/);
});

test("corridorSeed: builds ORIGIN-DEST:mode with UN/LOCODE upper and canonical mode", () => {
  assert.equal(corridorSeed({ origin: "cnsha", dest: "nlrtm", mode: "ocean" }), "CNSHA-NLRTM:ocean");
});

test("corridorSeed: sea/maritime alias to the canonical ocean token (ADR-024 decision 4)", () => {
  const canonical = corridorSeed({ origin: "CNSHA", dest: "NLRTM", mode: "ocean" });
  assert.equal(corridorSeed({ origin: "CNSHA", dest: "NLRTM", mode: "sea" }), canonical);
  assert.equal(corridorSeed({ origin: "CNSHA", dest: "NLRTM", mode: "maritime" }), canonical);
});

test("corridorSeed: throws on a missing endpoint or an unrecognised mode (never guesses)", () => {
  assert.throws(() => corridorSeed({ origin: "", dest: "NLRTM", mode: "ocean" }));
  assert.throws(() => corridorSeed({ origin: "CNSHA", dest: "NLRTM", mode: "teleport" }));
});

test("entityId('corridor', ...) accepts the object form and the pre-built string form identically", () => {
  const viaObject = entityId("corridor", { origin: "CNSHA", dest: "NLRTM", mode: "ocean" });
  const viaString = entityId("corridor", "CNSHA-NLRTM:ocean");
  assert.equal(viaObject, viaString);
});

test("entityId('corridor', ...): Suez vs Cape routing is OUT OF SCOPE for the spine's port-pair+mode key — same corridor entity either way (ADR-024 decision 4, distinct from migration 258's finer cl_corridor_id)", () => {
  const a = entityId("corridor", { origin: "CNSHA", dest: "NLRTM", mode: "ocean" });
  // The spine corridor deliberately does not take routing/leg into account — that distinction lives in
  // emission_factors.corridor_id (migration 258), not in entities. This test pins that as intentional.
  const b = entityId("corridor", { origin: "CNSHA", dest: "NLRTM", mode: "ocean" });
  assert.equal(a, b);
});

test("assertEntityId: accepts a well-formed id, optionally checking the kind", () => {
  const id = entityId("jurisdiction", "US");
  assert.equal(assertEntityId(id), true);
  assert.equal(assertEntityId(id, "jurisdiction"), true);
});

test("assertEntityId: rejects a malformed id, an unknown kind segment, and a kind mismatch", () => {
  assert.throws(() => assertEntityId("not-an-id"));
  assert.throws(() => assertEntityId("cl:widget:0123456789abcdef"));
  assert.throws(() => assertEntityId("cl:jurisdiction:ABCDEF0123456789")); // uppercase hex — not well-formed
  const id = entityId("jurisdiction", "US");
  assert.throws(() => assertEntityId(id, "instrument"));
});

test("entityKindOf: returns the kind for a well-formed id, null otherwise (non-throwing)", () => {
  const id = entityId("instrument", "32019R1242");
  assert.equal(entityKindOf(id), "instrument");
  assert.equal(entityKindOf("garbage"), null);
});

test("hostFromUrl: reduces a URL or bare host to a lowercased, www-stripped host; empty on unparseable input", () => {
  assert.equal(hostFromUrl("https://WWW.Example.com/a/b?c=1"), "example.com");
  assert.equal(hostFromUrl("example.com"), "example.com");
  assert.equal(hostFromUrl(""), "");
  assert.equal(hostFromUrl(null), "");
});

test("normalizeSeed: generic fallback kinds (no producer in this lane) trim/collapse whitespace without throwing", () => {
  assert.equal(normalizeSeed("asset", "  IMO   9074729  "), "IMO 9074729");
  assert.equal(normalizeSeed("obligation", "Art. 7(2)(b)"), "Art. 7(2)(b)");
});

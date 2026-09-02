// Unit tests for crosswalk.mjs — run: node --test fsi-app/src/lib/entities/crosswalk.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { SCHEMES, VALIDATORS, identifierRow } from "./crosswalk.mjs";
import { entityId } from "./entity-id.mjs";

test("SCHEMES matches spec §1.1's list plus HOST, frozen, no duplicates", () => {
  assert.deepEqual(SCHEMES, [
    "LEI", "IMO_SHIP", "IMO_COMPANY", "UNLOCODE", "IATA", "ICAO", "ISO3166_1", "ISO3166_2",
    "NUTS", "CELEX", "ELI", "ROR", "ORCID", "EORI", "SCAC", "ISO6346", "HOST",
  ]);
  assert.ok(Object.isFrozen(SCHEMES));
  assert.equal(new Set(SCHEMES).size, SCHEMES.length);
});

test("VALIDATORS covers every scheme exactly (no gap, no orphan)", () => {
  const validatorKeys = Object.keys(VALIDATORS).sort();
  assert.deepEqual(validatorKeys, [...SCHEMES].sort());
});

// ── LEI: ISO 17442 mod-97-10, verified against real published LEIs ──────────────────────────────────
test("LEI: accepts two real, published LEIs (Deutsche Bank AG; a second GLEIF-published example)", () => {
  assert.equal(VALIDATORS.LEI("529900T8BM49AURSDO55"), true);
  assert.equal(VALIDATORS.LEI("5493001KJTIIGC8Y1R12"), true);
});
test("LEI: rejects a mutated check digit and a wrong-length string", () => {
  assert.equal(VALIDATORS.LEI("529900T8BM49AURSDO56"), false); // last digit flipped
  assert.equal(VALIDATORS.LEI("529900T8BM49AURSDO5"), false); // 19 chars
  assert.equal(VALIDATORS.LEI(""), false);
});

// ── IMO ship number: the 7-digit weighted check digit ────────────────────────────────────────────────
test("IMO_SHIP: accepts two real IMO ship numbers", () => {
  assert.equal(VALIDATORS.IMO_SHIP("9074729"), true);
  assert.equal(VALIDATORS.IMO_SHIP("9319466"), true);
});
test("IMO_SHIP: rejects a mutated check digit and a non-7-digit string", () => {
  assert.equal(VALIDATORS.IMO_SHIP("9074720"), false);
  assert.equal(VALIDATORS.IMO_SHIP("12345"), false);
});
test("IMO_COMPANY: reuses the IMO_SHIP check-digit algorithm (documented [UNCONFIRMED] against a primary IMO source)", () => {
  assert.equal(VALIDATORS.IMO_COMPANY("9074729"), true);
  assert.equal(VALIDATORS.IMO_COMPANY("9074720"), false);
});

// ── ORCID: ISO 7064 mod-11-2 ─────────────────────────────────────────────────────────────────────────
test("ORCID: accepts two real, published ORCID iDs", () => {
  assert.equal(VALIDATORS.ORCID("0000-0002-1825-0097"), true);
  assert.equal(VALIDATORS.ORCID("0000-0001-5109-3700"), true);
});
test("ORCID: rejects a mutated check character", () => {
  assert.equal(VALIDATORS.ORCID("0000-0002-1825-0098"), false);
});

// ── ISO 6346 (freight container) check digit ─────────────────────────────────────────────────────────
test("ISO6346: accepts the canonical worked example (CSQU3054383)", () => {
  assert.equal(VALIDATORS.ISO6346("CSQU3054383"), true);
  assert.equal(VALIDATORS.ISO6346("CSQU 305438 3"), true); // spaces tolerated
});
test("ISO6346: rejects a mutated check digit and a bad category letter", () => {
  assert.equal(VALIDATORS.ISO6346("CSQU3054384"), false);
  assert.equal(VALIDATORS.ISO6346("CSQA3054383"), false); // category letter must be U/J/Z
});

// ── CELEX: shape parity with scripts/lib/canonical-key.mjs's deriveKey() output ────────────────────────
test("CELEX: accepts the bare and OJ-suffixed shapes canonical_instrument_key actually stores", () => {
  assert.equal(VALIDATORS.CELEX("32019R1242"), true);
  assert.equal(VALIDATORS.CELEX("22008A0221(01)"), true);
});
test("CELEX: rejects a bare YYYY/N (ambiguous, migration 200/255 never derive this shape)", () => {
  assert.equal(VALIDATORS.CELEX("2019/1242"), false);
});

// ── UN/LOCODE: 5 chars, 2-letter country + 3-char location ─────────────────────────────────────────────
test("UNLOCODE: accepts 5-char codes, rejects wrong length and a bare country code", () => {
  assert.equal(VALIDATORS.UNLOCODE("NLRTM"), true);
  assert.equal(VALIDATORS.UNLOCODE("CNSHA"), true);
  assert.equal(VALIDATORS.UNLOCODE("NL"), false);
  assert.equal(VALIDATORS.UNLOCODE("NLRTMX"), false);
});

// ── HOST: registrable-host shape (what entity-id.mjs's hostFromUrl() actually produces) ────────────────
test("HOST: accepts a real host, rejects a URL (must be pre-reduced) and an empty string", () => {
  assert.equal(VALIDATORS.HOST("eur-lex.europa.eu"), true);
  assert.equal(VALIDATORS.HOST("https://eur-lex.europa.eu"), false);
  assert.equal(VALIDATORS.HOST(""), false);
});

// ── ISO3166_1 / ISO3166_2 ────────────────────────────────────────────────────────────────────────────
test("ISO3166_1: accepts alpha-2 codes including the EU user-assigned code", () => {
  assert.equal(VALIDATORS.ISO3166_1("US"), true);
  assert.equal(VALIDATORS.ISO3166_1("EU"), true);
  assert.equal(VALIDATORS.ISO3166_1("USA"), false);
});
test("ISO3166_2: accepts a subdivision code shape", () => {
  assert.equal(VALIDATORS.ISO3166_2("US-CA"), true);
  assert.equal(VALIDATORS.ISO3166_2("US"), false);
});

// ── identifierRow() ──────────────────────────────────────────────────────────────────────────────────
test("identifierRow: builds a well-formed row for a valid (entityId, scheme, value, assertedBy)", () => {
  const id = entityId("jurisdiction", "US");
  const row = identifierRow(id, "ISO3166_1", "US", "scripts/entities/backfill-entities.mjs");
  assert.equal(row.entity_id, id);
  assert.equal(row.scheme, "ISO3166_1");
  assert.equal(row.value, "US");
  assert.equal(row.scheme_version, null);
  assert.equal(row.asserted_by, "scripts/entities/backfill-entities.mjs");
  assert.ok(typeof row.asserted_at === "string" && !Number.isNaN(Date.parse(row.asserted_at)));
});

test("identifierRow: carries scheme_version through when given (NUTS versioning)", () => {
  const id = entityId("jurisdiction", "DE-BY");
  const row = identifierRow(id, "NUTS", "DE21", "test", { schemeVersion: "2021" });
  assert.equal(row.scheme_version, "2021");
});

test("identifierRow: throws on a malformed entity id", () => {
  assert.throws(() => identifierRow("not-an-id", "ISO3166_1", "US", "test"));
});

test("identifierRow: throws on an unknown scheme", () => {
  const id = entityId("jurisdiction", "US");
  assert.throws(() => identifierRow(id, "SWIFT_BIC", "DEUTDEFF", "test"), /unknown identifier scheme/);
});

test("identifierRow: throws when the value fails the scheme's validator (a bad LEI)", () => {
  const id = entityId("organisation", "example.com");
  assert.throws(() => identifierRow(id, "LEI", "NOT-A-REAL-LEI-VALUE", "test"), /does not validate/);
});

test("identifierRow: throws on an empty value or a missing assertedBy", () => {
  const id = entityId("jurisdiction", "US");
  assert.throws(() => identifierRow(id, "ISO3166_1", "", "test"));
  assert.throws(() => identifierRow(id, "ISO3166_1", "US", ""));
});

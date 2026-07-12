// GOLDEN GATE CONTRACT TESTS (line-read-is-not-verification, RD-14). Table-driven behavioral proof of the
// four deterministic intake gates against the COMMITTED URL corpus (intake-url-corpus.mjs). Depless: the
// three gates are pure .mjs; matchExistingSubject pulls url-canonicalize.ts (Node type-strip). The idempotency
// short-circuits (source_url / legacy_id / fail-closed read-error) live in mint-item.ts (@/ aliases) and are
// covered by the jiti npmtests (mint-idempotency.npmtest.mjs + mint-failclosed.npmtest.mjs) — cross-referenced
// in RD-14's enforcedBy. An audit read of these gates does NOT count as verification; this table does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sourceRole, congruence } from "../entities/source-role.mjs";
import { urlIsRoot } from "../sources/entity-gate.mjs";
import { matchExistingSubject } from "../entities/entity-resolve.mjs";
import { URL_CASES, CONGRUENCE_CASES, DEDUP_CORPUS, DEDUP_CASES } from "./intake-url-corpus.mjs";

test("GATE sourceRole: every corpus URL maps to its pinned role (news vs primary vs other)", () => {
  for (const c of URL_CASES) {
    assert.equal(sourceRole(c.url), c.role, `sourceRole(${c.url}) — ${c.note}`);
  }
});

test("GATE urlIsRoot: portal roots (incl. language-prefix + landing-file variants) vs deep documents", () => {
  for (const c of URL_CASES) {
    assert.equal(urlIsRoot(c.url), c.isRoot, `urlIsRoot(${c.url}) — ${c.note}`);
  }
  // the discriminating property: a primary HOST homepage is role=primary AND isRoot=true (source != item).
  const eurlexRoot = URL_CASES.find((c) => c.url === "https://eur-lex.europa.eu/");
  assert.equal(eurlexRoot.role, "primary");
  assert.equal(eurlexRoot.isRoot, true);
});

test("GATE congruence: 1a retype (primary-artifact on news → market_signal) and 1b seek-study (research on news)", () => {
  for (const c of CONGRUENCE_CASES) {
    const r = congruence(c.itemType, c.url);
    assert.equal(r.itemType, c.expectType, `congruence(${c.itemType}, ${c.url}).itemType — ${c.note}`);
    assert.equal(r.changed, c.changed, `congruence(${c.itemType}, ${c.url}).changed — ${c.note}`);
    assert.equal(!!r.incongruentSource, c.incongruent, `congruence(${c.itemType}, ${c.url}).incongruentSource — ${c.note}`);
  }
});

test("GATE matchExistingSubject: CELEX discrimination, noise-variant equivalence, reg-# cross-match, title-sim rejection", () => {
  for (const c of DEDUP_CASES) {
    const out = matchExistingSubject(c.item, DEDUP_CORPUS);
    assert.deepEqual(out.map((m) => m.id), c.expectIds, `${c.name}: ids`);
    if (c.expectHow) assert.equal(out[0]?.how, c.expectHow, `${c.name}: how`);
  }
});

test("corpus integrity: every URL_CASES row carries both a role and an isRoot verdict + a note", () => {
  assert.ok(URL_CASES.length >= 15, "the committed corpus must be substantive");
  for (const c of URL_CASES) {
    assert.ok(["news", "primary", "other"].includes(c.role), `role vocab for ${c.url}`);
    assert.equal(typeof c.isRoot, "boolean", `isRoot boolean for ${c.url}`);
    assert.ok(c.note && c.note.length > 3, `note for ${c.url}`);
  }
});

/** Selftest for scripts/lib/canonical-key.mjs — pins the JS mirror to migration 255's own self-check
 *  vectors. Pure node:test + relative import (no npm deps) — runs in the no-npm suite. If the SQL deriver
 *  and this mirror ever diverge again, this is where it reddens (the lane's canonical-key-uniqueness audit
 *  derived six FALSE collisions from a stale mirror before this existed — run #66, 2026-08-11). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveKey } from "./canonical-key.mjs";

// The exact vectors migration 255's DO-block self-check asserts against the SQL function.
test("suffixed CELEX preserves the OJ sequence suffix, zero-padded", () => {
  assert.equal(deriveKey("22008A0221(01)", null), "22008A0221(01)");
  assert.equal(deriveKey("22008A0221(02)", null), "22008A0221(02)");
  assert.equal(deriveKey("22008A0221(1)", null), "22008A0221(01)");
  assert.notEqual(deriveKey("22008A0221(01)", null), deriveKey("22008A0221(02)", null));
});

test("bare CELEX and ELI derivations unchanged from migration 200", () => {
  assert.equal(deriveKey("32022L2464", null), "32022L2464");
  assert.equal(deriveKey("eli/reg/2023/1805", null), "32023R1805");
});

test("source_url branch: URL-encoded and literal suffixed CELEX", () => {
  assert.equal(deriveKey(null, "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A21994A1231%2852%29"), "21994A1231(52)");
  assert.equal(deriveKey(null, "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:21993A1231(16)"), "21993A1231(16)");
  assert.equal(deriveKey(null, "https://eur-lex.europa.eu/eli/dir/2014/94"), "32014L0094");
});

test("the six run-#66 false-collision pairs derive DISTINCT keys", () => {
  const pairs = [
    ["21993A1231(16)", "21993A1231(17)"],
    ["22011A1029(01)", "22011A1029(02)"],
    ["21994A1231(21)", "21994A1231(22)"],
    ["32000Y0229(01)", "32000Y0229(02)"],
    ["22008A0221(01)", "22008A0221(02)"],
    ["31975Y0725(01)", "31975Y0725(02)"],
  ];
  for (const [a, b] of pairs) assert.notEqual(deriveKey(a, null), deriveKey(b, null), `${a} vs ${b} collapsed`);
});

test("no match -> null", () => {
  assert.equal(deriveKey("not an instrument", "https://example.com/x"), null);
  assert.equal(deriveKey(null, null), null);
});

// claim-ledger-block.test.mjs (lane GATES-2, 2026-10-06): the strip (claim-ledger-block.ts) and the marker refusal
// (section-markers.mjs) share ONE ledger definition. Both must agree on the P3 fixture shapes: what the strip removes
// is exactly what the refusal would have refused, and a stripped body is clean.
import test from "node:test";
import assert from "node:assert/strict";
import { stripClaimLedgerBlocks, hasClaimLedgerBlock } from "./claim-ledger-block.ts";
import { findInternalMarkers, LEDGER_NAME, LEDGER_OPEN, LEDGER_CLOSE } from "./section-markers.mjs";

const REC = '[{"section":"8","claim_text":"Importers must register","claim_kind":"FACT","source_span":"shall register"}]';
const SHAPES = {
  "closed valid block": `# 1\n\nProse.\n\n${LEDGER_OPEN}\n${REC}\n${LEDGER_CLOSE}\n\n# 2\n\nMore prose.`,
  "closed malformed JSON (stray character, the P3 item shape)": `Prose.\n\n${LEDGER_OPEN}\n[{"section":"8" ,, }]\n${LEDGER_CLOSE}`,
  "opener never closed (output cut off mid-ledger)": `Prose.\n\n${LEDGER_OPEN}\n${REC}`,
  "stray closer": `Prose.\n${LEDGER_CLOSE}\nMore.`,
};

test("the sentinels are the agreed strings", () => {
  assert.equal(LEDGER_NAME, "CLAIM_PROVENANCE_LEDGER");
  assert.equal(LEDGER_OPEN, "<<<CLAIM_PROVENANCE_LEDGER");
  assert.equal(LEDGER_CLOSE, "CLAIM_PROVENANCE_LEDGER>>>");
});

for (const [name, body] of Object.entries(SHAPES)) {
  test(`agreement on the P3 shape: ${name}`, () => {
    assert.equal(hasClaimLedgerBlock(body), true);
    assert.ok(findInternalMarkers(body).some((h) => h.id === "claim-ledger"), "the refusal names the ledger");
    const stripped = stripClaimLedgerBlocks(body);
    assert.deepEqual(findInternalMarkers(stripped).filter((h) => h.id === "claim-ledger" || h.id === "sentinel-open"), [], "the strip leaves nothing the refusal would refuse");
    assert.match(stripped, /Prose\./);
  });
}

test("clean text is byte-identical under the strip and clean under the refusal", () => {
  const clean = "# 1\n\nPlain prose with 12% and a source.";
  assert.equal(stripClaimLedgerBlocks(clean), clean);
  assert.deepEqual(findInternalMarkers(clean), []);
});

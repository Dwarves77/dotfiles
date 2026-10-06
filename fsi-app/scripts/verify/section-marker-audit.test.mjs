// section-marker-audit.test.mjs (lane GATES-2, 2026-10-05): fixture rows only, every dependency injected.
// Run: node --test fsi-app/scripts/verify/section-marker-audit.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { countMarkerBodies, runAudit } from "./section-marker-audit.mjs";

const CLEAN = { id: "a", item_type: "regulation", full_brief: "# 1 Purpose\n\nClean text. Source: Official Journal." };
const LEDGER = {
  id: "b",
  item_type: "market_signal",
  full_brief: '# 1\n\nText.\n<<<CLAIM_PROVENANCE_LEDGER\n[{"section":"1","claim_text":"x","claim_kind":"FACT","source_span":"verbatim span"}]',
};
const JSON_ONLY = { id: "c", item_type: "market_signal", full_brief: 'Prose {"claim_kind":"FACT","source_span":"verbatim span of the source"} prose' };
const NULLBODY = { id: "d", item_type: "regulation", full_brief: null };

function io(over = {}) {
  const out = { log: [], err: [] };
  return {
    out,
    deps: { log: (m) => out.log.push(m), errorLog: (m) => out.err.push(m), loadEnv: () => {}, hasCreds: () => true, ...over },
  };
}

test("countMarkerBodies: clean and null bodies count zero", () => {
  const r = countMarkerBodies([CLEAN, NULLBODY]);
  assert.deepEqual(r, { scanned: 2, affected: 0, byMarker: {}, byItemType: {}, sample: [] });
});

test("ATTACK: forged bodies are counted, by marker class and by item type", () => {
  const r = countMarkerBodies([CLEAN, LEDGER, JSON_ONLY]);
  assert.equal(r.scanned, 3);
  assert.equal(r.affected, 2);
  assert.equal(r.byItemType.market_signal, 2);
  assert.equal(r.byMarker["claim-ledger"], 1);
  assert.equal(r.byMarker["json-object-literal"], 2);
  assert.deepEqual(r.sample.map((s) => s.id), ["b", "c"]);
});

test("runAudit: clean corpus passes (exit 0) and reads only non-archived rows with the body column", async () => {
  const { out, deps } = io();
  let seen;
  const code = await runAudit({
    ...deps,
    readAllFn: async (table, cols, opts) => {
      seen = { table, cols, hasMatch: typeof opts?.match === "function" };
      return [CLEAN];
    },
  });
  assert.equal(code, 0);
  assert.deepEqual(seen, { table: "intelligence_items", cols: "id,item_type,full_brief", hasMatch: true });
  assert.match(out.log.join("\n"), /1 stored section body scanned, 0 carry an internal marker/);
});

test("ATTACK: a corpus holding a forged body fails the audit (exit 1) and names the item", async () => {
  const { out, deps } = io();
  const code = await runAudit({ ...deps, readAllFn: async () => [CLEAN, LEDGER] });
  assert.equal(code, 1);
  assert.match(out.log.join("\n"), /\[MARKER\] item b \(market_signal\)/);
  assert.match(out.err.join("\n"), /1 stored body\(ies\) carry an internal marker/);
});

test("without credentials the audit self-skips with exit 2 and never reads", async () => {
  const { out, deps } = io({ hasCreds: () => false });
  let read = false;
  const code = await runAudit({ ...deps, readAllFn: async () => { read = true; return []; } });
  assert.equal(code, 2);
  assert.equal(read, false);
  assert.match(out.err.join("\n"), /self-skip/);
});

test("a read failure is exit 2 (cannot verify), never a false green", async () => {
  const { out, deps } = io();
  const code = await runAudit({ ...deps, readAllFn: async () => { throw new Error("boom"); } });
  assert.equal(code, 2);
  assert.match(out.err.join("\n"), /read failed: boom/);
});

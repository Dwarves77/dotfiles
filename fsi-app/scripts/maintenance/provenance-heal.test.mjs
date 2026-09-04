// provenance-heal.test.mjs — node --test scripts/maintenance/provenance-heal.test.mjs. No DB, no network:
// this wrapper's own `main`/`parseSelection` are re-exported UNMODIFIED from scripts/mint/heal-provenance.mjs
// (see that file's header for why — its own main() already owns the full dry/apply/selection contract),
// so heal-provenance.test.mjs is where that contract is exhaustively pinned. This file tests the wrapper's
// OWN surface: the CITE shape rule 015 requires, the re-export wiring itself, and one dry/apply smoke pass
// per selection through this file's own imports (never db.mjs — buildDeps only runs inside the IS_MAIN
// guard, which importing this module in a test never trips).
import { test } from "node:test";
import assert from "node:assert/strict";
import { CITE, main, parseSelection } from "./provenance-heal.mjs";
import { main as coreMain, parseSelection as coreParseSelection } from "../mint/heal-provenance.mjs";

test("CITE carries a governing skill and a reason (db.mjs's requireCite gate)", () => {
  assert.equal(typeof CITE.skill, "string");
  assert.ok(CITE.skill.length > 0);
  assert.match(CITE.reason, /heal-provenance\.mjs/);
});

test("main/parseSelection are re-exported byte-identical to heal-provenance.mjs's own", () => {
  assert.equal(main, coreMain);
  assert.equal(parseSelection, coreParseSelection);
});

function fakeDeps(overrides = {}) {
  const calls = [];
  return {
    calls,
    fetchImpl: async () => { throw new Error("dry mode must never fetch"); },
    requiredSlotsMap: { regulation: ["effective_date"] },
    readQuarantinedLive: async () => [{ id: "q-1", item_type: "regulation", full_brief: "", source_url: null, is_archived: false }],
    readArchivedUnreasoned: async () => [{ id: "a-1", item_type: "regulation", full_brief: "", source_url: null, is_archived: true }],
    readCandidateTypeItems: async () => [],
    readByIds: async (ids) => ids.map((id) => ({ id, item_type: "regulation", full_brief: "", source_url: null })),
    readCaptures: async () => [],
    readClaims: async () => [],
    readSections: async () => [],
    readGateAState: async () => null,
    readSourceUrl: async () => null,
    readCapturesByUrls: async () => [],
    readAllSources: async () => [],
    readInstitutionByDomain: async () => null,
    insertInstitution: async (row) => { calls.push(["insertInstitution", row]); return { id: "inst1" }; },
    updateSourceInstitution: async (...a) => { calls.push(["updateSourceInstitution", ...a]); },
    validateProvenance: async () => ({ valid: false, recommended_status: "quarantined", failures: [{ criterion: 7, reason: "gate_a_unproven_or_stale" }] }),
    insertSearch: async (row) => { calls.push(["insertSearch", row]); return { id: "s1", result_url: row.result_url }; },
    insertClaim: async (row) => { calls.push(["insertClaim", row]); return { id: "c1" }; },
    updateClaimSpan: async (...a) => { calls.push(["updateClaimSpan", ...a]); },
    updateClaimKind: async (...a) => { calls.push(["updateClaimKind", ...a]); },
    insertSection: async (row) => { calls.push(["insertSection", row]); return { id: "sec1", section_key: row.section_key }; },
    updateSectionContent: async (...a) => { calls.push(["updateSectionContent", ...a]); },
    upsertGateA: async (...a) => { calls.push(["upsertGateA", ...a]); },
    touchItem: async (id) => { calls.push(["touchItem", id]); },
    readProvenanceStatus: async () => "quarantined",
    unarchiveItem: async (id) => { calls.push(["unarchiveItem", id]); },
    // STEP SOURCE (EIGHTH PASS, 2026-09-04) — the two deps this wrapper wires (registerSource,
    // readSourceByUrl); default stubs so every existing test above (none of which exercises an orphan)
    // stays byte-identical, plus the dedicated wiring test below.
    registerSource: async (source) => { calls.push(["registerSource", source]); return { source_id: "src1", created: true, host: "example.gov" }; },
    readSourceByUrl: async (url) => { calls.push(["readSourceByUrl", url]); return null; },
    ...overrides,
  };
}

test("dry, quarantined-live (the default): reads and plans, never fetches or writes", async () => {
  const deps = fakeDeps();
  const r = await main({ mode: "dry", arg: "" }, deps);
  assert.equal(r.counts.selection.mode, "quarantined-live");
  assert.equal(r.counts.candidates, 1);
  assert.deepEqual(deps.calls, []);
  assert.match(r.note, /DRY/);
});

test("dry, archived-unreasoned selection reads the archive-reason-null population", async () => {
  const deps = fakeDeps();
  const r = await main({ mode: "dry", arg: "archived-unreasoned" }, deps);
  assert.equal(r.counts.selection.mode, "archived-unreasoned");
  assert.equal(r.counts.candidates, 1);
});

test("dry, ids selection narrows to exactly the named items", async () => {
  const deps = fakeDeps();
  const r = await main({ mode: "dry", arg: "ids:x-1,x-2" }, deps);
  assert.equal(r.counts.candidates, 2);
});

test("apply refuses a still-failing item's rederivation cleanly (never touches a row the RPC still rejects)", async () => {
  const deps = fakeDeps({
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => "x".repeat(300) }),
  });
  const r = await main({ mode: "apply", arg: "ids:q-1" }, deps);
  assert.equal(r.counts.still_failing, 1);
  assert.ok(!deps.calls.some((c) => c[0] === "touchItem"));
});

test("a bad --arg refuses before any read or write", async () => {
  const deps = fakeDeps();
  const r = await main({ mode: "apply", arg: "bogus" }, deps);
  assert.equal(r.exitCode, 1);
  assert.deepEqual(deps.calls, []);
});

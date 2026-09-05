// attach-found-sources.test.mjs — node --test scripts/maintenance/attach-found-sources.test.mjs.
// No DB, no network, no real filesystem read: `readWorklistFile` is injected (see this step's own
// header — DI, DRY by default), so this proves the worklist-consumption contract end to end against
// scripts/mint/heal-provenance.mjs's REAL STEP SOURCE mechanism (imported directly, never a fake).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  main, isWorklistRowReady, partitionWorklist, groupWorklistByItem, countGroundedViaWorklist, CITE,
} from "./attach-found-sources.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(HERE, "..", "_worklists", "attach-found-sources.fixture.json");

test("CITE carries a governing skill and a reason (db.mjs's requireCite gate)", () => {
  assert.equal(typeof CITE.skill, "string");
  assert.ok(CITE.skill.length > 0);
  assert.match(CITE.reason, /STEP SOURCE/);
});

// ── isWorklistRowReady / partitionWorklist / groupWorklistByItem (pure) ─────────────────────────────

test("isWorklistRowReady: true only when item_id, token, url and quote are all present", () => {
  assert.equal(isWorklistRowReady({ item_id: "i1", token: "€1", url: "https://x", quote: "q" }), true);
  assert.equal(isWorklistRowReady({ item_id: "i1", token: "€1", url: "", quote: "q" }), false);
  assert.equal(isWorklistRowReady({ item_id: "i1", token: "€1", url: "https://x", quote: "" }), false);
  assert.equal(isWorklistRowReady({ item_id: "i1", token: "€1" }), false);
  assert.equal(isWorklistRowReady(null), false);
});

test("partitionWorklist: ready / not-ready (seed rows) / malformed (no item_id or token at all)", () => {
  const rows = [
    { item_id: "i1", token: "€1", url: "https://x", quote: "q" }, // ready
    { item_id: "i1", token: "€2" }, // seed row, not ready
    { token: "€3", url: "https://x", quote: "q" }, // malformed — no item_id
    "not an object", // malformed
  ];
  const { ready, notReady, malformed } = partitionWorklist(rows);
  assert.equal(ready.length, 1);
  assert.equal(notReady.length, 1);
  assert.equal(malformed.length, 2);
});

test("partitionWorklist: non-array input -> everything empty, never throws", () => {
  const { ready, notReady, malformed } = partitionWorklist(undefined);
  assert.deepEqual({ ready, notReady, malformed }, { ready: [], notReady: [], malformed: [] });
});

test("groupWorklistByItem: groups by item_id then token, preserving row order for multi-candidate tokens", () => {
  const rows = [
    { item_id: "i1", token: "€1", url: "https://a", quote: "qa" },
    { item_id: "i1", token: "€1", url: "https://b", quote: "qb" },
    { item_id: "i1", token: "€2", url: "https://c", quote: "qc" },
    { item_id: "i2", token: "€1", url: "https://d", quote: "qd" },
  ];
  const byItem = groupWorklistByItem(rows);
  assert.deepEqual(byItem.get("i1"), {
    "€1": [{ url: "https://a", quote: "qa" }, { url: "https://b", quote: "qb" }],
    "€2": [{ url: "https://c", quote: "qc" }],
  });
  assert.deepEqual(byItem.get("i2"), { "€1": [{ url: "https://d", quote: "qd" }] });
});

test("countGroundedViaWorklist: counts only via:'worklist' source-step entries, across every item", () => {
  const perItem = [
    { steps: { source: [{ outcome: "source_registered_and_grounded", via: "worklist" }, { outcome: "no_candidate_url" }] } },
    { steps: { source: [{ outcome: "grounded_on_existing_source", via: "worklist" }] } },
    { steps: {} },
  ];
  assert.equal(countGroundedViaWorklist(perItem), 2);
});

// ── main() end to end, against the REAL heal-provenance.mjs STEP SOURCE ─────────────────────────────

function fakeHealDeps(overrides = {}) {
  const calls = [];
  return {
    calls,
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => "should not be called" }),
    requiredSlotsMap: {},
    readByIds: async (ids) => ids.map((id) => ITEMS[id]),
    readCaptures: async () => [],
    readClaims: async () => [],
    readSections: async () => [],
    readGateAState: async () => null,
    readSourceUrl: async () => null,
    readCapturesByUrls: async () => [],
    readAllSources: async () => [],
    readInstitutionByDomain: async () => null,
    registerSource: async (source) => { calls.push(["registerSource", source]); return { source_id: "src-new", created: true, host: source.name }; },
    readSourceByUrl: async () => null,
    insertInstitution: async () => ({ id: "inst1" }),
    updateSourceInstitution: async () => {},
    validateProvenance: async () => ({ valid: true, recommended_status: "verified", failures: [] }),
    insertSearch: async (row) => { calls.push(["insertSearch", row]); return { id: `search-${calls.length}`, result_url: row.result_url }; },
    insertClaim: async (row) => { calls.push(["insertClaim", row]); return { id: `claim-${calls.length}` }; },
    updateClaimSpan: async () => {},
    updateClaimKind: async () => {},
    insertSection: async (row) => ({ id: "section-new", section_key: row.section_key }),
    updateSectionContent: async () => {},
    upsertGateA: async () => {},
    touchItem: async () => {},
    readProvenanceStatus: async () => "verified",
    unarchiveItem: async () => {},
    ...overrides,
  };
}

const ITEMS = {
  "item-a": { id: "item-a", item_type: "regulation", source_url: null, full_brief: "The levy is set at €711,000 under this measure." },
};

test("main: REFUSED — blank --arg (no worklist path)", async () => {
  const r = await main({ mode: "dry", arg: "" }, fakeHealDeps());
  assert.equal(r.exitCode, 1);
  assert.match(r.note, /REFUSED/);
});

test("main: REFUSED — readWorklistFile throws (file missing) is reported, never crashes the dispatch", async () => {
  const deps = fakeHealDeps({ readWorklistFile: async () => { throw new Error("ENOENT: no such file"); } });
  const r = await main({ mode: "dry", arg: "scripts/_worklists/missing.json" }, deps);
  assert.equal(r.exitCode, 1);
  assert.match(r.note, /ENOENT/);
});

test("main: an all-seed worklist (no url/quote yet) is a clean no-op, never an error", async () => {
  const deps = fakeHealDeps({ readWorklistFile: async () => [{ item_id: "item-a", token: "€711,000" }] });
  const r = await main({ mode: "dry", arg: "scripts/_worklists/seed.json" }, deps);
  assert.equal(r.exitCode, 0);
  assert.equal(r.applied, 0);
  assert.equal(r.counts.worklist_ready, 0);
  assert.deepEqual(deps.calls, []);
});

test("main: dry mode with a filled worklist plans through heal-provenance's REAL STEP SOURCE, writes nothing", async () => {
  const deps = fakeHealDeps({
    readWorklistFile: async () => [
      { item_id: "item-a", token: "€711,000", url: "https://notices.example.gov/levy", quote: "The levy is set at €711,000 under this measure." },
    ],
  });
  const r = await main({ mode: "dry", arg: "scripts/_worklists/fixture.json" }, deps);
  assert.equal(r.exitCode, 0);
  assert.equal(r.applied, 0);
  assert.deepEqual(deps.calls, [], "dry mode makes zero fetches and zero writes");
  const sourceOutcomes = r.heal.per_item[0].steps.source.map((s) => s.outcome);
  assert.ok(sourceOutcomes.some((o) => o === "would_register_and_capture"), JSON.stringify(sourceOutcomes));
});

test("main: apply mode grounds the orphan through the SAME guarded insertClaim path, tags via:'worklist', reports grounded_via_worklist", async () => {
  const fetchImpl = async (url) => (
    String(url).includes("notices.example.gov")
      ? { ok: true, status: 200, text: async () => "The levy is set at €711,000 under this measure, per the official notice. " + "Padding text so this body clears the 200-char usability floor. ".repeat(3) }
      : { ok: true, status: 200, text: async () => "should not be fetched" }
  );
  const deps = fakeHealDeps({
    fetchImpl,
    readWorklistFile: async () => [
      { item_id: "item-a", token: "€711,000", url: "https://notices.example.gov/levy", quote: "The levy is set at €711,000 under this measure." },
    ],
  });
  const r = await main({ mode: "apply", arg: "scripts/_worklists/fixture.json" }, deps);
  assert.equal(r.exitCode, 0);
  assert.equal(r.counts.grounded_via_worklist, 1);
  assert.equal(r.counts.items_selected, 1);

  const entry = r.heal.per_item[0].steps.source.find((s) => s.outcome === "source_registered_and_grounded");
  assert.ok(entry, JSON.stringify(r.heal.per_item[0].steps.source));
  assert.equal(entry.via, "worklist");
  assert.equal(entry.quote, "The levy is set at €711,000 under this measure.");

  const claimCall = deps.calls.find((c) => c[0] === "insertClaim");
  assert.ok(claimCall, "grounded through the SAME guarded insertClaim path — no second write mechanism");
  assert.ok(claimCall[1].source_span.includes("711,000"));
});

test("main: re-dispatching the SAME worklist after the token already grounded is a clean no-op (idempotent by construction)", async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, text: async () => "The levy is set at €711,000 under this measure, per the official notice. " + "Padding text so this body clears the 200-char usability floor. ".repeat(3) });
  const worklistFile = async () => [
    { item_id: "item-a", token: "€711,000", url: "https://notices.example.gov/levy", quote: "The levy is set at €711,000 under this measure." },
  ];
  // First apply: grounds it, and the claim is fed back into the item's OWN claims so the second run's
  // fresh Gate-A scan (planGateA, inside heal-provenance.mjs) no longer sees the token as an orphan —
  // exactly what a real re-dispatch against the live DB would see on its own next read.
  const claims = [];
  const deps = fakeHealDeps({
    fetchImpl, readWorklistFile: worklistFile,
    // A COPY each read — matching the real wrapper's own readClaims (a fresh DB query every call,
    // never the same in-memory array healOneItem's own internal `claims.push(...)` later mutates).
    readClaims: async () => [...claims],
    insertClaim: async (row) => { claims.push(row); return { id: "claim-1" }; },
  });
  const first = await main({ mode: "apply", arg: "scripts/_worklists/fixture.json" }, deps);
  assert.equal(first.counts.grounded_via_worklist, 1);

  const second = await main({ mode: "apply", arg: "scripts/_worklists/fixture.json" }, deps);
  assert.equal(second.counts.grounded_via_worklist, 0, "the token is no longer a Gate-A orphan, so the worklist candidate is never re-tried");
  assert.equal(claims.length, 1, "no second claim row written");
});

// ── the COMMITTED fixture file itself (scripts/_worklists/attach-found-sources.fixture.json) ───────
// The §0 "Run" evidence this lane can leave without a live DB dispatch (no credentials in this worktree):
// a REAL fs read of the committed 2-row fixture, driving a REAL dry-mode plan through heal-provenance's
// STEP SOURCE. A live apply dispatch over the real 443-orphan worklist is the coordinator's — see this
// step's own header and docs/runbooks/MAINTENANCE-RUNBOOK.md for the exact dispatch.
test("attach-found-sources.fixture.json: the committed 2-row fixture parses and drives a real dry-mode plan (no DB, no stub worklist)", async () => {
  const fixtureItems = {
    "00000000-0000-0000-0000-000000000001": { id: "00000000-0000-0000-0000-000000000001", item_type: "regulation", source_url: null, full_brief: "The penalty for non-compliance is set at €2,500,000 under this measure." },
    "00000000-0000-0000-0000-000000000002": { id: "00000000-0000-0000-0000-000000000002", item_type: "regulation", source_url: null, full_brief: "This measure enters into force on 1 January 2027." },
  };
  const deps = fakeHealDeps({
    readByIds: async (ids) => ids.map((id) => fixtureItems[id]),
    readWorklistFile: async (path) => JSON.parse(readFileSync(path, "utf8")),
  });
  const r = await main({ mode: "dry", arg: FIXTURE_PATH }, deps);
  assert.equal(r.exitCode, 0);
  assert.equal(r.applied, 0);
  assert.deepEqual(deps.calls, [], "dry mode: zero fetches, zero writes, even reading the real committed file");
  assert.equal(r.counts.worklist_rows, 2);
  assert.equal(r.counts.worklist_ready, 2);
  assert.equal(r.counts.items_selected, 2);
  assert.equal(r.heal.per_item.length, 2);
  for (const entry of r.heal.per_item) {
    const outcomes = entry.steps.source.map((s) => s.outcome);
    assert.ok(outcomes.includes("would_register_and_capture"), `${entry.id}: ${JSON.stringify(outcomes)}`);
  }
});

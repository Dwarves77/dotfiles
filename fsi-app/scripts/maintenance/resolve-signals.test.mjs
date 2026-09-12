// resolve-signals.test.mjs -- proves the MAINT wrapper's own orchestration (task 7.2 / ADR-030 rider):
// every open flywheel-signal flag gets a terminal disposition, a brand-new candidate with no flag row
// yet inserts already-resolved, and dry mode writes nothing. The decision logic itself
// (detectSignalCandidates, planSignalAdoption, planSignalFlagResolutions) is pinned in its own modules'
// test files; this file tests only main()'s orchestration with fake injected deps.
import { test } from "node:test";
import assert from "node:assert/strict";
import { main } from "./resolve-signals.mjs";
import { SIGNAL_NAMESPACE, createdBy, buildSubjectRef } from "../../src/lib/connections/flag-namespaces.mjs";

// Two items sharing a decisive regulation identifier ("2023/1805") and two sharing a single
// (undecided -- one capitalized phrase, not independently corroborated) title entity ("Green Shipping
// Corridor") -- no existing item_cross_references edge for either pair, so both are candidates.
// (Verified against the real detectSignalCandidates() output, not hand-guessed -- "Fit for 55 Package"
// does NOT match CAP_PHRASE_RE, whose consecutive-capitalized-word rule breaks on lowercase "for"/"55".)
const ITEMS = [
  { id: "item-a", title: "Regulation (EU) 2023/1805 on maritime fuel" },
  { id: "item-b", title: "Amending Regulation 2023/1805 for ports" },
  { id: "item-c", title: "Progress on the Green Shipping Corridor programme" },
  { id: "item-d", title: "How the Green Shipping Corridor affects freight" },
];

const DECISIVE_SUBJECT_REF = buildSubjectRef("item-a", "item-b", "shared_regulation_identifier", "2023/1805");
const UNDECIDED_SUBJECT_REF = buildSubjectRef("item-c", "item-d", "shared_title_entity", "Green Shipping Corridor");

function baseDeps(overrides = {}) {
  const calls = [];
  return {
    calls,
    readItems: async () => ITEMS,
    readEdges: async () => [],
    readAllFlags: async () => [
      { id: "flag-decisive", subject_ref: DECISIVE_SUBJECT_REF, created_by: createdBy(SIGNAL_NAMESPACE, "shared_regulation_identifier"), status: "open" },
      { id: "flag-undecided", subject_ref: UNDECIDED_SUBJECT_REF, created_by: createdBy(SIGNAL_NAMESPACE, "shared_title_entity"), status: "open" },
    ],
    writeEdges: async (edges) => { calls.push(["writeEdges", edges.length]); return { written: edges.length, inserted: edges.length, refreshed: 0 }; },
    resolveFlag: async (id, note) => { calls.push(["resolveFlag", id, note]); return { updated: 1 }; },
    insertResolvedFlags: async (rows) => { calls.push(["insertResolvedFlags", rows.length]); return { inserted: rows.length }; },
    ...overrides,
  };
}

test("dry: reports the full disposition split, writes nothing", async () => {
  const d = baseDeps();
  const r = await main({ mode: "dry" }, d);
  assert.equal(r.step, "resolve-signals");
  assert.equal(r.counts.open_flags, 2);
  assert.equal(r.counts.dispositions.decisive, 1);
  assert.equal(r.counts.dispositions.undecided, 1);
  assert.equal(r.counts.dispositions.stale, 0);
  assert.equal(r.applied, 0);
  assert.match(r.note, /DRY/);
  assert.ok(!d.calls.length);
});

test("apply: resolves BOTH open flags (decisive and undecided) -- no residue stays open", async () => {
  const d = baseDeps();
  const r = await main({ mode: "apply" }, d);
  assert.ok(d.calls.some((c) => c[0] === "resolveFlag" && c[1] === "flag-decisive"));
  assert.ok(d.calls.some((c) => c[0] === "resolveFlag" && c[1] === "flag-undecided"));
  const decisiveCall = d.calls.find((c) => c[1] === "flag-decisive");
  const undecidedCall = d.calls.find((c) => c[1] === "flag-undecided");
  assert.match(decisiveCall[2], /^auto-adopted:signal:/);
  assert.match(undecidedCall[2], /below the decisive threshold, no edge/);
});

test("apply: writes the decisive edge via writeEdges", async () => {
  const d = baseDeps();
  await main({ mode: "apply" }, d);
  assert.ok(d.calls.some((c) => c[0] === "writeEdges" && c[1] === 2), "one decisive pair -> 2 directional edge rows");
});

test("apply: a flag whose pair no longer reproduces resolves 'stale'", async () => {
  const d = baseDeps({
    readAllFlags: async () => [
      { id: "flag-gone", subject_ref: buildSubjectRef("item-x", "item-y", "shared_title_entity", "Vanished Programme"), created_by: createdBy(SIGNAL_NAMESPACE, "shared_title_entity"), status: "open" },
    ],
  });
  const r = await main({ mode: "apply" }, d);
  assert.equal(r.counts.dispositions.stale, 1);
  const call = d.calls.find((c) => c[0] === "resolveFlag" && c[1] === "flag-gone");
  assert.ok(call);
  assert.match(call[2], /no longer detected/);
});

test("apply: a brand-new candidate with no existing flag row inserts already-resolved", async () => {
  const d = baseDeps({ readAllFlags: async () => [] });
  const r = await main({ mode: "apply" }, d);
  assert.equal(r.counts.new_pre_resolved, 2); // one decisive candidate row + one undecided candidate row
  assert.ok(d.calls.some((c) => c[0] === "insertResolvedFlags" && c[1] === 2));
});

test("apply: read-back reports remaining_open (proves the drain on every run, not by claim)", async () => {
  const d = baseDeps({
    readAllFlags: (() => {
      let call = 0;
      return async () => {
        call += 1;
        if (call === 1) {
          return [
            { id: "flag-decisive", subject_ref: DECISIVE_SUBJECT_REF, created_by: createdBy(SIGNAL_NAMESPACE, "shared_regulation_identifier"), status: "open" },
            { id: "flag-undecided", subject_ref: UNDECIDED_SUBJECT_REF, created_by: createdBy(SIGNAL_NAMESPACE, "shared_title_entity"), status: "open" },
          ];
        }
        // second call (post-resolve read-back): both flags now resolved -- none open.
        return [
          { id: "flag-decisive", subject_ref: DECISIVE_SUBJECT_REF, created_by: createdBy(SIGNAL_NAMESPACE, "shared_regulation_identifier"), status: "resolved" },
          { id: "flag-undecided", subject_ref: UNDECIDED_SUBJECT_REF, created_by: createdBy(SIGNAL_NAMESPACE, "shared_title_entity"), status: "resolved" },
        ];
      };
    })(),
  });
  const r = await main({ mode: "apply" }, d);
  assert.equal(r.read_back.remaining_open, 0);
});

// Regression test (reviewer-confirmed with a repro, review-7.2.md finding 2): existingKeys was built
// from OPEN flags only, so a candidate this pass just resolved (or a prior run already closed) fell
// OUT of existingKeys on the very next run and was re-inserted as a DUPLICATE already-resolved row,
// forever, on every re-run. Dedup must be status-agnostic.
test("IDEMPOTENCY: a second run against a corpus whose flags are now ALL resolved inserts ZERO new rows (regression, review-7.2.md finding 2)", async () => {
  // Simulates the state immediately after a first successful apply: every candidate this pass would
  // recompute already has a RESOLVED row (open flags now empty, but the resolved rows persist).
  const d = baseDeps({
    readAllFlags: async () => [
      { id: "flag-decisive", subject_ref: DECISIVE_SUBJECT_REF, created_by: createdBy(SIGNAL_NAMESPACE, "shared_regulation_identifier"), status: "resolved" },
      { id: "flag-undecided", subject_ref: UNDECIDED_SUBJECT_REF, created_by: createdBy(SIGNAL_NAMESPACE, "shared_title_entity"), status: "resolved" },
    ],
  });
  const r = await main({ mode: "apply" }, d);
  assert.equal(r.counts.open_flags, 0, "no open flags left to resolve");
  assert.equal(r.counts.new_pre_resolved, 0, "the still-reproducing candidates already have a resolved row -- must not re-insert");
  assert.ok(!d.calls.some((c) => c[0] === "insertResolvedFlags"), "insertResolvedFlags must not be called with zero new rows");
  assert.ok(!d.calls.some((c) => c[0] === "resolveFlag"), "no open flag to resolve either");
});

// ── INVARIANT: no residue stays open ────────────────────────────────────────────────────────────

test("INVARIANT: every open flag this run reads gets resolveFlag called exactly once", async () => {
  const d = baseDeps();
  await main({ mode: "apply" }, d);
  const resolveCalls = d.calls.filter((c) => c[0] === "resolveFlag");
  assert.equal(resolveCalls.length, 2);
  const ids = resolveCalls.map((c) => c[1]);
  assert.deepEqual(new Set(ids), new Set(["flag-decisive", "flag-undecided"]));
});

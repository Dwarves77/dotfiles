import { test } from "node:test";
import assert from "node:assert/strict";
import { promotionState, buildTransition, originClassFor, PROMOTION_STATES } from "./promotion.mjs";

test("promotionState: a thread with no transitions is in 'community'", () => {
  const r = promotionState({ transitions: [] });
  assert.equal(r.state, "community");
  assert.equal(r.valid, true);
});

test("promotionState: replays a legal chain to its current state", () => {
  const thread = {
    transitions: [
      { from: "community", to: "community-corroborated" },
      { from: "community-corroborated", to: "under-review" },
    ],
  };
  const r = promotionState(thread);
  assert.equal(r.state, "under-review");
  assert.equal(r.valid, true);
});

test("promotionState: flags an illegal jump (e.g. straight to verified) as invalid", () => {
  const thread = { transitions: [{ from: "community", to: "verified" }] };
  const r = promotionState(thread);
  assert.equal(r.valid, false);
  assert.match(r.invalidReason, /not a legal move/);
});

test("promotionState: flags a transition log with a broken 'from' chain", () => {
  const thread = { transitions: [{ from: "under-review", to: "verified" }] }; // thread never entered under-review
  const r = promotionState(thread);
  assert.equal(r.valid, false);
});

test("promotionState: retired is terminal", () => {
  const thread = {
    transitions: [
      { from: "community", to: "community-corroborated" },
      { from: "community-corroborated", to: "retired" },
    ],
  };
  assert.equal(promotionState(thread).state, "retired");
});

// ── buildTransition ─────────────────────────────────────────────────────────────────────────────
test("buildTransition: refuses without an actor", () => {
  const r = buildTransition({ transitions: [] }, "community-corroborated", { reason: "x", corroboration: { consistent: true } });
  assert.equal(r.ok, false);
});

test("buildTransition: refuses without a reason", () => {
  const r = buildTransition({ transitions: [] }, "community-corroborated", { actor: { userId: "u1" }, corroboration: { consistent: true } });
  assert.equal(r.ok, false);
});

test("buildTransition: community -> community-corroborated requires corroboration.consistent === true", () => {
  const r1 = buildTransition({ transitions: [] }, "community-corroborated", { actor: { userId: "u1" }, reason: "gate met" });
  assert.equal(r1.ok, false);
  assert.match(r1.error, /corroborationCount/);

  const r2 = buildTransition({ transitions: [] }, "community-corroborated", {
    actor: { userId: "u1" }, reason: "gate met", corroboration: { consistent: false },
  });
  assert.equal(r2.ok, false);

  const r3 = buildTransition({ transitions: [] }, "community-corroborated", {
    actor: { userId: "u1" }, reason: "gate met", corroboration: { consistent: true },
  });
  assert.equal(r3.ok, true);
  assert.equal(r3.transition.to, "community-corroborated");
});

test("buildTransition: acceptance criterion 2 — verified requires an editor actor AND a provChain", () => {
  const thread = { transitions: [
    { from: "community", to: "community-corroborated" },
    { from: "community-corroborated", to: "under-review" },
  ] };

  const noEditor = buildTransition(thread, "verified", { actor: { userId: "u1", role: "member" }, reason: "traced", provChain: "https://example.gov/primary" });
  assert.equal(noEditor.ok, false);
  assert.match(noEditor.error, /editor actor/);

  const noProv = buildTransition(thread, "verified", { actor: { userId: "u1", role: "editor" }, reason: "traced" });
  assert.equal(noProv.ok, false);
  assert.match(noProv.error, /provenance chain/);

  const ok = buildTransition(thread, "verified", { actor: { userId: "u1", role: "editor" }, reason: "traced", provChain: "https://example.gov/primary" });
  assert.equal(ok.ok, true);
  assert.equal(ok.transition.to, "verified");
  assert.equal(ok.transition.provChain, "https://example.gov/primary");
});

test("buildTransition: acceptance criterion 2 — community cannot jump straight to verified even with an editor and a provChain", () => {
  const r = buildTransition({ transitions: [] }, "verified", { actor: { userId: "u1", role: "editor" }, reason: "x", provChain: "https://example.gov" });
  assert.equal(r.ok, false);
  assert.match(r.error, /not a legal move/);
});

test("buildTransition: refuses a transition on top of an already-invalid log", () => {
  const thread = { transitions: [{ from: "community", to: "verified" }] };
  const r = buildTransition(thread, "retired", { actor: { userId: "u1", role: "editor" }, reason: "x" });
  assert.equal(r.ok, false);
  assert.match(r.error, /invalid/);
});

test("buildTransition: retired is reachable from community directly (moderation removal)", () => {
  const r = buildTransition({ transitions: [] }, "retired", { actor: { userId: "u1", role: "moderator" }, reason: "off-topic" });
  assert.equal(r.ok, true);
});

test("buildTransition: nothing is legal out of retired", () => {
  const thread = { transitions: [{ from: "community", to: "retired" }] };
  const r = buildTransition(thread, "community-corroborated", { actor: { userId: "u1" }, reason: "x", corroboration: { consistent: true } });
  assert.equal(r.ok, false);
});

// ── originClassFor ──────────────────────────────────────────────────────────────────────────────
test("originClassFor: maps the three states that carry an origin_class label", () => {
  assert.equal(originClassFor("community"), "community");
  assert.equal(originClassFor("community-corroborated"), "community-corroborated");
  assert.equal(originClassFor("verified"), "verified");
});

test("originClassFor: under-review and retired do not change origin_class (null, not a guess)", () => {
  assert.equal(originClassFor("under-review"), null);
  assert.equal(originClassFor("retired"), null);
});

test("PROMOTION_STATES is exactly the five spec 05 §4 gates", () => {
  assert.deepEqual(PROMOTION_STATES, ["community", "community-corroborated", "under-review", "verified", "retired"]);
});

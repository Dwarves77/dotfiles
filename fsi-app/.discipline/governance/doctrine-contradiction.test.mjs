// Red-then-green for the doctrine-contradiction check. Proves it CATCHES the CLAUDE.md promotion gate clause
// pre-rewrite, PASSES the rewritten (autonomous + visibility) form, IGNORES visibility/negated/cited lines
// (low-false-positive — DP-1 single-pane review never trips it), CATCHES a self-inflicted re-confirmation gate,
// and the LIVE doctrine surface is clean (post-sweep, zero uncited human-gate clauses).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { scanDoctrineContradictions, DOCTRINE_FILES, GATE_RE, VISIBILITY_RE } from "./doctrine-contradiction.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../");
const one = (text) => scanDoctrineContradictions(["x.md"], () => text);

test("RED: the pre-rewrite promotion clause (requires ... human review) is flagged", () => {
  const v = one("- Promotion requires ALL criteria met + human review. Demotion triggered by ANY single condition.");
  assert.equal(v.length, 1);
  assert.equal(v[0].kind, "human-gate");
});

test("GREEN: the rewritten autonomous + visibility form is clean", () => {
  const v = one("- Promotion requires ALL criteria met, evaluated autonomously by evaluatePromotion; operator gets visibility via the trail (RD-20). Demotion is triggered by ANY single condition, evaluated autonomously by evaluateDemotion.");
  assert.deepEqual(v, []);
});

test("VISIBILITY not flagged (DP-1 single-pane review; surface-to queue) — the low-FP guarantee", () => {
  assert.deepEqual(one("DP-1 (Single-Pane Operator Review) binds on operator-facing surfaces."), []);
  assert.deepEqual(one("High-confidence candidates surface to the operator review queue."), []);
  assert.deepEqual(one("The result is visible in the disposition trail; operator sees the trail."), []);
});

test("NEGATED gate (anti-pattern statement) not flagged", () => {
  assert.deepEqual(one("staged_updates is machine-gated (RD-20) — resolved by the machine gates, not parked for human review."), []);
  assert.deepEqual(one("The intake path has NO human-approval gate; the machine gates ARE the approval."), []);
});

test("CITED gate (retained-with-reason) not flagged", () => {
  assert.deepEqual(one("A destructive DDL apply requires human approval [RETAINED: irreversible; register: no-new-secrets-without-need]."), []);
});

test("RED: a self-inflicted re-confirmation gate is flagged", () => {
  const v = one("The thread closes when the operator re-confirms the ruling already given.");
  assert.equal(v.length, 1);
  assert.equal(v[0].kind, "self-inflicted-gate");
});

test("GATE_RE catches the requirement forms, VISIBILITY_RE the visibility forms (sanity)", () => {
  assert.ok(GATE_RE.test("requires human approval"));
  assert.ok(GATE_RE.test("pending human review"));
  assert.ok(GATE_RE.test("awaits operator"));
  assert.ok(VISIBILITY_RE.test("single-pane operator review"));
  assert.ok(VISIBILITY_RE.test("surfaces to the queue"));
});

test("LIVE: the real doctrine surface is clean (post-sweep — zero uncited human-gate clauses)", () => {
  const v = scanDoctrineContradictions(DOCTRINE_FILES, (f) => {
    try { return readFileSync(resolve(REPO_ROOT, f), "utf8"); } catch { return null; }
  });
  assert.deepEqual(v, [], `uncited human-gate clauses in doctrine: ${v.map((x) => `${x.file}:${x.line} [${x.kind}] ${x.text}`).join(" | ")}`);
});

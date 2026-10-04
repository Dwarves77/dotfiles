// Unit tests for the pure decision logic behind PATCH
// /api/admin/sources/[id]/bias-tags (logic.ts), split from route.ts per the
// BUILDGATE 2026-09-02 convention (route.ts exports only route handlers).
// Mirrors src/app/api/admin/recompute-trust/route.npmtest.mjs's jiti-import
// pattern for a sibling .ts logic module.
//
// DELIBERATELY NOT colocated inside `[id]/bias-tags/` alongside route.ts and
// logic.ts. Node v24's `--test` file runner silently drops an explicitly-
// listed *.npmtest.mjs path when the path contains a literal `[...]` segment
// (verified this session: `node --test ".../sources/[id]/bias-tags/
// route.npmtest.mjs"` reports "tests 0" with no error, both alone and inside
// run-npmtest-suites.sh's full multi-file invocation, the exact command CI
// and the pre-push hook both use; moving the identical file outside the
// bracketed directory made it run immediately). A colocated test there would
// never execute in CI, a proof that doesn't execute is not a proof (CLAUDE.md
// rule 15). This is a repo-wide gap, not specific to this route: none of the
// sibling routes under src/app/api/admin/sources/[id]/* (pause, fetch-now,
// regenerate-brief, tier-override, visibility) have a colocated npmtest file
// either, plausibly for the same reason. Flagged in the session log for the
// coordinator; not fixed here (a Node/test-runner-version issue is out of
// this lane's write set).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..", "..", "..", "..");
const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { "@": resolve(ROOT, "src") },
});
const {
  validatePatchBody,
  checkActionable,
  buildAuditEvent,
  PENDING_ASSIGNMENT_SOURCE,
  CONFIRMED_ASSIGNMENT_SOURCE,
} = await jiti.import(resolve(HERE, "[id]/bias-tags/logic.ts"));

// ── validatePatchBody ───────────────────────────────────────────────────

test("validatePatchBody: valid confirm body", () => {
  const result = validatePatchBody({ biasTagId: "bt-1", decision: "confirm" });
  assert.deepEqual(result, { ok: true, value: { biasTagId: "bt-1", decision: "confirm" } });
});

test("validatePatchBody: valid reject body", () => {
  const result = validatePatchBody({ biasTagId: "bt-1", decision: "reject" });
  assert.deepEqual(result, { ok: true, value: { biasTagId: "bt-1", decision: "reject" } });
});

test("validatePatchBody: missing biasTagId is rejected", () => {
  const result = validatePatchBody({ decision: "confirm" });
  assert.equal(result.ok, false);
  assert.match(result.error, /biasTagId/);
});

test("validatePatchBody: empty-string biasTagId is rejected", () => {
  const result = validatePatchBody({ biasTagId: "", decision: "confirm" });
  assert.equal(result.ok, false);
});

test("validatePatchBody: non-string biasTagId is rejected", () => {
  const result = validatePatchBody({ biasTagId: 123, decision: "confirm" });
  assert.equal(result.ok, false);
});

test("validatePatchBody: decision outside confirm/reject is rejected", () => {
  const result = validatePatchBody({ biasTagId: "bt-1", decision: "operator_confirmed" });
  assert.equal(result.ok, false);
  assert.match(result.error, /confirm.*reject/);
});

test("validatePatchBody: missing decision is rejected", () => {
  const result = validatePatchBody({ biasTagId: "bt-1" });
  assert.equal(result.ok, false);
});

// ── checkActionable ─────────────────────────────────────────────────────

test("checkActionable: haiku_proposed_low_confidence is actionable", () => {
  const result = checkActionable({ assignment_source: PENDING_ASSIGNMENT_SOURCE });
  assert.deepEqual(result, { ok: true });
});

test("checkActionable: haiku_auto_high_confidence (machine-adopted) IS actionable as an optional override", () => {
  assert.deepEqual(checkActionable({ assignment_source: "haiku_auto_high_confidence" }), { ok: true });
});

test("checkActionable: already operator_confirmed is NOT actionable (nothing pending)", () => {
  const result = checkActionable({ assignment_source: "operator_confirmed" });
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
});

test("checkActionable: operator_set is NOT actionable", () => {
  const result = checkActionable({ assignment_source: "operator_set" });
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
});

// ── buildAuditEvent ─────────────────────────────────────────────────────

test("buildAuditEvent: confirm decision maps to bias_tag_confirm, reuses manual_review event_type", () => {
  const event = buildAuditEvent({
    sourceId: "src-1",
    biasTagId: "bt-1",
    decision: "confirm",
    row: { dimension: "funding", tag: "foundation-funded", confidence: 0.72, assignment_source: PENDING_ASSIGNMENT_SOURCE },
    reviewerId: "user-1",
  });
  assert.equal(event.source_id, "src-1");
  assert.equal(event.event_type, "manual_review");
  assert.equal(event.created_by, "human");
  assert.equal(event.reviewer_id, "user-1");
  assert.equal(event.details.decision, "bias_tag_confirm");
  assert.equal(event.details.biasTagId, "bt-1");
  assert.equal(event.details.dimension, "funding");
  assert.equal(event.details.tag, "foundation-funded");
  assert.equal(event.details.confidence, 0.72);
  assert.equal(event.details.previous_assignment_source, PENDING_ASSIGNMENT_SOURCE);
});

test("buildAuditEvent: reject decision maps to bias_tag_reject", () => {
  const event = buildAuditEvent({
    sourceId: "src-1",
    biasTagId: "bt-2",
    decision: "reject",
    row: { dimension: "methodology", tag: "advocacy", confidence: 0.68, assignment_source: PENDING_ASSIGNMENT_SOURCE },
    reviewerId: "user-2",
  });
  assert.equal(event.details.decision, "bias_tag_reject");
});

test("CONFIRMED_ASSIGNMENT_SOURCE matches migration 092's operator_confirmed token", () => {
  assert.equal(CONFIRMED_ASSIGNMENT_SOURCE, "operator_confirmed");
});

test("PENDING_ASSIGNMENT_SOURCE matches migration 092's haiku_proposed_low_confidence token", () => {
  assert.equal(PENDING_ASSIGNMENT_SOURCE, "haiku_proposed_low_confidence");
});

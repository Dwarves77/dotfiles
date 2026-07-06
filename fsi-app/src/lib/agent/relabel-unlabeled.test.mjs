// @ts-check
// Red-then-green for 4c (ruling 2026-07-04). THE moat proven first: 4c must NEVER downgrade a genuine binding
// requirement into analysis — so PRIMARY_REQUIREMENT and UNCERTAIN both route to grounding/hold, and ONLY a
// confident WORKSPACE_ANALYSIS verdict relabels. Label application is verbatim-safe + idempotent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bindingSentences, decideRelabel, applyLabelToContent, ANALYSIS_LABELS, BINDING_VERB_RE } from "./relabel-unlabeled.mjs";

// ── THE MOAT, first: never downgrade a real requirement ────────────────────────────────────────────────
test("NEVER DOWNGRADE: a PRIMARY_REQUIREMENT verdict does NOT relabel (route to grounding/hold)", () => {
  const d = decideRelabel({ kind: "PRIMARY_REQUIREMENT", why: "the enacted Order imposes this obligation" });
  assert.equal(d.action, "GROUND_OR_HOLD");
});

test("NEVER DOWNGRADE UNDER UNCERTAINTY: an UNCERTAIN verdict does NOT relabel", () => {
  assert.equal(decideRelabel({ kind: "UNCERTAIN" }).action, "GROUND_OR_HOLD");
  assert.equal(decideRelabel(null).action, "GROUND_OR_HOLD");
  assert.equal(decideRelabel(undefined).action, "GROUND_OR_HOLD");
});

// ── GREEN: a confident workspace-analysis verdict relabels with the right label ──────────────────────────
test("RELABEL: a confident WORKSPACE_ANALYSIS verdict relabels with the chosen c_label_re label", () => {
  const d = decideRelabel({ kind: "WORKSPACE_ANALYSIS", label: "inference" });
  assert.equal(d.action, "RELABEL");
  assert.equal(d.label, ANALYSIS_LABELS.inference);
  assert.equal(decideRelabel({ kind: "WORKSPACE_ANALYSIS", label: "operational" }).label, ANALYSIS_LABELS.operational);
  // default label when unspecified is the workspace-inference label
  assert.equal(decideRelabel({ kind: "WORKSPACE_ANALYSIS" }).label, ANALYSIS_LABELS.inference);
});

test("bindingSentences finds criterion-4 triggers and skips already-labeled ones", () => {
  const md = "The workspace operates by air. The Order requires suppliers to blend SAF from 2025. " +
    "Analytical inference: this must be priced into quotes. Costs are rising.";
  const bs = bindingSentences(md);
  assert.ok(bs.some((s) => s.includes("requires suppliers to blend SAF")), "the unlabeled binding sentence is found");
  assert.ok(!bs.some((s) => s.includes("Analytical inference")), "an already-labeled binding sentence is skipped");
  assert.ok(!bs.some((s) => s === "Costs are rising."), "a non-binding sentence is not a trigger");
  assert.ok(BINDING_VERB_RE.test("this applies to all operators"));
});

test("applyLabelToContent prepends the label at the START of the sentence (label home), verbatim-safe + idempotent", () => {
  const sent = "The Order requires suppliers to blend SAF from 2025.";
  const md = `Intro. ${sent} Outro.`;
  const r = applyLabelToContent(md, sent, ANALYSIS_LABELS.inference);
  assert.equal(r.ok, true); assert.equal(r.changed, true);
  assert.ok(r.content.includes(`${ANALYSIS_LABELS.inference} ${sent}`), "label prepended to the sentence");
  // idempotent: re-applying to the now-labeled sentence is a no-op
  const again = applyLabelToContent(r.content, `${ANALYSIS_LABELS.inference} ${sent}`, ANALYSIS_LABELS.inference);
  assert.equal(again.changed, false);
  // sentence not present -> ok:false, no change
  const miss = applyLabelToContent(md, "a sentence not in the content", ANALYSIS_LABELS.inference);
  assert.equal(miss.ok, false); assert.equal(miss.changed, false);
});

test("end-to-end honest flow: judge PRIMARY_REQUIREMENT -> content UNCHANGED; WORKSPACE_ANALYSIS -> labeled", () => {
  const sent = "This applies to all obligated suppliers.";
  const md = `Context. ${sent}`;
  // PRIMARY_REQUIREMENT: no change (moat)
  const d1 = decideRelabel({ kind: "PRIMARY_REQUIREMENT" });
  const c1 = d1.action === "RELABEL" ? applyLabelToContent(md, sent, d1.label) : { content: md, changed: false };
  assert.equal(c1.changed, false, "a primary requirement is never relabeled");
  // WORKSPACE_ANALYSIS: labeled
  const d2 = decideRelabel({ kind: "WORKSPACE_ANALYSIS", label: "operational" });
  const c2 = applyLabelToContent(md, sent, d2.label);
  assert.ok(c2.content.includes(`${ANALYSIS_LABELS.operational} ${sent}`));
});

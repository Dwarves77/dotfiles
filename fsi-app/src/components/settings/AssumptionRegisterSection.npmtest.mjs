// Structural regression test for src/components/settings/AssumptionRegisterSection.tsx (lane W2-R2,
// 2026-10-01). No JSX render harness exists in this repo (see TagPopover.npmtest.mjs's own header
// for the same constraint), this reads the component's source text for the one fixture requirement
// the dispatch named explicitly: an assumption with load_bearing true (AND vulnerable true, spec 03
// section 7 #7's binding) renders the LOAD-BEARING marker the spec's exemplar card shows; one that
// is not both never does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Normalize CRLF -> LF: this test matches multi-line literal substrings against the component's
// SOURCE TEXT, so a checkout or editor that writes \r\n must not silently break the match.
const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "AssumptionRegisterSection.tsx"),
  "utf8"
).replace(/\r\n/g, "\n");

test("the LOAD-BEARING marker is gated on loadBearing AND vulnerable both true (spec 03 section 7 #7's binding), never loadBearing alone", () => {
  assert.match(SOURCE, /const atRisk = assumption\.loadBearing && assumption\.vulnerable;/);
  assert.match(SOURCE, /\{atRisk && \(/);
  assert.match(SOURCE, />\s*Load-bearing\s*</);
});

test("the marker text lives inside the `atRisk &&` branch only (the AssumptionForm checkbox label below is a DIFFERENT, legitimately-unconditional 'Load-bearing', a form field name, not the at-risk marker)", () => {
  const occurrences = [...SOURCE.matchAll(/Load-bearing/g)];
  assert.equal(occurrences.length, 2, "exactly two occurrences expected: the atRisk marker + the form checkbox label");

  const gateStart = SOURCE.indexOf("{atRisk && (");
  assert.notEqual(gateStart, -1);
  const gateEnd = SOURCE.indexOf("</span>\n        )}", gateStart);
  assert.notEqual(gateEnd, -1, "the atRisk-gated span must close with the exact `</span>\\n        )}` marker");
  const markerIndex = occurrences[0].index;
  assert.ok(markerIndex > gateStart && markerIndex < gateEnd, "the first occurrence must be the atRisk-gated marker");

  // The second occurrence (the checkbox label) must be OUTSIDE the AssumptionCard function entirely
  // (it belongs to AssumptionForm), never a second copy of the gated marker.
  const formFnStart = SOURCE.indexOf("function AssumptionForm(");
  assert.notEqual(formFnStart, -1);
  const checkboxLabelIndex = occurrences[1].index;
  assert.ok(checkboxLabelIndex > formFnStart, "the second occurrence must be inside AssumptionForm, not a duplicate marker in AssumptionCard");
});

test("the empty-register absence state names what to enter and why (ux-laws #10/#15), never a bare 'no data'", () => {
  assert.match(SOURCE, /No assumptions registered yet/);
  assert.match(SOURCE, /Research so-whats bind to these/);
});

test("every interactive control carries an explicit minHeight of 44 or is wrapped by Button (the law-2 size floor)", () => {
  // The delete icon-button is the one bespoke control outside <Button>; it must declare the
  // 24px-with-clear-space alternative (law 2's second branch), never a bare icon with no floor.
  assert.match(SOURCE, /minWidth: 24,\s*\n\s*minHeight: 24,/);
  assert.match(SOURCE, /aria-label=\{`Remove assumption: \$\{assumption\.name\}`\}/);
});

test("save preserves the draft and shows field-level errors on failure (ux-laws #15, errors recoverable)", () => {
  assert.match(SOURCE, /setFormError\(/);
  assert.match(SOURCE, /Your entry is unsaved/);
  // On failure the form is NOT closed (no setAdding(false) inside the error branch).
  const saveFnStart = SOURCE.indexOf("const save = async ()");
  const saveFnEnd = SOURCE.indexOf("const remove = async", saveFnStart);
  const saveBody = SOURCE.slice(saveFnStart, saveFnEnd);
  const errorBranchStart = saveBody.indexOf("if (!res.ok)");
  const errorBranchEnd = saveBody.indexOf("return;", errorBranchStart) + "return;".length;
  const errorBranch = saveBody.slice(errorBranchStart, errorBranchEnd);
  assert.doesNotMatch(errorBranch, /setAdding\(false\)/);
});

test("the component reads workspace scope from the shared store, never a hardcoded org", () => {
  assert.match(SOURCE, /useWorkspaceStore\(\(s\) => s\.orgId\)/);
});

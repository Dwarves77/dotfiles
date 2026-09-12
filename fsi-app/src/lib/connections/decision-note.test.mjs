// decision-note.test.mjs -- proves the shared resolution_note grammar round-trips and reports honest
// adopt/decline counts. Run: node --test src/lib/connections/decision-note.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { buildDecisionNote, parseDecisionNote } from "./decision-note.mjs";

test("buildDecisionNote: summary line reports the right adopt/decline split", () => {
  const decisions = [
    { label: "topic_tags:emissions", decision: "adopt", reason: "high confidence" },
    { label: "topic_tags:packaging", decision: "decline", reason: "evidence not found" },
    { label: "topic_tags:fuels", decision: "decline", reason: "not in closed vocabulary" },
  ];
  const note = buildDecisionNote("tag-ratification (auto)", decisions);
  assert.match(note, /decided 3 \(adopted 1, declined 2\)/);
  assert.match(note, /DECISIONS_JSON:/);
});

test("buildDecisionNote: zero decisions still produces a valid, parseable note", () => {
  const note = buildDecisionNote("apply-classifications decided", []);
  assert.match(note, /decided 0 \(adopted 0, declined 0\)/);
  assert.deepEqual(parseDecisionNote(note), []);
});

test("parseDecisionNote: round-trips exactly what was built, dropping no fields", () => {
  const decisions = [
    { label: "scope_modes=[\"ocean\"]", decision: "adopt", reason: "confidence high" },
  ];
  const note = buildDecisionNote("apply-classifications decided", decisions);
  const parsed = parseDecisionNote(note);
  assert.deepEqual(parsed, decisions);
});

test("parseDecisionNote: extra fields on the input are dropped from the JSON tail (label/decision/reason only)", () => {
  const decisions = [{ label: "x:y", decision: "adopt", reason: "z", field: "x", tag: "y", confidence: "high" }];
  const note = buildDecisionNote("prefix", decisions);
  const parsed = parseDecisionNote(note);
  assert.deepEqual(parsed, [{ label: "x:y", decision: "adopt", reason: "z" }]);
});

test("parseDecisionNote: returns null for a note with no DECISIONS_JSON tail (closed by an unrelated resolver)", () => {
  assert.equal(parseDecisionNote("run log, informational; closed under ADR-030 rider"), null);
  assert.equal(parseDecisionNote(null), null);
  assert.equal(parseDecisionNote(undefined), null);
});

test("parseDecisionNote: returns null on malformed JSON rather than throwing", () => {
  assert.equal(parseDecisionNote("summary\n\nDECISIONS_JSON: [{not valid json}]"), null);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  splitBiasTagsByConfidence,
  writeBiasTags,
  BIAS_TAG_VOCAB,
  ASSIGNMENT_SOURCE,
} from "./bias-tag-pipeline.mjs";

// ── splitBiasTagsByConfidence: confidence bands ───────────────────────────

test("splitBiasTagsByConfidence: >=0.80 inserts as haiku_auto_high_confidence", () => {
  const { insertRows, discarded } = splitBiasTagsByConfidence({
    funding: [{ tag: "foundation-funded", confidence: 0.90 }],
  });
  assert.equal(discarded.length, 0);
  assert.deepEqual(insertRows, [
    { dimension: "funding", tag: "foundation-funded", confidence: 0.90, assignment_source: ASSIGNMENT_SOURCE.HIGH_CONFIDENCE },
  ]);
});

test("splitBiasTagsByConfidence: exactly 0.80 is high confidence (boundary inclusive)", () => {
  const { insertRows } = splitBiasTagsByConfidence({
    methodology: [{ tag: "peer-reviewed", confidence: 0.80 }],
  });
  assert.equal(insertRows[0].assignment_source, ASSIGNMENT_SOURCE.HIGH_CONFIDENCE);
});

test("splitBiasTagsByConfidence: 0.65-0.79 is adopted (haiku_auto_high_confidence), confidence kept, never left waiting", () => {
  const { insertRows, discarded } = splitBiasTagsByConfidence({
    stakeholder: [{ tag: "independent-research", confidence: 0.70 }],
  });
  assert.equal(discarded.length, 0);
  assert.deepEqual(insertRows, [
    { dimension: "stakeholder", tag: "independent-research", confidence: 0.70, assignment_source: ASSIGNMENT_SOURCE.HIGH_CONFIDENCE },
  ]);
});

test("splitBiasTagsByConfidence: exactly 0.65 is adopted (boundary inclusive)", () => {
  const { insertRows } = splitBiasTagsByConfidence({
    funding: [{ tag: "mixed-funded", confidence: 0.65 }],
  });
  assert.equal(insertRows[0].assignment_source, ASSIGNMENT_SOURCE.HIGH_CONFIDENCE);
});

test("splitBiasTagsByConfidence: <0.65 is discarded, never inserted", () => {
  const { insertRows, discarded } = splitBiasTagsByConfidence({
    funding: [{ tag: "industry-funded", confidence: 0.40 }],
  });
  assert.equal(insertRows.length, 0);
  assert.equal(discarded.length, 1);
  assert.equal(discarded[0].reason, "below 0.65 threshold");
});

test("splitBiasTagsByConfidence: just under 0.65 is discarded (boundary exclusive)", () => {
  const { insertRows, discarded } = splitBiasTagsByConfidence({
    funding: [{ tag: "government-funded", confidence: 0.6499 }],
  });
  assert.equal(insertRows.length, 0);
  assert.equal(discarded[0].reason, "below 0.65 threshold");
});

// ── off-vocabulary handling ────────────────────────────────────────────────

test("splitBiasTagsByConfidence: off-vocabulary tag is discarded with a reason, never inserted", () => {
  const { insertRows, discarded } = splitBiasTagsByConfidence({
    funding: [{ tag: "not-a-real-tag", confidence: 0.95 }],
  });
  assert.equal(insertRows.length, 0);
  assert.equal(discarded.length, 1);
  assert.equal(discarded[0].reason, "off-vocabulary tag");
});

test("splitBiasTagsByConfidence: tag valid in one dimension but placed under another dimension is off-vocabulary", () => {
  // "peer-reviewed" is a methodology tag; placing it under funding must not
  // cross-dimension match (migration 092's CHECK partitions by dimension).
  const { insertRows, discarded } = splitBiasTagsByConfidence({
    funding: [{ tag: "peer-reviewed", confidence: 0.95 }],
  });
  assert.equal(insertRows.length, 0);
  assert.equal(discarded[0].reason, "off-vocabulary tag");
});

test("splitBiasTagsByConfidence: unknown dimension key is discarded", () => {
  const { insertRows, discarded } = splitBiasTagsByConfidence({
    funding: [{ tag: "foundation-funded", confidence: 0.90 }],
    editorial: [{ tag: "whatever", confidence: 0.90 }],
  });
  assert.equal(insertRows.length, 1);
  assert.ok(discarded.some((d) => d.dimension === "editorial" && d.reason === "unknown dimension key"));
});

// ── malformed input shapes ─────────────────────────────────────────────────

test("splitBiasTagsByConfidence: undefined/null input returns empty, no throw", () => {
  assert.deepEqual(splitBiasTagsByConfidence(undefined), { insertRows: [], discarded: [] });
  assert.deepEqual(splitBiasTagsByConfidence(null), { insertRows: [], discarded: [] });
});

test("splitBiasTagsByConfidence: non-object input is discarded, not thrown", () => {
  const { insertRows, discarded } = splitBiasTagsByConfidence("not an object");
  assert.equal(insertRows.length, 0);
  assert.equal(discarded.length, 1);
});

test("splitBiasTagsByConfidence: array input is discarded, not thrown", () => {
  const { insertRows, discarded } = splitBiasTagsByConfidence([{ tag: "x", confidence: 0.9 }]);
  assert.equal(insertRows.length, 0);
  assert.equal(discarded.length, 1);
});

test("splitBiasTagsByConfidence: invalid confidence (non-number, out of range) is discarded", () => {
  const { insertRows, discarded } = splitBiasTagsByConfidence({
    funding: [
      { tag: "industry-funded", confidence: "high" },
      { tag: "government-funded", confidence: 1.5 },
      { tag: "foundation-funded", confidence: -0.1 },
    ],
  });
  assert.equal(insertRows.length, 0);
  assert.equal(discarded.length, 3);
  assert.ok(discarded.every((d) => d.reason === "invalid confidence"));
});

// ── multi-dimension, real-shaped recommendation (ICCT worked example from
// the classifier system prompt / SKILL.md Section 6) ──────────────────────

test("splitBiasTagsByConfidence: ICCT-shaped multi-dimension recommendation splits correctly", () => {
  const biasTags = {
    funding: [{ tag: "foundation-funded", confidence: 0.90 }],
    methodology: [
      { tag: "methodologically-transparent", confidence: 0.85 },
      { tag: "analytical-synthesis", confidence: 0.72 },
    ],
    stakeholder: [
      { tag: "independent-research", confidence: 0.85 },
      { tag: "environmental-advocate", confidence: 0.60 },
    ],
  };
  const { insertRows, discarded } = splitBiasTagsByConfidence(biasTags);
  assert.equal(insertRows.length, 4);
  assert.equal(discarded.length, 1);
  assert.equal(discarded[0].tag, "environmental-advocate");
  assert.equal(discarded[0].reason, "below 0.65 threshold");

  const byTag = Object.fromEntries(insertRows.map((r) => [r.tag, r.assignment_source]));
  assert.equal(byTag["foundation-funded"], ASSIGNMENT_SOURCE.HIGH_CONFIDENCE);
  assert.equal(byTag["methodologically-transparent"], ASSIGNMENT_SOURCE.HIGH_CONFIDENCE);
  assert.equal(byTag["analytical-synthesis"], ASSIGNMENT_SOURCE.HIGH_CONFIDENCE);
  assert.equal(byTag["independent-research"], ASSIGNMENT_SOURCE.HIGH_CONFIDENCE);
});

test("BIAS_TAG_VOCAB has 7+7+8 = 22 tags across three dimensions (migration 092 vocabulary)", () => {
  assert.equal(BIAS_TAG_VOCAB.funding.length, 7);
  assert.equal(BIAS_TAG_VOCAB.methodology.length, 7);
  assert.equal(BIAS_TAG_VOCAB.stakeholder.length, 8);
});

// ── writeBiasTags: deps-injected writer ────────────────────────────────────

test("writeBiasTags: inserts only qualifying rows via deps.insertRows, tagged with sourceId", async () => {
  const calls = [];
  const deps = {
    insertRows: async (rows) => {
      calls.push(rows);
      return { error: null };
    },
  };
  const result = await writeBiasTags(deps, "source-123", {
    funding: [{ tag: "foundation-funded", confidence: 0.90 }],
    methodology: [{ tag: "advocacy", confidence: 0.30 }], // discarded
  });
  assert.equal(result.inserted, 1);
  assert.equal(result.discarded.length, 1);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [
    {
      source_id: "source-123",
      dimension: "funding",
      tag: "foundation-funded",
      confidence: 0.90,
      assignment_source: ASSIGNMENT_SOURCE.HIGH_CONFIDENCE,
    },
  ]);
});

test("writeBiasTags: no qualifying rows never calls insertRows", async () => {
  let called = false;
  const deps = { insertRows: async () => { called = true; return { error: null }; } };
  const result = await writeBiasTags(deps, "source-123", {
    funding: [{ tag: "foundation-funded", confidence: 0.10 }],
  });
  assert.equal(result.inserted, 0);
  assert.equal(called, false);
});

test("writeBiasTags: undefined bias_tags (source Haiku judged has no signal) is a no-op, not an error", async () => {
  let called = false;
  const deps = { insertRows: async () => { called = true; return { error: null }; } };
  const result = await writeBiasTags(deps, "source-123", undefined);
  assert.equal(result.inserted, 0);
  assert.equal(called, false);
});

test("writeBiasTags: propagates an insert error as a thrown Error", async () => {
  const deps = { insertRows: async () => ({ error: { message: "constraint violation" } }) };
  await assert.rejects(
    () => writeBiasTags(deps, "source-123", { funding: [{ tag: "foundation-funded", confidence: 0.9 }] }),
    /bias-tag insert failed: constraint violation/
  );
});

test("writeBiasTags: requires sourceId", async () => {
  const deps = { insertRows: async () => ({ error: null }) };
  await assert.rejects(() => writeBiasTags(deps, "", {}), /requires a sourceId/);
  await assert.rejects(() => writeBiasTags(deps, null, {}), /requires a sourceId/);
});

test("writeBiasTags: requires deps.insertRows", async () => {
  await assert.rejects(() => writeBiasTags({}, "source-123", {}), /requires deps.insertRows/);
});

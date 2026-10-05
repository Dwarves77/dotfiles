// bias-display.test.mjs: proof for bias-display.mjs (lane P1, 2026-10-05).
import test from "node:test";
import assert from "node:assert/strict";
import {
  BIAS_TAG_LABELS,
  BIAS_DIMENSION_LABELS,
  biasTagLabel,
  isLowerConfidence,
  buildBiasDisplay,
  biasLegendGroups,
  LOWER_CONFIDENCE_WORDS,
} from "./bias-display.mjs";
import { BIAS_TAG_VOCAB, HIGH_CONFIDENCE_THRESHOLD } from "../sources/bias-tag-pipeline.mjs";

test("every tag in the stored vocabulary has a human label, and no label is a raw slug", () => {
  for (const [dimension, tags] of Object.entries(BIAS_TAG_VOCAB)) {
    for (const tag of tags) {
      const label = BIAS_TAG_LABELS[tag];
      assert.ok(label, `no label for ${dimension}:${tag}`);
      assert.doesNotMatch(label, /-/, `label for ${tag} must be a phrase, not a slug: ${label}`);
    }
  }
  // and the label table holds nothing the vocabulary does not
  const vocab = new Set(Object.values(BIAS_TAG_VOCAB).flat());
  for (const tag of Object.keys(BIAS_TAG_LABELS)) assert.ok(vocab.has(tag), `label for a tag outside the vocabulary: ${tag}`);
  assert.deepEqual(Object.keys(BIAS_DIMENSION_LABELS).sort(), Object.keys(BIAS_TAG_VOCAB).sort());
});

test("an undisclosed funder is labelled undisclosed, never independent", () => {
  assert.equal(biasTagLabel("funding-opaque"), "Funding undisclosed");
});

test("a tag outside the vocabulary is humanized, never thrown on or shown as a raw slug", () => {
  assert.equal(biasTagLabel("industry_funded"), "Industry funded");
  assert.equal(biasTagLabel(""), "");
  assert.equal(biasTagLabel(null), "");
});

test("lower confidence is below the adopt-as-high line and only when a confidence is stored", () => {
  assert.equal(HIGH_CONFIDENCE_THRESHOLD, 0.8);
  assert.equal(isLowerConfidence(0.65), true);
  assert.equal(isLowerConfidence(0.79), true);
  assert.equal(isLowerConfidence(0.8), false);
  assert.equal(isLowerConfidence(0.95), false);
  assert.equal(isLowerConfidence(null), false);
  assert.equal(isLowerConfidence(undefined), false);
  assert.equal(LOWER_CONFIDENCE_WORDS, "lower confidence");
});

test("a source with no tags yields an empty model (the component renders nothing)", () => {
  for (const input of [null, undefined, [], [{ dimension: "funding", tag: "" }], [{ dimension: "bogus", tag: "advocacy" }]]) {
    const d = buildBiasDisplay(input, 2);
    assert.deepEqual(d, { shown: [], rest: [], remaining: 0, total: 0 });
  }
});

const FIVE = [
  { dimension: "funding", tag: "foundation-funded", confidence: 0.95 },
  { dimension: "methodology", tag: "methodologically-transparent", confidence: 0.9 },
  { dimension: "methodology", tag: "analytical-synthesis", confidence: 0.85 },
  { dimension: "stakeholder", tag: "independent-research", confidence: 0.7 },
  { dimension: "stakeholder", tag: "environmental-advocate", confidence: 0.82 },
];

test("five tags are bounded by selectBiasChipsForDisplay with the remainder behind one disclosure", () => {
  const d = buildBiasDisplay(FIVE, 3);
  assert.equal(d.total, 5);
  assert.equal(d.shown.length, 3);
  assert.equal(d.remaining, 2);
  assert.equal(d.rest.length, 2);
  // the slice is the highest-confidence tags, the disclosure holds the others
  assert.deepEqual(d.shown.map((c) => c.tag), ["foundation-funded", "methodologically-transparent", "analytical-synthesis"]);
  assert.deepEqual(d.rest.map((c) => c.tag).sort(), ["environmental-advocate", "independent-research"]);
  // shown and rest never overlap and together are every tag
  const all = [...d.shown, ...d.rest].map((c) => c.key);
  assert.equal(new Set(all).size, 5);
});

test("the row bound of two leaves three behind the count", () => {
  const d = buildBiasDisplay(FIVE, 2);
  assert.equal(d.shown.length, 2);
  assert.equal(d.remaining, 3);
  assert.equal(d.rest.length, 3);
});

test("when the tags fit, nothing is behind a disclosure", () => {
  const d = buildBiasDisplay(FIVE.slice(0, 2), 3);
  assert.equal(d.shown.length, 2);
  assert.equal(d.remaining, 0);
  assert.deepEqual(d.rest, []);
});

test("a tag below the adopt-as-high line is marked lower confidence and carries its percent", () => {
  const d = buildBiasDisplay(FIVE, 5);
  const low = d.shown.find((c) => c.tag === "independent-research");
  assert.equal(low.lowerConfidence, true);
  assert.equal(low.confidencePct, 70);
  const high = d.shown.find((c) => c.tag === "foundation-funded");
  assert.equal(high.lowerConfidence, false);
  assert.equal(high.label, "Foundation funded");
});

test("a tag with no stored confidence is shown without a lower-confidence claim", () => {
  const d = buildBiasDisplay([{ dimension: "funding", tag: "advocacy", confidence: null }, { dimension: "methodology", tag: "advocacy" }], 3);
  for (const c of d.shown) {
    assert.equal(c.lowerConfidence, false);
    assert.equal(c.confidencePct, null);
  }
});

test("the legend groups the whole vocabulary by dimension with labels", () => {
  const groups = biasLegendGroups(BIAS_TAG_VOCAB);
  assert.deepEqual(groups.map((g) => g.dimension), ["funding", "methodology", "stakeholder"]);
  assert.equal(groups.reduce((n, g) => n + g.tags.length, 0), Object.values(BIAS_TAG_VOCAB).flat().length);
  assert.ok(groups.every((g) => g.tags.every((t) => t.label && !/-/.test(t.label))));
  assert.deepEqual(biasLegendGroups(null).map((g) => g.tags.length), [0, 0, 0]);
});

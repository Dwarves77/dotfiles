// GOLDEN — fetch-align-diff engine (Wave-β B3, operator amendment 2, 2026-07-14). Proves structural
// segmentation per publisher shape, span-match (unchanged provisions), delta extraction (added/changed/
// removed + sentence diff), and timeline-event routing — all deterministic, $0.
// Run: node --test src/lib/sources/amendment-diff.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normHash, segmentByShape, segmentTextDiff, alignSegments, diffDocuments, toTimelineEvents,
} from "./amendment-diff.mjs";

test("normHash: stable + whitespace/case/punct-insensitive", () => {
  assert.equal(normHash("Article 1: Subject matter."), normHash("article 1 subject matter"));
  assert.notEqual(normHash("Article 1"), normHash("Article 2"));
});

test("segmentByShape eur-lex: splits on Article boundaries, dedups TOC vs enacting (keeps longer)", () => {
  const doc = "Whereas the preamble recites at length here for the record. " +
    "Article 1 Article 2 Article 3 " + // a short TOC listing
    "Article 1 Subject matter. This Regulation lays down comprehensive rules on the matter at hand. " +
    "Article 2 Definitions. For the purposes of this Regulation the following definitions apply here.";
  const segs = segmentByShape(doc, "eur-lex");
  const keys = segs.map((s) => s.key);
  assert.ok(keys.includes("Article 1"));
  assert.ok(keys.includes("Article 2"));
  // Article 1's kept body is the enacting one (longer), not the TOC token.
  const a1 = segs.find((s) => s.key === "Article 1");
  assert.match(a1.body, /Subject matter/);
});

test("segmentByShape: no markers → single 'whole' segment", () => {
  const segs = segmentByShape("A press release with no article structure at all here.", "other");
  assert.equal(segs.length, 1);
  assert.equal(segs[0].key, "whole");
});

test("segmentTextDiff: sentence-level add/remove", () => {
  const prev = "The limit is 30 percent. Compliance is required by 2030.";
  const next = "The limit is 40 percent. Compliance is required by 2030. A new exemption applies to SMEs.";
  const d = segmentTextDiff(prev, next);
  assert.ok(d.added.some((s) => /40 percent/.test(s)));
  assert.ok(d.added.some((s) => /new exemption/.test(s)));
  assert.ok(d.removed.some((s) => /30 percent/.test(s)));
});

test("alignSegments: unchanged / changed / added / removed", () => {
  const prev = [
    { key: "Article 1", body: "Subject matter unchanged.", hash: normHash("Subject matter unchanged.") },
    { key: "Article 2", body: "The threshold is 30 percent.", hash: normHash("The threshold is 30 percent.") },
    { key: "Article 3", body: "This article will be repealed.", hash: normHash("This article will be repealed.") },
  ];
  const next = [
    { key: "Article 1", body: "Subject matter unchanged.", hash: normHash("Subject matter unchanged.") },
    { key: "Article 2", body: "The threshold is 40 percent.", hash: normHash("The threshold is 40 percent.") },
    { key: "Article 4", body: "A brand new article.", hash: normHash("A brand new article.") },
  ];
  const a = alignSegments(prev, next);
  assert.deepEqual(a.unchanged.map((x) => x.key), ["Article 1"]);
  assert.deepEqual(a.changed.map((x) => x.key), ["Article 2"]);
  assert.deepEqual(a.added.map((x) => x.key), ["Article 4"]);
  assert.deepEqual(a.removed.map((x) => x.key), ["Article 3"]);
  assert.ok(a.changed[0].diff.added.some((s) => /40 percent/.test(s)));
});

test("diffDocuments: end-to-end on eur-lex amendment (incomplete → fuller re-collection)", () => {
  const oldCapture = "<html><body>Article 1 Subject matter. Rules apply. Article 2 The cap is 30 percent.</body></html>";
  const newCapture = "<html><body>Article 1 Subject matter. Rules apply. Article 2 The cap is 40 percent. " +
    "Article 3 Entry into force. This Regulation shall be binding in its entirety.</body></html>";
  const diff = diffDocuments(oldCapture, newCapture, { url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R1115" });
  assert.equal(diff.shape, "eur-lex");
  assert.equal(diff.counts.unchanged, 1);   // Article 1
  assert.equal(diff.counts.changed, 1);     // Article 2 (30 → 40)
  assert.equal(diff.counts.added, 1);       // Article 3
  assert.equal(diff.counts.removed, 0);
});

test("toTimelineEvents: routes the delta to milestone-shaped event candidates", () => {
  const diff = {
    added: [{ key: "Article 3" }], changed: [{ key: "Article 2" }], removed: [{ key: "Article 9" }],
    unchanged: [], counts: {}, shape: "eur-lex",
  };
  const events = toTimelineEvents(diff, { milestoneDate: "2026-01-15" });
  assert.equal(events.length, 3);
  assert.ok(events.some((e) => e.kind === "changed" && e.label === "Article 2 amended" && e.milestone_date === "2026-01-15"));
  assert.ok(events.some((e) => e.kind === "added" && e.provision === "Article 3"));
  assert.ok(events.some((e) => e.kind === "removed"));
});

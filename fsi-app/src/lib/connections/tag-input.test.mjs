// tag-input.test.mjs — proves assembleTagInput()/boundedSourceWindow() are pure, deterministic, never
// invent text, stay bounded on a long document, and produce the exact shape deriveTags() accepts.
import test from "node:test";
import assert from "node:assert/strict";
import { deriveTags } from "./derive-tags.mjs";
import { assembleTagInput, boundedSourceWindow, defaultVocabTerms, DEFAULT_PREFIX_CHARS } from "./tag-input.mjs";

test("defaultVocabTerms: non-empty, lower-cased, includes a known KEYWORD_MAP phrase", () => {
  const terms = defaultVocabTerms();
  assert.ok(terms.length > 20, "expected many keyword phrases from KEYWORD_MAP");
  assert.ok(terms.includes("cabotage"));
  assert.ok(terms.every((t) => t === t.toLowerCase()));
});

test("defaultVocabTerms: an extra term list is folded in and deduped", () => {
  const terms = defaultVocabTerms(["Biofuel", "cabotage"]); // one new, one dup of a real KEYWORD_MAP term
  assert.ok(terms.includes("biofuel"));
  assert.equal(terms.filter((t) => t === "cabotage").length, 1);
});

test("boundedSourceWindow: short text (under the prefix) returns it unchanged", () => {
  const text = "a short captured document, well under the prefix window.";
  assert.equal(boundedSourceWindow(text), text);
});

test("boundedSourceWindow: null/undefined/empty input returns empty string", () => {
  assert.equal(boundedSourceWindow(null), "");
  assert.equal(boundedSourceWindow(undefined), "");
  assert.equal(boundedSourceWindow(""), "");
});

test("boundedSourceWindow: long text past the prefix is truncated when it carries no vocabulary term", () => {
  const text = "x".repeat(DEFAULT_PREFIX_CHARS + 5000);
  const windowed = boundedSourceWindow(text);
  assert.ok(windowed.length < text.length, "must not return the whole document");
  assert.equal(windowed, text.slice(0, DEFAULT_PREFIX_CHARS));
});

test("boundedSourceWindow: a real KEYWORD_MAP phrase beyond the prefix is still captured (never silently dropped)", () => {
  const filler = "x".repeat(DEFAULT_PREFIX_CHARS + 2000);
  const text = `${filler} some unrelated words then cabotage appears here and more filler ${"y".repeat(500)}`;
  const windowed = boundedSourceWindow(text, { contextChars: 50 });
  assert.match(windowed, /cabotage/i);
  assert.ok(windowed.length < text.length, "still bounded, not the whole document");
});

test("boundedSourceWindow: caller-supplied vocabTerms widen what counts as a matchable section", () => {
  const filler = "x".repeat(DEFAULT_PREFIX_CHARS + 2000);
  const text = `${filler} packaging waste appears only here ${"y".repeat(500)}`;
  const withoutAlias = boundedSourceWindow(text, { contextChars: 50 });
  assert.doesNotMatch(withoutAlias, /packaging waste/i, "not a KEYWORD_MAP phrase — should be dropped by default");
  const withAlias = boundedSourceWindow(text, { contextChars: 50, vocabTerms: ["packaging waste"] });
  assert.match(withAlias, /packaging waste/i);
});

test("boundedSourceWindow: overlapping match windows are merged, not duplicated", () => {
  const filler = "x".repeat(DEFAULT_PREFIX_CHARS + 100);
  // two KEYWORD_MAP phrases close together so their context windows overlap
  const text = `${filler} drayage occurs near cabotage rules here ${"y".repeat(200)}`;
  const windowed = boundedSourceWindow(text, { contextChars: 80 });
  assert.equal((windowed.match(/drayage/gi) || []).length, 1);
  assert.equal((windowed.match(/cabotage/gi) || []).length, 1);
});

test("assembleTagInput: returns the exact shape deriveTags() accepts", () => {
  const out = assembleTagInput({ id: "i1", title: "T", canonical_instrument_key: "K", jurisdiction_iso: "EU", jurisdictions: ["EU"], full_brief: "brief text" });
  assert.deepEqual(Object.keys(out).sort(), ["canonical_instrument_key", "full_brief", "id", "jurisdiction_iso", "jurisdictions", "title"]);
  assert.equal(out.id, "i1");
  assert.equal(out.title, "T");
  assert.equal(out.canonical_instrument_key, "K");
});

test("assembleTagInput: folds full_brief + sections + FACT claims + captured text into full_brief, brief-first", () => {
  const row = {
    id: "i2",
    title: "Some Directive",
    full_brief: "BRIEF_TEXT",
    sections: [{ content_md: "SECTION_ONE" }, { content_md: "SECTION_TWO" }],
    claims: [
      { claim_kind: "FACT", claim_text: "FACT_CLAIM_TEXT" },
      { claim_kind: "GAP", claim_text: "GAP_BOILERPLATE_NEVER_INCLUDED" },
    ],
    search_results: [{ result_content: "CAPTURED_SOURCE_TEXT" }],
  };
  const out = assembleTagInput(row);
  assert.match(out.full_brief, /BRIEF_TEXT/);
  assert.match(out.full_brief, /SECTION_ONE/);
  assert.match(out.full_brief, /SECTION_TWO/);
  assert.match(out.full_brief, /FACT_CLAIM_TEXT/);
  assert.match(out.full_brief, /CAPTURED_SOURCE_TEXT/);
  assert.doesNotMatch(out.full_brief, /GAP_BOILERPLATE_NEVER_INCLUDED/, "GAP claim text must never be folded in");
  assert.ok(out.full_brief.indexOf("BRIEF_TEXT") < out.full_brief.indexOf("SECTION_ONE"), "brief-first ordering");
});

test("assembleTagInput: also accepts searchResults (camelCase) alongside search_results (snake_case)", () => {
  const out = assembleTagInput({ id: "i3", searchResults: [{ result_content: "CAMEL_CASE_TEXT" }] });
  assert.match(out.full_brief, /CAMEL_CASE_TEXT/);
});

test("assembleTagInput: an item with nothing grounded returns full_brief: null (never an empty string, never invented text)", () => {
  const out = assembleTagInput({ id: "i4" });
  assert.equal(out.full_brief, null);
});

test("assembleTagInput: pure — same row always produces the same output, and the row is never mutated", () => {
  const row = { id: "i5", title: "T", full_brief: "B", sections: [{ content_md: "S" }] };
  const frozenRow = JSON.parse(JSON.stringify(row));
  const a = assembleTagInput(row);
  const b = assembleTagInput(row);
  assert.deepEqual(a, b);
  assert.deepEqual(row, frozenRow);
});

test("integration: assembleTagInput() output is a drop-in deriveTags() input and finds a body-level match beyond the tiny full_brief", () => {
  const row = {
    id: "i6",
    title: "Some Notice",
    full_brief: "A short catalogue stub with no scenario language.",
    search_results: [{ result_content: "x".repeat(9000) + " this document concerns cabotage rules for road hauliers." }],
  };
  const baseline = deriveTags({ id: row.id, title: row.title, full_brief: row.full_brief });
  assert.equal(baseline.proposals.length, 0, "baseline (flat shape) must find nothing — the tiny brief carries no scenario language");

  const expanded = deriveTags(assembleTagInput(row));
  assert.ok(expanded.proposals.some((p) => p.tag === "road-cabotage" && p.confidence === "medium"));
});

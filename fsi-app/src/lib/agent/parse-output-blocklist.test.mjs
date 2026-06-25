// Unit test for foldYamlBlockLists — the parser-robustness fix for the agent emitting an array
// frontmatter field as a YAML BLOCK list (`key:` then `- item` lines) instead of inline `[..]`.
// Before the fix, the first colon-less `- <uuid>` line crashed the whole regeneration (the EUDR
// Stage-1 prove-on-one surfaced it: `Malformed YAML line (no colon): - 260089a9-...`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { foldYamlBlockLists } = await jiti.import("./parse-output.ts");

test("folds a block-list array field into inline [..] (the exact EUDR crash)", () => {
  const out = foldYamlBlockLists("related_items:\n  - 260089a9-e334-4104-843c-cdfc28a94dcc\n  - e5f6a1b2-0000\nintersection_summary: x");
  assert.match(out, /related_items: \[260089a9-e334-4104-843c-cdfc28a94dcc, e5f6a1b2-0000\]/);
  assert.match(out, /intersection_summary: x/);
  assert.doesNotMatch(out, /^\s*-\s/m, "no bare list lines remain");
});

test("strips quotes from block-list items", () => {
  assert.match(foldYamlBlockLists('topic_tags:\n  - "emissions"\n  - \'fuel\''), /topic_tags: \[emissions, fuel\]/);
});

test("leaves an inline array untouched", () => {
  const inline = "related_items: [a, b]\ntopic_tags: [emissions]";
  assert.equal(foldYamlBlockLists(inline), inline);
});

test("leaves a genuinely-empty scalar key untouched (no list under it)", () => {
  const y = "intersection_summary:\nsources_used: [a]";
  assert.equal(foldYamlBlockLists(y), y);
});

test("handles multiple block-list fields in one frontmatter", () => {
  const out = foldYamlBlockLists("compliance_object_tags:\n  - packaging\nrelated_items:\n  - u1\n  - u2\nseverity: MONITORING");
  assert.match(out, /compliance_object_tags: \[packaging\]/);
  assert.match(out, /related_items: \[u1, u2\]/);
  assert.match(out, /severity: MONITORING/);
});

// Structural regression test for ResearchFindingDetailSurface.tsx, lane DFIX-1 (2026-10-08).
// DAUDIT-2 (session log 2026-10-08-daudit2-design-audit.md, BUILD DEFECTS, row compose-07-research-detail#479)
// found the section index of a finding that is not record grade listed "S1 Summary" (href #summary) while only
// the record branch rendered section#summary: a tab pointing at nothing. The invariant, stated once: every
// section the index advertises is a section the same branch renders. The audit row measures it in a real
// browser (compose-07 "region 3 - Summary section (id=summary) renders when no dynamic sections carry
// content"); this test pins it in `node --test` so a later edit to either list cannot reopen it.
// Source-text convention, same as the other *.npmtest.mjs files here (no JSX render harness for this surface:
// it needs the whole detail shell, routing and claim-tier context).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "ResearchFindingDetailSurface.tsx"), "utf8");

function between(text, from, to) {
  const a = text.indexOf(from);
  assert.notEqual(a, -1, `missing: ${from}`);
  const b = text.indexOf(to, a + from.length);
  assert.notEqual(b, -1, `missing end: ${to}`);
  return text.slice(a, b);
}

const idsIn = (text, re) => [...text.matchAll(re)].map((m) => m[1]);

// indexEntries: `isRecord ? [ ...record... ] : [ ...finding... ]`
const indexBlock = between(SOURCE, "const indexEntries: SectionIndexEntry[] = isRecord", "];\n\n  const actionCard");
const [recordIndex, findingIndex] = indexBlock.split("\n    : [");
const recordIndexIds = idsIn(recordIndex, /\{ id: "(\w+)"/g);
const findingIndexIds = idsIn(findingIndex, /\{ id: "(\w+)"/g);

// the rendered branches: `{isRecord ? ( <DetailSection id="summary" ...> ) : ( <> ...sections... </> )}`
const sectionsBlock = between(SOURCE, "{isRecord ? (\n            <DetailSection id=\"summary\"", "<DetailSection id=\"sources\"");
const [recordJsx, findingJsx] = sectionsBlock.split("\n          ) : (");
const recordSectionIds = idsIn(recordJsx, /<DetailSection id="(\w+)"/g);
const findingSectionIds = idsIn(findingJsx, /<DetailSection id="(\w+)"/g);

test("the index of a finding that is not record grade lists Summary first, then Findings", () => {
  assert.deepEqual(findingIndexIds.slice(0, 2), ["summary", "findings"]);
});

test("a finding that is not record grade renders section#summary and section#findings (the tab points at something)", () => {
  assert.ok(findingSectionIds.includes("summary"), `non-record branch sections: ${findingSectionIds.join(", ")}`);
  assert.ok(findingSectionIds.includes("findings"));
});

test("every index entry of the non-record branch that is rendered inside the branch has its section there", () => {
  for (const id of ["summary", "findings"]) {
    assert.ok(findingIndexIds.includes(id) === findingSectionIds.includes(id), `index and branch disagree on ${id}`);
  }
});

test("the record branch is unchanged: Summary only, no Findings entry and no Findings section", () => {
  assert.ok(recordIndexIds.includes("summary") && !recordIndexIds.includes("findings"));
  assert.ok(recordSectionIds.includes("summary") && !recordSectionIds.includes("findings"));
});

test("the Summary prose is not printed a second time by the Findings fallback", () => {
  const findings = between(findingJsx, '<DetailSection id="findings"', "</DetailSection>");
  assert.doesNotMatch(findings, /r\.whatIsIt/, "S2 must not repeat the S1 prose");
  assert.match(findingJsx, /summaryProse/);
});

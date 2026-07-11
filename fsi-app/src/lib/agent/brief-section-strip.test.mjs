// Run: node --test fsi-app/src/lib/agent/brief-section-strip.test.mjs
//
// F-1 escape regression (2026-07-11): the raw-markdown "Full regulatory analysis" accordion
// rendered "## New Sources Identified" verbatim because the prior strip only matched
// /^sources\b/. These tests lock the broadened class-strip: every sources-lead artifact
// section is removed, and legitimate content sections are NOT.

import { test } from "node:test";
import assert from "node:assert/strict";
import { stripSourcesSection, isSourcesLeadTitle } from "./brief-section-strip.mjs";

// A brief that carries BOTH a structured "## Sources" table AND the pipeline-artifact
// "## New Sources Identified" lead table, plus a legitimate content section between them.
const BRIEF = `# EU PPWR

## Issues Requiring Immediate Action

Producers must register by 2025-08-12. This content must survive stripping.

| Obligation | Deadline |
| --- | --- |
| Register | 2025-08-12 |

## Sources

| Source Name | URL | Tier |
| --- | --- | --- |
| EUR-Lex | https://eur-lex.europa.eu | 1 |

## New Sources Identified

| Source Name | URL | Tier estimate |
| --- | --- | --- |
| Some Portal | https://example.com | 3 |
`;

test("strips BOTH the Sources and New Sources Identified sections", () => {
  const out = stripSourcesSection(BRIEF);
  assert.ok(!/##\s*Sources/i.test(out), "## Sources must be stripped");
  assert.ok(!/New Sources Identified/i.test(out), "## New Sources Identified must be stripped");
  assert.ok(!/Some Portal/.test(out), "New-Sources table body must be gone");
  assert.ok(!/EUR-Lex/.test(out), "Sources table body must be gone");
});

test("does NOT over-strip a legitimate content section", () => {
  const out = stripSourcesSection(BRIEF);
  assert.ok(/Issues Requiring Immediate Action/.test(out), "content heading must survive");
  assert.ok(/Producers must register by 2025-08-12/.test(out), "content body must survive");
  assert.ok(/Register/.test(out), "content table must survive");
});

test("strips NUMBERED sources-lead headers (## 15. Sources / ## 16. New Sources Identified)", () => {
  const md = `# Doc

## 14. Confirmed Timeline

Keep me.

## 15. Sources

| Source Name | URL |
| --- | --- |
| A | https://a.test |

## 16. New Sources Identified

| Source Name | URL | Tier estimate |
| --- | --- | --- |
| B | https://b.test | 2 |
`;
  const out = stripSourcesSection(md);
  assert.ok(/Confirmed Timeline/.test(out) && /Keep me\./.test(out), "content survives");
  assert.ok(!/Sources/i.test(out), "both numbered sources sections stripped");
  assert.ok(!/a\.test/.test(out) && !/b\.test/.test(out), "both tables gone");
});

test("strips BOLD sources-lead headers (## **New Sources Identified**)", () => {
  const md = `# Doc

## Body

Keep this body.

## **New Sources Identified**

| Source Name | URL | Tier estimate |
| --- | --- | --- |
| C | https://c.test | 4 |
`;
  const out = stripSourcesSection(md);
  assert.ok(/Keep this body\./.test(out), "content survives");
  assert.ok(!/New Sources Identified/.test(out) && !/c\.test/.test(out), "bold artifact stripped");
});

test("strips Additional Sources and Corroborating Sources variants", () => {
  const md = `# Doc

## Real Content

Body stays.

## Additional Sources

| Source Name | URL |
| --- | --- |
| D | https://d.test |

## Corroborating Sources

| Source Name | URL |
| --- | --- |
| E | https://e.test |
`;
  const out = stripSourcesSection(md);
  assert.ok(/Body stays\./.test(out), "content survives");
  assert.ok(!/Additional Sources/.test(out) && !/Corroborating Sources/.test(out), "both variants stripped");
  assert.ok(!/d\.test/.test(out) && !/e\.test/.test(out), "both tables gone");
});

test("FAIL-CLOSED: an unanticipated trailing artifact header after Sources is still dropped", () => {
  // "Registry Growth Notes" is NOT in SOURCES_LEAD_TITLE_RE. It must still be dropped because
  // it lives after §15 Sources and tail-drop removes everything past the first sources-lead.
  const md = `# Doc

## Confirmed Regulatory Timeline

Keep this timeline.

## Sources

| Source Name | URL |
| --- | --- |
| A | https://a.test |

## Registry Growth Notes

| Widget | Score |
| --- | --- |
| unanticipated | 9 |
`;
  const out = stripSourcesSection(md);
  assert.ok(/Keep this timeline\./.test(out), "content before Sources survives");
  assert.ok(!/Registry Growth Notes/.test(out), "unanticipated trailing artifact dropped (fail-closed)");
  assert.ok(!/unanticipated/.test(out) && !/a\.test/.test(out), "trailing tables gone");
});

test("returns markdown unchanged when no sources-lead heading is present", () => {
  const md = `# Doc

## Issues Requiring Immediate Action

Body with the word resourceful and a sourcing strategy note.`;
  const out = stripSourcesSection(md);
  assert.ok(/Issues Requiring Immediate Action/.test(out), "content survives");
  assert.ok(/resourceful/.test(out) && /sourcing strategy/.test(out), "near-miss words not stripped");
});

test("isSourcesLeadTitle predicate matches the class, rejects legitimate titles", () => {
  for (const t of ["sources", "new sources identified", "sources identified", "additional sources", "corroborating sources"]) {
    assert.ok(isSourcesLeadTitle(t), `should match: ${t}`);
  }
  for (const t of ["issues requiring immediate action", "sourcing strategy", "resourceful notes", "summary"]) {
    assert.ok(!isSourcesLeadTitle(t), `should NOT match: ${t}`);
  }
});

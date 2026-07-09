// F-1 fabrication-detector CI fixture (the PPWR "New Sources Identified" pattern).
// A §15 Sources body that contains a SECOND markdown table (the "New Sources
// Identified" table) must NOT yield a source literally named "Source Name" (its
// header parsed as data). RED on the pre-fix single-header-skip parser; GREEN once
// the parser skips every table's header (line-before-separator) + drops placeholders.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { parseRegulationSection } = await jiti.import("./extract-regulation-sections.ts");

// Two tables in one §15 body — exactly the PPWR shape.
const TWO_TABLE_SOURCES = `
| # | Title | Type | Issuing Body | Date | URL |
|---|---|---|---|---|---|
| 1 | EUR-Lex — PPWR 2025/40 | Official Journal (Tier 1) | EU | 2025 | https://eur-lex.europa.eu/eli/reg/2025/40/oj |
| 2 | Latham & Watkins — PPWR Summary | Law firm analysis (Tier 4) | L&W | 2026 | https://www.lw.com/x |

## New Sources Identified

| Source Name | URL | Tier estimate | Why this source matters |
|---|---|---|---|
| European Commission DG ENV — PPWR Presentation | https://marketac.eu/dg-env.pdf | 2 | Official DG ENV deck |
`;

test("multi-table §15 does NOT fabricate a 'Source Name' / header-echo source (PPWR fixture)", () => {
  const parsed = parseRegulationSection("15", "Sources", TWO_TABLE_SOURCES);
  assert.equal(parsed?.kind, "sources_list");
  const names = parsed.entries.map((e) => (e.name || "").trim().toLowerCase());
  for (const bad of ["source name", "url", "title", "tier estimate", "why this source matters", "#", ""]) {
    assert.ok(!names.includes(bad), `fabricated header-echo source "${bad}" leaked: ${JSON.stringify(names)}`);
  }
});

test("multi-table §15 KEEPS the real sources from both tables", () => {
  const parsed = parseRegulationSection("15", "Sources", TWO_TABLE_SOURCES);
  const names = parsed.entries.map((e) => e.name);
  assert.ok(names.some((n) => n.includes("EUR-Lex")), "first-table real source dropped");
  assert.ok(names.some((n) => n.includes("Latham")), "first-table real source dropped");
  assert.ok(names.some((n) => n.includes("DG ENV")), "second-table real source dropped");
});

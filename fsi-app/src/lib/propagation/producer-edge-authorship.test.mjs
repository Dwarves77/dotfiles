// producer-edge-authorship.test.mjs — CONTRACT TEST for CLAUDE.md rule 17 ("nothing in this build runs
// alone") applied to producers: a producer script that writes a row to one of derivation_edges' allowed
// `from_table`s (migration 285's `derivation_edges_from_table_allowed` CHECK: `emission_factors`,
// `market_series`, `regional_data_facts` — the two writable-by-a-producer source tables plus
// `regional_data_facts`; `derived_values`/`statutory_computations`/`estimated_values` are the DAG's own
// OUTPUT tables, never a producer's primary write) MUST also author its own `derivation_edges` row in the
// same guarded write — never leave a landed figure for a later, separate pass to notice. Lane W4-DAG,
// 2026-09-06, closing exactly the gap the plan-completion audit named: "market_series ... has no edges."
//
// STATIC, FILESYSTEM-ONLY — no database, no import of the scanned files (a producer file's own top-level
// code may require env/DB creds to even import in some repos; this test never imports what it scans, only
// reads its source text, mirroring the fitness-function convention this repo already uses for this exact
// shape of check — F38-unbounded-supabase-read.mjs's own `enumerate()`+regex-scan pattern).
//
// WHAT COUNTS AS "AUTHORS ITS OWN EDGES": the scanned file's source text references `authorEdges` (the
// ONE shared authoring module, src/lib/propagation/author-edges.mjs — see that file's own header) either
// directly or through one of the shared per-table helpers built on top of it
// (`authorCarbonIntensityEdges`, `authorAutomateVsHireForRegions`, `authorMarketSeriesDeltaEdges`) — a
// producer imports exactly one of these, never re-implements the resolve/call/register sequence itself
// (author-edges.mjs's own "no copies of logic" rule). A file that writes a DAG source table and contains
// NONE of these names is a rule-17 violation: a landed figure with no path to ever entering the DAG.
//
// SCOPE, NAMED (not silently narrower than it looks): this scans `scripts/producers/**/*.mjs` — the
// producer layer plan §W4.1 names ("every producer that writes market_series / ... authors its derivation
// edges in the same guarded write"). It does NOT scan `scripts/gen/**` (emission_factors' own writer,
// `emission-factors-common.mjs`, already carries `authorCarbonIntensityEdges` per its own header and
// predates this lane) or `scripts/entities/backfill-derivation-edges.mjs` itself (the one-time historical
// BRIDGE, not a producer — it exists precisely because producer-time authorship was NOT wired for rows
// written before each chokepoint landed; scanning it for the same rule would be checking the patch for the
// hole it patches). A future producer OUTSIDE `scripts/producers/` that writes one of these three tables
// is not caught by this test — named here as this check's own honest boundary, same posture F38's header
// states for its own scope limits.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PRODUCERS_ROOT = resolve(HERE, "..", "..", "..", "scripts", "producers");

const DAG_SOURCE_TABLES = Object.freeze(["emission_factors", "market_series", "regional_data_facts"]);
const AUTHOR_MARKERS = Object.freeze([
  "authorEdges", // the one shared module, imported directly
  "authorCarbonIntensityEdges", // emission_factors' shared per-table helper
  "authorAutomateVsHireForRegions", // regional_data_facts' shared per-table helper
  "authorMarketSeriesDeltaEdges", // market_series' shared per-table helper
]);

/** Every `.mjs` file under `scripts/producers/`, recursively, excluding test files. Pure filesystem walk —
 *  no glob dependency needed for one small, stable tree. */
function listProducerFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listProducerFiles(full));
    } else if (entry.endsWith(".mjs") && !entry.endsWith(".test.mjs")) {
      out.push(full);
    }
  }
  return out;
}

/** True iff `content` contains a `guardedInsert("<table>"` or `guardedUpdate("<table>"` call for any table
 *  in `DAG_SOURCE_TABLES` — a producer's own PRIMARY write to a DAG source table. Single/double quotes
 *  both accepted (this codebase uses double-quotes throughout, checked both defensively). */
function writesDagSourceTable(content) {
  return DAG_SOURCE_TABLES.some((table) => new RegExp(`guarded(?:Insert|Update)\\(["']${table}["']`).test(content));
}

function authorsItsOwnEdges(content) {
  return AUTHOR_MARKERS.some((marker) => content.includes(marker));
}

test("every scripts/producers/**/*.mjs file that writes a DAG source table also authors its own derivation_edges (rule 17)", () => {
  const files = listProducerFiles(PRODUCERS_ROOT);
  assert.ok(files.length > 0, "sanity: the producer scan found zero files — PRODUCERS_ROOT is likely wrong");

  const violations = [];
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    if (writesDagSourceTable(content) && !authorsItsOwnEdges(content)) {
      violations.push(file.replace(resolve(HERE, "..", "..", "..", "..") + "/", ""));
    }
  }

  assert.deepEqual(
    violations,
    [],
    `producer(s) write a derivation_edges source table with no path into the DAG (rule 17): ${violations.join(", ") || "(none)"}. ` +
      `Import authorEdges (or one of its shared per-table helpers) and call it after the guarded write, ` +
      `mirroring scripts/producers/market/eia-v2-petroleum-spot-producer.mjs.`,
  );
});

test("self-check: writesDagSourceTable/authorsItsOwnEdges agree on constructed fixtures (proves the scan logic, not just today's tree)", () => {
  const clean = `import { authorEdges } from "../../../src/lib/propagation/author-edges.mjs";\nawait guardedInsert("market_series", row, { cite });\n`;
  assert.equal(writesDagSourceTable(clean), true);
  assert.equal(authorsItsOwnEdges(clean), true);

  const violating = `await guardedInsert("emission_factors", row, { cite });\n`;
  assert.equal(writesDagSourceTable(violating), true);
  assert.equal(authorsItsOwnEdges(violating), false);

  const irrelevant = `await guardedInsert("published_price_statistics", row, { cite });\n`;
  assert.equal(writesDagSourceTable(irrelevant), false);
});

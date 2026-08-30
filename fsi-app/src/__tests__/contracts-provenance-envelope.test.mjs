// Proof for the provenance envelope extension (WO-19 + WO-12, master execution plan v2 Stage 8).
//
// Run standalone:
//   node --test fsi-app/src/__tests__/contracts-provenance-envelope.test.mjs
// Covered by the `fsi-app/src/__tests__/*.test.mjs` glob in run-test-suite.sh — DELIBERATELY placed here
// rather than co-located at src/lib/contracts/provenance-envelope.test.mjs, because that path matches NO
// glob in .discipline/run-test-suite.sh (only src/__tests__/*.test.mjs is wired for the contracts family
// — see contracts-envelope.test.mjs, contracts-licence-and-tier.test.mjs, contracts-corridor-id.test.mjs,
// none of which are co-located either). A test that is git-tracked but run by nothing is precisely the
// violation CLAUDE.md standing rule 15 and F25-module-liveness forbid ("a verifier that is cited but run
// by no lane is a lie the coverage gate must not rubber-stamp"); this file's location is chosen so that
// rule holds on day one rather than needing a follow-up to notice it doesn't.
//
// THE ANTI-DRIFT PROOF (this file's main job, same posture as .discipline/vocab-drift-guard.test.mjs
// 3c). origin_class and derivation are NOT defined in this module — they are imported from
// src/lib/contracts/vocabularies.mjs and envelope.mjs, the same two homes migration 258's
// factor-tier.mjs draws from. So there are now TWO migrations (258, 267) and one module family that all
// have to agree on the same two literal lists, forever. This file proves it three ways:
//   (a) the CHECK expression this module emits for origin_class/derivation is BYTE-IDENTICAL to what
//       migration 258 already has for emission_factors — read from the migration's own source text, not
//       retyped;
//   (b) migration 267 (the file this repo ships) embeds the SAME renderEnvelopeDDL() output this test
//       recomputes live, so a hand-edit inside a >>> GENERATED <<< block goes RED rather than silently
//       drifting from scripts/gen/migration-267-origin-class-and-envelope.mjs;
//   (c) the exported value lists are sorted the way their upstream module declares them (never
//       re-ordered here) and are stable across repeated calls (no Math.random, no Date.now, no Set/Map
//       iteration-order dependency).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ORIGIN_CLASS_VALUES, DERIVATION_VALUES,
  originClassCheckExpr, derivationCheckExpr,
  renderOriginClassCheck, renderDerivationCheck,
  ENVELOPE_COLUMNS, ENVELOPE_COLUMN_KEYS,
  renderEnvelopeDDL,
} from "../lib/contracts/provenance-envelope.mjs";
import { ORIGIN_CLASSES } from "../lib/contracts/vocabularies.mjs";
import { DERIVATIONS } from "../lib/contracts/envelope.mjs";
import { renderMigration as renderMigration267 } from "../../scripts/gen/migration-267-origin-class-and-envelope.mjs";
import { normalizeEol } from "../../.discipline/lib/read-migration-sql.mjs";

const FSI = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."); // src/__tests__ -> fsi-app
const readMig = (rel) => normalizeEol(readFileSync(resolve(FSI, rel), "utf8"));

// ── ownership: re-export, never redefine ────────────────────────────────────────────────────────────

test("ORIGIN_CLASS_VALUES IS vocabularies.mjs ORIGIN_CLASSES (same array reference, not a copy)", () => {
  assert.strictEqual(ORIGIN_CLASS_VALUES, ORIGIN_CLASSES,
    "provenance-envelope.mjs must re-export vocabularies.mjs's own array, never define a second one.");
});

test("DERIVATION_VALUES IS envelope.mjs DERIVATIONS (same array reference, not a copy)", () => {
  assert.strictEqual(DERIVATION_VALUES, DERIVATIONS,
    "provenance-envelope.mjs must re-export envelope.mjs's own array, never define a second one.");
});

test("exactly the 7 origin_class values and 9 derivation values the plan names", () => {
  assert.deepEqual(
    [...ORIGIN_CLASS_VALUES],
    ["community", "community-corroborated", "modelled", "derived", "partner", "verified", "official"],
  );
  assert.deepEqual(
    [...DERIVATION_VALUES],
    ["statutory_fixed", "statutory_formula", "observed", "transacted_index", "assessed",
      "calculated", "interpolated", "modelled", "estimated"],
  );
});

// ── (a) byte-identical against migration 258, the precedent this module extends ────────────────────

test("origin_class CHECK expression is byte-identical to migration 258's emission_factors.origin_class CHECK", () => {
  const mig258 = readMig("supabase/migrations/258_emission_factors_and_licence_gate.sql");
  const expr = originClassCheckExpr("origin_class");
  assert.ok(
    mig258.includes(expr),
    `migration 258 does not contain "${expr}" verbatim — origin_class has drifted between ` +
      `emission_factors (258) and provenance-envelope.mjs. Regenerate rather than hand-edit either side.`,
  );
});

test("derivation CHECK expression is byte-identical to migration 258's emission_factors.derivation CHECK", () => {
  const mig258 = readMig("supabase/migrations/258_emission_factors_and_licence_gate.sql");
  const expr = derivationCheckExpr("derivation");
  assert.ok(
    mig258.includes(expr),
    `migration 258 does not contain "${expr}" verbatim — derivation has drifted between ` +
      `emission_factors (258) and provenance-envelope.mjs. Regenerate rather than hand-edit either side.`,
  );
});

test("renderOriginClassCheck names a per-table constraint but reuses the exact 258 value list", () => {
  const clause = renderOriginClassCheck("intelligence_items", "origin_class");
  assert.equal(clause, "CONSTRAINT intelligence_items_origin_class_check CHECK (origin_class IN " +
    "('community', 'community-corroborated', 'modelled', 'derived', 'partner', 'verified', 'official'))");
});

test("renderDerivationCheck names a per-table constraint but reuses the exact 258 value list", () => {
  const clause = renderDerivationCheck("regional_data_facts", "derivation");
  assert.equal(clause, "CONSTRAINT regional_data_facts_derivation_check CHECK (derivation IN " +
    "('statutory_fixed', 'statutory_formula', 'observed', 'transacted_index', 'assessed', " +
    "'calculated', 'interpolated', 'modelled', 'estimated'))");
});

// ── (b) migration 267 embeds exactly what the generator (and this test) recompute live ─────────────

test("migration 267 on disk is byte-identical to renderMigration() recomputed from provenance-envelope.mjs", () => {
  const onDisk = readMig("supabase/migrations/267_origin_class_and_envelope.sql");
  const regenerated = normalizeEol(renderMigration267());
  assert.equal(
    onDisk, regenerated,
    "supabase/migrations/267_origin_class_and_envelope.sql does not match " +
      "scripts/gen/migration-267-origin-class-and-envelope.mjs's output. Re-run " +
      "`node scripts/gen/migration-267-origin-class-and-envelope.mjs` and commit the regenerated file " +
      "rather than hand-editing the migration.",
  );
});

test("migration 267 embeds renderEnvelopeDDL() output for all three tables verbatim", () => {
  const mig = readMig("supabase/migrations/267_origin_class_and_envelope.sql");
  assert.ok(mig.includes(renderEnvelopeDDL("intelligence_items", { columns: ["origin_class"] })));
  assert.ok(mig.includes(renderEnvelopeDDL("state_cost_facts", { columns: ["origin_class"] })));
  assert.ok(mig.includes(renderEnvelopeDDL("regional_data_facts", { columns: ENVELOPE_COLUMN_KEYS })));
});

test("migration 267 is schema-only: no INSERT/UPDATE/DELETE, no backfill, no column made NOT NULL", () => {
  const mig = readMig("supabase/migrations/267_origin_class_and_envelope.sql");
  assert.ok(!/\bINSERT\s+INTO\b/i.test(mig), "migration 267 must not write data — the backfill is a separate, ratified pass");
  assert.ok(!/\bUPDATE\s+public\./i.test(mig), "migration 267 must not write data — the backfill is a separate, ratified pass");
  // Scan only the ADD COLUMN lines (the DDL, not the header prose or the informational `IS NOT NULL`
  // SELECT predicates in the post-apply-proof comment block, both of which legitimately say "NOT NULL").
  const addColumnLines = mig.split("\n").filter((l) => /ADD COLUMN IF NOT EXISTS/.test(l));
  assert.ok(addColumnLines.length >= 12, "expected at least 12 ADD COLUMN lines across the three tables");
  for (const line of addColumnLines) {
    assert.ok(!/NOT\s+NULL/i.test(line), `column definition carries NOT NULL, which WO-19/WO-12 defer to a later migration: "${line.trim()}"`);
  }
});

// ── (c) determinism + declared shape ─────────────────────────────────────────────────────────────────

test("renderEnvelopeDDL is deterministic: same input, byte-identical output, called repeatedly", () => {
  const a = renderEnvelopeDDL("regional_data_facts", { columns: ENVELOPE_COLUMN_KEYS });
  const b = renderEnvelopeDDL("regional_data_facts", { columns: ENVELOPE_COLUMN_KEYS });
  const c = renderEnvelopeDDL("regional_data_facts", { columns: ENVELOPE_COLUMN_KEYS });
  assert.equal(a, b);
  assert.equal(b, c);
});

test("renderEnvelopeDDL column order follows the caller's declared order, not object insertion order tricks", () => {
  const out = renderEnvelopeDDL("regional_data_facts", { columns: ["origin_class", "unit", "value_numeric"] });
  const addColumnLine = out.split("\n\n")[0];
  const idxOrigin = addColumnLine.indexOf("origin_class");
  const idxUnit = addColumnLine.indexOf(" unit ");
  const idxValue = addColumnLine.indexOf("value_numeric");
  assert.ok(idxOrigin < idxUnit && idxUnit < idxValue, "ADD COLUMN lines must render in the order `columns` was given");
});

test("renderEnvelopeDDL throws on an unknown column key rather than silently skipping it", () => {
  assert.throws(() => renderEnvelopeDDL("regional_data_facts", { columns: ["not_a_real_column"] }), /unknown envelope column/);
});

test("renderEnvelopeDDL emits ADD COLUMN IF NOT EXISTS for every requested column (idempotent-safe)", () => {
  const out = renderEnvelopeDDL("intelligence_items", { columns: ["origin_class"] });
  assert.match(out, /ADD COLUMN IF NOT EXISTS origin_class text/);
});

test("only origin_class and derivation carry an enum CHECK; the rest of the envelope is unconstrained", () => {
  const enumCols = ENVELOPE_COLUMN_KEYS.filter((k) => ENVELOPE_COLUMNS[k].checkValues);
  assert.deepEqual(enumCols.sort(), ["derivation", "origin_class"]);
});

test("n_observations gets a positivity CHECK, not an enum CHECK", () => {
  const out = renderEnvelopeDDL("regional_data_facts", { columns: ["n_observations"] });
  assert.match(out, /CONSTRAINT regional_data_facts_n_observations_positive_check CHECK \(n_observations IS NULL OR n_observations > 0\)/);
});

test("source_key references the licence register (data_sources), not the trust-tier `sources` table", () => {
  const out = renderEnvelopeDDL("regional_data_facts", { columns: ["source_key"] });
  assert.match(out, /source_key text REFERENCES public\.data_sources\(source_key\)/);
  assert.doesNotMatch(out, /REFERENCES public\.sources\(/);
});

test("every column in ENVELOPE_COLUMNS carries a non-empty comment (renderEnvelopeDDL COMMENTs every column it adds)", () => {
  for (const key of ENVELOPE_COLUMN_KEYS) {
    assert.ok(typeof ENVELOPE_COLUMNS[key].comment === "string" && ENVELOPE_COLUMNS[key].comment.length > 20, `${key} is missing a real comment`);
  }
});

test("renderEnvelopeDDL COMMENT ON COLUMN text matches ENVELOPE_COLUMNS verbatim (SQL-escaped)", () => {
  const out = renderEnvelopeDDL("state_cost_facts", { columns: ["origin_class"] });
  const expectedEscaped = ENVELOPE_COLUMNS.origin_class.comment.replace(/'/g, "''");
  assert.ok(out.includes(`COMMENT ON COLUMN public.state_cost_facts.origin_class IS '${expectedEscaped}'`));
});

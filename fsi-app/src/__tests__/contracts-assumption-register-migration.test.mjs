// Proof for migration 271 (assumption_register, WO-20 —
// docs/plans/wo20-assumption-register-spec.md).
//
// SAME LOCATION REASONING AS contracts-market-series-migration.test.mjs (read that file's header before
// editing this one, and contracts-provenance-envelope.test.mjs before either). This file's own proof
// needs to be EXECUTION-WIRED (CLAUDE.md standing rule 15 / .discipline/run-test-suite.sh), and only
// `fsi-app/src/__tests__/*.test.mjs` is glob-wired for this family — a co-located
// `src/lib/contracts/migration-271.test.mjs` would match no glob in run-test-suite.sh and be a green
// test run by nothing, the exact defect rule 15 exists to catch.
//
// THE ANTI-DRIFT PROOF (this file's main job, same posture as the market_series/267 precedents):
//   (a) migration 271 on disk is BYTE-IDENTICAL to renderMigration() recomputed live from
//       scripts/gen/migration-271-assumption-register.mjs, so a hand-edit inside the >>> GENERATED <<<
//       block goes RED rather than silently drifting from the generator;
//   (b) the embedded origin_class/derivation CHECK expressions are BYTE-IDENTICAL to migration 258's
//       (read from 258's own source text, not retyped) — the same vocabulary, never a second definition;
//   (c) the envelope splice is the NARROWED 9-column subset spec §3 specifies — NOT the full 268/267
//       shape — so currency and reference_period are absent, and every OTHER envelope column is present;
//   (d) the migration is schema-only (no INSERT/UPDATE/DELETE, no seed row, no NOT NULL on any envelope
//       column) and additive (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS only — no ALTER on
//       any OTHER table);
//   (e) the hand-written table-specific shape (assumption_key UNIQUE NOT NULL, status CHECK, the
//       self-referential superseded_by FK) is present and is the SOLE UNIQUE constraint.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  renderMigration as renderMigration271,
  ASSUMPTION_REGISTER_ENVELOPE_COLUMNS,
} from "../../scripts/gen/migration-271-assumption-register.mjs";
import {
  renderEnvelopeDDL, originClassCheckExpr, derivationCheckExpr, ENVELOPE_COLUMN_KEYS,
} from "../lib/contracts/provenance-envelope.mjs";
import { normalizeEol } from "../../.discipline/lib/read-migration-sql.mjs";

const FSI = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."); // src/__tests__ -> fsi-app
const readMig = (rel) => normalizeEol(readFileSync(resolve(FSI, rel), "utf8"));

// Strips `-- ...` line comments (this migration's header/section prose deliberately DISCUSSES the
// narrowed-envelope exclusions and the UNIQUE-key design in English, e.g. "currency and
// reference_period are DELIBERATELY EXCLUDED" and "Natural key: assumption_key text UNIQUE NOT NULL,
// ..." — both true and correct prose that would otherwise false-positive a naive whole-file string
// search). Real DDL tokens live outside comments; this reduces the file to just those before the two
// checks below that need to distinguish "the DDL contains X" from "the DDL talks about X".
const stripSqlComments = (sql) => sql.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");

// ── (a) migration on disk matches the generator, byte-for-byte ─────────────────────────────────────

test("migration 271 on disk is byte-identical to renderMigration() recomputed from migration-271-assumption-register.mjs", () => {
  const onDisk = readMig("supabase/migrations/271_assumption_register.sql");
  const regenerated = normalizeEol(renderMigration271());
  assert.equal(
    onDisk, regenerated,
    "supabase/migrations/271_assumption_register.sql does not match " +
      "scripts/gen/migration-271-assumption-register.mjs's output. Re-run " +
      "`node scripts/gen/migration-271-assumption-register.mjs` and commit the regenerated file rather " +
      "than hand-editing the migration.",
  );
});

test("migration 271 embeds renderEnvelopeDDL(\"assumption_register\", { columns: ASSUMPTION_REGISTER_ENVELOPE_COLUMNS }) verbatim", () => {
  const mig = readMig("supabase/migrations/271_assumption_register.sql");
  assert.ok(mig.includes(renderEnvelopeDDL("assumption_register", { columns: ASSUMPTION_REGISTER_ENVELOPE_COLUMNS })));
});

// ── (b) byte-identical against migration 258, the precedent every envelope table extends ───────────

test("assumption_register origin_class CHECK is byte-identical to migration 258's emission_factors.origin_class CHECK", () => {
  const mig258 = readMig("supabase/migrations/258_emission_factors_and_licence_gate.sql");
  const expr = originClassCheckExpr("origin_class");
  assert.ok(mig258.includes(expr), `migration 258 does not contain "${expr}" verbatim`);
  const mig271 = readMig("supabase/migrations/271_assumption_register.sql");
  assert.ok(mig271.includes(`CONSTRAINT assumption_register_origin_class_check ${expr}`));
});

test("assumption_register derivation CHECK is byte-identical to migration 258's emission_factors.derivation CHECK", () => {
  const mig258 = readMig("supabase/migrations/258_emission_factors_and_licence_gate.sql");
  const expr = derivationCheckExpr("derivation");
  assert.ok(mig258.includes(expr), `migration 258 does not contain "${expr}" verbatim`);
  const mig271 = readMig("supabase/migrations/271_assumption_register.sql");
  assert.ok(mig271.includes(`CONSTRAINT assumption_register_derivation_check ${expr}`));
});

// ── (c) the envelope splice is the NARROWED subset spec §3 specifies ───────────────────────────────

test("assumption_register envelope columns are the NARROWED spec §3 subset — currency and reference_period excluded", () => {
  assert.deepEqual(
    [...ASSUMPTION_REGISTER_ENVELOPE_COLUMNS],
    ["value_numeric", "unit", "derivation", "origin_class", "source_key", "source_ref", "n_observations", "method_version", "as_at_date"],
  );
  assert.ok(!ASSUMPTION_REGISTER_ENVELOPE_COLUMNS.includes("currency"), "currency must be excluded (spec §3: no row is a monetary rate)");
  assert.ok(!ASSUMPTION_REGISTER_ENVELOPE_COLUMNS.includes("reference_period"), "reference_period must be excluded (spec §3: no row is a period aggregate)");
  // Sanity: the narrowed set really is a strict subset of the full envelope, not an unrelated list.
  for (const key of ASSUMPTION_REGISTER_ENVELOPE_COLUMNS) {
    assert.ok(ENVELOPE_COLUMN_KEYS.includes(key), `"${key}" is not a real envelope column key`);
  }
});

test("migration 271's DDL (comments stripped) declares no currency or reference_period column", () => {
  const mig = stripSqlComments(readMig("supabase/migrations/271_assumption_register.sql"));
  assert.ok(!/\bcurrency\b/i.test(mig), "migration 271 must not carry a currency column — narrowed envelope excludes it");
  assert.ok(!/\breference_period\b/i.test(mig), "migration 271 must not carry a reference_period column — narrowed envelope excludes it");
});

// ── (d) additive, schema-only, no NOT NULL on any envelope column ──────────────────────────────────

test("migration 271 is schema-only: no INSERT/UPDATE/DELETE, no seed row", () => {
  const mig = readMig("supabase/migrations/271_assumption_register.sql");
  assert.ok(!/\bINSERT\s+INTO\b/i.test(mig), "migration 271 must not write data — it ships schema only");
  assert.ok(!/\bUPDATE\s+public\./i.test(mig), "migration 271 must not write data — it ships schema only");
  assert.ok(!/\bDELETE\s+FROM\b/i.test(mig), "migration 271 must not delete data");
});

test("migration 271 touches ONLY public.assumption_register — no ALTER TABLE on any other table", () => {
  const mig = readMig("supabase/migrations/271_assumption_register.sql");
  const alterTargets = [...mig.matchAll(/ALTER\s+TABLE\s+public\.(\w+)/gi)].map((m) => m[1]);
  assert.ok(alterTargets.length > 0, "expected at least one ALTER TABLE (the envelope ADD COLUMN block + RLS)");
  for (const t of alterTargets) {
    assert.equal(t, "assumption_register", `migration 271 must not ALTER any table besides assumption_register (found ALTER TABLE public.${t})`);
  }
});

test("no envelope column on assumption_register is NOT NULL (renderEnvelopeDDL never emits NOT NULL)", () => {
  const mig = readMig("supabase/migrations/271_assumption_register.sql");
  const addColumnLines = mig.split("\n").filter((l) => /ADD COLUMN IF NOT EXISTS/.test(l));
  assert.equal(addColumnLines.length, ASSUMPTION_REGISTER_ENVELOPE_COLUMNS.length, "expected exactly one ADD COLUMN line per narrowed envelope column");
  for (const line of addColumnLines) {
    assert.ok(!/NOT\s+NULL/i.test(line), `envelope column definition carries NOT NULL: "${line.trim()}"`);
  }
});

// ── (e) the hand-written, table-specific shape ──────────────────────────────────────────────────────

test("assumption_key is text NOT NULL UNIQUE — the sole natural key", () => {
  const mig = readMig("supabase/migrations/271_assumption_register.sql");
  assert.match(mig, /assumption_key\s+text\s+NOT\s+NULL\s+UNIQUE/);
});

test("assumption_register carries exactly ONE UNIQUE constraint (assumption_key alone, no composite key)", () => {
  // Comments stripped AND the DO block's own RAISE strings excluded (they narrate this fact in an
  // error message and a success NOTICE, both quoting the word "UNIQUE" without declaring one) — the
  // post-check DO block asserts this live against Postgres; this asserts the DDL text shape that
  // produces it, not the prose describing it.
  const mig = readMig("supabase/migrations/271_assumption_register.sql");
  const withoutDoBlock = mig.replace(/DO \$\$[\s\S]*?END \$\$;/, "");
  const ddlOnly = stripSqlComments(withoutDoBlock);
  const uniqueOccurrences = (ddlOnly.match(/\bUNIQUE\b/g) || []).length;
  assert.equal(uniqueOccurrences, 1, `expected exactly one UNIQUE token in the DDL, found ${uniqueOccurrences}`);
});

test("status carries a CHECK restricted to active|superseded|retired, defaulting to active", () => {
  const mig = readMig("supabase/migrations/271_assumption_register.sql");
  assert.match(mig, /status\s+text\s+NOT\s+NULL\s+DEFAULT\s+'active'/);
  assert.match(mig, /CONSTRAINT assumption_register_status_check CHECK \(status IN \('active','superseded','retired'\)\)/);
});

test("superseded_by is a self-referential FK to assumption_register.id", () => {
  const mig = readMig("supabase/migrations/271_assumption_register.sql");
  assert.match(mig, /superseded_by\s+uuid\s+REFERENCES\s+public\.assumption_register\(id\)/);
});

test("assumption_register is RLS-enabled, read-only to authenticated (no write policy)", () => {
  const mig = readMig("supabase/migrations/271_assumption_register.sql");
  assert.match(mig, /ALTER TABLE public\.assumption_register ENABLE ROW LEVEL SECURITY/);
  assert.match(mig, /CREATE POLICY assumption_register_read ON public\.assumption_register FOR SELECT TO authenticated/);
  assert.ok(!/FOR (INSERT|UPDATE|DELETE)/.test(mig), "assumption_register must carry no write policy — writes are service-role only");
});

test("every hand-written table-specific column carries a COMMENT ON COLUMN", () => {
  const mig = readMig("supabase/migrations/271_assumption_register.sql");
  for (const col of ["assumption_key", "subsystem", "label", "rationale", "code_location", "governing_decision", "status", "superseded_by"]) {
    assert.match(mig, new RegExp(`COMMENT ON COLUMN public\\.assumption_register\\.${col} IS`), `missing COMMENT ON COLUMN for ${col}`);
  }
});

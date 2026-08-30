// Proof for migration 268 (market_series, WO-16 — master execution plan v2 Stage 7,
// docs/plans/master-execution-plan-2026-08-17.md).
//
// SAME LOCATION REASONING AS contracts-provenance-envelope.test.mjs (read that file's header before
// editing this one). scripts/gen/migration-268-market-series.mjs's own proof needs to be EXECUTION-WIRED
// (CLAUDE.md standing rule 15 / .discipline/run-test-suite.sh), and only `fsi-app/src/__tests__/*.test.mjs`
// is glob-wired for this family — a co-located `src/lib/market/migration-268.test.mjs` would match no glob
// in run-test-suite.sh and be a green test run by nothing, the exact defect rule 15 exists to catch. This
// file's location is chosen so that rule holds on day one.
//
// THE ANTI-DRIFT PROOF (this file's main job, same posture as contracts-provenance-envelope.test.mjs):
//   (a) migration 268 on disk is BYTE-IDENTICAL to renderMigration() recomputed live from
//       scripts/gen/migration-268-market-series.mjs, so a hand-edit inside the >>> GENERATED <<< block
//       goes RED rather than silently drifting from the generator;
//   (b) the embedded origin_class/derivation CHECK expressions are BYTE-IDENTICAL to migration 258's
//       (read from 258's own source text, not retyped) — the same vocabulary, never a second definition;
//   (c) the migration is schema-only (no INSERT/UPDATE/DELETE, no seed row, no NOT NULL on any envelope
//       column) and additive (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS only — no ALTER on
//       any OTHER table, so this migration cannot be the one that touches published_price_statistics,
//       regional_data_facts, state_cost_facts or intelligence_items).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  renderMigration as renderMigration268,
  MARKET_SERIES_ENVELOPE_COLUMNS,
} from "../../scripts/gen/migration-268-market-series.mjs";
import {
  renderEnvelopeDDL, originClassCheckExpr, derivationCheckExpr, ENVELOPE_COLUMN_KEYS,
} from "../lib/contracts/provenance-envelope.mjs";
import { normalizeEol } from "../../.discipline/lib/read-migration-sql.mjs";

const FSI = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."); // src/__tests__ -> fsi-app
const readMig = (rel) => normalizeEol(readFileSync(resolve(FSI, rel), "utf8"));

// ── (a) migration on disk matches the generator, byte-for-byte ─────────────────────────────────────

test("migration 268 on disk is byte-identical to renderMigration() recomputed from migration-268-market-series.mjs", () => {
  const onDisk = readMig("supabase/migrations/268_market_series.sql");
  const regenerated = normalizeEol(renderMigration268());
  assert.equal(
    onDisk, regenerated,
    "supabase/migrations/268_market_series.sql does not match scripts/gen/migration-268-market-series.mjs's " +
      "output. Re-run `node scripts/gen/migration-268-market-series.mjs` and commit the regenerated file " +
      "rather than hand-editing the migration.",
  );
});

test("market_series envelope columns are the FULL envelope shape (regional_data_facts' set), not a narrowed subset", () => {
  assert.deepEqual([...MARKET_SERIES_ENVELOPE_COLUMNS], [...ENVELOPE_COLUMN_KEYS]);
});

test("migration 268 embeds renderEnvelopeDDL(\"market_series\", { columns: ENVELOPE_COLUMN_KEYS }) verbatim", () => {
  const mig = readMig("supabase/migrations/268_market_series.sql");
  assert.ok(mig.includes(renderEnvelopeDDL("market_series", { columns: ENVELOPE_COLUMN_KEYS })));
});

// ── (b) byte-identical against migration 258, the precedent every envelope table extends ───────────

test("market_series origin_class CHECK is byte-identical to migration 258's emission_factors.origin_class CHECK", () => {
  const mig258 = readMig("supabase/migrations/258_emission_factors_and_licence_gate.sql");
  const expr = originClassCheckExpr("origin_class");
  assert.ok(mig258.includes(expr), `migration 258 does not contain "${expr}" verbatim`);
  const mig268 = readMig("supabase/migrations/268_market_series.sql");
  assert.ok(mig268.includes(`CONSTRAINT market_series_origin_class_check ${expr}`));
});

test("market_series derivation CHECK is byte-identical to migration 258's emission_factors.derivation CHECK", () => {
  const mig258 = readMig("supabase/migrations/258_emission_factors_and_licence_gate.sql");
  const expr = derivationCheckExpr("derivation");
  assert.ok(mig258.includes(expr), `migration 258 does not contain "${expr}" verbatim`);
  const mig268 = readMig("supabase/migrations/268_market_series.sql");
  assert.ok(mig268.includes(`CONSTRAINT market_series_derivation_check ${expr}`));
});

// ── (c) additive, schema-only, no NOT NULL on any envelope column ──────────────────────────────────

test("migration 268 is schema-only: no INSERT/UPDATE/DELETE, no seed row", () => {
  const mig = readMig("supabase/migrations/268_market_series.sql");
  assert.ok(!/\bINSERT\s+INTO\b/i.test(mig), "migration 268 must not write data — it ships schema only");
  assert.ok(!/\bUPDATE\s+public\./i.test(mig), "migration 268 must not write data — it ships schema only");
  assert.ok(!/\bDELETE\s+FROM\b/i.test(mig), "migration 268 must not delete data");
});

test("migration 268 touches ONLY public.market_series — no ALTER TABLE on any other table", () => {
  const mig = readMig("supabase/migrations/268_market_series.sql");
  const alterTargets = [...mig.matchAll(/ALTER\s+TABLE\s+public\.(\w+)/gi)].map((m) => m[1]);
  assert.ok(alterTargets.length > 0, "expected at least one ALTER TABLE (the envelope ADD COLUMN block)");
  for (const t of alterTargets) {
    assert.equal(t, "market_series", `migration 268 must not ALTER any table besides market_series (found ALTER TABLE public.${t})`);
  }
});

test("no envelope column on market_series is NOT NULL (renderEnvelopeDDL never emits NOT NULL)", () => {
  const mig = readMig("supabase/migrations/268_market_series.sql");
  const addColumnLines = mig.split("\n").filter((l) => /ADD COLUMN IF NOT EXISTS/.test(l));
  assert.ok(addColumnLines.length >= ENVELOPE_COLUMN_KEYS.length, "expected one ADD COLUMN line per envelope column");
  for (const line of addColumnLines) {
    assert.ok(!/NOT\s+NULL/i.test(line), `envelope column definition carries NOT NULL: "${line.trim()}"`);
  }
});

test("series_key and label ARE NOT NULL (this table's own identity columns, not the envelope's)", () => {
  const mig = readMig("supabase/migrations/268_market_series.sql");
  assert.match(mig, /series_key\s+text\s+NOT\s+NULL/);
  assert.match(mig, /label\s+text\s+NOT\s+NULL/);
});

test("UNIQUE(series_key, reference_period) is the sole idempotency key", () => {
  const mig = readMig("supabase/migrations/268_market_series.sql");
  assert.match(
    mig,
    /ADD CONSTRAINT market_series_series_key_reference_period_key UNIQUE \(series_key, reference_period\)/,
  );
});

test("market_series is RLS-enabled, read-only to authenticated (no write policy)", () => {
  const mig = readMig("supabase/migrations/268_market_series.sql");
  assert.match(mig, /ALTER TABLE public\.market_series ENABLE ROW LEVEL SECURITY/);
  assert.match(mig, /CREATE POLICY market_series_read ON public\.market_series FOR SELECT TO authenticated/);
  assert.ok(!/FOR (INSERT|UPDATE|DELETE)/.test(mig), "market_series must carry no write policy — writes are service-role only");
});

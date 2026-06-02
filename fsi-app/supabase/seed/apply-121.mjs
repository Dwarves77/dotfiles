/**
 * apply-121.mjs — uniform promotion (remove human-in-the-loop).
 *
 * Generates migration 121 from the LIVE 119 source by string-replacing ONLY the
 * criterion-6 routing block (so criteria 1-5 are byte-identical — no relaxation),
 * applies it, then re-evaluates the corpus under the uniform gate and verifies.
 *
 * Change: criterion-6 assembly
 *   IF NOT valid -> quarantined; ELSIF v_priority_high -> (ticked?verified:pending);
 *   ELSE verified
 * becomes
 *   IF NOT valid -> quarantined; ELSE verified
 * i.e. a valid item flips to 'verified' for ALL tiers. No tier gets a human tick.
 *
 * Verification (real DB read-back, not a success signal):
 *   - before/after status counts
 *   - validate_item_provenance against EVERY verified item -> assert all valid
 *   - the 5 known-stuck CRITICAL stay quarantined (gate did NOT loosen)
 *   - final verified count + newly-verified id-list
 */
import pg from "pg";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const ref = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const pooler = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const CONN = pooler.replace(`postgres.${ref}@`, `postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const SRC_119 = resolve(ROOT, "supabase/migrations/119_validate_item_provenance_failclose.sql");
const OUT_121 = resolve(ROOT, "supabase/migrations/121_uniform_promotion_no_human_tick.sql");

// 5 known-stuck CRITICAL (must STAY quarantined): 4 unlabeled-assertion + 1 no source_id.
const STUCK = ["e44a5408", "55f90df0", "d56ca4e1", "d5ee6ab8", "eu-emissions-trading-system-ets-extension-to-maritime-transport"];

// ── Generate 121 SQL from 119 by replacing ONLY the criterion-6 block ──
const sql119 = readFileSync(SRC_119, "utf8");
const OLD_BLOCK = `  ELSIF v_priority_high THEN
    SELECT count(*)::int,
           count(*) FILTER (WHERE verified_at IS NOT NULL)::int
      INTO v_fact_total, v_fact_verified
      FROM public.section_claim_provenance
     WHERE intelligence_item_id = p_item_id
       AND claim_kind = 'FACT';
    IF v_fact_total > 0 AND v_fact_verified = v_fact_total THEN
      v_result.recommended_status := 'verified';
    ELSE
      v_result.recommended_status := 'pending_human_verify';
    END IF;
  ELSE
    v_result.recommended_status := 'verified';
  END IF;`;
const NEW_BLOCK = `  ELSE
    -- migration 121: UNIFORM PROMOTION (human-in-the-loop removed). A valid item
    -- flips to 'verified' for ALL tiers. The prior CRITICAL/HIGH branch routed
    -- valid items to 'pending_human_verify' pending a per-claim human tick
    -- (task 1.12, removed). Criteria 1-5 (validity) are UNCHANGED — this removes
    -- ONLY the extra human step the high tiers required on top of the gate.
    v_result.recommended_status := 'verified';
  END IF;`;
if (!sql119.includes(OLD_BLOCK)) { console.error("[apply-121] criterion-6 block not found verbatim in 119 — HALT."); process.exit(1); }
let sql121 = sql119.replace(OLD_BLOCK, NEW_BLOCK)
  .replace("-- Migration 119: validate_item_provenance — FAIL-CLOSE the empty-shell skip.",
    "-- Migration 121: validate_item_provenance — UNIFORM PROMOTION (no human-in-the-loop).\n-- Collapses the criterion-6 tier branch: a valid item -> 'verified' for ALL tiers.\n-- CRITICAL/HIGH no longer route to 'pending_human_verify'; the task-1.12 human tick\n-- is removed. Criteria 1-5 are byte-identical to migration 119 (this file is generated\n-- by replacing ONLY the criterion-6 routing block) — the validity bar is UNCHANGED.\n-- (original 119 header follows)\n-- Migration 119: validate_item_provenance — FAIL-CLOSE the empty-shell skip.")
  .replace(/migration 119 fail-close revision\. /,
    "migration 121 uniform-promotion revision. ")
  .replace(/a 0-section item no longer vacuously passes criteria 2-5 — it records a no_section_content failure and routes to quarantined \(the prior skip certified empty shells as verified\)\./,
    "valid items flip to verified for ALL tiers (no CRITICAL/HIGH human-tick branch); criteria 1-5 unchanged from 119.");
writeFileSync(OUT_121, sql121);
console.log(`[apply-121] generated ${OUT_121} (criterion-6 block replaced; criteria 1-5 untouched).`);

const client = new Client({ connectionString: CONN });
await client.connect();
try {
  const dist = async (label) => {
    const r = await client.query("SELECT provenance_status, count(*)::int n FROM public.intelligence_items WHERE is_archived=false GROUP BY provenance_status ORDER BY provenance_status");
    console.log(`${label}: ${r.rows.map((x) => `${x.provenance_status}=${x.n}`).join("  ")}`);
  };
  await dist("BEFORE");

  // apply 121
  await client.query(sql121);
  const reg = await client.query("SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='121'");
  if (!reg.rows.length) await client.query("INSERT INTO supabase_migrations.schema_migrations (version,name) VALUES ('121','uniform_promotion_no_human_tick')");
  await client.query("NOTIFY pgrst, 'reload schema'");
  console.log("[apply-121] migration applied + registered.");

  // Re-evaluate: touch every active item so the trigger re-derives status under
  // the uniform gate. pending_human_verify(valid) -> verified; quarantined stays.
  const { rows: actives } = await client.query("SELECT id FROM public.intelligence_items WHERE is_archived=false");
  let touched = 0;
  for (const a of actives) { await client.query("UPDATE public.intelligence_items SET updated_at=now() WHERE id=$1", [a.id]); touched++; }
  console.log(`[apply-121] re-evaluated (touched) ${touched} active items.`);
  await dist("AFTER ");

  // VERIFY 1: every verified item must pass validate_item_provenance.
  const { rows: verified } = await client.query("SELECT id, legacy_id, title FROM public.intelligence_items WHERE is_archived=false AND provenance_status='verified'");
  let badVerified = [];
  for (const v of verified) {
    const vr = (await client.query("SELECT valid FROM public.validate_item_provenance($1)", [v.id])).rows[0];
    if (!vr.valid) badVerified.push(v.legacy_id || v.id.slice(0, 8));
  }
  console.log(`\nVERIFY 1 — verified items that re-validate: ${verified.length - badVerified.length}/${verified.length} pass`);
  if (badVerified.length) console.log(`  !! NOT VALID but marked verified: ${badVerified.join(", ")}  <-- GATE LOOSENED, INVESTIGATE`);

  // VERIFY 2: the 5 known-stuck must still be quarantined.
  const { rows: stuckRows } = await client.query(
    `SELECT legacy_id, id, provenance_status FROM public.intelligence_items WHERE legacy_id = ANY($1) OR id::text = ANY($1)`, [STUCK]);
  console.log(`\nVERIFY 2 — known-stuck CRITICAL (must be quarantined):`);
  let leaked = [];
  for (const s of stuckRows) { console.log(`  [${s.legacy_id || s.id.slice(0, 8)}] ${s.provenance_status}`); if (s.provenance_status === "verified") leaked.push(s.legacy_id); }
  if (leaked.length) console.log(`  !! LEAKED to verified: ${leaked.join(", ")}  <-- STOP, gate loosened.`);

  // VERIFY 3: pending_human_verify must be gone from the live corpus.
  const { rows: stillPending } = await client.query("SELECT count(*)::int n FROM public.intelligence_items WHERE is_archived=false AND provenance_status='pending_human_verify'");
  console.log(`\nVERIFY 3 — items still 'pending_human_verify': ${stillPending[0].n} (expect 0)`);

  // newly-verified id-list (before had 0 verified, so all verified are new)
  console.log(`\nFINAL verified count: ${verified.length}`);
  console.log(`newly-verified ids:\n  ${verified.map((v) => v.legacy_id || v.id.slice(0, 8)).join(", ")}`);

  const ok = badVerified.length === 0 && leaked.length === 0 && stillPending[0].n === 0;
  console.log(`\n${ok ? "PASS — uniform promotion landed; bar unchanged; no leak." : "FAIL — see flags above."}`);
} finally {
  await client.end();
}

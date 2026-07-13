/** RE-GROUND RECONCILIATION — reconciler-credential re-validation (2026-07-09, conservation audit).
 *
 * BINDING 1 — NO-DOWNGRADE-BYPASS: this script NEVER sets provenance_status directly. It touches
 * updated_at through the BOUND `reconciler` credential; the `set_provenance_status` trigger is the SOLE
 * status-setter (it re-derives from the read-only validate_item_provenance verdict). The guard enforces
 * this — the code does not even attempt a direct status write. Grep-proof: no `SET provenance_status`.
 *
 * RUNS AFTER re-grounding (whatever produced the current claim ledger): the re-ground pass re-attributes
 * FACT claims to their pool sources FIRST, under the CURRENT pipeline (tier-ordered blocks, error-body
 * exclusion, genuine-support judge asymmetry, span-verbatim). NOTE (2026-07-13, snapshot-first rebuild):
 * the former re-ground pair `funded-pass.mjs` was RETIRED with the old grounding-runner path; re-grounding
 * now routes through the snapshot-first verify-item entry point / canonical pipeline. This script has NO
 * functional dependency on funded-pass (no import, no shared lib, no input-file or sequencing assumption) —
 * it re-derives status against whatever claim ledger currently exists. THIS pass re-derives each item's status:
 *   recovered (claims now source-grounded) -> stays/returns verified, NEVER leaves the surface;
 *   genuinely-ungroundable -> quarantined honestly (the trigger inserts the base data_quality flag).
 * Binding 4 retrieval work-orders for the quarantined subset are added by a separate service-role pass.
 *
 * --only=<ids csv> (required).  --apply (default = DRY-RUN: predict only, ZERO writes).
 * Verify BY OUTCOME: predict recommended_status, then read back the ACTUAL stored provenance_status and
 * assert they agree. Idempotent (re-running lands the same terminal status). */
import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const REF = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const POOL = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const reconConn = POOL
  .replace(`postgres.${REF}`, `reconciler.${REF}`)
  .replace(`reconciler.${REF}@`, `reconciler.${REF}:${encodeURIComponent(process.env.RECONCILER_DB_PASSWORD)}@`);

const EXECUTE = process.argv.includes("--apply");
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
if (!onlyArg) { console.error("REFUSING: --only=<ids csv> is required (no unscoped run)."); process.exit(2); }
const ids = onlyArg.slice("--only=".length).split(",").map((s) => s.trim()).filter(Boolean);
if (!ids.length) { console.error("REFUSING: --only was empty."); process.exit(2); }

const c = new pg.Client({ connectionString: reconConn });
await c.connect();
const who = (await c.query("SELECT current_user")).rows[0].current_user;
if (who !== "reconciler") { console.error(`REFUSING: current_user=${who} is not 'reconciler' — the flip must go through the bound credential.`); await c.end(); process.exit(2); }
console.log(`RE-GROUND RECONCILE — bound credential (current_user=${who}) — ${EXECUTE ? "APPLY" : "DRY-RUN"} — ${ids.length} item(s)`);

const split = { verified: 0, quarantined: 0, other: 0, mismatch: 0 };
const quarantined = [];
for (const id of ids) {
  const pr = (await c.query("SELECT valid, recommended_status FROM public.validate_item_provenance($1)", [id])).rows[0];
  const before = (await c.query("SELECT provenance_status FROM public.intelligence_items WHERE id=$1", [id])).rows[0]?.provenance_status;
  if (!EXECUTE) {
    console.log(`  ${id.slice(0, 8)} before=${before} predicted=${pr.recommended_status}`);
    split[pr.recommended_status === "verified" ? "verified" : pr.recommended_status === "quarantined" ? "quarantined" : "other"]++;
    continue;
  }
  // Fire the trigger — touch ONLY updated_at. The trigger sets provenance_status; we never do.
  await c.query("UPDATE public.intelligence_items SET updated_at=now() WHERE id=$1", [id]);
  const after = (await c.query("SELECT provenance_status FROM public.intelligence_items WHERE id=$1", [id])).rows[0]?.provenance_status;
  const ok = after === pr.recommended_status;
  if (!ok) split.mismatch++;
  split[after === "verified" ? "verified" : after === "quarantined" ? "quarantined" : "other"]++;
  if (after === "quarantined") quarantined.push(id);
  console.log(`  ${id.slice(0, 8)} ${before} -> ${after} (predicted ${pr.recommended_status})${ok ? "" : "  *** MISMATCH ***"}`);
}
console.log(`\nSPLIT: verified=${split.verified} quarantined=${split.quarantined} other=${split.other} mismatch=${split.mismatch}`);
if (quarantined.length) console.log(`QUARANTINED_IDS ${quarantined.join(",")}`);
await c.end();
process.exit(split.mismatch > 0 ? 1 : 0);

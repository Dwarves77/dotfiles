/**
 * source-relevance-apply.mjs — guarded data-op applying the AUTHORIZED relevance/cleanup set
 * (authorization 2026-06-04). Supply stays paused; no auto_run_enabled touched.
 *
 * AUTHORIZED:
 *   1. SUSPEND Tokyo Metropolitan Assembly ONLY (status='suspended' + reason appended to notes
 *      with the `off_vertical_suspended` marker -> the vertical-fit gate negative list). NOT deleted.
 *      The other 4 territory legislatures are KEPT (no coverage gap opened).
 *   2. FIX-WWW (15) — www-NORMALIZATION ONLY via wwwNormalize() (host prefix only; CELEX colons,
 *      paths, query, trailing slashes untouched). NOT canonicalizeUrl.
 *   3. SUBDOMAIN MOVED (1) — South Dakota DENR -> DANR, target danr.sd.gov VERIFIED live (web).
 *      Colombia DROPPED: its subdomain is live (EAI_AGAIN was a transient resolver artifact) — no change.
 *
 * DISCIPLINE: dry-run default (--execute --confirm). Per-row UPDATE … WHERE expectedOld
 * (url=old / status='active') + RETURNING read-back assert + halt-on-mismatch. Reversible ledger.
 */
import pg from "pg";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { wwwNormalize } from "../src/lib/sources/url-canonicalize.ts";

const __d = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(__d, "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const ref = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const pooler = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const CONN = pooler.replace(`postgres.${ref}@`, `postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const EXECUTE = process.argv.includes("--execute") && process.argv.includes("--confirm");

const audit = JSON.parse(readFileSync(resolve(__d, "_diag/source-relevance-audit-result.json"), "utf8"));

const TOKYO_ID = "095d2a2c-0e59-43c9-b759-c3a7d19ad71d";
const TOKYO_NOTE = " [relevance-audit 2026-06-04: off_vertical_suspended — metro legislature; Tokyo cap-and-trade covered by Tokyo Bureau of Environment (already in registry); dead host gikai.metro.tokyo.jp; 0 intelligence items]";

// www fixes — recompute target via wwwNormalize (host-prefix only), keep only those that actually change.
const wwwFixes = audit.fixWww
  .map((f) => ({ id: f.id, name: f.name, old: f.current, neu: wwwNormalize(f.current, { add: true }) }))
  .filter((f) => f.neu !== f.old);

// subdomain moved — South Dakota DENR -> DANR only (verified). Colombia intentionally excluded.
const sd = audit.subdomainMoved.find((s) => /(^|\/\/)denr\.sd\.gov/.test(s.url));
const sdFix = sd ? { id: sd.id, name: sd.name, old: sd.url, neu: sd.url.replace("denr.sd.gov", "danr.sd.gov") } : null;
const urlFixes = [...wwwFixes, ...(sdFix ? [sdFix] : [])];

const c = new pg.Client({ connectionString: CONN }); await c.connect();
const q = (s, p) => c.query(s, p).then((r) => r);
const ledger = { mode: EXECUTE ? "EXECUTE" : "DRY-RUN", at: "2026-06-04", suspends: [], urlFixes: [], halted: false };
let halted = false;

try {
  console.log(`===== RELEVANCE APPLY — ${ledger.mode} =====`);
  console.log(`suspend: 1 (Tokyo)   url-fixes: ${urlFixes.length} (${wwwFixes.length} www + ${sdFix ? 1 : 0} sd)\n`);

  // ── 1. SUSPEND Tokyo ──────────────────────────────────────────────────────
  const pre = (await q(`SELECT name, status, notes FROM sources WHERE id=$1`, [TOKYO_ID])).rows[0];
  if (!pre) { console.error("HALT: Tokyo id not found"); halted = true; }
  else if (pre.status !== "active") { console.log(`  suspend SKIP: Tokyo already status='${pre.status}'`); }
  else {
    console.log(`  SUSPEND  ${pre.name}  (active -> suspended)`);
    if (EXECUTE) {
      const u = await q(`UPDATE sources SET status='suspended', notes=coalesce(notes,'')||$2
                          WHERE id=$1 AND status='active' RETURNING status, notes`, [TOKYO_ID, TOKYO_NOTE]);
      if (u.rowCount !== 1 || u.rows[0].status !== "suspended" || !u.rows[0].notes.includes("off_vertical_suspended")) {
        console.error("  HALT: Tokyo suspend read-back mismatch"); halted = true;
      } else { ledger.suspends.push({ id: TOKYO_ID, name: pre.name, from: "active", to: "suspended" }); console.log("    ✓ suspended + reason recorded"); }
    }
  }

  // ── 2. URL fixes (www-normalization + verified SD) ────────────────────────
  for (const f of urlFixes) {
    if (halted) break;
    console.log(`  URL  ${f.name}\n         ${f.old}\n      -> ${f.neu}`);
    if (EXECUTE) {
      const u = await q(`UPDATE sources SET url=$2 WHERE id=$1 AND url=$3 RETURNING url`, [f.id, f.neu, f.old]);
      if (u.rowCount !== 1 || u.rows[0].url !== f.neu) {
        console.error(`    HALT: url read-back mismatch for ${f.id} (expected old="${f.old}")`); halted = true; break;
      }
      ledger.urlFixes.push({ id: f.id, name: f.name, old: f.old, neu: f.neu });
      console.log("    ✓ updated");
    }
  }

  ledger.halted = halted;
  const out = resolve(__d, "_diag/source-relevance-apply-log.json");
  writeFileSync(out, JSON.stringify(ledger, null, 2));
  console.log(`\n${EXECUTE ? `applied: ${ledger.suspends.length} suspend + ${ledger.urlFixes.length} url-fix${halted ? " (HALTED before completion)" : ""}` : "dry-run only — re-run with --execute --confirm to apply"}`);
  console.log(`ledger: ${out}`);
} finally { await c.end(); }

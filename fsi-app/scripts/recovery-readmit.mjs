// Phase 3 — re-admit the 90 SYSTEMATIC recoveries to PROVISIONAL. The FIRST corpus
// mutation in the whole sequence. DRY-RUN by default (read-only dedup check, zero writes);
// --execute performs the additive provisional inserts + per-row read-back verification.
//
// Scope (operator ruling): ONLY the 90 systematic (substantive content recovered via the
// canonical fetch — real bot-protected sources wrongly excluded by the broken fetch). The
// 135 intermittent / 146 thin / 44 inconclusive-5xx stay PARKED with recorded reasons.
//
// Conservative policy: these were REJECTED once -> they land PROVISIONAL (pending_review,
// the operator promotion queue), NOT auto-active — even though the canonical method is now
// reliable (so d3GuardAdmission would otherwise auto-active). The guard is invoked to
// RECORD the admission event + heartbeat; the provisional outcome is the rejected-once
// override. Additive only: INSERT into provisional_sources; NO existing row touched, NO
// provenance flip (distinct from the parked Phase-2 reconciliation + its credential gate).
//
// Verification (first-mutation discipline): each insert is confirmed by a fresh read-back
// of the stored status (assertReadBack — never the insert's own return). Reports the count
// that actually landed provisional vs already-present (deduped) vs held (and why).
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { d3GuardAdmission } from "../src/lib/d3/hooks.mjs";
import { assertExecutedDataOp } from "./_dataops/interlock.mjs";
assertExecutedDataOp("recovery-readmit", { applied: "2026-06-01", commit: "513262d", effect: "INSERT 90 provisional_sources (Phase 3 re-admit)", idempotent: true });
import { assertReadBack, VERDICT } from "./lib/verify.mjs";

const EXECUTE = process.argv.includes("--execute");
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REF = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const POOL = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const CONN = POOL.replace(`postgres.${REF}@`, `postgres.${REF}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);

const NOTE = "[recovery 2026-05-31] Failed the original plain-HEAD/bot-UA reachability check (source_verifications rejection_reason=reachability) but resolves with substantive content via the canonical browserlessRender (D1). Classified SYSTEMATIC by the Phase-1b/1c recovery measurement. Re-admitted to PROVISIONAL for operator review (rejected-once -> conservative, not auto-active).";

// the 90 systematic URLs from the finalized measurement cache
const cache = JSON.parse(readFileSync(resolve(ROOT, "docs/recovery-phase1b-results.json"), "utf8"));
const systematic = Object.values(cache).filter((x) => x.class === "systematic").map((x) => x.url);

// candidate_name lookup from source_verifications (read-only)
const pc = new pg.Client({ connectionString: CONN });
await pc.connect();
const nameRows = (await pc.query(
  `SELECT DISTINCT ON (candidate_url) candidate_url, candidate_name FROM public.source_verifications
   WHERE candidate_url = ANY($1)`, [systematic])).rows;
await pc.end();
const nameOf = Object.fromEntries(nameRows.map((r) => [r.candidate_url, r.candidate_name]));

const sb = createClient(URL_, KEY, { auth: { persistSession: false } });
const norm = (u) => u.replace(/\/+$/, "");

console.log(`=== Phase 3 — re-admit ${systematic.length} SYSTEMATIC -> provisional  [${EXECUTE ? "EXECUTE (writing)" : "DRY-RUN (read-only)"}] ===\n`);

let landed = 0, already = 0, held = 0, wouldInsert = 0;
for (const url of systematic) {
  // dedup: skip if already in sources (active/provisional) or already a provisional candidate
  const inSrc = (await sb.from("sources").select("id").or(`url.eq.${url},url.eq.${norm(url)}`).limit(1).maybeSingle()).data;
  const inProv = (await sb.from("provisional_sources").select("id").or(`url.eq.${url},url.eq.${norm(url)}`).limit(1).maybeSingle()).data;
  if (inSrc || inProv) { already++; continue; }

  if (!EXECUTE) { wouldInsert++; continue; }

  // record the admission event via the guard (method now reliable). Outcome forced
  // PROVISIONAL per the rejected-once conservative policy (override of guard 'active').
  await d3GuardAdmission(sb, { candidateUrl: url, method: "browserless-render", event: "recovery:re-admit" });

  const { error } = await sb.from("provisional_sources").insert({
    name: nameOf[url] || url, url, discovered_via: "manual_add", status: "pending_review",
    reviewer_notes: NOTE, accessibility_verified: false,
  });
  if (error) { held++; console.log(`  [held] ${url} -> ${error.message}`); continue; }

  // read-back — trust the STORE, not the insert's return
  const rb = await assertReadBack(`readback ${url}`, async () =>
    (await sb.from("provisional_sources").select("status").eq("url", url).maybeSingle()).data?.status, "pending_review");
  if (rb.verdict === VERDICT.PASS) landed++;
  else { held++; console.log(`  [readback-FAIL] ${url} -> stored '${rb.actual}', expected 'pending_review'`); }
}

console.log(`\n=== RESULT (${EXECUTE ? "EXECUTED" : "DRY-RUN"}) ===`);
console.log(`  systematic candidates:        ${systematic.length}`);
console.log(`  already present (deduped):    ${already}`);
if (EXECUTE) {
  console.log(`  LANDED provisional (read-back confirmed pending_review): ${landed}`);
  console.log(`  held (insert error / read-back fail):                    ${held}`);
  console.log(`\n  d3GuardAdmission ran on each insert (admission event + heartbeat recorded).`);
  console.log(`  Additive only: ${landed} new provisional_sources rows; no existing row touched, no provenance flip.`);
} else {
  console.log(`  WOULD insert provisional:     ${wouldInsert}`);
  console.log(`\n  DRY-RUN — zero writes. Re-run with --execute to perform the ${wouldInsert} provisional inserts + read-back.`);
}
console.log(`\n  Parked (recorded reasons): 135 intermittent (noise; normal discovery re-encounters), 146 thin (content-usefulness question), 44 inconclusive-5xx (no content to validate).`);
process.exitCode = 0;

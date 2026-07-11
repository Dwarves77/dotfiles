// D3 section 3 — self-liveness LAYER 3 (real-artifact reconstruction). READ-MOSTLY:
// inserts/updates/deletes ONE SENTINEL-marked row used purely as a real-DB timestamp
// vehicle, then removes it. No real flag, no corpus row.
//
// Proves the escape from the recursion on real infrastructure: the liveness VERDICT is
// computed by an INDEPENDENT READER (a query of a stored timestamp) — the writer is
// never asked "are you alive." A stale/absent heartbeat renders LOUD UNKNOWN, not
// clean. This is observeFired-style applied to D3 itself: assert the EFFECT (a fresh
// run exists), observed externally, not D3's self-attestation.
//
// NOTE ON THE REAL STORE: the heartbeat's production home is a dedicated d3_runs table
// (DDL proposed in the section 3 report, NOT applied here — that is the unbuilt-trigger infra
// self-liveness exists to guard). This L3 uses a SENTINEL integrity_flags row
// (status='archived', never an active flag) only as a real timestamp round-trip.
import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { LIVENESS, assessLiveness, latestRunAtMs, consumerView } from "./liveness.mjs";

// --live gate (F-5a-4): this re-runnable acceptance test inserts/updates/deletes a SENTINEL integrity_flags
// row in the SHARED prod DB (owner creds) on bare invocation. Refuse unless --live is explicit.
if (!process.argv.includes("--live")) {
  console.error(
    "[acceptance-test] liveness-reconstruction writes a SENTINEL integrity_flags row to the SHARED prod DB.\n" +
    "  Refusing to run without --live. Deliberate run: node scripts/lib/liveness-reconstruction.mjs --live"
  );
  process.exit(0);
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const REF = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const POOL = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const CONN = POOL.replace(`postgres.${REF}@`, `postgres.${REF}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);

const MARK = "SENTINEL_D3_LIVENESS";
const WINDOW = 25 * 3600 * 1000; // 25h
let fails = 0;
const ok = (label, cond, detail = "") => { console.log(`  [${cond ? "OK" : "FAIL"}] ${label}${detail ? " — " + detail : ""}`); if (!cond) fails++; };

// The INDEPENDENT READER — a separate function from any writer. It queries the stored
// heartbeat timestamp and computes the verdict. D3-the-writer is not consulted.
async function readerComputesLiveness(client, nowMs) {
  const rows = (await client.query(
    "SELECT created_at AS ran_at FROM public.integrity_flags WHERE subject_ref = $1", [MARK]
  )).rows;
  return assessLiveness(latestRunAtMs(rows, "ran_at"), nowMs, WINDOW);
}

console.log("=== section 3 self-liveness L3 — external reader computes verdict from a stored timestamp ===\n");

const c = new pg.Client({ connectionString: CONN });
await c.connect();
try {
  await c.query("DELETE FROM public.integrity_flags WHERE subject_ref = $1", [MARK]);
  const NOW = Date.parse("2026-05-31T12:00:00Z"); // fixed reference instant for the test

  // (0) dead-from-birth: no heartbeat at all -> NEVER -> UNKNOWN loud
  const v0 = await readerComputesLiveness(c, NOW);
  ok("no heartbeat -> NEVER (dead-from-birth is loud, not clean)", v0.state === LIVENESS.NEVER);
  ok("consumerView([], NEVER) renders UNKNOWN loud", consumerView([], v0).loud === true && consumerView([], v0).render === "UNKNOWN");

  // (1) STALE: insert a heartbeat 50h old -> reader sees STALE
  await c.query(
    `INSERT INTO public.integrity_flags (category, subject_type, subject_ref, description, recommended_actions, status, created_by, created_at)
     VALUES ('data_integrity','system',$1,'d3 liveness selftest heartbeat','[]'::jsonb,'archived','d3-liveness-selftest', $2)`,
    [MARK, new Date(NOW - 50 * 3600 * 1000).toISOString()]
  );
  const vStale = await readerComputesLiveness(c, NOW);
  ok("heartbeat 50h old -> STALE (reader-computed from stored timestamp)", vStale.state === LIVENESS.STALE, `age=${Math.round(vStale.ageMs / 3600000)}h`);
  const cvStale = consumerView([], vStale);
  ok("STALE + 0 findings renders UNKNOWN loud (a silently-dead D3 cannot show green)", cvStale.loud === true && cvStale.render === "UNKNOWN");

  // (2) LIVE: refresh the heartbeat to now -> reader sees LIVE
  await c.query("UPDATE public.integrity_flags SET created_at = $2 WHERE subject_ref = $1", [MARK, new Date(NOW).toISOString()]);
  const vLive = await readerComputesLiveness(c, NOW);
  ok("heartbeat fresh -> LIVE", vLive.state === LIVENESS.LIVE, `age=${Math.round(vLive.ageMs / 1000)}s`);
  const cvLive = consumerView([], vLive);
  ok("LIVE + 0 findings renders CLEAN (only now is 'clean' trustworthy)", cvLive.loud === false && cvLive.render === "CLEAN");
} finally {
  await c.query("DELETE FROM public.integrity_flags WHERE subject_ref = $1", [MARK]);
  await c.end();
}

console.log("\n  NON-SELF-REFERENTIAL ARGUMENT (how self-liveness avoids attesting itself):");
console.log("    - the writer left only a timestamp (a fact); it never asserted 'I am alive'.");
console.log("    - readerComputesLiveness() is a SEPARATE function: it queries the stored timestamp");
console.log("      and derives STALE/LIVE/NEVER. A dead writer writes no new timestamp -> the reader");
console.log("      independently computes STALE/NEVER -> consumerView renders UNKNOWN loud.");
console.log("    - IRREDUCIBLE ASSUMPTION (named): some external reader must eventually run. It rides");
console.log("      on the integrity_flags surface humans already read + any gate consuming D3's verdict.");
console.log("      We do not claim D3 detects its own death in a vacuum — only that a dead D3 cannot");
console.log("      present as GREEN to any reader.");

console.log(`\n${fails === 0
  ? "section 3 self-liveness L3 PASS — external reader derived NEVER/STALE/LIVE from a stored timestamp; not-run rendered LOUD UNKNOWN; clean only under a fresh heartbeat."
  : fails + " section 3 L3 FAILURE(S)"}`);
process.exitCode = fails === 0 ? 0 : 1;

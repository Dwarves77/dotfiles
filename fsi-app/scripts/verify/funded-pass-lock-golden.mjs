/** GOLDEN — funded-pass run-lock (migration 205; Wave 2 concurrent-race hardening).
 *  Proves the protected behavior: a live holder blocks a second acquisition (the second-instance guard that the
 *  2026-07-15 race lacked), a stale holder is claimable via takeover, heartbeat detects loss of the lock, and a
 *  clean release frees it. Uses a DEDICATED test key PREFIX so it never touches the real 'funded-pass' lock.
 *  Usage: node scripts/verify/funded-pass-lock-golden.mjs   (exit 0 = PASS, 1 = FAIL)
 *
 *  RD-81 (2026-09-22, lane G4). CONFIRMED root cause of the "first acquisition succeeds :: takeover=false
 *  expected, takeover=true seen" failure on a docs-only branch: cleanup() selected a non-existent "id"
 *  column (this table's PK is `lock_key`; there is no `id` column) and dropped the `error` field from the
 *  destructure (the exact error-swallow anti-pattern CLAUDE.md's agent/run post-mortem names), so `ids`
 *  was always `[]` and guardedDelete never ran. Every prior invocation, not only an OS-killed one, left
 *  its fixture holder (pid 990001) live in `funded_pass_runlock` forever; the next run's first acquire saw
 *  that stale holder and correctly took it over (expected ok=true/takeover=false, got ok=true/takeover=true).
 *  Second, independent defect: the fixed test key ("funded-pass-golden-test") is one shared row, so two
 *  gates running the golden concurrently on the same PC drove the same row and raced each other.
 *
 *  Isolation path taken: PER-RUN LOCK KEY, not a rolled-back transaction. The pause-flag proof's rollback
 *  pattern requires a single persistent Postgres session so BEGIN...ROLLBACK spans every statement; this
 *  golden instead calls acquireRunLock/heartbeatRunLock/releaseRunLock from scripts/lib/funded-pass-lock.mjs,
 *  which the production runner (funded-pass.mjs) also calls, over supabase-js `sb.rpc()`, i.e. PostgREST,
 *  a stateless HTTP transport where EVERY `.rpc()` call is its own auto-committing transaction. There is no
 *  supported way to keep one BEGIN open across those separate HTTP requests through the client the golden
 *  means to prove; routing around it through a raw pg connection would stop testing the actual integration
 *  path. So: each run generates its own random lock_key under the shared prefix
 *  `funded-pass-golden-test-<runid>`, which structurally cannot collide with another run's key or with the
 *  real `funded-pass` production key, and needs no rollback at all.
 *
 *  Idempotent start: sweepStaleFixtures() deletes only fixture-prefix rows whose heartbeat is OLDER than
 *  STALE_SWEEP_AGE_MS (leftover from a killed prior run), never a fresh row, so it cannot delete a
 *  concurrently-running sibling's still-live row (that would be cross-run interference, not isolation).
 *  End-of-run cleanup deletes only THIS run's own key, for the same reason. Set
 *  FUNDED_PASS_GOLDEN_PLANT_STALE=1 to have the golden plant its own stale fixture row first (via
 *  guardedInsert, not hand SQL) and prove the start sweep clears it.
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { acquireRunLock, heartbeatRunLock, releaseRunLock } from "../lib/funded-pass-lock.mjs";
import { guardedUpdate, guardedDelete, guardedInsert } from "../lib/db.mjs";
import { loadLocalEnvFile } from "../lib/env-file.mjs";

// Guarded: absent .env.local must SELF-SKIP (exit 2, "cannot verify here"), never a stack-trace crash the
// goldens runner reads as a real FAIL. This is a LIVE-DB golden (funded_pass_runlock writes); it runs for
// real only in the secrets lane. (2026-08-09: was an unguarded loadEnvFile — ENOENT crash.)
loadLocalEnvFile();
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("funded-pass-lock-golden: no DB creds — cannot verify here (exit 2).");
  process.exit(2);
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const KEY_PREFIX = "funded-pass-golden-test";
const KEY = `${KEY_PREFIX}-${randomUUID().slice(0, 8)}`; // per-run key: never shared with a concurrent run
// A row younger than this is presumed to belong to a concurrently-running sibling (this golden's own
// scenario runs in low-single-digit seconds); a row older than this is presumed abandoned by a killed run.
const STALE_SWEEP_AGE_MS = 30_000;
const A = 990001, B = 990002;
const cite = { skill: "remediation-discipline", reason: "run-lock golden test fixture (prefix funded-pass-golden-test*; never the live 'funded-pass' key; never corpus data)" };
let pass = true;
const check = (name, cond, detail = "") => { const ok = !!cond; if (!ok) pass = false; console.log(`  ${ok ? "PASS" : "FAIL"} — ${name}${detail ? ` :: ${detail}` : ""}`); };

// Idempotent-start sweep: remove only fixture-prefix rows whose heartbeat is stale (age-gated so it never
// touches a concurrently-running sibling's fresh row (that would be cross-run interference). Guarded to
// the fixture prefix so the live 'funded-pass' production key is never touched. Fixes the "id" column bug
// (this table's PK is lock_key; the pre-RD-81 version selected a nonexistent "id" column, dropped the
// error, and never deleted anything, see header).
async function sweepStaleFixtures(label) {
  const cutoff = new Date(Date.now() - STALE_SWEEP_AGE_MS).toISOString();
  const { data, error } = await sb.from("funded_pass_runlock").select("lock_key, holder_pid, heartbeat_at")
    .like("lock_key", `${KEY_PREFIX}%`).lt("heartbeat_at", cutoff);
  if (error) throw new Error(`sweepStaleFixtures(${label}) read failed: ${error.message}`);
  const rows = data || [];
  let deleted = 0;
  if (rows.length) {
    const res = await guardedDelete("funded_pass_runlock", rows.map((r) => r.lock_key), { cite, matchColumn: "lock_key" });
    deleted = res.deleted;
  }
  console.log(`  [sweep:${label}] stale fixture rows (heartbeat older than ${STALE_SWEEP_AGE_MS / 1000}s) found=${rows.length} deleted=${deleted}${rows.length ? ` :: ${rows.map((r) => `${r.lock_key} pid=${r.holder_pid} hb=${r.heartbeat_at}`).join("; ")}` : ""}`);
  return { rows, deleted };
}

async function main() {
  console.log("\n=== GOLDEN: funded-pass run-lock (RD-81: per-run key, idempotent start) ===");
  console.log(`  run key: ${KEY}`);

  if (process.env.FUNDED_PASS_GOLDEN_PLANT_STALE === "1") {
    const plantedKey = `${KEY_PREFIX}-planted-${randomUUID().slice(0, 8)}`;
    await guardedInsert("funded_pass_runlock", {
      lock_key: plantedKey, holder_label: "plantedStale", holder_pid: 990099, holder_host: "attackhost",
      worklist_ref: "attack", acquired_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      heartbeat_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    }, { cite });
    console.log(`  [attack] planted stale fixture row ${plantedKey} (heartbeat 10m stale, via guardedInsert)`);
  }

  // Idempotent start: clears any killed prior run's leftover (or the just-planted attack row); never a
  // concurrently-running sibling's fresh row (age-gated, see sweepStaleFixtures).
  const swept = await sweepStaleFixtures("start");
  if (process.env.FUNDED_PASS_GOLDEN_PLANT_STALE === "1") {
    check("planted stale fixture was cleared by the idempotent-start sweep", swept.deleted >= 1, `deleted=${swept.deleted}`);
  }

  // 1) first acquisition succeeds (fresh insert)
  const a1 = await acquireRunLock(sb, { key: KEY, pid: A, label: "holderA", host: "goldenhost", worklistRef: "test" });
  check("first acquisition succeeds", a1.ok === true && a1.takeover === false, `ok=${a1.ok} takeover=${a1.takeover}`);

  // 2) SECOND-INSTANCE REJECTION: a second live acquisition is refused, incumbent named
  const a2 = await acquireRunLock(sb, { key: KEY, pid: B, label: "holderB", host: "goldenhost", worklistRef: "test" });
  check("second concurrent acquisition REJECTED", a2.ok === false, `ok=${a2.ok}`);
  check("rejection names the live incumbent (pid A)", a2.holderPid === A, `holderPid=${a2.holderPid}`);

  // 3) STALE TAKEOVER: age holder A's heartbeat past the threshold, then B may claim it (guarded fixture write)
  await guardedUpdate("funded_pass_runlock", (q) => q.eq("lock_key", KEY), { heartbeat_at: new Date(Date.now() - 10 * 60 * 1000).toISOString() }, { cite });
  const a3 = await acquireRunLock(sb, { key: KEY, pid: B, label: "holderB", host: "goldenhost", worklistRef: "test", staleSeconds: 300 });
  check("stale holder is taken over", a3.ok === true && a3.takeover === true, `ok=${a3.ok} takeover=${a3.takeover}`);

  // 4) HEARTBEAT ownership: B still holds, A has lost it
  const hbB = await heartbeatRunLock(sb, { key: KEY, pid: B });
  const hbA = await heartbeatRunLock(sb, { key: KEY, pid: A });
  check("current holder B heartbeat succeeds", hbB === true, `still_held=${hbB}`);
  check("displaced holder A heartbeat reports lost", hbA === false, `still_held=${hbA}`);

  // 5) non-owner cannot acquire while B is live+fresh (regression re-check after takeover)
  const a4 = await acquireRunLock(sb, { key: KEY, pid: A, label: "holderA", host: "goldenhost", worklistRef: "test" });
  check("post-takeover, displaced A is rejected", a4.ok === false && a4.holderPid === B, `ok=${a4.ok} holderPid=${a4.holderPid}`);

  // 6) clean release by owner frees the lock; a fresh acquire then succeeds
  await releaseRunLock(sb, { key: KEY, pid: B });
  const { count } = await sb.from("funded_pass_runlock").select("lock_key", { count: "exact", head: true }).eq("lock_key", KEY);
  check("owner release removes the lock row", count === 0, `rows=${count}`);
  const a5 = await acquireRunLock(sb, { key: KEY, pid: A, label: "holderA", host: "goldenhost", worklistRef: "test" });
  check("after release, a fresh acquire succeeds", a5.ok === true, `ok=${a5.ok}`);

  // End-of-run cleanup: only THIS run's own key, never a prefix-wide sweep here, which could delete a
  // concurrently-running sibling's still-live row.
  const { data: ownRows } = await sb.from("funded_pass_runlock").select("lock_key").eq("lock_key", KEY);
  if ((ownRows || []).length) await guardedDelete("funded_pass_runlock", [KEY], { cite, matchColumn: "lock_key" });
  console.log(`  [cleanup:end] own key ${KEY} cleared=${(ownRows || []).length}`);

  console.log(`\n=== GOLDEN ${pass ? "PASS" : "FAIL"} ===`);
  process.exit(pass ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });

/** GOLDEN — funded-pass run-lock (migration 205; Wave 2 concurrent-race hardening).
 *  Proves the protected behavior: a live holder blocks a second acquisition (the second-instance guard that the
 *  2026-07-15 race lacked), a stale holder is claimable via takeover, heartbeat detects loss of the lock, and a
 *  clean release frees it. Uses a DEDICATED test key so it never touches the real 'funded-pass' lock; cleans up.
 *  Usage: node scripts/verify/funded-pass-lock-golden.mjs   (exit 0 = PASS, 1 = FAIL)
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { acquireRunLock, heartbeatRunLock, releaseRunLock } from "../lib/funded-pass-lock.mjs";
import { guardedUpdate, guardedDelete } from "../lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const KEY = "funded-pass-golden-test";
const A = 990001, B = 990002;
const cite = { skill: "remediation-discipline", reason: "run-lock golden test fixture (dedicated test key funded-pass-golden-test; never corpus data)" };
let pass = true;
const check = (name, cond, detail = "") => { const ok = !!cond; if (!ok) pass = false; console.log(`  ${ok ? "PASS" : "FAIL"} — ${name}${detail ? ` :: ${detail}` : ""}`); };

// Fixture teardown routed through the guarded path (snapshot + cite), per rule 015 — even for a test table.
async function cleanup() {
  const { data } = await sb.from("funded_pass_runlock").select("id").eq("lock_key", KEY);
  const ids = (data || []).map((r) => r.id);
  if (ids.length) await guardedDelete("funded_pass_runlock", ids, { cite });
}

async function main() {
  console.log("\n=== GOLDEN: funded-pass run-lock ===");
  await cleanup(); // start clean

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

  await cleanup();
  console.log(`\n=== GOLDEN ${pass ? "PASS" : "FAIL"} ===`);
  process.exit(pass ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });

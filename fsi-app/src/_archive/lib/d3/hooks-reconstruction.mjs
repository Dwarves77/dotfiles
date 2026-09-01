// D3 ingestion hooks — LAYER 3 (real-artifact reconstruction). Uses the REAL
// @supabase/supabase-js service-role client (the same one the routes use), writes ONE
// SENTINEL-marked integrity_flags row and deletes it. No corpus row, no real flag left.
//
// Proves on real infrastructure: (a) a FINDING routes a real flag to integrity_flags;
// (b) the heartbeat to d3_runs (DEFINED-not-applied) gracefully skips-with-log, no
// throw; (c) a guard given a broken client fails OPEN (passthrough), never throws.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { d3GuardRejection } from "./hooks.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MARK = "https://SENTINEL-d3-hook.example.gov/recon";
const SUBJ = `reject:${MARK}`;
let fails = 0;
const ok = (label, cond, detail = "") => { console.log(`  [${cond ? "OK" : "FAIL"}] ${label}${detail ? " — " + detail : ""}`); if (!cond) fails++; };

console.log("=== D3 ingestion hooks L3 — real supabase service-role client ===\n");

const sb = createClient(URL, KEY, { auth: { persistSession: false } });
try {
  await sb.from("integrity_flags").delete().eq("subject_ref", SUBJ);

  // (a)+(b) FINDING on real client: quarantine outcome, real flag written, heartbeat
  // to the absent d3_runs gracefully skipped.
  const r = await d3GuardRejection(sb, { candidateUrl: MARK, method: "plain-fetch-reachability" });
  ok("rejection guard returns 'quarantine' on the real client (420-class prevented)", r.outcome === "quarantine");
  ok("guard reports audited:true (it ran)", r.audited === true);

  const { data: rows } = await sb.from("integrity_flags").select("description,created_by").eq("subject_ref", SUBJ);
  ok("a real flag landed in integrity_flags (FINDING routed to the durable queue)", (rows?.length || 0) === 1, `${rows?.length || 0} row(s)`);
  ok("flag attributed to d3-hook", rows?.[0]?.created_by === "d3-hook");

  // heartbeat to d3_runs must have skipped without throwing (table not applied). Any
  // error here = table absent/uncreated (PostgREST PGRST205 'could not find the table').
  const { error: hbErr } = await sb.from("d3_runs").select("id").limit(1);
  ok("d3_runs is absent (DEFINED-not-applied) yet the guard did not throw", !!hbErr, hbErr ? `${hbErr.code} ${hbErr.message}` : "table exists?");

  // (c) FAIL-OPEN on a broken client: a client whose every write rejects must not make
  // the guard throw. The inner swallows keep the SAFE outcome ('quarantine') standing;
  // the guard never wedges ingestion.
  const broken = { from: () => ({ insert: async () => { throw new Error("broken client"); }, select: async () => ({ error: { message: "x" } }), delete: () => ({ eq: async () => ({}) }) }) };
  const rb = await d3GuardRejection(broken, { candidateUrl: MARK, method: "plain-fetch-reachability" })
    .then((v) => v, () => ({ threw: true }));
  ok("guard with a broken client NEVER throws (fail-open; safe outcome stands)", rb.threw !== true && rb.outcome === "quarantine", JSON.stringify(rb));
} finally {
  await sb.from("integrity_flags").delete().eq("subject_ref", SUBJ);
}

console.log(`\n${fails === 0
  ? "D3 hooks L3 PASS — FINDING routes a real flag; heartbeat skips the absent d3_runs without throwing; broken client fails OPEN (never wedges ingestion)."
  : fails + " D3 hooks L3 FAILURE(S)"}`);
process.exitCode = fails === 0 ? 0 : 1;

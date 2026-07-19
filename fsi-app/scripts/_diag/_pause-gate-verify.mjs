// READ-ONLY Phase 0.1 proof + forcing-function candidate.
// Sweep-discipline: ENUMERATE every fetch-capable route under src/app/api (any file that references an
// outbound-fetch primitive) and ASSERT each calls a global-pause guard (pausedResponse / isGloballyPaused
// / pauseReason). A fetch-capable route with no guard FAILS the check (exit 1). Also reports the live
// system_state.global_processing_paused so the structural proof is paired with the live hold state.
// Placement (guard BEFORE the fetch in execution order) is verified by construction in the edits; this
// script proves PRESENCE across the enumerated set so no fetch path is left ungated now or in future.
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));

const API_DIR = resolve(ROOT, "src", "app", "api");
const FETCH_PRIMITIVES = /\b(browserlessRender|browserlessFetch|apiFetch\(|fetchPrimaryWithFallback|fetchPrimaryDeep|firstFetchClassify|web_search)\b/;
const GUARD = /\b(pausedResponse|isGloballyPaused|pauseReason)\s*\(/;

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = resolve(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e === "route.ts") out.push(p);
  }
  return out;
}

const routes = walk(API_DIR);
const fetchCapable = [];
for (const f of routes) {
  const src = readFileSync(f, "utf8");
  if (FETCH_PRIMITIVES.test(src)) fetchCapable.push({ f, src });
}

console.log(`========== PHASE 0.1 PAUSE-GATE SWEEP ==========`);
console.log(`route.ts files scanned: ${routes.length}`);
console.log(`fetch-capable routes (reference a fetch primitive): ${fetchCapable.length}\n`);

let fails = 0;
for (const { f, src } of fetchCapable) {
  const rel = relative(ROOT, f).replace(/\\/g, "/");
  const guarded = GUARD.test(src);
  // line of the first guard call (for the report)
  let guardLine = "-";
  if (guarded) {
    const lines = src.split("\n");
    const i = lines.findIndex((l) => GUARD.test(l));
    if (i >= 0) guardLine = String(i + 1);
  }
  console.log(`  ${guarded ? "PASS" : "FAIL"}  guard@${guardLine.padStart(4)}  ${rel}`);
  if (!guarded) fails++;
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: ss } = await sb.from("system_state").select("global_processing_paused").eq("id", true).maybeSingle();
console.log(`\nLIVE system_state.global_processing_paused: ${ss?.global_processing_paused}`);
const { count: armed } = await sb.from("sources").select("id", { count: "exact", head: true }).eq("auto_run_enabled", true);
console.log(`LIVE sources.auto_run_enabled=true (armed): ${armed}`);

console.log(`\n${fails === 0 ? "ALL FETCH-CAPABLE ROUTES GATE ON PAUSE." : `!!! ${fails} fetch-capable route(s) UNGATED.`}`);
console.log(`Note: agent/run gates via the generate-brief workflow preflight (isGloballyPaused), not at the route.`);
process.exit(fails === 0 ? 0 : 1);

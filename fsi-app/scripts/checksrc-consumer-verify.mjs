// #4 check-sources — verified at the CONSUMER's own stored outcome (sources.status), not
// inherited from the reachability SSOT. Self-bundles the route, runs assessAndUpdateSource
// against a sentinel source under a FORCED Browserless 429 — broken (legacy classifier) vs
// fixed — and reads back sources.status. Shows the DIFFERENCE on stored state.
import { createClient } from "@supabase/supabase-js";
import esbuild from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const BUNDLE = resolve(ROOT, "scripts/tmp/_checksrc-bundle.mjs");
const STUB = resolve(ROOT, "scripts/tmp/_next-server-stub.mjs");
mkdirSync(resolve(ROOT, "scripts/tmp"), { recursive: true });
writeFileSync(STUB, "export class NextRequest {}\nexport const NextResponse = { json: (b, i) => ({ body: b, init: i }) };\n");
await esbuild.build({
  entryPoints: [resolve(ROOT, "src/app/api/worker/check-sources/route.ts")],
  bundle: true, format: "esm", platform: "node", packages: "external",
  alias: { "next/server": STUB },
  tsconfig: resolve(ROOT, "tsconfig.json"), outfile: BUNDLE, logLevel: "silent",
});
const { assessAndUpdateSource } = await import(pathToFileURL(BUNDLE));
const { classifyReachability_LEGACY_BUGGY } = await import(pathToFileURL(resolve(ROOT, "src/lib/sources/reachability.mjs")));

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const render429 = async () => { const e = new Error("Browserless 429: rate limited (forced)"); e.name = "BrowserlessError"; e.status = 429; throw e; };
const URL_ = "https://checksrc-sentinel.example.invalid/reg";

// sentinel source row
const ins = await sb.from("sources").insert({ name: "checksrc sentinel", url: URL_, base_tier: 1, tier_at_creation: 1, status: "active", consecutive_accessible: 0, update_frequency: "weekly" }).select("id").single();
const SID = ins.data.id;
const readStatus = async () => (await sb.from("sources").select("status").eq("id", SID).single()).data.status;
const reset = async () => { await sb.from("sources").update({ status: "active", consecutive_accessible: 0 }).eq("id", SID); };
const srcObj = () => ({ id: SID, url: URL_, name: "checksrc sentinel", update_frequency: "weekly", status: "active", consecutive_accessible: 0, successful_checks: 0, total_checks: 0 });

console.log("=== #4 check-sources — stored-state DIFFERENCE under a forced 429 (read sources.status) ===\n");

await reset();
const rb = await assessAndUpdateSource(sb, srcObj(), { render: render429, classify: classifyReachability_LEGACY_BUGGY });
const brokenStatus = await readStatus();
console.log(`-- BROKEN (legacy classifier = pre-fix non-answer->DEAD) --`);
console.log(`   assessor returned outcome=${rb.outcome}; STORED sources.status = ${brokenStatus}`);

await reset();
const rf = await assessAndUpdateSource(sb, srcObj(), { render: render429 });
const fixedStatus = await readStatus();
console.log(`-- FIXED (SSOT classifier) --`);
console.log(`   assessor returned outcome=${rf.outcome}; STORED sources.status = ${fixedStatus}`);

console.log(`\n-- THE DIFFERENCE ON STORED STATE (forced 429) --`);
console.log(`   BROKEN: sources.status=${brokenStatus}  <- EVICTED (non-answer marked dead)`);
console.log(`   FIXED : sources.status=${fixedStatus}  <- NOT evicted (non-answer = inconclusive, status preserved)`);
const discriminates = fixedStatus === "active" && brokenStatus !== "active";
console.log(`\n-- MUTATION CHECK (assertion: stored status stays 'active') PASSES on fixed / FAILS on broken => ${discriminates}`);

// cleanup
await sb.from("monitoring_queue").delete().eq("source_id", SID);
await sb.from("source_trust_events").delete().eq("source_id", SID);
await sb.from("ingest_rejections").delete().eq("candidate_url", URL_).then(() => {}, () => {});
await sb.from("sources").delete().eq("id", SID);
console.log("\n(sentinel source + its events cleaned)");
process.exit(discriminates ? 0 : 1);

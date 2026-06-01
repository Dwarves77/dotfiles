// DURABLE stored-outcome verification for the D1-interpretation fix, to the four-part
// standard. Self-bundles verification.ts (esbuild) and runs the REAL verifyCandidate
// against the live DB under a FORCED Browserless 429 — the failure that STILL happens
// post-D1 — broken (legacy classifier) vs fixed, asserting the read-back
// source_verifications.verification_tier. Shows the DIFFERENCE on stored state, not
// "verified". Writes only sentinel rows, then deletes them.
//
//   right-failure-forced:   a Browserless 429 (not a success, not a bot-block)
//   stored-outcome-asserted: read back source_verifications from the DB
//   mutation-checked:        the assertion (stored tier === 'M') FAILS on the legacy mapping
//   absence-swept:           see scripts/lib/fetch-negative-probe.mjs (run separately)
import { createClient } from "@supabase/supabase-js";
import esbuild from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));

// self-bundle the real verification.ts (resolves @/ via tsconfig; node_modules external)
const BUNDLE = resolve(ROOT, "scripts/tmp/_verif-bundle.mjs");
await esbuild.build({
  entryPoints: [resolve(ROOT, "src/lib/sources/verification.ts")],
  bundle: true, format: "esm", platform: "node", packages: "external",
  tsconfig: resolve(ROOT, "tsconfig.json"), outfile: BUNDLE, logLevel: "silent",
});
const { verifyCandidate } = await import(pathToFileURL(BUNDLE));
const { classifyReachability, classifyReachability_LEGACY_BUGGY, reachabilityTier } =
  await import(pathToFileURL(resolve(ROOT, "src/lib/sources/reachability.mjs")));

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const render429 = async () => { const e = new Error("Browserless 429: rate limited (forced)"); e.name = "BrowserlessError"; e.status = 429; throw e; };
const SENT_BROKEN = "https://d1interp-sentinel-broken.example.invalid/reg";
const SENT_FIXED = "https://d1interp-sentinel-fixed.example.invalid/reg";
const readBack = async (url) => (await sb.from("source_verifications").select("verification_tier, rejection_reason, action_taken").eq("candidate_url", url).order("created_at", { ascending: false }).limit(1).maybeSingle()).data;
const cleanup = async (url) => { await sb.from("source_verifications").delete().eq("candidate_url", url); await sb.from("provisional_sources").delete().eq("url", url); };

console.log("\n=== D1-INTERPRETATION FIX — stored-state DIFFERENCE under a forced Browserless 429 ===\n");
console.log("-- pure classifier (fixed vs legacy-buggy -> tier) --");
for (const c of [
  { l: "429 rate-limited (throws)", r: { status: 429, errored: true } },
  { l: "503 server error (throws)", r: { status: 503, errored: true } },
  { l: "timeout/abort (throws)", r: { status: null, errored: true } },
  { l: "404 definitive not-found", r: { status: 404, errored: false } },
]) {
  const ft = reachabilityTier(classifyReachability(c.r)), bt = reachabilityTier(classifyReachability_LEGACY_BUGGY(c.r));
  console.log(`  ${c.l.padEnd(30)} FIXED->${ft ? ft.tier : "proceed"}   LEGACY->${bt ? bt.tier : "proceed"}`);
}

await cleanup(SENT_BROKEN); await cleanup(SENT_FIXED);
const rb = await verifyCandidate({ url: SENT_BROKEN, name: "D1 sentinel broken", jurisdiction_iso: [] }, { render: render429, __classifyReachability: classifyReachability_LEGACY_BUGGY, skipDuplicateCheck: true, supabase: sb });
const storedBroken = await readBack(SENT_BROKEN);
const rf = await verifyCandidate({ url: SENT_FIXED, name: "D1 sentinel fixed", jurisdiction_iso: [] }, { render: render429, skipDuplicateCheck: true, supabase: sb });
const storedFixed = await readBack(SENT_FIXED);

console.log("\n-- STORED source_verifications under the SAME forced 429 --");
console.log(`  BROKEN (pre-fix mapping): tier=${storedBroken?.verification_tier} reason=${storedBroken?.rejection_reason} action=${storedBroken?.action_taken}  <- source REJECTED (the bug)`);
console.log(`  FIXED  (interpretation):  tier=${storedFixed?.verification_tier} reason=${storedFixed?.rejection_reason} action=${storedFixed?.action_taken}  <- source QUEUED (non-answer = inconclusive)`);

const discriminates = storedFixed?.verification_tier === "M" && storedBroken?.verification_tier !== "M";
console.log(`\n-- MUTATION CHECK: assertion (stored tier==='M') PASSES on fixed, FAILS on broken => discriminates: ${discriminates}`);

await cleanup(SENT_BROKEN); await cleanup(SENT_FIXED);
console.log("(sentinel rows cleaned)");
process.exit(discriminates ? 0 : 1);

// RETROACTIVE — D1 METHOD SWAP, to the four-part standard (no safe-case exemption). Shows the
// stored admission diff: the SAME candidate through the OLD method (plain fetch — bot-blocked)
// vs the NEW method (browserless — renders). Self-bundles the real verifyCandidate; reads back
// source_verifications. Deterministic (injected method renders), no Haiku, no corpus pollution.
import { createClient } from "@supabase/supabase-js";
import esbuild from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
delete process.env.ANTHROPIC_API_KEY; // isolate the METHOD: no Haiku, so FIXED stops at content-read
const BUNDLE = resolve(ROOT, "scripts/tmp/_verif-bundle.mjs");
await esbuild.build({
  entryPoints: [resolve(ROOT, "src/lib/sources/verification.ts")],
  bundle: true, format: "esm", platform: "node", packages: "external",
  tsconfig: resolve(ROOT, "tsconfig.json"), outfile: BUNDLE, logLevel: "silent",
});
const { verifyCandidate } = await import(pathToFileURL(BUNDLE));
const { classifyReachability_LEGACY_BUGGY } = await import(pathToFileURL(resolve(ROOT, "src/lib/sources/reachability.mjs")));

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// The two FETCH METHODS, on a bot-protected source:
//   OLD (plain UA-less fetch): the source bot-blocks -> 403 (a response, never the content).
//   NEW (browserless render):  the headless browser renders the real page -> 200 + content.
const plainMethod = async () => ({ status: 403 });
const browserlessMethod = async () => ({ status: 200, text: "EUR-Lex Official Journal of the European Union. This regulation establishes binding measures for the reduction of greenhouse gas emissions and applies to all member states with effect from the date of entry into force.".repeat(3) });

const URL_OLD = "https://d1methodswap-old.example.invalid/eur-lex/reg";
const URL_NEW = "https://d1methodswap-new.example.invalid/eur-lex/reg";
const readBack = async (url) => (await sb.from("source_verifications").select("verification_tier, rejection_reason, action_taken, verification_log").eq("candidate_url", url).order("created_at", { ascending: false }).limit(1).maybeSingle()).data;
const cleanup = async (url) => { await sb.from("source_verifications").delete().eq("candidate_url", url); await sb.from("provisional_sources").delete().eq("url", url); };

console.log("=== D1 METHOD SWAP — stored admission diff on a bot-blocked source ===\n");
await cleanup(URL_OLD); await cleanup(URL_NEW);

// OLD METHOD: plain fetch (bot-blocked 403). Pre-D1 also REJECTED on reachability (legacy classifier).
const ro = await verifyCandidate({ url: URL_OLD, name: "EUR-Lex (old plain method)", jurisdiction_iso: [] },
  { render: plainMethod, __classifyReachability: classifyReachability_LEGACY_BUGGY, skipDuplicateCheck: true, supabase: sb });
const so = await readBack(URL_OLD);

// NEW METHOD: browserless render (200 + content). Current SSOT classifier.
const rn = await verifyCandidate({ url: URL_NEW, name: "EUR-Lex (new browserless method)", jurisdiction_iso: [] },
  { render: browserlessMethod, skipDuplicateCheck: true, supabase: sb });
const sn = await readBack(URL_NEW);

console.log("-- OLD METHOD (plain fetch, bot-blocked 403) --");
console.log(`   STORED: tier=${so?.verification_tier} reason=${so?.rejection_reason} action=${so?.action_taken} content.fetched=${so?.verification_log?.content?.fetched}`);
console.log("-- NEW METHOD (browserless render, 200 + content) --");
console.log(`   STORED: tier=${sn?.verification_tier} reason=${sn?.rejection_reason} action=${sn?.action_taken} content.fetched=${sn?.verification_log?.content?.fetched}`);

console.log("\n-- THE DIFFERENCE ON STORED STATE (same bot-blocked source, two fetch methods) --");
console.log(`   OLD plain:      tier=${so?.verification_tier} (${so?.rejection_reason}), content.fetched=${so?.verification_log?.content?.fetched}  <- REJECTED at reachability, never read`);
console.log(`   NEW browserless: tier=${sn?.verification_tier} (${sn?.rejection_reason}), content.fetched=${sn?.verification_log?.content?.fetched}  <- PASSED reachability, content READ + queued for review`);

// mutation-check: "the method READ the source (content.fetched) and got past reachability"
const oldRead = so?.verification_log?.content?.fetched === true;
const newRead = sn?.verification_log?.content?.fetched === true;
const oldReachReject = so?.rejection_reason === "reachability";
console.log(`\n-- MUTATION CHECK --`);
console.log(`   assertion 'content.fetched === true' : NEW=${newRead ? "PASS" : "FAIL"}  OLD=${oldRead ? "PASS(bad)" : "FAIL as required"}`);
console.log(`   OLD method reachability-rejected the source: ${oldReachReject}`);
const discriminates = newRead && !oldRead && oldReachReject;
console.log(`   => the method swap moves a bot-blocked source from reachability-reject(no content) to read+queued: ${discriminates}`);

await cleanup(URL_OLD); await cleanup(URL_NEW);
console.log("\n(sentinel rows cleaned)");
process.exit(discriminates ? 0 : 1);

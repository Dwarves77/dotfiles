// PORTAL-AS-ITEM leak fix — verified at the STORED entity type (was an item created or not?).
// Composes the REAL gate (entity-gate.mjs entityVerdict) with the REAL minter
// (drain-first-fetch seedStubIntelligenceItem), exactly as the drain loop composes them
// (gate -> conditional seed), under three candidates: portal (root URL), specific document
// (deep URL), and the line-191 case (Haiku unsure). Reads back intelligence_items.
import { createClient } from "@supabase/supabase-js";
import esbuild from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const BUNDLE = resolve(ROOT, "scripts/tmp/_drain-bundle.mjs");
const STUB = resolve(ROOT, "scripts/tmp/_next-server-stub.mjs");
mkdirSync(resolve(ROOT, "scripts/tmp"), { recursive: true });
writeFileSync(STUB, "export class NextRequest {}\nexport const NextResponse = { json:(b,i)=>({body:b,init:i}) };\n");
await esbuild.build({
  entryPoints: [resolve(ROOT, "src/app/api/worker/drain-first-fetch/route.ts")],
  bundle: true, format: "esm", platform: "node", packages: "external",
  alias: { "next/server": STUB }, tsconfig: resolve(ROOT, "tsconfig.json"), outfile: BUNDLE, logLevel: "silent",
});
const { seedStubIntelligenceItem } = await import(pathToFileURL(BUNDLE));
const { entityVerdict, ENTITY } = await import(pathToFileURL(resolve(ROOT, "src/lib/sources/entity-gate.mjs")));

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const base = { summary: "", severity: "monitoring", priority: "MODERATE", urgency_tier: "stable", topic_tags: [], jurisdictions: [], domain: 1 };
const cands = [
  { label: "PORTAL (root URL homepage)", url: "https://entitygate-portal.example.invalid/", enr: { ...base, entity_verdict: "portal", item_type: null, title: "Some Ministry Portal" } },
  { label: "SPECIFIC DOCUMENT (deep URL)", url: "https://entitygate-doc.example.invalid/regulations/final-rule-ghg-2027", enr: { ...base, entity_verdict: "specific_document", item_type: "regulation", title: "Final Rule: GHG Standards" } },
  { label: "LINE-191 case (deep URL, Haiku unsure)", url: "https://entitygate-uncertain.example.invalid/some/ambiguous/page", enr: { ...base, entity_verdict: "uncertain", item_type: null, title: "Ambiguous Page" } },
];

// sentinel source rows (intelligence_items.source_id FK)
const ids = {};
for (const c of cands) {
  await sb.from("intelligence_items").delete().eq("source_url", c.url);
  await sb.from("sources").delete().eq("url", c.url);
  const r = await sb.from("sources").insert({ name: c.label, url: c.url, base_tier: 1, tier_at_creation: 1, status: "active" }).select("id").single();
  if (r.error) console.log(`  [source insert error] ${c.url}: ${r.error.message}`);
  ids[c.url] = r.data?.id;
}
const itemExists = async (url) => !!(await sb.from("intelligence_items").select("id").eq("source_url", url).maybeSingle()).data;

console.log("=== PORTAL-AS-ITEM leak fix — stored entity-type diff (was an item minted?) ===\n");
console.log("-- FIXED (gate -> conditional seed, exactly as the drain loop) --");
const fixed = {};
for (const c of cands) {
  const verdict = entityVerdict({ url: c.url, haikuVerdict: c.enr.entity_verdict });
  if (verdict === ENTITY.DOCUMENT) {
    await seedStubIntelligenceItem(sb, { id: ids[c.url], url: c.url, name: c.enr.title }, c.enr);
  }
  fixed[c.url] = await itemExists(c.url);
  console.log(`   ${c.label.padEnd(40)} verdict=${verdict.padEnd(10)} -> item created: ${fixed[c.url]}`);
}

// reset items, then BROKEN baseline (pre-fix: always seed, unconditionally)
for (const c of cands) await sb.from("intelligence_items").delete().eq("source_url", c.url);
console.log("\n-- BROKEN (pre-fix: seed UNCONDITIONALLY, every source -> item) --");
const broken = {};
for (const c of cands) {
  // pre-fix: item_type silently defaulted to "regulation" (line-191 / the DB default), so EVERY
  // source — portal homepages included — minted an item. Model that faithfully here.
  const preFixEnr = { ...c.enr, item_type: "regulation" };
  const s = await seedStubIntelligenceItem(sb, { id: ids[c.url], url: c.url, name: c.enr.title }, preFixEnr);
  if (!s.ok) console.log(`  [seed error] ${c.url}: ${s.error}`);
  broken[c.url] = await itemExists(c.url);
  console.log(`   ${c.label.padEnd(40)} -> item created: ${broken[c.url]}`);
}

console.log("\n-- THE DIFFERENCE ON STORED ENTITY TYPE --");
const portal = cands[0].url, doc = cands[1].url, uncertain = cands[2].url;
console.log(`   PORTAL:        BROKEN minted an item=${broken[portal]}  ->  FIXED item=${fixed[portal]}  (now correctly NOT an item)`);
console.log(`   DOCUMENT:      BROKEN item=${broken[doc]}  ->  FIXED item=${fixed[doc]}  (still correctly an item)`);
console.log(`   LINE-191/UNSURE: BROKEN item=${broken[uncertain]}  ->  FIXED item=${fixed[uncertain]}  (honest-inconclusive: NOT defaulted to a regulation item)`);

const discriminates = broken[portal] === true && fixed[portal] === false && fixed[doc] === true && broken[uncertain] === true && fixed[uncertain] === false;
console.log(`\n-- MUTATION CHECK: portal/uncertain minted pre-fix (broken), NOT post-fix (fixed); document still mints => ${discriminates}`);

for (const c of cands) { await sb.from("intelligence_items").delete().eq("source_url", c.url); await sb.from("sources").delete().eq("url", c.url); }
console.log("\n(sentinel sources + items cleaned)");
process.exit(discriminates ? 0 : 1);

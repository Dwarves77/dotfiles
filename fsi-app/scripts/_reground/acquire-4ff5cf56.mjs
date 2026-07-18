#!/usr/bin/env node
// acquire-4ff5cf56.mjs — acquire the CORRECT primary for 4ff5cf56 (Wyoming CCR approval). Its declared primary
// was the WRONG document (a 400k regulations.gov docket of Wyoming statutes); the real instrument is the Federal
// Register final rule FR 2026-03820 ("Wyoming: Approval of State CCR Permit Program"). FREE (direct HTTP, no
// Browserless): the FR raw text was fetched to scripts/tmp/fr-2026-03820.txt. This registers federalregister.gov
// at its codified tier, snapshots the enacted text, stages it in the pool, and repoints the item — target-match
// confirmed FIRST. Run with --apply to write. Usage: node acquire-4ff5cf56.mjs [--apply]
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const APPLY = process.argv.includes("--apply");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { readClient, readAll, registerSource, guardedUpdate, guardedInsert } = await jiti.import("../lib/db.mjs");
const { writeSnapshot, getSnapshot } = await jiti.import("../../src/lib/sources/snapshot-store.mjs");
const { codifiedTierForHost } = await jiti.import("../../src/lib/sources/host-authority.ts");
const { verifyTargetMatch } = await jiti.import("../../src/lib/sources/target-match.mjs");
const sb = readClient();
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const FR_URL = "https://www.federalregister.gov/documents/2026/02/26/2026-03820/wyoming-approval-of-state-coal-combustion-residuals-permit-program";
const HOST = "federalregister.gov";

// Clean the FR text: unwrap the <pre>, strip <a> tags (keep inner text), strip remaining tags, decode entities.
let raw = readFileSync(resolve(ROOT, "scripts/tmp/fr-2026-03820.txt"), "utf8");
const preM = raw.match(/<pre>([\s\S]*?)<\/pre>/i);
if (preM) raw = preM[1];
const clean = raw
  .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1")
  .replace(/<[^>]+>/g, "")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/[ \t]+\n/g, "\n").trim();

const it = (await readAll("intelligence_items", "id,legacy_id,title,item_type,instrument_identifier,canonical_instrument_key,jurisdiction_iso,source_url,source_id", {})).find((x) => x.id.startsWith("4ff5cf56"));
const tier = codifiedTierForHost(HOST);
const tm = verifyTargetMatch({ title: it.title, item_type: it.item_type, identifier: it.instrument_identifier, canonical_instrument_key: it.canonical_instrument_key }, clean);

console.log(`\n===== ACQUIRE 4ff5cf56 correct primary (${APPLY ? "APPLY" : "DRY-RUN"}) =====`);
console.log(`item: ${it.title}`);
console.log(`FR primary: ${FR_URL}`);
console.log(`host tier (codified): ${tier}   clean text: ${clean.length} ch`);
console.log(`target-match on FR text: ${tm.verdict} via ${tm.via} (score ${tm.score})`);
console.log(`sample: ${clean.slice(clean.indexOf("SUMMARY"), clean.indexOf("SUMMARY") + 160).replace(/\n/g, " ")}`);

if (tier == null) { console.log("\nHALT: federalregister.gov did not resolve a codified tier — will not force-stamp."); process.exit(3); }
if (tm.verdict === "mismatch") { console.log("\nHALT: FR text is a MISMATCH for the item — wrong document."); process.exit(4); }
if (clean.length < 2000) { console.log("\nHALT: clean text too small."); process.exit(5); }
if (!APPLY) { console.log("\n(dry-run — re-run with --apply to register + snapshot + stage + repoint)"); process.exit(0); }

const cite = { skill: "source-credibility-model", reason: `acquire correct primary for 4ff5cf56 (Wyoming CCR approval): register ${HOST} at codified tier ${tier}, snapshot FR 2026-03820 enacted text, repoint off the wrong regulations.gov docket` };
const reg = await registerSource({ url: FR_URL, name: HOST, base_tier: tier }, { cite });
await writeSnapshot(svc, reg.source_id, { html: clean, status: 200 });
const snap = await getSnapshot(sb, { sourceId: reg.source_id });
console.log(`registered source ${reg.source_id.slice(0, 8)} tier ${tier}; snapshot round-trip found=${snap.found} (${(snap.content || "").length} ch)`);

// Stage the FR capture in the pool so groundBrief grounds against it.
await guardedInsert("agent_run_searches", {
  intelligence_item_id: it.id, agent_run_id: null, search_query: "acquire correct primary (FR 2026-03820)",
  result_url: FR_URL, result_title: "Wyoming: Approval of State CCR Permit Program", result_index: 0,
  result_content_excerpt: clean, searched_at: new Date().toISOString(),
}, { cite });

// Repoint the item to the correct primary.
await guardedUpdate("intelligence_items", (qb) => qb.eq("id", it.id), { source_id: reg.source_id, source_url: FR_URL },
  { cite: { skill: "remediation-discipline", reason: "repoint 4ff5cf56 off the wrong regulations.gov docket to the FR 2026-03820 instrument" } });
console.log(`\nACQUIRED + repointed. Next: drain-clear (now id-confirmable) + inject slots from the FR primary.`);
process.exit(0);

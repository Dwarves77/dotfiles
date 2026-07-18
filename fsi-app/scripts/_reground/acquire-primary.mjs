#!/usr/bin/env node
// acquire-primary.mjs — GENERIC free primary acquisition under a mutation lease (Session A judgment lane).
// Given an item key, a local fetched file (HTML/text), the canonical primary URL, and the host, this cleans
// the capture, VERIFIES target-match id-confirmation BEFORE writing, registers the host at its codified tier,
// snapshots, stages the capture in the pool, repoints the item, and dedups any shadowing stub pool rows on the
// same URL. All under the item's lease (acquired here, released in finally). No metered spend (direct HTTP fetch
// was free). Usage: node acquire-primary.mjs <itemKey> <fetchedFile> <primaryUrl> <host> [--apply]
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const [, , KEY, FILE, PRIMARY_URL, HOST] = process.argv;
const APPLY = process.argv.includes("--apply");
if (!KEY || !FILE || !PRIMARY_URL || !HOST) { console.error("usage: acquire-primary.mjs <itemKey> <fetchedFile> <primaryUrl> <host> [--apply]"); process.exit(1); }
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { readClient, readAll, registerSource, guardedUpdate, guardedInsert, guardedDelete } = await jiti.import("../lib/db.mjs");
const { writeSnapshot, getSnapshot } = await jiti.import("../../src/lib/sources/snapshot-store.mjs");
const { codifiedTierForHost } = await jiti.import("../../src/lib/sources/host-authority.ts");
const { verifyTargetMatch } = await jiti.import("../../src/lib/sources/target-match.mjs");
const { acquireLease, releaseLease } = await jiti.import("../lib/mutation-lease.mjs");
const sb = readClient();
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let raw = readFileSync(resolve(ROOT, FILE), "utf8");
const preM = raw.match(/<pre>([\s\S]*?)<\/pre>/i); if (preM) raw = preM[1];
const clean = raw
  .replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ")
  .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1").replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/[ \t ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();

const it = (await readAll("intelligence_items", "id,legacy_id,title,item_type,instrument_type,instrument_identifier,canonical_instrument_key,jurisdiction_iso,source_url,source_id", {})).find((x) => x.id.startsWith(KEY) || (x.legacy_id || "").startsWith(KEY));
const tier = codifiedTierForHost(HOST);
const tm = verifyTargetMatch({ title: it.title, item_type: it.item_type, instrument_type: it.instrument_type, identifier: it.instrument_identifier, canonical_instrument_key: it.canonical_instrument_key, jurisdiction: it.jurisdiction_iso }, clean);
const idConfirmed = tm.verdict === "match" && (tm.via === "instrument-id" || tm.via === "raw-id");

console.log(`\n===== ACQUIRE PRIMARY ${it.legacy_id || it.id.slice(0, 8)} (${APPLY ? "APPLY" : "DRY-RUN"}) =====`);
console.log(`item: ${it.title}`);
console.log(`primary: ${PRIMARY_URL}  host ${HOST} tier ${tier}  clean ${clean.length} ch`);
console.log(`target-match: ${tm.verdict} via ${tm.via} (score ${tm.score}) -> id-confirmed=${idConfirmed}`);

if (tier == null) { console.log("HALT: host did not resolve a codified tier."); process.exit(3); }
if (tm.verdict === "mismatch") { console.log(`HALT: capture MISMATCH (${(tm.conflicting || []).join(",")}).`); process.exit(4); }
if (!idConfirmed) { console.log("HALT: capture is NOT id-confirmed (subject-overlap is acquisition-grade, not clearance-grade — verify the correct primary)."); process.exit(5); }
if (clean.length < 2000) { console.log("HALT: clean text too small."); process.exit(6); }
if (!APPLY) { console.log("\n(dry-run — --apply to lease + register + snapshot + stage + repoint)"); process.exit(0); }

const lease = await acquireLease(sb, it.id, "session-A", "A");
if (!lease.acquired) { console.log(`HALT: lease held by ${lease.cur_holder}`); process.exit(7); }
try {
  const cite = { skill: "source-credibility-model", reason: `Session A acquire correct primary for ${it.legacy_id || it.id.slice(0, 8)}: register ${HOST} tier ${tier}, snapshot ${PRIMARY_URL} enacted text, repoint off the wrong TOC/portal` };
  const reg = await registerSource({ url: PRIMARY_URL, name: HOST, base_tier: tier }, { cite });
  await writeSnapshot(svc, reg.source_id, { html: clean, status: 200 });
  const snap = await getSnapshot(sb, { sourceId: reg.source_id });
  console.log(`registered ${reg.source_id.slice(0, 8)} tier ${tier}; snapshot found=${snap.found} (${(snap.content || "").length} ch)`);
  // dedup shadowing stub rows on the same URL
  const { data: pool } = await sb.from("agent_run_searches").select("id,result_url,result_content_excerpt").eq("intelligence_item_id", it.id);
  const norm = (u) => String(u || "").replace(/[#?].*$/, "").replace(/\/$/, "").toLowerCase();
  for (const r of (pool || []).filter((r) => norm(r.result_url) === norm(PRIMARY_URL) && (r.result_content_excerpt || "").length < 200)) await guardedDelete("agent_run_searches", [r.id], { cite });
  await guardedInsert("agent_run_searches", { intelligence_item_id: it.id, agent_run_id: null, search_query: "Session A acquire correct primary", result_url: PRIMARY_URL, result_title: it.title, result_index: 0, result_content_excerpt: clean, searched_at: new Date().toISOString() }, { cite });
  await guardedUpdate("intelligence_items", (qb) => qb.eq("id", it.id), { source_id: reg.source_id, source_url: PRIMARY_URL }, { cite: { skill: "remediation-discipline", reason: `repoint ${it.legacy_id || it.id.slice(0, 8)} to its correct id-confirmed primary` } });
  console.log(`\nACQUIRED + repointed under lease. Next: drain-clear (id-confirmed now) + inject slot FACTs from the primary.`);
} finally {
  await releaseLease(sb, it.id, "session-A");
  console.log("lease released.");
}
process.exit(0);

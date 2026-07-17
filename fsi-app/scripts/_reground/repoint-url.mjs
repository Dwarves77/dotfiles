#!/usr/bin/env node
// repoint-url.mjs — MECHANICAL repoint of an item's source_url to a MORE SPECIFIC URL already staged in its own
// pool, under the SAME registered source_id (no new source registration, no new tier decision). Use ONLY when
// the declared source_url itself has 0ch captured (roadblocked) but a specific, substantive pool row for the
// SAME institution already carries the content drain-clear needs to resolve the primary against. This is NOT a
// primary re-acquisition (acquire-primary.mjs owns that, new host/tier judgment) -- it is the mechanical case
// where the right host was already fetched at a better URL and the item just points at the wrong path.
// Usage: node repoint-url.mjs <itemKey> <newUrl> <holder> [--apply]
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const [, , KEY, NEW_URL, HOLDER] = process.argv;
const APPLY = process.argv.includes("--apply");
if (!KEY || !NEW_URL || !HOLDER) { console.error("usage: repoint-url.mjs <itemKey> <newUrl> <holder> [--apply]"); process.exit(1); }
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { readClient, readAll, guardedUpdate } = await jiti.import("../lib/db.mjs");
const { heartbeatLease } = await jiti.import("../lib/mutation-lease.mjs");
const sb = readClient();

const it = (await readAll("intelligence_items", "id,legacy_id,title,source_id,source_url", {}))
  .find((x) => x.id.startsWith(KEY) || (x.legacy_id || "") === KEY || (x.legacy_id || "").startsWith(KEY));
if (!it) { console.error(`item not found: ${KEY}`); process.exit(1); }
const short = it.legacy_id || it.id.slice(0, 8);

const held = await heartbeatLease(sb, it.id, HOLDER).catch(() => false);
if (!held) { console.error(`LEASE NOT HELD by "${HOLDER}" for ${short} — refusing (H5)`); process.exit(2); }

const { data: pool } = await sb.from("agent_run_searches").select("result_url,result_content_excerpt").eq("intelligence_item_id", it.id);
const norm = (u) => String(u || "").replace(/[#?].*$/, "").replace(/\/$/, "").toLowerCase();
const row = (pool ?? []).find((r) => norm(r.result_url) === norm(NEW_URL));
if (!row || (row.result_content_excerpt || "").length < 2000) {
  console.error(`REFUSE: ${NEW_URL} is not a substantive (>=2000ch) pool row on this item (found ${(row?.result_content_excerpt || "").length} ch) — this tool only repoints to ALREADY-STAGED content, use acquire-primary.mjs for new fetches.`);
  process.exit(3);
}
console.log(`\n===== REPOINT-URL ${short} (${APPLY ? "APPLY" : "DRY-RUN"}) =====`);
console.log(`current source_url: ${it.source_url}`);
console.log(`new source_url:      ${NEW_URL}  (${row.result_content_excerpt.length} ch already staged, same source_id ${it.source_id?.slice(0,8)})`);
if (!APPLY) { console.log("DRY-RUN: would repoint. Re-run with --apply."); process.exit(0); }

await guardedUpdate("intelligence_items", (qb) => qb.eq("id", it.id), { source_url: NEW_URL },
  { cite: { skill: "source-credibility-model", reason: `mechanical repoint for ${short}: declared source_url roadblocked (0ch), repointing to a substantive already-staged pool row on the same registered source_id (${it.source_id}) so drain-clear can resolve the primary` } });
console.log("REPOINTED.");
process.exit(0);

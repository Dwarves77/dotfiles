/** RE-FETCH WORK ORDER + completeness-exposure flags (dispatch items 4/5, 2026-07-06). Reads the completeness
 *  audit + recomputes the error-body-grounded set (isErrorBody over FACT-claim captures), groups re-collection
 *  targets by host STRATEGY (dead-URL→seek-more / bot-walled→transport-fallback / JS-required→Browserless /
 *  API-available→API-not-HTML), emits ONE idempotent 'completeness-exposure' integrity_flag per affected item
 *  (guarded), and writes the work-order doc. DRY-RUN default; --apply writes flags. ZERO fetches, ZERO mints. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import { readClient, readAll, guardedInsert } from "./lib/db.mjs";
import { isErrorBody } from "../src/lib/sources/entity-gate.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const APPLY = process.argv.includes("--apply");
const sb = readClient();
const audit = JSON.parse(readFileSync(resolve(ROOT, "scripts", "_plans", "completeness-audit.json"), "utf8"));

const items = await readAll("intelligence_items", "id,legacy_id,item_type,provenance_status,source_url,is_archived");
const byId = new Map(items.map((i) => [i.id, i]));
const keyOf = (id) => { const it = byId.get(id); return it ? (it.legacy_id || id.slice(0, 8)) : id.slice(0, 8); };

// error-body-grounded items (FACT claim whose capture isErrorBody)
const pool = await readAll("agent_run_searches", "id,result_url,result_content_excerpt");
const capById = new Map(pool.map((r) => [r.id, r]));
const facts = (await readAll("section_claim_provenance", "intelligence_item_id,claim_kind,search_result_id")).filter((c) => c.claim_kind === "FACT" && c.search_result_id);
const errItems = new Map(); // id -> {facts, hosts}
for (const f of facts) {
  const cap = capById.get(f.search_result_id);
  if (!cap || !isErrorBody(cap.result_content_excerpt || "")) continue;
  const rec = errItems.get(f.intelligence_item_id) || { facts: 0, hosts: new Set() };
  rec.facts++; try { rec.hosts.add(new URL(cap.result_url).host.replace(/^www\./, "")); } catch {}
  errItems.set(f.intelligence_item_id, rec);
}

// host strategy classifier
const API_HOSTS = /federalregister\.gov|ecfr\.gov/i;
const BOT_HOSTS = /iea\.org|iata\.org|adb\.org|itf-oecd\.org|sciencedirect\.com|ilo\.org|iopscience|smartfreightcentre|un\.org|c40\.org|spglobal|zawya|congress\.gov/i;
const JS_HOSTS = /customs\.go\.jp|gob\.mx|sdgs\.un\.org|portwatch\.imf\.org/i;
const DEAD_HOSTS = /eur-lex\.europa\.eu/i; // the 404s (need correct CELEX URL)
const strategy = (url) => API_HOSTS.test(url) ? "API-not-HTML (official API)" : JS_HOSTS.test(url) ? "Browserless render (JS-required)" : DEAD_HOSTS.test(url) ? "seek-more (dead/portal URL → correct CELEX)" : BOT_HOSTS.test(url) ? "transport-fallback or deprioritize (bot-walled)" : "transport-fallback / evaluate";

// affected-item set for flags: cat-1, cat-2, cat-3B enacted suspects, error-body-grounded
const affected = new Map(); // id -> {cats:Set, detail}
const add = (id, cat, detail) => { if (!id || byId.get(id)?.is_archived) return; const r = affected.get(id) || { cats: new Set(), details: [] }; r.cats.add(cat); if (detail) r.details.push(detail); affected.set(id, r); };
for (const x of audit.cat1) add(x.id, "cat1-truncated-at-cap", `near-cap capture ${x.rows?.[0]?.cap}`);
for (const x of audit.cat2) add(x.id, "cat2-oversize-section", `section ${x.sections?.[0]?.len}ch (re-ground post-fix)`);
for (const [id, r] of errItems) add(id, "error-body-grounded", `${r.facts} FACT(s) grounded to ${[...r.hosts].join(",")}`);

console.log(`\n=== COMPLETENESS WORK ORDER (${APPLY ? "APPLY" : "DRY-RUN"}) ===`);
console.log(`affected items: ${affected.size} | error-body-grounded: ${errItems.size} (${[...errItems].filter(([id]) => byId.get(id)?.provenance_status === "verified").length} verified) | cat1: ${audit.cat1.length} | cat2: ${audit.cat2.length}`);

// emit idempotent completeness-exposure flags
let emitted = 0, skipped = 0;
if (APPLY) {
  for (const [id, r] of affected) {
    const existing = await readAll("integrity_flags", "id", { match: (q) => q.eq("subject_type", "item").eq("subject_ref", id).eq("status", "open").eq("created_by", "completeness-exposure") });
    if (existing.length) { skipped++; continue; }
    await guardedInsert("integrity_flags", {
      category: "data_quality", subject_type: "item", subject_ref: id, status: "open", created_by: "completeness-exposure",
      description: `Completeness exposure [${[...r.cats].join(", ")}]: ${r.details.join("; ")}. Event-bound to re-collection/re-ground at hold-lift.`.slice(0, 480),
      recommended_actions: [{ action: r.cats.has("cat2-oversize-section") && r.cats.size === 1 ? "reground_cheap" : "refetch_then_reground", cats: [...r.cats] }],
    }, { cite: { skill: "remediation-discipline", reason: `completeness-exposure flag for ${keyOf(id)} [${[...r.cats].join(",")}]` } });
    emitted++;
  }
  console.log(`flags: ${emitted} emitted / ${skipped} already-present`);
} else {
  console.log(`(dry-run — pass --apply to emit ${affected.size} idempotent completeness-exposure flags)`);
}

// group error-body re-fetch targets by strategy
const byStrategy = {};
for (const [id, r] of errItems) { const it = byId.get(id); const s = strategy(it?.source_url || ""); (byStrategy[s] ||= []).push(`${keyOf(id)}(${r.facts}F,${it?.provenance_status})`); }
console.log(`\n=== RE-FETCH TARGETS BY STRATEGY ===`);
for (const [s, list] of Object.entries(byStrategy).sort((a, b) => b[1].length - a[1].length)) console.log(`  [${list.length}] ${s}:\n      ${list.join(", ")}`);
process.exit(0);

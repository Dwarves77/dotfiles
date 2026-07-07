// READ-ONLY decision-package dump (Earth-Exhaustion doctrine). Emits, for EVERY non-verified non-archived
// item, the full decision-relevant record: id/title/type/status/source_url + open integrity flags +
// FACT-claim count + residual error-body count + pool size (content-complete signal) + completeness cat
// membership + counsel-hold reason. Writes JSON to scratchpad + prints a compact summary. ZERO writes/fetch.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readAll } = await import("../lib/db.mjs");
const { isErrorBody } = await import("../../src/lib/sources/entity-gate.mjs");
const audit = JSON.parse(readFileSync(resolve(ROOT, "scripts", "_plans", "completeness-audit.json"), "utf8"));
const cat1 = new Set(audit.cat1.map((x) => x.id)), cat2 = new Set(audit.cat2.map((x) => x.id));

const items = (await readAll("intelligence_items", "id,legacy_id,title,summary,item_type,provenance_status,source_url,is_archived,created_at"))
  .filter((i) => i.provenance_status !== "verified" && !i.is_archived);
const ids = new Set(items.map((i) => i.id));

// open integrity flags for these items
const allFlags = await readAll("integrity_flags", "subject_ref,category,created_by,description,recommended_actions,status", { match: (q) => q.eq("subject_type", "item").eq("status", "open") });
const flagsByRef = new Map();
for (const f of allFlags) { if (!ids.has(f.subject_ref)) continue; (flagsByRef.get(f.subject_ref) || flagsByRef.set(f.subject_ref, []).get(f.subject_ref)).push(f); }

// FACT claims + residual error-body per item
const pool = await readAll("agent_run_searches", "id,intelligence_item_id,result_url,result_content_excerpt");
const capById = new Map(pool.map((r) => [r.id, r]));
const poolByItem = new Map();
for (const r of pool) { if (!ids.has(r.intelligence_item_id)) continue; const n = (r.result_content_excerpt || "").length; if (n > 200) poolByItem.set(r.intelligence_item_id, (poolByItem.get(r.intelligence_item_id) || 0) + 1); }
const facts = await readAll("section_claim_provenance", "intelligence_item_id,claim_kind,search_result_id");
const factCount = new Map(), errFact = new Map();
for (const f of facts) { if (!ids.has(f.intelligence_item_id) || f.claim_kind !== "FACT") continue; factCount.set(f.intelligence_item_id, (factCount.get(f.intelligence_item_id) || 0) + 1); const c = f.search_result_id && capById.get(f.search_result_id); if (c && isErrorBody(c.result_content_excerpt || "")) errFact.set(f.intelligence_item_id, (errFact.get(f.intelligence_item_id) || 0) + 1); }

const rows = items.map((it) => {
  const flags = (flagsByRef.get(it.id) || []).map((f) => ({ cat: f.category, by: f.created_by, desc: (f.description || "").slice(0, 160), act: f.recommended_actions?.[0]?.action }));
  const counsel = flags.find((f) => f.by === "phase2_priority_review" || /counsel_NO_SOURCE_(QUALIFIED|FOUND)|NO_REACHABLE/i.test(f.desc));
  return {
    short: it.id.slice(0, 8), id: it.id, key: it.legacy_id || it.id.slice(0, 8),
    title: (it.title || "").slice(0, 100), summary: (it.summary || "").slice(0, 200),
    type: it.item_type, status: it.provenance_status, url: (it.source_url || "").slice(0, 90),
    cat1: cat1.has(it.id), cat2: cat2.has(it.id),
    facts: factCount.get(it.id) || 0, errFacts: errFact.get(it.id) || 0, pool: poolByItem.get(it.id) || 0,
    counselReason: counsel ? counsel.desc : null, flags,
  };
});
rows.sort((a, b) => (a.type || "").localeCompare(b.type || "") || a.key.localeCompare(b.key));
const OUT = "C:/Users/jason/AppData/Local/Temp/claude/C--Users-jason/76321782-4f0b-4be9-968b-e275f6a1a2df/scratchpad/decision-package.json";
writeFileSync(OUT, JSON.stringify(rows, null, 2));
console.log(`\n=== DECISION PACKAGE DUMP — ${rows.length} non-verified non-archived items ===`);
console.log(`written: ${OUT}`);
const byType = {}; for (const r of rows) byType[r.type] = (byType[r.type] || 0) + 1;
console.log(`by type: ${Object.entries(byType).map(([t, n]) => `${t}=${n}`).join(", ")}`);
console.log(`counsel-held: ${rows.filter((r) => r.counselReason).length} | cat1: ${rows.filter((r) => r.cat1).length} | cat2: ${rows.filter((r) => r.cat2).length} | residual err-body: ${rows.filter((r) => r.errFacts).length}`);
console.log(`content-complete (pool>=1, no err-facts): ${rows.filter((r) => r.pool >= 1 && !r.errFacts).length} | zero-pool: ${rows.filter((r) => r.pool === 0).length}`);
console.log(`\n--- one line each ---`);
for (const r of rows) console.log(`${r.key.padEnd(14)} ${String(r.type).padEnd(14)} ${r.status.padEnd(11)} pool=${String(r.pool).padStart(2)} F=${String(r.facts).padStart(2)} c1=${r.cat1 ? "Y" : "-"} c2=${r.cat2 ? "Y" : "-"} ${r.counselReason ? "COUNSEL " : ""}| ${r.title}`);
process.exit(0);

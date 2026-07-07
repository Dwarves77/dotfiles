// 50ccd5cc salvageability test (operator-sanctioned). (1) what did its generation STORE as fetch
// attempts; (2) re-fetch its 403/Cloudflare URLs via the CURRENT escalating Browserless path
// (plain->stealth->unblock) to see if the content is actually reachable now. Read-only on the DB;
// the Browserless calls SPEND a handful of units (the GLEC/ISO URLs only), per operator request.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readClient, readAll } = await import("../lib/db.mjs");
const { browserlessFetch } = await import("../../src/lib/sources/canonical-fetch.mjs");
const { detectRoadblock } = await import("../../src/lib/sources/primary-fallback.mjs");
const sb = readClient();

const items = await readAll("intelligence_items", "id,source_url");
const it = items.find((i) => i.id.startsWith("50ccd5cc"));
console.log(`item source_url: ${it?.source_url}`);

// What its generation stored as fetch attempts (the pool).
const { data: searches } = await sb
  .from("agent_run_searches")
  .select("result_url,result_title,result_content_excerpt,search_query,created_at")
  .eq("intelligence_item_id", it.id);
console.log(`\nstored agent_run_searches for 50ccd5cc: ${searches?.length || 0}`);
const urls = new Set();
for (const s of searches || []) {
  const len = (s.result_content_excerpt || "").length;
  console.log(`  [${len}ch] ${s.result_url}`);
  if (s.result_url) urls.add(s.result_url);
}
if (it?.source_url) urls.add(it.source_url);

// Re-fetch the key URLs via the current escalating Browserless path.
console.log(`\n──── RE-FETCH via current browserlessFetch (plain->stealth->unblock) ────`);
const KEY = [...urls].filter((u) => /smartfreightcentre|iso\.org|glec/i.test(u)).slice(0, 4);
if (!KEY.length) for (const u of [...urls].slice(0, 3)) KEY.push(u);
for (const u of KEY) {
  process.stdout.write(`\n• ${u}\n  `);
  try {
    const r = await browserlessFetch(u, { maxTextLength: 120000 });
    const d = detectRoadblock(r.text, { httpStatus: r.status });
    console.log(`status=${r.status} tier=${r.tier} textLen=${r.textLength} roadblocked=${d.roadblocked}(${d.reason}) langRatio=${d.langRatio?.toFixed?.(2) ?? "?"}`);
    console.log(`  head: ${(r.text || "").slice(0, 180).replace(/\s+/g, " ")}`);
  } catch (e) {
    console.log(`THREW: ${e.name} status=${e.status ?? "?"} — ${String(e.message).slice(0, 160)}`);
  }
}
console.log(`\nVERDICT: if any KEY url returns real content (roadblocked=false, >200ch in-language) -> 50ccd5cc is a KEEP-and-reground (older-fetcher bot-block, salvageable), NOT a dead source.`);

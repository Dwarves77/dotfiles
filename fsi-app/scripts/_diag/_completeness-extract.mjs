// READ-ONLY: extract the per-category completeness lists → _plans/completeness-audit.json (the work order
// input). cat-1 = near-cap pool source (truncated-at-cap); cat-2 = section > 12000 (grounder tail-blind);
// cat-3 = short pool captures (200–2000 ch, stub-vs-legit TBD). Each item tagged verified + flip-this-session.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readClient, readAll } = await import("../lib/db.mjs");
const sb = readClient();
const GSM = 12000, TODAY = "2026-07-06";
const CAPS = [12000, 16000, 32000, 60000, 100000, 200000];
const nearCap = (len) => CAPS.find((c) => len >= c - 50 && len <= c + 5);

const items = await readAll("intelligence_items", "id,legacy_id,title,item_type,priority,provenance_status,provenance_verified_at,source_url,is_archived", { match: (q) => q.eq("is_archived", false) });
const byId = new Map(items.map((i) => [i.id, i]));
const tag = (id) => { const it = byId.get(id); return it ? { key: it.legacy_id || id.slice(0, 8), type: it.item_type, pri: it.priority, status: it.provenance_status, verified: it.provenance_status === "verified", flippedThisSession: it.provenance_status === "verified" && String(it.provenance_verified_at || "").startsWith(TODAY), host: (() => { try { return new URL(it.source_url).host.replace(/^www\./, ""); } catch { return ""; } })() } : null; };

const pool = await readAll("agent_run_searches", "intelligence_item_id,result_index,result_url,result_content_excerpt");
const real = pool.filter((r) => (r.result_index ?? 0) < 90 && (r.result_content_excerpt || "").length > 200);

// cat-1
const cat1Map = new Map();
for (const r of real) { const L = r.result_content_excerpt.length; const c = nearCap(L); if (c) { const t = cat1Map.get(r.intelligence_item_id) || { rows: [] }; t.rows.push({ url: r.result_url, len: L, cap: c }); cat1Map.set(r.intelligence_item_id, t); } }
const cat1 = [...cat1Map].map(([id, v]) => ({ id, ...tag(id), rows: v.rows })).filter((x) => x.key);

// cat-2
const secs = await readAll("intelligence_item_sections", "item_id,section_key,content_md");
const cat2Map = new Map();
for (const s of secs) { const L = (s.content_md || "").length; if (L > GSM) { const t = cat2Map.get(s.item_id) || { sections: [] }; t.sections.push({ section_key: s.section_key, len: L }); cat2Map.set(s.item_id, t); } }
const cat2 = [...cat2Map].map(([id, v]) => ({ id, ...tag(id), sections: v.sections.sort((a, b) => b.len - a.len) })).filter((x) => x.key);

// cat-3 (short captures 200–2000) — one row per capture for per-item stub adjudication
const cat3 = real.filter((r) => r.result_content_excerpt.length <= 2000).map((r) => {
  const it = byId.get(r.intelligence_item_id); if (!it) return null;
  let host = ""; try { host = new URL(r.result_url).host.replace(/^www\./, ""); } catch { }
  return { id: r.intelligence_item_id, key: it.legacy_id || r.intelligence_item_id.slice(0, 8), item_type: it.item_type, status: it.provenance_status, verified: it.provenance_status === "verified", url: r.result_url, host, len: r.result_content_excerpt.length, preview: r.result_content_excerpt.slice(0, 320).replace(/\s+/g, " ") };
}).filter(Boolean);

const out = { generatedAt: TODAY, counts: { cat1: cat1.length, cat2: cat2.length, cat3: cat3.length }, cat1, cat2, cat3 };
const dir = resolve(ROOT, "scripts", "_plans"); mkdirSync(dir, { recursive: true });
const file = resolve(dir, "completeness-audit.json");
writeFileSync(file, JSON.stringify(out, null, 2));
console.log(`\n=== COMPLETENESS EXTRACT === cat1=${cat1.length} items | cat2=${cat2.length} items | cat3=${cat3.length} short-captures`);
console.log(`cat1 (near-cap): ${cat1.map((x) => `${x.key}[${x.status}${x.flippedThisSession ? ",FLIP" : ""}]`).join(", ")}`);
console.log(`cat2 (>12k section): ${cat2.map((x) => `${x.key}[${x.status}${x.flippedThisSession ? ",FLIP" : ""},${x.sections[0].len}]`).join(", ")}`);
const c3items = new Set(cat3.map((x) => x.id));
console.log(`cat3 short-captures: ${cat3.length} rows across ${c3items.size} items (${cat3.filter((x) => x.verified).length} rows on verified items)`);
console.log(`\nwrote ${file}`);
process.exit(0);
